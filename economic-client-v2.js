/**
 * Economic Client v2 - Clean Client-Server Communication
 *
 * Responsibilities:
 * - Send transactions to server
 * - Receive and process economic updates
 * - Update UI with economic data
 * - Handle real-time game time synchronization
 */

class EconomicClient {
    constructor(game, autoConnectWebSocket = true) {
        this.game = game;
        this.baseUrl = ''; // Relative URLs for same-origin requests

        // Client state
        this.gameTime = 0;
        this.serverGameTime = 0;
        this.lastSyncTime = Date.now();

        // Economic data from server
        this.jeefhh = {
            jobs: { supply: 0, demand: 0, multiplier: 1.0 },
            energy: { supply: 0, demand: 0, multiplier: 1.0 },
            education: { supply: 0, demand: 0, multiplier: 1.0 },
            food: { supply: 0, demand: 0, multiplier: 1.0 },
            housing: { supply: 0, demand: 0, multiplier: 1.0 },
            healthcare: { supply: 0, demand: 0, multiplier: 1.0 }
        };

        this.carensMultiplier = 1.0;
        this.totalResidents = 0;

        // Building performance cache (for tooltips)
        this.buildingPerformanceCache = new Map();

        // WebSocket-based data stores (replaces HTTP API calls)
        this.buildings = new Map(); // Building data from WebSocket
        this.playerBalances = {}; // Player balances from WebSocket

        // Update callbacks
        this.updateCallbacks = new Set();

        // V2: Player ID ready callback
        this.onPlayerIdReady = null;

        // Client game time tracking (sync'd with server)
        this.GAME_DAY_MS = 3600000 / 365; // Same as server
        this.clientGameStartTime = Date.now();

        console.log('📡 Economic Client v2 initialized');

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
            console.log('⏰ Client clock already started, skipping');
            return;
        }

        console.log('⏰ Starting client game clock at Sept 2nd (Henry George\'s birthday)');

        // Reset game start time to now (when game actually begins)
        this.clientGameStartTime = Date.now();
        this.clockStarted = true;

        setInterval(() => {
            this.updateClientGameTime();
        }, 1000); // Update every second
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

