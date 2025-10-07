/**
 * Economic Client v2 - Clean Client-Server Communication
 *
 * Responsibilities:
 * - Send transactions to server
 * - Receive and process economic updates
 * - Update UI with economic data
 * - Handle real-time game time synchronization
 */

// Global debug mode flag - set to false to reduce console spam
window.DEBUG_MODE = window.DEBUG_MODE || false;

class EconomicClient {
    constructor(game, autoConnectWebSocket = true) {
        this.game = game;
        this.baseUrl = ''; // Relative URLs for same-origin requests

        // Client state
        this.gameTime = 0;
        this.serverGameTime = 0;
        this.lastSyncTime = Date.now();
        this.displayTimer = null;
        this.roomId = null; // Will be set from server via ROOM_STATE_SYNC

        // Connection manager reference
        this.connectionManager = null;

        // Economic data from server
        this.jeefhh = {
            jobs: { supply: 0, demand: 0, multiplier: 1.0 },
            energy: { supply: 0, demand: 0, multiplier: 1.0 },
            education: { supply: 0, demand: 0, multiplier: 1.0 },
            food: { supply: 0, demand: 0, multiplier: 1.0 },
            housing: { supply: 0, demand: 0, multiplier: 1.0 },
            healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
        };

        this.carens = {
            culture: 0,       // Points on -100 to +100 scale
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0,
            multiplier: 1.0   // Combined multiplier from server
        };
        this.totalResidents = 0;
        this.lvtRate = 0.5; // Default LVT rate 50%

        // Server-authoritative action costs
        this.actionCosts = null; // Will be set from server data

        // Processed vitality data for UI (computed from jeefhh)
        this.vitalitySupply = {
            JOBS: 0, ENERGY: 0, EDUCATION: 0, FOOD: 0, HOUSING: 0, HEALTHCARE: 0
        };
        this.vitalityDemand = {
            JOBS: 0, ENERGY: 0, EDUCATION: 0, FOOD: 0, HOUSING: 0, HEALTHCARE: 0
        };

        // Building performance cache (for tooltips)
        this.buildingPerformanceCache = new Map();

        // WebSocket-based data stores (replaces HTTP API calls)
        this.buildings = new Map(); // Building data from WebSocket
        this.playerBalances = {}; // Player balances from WebSocket
        this.playerActions = {}; // Player action inventories from WebSocket

        // Update callbacks
        this.updateCallbacks = new Set();

        // Transaction response callbacks for WebSocket transactions
        this.transactionCallbacks = new Map();

        // Player ID ready callback
        this.onPlayerIdReady = null;

        // Client game time tracking (sync'd with server)
        this.GAME_DAY_MS = 3600000 / 365; // Same as server
        this.clientGameStartTime = Date.now();


        // Client clock will be started when game begins (not during lobby/chat)
        this.clockStarted = false;

        // Initialize connection for real-time updates (if enabled)
        if (autoConnectWebSocket) {
            this.initializeConnection();
        }
    }

    /**
     * V2: Set callback for when server assigns player ID
     */
    setPlayerIdReadyCallback(callback) {
        this.onPlayerIdReady = callback;
    }

    /**
     * CLIENT GAME TIME MANAGEMENT
     */

    /**
     * Start local game time clock (syncs with server)
     */
    startClientClock() {
        if (this.clockStarted) {
            return;
        }

        // Reset game start time to now (when game actually begins)
        this.clientGameStartTime = Date.now();
        this.clockStarted = true;

        // Server-authoritative time with client display interpolation
        // Start display timer for smooth UI updates between server syncs
        this.startDisplayTimer();
    }

    /**
     * Update client game time (server-authoritative only)
     * Client no longer calculates its own time - only displays server time
     */
    updateClientGameTime() {
        // No-op: Client receives gameTime from server via sync
        // This prevents client-server time calculation conflicts
    }

    /**
     * Start display timer for smooth UI updates between server syncs
     */
    startDisplayTimer() {
        if (this.displayTimer) {
            clearInterval(this.displayTimer);
        }

        // Update display every 5 seconds for smooth progression
        this.displayTimer = setInterval(() => {
            if (this.serverGameTime !== null && this.clockStarted) {
                // Calculate elapsed time since last server sync
                const now = Date.now();
                const elapsedMs = now - this.lastSyncTime;
                const elapsedGameTime = elapsedMs / this.GAME_DAY_MS;

                // Interpolate current display time (server time + elapsed)
                this.gameTime = this.serverGameTime + elapsedGameTime;

                // Update game date display
                if (window.game && typeof window.game.updateGameDate === 'function') {
                    window.game.updateGameDate();
                }
            }
        }, 5000); // Update every 5 seconds
    }

    /**
     * Stop display timer
     */
    stopDisplayTimer() {
        if (this.displayTimer) {
            clearInterval(this.displayTimer);
            this.displayTimer = null;
        }
    }

    /**
     * Sync client clock with server time (AUTHORITATIVE TIME SOURCE)
     *
     * This is the single source of truth for game time in the client.
     * All time-dependent systems should use this.gameTime or this.serverGameTime.
     *
     * Calendar system uses same month boundaries as server:
     * - Sept: days 1-30 (gameDay 1 = Sept 2)
     * - Oct: days 31-61, Nov: days 62-91, etc.
     */
    syncWithServerTime(serverGameTime) {
        const now = Date.now();
        this.serverGameTime = serverGameTime;
        this.lastSyncTime = now; // Track when we last synced

        // Adjust client start time to match server
        const serverElapsedMs = serverGameTime * this.GAME_DAY_MS;
        this.clientGameStartTime = now - serverElapsedMs;
        this.gameTime = serverGameTime;

        // Update game's date display with server-authoritative time
        if (window.game && typeof window.game.updateGameDate === 'function') {
            window.game.updateGameDate();
        }

        // Validate time synchronization
        this.validateTimeSynchronization();
    }

    /**
     * Validate that time synchronization is working properly
     * Helps catch future time-related bugs early
     */
    validateTimeSynchronization() {
        if (!window.DEBUG_MODE) return; // Only run in debug mode

        const currentDay = Math.floor(this.gameTime);

        // Validate date calculation consistency
        if (window.game && window.game.getGameDate) {
            const gameDate = window.game.getGameDate();

            // Basic sanity checks
            if (gameDate.day < 1 || gameDate.day > 31) {
                console.warn('🐛 TIME SYNC WARNING: Invalid day detected:', gameDate.day);
            }

            if (currentDay > 365) {
                console.warn('🐛 TIME SYNC WARNING: Game time beyond 1 year:', currentDay);
            }

            // Check for the "Sept 31st" bug specifically
            if (gameDate.month === 'SEPT' && gameDate.day > 30) {
                console.error('🐛 TIME SYNC ERROR: September has >30 days!', gameDate);
            }
        }
    }

