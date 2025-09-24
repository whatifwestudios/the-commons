/**
 * Server-Side Economic Engine
 * Authoritative economic calculations for The Commons
 * Hybrid fine-grained/coarse-grained API approach
 */

const fs = require('fs');
const path = require('path');
const { BuildingPerformance, PlayerCashflow, MarketState } = require('./economic-types');

class ServerEconomicEngine {
    constructor() {
        this.gameData = {
            grid: {},
            buildings: new Map(),
            economicCache: new Map(),
            lastCalculationTime: 0
        };

        // Load building definitions
        this.buildingDefinitions = new Map();
        this.loadBuildingDefinitions();

        // Economic state
        this.cityStats = {
            totalPopulation: 0,
            totalRevenue: 0,
            totalMaintenance: 0,
            supplyDemand: {
                housing: { supply: 0, demand: 0 },
                jobs: { supply: 0, demand: 0 },
                energy: { supply: 0, demand: 0 },
                food: { supply: 0, demand: 0 }
            }
        };

        // Performance cache with dependencies
        this.cache = {
            buildingPerformance: new Map(),
            cityStats: null,
            supplyDemand: null,
            dependencies: new Map(), // tracks which buildings affect which calculations
            lastUpdate: 0
        };

        // Need types (from client economic-performance.js)
        this.NEED_TYPES = {
            WORKERS: 'workers',
            JOBS: 'jobs',
            ENERGY: 'energy',
            FOOD: 'food'
        };
    }

    /**
     * Load building definitions from client files
     * TODO: Eventually this should be a shared data source
     */
    loadBuildingDefinitions() {
        try {
            // For now, we'll need to parse the buildings.js file or create a data file
            // This is a temporary solution until we have a proper shared data source
            console.log('📋 Loading building definitions...');
            // TODO: Implement building definition loading
        } catch (error) {
            console.error('❌ Failed to load building definitions:', error);
        }
    }

    /**
     * COARSE-GRAINED: Full city economic recalculation
     * Called on major changes: building placement, removal, governance changes
     */
    calculateCityEconomics(gameState) {
        const startTime = Date.now();
        console.log('🏙️ Calculating full city economics...');

        // Update internal game state
        this.updateGameState(gameState);

        // Debug the game state
        // Debug: Game state received
        // Debug: Game state grid processed
        const buildingsInState = Object.entries(gameState.grid || {}).filter(([_, parcel]) => parcel?.building).length;
        // Debug: Processing buildings in game state

        // Clear cache for fresh calculation
        this.invalidateCache();

        // Recalculate city-wide statistics
        const cityStats = this.calculateCityStatistics();
        const supplyDemand = this.calculateCitySupplyDemand();

        // Calculate performance for all buildings
        const buildingPerformances = this.calculateAllBuildingPerformances();

        // Calculate affected transport efficiency
        const transportEfficiency = this.calculateTransportEfficiency();

        // Update cache
        this.cache.cityStats = cityStats;
        this.cache.supplyDemand = supplyDemand;
        this.cache.lastUpdate = Date.now();

        const calculationTime = Date.now() - startTime;
        console.log(`✅ City economics calculated in ${calculationTime}ms`);

        // Debug: Building performances calculated
        buildingPerformances.forEach(building => {
            console.log(`🔍 [DEBUG] Building performance ${building.row},${building.col}:`, building);
        });

        return {
            success: true,
            timestamp: Date.now(),
            calculationTime,
            cityEconomics: {
                ...cityStats,
                supplyDemand,
                transportEfficiency
            },
            vitality: {
                supply: {
                    ENERGY: supplyDemand.energy.supply,
                    FOOD: supplyDemand.food.supply,
                    HOUSING: supplyDemand.housing.supply,
                    JOBS: supplyDemand.jobs.supply
                },
                demand: {
                    ENERGY: supplyDemand.energy.demand,
                    FOOD: supplyDemand.food.demand,
                    HOUSING: supplyDemand.housing.demand,
                    JOBS: supplyDemand.jobs.demand
                }
            },
            affectedBuildings: buildingPerformances,
            cacheInfo: {
                cachedResults: 0,
                freshCalculations: buildingPerformances.length
            }
        };
    }

    /**
     * COARSE-GRAINED: Handle building placement
     * Recalculates city economics efficiently with focused updates
     */
    handleBuildingPlacement(gameState, buildingData) {
        const startTime = Date.now();
        console.log(`🏗️ Processing building placement at ${buildingData.row},${buildingData.col}`);

        // Update game state
        this.updateGameState(gameState);

        // Determine affected areas and buildings
        const affectedBuildings = this.getAffectedBuildings(buildingData.row, buildingData.col);

        // Invalidate cache for affected areas only
        this.invalidateCacheForBuildings(affectedBuildings);

        // Recalculate city statistics
        const cityStats = this.calculateCityStatistics();
        const supplyDemand = this.calculateCitySupplyDemand();

        // Calculate performance for affected buildings only
        const buildingPerformances = this.calculateBuildingPerformances(affectedBuildings);

        // Update cache
        this.cache.cityStats = cityStats;
        this.cache.supplyDemand = supplyDemand;
        this.cache.lastUpdate = Date.now();

        const calculationTime = Date.now() - startTime;
        console.log(`✅ Building placement processed in ${calculationTime}ms`);

        return {
            success: true,
            timestamp: Date.now(),
            calculationTime,
            cityEconomics: {
                ...cityStats,
                supplyDemand
            },
            vitality: {
                supply: {
                    ENERGY: supplyDemand.energy.supply,
                    FOOD: supplyDemand.food.supply,
                    HOUSING: supplyDemand.housing.supply,
                    JOBS: supplyDemand.jobs.supply
                },
                demand: {
                    ENERGY: supplyDemand.energy.demand,
                    FOOD: supplyDemand.food.demand,
                    HOUSING: supplyDemand.housing.demand,
                    JOBS: supplyDemand.jobs.demand
                }
            },
            affectedBuildings: buildingPerformances,
            cacheInfo: {
                cachedResults: this.cache.buildingPerformance.size - buildingPerformances.length,
                freshCalculations: buildingPerformances.length
            }
        };
    }

