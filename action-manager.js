/**
 * Unified Action Manager for The Commons
 * Consolidates all action-related functionality from game.js and marketplace
 */

class ActionManager {
    constructor(game) {
        this.game = game;

        // V2: Server-authoritative action state (client displays server data)
        // Note: Actual action counts come from economic client sync

        // Action costs configuration
        this.actionCosts = {
            purchaseParcel: 1,
            constructBuilding: 1,
            participateAuction: 1
        };

        // Marketplace integration
        this.marketplace = {
            isOpen: false,
            listings: []
        };
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    /**
     * Calculate monthly action allowance based on current month
     * September gets 20 actions, then 2 less each month until minimum of 10
     */
    calculateMonthlyActionAllowance() {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN GHOST PLACEHOLDER
        return 'GHOST';
    }

    /**
     * Refresh monthly actions when month changes
     */
    refreshMonthlyActions() {
        const currentActions = this.currentActions;
        const oldAllowance = this.monthlyAllowance;
        const newAllowance = this.calculateMonthlyActionAllowance();

        // Update the monthly allowance
        this.monthlyAllowance = newAllowance;

        // Calculate purchased actions (any actions beyond the old monthly allowance)
        const purchasedActions = Math.max(0, currentActions - oldAllowance);

        // Reset to new monthly allowance + purchased actions only
        this.currentActions = newAllowance + purchasedActions;
        this.usedThisMonth = 0;
        this.updateActionDisplay();

        // Add visual flair for actions refresh
        this.addActionsRefreshAnimation();
    }

    /**
     * Check if player can use a specific action type (server-authoritative)
     */
    canUseAction(actionType, cost = null) {
        const actionCost = cost || this.actionCosts[actionType] || 1;
        const currentActions = this.getCurrentActions();
        return currentActions >= actionCost;
    }

    /**
     * Check if player can use a specific number of actions (server-authoritative)
     */
    canUseActions(count) {
        const currentActions = this.getCurrentActions();
        return currentActions >= count;
    }

    /**
     * Get current action count from server-authoritative source
     */
    getCurrentActions() {
        if (this.game.economicClient && this.game.economicClient.getCurrentPlayerActions) {
            return this.game.economicClient.getCurrentPlayerActions();
        }
        // Fallback to default monthly allowance
        return this.calculateMonthlyActionAllowance();
    }

    /**
     * Use a specific action type (V2: Server-authoritative)
     */
    async useAction(actionType, cost = null) {
        const actionCost = cost || this.actionCosts[actionType] || 1;

        if (!this.canUseAction(actionType, actionCost)) {
            this.game.showNotification('Not enough actions! Visit the marketplace to buy more.', 'error');
            return false;
        }

        // V2: Send action spend transaction to server
        try {
            if (this.game.economicClient && this.game.economicClient.sendTransaction) {
                const transaction = {
                    type: 'ACTION_SPEND',
                    playerId: this.game.currentPlayerId,
                    count: actionCost,
                    reason: actionType
                };

                const result = await this.game.economicClient.sendTransaction(transaction);
                if (result.success) {
                    console.log(`🎯 Server confirmed action spend: ${actionCost} for ${actionType}`);
                    this.updateActionDisplay();
                    return true;
                } else {
                    this.game.showNotification(result.error || 'Failed to spend actions', 'error');
                    return false;
                }
            } else {
                // Fallback for offline/solo mode
                console.log(`🎯 Offline action spend: ${actionCost} for ${actionType}`);
                this.updateActionDisplay();
                return true;
            }
        } catch (error) {
            console.error('Failed to spend actions:', error);
            this.game.showNotification('Failed to spend actions', 'error');
            return false;
        }
    }

    /**
     * Use a specific number of actions (generic method)
     */
    useActions(count) {
        if (!this.canUseActions(count)) {
            this.game.showNotification('Not enough actions! Visit the marketplace to buy more.', 'error');
            return false;
        }

        this.currentActions -= count;
        this.usedThisMonth += count;
        this.updateActionDisplay();
        return true;
    }

    /**
     * Add actions (from marketplace purchases)
     */
    addActions(count) {
        this.currentActions += count;
        this.updateActionDisplay();
    }

    /**
     * Get current action status
     */
    getActionStatus() {
        return {
            current: this.currentActions,
            monthly: this.monthlyAllowance,
            used: this.usedThisMonth,
            canUseAction: (actionType, cost) => this.canUseAction(actionType, cost),
            canUseActions: (count) => this.canUseActions(count)
        };
    }

    /**
     * Update action display in UI (V2: Server-authoritative)
     */
    updateActionDisplay() {
        const currentActions = this.getCurrentActions();
        const monthlyAllowance = this.calculateMonthlyActionAllowance();

        const actionsElement = document.getElementById('current-actions');
        if (actionsElement) {
            actionsElement.textContent = currentActions;
        }

        const monthlyElement = document.getElementById('monthly-actions');
        if (monthlyElement) {
            monthlyElement.textContent = monthlyAllowance;
        }
    }

    /**
     * Add visual animation for actions refresh
     */
    addActionsRefreshAnimation() {
        const actionsElement = document.getElementById('current-actions');
        if (!actionsElement) return;

        // Remove any existing animation class
        actionsElement.classList.remove('actions-refreshed');

        // Trigger reflow to ensure class removal takes effect
        actionsElement.offsetHeight;

        // Add animation class
        actionsElement.classList.add('actions-refreshed');

        // Remove animation class after animation completes
        setTimeout(() => {
            actionsElement.classList.remove('actions-refreshed');
        }, 1500);
    }

    /**
     * Reset action state (for game resets)
     */
    reset() {
        this.monthlyAllowance = this.calculateMonthlyActionAllowance();
        this.currentActions = this.monthlyAllowance;
        this.usedThisMonth = 0;
        this.marketplace.isOpen = false;
        this.marketplace.listings = [];
        this.updateActionDisplay();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionManager;
}