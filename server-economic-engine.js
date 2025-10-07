/**
 * Server Economic Engine v2 - Transaction-Based, Multiplayer-First
 *
 * Architecture:
 * - Transaction-based processing (client sends actions, server calculates)
 * - Single shared room-wide state for all players in the room
 * - Performance = Base × Local Needs × Room JEEFHH × Room CARENS
 * - Real-time updates with smart client deltas
 */

const fs = require('fs');
const path = require('path');

class ServerEconomicEngine {
    constructor(room = null) {
        // Store room reference to check for Solo Mode
        this.room = room;

        // Room-wide game state - single source of truth for this room
        this.gameState = {
            gameTime: 1,           // Game time in days - Start on Sept 2 (day 1)
            gameStartTime: Date.now(),
            gameStarted: false,    // Track pre-game vs in-game state room-wide

            // Room-wide JEEFHH supply/demand state
            jeefhh: {
                jobs: { supply: 0, demand: 0, multiplier: 1.0 },
                energy: { supply: 0, demand: 0, multiplier: 1.0 },
                education: { supply: 0, demand: 0, multiplier: 1.0 },
                food: { supply: 0, demand: 0, multiplier: 1.0 },
                housing: { supply: 0, demand: 0, multiplier: 1.0 },
                healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
            },

            // Room-wide CARENS livability scores (points-based system)
            carens: {
                culture: 0,       // Points on -100 to +100 scale
                affordability: 0,
                resilience: 0,
                environment: 0,
                noise: 0,
                safety: 0,
                multiplier: 1.0   // Combined multiplier (0.6x to 1.4x)
            },

            // Buildings by location
            buildings: new Map(), // key: "row,col" -> BuildingState

            // Grid/Parcel ownership state (server-authoritative)
            grid: null, // Will be initialized as 2D array by initializeGrid()

            // Players
            players: new Map(),   // key: playerId -> PlayerState
            playerBalances: new Map(), // key: playerId -> cash balance (server-authoritative)
            playerActions: new Map(), // key: playerId -> action inventory (server-authoritative)

            // Governance budgets (allocated from monthly LVT revenue)
            budgets: {
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0
            },
            treasury: 0, // Unallocated tax revenue

            // Action Marketplace
            actionMarketplace: {
                nextListingId: 1,
                listings: new Map(), // key: listingId -> AuctionListing
                priceHistory: [],
                avgPrice: 0
            },

            // Land Exchange System (offer-based parcel trading)
            landExchange: {
                nextOfferId: 1,
                activeOffers: new Map(), // key: offerId -> Offer
                maxOffersPerPlayer: 3,
                offerHistory: []
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

        // Debug flags (environment-based)
        const isDevelopment = process.env.NODE_ENV !== 'production';
        this.DEBUG = {
            MASTER: isDevelopment,
            PERFORMANCE: isDevelopment,
            CARENS: isDevelopment,
            REVENUE: isDevelopment,
            BROADCASTS: isDevelopment,
            CACHE: isDevelopment,
            TIMING: true
        };

        // Performance multiplier ranges
        this.JEEFHH_MULTIPLIER_RANGE = { min: 0.4, max: 1.6 };
        this.CARENS_MULTIPLIER_RANGE = { min: 0.6, max: 1.4 };

        // Server-authoritative action costs
        this.ACTION_COSTS = {
            purchaseParcel: 1,
            constructBuilding: 1,
            participateAuction: 1
        };

        // Performance optimization: Caching system
        this.cache = {
            jeefhh: { lastUpdate: 0, data: null, dirty: true },
            carens: new Map(), // Per-building CARENS cache
            buildingPerformances: new Map(), // locationKey -> {lastUpdate, data, dirty}
            playerWealth: new Map(), // playerId -> {lastUpdate, data, dirty}
            lastFullState: null, // For delta comparisons
            lastBroadcast: 0,
            stats: {
                hits: 0,
                misses: 0,
                invalidations: 0
            }
        };

        // Delta tracking for optimized updates
        this.pendingChanges = {
            buildings: new Set(), // Set of locationKeys that changed
            players: new Set(), // Set of playerIds that changed
            jeefhh: false,
            carens: false,
            gameTime: false
        };

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


        // console.log('🏭 Server Economic Engine v2 initialized');
    }

    // ========================================================================
    // CACHE MANAGEMENT METHODS
    // ========================================================================

    /**
     * Invalidate performance cache for a specific building
     */
    invalidateBuildingCache(row, col) {
        const locationKey = `${row},${col}`;
        const cached = this.cache.buildingPerformances.get(locationKey);
        if (cached) {
            cached.dirty = true;
            this.cache.stats.invalidations++;
        }

        // Also invalidate CARENS cache for this building
        const carensCached = this.cache.carens.get(locationKey);
        if (carensCached) {
            carensCached.dirty = true;
        }
    }

    /**
     * Invalidate caches for all buildings within range of a changed building
     * Called when buildings are constructed/destroyed since CARENS depends on neighbors
     */
    invalidateAdjacentCaches(row, col, maxRange = 11) {
        this.cache.stats.invalidations++;

        // Invalidate all buildings within range
        this.gameState.buildings.forEach((building, key) => {
            const [r, c] = key.split(',').map(Number);
            const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
            if (distance <= maxRange) {
                this.invalidateBuildingCache(r, c);
            }
        });

        if (this.DEBUG.CACHE) {
            console.log(`[CACHE] Invalidated caches for buildings within ${maxRange} tiles of [${row},${col}]`);
        }
    }

    /**
     * Log cache statistics periodically
     */
    logCacheStats() {
        const stats = this.cache.stats;
        const total = stats.hits + stats.misses;
        const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 0;

        console.log(`[CACHE] Stats - Hits: ${stats.hits}
    /**
     * Ensure DEBUG object exists (safety check)
     */
    ensureDebug() {
        if (!this.DEBUG) {
            const isDevelopment = process.env.NODE_ENV !== 'production';
            this.DEBUG = {
                MASTER: isDevelopment,
                PERFORMANCE: isDevelopment,
                CARENS: isDevelopment,
                REVENUE: isDevelopment,
                BROADCASTS: isDevelopment,
                CACHE: isDevelopment,
                TIMING: true
            };
        }
        return this.DEBUG;
    }
, Misses: ${stats.misses}, Hit Rate: ${hitRate}%, Invalidations: ${stats.invalidations}`);
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
                    population: 0,
                    price: this.calculateInitialParcelPrice(row, col, gridSize)
                };
            }
        }
        // console.log(`🏞️ Server grid initialized: ${gridSize}x${gridSize} parcels`);
    }

    /**
     * Calculate initial parcel price based on distance from center
     * $200 at center, $100 at perimeter
     */
    calculateInitialParcelPrice(row, col, gridSize) {
        const centerRow = (gridSize - 1) / 2;
        const centerCol = (gridSize - 1) / 2;

        // Calculate Chebyshev distance (max of row/col distance)
        const distanceFromCenter = Math.max(
            Math.abs(row - centerRow),
            Math.abs(col - centerCol)
        );

        // Maximum distance from center to corner
        const maxDistance = Math.max(centerRow, centerCol);

        // Linear interpolation from $200 (center) to $100 (perimeter)
        const priceRange = 200 - 100; // $100 range
        const priceReduction = (distanceFromCenter / maxDistance) * priceRange;

        return Math.round(200 - priceReduction);
    }

    /**
     * Get current price for a parcel (server-authoritative)
     */
    getParcelPrice(row, col) {
        if (!this.gameState.grid ||
            !this.gameState.grid[row] ||
            !this.gameState.grid[row][col]) {
            return 100; // fallback price
        }
        return this.gameState.grid[row][col].price;
    }

    /**
     * Centralized player balance access
     * Get player balance with proper error handling (no fallbacks that mask missing data)
     */
    getPlayerBalance(playerId) {
        if (!this.gameState.playerBalances.has(playerId)) {
            throw new Error(`Player ${playerId} not found in balance system`);
        }
        return this.gameState.playerBalances.get(playerId);
    }

    /**
     * Update neighboring parcel prices when a parcel is purchased
     * Each purchase adds a systematic bump to neighboring unbought parcels
     */
    updateNeighborPrices(row, col, gridSize) {
        const priceIncrease = 10; // $10 increase per neighboring purchase
        const neighbors = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        neighbors.forEach(([dRow, dCol]) => {
            const newRow = row + dRow;
            const newCol = col + dCol;

            // Check bounds
            if (newRow >= 0 && newRow < gridSize &&
                newCol >= 0 && newCol < gridSize) {

                const neighbor = this.gameState.grid[newRow][newCol];
                // Only increase price for unbought parcels (City-owned)
                if (neighbor.owner === 'City') {
                    neighbor.price += priceIncrease;
        // console.log(`[REVENUE] Neighbor price increased: [${newRow},${newCol}] now $${neighbor.price}`);
                }
            }
        });
    }

    /**
     * Set the broadcast function for real-time multiplayer updates
     */
    setBroadcastFunction(broadcastFn) {
        this.broadcastFunction = broadcastFn;
        // console.log('[BROADCAST] WebSocket broadcast function connected to economic engine');
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

        // console.log(`📋 Loaded ${this.buildingDefinitions.size} building definitions`);
        } catch (error) {
            console.error('[ERROR] Failed to load building definitions:', error);
        }
    }

    /**
     * Update game time and trigger time-based events
     */
    updateGameTime() {
        // Room now sets gameTime directly based on elapsed time
        // This method just processes events based on current time
        const previousDay = Math.floor(this.lastProcessedDay || 0);
        const currentDay = Math.floor(this.gameState.gameTime);

        // Check for building completion every update (not just daily)
        this.processAutomaticBuildingCompletion();

        // Land Exchange: No timers needed (async offer system)

        // Trigger daily events on day transitions
        if (currentDay > previousDay) {
        // console.log(`🕒 DAY TRANSITION: ${previousDay} → ${currentDay} (time: ${this.gameState.gameTime.toFixed(3)})`);
            this.processDailyEvents();
            this.lastProcessedDay = currentDay;
        }

        return this.gameState.gameTime;
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
        // console.log(`[INFO] Auto-completing construction: ${building.id} at ${locationKey} after ${building.constructionDays} days`);

                    // Mark as completed
                    building.underConstruction = false;
                    building.constructionCompleteTime = now;
                    building.age = 0; // Reset age to 0 when completed

                    // Update grid parcel to reference the completed building
                    const [row, col] = building.location;
                    if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
                        this.gameState.grid[row][col].building = building.id;
        // console.log(`🏞️ Grid updated: parcel [${row},${col}] now has building ${building.id}`);
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

        // If any buildings completed, trigger room-wide recalculation
        if (completedBuildings.length > 0) {
        // console.log(`[INFO] ${completedBuildings.length} buildings completed construction automatically`);

            // Recalculate room-wide economics with new completed buildings
            this.recalculateGlobalEconomics();

            // Ensure all completed buildings have performance data before broadcasting
            completedBuildings.forEach(({ locationKey, building }) => {
                const [row, col] = building.location;
                if (!building.performance || !building.performance.summary) {
                    building.performance = this.calculateBuildingPerformance(row, col);
                    if (building.performance && building.performance.summary) {
        // console.log(`[CARENS] Performance calculated: ${building.id} at [${row},${col}] - Revenue: $${building.performance.summary.revenue}, Net: $${building.performance.summary.netIncome}`);
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

        // console.log(`[BROADCAST] Broadcasting BUILD_COMPLETE_AUTO for ${building.id} at ${locationKey}`);
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
        // console.log(`📅 Game Day ${currentDay} - Processing daily events`);
        }

        // Check for monthly events (first day of new month using real calendar boundaries)
        if (this.isFirstDayOfMonth(currentDay)) {
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

        // Always broadcast gameTime updates to keep all clients synchronized
        // Even on quiet days, time must stay in sync across all players
        this.broadcastGameState({ type: 'DAILY_UPDATE', source: 'timer' });

        // Broadcast Commonwealth scores update every day
        this.broadcastCommonwealthScores();

        // Check for victory conditions
        this.checkVictoryConditions(currentDay);
    }

    /**
     * Check victory conditions and trigger game end if met
     */
    checkVictoryConditions(currentDay) {
        // Don't check if game already ended
        if (this.gameState.gameEnded) {
            return;
        }

        const scores = this.calculateCommonwealthScores();
        const topScore = scores[0]; // Highest scorer
        const population = this.getCityPopulation();

        // Victory Condition 1: Early Victory (Civic Victory)
        // - Commonwealth Score >= 50.0
        // - City population >= 100
        if (topScore && topScore.score >= 50.0 && population >= 100) {
            this.triggerVictory(topScore.playerId, 'EARLY_CIVIC_VICTORY', scores, currentDay);
            return;
        }

        // Victory Condition 2: Year-End Victory (Sept 1, day 366)
        // - Game reaches day 366 (Sept 1 of next year)
        // - Highest Commonwealth Score wins
        if (currentDay >= 366) {
            this.triggerVictory(topScore.playerId, 'YEAR_END_VICTORY', scores, currentDay);
            return;
        }
    }

    /**
     * Trigger game victory and broadcast results
     */
    triggerVictory(winnerId, victoryType, scores, finalDay) {
        console.log(`🏆 VICTORY! Player ${winnerId} wins via ${victoryType} on day ${finalDay}`);

        // Mark game as ended
        this.gameState.gameEnded = true;
        this.gameState.victoryType = victoryType;
        this.gameState.winnerId = winnerId;
        this.gameState.finalDay = finalDay;

        // Calculate fun stats for victory screen
        const funStats = this.calculateFunStats();

        // Broadcast victory to all players
        if (this.broadcastFunction) {
            this.broadcastFunction({
                type: 'GAME_VICTORY',
                winner: {
                    playerId: winnerId,
                    playerName: this.gameState.players.get(winnerId)?.name || 'Unknown',
                    playerColor: this.gameState.players.get(winnerId)?.color || '#FFFFFF'
                },
                victoryType: victoryType,
                finalDay: finalDay,
                scores: scores.map(s => ({
                    playerId: s.playerId,
                    playerName: this.gameState.players.get(s.playerId)?.name || 'Player',
                    playerColor: this.gameState.players.get(s.playerId)?.color,
                    rank: s.rank,
                    score: s.score,
                    wealthScore: s.wealthScore,
                    civicScore: s.civicScore,
                    wealth: s.wealth,
                    lvtPaid: s.lvtPaid,
                    publicFundingReceived: s.publicFundingReceived
                })),
                funStats: funStats,
                timestamp: Date.now()
            });
        }

        // TODO: Save game to database for historical rankings
    }

    /**
     * Calculate fun stats for victory screen
     */
    calculateFunStats() {
        const stats = {
            // City totals
            totalPopulation: this.getCityPopulation(),
            totalWealth: 0,
            totalLVTRaised: 0,
            totalPublicSpending: 0,

            // Building stats
            totalBuildings: this.gameState.buildings.size,
            buildingsByCategory: {
                housing: 0,
                jobs: 0,
                education: 0,
                healthcare: 0,
                food: 0,
                happiness: 0
            },

            // Governance stats
            finalLVTRate: this.governanceSystem?.getCurrentLVTRate() || 0,
            totalVotesCast: 0,

            // Land Exchange stats (if available)
            totalOffersMade: 0,
            totalOffersAccepted: 0,
            totalOffersMatched: 0,
            offerAcceptanceRate: 0
        };

        // Calculate totals
        for (const [playerId, playerState] of this.gameState.players) {
            const playerWealth = this.calculatePlayerWealth(playerId, this.getPlayerBalance(playerId));
            stats.totalWealth += playerWealth;
            stats.totalLVTRaised += (playerState.totalLVTPaid || 0);
            stats.totalPublicSpending += (playerState.totalPublicFundingReceived || 0);
        }

        // Count buildings by category
        for (const [locationKey, building] of this.gameState.buildings) {
            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.category) {
                const category = buildingDef.category;
                if (stats.buildingsByCategory.hasOwnProperty(category)) {
                    stats.buildingsByCategory[category]++;
                }
            }
        }

        // Land Exchange stats
        if (this.gameState.landExchange) {
            const offers = Array.from(this.gameState.landExchange.activeOffers.values());
            stats.totalOffersMade = offers.length + (this.gameState.landExchange.offerHistory?.length || 0);

            const history = this.gameState.landExchange.offerHistory || [];
            stats.totalOffersAccepted = history.filter(h => h.type === 'accepted').length;
            stats.totalOffersMatched = history.filter(h => h.type === 'matched').length;

            if (stats.totalOffersMade > 0) {
                stats.offerAcceptanceRate = Math.round((stats.totalOffersAccepted / stats.totalOffersMade) * 100);
            }
        }

        return stats;
    }

    /**
     * Process monthly events (governance points, budget allocations, etc.)
     */
    processMonthlyEvents(currentDay) {
        // Use proper calendar boundaries instead of simple 30-day months
        const monthName = this.getCurrentGameMonth();
        const currentMonth = Math.floor((this.gameState.gameTime - 1) / 30) + 1; // Calculate current month
        // console.log(`🗳️ MONTH TRANSITION: Starting ${monthName} (day ${currentDay} - first day of new month)`);

        // Award governance points to all players (2 points per month)
        this.gameState.players.forEach((playerState, playerId) => {
            // Award points directly to player's governance state if they have one
            if (playerState.governance) {
                playerState.governance.votingPoints = (playerState.governance.votingPoints || 0) + 2;
        // console.log(`🗳️ Awarded 2 governance points to player ${playerId} (total: ${playerState.governance.votingPoints})`);
            }
        });

        // Refresh monthly actions for all players
        this.refreshMonthlyActions();

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

        // Calculate and apply budget allocations based on governance votes
        this.calculateMonthlyBudgets();
        this.transferMonthlyFunds();

        // console.log(`[CARENS] Monthly events completed for ${monthName}`);
    }

    /**
     * CORE TRANSACTION PROCESSING
     */

    /**
     * Process a transaction from a client
     */
    async processTransaction(transaction) {
        // console.log('🔄 Processing transaction:', transaction.type, transaction);

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

                // Land Exchange System
                case 'LAND_EXCHANGE_MAKE_OFFER':
                    result = await this.processMakeOffer(transaction);
                    break;

                case 'LAND_EXCHANGE_RESPOND':
                    result = await this.processOfferResponse(transaction);
                    break;

                case 'LAND_EXCHANGE_WITHDRAW':
                    result = await this.processWithdrawOffer(transaction);
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

            // Recalculate room-wide economics after any building change
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
            console.error('[ERROR] Transaction failed:', error);
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

        // Use playerBalances Map for balance tracking
        const currentBalance = this.getPlayerBalance(playerId);

        // ✅ ENFORCE ACTION COST (critical bug fix)
        const actionCost = this.ACTION_COSTS.constructBuilding || 1;
        const player = this.getOrCreatePlayer(playerId);
        if (!player.actions || player.actions.total < actionCost) {
            throw new Error(`Insufficient actions: need ${actionCost}, have ${player.actions?.total || 0}`);
        }

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

        // Calculate public funding and budget spending
        const buildingCategory = buildingDef.category || 'housing';
        const budgetCategory = this.mapBuildingToBudgetCategory(buildingCategory);
        const fullCost = buildingDef.economics?.buildCost || buildingDef.cost || cost;
        const categoryBudget = this.gameState.budgets?.[budgetCategory] || 0;
        const publicFunding = Math.min(categoryBudget, fullCost);
        const playerCost = Math.max(0, fullCost - publicFunding);

        // console.log(`[INFO] BUILD: ${buildingId} at [${row},${col}] - Full cost: $${fullCost}, Public funding: $${publicFunding}, Player cost: $${playerCost}`);

        // Validate that the client sent the correct player cost
        if (Math.abs(cost - playerCost) > 0.01) {
            console.warn(`[WARN] Cost mismatch - Client sent: $${cost}, Server calculated: $${playerCost}`);
            // For now, use server calculation but log the discrepancy
        }

        // Spend from budget category if public funding is used
        if (publicFunding > 0) {
            const budgetSpent = this.spendFromBudget(budgetCategory, publicFunding, `Construction of ${buildingId} at [${row},${col}]`);
            if (!budgetSpent) {
                throw new Error(`Insufficient ${budgetCategory} budget for public funding`);
            }

            // Track public funding received by player
            const playerState = this.gameState.players.get(playerId);
            if (playerState) {
                playerState.totalPublicFundingReceived = (playerState.totalPublicFundingReceived || 0) + publicFunding;
                console.log(`[CIVIC] Player ${playerId} received $${publicFunding} public funding (total: $${playerState.totalPublicFundingReceived})`);
            }
        }

        // Deduct player cost from playerBalances (reduced by public funding)
        const newBalance = currentBalance - playerCost;
        this.gameState.playerBalances.set(playerId, newBalance);

        // ✅ SPEND ACTION (critical bug fix)
        this.spendActions(playerId, actionCost, `building ${buildingDef.name}`);

        console.log(`[REVENUE] BUILD_START: ${playerId} balance ${currentBalance} → ${newBalance}, actions ${player.actions.total + actionCost} → ${player.actions.total} (built ${buildingDef.name})`);

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

        // Intelligently invalidate only affected caches
        this.invalidateCaches('building_added', [locationKey]);
        this.pendingChanges.buildings.add(locationKey);

        // console.log(`[INFO] Construction started: ${buildingId} at ${locationKey} by ${playerId}`);

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

        // Invalidate caches for this building and all neighbors (CARENS depends on adjacency)
        this.invalidateAdjacentCaches(row, col);

        // Update grid parcel to reference the completed building
        if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].building = building.id;
        // console.log(`🏞️ Grid updated: parcel [${row},${col}] now has building ${building.id}`);
        }

        // Calculate initial performance
        const performance = this.calculateBuildingPerformance(row, col);
        building.performance = performance;

        // console.log(`[INFO] Construction completed: ${building.id} at ${locationKey}`);

        // Broadcast building state update immediately
        this.broadcastBuildingStates();

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

        // Intelligently invalidate only affected caches
        this.invalidateCaches('building_removed', [locationKey]);
        this.pendingChanges.buildings.add(locationKey);

        // Remove building reference from grid parcel
        if (this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].building = null;
        // console.log(`🏞️ Grid updated: parcel [${row},${col}] building reference removed`);
        }

        // Remove residents
        this.gameState.residentsPerBuilding.delete(locationKey);

        // console.log(`🗑️ Building destroyed: ${building.id} at ${locationKey} (cost: $${demolitionCost.toFixed(2)})`);

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
     * Recalculate room-wide JEEFHH and CARENS after building changes
     */
    recalculateGlobalEconomics() {
        // console.log('[PERF] DEBUG: recalculateGlobalEconomics() called - building count:', this.gameState.buildings.size);
        this.calculateGlobalJEEFHH();
        this.calculateGlobalCARENS();
        this.recalculateAllBuildingPerformances();
    }

    /**
     * Calculate room-wide JEEFHH supply/demand and multipliers (with caching)
     */
    calculateGlobalJEEFHH() {
        // Check cache validity (30 second TTL)
        const now = Date.now();
        if (!this.cache.jeefhh.dirty && this.cache.jeefhh.data &&
            (now - this.cache.jeefhh.lastUpdate) < 30000) {
            // Use cached data
            this.gameState.jeefhh = this.cache.jeefhh.data;
            return;
        }
        // Reset supply (demand is calculated by age-aware system)
        Object.keys(this.gameState.jeefhh).forEach(resource => {
            this.gameState.jeefhh[resource].supply = 0;
            // Don't reset demand - it's calculated by calculateAgeAwareDemand()
        });

        // Sum supply from all completed buildings
        let buildingCount = 0;
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) {
        // console.log(`[INFO] Skipping building under construction: ${building.id} at ${locationKey}`);
                continue;
            }

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (!buildingDef || !buildingDef.resources) {
        // console.log(`[WARN] No building definition or resources for: ${building.id}`);
                continue;
            }

            const econ = buildingDef.resources;
            buildingCount++;

            // Supply contributions
            this.gameState.jeefhh.jobs.supply += econ.jobsProvided || 0;
            this.gameState.jeefhh.energy.supply += econ.energyProvided || 0;
            this.gameState.jeefhh.education.supply += econ.educationProvided || 0;
            this.gameState.jeefhh.food.supply += econ.foodProvided || 0;
            this.gameState.jeefhh.housing.supply += econ.housingProvided || 0;
            this.gameState.jeefhh.healthcare.supply += econ.healthcareProvided || 0;

        // console.log(`🏠 Adding supply from ${building.id}: housing+${econ.housingProvided || 0}, jobs+${econ.jobsProvided || 0}, food+${econ.foodProvided || 0}, energy+${econ.energyProvided || 0}`);
        }

        // console.log(`[CARENS] JEEFHH calculation: ${buildingCount} completed buildings`);
        // console.log(`[CARENS] Total supply: housing=${this.gameState.jeefhh.housing.supply}, jobs=${this.gameState.jeefhh.jobs.supply}, food=${this.gameState.jeefhh.food.supply}, energy=${this.gameState.jeefhh.energy.supply}`);

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

        // console.log('[CARENS] Room-wide JEEFHH updated:', this.gameState.jeefhh);

        // Update cache
        this.cache.jeefhh = {
            lastUpdate: now,
            data: JSON.parse(JSON.stringify(this.gameState.jeefhh)), // Deep copy
            dirty: false
        };
        this.pendingChanges.jeefhh = true;
    }

    /**
     * Calculate room-wide CARENS scores and multiplier
     */
    calculateGlobalCARENS() {
        console.log('🏛️ calculateGlobalCARENS() START - building count:', this.gameState.buildings.size);
        const carens = this.gameState.carens;
        const buildingCount = this.gameState.buildings.size;

        // Governance debug: Calculating CARENS with ${buildingCount} buildings`);

        // Start CARENS scores at neutral (0 points on -100 to +100 scale)
        let culturePoints = 0;
        let affordabilityPoints = 0;
        let resiliencePoints = 0;
        let environmentPoints = 0;
        let noisePoints = 0;
        let safetyPoints = 0;

        // Sum CARENS contributions from all completed buildings (on -100 to +100 scale)
        for (const [locationKey, building] of this.gameState.buildings) {
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (!buildingDef || !buildingDef.livability) continue;

            const livability = buildingDef.livability;

            // Add raw CARENS impacts (values from CSV are in -100 to +100 range)
            const cultureValue = this.extractLivabilityValue(livability.culture) || 0;
            const affordabilityValue = this.extractLivabilityValue(livability.affordability) || 0;
            const resilienceValue = this.extractLivabilityValue(livability.resilience) || 0;
            const environmentValue = this.extractLivabilityValue(livability.environment) || 0;
            const noiseValue = this.extractLivabilityValue(livability.noise) || 0;
            const safetyValue = this.extractLivabilityValue(livability.safety) || 0;

            culturePoints += cultureValue;
            affordabilityPoints += affordabilityValue;
            resiliencePoints += resilienceValue;
            environmentPoints += environmentValue;
            noisePoints += noiseValue;
            safetyPoints += safetyValue;

        }

        console.log('🏛️ calculateGlobalCARENS() - Loop completed, totals:', {
            culturePoints, affordabilityPoints, resiliencePoints,
            environmentPoints, noisePoints, safetyPoints
        });

        // Store raw points in both top-level (for vitality bars) and nested structure (for tooltips)
        carens.culture = culturePoints;
        carens.affordability = affordabilityPoints;
        carens.resilience = resiliencePoints;
        carens.environment = environmentPoints;
        carens.noise = noisePoints;
        carens.safety = safetyPoints;

        // Also update nested points structure for tooltip compatibility
        if (!carens.points) {
            carens.points = {};
        }
        carens.points.culture = culturePoints;
        carens.points.affordability = affordabilityPoints;
        carens.points.resilience = resiliencePoints;
        carens.points.environment = environmentPoints;
        carens.points.noise = noisePoints;
        carens.points.safety = safetyPoints;

        // Calculate average for multiplier (convert raw points to 0-1 for multiplier calculation)
        const avgPoints = (carens.culture + carens.affordability + carens.resilience +
                          carens.environment + carens.noise + carens.safety) / 6;

        // Normalize average points to 0-1 scale for multiplier only
        const normalizedAvg = (avgPoints + 100) / 200; // -100→+100 becomes 0→1

        // Convert to multiplier (0.6x to 1.4x)
        carens.multiplier = 0.6 + (normalizedAvg * 0.8);

        console.log('🏛️ CARENS CALCULATED:', {
            culture: carens.culture,
            affordability: carens.affordability,
            resilience: carens.resilience,
            environment: carens.environment,
            noise: carens.noise,
            safety: carens.safety,
            buildingCount: this.gameState.buildings.size
        });
    }

    /**
     * Extract livability value from building definition (handles both number and object formats)
     */
    extractLivabilityValue(livabilityData) {
        if (typeof livabilityData === 'number') {
            // Convert decimal values (e.g., 0.02, 0.20) to points scale (-100 to +100)
            // Decimal values are multiplied by 100 to get points
            return Math.round(livabilityData * 100);
        } else if (typeof livabilityData === 'object' && livabilityData !== null) {
            // Extract impact value from {impact, attenuation} format
            return livabilityData.impact || livabilityData.effect || 0;
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
        const startTime = this.DEBUG.TIMING ? Date.now() : 0;
        const locationKey = `${row},${col}`;

        // Check cache first
        const cached = this.cache.buildingPerformances.get(locationKey);
        if (cached && !cached.dirty) {
            this.cache.stats.hits++;
            if (this.DEBUG.CACHE) {
                console.log(`[CACHE] Hit for building performance at [${row},${col}]`);
            }
            return cached.data;
        }
        this.cache.stats.misses++;

        const building = this.gameState.buildings.get(locationKey);

        if (this.DEBUG.PERFORMANCE) {
            console.log(`[PERF] calculateBuildingPerformance called for [${row},${col}]`);
        }

        if (!building) {
            console.log(`[ERROR] No building found at [${row},${col}]`);
            return null;
        }

        if (building.underConstruction) {
            console.log(`[INFO] Building at [${row},${col}] is under construction`);
            return null;
        }

        const buildingDef = this.buildingDefinitions.get(building.id);
        console.log(`[DATA] Building def for ${building.id}:`, buildingDef ? 'FOUND' : 'NOT FOUND');

        if (!buildingDef) {
            console.log(`[ERROR] No building definition found for ${building.id}`);
            return null;
        }

        if (!buildingDef.economics) {
            console.log(`[ERROR] Building ${building.id} has no economics property. Available keys:`, Object.keys(buildingDef));
            return null;
        }

        const econ = buildingDef.economics;
        const baseRevenue = econ.maxRevenue || 0;
        console.log(`[REVENUE] Base revenue for ${building.id}: $${baseRevenue}`);

        // 1. Core needs satisfaction (local JEEFHH from adjacent 8 tiles)
        const localNeedsSatisfactionData = this.calculateLocalNeedsSatisfaction(row, col);
        const coreNeedsSatisfaction = localNeedsSatisfactionData.overallSatisfaction;

        // 2. CARENS multiplier (0.6x to 1.4x, only applies if population > 100)
        const totalResidents = this.gameState.totalResidents || 0;
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
        // building.condition is already stored as 0.0-1.0 decimal, not 0-100 percentage
        const conditionFactor = building.condition || 1.0;

        // Final revenue calculation
        // Revenue = Base × Performance × Condition × Global JEEFHH
        const actualRevenue = baseRevenue * performance * conditionFactor * globalJEEFHHMultiplier;

        // Maintenance calculation - increases with age due to decay
        const baseMaintenance = econ.maintenanceCost || 0;
        const decayRate = (econ.decayRate || 0.05) / 100; // Convert % to decimal
        const buildingAge = building.age || 0;
        // Maintenance increases with cumulative decay: base * (1 + decayRate)^age
        const actualMaintenance = baseMaintenance * Math.pow(1 + decayRate, buildingAge);

        const performanceData = {
            location: [row, col],
            buildingId: building.id,

            // Summary for client tooltips
            summary: {
                performance: Math.round(performance * 100), // Performance % = core needs × CARENS
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
                performance, // Core needs × CARENS
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

        if (this.DEBUG.REVENUE) {
            console.log(`[REVENUE] [${row},${col}] ${building.id} - Revenue: ${actualRevenue.toFixed(2)}, Maint: ${actualMaintenance.toFixed(2)}, Net: ${(actualRevenue - actualMaintenance).toFixed(2)}`);
        }

        // TEMP DEBUG: Detailed revenue breakdown for negative net income or taqueria
        if ((actualRevenue - actualMaintenance) < 0 || building.id === 'taqueria') {
            console.log(`💰 [${building.id}] Revenue calc:`, {
                baseRevenue,
                performance: Math.round(performance * 1000) / 10 + '%',
                coreNeeds: Math.round(coreNeedsSatisfaction * 1000) / 10 + '%',
                carensMultiplier: carensMultiplier.toFixed(3) + 'x',
                conditionFactor: Math.round(conditionFactor * 1000) / 10 + '%',
                globalJEEFHH: globalJEEFHHMultiplier.toFixed(3) + 'x',
                revenue: actualRevenue.toFixed(2),
                baseMaintenance,
                decayRate: (decayRate * 100).toFixed(3) + '%',
                buildingAge,
                expenses: actualMaintenance.toFixed(2),
                netIncome: (actualRevenue - actualMaintenance).toFixed(2)
            });
        }

        // Store in cache
        this.cache.buildingPerformances.set(locationKey, {
            lastUpdate: Date.now(),
            data: performanceData,
            dirty: false
        });

        if (this.DEBUG.TIMING) {
            const elapsed = Date.now() - startTime;
            if (elapsed > 50) {
                console.warn(`[TIMING] Performance calculation took ${elapsed}ms for [${row},${col}]`);
            }
        }

        return performanceData;
    }

    /**
     * Calculate local needs satisfaction from connected parcels (adjacent 8)
     */
    calculateLocalNeedsSatisfaction(row, col) {
        const building = this.gameState.buildings.get(`${row},${col}`);
        const buildingDef = this.buildingDefinitions.get(building.id);

        // Get connected buildings (8 adjacent)
        const connectedSupply = {
            energy: 0,
            jobs: 0,
            food: 0,
            education: 0,
            healthcare: 0
        };

        // DEBUG: Log adjacency check for this building
        let adjacentCount = 0;

        this.ADJACENCY_OFFSETS.forEach(([dr, dc]) => {
            const connectedKey = `${row + dr},${col + dc}`;
            const connectedBuilding = this.gameState.buildings.get(connectedKey);

            if (connectedBuilding && !connectedBuilding.underConstruction) {
                adjacentCount++;
                const connectedDef = this.buildingDefinitions.get(connectedBuilding.id);
                if (connectedDef && connectedDef.resources) {
                    connectedSupply.energy += connectedDef.resources.energyProvided || 0;
                    connectedSupply.jobs += connectedDef.resources.jobsProvided || 0;
                    connectedSupply.food += connectedDef.resources.foodProvided || 0;
                    connectedSupply.education += connectedDef.resources.educationProvided || 0;
                    connectedSupply.healthcare += connectedDef.resources.healthcareProvided || 0;

                    // DEBUG: Log resource contributions
                    // if (connectedDef.resources.energyProvided > 0 || connectedDef.resources.jobsProvided > 0 || connectedDef.resources.foodProvided > 0) {
                    //     console.log(`[ADJACENCY] [${row},${col}] ${building.id} sees adjacent ${connectedBuilding.id} at [${row+dr},${col+dc}] providing:`,
                    //         `Energy: ${connectedDef.resources.energyProvided}, Jobs: ${connectedDef.resources.jobsProvided}, Food: ${connectedDef.resources.foodProvided}`);
                    // }
                }
            }
        });

        // console.log(`[SUPPLY] [${row},${col}] ${building.id} - ${adjacentCount} adjacent buildings - Total supply:`, connectedSupply);

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
            const energySatisfaction = Math.min(1.0, connectedSupply.energy / energyRequired);
            satisfactionRatios.push(energySatisfaction);

            detailedSatisfaction.energy = {
                required: energyRequired,
                supplied: connectedSupply.energy,
                satisfaction: energySatisfaction
            };
        }

        // For housing buildings, check resident needs based on capacity
        const housingProvided = buildingDef.resources.housingProvided || 0;
        if (housingProvided > 0) {
            const potentialResidents = housingProvided * 2; // 2 people per bedroom

            // Each resident needs nearby jobs, food, education, and healthcare access
            const jobsNeeded = potentialResidents * 0.5; // 0.5 jobs per resident
            const foodNeeded = potentialResidents * 2; // 2 food units per resident
            const educationNeeded = potentialResidents * 0.3; // 0.3 education per resident
            const healthcareNeeded = potentialResidents * 0.2; // 0.2 healthcare per resident

            if (jobsNeeded > 0) {
                const jobsSatisfaction = Math.min(1.0, connectedSupply.jobs / jobsNeeded);
                satisfactionRatios.push(jobsSatisfaction);

                detailedSatisfaction.jobs = {
                    required: jobsNeeded,
                    supplied: connectedSupply.jobs,
                    satisfaction: jobsSatisfaction
                };
            }

            if (foodNeeded > 0) {
                const foodSatisfaction = Math.min(1.0, connectedSupply.food / foodNeeded);
                satisfactionRatios.push(foodSatisfaction);

                detailedSatisfaction.food = {
                    required: foodNeeded,
                    supplied: connectedSupply.food,
                    satisfaction: foodSatisfaction
                };
            }

            if (educationNeeded > 0) {
                const educationSatisfaction = Math.min(1.0, connectedSupply.education / educationNeeded);
                satisfactionRatios.push(educationSatisfaction);

                detailedSatisfaction.education = {
                    required: educationNeeded,
                    supplied: connectedSupply.education,
                    satisfaction: educationSatisfaction
                };
            }

            if (healthcareNeeded > 0) {
                const healthcareSatisfaction = Math.min(1.0, connectedSupply.healthcare / healthcareNeeded);
                satisfactionRatios.push(healthcareSatisfaction);

                detailedSatisfaction.healthcare = {
                    required: healthcareNeeded,
                    supplied: connectedSupply.healthcare,
                    satisfaction: healthcareSatisfaction
                };
            }
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

        // console.log(`[INFO] [${row},${col}] ${building.id} - Local Needs Satisfaction: ${(finalSatisfaction * 100).toFixed(1)}% (checked ${satisfactionRatios.length} requirements)`);

        return {
            overallSatisfaction: finalSatisfaction,
            detailedSatisfaction: detailedSatisfaction
        };
    }

    /**
     * Calculate JEEFHH multiplier for a specific building type
     */
    calculateGlobalJEEFHHMultiplier() {
        // JEEFHH is truly room-wide: all buildings affected by the worst-performing resource
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

        // Use the minimum multiplier to represent room-wide economic stress
        const globalMultiplier = Math.min(...multipliers);

        // console.log(`🌐 Room-wide JEEFHH multiplier: ${globalMultiplier.toFixed(3)} (worst: ${Math.min(...multipliers).toFixed(3)})`);

        return globalMultiplier;
    }

    /**
     * Calculate local CARENS multiplier based on adjacent parcels
     */
    calculateLocalCARENSMultiplier(row, col) {
        // Start from neutral baseline (0 points) - each building starts neutral
        const localCarens = {
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0
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
                            // Handle both object format {impact, attenuation} and legacy number format
                            const livabilityData = buildingDef.livability[category];
                            const effect = typeof livabilityData === 'object' ? (livabilityData.impact || 0) : (livabilityData || 0);
                            const range = typeof livabilityData === 'object' ? (livabilityData.attenuation || 2) : (buildingDef.livability[`${category}_range`] || 2);

                            // Only apply effect if within range and effect is non-zero
                            if (effect !== 0 && distance <= range) {
                                // Linear attenuation: full effect at distance 0, zero effect at max range
                                const attenuation = Math.max(0, 1.0 - (distance / range));
                                const attenuatedEffect = effect * attenuation;
                                localCarens[category] += attenuatedEffect;

                                // Debug logging for attenuation
                                if (row === 2 && col === 2) { // Only log for specific location to avoid spam
        // console.log(`🔄 CARENS[${r},${c}→${row},${col}] ${category}: ${effect} * ${attenuation.toFixed(2)} = ${attenuatedEffect.toFixed(1)}`);
                                }
                            }
                        });
                    }
                }
            }
        }

        // Calculate net CARENS total (sum of all categories)
        const netCarensTotal = localCarens.culture + localCarens.affordability + localCarens.resilience +
                              localCarens.environment + localCarens.noise + localCarens.safety;

        // console.log(`[CARENS] CARENS for [${row},${col}]:`, localCarens, `Total: ${netCarensTotal}`);

        // Convert to multiplier: 0 = 1.0x (neutral), +100 = 1.4x (max), -100 = 0.6x (min)
        // Formula: 1.0 + (netCarensTotal / 100) * 0.4
        // Your example: +20 points = 1.0 + (20/100) * 0.4 = 1.08x
        const localMultiplier = 1.0 + (netCarensTotal / 100) * 0.4;

        // console.log(`[CARENS] CARENS multiplier for [${row},${col}]: ${localMultiplier.toFixed(3)}x (clamped from ${netCarensTotal})`);

        // Clamp to reasonable bounds (0.6x to 1.4x)
        const clampedMultiplier = Math.max(0.6, Math.min(1.4, localMultiplier));

        // console.log(`[INFO] Final CARENS for [${row},${col}]: ${clampedMultiplier.toFixed(3)}x`);

        return {
            multiplier: clampedMultiplier,
            scores: localCarens,
            total: netCarensTotal
        };
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
        // console.log(`👥 Residents updated: ${this.gameState.totalResidents} total (${this.gameState.demographics.children}c/${this.gameState.demographics.adults}a/${this.gameState.demographics.seniors}s)`);
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

        // console.log(`🧲 Economic attractiveness: ${attractiveness.toFixed(3)} (core: ${coreScore.toFixed(3)}, quality: ${qualityScore.toFixed(3)})`);
        // Economics debug JEEFHH multipliers: jobs=${jeefhh.jobs.multiplier.toFixed(3)}, housing=${jeefhh.housing.multiplier.toFixed(3)}, food=${jeefhh.food.multiplier.toFixed(3)}, energy=${jeefhh.energy.multiplier.toFixed(3)}`);
        // Economics debug Quality multipliers: education=${jeefhh.education.multiplier.toFixed(3)}, healthcare=${jeefhh.healthcare.multiplier.toFixed(3)}, carens=${carens.multiplier.toFixed(3)}`);
        return attractiveness;
    }

    /**
     * Update total population based on economic conditions
     */
    updateTotalPopulation(attractiveness) {
        const dynamics = this.POPULATION_DYNAMICS;
        // Use fractional population for calculations to allow proper accumulation
        const currentPop = this.gameState.demographics.fractionalTotal || this.gameState.demographics.total;

        // Base growth rate adjusted by economic attractiveness
        const attractivenessModifier = (attractiveness - 1.0) * dynamics.migrationSensitivity;
        const effectiveGrowthRate = dynamics.baseGrowthRate + attractivenessModifier;

        // Daily growth (convert yearly rate to daily)
        const dailyGrowthRate = effectiveGrowthRate / 365;

        // Calculate new population
        let newPopulation = currentPop * (1 + dailyGrowthRate);

        const maxHousingCapacity = this.calculateMaxHousingCapacity();

        // 🏠 BOOTSTRAP FIX: Initial population moves in when housing becomes available
        if (currentPop === 0 && maxHousingCapacity > 0) {
            // First residents move in immediately when housing is built
            const initialPopulation = Math.min(maxHousingCapacity * 0.3, 20); // 30% occupancy or 20 people, whichever is smaller
            newPopulation = initialPopulation;
        // console.log(`🏠 BOOTSTRAP: Initial ${initialPopulation.toFixed(1)} residents move into new housing (capacity: ${maxHousingCapacity})`);
        }
        // Early game immigration (0-100 residents): housing-driven growth
        else if (currentPop > 0 && currentPop < 100 && maxHousingCapacity > currentPop) {
            // Gradual fill-up of available housing, basic attractiveness check
            if (attractiveness >= 0.8) { // Lower threshold for early game
                const availableHousing = maxHousingCapacity - currentPop;
                const dailyImmigration = Math.min(availableHousing * 0.15, 10); // 15% of available housing or 10 people max
                newPopulation = currentPop + dailyImmigration;
        // console.log(`🏠 EARLY GAME: ${dailyImmigration.toFixed(1)} residents move in (${currentPop.toFixed(1)} → ${newPopulation.toFixed(1)}, attractiveness: ${attractiveness.toFixed(3)})`);
            } else {
                // Housing debug: Early game immigration blocked - attractiveness too low (${attractiveness.toFixed(3)} < 0.8)`);
            }
        }
        // Established city immigration (100+ residents): economic conditions matter more
        else if (attractiveness > 1.05 && currentPop >= 100) {
        // console.log(`🏠 DEBUG Immigration Check: currentPop=${currentPop}, attractiveness=${attractiveness.toFixed(3)}, maxHousingCapacity=${maxHousingCapacity}`);
            if (maxHousingCapacity > currentPop) {
                // Add immigrants to existing population when conditions are good
                const immigrationRate = (attractiveness - 1.0) * 2; // Scale with attractiveness
                const availableHousing = maxHousingCapacity - currentPop;
                const cappedImmigration = availableHousing * 0.1; // Cap at 10% of available housing
                const dailyImmigration = Math.min(immigrationRate, cappedImmigration);
                newPopulation = currentPop + dailyImmigration;
        // console.log(`🏠 DEBUG Immigration Calc: immigrationRate=${immigrationRate.toFixed(3)}, availableHousing=${availableHousing.toFixed(1)}, cappedAt=${cappedImmigration.toFixed(3)}, result=${newPopulation.toFixed(3)}`);
        // console.log(`🏠 Immigration: ${dailyImmigration.toFixed(1)} new residents attracted by economic conditions (attractiveness: ${attractiveness.toFixed(3)})`);
            } else {
                // Housing debug: No immigration - housing at capacity (${currentPop}/${maxHousingCapacity})`);
            }
        } else {
            if (currentPop < 100) {
                // Housing debug: No immigration - waiting for better conditions (${currentPop}/100 residents, attractiveness: ${attractiveness.toFixed(3)})`);
            } else {
                // Housing debug: No immigration - attractiveness=${attractiveness.toFixed(3)} (needs >1.05)`);
            }
        }

        // Graduated emigration system with warnings and escalating losses
        // BUT only after reaching 100 residents - early game is protected from emigration
        if (currentPop >= 100) {
            if (attractiveness < 0.95) {
                this.gameState.emigrationTracking.poorConditionsDays++;
                const days = this.gameState.emigrationTracking.poorConditionsDays;
                // Housing debug: Poor conditions day ${days}/7 (attractiveness: ${attractiveness.toFixed(3)})`);

                // Graduated emigration: 3 days = warning, 5 days = small loss, 7 days = major exodus
                if (days >= 7) {
                    // Major exodus after 7 days
                    const emigrationRate = (0.95 - attractiveness) * 0.5; // Scale with how bad conditions are
                    const emigrationLoss = currentPop * emigrationRate * 0.15; // 15% base rate for major exodus
                    newPopulation = Math.max(0, currentPop - emigrationLoss);
        // console.log(`🏠 MAJOR EMIGRATION: ${emigrationLoss.toFixed(1)} residents leaving due to sustained poor conditions (${days} days < 0.95)`);
                } else if (days >= 5) {
                    // Small emigration after 5 days
                    const emigrationRate = (0.95 - attractiveness) * 0.3;
                    const emigrationLoss = currentPop * emigrationRate * 0.05; // 5% base rate for small loss
                    newPopulation = Math.max(0, currentPop - emigrationLoss);
        // console.log(`🏠 Small emigration: ${emigrationLoss.toFixed(1)} residents leaving due to poor conditions (${days} days < 0.95)`);
                } else if (days >= 3) {
                    // Warning at 3 days (no actual emigration yet)
        // console.log(`🏠 [WARN] EMIGRATION WARNING: Residents unhappy for ${days} days. Improve conditions soon to prevent departures!`);
                }
            } else {
                // Reset counter when conditions improve
                if (this.gameState.emigrationTracking.poorConditionsDays > 0) {
                    // Housing debug: Conditions improved (${attractiveness.toFixed(3)}), resetting emigration counter`);
                    this.gameState.emigrationTracking.poorConditionsDays = 0;
                }
            }
        } else if (currentPop > 0) {
            // Reset emigration tracking for early game cities (below 100 residents)
            if (this.gameState.emigrationTracking.poorConditionsDays > 0) {
                // Housing debug: Early game - resetting emigration tracking (${currentPop}/100 residents)`);
                this.gameState.emigrationTracking.poorConditionsDays = 0;
            }
        }
        this.gameState.emigrationTracking.lastAttractivenessCheck = attractiveness;

        // Apply maximum housing constraint
        newPopulation = Math.min(newPopulation, maxHousingCapacity);

        // Ensure minimum viable population
        newPopulation = Math.max(newPopulation, 0);

        // Store fractional population for proper accumulation
        if (!this.gameState.demographics.fractionalTotal) {
            this.gameState.demographics.fractionalTotal = 0;
        }
        this.gameState.demographics.fractionalTotal = newPopulation;
        // Round up so 0.2 residents = 1 resident, 1.49 = 2 residents, etc.
        this.gameState.demographics.total = Math.ceil(this.gameState.demographics.fractionalTotal);

        if (Math.abs(newPopulation - currentPop) > 0.1) {
        // console.log(`📈 Population change: ${currentPop} → ${newPopulation.toFixed(1)} (growth rate: ${(effectiveGrowthRate * 100).toFixed(2)}%)`);
        }
    }

    /**
     * Calculate maximum housing capacity across all buildings
     */
    calculateMaxHousingCapacity() {
        let totalCapacity = 0;

        // Housing debug: Calculating housing capacity from ${this.gameState.buildings.size} buildings`);
        for (const [locationKey, building] of this.gameState.buildings) {
            // Housing debug: Building ${building.id} at ${locationKey}, underConstruction: ${building.underConstruction}`);
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.resources) {
                // Housing debug: Building ${building.id} housing provided: ${buildingDef.resources.housingProvided}`);
                if (buildingDef.resources.housingProvided > 0) {
                    totalCapacity += buildingDef.resources.housingProvided;
                }
            } else {
                // Housing debug: No building definition or resources for ${building.id}`);
            }
        }

        // Housing debug: Total housing capacity: ${totalCapacity} units = ${totalCapacity * 2} people`);
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
        // console.log(`🏠 DEBUG DISTRIBUTE: totalResidents from demographics.total = ${totalResidents}`);
        if (totalResidents === 0) {
        // console.log(`🏠 DEBUG DISTRIBUTE: Early return - no residents to distribute`);
            return;
        }

        // Calculate building attractiveness scores
        const buildingScores = new Map();
        let totalScore = 0;

        // console.log(`🏠 DEBUG DISTRIBUTE: Checking ${this.gameState.buildings.size} buildings for housing`);
        for (const [locationKey, building] of this.gameState.buildings) {
        // console.log(`🏠 DEBUG DISTRIBUTE: Building ${building.id} at ${locationKey}, underConstruction: ${building.underConstruction}`);
            if (building.underConstruction) continue;

            const buildingDef = this.buildingDefinitions.get(building.id);
            if (buildingDef && buildingDef.resources && buildingDef.resources.housingProvided > 0) {
                const score = this.calculateBuildingAttractiveness(building, locationKey);
                buildingScores.set(locationKey, score);
                totalScore += score;
        // console.log(`🏠 DEBUG DISTRIBUTE: ${building.id} provides ${buildingDef.resources.housingProvided} housing, score: ${score}`);
            }
        }
        // console.log(`🏠 DEBUG DISTRIBUTE: Found ${buildingScores.size} housing buildings, totalScore: ${totalScore}`);

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
        // console.log(`🏠 DEBUG DISTRIBUTE: Set gameState.totalResidents = ${totalResidents} - ${residentsRemaining} = ${this.gameState.totalResidents}`);
    }

    /**
     * Calculate attractiveness score for a specific building location
     */
    calculateBuildingAttractiveness(building, locationKey) {
        const [row, col] = building.location;
        let score = 1.0; // Base attractiveness

        // Factor 1: Local CARENS (quality of life)
        const localCarens = this.calculateLocalCARENSMultiplier(row, col);
        // console.log(`🏠 DEBUG ATTRACT: ${building.id} localCarens = ${localCarens}`);
        score *= (isNaN(localCarens) ? 1.0 : localCarens);

        // Factor 2: Local needs satisfaction (energy access)
        const localNeeds = this.calculateLocalNeedsSatisfaction(row, col);
        // console.log(`🏠 DEBUG ATTRACT: ${building.id} localNeeds = ${localNeeds}`);
        score *= (isNaN(localNeeds) ? 1.0 : localNeeds);

        // Factor 3: Building condition
        const condition = building.condition || 1.0;
        // console.log(`🏠 DEBUG ATTRACT: ${building.id} condition = ${condition}`);
        score *= (isNaN(condition) ? 1.0 : condition);

        // Safety check for final score
        if (isNaN(score)) {
        // console.log(`🏠 DEBUG ATTRACT: WARNING - ${building.id} final score is NaN, defaulting to 1.0`);
            score = 1.0;
        }

        // console.log(`🏠 DEBUG ATTRACT: ${building.id} final score = ${score}`);
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

        // console.log(`[REVENUE] Player ${playerId} wealth: $${cash.toLocaleString()} cash + $${landValue.toLocaleString()} land + $${buildingValue.toLocaleString()} buildings = $${totalWealth.toLocaleString()}`);

        return totalWealth;
    }

    /**
     * Calculate building condition (0-1 scale based on age and decay rate)
     */
    calculateBuildingCondition(building) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            return 1.0; // Perfect condition if no definition
        }

        const age = building.age || 0;
        const dailyDecayRate = (buildingDef.economics.decayRate || 0) / 100;

        // Condition decreases over time based on decay rate
        const condition = Math.pow(1 - dailyDecayRate, age);

        // Minimum 10% condition (buildings never become completely worthless)
        return Math.max(0.1, condition);
    }

    /**
     * Calculate current value of a building based on condition
     */
    calculateBuildingValue(building) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            console.log(`[calculateBuildingValue] No definition or economics for building id: ${building.id}`);
            return 0;
        }

        // Handle buildings under construction - use full build cost
        if (building.underConstruction) {
            const buildCost = buildingDef.economics.buildCost || 0;
            console.log(`[calculateBuildingValue] Building ${building.id} under construction, value = buildCost = $${buildCost}`);
            return buildCost;
        }

        const originalCost = buildingDef.economics.buildCost || 0;
        const condition = this.calculateBuildingCondition(building);
        const value = originalCost * condition;

        console.log(`[calculateBuildingValue] Building ${building.id}: buildCost=$${originalCost}, condition=${condition.toFixed(2)}, value=$${value.toFixed(0)}`);

        // Value directly tied to condition
        return value;
    }

    /**
     * Calculate repair cost to restore building condition
     */
    calculateRepairCost(building, targetCondition = 1.0) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.economics) {
            return 0;
        }

        const originalCost = buildingDef.economics.buildCost || 0;
        const currentCondition = this.calculateBuildingCondition(building);

        // Clamp target condition to valid range
        targetCondition = Math.min(1.0, Math.max(currentCondition, targetCondition));

        // Repair cost = original cost * condition improvement needed
        const conditionImprovement = targetCondition - currentCondition;
        return originalCost * conditionImprovement;
    }

    /**
     * Repair a building (restore condition, charge player)
     */
    repairBuilding(playerId, row, col, targetCondition = 1.0) {
        const parcel = this.gameState.grid[row]?.[col];
        if (!parcel || !parcel.building) {
            return { success: false, error: 'No building found at location' };
        }

        if (parcel.owner !== playerId) {
            return { success: false, error: 'You do not own this building' };
        }

        const building = parcel.building;
        const repairCost = this.calculateRepairCost(building, targetCondition);
        const player = this.getOrCreatePlayer(playerId);

        // Check if player has enough cash
        if (player.cash < repairCost) {
            return {
                success: false,
                error: `Insufficient funds. Repair costs $${Math.round(repairCost)}, you have $${Math.round(player.cash)}`
            };
        }

        // Charge the player
        player.cash -= repairCost;

        // Reset building age to restore condition
        const currentCondition = this.calculateBuildingCondition(building);
        const buildingDef = this.buildingDefinitions.get(building.id);
        const dailyDecayRate = (buildingDef?.economics?.decayRate || 0) / 100;

        // Calculate new age needed for target condition
        if (dailyDecayRate > 0) {
            const newAge = Math.log(targetCondition) / Math.log(1 - dailyDecayRate);
            building.age = Math.max(0, newAge);
        } else {
            building.age = 0; // No decay, perfect condition
        }

        // Update player balances map
        this.gameState.playerBalances.set(playerId, player.cash);

        // Add transaction record
        player.transactions.push({
            type: 'BUILDING_REPAIR',
            amount: -repairCost,
            timestamp: Date.now(),
            description: `Repaired building at (${row}, ${col}) to ${Math.round(targetCondition * 100)}% condition`
        });

        // console.log(`[PERF] Player ${playerId} repaired building at (${row}, ${col}) for $${Math.round(repairCost)}`);

        return {
            success: true,
            repairCost: Math.round(repairCost),
            newCondition: targetCondition,
            remainingCash: Math.round(player.cash)
        };
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
    getOrCreatePlayer(playerId, playerName = null, playerColor = null) {
        // System debug: getOrCreatePlayer called for ${playerId}, exists: ${this.gameState.players.has(playerId)}`);
        if (!this.gameState.players.has(playerId)) {
            // Generate default name and color if not provided
            const defaultName = playerName || `Player ${playerId.slice(-4)}`;
            const defaultColor = playerColor || this.generatePlayerColor(playerId);

            this.gameState.players.set(playerId, {
                id: playerId,
                name: defaultName,
                color: defaultColor,
                cash: 6000, // Starting cash
                wealth: 6000, // Cash + land values
                transactions: [],
                buildings: [],
                lastCashflowUpdate: 0,

                // Action inventory (server-authoritative) - SIMPLIFIED: Single bucket, all actions rollover
                actions: {
                    total: this.calculateMonthlyActionAllowance() // All actions rollover monthly
                },
                governance: {
                    votingPoints: 2, // Players start with 2 points, earn 2 more each month
                    allocations: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVote: 0 // LVT vote value (-1000 to +1000 range)
                }
            });

            // Initialize in server-authoritative playerBalances Map
            this.gameState.playerBalances.set(playerId, 6000);

            // Initialize in server-authoritative playerActions Map
            const newPlayer = this.gameState.players.get(playerId);
            this.gameState.playerActions.set(playerId, newPlayer.actions.total);

            const initialPoints = this.gameState.gameStarted ? 2 : 4;
            newPlayer.governance.votingPoints = initialPoints;
            console.log(`[ACTIONS] Player ${playerId} created with ${newPlayer.actions.total} actions and ${initialPoints} governance points`);
        }
        return this.gameState.players.get(playerId);
    }

    /**
     * Generate consistent player color based on player ID
     */
    generatePlayerColor(playerId) {
        const colors = [
            '#10AC84', // Green
            '#EE5A24', // Orange
            '#5F27CD', // Purple
            '#FF9FF3', // Pink
            '#Feca57', // Yellow
            '#1DD1A1', // Teal
            '#FF6B6B', // Red
            '#4834D4'  // Blue
        ];

        // Create hash from player ID for consistent color assignment
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = ((hash << 5) - hash + playerId.charCodeAt(i)) & 0x7fffffff;
        }

        return colors[hash % colors.length];
    }

    /**
     * Update player name and color (for lobby integration)
     */
    updatePlayerMetadata(playerId, playerName = null, playerColor = null) {
        const player = this.gameState.players.get(playerId);
        if (player) {
            if (playerName) {
                player.name = playerName;
        // console.log(`👤 Updated player ${playerId} name to: ${playerName}`);
            }
            if (playerColor) {
                player.color = playerColor;
        // console.log(`[CARENS] Updated player ${playerId} color to: ${playerColor}`);
            }
        } else {
        // console.log(`[WARN] Attempted to update metadata for non-existent player: ${playerId}`);
        }
    }

    /**
     * Calculate cashflow for all players (called daily)
     */
    calculateAllPlayerCashflows() {
        // Use playerBalances Map for balance tracking
        for (const [playerId, balance] of this.gameState.playerBalances) {
            this.calculatePlayerCashflow(playerId);
        }
    }

    /**
     * Calculate cashflow for a specific player
     */
    calculatePlayerCashflow(playerId) {
        // Use playerBalances Map for balance tracking
        const currentBalance = this.getPlayerBalance(playerId);

        let totalRevenue = 0;
        let totalMaintenance = 0;
        let totalLVT = 0;
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

        // Calculate daily LVT expenses for owned parcels
        const lvtRate = this.getCurrentLVTRate();
        for (let row = 0; row < this.gameState.grid.length; row++) {
            for (let col = 0; col < this.gameState.grid[row].length; col++) {
                const parcel = this.gameState.grid[row][col];
                if (parcel.owner === playerId) {
                    const landValue = 100; // Standard parcel price
                    const dailyLVT = (landValue * lvtRate) / 365;
                    totalLVT += dailyLVT;
                }
            }
        }

        const netCashflow = totalRevenue - totalMaintenance - totalLVT;

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
        if (netCashflow !== 0 || buildingBreakdown.length > 0 || totalLVT > 0) {
        // console.log(`[REVENUE] Cashflow calculated for ${playerId}: $${netCashflow.toFixed(2)} (Revenue: $${totalRevenue.toFixed(2)}, Maintenance: $${totalMaintenance.toFixed(2)}, LVT: $${totalLVT.toFixed(2)})`);
        }

        return {
            playerId,
            totalRevenue,
            totalMaintenance,
            totalLVT,
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
            const dailyDecayRate = buildingDef?.economics?.decayRate || 0; // Already in % per day format
            const maintenanceCost = buildingDef?.economics?.maintenanceCost || 0;

            // Apply daily decay rate
            // decayRate is expressed as % per day (e.g., 0.12 = 0.12% per day)
            const decayIncrease = dailyDecayRate / 100; // Convert % to decimal (0.12% -> 0.0012)
            const newDecay = building.decay + decayIncrease;
            building.decay = Math.min(newDecay, 1.0); // Cap at 100% decay
            building.condition = Math.max(0.1, 1.0 - building.decay);

            // Apply maintenance costs to building owner
            if (maintenanceCost > 0 && building.ownerId) {
                const currentCost = maintenanceCosts.get(building.ownerId) || 0;
                maintenanceCosts.set(building.ownerId, currentCost + maintenanceCost);
            }

        // console.log(`🏠 Building ${building.id} at ${locationKey}: age=${building.age} days, decay=${(building.decay*100).toFixed(2)}%, condition=${(building.condition*100).toFixed(1)}%, maintenance=$${maintenanceCost}`);
        }

        // Deduct maintenance costs from player balances
        for (const [playerId, totalMaintenance] of maintenanceCosts) {
            // Safety check: skip if player doesn't exist in balance system
            if (!this.gameState.playerBalances.has(playerId)) {
                console.warn(`[WARN] Skipping maintenance for missing player: ${playerId}`);
                continue;
            }

            const currentBalance = this.getPlayerBalance(playerId);
            const newBalance = Math.max(0, currentBalance - totalMaintenance);
            this.gameState.playerBalances.set(playerId, newBalance);
        // console.log(`💸 Player ${playerId} paid $${totalMaintenance.toFixed(2)} in building maintenance (${currentBalance.toFixed(2)} → ${newBalance.toFixed(2)})`);
        }
    }

    /**
     * CLIENT COMMUNICATION
     */


    /**
     * Get marketplace data formatted for client broadcast
     */
    getMarketplaceDataForBroadcast() {
        const actionMarketplace = this.gameState.actionMarketplace;

        if (!actionMarketplace || !(actionMarketplace.listings instanceof Map)) {
        // console.log('🏪 DEBUG: No actionMarketplace or invalid listings, returning null');
            return null;
        }

        // Enhance each listing with server-calculated values
        const enhancedListings = Array.from(actionMarketplace.listings.values()).map(listing => {
            const enhanced = { ...listing };

            // Add calculated buy now price with time-based premium
            if (listing.buyNowPrice && listing.status === 'active') {
                enhanced.calculatedBuyNowPrice = this.calculateBuyNowPrice(listing);
            }

            // Add calculated cancellation/end early fee
            if (listing.status === 'active') {
                const monthProgress = this.calculateMonthProgress();
                let fee = 0;
                if (listing.currentBid > 0) {
                    const maxFeeRate = 5.0; // 500% of current bid
                    const currentFeeRate = maxFeeRate * (1 - monthProgress);
                    fee = Math.floor(listing.currentBid * currentFeeRate);
                }
                enhanced.calculatedEndEarlyFee = fee;
                enhanced.calculatedCancelFee = fee;
            }

            return enhanced;
        });

        const result = {
            ...actionMarketplace,
            listings: enhancedListings,
            monthProgress: this.calculateMonthProgress() // Include month progress for client use
        };


        return result;
    }

    /**
     * Robust server-authoritative state broadcaster
     * Sends complete, normalized game state to all clients
     */
    broadcastGameState(eventType = 'STATE_UPDATE', eventData = {}) {
        // Convert buildings Map to normalized array
        const buildings = [];
        this.gameState.buildings.forEach((building, locationKey) => {
            // Include performance data directly in building object
            const performance = this.calculateBuildingPerformanceSimple(building);

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
            const playerState = this.gameState.players.get(playerId);
            const governance = playerState?.governance || { votingPoints: 0, allocations: {} };
            // Governance debug: Broadcasting governance for ${playerId}:`);
        // console.log(`  votingPoints: ${governance.votingPoints}`);
        // console.log(`  allocations: ${JSON.stringify(governance.allocations || {})}`);
            // Governance debug: Full governance object type: ${typeof governance}`);
            // Governance debug: Governance keys:`, Object.keys(governance));
            players[playerId] = {
                id: playerId,
                cash: cash,
                wealth: wealth, // Cash + land value + building value (with decay)
                transactions: [],
                // V2: Include governance data for UI updates
                governance: governance,
                // Include player metadata for consistent UI display (governance dots, parcel colors, etc.)
                name: playerState?.name,
                color: playerState?.color,
                cityName: playerState?.cityName,
                // Include action data for client sync
                actions: {
                    total: this.gameState.playerActions.get(playerId) || 0
                }
            };

            // DEBUG: Log what we're broadcasting
            console.log(`[BROADCAST] Player ${playerId} actions: ${players[playerId].actions.total}, from Map: ${this.gameState.playerActions.get(playerId)}`);
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
                governance: {
                    treasury: this.governanceSystem ? this.governanceSystem.getTreasury() : 0,
                    taxRate: this.governanceSystem ? this.governanceSystem.governance.taxRate : 0.5,
                    monthlyBudget: this.gameState.monthlyBudget || null,
                    budgets: this.gameState.budgets || {}  // Use gameState.budgets instead of governanceSystem
                },
                monthlyActionAllowance: this.calculateMonthlyActionAllowance(),
                lvtRate: this.getCurrentLVTRate(),  // Include current LVT rate
                // Add action marketplace data
                actionMarketplace: this.getMarketplaceDataForBroadcast()
            }
        };

        // console.log(`[BROADCAST] Broadcasting complete game state: ${buildings.length} buildings, ${Object.keys(players).length} players, event: ${eventType}`);
        // Broadcasting complete game state to all clients

        // V2: Debug log eventData for GAME_STARTED to verify city names are included
        if (eventType === 'GAME_STARTED' && eventData.players) {
        // console.log(`🏙️ GAME_STARTED eventData players:`, eventData.players.map(p => `${p.id}: ${p.cityName}`));
        // console.log(`🏙️ GAME_STARTED full eventData structure:`, JSON.stringify(eventData, null, 2));
        }

        // Broadcast complete state to all clients
        if (this.broadcastFunction) {
            try {
                this.broadcastFunction(gameStateMessage);
            } catch (error) {
                console.error('[ERROR] Failed to broadcast game state:', error);
            }
        }
    }

    /**
     * Calculate building performance data for inclusion in game state
     */
    /**
     * Calculate building performance stats for broadcasting to client
     * Performance % = Core needs satisfaction × CARENS multiplier
     * Revenue = Base revenue × Performance × Condition × Global JEEFHH
     * Maintenance = Base × (1 + decayRate)^age (decay affects cost, not performance)
     */
    calculateBuildingPerformanceSimple(building) {
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

        const locationKey = `${building.location[0]},${building.location[1]}`;
        const [row, col] = building.location;

        // Get core needs satisfaction (local JEEFHH from adjacent 8 tiles)
        const localNeedsData = this.calculateLocalNeedsSatisfaction(row, col);
        const coreNeedsSatisfaction = localNeedsData.overallSatisfaction; // 0.0 to 1.0

        // Get CARENS multiplier (0.6x to 1.4x, only applies if population > 100)
        const totalResidents = this.gameState.totalResidents || 0;
        let carensMultiplier = 1.0;
        if (totalResidents > 100) {
            carensMultiplier = this.calculateLocalCARENSMultiplier(row, col);
        }

        // Performance = Core needs × CARENS (0-140%)
        const performance = coreNeedsSatisfaction * carensMultiplier;

        // Get global JEEFHH multiplier (city-wide economy state)
        const globalJEEFHHMultiplier = this.calculateGlobalJEEFHHMultiplier();

        // Revenue calculation
        const baseRevenue = buildingDef.economics?.maxRevenue || 0;
        // building.condition is already stored as 0.0-1.0 decimal, not 0-100 percentage
        const conditionFactor = building.condition || 1.0;
        const revenue = baseRevenue * performance * conditionFactor * globalJEEFHHMultiplier;

        // Maintenance increases with age due to decay
        const baseMaintenance = buildingDef.economics?.maintenanceCost || 0;
        const decayRate = (buildingDef.economics?.decayRate || 0.05) / 100; // Convert % to decimal
        const buildingAge = building.age || 0;
        const expenses = baseMaintenance * Math.pow(1 + decayRate, buildingAge);

        const netIncome = revenue - expenses;

        // TEMP DEBUG: Log revenue calculation for buildings with negative net income
        if (netIncome < 0 || buildingDef.id === 'taqueria') {
            console.log(`💰 [${buildingDef.id}] Revenue calc:`, {
                baseRevenue,
                performance: Math.round(performance * 100) + '%',
                conditionFactor: Math.round(conditionFactor * 100) + '%',
                globalJEEFHH: globalJEEFHHMultiplier,
                revenue,
                baseMaintenance,
                decayRate: (decayRate * 100).toFixed(3) + '%',
                buildingAge,
                expenses,
                netIncome
            });
        }

        // Calculate residents/workers based on performance
        const baseResidents = buildingDef.resources?.housingProvided ? (buildingDef.resources.housingProvided * 2) : 0;
        const baseWorkers = buildingDef.resources?.jobsProvided || 0;
        const residents = Math.floor(baseResidents * performance);
        const workers = Math.floor(baseWorkers * performance);

        return {
            residents,
            workers,
            efficiency: Math.round(performance * 100), // Performance % for tooltip display
            revenue: Math.round(revenue * 100) / 100,
            expenses: Math.round(expenses * 100) / 100,
            netIncome: Math.round(netIncome * 100) / 100
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
        // console.log('🎲 Board game reset: Resetting economic engine to Day 1...');

        // Reset game time to start fresh (Sept 2)
        this.gameState.gameTime = 1;
        // CRITICAL FIX: Adjust gameStartTime so updateGameTime() calculates correctly
        const GAME_DAY_MS = 3600000 / 365; // 1 hour real time = 1 year game time
        this.gameState.gameStartTime = Date.now() - (1 * GAME_DAY_MS);

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

        // Reset CARENS to defaults (0 points on -100 to +100 scale)
        this.gameState.carens = {
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0,
            multiplier: 1.0, // Neutral multiplier when no buildings exist
            points: { // Initialize points structure for client display
                culture: 0,
                affordability: 0,
                resilience: 0,
                environment: 0,
                noise: 0,
                safety: 0
            }
        };

        // Reset residents and demographics
        this.gameState.totalResidents = 0;
        this.gameState.residentsPerBuilding.clear();
        this.gameState.demographics = { children: 0, adults: 0, seniors: 0, total: 0 };
        this.gameState.demographicsPerBuilding.clear();

        // Reset governance budgets and treasury
        this.gameState.budgets = {
            education: 0,
            healthcare: 0,
            infrastructure: 0,
            housing: 0,
            culture: 0,
            recreation: 0,
            commercial: 0,
            civic: 0,
            emergency: 0,
            ubi: 0
        };
        this.gameState.treasury = 0;

        // Clear transaction history
        this.pendingTransactions = [];
        this.transactionHistory = [];

        // Reset grid ownership to 'City' (clear all player ownership)
        this.initializeGrid(12);

        // Initialize LVT rate to default 50%
        this.currentLVTRate = 0.5;

        // console.log('[INFO] Economic engine reset complete - fresh board game state');
    }

    /**
     * Initialize players from room data (called after resetGameState)
     */
    initializePlayersFromRoom(roomPlayers) {
        // console.log('🎲 Initializing economic engine players from room data...');

        for (const [playerId, roomPlayerData] of roomPlayers) {
            const initialPoints = this.gameState.gameStarted ? 2 : 4;

            // Create player in economic engine with room's governance data
            const playerState = {
                id: playerId,
                name: roomPlayerData.name,
                color: roomPlayerData.color,
                cityName: roomPlayerData.cityName, // V2: Include city name for client sync
                cash: roomPlayerData.balance || 6000,
                wealth: roomPlayerData.balance || 6000,
                totalLVTPaid: 0,  // Track total LVT contributions
                totalPublicFundingReceived: 0,  // Track total public funding used
                totalWealthGenerated: roomPlayerData.balance || 6000,  // Track all wealth ever generated
                transactions: [],
                buildings: [],
                lastCashflowUpdate: 0,
                // Action inventory (server-authoritative) - SIMPLIFIED: Single bucket, all actions rollover
                actions: {
                    total: this.calculateMonthlyActionAllowance() // All actions rollover monthly
                },
                governance: {
                    votingPoints: initialPoints, // Set correct initial points
                    allocations: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVote: 0
                }
            };

            this.gameState.players.set(playerId, playerState);

            // Set player balance and actions
            this.gameState.playerBalances.set(playerId, roomPlayerData.balance || 6000);
            this.gameState.playerActions.set(playerId, playerState.actions.total);

            console.log(`[ACTIONS] Player ${playerId} initialized with ${playerState.actions.total} actions, $${roomPlayerData.balance || 6000}, and ${initialPoints} governance points`);
        }
    }

    /**
     * Remove player from economic engine (when they disconnect/leave)
     */
    removePlayer(playerId) {
        // console.log(`🗑️ Economic Engine: Removing player ${playerId}`);

        // Remove from player balances
        this.gameState.playerBalances.delete(playerId);

        // Remove from players Map
        this.gameState.players.delete(playerId);

        // console.log(`[INFO] Player ${playerId} removed from economic engine`);
    }

    /**
     * Process parcel purchase transaction
     */
    async processParcelPurchase(transaction) {
        const { playerId, amount, location, description } = transaction;

        console.log(`[REVENUE] Processing parcel purchase: ${playerId} spending $${amount} for ${description || 'parcel'}`);

        // Use playerBalances Map for balance tracking
        const currentBalance = this.getPlayerBalance(playerId);

        // ✅ ENFORCE ACTION COST (critical bug fix)
        const actionCost = this.ACTION_COSTS.purchaseParcel || 1;
        const player = this.getOrCreatePlayer(playerId);
        if (!player.actions || player.actions.total < actionCost) {
            throw new Error(`Insufficient actions: need ${actionCost}, have ${player.actions?.total || 0}`);
        }

        // Check if player has enough cash
        if (currentBalance < amount) {
            console.log(`[ERROR] Insufficient funds: ${currentBalance} < ${amount}`);
            throw new Error('Insufficient funds');
        }

        // Deduct cash from playerBalances
        const newBalance = currentBalance - amount;
        this.gameState.playerBalances.set(playerId, newBalance);

        // ✅ SPEND ACTION (critical bug fix)
        this.spendActions(playerId, actionCost, 'parcel purchase');

        // UPDATE SERVER-AUTHORITATIVE GRID OWNERSHIP
        const [row, col] = location;
        if (this.gameState.grid && this.gameState.grid[row] && this.gameState.grid[row][col]) {
            this.gameState.grid[row][col].owner = playerId;
            console.log(`🏞️ Server grid ownership updated: [${row},${col}] → ${playerId}`);

            // Update neighboring parcel prices (dynamic pricing system)
            this.updateNeighborPrices(row, col, this.gameState.gridSize);
        } else {
            console.warn(`[WARN] Grid update failed: invalid location [${row},${col}]`);
        }

        console.log(`[INFO] Parcel purchase successful: ${playerId} balance ${currentBalance} → ${newBalance}, actions ${player.actions.total + actionCost} → ${player.actions.total}`);

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

        // console.log(`[REVENUE] Processing cash spend: ${playerId} spending $${amount} for ${description || 'purchase'}`);

        // Use playerBalances Map for balance tracking
        const currentBalance = this.getPlayerBalance(playerId);

        // Check if player has enough cash
        if (currentBalance < amount) {
        // console.log(`[ERROR] Insufficient funds: ${currentBalance} < ${amount}`);
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

        // console.log(`[INFO] Cash spend successful: ${playerId} balance ${currentBalance} → ${newBalance}`);

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
     * Calculate monthly budget allocations based on player votes
     */
    calculateMonthlyBudgets() {
        // Sum up all allocations across all players
        const totalAllocations = {};
        const categories = [
            'education', 'healthcare', 'infrastructure', 'housing',
            'culture', 'recreation', 'commercial', 'civic',
            'emergency', 'ubi'
        ];

        // Initialize
        categories.forEach(cat => {
            totalAllocations[cat] = 0;
        });

        let totalPoints = 0;

        // Sum allocations from all players
        this.gameState.players.forEach((playerState, playerId) => {
            if (playerState.governance?.allocations) {
                Object.entries(playerState.governance.allocations).forEach(([cat, points]) => {
                    totalAllocations[cat] += points;
                    totalPoints += points;
                });
            }
        });

        // Calculate proportions if there are any allocations
        const budgetProportions = {};
        if (totalPoints > 0) {
            categories.forEach(cat => {
                budgetProportions[cat] = totalAllocations[cat] / totalPoints;
            });
        } else {
            // No allocations = funds stay in treasury
            categories.forEach(cat => {
                budgetProportions[cat] = 0;
            });
        }

        // Store for later use (when implementing budget effects)
        this.gameState.monthlyBudget = {
            proportions: budgetProportions,
            totalAllocations,
            totalPoints,
            timestamp: this.gameState.gameTime
        };

        // console.log(`[REVENUE] Monthly budget calculated - totalPoints: ${totalPoints}`);
        // console.log(`[REVENUE] Total allocations by category:`, totalAllocations);
        // console.log(`[REVENUE] Proportions calculated:`, budgetProportions);
        // console.log(`   Total voting points allocated: ${totalPoints}`);

        if (totalPoints === 0) {
        // console.log(`   📦 No allocations - tax revenue remains in treasury`);
        }

    }

    /**
     * Transfer treasury funds to budget categories based on stored proportions
     * Called ONLY during monthly events, not when votes change
     */
    transferMonthlyFunds() {
        if (!this.gameState.monthlyBudget || !this.gameState.monthlyBudget.proportions) {
            console.warn('[WARN] No budget proportions available for monthly transfer');
            return;
        }

        const totalPoints = this.gameState.monthlyBudget.totalPoints;

        if (totalPoints === 0) {
        // console.log(`📦 MONTHLY TRANSFER: No allocations - treasury funds remain unallocated`);
            return;
        }

        // Get treasury balance from gameState
        const treasuryBalance = this.gameState.treasury || 0;

        if (treasuryBalance > 0) {
            console.log(`[REVENUE] MONTHLY TRANSFER: Allocating $${treasuryBalance.toFixed(2)} from treasury to budgets`);
            this.allocateBudgets(treasuryBalance);
            // Clear treasury after allocation
            this.gameState.treasury = 0;
        }
    }

    /**
     * Handle Governance Vote V3 - Simple allocation system with validation and broadcasting
     */
    handleGovernanceVote(playerId, voteType, data) {
        const player = this.getOrCreatePlayer(playerId);
        if (!player) {
            return { success: false, error: 'Player not found' };
        }

        // Initialize governance if needed
        if (!player.governance) {
            player.governance = {
                votingPoints: 2,
                allocations: {},
                lvtVote: 0
            };
        }

        let result = { success: false };

        switch (voteType) {
            case 'allocation':
                // Set allocation for a category with point validation
                const { category, value } = data;
                if (!category) return { success: false, error: 'No category specified' };

                // Validate points allocation
                const newAllocations = { ...player.governance.allocations };
                newAllocations[category] = Math.max(0, value);

                const totalAllocated = Object.values(newAllocations).reduce((sum, points) => sum + points, 0)
                    + Math.abs(player.governance.lvtVote);

                if (totalAllocated > player.governance.votingPoints) {
                    return { success: false, error: 'Not enough voting points available' };
                }

                player.governance.allocations[category] = Math.max(0, value);
        // console.log(`🏛️ Player ${playerId} set ${category} allocation to ${value}`);
                result = { success: true };
                break;

            case 'lvt':
                // Set LVT vote with point validation
                const newLvtVote = data.value || 0;
                const currentAllocated = Object.values(player.governance.allocations).reduce((sum, points) => sum + points, 0);

                if (currentAllocated + Math.abs(newLvtVote) > player.governance.votingPoints) {
                    return { success: false, error: 'Not enough voting points available' };
                }

                player.governance.lvtVote = newLvtVote;
        // console.log(`🏛️ Player ${playerId} set LVT vote to ${newLvtVote}`);
                result = { success: true };
                break;

            case 'reset':
                // Reset all allocations
                player.governance.allocations = {};
                player.governance.lvtVote = 0;
        // console.log(`🏛️ Player ${playerId} reset all allocations`);
                result = { success: true };
                break;

            default:
                return { success: false, error: 'Unknown vote type' };
        }

        // If successful, recalculate budget and LVT rate, then broadcast
        if (result.success) {
            this.calculateMonthlyBudgets();
            this.calculateLVTRate();

            // Broadcast governance update to all players
            this.broadcastGovernanceUpdate();
        }

        return result;
    }

    /**
     * Broadcast governance update to all players
     */
    broadcastGovernanceUpdate() {
        // CRITICAL FIX: Recalculate LVT rate after any governance change
        this.calculateLVTRate();

        this.broadcastGameState('GOVERNANCE_UPDATE', {
            source: 'governance_vote',
            timestamp: Date.now()
        });
    }


    /**
     * Calculate LVT rate based on all player votes (V3 system)
     */
    calculateLVTRate() {
        let totalLVTVotes = 0;

        // Sum all player LVT votes (handle both old and new vote systems)
        this.gameState.players.forEach((playerState) => {
            if (playerState.governance) {
                if (playerState.governance.lvtVote !== undefined) {
                    totalLVTVotes += playerState.governance.lvtVote;
                }
                // Backward compatibility for old governance format
                else if (playerState.governance.lvtVotesIncrease !== undefined || playerState.governance.lvtVotesDecrease !== undefined) {
                    const increaseVotes = playerState.governance.lvtVotesIncrease || 0;
                    const decreaseVotes = playerState.governance.lvtVotesDecrease || 0;
                    totalLVTVotes += (increaseVotes - decreaseVotes);
                }
            }
        });

        // Calculate new rate from base 50%
        const newRate = Math.max(0, Math.min(1, 0.5 + (totalLVTVotes * 0.01))); // 1% per vote point

        // Store the rate room-wide in BOTH systems to keep them synchronized
        this.currentLVTRate = newRate;

        // CRITICAL FIX: Also update governance system tax rate to keep systems in sync
        if (this.governanceSystem && this.governanceSystem.governance) {
            this.governanceSystem.governance.taxRate = newRate;
        }

        // console.log(`[CARENS] LVT rate calculated: ${(newRate * 100).toFixed(1)}% (${totalLVTVotes} net vote points)`);
        // console.log(`[CARENS] LVT rate synchronized: currentLVTRate=${this.currentLVTRate}, governanceSystem.taxRate=${this.governanceSystem?.governance?.taxRate}`);

        return newRate;
    }

    /**
     * Get current LVT rate
     */
    getCurrentLVTRate() {
        const rate = this.currentLVTRate || 0.5; // Default to 50%
        // Governance debug: getCurrentLVTRate() returning ${rate} (currentLVTRate=${this.currentLVTRate})`);
        return rate;
    }

    /**
     * Map building categories to budget categories for subsidy funding
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

        const budgetCategory = mapping[buildingCategory] || 'housing'; // Default fallback
        // console.log(`[INFO] Building category '${buildingCategory}' → Budget category '${budgetCategory}'`);
        return budgetCategory;
    }

    /**
     * Calculate UBI per citizen for revenue boost calculations
     */
    calculateUBIPerCitizen() {
        const ubiBudget = this.gameState.budgets?.['ubi'] || 0;
        const totalPopulation = Math.max(1, this.gameState.totalResidents || 1); // Prevent division by zero

        const ubiPerCitizen = ubiBudget / totalPopulation;

        if (ubiPerCitizen > 0) {
        // console.log(`[REVENUE] UBI calculation: $${ubiBudget} budget ÷ ${totalPopulation} residents = $${ubiPerCitizen.toFixed(2)} per citizen`);
        }

        return ubiPerCitizen;
    }

    /**
     * Calculate UBI revenue multiplier for building income
     * Higher UBI per citizen = higher multiplier (citizens have more spending power)
     */
    calculateUBIRevenueMultiplier() {
        const ubiPerCitizen = this.calculateUBIPerCitizen();

        if (ubiPerCitizen <= 0) {
            return 1.0; // No UBI = no boost
        }

        // Formula: (UBI per citizen / 100) + 1.0
        // Every $1/citizen/month = +1% revenue boost
        // $50/citizen = 1.5x, $100/citizen = 2.0x, etc.
        const ubiMultiplier = (ubiPerCitizen / 100) + 1.0;

        if (ubiMultiplier > 1.0) {
            const boostPercent = ((ubiMultiplier - 1.0) * 100).toFixed(0);
        // console.log(`💸 UBI revenue boost: $${ubiPerCitizen.toFixed(2)}/citizen → +${boostPercent}% revenue (${ubiMultiplier.toFixed(2)}x multiplier)`);
        }

        return ubiMultiplier;
    }

    /**
     * Transition game from pre-game to in-game state
     * This should be called when the first building is placed or game officially starts
     */
    startGame() {
        if (this.gameState.gameStarted) {
        // console.log('🎮 Game already started, ignoring startGame call');
            return;
        }

        // console.log('🎮 Starting game: transitioning from pre-game to in-game state');
        this.gameState.gameStarted = true;

        // Update all players' governance points from 4 (pre-game) to 2 (in-game)
        this.gameState.players.forEach((player, playerId) => {
            if (player.governance && player.governance.votingPoints === 4) {
                player.governance.votingPoints = 2;
        // console.log(`🏛️ Player ${playerId} voting points reduced from 4 to 2 for in-game state`);
            }
        });

        // console.log('🎮 Game started successfully - all players now in in-game governance mode');
    }

    /**
     * Handle treasury effects from transactions (parcel costs, LVT fees)
     */
    async processTreasuryEffects(transaction, result) {
        if (!this.governanceSystem) {
            console.warn('[WARN] No governance system connected - skipping treasury effects');
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
            // Add to treasury
            this.gameState.treasury += treasuryAmount;

            // Also add to external governance system if it exists (for backwards compatibility)
            if (this.governanceSystem) {
                this.governanceSystem.addFunds(treasuryAmount, description);
            }
        // console.log(`[REVENUE] Treasury: +$${treasuryAmount.toLocaleString()} from ${description}`);
        }
    }

    /**
     * Calculate Commonwealth Scores for all players
     * Score = (Wealth × (1 + LVT_Contribution_Ratio)) / 10000
     */
    calculateCommonwealthScores() {
        const scores = new Map();
        const CIVIC_SCORE_CAP = 187.9; // Year Progress and Poverty was published (1879)

        // Calculate totals for relative scoring
        let totalWealth = 0;
        let totalLVTRaised = 0;

        for (const [playerId, playerState] of this.gameState.players) {
            const playerWealth = this.calculatePlayerWealth(playerId, this.getPlayerBalance(playerId));
            totalWealth += playerWealth;
            totalLVTRaised += (playerState.totalLVTPaid || 0);
        }

        // Prevent division by zero
        totalWealth = Math.max(totalWealth, 1);
        totalLVTRaised = Math.max(totalLVTRaised, 1);

        // Calculate individual scores
        for (const [playerId, playerState] of this.gameState.players) {
            const playerWealth = this.calculatePlayerWealth(playerId, this.getPlayerBalance(playerId));
            const lvtPaid = playerState.totalLVTPaid || 0;
            const publicFundingReceived = playerState.totalPublicFundingReceived || 0;

            // Wealth Score: (player wealth / total wealth) × 100
            const wealthScore = (playerWealth / totalWealth) * 100;

            // Civic Score: (LVT paid / public funding received) × 10, capped at 187.9
            let civicScore;
            if (lvtPaid === 0) {
                civicScore = 0; // No contribution = 0 civic score
            } else if (publicFundingReceived === 0) {
                civicScore = CIVIC_SCORE_CAP; // Perfect citizen - paid taxes, used no public funds
            } else {
                civicScore = Math.min((lvtPaid / publicFundingReceived) * 10, CIVIC_SCORE_CAP);
            }

            // Commonwealth Score = Wealth Score + Civic Score
            const commonwealthScore = wealthScore + civicScore;

            scores.set(playerId, {
                score: parseFloat(commonwealthScore.toFixed(1)),
                wealthScore: parseFloat(wealthScore.toFixed(1)),
                civicScore: parseFloat(civicScore.toFixed(1)),
                wealth: playerWealth,
                lvtPaid: lvtPaid,
                publicFundingReceived: publicFundingReceived,
                lvtRatio: publicFundingReceived > 0 ? lvtPaid / publicFundingReceived : (lvtPaid > 0 ? 1 : 0)
            });
        }

        // Sort scores to get rankings
        const sortedScores = Array.from(scores.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .map(([playerId, data], index) => ({
                playerId,
                rank: index + 1,
                ...data
            }));

        return sortedScores;
    }

    /**
     * Broadcast Commonwealth Scores to all players
     */
    broadcastCommonwealthScores() {
        if (!this.broadcastFunction) return;

        const scores = this.calculateCommonwealthScores();

        // Initialize cache if not exists
        if (!this.lastBroadcastScores) {
            this.lastBroadcastScores = new Map();
        }

        // Format scores for broadcast, using cached values when current is 0
        const formattedScores = scores.map(s => {
            const cached = this.lastBroadcastScores.get(s.playerId);

            // Use cached values if current wealth/civic scores are 0 but cached values exist
            const wealthScore = (s.wealthScore === 0 && cached?.wealthScore > 0) ? cached.wealthScore : s.wealthScore;
            const civicScore = (s.civicScore === 0 && cached?.civicScore > 0) ? cached.civicScore : s.civicScore;
            const score = wealthScore + civicScore;

            const formatted = {
                playerId: s.playerId,
                playerName: this.gameState.players.get(s.playerId)?.name || 'Player',
                playerColor: this.gameState.players.get(s.playerId)?.color,
                wealth: s.wealth,
                lvtRatio: s.lvtRatio,
                score: parseFloat(score.toFixed(1)),
                wealthScore: parseFloat(wealthScore.toFixed(1)),
                civicScore: parseFloat(civicScore.toFixed(1)),
                rank: s.rank
            };

            // Cache the formatted scores for next time
            this.lastBroadcastScores.set(s.playerId, formatted);

            return formatted;
        });

        // Broadcast to all players
        this.broadcastFunction({
            type: 'COMMONWEALTH_UPDATE',
            scores: formattedScores,
            timestamp: Date.now()
        });
    }

    /**
     * Process daily LVT collection for all player-owned parcels
     * Called automatically every game day (~9.86 seconds)
     */
    async processDailyLVT() {
        if (!this.governanceSystem) {
            console.warn('[WARN] No governance system connected - skipping daily LVT');
            return;
        }

        const lvtRate = this.governanceSystem.governance.taxRate || 0.50; // Use governance rate (0-100%)
        let totalLVT = 0;
        let parcelCount = 0;

        // console.log(`🏛️ Daily LVT Assessment (Rate: ${Math.round(lvtRate * 100)}%)`);

        // LVT is assessed on PARCELS (land value), not buildings
        // Iterate through the grid to find all player-owned parcels
        // Grid verification passed

        for (let row = 0; row < this.gameState.gridSize; row++) {
            for (let col = 0; col < this.gameState.gridSize; col++) {
                const parcel = this.gameState.grid[row][col];


                // Only tax player-owned parcels (not City-owned)
                if (parcel && parcel.owner && parcel.owner !== 'City') {
                    parcelCount++;

                    // Use actual parcel price (or default if not set)
                    const landValue = parcel.price || parcel.basePrice || 100;
                    const dailyLVT = (landValue * lvtRate) / 365; // Daily portion of annual LVT


                    if (dailyLVT > 0) {
                        const playerId = parcel.owner;
                        // Skip LVT if player not found in balance system
                        if (!this.gameState.playerBalances.has(playerId)) {
                            // console.warn(`[WARN] Player ${playerId} not found in balance system - skipping LVT`);
                            continue;
                        }
                        const currentBalance = this.getPlayerBalance(playerId);

                        if (currentBalance >= dailyLVT) {
                            // Deduct LVT from player balance
                            this.gameState.playerBalances.set(playerId, currentBalance - dailyLVT);

                            // Add to treasury (will be allocated to budgets monthly)
                            this.gameState.treasury += dailyLVT;

                            // Also add to external governance system if it exists (for backwards compatibility)
                            if (this.governanceSystem) {
                                this.governanceSystem.addFunds(dailyLVT, `Daily LVT from parcel [${row},${col}]`);
                            }

                            totalLVT += dailyLVT;

                            // Track player's LVT contributions
                            const playerState = this.gameState.players.get(playerId);
                            if (playerState) {
                                playerState.totalLVTPaid = (playerState.totalLVTPaid || 0) + dailyLVT;
                            }

        // console.log(`💸 LVT: Player ${playerId} paid $${dailyLVT.toFixed(2)} for parcel [${row},${col}]`);
                        } else {
                            console.warn(`[WARN] ${playerId} cannot pay LVT of $${dailyLVT.toFixed(2)} for parcel [${row},${col}] (balance: $${currentBalance.toFixed(2)})`);
                        }
                    }
                }
            }
        }

        // System debug: Assessed LVT on ${parcelCount} player-owned parcels`);

        if (totalLVT > 0) {
        // console.log(`[REVENUE] Daily LVT collected: $${totalLVT.toFixed(2)} from ${parcelCount} parcels`);
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

                // CARENS updates handled by calculateGlobalCARENS()
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
     * ACTION MANAGEMENT METHODS
     */

    /**
     * Calculate monthly action allowance (18 actions in Sept, declining by 1 each month to min 7)
     * Solo Mode gets unlimited (9999) actions
     */
    calculateMonthlyActionAllowance() {
        // Check if this is Solo Mode (room with maxPlayers === 1)
        if (this.isSoloMode()) {
            return 9999; // Unlimited actions for Solo Mode
        }

        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const currentMonth = this.getCurrentGameMonth();
        const currentMonthIndex = monthOrder.indexOf(currentMonth);
        const baseActions = 18;
        const reduction = currentMonthIndex * 1;
        const minimumActions = 7;

        const allowance = Math.max(minimumActions, baseActions - reduction);
        console.log(`[ACTIONS] calculateMonthlyActionAllowance: gameTime=${this.gameState.gameTime}, month=${currentMonth}, index=${currentMonthIndex}, allowance=${allowance}`);

        return allowance;
    }

    /**
     * Check if this is Solo Mode
     */
    isSoloMode() {
        return this.room && this.room.maxPlayers === 1;
    }

    /**
     * Get month boundaries array (shared between functions)
     */
    getMonthBoundaries() {
        // Real month lengths starting from Sept 2nd (gameTime = 1.0)
        // Sept: days 1-30 (29 days remaining), Oct: days 31-61 (31 days), etc.
        return [
            30,   // Sept (29 days remaining from Sept 2)
            61,   // Oct (31 days)
            91,   // Nov (30 days)
            122,  // Dec (31 days)
            153,  // Jan (31 days)
            181,  // Feb (28 days, ignoring leap years for simplicity)
            212,  // Mar (31 days)
            242,  // Apr (30 days)
            273,  // May (31 days)
            303,  // Jun (30 days)
            334,  // Jul (31 days)
            365   // Aug (31 days) - ends at Sept 1
        ];
    }

    /**
     * Get current game month from game time using real calendar boundaries
     */
    getCurrentGameMonth() {
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const monthBoundaries = this.getMonthBoundaries();
        const currentDay = Math.floor(this.gameState.gameTime);

        for (let i = 0; i < monthBoundaries.length; i++) {
            if (currentDay <= monthBoundaries[i]) {
                return monthOrder[i];
            }
        }

        // Should not reach here unless game goes beyond 1 year
        return monthOrder[0]; // Default to Sept
    }

    /**
     * Get the day when the next month starts
     */
    getNextMonthStartDay() {
        const monthBoundaries = this.getMonthBoundaries();
        const currentDay = Math.floor(this.gameState.gameTime);

        for (let i = 0; i < monthBoundaries.length; i++) {
            if (currentDay <= monthBoundaries[i]) {
                return monthBoundaries[i] + 1; // Next month starts the day after boundary
            }
        }

        return 366; // Beyond the game year
    }


    /**
     * Check if the current day is the first day of a new month
     */
    isFirstDayOfMonth(currentDay) {
        if (currentDay <= 1) return false; // Can't be first day if we're at game start

        const monthBoundaries = this.getMonthBoundaries();

        // Check if current day equals any month boundary + 1 (first day of next month)
        for (let i = 0; i < monthBoundaries.length; i++) {
            if (currentDay === monthBoundaries[i] + 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Refresh monthly actions for all players (called at month transition)
     * SIMPLIFIED: Add new monthly allowance to existing total (all actions rollover)
     */
    refreshMonthlyActions() {
        const newAllowance = this.calculateMonthlyActionAllowance();

        for (const [playerId, player] of this.gameState.players) {
            // Add new monthly allowance to existing total (all actions rollover)
            player.actions.total += newAllowance;

            // Update playerActions map for sync
            this.gameState.playerActions.set(playerId, player.actions.total);

            console.log(`🎯 Player ${playerId} actions refreshed: ${player.actions.total} total (+${newAllowance} monthly grant)`);
        }
    }

    /**
     * Spend actions for a player
     * SIMPLIFIED: Single bucket - just deduct from total
     */
    spendActions(playerId, count, reason = 'action') {
        const player = this.getOrCreatePlayer(playerId);

        // Ensure actions object exists (safety check for existing players)
        if (!player.actions) {
            player.actions = {
                total: this.calculateMonthlyActionAllowance()
            };
            console.log(`[PERF] Initialized missing actions object for player ${playerId}`);
        }

        if (player.actions.total < count) {
            throw new Error(`Insufficient actions: need ${count}, have ${player.actions.total}`);
        }

        // Deduct from total (simple single bucket)
        player.actions.total -= count;

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
     * Add actions to a player (from marketplace purchase or other sources)
     * SIMPLIFIED: Single bucket - just add to total
     */
    addPurchasedActions(playerId, count, reason = 'marketplace') {
        const player = this.getOrCreatePlayer(playerId);

        // Add to total (simple single bucket)
        player.actions.total += count;

        // Update playerActions map for sync
        this.gameState.playerActions.set(playerId, player.actions.total);

        // Add transaction record
        player.transactions.push({
            type: 'ACTION_PURCHASE',
            amount: count,
            timestamp: Date.now(),
            description: `Acquired ${count} action${count !== 1 ? 's' : ''} from ${reason}`
        });

        console.log(`🎯 Player ${playerId} acquired ${count} actions from ${reason}. Total: ${player.actions.total}`);
        return true;
    }

    /**
     * ACTION MARKETPLACE TRANSACTION PROCESSORS
     */

    /**
     * Process creating an action listing
     */
    async processCreateActionListing(transaction) {
        // console.log('🏪 Server: Processing ACTION_CREATE_LISTING:', transaction);
        const { playerId, quantity, reservePrice, buyNowPrice } = transaction;

        const player = this.getOrCreatePlayer(playerId);

        // Ensure actions object exists (for players created before actions system)
        if (!player.actions) {
            player.actions = {
                total: this.calculateMonthlyActionAllowance()
            };
            this.gameState.playerActions.set(playerId, player.actions.total);
            console.log(`[PERF] Initialized missing actions for player ${playerId}`);
        }

        // Validate player has enough actions
        if (player.actions.total < quantity) {
            throw new Error(`Insufficient actions to list: need ${quantity}, have ${player.actions.total}`);
        }

        // Calculate auction expiration (end of current month)
        const nextMonthStart = this.getNextMonthStartDay();
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

        // console.log(`🏪 Action listing created: ${quantity} actions by ${playerId} for $${reservePrice.toLocaleString()}+ (listing ${listing.id})`);

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

        // console.log(`🏪 Bid placed: $${bidAmount.toLocaleString()} by ${playerId} on listing ${listingId}`);

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

        // console.log(`🏪 Buy now completed: ${listing.quantity} actions sold for $${buyNowPrice.toLocaleString()}`);

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
        const monthProgress = this.calculateMonthProgress();

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
            this.gameState.treasury += fee;

            // Also add to external governance system if it exists (for backwards compatibility)
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

        // console.log(`🏪 Listing cancelled: ${listingId} with fee $${fee.toLocaleString()}`);

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
        this.gameState.treasury += fee;

        // Also add to external governance system if it exists (for backwards compatibility)
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

        // console.log(`🏪 Auction ended early: ${listing.quantity} actions sold for $${listing.currentBid.toLocaleString()}, fee: $${fee.toLocaleString()}`);

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
        const currentDay = Math.floor(this.gameState.gameTime);
        const monthBoundaries = this.getMonthBoundaries();

        // Find current month boundary
        let monthStart = 1; // Game starts at day 1
        let monthEnd = monthBoundaries[0];

        for (let i = 0; i < monthBoundaries.length; i++) {
            if (currentDay <= monthBoundaries[i]) {
                monthEnd = monthBoundaries[i];
                monthStart = i === 0 ? 1 : monthBoundaries[i - 1] + 1;
                break;
            }
        }

        const monthLength = monthEnd - monthStart + 1;
        const dayInMonth = currentDay - monthStart + 1;
        return dayInMonth / monthLength;
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

        // console.log(`🏪 Auction completed: ${listing.quantity} actions sold for $${listing.currentBid.toLocaleString()}`);
                } else {
                    // No bids - return actions to seller (monthly actions will expire anyway)
                    this.addPurchasedActions(listing.sellerId, listing.quantity, 'expired auction');

                    listing.status = 'expired';
                    listing.expiredAt = Date.now();

        // console.log(`🏪 Auction expired: ${listing.quantity} actions returned to ${listing.sellerId}`);
                }
                processed++;
            }
        }

        if (processed > 0) {
            this.updateAveragePrice();
        // console.log(`🏪 Processed ${processed} expired action auctions`);
        }

        return processed;
    }

    // =====================================================================
    // LAND EXCHANGE SYSTEM - Strategic Offer-Based Trading
    // =====================================================================

    /**
     * LAND EXCHANGE SYSTEM - Offer-based parcel trading
     * Replaces hostile auction system with strategic negotiation
     */

    /**
     * Make an offer on a competitor's parcel
     */
    async processMakeOffer(transaction) {
        const { playerId, row, col, offerAmount } = transaction;

        // Validate player doesn't exceed max offers
        const playerOffers = Array.from(this.gameState.landExchange.activeOffers.values())
            .filter(offer => offer.offererId === playerId && offer.status === 'pending');

        if (playerOffers.length >= this.gameState.landExchange.maxOffersPerPlayer) {
            throw new Error(`Maximum ${this.gameState.landExchange.maxOffersPerPlayer} active offers allowed per player`);
        }

        // Validate parcel exists and is owned by someone else
        if (!this.gameState.grid[row] || !this.gameState.grid[row][col]) {
            throw new Error('Invalid parcel location');
        }

        const parcel = this.gameState.grid[row][col];

        if (!parcel.owner) {
            throw new Error('Cannot make offer on unclaimed parcel');
        }

        if (parcel.owner === 'City') {
            throw new Error('Cannot make offer on City-owned parcel');
        }

        if (parcel.owner === playerId) {
            throw new Error('Cannot make offer on your own parcel');
        }

        // Validate offer amount
        if (offerAmount <= 0) {
            throw new Error('Offer amount must be positive');
        }

        // Spend 1 action for making an offer (regardless of outcome)
        this.spendActions(playerId, 1, 'land offer');

        // Calculate building value if parcel has a building
        let buildingValue = 0;
        if (parcel.building) {
            const building = this.gameState.buildings.get(`${row},${col}`);
            if (building) {
                buildingValue = this.calculateBuildingValue(building);
            }
        }

        // Total escrow = land offer + building value
        const totalEscrowAmount = offerAmount + buildingValue;

        // Check if player has enough cash for total escrow
        const playerBalance = this.getPlayerBalance(playerId);
        if (playerBalance < totalEscrowAmount) {
            throw new Error(`Insufficient funds: need $${totalEscrowAmount.toLocaleString()} ($${offerAmount.toLocaleString()} land + $${buildingValue.toLocaleString()} building), have $${playerBalance.toLocaleString()}`);
        }

        // ✅ ESCROW FUNDS (lock total amount for land + building)
        this.gameState.playerBalances.set(playerId, playerBalance - totalEscrowAmount);
        console.log(`💰 [ESCROW] Player ${playerId} escrowed $${totalEscrowAmount} ($${offerAmount} land + $${buildingValue} building)`);
        console.log(`💰 [ESCROW] Balance: $${playerBalance} → $${playerBalance - totalEscrowAmount}`);

        // Create offer
        const offerId = this.gameState.landExchange.nextOfferId++;
        const offer = {
            id: offerId,
            row: row,
            col: col,
            offererId: playerId,
            ownerId: parcel.owner,
            offerAmount: offerAmount,
            buildingValue: buildingValue, // Store building value at time of offer
            escrowAmount: totalEscrowAmount, // Total escrowed (land + building)
            status: 'pending', // pending, accepted, matched, withdrawn
            createdAt: Date.now(),
            parcelLastPaid: parcel.lastPurchasePrice || 100
        };

        this.gameState.landExchange.activeOffers.set(offerId, offer);

        // Broadcast to all players (serialize offer to avoid circular refs)
        this.room.broadcast({
            type: 'LAND_EXCHANGE_UPDATE',
            subtype: 'OFFER_MADE',
            offerId: offerId,
            offer: {
                id: offer.id,
                row: offer.row,
                col: offer.col,
                offererId: offer.offererId,
                ownerId: offer.ownerId,
                offerAmount: offer.offerAmount,
                buildingValue: offer.buildingValue, // Include building value for UI display
                escrowAmount: offer.escrowAmount, // Total escrowed for transparency
                status: offer.status,
                createdAt: offer.createdAt,
                parcelLastPaid: offer.parcelLastPaid
            }
        });

        console.log(`💰 Player ${playerId} offered $${offerAmount} for parcel [${row},${col}] owned by ${parcel.owner}`);

        return {
            success: true,
            offerId: offerId,
            offer: offer
        };
    }

    /**
     * Respond to an offer (accept or match)
     */
    async processOfferResponse(transaction) {
        const { playerId, offerId, action } = transaction; // action: 'accept' or 'match'

        const offer = this.gameState.landExchange.activeOffers.get(offerId);
        if (!offer) {
            throw new Error('Offer not found');
        }

        if (offer.status !== 'pending') {
            throw new Error(`Offer already ${offer.status}`);
        }

        if (offer.ownerId !== playerId) {
            throw new Error('Only the parcel owner can respond to this offer');
        }

        const parcel = this.gameState.grid[offer.row][offer.col];

        if (action === 'accept') {
            // ACCEPT: Transfer ownership, pay seller
            // Note: Building may have decayed since offer was made, requiring escrow adjustment

            // Recalculate current building value (may have decayed since offer creation)
            let currentBuildingValue = 0;
            if (parcel.building) {
                const building = this.gameState.buildings.get(`${offer.row},${offer.col}`);
                if (building) {
                    currentBuildingValue = this.calculateBuildingValue(building);
                }
            }

            // Calculate actual payment: land offer + current building value
            const actualPayment = offer.offerAmount + currentBuildingValue;

            // Calculate refund: original escrow minus actual payment
            const refundToOfferer = offer.escrowAmount - actualPayment;

            // Refund excess escrow to offerer (if building decayed)
            if (refundToOfferer > 0) {
                const offererBalance = this.getPlayerBalance(offer.offererId);
                this.gameState.playerBalances.set(offer.offererId, offererBalance + refundToOfferer);
            }

            // Pay owner the actual payment (land + current building value)
            const ownerBalance = this.getPlayerBalance(playerId);
            this.gameState.playerBalances.set(playerId, ownerBalance + actualPayment);

            // Transfer parcel to offerer
            parcel.owner = offer.offererId;
            parcel.lastPurchasePrice = offer.offerAmount; // Land value only
            parcel.lastAuctionWin = null; // Clear any auction protection

            // Record price in history
            this.gameState.landExchange.offerHistory.push({
                offerId: offerId,
                row: offer.row,
                col: offer.col,
                price: offer.offerAmount,
                type: 'accepted',
                timestamp: Date.now()
            });

            offer.status = 'accepted';
            offer.resolvedAt = Date.now();

            // Broadcast ownership transfer
            this.room.broadcast({
                type: 'LAND_EXCHANGE_UPDATE',
                subtype: 'OFFER_ACCEPTED',
                offerId: offerId,
                newOwner: offer.offererId
            });

            console.log(`💰 Offer ${offerId} accepted: Parcel [${offer.row},${offer.col}] transferred to ${offer.offererId} for $${offer.offerAmount} land + $${currentBuildingValue} building (refund: $${refundToOfferer})`);

            return {
                success: true,
                action: 'accepted',
                newOwner: offer.offererId,
                price: offer.offerAmount,
                landValue: offer.offerAmount,
                buildingValue: currentBuildingValue,
                totalPayment: actualPayment,
                refund: refundToOfferer,
                newBalance: this.getPlayerBalance(offer.offererId) // Offerer's new balance after refund
            };

        } else if (action === 'match') {
            // MATCH: Owner pays offer amount to treasury, keeps parcel, costs 1 action

            // Check owner has 1 action
            const owner = this.getOrCreatePlayer(playerId);
            if (!owner.actions || owner.actions.total < 1) {
                throw new Error('Insufficient actions to match (need 1 action)');
            }

            // Calculate amount to pay treasury using CACHED price from offer (not current parcel price)
            const amountToPay = offer.offerAmount - (offer.parcelLastPaid || 0);

            if (amountToPay > 0) {
                // Check owner has enough cash
                const ownerBalance = this.getPlayerBalance(playerId);
                if (ownerBalance < amountToPay) {
                    throw new Error(`Insufficient funds to match: need $${amountToPay}, have $${ownerBalance}`);
                }

                // Deduct cash from owner
                this.gameState.playerBalances.set(playerId, ownerBalance - amountToPay);

                // Add to treasury
                this.gameState.treasury += amountToPay;
            }

            // ✅ REFUND ESCROW TO OFFERER (offer rejected, return their money)
            const offererBalance = this.getPlayerBalance(offer.offererId);
            this.gameState.playerBalances.set(offer.offererId, offererBalance + offer.escrowAmount);

            // Spend 1 action
            this.spendActions(playerId, 1, `matching offer on parcel [${offer.row},${offer.col}]`);

            // Update parcel price to reflect new market value
            parcel.lastPurchasePrice = offer.offerAmount;

            // Record price in history
            this.gameState.landExchange.offerHistory.push({
                offerId: offerId,
                row: offer.row,
                col: offer.col,
                price: offer.offerAmount,
                type: 'matched',
                timestamp: Date.now()
            });

            offer.status = 'matched';
            offer.resolvedAt = Date.now();

            // Broadcast match
            this.room.broadcast({
                type: 'LAND_EXCHANGE_UPDATE',
                subtype: 'OFFER_MATCHED',
                offerId: offerId,
                treasuryPayment: amountToPay
            });

            console.log(`💰 Offer ${offerId} matched: Owner ${playerId} paid $${amountToPay} to treasury, keeps parcel [${offer.row},${offer.col}]`);

            return {
                success: true,
                action: 'matched',
                treasuryPayment: amountToPay,
                newParcelValue: offer.offerAmount
            };
        } else {
            throw new Error(`Invalid action: ${action}`);
        }
    }

    /**
     * Withdraw an offer (costs 1 action to prevent spam)
     */
    async processWithdrawOffer(transaction) {
        const { playerId, offerId } = transaction;

        const offer = this.gameState.landExchange.activeOffers.get(offerId);
        if (!offer) {
            throw new Error('Offer not found');
        }

        if (offer.offererId !== playerId) {
            throw new Error('Only the offerer can withdraw this offer');
        }

        if (offer.status !== 'pending') {
            throw new Error(`Cannot withdraw ${offer.status} offer`);
        }

        // Check player has 1 action
        const player = this.getOrCreatePlayer(playerId);
        if (!player.actions || player.actions.total < 1) {
            throw new Error('Insufficient actions to withdraw (need 1 action)');
        }

        // ✅ REFUND ESCROW TO OFFERER
        const offererBalance = this.getPlayerBalance(playerId);
        this.gameState.playerBalances.set(playerId, offererBalance + offer.escrowAmount);

        // Spend 1 action
        this.spendActions(playerId, 1, `withdrawing offer on parcel [${offer.row},${offer.col}]`);

        offer.status = 'withdrawn';
        offer.resolvedAt = Date.now();

        // Broadcast withdrawal
        this.room.broadcast({
            type: 'LAND_EXCHANGE_UPDATE',
            subtype: 'OFFER_WITHDRAWN',
            offerId: offerId
        });

        console.log(`💰 Offer ${offerId} withdrawn by ${playerId}`);

        return {
            success: true,
            action: 'withdrawn'
        };
    }

    /**
     * Get all active offers for a player (either as offerer or owner)
     */
    getPlayerOffers(playerId) {
        const offers = {
            asOfferer: [],
            asOwner: []
        };

        for (const offer of this.gameState.landExchange.activeOffers.values()) {
            if (offer.status === 'pending') {
                if (offer.offererId === playerId) {
                    offers.asOfferer.push(offer);
                }
                if (offer.ownerId === playerId) {
                    offers.asOwner.push(offer);
                }
            }
        }

        return offers;
    }

    /**
     * Get recent offer history for a parcel (for price discovery)
     */
    getParcelOfferHistory(row, col, limit = 5) {
        return this.gameState.landExchange.offerHistory
            .filter(h => h.row === row && h.col === col)
            .slice(-limit)
            .reverse();
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

        // console.log(`🎯 Action spend processed: ${playerId} spent ${count} actions on ${reason}`);

        return {
            success: true,
            actionsSpent: count,
            reason: reason
        };
    }

    /**
     * Get serializable game state for client sync
     */
    getSerializableGameState() {
        // Convert Map to Object for JSON serialization
        const playersObject = {};
        if (this.gameState.players instanceof Map) {
            for (const [playerId, playerData] of this.gameState.players) {
                playersObject[playerId] = playerData;
            }
        } else {
            // Already an object
            Object.assign(playersObject, this.gameState.players);
        }

        // Convert buildings Map to Array (client expects array format)
        const buildingsArray = [];
        if (this.gameState.buildings instanceof Map) {
            for (const [locationKey, building] of this.gameState.buildings) {
                const serialized = {
                    ...building,
                    locationKey: locationKey
                };

                // DEBUG: Log first building to verify performance data
                if (buildingsArray.length === 0 && building.performance) {
                    console.log('📤 SERVER: Serializing building with performance:', {
                        locationKey,
                        hasPerformance: !!building.performance,
                        hasResourceSatisfaction: !!building.performance?.resourceSatisfaction,
                        resourceSatisfaction: building.performance?.resourceSatisfaction
                    });
                }

                buildingsArray.push(serialized);
            }
        } else if (Array.isArray(this.gameState.buildings)) {
            buildingsArray.push(...this.gameState.buildings);
        }

        // Convert actionMarketplace listings Map to Array with calculated values
        let actionMarketplace = this.gameState.actionMarketplace;

        if (actionMarketplace && actionMarketplace.listings instanceof Map) {
            // Enhance each listing with server-calculated values
            const enhancedListings = Array.from(actionMarketplace.listings.values()).map(listing => {
                const enhanced = { ...listing };

                // Add calculated buy now price with time-based premium
                if (listing.buyNowPrice && listing.status === 'active') {
                    enhanced.calculatedBuyNowPrice = this.calculateBuyNowPrice(listing);
                }

                // Add calculated cancellation/end early fee
                if (listing.status === 'active') {
                    const monthProgress = this.calculateMonthProgress();
                    let fee = 0;
                    if (listing.currentBid > 0) {
                        const maxFeeRate = 5.0; // 500% of current bid
                        const currentFeeRate = maxFeeRate * (1 - monthProgress);
                        fee = Math.floor(listing.currentBid * currentFeeRate);
                    }
                    enhanced.calculatedEndEarlyFee = fee;
                    enhanced.calculatedCancelFee = fee;
                }

                return enhanced;
            });

            actionMarketplace = {
                ...actionMarketplace,
                listings: enhancedListings,
                monthProgress: this.calculateMonthProgress() // Include month progress for client use
            };

        }

        return {
            ...this.gameState,
            players: playersObject,
            buildings: buildingsArray,
            actionMarketplace: actionMarketplace,
            // Ensure other Maps are also converted if needed
            playerBalances: this.gameState.playerBalances instanceof Map
                ? Object.fromEntries(this.gameState.playerBalances)
                : this.gameState.playerBalances,
            playerActions: this.gameState.playerActions instanceof Map
                ? Object.fromEntries(this.gameState.playerActions)
                : this.gameState.playerActions,
            actionCosts: this.ACTION_COSTS
        };
    }

    /**
     * Intelligently invalidate only affected caches
     */
    invalidateCaches(changeType = 'all', affectedKeys = []) {
        switch(changeType) {
            case 'building_added':
            case 'building_removed':
                // These affect global calculations
                this.cache.jeefhh.dirty = true;
                this.cache.carens.dirty = true;

                // Only invalidate nearby building performances (within influence range)
                if (affectedKeys.length > 0) {
                    const [row, col] = affectedKeys[0].split(',').map(Number);
                    this.invalidateNearbyBuildingCaches(row, col, 5); // 5 tile radius
                }
                break;

            case 'building_completed':
                // Construction complete affects supply/demand
                this.cache.jeefhh.dirty = true;
                this.cache.carens.dirty = true;
                break;

            case 'building_performance':
                // Only affects specific building
                affectedKeys.forEach(key => {
                    const cache = this.cache.buildingPerformances.get(key);
                    if (cache) cache.dirty = true;
                });
                break;

            case 'player_transaction':
                // Only affects player wealth, not building performance
                affectedKeys.forEach(playerId => {
                    const cache = this.cache.playerWealth.get(playerId);
                    if (cache) cache.dirty = true;
                });
                break;

            case 'population_change':
                // Affects demand calculations only
                this.cache.jeefhh.dirty = true;
                break;

            case 'all':
            default:
                // Full invalidation (fallback)
                this.cache.jeefhh.dirty = true;
                this.cache.carens.dirty = true;
                for (const [key, cache] of this.cache.buildingPerformances) {
                    cache.dirty = true;
                }
                for (const [key, cache] of this.cache.playerWealth) {
                    cache.dirty = true;
                }
        }
    }

    /**
     * Invalidate building caches within a radius
     */
    invalidateNearbyBuildingCaches(centerRow, centerCol, radius) {
        for (const [locationKey, cache] of this.cache.buildingPerformances) {
            const [row, col] = locationKey.split(',').map(Number);
            const distance = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
            if (distance <= radius) {
                cache.dirty = true;
            }
        }
    }

    /**
     * Generate delta update with only changed data
     */
    generateDeltaUpdate() {
        const delta = {
            type: 'GAME_STATE_DELTA',
            timestamp: Date.now(),
            gameTime: this.gameState.gameTime,
            changes: {}
        };

        // Include changed buildings
        if (this.pendingChanges.buildings.size > 0) {
            delta.changes.buildings = [];
            for (const locationKey of this.pendingChanges.buildings) {
                const building = this.gameState.buildings.get(locationKey);
                if (building) {
                    // Include calculated performance data
                    const buildingWithPerf = this.calculateBuildingPerformanceSimple(building);
                    delta.changes.buildings.push({
                        locationKey,
                        data: buildingWithPerf
                    });
                } else {
                    // Building was removed
                    delta.changes.buildings.push({
                        locationKey,
                        data: null
                    });
                }
            }
        }

        // Include changed players
        if (this.pendingChanges.players.size > 0) {
            delta.changes.players = {};
            for (const playerId of this.pendingChanges.players) {
                const player = this.gameState.players.get(playerId);
                if (player) {
                    delta.changes.players[playerId] = this.calculatePlayerStats(player);
                }
            }
        }

        // Include JEEFHH if changed
        if (this.pendingChanges.jeefhh) {
            delta.changes.jeefhh = this.gameState.jeefhh;
        }

        // Include CARENS if changed
        if (this.pendingChanges.carens) {
            delta.changes.carens = this.gameState.carens;
        }

        // Reset pending changes
        this.pendingChanges = {
            buildings: new Set(),
            players: new Set(),
            jeefhh: false,
            carens: false,
            gameTime: false
        };

        return delta;
    }

    /**
     * Broadcast delta updates instead of full state
     */
    broadcastDeltaUpdate() {
        // Only broadcast if there are actual changes
        if (this.pendingChanges.buildings.size > 0 ||
            this.pendingChanges.players.size > 0 ||
            this.pendingChanges.jeefhh ||
            this.pendingChanges.carens) {

            const delta = this.generateDeltaUpdate();

            if (this.broadcastFunction) {
                // Broadcasting delta update to clients
                this.broadcastFunction(delta);
            }
        }
    }

    /**
     * Calculate player stats for delta updates
     */
    calculatePlayerStats(player) {
        // Use cached wealth calculation if available
        const playerId = player.id;
        const now = Date.now();
        let wealth = player.cash;

        const cachedWealth = this.cache.playerWealth.get(playerId);
        if (cachedWealth && !cachedWealth.dirty && (now - cachedWealth.lastUpdate) < 60000) {
            wealth = cachedWealth.data;
        } else {
            // Calculate wealth from owned parcels and buildings
            for (const [locationKey, parcel] of this.gameState.grid) {
                if (parcel.owner === playerId) {
                    wealth += parcel.price || 0;
                    const building = this.gameState.buildings.get(locationKey);
                    if (building && building.owner === playerId) {
                        wealth += building.cost || 0;
                    }
                }
            }

            // Update cache
            this.cache.playerWealth.set(playerId, {
                lastUpdate: now,
                data: wealth,
                dirty: false
            });
        }

        return {
            ...player,
            wealth,
            cashflow: this.calculatePlayerCashflow(playerId)
        };
    }

    /**
     * Get building repair cost at specific location
     */
    getBuildingRepairCost(row, col) {
        const parcel = this.gameState.grid[row]?.[col];
        if (!parcel || !parcel.building) {
            return 0;
        }
        return this.calculateRepairCost(parcel.building, 1.0);
    }

    /**
     * Get current building value at specific location
     */
    getBuildingValue(row, col) {
        // Check buildings Map directly (handles both construction and completed buildings)
        const locationKey = `${row},${col}`;
        const building = this.gameState.buildings.get(locationKey);

        if (!building) {
            return 0;
        }

        return this.calculateBuildingValue(building);
    }

    /**
     * Get total city population
     */
    getCityPopulation() {
        let totalPopulation = 0;

        // Sum population from all occupied buildings
        this.gameState.buildings.forEach((building, key) => {
            const [row, col] = key.split(',').map(Number);
            const parcel = this.gameState.grid[row]?.[col];
            if (parcel && parcel.population) {
                totalPopulation += parcel.population;
            }
        });

        return totalPopulation;
    }

    /**
     * Get comprehensive building state for rendering (condition, performance, construction)
     */
    getBuildingRenderingState(row, col) {
        // Get building object from buildings Map (authoritative source)
        const locationKey = `${row},${col}`;
        const building = this.gameState.buildings.get(locationKey);
        if (!building) {
            return null;
        }

        // Get building definition for static data
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef) {
            return null;
        }

        const condition = this.calculateBuildingCondition(building);

        console.log(`[BROADCAST] getBuildingRenderingState called for [${row},${col}] ${building.id}, underConstruction: ${building.underConstruction}`);

        // Get full performance details (revenue, maintenance, etc.) for tooltips
        // This calls the (row, col) version which returns the detailed object
        const performanceDetails = building.underConstruction ? null : this.calculateBuildingPerformance(row, col);

        // console.log(`[CARENS] Performance details for [${row},${col}]:`, performanceDetails ? 'HAS DATA' : 'NULL', performanceDetails?.summary);

        // Calculate efficiency percentage and financial data for tooltip display
        let efficiency = 0;
        let netIncome = 0;
        let revenue = 0;
        let maintenance = 0;
        let performanceMultiplier = building.underConstruction ? 0.0 : 1.0; // 0 during construction

        if (performanceDetails && performanceDetails.summary) {
            revenue = performanceDetails.summary.revenue || 0;
            maintenance = performanceDetails.summary.maintenance || 0;
            netIncome = performanceDetails.summary.netIncome || 0;

            // Performance % = Core Needs Satisfaction × CARENS (does NOT include condition)
            efficiency = performanceDetails.summary.performance || 0;
            performanceMultiplier = efficiency / 100; // Convert % to multiplier

            // console.log(`[REVENUE] Extracted from performance: revenue=$${revenue}, maintenance=$${maintenance}, netIncome=$${netIncome}, performance=${efficiency}%`);
        } else {
            console.log(`[WARN] No performance details for [${row},${col}] ${building.id} - performanceDetails is ${performanceDetails ? 'missing summary' : 'null'}`);
        }

        // Calculate construction progress if under construction
        let constructionProgress = 1.0;
        if (building.underConstruction) {
            const constructionElapsed = Date.now() - building.constructionStartTime;
            const constructionRequired = building.constructionDays * this.GAME_DAY_MS;
            constructionProgress = Math.min(1.0, constructionElapsed / constructionRequired);
        }

        const stateObject = {
            row,
            col,
            buildingId: building.id,
            owner: building.owner,
            condition: condition, // 0.1 to 1.0
            performance: performanceMultiplier, // 0.0 to 1.0 multiplier
            isUnderConstruction: building.underConstruction || false,
            constructionProgress: constructionProgress,
            constructionDays: buildingDef.economics?.constructionDays || 1,
            constructionStartTime: building.constructionStartTime || Date.now(),
            repairCost: this.calculateRepairCost(building, 1.0),
            currentValue: this.calculateBuildingValue(building),

            // Detailed performance data for tooltips
            efficiency: efficiency, // Percentage (0-100+)
            netIncome: netIncome, // Daily net revenue
            revenue: revenue, // Daily revenue
            maintenance: maintenance, // Daily maintenance cost
            performanceDetails: performanceDetails // Full breakdown
        };

        // console.log(`[INFO] Returning state for [${row},${col}]:`, {
        //     buildingId: stateObject.buildingId,
        //     efficiency: stateObject.efficiency,
        //     netIncome: stateObject.netIncome,
        //     revenue: stateObject.revenue,
        //     maintenance: stateObject.maintenance,
        //     hasPerformanceDetails: !!stateObject.performanceDetails
        // });

        return stateObject;
    }

    /**
     * Calculate building performance MULTIPLIER based on JEEFHH efficiency
     * Returns 0.0 to 1.0 representing how well the building is performing
     * NOTE: This is a simple multiplier version, different from calculateBuildingPerformance(row, col)
     */
    calculateBuildingPerformanceMultiplier(building, row, col) {
        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef || !buildingDef.resources) {
            return 1.0; // Default to full performance
        }

        // Base performance starts at 1.0
        let performance = 1.0;

        // Factor in JEEFHH supply/demand ratios
        const jeefhh = this.gameState.jeefhh;

        // Check each resource the building requires
        if (buildingDef.resources.energyRequired > 0) {
            performance *= jeefhh.energy.multiplier;
        }
        if (buildingDef.resources.jobsRequired > 0) {
            performance *= jeefhh.jobs.multiplier;
        }
        if (buildingDef.resources.foodRequired > 0) {
            performance *= jeefhh.food.multiplier;
        }
        if (buildingDef.resources.healthcareRequired > 0) {
            performance *= jeefhh.healthcare.multiplier;
        }
        if (buildingDef.resources.educationRequired > 0) {
            performance *= jeefhh.education.multiplier;
        }

        // Factor in CARENS livability multiplier for buildings that provide services
        if (buildingDef.resources.housingProvided > 0 ||
            buildingDef.resources.jobsProvided > 0) {
            performance *= this.gameState.carens.multiplier;
        }

        // Clamp performance between 0.0 and 1.0
        return Math.max(0.0, Math.min(1.0, performance));
    }

    /**
     * Broadcast building state updates to all clients
     */
    broadcastBuildingStates() {
        if (!this.broadcastFunction) return;

        const buildingStates = [];

        // DEBUG: Check total buildings in system
        // console.log(`[INFO] Total buildings in gameState: ${this.gameState.buildings.size}`);
        // if (this.gameState.buildings.size > 0) {
        //     console.log(`[INFO] Building keys:`, Array.from(this.gameState.buildings.keys()).slice(0, 5));
        // }

        // Collect all building states
        this.gameState.buildings.forEach((building, locationKey) => {
            const [row, col] = locationKey.split(',').map(Number);
            const state = this.getBuildingRenderingState(row, col);
            if (state) {
                buildingStates.push(state);
                // console.log(`[INFO] Added building state for [${row},${col}]: ${building.id}`);
            } else {
                console.log(`[ERROR] No state generated for [${row},${col}]: ${building.id}`);
            }
        });

        // DEBUG: Log building states being broadcast
        console.log(`[BROADCAST] Broadcasting ${buildingStates.length} building states:`,
            buildingStates.slice(0, 3).map(s => ({
                location: `[${s.row},${s.col}]`,
                isUnderConstruction: s.isUnderConstruction,
                performance: s.performance,
                condition: s.condition
            }))
        );

        // Broadcast to all clients
        this.broadcastFunction({
            type: 'BUILDING_STATES',
            buildings: buildingStates,
            timestamp: Date.now()
        });

        if (this.DEBUG.BROADCASTS) {
            const sizeKB = (JSON.stringify({ type: 'BUILDING_STATES', buildings: buildingStates }).length / 1024).toFixed(2);
            console.log(`[BROADCAST] Sent BUILDING_STATES - ${buildingStates.length} buildings, ${sizeKB}KB`);
        }
    }

    // ========================================================================
    // GOVERNANCE BUDGET METHODS
    // ========================================================================

    /**
     * Get current budget balances for all categories
     */
    getBudgets() {
        return { ...this.gameState.budgets };
    }

    /**
     * Spend from a category budget
     * @param {string} category - Budget category (e.g., 'housing', 'commercial')
     * @param {number} amount - Amount to spend
     * @param {string} description - Description of the spending
     * @returns {boolean} - True if successful, false if insufficient funds
     */
    spendFromBudget(category, amount, description = '') {
        if (!this.gameState.budgets.hasOwnProperty(category)) {
            console.error(`[BUDGET] Invalid category: ${category}`);
            return false;
        }

        const currentBalance = this.gameState.budgets[category];
        if (currentBalance < amount) {
            console.warn(`[BUDGET] Insufficient ${category} budget: has $${currentBalance}, needs $${amount}`);
            return false;
        }

        this.gameState.budgets[category] -= amount;
        console.log(`[BUDGET] Spent $${amount} from ${category} budget (${description}). New balance: $${this.gameState.budgets[category]}`);
        return true;
    }

    /**
     * Allocate LVT revenue to budgets based on player allocations
     * Called monthly when LVT is collected
     * @param {number} totalRevenue - Total LVT revenue collected
     */
    allocateBudgets(totalRevenue) {
        if (!this.gameState.monthlyBudget?.proportions) {
            // No allocations - all revenue goes to treasury
            this.gameState.treasury += totalRevenue;
            console.log(`[BUDGET] No allocations - $${totalRevenue} added to treasury. New balance: $${this.gameState.treasury}`);
            return;
        }

        const proportions = this.gameState.monthlyBudget.proportions;

        Object.keys(this.gameState.budgets).forEach(category => {
            const proportion = proportions[category] || 0;
            const allocation = totalRevenue * proportion;

            if (allocation > 0) {
                this.gameState.budgets[category] += allocation;
                console.log(`[BUDGET] Allocated $${allocation.toFixed(2)} to ${category} budget. New balance: $${this.gameState.budgets[category].toFixed(2)}`);
            }
        });

        // Any unallocated funds go to treasury
        const totalAllocated = Object.values(proportions).reduce((sum, p) => sum + p, 0);
        if (totalAllocated < 1.0) {
            const unallocated = totalRevenue * (1.0 - totalAllocated);
            this.gameState.treasury += unallocated;
            console.log(`[BUDGET] $${unallocated.toFixed(2)} unallocated funds added to treasury. New balance: $${this.gameState.treasury.toFixed(2)}`);
        }
    }
}

module.exports = ServerEconomicEngine;
