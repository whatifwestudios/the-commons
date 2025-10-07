/**
 * Unified Action Manager for The Commons
 * Consolidates all action-related functionality from game.js and marketplace
 */

class ActionManager {
    constructor(game) {
        this.game = game;

        // V2: Server-authoritative action state (client displays server data)
        // Note: Actual action counts come from economic client sync

        // Action costs configuration (fallback - server provides authoritative values)
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

    /**
     * Get monthly action allowance from server data
     */
    calculateMonthlyActionAllowance() {
        // V2: Server-authoritative data only
        if (this.game.economicClient && this.game.economicClient.getMonthlyActionAllowance) {
            return this.game.economicClient.getMonthlyActionAllowance();
        }
        return 0; // Wait for server sync
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
        // Get action cost from server first, then fallback to local
        const serverActionCosts = this.game.economicClient?.getActionCosts();
        const actionCost = cost ||
                          (serverActionCosts && serverActionCosts[actionType]) ||
                          this.actionCosts[actionType] ||
                          1;
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
            const actions = this.game.economicClient.getCurrentPlayerActions();
            if (actions !== null) {
                return actions;
            }
        }
        // Return null if no server data available - let UI show loading state
        return null;
    }

    /**
     * Use a specific action type (V2: Server-authoritative)
     */
    async useAction(actionType, cost = null) {
        // Get action cost from server first, then fallback to local
        const serverActionCosts = this.game.economicClient?.getActionCosts();
        const actionCost = cost ||
                          (serverActionCosts && serverActionCosts[actionType]) ||
                          this.actionCosts[actionType] ||
                          1;

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
        // Get server-authoritative action count
        const currentActions = this.getCurrentActions();

        // Format display text
        const displayText = currentActions !== null ? `${currentActions}` : '--';

        // Update via UIManager for consistency (use camelCase key, not element ID)
        if (this.game.uiManager) {
            this.game.uiManager.updateText('currentActions', displayText);

            // Color code based on remaining actions
            let color = 'white'; // Default white
            if (currentActions !== null && currentActions <= 2) {
                color = '#FF4444'; // Red at 2 or less
            } else if (currentActions !== null && currentActions <= 5) {
                color = '#FFD700'; // Yellow at 5 or less
            }
            this.game.uiManager.updateStyle('currentActions', 'color', color);
        }

        // Update marketplace display if available
        if (this.game.actionMarketplace && this.game.actionMarketplace.updateMarketplaceDisplay) {
            this.game.actionMarketplace.updateMarketplaceDisplay();
        }
    }

    /**
     * Add visual animation for actions refresh
     */
    addActionsRefreshAnimation() {
        const actionsElement = document.getElementById('current-actions');
        if (!actionsElement) return;

        // Get the parent row for full effect
        const parentRow = actionsElement.closest('.action-stat-row');
        if (!parentRow) return;

        // Apply glow effect
        parentRow.style.transition = 'all 0.3s ease';
        parentRow.style.backgroundColor = 'rgba(34, 197, 94, 0.15)'; // Green glow
        parentRow.style.border = '1px solid rgba(34, 197, 94, 0.4)';
        parentRow.style.borderRadius = '6px';
        parentRow.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.3)';

        // Pulse the text color
        actionsElement.style.color = '#22c55e';
        actionsElement.style.fontWeight = '700';

        // Remove the effect after 3 seconds
        setTimeout(() => {
            parentRow.style.backgroundColor = '';
            parentRow.style.border = '';
            parentRow.style.borderRadius = '';
            parentRow.style.boxShadow = '';
            actionsElement.style.color = '';
            actionsElement.style.fontWeight = '';
        }, 3000);
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