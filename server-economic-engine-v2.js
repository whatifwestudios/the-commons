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
            gameStarted: false,    // Track pre-game vs in-game state globally

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
                culture: 0.5,      // Base score 0.5 (neutral baseline = 0 points)
                affordability: 0.5,
                resilience: 0.5,
                environment: 0.5,
                noise: 0.5,
                safety: 0.5,
                multiplier: 1.0    // Combined multiplier (0.6x to 1.4x)
            },

            // Buildings by location
            buildings: new Map(), // key: "row,col" -> BuildingState

            // Grid/Parcel ownership state (server-authoritative)
            grid: null, // Will be initialized as 2D array by initializeGrid()

            // Players
            players: new Map(),   // key: playerId -> PlayerState
            playerBalances: new Map(), // key: playerId -> cash balance (server-authoritative)
            playerActions: new Map(), // key: playerId -> action inventory (server-authoritative)

            // Action Marketplace
            actionMarketplace: {
                nextListingId: 1,
                listings: new Map(), // key: listingId -> AuctionListing
                priceHistory: [],
                avgPrice: 0
            },

            // Residents distribution with age demographics
            totalResidents: 0,
            residentsPerBuilding: new Map(), // key: "row,col" -> resident count
            demographics: {
                children: 0,
                adults: 0,
                seniors: 0,
                total: 0
            },
            demographicsPerBuilding: new Map(), // key: "row,col" -> {children, adults, seniors, total}

            // Emigration tracking for sustained poor conditions
            emigrationTracking: {
                poorConditionsDays: 0,   // Days attractiveness has been < 0.95
                lastAttractivenessCheck: 0  // Last attractiveness value
            }
        };

        // Building definitions loaded from JSON
        this.buildingDefinitions = new Map();
        this.loadBuildingDefinitions();

        // Initialize server-authoritative grid
        this.initializeGrid(12);

        // Game time constants
        this.GAME_DAY_MS = 3600000 / 365; // 1 hour = 1 year, so 1 day = ~9.86 seconds

        // Transaction deduplication and governance integration
        this.processedTransactions = new Set();
        this.governanceSystem = null; // Will be injected by game

        // Performance multiplier ranges
        this.JEEFHH_MULTIPLIER_RANGE = { min: 0.4, max: 1.6 };
        this.CARENS_MULTIPLIER_RANGE = { min: 0.6, max: 1.4 };

        // Population requirements by age group (from buildings.js)
        this.POPULATION_REQUIREMENTS = {
            food: { children: 3, adults: 8, seniors: 6 },        // Daily consumption
            jobs: { children: 0, adults: 1, seniors: 0 },        // Work patterns
            education: { children: 1, adults: 0.1, seniors: 0 }, // Learning needs
            healthcare: { children: 0.5, adults: 1, seniors: 2 }, // Medical needs
            housing: { children: 0.5, adults: 1, seniors: 1 }    // Bedroom sharing
        };

        // Population growth/decline factors
        this.POPULATION_DYNAMICS = {
            baseGrowthRate: 0.02,        // 2% growth per game year under ideal conditions
            migrationSensitivity: 0.5,   // How much economic conditions affect migration
            ageTransitionRate: 0.05,     // Rate at which children become adults, adults become seniors
            maxPopulationDensity: 100,   // Maximum residents per parcel (prevents infinite growth)
            economicAttractionThreshold: 0.8  // JEEFHH multiplier threshold for population attraction
        };

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
     * Initialize server-authoritative grid
     */
    initializeGrid(gridSize = 12) {
        this.gameState.grid = [];
        this.gameState.gridSize = gridSize;
        for (let row = 0; row < gridSize; row++) {
            this.gameState.grid[row] = [];
            for (let col = 0; col < gridSize; col++) {
                this.gameState.grid[row][col] = {
                    owner: 'City',
                    building: null,
                    buildingAge: 0,
                    decay: 0,
                    population: 0
                };
            }
        }
        console.log(`🏞️ Server grid initialized: ${gridSize}x${gridSize} parcels`);
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

        // Game time progresses continuously

        // Check for building completion every update (not just daily)
        this.processAutomaticBuildingCompletion();

        // Event-driven broadcasts: Only broadcast time on daily transitions
        // Regular time updates sent with player action broadcasts

        // Trigger daily events
        if (currentDay > previousDay) {
            console.log(`🕒 DAY TRANSITION: ${previousDay} → ${currentDay} (time: ${newGameTime.toFixed(3)})`);
            this.processDailyEvents();
        }

        return newGameTime;
    }

    /**
     * Broadcast current game state with time - called after player actions
     */
    broadcastGameStateUpdate(actionType = 'GAME_STATE_UPDATE') {
        if (this.broadcastFunction) {
            this.broadcastFunction({
                type: actionType,
                gameTime: this.gameState.gameTime,
                gameDay: Math.floor(this.gameState.gameTime),
                timestamp: Date.now()
            });
        }
    }

    /**
     * Check for buildings that should complete construction automatically
     */
    processAutomaticBuildingCompletion() {
        const now = Date.now();
        const completedBuildings = [];

        // Check buildings for completion

        for (const [locationKey, building] of this.gameState.buildings.entries()) {
            // Check completion status
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

                    // Update grid parcel to reference the completed building
                    const [row, col] = building.location;
                    if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
                        this.gameState.grid[row][col].building = building.id;
                        console.log(`🏞️ Grid updated: parcel [${row},${col}] now has building ${building.id}`);
                    }

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
                    building.performance = this.calculateBuildingPerformance(row, col);
                    if (building.performance && building.performance.summary) {
                        console.log(`📊 Performance calculated: ${building.id} at [${row},${col}] - Revenue: $${building.performance.summary.revenue}, Net: $${building.performance.summary.netIncome}`);
                    }
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

        // Check for monthly events (day 1 of new month)
        if (currentDay > 0 && currentDay % 30 === 0) {
            this.processMonthlyEvents(currentDay);
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
     * Process monthly events (governance points, budget allocations, etc.)
     */
    processMonthlyEvents(currentDay) {
        const currentMonth = Math.floor(currentDay / 30);
        const monthNames = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const monthName = monthNames[currentMonth % 12];
        console.log(`🗳️ MONTH TRANSITION: Starting ${monthName} (day ${currentDay} - first day of new month)`);

        // Award governance points to all players (2 points per month)
        this.gameState.players.forEach((playerState, playerId) => {
            // Award points directly to player's governance state if they have one
            if (playerState.governance) {
                playerState.governance.votingPoints = (playerState.governance.votingPoints || 0) + 2;
                console.log(`🗳️ Awarded 2 governance points to player ${playerId} (total: ${playerState.governance.votingPoints})`);
            }
        });

        // Broadcast monthly update to all clients
        if (this.broadcastFunction) {
            this.broadcastFunction({
            type: 'MONTHLY_UPDATE',
            gameTime: this.gameState.gameTime,
            gameDay: currentDay,
            month: currentMonth,
            monthName: monthName,
            message: `New month started: ${monthName}! +2 governance points awarded.`,
            timestamp: Date.now()
            });
        }

        console.log(`📊 Monthly events completed for ${monthName}`);
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

                case 'GOVERNANCE_VOTE':
                    result = await this.processGovernanceVote(transaction);
                    break;

                // Action Marketplace Transactions
                case 'ACTION_CREATE_LISTING':
                    result = await this.processCreateActionListing(transaction);
                    break;

                case 'ACTION_BID':
                    result = await this.processActionBid(transaction);
                    break;

                case 'ACTION_BUY_NOW':
                    result = await this.processActionBuyNow(transaction);
                    break;

                case 'ACTION_CANCEL_LISTING':
                    result = await this.processCancelActionListing(transaction);
                    break;

                case 'ACTION_END_EARLY':
                    result = await this.processEndActionEarly(transaction);
                    break;

                case 'ACTION_SPEND':
                    result = await this.processActionSpend(transaction);
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

            // FLATTENED RESPONSE STRUCTURE - Extract key fields to top level
            return {
                success: true,
                transactionId: transaction.id,
                newBalance: result.newBalance,
                gameTime: this.gameState.gameTime,
                timestamp: Date.now(),
                // Metadata (non-critical fields)
                metadata: {
                    originalTransaction: transaction,
                    serverResult: result
                }
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

        // 🔧 FIX: Use playerBalances Map directly instead of legacy players Map
        const currentBalance = this.gameState.playerBalances.get(playerId) || 0;

        console.log(`💰 BUILD_START DEBUG: Reading balance for ${playerId}: ${currentBalance}`);
        console.log(`💰 BUILD_START DEBUG: Cost: ${cost}, Calculation: ${currentBalance} - ${cost} = ${currentBalance - cost}`);

        // Validate player can afford
        if (currentBalance < cost) {
            throw new Error(`Insufficient funds: need ${cost}, have ${currentBalance}`);
        }

        // Check parcel ownership - player must own the parcel before building
        if (this.gameState.grid && this.gameState.grid[row] && this.gameState.grid[row][col]) {
            const parcel = this.gameState.grid[row][col];
            if (parcel.owner !== playerId) {
                throw new Error(`Player does not own parcel at [${row},${col}] - owned by: ${parcel.owner}`);
            }
        } else {
            throw new Error(`Invalid location: [${row},${col}]`);
        }

        // Check location availability (collision detection)
        const existingBuilding = this.gameState.buildings.get(locationKey);
        if (existingBuilding) {
            throw new Error(`Location already occupied by building`);
        }

        // Get building definition
        const buildingDef = this.buildingDefinitions.get(buildingId);
        if (!buildingDef) {
            throw new Error(`Unknown building: ${buildingId}`);
        }

        // Deduct cost from playerBalances
        const newBalance = currentBalance - cost;
        this.gameState.playerBalances.set(playerId, newBalance);

        console.log(`💰 BUILD_START: ${playerId} balance ${currentBalance} → ${newBalance} (built ${buildingDef.name})`);
        console.log('🔍 DEBUG: Server buildingDef graphics data:', {
            graphicsFile: buildingDef.graphicsFile,
            graphics: buildingDef.graphics,
            images: buildingDef.images,
            allKeys: Object.keys(buildingDef)
        });

        // Create building in construction state
        const building = {
            id: buildingId,
            ownerId: playerId,
            location: [row, col],
            locationKey: locationKey,
            constructionStartTime: Date.now(),
            constructionDays: buildingDef.economics?.constructionDays || 14,
            underConstruction: true,
            age: 0,
            decay: 0,
            condition: 1.0,
            performance: null, // Will be calculated after construction
            // Include graphics data from building definition
            graphics: buildingDef.graphics,
            graphicsFile: buildingDef.graphicsFile,
            images: buildingDef.images
        };

        this.gameState.buildings.set(locationKey, building);

        console.log(`🏗️ Construction started: ${buildingId} at ${locationKey} by ${playerId}`);

        return {
            success: true,
            buildingId,
            location,
            constructionTimeRemaining: building.constructionDays * this.GAME_DAY_MS,
            newBalance: newBalance,
            transaction: {
                type: 'BUILD_START',
                amount: cost,
                description: `Built ${buildingDef.name}`
            }
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

        // Update grid parcel to reference the completed building
        if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].building = building.id;
            console.log(`🏞️ Grid updated: parcel [${row},${col}] now has building ${building.id}`);
        }

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

        // Remove building reference from grid parcel
        if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].building = null;
            console.log(`🏞️ Grid updated: parcel [${row},${col}] building reference removed`);
        }

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
        console.log(`🔄 DEBUG: Recalculating global economics (buildings: ${this.gameState.buildings.size})`);
        this.calculateGlobalJEEFHH();
        this.calculateGlobalCARENS();
        this.recalculateAllBuildingPerformances();
    }

    /**
     * Calculate global JEEFHH supply/demand and multipliers
     */
    calculateGlobalJEEFHH() {
        // Reset supply (demand is calculated by age-aware system)
        Object.keys(this.gameState.jeefhh).forEach(resource => {
            this.gameState.jeefhh[resource].supply = 0;
            // Don't reset demand - it's calculated by calculateAgeAwareDemand()
        });

        // Sum supply from all completed buildings
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (!buildingDef || !buildingDef.resources) continue;

            const econ = buildingDef.resources;

            // Supply contributions
            this.gameState.jeefhh.jobs.supply += econ.jobsProvided || 0;
            this.gameState.jeefhh.energy.supply += econ.energyProvided || 0;
            this.gameState.jeefhh.education.supply += econ.educationProvided || 0;
            this.gameState.jeefhh.food.supply += econ.foodProvided || 0;
            this.gameState.jeefhh.housing.supply += econ.housingProvided || 0;
            this.gameState.jeefhh.healthcare.supply += econ.healthcareProvided || 0;
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
        const carens = this.gameState.carens;
        const buildingCount = this.gameState.buildings.size;

        console.log(`🏛️ DEBUG: Calculating CARENS with ${buildingCount} buildings`);

        // Start CARENS scores at neutral (0.5) baseline
        carens.culture = 0.5;
        carens.affordability = 0.5;
        carens.resilience = 0.5;
        carens.environment = 0.5;
        carens.noise = 0.5;
        carens.safety = 0.5;

        // Sum CARENS contributions from all completed buildings
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (!buildingDef || !buildingDef.livability) continue;

            const livability = buildingDef.livability;

            // Add CARENS impacts from each building (already normalized 0-1 values)
            carens.culture += this.extractLivabilityValue(livability.culture) || 0;
            carens.affordability += this.extractLivabilityValue(livability.affordability) || 0;
            carens.resilience += this.extractLivabilityValue(livability.resilience) || 0;
            carens.environment += this.extractLivabilityValue(livability.environment) || 0;
            carens.noise += this.extractLivabilityValue(livability.noise) || 0;
            carens.safety += this.extractLivabilityValue(livability.safety) || 0;
        }

        // Clamp CARENS scores to valid range (0 to 1)
        carens.culture = Math.max(0, Math.min(1, carens.culture));
        carens.affordability = Math.max(0, Math.min(1, carens.affordability));
        carens.resilience = Math.max(0, Math.min(1, carens.resilience));
        carens.environment = Math.max(0, Math.min(1, carens.environment));
        carens.noise = Math.max(0, Math.min(1, carens.noise));
        carens.safety = Math.max(0, Math.min(1, carens.safety));

        // Calculate average for multiplier
        const avgScore = (carens.culture + carens.affordability + carens.resilience +
                         carens.environment + carens.noise + carens.safety) / 6;

        // Convert to multiplier (0.6x to 1.4x)
        carens.multiplier = 0.6 + (avgScore * 0.8);

        console.log(`🏛️ DEBUG: CARENS calculation - avgScore=${avgScore.toFixed(3)}, multiplier=${carens.multiplier.toFixed(3)}`);
        console.log('🏛️ Global CARENS updated:', carens);
    }

    /**
     * Extract livability value from building definition (handles both number and object formats)
     */
    extractLivabilityValue(livabilityData) {
        if (typeof livabilityData === 'number') {
            return livabilityData;
        } else if (typeof livabilityData === 'object' && livabilityData !== null) {
            return livabilityData.effect || 0;
        }
        return 0;
    }

    /**
     * Normalize CARENS score from points (-100 to +100) to percentage (0 to 1)
     */
    normalizeCarensScore(points) {
        // Clamp to range and convert to 0-1 scale
        const clampedPoints = Math.max(-100, Math.min(100, points));
        return (clampedPoints + 100) / 200; // Convert -100→+100 to 0→1
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

        if (!buildingDef.resources.energyRequired) {
            return 1.0; // No local needs = fully satisfied
        }

        // Get connected buildings (8 adjacent)
        const connectedSupply = { energy: 0 };

        this.ADJACENCY_OFFSETS.forEach(([dr, dc]) => {
            const connectedKey = `${row + dr},${col + dc}`;
            const connectedBuilding = this.gameState.buildings.get(connectedKey);

            if (connectedBuilding && !connectedBuilding.underConstruction) {
                const connectedDef = this.buildingDefinitions.get(connectedBuilding.id);
                if (connectedDef && connectedDef.resources) {
                    connectedSupply.energy += connectedDef.resources.energyProvided || 0;
                }
            }
        });

        // Calculate satisfaction ratio with a minimum baseline (25% operation without energy)
        const energyNeeded = buildingDef.resources.energyRequired;
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
     * Update resident distribution based on economic attractiveness and JEEFHH availability
     */
    updateResidentDistribution() {
        // 1. Calculate economic attractiveness for population growth/decline
        const economicAttractiveness = this.calculateEconomicAttractiveness();

        // 2. Update total population based on economic conditions
        this.updateTotalPopulation(economicAttractiveness);

        // 3. Distribute population by age groups
        this.updateDemographics();

        // 4. Distribute residents to buildings based on attractiveness and capacity
        this.distributeResidentsToBuildings(economicAttractiveness);

        // 5. Calculate age-aware JEEFHH demand
        this.calculateAgeAwareDemand();

        // Only log residents updates when there's a meaningful change
        if (this.gameState.totalResidents > 0) {
            console.log(`👥 Residents updated: ${this.gameState.totalResidents} total (${this.gameState.demographics.children}c/${this.gameState.demographics.adults}a/${this.gameState.demographics.seniors}s)`);
        }
    }

    /**
     * Calculate economic attractiveness score for the city
     */
    calculateEconomicAttractiveness() {
        const jeefhh = this.gameState.jeefhh;
        const carens = this.gameState.carens;

        // Core JEEFHH attractiveness (jobs, housing, food availability)
        const coreMultipliers = [
            jeefhh.jobs.multiplier,
            jeefhh.housing.multiplier,
            jeefhh.food.multiplier,
            jeefhh.energy.multiplier
        ];
        const coreScore = coreMultipliers.reduce((sum, m) => sum + m, 0) / coreMultipliers.length;

        // Quality of life (education, healthcare, CARENS)
        const qualityMultipliers = [
            jeefhh.education.multiplier,
            jeefhh.healthcare.multiplier,
            carens.multiplier
        ];
        const qualityScore = qualityMultipliers.reduce((sum, m) => sum + m, 0) / qualityMultipliers.length;

        // Weighted attractiveness: 70% core needs, 30% quality of life
        const attractiveness = (coreScore * 0.7) + (qualityScore * 0.3);

        console.log(`🧲 Economic attractiveness: ${attractiveness.toFixed(3)} (core: ${coreScore.toFixed(3)}, quality: ${qualityScore.toFixed(3)})`);
        console.log(`🧲 DEBUG JEEFHH multipliers: jobs=${jeefhh.jobs.multiplier.toFixed(3)}, housing=${jeefhh.housing.multiplier.toFixed(3)}, food=${jeefhh.food.multiplier.toFixed(3)}, energy=${jeefhh.energy.multiplier.toFixed(3)}`);
        console.log(`🧲 DEBUG Quality multipliers: education=${jeefhh.education.multiplier.toFixed(3)}, healthcare=${jeefhh.healthcare.multiplier.toFixed(3)}, carens=${carens.multiplier.toFixed(3)}`);
        return attractiveness;
    }

    /**
     * Update total population based on economic conditions
     */
    updateTotalPopulation(attractiveness) {
        const dynamics = this.POPULATION_DYNAMICS;
        const currentPop = this.gameState.demographics.total;

        // Base growth rate adjusted by economic attractiveness
        const attractivenessModifier = (attractiveness - 1.0) * dynamics.migrationSensitivity;
        const effectiveGrowthRate = dynamics.baseGrowthRate + attractivenessModifier;

        // Daily growth (convert yearly rate to daily)
        const dailyGrowthRate = effectiveGrowthRate / 365;

        // Calculate new population
        let newPopulation = currentPop * (1 + dailyGrowthRate);

        // If no current population but conditions are very good, allow initial immigration
        if (currentPop === 0 && attractiveness > 1.1) {
            const maxHousingCapacity = this.calculateMaxHousingCapacity();
            console.log(`🏠 DEBUG Immigration Check: currentPop=${currentPop}, attractiveness=${attractiveness.toFixed(3)}, maxHousingCapacity=${maxHousingCapacity}`);
            if (maxHousingCapacity > 0) {
                // Start with small initial population when conditions are good
                const immigrationRate = (attractiveness - 1.0) * 2; // Scale with attractiveness
                const cappedImmigration = maxHousingCapacity * 0.1; // Cap at 10% of housing capacity
                newPopulation = Math.min(immigrationRate, cappedImmigration);
                console.log(`🏠 DEBUG Immigration Calc: immigrationRate=${immigrationRate.toFixed(3)}, cappedAt=${cappedImmigration.toFixed(3)}, result=${newPopulation.toFixed(3)}`);
                console.log(`🏠 Initial immigration: ${newPopulation.toFixed(1)} residents attracted by economic conditions (attractiveness: ${attractiveness.toFixed(3)})`);
            } else {
                console.log(`🏠 DEBUG: No immigration - maxHousingCapacity is 0`);
            }
        } else {
            console.log(`🏠 DEBUG: No immigration - currentPop=${currentPop}, attractiveness=${attractiveness.toFixed(3)} (needs currentPop===0 && attractiveness>1.1)`);
        }

        // Track poor conditions for emigration (existing residents leave after sustained week of poor conditions)
        if (currentPop > 0) {
            if (attractiveness < 0.95) {
                this.gameState.emigrationTracking.poorConditionsDays++;
                console.log(`🏠 DEBUG: Poor conditions day ${this.gameState.emigrationTracking.poorConditionsDays}/7 (attractiveness: ${attractiveness.toFixed(3)})`);

                // If poor conditions persist for a week (7 days), trigger emigration
                if (this.gameState.emigrationTracking.poorConditionsDays >= 7) {
                    const emigrationRate = (0.95 - attractiveness) * 0.5; // Scale emigration with how bad conditions are
                    const emigrationLoss = currentPop * emigrationRate * 0.1; // 10% base rate
                    newPopulation = Math.max(0, currentPop - emigrationLoss);
                    console.log(`🏠 Emigration: ${emigrationLoss.toFixed(1)} residents leaving due to sustained poor conditions (${this.gameState.emigrationTracking.poorConditionsDays} days < 0.95)`);
                }
            } else {
                // Reset counter when conditions improve
                if (this.gameState.emigrationTracking.poorConditionsDays > 0) {
                    console.log(`🏠 DEBUG: Conditions improved (${attractiveness.toFixed(3)}), resetting emigration counter`);
                    this.gameState.emigrationTracking.poorConditionsDays = 0;
                }
            }
        }
        this.gameState.emigrationTracking.lastAttractivenessCheck = attractiveness;

        // Apply maximum housing constraint
        const maxHousingCapacity = this.calculateMaxHousingCapacity();
        newPopulation = Math.min(newPopulation, maxHousingCapacity);

        // Ensure minimum viable population
        newPopulation = Math.max(newPopulation, 0);

        this.gameState.demographics.total = Math.floor(newPopulation);

        if (Math.abs(newPopulation - currentPop) > 0.1) {
            console.log(`📈 Population change: ${currentPop} → ${newPopulation.toFixed(1)} (growth rate: ${(effectiveGrowthRate * 100).toFixed(2)}%)`);
        }
    }

    /**
     * Calculate maximum housing capacity across all buildings
     */
    calculateMaxHousingCapacity() {
        let totalCapacity = 0;

        console.log(`🏠 DEBUG: Calculating housing capacity from ${this.gameState.buildings.size} buildings`);
        for (const [locationKey, building] of this.gameState.buildings) {
            console.log(`🏠 DEBUG: Building ${building.id} at ${locationKey}, underConstruction: ${building.underConstruction}`);
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.resources) {
                console.log(`🏠 DEBUG: Building ${building.id} housing provided: ${buildingDef.resources.housingProvided}`);
                if (buildingDef.resources.housingProvided > 0) {
                    totalCapacity += buildingDef.resources.housingProvided;
                }
            } else {
                console.log(`🏠 DEBUG: No building definition or resources for ${building.id}`);
            }
        }

        console.log(`🏠 DEBUG: Total housing capacity: ${totalCapacity} units = ${totalCapacity * 2} people`);
        return totalCapacity * 2; // Assume 2 people per bedroom on average
    }

    /**
     * Update age demographics based on population transitions
     */
    updateDemographics() {
        const demo = this.gameState.demographics;
        const total = demo.total;

        if (total === 0) {
            demo.children = demo.adults = demo.seniors = 0;
            return;
        }

        // If no existing demographics, initialize with typical distribution
        if (demo.children + demo.adults + demo.seniors === 0) {
            demo.children = Math.floor(total * 0.25); // 25% children
            demo.adults = Math.floor(total * 0.60);   // 60% adults
            demo.seniors = total - demo.children - demo.adults; // 15% seniors
        } else {
            // Age transitions (children → adults → seniors)
            const transitionRate = this.POPULATION_DYNAMICS.ageTransitionRate / 365; // Daily rate

            const childrenBecomingAdults = Math.floor(demo.children * transitionRate);
            const adultsBecomingSeniors = Math.floor(demo.adults * transitionRate);

            demo.children = Math.max(0, demo.children - childrenBecomingAdults);
            demo.adults = demo.adults + childrenBecomingAdults - adultsBecomingSeniors;
            demo.seniors = demo.seniors + adultsBecomingSeniors;

            // Adjust to match total population (handle growth/decline)
            const currentSum = demo.children + demo.adults + demo.seniors;
            if (currentSum !== total && currentSum > 0) {
                const ratio = total / currentSum;
                demo.children = Math.floor(demo.children * ratio);
                demo.adults = Math.floor(demo.adults * ratio);
                demo.seniors = total - demo.children - demo.adults;
            }
        }
    }

    /**
     * Distribute residents to buildings based on attractiveness and capacity
     */
    distributeResidentsToBuildings(economicAttractiveness) {
        this.gameState.residentsPerBuilding.clear();
        this.gameState.demographicsPerBuilding.clear();

        const totalResidents = this.gameState.demographics.total;
        if (totalResidents === 0) return;

        // Calculate building attractiveness scores
        const buildingScores = new Map();
        let totalScore = 0;

        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.resources && buildingDef.resources.housingProvided > 0) {
                const score = this.calculateBuildingAttractiveness(building, locationKey);
                buildingScores.set(locationKey, score);
                totalScore += score;
            }
        }

        // Distribute residents proportionally by attractiveness
        let residentsRemaining = totalResidents;

        for (const [locationKey, building] of this.gameState.buildings) {
            if (!buildingScores.has(locationKey) || residentsRemaining <= 0) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            const capacity = buildingDef.resources.housingProvided * 2; // 2 people per bedroom
            const score = buildingScores.get(locationKey);

            // Residents attracted to this building
            const attractedResidents = Math.floor((score / totalScore) * totalResidents);
            const actualResidents = Math.min(attractedResidents, capacity, residentsRemaining);

            if (actualResidents > 0) {
                this.gameState.residentsPerBuilding.set(locationKey, actualResidents);

                // Distribute age demographics proportionally
                const demographics = this.gameState.demographics;
                const childrenHere = Math.floor((demographics.children / totalResidents) * actualResidents);
                const adultsHere = Math.floor((demographics.adults / totalResidents) * actualResidents);
                const seniorsHere = actualResidents - childrenHere - adultsHere;

                this.gameState.demographicsPerBuilding.set(locationKey, {
                    children: childrenHere,
                    adults: adultsHere,
                    seniors: seniorsHere,
                    total: actualResidents
                });

                residentsRemaining -= actualResidents;
            }
        }

        this.gameState.totalResidents = totalResidents - residentsRemaining;
    }

    /**
     * Calculate attractiveness score for a specific building location
     */
    calculateBuildingAttractiveness(building, locationKey) {
        const [row, col] = building.location;
        let score = 1.0; // Base attractiveness

        // Factor 1: Local CARENS (quality of life)
        const localCarens = this.calculateLocalCARENSMultiplier(row, col);
        score *= localCarens;

        // Factor 2: Local needs satisfaction (energy access)
        const localNeeds = this.calculateLocalNeedsSatisfaction(row, col);
        score *= localNeeds;

        // Factor 3: Building condition
        const condition = building.condition || 1.0;
        score *= condition;

        return score;
    }

    /**
     * Calculate age-aware JEEFHH demand
     */
    calculateAgeAwareDemand() {
        const demo = this.gameState.demographics;
        const reqs = this.POPULATION_REQUIREMENTS;

        // Reset demand calculations
        this.gameState.jeefhh.jobs.demand = 0;
        this.gameState.jeefhh.energy.demand = 0;
        this.gameState.jeefhh.food.demand = 0;
        this.gameState.jeefhh.education.demand = 0;
        this.gameState.jeefhh.healthcare.demand = 0;
        this.gameState.jeefhh.housing.demand = 0;

        // Calculate age-specific demand
        this.gameState.jeefhh.jobs.demand += demo.children * reqs.jobs.children +
                                           demo.adults * reqs.jobs.adults +
                                           demo.seniors * reqs.jobs.seniors;

        this.gameState.jeefhh.food.demand += demo.children * reqs.food.children +
                                           demo.adults * reqs.food.adults +
                                           demo.seniors * reqs.food.seniors;

        this.gameState.jeefhh.education.demand += demo.children * reqs.education.children +
                                                demo.adults * reqs.education.adults +
                                                demo.seniors * reqs.education.seniors;

        this.gameState.jeefhh.healthcare.demand += demo.children * reqs.healthcare.children +
                                                 demo.adults * reqs.healthcare.adults +
                                                 demo.seniors * reqs.healthcare.seniors;

        this.gameState.jeefhh.housing.demand += demo.children * reqs.housing.children +
                                              demo.adults * reqs.housing.adults +
                                              demo.seniors * reqs.housing.seniors;

        // Add building-specific energy demand
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.resources) {
                this.gameState.jeefhh.energy.demand += buildingDef.resources.energyRequired || 0;
            }
        }
    }

    /**
     * Calculate total player wealth: cash + land value + building value (with decay)
     */
    calculatePlayerWealth(playerId, cash) {
        let totalWealth = cash; // Start with cash

        // Add land values for all player-owned parcels
        let landValue = 0;
        let buildingValue = 0;

        for (let row = 0; row < this.gameState.grid.length; row++) {
            for (let col = 0; col < this.gameState.grid[row].length; col++) {
                const parcel = this.gameState.grid[row][col];

                if (parcel && parcel.owner === playerId) {
                    // Add land value (base parcel price)
                    landValue += this.calculateParcelValue(row, col);

                    // Add building value if there's a building
                    if (parcel.building) {
                        const building = this.gameState.buildings.get(`${row},${col}`);
                        if (building) {
                            buildingValue += this.calculateBuildingValue(building);
                        }
                    }
                }
            }
        }

        totalWealth += landValue + buildingValue;

        console.log(`💰 Player ${playerId} wealth: $${cash.toLocaleString()} cash + $${landValue.toLocaleString()} land + $${buildingValue.toLocaleString()} buildings = $${totalWealth.toLocaleString()}`);

        return totalWealth;
    }

    /**
     * Calculate current value of a building (original cost - decay)
     */
    calculateBuildingValue(building) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            return 0;
        }

        const originalCost = buildingDef.economics.buildCost || 0;
        const age = building.age || 0;
        const decayRate = buildingDef.economics.decayRatePercent || 0;

        // Apply decay: value = originalCost * (1 - decayRate)^age
        const decayMultiplier = Math.pow(1 - decayRate, age);
        const currentValue = originalCost * decayMultiplier;

        return Math.max(0, currentValue); // Never go below 0
    }

    /**
     * Calculate parcel land value
     */
    calculateParcelValue(row, col) {
        // Base land value calculation - could be enhanced with location factors
        return 100; // Base $100 per parcel for now
    }

    /**
     * PLAYER MANAGEMENT
     */

    /**
     * Get or create player state
     */
    getOrCreatePlayer(playerId) {
        console.log(`🔍 DEBUG: getOrCreatePlayer called for ${playerId}, exists: ${this.gameState.players.has(playerId)}`);
        if (!this.gameState.players.has(playerId)) {
            this.gameState.players.set(playerId, {
                id: playerId,
                cash: 6000, // Starting cash
                wealth: 6000, // Cash + land values
                transactions: [],
                buildings: [],
                lastCashflowUpdate: 0,

                // Action inventory (server-authoritative)
                actions: {
                    monthly: this.calculateMonthlyActionAllowance(), // Expire at month end
                    purchased: 0, // Never expire
                    total: this.calculateMonthlyActionAllowance()
                },
                governance: {
                    votingPoints: 2, // Start with 2 voting points for regular gameplay
                    allocations: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    votes: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVotesIncrease: 0, // Votes to increase LVT rate
                    lvtVotesDecrease: 0  // Votes to decrease LVT rate
                }
            });

            // Initialize in server-authoritative playerBalances Map
            this.gameState.playerBalances.set(playerId, 6000);
            const initialPoints = this.gameState.gameStarted ? 2 : 4;
            playerState.governance.votingPoints = initialPoints;
            console.log(`💰 Player ${playerId} starts with $6,000 and ${initialPoints} governance points`);
        }
        return this.gameState.players.get(playerId);
    }

    /**
     * Calculate cashflow for all players (called daily)
     */
    calculateAllPlayerCashflows() {
        // 🔧 FIX: Use playerBalances Map instead of legacy players Map
        for (const [playerId, balance] of this.gameState.playerBalances) {
            this.calculatePlayerCashflow(playerId);
        }
    }

    /**
     * Calculate cashflow for a specific player
     */
    calculatePlayerCashflow(playerId) {
        // 🔧 FIX: Use playerBalances Map directly instead of legacy players Map
        const currentBalance = this.gameState.playerBalances.get(playerId) || 0;

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

        // Update player cash in playerBalances
        const newBalance = currentBalance + netCashflow;
        this.gameState.playerBalances.set(playerId, newBalance);

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
        const wealth = newBalance + buildingValues;

        // Only log cashflow if there's actual activity (non-zero or significant change)
        if (netCashflow !== 0 || buildingBreakdown.length > 0) {
            console.log(`💰 Cashflow calculated for ${playerId}: ${netCashflow.toFixed(2)} (${buildingBreakdown.length} buildings)`);
        }

        return {
            playerId,
            totalRevenue,
            totalMaintenance,
            netCashflow,
            cash: newBalance,
            wealth: wealth,
            buildingBreakdown
        };
    }

    /**
     * Age all buildings
     */
    ageAllBuildings() {
        const maintenanceCosts = new Map(); // Track maintenance costs per player

        for (const [locationKey, building] of this.gameState.buildings) {
            building.age += 1; // Age in game days

            // Use building-specific decay rate from building definition
            const buildingDef = this.buildingDefinitions.get(building.id);
            const annualDecayRate = buildingDef?.economics?.decayRatePercent || 0;
            const decayRate = annualDecayRate / 365; // Convert annual rate to daily rate
            const maintenanceCost = buildingDef?.economics?.maintenanceCost || 0;

            // Apply daily decay rate (not cumulative)
            const newDecay = building.decay + decayRate;
            building.decay = Math.min(newDecay, 1.0); // Cap at 100% decay
            building.condition = Math.max(0.1, 1.0 - building.decay);

            // Apply maintenance costs to building owner
            if (maintenanceCost > 0 && building.ownerId) {
                const currentCost = maintenanceCosts.get(building.ownerId) || 0;
                maintenanceCosts.set(building.ownerId, currentCost + maintenanceCost);
            }

            console.log(`🏠 Building ${building.id} at ${locationKey}: age=${building.age} days, decay=${(building.decay*100).toFixed(2)}%, condition=${(building.condition*100).toFixed(1)}%, maintenance=$${maintenanceCost}`);
        }

        // Deduct maintenance costs from player balances
        for (const [playerId, totalMaintenance] of maintenanceCosts) {
            const currentBalance = this.gameState.playerBalances.get(playerId) || 0;
            const newBalance = Math.max(0, currentBalance - totalMaintenance);
            this.gameState.playerBalances.set(playerId, newBalance);
            console.log(`💸 Player ${playerId} paid $${totalMaintenance.toFixed(2)} in building maintenance (${currentBalance.toFixed(2)} → ${newBalance.toFixed(2)})`);
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
                // Graphics data for client rendering
                graphics: building.graphics,
                graphicsFile: building.graphicsFile,
                images: building.images,
                // Performance data for immediate client use
                residents: performance?.residents || 0,
                workers: performance?.workers || 0,
                efficiency: performance?.efficiency || 1.0,
                revenue: performance?.revenue || 0,
                expenses: performance?.expenses || 0,
                netIncome: performance?.netIncome || 0
            });
        });

        // Convert players Map to normalized object (use playerBalances as source)
        const players = {};
        this.gameState.playerBalances.forEach((cash, playerId) => {
            const wealth = this.calculatePlayerWealth(playerId, cash);
            players[playerId] = {
                id: playerId,
                cash: cash,
                wealth: wealth, // Cash + land value + building value (with decay)
                transactions: []
            };
        });

        // Calculate cashflow for all players (use playerBalances as source)
        const cashflowData = {};
        this.gameState.playerBalances.forEach((cash, playerId) => {
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
                demographics: this.gameState.demographics,
                jeefhh: this.gameState.jeefhh,
                carens: this.gameState.carens,
                attractiveness: this.calculateEconomicAttractiveness(),
                buildings: buildings,
                players: players,
                cashflow: cashflowData,
                grid: this.gameState.grid,
                governance: null  // Player governance is handled via individual transactions, not global broadcast
            }
        };

        console.log(`📡 Broadcasting complete game state: ${buildings.length} buildings, ${Object.keys(players).length} players, event: ${eventType}`);
        console.log(`💰 DEBUG: Player data being broadcast:`, Object.keys(players).map(id => `${id}: $${players[id].cash}`));

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

        // Clear all player balances (critical for fresh game state)
        this.gameState.playerBalances.clear();

        // Reset JEEFHH to defaults
        this.gameState.jeefhh = {
            jobs: { supply: 0, demand: 0, multiplier: 1.0 },
            energy: { supply: 0, demand: 0, multiplier: 1.0 },
            education: { supply: 0, demand: 0, multiplier: 1.0 },
            food: { supply: 0, demand: 0, multiplier: 1.0 },
            housing: { supply: 0, demand: 0, multiplier: 1.0 },
            healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
        };

        // Reset CARENS to defaults (neutral baseline until buildings are built)
        this.gameState.carens = {
            culture: 0.5,
            affordability: 0.5,
            resilience: 0.5,
            environment: 0.5,
            noise: 0.5,
            safety: 0.5,
            multiplier: 1.0 // Neutral multiplier when no buildings exist
        };

        // Reset residents and demographics
        this.gameState.totalResidents = 0;
        this.gameState.residentsPerBuilding.clear();
        this.gameState.demographics = { children: 0, adults: 0, seniors: 0, total: 0 };
        this.gameState.demographicsPerBuilding.clear();

        // Clear transaction history
        this.pendingTransactions = [];
        this.transactionHistory = [];

        // Reset grid ownership to 'City' (clear all player ownership)
        this.initializeGrid(12);

        // Initialize LVT rate to default 50%
        this.currentLVTRate = 0.5;

        console.log('✅ Economic engine reset complete - fresh board game state');
    }

    /**
     * Initialize players from room data (called after resetGameState)
     */
    initializePlayersFromRoom(roomPlayers) {
        console.log('🎲 Initializing economic engine players from room data...');

        for (const [playerId, roomPlayerData] of roomPlayers) {
            // Create player in economic engine with room's governance data
            this.gameState.players.set(playerId, {
                id: playerId,
                cash: roomPlayerData.balance || 6000,
                wealth: roomPlayerData.balance || 6000,
                transactions: [],
                buildings: [],
                lastCashflowUpdate: 0,
                governance: {
                    votingPoints: 4, // Start with 4 points for pre-game setup
                    allocations: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    votes: roomPlayerData.governance?.votes || {},
                    lvtVotesIncrease: 0,
                    lvtVotesDecrease: 0
                }
            });

            // Set player balance
            this.gameState.playerBalances.set(playerId, roomPlayerData.balance || 6000);

            const initialPoints = this.gameState.gameStarted ? 2 : 4;
            playerState.governance.votingPoints = initialPoints;
            console.log(`💰 Player ${playerId} initialized with $${roomPlayerData.balance || 6000} and ${initialPoints} governance points`);
        }
    }

    /**
     * Process parcel purchase transaction
     */
    async processParcelPurchase(transaction) {
        const { playerId, amount, location, description } = transaction;

        console.log(`💰 Processing parcel purchase: ${playerId} spending $${amount} for ${description || 'parcel'}`);

        // 🔧 FIX: Use playerBalances Map directly instead of legacy players Map
        const currentBalance = this.gameState.playerBalances.get(playerId) || 0;

        // Check if player has enough cash
        if (currentBalance < amount) {
            console.log(`❌ Insufficient funds: ${currentBalance} < ${amount}`);
            return {
                success: false,
                error: 'Insufficient funds',
                currentBalance: currentBalance,
                requiredAmount: amount
            };
        }

        // Deduct cash from playerBalances
        const newBalance = currentBalance - amount;
        this.gameState.playerBalances.set(playerId, newBalance);

        // UPDATE SERVER-AUTHORITATIVE GRID OWNERSHIP
        const [row, col] = location;
        if (this.gameState.grid && this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].owner = playerId;
            console.log(`🏞️ Server grid ownership updated: [${row},${col}] → ${playerId}`);
        } else {
            console.warn(`⚠️ Grid update failed: invalid location [${row},${col}]`);
        }

        console.log(`✅ Parcel purchase successful: ${playerId} balance ${currentBalance} → ${newBalance}`);

        return {
            success: true,
            newBalance: newBalance,
            transaction: {
                amount: amount,
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

        // 🔧 FIX: Use playerBalances Map directly instead of legacy players Map
        const currentBalance = this.gameState.playerBalances.get(playerId) || 0;

        // Check if player has enough cash
        if (currentBalance < amount) {
            console.log(`❌ Insufficient funds: ${currentBalance} < ${amount}`);
            return {
                success: false,
                error: 'Insufficient funds',
                currentBalance: currentBalance,
                requiredAmount: amount
            };
        }

        // Deduct cash from playerBalances
        const newBalance = currentBalance - amount;
        this.gameState.playerBalances.set(playerId, newBalance);

        console.log(`✅ Cash spend successful: ${playerId} balance ${currentBalance} → ${newBalance}`);

        return {
            success: true,
            newBalance: newBalance,
            transaction: {
                amount,
                description: description || 'Purchase'
            }
        };
    }

    /**
     * Process governance vote allocation from client
     */
    async processGovernanceVote(transaction) {
        const { playerId, category, action } = transaction; // action: 'add' or 'remove'

        console.log(`🗳️ Processing governance vote: ${playerId} ${action} vote for ${category}`);

        const player = this.getOrCreatePlayer(playerId);

        // Handle LVT rate voting separately
        if (category === 'lvt_increase' || category === 'lvt_decrease') {
            return this.processLVTVote(playerId, category, action);
        }

        if (action === 'add') {
            // Check if player can allocate more points (has unallocated points)
            const totalAllocated = Object.values(player.governance.votes || {}).reduce((sum, votes) => sum + votes, 0);
            const maxPoints = player.governance.votingPoints; // votingPoints now represents total allocation capacity

            if (totalAllocated >= maxPoints) {
                return {
                    success: false,
                    error: `Cannot allocate more points. You have ${totalAllocated}/${maxPoints} points allocated.`,
                    votingPoints: maxPoints,
                    allocated: totalAllocated
                };
            }

            // Allocate point (no spending - just tracking allocation)
            player.governance.votes[category] = (player.governance.votes[category] || 0) + 1;

            const newTotalAllocated = totalAllocated + 1;
            console.log(`🗳️ Allocated vote to ${category}. Player ${playerId} now has ${newTotalAllocated}/${maxPoints} points allocated, ${player.governance.votes[category]} to ${category}`);

        } else if (action === 'remove') {
            // Check if player has votes to remove
            if (!player.governance.votes[category] || player.governance.votes[category] <= 0) {
                return {
                    success: false,
                    error: 'No votes to remove from this category',
                    votes: player.governance.votes[category] || 0
                };
            }

            // Deallocate point (no refunding - just tracking allocation)
            player.governance.votes[category] -= 1;

            const totalAllocated = Object.values(player.governance.votes || {}).reduce((sum, votes) => sum + votes, 0);
            console.log(`🗳️ Deallocated vote from ${category}. Player ${playerId} now has ${totalAllocated}/${player.governance.votingPoints} points allocated, ${player.governance.votes[category]} to ${category}`);
        }

        return {
            success: true,
            votingPoints: player.governance.votingPoints,
            votes: player.governance.votes,
            category,
            action
        };
    }

    /**
     * Process LVT rate voting (separate from budget category voting)
     */
    async processLVTVote(playerId, voteType, action) {
        const player = this.getOrCreatePlayer(playerId);

        // Check if we're in pre-game mode (range-based allocation) or in-game mode (spending-based)
        const isPreGame = !this.gameState.gameStarted;

        if (action === 'add') {
            const currentIncrease = player.governance.lvtVotesIncrease || 0;
            const currentDecrease = player.governance.lvtVotesDecrease || 0;

            if (isPreGame) {
                // PRE-GAME: Range-based allocation system
                const currentNetLVT = currentIncrease - currentDecrease; // Net can be negative
                const maxRange = player.governance.votingPoints; // e.g., 4 points = range -4 to +4

                let projectedNetLVT = currentNetLVT;
                if (voteType === 'lvt_increase') {
                    projectedNetLVT += 1;
                } else {
                    projectedNetLVT -= 1;
                }

                // Check if within allowed range
                if (Math.abs(projectedNetLVT) > maxRange) {
                    return {
                        success: false,
                        error: `LVT vote outside allowed range (±${maxRange})`,
                        votingPoints: player.governance.votingPoints
                    };
                }

                // In pre-game, voting points don't change - they represent the range
                if (voteType === 'lvt_increase') {
                    player.governance.lvtVotesIncrease += 1;
                } else {
                    player.governance.lvtVotesDecrease += 1;
                }

                console.log(`🗳️ Pre-game: Added ${voteType} vote. Net LVT: ${projectedNetLVT}, Range: ±${maxRange}`);
            } else {
                // IN-GAME: Allocation-based system (same as pre-game)
                const currentNetLVT = currentIncrease - currentDecrease; // Net can be negative
                const totalBudgetVotes = Object.values(player.governance.votes || {}).reduce((sum, votes) => sum + votes, 0);
                const totalLVTVotes = Math.abs(currentNetLVT);
                const totalAllocated = totalBudgetVotes + totalLVTVotes;
                const maxPoints = player.governance.votingPoints; // Total allocation capacity

                let projectedNetLVT = currentNetLVT;
                if (voteType === 'lvt_increase') {
                    projectedNetLVT += 1;
                } else {
                    projectedNetLVT -= 1;
                }

                const projectedLVTVotes = Math.abs(projectedNetLVT);
                const projectedTotalAllocated = totalBudgetVotes + projectedLVTVotes;

                if (projectedTotalAllocated > maxPoints) {
                    return {
                        success: false,
                        error: `Cannot allocate more points. You have ${totalAllocated}/${maxPoints} points allocated. LVT vote would make it ${projectedTotalAllocated}/${maxPoints}.`,
                        votingPoints: maxPoints,
                        allocated: totalAllocated
                    };
                }

                // Allocate LVT vote (no point spending)
                if (voteType === 'lvt_increase') {
                    player.governance.lvtVotesIncrease += 1;
                } else {
                    player.governance.lvtVotesDecrease += 1;
                }

                console.log(`🗳️ In-game: Allocated ${voteType} vote. Net LVT: ${projectedNetLVT}, Total allocated: ${projectedTotalAllocated}/${maxPoints}`);
            }

            // Calculate new LVT rate based on all player votes
            this.calculateLVTRate();

        } else if (action === 'remove') {
            const currentIncrease = player.governance.lvtVotesIncrease || 0;
            const currentDecrease = player.governance.lvtVotesDecrease || 0;
            const currentVotes = voteType === 'lvt_increase' ? currentIncrease : currentDecrease;

            if (currentVotes <= 0) {
                return {
                    success: false,
                    error: 'No LVT votes to remove',
                    votes: currentVotes
                };
            }

            if (isPreGame) {
                // PRE-GAME: Simple vote removal, no point refunding needed
                if (voteType === 'lvt_increase') {
                    player.governance.lvtVotesIncrease -= 1;
                } else {
                    player.governance.lvtVotesDecrease -= 1;
                }

                const newNetLVT = (player.governance.lvtVotesIncrease || 0) - (player.governance.lvtVotesDecrease || 0);
                console.log(`🗳️ Pre-game: Removed ${voteType} vote. Net LVT: ${newNetLVT}`);
            } else {
                // IN-GAME: Allocation-based system (same as pre-game)
                // Simple vote removal, no point refunding needed
                if (voteType === 'lvt_increase') {
                    player.governance.lvtVotesIncrease -= 1;
                } else {
                    player.governance.lvtVotesDecrease -= 1;
                }

                const newNetLVT = (player.governance.lvtVotesIncrease || 0) - (player.governance.lvtVotesDecrease || 0);
                const totalBudgetVotes = Object.values(player.governance.votes || {}).reduce((sum, votes) => sum + votes, 0);
                const totalLVTVotes = Math.abs(newNetLVT);
                const totalAllocated = totalBudgetVotes + totalLVTVotes;
                console.log(`🗳️ In-game: Deallocated ${voteType} vote. Net LVT: ${newNetLVT}, Total allocated: ${totalAllocated}/${player.governance.votingPoints}`);
            }

            // Recalculate LVT rate
            this.calculateLVTRate();
        }

        return {
            success: true,
            votingPoints: player.governance.votingPoints,
            lvtRate: this.getCurrentLVTRate(),
            lvtVotesIncrease: player.governance.lvtVotesIncrease || 0,
            lvtVotesDecrease: player.governance.lvtVotesDecrease || 0,
            category: voteType,
            action
        };
    }

    /**
     * Calculate LVT rate based on all player votes
     */
    calculateLVTRate() {
        let totalIncreaseVotes = 0;
        let totalDecreaseVotes = 0;

        // Sum all player LVT votes
        this.gameState.players.forEach((playerState) => {
            if (playerState.governance) {
                totalIncreaseVotes += playerState.governance.lvtVotesIncrease || 0;
                totalDecreaseVotes += playerState.governance.lvtVotesDecrease || 0;
            }
        });

        // Calculate net change from base 50%
        const netVotes = totalIncreaseVotes - totalDecreaseVotes;
        const newRate = Math.max(0, Math.min(1, 0.5 + (netVotes * 0.01))); // 1% per net vote

        // Store the rate globally (this could be moved to a global governance state later)
        this.currentLVTRate = newRate;

        console.log(`📊 LVT rate calculated: ${(newRate * 100).toFixed(1)}% (${totalIncreaseVotes} increase, ${totalDecreaseVotes} decrease votes)`);

        return newRate;
    }

    /**
     * Get current LVT rate
     */
    getCurrentLVTRate() {
        return this.currentLVTRate || 0.5; // Default to 50%
    }

    /**
     * Transition game from pre-game to in-game state
     * This should be called when the first building is placed or game officially starts
     */
    startGame() {
        if (this.gameState.gameStarted) {
            console.log('🎮 Game already started, ignoring startGame call');
            return;
        }

        console.log('🎮 Starting game: transitioning from pre-game to in-game state');
        this.gameState.gameStarted = true;

        // Update all players' governance points from 4 (pre-game) to 2 (in-game)
        this.gameState.players.forEach((player, playerId) => {
            if (player.governance && player.governance.votingPoints === 4) {
                player.governance.votingPoints = 2;
                console.log(`🏛️ Player ${playerId} voting points reduced from 4 to 2 for in-game state`);
            }
        });

        console.log('🎮 Game started successfully - all players now in in-game governance mode');
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
                treasuryAmount = transaction.amount;
                description = `Parcel purchase at ${transaction.location}`;
                break;

            case 'DESTROY_BUILDING':
                // NO treasury effects for demolition - player pays 25% of current building value for destruction costs
                // (This is a private cost, not a public revenue)
                break;
        }

        if (treasuryAmount > 0) {
            this.governanceSystem.addFunds(treasuryAmount, description);
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

        const lvtRate = this.governanceSystem.governance.taxRate || 0.50; // Use governance rate (0-100%)
        let totalLVT = 0;
        let parcelCount = 0;

        console.log(`🏛️ Daily LVT Assessment (Rate: ${Math.round(lvtRate * 100)}%)`);

        // LVT is assessed on PARCELS (land value), not buildings
        // Iterate through the grid to find all player-owned parcels
        // Grid verification passed

        for (let row = 0; row < this.gameState.gridSize; row++) {
            for (let col = 0; col < this.gameState.gridSize; col++) {
                const parcel = this.gameState.grid[row][col];

                // Debug first few parcels to see structure
                if (row === 0 && col < 3) {
                    console.log(`🔍 Grid[${row},${col}]: ${JSON.stringify(parcel)}`);
                }

                // Only tax player-owned parcels (not City-owned)
                if (parcel && parcel.owner && parcel.owner !== 'City') {
                    parcelCount++;

                    // For now, use standard parcel price ($100) until auction system is implemented
                    // TODO: Replace with actual purchase price when auction system is added
                    const landValue = 100; // Current standard parcel price
                    const dailyLVT = (landValue * lvtRate) / 365; // Daily portion of annual LVT

                    console.log(`🔍 Parcel [${row},${col}]: owner=${parcel.owner}, landValue=$${landValue}, dailyLVT=$${dailyLVT.toFixed(4)}`);

                    if (dailyLVT > 0) {
                        const playerId = parcel.owner;
                        const currentBalance = this.gameState.playerBalances.get(playerId) || 0;

                        if (currentBalance >= dailyLVT) {
                            // Deduct LVT from player balance
                            this.gameState.playerBalances.set(playerId, currentBalance - dailyLVT);
                            this.governanceSystem.addFunds(dailyLVT, `Daily LVT from parcel [${row},${col}]`);
                            totalLVT += dailyLVT;

                            console.log(`💸 LVT: Player ${playerId} paid $${dailyLVT.toFixed(2)} for parcel [${row},${col}]`);
                        } else {
                            console.warn(`⚠️ ${playerId} cannot pay LVT of $${dailyLVT.toFixed(2)} for parcel [${row},${col}] (balance: $${currentBalance.toFixed(2)})`);
                        }
                    }
                }
            }
        }

        console.log(`🔍 DEBUG: Assessed LVT on ${parcelCount} player-owned parcels`);

        if (totalLVT > 0) {
            console.log(`💰 Daily LVT collected: $${totalLVT.toFixed(2)} from ${parcelCount} parcels`);
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

    /**
     * ACTION MANAGEMENT METHODS
     */

    /**
     * Calculate monthly action allowance (20 actions in Sept, declining by 2 each month to min 10)
     */
    calculateMonthlyActionAllowance() {
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const currentMonth = this.getCurrentGameMonth();
        const currentMonthIndex = monthOrder.indexOf(currentMonth);
        const baseActions = 20;
        const reduction = currentMonthIndex * 2;
        const minimumActions = 10;

        return Math.max(minimumActions, baseActions - reduction);
    }

    /**
     * Get current game month from game time
     */
    getCurrentGameMonth() {
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const monthIndex = Math.floor(this.gameState.gameTime / 30.44) % 12; // ~30.44 days per month
        return monthOrder[monthIndex];
    }

    /**
     * Refresh monthly actions for all players (called at month transition)
     */
    refreshMonthlyActions() {
        const newAllowance = this.calculateMonthlyActionAllowance();

        for (const [playerId, player] of this.gameState.players) {
            // Reset monthly actions to new allowance, keep purchased actions
            player.actions.monthly = newAllowance;
            player.actions.total = player.actions.monthly + player.actions.purchased;

            console.log(`🎯 Player ${playerId} actions refreshed: ${player.actions.total} total (${player.actions.monthly} monthly + ${player.actions.purchased} purchased)`);
        }

        // Update playerActions map for sync
        for (const [playerId, player] of this.gameState.players) {
            this.gameState.playerActions.set(playerId, player.actions.total);
        }
    }

    /**
     * Spend actions for a player
     */
    spendActions(playerId, count, reason = 'action') {
        const player = this.getOrCreatePlayer(playerId);

        if (player.actions.total < count) {
            throw new Error(`Insufficient actions: need ${count}, have ${player.actions.total}`);
        }

        // Spend monthly actions first, then purchased
        let remainingToSpend = count;

        if (player.actions.monthly >= remainingToSpend) {
            player.actions.monthly -= remainingToSpend;
        } else {
            remainingToSpend -= player.actions.monthly;
            player.actions.monthly = 0;
            player.actions.purchased -= remainingToSpend;
        }

        // Update total
        player.actions.total = player.actions.monthly + player.actions.purchased;

        // Update playerActions map for sync
        this.gameState.playerActions.set(playerId, player.actions.total);

        // Add transaction record
        player.transactions.push({
            type: 'ACTION_SPEND',
            amount: -count,
            timestamp: Date.now(),
            description: `Spent ${count} action${count !== 1 ? 's' : ''} on ${reason}`
        });

        console.log(`🎯 Player ${playerId} spent ${count} actions on ${reason}. Remaining: ${player.actions.total}`);
        return true;
    }

    /**
     * Add purchased actions to a player (from marketplace)
     */
    addPurchasedActions(playerId, count, reason = 'marketplace') {
        const player = this.getOrCreatePlayer(playerId);

        player.actions.purchased += count;
        player.actions.total = player.actions.monthly + player.actions.purchased;

        // Update playerActions map for sync
        this.gameState.playerActions.set(playerId, player.actions.total);

        // Add transaction record
        player.transactions.push({
            type: 'ACTION_PURCHASE',
            amount: count,
            timestamp: Date.now(),
            description: `Purchased ${count} action${count !== 1 ? 's' : ''} from ${reason}`
        });

        console.log(`🎯 Player ${playerId} purchased ${count} actions from ${reason}. Total: ${player.actions.total}`);
        return true;
    }

    /**
     * ACTION MARKETPLACE TRANSACTION PROCESSORS
     */

    /**
     * Process creating an action listing
     */
    async processCreateActionListing(transaction) {
        const { playerId, quantity, reservePrice, buyNowPrice } = transaction;

        const player = this.getOrCreatePlayer(playerId);

        // Validate player has enough actions
        if (player.actions.total < quantity) {
            throw new Error(`Insufficient actions to list: need ${quantity}, have ${player.actions.total}`);
        }

        // Calculate auction expiration (end of current month)
        const monthLengthDays = 30.44; // Average days per month
        const currentMonth = Math.floor(this.gameState.gameTime / monthLengthDays);
        const nextMonthStart = (currentMonth + 1) * monthLengthDays;
        const expiresAt = Date.now() + ((nextMonthStart - this.gameState.gameTime) * this.GAME_DAY_MS);

        // Create listing
        const listing = {
            id: this.gameState.actionMarketplace.nextListingId++,
            sellerId: playerId,
            quantity: quantity,
            reservePrice: reservePrice,
            buyNowPrice: buyNowPrice || null,
            currentBid: 0,
            highBidderId: null,
            status: 'active',
            createdAt: Date.now(),
            expiresAt: expiresAt,
            month: this.getCurrentGameMonth()
        };

        // Remove actions from seller (hold in escrow)
        this.spendActions(playerId, quantity, 'action listing');

        // Add to marketplace
        this.gameState.actionMarketplace.listings.set(listing.id, listing);

        console.log(`🏪 Action listing created: ${quantity} actions by ${playerId} for $${reservePrice.toLocaleString()}+ (listing ${listing.id})`);

        return {
            success: true,
            listingId: listing.id,
            listing: listing
        };
    }

    /**
     * Process bidding on an action listing
     */
    async processActionBid(transaction) {
        const { playerId, listingId, bidAmount } = transaction;

        const listing = this.gameState.actionMarketplace.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            throw new Error('Listing not available for bidding');
        }

        if (listing.sellerId === playerId) {
            throw new Error('Cannot bid on your own listing');
        }

        const player = this.getOrCreatePlayer(playerId);

        // Validate bid amount
        const minimumBid = Math.max(listing.reservePrice, Math.ceil(listing.currentBid * 1.1));
        if (bidAmount < minimumBid) {
            throw new Error(`Bid too low: minimum $${minimumBid.toLocaleString()}`);
        }

        // Validate player has enough cash
        if (player.cash < bidAmount) {
            throw new Error(`Insufficient funds: need $${bidAmount.toLocaleString()}, have $${player.cash.toLocaleString()}`);
        }

        // Refund previous high bidder if any
        if (listing.highBidderId && listing.currentBid > 0) {
            const previousBidder = this.getOrCreatePlayer(listing.highBidderId);
            previousBidder.cash += listing.currentBid;

            previousBidder.transactions.push({
                type: 'BID_REFUND',
                amount: listing.currentBid,
                timestamp: Date.now(),
                description: `Bid refund for action listing ${listingId}`
            });
        }

        // Charge new bidder
        player.cash -= bidAmount;
        player.transactions.push({
            type: 'ACTION_BID',
            amount: -bidAmount,
            timestamp: Date.now(),
            description: `Bid $${bidAmount.toLocaleString()} on action listing ${listingId}`
        });

        // Update listing
        listing.currentBid = bidAmount;
        listing.highBidderId = playerId;

        // Extend auction if close to expiry (snipe protection)
        const timeUntilExpiry = listing.expiresAt - Date.now();
        if (timeUntilExpiry < 300000) { // Less than 5 minutes
            listing.expiresAt += 300000; // Add 5 minutes
        }

        console.log(`🏪 Bid placed: $${bidAmount.toLocaleString()} by ${playerId} on listing ${listingId}`);

        return {
            success: true,
            currentBid: listing.currentBid,
            highBidderId: listing.highBidderId,
            expiresAt: listing.expiresAt
        };
    }

    /**
     * Process buy now action
     */
    async processActionBuyNow(transaction) {
        const { playerId, listingId } = transaction;

        const listing = this.gameState.actionMarketplace.listings.get(listingId);
        if (!listing || listing.status !== 'active' || !listing.buyNowPrice) {
            throw new Error('Buy now not available');
        }

        if (listing.sellerId === playerId) {
            throw new Error('Cannot buy your own listing');
        }

        const player = this.getOrCreatePlayer(playerId);

        // Calculate buy now price with premium
        const buyNowPrice = this.calculateBuyNowPrice(listing);

        // Validate player has enough cash
        if (player.cash < buyNowPrice) {
            throw new Error(`Insufficient funds: need $${buyNowPrice.toLocaleString()}, have $${player.cash.toLocaleString()}`);
        }

        // Refund previous high bidder if any
        if (listing.highBidderId && listing.currentBid > 0) {
            const previousBidder = this.getOrCreatePlayer(listing.highBidderId);
            previousBidder.cash += listing.currentBid;

            previousBidder.transactions.push({
                type: 'BID_REFUND',
                amount: listing.currentBid,
                timestamp: Date.now(),
                description: `Bid refund - action listing ${listingId} bought`
            });
        }

        // Charge buyer
        player.cash -= buyNowPrice;
        player.transactions.push({
            type: 'ACTION_BUY_NOW',
            amount: -buyNowPrice,
            timestamp: Date.now(),
            description: `Bought ${listing.quantity} actions for $${buyNowPrice.toLocaleString()}`
        });

        // Pay seller
        const seller = this.getOrCreatePlayer(listing.sellerId);
        seller.cash += buyNowPrice;
        seller.transactions.push({
            type: 'ACTION_SALE',
            amount: buyNowPrice,
            timestamp: Date.now(),
            description: `Sold ${listing.quantity} actions for $${buyNowPrice.toLocaleString()}`
        });

        // Give actions to buyer
        this.addPurchasedActions(playerId, listing.quantity, 'buy now');

        // Mark listing as sold
        listing.status = 'sold';
        listing.finalPrice = buyNowPrice;
        listing.winnerId = playerId;
        listing.soldAt = Date.now();

        // Update price history
        this.gameState.actionMarketplace.priceHistory.push({
            price: buyNowPrice,
            quantity: listing.quantity,
            date: Date.now(),
            type: 'buy_now'
        });

        this.updateAveragePrice();

        console.log(`🏪 Buy now completed: ${listing.quantity} actions sold for $${buyNowPrice.toLocaleString()}`);

        return {
            success: true,
            finalPrice: buyNowPrice,
            actionsReceived: listing.quantity
        };
    }

    /**
     * Calculate buy now price with time-based premium
     */
    calculateBuyNowPrice(listing) {
        if (!listing.buyNowPrice) return 0;

        // If no bids yet, use base buy now price
        if (listing.currentBid === 0) {
            return listing.buyNowPrice;
        }

        // Calculate month progress (0 = start, 1 = end)
        const monthLengthDays = 30.44;
        const currentMonth = Math.floor(this.gameState.gameTime / monthLengthDays);
        const monthStart = currentMonth * monthLengthDays;
        const monthProgress = (this.gameState.gameTime - monthStart) / monthLengthDays;

        // Premium starts at 500% and decays to 0%
        const maxPremiumRate = 5.0; // 500%
        const currentPremiumRate = maxPremiumRate * (1 - monthProgress);

        // If current bid exceeds buy now + premium, no premium (bidding war)
        const premiumPrice = listing.buyNowPrice * (1 + currentPremiumRate);
        if (listing.currentBid >= premiumPrice) {
            return listing.buyNowPrice;
        }

        return Math.floor(premiumPrice);
    }

    /**
     * Process canceling an action listing
     */
    async processCancelActionListing(transaction) {
        const { playerId, listingId } = transaction;

        const listing = this.gameState.actionMarketplace.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            throw new Error('Listing not available for cancellation');
        }

        if (listing.sellerId !== playerId) {
            throw new Error('Can only cancel your own listings');
        }

        // Calculate fee if there are bids
        let fee = 0;
        if (listing.currentBid > 0) {
            const monthProgress = this.calculateMonthProgress();
            const maxFeeRate = 5.0; // 500% of current bid
            const currentFeeRate = maxFeeRate * (1 - monthProgress);
            fee = Math.floor(listing.currentBid * currentFeeRate);
        }

        const player = this.getOrCreatePlayer(playerId);

        // Validate player can afford fee
        if (player.cash < fee) {
            throw new Error(`Insufficient funds for cancellation fee: need $${fee.toLocaleString()}, have $${player.cash.toLocaleString()}`);
        }

        // Charge fee
        if (fee > 0) {
            player.cash -= fee;
            player.transactions.push({
                type: 'LISTING_CANCEL_FEE',
                amount: -fee,
                timestamp: Date.now(),
                description: `Cancellation fee for action listing ${listingId}`
            });

            // Add fee to treasury
            if (this.governanceSystem) {
                this.governanceSystem.addFunds(fee, 'marketplace cancellation fees');
            }
        }

        // Refund high bidder if any
        if (listing.highBidderId && listing.currentBid > 0) {
            const bidder = this.getOrCreatePlayer(listing.highBidderId);
            bidder.cash += listing.currentBid;

            bidder.transactions.push({
                type: 'BID_REFUND',
                amount: listing.currentBid,
                timestamp: Date.now(),
                description: `Bid refund - listing ${listingId} cancelled`
            });
        }

        // Return actions to seller (they will expire at month end)
        this.addPurchasedActions(playerId, listing.quantity, 'cancelled listing');

        // Mark listing as cancelled
        listing.status = 'cancelled';
        listing.cancelledAt = Date.now();
        listing.cancellationFee = fee;

        console.log(`🏪 Listing cancelled: ${listingId} with fee $${fee.toLocaleString()}`);

        return {
            success: true,
            fee: fee,
            actionsReturned: listing.quantity
        };
    }

    /**
     * Process ending auction early
     */
    async processEndActionEarly(transaction) {
        const { playerId, listingId } = transaction;

        const listing = this.gameState.actionMarketplace.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            throw new Error('Listing not available');
        }

        if (listing.sellerId !== playerId) {
            throw new Error('Can only end your own auctions');
        }

        if (listing.currentBid === 0) {
            throw new Error('No bids to end - just cancel the listing');
        }

        // Calculate fee
        const monthProgress = this.calculateMonthProgress();
        const maxFeeRate = 5.0; // 500% of current bid
        const currentFeeRate = maxFeeRate * (1 - monthProgress);
        const fee = Math.floor(listing.currentBid * currentFeeRate);

        const player = this.getOrCreatePlayer(playerId);

        // Validate player can afford fee
        if (player.cash < fee) {
            throw new Error(`Insufficient funds for end early fee: need $${fee.toLocaleString()}, have $${player.cash.toLocaleString()}`);
        }

        // Charge fee
        player.cash -= fee;
        player.transactions.push({
            type: 'END_EARLY_FEE',
            amount: -fee,
            timestamp: Date.now(),
            description: `End early fee for action listing ${listingId}`
        });

        // Pay seller (winning bid minus fee)
        const sellerPayment = listing.currentBid - fee;
        player.cash += sellerPayment;
        player.transactions.push({
            type: 'ACTION_SALE',
            amount: sellerPayment,
            timestamp: Date.now(),
            description: `Sold ${listing.quantity} actions for $${listing.currentBid.toLocaleString()} (net: $${sellerPayment.toLocaleString()})`
        });

        // Pay winner
        const winner = this.getOrCreatePlayer(listing.highBidderId);
        winner.transactions.push({
            type: 'ACTION_WIN',
            amount: -listing.currentBid, // Already charged when bidding
            timestamp: Date.now(),
            description: `Won ${listing.quantity} actions for $${listing.currentBid.toLocaleString()}`
        });

        // Give actions to winner
        this.addPurchasedActions(listing.highBidderId, listing.quantity, 'auction win');

        // Add fee to treasury
        if (this.governanceSystem) {
            this.governanceSystem.addFunds(fee, 'marketplace early end fees');
        }

        // Mark listing as ended early
        listing.status = 'ended_early';
        listing.finalPrice = listing.currentBid;
        listing.winnerId = listing.highBidderId;
        listing.endEarlyFee = fee;
        listing.endedAt = Date.now();

        // Update price history
        this.gameState.actionMarketplace.priceHistory.push({
            price: listing.currentBid,
            quantity: listing.quantity,
            date: Date.now(),
            type: 'ended_early'
        });

        this.updateAveragePrice();

        console.log(`🏪 Auction ended early: ${listing.quantity} actions sold for $${listing.currentBid.toLocaleString()}, fee: $${fee.toLocaleString()}`);

        return {
            success: true,
            finalPrice: listing.currentBid,
            fee: fee,
            actionsTransferred: listing.quantity
        };
    }

    /**
     * Calculate current month progress (0 = start, 1 = end)
     */
    calculateMonthProgress() {
        const monthLengthDays = 30.44;
        const currentMonth = Math.floor(this.gameState.gameTime / monthLengthDays);
        const monthStart = currentMonth * monthLengthDays;
        return (this.gameState.gameTime - monthStart) / monthLengthDays;
    }

    /**
     * Update average price from recent sales
     */
    updateAveragePrice() {
        const recent = this.gameState.actionMarketplace.priceHistory.slice(-10);
        if (recent.length > 0) {
            this.gameState.actionMarketplace.avgPrice = recent.reduce((sum, sale) => sum + sale.price, 0) / recent.length;
        }
    }

    /**
     * Process expired auctions (called at month transition)
     */
    processExpiredActionAuctions() {
        let processed = 0;

        for (const [listingId, listing] of this.gameState.actionMarketplace.listings) {
            if (listing.status === 'active' && listing.month !== this.getCurrentGameMonth()) {
                if (listing.currentBid > 0 && listing.highBidderId) {
                    // Auction sold
                    const seller = this.getOrCreatePlayer(listing.sellerId);
                    const winner = this.getOrCreatePlayer(listing.highBidderId);

                    // Pay seller
                    seller.cash += listing.currentBid;
                    seller.transactions.push({
                        type: 'ACTION_SALE',
                        amount: listing.currentBid,
                        timestamp: Date.now(),
                        description: `Auction sold: ${listing.quantity} actions for $${listing.currentBid.toLocaleString()}`
                    });

                    // Give actions to winner (already charged when bidding)
                    this.addPurchasedActions(listing.highBidderId, listing.quantity, 'auction win');

                    // Update listing
                    listing.status = 'sold';
                    listing.finalPrice = listing.currentBid;
                    listing.winnerId = listing.highBidderId;
                    listing.soldAt = Date.now();

                    // Update price history
                    this.gameState.actionMarketplace.priceHistory.push({
                        price: listing.currentBid,
                        quantity: listing.quantity,
                        date: Date.now(),
                        type: 'auction'
                    });

                    console.log(`🏪 Auction completed: ${listing.quantity} actions sold for $${listing.currentBid.toLocaleString()}`);
                } else {
                    // No bids - return actions to seller (monthly actions will expire anyway)
                    this.addPurchasedActions(listing.sellerId, listing.quantity, 'expired auction');

                    listing.status = 'expired';
                    listing.expiredAt = Date.now();

                    console.log(`🏪 Auction expired: ${listing.quantity} actions returned to ${listing.sellerId}`);
                }
                processed++;
            }
        }

        if (processed > 0) {
            this.updateAveragePrice();
            console.log(`🏪 Processed ${processed} expired action auctions`);
        }

        return processed;
    }

    /**
     * Process action spending (for builds, purchases, etc.)
     */
    async processActionSpend(transaction) {
        const { playerId, count, reason } = transaction;

        // Validate input
        if (!playerId || !count || count <= 0) {
            throw new Error('Invalid action spend parameters');
        }

        // Spend actions
        this.spendActions(playerId, count, reason);

        console.log(`🎯 Action spend processed: ${playerId} spent ${count} actions on ${reason}`);

        return {
            success: true,
            actionsSpent: count,
            reason: reason
        };
    }
}

module.exports = ServerEconomicEngine;