/**
 * Client-Side Performance Calculator
 *
 * Mirrors server's calculateBuildingPerformance() logic for instant UI feedback.
 * Server calculations are authoritative - client syncs daily and discards its calculations.
 *
 * This enables:
 * - Instant performance updates when buildings are built/demolished
 * - Instant resource distribution feedback
 * - Real-time utilization metrics
 * - No waiting for daily server tick
 */

class ClientPerformanceCalculator {
    constructor(game) {
        this.game = game;
        this.ADJACENCY_OFFSETS = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        // Access game state from economic client
        this.buildings = () => this.game.economicClient.buildings || new Map();
        this.gameState = () => this.game.economicClient.gameState || this.game.gameState || {};
    }

    /**
     * Calculate performance for a specific building
     * Returns same structure as server's calculateBuildingPerformance()
     */
    calculateBuildingPerformance(row, col) {
        const locationKey = `${row},${col}`;
        const building = this.buildings().get(locationKey);

        if (!building || building.underConstruction) {
            return null;
        }

        const buildingDef = this.game.buildingDefinitions[building.id];
        if (!buildingDef || !buildingDef.economics) {
            return null;
        }

        const econ = buildingDef.economics;
        const baseRevenue = econ.maxRevenue || 0;

        // 1. Core needs satisfaction (local from adjacent 8 tiles)
        const localNeedsSatisfactionData = this.calculateLocalNeedsSatisfaction(row, col);
        const coreNeedsSatisfaction = localNeedsSatisfactionData.overallSatisfaction;

        // 2. CARENS multiplier (0.6x to 1.4x, only applies if population > 100)
        const totalResidents = this.gameState().totalResidents || 0;
        let carensMultiplier = 1.0;
        let carensData = null;
        if (totalResidents > 100) {
            carensData = this.calculateLocalCARENSMultiplier(row, col);
            carensMultiplier = carensData.multiplier;
        }

        // 3. Performance = Core needs × CARENS (0-140%)
        const performance = coreNeedsSatisfaction * carensMultiplier;

        // 4. Global JEEFHH multiplier (city-wide economy state)
        const globalJEEFHHMultiplier = this.calculateGlobalJEEFHHMultiplier();

        // 5. Condition factor (decay affects value, not performance)
        const conditionFactor = building.condition || 1.0;

        // 6. Housing density multiplier (housing shortage = landlords charge more)
        let housingMultiplier = 1.0;
        if (buildingDef.resources.housingProvided > 0) {
            housingMultiplier = this.gameState().housingRevenueMultiplier || 1.0;
        }

        // Final revenue calculation
        const actualRevenue = baseRevenue * performance * conditionFactor * globalJEEFHHMultiplier * housingMultiplier;

        // Maintenance calculation
        const baseMaintenance = econ.maintenanceCost || 0;
        const buildingAge = building.age || 0;
        const decayRate = (econ.decayRate || 0.05) / 100;
        const maintenanceMultiplier = 1 + (buildingAge * decayRate);
        const actualMaintenance = baseMaintenance * maintenanceMultiplier;

        const performanceData = {
            location: [row, col],
            buildingId: building.id,

            // Summary for client tooltips
            summary: {
                performance: Math.round(performance * 100),
                revenue: Math.round(actualRevenue * 100) / 100,
                maintenance: Math.round(actualMaintenance * 100) / 100,
                netIncome: Math.round((actualRevenue - actualMaintenance) * 100) / 100
            },

            // Resource satisfaction data for tooltips
            resourceSatisfaction: localNeedsSatisfactionData.detailedSatisfaction,

            // CARENS scores for boost opportunities
            carensScores: carensData ? carensData.scores : null,

            // Detailed breakdown for data insights
            detailed: {
                baseRevenue,
                coreNeedsSatisfaction,
                carensMultiplier,
                performance,
                globalJEEFHHMultiplier,
                conditionFactor,
                actualRevenue,
                baseMaintenance,
                decayRate,
                buildingAge,
                actualMaintenance,
                breakdown: {
                    base: baseRevenue,
                    afterPerformance: baseRevenue * performance,
                    afterCondition: baseRevenue * performance * conditionFactor,
                    afterGlobalJEEFHH: actualRevenue,
                    final: actualRevenue
                }
            }
        };

        return performanceData;
    }

