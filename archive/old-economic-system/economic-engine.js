/**
 * Economic Engine for The Commons
 * Handles all economic calculations, supply/demand, cashflow, and market dynamics
 */

class EconomicEngine {
    constructor(game) {
        this.game = game;
        
        // Economic state
        this.marketState = {
            supply: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            demand: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            balance: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            multipliers: { energy: 1.0, food: 1.0, housing: 1.0, jobs: 1.0, workers: 1.0, residents: 1.0 }
        };
        
        // Player economic state
        this.playerEconomy = {
            dailyCashflow: 0,
            buildingRevenue: 0,
            buildingMaintenance: 0,
            landValueTax: 0,
            lastUpdate: 0
        };
        
        // Market elasticity settings
        this.elasticity = {
            energy: 0.2,    // Inelastic - essential utility
            food: 0.4,      // Semi-elastic - necessary but some flexibility
            housing: 0.6,   // Elastic - people can adjust housing choices
            jobs: 0.8       // Very elastic - flexible employment market
        };
        
        // Economic cache
        this.cache = {
            supplyDemand: new Map(),
            cashflowBreakdown: null,
            lastCacheUpdate: 0
        };

        this.domCache = {
            marketStats: {},
            multipliers: {},
            cashflow: null
        };
    }
    
    /**
     * Initialize the economic engine
     */
    initialize() {
        // ELIMINATED: Client-side initialization of economic calculations disabled
        console.warn('🚫 Economic engine initialization: Client-side calculations disabled - server provides all data');

        // Cache DOM elements for market dashboard
        const resources = ['energy', 'food', 'housing', 'jobs'];
        resources.forEach(resource => {
            this.domCache.marketStats[resource] = {
                supply: document.getElementById(`${resource}-supply`),
                demand: document.getElementById(`${resource}-demand`),
                balance: document.getElementById(`${resource}-balance`)
            };
            this.domCache.multipliers[resource] = document.getElementById(`${resource}-multiplier`);
        });
        this.domCache.cashflow = document.getElementById('dashboard-cashflow');
    }
    
    /**
     * Process daily economic activities
     */
    processDailyEconomics() {
        // Update supply/demand
        this.updateSupplyDemandBalance();

        // Calculate and apply cashflow
        const cashflow = this.calculatePlayerCashflow();

        // Apply cashflow via CashManager for transaction safety
        if (cashflow && typeof cashflow.netCashflow === 'number' && !isNaN(cashflow.netCashflow)) {
            if (this.game.cashManager) {
                // Use new CashManager system
                this.game.cashManager.applyDailyCashflow(cashflow);
            } else {
                // Fallback to legacy system with validation
                this.game.playerCash += cashflow.netCashflow;
            }
        } else {
            console.warn('Invalid cashflow data detected, skipping cash update:', cashflow);
            // Note: Cash validation now handled by CashManager
        }

        // Update market multipliers
        this.updateMarketMultipliers();

        // Age buildings and decay
        if (this.game.buildingSystem) {
            // Game time: 1 day = 9.86 seconds real time
            // Economic cycle runs every 5 seconds = 5/9.86 game days
            const gameTimeDeltaDays = 5 / 9.86;
            this.game.buildingSystem.ageBuildings(gameTimeDeltaDays);
        }

        // Update road maintenance costs
        this.updateRoadMaintenance();

        return cashflow;
    }
    
    /**
     * Calculate comprehensive supply and demand balance
     */
    updateSupplyDemandBalance() {
        // ELIMINATED: All client-side economic calculations have been removed
        // Supply/demand must be calculated server-side for multiplayer consistency
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: updateSupplyDemandBalance() - Use server-side calculation only');
        // Reset to empty state - server should provide all data
        Object.keys(this.marketState.supply).forEach(key => {
            this.marketState.supply[key] = 0;
            this.marketState.demand[key] = 0;
            this.marketState.balance[key] = 0;
        });
    }
    
    /**
     * Update market multipliers based on supply/demand
     */
    updateMarketMultipliers() {
        // ELIMINATED: All client-side economic calculations have been removed
        // Market multipliers must be calculated server-side for multiplayer consistency
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: updateMarketMultipliers() - Use server-side calculation only');
        // Reset to neutral multipliers - server should provide all data
        Object.keys(this.marketState.multipliers).forEach(resource => {
            this.marketState.multipliers[resource] = 1.0;
        });
    }
    
    /**
     * Calculate smooth price multiplier (from previous optimization)
     */
    calculateSmoothMultiplier(supplyRatio, elasticity) {
        // ELIMINATED: All client-side economic calculations have been removed
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: calculateSmoothMultiplier() - Use server-side calculation only');
        return 1.0; // Neutral multiplier
    }
    
    /**
     * Calculate player's daily cashflow
     */
    async calculatePlayerCashflow() {
        // Delegate to server-side calculation
        const currentPlayerId = PlayerUtils.getCurrentPlayerId();

        if (this.game.economicAPI) {
            try {
                const serverResult = await this.game.economicAPI.getPlayerCashflow(this.game, currentPlayerId);

                if (serverResult) {
                    // Update local cache with server results
                    this.cache.cashflowBreakdown = serverResult;

                    // Update player economy state for compatibility
                    this.playerEconomy = {
                        dailyCashflow: serverResult.netCashflow,
                        buildingRevenue: serverResult.totalRevenue,
                        buildingMaintenance: serverResult.totalMaintenance,
                        landValueTax: serverResult.totalLVT,
                        roadMaintenance: serverResult.roadMaintenance,
                        lastUpdate: Date.now()
                    };

                    return serverResult;
                }
            } catch (error) {
                console.error('Server cashflow calculation failed, falling back to client:', error);
            }
        }

        // Fallback to local calculation if server fails
        return this.calculatePlayerCashflowLocal();
    }

    calculatePlayerCashflowLocal() {
        // ELIMINATED: All client-side economic calculations have been removed
        // All economics must be calculated server-side for multiplayer consistency
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: calculatePlayerCashflowLocal() - Use server-side calculation only');
        throw new Error('Client-side cashflow calculation has been eliminated - use server API');
    }
    
    /**
     * Calculate road maintenance costs
     */
    calculateRoadMaintenance() {
        if (!this.game.transportationSystem) return 0;
        return this.game.transportationSystem.calculateMaintenanceCost();
    }
    
    /**
     * Update road maintenance (called daily)
     */
    updateRoadMaintenance() {
        if (!this.game.transportationSystem) return;
        this.game.transportationSystem.updateRoadConditions(1);
    }
    
