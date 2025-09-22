/**
 * Economic Performance Engine - Phase 1
 * Core building performance calculation system
 *
 * Performance = Σ(need_satisfaction × 1/total_needs) for each need type
 * Revenue = max_revenue × performance × vitality_multiplier
 */

class EconomicPerformanceEngine {
    constructor(game) {
        this.game = game;

        // Standardized need types for Phase 1
        this.NEED_TYPES = {
            WORKERS: 'workers',      // Supplied by housing (BedroomsAdded)
            JOBS: 'jobs',            // Supplied by commercial/industry (JobsCreated)
            ENERGY: 'energy',        // Supplied by utilities (negative EnergyDemand)
            FOOD: 'food',            // Supplied by agriculture/commerce (FoodProduction)
            EDUCATION: 'education',  // Supplied by education buildings
            HEALTHCARE: 'healthcare' // Supplied by healthcare buildings
        };

        // Population-based JEFH requirements by age group
        this.POPULATION_REQUIREMENTS = {
            food: {
                children: 3,   // Food per day
                adults: 8,
                seniors: 6
            },
            jobs: {
                children: 0,   // Children don't work
                adults: 1,     // 1 job per adult
                seniors: 0     // Seniors are retired
            },
            education: {
                children: 1,   // 1 education slot per child
                adults: 0.1,   // Occasional adult education
                seniors: 0     // No education for seniors
            },
            healthcare: {
                children: 0.5, // Children need less healthcare
                adults: 1,     // Regular healthcare
                seniors: 2     // Seniors need more healthcare
            }
        };

        // Cache for performance calculations
        this.performanceCache = new Map();
        this.lastCalculationTime = 0;

    }

    /**
     * Calculate citywide economic conditions that affect population density
     * @return {Object} Economic conditions affecting population behavior
     */
    getCityEconomicConditions() {
        // Calculate citywide job/housing balance
        const cityStats = this.calculateCityStats();
        const jobsPerPerson = cityStats.jobs.supply / Math.max(cityStats.housing.demand, 1);
        const housingPerPerson = cityStats.housing.supply / Math.max(cityStats.housing.demand, 1);

        // Economic pressure affects population density
        let occupancyMultiplier = 1.0;

        // Job scarcity → people leave, lower occupancy
        if (jobsPerPerson < 0.8) {
            occupancyMultiplier *= (0.75 + jobsPerPerson * 0.25); // Range: 0.75-1.0
        }

        // Housing scarcity → overcrowding, higher occupancy
        if (housingPerPerson < 0.9) {
            occupancyMultiplier *= (1.0 + (0.9 - housingPerPerson) * 1.5); // Up to 2.35x
        }

        return {
            jobsPerPerson,
            housingPerPerson,
            occupancyMultiplier: Math.max(0.5, Math.min(2.5, occupancyMultiplier))
        };
    }

    /**
     * Calculate actual population in a building based on bedrooms and economic conditions
     * @param {Object} building - Building object with population data
     * @return {number} Actual number of residents
     */
    calculateActualPopulation(building) {
        const bedrooms = building.population?.bedroomsAdded || 0;
        if (bedrooms === 0) return 0;

        // Base: 2 people per bedroom, modified by economic conditions
        const basePeoplePerBedroom = 2.0;
        const economicConditions = this.getCityEconomicConditions();
        const actualPeoplePerBedroom = basePeoplePerBedroom * economicConditions.occupancyMultiplier;

        return Math.round(bedrooms * actualPeoplePerBedroom);
    }

    /**
     * Calculate actual workers available from a building
     * @param {Object} building - Building object with population data
     * @return {number} Number of workers (adults in the population)
     */
    calculateActualWorkers(building) {
        const population = this.calculateActualPopulation(building);
        // Assume ~70% of population are working-age adults
        return Math.round(population * 0.7);
    }

    /**
     * Calculate building performance based on need satisfaction
     * @param {number} row - Grid row
     * @param {number} col - Grid column
     * @return {Object} Performance data with detailed breakdown
     */
    calculateBuildingPerformance(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel?.building) return null;

        const building = this.game.buildingManager.getBuildingById(parcel.building);
        if (!building) return null;

        // Skip buildings under construction
        if (parcel._isUnderConstruction) return null;


        // Calculate maintenance based on building age and decay
        const maintenanceInfo = this.calculateMaintenance(parcel, building);