    /**
     * TRANSACTION SENDING
     */

    /**
     * Send building construction start transaction
     */
    async startConstruction(buildingId, location, playerId, cost) {
        const transaction = {
            type: 'BUILD_START',
            buildingId,
            location, // [row, col]
            playerId,
            cost,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Send building construction complete transaction
     */
    async completeConstruction(buildingId, location, playerId) {
        const transaction = {
            type: 'BUILD_COMPLETE',
            buildingId,
            location, // [row, col]
            playerId,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Send building destruction transaction
     */
    async destroyBuilding(location, playerId) {
        const transaction = {
            type: 'DESTROY_BUILDING',
            location, // [row, col]
            playerId,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Send building repair transaction
     */
    async repairBuilding(location, playerId, cost) {
        const transaction = {
            type: 'REPAIR_BUILDING',
            location, // [row, col]
            playerId,
            cost,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Send parcel purchase transaction
     */
    async purchaseParcel(playerId, amount, location, description = 'Parcel Purchase') {
        const transaction = {
            type: 'PARCEL_PURCHASE',
            playerId,
            amount,
            location,
            description,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Send general cash spending transaction
     */
    async spendCash(playerId, amount, description = 'Purchase') {
        const transaction = {
            type: 'CASH_SPEND',
            playerId,
            amount,
            description,
            timestamp: Date.now()
        };

        return await this.sendTransaction(transaction);
    }

    /**
     * Generic transaction sender
     */
    async sendTransaction(transaction) {
        try {
            // Check ConnectionManager instead
            if (!this.connectionManager || !this.connectionManager.isConnected) {
                const errorMsg = 'Not connected to server';
                if (window.uiManager) {
                    window.uiManager.showError(errorMsg, 'Connection Error');
                }
                throw new Error(errorMsg);
            }

            // Add transaction ID for tracking
            transaction.id = `${transaction.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Send via ConnectionManager
            this.connectionManager.send({
                type: 'ECONOMIC_TRANSACTION',
                transaction: transaction
            });

            // Wait for response via WebSocket
            return await this.waitForTransactionResponse(transaction.id);

        } catch (error) {
            console.error('❌ Economic transaction failed:', error);
            if (window.uiManager && error.message !== 'Not connected to server') {
                window.uiManager.showError(error.message || 'Transaction failed', 'Transaction Error');
            }
            throw error;
        }
    }

    async waitForTransactionResponse(transactionId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.transactionCallbacks.delete(transactionId);
                const errorMsg = 'Transaction timed out';
                if (window.uiManager) {
                    window.uiManager.showError('Server did not respond in time', 'Transaction Timeout');
                }
                reject(new Error(errorMsg));
            }, 10000); // 10 second timeout

            this.transactionCallbacks.set(transactionId, (result) => {
                clearTimeout(timeout);
                this.transactionCallbacks.delete(transactionId);

                // Sync game time
                if (result.gameTime) {
                    this.syncWithServerTime(result.gameTime);
                }

                // Process immediate balance update
                if (result.newBalance !== undefined) {
                    this.serverBalance = result.newBalance;
                    const playerCashElement = window.game?.uiManager?.get('playerCash');
                    if (playerCashElement) {
                        playerCashElement.textContent = `$${Math.round(result.newBalance).toLocaleString()}`;
                    }
                }

                // Check for errors in result
                if (result.success === false) {
                    const errorMsg = result.error || 'Transaction failed';
                    if (window.uiManager) {
                        window.uiManager.showError(errorMsg, 'Transaction Failed');
                    }
                    reject(new Error(errorMsg));
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * DATA FETCHING
     */

    /**
     * Get building performance (for tooltips) - with caching
     */
    async getBuildingPerformance(row, col, useCache = true) {
        const cacheKey = `${row},${col}`;

        // Check cache first (5 second TTL)
        if (useCache && this.buildingPerformanceCache.has(cacheKey)) {
            const cached = this.buildingPerformanceCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) {
                return cached.data;
            }
        }

        // Use WebSocket data instead of HTTP API
        const locationKey = `${row},${col}`;
        const building = this.buildings.get(locationKey);

        if (!building) {
            // Don't warn during auto-completion transitions - building data may be temporarily out of sync
            return null;
        }

        // Calculate performance data (mimic what the server API would return)
        const performance = {
            building: building,
            rent: building.type === 'residential' ? (building.residents || 0) * 100 : 0,
            population: building.residents || 0,
            workers: building.workers || 0,
            efficiency: building.efficiency || 1.0,
            income: building.monthlyIncome || 0,
            expenses: building.monthlyExpenses || 0,
            netIncome: (building.monthlyIncome || 0) - (building.monthlyExpenses || 0)
        };

        // Cache result
        this.buildingPerformanceCache.set(cacheKey, {
            data: performance,
            timestamp: Date.now()
        });

        return performance;
    }

    /**
     * Get detailed building performance from WebSocket state (no HTTP)
     */
    getBuildingDetailedPerformance(row, col) {
        const locationKey = `${row},${col}`;
        const building = this.buildings.get(locationKey);

        if (!building) {
            console.warn(`⚠️ Building not found at ${locationKey}`);
            return null;
        }

        // Return building data with performance metrics (already calculated by server)
        return {
            building: building,
            performance: {
                residents: building.residents || 0,
                workers: building.workers || 0,
                efficiency: building.efficiency || 1.0,
                revenue: building.revenue || 0,
                expenses: building.expenses || 0,
                netIncome: building.netIncome || 0
            }
        };
    }

    /**
     * Get player cashflow details from WebSocket state (no HTTP)
     */
    getPlayerCashflow(playerId) {
        // Return cached cashflow data from WebSocket updates
        if (this.cachedCashflow) {
            return this.cachedCashflow;
        }

        // Only warn if we have no connection at all
        if (!this.connectionManager || !this.connectionManager.isConnected) {
            console.warn(`⚠️ No cashflow data available - ConnectionManager not connected`);
        }
        return null;
    }

    /**
     * V2: Get player data from server state (for governance facade)
     */
    getPlayerData(playerId) {
        // Use provided playerId or current player
        const targetPlayerId = playerId || this.playerId;

        // Return cached player data from WebSocket updates
        if (this.gameState && this.gameState.players) {
            return this.gameState.players[targetPlayerId];
        }

        // Only warn if connected but data still not available (actual error)
        // During initialization, it's normal for data to not be available yet
        if (this.connectionManager && this.connectionManager.isConnected && this.gameState) {
            console.warn(`⚠️ Player data not found in game state`);
        }
        return null;
    }

    /**
     * V2: Submit governance transaction to server
     */
    async submitGovernanceTransaction(type, data) {
        if (!this.connectionManager || !this.connectionManager.isConnected) {
            console.error('Cannot submit governance transaction - ConnectionManager not connected');
            return false;
        }

        const transaction = {
            type: 'GOVERNANCE_TRANSACTION',
            transactionType: type,
            data: data,
            playerId: this.playerId,
            timestamp: Date.now()
        };

        try {
            this.connectionManager.send(transaction);
            // Governance transaction submitted
            return true;
        } catch (error) {
            console.error('Failed to submit governance transaction:', error);
            return false;
        }
    }

    /**
     * Get current parcel price from server state
     */
    getParcelPrice(row, col) {
        // Check if we have server grid state from WebSocket
        if (this.gameState && this.gameState.grid &&
            this.gameState.grid[row] && this.gameState.grid[row][col]) {
            return this.gameState.grid[row][col].price;
        }

        // Fallback to client-side calculation if no server data
        const centerRow = 5.5;
        const centerCol = 5.5;
        const distanceFromCenter = Math.max(
            Math.abs(row - centerRow),
            Math.abs(col - centerCol)
        );
        const maxDistance = 5.5;
        const priceRange = 200 - 100;
        const priceReduction = (distanceFromCenter / maxDistance) * priceRange;

        return Math.round(200 - priceReduction);
    }

    /**
     * Get current global economic state
     */
    async getEconomicState() {
        // Return current state from WebSocket data instead of HTTP API
        const state = {
            gameTime: this.gameTime,
            jeefhh: this.jeefhh,
            carens: this.carens,
            carensMultiplier: this.carensMultiplier,
            totalResidents: this.totalResidents,
            playerBalances: this.playerBalances || {},
            buildings: Array.from(this.buildings.values()) || [],
            timestamp: Date.now()
        };

        return state;
    }

    /**
     * Get current player's balance from WebSocket data
     */
    getCurrentPlayerBalance() {
        // V2 Server-authoritative ONLY - no fallbacks
        if (typeof this.serverBalance === 'number') {
            return this.serverBalance;
        }

        // No fallbacks - wait for server sync
        // Balance not yet synced with server
        return null; // Return null to indicate loading state
    }

    /**
     * Get current player's actions from WebSocket data
     */
    getCurrentPlayerActions() {
        // V2 Server-authoritative ONLY - no fallbacks
        if (this.playerId && this.playerActions && typeof this.playerActions[this.playerId] === 'number') {
            return this.playerActions[this.playerId];
        }

        // No fallbacks - wait for server sync
        // Actions not yet synced with server
        return null; // Return null to indicate loading state
    }

    /**
     * Get monthly action allowance from server data
     */
    getMonthlyActionAllowance() {
        return this.monthlyActionAllowance || 0;
    }

    /**
     * Get current player's wealth from WebSocket data
     */
    getCurrentPlayerWealth() {
        // V2 Server-authoritative ONLY - no fallbacks
        if (typeof this.serverWealth === 'number') {
            return this.serverWealth;
        }

        // No fallbacks - wait for server sync
        // Wealth not yet synced with server
        return null; // Return null to indicate loading state
    }

    /**
     * Get city attractiveness score for population movement
     */
    getCityAttractiveness() {
        // UI should NOT calculate attractiveness - only return server value
        return this.attractiveness || null;
    }

    /**
     * Get server-authoritative action costs
     */
    getActionCosts() {
        return this.actionCosts;
    }

    /**
     * Get detailed attractiveness breakdown for tooltip
     */
    getAttractivenessBreakdown() {
        // UI should NOT calculate attractiveness - server sends this value
        // Return server-provided attractiveness or null if no data
        if (!this.attractiveness) {
            return {
                score: null,
                coreScore: null,
                qualityScore: null,
                strongest: 'No data available',
                weakest: 'No data available',
                immigrationStatus: 'Building city infrastructure...'
            };
        }

        const attractiveness = this.attractiveness;

        // Find strongest and weakest categories
        const allCategories = {
            'Jobs': this.jeefhh.jobs?.multiplier || 1.0,
            'Housing': this.jeefhh.housing?.multiplier || 1.0,
            'Food': this.jeefhh.food?.multiplier || 1.0,
            'Energy': this.jeefhh.energy?.multiplier || 1.0,
            'Education': this.jeefhh.education?.multiplier || 1.0,
            'Healthcare': this.jeefhh.healthcare?.multiplier || 1.0,
            'Livability': this.carens?.multiplier || 1.0
        };

        const sorted = Object.entries(allCategories).sort(([,a], [,b]) => b - a);
        const strongest = sorted[0];
        const weakest = sorted[sorted.length - 1];

        // Immigration status message
        let immigrationStatus;
        if (attractiveness >= 1.05) {
            immigrationStatus = '✅ Attracting new residents!';
        } else if (attractiveness >= 0.95) {
            immigrationStatus = `⚠️ Need ${(1.05 - attractiveness).toFixed(2)} more points to attract residents`;
        } else {
            immigrationStatus = '❌ Risk of emigration if conditions persist';
        }

        return {
            score: attractiveness,
            coreScore: null, // Client no longer calculates breakdown
            qualityScore: null, // Client no longer calculates breakdown
            strongest: `${strongest[0]} (${strongest[1].toFixed(2)}x)`,
            weakest: `${weakest[0]} (${weakest[1].toFixed(2)}x)`,
            immigrationStatus
        };
    }

    /**
     * Get current LVT rate
     */
    getLVTRate() {
        return this.lvtRate;
    }

    /**
     * SERVER EVENT HANDLING
     */

    /**
     * Handle economic update from server
     */
    handleEconomicUpdate(update) {
        // Processing economic update

        // Handle transaction types within ECONOMIC_UPDATE messages
        if (update.transaction && update.transaction.type) {

            switch (update.transaction.type) {
                case 'BUILD_COMPLETE_AUTO':
                    // Building automatically completed construction
                    // Building construction completed
                    this.triggerUIUpdate('BUILDING_COMPLETED', update.transaction);
                    break;

                // Add other transaction types here as needed
            }
        }

        // Update local state
        if (update.jeefhh) {
            this.jeefhh = update.jeefhh;
        }

        if (update.carens) {
            this.carens = update.carens;
            this.carensMultiplier = update.carens.multiplier;
        }

        if (update.totalResidents !== undefined) {
            this.totalResidents = update.totalResidents;
        }

        // Handle server-authoritative game state updates
        if (update.type === 'GAME_STATE' && update.gameState) {
            this.syncGameState(update.gameState, update.eventType);
            return;
        }

        // Legacy message format support
        if (update.playerBalances) {
            this.playerBalances = update.playerBalances;

            if (this.playerId && this.playerBalances[this.playerId] !== undefined) {
                const newBalance = this.playerBalances[this.playerId];
            }
        }

        // Clear performance cache for affected buildings
        if (update.transaction && update.transaction.location) {
            const [row, col] = update.transaction.location;
            this.invalidateBuildingCache(row, col);
        }

        // Trigger UI updates
        this.triggerUIUpdate('ECONOMIC_UPDATE', update);
    }

    /**
     * Handle daily update from server
     */
    handleDailyUpdate(update) {

        // Process all economic data the same way as handleEconomicUpdate
        if (update.jeefhh) {
            this.jeefhh = update.jeefhh;
        }

        if (update.carens) {
            this.carens = update.carens;
            this.carensMultiplier = update.carens.multiplier;
        }

        if (update.totalResidents !== undefined) {
            this.totalResidents = update.totalResidents;
        }

        // Update buildings from WebSocket data
        if (update.buildings) {
            this.buildings = new Map();
            update.buildings.forEach(building => {
                this.buildings.set(building.locationKey, building);
            });
        }

        // Update player balances from WebSocket data
        if (update.playerBalances) {
            this.playerBalances = update.playerBalances;

            // If current player's balance changed, notify cash manager
            if (this.playerId && this.playerBalances[this.playerId] !== undefined) {
                const newBalance = this.playerBalances[this.playerId];

                // Force cash manager sync if it exists
                // ✅ CLEANED: Direct balance update - no CashManager needed
            }
        }

        if (update.gameTime) {
            this.syncWithServerTime(update.gameTime);
        }

        // Trigger daily UI update
        this.triggerUIUpdate('DAILY_UPDATE', update);
    }

    /**
     * Update local state from server response
     */
    updateLocalState(state) {
        if (state.jeefhh) {
            this.jeefhh = state.jeefhh;
        }

        if (state.carens && state.carens.multiplier) {
            this.carensMultiplier = state.carens.multiplier;
        }

        if (state.totalResidents !== undefined) {
            this.totalResidents = state.totalResidents;
        }

        if (state.gameTime) {
            this.syncWithServerTime(state.gameTime);
        }
    }

    /**
     * UI UPDATE MANAGEMENT
     */

    /**
     * Register callback for UI updates
     */
    onUpdate(callback) {
        this.updateCallbacks.add(callback);
    }

    /**
     * Remove update callback
     */
    offUpdate(callback) {
        this.updateCallbacks.delete(callback);
    }

    /**
     * Trigger UI update
     */
    triggerUIUpdate(type, data = null) {
        this.updateCallbacks.forEach(callback => {
            try {
                callback({
                    type,
                    data,
                    gameTime: this.gameTime,
                    jeefhh: this.jeefhh,
                    carensMultiplier: this.carensMultiplier,
                    totalResidents: this.totalResidents
                });
            } catch (error) {
                console.error('UI update callback failed:', error);
            }
        });
    }

    /**
     * ROBUST STATE SYNCHRONIZATION
     * Handles server-authoritative game state updates
     */
    syncGameState(gameState, eventType) {
        // Syncing game state

        // Update game time
        if (gameState.gameTime !== undefined) {
            this.syncWithServerTime(gameState.gameTime);
        }

        // Update global metrics
        if (gameState.totalResidents !== undefined) {
            this.totalResidents = gameState.totalResidents;
        }
        if (gameState.jeefhh) {
            this.jeefhh = gameState.jeefhh;
        }
        if (gameState.carens) {
            this.carens = gameState.carens;
            // console.log('🏛️ CLIENT RECEIVED CARENS:', this.carens);
        }
        if (gameState.attractiveness !== undefined) {
            this.attractiveness = gameState.attractiveness;
        }
        if (gameState.lvtRate !== undefined) {
            this.lvtRate = gameState.lvtRate;
        }
        // Sync monthly action allowance
        if (gameState.monthlyActionAllowance !== undefined) {
            this.monthlyActionAllowance = gameState.monthlyActionAllowance;
            if (this.game?.updateActionDisplay) {
                this.game.updateActionDisplay();
            }
        }
        if (gameState.actionCosts) {
            this.actionCosts = gameState.actionCosts;
            if (this.game?.updateActionDisplay) {
                this.game.updateActionDisplay();
            }
        }

        if (gameState.governance) {
            this.governance = gameState.governance;
        }

        if (gameState.cashflow && this.playerId && gameState.cashflow[this.playerId]) {
            this.dailyCashflowTotals = gameState.cashflow[this.playerId];
        }

        // Process vitality data for UI
        this.updateVitalityData();

        // Sync buildings (server-authoritative, includes performance data)
        if (gameState.buildings) {
            this.buildings = new Map();

            // Server sends properly serialized array format
            gameState.buildings.forEach(building => {
                this.buildings.set(building.locationKey, building);
            });

            // Sync buildings to game grid for visual rendering
            this.syncBuildingsToGameGrid();
        } else {
        }

        // Sync player data (server-authoritative)
        if (gameState.players) {
            // Debug: Log received player data (only in debug mode)
            if (window.DEBUG_MODE) {
                console.log('🔍 DEBUG: Economic client received player data:', gameState.players);
                Object.entries(gameState.players).forEach(([playerId, player]) => {
                    console.log(`  Player ${playerId}:`, {
                        name: player.name,
                        color: player.color,
                        hasGovernance: !!player.governance
                    });
                });
            }

            // Store complete player data for multiplayer rendering (names, colors, etc.)
            if (!this.gameState) {
                this.gameState = {};
            }
            this.gameState.players = gameState.players;

            // Extract balance/action data for backward compatibility
            this.playerBalances = {};
            this.playerActions = {};
            Object.values(gameState.players).forEach(player => {
                this.playerBalances[player.id] = player.cash;
                this.playerActions[player.id] = player.actions?.total || 0;
            });

            if (this.game?.updateActionDisplay) {
                this.game.updateActionDisplay();
            }
        }

        // Sync action marketplace data
        if (gameState.actionMarketplace && this.game.actionMarketplace?.syncMarketplaceData) {
            this.game.actionMarketplace.syncMarketplaceData(gameState.actionMarketplace);
        }

        // Sync player ID if not set
        if (!this.playerId && window.game?.currentPlayerId) {
            this.playerId = window.game.currentPlayerId;
        }

        // Update current player cash if available
        if (this.playerId && gameState.players[this.playerId]) {
            const playerData = gameState.players[this.playerId];
            const newBalance = playerData.cash;

            // Server-authoritative: Store server balance and wealth
            this.serverBalance = newBalance;
            if (playerData.wealth !== undefined) {
                this.serverWealth = playerData.wealth;
                // Trigger UI update when wealth data is received
                if (window.game && typeof window.game.updatePlayerStats === 'function') {
                    window.game.updatePlayerStats();
                }
            }

            // 🏦 SINGLE AUTHORITY: Economic Client manages all cash display updates
            // This is the ONLY system that should update playerCash display
            const playerCashElement = window.game?.uiManager?.get('playerCash');
            if (playerCashElement) {
                playerCashElement.textContent = `$${Math.round(newBalance).toLocaleString()}`;

                // Check if something overrides our update within 100ms (debug only)
                if (window.DEBUG_MODE) {
                    setTimeout(() => {
                        const currentDisplay = playerCashElement.textContent;
                        if (currentDisplay !== `$${Math.round(newBalance).toLocaleString()}`) {
                            console.debug('💰 Cash display race condition detected');
                        }
                    }, 100);
                }
            }

            // Update city name from server if available
            if (playerData.cityName && window.game && typeof window.game.updateCityNameFromServer === 'function') {
                window.game.updateCityNameFromServer(playerData.cityName);
            } else {
                // Only warn about missing city name during initial game state sync (not governance updates)
                if (!playerData.cityName && eventType === 'GAME_STARTED') {
                    // City name not available from server
                } else if (!window.game || typeof window.game.updateCityNameFromServer !== 'function') {
                    // updateCityNameFromServer function not available
                }
                const cashElement = document.querySelector('.player-cash, #player-cash, [class*="cash"]');
                if (cashElement) {
                    cashElement.textContent = `$${Math.round(newBalance).toLocaleString()}`;
                }
            }
        } else {
            console.warn(`💰 SYNC FAILED: Player ID mismatch or missing data. playerId=${this.playerId}, available players:`, Object.keys(gameState.players || {}));
        }

        // Sync grid/parcel ownership (server-authoritative)
        if (gameState.grid && this.game.grid) {

            // Update the client grid with server-authoritative data
            gameState.grid.forEach((row, rowIndex) => {
                if (this.game.grid[rowIndex]) {
                    row.forEach((serverParcel, colIndex) => {
                        if (this.game.grid[rowIndex][colIndex] && serverParcel) {
                            // Update ownership and other server-controlled properties
                            this.game.grid[rowIndex][colIndex].owner = serverParcel.owner;
                            if (serverParcel.building) {
                                this.game.grid[rowIndex][colIndex].building = serverParcel.building;
                            }
                        }
                    });
                }
            });


            // Trigger grid re-render
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
        }

        // Sync cashflow data (server-authoritative, eliminates HTTP polling)
        if (gameState.cashflow) {
            this.cachedCashflow = gameState.cashflow;
        }

        if (gameState.monthlyBudget) {
            this.monthlyBudget = gameState.monthlyBudget;
        }


        // V2: Trigger UI updates with processed data instead of raw sync
        this.triggerUIUpdate('VITALITY_UPDATE', {
            jeefhh: this.jeefhh,
            carens: this.carens,
            totalResidents: this.totalResidents
        });
    }

    /**
     * Sync building data from Economic Client to game grid for visual rendering
     */
    syncBuildingsToGameGrid() {
        if (!this.game || !this.game.grid) {
            console.warn('⚠️ Game grid not available for building sync');
            return;
        }

        let syncedCount = 0;

        // Clear existing buildings from grid first
        this.game.grid.forEach((row, rowIndex) => {
            row.forEach((parcel, colIndex) => {
                if (parcel.building) {
                    // Clearing old building from grid
                    parcel.building = null;
                }
            });
        });

        // Add current buildings to grid
        this.buildings.forEach((building, locationKey) => {
            if (!building) {
                console.warn('⚠️ Building is null/undefined:', locationKey);
                return;
            }

            // Handle both location array [row, col] and separate row/col properties
            let row, col;
            if (building.location && Array.isArray(building.location)) {
                [row, col] = building.location;
            } else if (building.row !== undefined && building.col !== undefined) {
                row = building.row;
                col = building.col;
            } else {
                console.warn('⚠️ Building missing location data:', locationKey, building);
                return;
            }
            if (this.game.grid[row] && this.game.grid[row][col]) {
                // Adding building to grid

                this.game.grid[row][col].building = {
                    id: building.id,
                    type: building.id,
                    ownerId: building.ownerId,
                    underConstruction: building.underConstruction,
                    age: building.age || 0,
                    decay: building.decay || 0,
                    // Include graphics data from server
                    graphics: building.graphics,
                    graphicsFile: building.graphicsFile,
                    images: building.images
                };

                syncedCount++;
            }
        });
    }

    /**
     * CACHE MANAGEMENT
     */

    /**
     * Invalidate building performance cache for specific location
     */
    invalidateBuildingCache(row, col) {
        const cacheKey = `${row},${col}`;
        this.buildingPerformanceCache.delete(cacheKey);

        // Also invalidate adjacent buildings (their needs might have changed)
        const adjacentOffsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],            [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        adjacentOffsets.forEach(([dr, dc]) => {
            const adjKey = `${row + dr},${col + dc}`;
            this.buildingPerformanceCache.delete(adjKey);
        });
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.buildingPerformanceCache.clear();
    }

    /**
     * UTILITY METHODS
     */

    /**
     * Get formatted game time for display
     */
    getFormattedGameTime() {
        const days = Math.floor(this.gameTime);
        const hours = Math.floor((this.gameTime % 1) * 24);
        const minutes = Math.floor(((this.gameTime % 1) * 24 % 1) * 60);

        return `Day ${days}, ${hours}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Get JEEFHH status for UI displays
     */
    getJEEFHHStatus() {
        const status = {};

        Object.keys(this.jeefhh).forEach(resource => {
            const res = this.jeefhh[resource];
            status[resource] = {
                supply: res.supply,
                demand: res.demand,
                balance: res.supply - res.demand,
                multiplier: res.multiplier,
                status: res.supply >= res.demand ? 'surplus' : 'deficit'
            };
        });

        return status;
    }

    /**
     * Initialize economic client (fetch initial state)
     */
    async initialize() {

        try {
            await this.getEconomicState();
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize economic client:', error);
            return false;
        }
    }

    /**
     * WEBSOCKET REAL-TIME COMMUNICATION
     */

    /**
     * Initialize connection via ConnectionManager
     */
    initializeConnection() {
        this.connectionManager = window.connectionManager;

        if (!this.connectionManager) {
            setTimeout(() => this.initializeConnection(), 1000);
            return;
        }

        this.setupGameSubscriptions();
    }

    /**
     * Set up message subscriptions for game functionality
     */
    setupGameSubscriptions() {
        // Subscribe to economic messages
        this.connectionManager.subscribe('GAME_STATE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('GOVERNANCE_UPDATE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('COMMONWEALTH_UPDATE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('TRANSACTION_RESPONSE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('BUILDING_UPDATE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('ECONOMIC_UPDATE', (message) => {
            this.handleWebSocketUpdate(message);
        });

        this.connectionManager.subscribe('TIME_SYNC', (message) => {
            this.handleWebSocketUpdate(message);
        });

        // Subscribe to building state updates for rendering
        this.connectionManager.subscribe('BUILDING_STATES', (message) => {
            this.handleWebSocketUpdate(message);
        });

        // Handle special GAME_STARTED event for city names and roomId
        this.connectionManager.subscribe('GAME_STATE', (message) => {
            if (message.eventType === 'GAME_STARTED' && message.eventData?.players) {
                // Extract roomId from eventData (server sends it there)
                if (message.eventData.roomId) {
                    this.roomId = message.eventData.roomId;
                    console.log(`[EconomicClient] RoomId set from GAME_STARTED: ${this.roomId}`);
                }

                const players = message.eventData.players;
                const currentPlayer = players.find(p => p.id === this.game?.playerId);

                if (currentPlayer && currentPlayer.cityName) {
                    localStorage.setItem('playerCityName', currentPlayer.cityName);
                    if (this.game && this.game.updateCityNameFromServer) {
                        this.game.updateCityNameFromServer(currentPlayer.cityName);
                    }
                } else {
                    console.warn('⚠️ City name not found in GAME_STARTED message');
                }

                // Reset auction system for fresh game (board game pulled from shelf)
                if (this.game && this.game.parcelAuctionSystem) {
                    this.game.parcelAuctionSystem.resetForNewGame();
                }
            }
        });

        // Connection status tracking
        this.connectionManager.on('connected', () => {
            this.requestGameStateSync();
        });

        this.connectionManager.on('disconnected', () => {
            this.stopDisplayTimer();
        });
    }



    /**
     * Handle real-time WebSocket updates from server
     */
    handleWebSocketUpdate(update) {
        switch (update.type) {
            case 'CONNECTED':
                if (update.playerId) {
                    this.playerId = update.playerId;

                    // Notify game that player ID is ready
                    if (this.onPlayerIdReady) {
                        this.onPlayerIdReady(this.playerId);
                    }
                }

                if (update.roomState) {
                    if (update.roomState.buildings && update.roomState.buildings.length > 0) {
                        this.buildings = new Map();
                        update.roomState.buildings.forEach(building => {
                            this.buildings.set(building.locationKey, building);
                        });

                        this.triggerUIUpdate('ROOM_STATE_SYNC', update.roomState);
                    }

                    // Update game time
                    if (update.roomState.gameTime) {
                        this.syncWithServerTime(update.roomState.gameTime);
                    }
                }
                break;

            case 'PLAYER_IDENTIFIED':
                if (update.playerId && this.game.currentPlayerId === update.playerId) {
                    this.playerId = update.playerId;
                }
                break;

            case 'ECONOMIC_UPDATE':
                this.handleEconomicUpdate(update);
                break;

            case 'DAILY_UPDATE':
                this.handleDailyUpdate(update);
                break;

            case 'LEADERBOARD_UPDATE':
                this.handleLeaderboardUpdate(update);
                break;

            case 'COMMONWEALTH_UPDATE':
                this.handleCommonwealthUpdate(update);
                break;

            case 'ROOM_STATE_SYNC':
                // Room state sync response (from REQUEST_ROOM_STATE)
                // Room state sync response received
                if (update.roomState) {
                    // Store roomId from server
                    if (update.roomState.roomId) {
                        this.roomId = update.roomState.roomId;
                        console.log(`[EconomicClient] RoomId set from ROOM_STATE_SYNC: ${this.roomId}`);
                    }

                    // Syncing buildings from server

                    // V2: Extract and update city name for current player
                    if (update.roomState.players && this.playerId) {
                        const currentPlayer = update.roomState.players.find(p => p.id === this.playerId);
                        if (currentPlayer && currentPlayer.cityName && window.game && typeof window.game.updateCityNameFromServer === 'function') {
                            // Updating city name from room state
                            window.game.updateCityNameFromServer(currentPlayer.cityName);
                        }
                    }

                    this.triggerUIUpdate('ROOM_STATE_SYNC', update.roomState);

                    // Update game time
                    if (update.roomState.gameTime) {
                        this.syncWithServerTime(update.roomState.gameTime);
                    }
                }
                break;


            case 'BUILD_COMPLETE_AUTO':
                // Building automatically completed construction
                // Building construction completed
                this.triggerUIUpdate('BUILDING_COMPLETED', update);
                break;

            case 'ROOM_RESET':
                // Room has been reset - clear local state and resync
                // Room reset - clearing local state
                this.clearAllCaches();
                this.triggerUIUpdate('ROOM_RESET', update);

                // Request fresh room state after reset
                setTimeout(() => {
                    this.triggerUIUpdate('REQUEST_ROOM_SYNC');
                }, 500);
                break;

            case 'READY_CHECK_STARTED':
                // Beer hall table ready-check modal
                // Table ready check started
                this.triggerUIUpdate('READY_CHECK_STARTED', update);
                break;

            case 'GAME_STATE':
                // 🔧 FIX: Handle GAME_STATE messages received from shared Beer Hall WebSocket
                // Game state received - syncing with server

                // Special handling for GAME_STARTED events with city names
                if (update.eventType === 'GAME_STARTED' && update.eventData?.players) {
                    // Game started - extracting city names
                    const players = update.eventData.players;
                    const currentPlayer = players.find(p => p.id === this.playerId);

                    if (currentPlayer && currentPlayer.cityName) {
                        // Store city name for UI display
                        localStorage.setItem('playerCityName', currentPlayer.cityName);
                        // Update UI immediately if game exists
                        if (window.game && window.game.updateCityNameFromServer) {
                            window.game.updateCityNameFromServer(currentPlayer.cityName);
                        }
                    } else {
                        console.warn('⚠️ City name not found in GAME_STARTED message');
                    }
                }

                if (update.gameState) {
                    this.syncGameState(update.gameState, update.eventType);
                } else {
                    console.warn('⚠️ No gameState in update, skipping sync');
                }
                break;

            case 'SERVER_STATE_SYNC':
                // Handle server state synchronization
                // Server state sync received
                if (update.jeefhh) {
                    this.jeefhh = update.jeefhh;
                    // JEEFHH data updated
                }
                if (update.carens) {
                    this.carens = update.carens;
                    // CARENS data updated
                }
                if (update.totalResidents !== undefined) {
                    this.totalResidents = update.totalResidents;
                }

                // Process vitality data for UI
                this.updateVitalityData();

                // Trigger UI update
                this.triggerUIUpdate('VITALITY_UPDATE', {
                    jeefhh: this.jeefhh,
                    carens: this.carens,
                    totalResidents: this.totalResidents
                });
                break;

            case 'MONTHLY_UPDATE':
                // Monthly update received
                break;

            case 'GOVERNANCE_UPDATE':
                // Handle governance transaction results
                // Governance update received
                if (update.gameState) {
                    // Syncing game state after governance update
                    this.syncGameState(update.gameState, 'GOVERNANCE_UPDATE');
                }
                if (update.transaction && this.game.governanceSystem) {
                    // Updating governance UI after transaction
                    // Refresh governance modal to show updated state
                    this.game.governanceSystem.updateGovernanceModal();
                }
                break;

            case 'GOVERNANCE_ERROR':
                // Handle governance transaction errors
                // Governance error received
                if (update.error) {
                    console.error('❌ Governance transaction failed:', update.error);
                } else {
                    console.error('❌ Unknown governance error occurred');
                }
                // Could show user feedback here if needed
                break;

            case 'chat_message':
                // Handle incoming chat messages from other players
                // Chat message received
                if (update.playerId !== this.playerId) { // Don't echo back own messages
                    // Add message to in-game chat
                    if (window.addChatMessage) {
                        window.addChatMessage(update.playerName, update.message, update.playerColor, false);
                    }
                }
                break;

            case 'TRANSACTION_RESPONSE':
                // Handle transaction response from server
                if (update.transactionId && this.transactionCallbacks.has(update.transactionId)) {
                    const callback = this.transactionCallbacks.get(update.transactionId);
                    callback(update.result);
                    this.transactionCallbacks.delete(update.transactionId);
                } else if (window.DEBUG_MODE) {
                    // Some transactions don't use callbacks (fire-and-forget style)
                    console.debug(`💼 Transaction response received: ${update.transactionId || 'no-id'}`);
                }
                break;

            case 'PONG':
                // Heartbeat response - connection is healthy
                this.lastPongTime = Date.now();
                break;

            case 'BUILDING_STATES':
                // Building rendering states from server
                // console.log(`📡 Received ${update.buildings?.length || 0} building states from server`);
                this.updateBuildingStates(update.buildings);
                break;

            default:
                console.warn('⚠️ Unknown update type:', update.type);
        }
    }

    /**
     * V2 VITALITY DATA PROCESSING
     */

    /**
     * Process vitality data when received from server
     */
    updateVitalityData() {
        if (this.jeefhh) {
            // Convert server JEEFHH data to UI format
            this.vitalitySupply = {
                JOBS: this.jeefhh.jobs?.supply || 0,
                ENERGY: this.jeefhh.energy?.supply || 0,
                EDUCATION: this.jeefhh.education?.supply || 0,
                FOOD: this.jeefhh.food?.supply || 0,
                HOUSING: this.jeefhh.housing?.supply || 0,
                HEALTHCARE: this.jeefhh.healthcare?.supply || 0
            };

            this.vitalityDemand = {
                JOBS: this.jeefhh.jobs?.demand || 0,
                ENERGY: this.jeefhh.energy?.demand || 0,
                EDUCATION: this.jeefhh.education?.demand || 0,
                FOOD: this.jeefhh.food?.demand || 0,
                HOUSING: this.jeefhh.housing?.demand || 0,
                HEALTHCARE: this.jeefhh.healthcare?.demand || 0
            };

            // Vitality data processed from server
        }
    }

    /**
     * Get processed vitality data for UI display
     */
    getVitalityDisplayData() {
        return {
            supply: this.vitalitySupply,
            demand: this.vitalityDemand,
            carens: this.carens,
            jeefhh: this.jeefhh
        };
    }

    /**
     * Get vitality metrics with calculated ratios for UI bars
     */
    getVitalityMetrics() {
        const metrics = {};
        const domains = ['JOBS', 'ENERGY', 'EDUCATION', 'FOOD', 'HOUSING', 'HEALTHCARE'];

        domains.forEach(domain => {
            const supply = this.vitalitySupply[domain] || 0;
            const demand = this.vitalityDemand[domain] || 0;

            // Calculate ratio: -100 to +100 scale
            let ratio = 0;
            if (demand > 0) {
                ratio = ((supply - demand) / demand) * 100;
            } else if (supply > 0) {
                ratio = 100; // Infinite supply, no demand
            }

            // Clamp to -100 to +100 range
            ratio = Math.max(-100, Math.min(100, ratio));

            metrics[domain] = {
                supply,
                demand,
                balance: supply - demand,
                ratio,
                multiplier: this.jeefhh[domain.toLowerCase()]?.multiplier || 1.0
            };
        });

        return metrics;
    }

    /**
     * Get CARENS metrics for UI display
     */
    getCarensMetrics() {
        // Getting CARENS metrics
        const carensMetrics = ['SAFETY', 'CULTURE', 'AFFORDABILITY', 'RESILIENCE', 'ENVIRONMENT', 'NOISE'];
        const metrics = {};

        carensMetrics.forEach(domain => {
            const domainKey = domain.toLowerCase();
            let points, score;

            // Direct scoring: CARENS values are already raw points
            score = this.carens[domainKey] || 0;
            points = Math.round(score);

            metrics[domain] = {
                score: score,
                points: points,
                percentage: Math.max(0, Math.min(100, score)), // Raw points clamped to 0-100%
                status: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'good' : score >= 20 ? 'fair' : score >= -20 ? 'neutral' : 'poor'
            };
        });

        // CARENS metrics calculated
        return metrics;
    }

    /**
     * Update player information (name/color) and broadcast to other players
     */
    updatePlayerInfo() {
        if (!this.connectionManager || !this.connectionManager.isConnected) {
            console.warn('⚠️ Cannot update player info - ConnectionManager not ready');
            return;
        }

        const playerName = window.beerHallLobby?.playerName || null;
        const playerColor = window.beerHallLobby?.selectedColor || null;

        // Broadcasting updated player info

        this.connectionManager.send({
            type: 'PLAYER_INFO_UPDATE',
            playerId: this.playerId,
            playerName: playerName,
            playerColor: playerColor,
            timestamp: Date.now()
        });
    }

    /**
     * Handle leaderboard update from server
     */
    handleLeaderboardUpdate(update) {
        if (window.uiManager) {
            // Update leaderboard modal if open
            window.uiManager.updateLeaderboard(update.scores, this.playerId);

            // Update Commonwealth Score in top bar
            if (update.currentPlayer) {
                window.uiManager.updateCommonwealthScore(
                    update.currentPlayer.score,
                    update.currentPlayer.rank
                );
            }
        }
    }

    /**
     * Handle real-time Commonwealth Score updates
     */
    handleCommonwealthUpdate(update) {
        if (window.uiManager && update.scores) {
            // Find current player's score from scores array
            const currentPlayerScore = update.scores.find(s => s.playerId === this.playerId);

            // Update top bar display
            if (currentPlayerScore) {
                window.uiManager.updateCommonwealthScore(
                    currentPlayerScore.score,
                    currentPlayerScore.rank
                );
            }

            // Always update leaderboard data (whether modal is open or not)
            // This ensures the leaderboard has data when it's opened
            window.uiManager.updateLeaderboard(update.scores, this.playerId);
        }
    }

    // ===============================================
    // 🚀 SIMPLIFIED CONNECTION HANDLING
    // ===============================================

    /**
     * Send message via ConnectionManager
     */
    sendMessage(message) {
        if (this.connectionManager?.isConnected) {
            this.connectionManager.send(message);
            return true;
        }
        return false;
    }

    /**
     * Request game state sync via ConnectionManager
     */

    requestGameStateSync() {
        const syncRequest = {
            type: 'REQUEST_GAME_STATE_SYNC',
            playerId: this.game?.currentPlayerId,
            timestamp: Date.now()
        };

        this.sendMessage(syncRequest);
    }

    /**
     * Handle page visibility changes
     */
    setupPageVisibilityHandling() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.requestGameStateSync();
            }
        });

        window.addEventListener('beforeunload', () => {
            if (this.connectionManager?.isConnected) {
                this.connectionManager.send({
                    type: 'GRACEFUL_DISCONNECT',
                    playerId: this.game?.currentPlayerId,
                    reason: 'page_unload'
                });
            }
        });
    }

    /**
     * Get building repair cost from server
     */
    async getBuildingRepairCost(row, col) {
        try {
            const response = await fetch(`${this.baseUrl}/api/building-repair-cost`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    row,
                    col
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.repairCost || 0;
        } catch (error) {
            console.warn('Failed to get building repair cost from server:', error);
            return 0;
        }
    }

    /**
     * Get building value from server
     */
    async getBuildingValue(row, col) {
        try {
            const response = await fetch(`${this.baseUrl}/api/building-value`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    row,
                    col
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.value || 0;
        } catch (error) {
            console.warn('Failed to get building value from server:', error);
            return 0;
        }
    }

    /**
     * Get city population from server
     */
    getCityPopulation() {
        // Use cached data if available
        if (this.totalResidents !== undefined) {
            return this.totalResidents;
        }

        // Fallback: try to fetch from server
        this.fetchCityPopulation();
        return 0;
    }

    /**
     * Fetch city population from server
     */
    async fetchCityPopulation() {
        try {
            const response = await fetch(`${this.baseUrl}/api/city-population`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.totalResidents = data.population || 0;
            return this.totalResidents;
        } catch (error) {
            console.warn('Failed to get city population from server:', error);
            return 0;
        }
    }

    /**
     * Update building states from server broadcasts
     */
    updateBuildingStates(buildingStates) {
        if (!buildingStates || !Array.isArray(buildingStates)) {
            return;
        }

        // Initialize building states cache if not exists
        if (!this.buildingStates) {
            this.buildingStates = new Map();
        }

        // Initialize buildings Map for tooltip data if not exists
        if (!this.buildings) {
            this.buildings = new Map();
        }

        // Update each building state
        buildingStates.forEach(state => {
            const key = `${state.row},${state.col}`;

            // Store in buildingStates for rendering system
            this.buildingStates.set(key, {
                ...state,
                lastUpdated: Date.now()
            });

            // ALSO store in buildings Map for tooltip system
            // This is the critical missing link!
            const buildingData = {
                id: state.buildingId,
                owner: state.owner,
                row: state.row,
                col: state.col,
                condition: state.condition,
                isUnderConstruction: state.isUnderConstruction,
                constructionProgress: state.constructionProgress,

                // Tooltip data
                efficiency: state.efficiency || 0,
                netIncome: state.netIncome || 0,
                revenue: state.revenue || 0,
                maintenance: state.maintenance || 0,
                performance: state.performanceDetails || null,

                // Additional rendering data
                repairCost: state.repairCost,
                currentValue: state.currentValue,
                lastUpdated: Date.now()
            };

            this.buildings.set(key, buildingData);

            // DEBUG: Log received data for first few buildings
            console.log(`📥 CLIENT received [${key}] ${state.buildingId}:`, {
                efficiency: state.efficiency,
                netIncome: state.netIncome,
                revenue: state.revenue,
                maintenance: state.maintenance,
                hasPerformanceDetails: !!state.performanceDetails,
                hasResourceSatisfaction: !!state.performanceDetails?.resourceSatisfaction,
                resourceSatisfaction: state.performanceDetails?.resourceSatisfaction
            });
        });

        // Sync buildings to game grid for context menu and tooltips
        if (this.game?.grid) {
            this.syncBuildingsToGameGrid();
        }

        // Trigger rendering update if game exists
        if (this.game?.scheduleRender) {
            this.game.scheduleRender();
        }

        if (window.DEBUG_MODE) {
            console.log('🏗️ Building states updated:', buildingStates.length, 'buildings');
            console.log('📊 Sample building data:', this.buildings.get(Array.from(this.buildings.keys())[0]));
        }
    }

    /**
     * Get building state for rendering at specific coordinates
     */
    getBuildingState(row, col) {
        if (!this.buildingStates) {
            return null;
        }

        const key = `${row},${col}`;
        return this.buildingStates.get(key) || null;
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicClient;
} else {
    window.EconomicClient = EconomicClient;
}