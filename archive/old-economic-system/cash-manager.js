/**
 * CashManager - Server-Authoritative Cash Management System
 *
 * Provides transaction-safe, server-validated cash operations
 * Eliminates race conditions and NaN propagation issues
 */

class CashManager {
    constructor(game) {
        this.game = game;

        // FRESH START: Always begin with $6,000 (board game philosophy)
        this._balance = 6000;
        this.initialized = true;

        // Add balance setter trap to catch unauthorized changes
        Object.defineProperty(this, 'balance', {
            get: function() {
                return this._balance;
            },
            set: function(value) {
                if (this._balance !== value) {
                    console.log('💰 CashManager balance change detected:', this._balance, '->', value);
                }
                this._balance = value;
            }
        });

        // Check for reset flag and clear it
        const forceReset = localStorage.getItem('theCommons_forceReset');
        if (forceReset === 'true') {
            localStorage.removeItem('theCommons_forceReset');
        }

        this.pendingTransactions = new Map(); // Track pending operations
        this.transactionId = 0;
        this.lastSyncTime = 0;
        this.syncInterval = 5000; // Sync with server every 5 seconds

        // Setup periodic sync and force immediate UI update
        this.setupSync();
        setTimeout(() => {
            this.notifyBalanceChange();
        }, 100);
    }


    /**
     * Get current cash balance (cached from server)
     */
    getBalance() {
        return this.balance;
    }

    /**
     * Spend money - server-validated transaction
     * @param {number} amount - Amount to spend
     * @param {string} reason - Reason for transaction (building, road, etc.)
     * @param {Object} context - Additional context (coordinates, building type, etc.)
     * @returns {Promise<Object>} Transaction result
     */
    async spend(amount, reason, context = {}) {
        const transactionId = this.generateTransactionId();

        try {
            // Validate locally first
            if (amount <= 0) {
                throw new Error('Amount must be positive');
            }

            if (this.balance < amount) {
                throw new Error(`Insufficient funds: need $${amount.toLocaleString()}, have $${this.balance.toLocaleString()}`);
            }

            // Optimistic update for UI responsiveness
            const originalBalance = this.balance;
            this.balance -= amount;
            this.notifyBalanceChange();

            // Track pending transaction
            this.pendingTransactions.set(transactionId, {
                type: 'spend',
                amount: amount,
                reason: reason,
                context: context,
                originalBalance: originalBalance,
                timestamp: Date.now()
            });

            // Send to server for validation
            const result = await this.sendTransaction({
                id: transactionId,
                type: 'spend',
                amount: amount,
                reason: reason,
                context: context,
                playerId: this.game.currentPlayerId || this.game.multiplayerManager?.playerId || 'player'
            });

            // Remove from pending
            this.pendingTransactions.delete(transactionId);

            if (result.success) {
                // Server confirmed - update with authoritative balance
                this.balance = result.newBalance;
                this.notifyBalanceChange();

                return {
                    success: true,
                    transactionId: transactionId,
                    newBalance: result.newBalance,
                    message: `Spent $${amount.toLocaleString()} on ${reason}`
                };
            } else {
                // Server rejected - rollback optimistic change
                this.balance = originalBalance;
                this.notifyBalanceChange();
                throw new Error(result.error || 'Transaction rejected by server');
            }

        } catch (error) {
            // Rollback on any error
            if (this.pendingTransactions.has(transactionId)) {
                const transaction = this.pendingTransactions.get(transactionId);
                this.balance = transaction.originalBalance;
                this.pendingTransactions.delete(transactionId);
                this.notifyBalanceChange();
            }

            throw error;
        }
    }

    /**
     * Earn money - server-validated transaction
     * @param {number} amount - Amount to earn
     * @param {string} reason - Reason for earning (revenue, sale, etc.)
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Transaction result
     */
    async earn(amount, reason, context = {}) {
        const transactionId = this.generateTransactionId();

        try {
            // Validate locally first
            if (amount <= 0) {
                throw new Error('Amount must be positive');
            }

            // Optimistic update
            const originalBalance = this.balance;
            this.balance += amount;
            this.notifyBalanceChange();

            // Track pending transaction
            this.pendingTransactions.set(transactionId, {
                type: 'earn',
                amount: amount,
                reason: reason,
                context: context,
                originalBalance: originalBalance,
                timestamp: Date.now()
            });

            // Send to server
            const result = await this.sendTransaction({
                id: transactionId,
                type: 'earn',
                amount: amount,
                reason: reason,
                context: context,
                playerId: this.game.currentPlayerId || this.game.multiplayerManager?.playerId || 'player'
            });

            // Remove from pending
            this.pendingTransactions.delete(transactionId);

            if (result.success) {
                // Server confirmed - update with authoritative balance
                this.balance = result.newBalance;
                this.notifyBalanceChange();

                return {
                    success: true,
                    transactionId: transactionId,
                    newBalance: result.newBalance,
                    message: `Earned $${amount.toLocaleString()} from ${reason}`
                };
            } else {
                // Server rejected - rollback
                this.balance = originalBalance;
                this.notifyBalanceChange();
                throw new Error(result.error || 'Transaction rejected by server');
            }

        } catch (error) {
            // Rollback on any error
            if (this.pendingTransactions.has(transactionId)) {
                const transaction = this.pendingTransactions.get(transactionId);
                this.balance = transaction.originalBalance;
                this.pendingTransactions.delete(transactionId);
                this.notifyBalanceChange();
            }

            throw error;
        }
    }