        // Determine building needs from CSV data
        const needs = this.extractBuildingNeeds(building, row, col);

        let basePerformance = 1.0;
        let needDetails = [];

        if (needs.length === 0) {
        } else {
            // Calculate satisfaction for each need
            let totalSatisfaction = 0;

            for (const need of needs) {
                const satisfactionData = this.calculateNeedSatisfactionDetailed(need, row, col);
                const satisfaction = satisfactionData.satisfaction;
                const weightedContribution = satisfaction * (1 / needs.length);
                totalSatisfaction += weightedContribution;

                needDetails.push({
                    type: need.type,
                    required: need.required,
                    available: satisfactionData.available,
                    unmet: Math.max(0, need.required - satisfactionData.available),
                    satisfaction: satisfaction,
                    weight: 1 / needs.length,
                    contribution: weightedContribution
                });

            }

            basePerformance = Math.max(0, Math.min(1, totalSatisfaction));

            // Uncomment for debugging:
            // console.log('Performance calculation:', {
            //     building: building.name,
            //     row, col,
            //     needs: needDetails,
            //     totalSatisfaction,
            //     basePerformance
            // });
        }

        // Apply decay penalty to performance
        // Buildings in poor condition (high decay) perform worse
        const decayPenalty = 1 - (parcel.decay || 0) * 0.5; // Max 50% performance loss from decay
        const finalPerformance = basePerformance * decayPenalty;

        const maxRevenue = building.economics?.maxRevenue || 0;
        const actualRevenue = maxRevenue * finalPerformance;


        return {
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
     * Extract building needs from CSV-derived building data
     * @param {Object} building - Building definition
     * @return {Array} Array of need objects
     */
    extractBuildingNeeds(building, row = 0, col = 0) {
        const needs = [];

        // === POPULATION-BASED NEEDS (JEFH) ===
        // These are driven by residents in the building

        // Jobs need - adults need work
        const jobsRequired = this.calculatePopulationDemand(building, 'jobs', row, col);
        if (jobsRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.JOBS,
                required: jobsRequired
            });
        }