    /**
     * Calculate total player wealth (cash + assets)
     */
    calculateTotalWealth() {
        // ELIMINATED: All client-side economic calculations have been removed
        // Wealth must be calculated server-side for multiplayer consistency
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: calculateTotalWealth() - Use server-side calculation only');
        throw new Error('Client-side wealth calculation has been eliminated - use server API');
    }
    
    /**
     * Get local supply/demand for a specific resource around a location
     */
    getLocalSupplyDemand(resource, centerRow, centerCol, radius = 3) {
        // ELIMINATED: All client-side economic calculations have been removed
        // Local supply/demand must be calculated server-side for multiplayer consistency
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: getLocalSupplyDemand() - Use server-side calculation only');
        return { supply: 0, demand: 0, balance: 0, ratio: 1 };
    }
    
    /**
     * Calculate demographics breakdown
     * Now delegates to server-side calculation with fallback
     */
    async calculateDemographics(totalPopulation) {
        // Try server-side calculation first
        if (this.game.economicAPI) {
            try {
                const serverResult = await this.game.economicAPI.getDemographics(totalPopulation);
                if (serverResult) {
                    return serverResult;
                }
            } catch (error) {
                console.error('Server demographics calculation failed, falling back to client:', error);
            }
        }

        // CLIENT-SIDE FALLBACK ELIMINATED - Server-only economics enforced
        console.error('🚫 CLIENT-SIDE FALLBACK BLOCKED: No local demographics calculation allowed');
        throw new Error('Server demographics calculation failed and client fallback disabled - server must be fixed');
    }

    calculateDemographicsLocal(totalPopulation) {
        // Age distribution based on typical demographics
        const children = Math.round(totalPopulation * 0.22); // 22% children
        const adults = Math.round(totalPopulation * 0.65);   // 65% adults
        const seniors = totalPopulation - children - adults; // Remaining are seniors

        // Labor force is typically 80% of adult population (adults who can work)
        const laborForce = Math.round(adults * 0.80);

        return {
            children: Math.max(0, children),
            adults: Math.max(0, adults),
            seniors: Math.max(0, seniors),
            laborForce: Math.max(0, laborForce),
            total: totalPopulation
        };
    }
    
    /**
     * Get economic statistics for display
     */
    getEconomicStats() {
        return {
            playerEconomy: this.playerEconomy,
            marketState: this.marketState,
            totalWealth: 0, // ELIMINATED: Client-side wealth calculation blocked
            cashflowBreakdown: this.cache.cashflowBreakdown
        };
    }
    
    /**
     * Get market dashboard data for the dev tool
     */
    getMarketDashboardData() {
        return {
            supply: this.marketState.supply,
            demand: this.marketState.demand,
            balance: this.marketState.balance,
            multipliers: this.marketState.multipliers,
            elasticity: this.elasticity,
            playerCashflow: this.playerEconomy.dailyCashflow
        };
    }
    
    /**
     * Update market dashboard display
     */
    updateMarketDashboard() {
        const dashboardData = this.getMarketDashboardData();
        
        // Update energy stats
        this.updateMarketStat('energy', dashboardData);
        this.updateMarketStat('food', dashboardData);
        this.updateMarketStat('housing', dashboardData);
        this.updateMarketStat('jobs', dashboardData);
        
        // Update multiplier displays
        Object.entries(dashboardData.multipliers).forEach(([resource, multiplier]) => {
            const multiplierEl = this.domCache.multipliers[resource];
            if (multiplierEl) {
                multiplierEl.textContent = `${multiplier.toFixed(2)}x`;
                
                // Color code multipliers
                let color = '#42B96E'; // Green for normal
                if (multiplier < 0.8) color = '#f44336'; // Red for low
                else if (multiplier > 1.2) color = '#ff9800'; // Orange for high
                
                multiplierEl.style.color = color;
            }
        });
        
        // Update cashflow
        const cashflowEl = this.domCache.cashflow;
        if (cashflowEl) {
            const cashflow = dashboardData.playerCashflow;
            cashflowEl.textContent = `${cashflow >= 0 ? '+' : ''}${cashflow.toFixed(2)}/day`;
            cashflowEl.style.color = cashflow >= 0 ? '#42B96E' : '#f44336';
        }
    }
    
    /**
     * Update a single market stat in the dashboard
     */
    updateMarketStat(resource, data) {
        const supply = data.supply[resource] || 0;
        const demand = data.demand[resource] || 0;
        const balance = data.balance[resource] || 0;
        
        const statElements = this.domCache.marketStats[resource];
        if (!statElements) return;

        // Update supply
        const supplyEl = statElements.supply;
        if (supplyEl) supplyEl.textContent = supply.toFixed(1);
        
        // Update demand
        const demandEl = statElements.demand;
        if (demandEl) demandEl.textContent = demand.toFixed(1);
        
        // Update balance with color coding
        const balanceEl = statElements.balance;
        if (balanceEl) {
            balanceEl.textContent = `${balance >= 0 ? '+' : ''}${balance.toFixed(1)}`;
            balanceEl.style.color = balance >= 0 ? '#42B96E' : '#f44336';
        }
    }
    
