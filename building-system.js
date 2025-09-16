/**
 * Building System for The Commons
 * Handles all building placement, validation, economics, and management
 */

class BuildingSystem {
    constructor(game) {
        this.game = game;
        
        // Reference to the global building manager
        this.buildingManager = window.buildingManager || null;
        
        // Building state tracking
        this.playerBuildings = new Set();
        this.buildingsByType = new Map();
        
        // Economic cache for building performance
        this.economicCache = {
            buildingStats: new Map(),
            lastUpdate: 0,
            dirty: new Set()
        };
        
        // Prerequisites cache
        this.prereqCache = {
            availableBuildings: new Set(),
            lastUpdate: 0,
            dirty: true
        };
        
        // Selected building for placement
        this.selectedBuildingId = null;
        this.selectedBuildingCategory = 'all';
    }
    
    /**
     * Initialize the building system
     */
    initialize() {
        if (!this.buildingManager) {
            this.buildingManager = window.buildingManager;
        }
        this.updatePrereqCache();
        this.populateBuildingCategories();
    }
    
    /**
     * Build a building with funding info (called from game.js)
     */
    buildBuilding(row, col, buildingId, fundingInfo) {
        return this.placeBuilding(row, col, buildingId, 'player', fundingInfo);
    }
    
    /**
     * Place a building on a parcel
     */
    placeBuilding(row, col, buildingId, owner = 'player', fundingInfo = null) {
        // Validate placement
        if (!this.canPlaceBuilding(row, col, buildingId)) {
            return false;
        }
        
        const parcel = this.game.grid[row][col];
        const building = this.buildingManager.getBuildingById(buildingId);
        
        if (!building) {
            console.error('Building not found:', buildingId);
            return false;
        }
        
        // Check affordability
        const cost = fundingInfo ? fundingInfo.playerCost : this.calculateBuildingCostWithFunding(building);
        if (owner === 'player' && this.game.playerCash < cost) {
            this.game.showNotification('Insufficient funds!', 'error');
            return false;
        }
        
        // Place the building
        parcel.building = buildingId;
        parcel.owner = owner;
        parcel.buildingAge = 0;
        parcel.decay = 0;
        parcel.population = 0;
        
        console.log(`Building placed: ${building.name} at (${row}, ${col})`);
        console.log('Construction days:', building.construction?.days || 0);
        
        // Initialize construction if building has construction time
        if (building.construction && building.construction.days > 0) {
            parcel._isUnderConstruction = true;
            parcel._constructionStartTime = Date.now();
            parcel._constructionDays = building.construction.days;
            parcel._constructionProgress = 0;
            
            // Set legacy fields for compatibility with game.js drawing system
            parcel.constructionStartDay = this.game.currentDay;
            parcel.constructionDays = building.construction.days;
        } else {
            // Instant construction
            this.completeConstruction(row, col);
        }
        
        // Deduct cost and use action
        if (owner === 'player') {
            this.game.playerCash -= cost;
            this.game.useAction('build');
            this.playerBuildings.add(`${row},${col}`);
            
            // Track by type
            const typeCount = this.buildingsByType.get(buildingId) || 0;
            this.buildingsByType.set(buildingId, typeCount + 1);
        }
        
        // Update various systems
        this.markBuildingEconomicsDirty(row, col);
        this.game.markVitalityDirty();
        this.markPrereqDirty();
        this.game.scheduleRender();
        
        return true;
    }
    
