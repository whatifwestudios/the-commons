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
            WORKERS: 'workers',    // Supplied by housing (BedroomsAdded)
            JOBS: 'jobs',          // Supplied by commercial/industry (JobsCreated)
            ENERGY: 'energy',      // Supplied by utilities (negative EnergyDemand)
            FOOD: 'food'           // Supplied by agriculture/commerce (FoodProduction)
        };

        // Cache for performance calculations
        this.performanceCache = new Map();
        this.lastCalculationTime = 0;

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
        const needs = this.extractBuildingNeeds(building);

        let basePerformance = 1.0;
        let needDetails = [];

        if (needs.length === 0) {
        } else {
            // Calculate satisfaction for each need
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
    extractBuildingNeeds(building) {
        const needs = [];

        // Workers need (from JobsCreated - commercial/industry buildings need workers)
        if (building.population?.jobsCreated > 0) {
            needs.push({
                type: this.NEED_TYPES.WORKERS,
                required: building.population.jobsCreated
            });
        }

        // Jobs need (from BedroomsAdded - 0.6 per resident, rounded down)
        if (building.population?.bedroomsAdded > 0) {
            const jobsRequired = Math.floor(building.population.bedroomsAdded * 0.6);
            if (jobsRequired > 0) {
                needs.push({
                    type: this.NEED_TYPES.JOBS,
                    required: jobsRequired
                });
            }
        }

        // Energy need (from energyDemand field or EnergyDemandPerDay from CSV)
        const energyDemand = building.resources?.energyDemand || building.energyDemand || 0;
        if (energyDemand > 0) {
            needs.push({
                type: this.NEED_TYPES.ENERGY,
                required: energyDemand
            });
        }

        // Food need (for residential buildings: 1 food per resident)
        if (building.population?.bedroomsAdded > 0) {
            needs.push({
                type: this.NEED_TYPES.FOOD,
                required: building.population.bedroomsAdded
            });
        }

        return needs;
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

        if (supplyDemand.demand === 0) return 1.0;

        const satisfaction = supplyDemand.supply / supplyDemand.demand;


        return satisfaction;
    }

    /**
     * Get supply and demand for a need type using proper scope
     * @param {string} needType - One of NEED_TYPES
     * @param {number} row - Center row
     * @param {number} col - Center col
     * @return {Object} {supply, demand}
     */
    getLocalSupplyDemand(needType, row, col) {
        // For Phase 1, calculate supply/demand directly from all buildings
        // This ensures we include the current building's own needs

        const cityData = this.calculateCitySupplyDemand();

        let supply = 0;
        let demand = 0;

        switch(needType) {
            case this.NEED_TYPES.WORKERS:
                supply = cityData.housing.supply;
                demand = cityData.jobs.demand; // Jobs create demand for workers
                break;
            case this.NEED_TYPES.JOBS:
                supply = cityData.jobs.supply;
                demand = cityData.housing.demand; // Housing creates demand for jobs
                break;
            case this.NEED_TYPES.ENERGY:
                supply = cityData.energy.supply;
                demand = cityData.energy.demand;
                break;
            case this.NEED_TYPES.FOOD:
                supply = cityData.food.supply;
                demand = cityData.food.demand;
                break;
            default:
                return { supply: 0, demand: 0 };
        }

        return { supply, demand };
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

                // Add supplies
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

                // Add demands (all buildings, regardless of construction status)
                // Buildings under construction still represent future demand that needs to be planned for
                if (building.population?.bedroomsAdded > 0) {
                    totals.jobs.demand += building.population.bedroomsAdded; // Residents need jobs
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