        console.log(`⏰ Game time synced: Day ${Math.floor(this.gameTime)}`);
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
    async purchaseParcel(playerId, cost, location, description = 'Parcel Purchase') {
        const transaction = {
            type: 'PARCEL_PURCHASE',
            playerId,
            cost,
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
            console.log('📤 Sending transaction:', transaction.type);

            const response = await fetch(`${this.baseUrl}/api/economics/transaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(transaction)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Transaction failed');
            }

            console.log('✅ Transaction successful:', result);
            console.log('🔍 DEBUG: Full server response structure:', JSON.stringify(result, null, 2));
            console.log('🔍 DEBUG: result.newBalance value:', result.newBalance);

            // Sync game time
            if (result.gameTime) {
                this.syncWithServerTime(result.gameTime);
            }

            return result;

        } catch (error) {
            console.error('❌ Transaction failed:', error);
            throw error;
        }
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
            console.warn(`⚠️ Building not found at ${locationKey} in WebSocket data`);
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
            console.warn(`⚠️ No cashflow data available for player ${playerId} - WebSocket not connected`);
        }
        return null;
    }

    /**
     * Get current global economic state
     */
    async getEconomicState() {
        // Return current state from WebSocket data instead of HTTP API
        const state = {
            gameTime: this.gameTime,
            jeefhh: this.jeefhh,
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
        if (!this.playerId || !this.playerBalances) {
            return null;
        }
        return this.playerBalances[this.playerId] || null;
    }

    /**
     * SERVER EVENT HANDLING
     */

    /**
     * Handle economic update from server
     */
    handleEconomicUpdate(update) {
        console.log('📥 Received economic update:', update.type);

        // Handle transaction types within ECONOMIC_UPDATE messages
        if (update.transaction && update.transaction.type) {
            console.log('📥 Processing transaction:', update.transaction.type);

            switch (update.transaction.type) {
                case 'BUILD_COMPLETE_AUTO':
                    // Building automatically completed construction
                    console.log(`🏗️ Building ${update.transaction.buildingId} completed at (${update.transaction.location})`);
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
                console.log(`💰 WebSocket balance update: ${this.playerId} -> $${newBalance}`);

                // Force cash manager sync if it exists
                if (window.cashManager && typeof window.cashManager.forceBalanceSync === 'function') {
                    window.cashManager.forceBalanceSync(newBalance);
                }
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
        console.log('📅 Daily update received:', update.gameDay);

        // Process all economic data the same way as handleEconomicUpdate
        if (update.jeefhh) {
            this.jeefhh = update.jeefhh;
        }

        if (update.carens) {
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
            console.log(`🏗️ Daily update buildings sync: ${update.buildings.length} buildings`);
        }

        // Update player balances from WebSocket data
        if (update.playerBalances) {
            this.playerBalances = update.playerBalances;

            // If current player's balance changed, notify cash manager
            if (this.playerId && this.playerBalances[this.playerId] !== undefined) {
                const newBalance = this.playerBalances[this.playerId];
                console.log(`💰 Daily update balance sync: ${this.playerId} -> $${newBalance}`);

                // Force cash manager sync if it exists
                if (window.cashManager && typeof window.cashManager.forceBalanceSync === 'function') {
                    window.cashManager.forceBalanceSync(newBalance);
                }
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
        console.log(`🔄 Syncing server-authoritative game state: ${eventType}`);

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

        // Sync buildings (server-authoritative, includes performance data)
        if (gameState.buildings) {
            console.log('🏗️ DEBUG: Raw buildings from server:', gameState.buildings);
            this.buildings = new Map();
            gameState.buildings.forEach(building => {
                console.log('🏗️ DEBUG: Processing building:', building);
                this.buildings.set(building.locationKey, building);
            });
            console.log(`🏗️ Synced ${gameState.buildings.length} buildings from server state`);
            console.log('🏗️ DEBUG: Buildings Map after sync:', Array.from(this.buildings.entries()));
        } else {
            console.log('🏗️ DEBUG: No buildings in gameState');
        }

        // Sync player data (server-authoritative)
        if (gameState.players) {
            this.playerBalances = {};
            Object.values(gameState.players).forEach(player => {
                this.playerBalances[player.id] = player.cash;
            });

            // Update current player cash if available
            if (this.playerId && gameState.players[this.playerId]) {
                const playerData = gameState.players[this.playerId];
                const newBalance = playerData.cash;

                console.log(`💰 Server-authoritative balance update: ${this.playerId} -> $${newBalance}`);

                // Force cash manager sync
                if (window.cashManager && typeof window.cashManager.forceBalanceSync === 'function') {
                    window.cashManager.forceBalanceSync(newBalance);
                }
            }
        }

        // Sync cashflow data (server-authoritative, eliminates HTTP polling)
        if (gameState.cashflow) {
            this.cachedCashflow = gameState.cashflow;
            console.log(`💸 Synced cashflow data for ${Object.keys(gameState.cashflow).length} players`);
        }

        // Trigger UI updates with the complete state
        this.triggerUIUpdate('SERVER_STATE_SYNC', {
            eventType: eventType,
            gameState: gameState
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
        console.log('🗑️ All caches cleared');
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
        console.log('🚀 Initializing economic client...');

        try {
            await this.getEconomicState();
            console.log('✅ Economic client initialized successfully');
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
        // Construct WebSocket URL (same host as HTTP, path /ws)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        console.log('🔌 Connecting to WebSocket:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected - real-time multiplayer active');
            };

            this.ws.onmessage = (event) => {
                try {
                    console.log('🔌 DEBUG: Raw WebSocket message received:', event.data);
                    const update = JSON.parse(event.data);
                    console.log('🔌 DEBUG: Parsed WebSocket update:', {
                        type: update.type,
                        playersCount: update.gameState?.players ? Object.keys(update.gameState.players).length : 'N/A',
                        buildingsCount: update.gameState?.buildings ? update.gameState.buildings.length : 'N/A',
                        buildings: update.gameState?.buildings || 'N/A',
                        fullUpdate: update
                    });
                    this.handleWebSocketUpdate(update);
                } catch (error) {
                    console.error('🔌 Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected - attempting reconnection...');
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    this.initializeWebSocket();
                }, 3000);
            };

            this.ws.onerror = (error) => {
                console.error('🔌 WebSocket error:', error);
            };

        } catch (error) {
            console.error('🔌 Failed to initialize WebSocket:', error);
        }
    }

    /**
     * Handle real-time WebSocket updates from server
     */
    handleWebSocketUpdate(update) {
        console.log('📡 Real-time update received:', update.type);

        switch (update.type) {
            case 'CONNECTED':
                console.log('🔌', update.message);

                // V2: Store server-assigned player ID
                if (update.playerId) {
                    this.playerId = update.playerId;
                    console.log('🆔 Server assigned player ID:', this.playerId);

                    // Notify game that player ID is ready
                    if (this.onPlayerIdReady) {
                        this.onPlayerIdReady(this.playerId);
                    }
                }

                // Handle room state sync
                if (update.roomState) {
                    console.log('🎲 Joined room:', update.roomState.roomName);
                    console.log('👥 Players in room:', update.roomState.players);

                    // Sync existing buildings from room
                    if (update.roomState.buildings && update.roomState.buildings.length > 0) {
                        console.log(`🏗️ Syncing ${update.roomState.buildings.length} existing buildings`);

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

            case 'ECONOMIC_UPDATE':
                // Real-time economic state update
                this.handleEconomicUpdate(update);
                break;

            case 'DAILY_UPDATE':
                // Daily game progression update
                this.handleDailyUpdate(update);
                break;

            case 'ROOM_STATE_SYNC':
                // Room state sync response (from REQUEST_ROOM_STATE)
                console.log('📥 Room state sync response received');
                if (update.roomState) {
                    console.log(`🏗️ Syncing ${update.roomState.buildings?.length || 0} buildings from server`);
                    this.triggerUIUpdate('ROOM_STATE_SYNC', update.roomState);

                    // Update game time
                    if (update.roomState.gameTime) {
                        this.syncWithServerTime(update.roomState.gameTime);
                    }
                }
                break;

            case 'BUILD_COMPLETE_AUTO':
                // Building automatically completed construction
                console.log(`🏗️ Building ${update.buildingId} completed at (${update.location})`);
                this.triggerUIUpdate('BUILDING_COMPLETED', update);
                break;

            case 'ROOM_RESET':
                // Room has been reset - clear local state and resync
                console.log('🔄 Room reset received - clearing local state');
                this.clearAllCaches();
                this.triggerUIUpdate('ROOM_RESET', update);

                // Request fresh room state after reset
                setTimeout(() => {
                    this.triggerUIUpdate('REQUEST_ROOM_SYNC');
                }, 500);
                break;

            case 'READY_CHECK_STARTED':
                // Beer hall table ready-check modal
                console.log('🍻 Table ready check started!');
                this.triggerUIUpdate('READY_CHECK_STARTED', update);
                break;

            default:
                console.log('📡 Unknown update type:', update.type);
        }
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicClient;
} else {
    window.EconomicClient = EconomicClient;
}