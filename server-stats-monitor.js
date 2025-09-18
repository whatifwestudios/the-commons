/**
 * Server Stats Monitor for The Commons
 * Tracks multiplayer sync state, latency, and game element synchronization
 */

class ServerStatsMonitor {
    constructor() {
        // Connection stats
        this.connectionStats = {
            isConnected: false,
            latency: 0,
            avgLatency: 0,
            minLatency: Infinity,
            maxLatency: 0,
            lastPing: 0,
            reconnects: 0
        };
        
        // Sync stats
        this.syncStats = {
            pendingActions: 0,
            confirmedActions: 0,
            rejectedActions: 0,
            lastSync: Date.now(),
            syncRate: 0,
            outOfSync: false
        };
        
        // Game element stats
        this.elementStats = {
            players: { local: 0, remote: 0, total: 0 },
            buildings: { local: 0, synced: 0, pending: 0 },
            parcels: { owned: 0, unclaimed: 0, total: 0 },
            roads: { built: 0, total: 0, cost: 0 },
            transactions: { sent: 0, received: 0, failed: 0 }
        };
        
        // WebSocket stats
        this.wsStats = {
            messagesIn: 0,
            messagesOut: 0,
            bytesIn: 0,
            bytesOut: 0,
            errors: 0,
            protocol: 'WebSocket'
        };
        
        // Performance tracking
        this.latencySamples = [];
        this.maxSamples = 50;
        
        // Display element
        this.displayElement = null;
        this.isVisible = false;
        
        // Update interval
        this.updateInterval = null;
    }
    
    /**
     * Initialize server stats display
     */
    initDisplay() {
        // Remove existing display if present
        const existing = document.getElementById('server-stats-monitor');
        if (existing) existing.remove();
        
        // Create display element
        this.displayElement = document.createElement('div');
        this.displayElement.id = 'server-stats-monitor';
        this.displayElement.style.cssText = `
            position: fixed;
            top: 60px;
            right: 10px;
            background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
            color: #ffffff;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 12px;
            padding: 0;
            border: 1px solid #333;
            border-radius: 8px;
            z-index: 10000;
            min-width: 280px;
            max-width: 320px;
            user-select: none;
            cursor: move;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            display: ${this.isVisible ? 'block' : 'none'};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(90deg, #2a2a2a, #1f1f1f);
            padding: 8px 12px;
            border-bottom: 1px solid #333;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span style="font-weight: 600; color: #52C77E;">SERVER STATS</span>
            <button style="
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                width: 20px;
                height: 20px;
            " onclick="game.serverStatsMonitor.hide()">×</button>
        `;
        
        // Create content area
        const content = document.createElement('div');
        content.id = 'server-stats-content';
        content.style.cssText = `
            padding: 12px;
            max-height: 400px;
            overflow-y: auto;
        `;
        
        this.displayElement.appendChild(header);
        this.displayElement.appendChild(content);
        
        // Make draggable
        this.makeDraggable(this.displayElement);
        
        document.body.appendChild(this.displayElement);
        
        // Start updating
        this.startUpdating();
    }
    
