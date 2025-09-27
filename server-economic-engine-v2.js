/**
 * Server Economic Engine v2 - Transaction-Based, Multiplayer-First
 *
 * Architecture:
 * - Transaction-based processing (client sends actions, server calculates)
 * - Single shared global state for all players
 * - Performance = Base × Local Needs × Global JEEFHH × Global CARENS
 * - Real-time updates with smart client deltas
 */

const fs = require('fs');
const path = require('path');

class ServerEconomicEngine {
    constructor() {
        // Global game state - single source of truth
        this.gameState = {
            gameTime: 0,           // Game time in days (0-365 = 1 game year = 1 real hour)
            gameStartTime: Date.now(),

            // Global JEEFHH supply/demand state
            jeefhh: {
                jobs: { supply: 0, demand: 0, multiplier: 1.0 },
                energy: { supply: 0, demand: 0, multiplier: 1.0 },
                education: { supply: 0, demand: 0, multiplier: 1.0 },
                food: { supply: 0, demand: 0, multiplier: 1.0 },
                housing: { supply: 0, demand: 0, multiplier: 1.0 },
                healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
            },

            // Global CARENS livability scores
            carens: {
                culture: 0.8,      // Base score 0.8 (80%)
                affordability: 0.8,
                resilience: 0.8,
                environment: 0.8,
                noise: 0.8,
                safety: 0.8,
                multiplier: 1.0    // Combined multiplier (0.6x to 1.4x)
            },

            // Buildings by location
            buildings: new Map(), // key: "row,col" -> BuildingState

            // Players
            players: new Map(),   // key: playerId -> PlayerState

            // Residents distribution
            totalResidents: 0,
            residentsPerBuilding: new Map() // key: "row,col" -> resident count
        };

        // Building definitions loaded from JSON
        this.buildingDefinitions = new Map();
        this.loadBuildingDefinitions();

        // Game time constants
        this.GAME_DAY_MS = 3600000 / 365; // 1 hour = 1 year, so 1 day = ~9.86 seconds

        // Transaction deduplication and governance integration
        this.processedTransactions = new Set();
        this.governanceSystem = null; // Will be injected by game

        // Performance multiplier ranges
        this.JEEFHH_MULTIPLIER_RANGE = { min: 0.4, max: 1.6 };
        this.CARENS_MULTIPLIER_RANGE = { min: 0.6, max: 1.4 };

        // Connected parcels calculation (8 adjacent + self)
        this.ADJACENCY_OFFSETS = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],            [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        // Transaction processing
        this.pendingTransactions = [];
        this.transactionHistory = [];


        console.log('🏭 Server Economic Engine v2 initialized');
    }

    /**
     * Set the broadcast function for real-time multiplayer updates
     */
    setBroadcastFunction(broadcastFn) {
        this.broadcastFunction = broadcastFn;
        console.log('📡 WebSocket broadcast function connected to economic engine');
    }

    /**
     * Load building definitions from JSON
     */
    loadBuildingDefinitions() {
        try {
            const buildingsPath = path.join(__dirname, 'buildings-data.json');
            const buildingsData = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));

            // Flatten categories into single map
            Object.values(buildingsData).forEach(category => {
                if (Array.isArray(category)) {
                    category.forEach(building => {
                        this.buildingDefinitions.set(building.id, building);
                    });
                }
            });

