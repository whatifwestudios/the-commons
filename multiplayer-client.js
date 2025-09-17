/**
 * Universal Multiplayer Client
 * Supports both WebSocket (Railway) and SSE (Vercel) backends
 */

class UniversalMultiplayerManager {
    constructor(game) {
        this.game = game;
        this.playerId = null;
        this.players = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        
        // Connection type detection
        this.connectionType = null; // 'websocket' or 'sse'
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
        
        // Auto-detect environment
        this.baseUrl = this.detectEnvironment();
        
        console.log('🎮 Universal MultiplayerManager initialized for:', this.baseUrl);
        this.startConnectionMonitoring();
    }
    
    detectEnvironment() {
        const host = window.location.host;
        
        if (host.includes('railway.app') || host.includes('localhost:3000')) {
            console.log('🚂 Railway environment detected - using WebSocket');
            this.connectionType = 'websocket';
            return window.location.origin;
        } else if (host.includes('vercel.app')) {
            console.log('▲ Vercel environment detected - using SSE');
            this.connectionType = 'sse';
            return window.location.origin;
        } else {
            // Default to SSE for unknown environments
            console.log('🌐 Unknown environment - defaulting to SSE');
            this.connectionType = 'sse';
            return window.location.origin;
        }
    }
    
    async connect() {
        try {
            console.log(`🔌 Connecting to ${this.connectionType} server...`);
            
            if (this.connectionType === 'websocket') {
                await this.connectWebSocket();
            } else {
                await this.connectSSE();
            }
            
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
    }
    
    async connectSSE() {
        // First join the game using REST API
        const playerSettings = this.game.playerSettings || {};
        const joinParams = new URLSearchParams({
            action: 'join',
            playerId: this.getStoredPlayerId() || '',
            playerName: playerSettings.name || 'Player',
            playerColor: playerSettings.color || '#2196F3',
            playerEmoji: playerSettings.emoji || '🏠'
        });
        
        const joinResponse = await fetch(`${this.baseUrl}/api/websocket?${joinParams}`);
        const joinData = await joinResponse.json();
        
        this.playerId = joinData.playerId;
        localStorage.setItem('multiplayer_player_id', this.playerId);
        
        // Update local state
        if (joinData.gameState) {
            this.syncGameState(joinData.gameState);
        }
        if (joinData.players) {
            joinData.players.forEach(player => {
                this.players.set(player.id, player);
            });
            this.updatePlayersDisplay();
        }
        
        // Start SSE stream
        this.connection = new EventSource(`${this.baseUrl}/api/websocket?action=stream&playerId=${this.playerId}`);
        
        this.connection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('❌ Error parsing SSE message:', error);
            }
        };
        
        this.connection.onerror = (error) => {
            console.error('❌ SSE error:', error);
            this.handleConnectionLoss();
        };
        
        this.connection.onopen = () => {
            console.log('📡 SSE connection established');
        };
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
        
        if (this.connectionType === 'websocket') {
            this.connection.send(JSON.stringify(message));
        }
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
                console.log('🏗️ Construction progress update');
                this.handleConstructionUpdate(data);
                break;
                
            case 'BUILDING_AGING_UPDATE':
                console.log('📈 Building aging update:', data.summary);
                // Buildings age and decay is handled automatically via full state sync
                // This message is just informational for logging
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
            if (this.connectionType === 'websocket') {
                return await this.sendWebSocketAction(enhancedAction);
            } else {
                return await this.sendSSEAction(enhancedAction);
            }
        } catch (error) {
            console.error('❌ Error broadcasting action:', error);
            this.pendingActions.delete(enhancedAction.id);
            return { success: false, error: 'NETWORK_ERROR', message: error.message };
        }
    }
    
    async sendWebSocketAction(action) {
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
    
    async sendSSEAction(action) {
        const startTime = Date.now();
        const response = await fetch(`${this.baseUrl}/api/websocket?action=action&playerId=${this.playerId}&version=${this.localStateVersion}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': this.localStateVersion.toString()
            },
            body: JSON.stringify(action)
        });
        
        const result = await response.json();
        const latency = Date.now() - startTime;
        this.recordLatency(latency);
        
        if (result.success) {
            console.log(`✅ Action ${action.type} sent successfully (${latency}ms)`);
            this.actionCount++;
        } else {
            console.error('❌ Failed to broadcast action:', result);
            this.pendingActions.delete(action.id);
        }
        
        return result;
    }
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatFrequency);
    }
    
    async sendHeartbeat() {
        if (!this.isConnected) return;
        
        try {
            if (this.connectionType === 'websocket') {
                this.connection.send(JSON.stringify({
                    type: 'HEARTBEAT',
                    timestamp: Date.now(),
                    version: this.localStateVersion
                }));
            } else {
                // SSE heartbeat via HTTP
                const response = await fetch(`${this.baseUrl}/api/websocket?action=heartbeat&playerId=${this.playerId}&version=${this.localStateVersion}`);
                const result = await response.json();
                
                if (result.success) {
                    this.lastHeartbeat = Date.now();
                    this.serverStateVersion = result.version;
                }
            }
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
            if (this.connectionType === 'websocket') {
                this.connection.close();
            } else {
                this.connection.close();
            }
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
        const notification = document.createElement('div');
        notification.className = `multiplayer-notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'warning' ? '#ff9800' : type === 'error' ? '#f44336' : '#4caf50'};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            z-index: 1000;
            max-width: 300px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
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
    }
    
    updatePlayersDisplay() {
        // Update the players display in the UI
        console.log(`👥 ${this.players.size} players connected`);
    }
    
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            type: this.connectionType,
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
            if (this.connectionType === 'websocket') {
                await this.sendWebSocketBatch(batch);
            } else {
                // For SSE, send actions individually (no batch support)
                for (const action of batch) {
                    await this.sendSSEAction(action);
                }
            }
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
                    
                    console.log(`🏗️ Construction progress at ${parcelId}: ${Math.round(constructionData.progress * 100)}%`);
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
    }
    
    /**
     * Sync transportation state from server
     */
    syncTransportationState(transportationState) {
        console.log('🛣️ Syncing transportation state from server...', transportationState);
        
        // Sync roads with MobilityLayer
        if (transportationState.roads && this.game.mobilityLayer) {
            // Clear existing roads and sync from server
            this.game.mobilityLayer.roads.clear();
            
            Object.entries(transportationState.roads).forEach(([roadKey, roadData]) => {
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
                if (playerData.governance.playerAllocations) {
                    this.game.governance.playerAllocations = { ...playerData.governance.playerAllocations };
                }
                if (playerData.governance.totalVotingPoints !== undefined) {
                    this.game.governance.totalVotingPoints = playerData.governance.totalVotingPoints;
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

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniversalMultiplayerManager;
}