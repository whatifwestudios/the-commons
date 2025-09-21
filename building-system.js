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
     * Build a building with funding info (called from game.js) - DEPRECATED, use constructBuilding
     */
    async buildBuilding(row, col, buildingId, fundingInfo) {
        return await this.constructBuilding(row, col, buildingId);
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
        if (this.game.isCurrentPlayer(owner) && this.game.playerCash < cost) {
            this.game.showNotification('Insufficient funds!', 'error');
            return false;
        }
        
        // Place the building
        parcel.building = buildingId;
        parcel.owner = owner;
        parcel.buildingAge = 0;
        parcel.decay = 0;
        parcel.population = 0;


        // Re-enabled: Generate tinted variants with proper error handling
        if (this.game.renderingSystem?.buildingTintManager) {
            this.game.renderingSystem.buildingTintManager.ensureVariantsExist(buildingId)
                .then(() => {
                    // Tint variants ready
                })
                .catch(error => {
                    console.warn(`Failed to generate variants for ${buildingId}:`, error);
                });
        }

        // Initialize construction if building has construction time
        if (building.economics && building.economics.constructionDays > 0) {
            parcel._isUnderConstruction = true;
            parcel._constructionStartTime = Date.now();
            parcel._constructionDays = building.economics.constructionDays;
            parcel._constructionProgress = 0;


            // Set legacy fields for compatibility with game.js drawing system
            parcel.constructionStartDay = this.game.currentDay;
            parcel.constructionDays = building.economics.constructionDays;
            
            // Create dust cloud effect at construction start
            if (this.game.createDustCloud) {
                const worldPos = this.game.toIsometric(col, row);
                this.game.createDustCloud(worldPos.x, worldPos.y, 'building');
            } else {
            }
        } else {
            // Instant construction
            if (this.game.createDustCloud) {
                const worldPos = this.game.toIsometric(col, row);
                this.game.createDustCloud(worldPos.x, worldPos.y, 'building');
            } else {
            }
            this.completeConstruction(row, col);
        }
        
        // Deduct cost and use action
        if (this.game.isCurrentPlayer(owner)) {
            this.game.playerCash -= cost;
            this.game.useAction('build');
            this.playerBuildings.add(`${row},${col}`);
            
            // Track by type
            const typeCount = this.buildingsByType.get(buildingId) || 0;
            this.buildingsByType.set(buildingId, typeCount + 1);
        }
        
        // Update various systems
        this.markBuildingEconomicsDirty(row, col);
        this.markPrereqDirty();
        this.game.scheduleRender();

        // Call server API for building placement effects
        const gameState = this.game.economicAPI.prepareGameState(this.game);
        const buildingData = { row, col, buildingId, owner };
        this.game.economicAPI.handleBuildingPlacement(gameState, buildingData).then(result => {
            if (result && result.success && result.vitality) {
                // Update client vitality data from server
                this.game.cityStats.vitality = result.vitality;
                this.game.vitalitySupply = result.vitality.supply || this.game.vitalitySupply;
                this.game.vitalityDemand = result.vitality.demand || this.game.vitalityDemand;
                this.game.updateVitalityUI();
            }
        }).catch(error => {
            console.warn('Server building placement calculation failed, using local fallback:', error);
            this.game.markVitalityDirty();
        });
        
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
     * Sequence:
     * 1. Remove construction flags
     * 2. Update CLV of adjacent parcels (not this one)
     * 3. System-wide vitality recalculation
     * 4. Enable revenue generation for this building
     */
    completeConstruction(row, col) {
        const parcel = this.game.grid[row][col];
        const building = this.buildingManager.getBuildingById(parcel.building);

        if (!building) return;


        // Step 1: Remove construction flags
        parcel._isUnderConstruction = false;
        delete parcel._constructionStartTime;
        delete parcel._constructionDays;
        delete parcel._constructionProgress;

        // Clear legacy fields too
        parcel.constructionStartDay = null;
        parcel.constructionDays = 0;

        // Step 2: Update CLV of all parcels (new building affects others)
        this.game.updateAllLandValues();

        // Step 3: System-wide vitality recalculation via server API
        const gameState = this.game.economicAPI.prepareGameState(this.game);
        const buildingData = { row, col, buildingId: building.id, owner: parcel.owner };
        this.game.economicAPI.handleBuildingPlacement(gameState, buildingData).then(result => {
            if (result && result.success && result.vitality) {
                // Update client vitality data from server
                this.game.cityStats.vitality = result.vitality;
                this.game.vitalitySupply = result.vitality.supply || this.game.vitalitySupply;
                this.game.vitalityDemand = result.vitality.demand || this.game.vitalityDemand;
                this.game.updateVitalityUI();
            }
        }).catch(error => {
            console.warn('Server construction completion calculation failed, using local fallback:', error);
            this.game.markVitalityDirty(); // Fallback to local calculation
        });

        // Step 4: Initialize building properties for revenue generation
        if (building.population?.bedroomsAdded > 0) {
            parcel.maxPopulation = building.population.bedroomsAdded * 2;
            parcel.population = Math.floor(parcel.maxPopulation * 0.5); // Start at 50% occupancy
        }

        // Step 5: Mark building economics as dirty for revenue calculation
        this.markBuildingEconomicsDirty(row, col);

        // Step 6: Clear performance cache to force recalculation
        if (this.game.performanceEngine) {
            this.game.performanceEngine.clearCache();
        }

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
        if (this.game.isCurrentPlayer(parcel.owner)) {
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
        // Land Value Tax - use dynamic rate from governance system
        const annualLVTRate = this.game.governanceSystem ? this.game.governanceSystem.getCurrentLVTRate() : 0.50;
        const dailyLVTRate = annualLVTRate / 365;
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

        // Apply governance funding if available through the new governance system
        if (this.game.governanceSystem) {
            return this.game.governanceSystem.getBuildingCostWithFunding(building);
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
            
            if (parcel && this.game.isCurrentPlayer(parcel.owner)) {
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
                        // Use the same time calculation as the main game system
                        const elapsedMs = Date.now() - parcel._constructionStartTime;
                        const totalConstructionMs = parcel._constructionDays * this.game.dayDuration;
                        parcel._constructionProgress = Math.min(1, elapsedMs / totalConstructionMs);

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
                // Handle both legacy 'player' and actual player IDs
                const isTargetOwner = (owner === 'player') ? 
                    this.game.isCurrentPlayer(parcel.owner) : 
                    parcel.owner === owner;
                    
                if (parcel && parcel.building && isTargetOwner) {
                    buildings.push({ row, col, parcel });
                }
            }
        }
        return buildings;
    }
    
    /**
     * Get ALL buildings in the city (for transparency/city-wide views)
     */
    getAllBuildings() {
        const buildings = [];
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (parcel && parcel.building && parcel.owner && parcel.owner !== 'unclaimed') {
                    buildings.push({ row, col, parcel });
                }
            }
        }
        return buildings;
    }

    /**
     * Purchase a parcel at market price
     */
    async purchaseParcel(row, col) {
        const coord = this.game.getParcelCoordinate(row, col);
        // Use static distance-based pricing for initial purchases
        const price = this.game.getParcelPrice(row, col);
        
        // Check if player has enough actions
        if (!this.game.useAction('purchaseParcel', this.game.actionManager.actionCosts.purchaseParcel)) {
            this.game.hideContextMenu();
            return false;
        }
        
        // Check if player has enough cash
        if (this.game.playerCash < price) {
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            this.game.showInsufficientFundsFeedback();
            return false;
        }

        // Check if parcel is already owned
        if (this.game.grid[row][col].owner && this.game.grid[row][col].owner !== 'unclaimed') {
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            return false;
        }
        
        // Store original state for potential rollback
        const originalCash = this.game.playerCash;
        
        // Process purchase optimistically (immediately)
        this.game.playerCash -= price;

        // Add land purchase price to governance budget
        if (this.game.governanceSystem) {
            this.game.governanceSystem.addFunds(price, 'land sales');
        }

        // Use actual player ID if multiplayer is active, otherwise 'player'
        this.game.grid[row][col].owner = (this.game.multiplayerManager && this.game.multiplayerManager.playerId)
            ? this.game.multiplayerManager.playerId
            : 'player';
        this.game.grid[row][col].landValue.paidPrice = price;
        this.game.grid[row][col].landValue.lastAuctionDay = this.game.currentDay;
        
        // Broadcast parcel purchase to other players and handle conflicts
        if (this.game.multiplayerManager) {
            const success = await this.game.multiplayerManager.onParcelPurchased(row, col, null, price, originalCash);
            
            if (!success) {
                // Purchase was rejected - rollback already handled by MultiplayerManager
                // Refund the action since purchase failed
                this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
                this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
                this.game.updateActionDisplay();
                this.game.hideContextMenu();
                return false;
            }
        }
        
        // Update calculated land values for all parcels
        this.game.updateAllLandValues();
        
        this.game.updateVitalityDisplay();
        this.game.updateDemographicsDisplay();
        this.game.calculateCurrentCashflow();
        this.game.updatePlayerStats();
        this.game.scheduleRender();
        
        this.game.hideContextMenu();
        return true;
    }

    /**
     * Construct a building on a parcel
     */
    async constructBuilding(row, col, buildingId) {
        const coord = this.game.getParcelCoordinate(row, col);
        const buildingCost = this.game.getBuildingCost(buildingId);
        
        // Check if player has enough actions
        if (!this.game.useAction('constructBuilding', this.game.actionManager.actionCosts.constructBuilding)) {
            this.game.hideContextMenu();
            return false;
        }
        
        // Get building info for public funding calculation
        const building = this.buildingManager.getBuildingById(buildingId);
        
        // Use centralized cost calculation with public funding
        const fundingInfo = this.game.calculateBuildingCostWithFunding(building, buildingCost);
        const publicFunding = fundingInfo.publicFunding;
        const playerCostRequired = fundingInfo.playerCost;
        const buildingCategory = fundingInfo.category;
        
        // Check population requirement using single source of truth
        const currentPopulation = this.game.calculatePopulation(); // Always use the main function
        const requiredPopulation = building?.population?.populationRequired || 0;
        if (currentPopulation < requiredPopulation) {
            // Refund the action since construction failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.constructBuilding;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.constructBuilding;
            this.game.updateActionDisplay();
            this.game.showNotification(`Need ${requiredPopulation} population to build ${building.name} (current: ${Math.floor(currentPopulation)})`, 'error');
            return false;
        }

        // Check if player has enough cash for their portion
        if (this.game.playerCash < playerCostRequired) {
            // Refund the action since construction failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.constructBuilding;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.constructBuilding;
            this.game.updateActionDisplay();
            this.game.showInsufficientFundsFeedback();
            return false;
        }

        // Check if parcel already has a building
        if (this.game.grid[row][col].building) {
            return false;
        }

        // Check if player owns this parcel
        if (!this.game.isCurrentPlayer(this.game.grid[row][col].owner)) {
            return false;
        }
        
        // Process building locally
        const oldCash = this.game.playerCash;
        
        // Deduct public funds from governance budget
        if (publicFunding > 0 && this.game.governanceSystem) {
            this.game.governanceSystem.spendFromCategory(buildingCategory, publicFunding);
        }
        
        // Store original state for potential rollback
        const originalCash = this.game.playerCash;
        const originalBuilding = this.game.grid[row][col].building;
        const originalAmenities = this.game.grid[row][col].amenities || [];
        const originalConstructionStartDay = this.game.grid[row][col].constructionStartDay;
        const originalConstructionDays = this.game.grid[row][col].constructionDays;

        // Optimistically update local state
        this.game.playerCash -= playerCostRequired;
        this.game.grid[row][col].building = buildingId;

        // Set construction start day and duration
        if (building && building.economics) {
            this.game.grid[row][col].constructionStartDay = this.game.currentDay;
            this.game.grid[row][col].constructionDays = building.economics.constructionDays || 14;
            this.game.grid[row][col].buildingAge = 0;

            // Force minimum 3 days for construction animation
            if (this.game.grid[row][col].constructionDays < 3) {
                this.game.grid[row][col].constructionDays = 3;
            }
        }

        // Broadcast to server and await response
        if (this.game.multiplayerManager) {
            const success = await this.game.multiplayerManager.onBuildingConstructed(row, col, buildingId, {
                constructionStartDay: this.game.grid[row][col].constructionStartDay,
                constructionDays: this.game.grid[row][col].constructionDays,
                amenities: this.game.grid[row][col].amenities || []
            });

            if (!success) {
                // Server rejected - rollback optimistic changes
                this.game.playerCash = originalCash;
                this.game.grid[row][col].building = originalBuilding;
                this.game.grid[row][col].amenities = originalAmenities;
                this.game.grid[row][col].constructionStartDay = originalConstructionStartDay;
                this.game.grid[row][col].constructionDays = originalConstructionDays;

                // Refund the action since construction failed
                this.game.actionManager.currentActions += this.game.actionManager.actionCosts.constructBuilding;
                return false;
            }
        } else {
        }
        
        // Mark caches for updates
        this.markBuildingEconomicsDirty(row, col);
        this.game.markVitalityDirty(row, col);
        this.markPrereqDirty();
        
        // Mark region as dirty for cache invalidation (performance optimization)
        this.game.markRegionDirty(row, col, 3);
        
        // Update land values, vitality, cashflow and re-render
        this.game.updateAllLandValues();
        this.game.updateVitalityDisplay();
        this.game.updateDemographicsDisplay();
        this.game.calculateCurrentCashflow();
        this.game.updatePlayerStats();
        this.game.scheduleRender();
        
        this.game.hideContextMenu();
        return true;
    }

    /**
     * Demolish/destroy a building and handle demolition fees
     */
    demolishBuilding(row, col) {
        const coord = this.game.getParcelCoordinate(row, col);
        const parcel = this.game.grid[row][col];
        const buildingId = parcel.building;
        
        if (!buildingId) return false;
        
        // Calculate demolition fee (10% of current building value)
        const building = this.buildingManager.getBuildingById(buildingId);
        const currentValue = this.game.calculateCurrentBuildingValue(parcel, building);
        const demolitionFee = Math.round(currentValue * 0.1);
        
        // Check if player can afford demolition fee
        if (this.game.playerCash < demolitionFee) {
            this.game.showInsufficientFundsFeedback();
            this.game.hideContextMenu();
            return false;
        }
        
        // Deduct demolition fee from player
        this.game.playerCash -= demolitionFee;
        
        // Add demolition fee to city treasury
        if (this.game.governanceSystem) {
            this.game.governanceSystem.addFunds(demolitionFee, 'demolition fees');
        }
        
        
        // Remove building and amenities
        parcel.building = null;
        parcel.amenities = [];
        
        // Broadcast demolition to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.onBuildingConstructed(row, col, null);
        }
        
        // Reset building-specific properties
        parcel.buildingAge = 0;
        parcel.decay = 0;
        
        // Remove from tracking
        if (this.game.isCurrentPlayer(parcel.owner)) {
            this.playerBuildings.delete(`${row},${col}`);
            
            const count = this.buildingsByType.get(buildingId) || 0;
            if (count > 0) {
                this.buildingsByType.set(buildingId, count - 1);
            }
        }
        
        // Mark building for economic recalculation removal
        this.markBuildingEconomicsDirty(row, col);
        
        // Mark region as dirty for cache invalidation (performance optimization)
        this.game.markRegionDirty(row, col, 3);
        
        // Update vitality, cashflow and re-render
        this.game.updateVitalityDisplay();
        this.game.calculateCurrentCashflow();
        this.game.updatePlayerStats();
        this.game.scheduleRender();
        this.game.hideContextMenu();
        
        return true;
    }

    /**
     * Upgrade a building to a different type
     */
    upgradeBuilding(row, col, upgradeId) {
        const coord = this.game.getParcelCoordinate(row, col);
        
        // Replace the building
        this.game.grid[row][col].building = upgradeId;
        
        // Broadcast building upgrade to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.onBuildingConstructed(row, col, upgradeId, {
                constructionStartDay: this.game.grid[row][col].constructionStartDay,
                constructionDays: this.game.grid[row][col].constructionDays,
                amenities: this.game.grid[row][col].amenities || []
            });
        }
        
        // Mark building for economic recalculation
        this.markBuildingEconomicsDirty(row, col);
        
        // Update vitality and re-render
        this.game.updateVitalityDisplay();
        this.game.scheduleRender();
        this.game.hideContextMenu();
        
        return true;
    }

    /**
     * Add an amenity to a building
     */
    addAmenityToBuilding(row, col, amenityId) {
        const coord = this.game.getParcelCoordinate(row, col);
        
        // Add amenity to parcel
        if (!this.game.grid[row][col].amenities.includes(amenityId)) {
            this.game.grid[row][col].amenities.push(amenityId);
        }
        
        // Broadcast amenity addition to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.onBuildingConstructed(row, col, this.game.grid[row][col].building, {
                constructionStartDay: this.game.grid[row][col].constructionStartDay,
                constructionDays: this.game.grid[row][col].constructionDays,
                amenities: this.game.grid[row][col].amenities
            });
        }
        
        // Update vitality and re-render
        this.game.updateVitalityDisplay();
        this.game.scheduleRender();
        this.game.hideContextMenu();
        
        return true;
    }

    /**
     * Repair a building to reset decay
     */
    repairBuilding(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return false;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        const repairCost = this.game.calculateRepairCost(parcel, building);
        
        if (this.game.playerCash < repairCost) {
            return false;
        }
        
        // Deduct repair cost
        this.game.playerCash -= repairCost;
        
        // Reset decay to 0 (fully repaired) but keep building age for history
        const oldDecay = parcel.decay;
        const oldMaintenance = building.economics.maintenanceCost * (1 + (oldDecay * 2));
        const newMaintenance = building.economics.maintenanceCost;
        
        parcel.decay = 0;
        
        // Mark building for economic recalculation
        this.markBuildingEconomicsDirty(row, col);
        
        // Update cashflow preview immediately
        this.game.calculateCurrentCashflow();
        this.game.updatePlayerStats();
        
        
        // Hide context menu after repair
        this.game.hideContextMenu();
        
        // Re-render to show repaired state
        this.game.scheduleRender();
        
        return true;
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

    /**
     * Calculate building cost with public funding support
     * Moved from game.js for proper modularity
     */
    calculateBuildingCostWithFunding(building, fullCost) {
        // Get the building category for public funding check
        const category = building?.category || 'housing';
        const availableFunds = this.game.governanceSystem ?
            this.game.governanceSystem.getCategoryFunding(category) : 0;
        const publicFunding = Math.min(availableFunds, fullCost);
        const playerCost = fullCost - publicFunding;

        return {
            fullCost,
            publicFunding,
            playerCost,
            availableFunds,
            category,
            fundingStatus: publicFunding >= fullCost ? 'full' :
                          publicFunding > 0 ? 'partial' : 'none'
        };
    }

    /**
     * Calculate repair cost for building based on exponential decay
     * Moved from game.js for proper modularity
     */
    calculateRepairCost(parcel, building) {
        // Calculate cost to repair building based on maintenance increase due to exponential decay
        // Cost = 200 × (current_maintenance - original_maintenance)
        if (!parcel || !building || !parcel.buildingAge || parcel.buildingAge <= 0) {
            return 0;
        }

        // Get base maintenance cost and decay rate
        const baseMaintenance = building.economics.maintenanceCost || 0;
        const decayRate = building.economics.decayRatePercent ? building.economics.decayRatePercent / 100 : 0.001;
        const buildingAgeInDays = parcel.buildingAge || 0;

        // Calculate current maintenance using exponential formula: baseMaintenance * (1 + decayRate)^days
        const maintenanceMultiplier = Math.pow(1 + decayRate, buildingAgeInDays);
        const currentMaintenance = baseMaintenance * maintenanceMultiplier;

        // Calculate maintenance increase due to decay
        const maintenanceIncrease = currentMaintenance - baseMaintenance;

        // Repair cost is 200x the maintenance increase
        const repairCost = maintenanceIncrease * 200;

        return Math.round(repairCost * 100) / 100; // Round to nearest cent
    }

    /**
     * Calculate current building value accounting for decay
     * Moved from game.js for proper modularity
     */
    calculateCurrentBuildingValue(parcel, building) {
        // Calculate current building value accounting for decay
        if (!building || !building.economics) return 0;

        const baseCost = building.economics.buildCost || 0;
        const decayFactor = 1 - (parcel.decay || 0);

        // Current value is base cost reduced by decay
        return Math.round(baseCost * decayFactor);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BuildingSystem;
}