            console.log(`📋 Loaded ${this.buildingDefinitions.size} building definitions`);
        } catch (error) {
            console.error('❌ Failed to load building definitions:', error);
        }
    }

    /**
     * Update game time and trigger time-based events
     */
    updateGameTime() {
        const now = Date.now();
        const elapsedMs = now - this.gameState.gameStartTime;
        const newGameTime = elapsedMs / this.GAME_DAY_MS; // Convert to game days

        const previousDay = Math.floor(this.gameState.gameTime);
        const currentDay = Math.floor(newGameTime);

        this.gameState.gameTime = newGameTime;

        // Debug: Check if we have buildings
        if (this.gameState.buildings.size > 0) {
            console.log(`⏰ updateGameTime(): ${this.gameState.buildings.size} buildings, day ${newGameTime.toFixed(2)}`);
        }

        // Check for building completion every update (not just daily)
        this.processAutomaticBuildingCompletion();

        // Trigger daily events
        if (currentDay > previousDay) {
            this.processDailyEvents();
        }

        return newGameTime;
    }

    /**
     * Check for buildings that should complete construction automatically
     */
    processAutomaticBuildingCompletion() {
        const now = Date.now();
        const completedBuildings = [];

        if (this.gameState.buildings.size > 0) {
            console.log(`🔍 DEBUG: Checking ${this.gameState.buildings.size} buildings for auto-completion`);
        }

        for (const [locationKey, building] of this.gameState.buildings.entries()) {
            console.log(`🔍 DEBUG: Building at ${locationKey}:`, {
                id: building.id,
                underConstruction: building.underConstruction,
                constructionStartTime: building.constructionStartTime,
                constructionDays: building.constructionDays,
                elapsed: building.constructionStartTime ? (now - building.constructionStartTime) : 'N/A',
                required: building.constructionDays ? (building.constructionDays * this.GAME_DAY_MS) : 'N/A'
            });
            if (building.underConstruction) {
                const constructionElapsed = now - building.constructionStartTime;
                const constructionRequired = building.constructionDays * this.GAME_DAY_MS;

                if (constructionElapsed >= constructionRequired) {
                    // Building should be completed
                    console.log(`🏗️ Auto-completing construction: ${building.id} at ${locationKey} after ${building.constructionDays} days`);

                    // Mark as completed
                    building.underConstruction = false;
                    building.constructionCompleteTime = now;
                    building.age = 0; // Reset age to 0 when completed

                    completedBuildings.push({
                        locationKey,
                        building,
                        location: building.location,
                        buildingId: building.id,
                        playerId: building.ownerId
                    });
                }
            }
        }

        // If any buildings completed, trigger global recalculation
        if (completedBuildings.length > 0) {
            console.log(`✅ ${completedBuildings.length} buildings completed construction automatically`);

            // Recalculate global economics with new completed buildings
            this.recalculateGlobalEconomics();

            // Ensure all completed buildings have performance data before broadcasting
            completedBuildings.forEach(({ locationKey, building }) => {
                const [row, col] = building.location;
                if (!building.performance || !building.performance.summary) {
                    console.log(`⚠️  Building ${building.id} at ${locationKey} missing performance data, recalculating...`);
                    building.performance = this.calculateBuildingPerformance(row, col);
                }
            });

            // Broadcast building completion updates
            completedBuildings.forEach(({ locationKey, building }) => {
                // Broadcast the building completion
                this.broadcastGameState({
                    type: 'ECONOMIC_UPDATE',
                    transaction: {
                        type: 'BUILD_COMPLETE_AUTO',
                        buildingId: building.id,
                        location: building.location,
                        playerId: building.ownerId,
                        timestamp: Date.now()
                    }
                });

                console.log(`📡 Broadcasting BUILD_COMPLETE_AUTO for ${building.id} at ${locationKey}`);
            });
        }
    }

    /**
     * Process daily events (cashflow, resident movement, etc.)
     */
    processDailyEvents() {
        // Only log every 10th day to reduce log spam
        const currentDay = Math.floor(this.gameState.gameTime);
        if (currentDay % 10 === 0) {
            console.log(`📅 Game Day ${currentDay} - Processing daily events`);
        }

        // Building completion is now checked every second in updateGameTime()

        // Update resident distribution based on JEEFHH availability
        this.updateResidentDistribution();

        // Process daily LVT collection
        this.processDailyLVT();

        // Calculate daily cashflow for all players
        this.calculateAllPlayerCashflows();

        // Age buildings
        this.ageAllBuildings();

        // Broadcast daily updates to clients
        // Use unified broadcast for daily updates
        this.broadcastGameState({ type: 'DAILY_UPDATE', source: 'timer' });
    }

    /**
     * CORE TRANSACTION PROCESSING
     */

    /**
     * Process a transaction from a client
     */
    async processTransaction(transaction) {
        console.log('🔄 Processing transaction:', transaction.type, transaction);

        // Add unique transaction ID for deduplication
        transaction.id = transaction.id || `${transaction.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Check for duplicate transaction
        if (this.processedTransactions && this.processedTransactions.has(transaction.id)) {
            throw new Error(`Duplicate transaction: ${transaction.id}`);
        }

        try {
            let result = null;

            switch (transaction.type) {
                case 'BUILD_START':
                    result = await this.processBuildStart(transaction);
                    await this.processTreasuryEffects(transaction, result);
                    break;

                case 'BUILD_COMPLETE':
                    result = await this.processBuildComplete(transaction);
                    await this.updateEconomicIndicators(transaction, result);
                    break;

                case 'DESTROY_BUILDING':
                    result = await this.processDestroyBuilding(transaction);
                    await this.processTreasuryEffects(transaction, result);
                    await this.updateEconomicIndicators(transaction, result);
                    break;

                case 'REPAIR_BUILDING':
                    result = await this.processRepairBuilding(transaction);
                    break;

                case 'PARCEL_PURCHASE':
                    result = await this.processParcelPurchase(transaction);
                    await this.processTreasuryEffects(transaction, result);
                    break;

                case 'CASH_SPEND':
                    result = await this.processCashSpend(transaction);
                    break;

                default:
                    throw new Error(`Unknown transaction type: ${transaction.type}`);
            }

            // Add to history
            transaction.processed = Date.now();
            transaction.result = result;
            this.transactionHistory.push(transaction);

            // Recalculate global economics after any building change
            if (['BUILD_START', 'BUILD_COMPLETE', 'DESTROY_BUILDING', 'REPAIR_BUILDING'].includes(transaction.type)) {
                this.recalculateGlobalEconomics();
            }

            // Mark transaction as processed for deduplication
            this.markTransactionProcessed(transaction);

            // Broadcast state changes to all clients with event context
            this.broadcastGameState('TRANSACTION_COMPLETE', {
                transactionType: transaction.type,
                transaction: transaction,
                result: result
            });

            return {
                success: true,
                transaction,
                result,
                gameTime: this.gameState.gameTime
            };

        } catch (error) {
            console.error('❌ Transaction failed:', error);
            return {
                success: false,
                error: error.message,
                transaction
            };
        }
    }

    /**
     * Process building construction start
     */
    async processBuildStart(transaction) {
        const { buildingId, location, playerId, cost } = transaction;
        const [row, col] = location;
        const locationKey = `${row},${col}`;

        // Validate player can afford
        const player = this.getOrCreatePlayer(playerId);
        if (player.cash < cost) {
            throw new Error(`Insufficient funds: need ${cost}, have ${player.cash}`);
        }

        // Check location availability (collision detection)
        const existingBuilding = this.gameState.buildings.get(locationKey);
        if (existingBuilding) {
            throw new Error(`Location already occupied`);
        }

        // Get building definition
        const buildingDef = this.buildingDefinitions.get(buildingId);
        if (!buildingDef) {
            throw new Error(`Unknown building: ${buildingId}`);
        }

        // Deduct cost
        player.cash -= cost;
        player.transactions.push({
            type: 'BUILD_COST',
            amount: -cost,
            timestamp: Date.now(),
            description: `Built ${buildingDef.name}`
        });

        // Create building in construction state
        const building = {
            id: buildingId,
            ownerId: playerId,
            location: [row, col],
            constructionStartTime: Date.now(),
            constructionDays: buildingDef.economics?.constructionDays || 14,
            underConstruction: true,
            age: 0,
            decay: 0,
            condition: 1.0,
            performance: null // Will be calculated after construction
        };

        this.gameState.buildings.set(locationKey, building);

        console.log(`🏗️ Construction started: ${buildingId} at ${locationKey} by ${playerId}`);

        return {
            buildingId,
            location,
            constructionTimeRemaining: building.constructionDays * this.GAME_DAY_MS,
            playerCash: player.cash,
            newBalance: player.cash,
            wealth: player.wealth
        };
    }

    /**
     * Process building construction completion
     */
    async processBuildComplete(transaction) {
        const { location } = transaction;
        const [row, col] = location;
        const locationKey = `${row},${col}`;

        const building = this.gameState.buildings.get(locationKey);
        if (!building) {
            throw new Error(`No building at location ${locationKey}`);
        }

        if (!building.underConstruction) {
            throw new Error(`Building at ${locationKey} is not under construction`);
        }

        // Mark construction complete
        building.underConstruction = false;
        building.constructionCompleteTime = Date.now();

        // Calculate initial performance
        const performance = this.calculateBuildingPerformance(row, col);
        building.performance = performance;

        console.log(`🏗️ Construction completed: ${building.id} at ${locationKey}`);

        return {
            location,
            buildingId: building.id,
            performance: performance.summary // Just final numbers for client
        };
    }

    /**
     * Process building destruction
     */
    async processDestroyBuilding(transaction) {
        const { location, playerId } = transaction;
        const [row, col] = location;
        const locationKey = `${row},${col}`;

        const building = this.gameState.buildings.get(locationKey);
        if (!building) {
            throw new Error(`No building at location ${locationKey}`);
        }

        // Check ownership
        if (building.ownerId !== playerId) {
            throw new Error(`Player ${playerId} does not own building at ${locationKey}`);
        }

        // Calculate demolition cost (25% of current building value)
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            throw new Error(`Building definition not found: ${building.id}`);
        }

        const buildingValue = buildingDef.economics.cost || 0;
        const demolitionCost = buildingValue * 0.25; // 25% of current value

        // Check if player can afford demolition
        const player = this.getOrCreatePlayer(playerId);
        if (player.cash < demolitionCost) {
            throw new Error(`Insufficient funds for demolition: need $${demolitionCost.toFixed(2)}, have $${player.cash.toFixed(2)}`);
        }

        // Charge demolition cost
        player.cash -= demolitionCost;
        player.transactions.push({
            type: 'DEMOLITION_COST',
            amount: -demolitionCost,
            timestamp: Date.now(),
            description: `Demolition of ${building.id}`
        });

        // Remove building
        this.gameState.buildings.delete(locationKey);

        // Remove residents
        this.gameState.residentsPerBuilding.delete(locationKey);

        console.log(`🗑️ Building destroyed: ${building.id} at ${locationKey} (cost: $${demolitionCost.toFixed(2)})`);

        return {
            location,
            destroyed: true,
            demolitionCost,
            newBalance: player.cash
        };
    }

    /**
     * ECONOMIC CALCULATIONS
     */

    /**
     * Recalculate global JEEFHH and CARENS after building changes
     */
    recalculateGlobalEconomics() {
        this.calculateGlobalJEEFHH();
        this.calculateGlobalCARENS();
        this.recalculateAllBuildingPerformances();
    }

    /**
     * Calculate global JEEFHH supply/demand and multipliers
     */
    calculateGlobalJEEFHH() {
        // Reset supply/demand
        Object.keys(this.gameState.jeefhh).forEach(resource => {
            this.gameState.jeefhh[resource].supply = 0;
            this.gameState.jeefhh[resource].demand = 0;
        });

        // Sum from all completed buildings
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (!buildingDef || !buildingDef.economics) continue;

            const econ = buildingDef.economics;
            const residents = this.gameState.residentsPerBuilding.get(locationKey) || 0;

            // Supply contributions
            this.gameState.jeefhh.jobs.supply += econ.jobsProvided || 0;
            this.gameState.jeefhh.energy.supply += econ.energyProvided || 0;
            this.gameState.jeefhh.education.supply += econ.educationProvided || 0;
            this.gameState.jeefhh.food.supply += econ.foodProvided || 0;
            this.gameState.jeefhh.housing.supply += econ.housingProvided || 0;
            this.gameState.jeefhh.healthcare.supply += econ.healthcareProvided || 0;

            // Demand contributions (building + residents)
            this.gameState.jeefhh.energy.demand += econ.energyRequired || 0;

            // Resident-based demand (residents need jobs, food, education, healthcare)
            this.gameState.jeefhh.jobs.demand += residents * 0.5; // Not all residents work
            this.gameState.jeefhh.food.demand += residents * 1.0; // Everyone needs food
            this.gameState.jeefhh.education.demand += residents * 0.2; // Some need education
            this.gameState.jeefhh.healthcare.demand += residents * 0.3; // Some need healthcare
        }

        // Calculate multipliers (0.4x to 1.6x based on supply/demand ratio)
        Object.keys(this.gameState.jeefhh).forEach(resource => {
            const res = this.gameState.jeefhh[resource];
            if (res.demand === 0) {
                res.multiplier = 1.0; // No demand = neutral
            } else {
                const ratio = res.supply / res.demand;
                // Convert ratio to multiplier: 0.5 ratio = 0.4x, 1.0 ratio = 1.0x, 2.0 ratio = 1.6x
                res.multiplier = Math.max(this.JEEFHH_MULTIPLIER_RANGE.min,
                                        Math.min(this.JEEFHH_MULTIPLIER_RANGE.max,
                                               0.4 + (ratio * 0.6)));
            }
        });

        console.log('📊 Global JEEFHH updated:', this.gameState.jeefhh);
    }

    /**
     * Calculate global CARENS scores and multiplier
     */
    calculateGlobalCARENS() {
        // For now, base CARENS calculation
        // TODO: Factor in JEEFHH surpluses/deficits affecting CARENS

        const carens = this.gameState.carens;

        // Simple average for now
        const avgScore = (carens.culture + carens.affordability + carens.resilience +
                         carens.environment + carens.noise + carens.safety) / 6;

        // Convert to multiplier (0.6x to 1.4x)
        carens.multiplier = 0.6 + (avgScore * 0.8);

        console.log('🏛️ Global CARENS updated:', carens);
    }

    /**
     * Calculate performance for a specific building
     */
    calculateBuildingPerformance(row, col) {
        const locationKey = `${row},${col}`;
        const building = this.gameState.buildings.get(locationKey);

        if (!building || building.underConstruction) {
            return null;
        }

        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            return null;
        }

        const econ = buildingDef.economics;
        const baseRevenue = econ.maxRevenue || 0;

        // 1. Local needs satisfaction (from connected parcels)
        const localNeedsSatisfaction = this.calculateLocalNeedsSatisfaction(row, col);

        // 2. Global JEEFHH multiplier (affects ALL buildings based on global state)
        const jeefhhMultiplier = this.calculateGlobalJEEFHHMultiplier();

        // 3. Local CARENS multiplier (based on adjacent parcels)
        const carensMultiplier = this.calculateLocalCARENSMultiplier(row, col);

        // 4. Condition/decay factor
        const conditionFactor = building.condition || 1.0;

        // Final revenue calculation
        const actualRevenue = baseRevenue * localNeedsSatisfaction * jeefhhMultiplier * carensMultiplier * conditionFactor;

        // Maintenance calculation
        const baseMaintenance = econ.maintenance || 0;
        const actualMaintenance = baseMaintenance * (2.0 - building.condition); // Higher maintenance for poor condition

        const performance = {
            location: [row, col],
            buildingId: building.id,

            // Summary for client tooltips
            summary: {
                revenue: Math.round(actualRevenue * 100) / 100,
                maintenance: Math.round(actualMaintenance * 100) / 100,
                netIncome: Math.round((actualRevenue - actualMaintenance) * 100) / 100
            },

            // Detailed breakdown for data insights
            detailed: {
                baseRevenue,
                localNeedsSatisfaction,
                jeefhhMultiplier,
                carensMultiplier,
                conditionFactor,
                actualRevenue,
                baseMaintenance,
                actualMaintenance,
                breakdown: {
                    base: baseRevenue,
                    afterNeeds: baseRevenue * localNeedsSatisfaction,
                    afterJEEFHH: baseRevenue * localNeedsSatisfaction * jeefhhMultiplier,
                    afterCARENS: baseRevenue * localNeedsSatisfaction * jeefhhMultiplier * carensMultiplier,
                    final: actualRevenue
                }
            }
        };

        return performance;
    }

    /**
     * Calculate local needs satisfaction from connected parcels (adjacent 8)
     */
    calculateLocalNeedsSatisfaction(row, col) {
        const building = this.gameState.buildings.get(`${row},${col}`);
        const buildingDef = this.buildingDefinitions.get(building.id);

        if (!buildingDef.economics.energyRequired) {
            return 1.0; // No local needs = fully satisfied
        }

        // Get connected buildings (8 adjacent)
        const connectedSupply = { energy: 0 };

        this.ADJACENCY_OFFSETS.forEach(([dr, dc]) => {
            const connectedKey = `${row + dr},${col + dc}`;
            const connectedBuilding = this.gameState.buildings.get(connectedKey);

            if (connectedBuilding && !connectedBuilding.underConstruction) {
                const connectedDef = this.buildingDefinitions.get(connectedBuilding.id);
                if (connectedDef && connectedDef.economics) {
                    connectedSupply.energy += connectedDef.economics.energyProvided || 0;
                }
            }
        });

        // Calculate satisfaction ratio with a minimum baseline (25% operation without energy)
        const energyNeeded = buildingDef.economics.energyRequired;
        const energySatisfaction = Math.min(1.0, connectedSupply.energy / energyNeeded);

        // Buildings can operate at 25% minimum even without all needs met
        // This ensures early game viability
        const minOperation = 0.25;
        return Math.max(minOperation, energySatisfaction);
    }

    /**
     * Calculate JEEFHH multiplier for a specific building type
     */
    calculateGlobalJEEFHHMultiplier() {
        // JEEFHH is truly global: all buildings affected by the worst-performing resource
        // When housing is in oversupply, ALL residential buildings earn less regardless of individual needs

        const jeefhh = this.gameState.jeefhh;

        // Find the most problematic (lowest multiplier) JEEFHH resource
        const multipliers = [
            jeefhh.jobs.multiplier,
            jeefhh.energy.multiplier,
            jeefhh.education.multiplier,
            jeefhh.food.multiplier,
            jeefhh.housing.multiplier,
            jeefhh.healthcare.multiplier
        ];

        // Use the minimum multiplier to represent global economic stress
        const globalMultiplier = Math.min(...multipliers);

        console.log(`🌐 Global JEEFHH multiplier: ${globalMultiplier.toFixed(3)} (worst: ${Math.min(...multipliers).toFixed(3)})`);

        return globalMultiplier;
    }

    /**
     * Calculate local CARENS multiplier based on adjacent parcels
     */
    calculateLocalCARENSMultiplier(row, col) {
        // Start with global baseline CARENS scores
        const globalCarens = this.gameState.carens;

        // Local CARENS scores start from global baseline
        const localCarens = {
            culture: globalCarens.culture,
            affordability: globalCarens.affordability,
            resilience: globalCarens.resilience,
            environment: globalCarens.environment,
            noise: globalCarens.noise,
            safety: globalCarens.safety
        };

        // Examine surrounding area for local CARENS impacts
        const maxRange = 5; // Check up to 5 parcels away
        for (let r = row - maxRange; r <= row + maxRange; r++) {
            for (let c = col - maxRange; c <= col + maxRange; c++) {
                if (r === row && c === col) continue; // Skip self

                const locationKey = `${r},${c}`;
                const adjacentBuilding = this.gameState.buildings.get(locationKey);

                if (adjacentBuilding && !adjacentBuilding.underConstruction) {
                    const buildingDef = this.buildingDefinitions.get(adjacentBuilding.id);

                    if (buildingDef?.livability) {
                        const distance = Math.max(Math.abs(r - row), Math.abs(c - col));

                        // Apply each CARENS category with its specific range and effect
                        Object.keys(localCarens).forEach(category => {
                            const livabilityData = buildingDef.livability[category];

                            // Handle both old format (number) and new format (object with effect/range)
                            let effect, range;
                            if (typeof livabilityData === 'object' && livabilityData !== null) {
                                effect = livabilityData.effect || 0;
                                range = livabilityData.range || 2;
                            } else {
                                // Legacy format - simple number
                                effect = livabilityData || 0;
                                range = 2; // Default range
                            }

                            // Only apply effect if within range
                            if (effect !== 0 && distance <= range) {
                                // Distance attenuation: closer buildings have more impact
                                const attenuation = 1.0 / (1.0 + distance * 0.3);
                                localCarens[category] += effect * attenuation;
                            }
                        });
                    }
                }
            }
        }

        // Clamp local scores to reasonable bounds (0.1 to 1.5)
        Object.keys(localCarens).forEach(key => {
            localCarens[key] = Math.max(0.1, Math.min(1.5, localCarens[key]));
        });

        // Convert to multiplier (similar to global CARENS calculation)
        const avgLocalScore = (localCarens.culture + localCarens.affordability + localCarens.resilience +
                              localCarens.environment + localCarens.noise + localCarens.safety) / 6;

        // Convert to multiplier (0.6x to 1.4x)
        const localMultiplier = 0.6 + (avgLocalScore * 0.8);

        return localMultiplier;
    }

    /**
     * Recalculate performance for all buildings
     */
    recalculateAllBuildingPerformances() {
        for (const [locationKey, building] of this.gameState.buildings) {
            if (!building.underConstruction) {
                const [row, col] = building.location;
                building.performance = this.calculateBuildingPerformance(row, col);
            }
        }
    }

    /**
     * RESIDENT DISTRIBUTION
     */

    /**
     * Update resident distribution based on JEEFHH availability
     */
    updateResidentDistribution() {
        // Simple model: residents move to where core JEEFHH (jobs, energy, housing, food) are available
        const coreAvailable = Math.min(
            this.gameState.jeefhh.jobs.supply,
            this.gameState.jeefhh.energy.supply,
            this.gameState.jeefhh.housing.supply,
            this.gameState.jeefhh.food.supply
        );

        const targetResidents = Math.floor(coreAvailable);

        // Distribute residents to housing buildings
        this.gameState.residentsPerBuilding.clear();
        let residentsToPlace = targetResidents;

        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction || residentsToPlace <= 0) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.economics && buildingDef.economics.housingProvided > 0) {
                const capacity = buildingDef.economics.housingProvided;
                const residentsHere = Math.min(capacity, residentsToPlace);
                this.gameState.residentsPerBuilding.set(locationKey, residentsHere);
                residentsToPlace -= residentsHere;
            }
        }

        this.gameState.totalResidents = targetResidents - residentsToPlace;

        // Only log residents updates when there's a meaningful change
        if (this.gameState.totalResidents > 0) {
            console.log(`👥 Residents updated: ${this.gameState.totalResidents} total`);
        }
    }

    /**
     * PLAYER MANAGEMENT
     */

    /**
     * Get or create player state
     */
    getOrCreatePlayer(playerId) {
        if (!this.gameState.players.has(playerId)) {
            this.gameState.players.set(playerId, {
                id: playerId,
                cash: 6000, // Starting cash
                wealth: 6000, // Cash + land values
                transactions: [],
                buildings: [],
                lastCashflowUpdate: 0
            });
        }
        return this.gameState.players.get(playerId);
    }

    /**
     * Calculate cashflow for all players (called daily)
     */
    calculateAllPlayerCashflows() {
        for (const [playerId, player] of this.gameState.players) {
            this.calculatePlayerCashflow(playerId);
        }
    }

    /**
     * Calculate cashflow for a specific player
     */
    calculatePlayerCashflow(playerId) {
        const player = this.getOrCreatePlayer(playerId);

        let totalRevenue = 0;
        let totalMaintenance = 0;
        const buildingBreakdown = [];

        // Sum from player's buildings
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.ownerId === playerId && !building.underConstruction && building.performance && building.performance.summary) {
                const perf = building.performance.summary;
                totalRevenue += perf.revenue || 0;
                totalMaintenance += perf.maintenance || 0;

                buildingBreakdown.push({
                    location: building.location,
                    buildingId: building.id,
                    revenue: perf.revenue || 0,
                    maintenance: perf.maintenance || 0,
                    netIncome: perf.netIncome || 0
                });
            }
        }

        const netCashflow = totalRevenue - totalMaintenance;

        // Update player cash
        player.cash += netCashflow;
        player.lastCashflowUpdate = Date.now();

        // Add transaction record
        if (netCashflow !== 0) {
            player.transactions.push({
                type: 'DAILY_CASHFLOW',
                amount: netCashflow,
                timestamp: Date.now(),
                description: `Daily cashflow: ${buildingBreakdown.length} buildings`
            });
        }

        // Calculate wealth (cash + building values)
        let buildingValues = 0;
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.ownerId === playerId) {
                const buildingDef = this.buildingDefinitions.get(building.id);
                if (buildingDef && buildingDef.economics) {
                    buildingValues += buildingDef.economics.cost || 0;
                }
            }
        }
        player.wealth = player.cash + buildingValues;

        // Only log cashflow if there's actual activity (non-zero or significant change)
        if (netCashflow !== 0 || buildingBreakdown.length > 0) {
            console.log(`💰 Cashflow calculated for ${playerId}: ${netCashflow.toFixed(2)} (${buildingBreakdown.length} buildings)`);
        }

        return {
            playerId,
            totalRevenue,
            totalMaintenance,
            netCashflow,
            cash: player.cash,
            wealth: player.wealth,
            buildingBreakdown
        };
    }

    /**
     * Age all buildings
     */
    ageAllBuildings() {
        for (const [locationKey, building] of this.gameState.buildings) {
            building.age += 1; // Age in game days

            // Simple decay model: 1% decay per 365 days
            const decayRate = 0.01 / 365;
            building.decay += decayRate;
            building.condition = Math.max(0.1, 1.0 - building.decay);
        }
    }

    /**
     * CLIENT COMMUNICATION
     */


    /**
     * Robust server-authoritative state broadcaster
     * Sends complete, normalized game state to all clients
     */
    broadcastGameState(eventType = 'STATE_UPDATE', eventData = {}) {
        // Convert buildings Map to normalized array
        const buildings = [];
        this.gameState.buildings.forEach((building, locationKey) => {
            // Include performance data directly in building object
            const performance = this.calculateBuildingPerformance(building);

            buildings.push({
                id: building.id,
                ownerId: building.ownerId,
                location: building.location,
                locationKey: locationKey,
                underConstruction: building.underConstruction,
                constructionStartTime: building.constructionStartTime,
                constructionDays: building.constructionDays,
                age: building.age,
                decay: building.decay,
                condition: building.condition,
                // Performance data for immediate client use
                residents: performance?.residents || 0,
                workers: performance?.workers || 0,
                efficiency: performance?.efficiency || 1.0,
                revenue: performance?.revenue || 0,
                expenses: performance?.expenses || 0,
                netIncome: performance?.netIncome || 0
            });
        });

        // Convert players Map to normalized object
        const players = {};
        this.gameState.players.forEach((player, playerId) => {
            players[playerId] = {
                id: playerId,
                cash: player.cash,
                wealth: player.wealth,
                transactions: player.transactions || []
            };
        });

        // Calculate cashflow for all players
        const cashflowData = {};
        this.gameState.players.forEach((player, playerId) => {
            cashflowData[playerId] = this.getPlayerCashflowDetails(playerId);
        });

        // Create complete, authoritative game state message
        const gameStateMessage = {
            type: 'GAME_STATE',
            eventType: eventType,
            eventData: eventData,
            timestamp: Date.now(),
            gameState: {
                gameTime: this.gameState.gameTime,
                gameDay: Math.floor(this.gameState.gameTime),
                totalResidents: this.gameState.totalResidents,
                jeefhh: this.gameState.jeefhh,
                carens: { multiplier: this.gameState.carens.multiplier },
                buildings: buildings,
                players: players,
                cashflow: cashflowData
            }
        };

        console.log(`📡 Broadcasting complete game state: ${buildings.length} buildings, ${Object.keys(players).length} players, event: ${eventType}`);

        // Broadcast complete state to all clients
        if (this.broadcastFunction) {
            try {
                this.broadcastFunction(gameStateMessage);
            } catch (error) {
                console.error('❌ Failed to broadcast game state:', error);
            }
        }
    }

    /**
     * Calculate building performance data for inclusion in game state
     */
    calculateBuildingPerformance(building) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || building.underConstruction) {
            return {
                residents: 0,
                workers: 0,
                efficiency: 0,
                revenue: 0,
                expenses: 0,
                netIncome: 0
            };
        }

        const economics = buildingDef.economics || {};
        const baseResidents = economics.residents || 0;
        const baseWorkers = economics.jobs || 0;
        const efficiency = building.condition || 1.0;

        const residents = Math.floor(baseResidents * efficiency);
        const workers = Math.floor(baseWorkers * efficiency);
        const revenue = residents * 100; // Example calculation
        const expenses = Math.floor(economics.maintenance || 50);
        const netIncome = revenue - expenses;

        return {
            residents,
            workers,
            efficiency,
            revenue,
            expenses,
            netIncome
        };
    }



    /**
     * Get detailed building performance (for data insights)
     */
    getBuildingDetailedPerformance(row, col) {
        const locationKey = `${row},${col}`;
        const building = this.gameState.buildings.get(locationKey);

        if (!building || building.underConstruction) {
            return null;
        }

        // Return full detailed breakdown
        return building.performance;
    }

    /**
     * Get player cashflow details
     */
    getPlayerCashflowDetails(playerId) {
        const player = this.getOrCreatePlayer(playerId);
        return this.calculatePlayerCashflow(playerId);
    }

    /**
     * 🎲 BOARD GAME RESET: Reset the entire game state to Day 1
     * Called when a player starts a fresh game session
     */
    resetGameState() {
        console.log('🎲 Board game reset: Resetting economic engine to Day 1...');

        // Reset game time to start fresh
        this.gameState.gameTime = 0;
        this.gameState.gameStartTime = Date.now();

        // Clear all buildings
        this.gameState.buildings.clear();

        // Clear all players
        this.gameState.players.clear();

        // Reset JEEFHH to defaults
        this.gameState.jeefhh = {
            jobs: { supply: 0, demand: 0, multiplier: 1.0 },
            energy: { supply: 0, demand: 0, multiplier: 1.0 },
            education: { supply: 0, demand: 0, multiplier: 1.0 },
            food: { supply: 0, demand: 0, multiplier: 1.0 },
            housing: { supply: 0, demand: 0, multiplier: 1.0 },
            healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
        };

        // Reset CARENS to defaults
        this.gameState.carens = {
            culture: 0.8,
            affordability: 0.8,
            resilience: 0.8,
            environment: 0.8,
            noise: 0.8,
            safety: 0.8,
            multiplier: 1.0
        };

        // Reset residents
        this.gameState.totalResidents = 0;
        this.gameState.residentsPerBuilding.clear();

        // Clear transaction history
        this.pendingTransactions = [];
        this.transactionHistory = [];


        console.log('✅ Economic engine reset complete - fresh board game state');
    }

    /**
     * Process parcel purchase transaction
     */
    async processParcelPurchase(transaction) {
        const { playerId, cost, location, description } = transaction;

        console.log(`💰 Processing parcel purchase: ${playerId} spending $${cost} for ${description || 'parcel'}`);

        // Get or create player
        const player = this.getOrCreatePlayer(playerId);

        // Check if player has enough cash
        if (player.cash < cost) {
            console.log(`❌ Insufficient funds: ${player.cash} < ${cost}`);
            return {
                success: false,
                error: 'Insufficient funds',
                currentBalance: player.cash,
                requiredAmount: cost
            };
        }

        // Deduct cash
        player.cash -= cost;

        // Record transaction
        player.transactions.push({
            type: 'PARCEL_PURCHASE',
            amount: -cost,
            description: description || 'Parcel Purchase',
            location,
            timestamp: Date.now()
        });

        console.log(`✅ Parcel purchase successful: ${playerId} balance ${player.cash + cost} → ${player.cash}`);

        return {
            success: true,
            newBalance: player.cash,
            transaction: {
                amount: cost,
                description: description || 'Parcel Purchase',
                location
            }
        };
    }

    /**
     * Process general cash spending transaction
     */
    async processCashSpend(transaction) {
        const { playerId, amount, description } = transaction;

        console.log(`💰 Processing cash spend: ${playerId} spending $${amount} for ${description || 'purchase'}`);

        // Get or create player
        const player = this.getOrCreatePlayer(playerId);

        // Check if player has enough cash
        if (player.cash < amount) {
            console.log(`❌ Insufficient funds: ${player.cash} < ${amount}`);
            return {
                success: false,
                error: 'Insufficient funds',
                currentBalance: player.cash,
                requiredAmount: amount
            };
        }

        // Deduct cash
        player.cash -= amount;

        // Record transaction
        player.transactions.push({
            type: 'CASH_SPEND',
            amount: -amount,
            description: description || 'Purchase',
            timestamp: Date.now()
        });

        console.log(`✅ Cash spend successful: ${playerId} balance ${player.cash + amount} → ${player.cash}`);

        return {
            success: true,
            newBalance: player.cash,
            transaction: {
                amount,
                description: description || 'Purchase'
            }
        };
    }

    /**
     * Handle treasury effects from transactions (parcel costs, LVT fees)
     */
    async processTreasuryEffects(transaction, result) {
        if (!this.governanceSystem) {
            console.warn('⚠️ No governance system connected - skipping treasury effects');
            return;
        }

        let treasuryAmount = 0;
        let description = '';

        switch (transaction.type) {
            case 'BUILD_START':
                // NO treasury effects for building construction - player pays for materials/labor only
                break;

            case 'PARCEL_PURCHASE':
                // 100% of parcel purchase goes to treasury (buying city-owned land)
                treasuryAmount = transaction.cost;
                description = `Parcel purchase at ${transaction.location}`;
                break;

            case 'DESTROY_BUILDING':
                // NO treasury effects for demolition - player pays 25% of current building value for destruction costs
                // (This is a private cost, not a public revenue)
                break;
        }

        if (treasuryAmount > 0) {
            this.governanceSystem.addToTreasury(treasuryAmount, description);
            console.log(`💰 Treasury: +$${treasuryAmount.toLocaleString()} from ${description}`);
        }
    }

    /**
     * Process daily LVT collection for all player-owned parcels
     * Called automatically every game day (~9.86 seconds)
     */
    async processDailyLVT() {
        if (!this.governanceSystem) {
            console.warn('⚠️ No governance system connected - skipping daily LVT');
            return;
        }

        const lvtRate = this.governanceSystem.governance.taxPolicy.taxRate || 0.50; // Use governance rate (0-338%)
        let totalLVT = 0;

        console.log(`🏛️ Daily LVT Assessment (Rate: ${Math.round(lvtRate * 100)}%)`);

        // Assess LVT on all completed buildings
        for (const [locationKey, building] of this.gameState.buildings) {
            if (!building.underConstruction) {
                const buildingDef = this.buildingDefinitions.get(building.id);
                if (buildingDef && buildingDef.economics) {
                    const landValue = buildingDef.economics.cost || 0;
                    const dailyLVT = (landValue * lvtRate) / 365; // Daily portion of annual LVT

                    if (dailyLVT > 0) {
                        // Deduct from player
                        const player = this.getOrCreatePlayer(building.ownerId);
                        if (player.cash >= dailyLVT) {
                            player.cash -= dailyLVT;
                            this.governanceSystem.addToTreasury(dailyLVT, `Daily LVT from ${building.id}`);
                            totalLVT += dailyLVT;

                            // Record transaction
                            player.transactions.push({
                                type: 'LVT_PAYMENT',
                                amount: -dailyLVT,
                                timestamp: Date.now(),
                                description: `LVT on ${building.id}`
                            });
                        } else {
                            console.warn(`⚠️ ${building.ownerId} cannot pay LVT of $${dailyLVT.toFixed(2)} for ${building.id}`);
                        }
                    }
                }
            }
        }

        if (totalLVT > 0) {
            console.log(`💰 Daily LVT collected: $${totalLVT.toFixed(2)}`);
        }
    }

    /**
     * Update JEEFHH and CARENS indicators when buildings change
     */
    async updateEconomicIndicators(transaction, result) {
        const [row, col] = transaction.location;
        const locationKey = `${row},${col}`;
        const building = this.gameState.buildings.get(locationKey);

        if (building) {
            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.economics) {

                // Update JEEFHH based on building type
                if (buildingDef.economics.jeefhh) {
                    for (const [category, impact] of Object.entries(buildingDef.economics.jeefhh)) {
                        if (this.gameState.jeefhh[category] !== undefined) {
                            const change = transaction.type === 'BUILD_COMPLETE' ? impact : -impact;
                            this.gameState.jeefhh[category] = Math.max(0, Math.min(1,
                                this.gameState.jeefhh[category] + change
                            ));
                        }
                    }
                }

                // Update CARENS based on building type
                if (buildingDef.economics.carens) {
                    for (const [category, impact] of Object.entries(buildingDef.economics.carens)) {
                        if (this.gameState.carens[category] !== undefined) {
                            const change = transaction.type === 'BUILD_COMPLETE' ? impact : -impact;
                            this.gameState.carens[category] = Math.max(0, Math.min(1,
                                this.gameState.carens[category] + change
                            ));
                        }
                    }
                }

                console.log(`📊 Economic indicators updated for ${building.id}`);
            }
        }
    }

    /**
     * Mark transaction as processed to prevent duplicates
     */
    markTransactionProcessed(transaction) {
        if (transaction.id) {
            this.processedTransactions.add(transaction.id);

            // Clean up old transactions (keep last 1000)
            if (this.processedTransactions.size > 1000) {
                const toDelete = Array.from(this.processedTransactions).slice(0, 200);
                toDelete.forEach(id => this.processedTransactions.delete(id));
            }
        }
    }

    /**
     * Set governance system reference for treasury integration
     */
    setGovernanceSystem(governanceSystem) {
        this.governanceSystem = governanceSystem;
        console.log('🏛️ Governance system connected to economic engine');
    }
}

module.exports = ServerEconomicEngine;