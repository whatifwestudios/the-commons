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

        this.carens = {
            culture: 0.5, affordability: 0.5, resilience: 0.5,
            environment: 0.5, noise: 0.5, safety: 0.5, multiplier: 1.0
        };
        this.carensMultiplier = 1.0; // Keep for backward compatibility
        this.totalResidents = 0;

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

        console.log(`⏰ Game time synced: Day ${Math.floor(this.gameTime)}`);

        // Update game's date display with server-authoritative time
        if (window.game && typeof window.game.updateGameDate === 'function') {
            window.game.currentDay = Math.floor(this.gameTime);
            window.game.updateGameDate();
            console.log('📅 Server-authoritative date updated in UI');
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

            // Process immediate balance update from flattened transaction result
            if (result.newBalance !== undefined) {
                const newBalance = result.newBalance;
                console.log(`💰 Immediate transaction balance update: ${newBalance}`);

                // Store server-authoritative balance and update UI
                this.serverBalance = newBalance;
                if (window.game && window.game.domCache && window.game.domCache.playerCash) {
                    window.game.domCache.playerCash.textContent = `$${Math.round(newBalance).toLocaleString()}`;
                    console.log(`✅ UI updated immediately to show transaction result: $${Math.round(newBalance).toLocaleString()}`);
                }
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
        if (!this.playerId || !this.playerBalances) {
            // Return starting balance before server sync
            return 6000;
        }
        return this.playerBalances[this.playerId] || 6000;
    }

    /**
     * Get current player's actions from WebSocket data
     */
    getCurrentPlayerActions() {
        if (!this.playerId || !this.playerActions) {
            // Return starting actions before server sync (default monthly allowance)
            return 20;
        }
        return this.playerActions[this.playerId] || 20;
    }

    /**
     * Get city attractiveness score for population movement
     */
    getCityAttractiveness() {
        // Return null for empty grid (no buildings)
        if (!this.buildings || this.buildings.size === 0) {
            return null;
        }
        return this.attractiveness || 0.96; // Default starting attractiveness
    }

    /**
     * Get detailed attractiveness breakdown for tooltip
     */
    getAttractivenessBreakdown() {
        if (!this.jeefhh || !this.carens) {
            return {
                score: 0.96,
                coreScore: 1.0,
                qualityScore: 0.87,
                strongest: 'No data available',
                weakest: 'No data available',
                immigrationStatus: 'Building city infrastructure...'
            };
        }

        // Calculate the same breakdown as server
        const coreMultipliers = [
            this.jeefhh.jobs?.multiplier || 1.0,
            this.jeefhh.housing?.multiplier || 1.0,
            this.jeefhh.food?.multiplier || 1.0,
            this.jeefhh.energy?.multiplier || 1.0
        ];
        const coreScore = coreMultipliers.reduce((sum, m) => sum + m, 0) / coreMultipliers.length;

        const qualityMultipliers = [
            this.jeefhh.education?.multiplier || 1.0,
            this.jeefhh.healthcare?.multiplier || 1.0,
            this.carens?.multiplier || 1.0
        ];
        const qualityScore = qualityMultipliers.reduce((sum, m) => sum + m, 0) / qualityMultipliers.length;

        const attractiveness = (coreScore * 0.7) + (qualityScore * 0.3);

        // Find strongest and weakest categories
        const allCategories = {
            'Jobs': this.jeefhh.jobs?.multiplier || 1.0,
            'Housing': this.jeefhh.housing?.multiplier || 1.0,
            'Food': this.jeefhh.food?.multiplier || 1.0,
            'Energy': this.jeefhh.energy?.multiplier || 1.0,
            'Education': this.jeefhh.education?.multiplier || 1.0,
            'Healthcare': this.jeefhh.healthcare?.multiplier || 1.0,
            'Quality of Life': this.carens?.multiplier || 1.0
        };

        const sorted = Object.entries(allCategories).sort(([,a], [,b]) => b - a);
        const strongest = sorted[0];
        const weakest = sorted[sorted.length - 1];

        // Immigration status message
        let immigrationStatus;
        if (attractiveness >= 1.1) {
            immigrationStatus = '✅ Attracting new residents!';
        } else if (attractiveness >= 0.95) {
            immigrationStatus = `⚠️ Need ${(1.1 - attractiveness).toFixed(2)} more points to attract residents`;
        } else {
            immigrationStatus = '❌ Risk of emigration if conditions persist';
        }

        return {
            score: attractiveness,
            coreScore,
            qualityScore,
            strongest: `${strongest[0]} (${strongest[1].toFixed(2)}x)`,
            weakest: `${weakest[0]} (${weakest[1].toFixed(2)}x)`,
            immigrationStatus
        };
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
                console.log(`💰 WebSocket balance update: ${this.playerId} -> $${newBalance}`);

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
        console.log('📅 Daily update received:', update.gameDay);

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
        if (gameState.attractiveness !== undefined) {
            this.attractiveness = gameState.attractiveness;
        }

        // V2: Process vitality data for UI
        this.updateVitalityData();

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

            // Sync buildings to game grid for visual rendering
            this.syncBuildingsToGameGrid();
        } else {
            console.log('🏗️ DEBUG: No buildings in gameState');
        }

        // Sync player data (server-authoritative)
        if (gameState.players) {
            // Store complete player data for multiplayer rendering (names, colors, etc.)
            if (!this.gameState) {
                this.gameState = {};
            }
            this.gameState.players = gameState.players;
            console.log('🎨 Synced complete player data for multiplayer:', Object.keys(gameState.players));

            // Legacy support: extract specific data into separate properties
            this.playerBalances = {};
            this.playerActions = {};
            Object.values(gameState.players).forEach(player => {
                this.playerBalances[player.id] = player.cash;
                this.playerActions[player.id] = player.actions?.total || 0;
            });

            // Balance and action sync logging (reduced frequency)
            if (!this.lastBalanceLogTime || Date.now() - this.lastBalanceLogTime > 2000) {
                console.log('💰 Balance sync check:', this.playerId, 'server balance:', gameState.players[this.playerId]?.cash);
                console.log('🎯 Action sync check:', this.playerId, 'server actions:', gameState.players[this.playerId]?.actions?.total);

                // DEBUG: Log player colors for multiplayer sync verification
                Object.values(gameState.players).forEach(player => {
                    console.log(`🎨 Player ${player.id} (${player.name}): ${player.color}`);
                });

                this.lastBalanceLogTime = Date.now();
            }
        }

        // Sync action marketplace data
        if (gameState.actionMarketplace && this.game.actionMarketplace?.syncMarketplaceData) {
            this.game.actionMarketplace.syncMarketplaceData(gameState.actionMarketplace);
        }

        // Sync player ID if not set
        if (!this.playerId && window.game?.currentPlayerId) {
            console.log('🔄 Syncing Economic Client player ID from game:', window.game.currentPlayerId);
            this.playerId = window.game.currentPlayerId;
        }

        // Update current player cash if available
        if (this.playerId && gameState.players[this.playerId]) {
            const playerData = gameState.players[this.playerId];
            const newBalance = playerData.cash;

            console.log(`💰 Server-authoritative balance update: ${this.playerId} -> $${Math.round(newBalance).toLocaleString()}`);

            // Server-authoritative: Store server balance and update UI directly
            this.serverBalance = newBalance;

            // Update UI directly with server balance (no client state mutations)
            if (window.game && window.game.domCache && window.game.domCache.playerCash) {
                window.game.domCache.playerCash.textContent = `$${Math.round(newBalance).toLocaleString()}`;
                console.log('✅ UI updated to:', window.game.domCache.playerCash.textContent);

                // Check if something overrides our update within 100ms
                setTimeout(() => {
                    const currentDisplay = window.game.domCache.playerCash.textContent;
                    if (currentDisplay !== `$${Math.round(newBalance).toLocaleString()}`) {
                        console.warn('⚠️ Cash display was overridden!', 'Expected:', `$${Math.round(newBalance).toLocaleString()}`, 'Actual:', currentDisplay);
                    }
                }, 100);
            } else {
                console.warn('⚠️ DOM cache not found, using fallback');
                const cashElement = document.querySelector('.player-cash, #player-cash, [class*="cash"]');
                if (cashElement) {
                    cashElement.textContent = `$${Math.round(newBalance).toLocaleString()}`;
                    console.log('✅ Fallback update to:', cashElement.textContent);
                }
            }
        }

        // Sync grid/parcel ownership (server-authoritative)
        if (gameState.grid && this.game.grid) {
            console.log('🏞️ Syncing grid ownership from server state');

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

            console.log('🏞️ Grid ownership synchronized with server');

            // Trigger grid re-render
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
        }

        // Sync cashflow data (server-authoritative, eliminates HTTP polling)
        if (gameState.cashflow) {
            this.cachedCashflow = gameState.cashflow;
            console.log(`💸 Synced cashflow data for ${Object.keys(gameState.cashflow).length} players`);
        }

        // Skip governance sync - player governance is handled via individual transactions
        // This prevents the client governance system from being overwritten by legacy server data
        if (gameState.governance && this.game.governanceSystem && false) {
            this.game.governanceSystem.governance = gameState.governance;
            this.game.governanceSystem.updateGovernanceModal();
            console.log(`🏛️ Synced governance data: treasury $${gameState.governance.treasuryBalance || 0}`);
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
            console.log('⚠️ Game grid not available for building sync');
            return;
        }

        console.log('🔄 Syncing buildings to game grid for visual rendering...');
        let syncedCount = 0;

        // Clear existing buildings from grid first
        this.game.grid.forEach((row, rowIndex) => {
            row.forEach((parcel, colIndex) => {
                if (parcel.building) {
                    console.log(`🗑️ Clearing old building from grid [${rowIndex},${colIndex}]`);
                    parcel.building = null;
                }
            });
        });

        // Add current buildings to grid
        this.buildings.forEach((building, locationKey) => {
            const [row, col] = building.location;
            if (this.game.grid[row] && this.game.grid[row][col]) {
                console.log(`🏗️ Adding building to grid: ${building.id} at [${row},${col}]`);

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

                console.log(`🎨 Building graphics: ${building.graphicsFile || 'no graphics found'}`);
                console.log('🔍 DEBUG: Building object graphics data:', {
                    graphicsFile: building.graphicsFile,
                    graphics: building.graphics,
                    images: building.images,
                    allKeys: Object.keys(building)
                });
                syncedCount++;
            } else {
                console.warn(`⚠️ Invalid building location: [${row},${col}]`);
            }
        });

        console.log(`✅ Synced ${syncedCount} buildings to game grid for rendering`);
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
        // 🔧 FIX: Reuse existing Beer Hall WebSocket instead of creating new connection
        if (typeof beerHallLobby !== 'undefined' && beerHallLobby && beerHallLobby.ws && beerHallLobby.ws.readyState === WebSocket.OPEN) {
            console.log('🔄 Reusing existing Beer Hall WebSocket connection');
            this.ws = beerHallLobby.ws;
            // DON'T override Beer Hall's WebSocket handlers - Beer Hall will forward messages
            console.log('📡 Economic Client will receive messages via Beer Hall forwarding');
            return;
        }

        // Fallback: Create new WebSocket if Beer Hall WebSocket not available
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        console.log('🔌 Connecting to WebSocket:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketHandlers();
        } catch (error) {
            console.error('🔌 Failed to connect to WebSocket:', error);
        }
    }

    setupWebSocketHandlers() {
        // Store original onmessage handler from Beer Hall if it exists
        const originalOnMessage = this.ws.onmessage;

        // Set up our message handler that chains with the original
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
                console.log('🔌 WebSocket connected - real-time multiplayer active');

                // 🔧 FIX: Send existing player ID to prevent multiple player creation
                if (this.game && this.game.currentPlayerId) {
                    console.log(`🔄 Sending existing player ID to server: ${this.game.currentPlayerId}`);

                    // Small delay to ensure WebSocket is fully ready
                    setTimeout(() => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({
                                type: 'IDENTIFY_PLAYER',
                                playerId: this.game.currentPlayerId
                            }));
                        }
                    }, 10); // 10ms delay
                }
            };
        } else {
            // WebSocket already open, send identify message immediately
            console.log('🔌 WebSocket already connected - reusing Beer Hall connection');
            if (this.game && this.game.currentPlayerId) {
                console.log(`🔄 Sending existing player ID to server: ${this.game.currentPlayerId}`);
                this.ws.send(JSON.stringify({
                    type: 'IDENTIFY_PLAYER',
                    playerId: this.game.currentPlayerId
                }));
            }
        }

        // Set onclose and onerror handlers (for both new and reused connections)
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
    }

    /**
     * Handle real-time WebSocket updates from server
     */
    handleWebSocketUpdate(update) {
        console.log('📡 Real-time update received:', update.type);
        console.log('🔍 DEBUG: update.type === "GAME_STATE":', update.type === 'GAME_STATE');
        console.log('🔍 DEBUG: typeof update.type:', typeof update.type);

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

            case 'PLAYER_IDENTIFIED':
                // 🔧 FIX: Confirmation that server accepted our existing player ID
                console.log('✅ Server confirmed player ID:', update.playerId);
                if (update.playerId && this.game.currentPlayerId === update.playerId) {
                    this.playerId = update.playerId;
                    console.log(`🔄 Economic client now using correct player ID: ${this.playerId}`);
                } else {
                    console.warn('⚠️ Player ID mismatch:', update.playerId, 'vs game:', this.game.currentPlayerId);
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

            case 'GAME_STATE':
                // 🔧 FIX: Handle GAME_STATE messages received from shared Beer Hall WebSocket
                console.log('🎮 GAME_STATE received - syncing with server');
                console.log('🔍 DEBUG: update.gameState exists:', !!update.gameState);
                console.log('🔍 DEBUG: update.gameState.players:', update.gameState?.players);
                if (update.gameState) {
                    console.log('🔄 Calling syncGameState...');
                    this.syncGameState(update.gameState, update.eventType);
                } else {
                    console.log('❌ No gameState in update, skipping sync');
                }
                break;

            case 'SERVER_STATE_SYNC':
                // Handle server state synchronization
                console.log('📊 SERVER_STATE_SYNC received - updating economic data');
                if (update.jeefhh) {
                    this.jeefhh = update.jeefhh;
                    console.log('📊 JEEFHH data updated:', this.jeefhh);
                }
                if (update.carens) {
                    this.carens = update.carens;
                    console.log('🏛️ CARENS data updated:', this.carens);
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
                console.log('🗳️ Monthly update received:', update.message);
                // Update governance points in local game state
                if (this.game && this.game.governanceSystem) {
                    this.game.governanceSystem.governance.votingPoints += 2;
                    console.log(`🗳️ Updated local governance points: ${this.game.governanceSystem.governance.votingPoints}`);
                    // Update the governance modal if it's open
                    this.game.governanceSystem.updateGovernanceModal();
                    // Animate governance button with gold fade animation
                    this.game.governanceSystem.animateGovernanceButtonGold();
                }
                break;

            case 'chat_message':
                // Handle incoming chat messages from other players
                console.log('💬 Chat message received:', update);
                if (update.playerId !== this.playerId) { // Don't echo back own messages
                    // Add message to in-game chat
                    if (window.addChatMessage) {
                        window.addChatMessage(update.playerName, update.message, update.playerColor, false);
                    }
                }
                break;

            default:
                console.log('📡 Unknown update type:', update.type);
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

            console.log('📊 Vitality data processed from server JEEFHH:', {
                supply: this.vitalitySupply,
                demand: this.vitalityDemand
            });
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
        const carensMetrics = ['SAFETY', 'CULTURE', 'AFFORDABILITY', 'RESILIENCE', 'ENVIRONMENT', 'NOISE'];
        const metrics = {};

        carensMetrics.forEach(domain => {
            const domainKey = domain.toLowerCase();
            const score = this.carens[domainKey] || 0;

            // Convert 0-1 scale to -100 to +100 points scale
            // 0.5 = 0 points (neutral), 0.0 = -100 points, 1.0 = +100 points
            const points = Math.round((score - 0.5) * 200);

            metrics[domain] = {
                score: score,
                points: points,
                percentage: Math.round(score * 100), // Keep for backward compatibility
                status: score >= 0.8 ? 'excellent' : score >= 0.6 ? 'good' : score >= 0.4 ? 'fair' : 'poor'
            };
        });

        return metrics;
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicClient;
} else {
    window.EconomicClient = EconomicClient;
}