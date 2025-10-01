/**
 * Action Marketplace V2 - Server-Authoritative
 *
 * Features:
 * - All auction state managed server-side
 * - Real-time auction sync via WebSocket
 * - Transaction-based bidding/buying/selling
 * - Dynamic pricing with time-based premiums
 * - Treasury integration for fees
 */
class ActionMarketplaceV2 {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.activeTab = 'marketplace';

        // Server-authoritative data (synced via WebSocket)
        this.listings = new Map();
        this.priceHistory = [];
        this.avgPrice = 0;

        // UI refresh timer
        this.refreshInterval = null;

        // Event cleanup manager for memory leak prevention
        if (typeof window !== 'undefined' && window.EventCleanupManager) {
            this.eventManager = new window.EventCleanupManager();
        } else if (typeof require !== 'undefined') {
            const EventCleanupManager = require('./event-cleanup-manager');
            this.eventManager = new EventCleanupManager();
        } else {
            // Fallback: basic event tracking for browser environments without EventCleanupManager
            this.eventManager = {
                listeners: [],
                addEventListener: function(element, event, handler, options) {
                    element.addEventListener(event, handler, options);
                    this.listeners.push({ element, event, handler, options });
                },
                cleanup: function() {
                    this.listeners.forEach(({ element, event, handler, options }) => {
                        element.removeEventListener(event, handler, options);
                    });
                    this.listeners = [];
                }
            };
        }