    /**
     * Calculate local needs satisfaction from adjacent buildings (8-way)
     */
    calculateLocalNeedsSatisfaction(row, col) {
        const building = this.buildings().get(`${row},${col}`);
        const buildingDef = this.game.buildingDefinitions[building.id];

        // Get connected buildings (8 adjacent)
        const connectedSupply = {
            energy: 0,
            jobs: 0,
            food: 0,
            education: 0,
            healthcare: 0
        };

        this.ADJACENCY_OFFSETS.forEach(([dr, dc]) => {
            const connectedKey = `${row + dr},${col + dc}`;
            const connectedBuilding = this.buildings().get(connectedKey);

            if (connectedBuilding && !connectedBuilding.underConstruction) {
                const connectedDef = this.game.buildingDefinitions[connectedBuilding.id];
                if (connectedDef && connectedDef.resources) {
                    connectedSupply.energy += connectedDef.resources.energyProvided || 0;
                    connectedSupply.jobs += connectedDef.resources.jobsProvided || 0;
                    connectedSupply.food += connectedDef.resources.foodProvided || 0;
                    connectedSupply.education += connectedDef.resources.educationProvided || 0;
                    connectedSupply.healthcare += connectedDef.resources.healthcareProvided || 0;
                }
            }
        });

        const satisfactionRatios = [];
        const detailedSatisfaction = {
            energy: { required: 0, supplied: 0, satisfaction: 1.0 },
            jobs: { required: 0, supplied: 0, satisfaction: 1.0 },
            food: { required: 0, supplied: 0, satisfaction: 1.0 },
            education: { required: 0, supplied: 0, satisfaction: 1.0 },
            healthcare: { required: 0, supplied: 0, satisfaction: 1.0 }
        };

        // Check direct building requirements (e.g., energy for operations)
        if (buildingDef.resources.energyRequired > 0) {
            const energyRequired = buildingDef.resources.energyRequired;
            // Use energy from power grid if available, otherwise fall back to adjacent buildings
            const energyReceived = building.energyReceived !== undefined ? building.energyReceived : connectedSupply.energy;
            const energySatisfaction = Math.min(1.0, energyReceived / energyRequired);
            satisfactionRatios.push(energySatisfaction);

            detailedSatisfaction.energy = {
                required: energyRequired,
                supplied: energyReceived,
                satisfaction: energySatisfaction
            };
        }

        // For housing buildings, check resident needs based on capacity
        const housingProvided = buildingDef.resources.housingProvided || 0;
        if (housingProvided > 0) {
            // Use current housing density (2.0 to 3.0 residents per bedroom)
            const housingDensity = this.gameState().housingDensity || 2.0;
            const potentialResidents = housingProvided * housingDensity;
            const workersAvailable = Math.floor(potentialResidents * 0.6);

            // Each resident needs nearby jobs, food, education, and healthcare access
            const jobsNeeded = workersAvailable;
            const foodNeeded = potentialResidents * 2;
            const educationNeeded = potentialResidents * 0.3;
            const healthcareNeeded = potentialResidents * 0.2;

            // Jobs use distributed amount
            if (jobsNeeded > 0) {
                const jobsReceived = building.jobsReceived || 0;
                const jobsSatisfaction = Math.min(1.0, jobsReceived / jobsNeeded);
                satisfactionRatios.push(jobsSatisfaction);

                detailedSatisfaction.jobs = {
                    required: jobsNeeded,
                    supplied: jobsReceived,
                    satisfaction: jobsSatisfaction
                };
            }

            // Food use distributed amount
            if (foodNeeded > 0) {
                const foodReceived = building.foodReceived || 0;
                const foodSatisfaction = Math.min(1.0, foodReceived / foodNeeded);
                satisfactionRatios.push(foodSatisfaction);

                detailedSatisfaction.food = {
                    required: foodNeeded,
                    supplied: foodReceived,
                    satisfaction: foodSatisfaction
                };
            }

            // Education use distributed amount
            if (educationNeeded > 0) {
                const educationReceived = building.educationReceived || 0;
                const educationSatisfaction = Math.min(1.0, educationReceived / educationNeeded);
                satisfactionRatios.push(educationSatisfaction);

                detailedSatisfaction.education = {
                    required: educationNeeded,
                    supplied: educationReceived,
                    satisfaction: educationSatisfaction
                };
            }

            // Healthcare use distributed amount
            if (healthcareNeeded > 0) {
                const healthcareReceived = building.healthcareReceived || 0;
                const healthcareSatisfaction = Math.min(1.0, healthcareReceived / healthcareNeeded);
                satisfactionRatios.push(healthcareSatisfaction);

                detailedSatisfaction.healthcare = {
                    required: healthcareNeeded,
                    supplied: healthcareReceived,
                    satisfaction: healthcareSatisfaction
                };
            }
        }

        // For workplace buildings, check worker availability
        const jobsProvided = buildingDef.resources.jobsProvided || 0;
        if (jobsProvided > 0) {
            const workersReceived = building.workersReceived || 0;
            const workerSatisfaction = Math.min(1.0, workersReceived / jobsProvided);
            satisfactionRatios.push(workerSatisfaction);

            detailedSatisfaction.workers = {
                required: jobsProvided,
                supplied: workersReceived,
                satisfaction: workerSatisfaction
            };
        }

        // If no specific requirements, building is self-sufficient
        if (satisfactionRatios.length === 0) {
            return {
                overallSatisfaction: 1.0,
                detailedSatisfaction: detailedSatisfaction
            };
        }

        // Calculate overall satisfaction as average of all requirements
        const overallSatisfaction = satisfactionRatios.reduce((sum, ratio) => sum + ratio, 0) / satisfactionRatios.length;

        // Buildings can operate at 5% minimum even without all needs met
        const minOperation = 0.05;
        const finalSatisfaction = Math.max(minOperation, overallSatisfaction);

        return {
            overallSatisfaction: finalSatisfaction,
            detailedSatisfaction: detailedSatisfaction
        };
    }

