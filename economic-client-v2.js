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

        // Connection resilience state
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimeout = null;
        this.baseReconnectDelay = 1000; // 1 second base delay
        this.maxReconnectDelay = 30000; // 30 seconds max delay
        this.isConnected = false;
        this.connectionId = this.generateConnectionId();
        this.messageQueue = [];
        this.lastHeartbeat = Date.now();
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 30000; // 30 seconds
        this.connectionLost = false;

        // ROOT CAUSE FIX: Prevent browser from killing WebSocket
        this.setupPageVisibilityHandling();

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

        // V2: Processed vitality data for UI (computed from jeefhh)
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

        // V2: Player ID ready callback
        this.onPlayerIdReady = null;

        // Client game time tracking (sync'd with server)
        this.GAME_DAY_MS = 3600000 / 365; // Same as server
        this.clientGameStartTime = Date.now();


        // Client clock will be started when game begins (not during lobby/chat)
        this.clockStarted = false;

        // Initialize WebSocket connection for real-time updates (if enabled)
        if (autoConnectWebSocket) {
            this.initializeWebSocket();
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

        // V2: Server-authoritative time only - removed client-side timer
        // Client displays time only when received from server
    }

    /**
     * Update client game time (for UI display)
     */
    updateClientGameTime() {
        const now = Date.now();
        const elapsedMs = now - this.clientGameStartTime;
        this.gameTime = elapsedMs / this.GAME_DAY_MS;

        // Trigger daily UI updates
        const currentDay = Math.floor(this.gameTime);
        if (currentDay > Math.floor(this.gameTime - 1)) {
            this.triggerUIUpdate('DAILY_TICK');
        }
    }

    /**
     * Sync client clock with server time
     */
    syncWithServerTime(serverGameTime) {
        const now = Date.now();
        this.serverGameTime = serverGameTime;

        // Adjust client start time to match server
        const serverElapsedMs = serverGameTime * this.GAME_DAY_MS;
        this.clientGameStartTime = now - serverElapsedMs;
        this.gameTime = serverGameTime;


        // Update game's date display with server-authoritative time
        if (window.game && typeof window.game.updateGameDate === 'function') {
            window.game.currentDay = Math.floor(this.gameTime);
            window.game.updateGameDate();
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
            // Check Beer Hall WebSocket instead
            const beerHallWS = (typeof window.beerHallLobby !== 'undefined' && window.beerHallLobby && window.beerHallLobby.ws) ? window.beerHallLobby.ws : null;

            if (!beerHallWS || beerHallWS.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }

            // Add transaction ID for tracking
            transaction.id = `${transaction.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Send via Beer Hall WebSocket
            beerHallWS.send(JSON.stringify({
                type: 'ECONOMIC_TRANSACTION',
                transaction: transaction
            }));

            // Wait for response via WebSocket
            return await this.waitForTransactionResponse(transaction.id);

        } catch (error) {
            console.error('❌ Economic transaction failed:', error);
            throw error;
        }
    }

    async waitForTransactionResponse(transactionId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.transactionCallbacks.delete(transactionId);
                reject(new Error('Transaction timeout'));
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

                resolve(result);
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

        // Only warn if we have no WebSocket connection at all
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ No cashflow data available - WebSocket not connected`);
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

        // Only warn if WebSocket is connected but data still not available (actual error)
        // During initialization, it's normal for data to not be available yet
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.gameState) {
            console.warn(`⚠️ Player data not found in game state`);
        }
        return null;
    }

    /**
     * V2: Submit governance transaction to server
     */
    async submitGovernanceTransaction(type, data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('Cannot submit governance transaction - WebSocket not connected');
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
            this.ws.send(JSON.stringify(transaction));
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
        return 0; // Show 0 instead of misleading 6000
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
        return 0; // Show 0 instead of misleading 20
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
        return 0; // Show 0 instead of misleading amount
    }

    /**
     * Get city attractiveness score for population movement
     */
    getCityAttractiveness() {
        // UI should NOT calculate attractiveness - only return server value
        return this.attractiveness || null;
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
            return; // New architecture - ignore legacy update fields
        }

        // Legacy support for old message format (will be removed)
        if (update.playerBalances) {
            this.playerBalances = update.playerBalances;

            // If current player's balance changed, notify cash manager
            if (this.playerId && this.playerBalances[this.playerId] !== undefined) {
                const newBalance = this.playerBalances[this.playerId];
                // Balance updated via WebSocket

                // Force cash manager sync if it exists
                // ✅ CLEANED: Direct balance update - no CashManager needed
            }
        }

        if (update.gameTime) {
            this.syncWithServerTime(update.gameTime);
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
        }
        if (gameState.attractiveness !== undefined) {
            this.attractiveness = gameState.attractiveness;
        }
        if (gameState.lvtRate !== undefined) {
            this.lvtRate = gameState.lvtRate;
        }

        // Sync governance data (treasury, tax rate)
        if (gameState.governance) {
            this.governance = gameState.governance;
            // Treasury synced
        }

        // Sync cashflow data for current player
        if (gameState.cashflow && this.playerId && gameState.cashflow[this.playerId]) {
            this.dailyCashflowTotals = gameState.cashflow[this.playerId];
            // Cashflow synced
        }

        // V2: Process vitality data for UI
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

            // Legacy support: extract specific data into separate properties
            this.playerBalances = {};
            this.playerActions = {};
            Object.values(gameState.players).forEach(player => {
                this.playerBalances[player.id] = player.cash;
                this.playerActions[player.id] = player.actions?.total || 0;
            });

            // Balance and action sync logging (reduced frequency)
            // Player data synced
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

            // Update UI directly with server balance (no client state mutations)
            const playerCashElement = window.game?.uiManager?.get('playerCash');
            if (playerCashElement) {
                playerCashElement.textContent = `$${Math.round(newBalance).toLocaleString()}`;

                // Check if something overrides our update within 100ms
                setTimeout(() => {
                    const currentDisplay = playerCashElement.textContent;
                    if (currentDisplay !== `$${Math.round(newBalance).toLocaleString()}`) {
                        console.warn('⚠️ Cash display was overridden');
                    }
                }, 100);
            }

            // V2: Update city name from server if available
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

        // Sync monthly budget data for category funding display
        if (gameState.monthlyBudget) {
            this.monthlyBudget = gameState.monthlyBudget;
            // Monthly budget data synced: revenue: ${this.monthlyBudget.totalRevenue || 0}
        }

        // Skip individual player governance sync - handled via individual transactions
        // This prevents the client governance system from being overwritten by legacy server data
        if (gameState.governance && this.game.governanceSystem && false) {
            this.game.governanceSystem.governance = gameState.governance;
            this.game.governanceSystem.updateGovernanceModal();
            // Governance data synced
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
            const [row, col] = building.location;
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

                // Building graphics loaded
                syncedCount++;
            } else {
                console.warn(`⚠️ Invalid building location`);
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
     * Initialize WebSocket connection for real-time multiplayer updates
     */
    initializeWebSocket() {
        // Economic Client now purely relies on Beer Hall for WebSocket connection
        // No independent connection - Beer Hall handles all WebSocket management
        console.log('🔌 Economic Client connecting via Beer Hall WebSocket forwarding');

        // Set connection status based on Beer Hall WebSocket
        if (typeof window.beerHallLobby !== 'undefined' && window.beerHallLobby && window.beerHallLobby.ws && window.beerHallLobby.ws.readyState === WebSocket.OPEN) {
            this.isConnected = true;
            this.connectionLost = false;
            console.log('✅ Economic Client connected via Beer Hall WebSocket');
        } else {
            this.isConnected = false;
            console.log('⚠️ Beer Hall WebSocket not available - waiting for connection...');
        }
    }

    setupWebSocketHandlers() {
        // Store original onmessage handler from Beer Hall if it exists
        const originalOnMessage = this.ws.onmessage;

        // Set up our message handler that chains with the original
        this.ws.onmessage = (event) => {
            try {
                const update = JSON.parse(event.data);

                // Handle our economic updates
                try {
                    this.handleWebSocketUpdate(update);
                } catch (error) {
                    console.error('🔌 Error in handleWebSocketUpdate:', error);
                }

                // Also call original Beer Hall handler if it exists
                if (originalOnMessage && typeof originalOnMessage === 'function') {
                    originalOnMessage.call(this.ws, event);
                }
            } catch (error) {
                console.error('🔌 Failed to parse WebSocket message:', error);
            }
        };

        // Only set onopen for new connections (not reused ones)
        if (!this.ws.onopen || this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.onopen = () => {
                console.log('✅ Economic Client WebSocket connected successfully');

                // Handle successful connection/reconnection
                this.handleReconnection();

                // 🔧 FIX: Send existing player ID with name/color to prevent multiple player creation
                if (this.game && this.game.currentPlayerId) {
                    // Get player name and color from Beer Hall Lobby
                    const playerName = window.beerHallLobby?.playerName || null;
                    const playerColor = window.beerHallLobby?.selectedColor || null;

                    // Small delay to ensure WebSocket is fully ready
                    setTimeout(() => {
                        this.sendMessage({
                            type: 'IDENTIFY_PLAYER',
                            playerId: this.game.currentPlayerId,
                            playerName: playerName,
                            playerColor: playerColor,
                            connectionId: this.connectionId
                        });
                    }, 10); // 10ms delay
                }
            };
        } else {
            // WebSocket already open, send identify message immediately
            // WebSocket already connected
            this.handleReconnection();

            if (this.game && this.game.currentPlayerId) {
                // Get player name and color from Beer Hall Lobby
                const playerName = window.beerHallLobby?.playerName || null;
                const playerColor = window.beerHallLobby?.selectedColor || null;

                this.sendMessage({
                    type: 'IDENTIFY_PLAYER',
                    playerId: this.game.currentPlayerId,
                    playerName: playerName,
                    playerColor: playerColor,
                    connectionId: this.connectionId
                });
            }
        }

        // Set onclose and onerror handlers (for both new and reused connections)
        this.ws.onclose = (event) => {
            console.warn(`⚠️ WebSocket disconnected - Code: ${event.code}, Reason: ${event.reason}`);
            this.handleDisconnection();
        };

        this.ws.onerror = (error) => {
            console.error('🔌 WebSocket error:', error);
        };
    }

    /**
     * Handle real-time WebSocket updates from server
     */
    handleWebSocketUpdate(update) {
        // Processing WebSocket update

        switch (update.type) {
            case 'CONNECTED':
                // WebSocket connected

                // V2: Store server-assigned player ID
                if (update.playerId) {
                    this.playerId = update.playerId;
                    // Server assigned player ID

                    // Notify game that player ID is ready
                    if (this.onPlayerIdReady) {
                        this.onPlayerIdReady(this.playerId);
                    }
                }

                // Handle room state sync
                if (update.roomState) {
                    if (window.DEBUG_MODE) {
                        // Joined multiplayer room
                    }

                    // Sync existing buildings from room
                    if (update.roomState.buildings && update.roomState.buildings.length > 0) {
                        // Syncing existing buildings

                        // Store buildings in local data
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
                // 🔧 FIX: Confirmation that server accepted our existing player ID
                // Server confirmed player ID
                if (update.playerId && this.game.currentPlayerId === update.playerId) {
                    this.playerId = update.playerId;
                    // Economic client using correct player ID
                } else {
                    console.warn('⚠️ Player ID mismatch detected');
                }
                break;

            case 'ECONOMIC_UPDATE':
                // Real-time economic state update
                this.handleEconomicUpdate(update);
                break;

            case 'DAILY_UPDATE':
                // Daily game progression update
                this.handleDailyUpdate(update);
                break;

            case 'LEADERBOARD_UPDATE':
                // Commonwealth Score leaderboard update
                this.handleLeaderboardUpdate(update);
                break;

            case 'COMMONWEALTH_UPDATE':
                // Real-time Commonwealth Score updates
                this.handleCommonwealthUpdate(update);
                break;

            case 'ROOM_STATE_SYNC':
                // Room state sync response (from REQUEST_ROOM_STATE)
                // Room state sync response received
                if (update.roomState) {
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

                // V2: Process vitality data for UI
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
                // Update governance points in local game state
                // DISABLED: Legacy local governance point update - V2 uses server-authoritative governance
                if (this.game && this.game.governanceSystem && false) {
                    this.game.governanceSystem.governance.votingPoints += 2;
                    // Governance points updated
                    // Update the governance modal if it's open
                    // DISABLED: Legacy governance modal update - V2 facade handles this via WebSocket sync
                    // this.game.governanceSystem.updateGovernanceModal();
                    // Animate governance button with gold fade animation
                    this.game.governanceSystem.animateGovernanceButtonGold();
                }
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
                } else {
                    console.warn('⚠️ Received transaction response with no matching callback');
                }
                break;

            case 'PONG':
                // Heartbeat response - connection is healthy
                this.lastPongTime = Date.now();
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
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ Cannot update player info - WebSocket not ready');
            return;
        }

        const playerName = window.beerHallLobby?.playerName || null;
        const playerColor = window.beerHallLobby?.selectedColor || null;

        // Broadcasting updated player info

        this.ws.send(JSON.stringify({
            type: 'PLAYER_INFO_UPDATE',
            playerId: this.playerId,
            playerName: playerName,
            playerColor: playerColor,
            timestamp: Date.now()
        }));
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
            // Find current player's score
            const currentPlayerScore = update.scores.find(s => s.playerId === this.playerId);

            // Update top bar display
            if (currentPlayerScore) {
                window.uiManager.updateCommonwealthScore(
                    currentPlayerScore.score,
                    currentPlayerScore.rank
                );
            }

            // If leaderboard modal is open, update it too
            const modal = document.getElementById('leaderboard-modal');
            if (modal && modal.style.display === 'block') {
                window.uiManager.updateLeaderboard(update.scores, this.playerId);
            }
        }
    }

    // ===============================================
    // 🚀 UNBREAKABLE CONNECTION RESILIENCE SYSTEM
    // ===============================================

    /**
     * Generate unique connection ID for tracking
     */
    generateConnectionId() {
        return 'conn_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    /**
     * Handle disconnection - Beer Hall now manages reconnection
     */
    handleDisconnection() {
        console.log('⚠️ Economic Client detected disconnection - Beer Hall will handle reconnection');

        // Just update status - Beer Hall handles the actual reconnection
        this.isConnected = false;
        this.connectionLost = true;
        this.stopHeartbeat();

        // Connection lost - handled silently
    }

    /**
     * Attempt to reconnect to WebSocket
     */
    attemptReconnection() {
        console.log(`🔌 Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        try {
            // Generate new connection ID for this attempt
            this.connectionId = this.generateConnectionId();

            // Initialize new WebSocket connection
            this.initializeWebSocket();

        } catch (error) {
            console.error('🔥 Reconnection failed:', error);
            this.handleDisconnection(); // Try again
        }
    }

    /**
     * Handle Beer Hall reconnection
     */
    handleBeerHallReconnection() {
        console.log('🎉 Economic Client notified of Beer Hall reconnection!');
        this.isConnected = true;
        this.connectionLost = false;

        // Request fresh game state
        this.requestGameStateSync();

        // Start heartbeat
        this.startHeartbeat();
    }

    /**
     * Handle successful reconnection
     */
    handleReconnection() {
        console.log('🎉 WebSocket reconnected successfully!');
        this.isConnected = true;
        this.connectionLost = false;
        this.reconnectAttempts = 0; // Reset counter

        // Clear any reconnection timeout
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Start heartbeat
        this.startHeartbeat();

        // Process queued messages
        this.processMessageQueue();

        // Request fresh game state
        this.requestGameStateSync();

        // Reconnection successful - handled silently
    }

    /**
     * Start heartbeat to monitor connection health
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendHeartbeat();
            } else {
                console.warn('💓 Heartbeat failed - connection lost');
                this.handleDisconnection();
            }
        }, this.heartbeatFrequency);
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Send heartbeat ping to server
     */
    sendHeartbeat() {
        const ping = {
            type: 'PING',
            connectionId: this.connectionId,
            timestamp: Date.now()
        };

        this.sendMessage(ping, false); // Don't queue heartbeats
        this.lastHeartbeat = Date.now();
    }

    /**
     * Enhanced message sending with queuing
     */
    sendMessage(message, queueIfOffline = true) {
        // Send via Beer Hall WebSocket
        const beerHallWS = (typeof window.beerHallLobby !== 'undefined' && window.beerHallLobby && window.beerHallLobby.ws) ? window.beerHallLobby.ws : null;

        if (beerHallWS && beerHallWS.readyState === WebSocket.OPEN) {
            try {
                beerHallWS.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('💥 Failed to send message via Beer Hall:', error);
                if (queueIfOffline) {
                    this.queueMessage(message);
                }
                return false;
            }
        } else {
            console.warn('⚠️ Beer Hall WebSocket not available for sending');
            if (queueIfOffline) {
                this.queueMessage(message);
            }
            return false;
        }
    }

    /**
     * Queue message for sending when reconnected
     */
    queueMessage(message) {
        // Don't queue heartbeats or duplicate messages
        if (message.type === 'PING' || message.type === 'PONG') {
            return;
        }

        // Limit queue size to prevent memory issues
        if (this.messageQueue.length >= 100) {
            this.messageQueue.shift(); // Remove oldest message
        }

        message.queuedAt = Date.now();
        this.messageQueue.push(message);
        console.log(`📦 Queued message: ${message.type} (${this.messageQueue.length} in queue)`);
    }

    /**
     * Process queued messages after reconnection
     */
    processMessageQueue() {
        if (this.messageQueue.length === 0) {
            return;
        }

        console.log(`📨 Processing ${this.messageQueue.length} queued messages...`);

        const now = Date.now();
        const maxAge = 60000; // 1 minute max age

        // Filter out stale messages
        const validMessages = this.messageQueue.filter(msg => {
            return (now - msg.queuedAt) < maxAge;
        });

        // Send valid messages
        validMessages.forEach(message => {
            delete message.queuedAt; // Remove queue metadata
            this.sendMessage(message, false); // Don't re-queue
        });

        this.messageQueue = [];
        console.log(`✅ Processed ${validMessages.length} valid messages`);
    }

    /**
     * Request full game state sync after reconnection
     */
    requestGameStateSync() {
        const syncRequest = {
            type: 'REQUEST_GAME_STATE_SYNC',
            connectionId: this.connectionId,
            playerId: this.game?.currentPlayerId,
            timestamp: Date.now()
        };

        this.sendMessage(syncRequest);
        console.log('🔄 Requested game state synchronization');
    }

    /**
     * Show reconnecting UI indicator
     */
    showReconnectingUI(attempt, delay) {
        // Silent reconnection - no UI distraction
    }

    /**
     * Show connection lost UI
     */
    showConnectionLostUI() {
        // Silent connection handling - no UI distraction
    }

    /**
     * Hide reconnection UI
     */
    hideReconnectingUI() {
        // Remove any existing connection status UI silently
        const statusDiv = document.getElementById('connection-status');
        if (statusDiv && statusDiv.parentNode) {
            statusDiv.parentNode.removeChild(statusDiv);
        }
    }

    // ===============================================
    // 🎯 ROOT CAUSE FIX: PAGE VISIBILITY HANDLING
    // ===============================================

    /**
     * Prevent browser from killing WebSocket when tab goes background
     */
    setupPageVisibilityHandling() {
        console.log('🎯 Setting up page visibility handling to prevent disconnections');

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('📱 Tab backgrounded - maintaining WebSocket connection');
                // Reduce heartbeat frequency to save battery but keep connection alive
                this.adjustHeartbeatForBackground(true);
            } else {
                console.log('📱 Tab foregrounded - resuming normal operation');
                // Resume normal heartbeat frequency
                this.adjustHeartbeatForBackground(false);

                // Request fresh game state in case we missed updates
                this.requestGameStateSync();
            }
        });

        // Handle page beforeunload (prevent accidental disconnections)
        window.addEventListener('beforeunload', (event) => {
            console.log('🚪 Page unloading - preserving connection state');
            // Don't prevent unload, but prepare for reconnection
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Send a graceful disconnect message
                this.sendMessage({
                    type: 'GRACEFUL_DISCONNECT',
                    playerId: this.game?.currentPlayerId,
                    reason: 'page_unload'
                }, false);
            }
        });

        // Handle focus/blur events for additional stability
        window.addEventListener('focus', () => {
            console.log('🎯 Window focused - ensuring connection health');
            this.checkConnectionHealth();
            // Resume normal heartbeat frequency
            this.adjustHeartbeatForBackground(false);
        });

        window.addEventListener('blur', () => {
            console.log('🎯 Window blurred - entering background mode');
            // Send immediate heartbeat to keep connection alive
            this.sendHeartbeat();
            // Adjust heartbeat for background mode
            this.adjustHeartbeatForBackground(true);
        });
    }

    /**
     * Adjust heartbeat frequency based on page visibility
     */
    adjustHeartbeatForBackground(isBackground) {
        if (isBackground) {
            // Slower heartbeat to save battery but keep connection alive
            this.heartbeatFrequency = 60000; // 60 seconds
            console.log('💓 Reduced heartbeat to 60s for background mode');
        } else {
            // Normal heartbeat frequency
            this.heartbeatFrequency = 30000; // 30 seconds
            console.log('💓 Restored heartbeat to 30s for foreground mode');
        }

        // Restart heartbeat with new frequency
        this.startHeartbeat();
    }

    /**
     * Check connection health and reconnect if needed
     */
    checkConnectionHealth() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('🔍 Connection check failed - attempting reconnection');
            this.handleDisconnection();
        } else {
            console.log('🔍 Connection check passed - connection healthy');
            // Send immediate ping to verify
            this.sendHeartbeat();
        }
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicClient;
} else {
    window.EconomicClient = EconomicClient;
}