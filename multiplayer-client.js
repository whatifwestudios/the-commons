/**
 * WebSocket Multiplayer Client
 * Railway-focused implementation
 */

class RailwayMultiplayerManager {
    constructor(game) {
        this.game = game;
        this.playerId = null;
        this.players = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // WebSocket connection only
        this.connection = null;
        
        // Enhanced state management
        this.localStateVersion = 0;
        this.serverStateVersion = 0;
        this.pendingActions = new Map();
        this.stateCache = null;
        
        // Optimistic concurrency control
        this.optimisticState = new Map(); // Track optimistic changes
        this.rollbackStack = []; // Stack of changes that can be rolled back
        this.maxRollbackDepth = 10;
        
        // Phase 4: Performance optimizations
        this.actionBatch = []; // Queue for batching actions
        this.batchTimeout = null; // Timer for batch sending
        this.batchDelay = 50; // Milliseconds to wait before sending batch
        this.maxBatchSize = 10; // Maximum actions per batch
        this.compressionEnabled = true; // Enable delta compression
        
        // Initialize predictive cache
        this.initPredictiveCache();
        
        // Heartbeat and connection management
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 30000; // 30 seconds
        this.lastHeartbeat = null;
        
        // Reconnection strategy
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.backoffMultiplier = 1.5;
        
        // Performance metrics
        this.latencyHistory = [];
        this.actionCount = 0;
        this.syncCount = 0;
        
        // Server time synchronization
        this.serverTimeOffset = 0;
        this.lastServerTime = null;
        this.timeSync = {
            samples: [],
            maxSamples: 10
        };
        
        console.log('🚂 Railway MultiplayerManager initialized for WebSocket');
        this.startConnectionMonitoring();
    }
    
    async connect() {
        try {
            console.log('🔌 Connecting to WebSocket server...');
            
            await this.connectWebSocket();
            
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            
        } catch (error) {
            console.error('❌ Failed to connect:', error);
            this.scheduleReconnect();
        }
    }
    
    async connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;
        
        this.connection = new WebSocket(wsUrl);
        