    /**
     * Calculate global JEEFHH multiplier
     */
    calculateGlobalJEEFHHMultiplier() {
        const jeefhh = this.game.economicClient.jeefhh;

        // Find the most problematic (lowest multiplier) JEEFHH resource
        const multipliers = [
            jeefhh.jobs.multiplier,
            jeefhh.energy.multiplier,
            jeefhh.education.multiplier,
            jeefhh.food.multiplier,
            jeefhh.housing.multiplier,
            jeefhh.healthcare.multiplier
        ];

        // Use the minimum multiplier to represent room-wide economic stress
        return Math.min(...multipliers);
    }

    /**
     * Calculate local CARENS multiplier based on adjacent parcels
     */
    calculateLocalCARENSMultiplier(row, col) {
        // Start from neutral baseline (0 points)
        const localCarens = {
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0
        };

        // Examine surrounding area for local CARENS impacts
        const maxRange = 5;
        for (let r = row - maxRange; r <= row + maxRange; r++) {
            for (let c = col - maxRange; c <= col + maxRange; c++) {
                if (r === row && c === col) continue;

                const locationKey = `${r},${c}`;
                const adjacentBuilding = this.buildings().get(locationKey);

                if (adjacentBuilding && !adjacentBuilding.underConstruction) {
                    const buildingDef = this.game.buildingDefinitions[adjacentBuilding.id];

                    if (buildingDef?.livability) {
                        const distance = Math.max(Math.abs(r - row), Math.abs(c - col));

                        // Apply each CARENS category with its specific range and effect
                        Object.keys(localCarens).forEach(category => {
                            const livabilityData = buildingDef.livability[category];
                            const effect = typeof livabilityData === 'object' ? (livabilityData.impact || 0) : (livabilityData || 0);
                            const range = typeof livabilityData === 'object' ? (livabilityData.attenuation || 2) : (buildingDef.livability[`${category}_range`] || 2);

                            // Only apply effect if within range and effect is non-zero
                            if (effect !== 0 && distance <= range) {
                                const attenuation = Math.max(0, 1.0 - (distance / range));
                                const attenuatedEffect = effect * attenuation;
                                localCarens[category] += attenuatedEffect;
                            }
                        });
                    }
                }
            }
        }

        // Calculate net CARENS total (sum of all categories)
        const netCarensTotal = localCarens.culture + localCarens.affordability + localCarens.resilience +
                              localCarens.environment + localCarens.noise + localCarens.safety;

        // Convert to multiplier: 0 = 1.0x (neutral), +100 = 1.4x (max), -100 = 0.6x (min)
        const localMultiplier = 1.0 + (netCarensTotal / 100) * 0.4;

        // Clamp to reasonable bounds (0.6x to 1.4x)
        const clampedMultiplier = Math.max(0.6, Math.min(1.4, localMultiplier));

        return {
            multiplier: clampedMultiplier,
            scores: localCarens,
            total: netCarensTotal
        };
    }