    /**
     * FINE-GRAINED: Get individual building performance
     * Used for tooltips and UI updates
     */
    getBuildingPerformance(row, col) {
        const buildingKey = `${row},${col}`;

        // Check cache first
        if (this.cache.buildingPerformance.has(buildingKey)) {
            return {
                success: true,
                timestamp: Date.now(),
                building: this.cache.buildingPerformance.get(buildingKey),
                fromCache: true
            };
        }

        // Calculate fresh if not cached
        const performance = this.calculateBuildingPerformance(row, col);

        if (performance) {
            this.cache.buildingPerformance.set(buildingKey, performance);
            return {
                success: true,
                timestamp: Date.now(),
                building: performance,
                fromCache: false
            };
        }

        return {
            success: false,
            error: 'Building not found or cannot calculate performance'
        };
    }

    /**
     * FINE-GRAINED: Get current city statistics
     * Used for UI updates and dashboards
     */
    getCityStatistics() {
        if (this.cache.cityStats && (Date.now() - this.cache.lastUpdate) < 5000) {
            return {
                success: true,
                timestamp: Date.now(),
                cityStats: this.cache.cityStats,
                fromCache: true
            };
        }

        const cityStats = this.calculateCityStatistics();
        this.cache.cityStats = cityStats;
        this.cache.lastUpdate = Date.now();

        return {
            success: true,
            timestamp: Date.now(),
            cityStats,
            fromCache: false
        };
    }

    /**
     * FINE-GRAINED: Get supply/demand balance
     * Used for economic overview displays
     */
    getSupplyDemand() {
        if (this.cache.supplyDemand && (Date.now() - this.cache.lastUpdate) < 5000) {
            return {
                success: true,
                timestamp: Date.now(),
                supplyDemand: this.cache.supplyDemand,
                fromCache: true
            };
        }

        const supplyDemand = this.calculateCitySupplyDemand();
        this.cache.supplyDemand = supplyDemand;
        this.cache.lastUpdate = Date.now();

        return {
            success: true,
            timestamp: Date.now(),
            supplyDemand,
            fromCache: false
        };
    }

    /**
     * Update internal game state from client data
     */
    updateGameState(gameState) {
        // Debug: Game state update initiated

        if (gameState.grid) {
            this.gameData.grid = gameState.grid;
            // Debug: Grid updated with parcels
        }
        if (gameState.buildings) {
            this.gameData.buildings = new Map(Object.entries(gameState.buildings));
            // Debug: Buildings map updated
        }
    }

    /**
     * Calculate city-wide statistics
     * Adapted from client economic-performance.js calculateCitySupplyDemand
     */
    calculateCityStatistics() {
        let totalPopulation = 0;
        let totalBuildings = 0;
        let totalRevenue = 0;
        let totalMaintenance = 0;

        // Scan all parcels
        Object.entries(this.gameData.grid).forEach(([gridKey, parcel]) => {
            if (!parcel?.building) return;

            const building = this.gameData.buildings.get(parcel.building);
            if (!building) return;

            totalBuildings++;

            // Add population
            if (building.population?.bedroomsAdded > 0) {
                totalPopulation += building.population.bedroomsAdded;
            }

            // Calculate building performance for revenue/maintenance
            const [row, col] = gridKey.split(',').map(Number);
            const performance = this.calculateBuildingPerformance(row, col);

            if (performance) {
                totalRevenue += performance.actualRevenue || 0;
                totalMaintenance += performance.maintenance || 0;
            }
        });

        return {
            totalPopulation,
            totalBuildings,
            totalRevenue: Math.round(totalRevenue),
            totalMaintenance: Math.round(totalMaintenance),
            netIncome: Math.round(totalRevenue - totalMaintenance)
        };
    }