    /**
     * Check if a building can be placed at a location
     */
    canPlaceBuilding(row, col, buildingId) {
        const parcel = this.game.grid[row][col];
        
        // Check if parcel exists and is empty
        if (!parcel || parcel.building) {
            return false;
        }
        
        // Check if building exists
        const building = this.buildingManager.getBuildingById(buildingId);
        if (!building) {
            return false;
        }
        
        // Check prerequisites
        if (!this.checkBuildingPrerequisites(building)) {
            return false;
        }
        
        // Check land value requirements
        if (building.requirements?.minLandValue) {
            const landValue = parcel.landValue?.current || 0;
            if (landValue < building.requirements.minLandValue) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Check if building prerequisites are met
     */
    checkBuildingPrerequisites(building) {
        // Check population requirement
        if (building.requirements?.populationReq > 0) {
            const totalPop = this.game.calculatePopulation();
            if (totalPop < building.requirements.populationReq) {
                return false;
            }
        }
        
        // Check prerequisite buildings
        if (building.requirements?.prereqBuildings) {
            const prereqs = building.requirements.prereqBuildings.split(',');
            for (const prereq of prereqs) {
                const prereqId = prereq.trim();
                if (prereqId && !this.hasBuilding(prereqId)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Check if player has a specific building type
     */
    hasBuilding(buildingId) {
        return this.buildingsByType.has(buildingId) && 
               this.buildingsByType.get(buildingId) > 0;
    }
    
    /**
     * Complete construction of a building
     */
    completeConstruction(row, col) {
        const parcel = this.game.grid[row][col];
        const building = this.buildingManager.getBuildingById(parcel.building);
        
        if (!building) return;
        
        // Remove construction flags
        parcel._isUnderConstruction = false;
        delete parcel._constructionStartTime;
        delete parcel._constructionDays;
        delete parcel._constructionProgress;
        
        // Clear legacy fields too
        parcel.constructionStartDay = null;
        parcel.constructionDays = 0;
        
        // Initialize building properties
        if (building.population?.bedroomsAdded > 0) {
            parcel.maxPopulation = building.population.bedroomsAdded * 2;
            parcel.population = Math.floor(parcel.maxPopulation * 0.5); // Start at 50% occupancy
        }
        
        // Mark for economic update
        this.markBuildingEconomicsDirty(row, col);
    }
    
    /**
     * Demolish a building
     */
    demolishBuilding(row, col) {
        const parcel = this.game.grid[row][col];
        
        if (!parcel || !parcel.building) {
            return false;
        }
        
        // Remove from tracking
        if (parcel.owner === 'player') {
            this.playerBuildings.delete(`${row},${col}`);
            
            const buildingId = parcel.building;
            const count = this.buildingsByType.get(buildingId) || 0;
            if (count > 0) {
                this.buildingsByType.set(buildingId, count - 1);
            }
        }
        
        // Clear parcel
        parcel.building = null;
        parcel.owner = null;
        parcel.buildingAge = 0;
        parcel.decay = 0;
        parcel.population = 0;
        parcel.maxPopulation = 0;
        
        // Clear construction if in progress
        parcel._isUnderConstruction = false;
        delete parcel._constructionStartTime;
        delete parcel._constructionDays;
        delete parcel._constructionProgress;
        
        // Update systems
        this.markBuildingEconomicsDirty(row, col);
        this.game.markVitalityDirty();
        this.markPrereqDirty();
        this.game.scheduleRender();
        
        return true;
    }
    
    /**
     * Calculate building economics (revenue, maintenance, etc.)
     */
    calculateBuildingEconomics(parcel, row, col) {
        // Land Value Tax
        const dailyLVTRate = 0.50 / 365; // 50% per year
        const landTax = (parcel.landValue?.paidPrice || 0) * dailyLVTRate;
        
        let revenue = 0;
        let maintenance = 0;
        let buildingName = 'Vacant';
        let netIncome = -landTax;
        
        if (parcel.building) {
            const building = this.buildingManager.getBuildingById(parcel.building);
            
            if (building && building.economics) {
                buildingName = building.name;
                
                // Base revenue
                revenue = building.economics.maxRevenue || 0;
                
                // Apply efficiency multiplier
                const efficiency = this.getBuildingEfficiency(row, col);
                revenue *= (efficiency / 100);
                
                // Apply supply/demand multipliers
                revenue *= this.getSupplyDemandMultiplier(building, row, col);
                
                // Base maintenance with exponential decay
                const baseMaintenance = building.economics.maintenanceCost || 0;
                const decayRate = building.economics.decayRatePercent ? 
                    building.economics.decayRatePercent / 100 : 0.001;
                const buildingAgeInDays = parcel.buildingAge || 0;
                const maintenanceMultiplier = Math.pow(1 + decayRate, buildingAgeInDays);
                maintenance = baseMaintenance * maintenanceMultiplier;
                
                netIncome = revenue - maintenance - landTax;
            }
        }
        
        return {
            buildingName,
            revenue: Math.round(revenue * 100) / 100,
            maintenance: Math.round(maintenance * 100) / 100,
            lvt: Math.round(landTax * 100) / 100,
            netIncome: Math.round(netIncome * 100) / 100,
            decay: parcel.decay || 0,
            age: parcel.buildingAge || 0
        };
    }
    
    /**
     * Get building efficiency based on needs satisfaction
     */
    getBuildingEfficiency(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return 100;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        if (!building) return 100;
        
        let efficiency = 100;
        let unsatisfiedNeeds = 0;
        let totalNeeds = 0;
        
        // Check each need type
        const needs = this.getBuildingNeeds(building);
        
        for (const need of needs) {
            totalNeeds++;
            const satisfaction = this.getNeedSatisfaction(need, row, col);
            if (satisfaction < 100) {
                unsatisfiedNeeds++;
                efficiency *= (satisfaction / 100);
            }
        }
        
        // Apply minimum efficiency floor
        efficiency = Math.max(25, Math.min(100, efficiency));
        
        return Math.round(efficiency);
    }
    
    /**
     * Get building needs based on type
     */
    getBuildingNeeds(building) {
        const needs = [];
        
        // All buildings need road access
        needs.push({ type: 'roads', required: true });
        
        // Energy needs
        if (building.resources?.energyDemand > 0) {
            needs.push({ type: 'energy', amount: building.resources.energyDemand });
        }
        
        // Worker needs
        if (building.population?.jobsCreated > 0) {
            needs.push({ type: 'workers', amount: building.population.jobsCreated });
        }
        
        // Housing needs workers/jobs
        if (building.population?.bedroomsAdded > 0) {
            needs.push({ type: 'jobs', amount: building.population.bedroomsAdded });
            needs.push({ type: 'food', amount: building.population.bedroomsAdded });
        }
        
        return needs;
    }
    
    /**
     * Get need satisfaction level
     */
    getNeedSatisfaction(need, row, col) {
        switch(need.type) {
            case 'roads':
                return this.game.transportationSystem.hasRoadAccess(row, col) ? 100 : 0;
                
            case 'energy':
                const energyBalance = this.game.economicEngine.getLocalSupplyDemand('energy', row, col);
                return Math.min(100, (energyBalance.supply / energyBalance.demand) * 100);
                
            case 'workers':
                const workerBalance = this.game.economicEngine.getLocalSupplyDemand('workers', row, col);
                return Math.min(100, (workerBalance.supply / Math.max(1, workerBalance.demand)) * 100);
                
            case 'jobs':
                const jobBalance = this.game.economicEngine.getLocalSupplyDemand('jobs', row, col);
                return Math.min(100, (jobBalance.supply / Math.max(1, jobBalance.demand)) * 100);
                
            case 'food':
                const foodBalance = this.game.economicEngine.getLocalSupplyDemand('food', row, col);
                return Math.min(100, (foodBalance.supply / Math.max(1, foodBalance.demand)) * 100);
                
            default:
                return 100;
        }
    }
    
    /**
     * Get supply/demand multiplier for building revenue
     */
    getSupplyDemandMultiplier(building, row, col) {
        let multiplier = 1.0;
        
        // Apply market multipliers based on building output
        if (building.resources?.energySupply > 0) {
            multiplier *= this.game.gameState?.state.market.multipliers.energy || 1.0;
        }
        if (building.resources?.foodProduction > 0) {
            multiplier *= this.game.gameState?.state.market.multipliers.food || 1.0;
        }
        if (building.population?.bedroomsAdded > 0) {
            multiplier *= this.game.gameState?.state.market.multipliers.housing || 1.0;
        }
        if (building.population?.jobsCreated > 0) {
            multiplier *= this.game.gameState?.state.market.multipliers.jobs || 1.0;
        }
        
        return multiplier;
    }
    
    /**
     * Calculate building cost with funding discounts
     */
    calculateBuildingCostWithFunding(building, fullCost = null) {
        if (!building) return 0;
        
        const baseCost = fullCost || building.cost || 0;
        
        // Apply governance funding if available
        if (this.game.governance?.allocations) {
            const category = building.category?.toLowerCase();
            const funding = this.game.governance.allocations[category] || 0;
            const discount = Math.min(0.5, funding / 1000); // Max 50% discount
            return Math.round(baseCost * (1 - discount));
        }
        
        return baseCost;
    }
    
    /**
     * Update building prerequisites cache
     */
    updatePrereqCache() {
        this.prereqCache.availableBuildings.clear();
        
        if (!this.buildingManager) return;
        
        const allBuildings = this.buildingManager.getAllBuildings();
        const population = this.game.calculatePopulation();
        
        for (const building of allBuildings) {
            if (this.checkBuildingPrerequisites(building)) {
                this.prereqCache.availableBuildings.add(building.id);
            }
        }
        
        this.prereqCache.lastUpdate = Date.now();
        this.prereqCache.dirty = false;
    }
    
    /**
     * Mark prerequisites as needing update
     */
    markPrereqDirty() {
        this.prereqCache.dirty = true;
    }
    
    /**
     * Mark building economics as needing recalculation
     */
    markBuildingEconomicsDirty(row, col) {
        this.economicCache.dirty.add(`${row},${col}`);
    }
    
    /**
     * Update economic cache for all dirty buildings
     */
    updateEconomicCache() {
        for (const key of this.economicCache.dirty) {
            const [row, col] = key.split(',').map(Number);
            const parcel = this.game.grid[row][col];
            
            if (parcel && parcel.owner === 'player') {
                const stats = this.calculateBuildingEconomics(parcel, row, col);
                this.economicCache.buildingStats.set(key, stats);
            } else {
                this.economicCache.buildingStats.delete(key);
            }
        }
        
        this.economicCache.dirty.clear();
        this.economicCache.lastUpdate = Date.now();
    }
    
    /**
     * Age all buildings and update decay
     */
    ageBuildings(deltaTime = 1) {
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                
                if (parcel && parcel.building) {
                    // Age building
                    parcel.buildingAge = (parcel.buildingAge || 0) + deltaTime;
                    
                    // Update decay
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.economics) {
                        const decayRate = building.economics.decayRatePercent ?
                            building.economics.decayRatePercent / 100 : 0.001;
                        parcel.decay = Math.min(1, (parcel.decay || 0) + decayRate * deltaTime);
                    }
                    
                    // Update construction progress
                    if (parcel._isUnderConstruction) {
                        const elapsed = (Date.now() - parcel._constructionStartTime) / 1000;
                        const dayProgress = elapsed / this.game.dayLength;
                        parcel._constructionProgress = Math.min(1, dayProgress / parcel._constructionDays);
                        
                        if (parcel._constructionProgress >= 1) {
                            this.completeConstruction(row, col);
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Populate building category selector
     */
    populateBuildingCategories() {
        const categorySelect = this.game.uiManager?.get('buildingCategory');
        if (!categorySelect || !this.buildingManager) return;
        
        // Get unique categories
        const categories = new Set(['all']);
        const buildings = this.buildingManager.getAllBuildings();
        
        buildings.forEach(building => {
            if (building.category) {
                categories.add(building.category.toLowerCase());
            }
        });
        
        // Clear and repopulate
        categorySelect.innerHTML = '';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categorySelect.appendChild(option);
        });
    }
    
    /**
     * Get total building count
     */
    getTotalBuildingCount() {
        let count = 0;
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                if (this.game.grid[row][col]?.building) {
                    count++;
                }
            }
        }
        return count;
    }
    
    /**
     * Get buildings by owner
     */
    getBuildingsByOwner(owner) {
        const buildings = [];
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (parcel && parcel.building && parcel.owner === owner) {
                    buildings.push({ row, col, parcel });
                }
            }
        }
        return buildings;
    }
    
    /**
     * Get building info for display
     */
    getBuildingInfo(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return null;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        if (!building) return null;
        
        const economics = this.calculateBuildingEconomics(parcel, row, col);
        const efficiency = this.getBuildingEfficiency(row, col);
        const needs = this.getBuildingNeeds(building);
        
        return {
            building,
            parcel,
            economics,
            efficiency,
            needs,
            needsSatisfaction: needs.map(need => ({
                ...need,
                satisfaction: this.getNeedSatisfaction(need, row, col)
            }))
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BuildingSystem;
}