    /**
     * Recalculate performance for a single building and store in clientPerformance
     */
    updateBuildingPerformance(row, col) {
        const locationKey = `${row},${col}`;
        const building = this.buildings().get(locationKey);

        if (!building || building.underConstruction) {
            return;
        }

        // Calculate and store in clientPerformance (separate from server's performance)
        building.clientPerformance = this.calculateBuildingPerformance(row, col);

        console.log(`🔄 [CLIENT PERF] Updated performance for ${building.id} at [${row},${col}]:`,
            building.clientPerformance?.summary.performance + '%');
    }

    /**
     * Recalculate performance for all buildings in range when a building changes
     * This ensures adjacent buildings update their performance based on new connections
     */
    updateAffectedBuildings(row, col) {
        const maxRange = 5; // CARENS range
        const updatedCount = { self: 0, adjacent: 0, carensRange: 0 };

        for (let r = row - maxRange; r <= row + maxRange; r++) {
            for (let c = col - maxRange; c <= col + maxRange; c++) {
                const locationKey = `${r},${c}`;
                const building = this.buildings().get(locationKey);

                if (building && !building.underConstruction) {
                    this.updateBuildingPerformance(r, c);

                    // Track what we updated
                    if (r === row && c === col) {
                        updatedCount.self++;
                    } else if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) {
                        updatedCount.adjacent++;
                    } else {
                        updatedCount.carensRange++;
                    }
                }
            }
        }

        console.log(`🔄 [CLIENT PERF] Updated ${updatedCount.self} self, ${updatedCount.adjacent} adjacent, ${updatedCount.carensRange} CARENS-range buildings around [${row},${col}]`);
    }

    /**
     * Sync client performance with server's authoritative calculations
     * Called when daily game state update arrives from server
     */
    syncWithServer() {
        let syncedCount = 0;
        let discrepancyCount = 0;

        for (const [locationKey, building] of this.buildings()) {
            if (building.underConstruction) continue;

            // Replace clientPerformance with server's performance
            const serverPerf = building.performance;
            const clientPerf = building.clientPerformance;

            // Log discrepancies for debugging
            if (clientPerf && serverPerf) {
                const clientPerfPct = clientPerf.summary.performance;
                const serverPerfPct = serverPerf.summary.performance;
                const diff = Math.abs(clientPerfPct - serverPerfPct);

                if (diff > 2) { // More than 2% difference
                    console.warn(`⚠️ [SYNC] Performance mismatch at ${locationKey}: client=${clientPerfPct}%, server=${serverPerfPct}% (diff=${diff}%)`);
                    discrepancyCount++;
                }
            }

            // Server always wins - replace client calculation
            building.clientPerformance = serverPerf;
            syncedCount++;
        }

        console.log(`🔄 [SYNC] Synced ${syncedCount} buildings with server. ${discrepancyCount} discrepancies found.`);
    }
}

// Export for use in game.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClientPerformanceCalculator;
}