    /**
     * Calculate supply and demand for all categories
     * Adapted from client economic-performance.js calculateCitySupplyDemand
     */
    calculateCitySupplyDemand() {
        const totals = {
            housing: { supply: 0, demand: 0 },
            jobs: { supply: 0, demand: 0 },
            energy: { supply: 0, demand: 0 },
            food: { supply: 0, demand: 0 }
        };

        console.log('🔍 [DEBUG] Calculating city supply/demand...');
        // Debug: Grid entries calculated
        // Debug: Buildings cache updated

        // Scan all parcels for buildings
        Object.entries(this.gameData.grid).forEach(([gridKey, parcel]) => {
            if (!parcel?.building) return;

            console.log(`🔍 [DEBUG] Checking parcel ${gridKey}, building: ${parcel.building}`);
            const building = this.gameData.buildings.get(parcel.building);
            if (!building) {
                console.log(`🔍 [DEBUG] Building ${parcel.building} not found in cache`);
                return;
            }
            console.log(`🔍 [DEBUG] Found building ${parcel.building}:`, building.id, building.name);

            // Add supplies (using correct building definition fields)
            if (building.resources?.housingProvided > 0) {
                totals.housing.supply += building.resources.housingProvided;
                console.log(`🔍 [DEBUG] City supply - adding housing: ${building.resources.housingProvided}`);
            }
            if (building.resources?.jobsProvided > 0) {
                totals.jobs.supply += building.resources.jobsProvided;
                console.log(`🔍 [DEBUG] City supply - adding jobs: ${building.resources.jobsProvided}`);
            }
            if (building.resources?.energyProvided > 0) {
                totals.energy.supply += building.resources.energyProvided;
                console.log(`🔍 [DEBUG] City supply - adding energy: ${building.resources.energyProvided}`);
            }
            if (building.resources?.foodProvided > 0) {
                totals.food.supply += building.resources.foodProvided;
                console.log(`🔍 [DEBUG] City supply - adding food: ${building.resources.foodProvided}`);
            }

            // Add demands (using correct building definition fields)
            if (building.resources?.housingRequired > 0) {
                totals.housing.demand += building.resources.housingRequired;
                console.log(`🔍 [DEBUG] City demand - adding housing: ${building.resources.housingRequired}`);
            }
            if (building.resources?.jobsRequired > 0) {
                totals.jobs.demand += building.resources.jobsRequired;
                console.log(`🔍 [DEBUG] City demand - adding jobs: ${building.resources.jobsRequired}`);
            }
            if (building.resources?.energyRequired > 0) {
                totals.energy.demand += building.resources.energyRequired;
                console.log(`🔍 [DEBUG] City demand - adding energy: ${building.resources.energyRequired}`);
            }
            if (building.resources?.foodRequired > 0) {
                totals.food.demand += building.resources.foodRequired;
                console.log(`🔍 [DEBUG] City demand - adding food: ${building.resources.foodRequired}`);
            }
        });

        return totals;
    }

    /**
     * Calculate individual building performance
     * Adapted from client economic-performance.js calculateBuildingPerformance
     */
    calculateBuildingPerformance(row, col) {
        const gridKey = `${row},${col}`;
        const parcel = this.gameData.grid[gridKey];

        if (!parcel?.building) return null;

        const building = this.gameData.buildings.get(parcel.building);
        if (!building) return null;

        // Skip buildings under construction
        if (parcel._isUnderConstruction) return null;

        // Calculate maintenance
        const maintenanceInfo = this.calculateMaintenance(parcel, building);

        // Determine building needs
        console.log('🔍 [DEBUG] About to extract needs for building:', building ? building.id : 'null building');
        const needs = this.extractBuildingNeeds(building);
        console.log('🔍 [DEBUG] Extracted needs result:', needs);

        let basePerformance = 1.0;
        let needDetails = [];

        if (needs.length > 0) {
            let totalSatisfaction = 0;

            for (const need of needs) {
                const satisfaction = this.calculateNeedSatisfaction(need, row, col);
                const weightedContribution = satisfaction * (1 / needs.length);
                totalSatisfaction += weightedContribution;

                needDetails.push({
                    type: need.type,
                    required: need.required,
                    satisfaction: satisfaction,
                    weight: 1 / needs.length,
                    contribution: weightedContribution
                });
            }

            basePerformance = Math.max(0, Math.min(1, totalSatisfaction));
        }

        // Apply decay penalty
        const decayPenalty = 1 - (parcel.decay || 0) * 0.5;

        // Apply CARENS multiplier
        const carensMultiplier = this.calculateCarensMultiplier(building, row, col);
        const finalPerformance = basePerformance * decayPenalty * carensMultiplier;

        const maxRevenue = building.economics?.maxRevenue || 0;
        const actualRevenue = maxRevenue * finalPerformance;

        return {
            row,
            col,
            performance: finalPerformance,
            basePerformance,
            decayPenalty,
            maxRevenue,
            actualRevenue,
            maintenance: maintenanceInfo.current,
            baseMaintenance: maintenanceInfo.base,
            maintenanceMultiplier: maintenanceInfo.multiplier,
            decay: parcel.decay || 0,
            age: parcel.buildingAge || 0,
            needs: needDetails,
            needsSatisfied: needDetails.filter(n => n.satisfaction >= 1.0).length,
            totalNeeds: needs.length
        };
    }

