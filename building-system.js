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

        // Standardized building category mapping (moved from game.js)
        this.buildingCategories = {
            // Normalize case and naming differences between CSV and code
            normalize: (category) => {
                const mapping = {
                    'Utilities': 'utilities',
                    'utilities': 'utilities',
                    'infrastructure': 'utilities',
                    'Housing': 'housing',
                    'housing': 'housing',
                    'residential': 'housing',
                    'Commercial': 'commercial',
                    'commercial': 'commercial',
                    'Education': 'education',
                    'education': 'education',
                    'Civic': 'culture',
                    'culture': 'culture',
                    'Recreation': 'recreation',
                    'recreation': 'recreation',
                    'Healthcare': 'healthcare',
                    'healthcare': 'healthcare',
                    'office': 'commercial', // Treat office as commercial
                    'industrial': 'commercial', // Treat industrial as commercial
                    'mixed': 'commercial' // Treat mixed as commercial
                };
                return mapping[category] || category.toLowerCase();
            },

            // Check if a building is an energy producer
            isEnergyProducer: (building) => {
                return (building.resources?.energyProvided || 0) > (building.resources?.energyRequired || 0);
            },

            // Check if a building needs transport accessibility for revenue
            needsTransportAccess: function(building) {
                const normalizedCategory = this.normalize(building.category);
                return (normalizedCategory === 'commercial' || normalizedCategory === 'education')
                       && !this.isEnergyProducer(building);
            },

            // Check if a building needs road connectivity (different from population access)
            needsRoadConnectivity: function(building) {
                // Energy producers need roads for power distribution
                // Commercial/education buildings need roads for customer/worker access
                const normalizedCategory = this.normalize(building.category);
                return this.isEnergyProducer(building) ||
                       normalizedCategory === 'commercial' ||
                       normalizedCategory === 'education';
            }
        };
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

        // V2 Server-authoritative ONLY - no fallbacks
        const cost = fundingInfo ? fundingInfo.playerCost : this.calculateBuildingCostWithFunding(building);
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return false;
        }

        if (this.game.isCurrentPlayer(owner) && currentBalance < cost) {
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
                // ✅ CLEANED: Server balance is authoritative via Economic Client
                // Cash updates arrive via WebSocket in GAME_STATE messages
                console.log('💰 Building purchase: Server handled cash, awaiting state update');
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

        // Initialize construction progress - server will manage timing
        parcel._constructionProgress = 0.1; // Show initial progress for UI
        
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
        
        // SERVER AUTHORITATIVE: Demolition state handled by server
        // Client will receive parcel state updates via WebSocket
        console.log(`🏗️ Demolition request sent - awaiting server confirmation`);
        
        // Update systems
        this.markBuildingEconomicsDirty(row, col);
        this.game.markVitalityDirty();
        this.markPrereqDirty();
        this.game.scheduleRender();
        
        return true;
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
        if (!building) return { fullCost: 0, playerCost: 0, publicFunding: 0, availableFunds: 0, category: 'housing' };

        const baseCost = fullCost || building.cost || 0;
        const category = building?.category || 'housing';

        // Get category funding from monthly budget allocations
        const availableFunds = this.getCategoryFunding(category);
        const publicFunding = Math.min(availableFunds, baseCost);
        const playerCost = Math.max(0, baseCost - publicFunding);

        return {
            fullCost: baseCost,
            playerCost,
            publicFunding,
            availableFunds,
            category
        };
    }

    /**
     * Get available funding for a category from server game state
     */
    getCategoryFunding(category) {
        // Map building category to budget category (same logic as server)
        const budgetCategory = this.mapBuildingToBudgetCategory(category);

        // Get actual budget balances from server governance system
        const budgets = this.game.economicClient?.governance?.budgets;
        if (!budgets || !budgets[budgetCategory]) {
            return 0;
        }

        // Return the actual allocated budget balance for this category
        const availableFunds = budgets[budgetCategory] || 0;
        console.log(`💰 Category funding for ${category} (budget: ${budgetCategory}): $${availableFunds.toFixed(2)}`);
        return availableFunds;
    }

    /**
     * Map building categories to budget categories for subsidy funding
     * Must match server-side logic in server-economic-engine.js
     */
    mapBuildingToBudgetCategory(buildingCategory) {
        const mapping = {
            'housing': 'housing',
            'education': 'education',
            'mobility': 'infrastructure',
            'energy': 'infrastructure',
            'culture': 'culture',
            'recreation': 'recreation',
            'commercial': 'commercial',
            'industrial': 'commercial',
            'civic': 'civic'
        };

        return mapping[buildingCategory] || 'housing'; // Default fallback
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
                // 🚫 CLIENT CALCULATION - MARKED FOR REMOVAL
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

                // Server manages construction progress - client just displays it
                if (parcel && parcel._isUnderConstruction && parcel._serverManaged) {
                    // Progress comes from server updates, client only displays
                    if (!parcel._constructionProgress) {
                        parcel._constructionProgress = 0.1; // Show some progress for UI fallback
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
                // Check if parcel is owned by the specified owner
                const isTargetOwner = parcel.owner === owner;
                    
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
                if (parcel && parcel.building && parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed') {
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
        // 🚫 GHOST-BUSTING FIX: Client pricing was sending 'Loading...' to server, breaking cash balance tracking!
        // Issue: getParcelPrice() was disabled and returned 'Loading...', server couldn't process transaction amounts
        // Solution: Use economicClient.getParcelPrice() for server-authoritative pricing with fallback
        // const price = this.game.getParcelPrice(row, col); // GHOST!
        const price = this.game.economicClient?.getParcelPrice(row, col) || 150; // Server-authoritative pricing
        
        // Check if player has enough actions (don't spend yet - server will handle)
        if (!this.game.actionManager.canUseAction('purchaseParcel')) {
            this.game.showInsufficientActionsFeedback();
            this.game.hideContextMenu();
            return false;
        }
        
        // V2 Server-authoritative ONLY - no fallbacks
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) return false; // Wait for server data

        if (currentBalance < price) {
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            this.game.showInsufficientFundsFeedback();
            return false;
        }

        // Check if parcel is already owned
        if (this.game.grid[row][col].owner && this.game.grid[row][col].owner !== 'City' && this.game.grid[row][col].owner !== 'unclaimed') {
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            return false;
        }
        
        // Process purchase through server: single atomic transaction
        try {
            // Send unified parcel purchase transaction (handles payment + ownership + treasury)
            if (this.game.economicClient) {
                await this.game.economicClient.purchaseParcel(this.game.currentPlayerId, price, [row, col], 'Parcel Purchase');
                console.log(`🏡 Parcel purchase transaction sent: ${coord} by ${this.game.currentPlayerId} for $${price}`);
            } else {
                throw new Error('Economic client not available');
            }
        } catch (error) {
            console.error('❌ Parcel purchase failed:', error);
            // Refund the action since purchase failed
            this.game.actionManager.currentActions += this.game.actionManager.actionCosts.purchaseParcel;
            this.game.actionManager.usedThisMonth -= this.game.actionManager.actionCosts.purchaseParcel;
            this.game.updateActionDisplay();
            this.game.showInsufficientFundsFeedback();
            return false;
        }

        // Treasury update handled by server - client receives updates via WebSocket

        // SERVER AUTHORITATIVE: Ownership updates will arrive via WebSocket
        // Do not update client grid state directly - await server confirmation
        console.log('💰 PURCHASE: Transaction completed - awaiting ownership update from server');
        
        // Broadcast parcel purchase to other players and handle conflicts
        if (this.game.multiplayerManager) {
            const success = await this.game.multiplayerManager.onParcelPurchased(row, col, null, price);

            if (!success) {
                // ✅ CLEANED: Server handles refunds automatically - no client-side rollback needed
                console.log('💰 Parcel purchase rejected by server - balance maintained server-side');

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

        // V2: Use ui-manager for display updates
        if (this.game.uiManager && this.game.economicClient) {
            this.game.uiManager.updateEconomicDisplays(this.game.economicClient);
        }
        // V2: Economic client automatically handles cashflow updates via server sync
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
        
        // Check if player has enough actions (don't spend yet - server will handle)
        if (!this.game.actionManager.canUseAction('constructBuilding')) {
            this.game.showInsufficientActionsFeedback();
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

        // Check if player has enough cash for their portion - use server-authoritative balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) return false; // Wait for server data

        if (currentBalance < playerCostRequired) {
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
        
        // Process building locally - server-authoritative balance tracking
        const oldCash = this.game.economicClient?.getCurrentPlayerBalance() || 0;

        // Public funds are tracked server-side in the economic engine
        // No client-side deduction needed - server handles governance spending

        // Store original state for potential rollback - server-authoritative
        const originalCash = this.game.economicClient?.getCurrentPlayerBalance() || 0;
        const originalBuilding = this.game.grid[row][col].building;
        const originalAmenities = this.game.grid[row][col].amenities || [];
        const originalConstructionStartDay = this.game.grid[row][col].constructionStartDay;
        const originalConstructionDays = this.game.grid[row][col].constructionDays;

        // ✅ CLEANED: Direct server-authoritative transaction via Economic Client
        let spendResult = false;
        if (this.game.economicClient) {
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
                    return false;
                } else {
                    console.log('✅ BUILD_START transaction successful');
                    spendResult = true; // For compatibility with rest of function

                    // Start client-side construction visual effects
                    if (this.game.renderingSystem?.startConstructionTracking) {
                        this.game.renderingSystem.startConstructionTracking(row, col);
                    }
                }
            } catch (buildStartError) {
                console.error('❌ BUILD_START transaction failed:', buildStartError);
                return false;
            }
        } else {
            console.error('❌ Economic Client not available for server transactions');
            return false;
        }
        // SERVER AUTHORITATIVE: Building placement handled by server
        // Client will receive building state updates via WebSocket

        // SERVER AUTHORITATIVE: Construction timing handled by server
        // Client will receive construction state updates via WebSocket
        console.log(`🏗️ Construction request sent for ${buildingId} at (${row},${col}) - awaiting server confirmation`);

        // Broadcast to server and await response
        if (this.game.multiplayerManager) {
            const success = await this.game.multiplayerManager.onBuildingConstructed(row, col, buildingId, {
                constructionStartDay: this.game.grid[row][col].constructionStartDay,
                constructionDays: this.game.grid[row][col].constructionDays,
                amenities: this.game.grid[row][col].amenities || []
            });

            if (!success) {
                // Server rejected - rollback optimistic changes
                // ✅ CLEANED: Server handles transaction rollback automatically
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
        // V2: Use ui-manager for display updates
        if (this.game.uiManager && this.game.economicClient) {
            this.game.uiManager.updateEconomicDisplays(this.game.economicClient);
        }
        // V2: Economic client automatically handles cashflow updates via server sync
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
        const buildingId = parcel.building?.type || parcel.building?.id || parcel.building;

        if (!buildingId) return false;

        // Calculate demolition fee (25% of current building value based on condition)
        const building = this.buildingManager?.getBuildingById(buildingId);
        if (!building) {
            console.error('Building definition not found for:', buildingId);
            return false;
        }
        const buildingCost = building.cost || 0;
        const condition = parcel.condition || 100;
        const currentValue = Math.round(buildingCost * (condition / 100));
        const demolitionFee = Math.round(currentValue * 0.25);

        // Check if player can afford demolition fee - use server-authoritative balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) return false; // Wait for server data

        if (currentBalance < demolitionFee) {
            this.game.showInsufficientFundsFeedback();
            this.game.hideContextMenu();
            return false;
        }

        // ✅ CLEANED: Server-authoritative demolition transaction
        // Demolition cost is removed from economy (not added to treasury)
        if (this.game.economicClient) {
            try {
                await this.game.economicClient.spendCash(this.game.currentPlayerId, demolitionFee, 'Building demolition fee');
                console.log('💰 Demolition fee processed by server');
            } catch (error) {
                console.error('❌ Demolition payment failed:', error);
                return false;
            }
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
        // V2: Use ui-manager for display updates
        if (this.game.uiManager && this.game.economicClient) {
            this.game.uiManager.updateEconomicDisplays(this.game.economicClient);
        }
        // V2: Economic client automatically handles cashflow updates via server sync
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
        
        // SERVER AUTHORITATIVE: Building upgrade handled by server
        // Client will receive building state updates via WebSocket
        console.log(`🔧 Building upgrade request sent for ${upgradeId} at (${row},${col})`);
        
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
        // V2: Use ui-manager for display updates
        if (this.game.uiManager && this.game.economicClient) {
            this.game.uiManager.updateEconomicDisplays(this.game.economicClient);
        }
        this.game.scheduleRender();
        this.game.hideContextMenu();
        
        return true;
    }

    /**
     * Add an amenity to a building
     */
    addAmenityToBuilding(row, col, amenityId) {
        const coord = this.game.getParcelCoordinate(row, col);
        
        // SERVER AUTHORITATIVE: Amenity addition handled by server
        // Client will receive amenity state updates via WebSocket
        console.log(`🎯 Amenity addition request sent for ${amenityId} at (${row},${col})`);
        
        // Broadcast amenity addition to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.onBuildingConstructed(row, col, this.game.grid[row][col].building, {
                constructionStartDay: this.game.grid[row][col].constructionStartDay,
                constructionDays: this.game.grid[row][col].constructionDays,
                amenities: this.game.grid[row][col].amenities
            });
        }
        
        // Update vitality and re-render
        // V2: Use ui-manager for display updates
        if (this.game.uiManager && this.game.economicClient) {
            this.game.uiManager.updateEconomicDisplays(this.game.economicClient);
        }
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
        const repairCost = this.calculateRepairCost(parcel, building, row, col);

        // Use server-authoritative balance for repair cost check
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) return false; // Wait for server data

        if (currentBalance < repairCost) {
            return false;
        }
        
        // ✅ CLEANED: Server-authoritative repair transaction
        if (this.game.economicClient) {
            try {
                await this.game.economicClient.spendCash(this.game.currentPlayerId, repairCost, 'Building repair');
                console.log('💰 Repair cost processed by server');
            } catch (error) {
                console.error('❌ Repair payment failed:', error);
                return false;
            }
        }
        
        // Reset decay to 0 (fully repaired) but keep building age for history
        const oldDecay = parcel.decay;
        const oldMaintenance = building.economics.maintenanceCost * (1 + (oldDecay * 2));
        const newMaintenance = building.economics.maintenanceCost;
        
        parcel.decay = 0;
        
        // Mark building for economic recalculation
        this.markBuildingEconomicsDirty(row, col);
        
        // Update cashflow preview immediately
        // V2: Economic client automatically handles cashflow updates via server sync
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

        // 🚫 CLIENT CALCULATION - MARKED FOR REMOVAL
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
     * Calculate repair cost - SERVER PREFERRED, CLIENT FALLBACK
     */
    calculateRepairCost(parcel, building, row = null, col = null) {
        // Try server data first if coordinates provided
        if (this.game.economicClient && row !== null && col !== null) {
            const serverRepairCost = this.game.economicClient.getBuildingRepairCost?.(row, col);
            if (serverRepairCost !== undefined && serverRepairCost !== null) {
                return serverRepairCost;
            }
        }

        // Fallback to client calculation based on condition
        if (!parcel || !building) {
            return 0;
        }

        const condition = parcel.condition !== undefined ? parcel.condition : 100;

        // If already at 100%, no repair needed
        if (condition >= 100) {
            return 0;
        }

        // Calculate cost to restore to 100% based on building cost and condition loss
        const buildingCost = building.cost || building.economics?.buildCost || 0;
        const conditionLoss = 100 - condition;

        // Cost is proportional to condition loss (50% condition = 50% of build cost to repair)
        const repairCost = (buildingCost * conditionLoss) / 100;

        return Math.round(repairCost);
    }

    /**
     * Calculate current building value - SERVER PREFERRED, CLIENT FALLBACK
     */
    calculateCurrentBuildingValue(parcel, building, row = null, col = null) {
        // Try cached server data first if coordinates provided
        if (this.game.economicClient && row !== null && col !== null) {
            const locationKey = `${row},${col}`;
            const serverBuilding = this.game.economicClient.buildings?.get(locationKey);
            if (serverBuilding?.currentValue !== undefined && serverBuilding.currentValue !== null) {
                return serverBuilding.currentValue;
            }
        }

        // Fallback to client calculation
        if (!building || !building.economics) return 0;

        const baseCost = building.economics.buildCost || 0;
        const decayFactor = 1 - (parcel.decay || 0);

        return Math.round(baseCost * decayFactor);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BuildingSystem;
} else if (typeof window !== 'undefined') {
    window.BuildingSystem = BuildingSystem;
}