        this.setupMarketplace();
    }

    setupMarketplace() {
        // Setup open marketplace button
        const marketplaceBtn = document.getElementById('open-action-marketplace');
        if (marketplaceBtn) {
            this.eventManager.addEventListener(marketplaceBtn, 'click', () => this.openMarketplace());
        }

        // Setup backdrop click-to-close
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            this.eventManager.addEventListener(modal, 'click', (e) => {
                if (e.target.id === 'action-marketplace-modal') {
                    this.closeMarketplace();
                }
            });
        }

        // Setup tab switching
        const tabs = document.querySelectorAll('.marketplace-tabs .tab-btn');
        tabs.forEach(tab => {
            this.eventManager.addEventListener(tab, 'click', (e) => {
                const targetTab = e.target.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Setup form submissions
        this.setupFormHandlers();
    }

    setupFormHandlers() {
        // List actions for sale
        const listBtn = document.getElementById('list-actions-btn');
        if (listBtn) {
            listBtn.addEventListener('click', () => this.listActionsForSale());
        }
    }

    openMarketplace() {
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            modal.classList.add('visible');
            this.isVisible = true;
            this.updateModal();
            this.refreshListings();

            // Update display immediately from server data (no client timer)
            this.updateMarketplaceButton();
            this.updateModal();
        }
    }

    closeMarketplace() {
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            modal.classList.remove('visible');
            this.isVisible = false;

            // No timer to stop - using server-authoritative updates only
        }
    }

    startRefreshTimer() {
        // REMOVED: Client-side timer for server-authoritative timing
        // Timer updates now handled only via server broadcasts
        console.log('📅 Action Market now uses server-authoritative timing only');
    }

    stopRefreshTimer() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        const tabs = document.querySelectorAll('.marketplace-tabs .tab-btn');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update tab content
        const contents = document.querySelectorAll('.action-marketplace .tab-content');
        contents.forEach(content => {
            if (content.id === tabName) {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });

        // Refresh content based on tab
        if (tabName === 'marketplace') {
            this.refreshListings();
        } else if (tabName === 'history') {
            this.refreshTransactionHistory();
        }
    }

    updateModal() {
        // Update action balance display (server-authoritative)
        const currentActions = this.game.economicClient?.getCurrentPlayerActions() || 0;
        const actionBalance = document.getElementById('modal-action-balance');
        if (actionBalance) {
            actionBalance.textContent = currentActions;
        }

        // Update market stats from server data
        const activeListings = Array.from(this.listings.values()).filter(l => l.status === 'active').length;
        const activeListingsElement = document.getElementById('modal-active-listings');
        if (activeListingsElement) {
            activeListingsElement.textContent = activeListings;
        }

        const avgPriceElement = document.getElementById('modal-avg-price');
        if (avgPriceElement && this.avgPrice > 0) {
            avgPriceElement.textContent = `$${Math.round(this.avgPrice).toLocaleString()}`;
        }

        // Update month end countdown
        this.updateMonthEndCountdown();
    }

    /**
     * Update month end countdown display in action marketplace
     */
    updateMonthEndCountdown() {
        const countdownElement = document.getElementById('month-end-countdown');
        if (!countdownElement || !this.game.economicClient || this.game.economicClient.gameTime === undefined) {
            return;
        }

        // Server-authoritative calculation only when called from server update
        const gameDay = Math.floor(this.game.economicClient.gameTime);
        const dayInMonth = (gameDay % 30) + 1; // 1-30
        const daysLeftInMonth = 30 - dayInMonth;

        console.log(`📅 Server time update: Day ${gameDay}, ${daysLeftInMonth} days left in month`);

        // Simple display - no complex real-time calculations
        let countdownText;
        if (daysLeftInMonth <= 0) {
            countdownText = 'Market closing...';
        } else if (daysLeftInMonth === 1) {
            countdownText = 'Final day';
        } else {
            countdownText = `${daysLeftInMonth} days left`;
        }

        // Update both modal and button
        countdownElement.innerHTML = `<span style="color: #74B9FF;">Month ends in ${countdownText}</span>`;
        this.updateMarketplaceButton(countdownText);
    }

    /**
     * Update Action Market button with countdown text
     */
    updateMarketplaceButton(countdownText = null) {
        const button = document.getElementById('open-action-marketplace');
        if (!button) return;

        if (countdownText) {
            button.textContent = `ACTION MARKET (${countdownText})`;
        } else {
            button.textContent = 'ACTION MARKET';
        }
    }

    /**
     * Called when server sends gameTime updates - this is the ONLY place countdown should update
     */
    onServerTimeUpdate() {
        if (this.isVisible) {
            this.updateModal(); // Updates modal countdown
        }
        this.updateMarketplaceButton(); // Always update button
    }

    /**
     * LISTING MANAGEMENT
     */

    async listActionsForSale() {
        const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
        const reservePrice = parseInt(document.getElementById('sell-reserve').value) || 0;
        const buyNowPrice = parseInt(document.getElementById('sell-buynow').value) || 0;

        // Validate
        const currentActions = this.game.economicClient?.getCurrentPlayerActions() || 0;
        if (quantity <= 0 || quantity > currentActions) {
            this.game.showNotification('Invalid quantity!', 'error');
            return;
        }

        if (reservePrice <= 0) {
            this.game.showNotification('Please set a reserve price!', 'error');
            return;
        }

        // Send listing transaction to server
        try {
            const transaction = {
                type: 'ACTION_CREATE_LISTING',
                playerId: this.game.currentPlayerId,
                quantity: quantity,
                reservePrice: reservePrice,
                buyNowPrice: buyNowPrice > 0 ? buyNowPrice : null
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                // Clear form
                document.getElementById('sell-quantity').value = 1;
                document.getElementById('sell-reserve').value = '';
                document.getElementById('sell-buynow').value = '';

                this.game.showNotification(`Listed ${quantity} actions for $${reservePrice.toLocaleString()}+`, 'success');
                this.updateModal();
                this.switchTab('marketplace');
            } else {
                this.game.showNotification(result.error || 'Failed to create listing', 'error');
            }
        } catch (error) {
            console.error('Failed to create listing:', error);
            this.game.showNotification('Failed to create listing', 'error');
        }
    }

    async bidOnListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Calculate minimum bid
        const minimumBid = Math.max(listing.reservePrice, Math.ceil(listing.currentBid * 1.1));

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance() || 0;
        if (currentBalance < minimumBid) {
            this.game.showNotification(`Insufficient funds! Need $${minimumBid.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_BID',
                playerId: this.game.currentPlayerId,
                listingId: listingId,
                bidAmount: minimumBid
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bid placed: $${minimumBid.toLocaleString()}`, 'success');
                this.refreshListings();
            } else {
                this.game.showNotification(result.error || 'Failed to place bid', 'error');
            }
        } catch (error) {
            console.error('Failed to bid:', error);
            this.game.showNotification('Failed to place bid', 'error');
        }
    }

    async buyNowListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active' || !listing.buyNowPrice) {
            this.game.showNotification('Buy now not available', 'error');
            return;
        }

        // Calculate buy now price with premium
        const buyNowPrice = this.calculateBuyNowPrice(listing);

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance() || 0;
        if (currentBalance < buyNowPrice) {
            this.game.showNotification(`Insufficient funds! Need $${buyNowPrice.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_BUY_NOW',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bought ${listing.quantity} actions for $${buyNowPrice.toLocaleString()}`, 'success');
                this.refreshListings();
            } else {
                this.game.showNotification(result.error || 'Failed to buy now', 'error');
            }
        } catch (error) {
            console.error('Failed to buy now:', error);
            this.game.showNotification('Failed to buy now', 'error');
        }
    }

    async cancelListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_CANCEL_LISTING',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                const fee = result.fee || 0;
                if (fee > 0) {
                    this.game.showNotification(`Listing cancelled. Fee: $${fee.toLocaleString()}`, 'info');
                } else {
                    this.game.showNotification('Listing cancelled', 'success');
                }
                this.refreshListings();
            } else {
                this.game.showNotification(result.error || 'Failed to cancel listing', 'error');
            }
        } catch (error) {
            console.error('Failed to cancel listing:', error);
            this.game.showNotification('Failed to cancel listing', 'error');
        }
    }

    async endAuctionEarly(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        if (listing.currentBid === 0) {
            this.game.showNotification('No bids to end - just cancel the listing', 'error');
            return;
        }

        // Calculate fee
        const fee = this.calculateEndEarlyFee(listing);
        const netAmount = listing.currentBid - fee;

        // Confirm the action
        const feePercentage = Math.round((fee / listing.currentBid) * 100);
        if (!confirm(`End auction now for $${listing.currentBid.toLocaleString()}?\n\nEnd It Now fee: $${fee.toLocaleString()} (${feePercentage}%)\nYou'll receive: $${netAmount.toLocaleString()}`)) {
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_END_EARLY',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Auction ended early. Net: $${netAmount.toLocaleString()}`, 'success');
                this.refreshListings();
            } else {
                this.game.showNotification(result.error || 'Failed to end auction', 'error');
            }
        } catch (error) {
            console.error('Failed to end auction:', error);
            this.game.showNotification('Failed to end auction', 'error');
        }
    }

    /**
     * UI RENDERING
     */

    refreshListings() {
        const container = document.getElementById('action-listings');
        if (!container) return;

        container.innerHTML = '';

        const activeListings = Array.from(this.listings.values()).filter(l => l.status === 'active');

        if (activeListings.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No active listings</p>';
            return;
        }

        activeListings.forEach(listing => {
            const listingEl = this.createListingElement(listing);
            container.appendChild(listingEl);
        });
    }

    createListingElement(listing) {
        const listingEl = document.createElement('div');
        listingEl.className = 'action-listing';

        const isOwnListing = listing.sellerId === this.game.currentPlayerId;
        const buyNowPrice = this.calculateBuyNowPrice(listing);
        const endEarlyFee = this.calculateEndEarlyFee(listing);

        listingEl.innerHTML = `
            <div class="listing-info">
                <div class="listing-seller">Seller: ${this.getPlayerDisplayName(listing.sellerId)}</div>
                <div class="listing-quantity">${listing.quantity} actions</div>
                <div class="listing-prices">
                    <span class="listing-reserve">${listing.currentBid >= listing.reservePrice ? 'Starting Price Met' : `Starting Price: $${listing.reservePrice.toLocaleString()}`}</span>
                    ${listing.currentBid > 0 ? `<span class="listing-current-bid">Current Bid: $${listing.currentBid.toLocaleString()}</span>` : ''}
                    ${listing.buyNowPrice ? `<span class="listing-buynow">Buy Now: $${buyNowPrice.toLocaleString()}</span>` : ''}
                </div>
                <div class="listing-time" id="listing-timer-${listing.id}">Expires: End of ${listing.month}</div>
            </div>
            <div class="listing-actions">
                ${isOwnListing ? `
                    ${listing.currentBid === 0 ? `
                        <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})">Cancel</button>
                    ` : `
                        <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})" title="Cancel auction and take back actions for the fee">
                            Cancel ($${endEarlyFee.toLocaleString()} fee)
                        </button>
                        <button class="btn-end-now" onclick="window.game.actionMarketplace.endAuctionEarly(${listing.id})" title="End auction early for a fee">
                            End It Now ($${endEarlyFee.toLocaleString()} fee)
                        </button>
                    `}
                ` : `
                    <button class="btn-bid" onclick="window.game.actionMarketplace.bidOnListing(${listing.id})">
                        Bid $${Math.max(listing.reservePrice, Math.ceil(listing.currentBid * 1.1)).toLocaleString()}
                    </button>
                    ${listing.buyNowPrice ? `
                        <button class="btn-buynow" onclick="window.game.actionMarketplace.buyNowListing(${listing.id})">
                            Buy Now $${buyNowPrice.toLocaleString()}
                        </button>
                    ` : ''}
                `}
            </div>
        `;

        return listingEl;
    }

    updateCountdowns() {
        this.listings.forEach(listing => {
            if (listing.status !== 'active') return;

            const timerEl = document.getElementById(`listing-timer-${listing.id}`);
            if (!timerEl) return;

            const timeRemaining = Math.max(0, listing.expiresAt - Date.now());

            if (timeRemaining > 0) {
                const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
                const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
                const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

                let timeText;
                if (days > 0) {
                    timeText = `${days}d ${hours}h ${minutes}m`;
                } else if (hours > 0) {
                    timeText = `${hours}h ${minutes}m ${seconds}s`;
                } else if (minutes > 0) {
                    timeText = `${minutes}m ${seconds}s`;
                } else {
                    timeText = `${seconds}s`;
                }

                timerEl.textContent = `Expires: ${timeText}`;
                timerEl.className = timeRemaining < 30000 ? 'listing-time urgent' : 'listing-time';
            } else {
                timerEl.textContent = 'EXPIRED';
                timerEl.className = 'listing-time expired';
            }
        });
    }

    refreshTransactionHistory() {
        const container = document.getElementById('transaction-history');
        if (!container) return;

        container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No transactions yet</p>';
        // TODO: Implement transaction history from server
    }

    /**
     * UTILITY METHODS
     */

    getPlayerDisplayName(playerId) {
        if (!playerId) return 'Unknown';

        if (playerId === this.game.currentPlayerId) {
            return 'You';
        }

        return playerId.slice(-4); // Last 4 characters as fallback
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateBuyNowPrice(listing) {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN GHOST PLACEHOLDER
        return 'GHOST';
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateEndEarlyFee(listing) {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN GHOST PLACEHOLDER
        return 'GHOST';
    }

    /**
     * DATA SYNC FROM SERVER
     */

    syncMarketplaceData(marketplaceData) {
        if (!marketplaceData) return;

        // Update listings
        if (marketplaceData.listings) {
            this.listings.clear();
            marketplaceData.listings.forEach(listing => {
                this.listings.set(listing.id, listing);
            });
        }

        // Update price history and average
        if (marketplaceData.priceHistory) {
            this.priceHistory = marketplaceData.priceHistory;
        }

        if (marketplaceData.avgPrice !== undefined) {
            this.avgPrice = marketplaceData.avgPrice;
        }

        // Refresh UI if visible
        if (this.isVisible) {
            this.refreshListings();
            this.updateModal();
        }
    }

    /**
     * CLEANUP
     */

    reset() {
        this.listings.clear();
        this.priceHistory = [];
        this.avgPrice = 0;
        this.stopRefreshTimer();

        if (this.isVisible) {
            this.refreshListings();
            this.updateModal();
        }
    }

    /**
     * Clean up event listeners and resources
     */
    destroy() {
        this.stopRefreshTimer();
        if (this.eventManager) {
            this.eventManager.cleanup();
        }
        console.log('🗑️ Action Marketplace V2 destroyed');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionMarketplaceV2;
}