    /**
     * Apply daily cashflow (server-calculated)
     * @param {Object} cashflowData - Server-calculated cashflow breakdown
     */
    async applyDailyCashflow(cashflowData) {
        if (!cashflowData || typeof cashflowData.netCashflow !== 'number' || isNaN(cashflowData.netCashflow)) {
            console.warn('Invalid daily cashflow data:', cashflowData);
            return;
        }

        try {
            const result = await this.sendTransaction({
                id: this.generateTransactionId(),
                type: 'daily_cashflow',
                amount: cashflowData.netCashflow,
                reason: 'Daily operations',
                context: {
                    revenue: cashflowData.totalRevenue,
                    maintenance: cashflowData.totalMaintenance,
                    lvt: cashflowData.totalLVT,
                    breakdown: cashflowData.breakdown
                },
                playerId: this.game.currentPlayerId || this.game.multiplayerManager?.playerId || 'player'
            });

            if (result.success) {
                this.balance = result.newBalance;
                this.notifyBalanceChange();
            }

        } catch (error) {
            console.error('Failed to apply daily cashflow:', error);
        }
    }

    /**
     * Sync balance with server (periodic and on-demand)
     */
    async syncBalance() {
        const playerId = this.game.currentPlayerId || this.game.multiplayerManager?.playerId || null;

        // Skip sync if no player ID is available
        if (!playerId) {
            return;
        }

        try {
            // console.log('🔄 CashManager syncBalance: Starting sync, current balance:', this.balance); // Reduced debug noise

            const response = await fetch('/api/player/balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: playerId
                })
            });

            const result = await response.json();
            // console.log('🔄 CashManager syncBalance: Server response:', result); // Reduced debug noise

            if (result.success) {
                const serverBalance = result.balance;

                // Only update if significantly different (avoid unnecessary UI updates)
                if (Math.abs(this.balance - serverBalance) > 0.01) {
                    this.balance = serverBalance;
                    this.notifyBalanceChange();
                } else {
                    // console.log('🔄 CashManager syncBalance: No update needed, values are close:', this.balance, 'vs', serverBalance); // Reduced debug noise
                }

                this.lastSyncTime = Date.now();
            } else {
                console.warn('🔄 CashManager syncBalance: Server returned error:', result);
            }

        } catch (error) {
            console.warn('Balance sync failed:', error);
        }
    }

    /**
     * Send transaction to server for validation
     */
    async sendTransaction(transaction) {
        const response = await fetch('/api/cash/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Generate unique transaction ID
     */
    generateTransactionId() {
        return `txn_${++this.transactionId}_${Date.now()}`;
    }

    /**
     * Setup periodic balance sync
     */
    setupSync() {
        setInterval(() => {
            if (Date.now() - this.lastSyncTime > this.syncInterval) {
                this.syncBalance();
            }
        }, this.syncInterval);

        // Delay initial sync until player ID is available
        setTimeout(() => {
            if (this.game.currentPlayerId) {
                this.syncBalance();
            } else {
                console.log('🔄 CashManager: Waiting for player ID before initial sync');
            }
        }, 500); // Give time for player config to be set
    }

    /**
     * Force reset cash to $6,000 for testing purposes
     */
    forceReset6k() {
        this.balance = 6000;
        this.notifyBalanceChange();
        console.log('💰 FORCED RESET: Cash set to $6,000');

        // Also reset on server
        fetch('/api/player/reset-balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: this.game.currentPlayerId || this.game.multiplayerManager?.playerId || 'player'
            })
        }).catch(error => console.error('Failed to reset server balance:', error));
    }

    /**
     * Notify game of balance changes for UI updates
     */
    notifyBalanceChange() {
        // Update game's playerCash property to maintain consistency
        if (this.game) {
            this.game.playerCash = this.balance;
        }

        // Direct DOM update safeguard - ensure UI displays correct value immediately
        if (this.game && this.game.domCache && this.game.domCache.playerCash) {
            const expectedText = `$${Math.round(this.balance).toLocaleString()}`;
            const currentText = this.game.domCache.playerCash.textContent;

            if (currentText !== expectedText) {
                console.log('💰 CashManager: Direct DOM correction from', currentText, 'to', expectedText);
                this.game.domCache.playerCash.textContent = expectedText;
            }
        }

        // Trigger UI update
        if (this.game.updatePlayerStats) {
            this.game.updatePlayerStats();
        }

        // Fire custom event for other systems
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cashBalanceChanged', {
                detail: {
                    newBalance: this.balance,
                    manager: this
                }
            }));
        }
    }

    /**
     * Check if player can afford a purchase
     * @param {number} amount - Amount to check
     * @returns {boolean} Whether player can afford it
     */
    canAfford(amount) {
        return this.balance >= amount;
    }

    /**
     * Get transaction history (if needed for debugging)
     */
    getPendingTransactions() {
        return Array.from(this.pendingTransactions.values());
    }

    /**
     * Clean up old pending transactions (if connection issues)
     */
    cleanupStaleTransactions() {
        const now = Date.now();
        const maxAge = 30000; // 30 seconds

        for (const [id, transaction] of this.pendingTransactions) {
            if (now - transaction.timestamp > maxAge) {
                console.warn('Cleaning up stale transaction:', id);
                // Rollback the optimistic change
                if (transaction.type === 'spend') {
                    this.balance += transaction.amount;
                } else if (transaction.type === 'earn') {
                    this.balance -= transaction.amount;
                }
                this.pendingTransactions.delete(id);
            }
        }

        if (this.pendingTransactions.size > 0) {
            this.notifyBalanceChange();
        }
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.CashManager = CashManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CashManager;
}