    /**
     * Extract building needs from building data
     * Adapted from client economic-performance.js extractBuildingNeeds
     */
    extractBuildingNeeds(building) {
        const needs = [];

        console.log('🔍 [DEBUG] extractBuildingNeeds for building:', building.id, building.resources);

        // Jobs need (from jobsRequired - buildings that need workers)
        if (building.resources?.jobsRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.JOBS,
                required: building.resources.jobsRequired
            });
            console.log(`🔍 [DEBUG] Added JOBS need: ${building.resources.jobsRequired}`);
        }

        // Housing need (from housingRequired - buildings that need residents)
        if (building.resources?.housingRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.HOUSING,
                required: building.resources.housingRequired
            });
            console.log(`🔍 [DEBUG] Added HOUSING need: ${building.resources.housingRequired}`);
        }

        // Energy need (from energyRequired - buildings that need power)
        if (building.resources?.energyRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.ENERGY,
                required: building.resources.energyRequired
            });
            console.log(`🔍 [DEBUG] Added ENERGY need: ${building.resources.energyRequired}`);
        }

        // Food need (from foodRequired - buildings that need food)
        if (building.resources?.foodRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.FOOD,
                required: building.resources.foodRequired
            });
            console.log(`🔍 [DEBUG] Added FOOD need: ${building.resources.foodRequired}`);
        }

        console.log(`🔍 [DEBUG] Final needs for ${building.id}:`, needs);
        return needs;
    }

    /**
     * Calculate need satisfaction
     * Adapted from client economic-performance.js calculateNeedSatisfaction
     */
    calculateNeedSatisfaction(need, row, col) {
        const supplyDemand = this.getLocalSupplyDemand(need.type, row, col);

        // If no supply available, satisfaction is 0
        if (supplyDemand.supply === 0) return 0.0;

        // If no demand, this building doesn't need this resource - satisfied
        if (supplyDemand.demand === 0) return 1.0;

        return Math.min(1.0, supplyDemand.supply / supplyDemand.demand);
    }

    /**
     * Get local supply/demand for need type - CONNECTIVITY-BASED
     * Only considers resources accessible via adjacency or road connections
     */
    getLocalSupplyDemand(needType, row, col) {
        const accessibleParcels = this.getAccessibleParcels(row, col);
        const connectedResources = this.calculateConnectedResources(accessibleParcels);

        let supply = 0;
        let demand = 0;

        switch(needType) {
            case this.NEED_TYPES.WORKERS:
                supply = connectedResources.housing.supply;
                demand = connectedResources.housing.demand;
                break;
            case this.NEED_TYPES.JOBS:
                supply = connectedResources.jobs.supply;
                demand = connectedResources.jobs.demand;
                break;
            case this.NEED_TYPES.ENERGY:
                supply = connectedResources.energy.supply;
                demand = connectedResources.energy.demand;
                break;
            case this.NEED_TYPES.FOOD:
                supply = connectedResources.food.supply;
                demand = connectedResources.food.demand;
                break;
            default:
                return { supply: 0, demand: 0 };
        }

        return { supply, demand };
    }

    /**
     * Get all parcels accessible from a given position via adjacency or road connections
     * Ported from client economic-performance.js
     */
    getAccessibleParcels(row, col) {
        const accessible = new Set();

        // Always include the parcel itself
        accessible.add(`${row},${col}`);

        // Check adjacent parcels (8-directional including diagonals)
        const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dRow, dCol] of directions) {
            const adjRow = row + dRow;
            const adjCol = col + dCol;
            const adjKey = `${adjRow},${adjCol}`;

            if (this.gameData.grid[adjKey]) {
                accessible.add(adjKey);
                console.log(`🔍 [DEBUG] Adding adjacent parcel ${adjKey} to accessibility for ${row},${col}`);
            }
        }

        // Find all road-connected parcels
        const roadConnected = this.findRoadConnectedParcels(row, col, new Set());
        roadConnected.forEach(parcel => accessible.add(parcel));

        return Array.from(accessible);
    }

    /**
     * Find all parcels connected via road network using flood-fill algorithm
     * Ported from client economic-performance.js
     */
    findRoadConnectedParcels(row, col, visited) {
        const connected = new Set();
        const toVisit = [`${row},${col}`];

        while (toVisit.length > 0) {
            const currentKey = toVisit.shift();
            if (visited.has(currentKey)) continue;

            visited.add(currentKey);
            const [currentRow, currentCol] = currentKey.split(',').map(Number);
            const parcel = this.gameData.grid[currentKey];

            // If this is a road, explore its neighbors
            if (parcel && this.isRoadParcel(parcel)) {
                connected.add(currentKey);

                // Add adjacent parcels to exploration queue (8-directional)
                const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
                for (const [dRow, dCol] of directions) {
                    const neighborKey = `${currentRow + dRow},${currentCol + dCol}`;
                    if (!visited.has(neighborKey) && this.gameData.grid[neighborKey]) {
                        toVisit.push(neighborKey);
                    }
                }
            }
        }

        return Array.from(connected);
    }

    /**
     * Check if a parcel contains a road
     * Ported from client economic-performance.js
     */
    isRoadParcel(parcel) {
        if (!parcel.building) return false;

        const building = this.gameData.buildings.get(parcel.building);
        if (!building) return false;

        // Check for road-type buildings
        return building.type === 'transport-road' ||
               building.category === 'transport' ||
               (typeof building === 'string' && building.includes('road'));
    }

    /**
     * Calculate total supply and demand from connected parcels
     * Ported from client economic-performance.js
     */
    calculateConnectedResources(accessibleParcels) {
        const resources = {
            housing: { supply: 0, demand: 0 },
            jobs: { supply: 0, demand: 0 },
            energy: { supply: 0, demand: 0 },
            food: { supply: 0, demand: 0 }
        };

        for (const parcelKey of accessibleParcels) {
            const parcel = this.gameData.grid[parcelKey];
            if (!parcel?.building) continue;

            const building = this.gameData.buildings.get(parcel.building);
            if (!building) {
                console.log(`🚨 [DEBUG] No building data found for parcel ${parcelKey} building ${parcel.building}`);
                continue;
            }

            console.log(`🔍 [DEBUG] Processing connected resources for ${parcel.building}:`, building.resources);

            // Skip buildings under construction - they provide no supply until complete
            if (parcel._isUnderConstruction) continue;

            // Add supplies - using correct field names from building definitions
            if (building.resources?.housingProvided > 0) {
                resources.housing.supply += building.resources.housingProvided;
                console.log(`🔍 [DEBUG] Adding housing supply: ${building.resources.housingProvided}`);
            }
            if (building.resources?.jobsProvided > 0) {
                resources.jobs.supply += building.resources.jobsProvided;
                console.log(`🔍 [DEBUG] Adding jobs supply: ${building.resources.jobsProvided}`);
            }
            if (building.resources?.energyProvided > 0) {
                resources.energy.supply += building.resources.energyProvided;
                console.log(`🔍 [DEBUG] Adding energy supply: ${building.resources.energyProvided}`);
            }
            if (building.resources?.foodProvided > 0) {
                resources.food.supply += building.resources.foodProvided;
                console.log(`🔍 [DEBUG] Adding food supply: ${building.resources.foodProvided}`);
            }

            // Add demands - using correct field names from building definitions
            if (building.resources?.housingRequired > 0) {
                resources.housing.demand += building.resources.housingRequired;
                console.log(`🔍 [DEBUG] Adding housing demand: ${building.resources.housingRequired}`);
            }
            if (building.resources?.jobsRequired > 0) {
                resources.jobs.demand += building.resources.jobsRequired;
                console.log(`🔍 [DEBUG] Adding jobs demand: ${building.resources.jobsRequired}`);
            }
            if (building.resources?.energyRequired > 0) {
                resources.energy.demand += building.resources.energyRequired;
                console.log(`🔍 [DEBUG] Adding energy demand: ${building.resources.energyRequired}`);
            }
            if (building.resources?.foodRequired > 0) {
                resources.food.demand += building.resources.foodRequired;
                console.log(`🔍 [DEBUG] Adding food demand: ${building.resources.foodRequired}`);
            }
        }

        console.log(`🔍 [DEBUG] Final connected resources:`, resources);
        return resources;
    }

    /**
     * Calculate maintenance cost
     * Adapted from client economic-performance.js calculateMaintenance
     */
    calculateMaintenance(parcel, building) {
        const baseMaintenance = building.economics?.maintenanceCost || 0;
        const buildingAge = parcel.buildingAge || 0;

        const decayRate = building.economics?.decayRatePercent ?
            building.economics.decayRatePercent / 100 : 0.001;

        const ageMultiplier = Math.pow(1 + decayRate, buildingAge);
        const decayMultiplier = 1 + (parcel.decay || 0);

        const finalMultiplier = ageMultiplier * decayMultiplier;
        const currentMaintenance = baseMaintenance * finalMultiplier;

        return {
            base: baseMaintenance,
            current: currentMaintenance,
            multiplier: finalMultiplier,
            ageMultiplier,
            decayMultiplier
        };
    }

    /**
     * Get buildings affected by a change at specific location
     */
    getAffectedBuildings(row, col) {
        // For now, return all buildings as transport affects everything
        // TODO: Implement smarter dependency tracking
        const affected = [];

        Object.entries(this.gameData.grid).forEach(([gridKey, parcel]) => {
            if (parcel?.building) {
                const [buildingRow, buildingCol] = gridKey.split(',').map(Number);
                affected.push({ row: buildingRow, col: buildingCol });
            }
        });

        return affected;
    }

    /**
     * Calculate performance for multiple buildings
     */
    calculateBuildingPerformances(buildings) {
        return buildings.map(({ row, col }) => {
            return this.calculateBuildingPerformance(row, col);
        }).filter(performance => performance !== null);
    }

    /**
     * Calculate all building performances
     */
    calculateAllBuildingPerformances() {
        const performances = [];

        // Debug: Calculating building performances
        // Debug: Processing grid data

        Object.entries(this.gameData.grid).forEach(([gridKey, parcel]) => {
            if (parcel?.building) {
                console.log(`🔍 [DEBUG] Found building at ${gridKey}: ${parcel.building}, underConstruction: ${parcel._isUnderConstruction}`);
                const [row, col] = gridKey.split(',').map(Number);
                const performance = this.calculateBuildingPerformance(row, col);
                if (performance) {
                    performances.push(performance);
                    console.log(`🔍 [DEBUG] Added performance for ${gridKey}:`, performance);
                } else {
                    console.log(`🔍 [DEBUG] No performance calculated for ${gridKey} (likely under construction)`);
                }
            }
        });

        // Debug: Building performance calculations complete
        return performances;
    }

    /**
     * Calculate basic transport efficiency (placeholder)
     * TODO: Integrate with transport capacity system
     */
    calculateTransportEfficiency() {
        return {
            averageEfficiency: 1.0,
            congestionLevel: 'Free Flow',
            totalCapacity: 1000,
            totalUsage: 0
        };
    }

    /**
     * Calculate city-wide CARENS scores
     * Based on livability impacts from all completed buildings
     */
    calculateCityWideCarensScores() {
        const carensScores = {
            safety: 0,
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0
        };

        // Sum up impacts from all completed buildings across the city
        Object.entries(this.gameData.grid).forEach(([gridKey, parcel]) => {
            if (parcel?.building && !parcel._isUnderConstruction) {
                const building = this.gameData.buildings.get(parcel.building);
                if (building?.livability) {
                    // Add impacts from each CARENS domain
                    Object.keys(carensScores).forEach(domain => {
                        const livabilityData = building.livability[domain];
                        if (livabilityData && typeof livabilityData.impact === 'number') {
                            carensScores[domain] += livabilityData.impact;
                        }
                    });
                }
            }
        });

        return carensScores;
    }

    /**
     * Calculate CARENS multiplier for a specific building
     * Uses city-wide CARENS scores to boost building performance
     */
    calculateCarensMultiplier(building, row, col) {
        // Base multiplier (no effect)
        let multiplier = 1.0;

        // Skip if building has no livability data
        if (!building?.livability) {
            return multiplier;
        }

        // Get city-wide CARENS scores
        const cityCarens = this.calculateCityWideCarensScores();

        // Apply multipliers based on building's relevant CARENS domains
        Object.keys(building.livability).forEach(domain => {
            const buildingLivability = building.livability[domain];
            if (buildingLivability && typeof buildingLivability.impact === 'number') {
                const cityScore = cityCarens[domain] || 0;

                // Convert city score to a multiplier effect
                // Positive scores boost performance, negative scores reduce it
                // Scale: Every 10 points of city CARENS = 5% performance change
                const domainEffect = 1 + (cityScore * 0.005);

                // Weight the effect by this building's contribution to that domain
                // Buildings that contribute more to a domain benefit more from citywide success
                const buildingWeight = Math.abs(buildingLivability.impact) / 20; // Normalize impact
                const weightedEffect = 1 + ((domainEffect - 1) * Math.min(buildingWeight, 1));

                // Apply the weighted effect to the overall multiplier
                multiplier *= weightedEffect;
            }
        });

        // Cap the multiplier to reasonable bounds (0.5x to 2.0x)
        multiplier = Math.max(0.5, Math.min(2.0, multiplier));

        return multiplier;
    }

    /**
     * Calculate player cashflow breakdown
     * Using unified PlayerCashflow data structure
     */
    calculatePlayerCashflow(gameState, playerId = 'player') {
        // Create new PlayerCashflow instance
        const cashflow = new PlayerCashflow({
            playerId: playerId,
            timestamp: Date.now()
        });

        const breakdown = [];

        // Process player's buildings from game state
        for (const [gridKey, parcel] of Object.entries(gameState.grid || {})) {
            if (parcel.owner === playerId && parcel.building && !parcel._isUnderConstruction) {
                const [row, col] = gridKey.split(',').map(Number);

                // Get building definition
                const building = this.buildingDefinitions.get(parcel.building);
                if (!building) continue;

                // Calculate building economics with performance data
                const economics = this.calculateBuildingEconomics(parcel, building, gameState);

                // Update cashflow totals
                cashflow.buildingRevenue += economics.revenue;
                cashflow.buildingMaintenance += economics.maintenance;
                cashflow.landValueTax += economics.lvt;

                // Add to detailed breakdown
                breakdown.push({
                    coordinates: `(${row}, ${col})`,
                    buildingName: building.name || parcel.building,
                    buildingAge: parcel.buildingAge || 0,
                    decay: parcel.decay || 0,
                    landValue: parcel.landValue?.paidPrice || 0,
                    revenue: economics.revenue,
                    maintenance: economics.maintenance,
                    lvt: economics.lvt,
                    netCashflow: economics.revenue - economics.maintenance - economics.lvt,
                    efficiency: economics.efficiency || 1.0,
                    deficits: economics.deficits || []
                });
            }
        }

        // Process LVT for empty parcels owned by the player
        for (const [gridKey, parcel] of Object.entries(gameState.grid || {})) {
            if (parcel.owner === playerId && (!parcel.building || parcel._isUnderConstruction)) {
                const [row, col] = gridKey.split(',').map(Number);

                // Calculate LVT using proper method (purchase price * LVT rate / 365)
                const emptyParcelLVT = this.calculateLVT(parcel, gameState);

                // Add to cashflow totals
                cashflow.landValueTax += emptyParcelLVT;

                // Add to detailed breakdown
                breakdown.push({
                    coordinates: `(${row}, ${col})`,
                    buildingName: 'Empty Parcel',
                    buildingAge: 0,
                    decay: 0,
                    landValue: parcel.landValue?.paidPrice || 1000,
                    revenue: 0,
                    maintenance: 0,
                    lvt: emptyParcelLVT,
                    netCashflow: -emptyParcelLVT, // Pure cost for empty parcels
                    efficiency: 0,
                    deficits: ['Empty parcel - no production']
                });
            }
        }

        // Calculate road maintenance
        cashflow.roadMaintenance = this.calculateRoadMaintenance(gameState, playerId);

        // Store breakdown
        cashflow.buildingBreakdown = breakdown;

        // Recalculate totals
        cashflow.recalculate();

        // Return in backwards-compatible format while using unified structure
        return {
            success: true,
            totalRevenue: cashflow.totalRevenue,
            totalMaintenance: cashflow.totalExpenses - cashflow.landValueTax,
            totalLVT: cashflow.landValueTax,
            roadMaintenance: cashflow.roadMaintenance,
            netCashflow: cashflow.netCashflow,
            breakdown: cashflow.buildingBreakdown,
            // Include full unified structure for new consumers
            unifiedCashflow: cashflow
        };
    }

    /**
     * Calculate road maintenance for a player
     */
    calculateRoadMaintenance(gameState, playerId) {
        // Simple implementation: count road tiles owned by player
        let roadCount = 0;
        for (const [gridKey, parcel] of Object.entries(gameState.grid || {})) {
            if (parcel.owner === playerId && parcel.building &&
                (parcel.building.includes('road') || parcel.building === 'transport-road')) {
                roadCount++;
            }
        }

        const maintenancePerRoad = 50; // Base maintenance cost per road tile
        return roadCount * maintenancePerRoad;
    }

    /**
     * Calculate economics for a single building (server-side version)
     */
    calculateBuildingEconomics(parcel, building, gameState) {
        const revenue = this.calculateRevenue(parcel, building, gameState);
        const maintenance = this.calculateMaintenance(parcel, building);
        const lvt = this.calculateLVT(parcel, gameState);

        return {
            revenue: revenue.current || 0,
            maintenance: maintenance.current || 0,
            lvt: lvt || 0
        };
    }

    /**
     * Calculate LVT for a parcel (simplified server version)
     */
    calculateLVT(parcel, gameState) {
        const landValue = parcel.landValue?.paidPrice || 1000; // Default land value
        // Use governance system rate if available, otherwise default to 50% annual
        const annualLVTRate = gameState?.governanceSystem?.getCurrentLVTRate?.() || 0.50;
        const dailyLVTRate = annualLVTRate / 365;
        return landValue * dailyLVTRate;
    }

    /**
     * Calculate demographics breakdown
     * Migrated from client economic-engine.js
     */
    calculateDemographics(totalPopulation) {
        // Age distribution based on typical demographics
        const children = Math.round(totalPopulation * 0.22); // 22% children
        const adults = Math.round(totalPopulation * 0.65);   // 65% adults
        const seniors = totalPopulation - children - adults; // Remaining are seniors

        // Labor force is typically 80% of adult population (adults who can work)
        const laborForce = Math.round(adults * 0.80);

        return {
            success: true,
            demographics: {
                children: Math.max(0, children),
                adults: Math.max(0, adults),
                seniors: Math.max(0, seniors),
                laborForce: Math.max(0, laborForce),
                total: totalPopulation
            }
        };
    }

    /**
     * Calculate land value for a specific parcel
     * Migrated from client economic-engine.js for server-authoritative calculations
     */
    calculateLandValue(gameState, row, col) {
        try {
            // Check cache first
            const cacheKey = `landvalue:${row}-${col}`;
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < 10000) { // 10 second TTL
                    return {
                        success: true,
                        landValue: cached.data
                    };
                }
            }

            // Get base price and parcel
            const basePrice = this.getParcelPrice(gameState, row, col);
            const parcel = this.getGridParcel(gameState, row, col);

            if (!parcel) {
                return {
                    success: false,
                    error: 'Parcel not found'
                };
            }

            // Get residential capacity of this parcel
            let residentialCapacity = 0;
            if (parcel.building) {
                const building = this.getBuildingById(gameState, parcel.building);
                if (building && this.normalizeBuildingCategory(building.category) === 'housing') {
                    residentialCapacity = building.bedrooms || 0;
                }
            }

            // Calculate accessibility scores for each domain
            const accessScores = this.calculateAccessibilityScores(gameState, row, col);

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
                const nearbyPopulation = this.getNearbyPopulation(gameState, row, col, 3);
                demandMultiplier = 1.0 + (nearbyPopulation / 50) * 0.5;
            }

            // Network effects - developed neighbors
            const developedNeighbors = this.getAdjacentDevelopedParcels(gameState, row, col);
            const networkMultiplier = 1.0 + (developedNeighbors * 0.05); // 5% per neighbor

            // Overall city prosperity affects all land values
            const totalVitality = this.calculateTotalVitality(gameState);
            const prosperityBonus = Math.min(totalVitality / 500, 0.3); // 30% max

            // Combine all multipliers
            const totalMultiplier = accessibilityMultiplier * demandMultiplier * networkMultiplier * (1 + prosperityBonus);

            // Ensure reasonable bounds (0.25x to 5x base price)
            const finalMultiplier = Math.max(0.25, Math.min(5.0, totalMultiplier));

            const landValue = Math.round(basePrice * finalMultiplier);

            // Cache the result
            this.cache.set(cacheKey, {
                data: landValue,
                timestamp: Date.now()
            });

            return {
                success: true,
                landValue: landValue,
                breakdown: {
                    basePrice,
                    accessibilityMultiplier,
                    demandMultiplier,
                    networkMultiplier,
                    prosperityBonus,
                    finalMultiplier
                }
            };

        } catch (error) {
            console.error('Server land value calculation failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cache management
     */
    invalidateCache() {
        this.cache.buildingPerformance.clear();
        this.cache.cityStats = null;
        this.cache.supplyDemand = null;
        this.cache.lastUpdate = 0;
    }

    invalidateCacheForBuildings(buildings) {
        buildings.forEach(({ row, col }) => {
            const buildingKey = `${row},${col}`;
            this.cache.buildingPerformance.delete(buildingKey);
        });

        // City-wide stats need recalculation when any building changes
        this.cache.cityStats = null;
        this.cache.supplyDemand = null;
    }

    /**
     * Helper functions for land value calculation
     */

    getParcelPrice(gameState, row, col) {
        // Base parcel price logic - simplified for server
        const gridSize = this.getGridSize(gameState);
        const centerRow = Math.floor(gridSize / 2);
        const centerCol = Math.floor(gridSize / 2);

        // Distance from city center
        const distance = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));
        const maxDistance = Math.sqrt(Math.pow(centerRow, 2) + Math.pow(centerCol, 2));

        // Base price decreases with distance from center
        const basePriceRange = { min: 1000, max: 5000 };
        const distanceRatio = distance / maxDistance;
        const basePrice = basePriceRange.max - (distanceRatio * (basePriceRange.max - basePriceRange.min));

        return Math.round(basePrice);
    }

    getGridParcel(gameState, row, col) {
        const gridKey = `${row},${col}`;
        return gameState.grid[gridKey] || null;
    }

    getBuildingById(gameState, buildingId) {
        return gameState.buildings[buildingId] || null;
    }

    normalizeBuildingCategory(category) {
        // Normalize building category names to standard format
        const categoryMap = {
            'housing': 'housing',
            'residential': 'housing',
            'homes': 'housing',
            'energy': 'energy',
            'power': 'energy',
            'jobs': 'jobs',
            'commercial': 'jobs',
            'industrial': 'jobs',
            'food': 'food',
            'agriculture': 'food',
            'healthcare': 'healthcare',
            'health': 'healthcare',
            'education': 'education',
            'schools': 'education',
            'transport': 'transport',
            'transportation': 'transport',
            'culture': 'culture',
            'recreation': 'culture',
            'safety': 'safety',
            'security': 'safety'
        };

        return categoryMap[category?.toLowerCase()] || category?.toLowerCase() || 'unknown';
    }

    calculateAccessibilityScores(gameState, row, col) {
        // Full accessibility calculation migrated from client economic-engine.js
        const cacheKey = `accessibility:${row}-${col}`;

        // Check cache first (5 second TTL for accessibility scores)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) {
                return cached.data;
            }
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
        const gridSize = this.getGridSize(gameState);

        // Scan all parcels within influence range
        for (let r = Math.max(0, row - MAX_DISTANCE); r <= Math.min(gridSize - 1, row + MAX_DISTANCE); r++) {
            for (let c = Math.max(0, col - MAX_DISTANCE); c <= Math.min(gridSize - 1, col + MAX_DISTANCE); c++) {
                if (r === row && c === col) continue;

                const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
                const parcel = this.getGridParcel(gameState, r, c);

                if (parcel && parcel.building) {
                    const building = this.getBuildingById(gameState, parcel.building);
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
        this.cache.set(cacheKey, {
            data: scores,
            timestamp: Date.now()
        });

        return scores;
    }

    getNearbyPopulation(gameState, row, col, radius) {
        let totalPopulation = 0;

        for (let r = row - radius; r <= row + radius; r++) {
            for (let c = col - radius; c <= col + radius; c++) {
                const parcel = this.getGridParcel(gameState, r, c);
                if (parcel && parcel.population) {
                    totalPopulation += parcel.population;
                }
            }
        }

        return totalPopulation;
    }

    getAdjacentDevelopedParcels(gameState, row, col) {
        let developedCount = 0;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // N, S, W, E

        directions.forEach(([dr, dc]) => {
            const parcel = this.getGridParcel(gameState, row + dr, col + dc);
            if (parcel && parcel.building) {
                developedCount++;
            }
        });

        return developedCount;
    }

    calculateTotalVitality(gameState) {
        // Simplified vitality calculation
        // In practice, this would come from the client or be calculated based on game state
        let totalVitality = 0;

        // Count buildings in each category as a proxy for vitality
        const vitalityScores = {
            food: 0,
            energy: 0,
            jobs: 0,
            healthcare: 0,
            education: 0,
            transport: 0,
            culture: 0,
            safety: 0
        };

        // Iterate through all buildings and count by category
        Object.values(gameState.buildings || {}).forEach(building => {
            const category = this.normalizeBuildingCategory(building.category);
            if (vitalityScores.hasOwnProperty(category)) {
                vitalityScores[category] += 10; // Each building adds 10 vitality points
            }
        });

        // Sum all vitality scores
        totalVitality = Object.values(vitalityScores).reduce((sum, score) => sum + score, 0);

        return totalVitality;
    }

    getGridSize(gameState) {
        // Determine grid size from gameState
        // Look for the highest row/col values in the grid
        let maxRow = 0;
        let maxCol = 0;

        Object.keys(gameState.grid || {}).forEach(gridKey => {
            const [row, col] = gridKey.split(',').map(Number);
            maxRow = Math.max(maxRow, row);
            maxCol = Math.max(maxCol, col);
        });

        // Assume square grid and add 1 for 0-based indexing
        return Math.max(maxRow + 1, maxCol + 1, 20); // Minimum 20x20 grid
    }
}

module.exports = ServerEconomicEngine;