        // Education need - children need schooling
        const educationRequired = this.calculatePopulationDemand(building, 'education', row, col);
        if (educationRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.EDUCATION,
                required: educationRequired
            });
        }

        // Food need - everyone needs food based on age
        const foodRequired = this.calculatePopulationDemand(building, 'food', row, col);
        if (foodRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.FOOD,
                required: foodRequired
            });
        }

        // Healthcare need - everyone needs healthcare based on age
        const healthcareRequired = this.calculatePopulationDemand(building, 'healthcare', row, col);
        if (healthcareRequired > 0) {
            needs.push({
                type: this.NEED_TYPES.HEALTHCARE,
                required: healthcareRequired
            });
        }

        // === BUILDING-BASED NEEDS ===
        // These are driven by the building itself, not residents

        // Workers need - commercial/industry buildings need workers to operate
        if (building.population?.jobsCreated > 0) {
            needs.push({
                type: this.NEED_TYPES.WORKERS,
                required: building.population.jobsCreated
            });
        }

        // Energy need - buildings need electricity
        const energyDemand = building.resources?.energyDemand || building.energyDemand || 0;
        if (energyDemand > 0) {
            needs.push({
                type: this.NEED_TYPES.ENERGY,
                required: energyDemand
            });
        }

        return needs;
    }

    /**
     * Calculate population-based demand for any JEFH resource type
     * @param {Object} building - Building definition
     * @param {string} resourceType - 'food', 'jobs', 'education', 'healthcare'
     * @param {number} row - Building location (unused but kept for consistency)
     * @param {number} col - Building location (unused but kept for consistency)
     * @return {number} Total demand for this resource type
     */
    calculatePopulationDemand(building, resourceType, row, col) {
        // Get total residents in this building (actual population, not just bedrooms)
        const residents = this.calculateActualPopulation(building);

        if (residents === 0) {
            return 0;
        }

        // Get requirements for this resource type
        const requirements = this.POPULATION_REQUIREMENTS[resourceType];
        if (!requirements) {
            console.warn(`Unknown resource type: ${resourceType}`);
            return 0;
        }

        // Get city demographics to understand age distribution
        const demographics = this.game.demographics || { children: 0, adults: 0, seniors: 0, total: 0 };

        if (demographics.total === 0) {
            // If no city demographics available, assume all adults
            return residents * requirements.adults;
        }

        // Calculate age distribution ratios
        const childRatio = demographics.children / demographics.total;
        const adultRatio = demographics.adults / demographics.total;
        const seniorRatio = demographics.seniors / demographics.total;

        // Apply ratios to this building's residents
        const buildingChildren = residents * childRatio;
        const buildingAdults = residents * adultRatio;
        const buildingSeniors = residents * seniorRatio;

        // Calculate total demand
        const totalDemand =
            (buildingChildren * requirements.children) +
            (buildingAdults * requirements.adults) +
            (buildingSeniors * requirements.seniors);

        return Math.round(totalDemand * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Calculate food demand for a building based on its residents' demographics
     * @deprecated Use calculatePopulationDemand(building, 'food', row, col) instead
     */
    calculateBuildingFoodDemand(building, row, col) {
        return this.calculatePopulationDemand(building, 'food', row, col);
    }

    /**
     * Calculate detailed need satisfaction including actual numbers
     * @param {Object} need - Need object {type, required}
     * @param {number} row - Building location
     * @param {number} col - Building location
     * @return {Object} {satisfaction: number, available: number}
     */
    calculateNeedSatisfactionDetailed(need, row, col) {
        const supplyDemand = this.getLocalSupplyDemand(need.type, row, col);
        const available = supplyDemand.supply;

        // Calculate the satisfaction ratio using the same logic as original function
        let satisfaction = 0;

        if (need.required > 0 && available === 0) {
            satisfaction = 0;
        } else if (need.required === 0) {
            // If building doesn't need this resource, it's always satisfied
            satisfaction = 1.0;
        } else if (supplyDemand.demand === 0) {
            // If total demand is 0 but this building needs something, that's an error condition
            // We can't divide by zero, so treat as unsatisfied
            satisfaction = 0;
        } else {
            satisfaction = Math.min(1.0, available / supplyDemand.demand);
        }

        return {
            satisfaction: satisfaction,
            available: available
        };
    }

    /**
     * Calculate how well a specific need is satisfied in the local area
     * @param {Object} need - Need object {type, required}
     * @param {number} row - Building location
     * @param {number} col - Building location
     * @return {number} Satisfaction ratio (0.0 to 1.0+)
     */
    calculateNeedSatisfaction(need, row, col) {
        // For Phase 1, use existing JEFH supply/demand calculations
        // This will be expanded in Phase 2 for regional effects

        const supplyDemand = this.getLocalSupplyDemand(need.type, row, col);

        // If this building NEEDS something (need.required > 0) but there's no supply, satisfaction = 0
        // Only return 1.0 if there's genuinely no need for this resource
        if (need.required > 0 && supplyDemand.supply === 0) {
            // console.log(`Need ${need.type}: building requires ${need.required} but supply=0, satisfaction=0`);
            return 0;
        }

        // If there's no demand in the city for this resource type, but the building doesn't need it either
        if (supplyDemand.demand === 0 && need.required === 0) {
            // console.log(`Need ${need.type} has no demand and building doesn't need it, returning satisfaction = 1.0`);
            return 1.0;
        }

        // Normal calculation: how much of the city's demand is satisfied
        if (supplyDemand.demand === 0) {
            // If total demand is 0 but this building needs something, that's an error condition
            // We can't divide by zero, so treat as unsatisfied
            // console.log(`Need ${need.type}: no city demand but building needs ${need.required}, satisfaction=0`);
            return 0;
        }

        const satisfaction = Math.min(1.0, supplyDemand.supply / supplyDemand.demand);

        // console.log(`Need ${need.type}: supply=${supplyDemand.supply}, demand=${supplyDemand.demand}, satisfaction=${satisfaction}`);

        return satisfaction;
    }

    /**
     * Get supply and demand for a need type using connectivity-based access
     * Resources are only accessible if connected via adjacency or roads
     * @param {string} needType - One of NEED_TYPES
     * @param {number} row - Center row
     * @param {number} col - Center col
     * @return {Object} {supply, demand}
     */
    getLocalSupplyDemand(needType, row, col) {
        // Get only resources accessible from this parcel via connectivity
        const connectedSupply = this.calculateConnectedResources(row, col, needType);

        // For demand calculation, still use city-wide totals since demand represents
        // the total need in the economy that competes for available supply
        const cityData = this.calculateCitySupplyDemand();

        let supply = connectedSupply;
        let demand = 0;

        switch(needType) {
            case this.NEED_TYPES.WORKERS:
                demand = cityData.jobs.demand; // Jobs create demand for workers
                break;
            case this.NEED_TYPES.JOBS:
                demand = cityData.housing.demand; // Housing creates demand for jobs
                break;
            case this.NEED_TYPES.ENERGY:
                demand = cityData.energy.demand;
                break;
            case this.NEED_TYPES.FOOD:
                demand = cityData.food.demand;
                break;
            default:
                return { supply: 0, demand: 0 };
        }

        return { supply, demand };
    }

    /**
     * Calculate resources accessible from a specific parcel via connectivity
     * Resources are accessible through:
     * 1. Direct adjacency (8 surrounding parcels)
     * 2. Road network connectivity
     * @param {number} row - Source parcel row
     * @param {number} col - Source parcel col
     * @param {string} needType - Type of resource to calculate
     * @return {number} Total accessible supply of the resource type
     */
    calculateConnectedResources(row, col, needType) {
        // Get all parcels accessible from this location
        const accessibleParcels = this.getAccessibleParcels(row, col);

        // console.log(`Calculating ${needType} for (${row},${col}) - found ${accessibleParcels.length} accessible parcels`);

        let totalSupply = 0;

        // Check each accessible parcel for resource supply
        for (const parcel of accessibleParcels) {
            const { row: pRow, col: pCol } = parcel;
            const gridParcel = this.game.grid[pRow][pCol];

            if (!gridParcel?.building) continue;

            // Skip buildings under construction - they provide no supply until complete
            if (gridParcel._isUnderConstruction) continue;

            const building = this.game.buildingManager.getBuildingById(gridParcel.building);
            if (!building) continue;

            // Add supply based on need type
            switch(needType) {
                case this.NEED_TYPES.WORKERS:
                    if (building.population?.bedroomsAdded > 0) {
                        const workers = this.calculateActualWorkers(building);
                        // console.log(`  Found ${workers} workers at (${pRow},${pCol}) - ${building.name}`);
                        totalSupply += workers;
                    }
                    break;
                case this.NEED_TYPES.JOBS:
                    if (building.population?.jobsCreated > 0) {
                        // console.log(`  Found ${building.population.jobsCreated} jobs at (${pRow},${pCol}) - ${building.name}`);
                        totalSupply += building.population.jobsCreated;
                    }
                    break;
                case this.NEED_TYPES.ENERGY:
                    if (building.resources?.energySupply > 0) {
                        // console.log(`  Found ${building.resources.energySupply} energy at (${pRow},${pCol}) - ${building.name}`);
                        totalSupply += building.resources.energySupply;
                    }
                    break;
                case this.NEED_TYPES.FOOD:
                    if (building.resources?.foodProduction > 0) {
                        // console.log(`  Found ${building.resources.foodProduction} food at (${pRow},${pCol}) - ${building.name}`);
                        totalSupply += building.resources.foodProduction;
                    }
                    break;
            }
        }

        // console.log(`Total ${needType} supply for (${row},${col}): ${totalSupply}`);
        return totalSupply;
    }

    /**
     * Get all parcels accessible from a given location via adjacency or roads
     * @param {number} row - Source row
     * @param {number} col - Source col
     * @return {Array} Array of {row, col} objects for accessible parcels
     */
    getAccessibleParcels(row, col) {
        const accessible = new Set();

        // 1. Add directly adjacent parcels (8-neighborhood)
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r >= 0 && r < this.game.gridSize &&
                    c >= 0 && c < this.game.gridSize) {
                    accessible.add(`${r},${c}`);
                }
            }
        }

        // 2. Add road-connected parcels (if mobility layer exists)
        if (this.game.mobilityLayer) {
            const connectedParcels = this.findRoadConnectedParcels(row, col);
            for (const parcel of connectedParcels) {
                accessible.add(`${parcel.row},${parcel.col}`);
            }
        }

        // Convert back to array of objects
        return Array.from(accessible).map(key => {
            const [r, c] = key.split(',').map(Number);
            return { row: r, col: c };
        });
    }

    /**
     * Find parcels connected via the road network
     * @param {number} row - Source row
     * @param {number} col - Source col
     * @return {Array} Array of {row, col} objects for road-connected parcels
     */
    findRoadConnectedParcels(row, col) {
        const connectedParcels = [];

        // Use mobility layer's connectivity system
        const connectivity = this.game.mobilityLayer.getParcelConnectivity(row, col);

        // console.log(`Road connectivity for (${row},${col}):`, connectivity);

        if (!connectivity.connected) {
            // Not connected to road network, return empty
            // console.log(`Parcel (${row},${col}) not connected to road network`);
            return connectedParcels;
        }

        // Simple approach: if this parcel is road-connected,
        // then all other road-connected parcels are accessible
        // (This could be optimized with actual pathfinding in the future)
        for (let r = 0; r < this.game.gridSize; r++) {
            for (let c = 0; c < this.game.gridSize; c++) {
                if (r === row && c === col) continue; // Skip self

                const otherConnectivity = this.game.mobilityLayer.getParcelConnectivity(r, c);
                if (otherConnectivity.connected) {
                    connectedParcels.push({ row: r, col: c });
                }
            }
        }

        // console.log(`Found ${connectedParcels.length} road-connected parcels for (${row},${col})`);
        return connectedParcels;
    }

    /**
     * Calculate city-wide supply and demand by scanning all buildings
     * @return {Object} Supply/demand data for all categories
     */
    calculateCitySupplyDemand() {
        const totals = {
            housing: { supply: 0, demand: 0 },
            jobs: { supply: 0, demand: 0 },
            energy: { supply: 0, demand: 0 },
            food: { supply: 0, demand: 0 }
        };

        // Scan all parcels for buildings
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel?.building) continue;

                const building = this.game.buildingManager.getBuildingById(parcel.building);
                if (!building) continue;

                // Add supplies ONLY from completed buildings
                if (!parcel._isUnderConstruction) {
                    if (building.population?.bedroomsAdded > 0) {
                        totals.housing.supply += building.population.bedroomsAdded;
                    }
                    if (building.population?.jobsCreated > 0) {
                        totals.jobs.supply += building.population.jobsCreated;
                    }
                    if (building.resources?.energySupply > 0) {
                        totals.energy.supply += building.resources.energySupply;
                    }
                    if (building.resources?.foodProduction > 0) {
                        totals.food.supply += building.resources.foodProduction;
                    }
                }

                // Add demands (all buildings, regardless of construction status)
                // Buildings under construction still represent future demand that needs to be planned for
                if (building.population?.bedroomsAdded > 0) {
                    const residents = this.calculateActualPopulation(building);
                    totals.jobs.demand += residents; // Residents need jobs
                    totals.food.demand += residents; // Residents need food
                }
                if (building.population?.jobsCreated > 0) {
                    totals.housing.demand += building.population.jobsCreated; // Jobs need workers (housing)
                }
                if (building.resources?.energyDemand > 0) {
                    totals.energy.demand += building.resources.energyDemand;
                }
                if (building.resources?.foodDemand > 0) {
                    totals.food.demand += building.resources.foodDemand;
                }
            }
        }

        return totals;
    }

    /**
     * Calculate maintenance cost for a building
     * Modern formula: base + exponential growth with age
     * @param {Object} parcel - The parcel containing the building
     * @param {Object} building - Building definition
     * @return {Object} Maintenance information
     */
    calculateMaintenance(parcel, building) {
        const baseMaintenance = building.economics?.maintenanceCost || 0;
        const buildingAge = parcel.buildingAge || 0;

        // Get decay rate from building data or use default
        // DecayRatePercent in CSV is the daily percentage increase in maintenance
        const decayRate = building.economics?.decayRatePercent ?
            building.economics.decayRatePercent / 100 : 0.001;

        // Exponential growth formula: base * (1 + rate)^days
        // This creates realistic maintenance growth over time
        const ageMultiplier = Math.pow(1 + decayRate, buildingAge);

        // Additional multiplier based on current decay state (0-1)
        // High decay means even higher maintenance costs
        const decayMultiplier = 1 + (parcel.decay || 0);

        // Final maintenance cost
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
     * Clear performance cache (call when buildings change)
     */
    clearCache() {
        this.performanceCache.clear();
    }
}

// Export for use in main game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicPerformanceEngine;
} else if (typeof window !== 'undefined') {
    window.EconomicPerformanceEngine = EconomicPerformanceEngine;
}