    /**
     * Make element draggable
     */
    makeDraggable(element) {
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        const header = element.querySelector('div');
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return; // Don't drag on close button
            
            isDragging = true;
            dragOffset.x = e.clientX - element.offsetLeft;
            dragOffset.y = e.clientY - element.offsetTop;
            element.style.zIndex = '10002';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;
            
            element.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
            element.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
            element.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10000';
            }
        });
    }
    
    /**
     * Show the stats panel
     */
    show() {
        this.isVisible = true;
        if (!this.displayElement) {
            this.initDisplay();
        } else {
            this.displayElement.style.display = 'block';
            this.startUpdating();
        }
    }
    
    /**
     * Hide the stats panel
     */
    hide() {
        this.isVisible = false;
        if (this.displayElement) {
            this.displayElement.style.display = 'none';
        }
        this.stopUpdating();
    }
    
    /**
     * Start automatic updates
     */
    startUpdating() {
        this.stopUpdating(); // Clear any existing interval
        this.updateDisplay(); // Initial update
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 100); // Update 10 times per second
    }
    
    /**
     * Stop automatic updates
     */
    stopUpdating() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Update latency measurement
     */
    updateLatency(latency) {
        this.connectionStats.latency = latency;
        this.latencySamples.push(latency);
        
        if (this.latencySamples.length > this.maxSamples) {
            this.latencySamples.shift();
        }
        
        // Calculate statistics
        if (this.latencySamples.length > 0) {
            this.connectionStats.avgLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
            this.connectionStats.minLatency = Math.min(...this.latencySamples);
            this.connectionStats.maxLatency = Math.max(...this.latencySamples);
        }
    }
    
    /**
     * Update sync statistics
     */
    updateSyncStats(stats) {
        Object.assign(this.syncStats, stats);
    }
    
    /**
     * Update element statistics
     */
    updateElementStats(stats) {
        Object.assign(this.elementStats, stats);
    }
    
    /**
     * Track partial update for bandwidth monitoring
     */
    trackPartialUpdate(updateSize) {
        // Track partial update statistics for bandwidth monitoring
        if (typeof updateSize === 'number') {
            this.wsStats.bytesIn += updateSize;
        }
    }
    
    /**
     * Update WebSocket statistics
     */
    updateWSStats(stats) {
        Object.assign(this.wsStats, stats);
    }
    
    /**
     * Format bytes for display
     */
    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    /**
     * Format currency for display
     */
    formatCurrency(amount) {
        if (amount < 1000) return amount.toString();
        if (amount < 1000000) return (amount / 1000).toFixed(1) + 'K';
        return (amount / 1000000).toFixed(1) + 'M';
    }
    
    /**
     * Get latency color based on value
     */
    getLatencyColor(latency) {
        if (latency < 50) return '#4CAF50';  // Green
        if (latency < 100) return '#FFC107'; // Yellow
        if (latency < 200) return '#FF9800'; // Orange
        return '#F44336'; // Red
    }
    
    /**
     * Update the display
     */
    updateDisplay() {
        if (!this.displayElement || !this.isVisible) return;
        
        const content = document.getElementById('server-stats-content');
        if (!content) return;
        
        // Get current multiplayer state
        const game = window.game;
        const isMultiplayer = game?.multiplayerManager?.isConnected || false;
        const playerId = game?.multiplayerManager?.playerId || 'N/A';
        const gameId = game?.multiplayerManager?.gameId || 'N/A';
        
        // Update road count from current game state
        if (game?.mobilityLayer?.roads) {
            this.elementStats.roads.total = game.mobilityLayer.roads.size;
        }
        
        // Connection status
        const connectionColor = isMultiplayer ? '#4CAF50' : '#F44336';
        const connectionStatus = isMultiplayer ? 'Connected' : 'Disconnected';
        
        // Calculate sync rate
        const syncRate = this.syncStats.confirmedActions > 0 ? 
            Math.round((this.syncStats.confirmedActions / (this.syncStats.confirmedActions + this.syncStats.rejectedActions)) * 100) : 100;
        
        const html = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <!-- Connection Status -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">CONNECTION</div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: ${connectionColor};">● ${connectionStatus}</span>
                        <span style="color: #666; font-size: 10px;">${gameId}</span>
                    </div>
                </div>
                
                <!-- Latency -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">LATENCY</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: ${this.getLatencyColor(this.connectionStats.latency)}; font-size: 18px; font-weight: 600;">
                            ${Math.round(this.connectionStats.latency)}ms
                        </span>
                        <div style="text-align: right; font-size: 10px; color: #666;">
                            <div>Avg: ${Math.round(this.connectionStats.avgLatency)}ms</div>
                            <div>Min/Max: ${Math.round(this.connectionStats.minLatency)}/${Math.round(this.connectionStats.maxLatency)}ms</div>
                        </div>
                    </div>
                </div>
                
                <!-- Sync Status -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">SYNC STATUS</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <span style="color: #666; font-size: 10px;">Pending:</span>
                            <span style="color: #FFC107;">${this.syncStats.pendingActions}</span>
                        </div>
                        <div>
                            <span style="color: #666; font-size: 10px;">Confirmed:</span>
                            <span style="color: #4CAF50;">${this.syncStats.confirmedActions}</span>
                        </div>
                        <div>
                            <span style="color: #666; font-size: 10px;">Rejected:</span>
                            <span style="color: #F44336;">${this.syncStats.rejectedActions}</span>
                        </div>
                        <div>
                            <span style="color: #666; font-size: 10px;">Sync Rate:</span>
                            <span style="color: ${syncRate > 90 ? '#4CAF50' : syncRate > 70 ? '#FFC107' : '#F44336'};">${syncRate}%</span>
                        </div>
                    </div>
                </div>
                
                <!-- Game Elements -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">GAME ELEMENTS</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                        <div>Players: <span style="color: #52C77E;">${this.elementStats.players.total}</span></div>
                        <div>Buildings: <span style="color: #52C77E;">${this.elementStats.buildings.synced}</span></div>
                        <div>Parcels: <span style="color: #52C77E;">${this.elementStats.parcels.total}</span></div>
                        <div>Roads: <span style="color: #2196F3;">${this.elementStats.roads.total}</span></div>
                        <div>Pending: <span style="color: #FFC107;">${this.elementStats.buildings.pending}</span></div>
                        <div>Road Cost: <span style="color: #888;">$${this.formatCurrency(this.elementStats.roads.cost)}</span></div>
                    </div>
                </div>
                
                <!-- Network Stats -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">NETWORK</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px;">
                        <div>↓ In: <span style="color: #4CAF50;">${this.formatBytes(this.wsStats.bytesIn)}</span></div>
                        <div>↑ Out: <span style="color: #2196F3;">${this.formatBytes(this.wsStats.bytesOut)}</span></div>
                        <div>Msgs In: <span style="color: #888;">${this.wsStats.messagesIn}</span></div>
                        <div>Msgs Out: <span style="color: #888;">${this.wsStats.messagesOut}</span></div>
                    </div>
                </div>
                
                <!-- Player Info -->
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">PLAYER</div>
                    <div style="font-size: 10px; color: #666; word-break: break-all;">${playerId}</div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerStatsMonitor;
}