    /**
     * Calculate comprehensive city vitality including JEFH supply/demand
     */
    calculateCityVitalityLegacy() {
        // DEPRECATED: This legacy client-side calculation has been replaced
        // by server-side authoritative calculation in game.js calculateCityVitality()
        console.warn('⚠️ DEPRECATED: Legacy client-side vitality calculation called - should use server');

        // Check if we can use cached values
        const now = performance.now();
        const cacheAge = now - this.game.vitalityCache.lastCalculated;
        
        
        // Use cache if it's recent and not dirty (refresh every 100ms max)
        if (!this.game.vitalityCache.dirty && cacheAge < 100) {
            // Update vitality from cache
            this.game.vitalitySupply = { ...this.game.vitalityCache.supply };
            this.game.vitalityDemand = { ...this.game.vitalityCache.demand };
            this.game.vitality = { ...this.game.vitalityCache.netVitality };
            return;
        }
        
        
        // ELIMINATED: Direct game state modification blocked
        console.error('🚫 CLIENT-SIDE STATE MODIFICATION BLOCKED: Cannot modify game.vitalitySupply/vitalityDemand/vitality');
        throw new Error('Client-side vitality calculation has been eliminated - use server API');

        // Block all client-side game state modifications
        return;
        
        // First pass: count completed buildings only
        let totalBedrooms = 0;
        let totalJobs = 0;
        let totalEnergySupply = 0;
        let totalEnergyDemand = 0;
        let totalFoodProduction = 0;
        
        // Calculate supply from completed buildings only
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                
                // Only count completed buildings (not under construction)
                const isUnderConstruction = parcel._isUnderConstruction;

                if (parcel.building && !isUnderConstruction) {
                    const building = this.game.buildingManager.getBuildingById(parcel.building);
                    if (building) {
                        // Count bedrooms and jobs
                        const bedrooms = building.population?.bedroomsAdded || 0;
                        const jobs = building.population?.jobsCreated || 0;
                        totalBedrooms += bedrooms;
                        totalJobs += jobs;
                        
                        // Calculate energy - negative energyDemand means supply for utilities
                        const energyDemand = building.resources?.energyDemand || 0;
                        if (energyDemand < 0) {
                            // Negative demand = energy producer (solar, coal plant)
                            totalEnergySupply += Math.abs(energyDemand);
                            if (building.name?.includes('Coal') || building.name?.includes('Solar')) {
                            }
                        } else {
                            totalEnergyDemand += energyDemand;
                        }
                        
                        // Food production
                        totalFoodProduction += building.resources?.foodProduction || 0;
                    }
                }
            }
        }
        
        // Use single source of truth for population
        const population = this.game.calculatePopulation(); // Returns total population directly
        
        // ENERGY: Supply from power plants, demand from all buildings
        this.game.vitalitySupply.ENERGY = totalEnergySupply;
        this.game.vitalityDemand.ENERGY = totalEnergyDemand;
        
        if (totalEnergySupply > 0) {
        }
        
        // FOOD: Supply from farms/markets, demand = 3 per person per day
        this.game.vitalitySupply.FOOD = totalFoodProduction;
        this.game.vitalityDemand.FOOD = population * 3; // 3 food per person per day
        
        // HOUSING: Supply = bedrooms, demand based on population (people need homes)
        this.game.vitalitySupply.HOUSING = totalBedrooms;
        this.game.vitalityDemand.HOUSING = population / 2; // 2 people per bedroom (population needs housing)
        
        // JOBS: Supply = jobs created, demand based on working-age population
        this.game.vitalitySupply.JOBS = totalJobs;
        this.game.vitalityDemand.JOBS = population * 0.6; // 60% of population wants employment
        
        // Calculate soft metrics (livability) from completed buildings
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                
                // Only count completed buildings
                const isUnderConstruction = parcel._isUnderConstruction;
                
                if (parcel.building && !isUnderConstruction) {
                    const building = this.game.buildingManager.getBuildingById(parcel.building);
                    if (building && building.livability) {
                        // Process CARENS livability impacts using new JSON format
                        const carensMetrics = ['safety', 'culture', 'affordability', 'resilience', 'environment', 'noise'];

                        carensMetrics.forEach(domain => {
                            const livabilityData = building.livability[domain];
                            if (livabilityData && typeof livabilityData.impact === 'number') {
                                const impact = livabilityData.impact;
                                const domainUpper = domain.toUpperCase();

                                if (impact > 0) {
                                    this.game.vitalitySupply[domainUpper] = (this.game.vitalitySupply[domainUpper] || 0) + impact;
                                } else if (impact < 0) {
                                    this.game.vitalityDemand[domainUpper] = (this.game.vitalityDemand[domainUpper] || 0) + Math.abs(impact);
                                }
                            }
                        });
                    }
                    
                    // Add amenity impacts
                    if (parcel.amenities) {
                        parcel.amenities.forEach(amenity => {
                        const amenityImpacts = this.game.getAmenityImpacts(amenity);
                        Object.keys(amenityImpacts).forEach(domain => {
                            const impact = amenityImpacts[domain];
                            if (impact > 0) {
                                this.game.vitalitySupply[domain] += impact;
                            } else if (impact < 0) {
                                this.game.vitalityDemand[domain] += Math.abs(impact);
                            }
                        });
                        });
                    }
                }
            }
        }
        
        // Calculate net vitality (supply - demand)
        Object.keys(this.game.vitality).forEach(domain => {
            this.game.vitality[domain] = this.game.vitalitySupply[domain] - this.game.vitalityDemand[domain];
        });
        
        // Update cache with calculated values
        this.game.vitalityCache.supply = { ...this.game.vitalitySupply };
        this.game.vitalityCache.demand = { ...this.game.vitalityDemand };
        this.game.vitalityCache.netVitality = { ...this.game.vitality };
        this.game.vitalityCache.lastCalculated = now;
        this.game.vitalityCache.dirty = false;
        this.game.vitalityCache.dirtyBuildings.clear();
        
        // Building efficiency tracking and JEFH satisfaction calculation
        this.game.buildingEfficiencies.clear();
        
        // Build transport network for JEFH calculations
        const transportNetwork = this.game.buildTransportNetwork();
        
        // Step 1: Initialize building efficiency tracking
        const buildingDemands = [];
        let buildingsFound = 0;
        let parcelsWithBuildings = 0;
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel.building) continue;


                // Skip buildings under construction for efficiency calculations
                const isUnderConstruction = parcel._isUnderConstruction;

                if (isUnderConstruction) {
                    // Don't skip - buildings under construction still create demand
                }

                parcelsWithBuildings++;
                const building = this.game.buildingManager.getBuildingById(parcel.building);
                if (!building) {
                    console.warn(`⚠️ Parcel at ${row},${col} has building ID '${parcel.building}' but building not found in manager`);
                    continue;
                }
                
                buildingsFound++;

                const key = `${row},${col}`;
                this.game.buildingEfficiencies.set(key, {
                    row, col,
                    building: building.name,
                    category: building.category,
                    needs: {}
                });
                
                // Create demand points for JEFH resources
                if (this.game.buildingCategories.normalize(building.category) === 'housing') {
                    const residents = building.resources?.housingProvided || 0;
                    if (residents > 0) {
                        // Housing demands jobs and food
                        buildingDemands.push({
                            row, col, building: building.name,
                            resource: 'jobs', amount: residents * 0.6
                        });
                        buildingDemands.push({
                            row, col, building: building.name,
                            resource: 'food', amount: residents * 3
                        });
                        // Housing demands energy (use actual building energy demand)
                        const energyDemand = building.resources?.energyDemand || 0;
                        if (energyDemand > 0) { // Only positive values are actual demand
                            buildingDemands.push({
                                row, col, building: building.name,
                                resource: 'energy', amount: energyDemand
                            });
                        }
                    }
                } else if (this.game.buildingCategories.normalize(building.category) === 'commercial') {
                    const jobs = building.population?.jobsCreated || building.jobs || 0;
                    if (jobs > 0) {
                        // Commercial buildings need workers (housing provides workers)
                        buildingDemands.push({
                            row, col, building: building.name,
                            resource: 'housing', amount: jobs // 1 worker per job
                        });
                        // Commercial buildings demand energy (use actual building energy demand)
                        const energyDemand = building.resources?.energyDemand || 0;
                        if (energyDemand > 0) { // Only positive values are actual demand
                            buildingDemands.push({
                                row, col, building: building.name,
                                resource: 'energy', amount: energyDemand
                            });
                        }
                    }
                } else if (this.game.buildingCategories.normalize(building.category) === 'education') {
                    const jobs = building.population?.jobsCreated || 0;
                    if (jobs > 0) {
                        // Education buildings need workers too
                        buildingDemands.push({
                            row, col, building: building.name,
                            resource: 'housing', amount: jobs
                        });
                        // Education buildings demand energy - use actual energyDemand from building data
                        const energyDemand = building.resources?.energyDemand || 0;
                        if (energyDemand > 0) {
                            buildingDemands.push({
                                row, col, building: building.name,
                                resource: 'energy', amount: energyDemand
                            });
                        }
                    }
                }
                
            }
        }
        
        // Step 2: Calculate satisfaction using proper supply allocation
        // Group demands by resource type for allocation
        const demandsByResource = {};
        buildingDemands.forEach(demand => {
            if (!demandsByResource[demand.resource]) {
                demandsByResource[demand.resource] = [];
            }
            demandsByResource[demand.resource].push(demand);
        });


        // Process each resource type
        Object.keys(demandsByResource).forEach(resourceType => {
            const demands = demandsByResource[resourceType];
            
            // Find all supply sources for this resource
            const supplySources = [];
            for (let sRow = 0; sRow < this.game.gridSize; sRow++) {
                for (let sCol = 0; sCol < this.game.gridSize; sCol++) {
                    const supplyParcel = this.game.grid[sRow][sCol];
                    if (!supplyParcel.building) continue;
                    
                    // Skip buildings under construction
                    const isUnderConstruction = supplyParcel._isUnderConstruction;
                    if (isUnderConstruction) continue;
                    
                    const supplyBuilding = this.game.buildingManager.getBuildingById(supplyParcel.building);
                    if (!supplyBuilding) continue;
                    
                    let supply = 0;
                    if (resourceType === 'jobs' && supplyBuilding.population?.jobsCreated) {
                        supply = supplyBuilding.population.jobsCreated;
                    } else if (resourceType === 'food' && supplyBuilding.resources?.foodProduction) {
                        supply = supplyBuilding.resources.foodProduction;
                    } else if (resourceType === 'housing' && supplyBuilding.population?.bedroomsAdded) {
                        // Housing supplies workers (0.6 workers per bedroom)
                        supply = supplyBuilding.population.bedroomsAdded * 0.6;
                    } else if (resourceType === 'energy') {
                        // Add energy supply check for power plants/utilities
                        // Negative energyDemand means energy production
                        const energyDemand = supplyBuilding.resources?.energyDemand || 0;
                        supply = energyDemand < 0 ? Math.abs(energyDemand) : 0;
                    }
                    
                    if (supply > 0) {
                        supplySources.push({
                            row: sRow, col: sCol,
                            building: supplyBuilding.name,
                            supply: supply,
                            remainingSupply: supply // Track remaining supply for allocation
                        });
                    }
                }
            }
            
            // Allocate supply to demands based on strict adjacency and connectivity
            demands.forEach(demand => {
                let fulfilledDemand = 0;

                // Calculate accessibility to each supply source with strict connectivity rules
                const accessibleSources = supplySources.map(source => {
                    const effectiveDistance = this.game.calculateEffectiveDistance(
                        demand.row, demand.col,
                        source.row, source.col,
                        transportNetwork
                    );

                    // Strict connectivity rules for resource access
                    let accessible = false;
                    let accessibilityType = 'none';

                    // 1. Immediate adjacency (8 neighbors) - always accessible
                    if (effectiveDistance === 1) {
                        accessible = true;
                        accessibilityType = 'adjacent';
                    }
                    // 2. Road connectivity - accessible if connected by roads (distance > 1 but not 999)
                    else if (effectiveDistance > 1 && effectiveDistance < 999) {
                        accessible = true;
                        accessibilityType = 'road';
                    }
                    // 3. No connectivity (distance = 999) - not accessible

                    return {
                        ...source,
                        distance: effectiveDistance,
                        accessible: accessible,
                        accessibilityType: accessibilityType
                    };
                }).filter(source => source.accessible)
                  .sort((a, b) => {
                      // Priority: adjacent first, then by distance
                      if (a.accessibilityType === 'adjacent' && b.accessibilityType !== 'adjacent') return -1;
                      if (b.accessibilityType === 'adjacent' && a.accessibilityType !== 'adjacent') return 1;
                      return a.distance - b.distance;
                  });
                
                // Allocate from closest sources first with distance-based efficiency
                for (const source of accessibleSources) {
                    if (fulfilledDemand >= demand.amount) break;

                    const neededAmount = demand.amount - fulfilledDemand;
                    let allocatedAmount = Math.min(neededAmount, source.remainingSupply);

                    // Apply transport capacity-based efficiency for road-connected sources
                    if (source.accessibilityType === 'road' && source.distance > 1) {
                        // Use transport capacity system if available, otherwise fall back to distance-based
                        let transportEfficiency = 1.0;

                        // Transport capacity system removed - using distance-based efficiency
                        transportEfficiency = Math.max(0.5, 1.0 - (source.distance - 1) * 0.1);

                        allocatedAmount = Math.floor(allocatedAmount * transportEfficiency);
                    }

                    if (allocatedAmount > 0) {
                        fulfilledDemand += allocatedAmount;
                        source.remainingSupply -= allocatedAmount;

                    }
                }
                
                // Calculate satisfaction ratio
                const satisfaction = Math.min(1.0, fulfilledDemand / demand.amount);
                
                // Store in building efficiency data with connectivity analysis
                const key = `${demand.row},${demand.col}`;
                const efficiencyData = this.game.buildingEfficiencies.get(key);
                if (efficiencyData) {
                    // Analyze why satisfaction is low
                    const connectivityIssue = satisfaction < 1.0 && accessibleSources.length === 0;
                    const supplyShortage = satisfaction < 1.0 && accessibleSources.length > 0;

                    efficiencyData.needs[resourceType] = {
                        satisfaction: satisfaction,
                        demand: demand.amount,
                        fulfilled: fulfilledDemand,
                        accessibleSources: accessibleSources.length,
                        connectivityIssue: connectivityIssue,
                        supplyShortage: supplyShortage
                    };

                    if (connectivityIssue) {
                    } else if (supplyShortage) {
                    } else {
                    }
                }
            });
            
            // Log remaining unused supply
            const totalRemainingSupply = supplySources.reduce((sum, source) => sum + source.remainingSupply, 0);
            if (totalRemainingSupply > 0) {
            }
        });
        
        
        // Calculate city satisfaction based on met needs
        this.calculateCitySatisfaction();
    }
    
    /**
     * Calculate city satisfaction metrics
     */
    calculateCitySatisfaction() {
        const demographics = this.game.demographics || {};
        
        // Calculate satisfaction scores for each domain (0-1 scale)
        const satisfaction = {};
        
        // Employment: Target 60%+ employment rate
        satisfaction.employment = Math.min(1, (demographics.employmentRate || 0) / 0.6);
        
        // Education: Target 90%+ school enrollment
        satisfaction.education = Math.min(1, (demographics.schoolEnrollmentRate || 0) / 0.9);
        
        // Housing: Based on JEEFHH supply/demand balance
        const housingRatio = this.game.vitalitySupply.HOUSING / Math.max(1, this.game.vitalityDemand.HOUSING);
        satisfaction.housing = housingRatio >= 1.0 ? 1.0 : Math.max(0, housingRatio);
        
        // Healthcare: Based on JEEFHH supply/demand balance
        const healthcareRatio = this.game.vitalitySupply.HEALTHCARE / Math.max(1, this.game.vitalityDemand.HEALTHCARE);
        satisfaction.healthcare = healthcareRatio >= 1.0 ? 1.0 : Math.max(0, healthcareRatio);

        // Culture: Based on CARENS supply/demand balance
        const cultureSupply = this.game.vitalitySupply.CULTURE || 0;
        const cultureDemand = this.game.vitalityDemand.CULTURE || 0;
        const cultureRatio = cultureSupply / Math.max(1, cultureDemand);
        satisfaction.culture = cultureRatio >= 1.0 ? 1.0 : Math.max(0.5, cultureRatio);
        
        // Overall satisfaction (weighted average)
        const weights = {
            employment: 0.3,
            education: 0.25,
            housing: 0.2,
            healthcare: 0.15,
            culture: 0.1
        };
        
        let overallSatisfaction = 0;
        let totalWeight = 0;
        Object.keys(satisfaction).forEach(key => {
            if (weights[key]) {
                overallSatisfaction += satisfaction[key] * weights[key];
                totalWeight += weights[key];
            }
        });
        
        this.game.citySatisfaction = {
            ...satisfaction,
            overall: totalWeight > 0 ? overallSatisfaction / totalWeight : 0
        };
        
        // Apply satisfaction effects to revenue (in processDailyCashflow)
        return this.game.citySatisfaction;
    }
    
    /**
     * Calculate land value for a specific parcel
     */
    async calculateLandValue(row, col) {
        // Try server-side calculation first
        if (this.game.economicAPI) {
            try {
                const serverResult = await this.game.economicAPI.getLandValue(this.game, row, col);
                if (serverResult && serverResult.landValue !== undefined) {
                    // Cache the server result locally too
                    const cacheKey = `${row}-${col}`;
                    this.game.landValueCache.set(cacheKey, serverResult.landValue);
                    return serverResult.landValue;
                }
            } catch (error) {
                console.error('Server land value calculation failed, falling back to client:', error);
            }
        }

        // CLIENT-SIDE FALLBACK ELIMINATED - Server-only economics enforced
        console.error('🚫 CLIENT-SIDE FALLBACK BLOCKED: No local land value calculation allowed');
        throw new Error('Server land value calculation failed and client fallback disabled - server must be fixed');
    }

    calculateLandValueLocal(row, col) {
        // Check cache first
        const cacheKey = `${row}-${col}`;
        if (this.game.landValueCache.has(cacheKey)) {
            return this.game.landValueCache.get(cacheKey);
        }

        const basePrice = this.game.getParcelPrice(row, col);
        const parcel = this.game.grid[row][col];

        // Get residential capacity of this parcel (how many people it can house)
        let residentialCapacity = 0;
        if (parcel.building) {
            const building = this.game.buildingManager.getBuildingById(parcel.building);
            if (building && this.game.buildingCategories.normalize(building.category) === 'housing') {
                residentialCapacity = building.bedrooms || 0;
            }
        }

        // Calculate accessibility scores for each domain
        const accessScores = this.calculateAccessibilityScoresLocal(row, col);

        // Base demand multiplier from accessibility (0.5 to 2.0)
        let accessibilityMultiplier = 0.5;
        const domains = ['food', 'energy', 'jobs', 'healthcare', 'education', 'transport', 'culture', 'safety'];
        domains.forEach(domain => {
            if (accessScores[domain]) {
                // Each domain can add up to 0.1875 to multiplier (8 domains * 0.1875 = 1.5 max boost)
                accessibilityMultiplier += Math.min(accessScores[domain], 1.0) * 0.1875;
            }
        });

        // Population-weighted demand multiplier
        // High-density housing in high-accessibility areas = maximum land value
        let demandMultiplier = 1.0;
        if (residentialCapacity > 0) {
            // Residential parcels gain value based on capacity * accessibility
            demandMultiplier = 1.0 + (residentialCapacity / 10) * (accessibilityMultiplier - 0.5);
        } else if (parcel.building) {
            // Non-residential buildings gain value from serving nearby population
            const nearbyPopulation = this.game.getNearbyPopulation(row, col, 3);
            demandMultiplier = 1.0 + (nearbyPopulation / 50) * 0.5;
        }

        // Network effects - developed neighbors still matter but less
        const developedNeighbors = this.game.getAdjacentDevelopedParcels(row, col);
        const networkMultiplier = 1.0 + (developedNeighbors * 0.05); // Only 5% per neighbor now

        // Overall city prosperity still affects all land values
        const totalVitality = Object.values(this.game.vitality).reduce((sum, val) => sum + Math.max(0, val), 0);
        const prosperityBonus = Math.min(totalVitality / 500, 0.3); // Reduced to 30% max

        // Combine all multipliers
        const totalMultiplier = accessibilityMultiplier * demandMultiplier * networkMultiplier * (1 + prosperityBonus);

        // Ensure reasonable bounds (0.25x to 5x base price)
        const finalMultiplier = Math.max(0.25, Math.min(5.0, totalMultiplier));

        const landValue = Math.round(basePrice * finalMultiplier);

        // Cache the result
        this.game.landValueCache.set(cacheKey, landValue);

        return landValue;
    }
    
    /**
     * Calculate building efficiency percentage based on JEFH needs satisfaction
     */
    calculateBuildingEfficiencyPercentage(row, col) {
        const parcel = this.game.grid[row]?.[col];
        if (!parcel?.building) return null;
        
        const building = this.game.buildingManager.getBuildingById(parcel.building);
        if (!building) return null;
        
        // Get building needs from definition
        const needs = [];
        const needsMap = new Map();
        
        // Check for workers need
        if (building.population?.populationRequired > 0) {
            const need = { 
                type: 'workers', 
                required: building.population.populationRequired,
                name: 'Workers'
            };
            needs.push(need);
            needsMap.set('workers', need);
        }
        
        // Check for energy need
        if (building.resources?.energyDemand > 0) {
            const need = {
                type: 'energy',
                required: building.resources.energyDemand,
                name: 'Energy'
            };
            needs.push(need);
            needsMap.set('energy', need);
        }
        
        // Check for food need (buildings don't have food demand, only energy demand and food production)
        // Note: Current building system doesn't include food demand, only energy demand
        
        // If no needs, building is 100% efficient
        if (needs.length === 0) return null;
        
        // Get efficiency data from JEFH system
        const key = `${row},${col}`;
        const efficiencyData = this.game.buildingEfficiencies?.get(key);
        
        // Calculate weighted efficiency percentage
        let totalEfficiency = 0;
        const unsatisfiedNeeds = [];
        const allNeeds = []; // Track all needs with satisfaction
        
        // Equal weight for each type of need
        const weightPerNeed = 100 / needs.length;
        
        needs.forEach(need => {
            let satisfaction = 0;
            let connectivityIssue = false;
            let supplyShortage = false;

            // Map JEFH categories to our needs
            let jefhCategory = need.type;
            if (need.type === 'workers') {
                // Workers are tracked as 'housing' in JEFH for commercial/education buildings
                const isWorkplace = this.game.buildingCategories.normalize(building.category) === 'commercial' ||
                                  building.category === 'education';
                jefhCategory = isWorkplace ? 'housing' : 'jobs';
            }

            // Get satisfaction from JEFH data
            if (efficiencyData?.needs?.[jefhCategory]) {
                const jefhNeed = efficiencyData.needs[jefhCategory];
                satisfaction = jefhNeed.satisfaction || 0;
                connectivityIssue = jefhNeed.connectivityIssue || false;
                supplyShortage = jefhNeed.supplyShortage || false;

                // For partial satisfaction, scale by how much is fulfilled
                if (jefhNeed.demand && jefhNeed.fulfilled !== undefined) {
                    const partialSatisfaction = jefhNeed.fulfilled / jefhNeed.demand;
                    satisfaction = Math.min(1, partialSatisfaction);
                }
            }

            // Add weighted contribution to total efficiency
            totalEfficiency += satisfaction * weightPerNeed;

            // Track all needs with satisfaction and connectivity status
            allNeeds.push({
                name: need.name,
                satisfaction: satisfaction,
                connectivityIssue: connectivityIssue,
                supplyShortage: supplyShortage
            });

            // Track unsatisfied needs with reasons
            if (satisfaction < 1) {
                unsatisfiedNeeds.push({
                    name: need.name,
                    satisfaction: satisfaction,
                    deficit: need.required * (1 - satisfaction),
                    reason: connectivityIssue ? 'No road/adjacent access' :
                           supplyShortage ? 'Insufficient supply' : 'Unknown'
                });
            }
        });
        
        return {
            percentage: Math.max(0, Math.min(100, totalEfficiency)),
            unsatisfiedNeeds: unsatisfiedNeeds.sort((a, b) => a.satisfaction - b.satisfaction),
            allNeeds: allNeeds
        };
    }

    /**
     * Build cashflow breakdown from cached stats for UI
     * Moved from game.js for proper modularity
     */
    buildCashflowBreakdown() {
        this.game.cashflowBreakdown = [];

        // Convert building stats to properly formatted breakdown for DCF table
        this.game.economicCache.buildingStats.forEach((stats, key) => {
            const [row, col] = key.split('-').map(Number);
            const parcel = this.game.grid[row][col];

            // Get building information - fallback to buildings data if buildingManager fails
            let building = parcel.building ? this.game.buildingManager?.getBuildingById(parcel.building) : null;

            // Fallback: search directly in the buildings data if buildingManager lookup fails
            if (!building && parcel.building) {
                // Try to find building in buildings-data.json structure
                if (this.game.buildings) {
                    for (const category of Object.values(this.game.buildings)) {
                        if (Array.isArray(category)) {
                            building = category.find(b => b.id === parcel.building);
                            if (building) break;
                        }
                    }
                }
            }

            const buildingName = building?.name || 'Vacant Land';
            const category = building?.category || 'Land';

            // Calculate efficiency percentage for display
            const efficiency = stats.performance?.efficiency || stats.efficiency || 1.0;
            const efficiencyPercent = Math.round(efficiency * 100);

            // Format for DCF table
            this.game.cashflowBreakdown.push({
                building: buildingName,
                category: category,
                location: `(${row},${col})`,
                revenue: stats.revenue || 0,
                maintenance: stats.maintenance || 0,
                lvt: stats.lvt || 0,
                net: (stats.revenue || 0) - (stats.maintenance || 0) - (stats.lvt || 0),
                efficiency: `${efficiencyPercent}%`,
                condition: Math.round((1 - (stats.decay || parcel.decay || 0)) * 100) + '%',
                age: Math.floor(stats.age || parcel.buildingAge || 0) + ' days',
                // Additional details for tooltip or expanded view
                details: building ? `${building.name} at (${row},${col})` : `Vacant land at (${row},${col})`,
                performance: stats.performance,
                decay: stats.decay,
                rawAge: stats.age
            });
        });

        // Add transit system financials if available
        if (this.game.transitFinancials && (this.game.transitFinancials.dailyRevenue > 0 || this.game.transitFinancials.dailyCosts > 0)) {
            this.game.cashflowBreakdown.push({
                building: 'Transit System',
                category: 'Transportation',
                location: 'City-wide',
                revenue: this.game.transitFinancials.dailyRevenue,
                maintenance: this.game.transitFinancials.dailyCosts,
                lvt: 0,
                net: this.game.transitFinancials.dailyProfit,
                details: `${this.game.transitFinancials.activeRoutes} routes, ${this.game.transitFinancials.totalStops} stops`
            });
        }
    }

    /**
     * Process daily cashflow with comprehensive economic calculations
     * Moved from game.js for proper modularity
     */
    processDailyCashflow() {
        let dailyRevenue = 0;
        let dailyMaintenance = 0;
        let dailyLVT = 0;

        // Calculate and apply supply/demand effects first
        this.game.applySupplyDemandEffects();

        // Update player parcel tracking and mark aging buildings as dirty
        this.game.updatePlayerParcelsAndAging();

        // Clear performance cache to force daily recalculation (handles decay effects)
        if (this.game.performanceEngine) {
            this.game.performanceEngine.clearCache();
        }

        // Process only dirty/changed buildings + new calculations
        this.updateEconomicCache();

        // Sum cached values for totals
        this.game.economicCache.buildingStats.forEach(stats => {
            dailyRevenue += stats.revenue;
            dailyMaintenance += stats.maintenance;
            dailyLVT += stats.lvt;
        });

        // Add road maintenance costs (until LVT funds infrastructure budget)
        const roadMaintenance = this.calculateRoadMaintenance();
        dailyMaintenance += roadMaintenance;

        // Update transit system (revenue, costs, maintenance, decay)
        if (this.game.mobilityLayer && this.game.mobilityLayer.updateTransitSystem) {
            this.game.mobilityLayer.updateTransitSystem();
        }

        // Build UI breakdown from cache
        this.buildCashflowBreakdown();

        // Apply cashflow (preserve full precision)
        const netCashflow = dailyRevenue - dailyMaintenance - dailyLVT;
        this.game.playerCash += netCashflow;

        // Add daily LVT to governance budget
        if (dailyLVT > 0 && this.game.governanceSystem) {
            this.game.governanceSystem.addFunds(dailyLVT, 'LVT revenue');
        }

        // Store daily totals for UI
        this.game.dailyCashflowTotals = {
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            lvt: dailyLVT,
            netCashflow
        };


        // Note: Cash bounds checking now handled by CashManager

        // Clear dirty flags after processing
        this.game.economicCache.dirty.clear();
        this.game.economicCache.lastUpdate = performance.now();

        return {
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            lvt: dailyLVT,
            netCashflow
        };
    }

    /**
     * Update economic cache for dirty buildings
     * Moved from game.js for proper modularity
     */
    updateEconomicCache() {
        this.game.economicCache.dirty.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const parcel = this.game.grid[row][col];

            if (this.game.isCurrentPlayer(parcel.owner)) {
                // Use new performance engine for revenue if available
                let stats;
                if (this.game.performanceEngine && parcel.building && !parcel._isUnderConstruction) {
                    const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
                    if (performanceInfo) {
                        // Get LVT - use dynamic rate from governance system
                        const annualLVTRate = this.game.governanceSystem ? this.game.governanceSystem.getCurrentLVTRate() : 0.50;
                        const dailyLVTRate = annualLVTRate / 365;
                        const landTax = (parcel.landValue?.paidPrice || 0) * dailyLVTRate;

                        // Get building name from building manager
                        const building = this.game.buildingManager.getBuildingById(parcel.building);
                        const buildingName = building?.name || 'Unknown';

                        // Use maintenance from performance engine (includes decay effects)
                        stats = {
                            revenue: performanceInfo.actualRevenue,
                            maintenance: performanceInfo.maintenance,
                            lvt: landTax,
                            netIncome: performanceInfo.actualRevenue - performanceInfo.maintenance - landTax,
                            buildingName: buildingName,
                            performance: performanceInfo.performance,
                            decay: performanceInfo.decay,
                            age: performanceInfo.age
                        };
                    } else {
                        stats = this.game.buildingSystem.calculateBuildingEconomics(parcel, row, col);
                    }
                } else {
                    // Use old system for vacant land or buildings under construction
                    stats = this.game.buildingSystem.calculateBuildingEconomics(parcel, row, col);
                }
                this.game.economicCache.buildingStats.set(key, stats);
            } else {
                // Remove if no longer player-owned
                this.game.economicCache.buildingStats.delete(key);
            }
        });

        // Remove any cached buildings that are no longer player parcels
        this.game.economicCache.buildingStats.forEach((stats, key) => {
            if (!this.game.economicCache.playerParcels.has(key)) {
                this.game.economicCache.buildingStats.delete(key);
            }
        });
    }


    /**
     * Calculate population with comprehensive demographics
     * Moved from game.js for proper modularity (consolidating duplicate method)
     */
    calculatePopulation() {
        let totalBedrooms = 0;
        let totalJobs = 0;
        let schoolCapacity = 0;

        // Get bedroom counts and jobs from ALL COMPLETED buildings (city-wide)
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];

                // Check if building is completed (not under construction)
                const isUnderConstruction = parcel._isUnderConstruction;

                // Count ALL owned buildings in the city, not just current player's
                if (parcel.owner && parcel.owner !== 'unclaimed' && parcel.building && !isUnderConstruction) {
                    const building = this.game.buildingManager.getBuildingById(parcel.building);
                    if (building && building.population) {
                        totalBedrooms += building.population.bedroomsAdded || 0;
                        totalJobs += building.population.jobsCreated || 0;
                    }

                    // Count school capacity
                    if (building && building.category === 'education') {
                        // Elementary: 200 students, High School: 400, University: 600
                        if (building.id === 'elementary_school') schoolCapacity += 200;
                        else if (building.id === 'high_school') schoolCapacity += 400;
                        else if (building.id === 'university') schoolCapacity += 600;
                    }
                }
            }
        }

        // Calculate detailed population demographics (STANDARDIZED: 2 people per bedroom)
        const totalPopulation = totalBedrooms * 2; // Standardized ratio

        const adults = Math.floor(totalBedrooms * 1.5);  // ~1.5 adults per bedroom
        const children = Math.floor(totalBedrooms * 0.7); // ~0.7 children per bedroom
        const workingAge = Math.floor(adults * 0.8);     // 80% of adults are working age
        const schoolAge = Math.floor(children * 0.9);    // 90% of children need school

        // Store detailed demographics for use elsewhere
        this.game.demographics = {
            total: totalPopulation,
            adults,
            children,
            workingAge,
            schoolAge,
            totalJobs,
            schoolCapacity,
            employmentRate: workingAge > 0 ? (totalJobs / workingAge) : 0,
            schoolEnrollmentRate: schoolAge > 0 ? (schoolCapacity / schoolAge) : 1
        };

        return totalPopulation;
    }

    /**
     * Debug method to show connectivity analysis for a specific building
     */
    debugBuildingConnectivity(row, col) {
        const parcel = this.game.grid[row]?.[col];
        if (!parcel?.building) {
            return;
        }

        const building = this.game.buildingManager.getBuildingById(parcel.building);
        if (!building) {
            return;
        }


        const transportNetwork = this.game.buildTransportNetwork();

        // Check adjacency to other buildings
        const adjacentBuildings = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const ar = row + dr;
                const ac = col + dc;
                if (ar >= 0 && ar < this.game.gridSize && ac >= 0 && ac < this.game.gridSize) {
                    const adjParcel = this.game.grid[ar][ac];
                    if (adjParcel?.building) {
                        const adjBuilding = this.game.buildingManager.getBuildingById(adjParcel.building);
                        if (adjBuilding) {
                            adjacentBuildings.push({
                                name: adjBuilding.name,
                                category: adjBuilding.category,
                                row: ar,
                                col: ac
                            });
                        }
                    }
                }
            }
        }


        // Check road connectivity to nearby buildings
        const roadConnectedBuildings = [];
        for (let r = Math.max(0, row - 5); r < Math.min(this.game.gridSize, row + 6); r++) {
            for (let c = Math.max(0, col - 5); c < Math.min(this.game.gridSize, col + 6); c++) {
                if (r === row && c === col) continue;
                const testParcel = this.game.grid[r][c];
                if (testParcel?.building) {
                    const distance = this.game.calculateEffectiveDistance(row, col, r, c, transportNetwork);
                    if (distance > 1 && distance < 999) {
                        const testBuilding = this.game.buildingManager.getBuildingById(testParcel.building);
                        if (testBuilding) {
                            roadConnectedBuildings.push({
                                name: testBuilding.name,
                                category: testBuilding.category,
                                row: r,
                                col: c,
                                distance: distance
                            });
                        }
                    }
                }
            }
        }


        // Show building efficiency data
        const key = `${row},${col}`;
        const efficiencyData = this.game.buildingEfficiencies?.get(key);
        if (efficiencyData) {
        } else {
        }
    }

    /**
     * Reset economic state
     */
    reset() {
        Object.keys(this.marketState.supply).forEach(key => {
            this.marketState.supply[key] = 0;
            this.marketState.demand[key] = 0;
            this.marketState.balance[key] = 0;
            this.marketState.multipliers[key] = 1.0;
        });
        
        this.playerEconomy = {
            dailyCashflow: 0,
            buildingRevenue: 0,
            buildingMaintenance: 0,
            landValueTax: 0,
            lastUpdate: 0
        };
        
        this.cache.supplyDemand.clear();
        this.cache.cashflowBreakdown = null;
    }

    /**
     * Calculate accessibility scores for a parcel based on nearby amenities
     * @param {number} row - Row position of the parcel
     * @param {number} col - Column position of the parcel
     * @returns {Object} Accessibility scores for different amenities
     */
    async calculateAccessibilityScores(row, col) {
        // Try server-side calculation first
        if (this.game.economicAPI) {
            try {
                const serverResult = await this.game.economicAPI.getAccessibilityScores(this.game, row, col);
                if (serverResult) {
                    // Cache the server result locally too
                    const cacheKey = `accessibility-${row}-${col}`;
                    this.game.accessibilityCache.set(cacheKey, serverResult);
                    return serverResult;
                }
            } catch (error) {
                console.error('Server accessibility calculation failed, falling back to client:', error);
            }
        }

        // CLIENT-SIDE FALLBACK ELIMINATED - Server-only economics enforced
        console.error('🚫 CLIENT-SIDE FALLBACK BLOCKED: No local accessibility calculation allowed');
        throw new Error('Server accessibility calculation failed and client fallback disabled - server must be fixed');
    }

    calculateAccessibilityScoresLocal(row, col) {
        // Check cache first
        const cacheKey = `accessibility-${row}-${col}`;
        if (this.game.accessibilityCache.has(cacheKey)) {
            return this.game.accessibilityCache.get(cacheKey);
        }

        const scores = {
            food: 0,
            energy: 0,
            jobs: 0,
            healthcare: 0,
            education: 0,
            transport: 0,
            culture: 0,
            safety: 0
        };

        // Maximum influence distance for any amenity
        const MAX_DISTANCE = 5;

        // Scan all parcels within influence range
        for (let r = Math.max(0, row - MAX_DISTANCE); r <= Math.min(this.game.gridSize - 1, row + MAX_DISTANCE); r++) {
            for (let c = Math.max(0, col - MAX_DISTANCE); c <= Math.min(this.game.gridSize - 1, col + MAX_DISTANCE); c++) {
                if (r === row && c === col) continue;

                const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
                const parcel = this.game.grid[r][c];

                if (parcel.building) {
                    const building = this.game.buildingManager.getBuildingById(parcel.building);
                    if (!building) continue;

                    // Distance decay function: 1.0 at distance 1, 0.2 at distance 5
                    const influence = Math.max(0, 1.2 - (distance * 0.2));

                    // Food access from commercial buildings with food production
                    if (building.foodProduction && building.foodProduction > 0) {
                        scores.food += (building.foodProduction / 50) * influence;
                    }

                    // Jobs from any building that creates employment
                    if (building.jobs && building.jobs > 0) {
                        scores.jobs += (building.jobs / 20) * influence;
                    }

                    // Healthcare from healthcare category
                    if (building.category === 'healthcare') {
                        scores.healthcare += influence * (building.healthImpact || 10) / 10;
                    }

                    // Education from education category
                    if (building.category === 'education') {
                        scores.education += influence * (building.educationImpact || 10) / 10;
                    }

                    // Transport/mobility from relevant buildings
                    if (building.mobilityImpact && building.mobilityImpact > 0) {
                        scores.transport += (building.mobilityImpact / 10) * influence;
                    }

                    // Culture from culture/recreation categories
                    if (building.category === 'culture' || building.category === 'recreation') {
                        scores.culture += influence * (building.cultureImpact || 10) / 10;
                    }

                    // Safety from civic/emergency buildings
                    if (building.safetyImpact && building.safetyImpact > 0) {
                        scores.safety += (building.safetyImpact / 10) * influence;
                    }

                    // Energy is currently simplified - could expand later
                    if (building.category === 'infrastructure') {
                        scores.energy += influence * 0.5;
                    }
                }
            }
        }

        // Normalize scores to 0-1 range with diminishing returns
        Object.keys(scores).forEach(key => {
            scores[key] = Math.tanh(scores[key] * 0.5); // Smooth curve that caps around 1.0
        });

        // Cache the result
        this.game.accessibilityCache.set(cacheKey, scores);

        return scores;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicEngine;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
    window.EconomicEngine = EconomicEngine;
}