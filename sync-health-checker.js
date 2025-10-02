/**
 * Synchronization Health Checker for The Commons
 *
 * Monitors and validates server-client synchronization health
 * Detects sync failures and provides debugging information
 */

class SyncHealthChecker {
    constructor(economicClient, game) {
        this.economicClient = economicClient;
        this.game = game;

        // Health metrics
        this.healthStatus = {
            overall: 'HEALTHY',
            lastServerUpdate: null,
            lastHeartbeat: null,
            syncFailures: 0,
            criticalElements: new Map()
        };

        // Track critical UI elements and their expected data sources
        this.criticalElements = {
            'game-date': {
                source: () => this.economicClient?.gameTime,
                element: () => document.getElementById('game-date'),
                validator: (value) => value !== null && value >= 0,
                required: true
            },
            'player-cash': {
                source: () => this.economicClient?.getCurrentPlayerBalance(),
                element: () => document.getElementById('player-cash'),
                validator: (value) => value !== null && value !== undefined,
                required: true
            },
            'current-actions': {
                source: () => this.economicClient?.getCurrentPlayerActions(),
                element: () => document.getElementById('current-actions'),
                validator: (value) => value !== null && value >= 0,
                required: true
            },
            'total-residents': {
                source: () => this.economicClient?.totalResidents,
                element: () => document.getElementById('total-residents'),
                validator: (value) => value !== null && value >= 0,
                required: true
            },
            'player-voting-points': {
                source: () => this.economicClient?.governance?.votingPoints,
                element: () => document.getElementById('player-voting-points'),
                validator: (value) => value !== null && value >= 0,
                required: false
            }
        };

        // Sync issue detection
        this.lastServerData = new Map();
        this.staleDataThreshold = 30000; // 30 seconds

        // Initialize monitoring
        this.initializeMonitoring();
    }

    /**
     * Initialize health monitoring systems
     */
    initializeMonitoring() {
        // Monitor server updates
        if (this.economicClient) {
            this.economicClient.onUpdate((update) => {
                this.handleServerUpdate(update);
            });
        }

        // Periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 5000); // Every 5 seconds

        // Heartbeat monitoring
        this.heartbeatInterval = setInterval(() => {
            this.checkHeartbeat();
        }, 15000); // Every 15 seconds

        console.log('🔍 Sync Health Checker initialized');
    }

    /**
     * Handle server update and track health
     */
    handleServerUpdate(update) {
        this.healthStatus.lastServerUpdate = Date.now();
        this.healthStatus.lastHeartbeat = Date.now();

        // Track specific data types
        if (update.type === 'GAME_STATE' || update.type === 'STATE_UPDATE') {
            this.recordDataUpdate('gameState', update.data || update);
        }

        if (update.type === 'GOVERNANCE_UPDATE') {
            this.recordDataUpdate('governance', update.data || update);
        }

        if (update.type === 'ECONOMIC_UPDATE') {
            this.recordDataUpdate('economic', update.data || update);
        }

        // Reset failure count on successful update
        if (this.healthStatus.syncFailures > 0) {
            this.healthStatus.syncFailures = Math.max(0, this.healthStatus.syncFailures - 1);
        }
    }

    /**
     * Record data update timestamp
     */
    recordDataUpdate(dataType, data) {
        this.lastServerData.set(dataType, {
            timestamp: Date.now(),
            data: data
        });
    }

    /**
     * Perform comprehensive health check
     */
    performHealthCheck() {
        const now = Date.now();
        let overallHealth = 'HEALTHY';
        const issues = [];

        // Check critical UI elements
        for (const [elementId, config] of Object.entries(this.criticalElements)) {
            const health = this.checkElementHealth(elementId, config);
            this.healthStatus.criticalElements.set(elementId, health);

            if (health.status === 'ERROR' && config.required) {
                overallHealth = 'CRITICAL';
                issues.push(`Critical element ${elementId}: ${health.issue}`);
            } else if (health.status === 'WARNING') {
                if (overallHealth === 'HEALTHY') overallHealth = 'WARNING';
                issues.push(`Warning for ${elementId}: ${health.issue}`);
            }
        }

        // Check server connectivity
        if (this.healthStatus.lastServerUpdate) {
            const timeSinceUpdate = now - this.healthStatus.lastServerUpdate;
            if (timeSinceUpdate > this.staleDataThreshold) {
                overallHealth = 'CRITICAL';
                issues.push(`No server updates for ${Math.round(timeSinceUpdate / 1000)}s`);
            }
        }

        // Update overall health
        const previousHealth = this.healthStatus.overall;
        this.healthStatus.overall = overallHealth;

        // Log health changes
        if (previousHealth !== overallHealth) {
            console.log(`🔍 Sync health changed: ${previousHealth} → ${overallHealth}`);
            if (issues.length > 0) {
                console.warn('🔍 Sync issues detected:', issues);
            }
        }

        // Update debug UI if available
        this.updateHealthDisplay();
    }

