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
                
            default:
                console.log('📨 Received server message:', data);
        }
    }
    
    async broadcastAction(action) {
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
        
        this.game.updateDisplay();
    }
    
    handleActionSuccess(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        this.actionCount++;
    }
    
    handleActionError(data) {
        const actionId = data.actionId;
        if (this.pendingActions.has(actionId)) {
            this.pendingActions.delete(actionId);
        }
        this.showNotification(data.message || 'Action failed', 'error');
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
        // Implement the same syncGameState logic from the original
        if (!serverState) return;
        
        // This would contain the same logic as the original MultiplayerManager
        console.log('🔄 Syncing game state...');
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
            pendingActions: this.pendingActions.size
        };
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
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UniversalMultiplayerManager;
}