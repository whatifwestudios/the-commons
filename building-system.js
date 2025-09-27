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
    async placeBuilding(row, col, buildingId, owner = null, fundingInfo = null) {
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

        // Check affordability (quick client-side check before server transaction)
        const cost = fundingInfo ? fundingInfo.playerCost : this.calculateBuildingCostWithFunding(building);
        if (this.game.isCurrentPlayer(owner) && this.game.playerCash < cost) {
            this.game.showNotification('Insufficient funds!', 'error');
            return false;
        }

        // V2 ECONOMIC SYSTEM: Send transaction to server instead of client-side processing
        const playerId = owner || this.game.currentPlayerId;

        try {
            console.log(`🏗️ Sending BUILD_START transaction: ${buildingId} at (${row},${col}) for ${playerId}`);

            // Send build start transaction to server
            const result = await this.game.economicClient.startConstruction(
                buildingId,
                [row, col],
                playerId,
                cost
            );

            if (!result.success) {
                this.game.showNotification(result.error || 'Construction failed!', 'error');
                return false;
            }

            console.log('✅ BUILD_START transaction successful:', result);

            // Update local cash immediately (server has already deducted)
            if (this.game.isCurrentPlayer(playerId)) {
                this.game.playerCash = result.result.playerCash;
                if (this.game.cashManager) {
                    this.game.cashManager.updateBalance(result.result.playerCash);
                }
            }

        } catch (error) {
            console.error('❌ BUILD_START transaction failed:', error);
            this.game.showNotification('Construction failed: ' + error.message, 'error');
            return false;
        }
        
        // Place the building
        parcel.building = buildingId;
        parcel.owner = owner || this.game.currentPlayerId;
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

        // Server handles all construction state and timing - just update UI state
        parcel._isUnderConstruction = true;
        parcel._serverManaged = true; // Mark as server-managed construction
        
        // Track building ownership locally (UI only)
        if (this.game.isCurrentPlayer(owner)) {
            this.game.useAction('build');
            this.playerBuildings.add(`${row},${col}`);

            // Track by type
            const typeCount = this.buildingsByType.get(buildingId) || 0;
            this.buildingsByType.set(buildingId, typeCount + 1);
        }
        
        // Update various systems for UI
        this.markBuildingEconomicsDirty(row, col);
        this.markPrereqDirty();
        this.game.scheduleRender();

        console.log(`✅ Building placement complete: ${buildingId} at (${row},${col}) - server managing construction`);
        return true;
    }
    
    /**
     * Invalidate caches for buildings in affected area
     */
    invalidateBuildingCaches(centerRow, centerCol, radius = 3) {
        // Invalidate economic API cache
        if (this.game.economicAPI) {
            this.game.economicAPI.clearBuildingCache(centerRow, centerCol, radius);
        }

        // Cache invalidation handled by unified tooltip system

        // Clear any other building performance caches
        if (this.game.performanceEngine) {
            this.game.performanceEngine.clearCache();
        }
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
    async completeConstruction(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building || !parcel._serverManaged) return;

        console.log(`🏗️ Sending BUILD_COMPLETE transaction: ${parcel.building} at (${row},${col})`);

        try {
            // Send build complete transaction to server
            const result = await this.game.economicClient.completeConstruction(
                parcel.building,
                [row, col],
                parcel.owner
            );

            if (!result.success) {
                console.error('❌ BUILD_COMPLETE transaction failed:', result.error);
                return;
            }

            console.log('✅ BUILD_COMPLETE transaction successful:', result);

            // Update local UI state (server handles all economic calculations)
            parcel._isUnderConstruction = false;
            parcel._serverManaged = false;
            delete parcel._constructionStartTime;
            delete parcel._constructionDays;
            delete parcel._constructionProgress;

            // Update various systems for UI
            this.markBuildingEconomicsDirty(row, col);
            this.game.scheduleRender();

        } catch (error) {
            console.error('❌ BUILD_COMPLETE transaction failed:', error);
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
            // Buildings under construction generate no revenue
            if (parcel._isUnderConstruction) {
                return {
                    revenue: 0,
                    maintenance: 0,
                    landTax: landTax,
                    netIncome: -landTax,
                    buildingName: 'Under Construction'
                };
            }

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
        
        // Clamp efficiency to 0-100% range (no artificial minimum)
        efficiency = Math.max(0, Math.min(100, efficiency));
        
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
                // Simple adjacency check - look at the 8 neighboring cells
                return this.getAdjacentResourceScore('roads', row, col);

            case 'energy':
                return this.getAdjacentResourceScore('energy', row, col);

            case 'workers':
                return this.getAdjacentResourceScore('workers', row, col);

            case 'jobs':
                return this.getAdjacentResourceScore('jobs', row, col);

            case 'food':
                return this.getAdjacentResourceScore('food', row, col);

            case 'housing':
                return this.getAdjacentResourceScore('housing', row, col);

            case 'education':
                return this.getAdjacentResourceScore('education', row, col);

            case 'healthcare':
                return this.getAdjacentResourceScore('healthcare', row, col);

            default:
                return 100;
        }
    }

    /**
     * Get resource supply/demand balance using road network connectivity
     */
    getNetworkResourceBalance(resource, centerRow, centerCol) {
        if (!this.game.transportationSystem || !this.game.transportationSystem.calculateResourceAccessibility) {
            return null; // Fall back to legacy method
        }

        // Check if center location has road access
        if (!this.game.transportationSystem.hasRoadAccess(centerRow, centerCol)) {
            return { supply: 0, demand: 0, ratio: 0 };
        }

        // Get accessible resource providers through road network
        const accessible = this.game.transportationSystem.calculateResourceAccessibility(
            centerRow, centerCol, resource, 15 // Max 15 network distance
        );

        let totalSupply = 0;
        let localDemand = 0;

        // Calculate supply from network-accessible buildings with transport mode details
        for (const provider of accessible) {
            // Apply distance and efficiency penalties
            const distancePenalty = Math.max(0.1, 1 - (provider.distance / 15));
            const effectiveSupply = provider.supply * provider.efficiency * distancePenalty;
            totalSupply += effectiveSupply;

            const transportMode = provider.transportMode || 'road';
            const transitInfo = provider.transitRoute ? ` via ${provider.transitRoute}` : '';

            console.log(`📡 [${transportMode.toUpperCase()}] ${resource} from (${provider.row},${provider.col}): ${provider.supply} * ${provider.efficiency.toFixed(2)} * ${distancePenalty.toFixed(2)} = ${effectiveSupply.toFixed(1)}${transitInfo}`);
        }

        // Calculate local demand (buildings at this location still create local demand)
        const centerParcel = this.game.grid[centerRow][centerCol];
        if (centerParcel && centerParcel.building) {
            const building = this.game.buildingManager?.getBuildingById(centerParcel.building);
            if (building) {
                switch(resource) {
                    case 'energy':
                        localDemand = building.resources?.energyDemand || 0;
                        break;
                    case 'food':
                        localDemand = centerParcel.population * 0.5 || 0;
                        break;
                    case 'jobs':
                        localDemand = centerParcel.population * 0.6 || 0;
                        break;
                    case 'workers':
                        localDemand = building.population?.jobsCreated || 0;
                        break;
                }
            }
        }

        const demand = Math.max(1, localDemand);
        const ratio = totalSupply / demand;

        // Calculate transport impact benefits for people-related resources
        let healthBonus = 0;
        let environmentBonus = 0;
        if (resource === 'workers' || resource === 'jobs') {
            const transportImpacts = this.game.transportationSystem.calculateTransportImpacts(centerRow, centerCol);
            healthBonus = transportImpacts.health * 0.1; // 10% bonus for good health impacts
            environmentBonus = transportImpacts.environment * 0.1; // 10% bonus for good environment
            totalSupply *= (1 + healthBonus + environmentBonus);

            console.log(`🌱 [HEALTH] Transport impacts at (${centerRow},${centerCol}): health=${transportImpacts.health.toFixed(2)}, environment=${transportImpacts.environment.toFixed(2)}, walkability=${transportImpacts.walkability.toFixed(2)}`);
        }

        console.log(`📡 [NETWORK] ${resource} balance at (${centerRow},${centerCol}): supply=${totalSupply.toFixed(1)}, demand=${demand.toFixed(1)}, ratio=${ratio.toFixed(2)}`);

        return {
            supply: totalSupply,
            demand: demand,
            ratio: ratio,
            healthBonus: healthBonus,
            environmentBonus: environmentBonus
        };
    }

    /**
     * Get resource access score from adjacent 8 cells (puzzle-like gameplay)
     */
    getAdjacentResourceScore(resourceType, row, col) {
        let totalSupply = 0;
        let adjacentCount = 0;
        const missingResources = [];

        // Check all 8 adjacent cells
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (const [dRow, dCol] of directions) {
            const adjRow = row + dRow;
            const adjCol = col + dCol;

            // Skip if out of bounds
            if (adjRow < 0 || adjRow >= this.game.gridSize || adjCol < 0 || adjCol >= this.game.gridSize) {
                continue;
            }

            adjacentCount++;
            const parcel = this.game.grid[adjRow][adjCol];

            if (!parcel || !parcel.building) {
                missingResources.push({ row: adjRow, col: adjCol, reason: 'empty' });
                continue;
            }

            // Only consider completed buildings (OOO: Only Operational Order)
            const isUnderConstruction = parcel._constructionProgress < 1.0;
            if (isUnderConstruction) {
                missingResources.push({ row: adjRow, col: adjCol, reason: 'under_construction' });
                continue;
            }

            const building = this.game.buildingManager?.getBuildingById(parcel.building);
            if (!building) {
                continue;
            }

            // Calculate resource supply from this adjacent building
            const resourceSupply = this.getBuildingResourceSupply(building, resourceType);
            if (resourceSupply > 0) {
                totalSupply += resourceSupply;
            } else {
                missingResources.push({ row: adjRow, col: adjCol, reason: 'no_resource' });
            }
        }

        // Convert to percentage score (0-100)
        // Perfect score = 100 when all adjacent cells provide the resource
        const maxPossibleSupply = adjacentCount * 10; // Assuming 10 as max supply per cell
        const score = Math.min(100, (totalSupply / Math.max(1, maxPossibleSupply)) * 100);

        // Store missing resources for UI display
        this.lastResourceCheck = {
            resourceType,
            row,
            col,
            score,
            totalSupply,
            adjacentCount,
            missingResources
        };

        return score;
    }

    /**
     * Get resource supply from a building for specific JEEFHH resource
     */
    getBuildingResourceSupply(building, resourceType) {
        if (!building) return 0;

        switch(resourceType) {
            case 'roads':
                return building.category === 'infrastructure' ? 10 : 0;
            case 'energy':
                return building.resources?.energyProvided || 0;
            case 'jobs':
                return building.resources?.jobsProvided || building.population?.jobsCreated || 0;
            case 'food':
                return building.resources?.foodProvided || 0;
            case 'housing':
                return building.resources?.housingProvided || building.population?.bedroomsProvided || 0;
            case 'education':
                return building.resources?.educationProvided || (building.category === 'education' ? 10 : 0);
            case 'healthcare':
                return building.resources?.healthcareProvided || (building.category === 'healthcare' ? 10 : 0);
            case 'workers':
                // Buildings with housing provide workers (people living there)
                return building.resources?.housingProvided || building.population?.workersLiving || 0;
            default:
                return 0;
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
     * Update construction progress for all buildings under construction
     * Called from the game loop to gradually advance construction over time
     */
    updateConstructionProgress() {
        // Server-managed construction - client just handles UI state
        // Construction timing and completion is handled by server via economic updates
        // This method is kept for compatibility but does minimal work

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];

                // Only handle visual progress for server-managed construction
                if (parcel && parcel._isUnderConstruction && parcel._serverManaged) {
                    // Set a default progress value for UI (actual progress managed by server)
                    if (!parcel._constructionProgress) {
                        parcel._constructionProgress = 0.1; // Show some progress for UI
                    }
                }
            }
        }
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

                    // Construction progress is now handled by updateConstructionProgress()
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
        
        // Process purchase through CashManager (server-authoritative)
        try {
            await this.game.cashManager.spend(price, 'Parcel Purchase', {
                coordinate: coord,
                row: row,
                col: col
            });
        } catch (error) {
            console.error('❌ Parcel purchase failed:', error);
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            this.game.showInsufficientFundsFeedback();
            return false;
        }

        // Add land purchase price to governance budget
        if (this.game.governanceSystem) {
            this.game.governanceSystem.addFunds(price, 'land sales');
        }

        // Use current player ID from PlayerUtils (supports both single and multiplayer)
        this.game.grid[row][col].owner = this.game.currentPlayerId;
        this.game.grid[row][col].landValue.paidPrice = price;
        this.game.grid[row][col].landValue.lastAuctionDay = this.game.currentDay;
        
        // Broadcast parcel purchase to other players and handle conflicts
        if (this.game.multiplayerManager) {
            const success = await this.game.multiplayerManager.onParcelPurchased(row, col, null, price);

            if (!success) {
                // Purchase was rejected - need to refund via CashManager
                try {
                    await this.game.cashManager.earn(price, 'Parcel Purchase Rollback', {
                        coordinate: coord,
                        row: row,
                        col: col
                    });
                } catch (refundError) {
                    console.error('❌ Failed to refund parcel purchase:', refundError);
                }

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

        // Use server-authoritative calculation instead of direct vitality display
        this.game.calculateCityVitality();
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
        console.log('🔧 Attempting to get building cost for:', buildingId);
        const buildingCost = this.game.getBuildingCost(buildingId);
        console.log('🔧 Building cost result:', buildingCost);
        
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

        // Use CashManager for transaction safety
        let spendResult = null;
        if (this.game.cashManager) {
            try {
                // CashManager handles optimistic updates and server validation
                spendResult = await this.game.cashManager.spend(playerCostRequired, 'Building construction', {
                    buildingId: buildingId,
                    coordinates: `${row},${col}`,
                    publicFunding: publicFunding
                });

                // Send BUILD_START transaction to economic engine
                try {
                    console.log(`🏗️ Sending BUILD_START transaction: ${buildingId} at (${row},${col})`);
                    const buildStartResult = await this.game.economicClient.startConstruction(
                        buildingId,
                        [row, col],
                        this.game.currentPlayerId,
                        playerCostRequired
                    );

                    if (!buildStartResult.success) {
                        console.error('❌ BUILD_START transaction failed:', buildStartResult.error);
                        // Note: Cash has already been spent, but building won't be tracked by economic engine
                    } else {
                        console.log('✅ BUILD_START transaction successful');
                    }
                } catch (buildStartError) {
                    console.error('❌ BUILD_START transaction failed:', buildStartError);
                    // Note: Cash has already been spent, but building won't be tracked by economic engine
                }
            } catch (error) {
                console.warn('Building construction payment failed:', error.message);
                return false;
            }
        } else {
            // Fallback to legacy system
            this.game.playerCash -= playerCostRequired;
        }
        this.game.grid[row][col].building = buildingId;

        // Set construction start day and duration
        if (building && building.economics) {
            // OLD SYSTEM: Game day based (keep for compatibility)
            this.game.grid[row][col].constructionStartDay = this.game.currentDay;
            this.game.grid[row][col].constructionDays = building.economics.constructionDays || 14;
            this.game.grid[row][col].buildingAge = 0;

            // Force minimum 3 days for construction animation
            if (this.game.grid[row][col].constructionDays < 3) {
                this.game.grid[row][col].constructionDays = 3;
            }

            // NEW SYSTEM: Real-time based (for unified building state)
            this.game.grid[row][col]._isUnderConstruction = true;
            this.game.grid[row][col]._constructionStartTime = Date.now();
            this.game.grid[row][col]._constructionDays = building.economics.constructionDays || 14;
            this.game.grid[row][col]._constructionProgress = 0;

            console.log(`🏗️ Construction started at (${row},${col}):`, {
                buildingId,
                startTime: this.game.grid[row][col]._constructionStartTime,
                constructionDays: this.game.grid[row][col]._constructionDays,
                expectedDuration: (this.game.grid[row][col]._constructionDays * (3600000 / 365)) / 1000 + ' seconds'
            });
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
                // Note: CashManager handles cash rollback automatically
                // CashManager always handles rollback automatically
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

        // Invalidate economic API caches for affected buildings
        this.invalidateBuildingCaches(row, col, 3);
        
        // Update land values, vitality, cashflow and re-render
        this.game.updateAllLandValues();
        this.game.calculateCityVitality(); // Server-authoritative
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
    async demolishBuilding(row, col) {
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
        if (this.game.cashManager) {
            await this.game.cashManager.spend(demolitionFee, 'Building demolition fee', {
                building: buildingId,
                location: `${row},${col}`
            });
        } else {
            // Legacy fallback only if CashManager unavailable
            this.game.playerCash -= demolitionFee;
        }
        
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
        this.game.calculateCityVitality(); // Server-authoritative
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
        this.game.calculateCityVitality(); // Server-authoritative
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
        this.game.calculateCityVitality(); // Server-authoritative
        this.game.scheduleRender();
        this.game.hideContextMenu();
        
        return true;
    }

    /**
     * Repair a building to reset decay
     */
    async repairBuilding(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return false;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        const repairCost = this.game.calculateRepairCost(parcel, building);
        
        if (this.game.playerCash < repairCost) {
            return false;
        }
        
        // Deduct repair cost
        if (this.game.cashManager) {
            await this.game.cashManager.spend(repairCost, 'Building repair', {
                building: parcel.building,
                location: `${row},${col}`
            });
        } else {
            // Legacy fallback only if CashManager unavailable
            this.game.playerCash -= repairCost;
        }
        
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