    /**
     * Check health of individual UI element
     */
    checkElementHealth(elementId, config) {
        const health = {
            status: 'HEALTHY',
            issue: null,
            lastCheck: Date.now()
        };

        try {
            // Check if element exists
            const element = config.element();
            if (!element) {
                health.status = config.required ? 'ERROR' : 'WARNING';
                health.issue = 'Element not found in DOM';
                return health;
            }

            // Check data source
            const sourceValue = config.source();
            if (!config.validator(sourceValue)) {
                health.status = config.required ? 'ERROR' : 'WARNING';
                health.issue = `Invalid data: ${sourceValue}`;
                return health;
            }

            // Check if UI reflects the data
            const displayedValue = this.extractDisplayValue(element);
            if (this.isDataStale(sourceValue, displayedValue, elementId)) {
                health.status = 'WARNING';
                health.issue = `UI may be stale: source=${sourceValue}, display=${displayedValue}`;
                return health;
            }

        } catch (error) {
            health.status = 'ERROR';
            health.issue = `Check failed: ${error.message}`;
        }

        return health;
    }

    /**
     * Extract displayed value from UI element
     */
    extractDisplayValue(element) {
        if (!element) return null;

        const text = element.textContent || element.innerText || '';

        // Try to extract numeric values
        const numberMatch = text.match(/[\d,]+/);
        if (numberMatch) {
            return parseInt(numberMatch[0].replace(/,/g, ''));
        }

        return text.trim();
    }

    /**
     * Check if displayed data is stale compared to source
     */
    isDataStale(sourceValue, displayedValue, elementId) {
        if (sourceValue === null || displayedValue === null) return false;

        // Handle numeric comparisons
        if (typeof sourceValue === 'number' && typeof displayedValue === 'number') {
            return Math.abs(sourceValue - displayedValue) > 0.01;
        }

        // Handle string comparisons
        return String(sourceValue) !== String(displayedValue);
    }

    /**
     * Check WebSocket heartbeat
     */
    checkHeartbeat() {
        if (!this.economicClient || !this.economicClient.ws) {
            this.recordSyncFailure('WebSocket not connected');
            return;
        }

        if (this.economicClient.ws.readyState !== WebSocket.OPEN) {
            this.recordSyncFailure('WebSocket not open');
            return;
        }

        // Send ping if supported
        try {
            if (this.economicClient.ws.ping) {
                this.economicClient.ws.ping();
            }
        } catch (error) {
            console.warn('🔍 Heartbeat ping failed:', error);
        }
    }

    /**
     * Record sync failure
     */
    recordSyncFailure(reason) {
        this.healthStatus.syncFailures++;
        console.warn(`🔍 Sync failure #${this.healthStatus.syncFailures}: ${reason}`);

        if (this.healthStatus.syncFailures >= 3) {
            this.healthStatus.overall = 'CRITICAL';
            console.error('🔍 Multiple sync failures detected - critical health state');
        }
    }