        // Return a promise that resolves when the connection is established
        return new Promise((resolve, reject) => {
            this.connection.onopen = () => {
                console.log('📡 WebSocket connection established');
                this.sendJoinGame();
                resolve(); // Connection is ready
            };
            
            this.connection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error);
                }
            };
            
            this.connection.onclose = (event) => {
                console.log('📱 WebSocket connection closed:', event.code);
                this.handleConnectionLoss();
            };
            
            this.connection.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.handleConnectionLoss();
                reject(error); // Connection failed
            };
        });
    }
    
    
    sendJoinGame() {
        const playerSettings = this.game.playerSettings || {};
        const message = {
            type: 'JOIN_GAME',
            playerId: this.getStoredPlayerId(),
            playerName: playerSettings.name || 'Player',
            playerColor: playerSettings.color || '#2196F3',
            playerEmoji: playerSettings.emoji || '🏠'
        };
        
        this.connection.send(JSON.stringify(message));
    }
    
    handleServerMessage(data) {
        this.lastHeartbeat = Date.now();
        
        // Update server stats monitor
        if (window.game?.serverStatsMonitor) {
            window.game.serverStatsMonitor.wsStats.messagesIn++;
            window.game.serverStatsMonitor.wsStats.bytesIn += JSON.stringify(data).length;
        }
        
        switch (data.type) {
            case 'CONNECTED':
                console.log('🔗 Client connected, ID:', data.clientId);
                break;
                
            case 'JOIN_SUCCESS':
                console.log('✅ Successfully joined game as:', data.player.name);
                this.playerId = data.playerId;
                localStorage.setItem('multiplayer_player_id', this.playerId);
                this.localStateVersion = data.version;
                this.syncGameState(data.gameState);
                if (data.players) {
                    data.players.forEach(player => {
                        this.players.set(player.id, player);
                    });
                    this.updatePlayersDisplay();
                }
                break;
                
            case 'STREAM_CONNECTED':
                console.log('🔗 Stream connection established');
                this.localStateVersion = data.version;
                this.syncGameState(data.gameState);
                if (data.players) {
                    data.players.forEach(player => {
                        this.players.set(player.id, player);
                    });
                    this.updatePlayersDisplay();
                }
                break;
                
            case 'STATE_UPDATE':
                this.syncGameState(data.gameState);
                if (data.players) {
                    data.players.forEach(player => {
                        this.players.set(player.id, player);
                    });
                    this.updatePlayersDisplay();
                }
                break;
                
            case 'STATE_DIFF':
                console.log('📦 Applying state diff...');
                this.applyStateDiff(data.diff);
                break;
                
            case 'PARTIAL_UPDATE':
                const updateSize = JSON.stringify(data).length;
                console.log(`⚡ Applying partial update: ${data.actionType} (${updateSize} bytes)`);
                this.applyPartialUpdate(data.changes);
                
                // Track bandwidth savings
                if (window.game?.serverStatsMonitor) {
                    window.game.serverStatsMonitor.trackPartialUpdate(updateSize);
                }
                break;
                
            case 'ACTION_SUCCESS':
                console.log('✅ Action processed:', data.actionId);
                this.handleActionSuccess(data);
                break;
                
            case 'ACTION_ERROR':
                console.error('❌ Action failed:', data.error, data.message);
                this.handleActionError(data);
                break;
                
            case 'PLAYER_JOINED':
                console.log(`👥 Player joined: ${data.player.name}`);
                this.players.set(data.player.id, data.player);
                this.updatePlayersDisplay();
                this.showNotification(`${data.player.name} joined the game`, 'info');
                break;
                
            case 'PLAYER_LEFT':
                console.log(`👋 Player left: ${data.playerId}`);
                this.players.delete(data.playerId);
                this.updatePlayersDisplay();
                break;
                
            case 'HEARTBEAT':
            case 'HEARTBEAT_ACK':
                this.lastHeartbeat = Date.now();
                if (data.version) {
                    this.serverStateVersion = data.version;
                }
                if (data.serverTime) {
                    this.updateServerTimeSync(data.serverTime);
                }
                break;
                
            case 'FULL_SYNC':
                console.log('🔄 Performing full state sync...');
                this.syncGameState(data.gameState);
                this.localStateVersion = data.version;
                this.syncCount++;
                break;
                
            case 'ERROR':
                console.error('❌ Server error:', data.error, data.message);
                break;
                
            case 'CONSTRUCTION_UPDATE':
                this.handleConstructionUpdate(data);
                break;
                
            case 'BUILDING_AGING_UPDATE':
                console.log('📈 Building aging update:', data.summary);
                // Buildings age and decay is handled automatically via full state sync
                // This message is just informational for logging
                break;
                
            case 'DAILY_UPDATE':
                this.handleDailyUpdate(data);
                break;
                
            default:
                console.log('📨 Received server message:', data);
        }
    }
    
    async broadcastAction(action, batchable = true) {
        if (!this.isConnected || !this.playerId) {
            console.warn('⚠️ Not connected to server');
            return { success: false, error: 'NOT_CONNECTED' };
        }
        
        const enhancedAction = {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            clientVersion: this.localStateVersion,
            playerId: this.playerId
        };
        
        // Track pending action
        this.pendingActions.set(enhancedAction.id, {
            action: enhancedAction,
            timestamp: Date.now(),
            retries: 0
        });
        
        // Check if action should be batched
        if (batchable && this.shouldBatchAction(enhancedAction)) {
            return this.addToBatch(enhancedAction);
        }
        
        try {
            return await this.sendWebSocketAction(enhancedAction);
        } catch (error) {
            console.error('❌ Error broadcasting action:', error);
            this.pendingActions.delete(enhancedAction.id);
            return { success: false, error: 'NETWORK_ERROR', message: error.message };
        }
    }
    
    async sendWebSocketAction(action) {
        // Check WebSocket state before sending
        if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send action: WebSocket not ready. State:', this.connection?.readyState);
            throw new Error('WebSocket not ready');
        }
        
        const message = {
            type: 'ACTION',
            action: action,
            id: action.id,
            clientVersion: this.localStateVersion
        };
        
        this.connection.send(JSON.stringify(message));
        
        // WebSocket actions are handled via the message response
        return { success: true, pending: true };
    }
    
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatFrequency);
    }
    
    async sendHeartbeat() {
        if (!this.isConnected) return;
        
        try {
            this.connection.send(JSON.stringify({
                type: 'HEARTBEAT',
                timestamp: Date.now(),
                version: this.localStateVersion
            }));
        } catch (error) {
            console.error('💔 Heartbeat failed:', error);
            this.handleConnectionLoss();
        }
    }
    
    // Include all the other methods from the original MultiplayerManager
    // (applyStateDiff, handleActionSuccess, etc.)
    
    applyStateDiff(diff) {
        if (diff.version <= this.localStateVersion) {
            console.log('⏸️ Ignoring old diff version');
            return;
        }
        
        console.log(`📦 Applying diff v${this.localStateVersion} → v${diff.version}`);
        
        // Apply parcel changes
        if (diff.changes.parcels) {
            Object.entries(diff.changes.parcels).forEach(([parcelId, parcelData]) => {
                const [row, col] = parcelId.split('-').map(Number);
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    if (parcelData === null) {
                        this.game.grid[row][col].owner = null;
                        this.game.grid[row][col].building = null;
                    } else {
                        Object.assign(this.game.grid[row][col], parcelData);
                    }
                }
            });
        }
        
        // Apply player changes
        if (diff.changes.players) {
            Object.entries(diff.changes.players).forEach(([playerId, playerData]) => {
                if (playerData === null) {
                    this.players.delete(playerId);
                } else {
                    this.players.set(playerId, playerData);
                    
                    if (playerId === this.playerId) {
                        this.game.playerCash = playerData.cash || this.game.playerCash;
                        
                        // Sync action manager data from server
                        if (playerData.actionManager && this.game.actionManager) {
                            this.game.actionManager.currentActions = playerData.actionManager.currentActions;
                            this.game.actionManager.usedThisMonth = playerData.actionManager.usedThisMonth;
                            this.game.actionManager.monthlyAllowance = playerData.actionManager.monthlyAllowance;
                            
                            // Update action display
                            if (this.game.updateActionDisplay) {
                                this.game.updateActionDisplay();
                            }
                        }
                        
                        // Sync governance data from server
                        if (playerData.governance && this.game.governance) {
                            if (playerData.governance.playerAllocations) {
                                this.game.governance.playerAllocations = playerData.governance.playerAllocations;
                            }
                            if (playerData.governance.totalVotingPoints !== undefined) {
                                this.game.governance.totalVotingPoints = playerData.governance.totalVotingPoints;
                            }
                            
                            // Update governance UI
                            if (this.game.updateGovernanceUI) {
                                this.game.updateGovernanceUI();
                            }
                        }
                    }
                }
            });
            this.updatePlayersDisplay();
        }
        
        // Apply calculated state changes
        if (diff.changes.calculated) {
            this.updateCalculatedState(diff.changes.calculated);
        }
        
        // Apply world state changes
        if (diff.changes.world) {
            if (diff.changes.world.currentDay !== undefined) {
                this.game.currentDay = diff.changes.world.currentDay;
            }
            if (diff.changes.world.currentMonth !== undefined) {
                this.game.currentMonth = diff.changes.world.currentMonth;
            }
        }
        
        // Apply transportation changes
        if (diff.changes.transportation) {
            this.syncTransportationState(diff.changes.transportation);
        }
        
        // Apply governance changes
        if (diff.changes.governance) {
            this.syncGovernanceState(diff.changes.governance);
        }
        
        this.localStateVersion = diff.version;
        // Update specific displays that exist
        if (this.game.updateVitalityDisplay) {
            this.game.updateVitalityDisplay();
        }
        if (this.game.updateDemographicsDisplay) {
            this.game.updateDemographicsDisplay();
        }
    }
    
    updateCalculatedState(calculated) {
        if (calculated.treasury !== undefined) {
            this.game.cityTreasury = calculated.treasury;
        }
        
        if (calculated.population !== undefined) {
            this.game.totalPopulation = calculated.population;
        }
        
        if (calculated.vitality) {
            // Initialize vitality arrays if they don't exist
            if (!this.game.vitalitySupply) this.game.vitalitySupply = {};
            if (!this.game.vitalityDemand) this.game.vitalityDemand = {};
            
            // Map server's lowercase keys to game's uppercase keys
            const keyMapping = {
                'energy': 'ENERGY',
                'food': 'FOOD', 
                'housing': 'HOUSING',
                'jobs': 'JOBS'
            };
            
            Object.entries(calculated.vitality).forEach(([metric, data]) => {
                const gameKey = keyMapping[metric];
                if (gameKey && data) {
                    this.game.vitalitySupply[gameKey] = data.supply || 0;
                    this.game.vitalityDemand[gameKey] = data.demand || 0;
                    
                    console.log(`🔄 Synced ${gameKey}: Supply=${data.supply}, Demand=${data.demand}, Balance=${data.balance}`);
                }
            });
            this.game.updateVitalityDisplay();
        }
        
        // Update specific displays that exist
        if (this.game.updateVitalityDisplay) {
            this.game.updateVitalityDisplay();
        }
        if (this.game.updateDemographicsDisplay) {
            this.game.updateDemographicsDisplay();
        }
    }
    
    handleActionSuccess(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        
        // Confirm optimistic update if it exists
        this.confirmOptimisticUpdate(actionId);
        
        // Apply any state changes from server
        if (data.stateChanges) {
            this.applyServerStateChanges(data.stateChanges);
        }
        
        this.actionCount++;
        console.log(`✅ Action confirmed by server: ${actionId}`);
        
        // Update server stats
        if (window.game?.serverStatsMonitor) {
            window.game.serverStatsMonitor.syncStats.confirmedActions++;
            window.game.serverStatsMonitor.syncStats.pendingActions = this.pendingActions.size;
            
            // Track road building
            if (data.stateChanges?.transportation?.roads) {
                const roads = Object.values(data.stateChanges.transportation.roads);
                roads.forEach(road => {
                    if (road) {
                        window.game.serverStatsMonitor.elementStats.roads.built++;
                        window.game.serverStatsMonitor.elementStats.roads.cost += road.cost || 0;
                    }
                });
            }
        }
    }
    
    handleActionError(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        
        // Rollback optimistic update if it exists
        const rolledBack = this.rollbackOptimisticUpdate(actionId, data.error);
        
        // Update server stats
        if (window.game?.serverStatsMonitor) {
            window.game.serverStatsMonitor.syncStats.rejectedActions++;
            window.game.serverStatsMonitor.syncStats.pendingActions = this.pendingActions.size;
        }
        
        // Handle auction-specific errors
        if (data.error === 'AUCTION_STATE_CHANGED' && data.currentAuctionState) {
            // Sync the updated auction state
            if (this.game.auctionSystem) {
                this.game.auctionSystem.onAuctionStateUpdate({
                    [data.currentAuctionState.id]: data.currentAuctionState
                });
            }
            this.showNotification('Auction updated by another player. Please try again.', 'warning');
        } else if (data.error === 'BID_SUPERSEDED') {
            // Another player bid higher
            this.showNotification(`Another player bid $${data.currentBid.toLocaleString()}. Try a higher amount.`, 'warning');
        } else if (data.error === 'PARCEL_ALREADY_OWNED') {
            // Another player purchased the parcel
            this.showNotification('This parcel was purchased by another player', 'warning');
        } else {
            this.showNotification(data.message || 'Action failed', 'error');
        }
        
        if (rolledBack) {
            console.log(`🔄 Rolled back failed action: ${actionId}`);
        }
    }
    
    handleConnectionLoss() {
        this.isConnected = false;
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        console.log('📱 Connection lost, attempting to reconnect...');
        this.scheduleReconnect();
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.showConnectionError();
            return;
        }
        
        const delay = Math.min(
            this.reconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        
        console.log(`⏳ Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    
    showConnectionError() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'multiplayer-error';
        errorDiv.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: #ff4444; color: white; padding: 15px; border-radius: 8px; z-index: 1000; max-width: 300px;">
                <h4>🔌 Connection Lost</h4>
                <p>Unable to connect to multiplayer server. Playing in offline mode.</p>
                <button onclick="this.parentElement.parentElement.remove(); window.location.reload();" style="background: white; color: #ff4444; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Retry Connection
                </button>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }
    
    showNotification(message, type = 'info') {
        // Disabled - no toast notifications
        return;
    }
    
    startConnectionMonitoring() {
        setInterval(() => {
            if (this.isConnected && this.lastHeartbeat) {
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
                if (timeSinceLastHeartbeat > this.heartbeatFrequency * 2) {
                    console.warn('⚠️ Heartbeat timeout, reconnecting...');
                    this.handleConnectionLoss();
                }
            }
        }, 10000);
    }
    
    recordLatency(latency) {
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > 10) {
            this.latencyHistory.shift();
        }
    }
    
    getStoredPlayerId() {
        return localStorage.getItem('multiplayer_player_id');
    }
    
    syncGameState(serverState) {
        if (!serverState || !serverState.core) return;
        
        console.log('🔄 Syncing game state...', serverState);
        
        // Sync parcels and buildings to the local grid
        if (serverState.core.parcels && this.game.grid) {
            Object.entries(serverState.core.parcels).forEach(([parcelId, serverParcel]) => {
                const [row, col] = parcelId.split('-').map(Number);
                
                // Ensure the grid location exists
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    const localParcel = this.game.grid[row][col];
                    
                    // Sync parcel data (building AND/OR ownership)
                    if (serverParcel.building || serverParcel.owner) {
                        // Sync building (might be null for empty owned parcels)
                        localParcel.building = serverParcel.building;
                        localParcel.owner = serverParcel.owner;
                        localParcel.timestamp = serverParcel.timestamp;
                        
                        // Sync purchase/land value data
                        if (serverParcel.purchasePrice) {
                            if (!localParcel.landValue) localParcel.landValue = {};
                            localParcel.landValue.paidPrice = serverParcel.purchasePrice;
                        }
                        
                        // Sync building age and decay
                        if (serverParcel.buildingAge !== undefined) {
                            localParcel.buildingAge = serverParcel.buildingAge;
                        }
                        if (serverParcel.decay !== undefined) {
                            localParcel.decay = serverParcel.decay;
                        }
                        if (serverParcel.amenities) {
                            localParcel.amenities = serverParcel.amenities;
                        }
                        
                        // Sync construction data
                        if (serverParcel.constructionStartDay !== undefined) {
                            localParcel.constructionStartDay = serverParcel.constructionStartDay;
                            localParcel.constructionDays = serverParcel.constructionDays;
                            localParcel._isUnderConstruction = true;
                        } else {
                            delete localParcel.constructionStartDay;
                            delete localParcel.constructionDays;
                            delete localParcel._isUnderConstruction;
                            delete localParcel._constructionProgress;
                        }
                        
                        if (serverParcel.building) {
                            console.log(`🏠 Synced building at ${parcelId}: ${serverParcel.building} (owner: ${serverParcel.owner})`, serverParcel);
                        } else {
                            console.log(`🏞️ Synced ownership at ${parcelId}: empty parcel (owner: ${serverParcel.owner})`, serverParcel);
                        }
                    } else if (localParcel.building || localParcel.owner) {
                        // Server says no building AND no owner, but local has something - clear it
                        localParcel.building = null;
                        localParcel.owner = null;
                        delete localParcel.constructionStartDay;
                        delete localParcel.constructionDays;
                        delete localParcel._isUnderConstruction;
                        delete localParcel._constructionProgress;
                        
                        console.log(`🏗️ Cleared parcel at ${parcelId}`);
                    }
                    
                    // Mark region dirty for re-rendering
                    if (this.game.markRegionDirty) {
                        this.game.markRegionDirty(row, col, 1);
                    }
                }
            });
            
            // Trigger a full re-render to show all synced buildings
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
            
            // Update related systems
            if (this.game.updateVitalityDisplay) {
                this.game.updateVitalityDisplay();
            }
        }
        
        // Sync player data (cash, actions)
        if (serverState.core.players && this.playerId) {
            const playerData = serverState.core.players[this.playerId];
            if (playerData) {
                this.game.playerCash = playerData.cash || this.game.playerCash;
                
                // Sync action manager data from server
                if (playerData.actionManager && this.game.actionManager) {
                    this.game.actionManager.currentActions = playerData.actionManager.currentActions;
                    this.game.actionManager.usedThisMonth = playerData.actionManager.usedThisMonth;
                    this.game.actionManager.monthlyAllowance = playerData.actionManager.monthlyAllowance;
                    
                    // Update action display
                    if (this.game.updateActionDisplay) {
                        this.game.updateActionDisplay();
                    }
                }
            }
        }
        
        // Sync calculated state (treasury, population, vitality)
        if (serverState.calculated) {
            this.updateCalculatedState(serverState.calculated);
        }
        
        // Sync transportation state (roads, transit)
        if (serverState.core.transportation) {
            this.syncTransportationState(serverState.core.transportation);
        }
        
        // Sync governance state
        if (serverState.core.governance) {
            this.syncGovernanceState(serverState.core.governance);
        }
        
        // Sync auction state
        if (serverState.core.auctions && this.game.auctionSystem) {
            const auctionsObject = {};
            if (serverState.core.auctions instanceof Map) {
                // Convert Map to object for onAuctionStateUpdate
                for (const [auctionId, auctionData] of serverState.core.auctions) {
                    auctionsObject[auctionId] = auctionData;
                }
            } else {
                // Already an object
                Object.assign(auctionsObject, serverState.core.auctions);
            }
            
            this.game.auctionSystem.onAuctionStateUpdate(auctionsObject);
            console.log(`🔨 Synced ${Object.keys(auctionsObject).length} active auctions`);
        }
        
        // CRITICAL FIX: Clear tooltip cache after state sync to prevent stale "Empty Land" tooltips
        if (this.game.tooltipManager && this.game.tooltipManager.clearCache) {
            this.game.tooltipManager.clearCache();
            console.log('🔄 Cleared tooltip cache after state sync');
        }
    }
    
    updatePlayersDisplay() {
        // Update the players display in the UI
        console.log(`👥 ${this.players.size} players connected`);
    }
    
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            type: 'websocket',
            playerId: this.playerId,
            players: this.players.size,
            latency: this.latencyHistory.length > 0 
                ? Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length)
                : 0,
            actions: this.actionCount,
            syncs: this.syncCount,
            version: this.localStateVersion,
            serverVersion: this.serverStateVersion,
            pendingActions: this.pendingActions.size,
            serverTimeOffset: this.serverTimeOffset
        };
    }
    
    /**
     * Update server time synchronization
     */
    updateServerTimeSync(serverTime) {
        const now = Date.now();
        const roundTripTime = now - this.lastHeartbeat;
        const estimatedServerTime = serverTime + (roundTripTime / 2);
        const offset = estimatedServerTime - now;
        
        // Add to samples for averaging
        this.timeSync.samples.push(offset);
        if (this.timeSync.samples.length > this.timeSync.maxSamples) {
            this.timeSync.samples.shift();
        }
        
        // Calculate average offset to smooth out network jitter
        this.serverTimeOffset = this.timeSync.samples.reduce((a, b) => a + b, 0) / this.timeSync.samples.length;
        
        console.log(`⏰ Server time offset: ${this.serverTimeOffset}ms (samples: ${this.timeSync.samples.length})`);
    }
    
    // Hook into existing game actions to broadcast them
    async onParcelPurchased(row, col, building, purchasePrice, playerCash) {
        const result = await this.broadcastAction({
            type: 'PURCHASE_PARCEL',
            parcelId: `${row}-${col}`,
            building: building,
            purchasePrice: purchasePrice,
            playerCash: playerCash
        });
        
        return result.success;
    }
    
    async onBuildingConstructed(row, col, building, constructionData = {}) {
        console.log(`🏗️ Broadcasting building construction: ${building} at ${row}-${col}`, constructionData);
        
        // Create dust cloud effect at construction start
        console.log('🌪️ Creating dust cloud for multiplayer building construction');
        if (this.game.createDustCloud) {
            const worldPos = this.game.toIsometric(col, row);
            console.log('🌪️ Creating dust cloud at', worldPos);
            this.game.createDustCloud(worldPos.x, worldPos.y, 'building');
        } else {
            console.log('❌ createDustCloud method not found on game object (multiplayer)');
        }
        
        const result = await this.broadcastAction({
            type: 'CONSTRUCT_BUILDING',
            parcelId: `${row}-${col}`,
            building: building,
            constructionStartDay: constructionData.constructionStartDay,
            constructionDays: constructionData.constructionDays,
            amenities: constructionData.amenities,
            timestamp: Date.now()
        });
        
        return result.success;
    }
    
    // =====================================
    // Phase 3: Optimistic Concurrency Control
    // =====================================
    
    /**
     * Apply an optimistic update immediately to the UI
     * Store rollback information in case server rejects the action
     */
    applyOptimisticUpdate(action, rollbackData) {
        const updateId = crypto.randomUUID();
        
        // Store rollback information
        const rollbackInfo = {
            id: updateId,
            action: action,
            rollbackData: rollbackData,
            timestamp: Date.now()
        };
        
        this.rollbackStack.push(rollbackInfo);
        this.optimisticState.set(action.id, rollbackInfo);
        
        // Limit rollback stack size
        if (this.rollbackStack.length > this.maxRollbackDepth) {
            const removed = this.rollbackStack.shift();
            this.optimisticState.delete(removed.action.id);
        }
        
        console.log(`🚀 Applied optimistic update: ${action.type} (ID: ${updateId})`);
        
        return updateId;
    }
    
    /**
     * Confirm an optimistic update was accepted by server
     */
    confirmOptimisticUpdate(actionId) {
        const rollbackInfo = this.optimisticState.get(actionId);
        if (rollbackInfo) {
            // Remove from tracking - update is confirmed
            this.optimisticState.delete(actionId);
            const index = this.rollbackStack.findIndex(r => r.id === rollbackInfo.id);
            if (index !== -1) {
                this.rollbackStack.splice(index, 1);
            }
            console.log(`✅ Confirmed optimistic update: ${rollbackInfo.action.type}`);
        }
    }
    
    /**
     * Rollback an optimistic update that was rejected by server
     */
    rollbackOptimisticUpdate(actionId, reason = 'Server rejected') {
        const rollbackInfo = this.optimisticState.get(actionId);
        if (!rollbackInfo) {
            console.warn(`⚠️ No rollback info found for action ${actionId}`);
            return false;
        }
        
        console.log(`🔄 Rolling back optimistic update: ${rollbackInfo.action.type} (${reason})`);
        
        // Apply rollback to game state
        this.executeRollback(rollbackInfo);
        
        // Remove from tracking
        this.optimisticState.delete(actionId);
        const index = this.rollbackStack.findIndex(r => r.id === rollbackInfo.id);
        if (index !== -1) {
            this.rollbackStack.splice(index, 1);
        }
        
        // Trigger re-render
        if (this.game.scheduleRender) {
            this.game.scheduleRender();
        }
        
        return true;
    }
    
    /**
     * Execute rollback by restoring previous state
     */
    executeRollback(rollbackInfo) {
        const { action, rollbackData } = rollbackInfo;
        
        switch (action.type) {
            case 'PURCHASE_PARCEL':
                this.rollbackParcelPurchase(action, rollbackData);
                break;
            case 'CONSTRUCT_BUILDING':
                this.rollbackBuildingConstruction(action, rollbackData);
                break;
            default:
                console.warn(`⚠️ No rollback handler for action type: ${action.type}`);
        }
    }
    
    /**
     * Rollback a parcel purchase
     */
    rollbackParcelPurchase(action, rollbackData) {
        const [row, col] = action.parcelId.split('-').map(Number);
        if (this.game.grid[row] && this.game.grid[row][col]) {
            const parcel = this.game.grid[row][col];
            
            // Restore previous state
            parcel.owner = rollbackData.previousOwner;
            parcel.building = rollbackData.previousBuilding;
            if (rollbackData.previousLandValue) {
                parcel.landValue = rollbackData.previousLandValue;
            }
            
            // Restore player cash
            if (rollbackData.previousCash !== undefined) {
                this.game.playerCash = rollbackData.previousCash;
                this.game.updateCashDisplay();
            }
            
            console.log(`🔄 Rolled back parcel purchase at ${action.parcelId}`);
        }
    }
    
    /**
     * Rollback a building construction
     */
    rollbackBuildingConstruction(action, rollbackData) {
        const [row, col] = action.parcelId.split('-').map(Number);
        if (this.game.grid[row] && this.game.grid[row][col]) {
            const parcel = this.game.grid[row][col];
            
            // Restore previous building state
            parcel.building = rollbackData.previousBuilding;
            parcel.amenities = rollbackData.previousAmenities || [];
            
            // Restore construction data
            if (rollbackData.previousConstructionStartDay !== undefined) {
                parcel.constructionStartDay = rollbackData.previousConstructionStartDay;
            } else {
                delete parcel.constructionStartDay;
            }
            
            if (rollbackData.previousConstructionDays !== undefined) {
                parcel.constructionDays = rollbackData.previousConstructionDays;
            } else {
                delete parcel.constructionDays;
            }
            
            // Restore player cash
            if (rollbackData.previousCash !== undefined) {
                this.game.playerCash = rollbackData.previousCash;
                this.game.updateCashDisplay();
            }
            
            console.log(`🔄 Rolled back building construction at ${action.parcelId}`);
        }
    }
    
    /**
     * Clear all optimistic state (useful for reconnections)
     */
    clearOptimisticState() {
        console.log(`🧹 Clearing ${this.optimisticState.size} optimistic updates`);
        this.optimisticState.clear();
        this.rollbackStack = [];
    }
    
    /**
     * Apply state changes received from server after action confirmation
     */
    applyServerStateChanges(stateChanges) {
        console.log('📥 Applying server state changes:', stateChanges);
        
        // Apply parcel changes
        if (stateChanges.parcels) {
            Object.entries(stateChanges.parcels).forEach(([parcelId, serverParcel]) => {
                const [row, col] = parcelId.split('-').map(Number);
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    const localParcel = this.game.grid[row][col];
                    
                    // Update with authoritative server data
                    Object.assign(localParcel, serverParcel);
                    
                    console.log(`✅ Updated parcel ${parcelId} with server data`);
                }
            });
            
            // Trigger re-render
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
        }
        
        // Apply transportation changes (roads, transit stops, routes)
        if (stateChanges.transportation) {
            this.syncTransportationState(stateChanges.transportation);
        }
        
        // Apply other state changes (treasury, population, etc.)
        if (stateChanges.treasury !== undefined) {
            this.game.cityTreasury = stateChanges.treasury;
            this.updateTreasuryDisplay();
        }
        
        if (stateChanges.population !== undefined) {
            this.game.totalPopulation = stateChanges.population;
            this.updatePopulationDisplay();
        }
    }
    
    /**
     * Apply partial state updates (performance optimization)
     */
    applyPartialUpdate(changes) {
        // Apply parcel changes
        if (changes.parcels && this.game.grid) {
            Object.entries(changes.parcels).forEach(([parcelId, parcelData]) => {
                const [row, col] = parcelId.split('-').map(Number);
                
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    const localParcel = this.game.grid[row][col];
                    
                    // Merge parcel data (building, owner, construction state)
                    Object.assign(localParcel, parcelData);
                    
                    console.log(`⚡ Updated parcel ${parcelId}:`, parcelData);
                }
            });
        }
        
        // Apply player changes
        if (changes.players) {
            Object.entries(changes.players).forEach(([playerId, playerData]) => {
                if (playerId === this.playerId && this.game) {
                    // Update local player data
                    if (playerData.cash !== undefined) {
                        this.game.playerCash = playerData.cash;
                    }
                    if (playerData.actionManager && this.game.actionManager) {
                        Object.assign(this.game.actionManager, playerData.actionManager);
                        this.game.updateActionDisplay?.();
                    }
                    // Sync governance data
                    if (playerData.governance && this.game.governance) {
                        if (playerData.governance.playerAllocations) {
                            this.game.governance.playerAllocations = playerData.governance.playerAllocations;
                        }
                        if (playerData.governance.totalVotingPoints !== undefined) {
                            this.game.governance.totalVotingPoints = playerData.governance.totalVotingPoints;
                        }
                        this.game.updateGovernanceUI?.();
                    }
                }
                
                // Update player registry
                this.players.set(playerId, playerData);
            });
        }
        
        // Apply transportation changes
        if (changes.transportation && this.game.transportation) {
            if (changes.transportation.roads) {
                Object.assign(this.game.transportation.roads, changes.transportation.roads);
            }
            if (changes.transportation.transitStops) {
                Object.assign(this.game.transportation.transitStops, changes.transportation.transitStops);
            }
            if (changes.transportation.transitRoutes) {
                Object.assign(this.game.transportation.transitRoutes, changes.transportation.transitRoutes);
            }
        }
        
        // Apply governance changes
        if (changes.governance && this.game.governanceSystem) {
            Object.assign(this.game.governanceSystem.governance, changes.governance);
            // CRITICAL: Also update game.governance for UI functions
            if (!this.game.governance) this.game.governance = {};
            Object.assign(this.game.governance, changes.governance);
            this.game.updateGovernanceUI?.();
        }
        
        // Trigger visual updates
        if (this.game.scheduleRender) {
            this.game.scheduleRender();
        }
        
        // Clear tooltip cache for updated parcels
        if (this.game.tooltipManager && this.game.tooltipManager.clearCache) {
            this.game.tooltipManager.clearCache();
        }
        
        // Update related displays
        this.game.updateVitalityDisplay?.();
        this.updatePlayersDisplay();
    }
    
    // =====================================
    // Phase 4: Performance Optimizations
    // =====================================
    
    /**
     * Determine if an action should be batched
     */
    shouldBatchAction(action) {
        // Don't batch critical actions that need immediate processing
        const nonBatchableActions = [
            'PLACE_BID', // Auction bids need immediate processing
            'START_AUCTION', // Auction starts are time-critical
            'END_AUCTION', // Auction ends are time-critical
            'CHALLENGE_AUCTION' // Auction challenges are time-critical
        ];
        
        return !nonBatchableActions.includes(action.type);
    }
    
    /**
     * Add action to batch queue
     */
    addToBatch(action) {
        this.actionBatch.push(action);
        console.log(`📦 Added action to batch: ${action.type} (batch size: ${this.actionBatch.length})`);
        
        // Send immediately if batch is full
        if (this.actionBatch.length >= this.maxBatchSize) {
            this.flushBatch();
            return { success: true, batched: true, immediate: true };
        }
        
        // Set timeout to send batch if not already set
        if (!this.batchTimeout) {
            this.batchTimeout = setTimeout(() => {
                this.flushBatch();
            }, this.batchDelay);
        }
        
        return { success: true, batched: true, immediate: false };
    }
    
    /**
     * Send all batched actions immediately
     */
    async flushBatch() {
        if (this.actionBatch.length === 0) return;
        
        // Clear timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        
        const batch = [...this.actionBatch];
        this.actionBatch = [];
        
        console.log(`🚀 Sending action batch with ${batch.length} actions`);
        
        try {
            await this.sendWebSocketBatch(batch);
        } catch (error) {
            console.error('❌ Error sending batch:', error);
            // Re-add failed actions to pending (they'll be retried individually)
            batch.forEach(action => {
                this.broadcastAction(action, false); // Don't re-batch failed actions
            });
        }
    }
    
    /**
     * Send a batch of actions via WebSocket
     */
    async sendWebSocketBatch(actions) {
        // Check WebSocket state before sending
        if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
            console.warn('❌ Cannot send batch: WebSocket not ready. State:', this.connection?.readyState);
            throw new Error('WebSocket not ready');
        }
        
        const compressedBatch = this.compressionEnabled ? this.compressBatch(actions) : actions;
        
        const message = {
            type: 'ACTION_BATCH',
            actions: compressedBatch,
            compressed: this.compressionEnabled,
            batchId: crypto.randomUUID(),
            clientVersion: this.localStateVersion
        };
        
        this.connection.send(JSON.stringify(message));
        console.log(`📡 Sent compressed batch: ${actions.length} actions → ${JSON.stringify(message).length} bytes`);
        
        return { success: true, batched: true };
    }
    
    /**
     * Compress a batch of actions using delta compression
     */
    compressBatch(actions) {
        if (actions.length <= 1) return actions;
        
        const compressed = [actions[0]]; // First action is always full
        
        for (let i = 1; i < actions.length; i++) {
            const currentAction = actions[i];
            const previousAction = actions[i - 1];
            
            // Create delta by removing redundant fields
            const delta = this.createActionDelta(currentAction, previousAction);
            compressed.push(delta);
        }
        
        const originalSize = JSON.stringify(actions).length;
        const compressedSize = JSON.stringify(compressed).length;
        const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
        
        console.log(`🗜️ Compressed batch: ${originalSize} → ${compressedSize} bytes (${savings}% savings)`);
        
        return compressed;
    }
    
    /**
     * Create a delta between two actions
     */
    createActionDelta(current, previous) {
        const delta = { _delta: true, id: current.id };
        
        // Only include fields that differ from previous action
        Object.keys(current).forEach(key => {
            if (key !== 'id' && current[key] !== previous[key]) {
                delta[key] = current[key];
            }
        });
        
        return delta;
    }
    
    /**
     * Predictive state caching for frequently accessed data
     */
    initPredictiveCache() {
        this.stateCache = {
            parcels: new Map(),
            buildings: new Map(),
            lastAccessed: new Map(),
            hitCount: 0,
            missCount: 0
        };
        
        // Periodically clean cache
        setInterval(() => {
            this.cleanPredictiveCache();
        }, 60000); // Clean every minute
    }
    
    /**
     * Clean old entries from predictive cache
     */
    cleanPredictiveCache() {
        if (!this.stateCache) return;
        
        const now = Date.now();
        const maxAge = 300000; // 5 minutes
        
        // Clean parcel cache
        this.stateCache.parcels.forEach((value, key) => {
            const lastAccessed = this.stateCache.lastAccessed.get(key) || 0;
            if (now - lastAccessed > maxAge) {
                this.stateCache.parcels.delete(key);
                this.stateCache.lastAccessed.delete(key);
            }
        });
        
        console.log(`🧹 Cleaned predictive cache: ${this.stateCache.parcels.size} entries remaining`);
    }
    
    /**
     * Get cache statistics for monitoring
     */
    getCacheStats() {
        if (!this.stateCache) return null;
        
        const total = this.stateCache.hitCount + this.stateCache.missCount;
        const hitRate = total > 0 ? (this.stateCache.hitCount / total * 100).toFixed(1) : 0;
        
        return {
            entries: this.stateCache.parcels.size,
            hits: this.stateCache.hitCount,
            misses: this.stateCache.missCount,
            hitRate: `${hitRate}%`
        };
    }
    
    // Display update methods
    updateTreasuryDisplay() {
        const treasuryElement = document.getElementById('city-treasury');
        if (treasuryElement && this.game.cityTreasury !== undefined) {
            treasuryElement.textContent = `$${Math.round(this.game.cityTreasury).toLocaleString()}`;
        }
    }
    
    updatePopulationDisplay() {
        const populationElement = document.getElementById('total-residents');
        if (populationElement && this.game.totalPopulation !== undefined) {
            populationElement.textContent = this.game.totalPopulation.toLocaleString();
        }
    }
    
    handleConstructionUpdate(data) {
        if (!data.construction || !this.game.grid) return;
        
        Object.entries(data.construction).forEach(([parcelId, constructionData]) => {
            const [row, col] = parcelId.split('-').map(Number);
            
            if (this.game.grid[row] && this.game.grid[row][col]) {
                const parcel = this.game.grid[row][col];
                
                // Update construction progress
                parcel._constructionProgress = constructionData.progress;
                parcel._isUnderConstruction = !constructionData.isComplete;
                
                if (constructionData.isComplete) {
                    // Construction completed
                    console.log(`🏗️ Construction completed at ${parcelId}: ${constructionData.building}`);
                    delete parcel.constructionStartDay;
                    delete parcel.constructionDays;
                    delete parcel._constructionProgress;
                    delete parcel._isUnderConstruction;
                } else {
                    // Still under construction
                    parcel.constructionStartDay = constructionData.constructionStartDay;
                    parcel.constructionDays = constructionData.constructionDays;
                    
                    // Construction progress (logging removed to reduce console noise)
                }
                
                // Mark this region for re-rendering
                if (this.game.markRegionDirty) {
                    this.game.markRegionDirty(row, col, 1);
                }
            }
        });
        
        // Trigger a re-render to show construction progress
        if (this.game.scheduleRender) {
            this.game.scheduleRender();
        }
        
        // Clear tooltip cache since construction state changed
        if (this.game.tooltipManager && this.game.tooltipManager.clearCache) {
            this.game.tooltipManager.clearCache();
        }
    }
    
    handleDailyUpdate(data) {
        if (!data.timeState || !this.game) return;
        
        // Update the game's time state to match server authority
        if (this.game.currentDay !== data.timeState.currentDay || 
            this.game.currentMonth !== data.timeState.currentMonth || 
            this.game.gameDate.day !== data.timeState.currentDay ||
            this.game.gameDate.month !== data.timeState.currentMonth) {
            
            this.game.currentDay = data.timeState.currentDay;
            this.game.currentMonth = data.timeState.currentMonth;
            
            // CRITICAL: Also update gameDate object that UI uses
            this.game.gameDate.day = data.timeState.currentDay;
            this.game.gameDate.month = data.timeState.currentMonth;
            
            // CRITICAL: Sync day start time for accurate countdown timers
            this.game.lastDayStartTime = performance.now();
            
            // Time synchronized (logging removed to reduce console noise)
            
            // Note: Server handles treasury/LVT calculations for shared multiplayer state
            // Client-side cashflow is for display only (player revenue/costs)
            
            // Update the game date display
            if (this.game.updateGameDate) {
                this.game.updateGameDate();
            }
            
            // Update UI displays that show time
            if (this.game.updateTimeDisplay) {
                this.game.updateTimeDisplay();
            }
            
            // Clear tooltip cache since day changes can affect tooltips
            if (this.game.tooltipManager && this.game.tooltipManager.clearCache) {
                this.game.tooltipManager.clearCache();
            }
            
            // Trigger re-render to update any time-dependent visuals
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
        }
    }
    
    /**
     * Sync transportation state from server
     */
    syncTransportationState(transportationState) {
        console.log('🛣️ Syncing transportation state from server...', transportationState);
        
        // Sync roads with MobilityLayer
        if (transportationState.roads && this.game.mobilityLayer) {
            // Update individual roads instead of clearing all (preserves optimistic updates)
            Object.entries(transportationState.roads).forEach(([roadKey, roadData]) => {
                // Remove optimistic flag since this is server-confirmed
                if (roadData) {
                    delete roadData.optimistic;
                }
                this.game.mobilityLayer.roads.set(roadKey, roadData);
                console.log(`🛣️ Synced road: ${roadKey}`, roadData);
            });
        }
        
        // Sync transit stops with MobilityLayer
        if (transportationState.transitStops && this.game.mobilityLayer) {
            // Clear existing stops and sync from server
            this.game.mobilityLayer.transitStops.clear();
            
            Object.entries(transportationState.transitStops).forEach(([stopKey, stopData]) => {
                this.game.mobilityLayer.transitStops.set(stopKey, stopData);
                console.log(`🚇 Synced transit stop: ${stopKey}`, stopData);
            });
        }
        
        // Sync transit routes with MobilityLayer
        if (transportationState.transitRoutes && this.game.mobilityLayer) {
            // Clear existing routes and sync from server
            this.game.mobilityLayer.transitRoutes.clear();
            
            Object.entries(transportationState.transitRoutes).forEach(([routeId, routeData]) => {
                this.game.mobilityLayer.transitRoutes.set(routeId, routeData);
                console.log(`🚌 Synced transit route: ${routeId}`, routeData);
            });
        }
        
        // Also sync with TransportationSystem if it exists
        if (this.game.transportationSystem) {
            if (transportationState.roads) {
                this.game.transportationSystem.roads.clear();
                Object.entries(transportationState.roads).forEach(([roadKey, roadData]) => {
                    // Parse road key to get coordinates and edge
                    const [row1, col1, row2, col2] = roadKey.split('-').join(',').split(',').map(Number);
                    const edge = this.getEdgeFromCoordinates(row1, col1, row2, col2);
                    if (edge) {
                        this.game.transportationSystem.roads.set(`${row1},${col1},${edge}`, roadData);
                    }
                });
            }
        }
        
        // Schedule overall re-render to show transportation changes
        if (this.game.scheduleRender) {
            this.game.scheduleRender();
        }
    }
    
    /**
     * Helper to determine edge direction from coordinates
     */
    getEdgeFromCoordinates(row1, col1, row2, col2) {
        if (row1 === row2) {
            return col2 > col1 ? 'right' : 'left';
        } else if (col1 === col2) {
            return row2 > row1 ? 'bottom' : 'top';
        }
        return null;
    }
    
    /**
     * Sync governance state from server
     */
    syncGovernanceState(governanceState) {
        console.log('🗳️ Syncing governance state from server...', governanceState);
        
        if (!this.game.governance) {
            console.warn('⚠️ Game governance system not available');
            return;
        }
        
        // Sync global governance state
        if (governanceState.categoryAllocations) {
            this.game.governance.categoryAllocations = { ...governanceState.categoryAllocations };
        }
        
        if (governanceState.currentLvtRate !== undefined) {
            this.game.governance.currentLvtRate = governanceState.currentLvtRate;
            this.game.governance.proposedLvtRate = governanceState.proposedLvtRate || governanceState.currentLvtRate;
        }
        
        if (governanceState.unallocatedFunds !== undefined) {
            this.game.governance.unallocatedFunds = governanceState.unallocatedFunds;
        }
        
        if (governanceState.publicCoffers) {
            this.game.governance.publicCoffers = { ...governanceState.publicCoffers };
        }
        
        // Sync player-specific governance data from server player data
        if (this.playerId && this.game.grid) {
            const playerData = this.game.multiplayerManager?.players?.get(this.playerId);
            if (playerData && playerData.governance) {
                console.log('🗳️ Syncing player governance data:', playerData.governance);
                if (playerData.governance.playerAllocations) {
                    this.game.governance.playerAllocations = { ...playerData.governance.playerAllocations };
                    console.log('🗳️ Player allocations synced:', this.game.governance.playerAllocations);
                }
                if (playerData.governance.totalVotingPoints !== undefined) {
                    this.game.governance.totalVotingPoints = playerData.governance.totalVotingPoints;
                    console.log('🗳️ Total voting points synced:', this.game.governance.totalVotingPoints);
                }
            }
        }
        
        // Update governance UI if the modal is open
        if (this.game.updateGovernanceUI) {
            this.game.updateGovernanceUI();
        }
        
        console.log('🗳️ Governance state synced successfully');
    }
}

/**
 * Multiplayer Manager for real-time state synchronization
 * (Legacy implementation from game.js)
 */
class MultiplayerManager {
    constructor(game) {
        this.game = game;
        this.playerId = null;
        this.players = new Map();
        this.connection = null; // WebSocket connection
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Enhanced state management
        this.localStateVersion = 0;
        this.serverStateVersion = 0;
        this.pendingActions = new Map();
        this.stateCache = null;
        
        // Heartbeat and connection management
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 30000; // 30 seconds
        this.lastHeartbeat = null;
        
        // Reconnection strategy
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.backoffMultiplier = 1.5;
        
        // Performance metrics
        this.latencyHistory = [];
        this.actionCount = 0;
        this.syncCount = 0;
        
        console.log('🎮 WebSocket MultiplayerManager initialized for Railway');
        this.startConnectionMonitoring();
    }
    
    // Connection monitoring and heartbeat system
    startConnectionMonitoring() {
        // Monitor connection health every 10 seconds
        setInterval(() => {
            if (this.isConnected && this.lastHeartbeat) {
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
                if (timeSinceLastHeartbeat > this.heartbeatFrequency * 2) {
                    console.warn('⚠️ Heartbeat timeout, reconnecting...');
                    this.handleConnectionLoss();
                }
            }
            this.cleanupPendingActions();
        }, 10000);
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send periodic heartbeats
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatFrequency);
    }
    
    async sendHeartbeat() {
        if (!this.isConnected || !this.connection) return;
        
        try {
            const message = {
                type: 'HEARTBEAT',
                timestamp: Date.now(),
                version: this.localStateVersion
            };
            
            this.connection.send(JSON.stringify(message));
        } catch (error) {
            console.error('💔 Heartbeat failed:', error);
            this.handleConnectionLoss();
        }
    }
    
    recordLatency(latency) {
        this.latencyHistory.push(latency);
        if (this.latencyHistory.length > 10) {
            this.latencyHistory.shift();
        }
        
        const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
        if (avgLatency > 1000) {
            console.warn(`⚠️ High latency detected: ${avgLatency.toFixed(0)}ms`);
        }
    }
    
    async requestFullSync() {
        if (!this.connection || !this.isConnected) return;
        
        try {
            const message = {
                type: 'REQUEST_SYNC',
                playerId: this.playerId,
                version: this.localStateVersion
            };
            
            this.connection.send(JSON.stringify(message));
            console.log('📦 Requested full sync from server');
        } catch (error) {
            console.error('❌ Full sync request failed:', error);
        }
    }
    
    handleConnectionLoss() {
        this.isConnected = false;
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        console.log('📱 Connection lost, attempting to reconnect...');
        this.scheduleReconnect();
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.showConnectionError();
            return;
        }
        
        const delay = Math.min(
            this.reconnectDelay * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
            this.maxReconnectDelay
        );
        
        console.log(`⏳ Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    
    showConnectionError() {
        // Show user-friendly connection error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'multiplayer-error';
        errorDiv.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: #ff4444; color: white; padding: 15px; border-radius: 8px; z-index: 1000; max-width: 300px;">
                <h4>🔌 Connection Lost</h4>
                <p>Unable to connect to multiplayer server. Playing in offline mode.</p>
                <button onclick="this.parentElement.parentElement.remove(); window.location.reload();" style="background: white; color: #ff4444; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Retry Connection
                </button>
            </div>
        `;
        document.body.appendChild(errorDiv);
    }
    
    async connect() {
        try {
            console.log('🔌 Connecting to WebSocket server...');
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            
            this.connection = new WebSocket(wsUrl);
            
            this.connection.onopen = () => {
                console.log('📡 WebSocket connection established');
                this.sendJoinGame();
            };
            
            this.connection.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                } catch (error) {
                    console.error('❌ Error parsing WebSocket message:', error);
                }
            };
            
            this.connection.onclose = (event) => {
                console.log('📱 WebSocket connection closed:', event.code);
                this.handleConnectionLoss();
            };
            
            this.connection.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.handleConnectionLoss();
            };
            
        } catch (error) {
            console.error('❌ Failed to connect to multiplayer server:', error);
            this.scheduleReconnect();
        }
    }
    
    sendJoinGame() {
        const playerSettings = this.game.playerSettings || {};
        const message = {
            type: 'JOIN_GAME',
            playerId: this.getStoredPlayerId(),
            playerName: playerSettings.name || 'Player',
            playerColor: playerSettings.color || '#2196F3',
            playerEmoji: playerSettings.emoji || '🏠'
        };
        
        this.connection.send(JSON.stringify(message));
    }
    
    handleServerMessage(data) {
        this.lastHeartbeat = Date.now();
        
        switch (data.type) {
            case 'JOIN_SUCCESS':
                console.log('✅ Successfully joined game as:', data.player.name);
                this.playerId = data.playerId;
                localStorage.setItem('multiplayer_player_id', this.playerId);
                this.localStateVersion = data.version;
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                this.syncGameState(data.gameState);
                if (data.players) {
                    data.players.forEach(player => {
                        this.players.set(player.id, player);
                    });
                    this.updatePlayersDisplay();
                }
                
                // Start heartbeat after successful connection
                this.startHeartbeat();
                break;
                
            case 'STATE_UPDATE':
                this.syncGameState(data.gameState);
                if (data.players) {
                    data.players.forEach(player => {
                        this.players.set(player.id, player);
                    });
                    this.updatePlayersDisplay();
                }
                break;
                
            case 'STATE_DIFF':
                console.log('📦 Applying state diff...');
                this.applyStateDiff(data.diff);
                break;
                
            case 'ACTION_SUCCESS':
                console.log('✅ Action processed:', data.actionId);
                this.handleActionSuccess(data);
                break;
                
            case 'ACTION_ERROR':
                console.error('❌ Action failed:', data.error, data.message);
                this.handleActionError(data);
                break;
                
            case 'PLAYER_JOINED':
                console.log(`👥 Player joined: ${data.player.name}`);
                this.players.set(data.player.id, data.player);
                this.updatePlayersDisplay();
                this.showNotification(`${data.player.name} joined the game`, 'info');
                break;
                
            case 'PLAYER_LEFT':
                console.log(`👋 Player left: ${data.playerId}`);
                this.players.delete(data.playerId);
                this.updatePlayersDisplay();
                break;
                
            case 'HEARTBEAT':
            case 'HEARTBEAT_ACK':
                this.lastHeartbeat = Date.now();
                if (data.version) {
                    this.serverStateVersion = data.version;
                }
                break;
                
            case 'GAME_RESET':
                console.log('🔄 Game reset by server');
                this.localStateVersion = 0;
                location.reload(); // Force page refresh for clean slate
                break;
                
            case 'CONFLICT_DETECTED':
                console.warn('⚠️ Action conflict detected:', data.conflict);
                this.handleConflict(data.conflict);
                break;
            case 'AUCTION_CREATED':
                console.log('옥션 생성', data.listing);
                this.game.actionManager.marketplace.listings.push(data.listing);
                this.game.updateActionDisplay();
                this.game.actionMarketplace.updateMarketplaceDisplay();
                this.game.switchMarketplaceTab('marketplace');
                break;
            case 'AUCTION_ENDED':
                console.log('Auction ended', data.listing);
                const listing = this.game.actionManager.marketplace.listings.find(l => l.id === data.listingId);
                if (listing) {
                    Object.assign(listing, data.listing);
                }
                this.game.updatePlayerStats();
                this.game.updateActionDisplay();
                this.game.actionMarketplace.updateMarketplaceDisplay();
                this.game.refreshMarketplaceListings();
                break;
            case 'AUCTION_UPDATED':
                console.log('Auction updated', data.listing);
                const updatedListing = this.game.actionManager.marketplace.listings.find(l => l.id === data.listingId);
                if (updatedListing) {
                    Object.assign(updatedListing, data.listing);
                }
                this.game.updatePlayerStats();
                this.game.actionMarketplace.updateMarketplaceDisplay();
                this.game.refreshMarketplaceListings();
                break;
                
            default:
                console.log('📨 Received server message:', data);
        }
    }
    
    applyStateDiff(diff) {
        if (diff.version <= this.localStateVersion) {
            console.log('⏸️ Ignoring old diff version');
            return;
        }
        
        console.log(`📦 Applying diff v${this.localStateVersion} → v${diff.version}`);
        
        // Apply parcel changes
        if (diff.changes.parcels) {
            Object.entries(diff.changes.parcels).forEach(([parcelId, parcelData]) => {
                const [row, col] = parcelId.split('-').map(Number);
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    if (parcelData === null) {
                        // Parcel was reset/removed
                        this.game.grid[row][col].owner = null;
                        this.game.grid[row][col].building = null;
                    } else {
                        // Update parcel data
                        Object.assign(this.game.grid[row][col], parcelData);
                    }
                }
            });
        }
        
        // Apply player changes
        if (diff.changes.players) {
            Object.entries(diff.changes.players).forEach(([playerId, playerData]) => {
                if (playerData === null) {
                    this.players.delete(playerId);
                } else {
                    this.players.set(playerId, playerData);
                    
                    // Update local player data if it's current player
                    if (playerId === this.playerId) {
                        this.game.playerCash = playerData.cash || this.game.playerCash;
                        this.game.playerActions = playerData.actions || this.game.playerActions;
                    }
                }
            });
            this.updatePlayersDisplay();
        }
        
        // Apply calculated state changes
        if (diff.changes.calculated) {
            this.updateCalculatedState(diff.changes.calculated);
        }
        
        // Apply world state changes
        if (diff.changes.world) {
            if (diff.changes.world.currentDay !== undefined) {
                this.game.currentDay = diff.changes.world.currentDay;
            }
            if (diff.changes.world.currentMonth !== undefined) {
                this.game.currentMonth = diff.changes.world.currentMonth;
            }
        }
        
        this.localStateVersion = diff.version;
        this.game.updateDisplay();
    }
    
    updateCalculatedState(calculated) {
        // Update treasury display
        if (calculated.treasury !== undefined) {
            this.game.cityTreasury = calculated.treasury;
            this.updateTreasuryDisplay();
        }
        
        // Update population display
        if (calculated.population !== undefined) {
            this.game.totalPopulation = calculated.population;
            this.updatePopulationDisplay();
        }
        
        // Update vitality metrics
        if (calculated.vitality) {
            Object.entries(calculated.vitality).forEach(([metric, data]) => {
                if (this.game.vitalityMetrics && this.game.vitalityMetrics[metric]) {
                    Object.assign(this.game.vitalityMetrics[metric], data);
                }
            });
            this.game.updateVitalityDisplay();
        }
        
        // Update building efficiency data for tooltips
        if (calculated.buildingEfficiencies) {
            this.game.buildingEfficiencies = calculated.buildingEfficiencies;
            console.log(`🏢 Synced efficiency data for ${Object.keys(calculated.buildingEfficiencies).length} buildings`);
            
            // Debug: Log a sample efficiency
            if (Object.keys(calculated.buildingEfficiencies).length > 0) {
                const sampleParcel = Object.keys(calculated.buildingEfficiencies)[0];
                const sampleData = calculated.buildingEfficiencies[sampleParcel];
                console.log(`🔍 Client received efficiency: ${sampleParcel} = ${sampleData.efficiency}%, needs: ${sampleData.unsatisfiedNeeds?.length || 0}`);
            }
        }
    }
    
    handleActionSuccess(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        
        // Apply state changes from server
        if (data.stateChanges) {
            this.applyServerStateChanges(data.stateChanges);
        }
        
        this.actionCount++;
        console.log(`✅ Action confirmed by server: ${actionId}`);
    }
    
    handleActionError(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        
        // Handle specific error types
        if (data.error === 'PARCEL_ALREADY_OWNED') {
            this.showNotification('This parcel was purchased by another player', 'warning');
        } else if (data.error === 'BID_SUPERSEDED') {
            this.showNotification(`Another player bid higher. Try again.`, 'warning');
        } else {
            this.showNotification(data.message || 'Action failed', 'error');
        }
    }
    
    applyServerStateChanges(stateChanges) {
        console.log('📥 Applying server state changes:', stateChanges);
        
        // Apply parcel changes
        if (stateChanges.parcels) {
            Object.entries(stateChanges.parcels).forEach(([parcelId, serverParcel]) => {
                const [row, col] = parcelId.split('-').map(Number);
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    const localParcel = this.game.grid[row][col];
                    Object.assign(localParcel, serverParcel);
                }
            });
            
            // Trigger re-render
            if (this.game.scheduleRender) {
                this.game.scheduleRender();
            }
        }
        
        // Apply other state changes
        if (stateChanges.treasury !== undefined) {
            this.game.cityTreasury = stateChanges.treasury;
        }
        
        if (stateChanges.population !== undefined) {
            this.game.totalPopulation = stateChanges.population;
        }
    }
    
    handleConflict(conflict) {
        console.warn('⚠️ Handling conflict:', conflict);
        
        // Show user notification
        this.showNotification(`Action conflict: ${conflict.message}`, 'warning');
        
        // Request fresh state sync
        this.requestFullSync();
    }
    
    showNotification(message, type = 'info') {
        // Disabled - no toast notifications
        return;
    }
    
    async broadcastAction(action) {
        if (!this.isConnected || !this.playerId || !this.connection) {
            console.warn('⚠️ Not connected to multiplayer server');
            return { success: false, error: 'NOT_CONNECTED' };
        }
        
        // Add action metadata
        const enhancedAction = {
            ...action,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            clientVersion: this.localStateVersion,
            playerId: this.playerId
        };
        
        // Track pending action
        this.pendingActions.set(enhancedAction.id, {
            action: enhancedAction,
            timestamp: Date.now(),
            retries: 0
        });
        
        try {
            const message = {
                type: 'ACTION',
                action: enhancedAction,
                id: enhancedAction.id,
                clientVersion: this.localStateVersion
            };
            
            this.connection.send(JSON.stringify(message));
            console.log(`📤 Action ${enhancedAction.type} sent via WebSocket`);
            this.actionCount++;
            
            // WebSocket actions are handled via the message response
            return { success: true, pending: true };
            
        } catch (error) {
            console.error('❌ Error broadcasting action:', error);
            this.pendingActions.delete(enhancedAction.id);
            return { success: false, error: 'NETWORK_ERROR', message: error.message };
        }
    }
    
    async retryAction(action) {
        console.log(`🔄 Retrying action: ${action.type}`);
        
        // Update timestamp for retry
        action.timestamp = Date.now();
        action.clientVersion = this.localStateVersion;
        
        return this.broadcastAction(action);
    }
    
    // Cleanup old pending actions
    cleanupPendingActions() {
        const now = Date.now();
        const timeout = 30000; // 30 seconds
        
        for (const [actionId, pendingAction] of this.pendingActions) {
            if (now - pendingAction.timestamp > timeout) {
                console.warn(`⏰ Removing stale pending action: ${pendingAction.action.type}`);
                this.pendingActions.delete(actionId);
            }
        }
    }
    
    // Get connection status for UI
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            playerId: this.playerId,
            players: this.players.size,
            latency: this.latencyHistory.length > 0 
                ? Math.round(this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length)
                : 0,
            actions: this.actionCount,
            syncs: this.syncCount,
            version: this.localStateVersion,
            serverVersion: this.serverStateVersion,
            pendingActions: this.pendingActions.size
        };
    }
    
    syncGameState(serverState) {
        if (!serverState) return;
        
        // Sync parcel ownership
        if (serverState.parcels) {
            Object.entries(serverState.parcels).forEach(([parcelId, parcelData]) => {
                const [row, col] = parcelId.split('-').map(Number);
                if (this.game.grid[row] && this.game.grid[row][col]) {
                    const tile = this.game.grid[row][col];
                    
                    // Always sync all parcel data to prevent desync
                    let hasChanged = false;
                    
                    if (tile.owner !== parcelData.owner) {
                        console.log(`🔄 Syncing owner change: ${parcelId} ${tile.owner} → ${parcelData.owner}`);
                        tile.owner = parcelData.owner;
                        hasChanged = true;
                    }
                    
                    if (tile.building !== parcelData.building) {
                        console.log(`🔄 Syncing building change: ${parcelId} ${tile.building} → ${parcelData.building}`);
                        tile.building = parcelData.building;
                        hasChanged = true;
                    }
                    
                    // Always sync construction data (can change without building ID changing)
                    if (parcelData.constructionStartDay !== undefined && 
                        tile.constructionStartDay !== parcelData.constructionStartDay) {
                        tile.constructionStartDay = parcelData.constructionStartDay;
                        hasChanged = true;
                    }
                    if (parcelData.constructionDays !== undefined &&
                        tile.constructionDays !== parcelData.constructionDays) {
                        tile.constructionDays = parcelData.constructionDays;
                        hasChanged = true;
                    }
                    
                    // Update client-side construction progress when syncing from server
                    if (tile.constructionStartDay !== null && tile.constructionDays > 0) {
                        // Calculate construction progress based on server's currentDay
                        const serverCurrentDay = this.gameState?.core?.currentDay || 0;
                        const daysPassed = serverCurrentDay - tile.constructionStartDay;
                        const progress = Math.max(0, Math.min(1.0, daysPassed / tile.constructionDays));
                        
                        tile._constructionProgress = progress;
                        tile._isUnderConstruction = progress < 1.0;
                        
                        // Start client-side animation if still under construction
                        if (tile._isUnderConstruction) {
                            console.log(`🏗️ Starting client-side construction animation for ${parcelId}, progress: ${Math.round(progress * 100)}%`);
                        }
                    } else {
                        // Building is complete or doesn't have construction data
                        tile._constructionProgress = 1.0;
                        tile._isUnderConstruction = false;
                    }
                    
                    if (hasChanged) {
                        // Mark for visual update and force cache invalidation
                        this.game.dirtyRegions.add(`${row}-${col}`);
                        this.game.markVitalityDirty();
                        this.game.markBuildingEconomicsDirty(row, col);
                    }
                }
            });
        }
        
        // Sync marketplace listings
        if (serverState.marketplace && serverState.marketplace.listings) {
            this.game.actionManager.marketplace.listings = serverState.marketplace.listings;
            // Update marketplace display if modal is open
            if (document.getElementById('action-marketplace-modal').classList.contains('visible')) {
                this.game.actionMarketplace.updateMarketplaceDisplay();
            }
            this.game.updateMarketplaceDisplay();
        }
        
        // Schedule render if we have updates
        if (this.game.dirtyRegions.size > 0) {
            this.game.scheduleRender();
        }
    }
    
    updatePlayersDisplay() {
        // Add visual indicator of other players
        const playerCount = this.players.size;
        const playersOnline = Array.from(this.players.values()).filter(p => p.id !== this.playerId);
        
        // Update player menu or add status indicator
        const playerBtn = document.getElementById('player-btn');
        if (playerBtn && playersOnline.length > 0) {
            playerBtn.textContent = `PLAYER (${playerCount} online)`;
        }
        
        console.log(`👥 ${playerCount} players online:`, Array.from(this.players.keys()));
    }
    
    getStoredPlayerId() {
        return localStorage.getItem('multiplayer_player_id');
    }
    
    disconnect() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        this.isConnected = false;
        console.log('🔌 Disconnected from multiplayer server');
    }
    
    updateTreasuryDisplay() {
        const treasuryElement = document.getElementById('city-treasury');
        if (treasuryElement && this.game.cityTreasury !== undefined) {
            treasuryElement.textContent = `$${Math.round(this.game.cityTreasury).toLocaleString()}`;
        }
    }
    
    updatePopulationDisplay() {
        const populationElement = document.getElementById('total-residents');
        if (populationElement && this.game.totalPopulation !== undefined) {
            populationElement.textContent = this.game.totalPopulation.toLocaleString();
        }
    }
    
    // Hook into existing game actions to broadcast them
    async onParcelPurchased(row, col, building, purchasePrice, playerCash) {
        const result = await this.broadcastAction({
            type: 'PURCHASE_PARCEL',
            parcelId: `${row}-${col}`,
            building: building,
            purchasePrice: purchasePrice,
            timestamp: Date.now()
        });
        
        // Handle purchase collision
        if (!result.success && result.error === 'PARCEL_ALREADY_OWNED') {
            // Rollback the optimistic purchase
            this.rollbackParcelPurchase(row, col, purchasePrice, playerCash);
            
            // Show conflict notification
            this.showPurchaseConflict(result.currentOwner, row, col);
            
            return false; // Purchase failed
        }
        
        return result.success;
    }
    
    rollbackParcelPurchase(row, col, purchasePrice, originalCash) {
        // Revert the local state
        this.game.grid[row][col].owner = null;
        this.game.grid[row][col].landValue.paidPrice = 0;
        this.game.playerCash = originalCash; // Restore original cash
        
        // Force re-render to show the rollback
        this.game.scheduleRender();
        this.game.updateVitalityDisplay();
        this.game.updateDemographicsDisplay();
        this.game.calculateCurrentCashflow();
        this.game.updatePlayerStats();
        
        console.log(`🔄 Rolled back parcel purchase at ${row}-${col}`);
    }
    
    showPurchaseConflict(currentOwner, row, col) {
        // Get the current owner's display name and color
        let ownerName = 'Another player';
        let ownerColor = '#999';
        
        if (this.players.has(currentOwner)) {
            const owner = this.players.get(currentOwner);
            ownerName = currentOwner === this.playerId ? 'You' : `Player ${currentOwner.slice(-4)}`;
            ownerColor = owner.color || '#999';
        }
        
        // Show visual notification
        if (this.game.showNotification) {
            this.game.showNotification(
                `Parcel ${row}-${col} was already purchased by ${ownerName}`, 
                'conflict',
                4000
            );
        }
        
        console.log(`⚠️ Purchase conflict: Parcel ${row}-${col} owned by ${ownerName}`);
    }
    
    onBuildingConstructed(row, col, building, constructionData = {}) {
        this.broadcastAction({
            type: 'CONSTRUCT_BUILDING', 
            parcelId: `${row}-${col}`,
            building: building,
            constructionStartDay: constructionData.constructionStartDay,
            constructionDays: constructionData.constructionDays,
            timestamp: Date.now()
        });
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RailwayMultiplayerManager, MultiplayerManager };
}