    /**
     * Update health display UI
     */
    updateHealthDisplay() {
        // Create or update health indicator
        let indicator = document.getElementById('sync-health-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sync-health-indicator';
            indicator.style.cssText = `
                position: fixed;
                bottom: 8px;
                left: 8px;
                padding: 4px 8px;
                font-size: 10px;
                font-weight: 500;
                border-radius: 4px;
                z-index: 10000;
                font-family: monospace;
                cursor: pointer;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(indicator);

            // Add click handler for detailed status
            indicator.addEventListener('click', () => {
                this.showDetailedStatus();
            });
        }

        // Update indicator based on health
        const { overall } = this.healthStatus;
        let color, bg, text;

        switch (overall) {
            case 'HEALTHY':
                color = '#4CAF50';
                bg = 'rgba(76, 175, 80, 0.1)';
                text = '● SYNC OK';
                break;
            case 'WARNING':
                color = '#FF9800';
                bg = 'rgba(255, 152, 0, 0.1)';
                text = '⚠ SYNC WARN';
                break;
            case 'CRITICAL':
                color = '#F44336';
                bg = 'rgba(244, 67, 54, 0.1)';
                text = '✕ SYNC FAIL';
                break;
            default:
                color = '#999';
                bg = 'rgba(153, 153, 153, 0.1)';
                text = '? SYNC UNK';
        }

        indicator.style.color = color;
        indicator.style.backgroundColor = bg;
        indicator.style.border = `1px solid ${color}`;
        indicator.textContent = text;
    }

    /**
     * Show detailed status modal
     */
    showDetailedStatus() {
        const details = this.generateDetailedReport();

        // Create modal
        let modal = document.getElementById('sync-health-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'sync-health-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 20000;
                font-family: monospace;
            `;
            document.body.appendChild(modal);

            // Close on click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        }

        modal.innerHTML = `
            <div style="
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 20px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                color: #ccc;
            ">
                <h3 style="margin: 0 0 15px 0; color: #fff;">Synchronization Health Report</h3>
                <pre style="margin: 0; font-size: 12px; line-height: 1.4;">${details}</pre>
                <button onclick="this.closest('#sync-health-modal').remove()"
                        style="margin-top: 15px; padding: 8px 16px; background: #333; border: 1px solid #555; border-radius: 4px; color: #ccc; cursor: pointer;">
                    Close
                </button>
            </div>
        `;
    }

    /**
     * Generate detailed health report
     */
    generateDetailedReport() {
        const now = Date.now();
        let report = '';

        report += `Overall Status: ${this.healthStatus.overall}\n`;
        report += `Last Server Update: ${this.healthStatus.lastServerUpdate ?
            `${Math.round((now - this.healthStatus.lastServerUpdate) / 1000)}s ago` : 'Never'}\n`;
        report += `Sync Failures: ${this.healthStatus.syncFailures}\n\n`;

        report += 'Critical Elements:\n';
        report += '─'.repeat(50) + '\n';

        for (const [elementId, health] of this.healthStatus.criticalElements) {
            const config = this.criticalElements[elementId];
            const statusIcon = health.status === 'HEALTHY' ? '✓' :
                             health.status === 'WARNING' ? '⚠' : '✗';

            report += `${statusIcon} ${elementId}\n`;
            report += `  Status: ${health.status}\n`;
            if (health.issue) {
                report += `  Issue: ${health.issue}\n`;
            }

            try {
                const sourceValue = config.source();
                const element = config.element();
                const displayValue = element ? this.extractDisplayValue(element) : 'N/A';
                report += `  Source: ${sourceValue}\n`;
                report += `  Display: ${displayValue}\n`;
            } catch (error) {
                report += `  Error: ${error.message}\n`;
            }

            report += '\n';
        }

        report += 'Recent Data Updates:\n';
        report += '─'.repeat(50) + '\n';

        for (const [dataType, update] of this.lastServerData) {
            const ageSeconds = Math.round((now - update.timestamp) / 1000);
            report += `${dataType}: ${ageSeconds}s ago\n`;
        }

        return report;
    }

    /**
     * Get current health status
     */
    getHealthStatus() {
        return {
            ...this.healthStatus,
            criticalElements: Object.fromEntries(this.healthStatus.criticalElements)
        };
    }

    /**
     * Cleanup monitoring
     */
    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // Remove UI elements
        const indicator = document.getElementById('sync-health-indicator');
        if (indicator) indicator.remove();

        const modal = document.getElementById('sync-health-modal');
        if (modal) modal.remove();

        console.log('🔍 Sync Health Checker destroyed');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SyncHealthChecker;
}

// Global initialization
if (typeof window !== 'undefined') {
    window.SyncHealthChecker = SyncHealthChecker;

    // Auto-initialize when both game and economic client are ready
    const initHealthChecker = () => {
        if (window.game && window.gameEconomicClient && !window.syncHealthChecker) {
            window.syncHealthChecker = new SyncHealthChecker(window.gameEconomicClient, window.game);
            console.log('🔍 Auto-initialized Sync Health Checker');
        }
    };

    // Try initialization periodically
    const initInterval = setInterval(() => {
        initHealthChecker();
        if (window.syncHealthChecker) {
            clearInterval(initInterval);
        }
    }, 1000);

    // Stop trying after 30 seconds
    setTimeout(() => {
        clearInterval(initInterval);
    }, 30000);
}