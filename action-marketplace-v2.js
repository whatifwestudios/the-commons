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
        this.activeTab = 'your-actions';

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

            // Ensure the default tab is active
            this.switchTab('your-actions');

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
            tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
        });

        // Update tab content - rely only on CSS classes, not inline styles
        const contents = document.querySelectorAll('#action-marketplace-modal .tab-content');
        contents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        // Refresh content based on tab
        if (tabName === 'marketplace') {
            this.refreshListings();
        } else if (tabName === 'your-actions') {
            this.refreshYourActions();
        }
    }

    updateModal() {
        // Update action balance display (server-authoritative)
        const currentActions = this.game.economicClient?.getCurrentPlayerActions();
        const actionBalance = document.getElementById('modal-action-balance');
        if (actionBalance) {
            actionBalance.textContent = currentActions !== null ? currentActions : 'Loading...';
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

        // Server-authoritative calculation using real month boundaries
        const gameDay = Math.floor(this.game.economicClient.gameTime);

        // Real month boundaries (matching server getMonthBoundaries())
        const monthBoundaries = [
            30,   // Sept (29 days remaining from Sept 2)
            61,   // Oct (31 days)
            91,   // Nov (30 days)
            122,  // Dec (31 days)
            153,  // Jan (31 days)
            181,  // Feb (28 days)
            212,  // Mar (31 days)
            242,  // Apr (30 days)
            273,  // May (31 days)
            303,  // Jun (30 days)
            334,  // Jul (31 days)
            365   // Aug (31 days)
        ];

        // Find which month we're in and days left
        let daysLeftInMonth = 0;
        for (let i = 0; i < monthBoundaries.length; i++) {
            if (gameDay <= monthBoundaries[i]) {
                daysLeftInMonth = monthBoundaries[i] - gameDay;
                break;
            }
        }

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
        const buyNowPrice = 0; // Buy now price field removed from UI


        // Validate
        const currentActions = this.game.economicClient?.getCurrentPlayerActions();

        if (currentActions === null) {
            this.game.showNotification('Loading action data...', 'info');
            return;
        }
        if (quantity <= 0 || quantity > currentActions) {
            this.game.showNotification('Invalid quantity!', 'error');
            return;
        }

        if (reservePrice <= 0) {
            this.game.showNotification('Please set a reserve price!', 'error');
            return;
        }

        if (!this.game.economicClient) {
            console.error('No economic client available');
            this.game.showNotification('Economic client not ready', 'error');
            return;
        }

        if (!this.game.economicClient.connectionManager) {
            console.error('ConnectionManager not initialized');
            this.game.showNotification('Connection not ready - please wait', 'error');
            return;
        }

        if (!this.game.economicClient.connectionManager.isConnected) {
            console.error('ConnectionManager not connected');
            this.game.showNotification('Connection not established - please wait', 'error');
            return;
        }

        if (!this.game.currentPlayerId) {
            console.error('No current player ID');
            this.game.showNotification('Player ID not ready', 'error');
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

            console.log('🏪 Action Marketplace: Submitting listing transaction:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);
            console.log('🏪 Action Marketplace: Server response:', result);

            if (result.success) {
                // Clear form
                document.getElementById('sell-quantity').value = 1;
                document.getElementById('sell-reserve').value = '';
                // Buy now field removed from UI

                this.game.showNotification(`Listed ${quantity} actions for $${reservePrice.toLocaleString()}+`, 'success');
                this.updateModal();
                this.switchTab('marketplace');
            } else {
                console.error('Server rejected transaction:', result.error);
                this.game.showNotification(result.error || 'Failed to create listing', 'error');
            }
        } catch (error) {
            console.error('Exception during transaction:', error);
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
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
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
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
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
        // Simple: just refresh both marketplace sections
        this.refreshMarketplaceYourListings();
        this.refreshMarketplaceOthersListings();
    }

    refreshMarketplaceYourListings() {

        const container = document.getElementById('marketplace-your-listings');
        if (!container) {
            return;
        }

        // Use the same reliable pattern as refreshYourActions
        const allListings = Array.from(this.listings.values());
        const yourListings = allListings.filter(l => l.sellerId === this.game.currentPlayerId && l.status === 'active');

        container.innerHTML = '';
        if (yourListings.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 16px;">You have no active listings</p>';
        } else {
            yourListings.forEach(listing => {
                const listingEl = this.createListingElement(listing);
                container.appendChild(listingEl);
            });
        }
    }

    refreshMarketplaceOthersListings() {

        const container = document.getElementById('action-listings');
        if (!container) {
            return;
        }

        // Show ALL active listings (both yours and others)
        const allListings = Array.from(this.listings.values());
        const activeListings = allListings.filter(l => l.status === 'active');

        container.innerHTML = '';
        if (activeListings.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No active listings in the marketplace</p>';
        } else {
            activeListings.forEach(listing => {
                const listingEl = this.createListingElement(listing);
                container.appendChild(listingEl);
            });
        }

        // Update the Market tab with listing count
        this.updateMarketTabCount(activeListings.length);

        // Update sidebar market listings count
        this.updateSidebarMarketCount(activeListings.length);
    }

    refreshYourActions() {

        const container = document.getElementById('your-actions-content');
        if (!container) {
            return;
        }

        container.innerHTML = '';

        const allListings = Array.from(this.listings.values());
        const yourListings = allListings.filter(l => l.sellerId === this.game.currentPlayerId && l.status === 'active');

        if (yourListings.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">You have no active listings</p>';
            return;
        }

        yourListings.forEach(listing => {
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
        const playerInfo = this.getPlayerInfo(listing.sellerId);
        const sellerBadge = this.createSellerBadge(playerInfo.name, playerInfo.color);

        listingEl.innerHTML = `
            <div class="listing-info">
                <div class="listing-seller">Seller: ${sellerBadge}</div>
                <div class="listing-quantity">${listing.quantity} actions</div>
                <div class="listing-prices">
                    <span class="listing-reserve">Current Price: $${listing.currentBid > 0 ? listing.currentBid.toLocaleString() : listing.reservePrice.toLocaleString()}</span>
                    ${listing.buyNowPrice ? `<span class="listing-buynow">Buy Now: $${buyNowPrice.toLocaleString()}</span>` : ''}
                </div>
                <div class="listing-time" id="listing-timer-${listing.id}">Offer expires end of ${listing.month}</div>
            </div>
            <div class="listing-actions">
                ${isOwnListing ? `
                    ${listing.currentBid === 0 ? `
                        <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})">Cancel</button>
                    ` : `
                        <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})" title="Cancel auction and take back actions for the fee">
                            Cancel ($${endEarlyFee.toLocaleString()} fee)
                        </button>
                    `}
                ` : `
                    ${this.createBidButtons(listing)}
                `}
            </div>
        `;

        // Add event listeners for quick bid buttons
        if (!isOwnListing) {
            const quickBidButtons = listingEl.querySelectorAll('.btn-quick-bid');
            quickBidButtons.forEach(button => {
                button.addEventListener('click', (event) => {
                    const listingId = parseInt(button.getAttribute('data-listing-id'));
                    const bidAmount = parseInt(button.getAttribute('data-bid-amount'));
                    this.quickBid(listingId, bidAmount, event);
                });
            });
        }

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

    getPlayerInfo(playerId) {
        if (!playerId) return { name: 'Unknown', color: '#666' };

        if (playerId === this.game.currentPlayerId) {
            // Try to get current player's info from game state
            const playerColor = this.game.playerSettings?.color || '#4CAF50';
            return { name: 'You', color: playerColor };
        }

        // For other players, try to get from economic client or fallback
        const playerData = this.game.economicClient?.getPlayerData?.(playerId);
        return {
            name: playerData?.name || playerId.slice(-4),
            color: playerData?.color || '#666'
        };
    }

    createSellerBadge(name, color) {
        return `<span class="player-badge" style="background-color: ${color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold;">${name}</span>`;
    }

    createBidButtons(listing) {
        const currentBid = listing.currentBid || 0;
        const reservePrice = listing.reservePrice;
        const minBid = Math.max(reservePrice, Math.ceil(currentBid * 1.1));
        const buyNowPrice = this.calculateBuyNowPrice(listing);
        const endEarlyFee = this.calculateEndEarlyFee(listing);

        // Calculate quick bid amounts ensuring they meet minimum bid requirement
        const bid5Percent = Math.max(minBid, Math.ceil(minBid * 1.05));
        const bid20Percent = Math.max(minBid, Math.ceil(minBid * 1.20));

        return `
            <div class="bid-buttons-container">
                <div class="quick-bids">
                    <button class="btn-quick-bid" data-listing-id="${listing.id}" data-bid-amount="${bid5Percent}" data-bid-type="5percent">
                        +5% ($${bid5Percent.toLocaleString()})
                    </button>
                    <button class="btn-quick-bid" data-listing-id="${listing.id}" data-bid-amount="${bid20Percent}" data-bid-type="20percent">
                        +20% ($${bid20Percent.toLocaleString()})
                    </button>
                </div>
                ${listing.buyNowPrice && listing.sellerId !== this.game.currentPlayerId ? `
                    <button class="btn-buynow" onclick="window.game.actionMarketplace.buyNowListing(${listing.id})" title="Buy immediately for the listed buy-now price">
                        Buy It Now ($${buyNowPrice.toLocaleString()})
                    </button>
                ` : ''}
            </div>
        `;
    }

    /**
     * Get buy now price from server-calculated data
     */
    calculateBuyNowPrice(listing) {
        // Use server-calculated value from enhanced listing data
        return listing.calculatedBuyNowPrice || listing.buyNowPrice || 0;
    }

    /**
     * Get end early fee from server-calculated data
     */
    calculateEndEarlyFee(listing) {
        // Use server-calculated value from enhanced listing data
        return listing.calculatedEndEarlyFee || 0;
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

        // Always refresh marketplace containers if they exist (data should be ready for when user switches to marketplace)
        this.refreshMarketplaceYourListings();
        this.refreshMarketplaceOthersListings();

        // Refresh UI if modal is visible
        if (this.isVisible) {
            this.refreshYourActions(); // Also refresh Your Actions tab if modal is open
            this.updateModal();
        } else {
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
     * Place a bid on a listing
     */
    async placeBid(listingId, bidAmount, buttonElement = null) {
        console.log(`💰 Placing bid for listing ${listingId}: ${bidAmount}`);

        if (!this.game.currentPlayerId) {
            console.error('No current player ID');
            this.game.showNotification('Player ID not ready', 'error');
            return;
        }

        // Check connection
        if (!this.game.economicClient.connectionManager) {
            this.game.showNotification('Not connected to server', 'error');
            return;
        }

        if (!this.game.economicClient.connectionManager.isConnected) {
            this.game.showNotification('Not connected to server', 'error');
            return;
        }

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
        if (currentBalance < bidAmount) {
            // Add visual feedback for insufficient funds
            if (buttonElement) {
                buttonElement.classList.add('insufficient-funds-blink');
                setTimeout(() => {
                    buttonElement.classList.remove('insufficient-funds-blink');
                }, 500);
            }
            this.game.showNotification(`Insufficient funds! Need $${bidAmount.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_BID',
                playerId: this.game.currentPlayerId,
                listingId: listingId,
                bidAmount: bidAmount
            };

            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bid placed: $${bidAmount.toLocaleString()}`, 'success');
                this.refreshListings();
            } else {
                this.game.showNotification(result.error || 'Bid failed', 'error');
            }
        } catch (error) {
            console.error('❌ Error placing bid:', error);
            this.game.showNotification('Error placing bid', 'error');
        }
    }

    /**
     * Quick bid with predetermined amounts
     */
    quickBid(listingId, bidAmount, event = null) {
        console.log(`💰 Quick bid for listing ${listingId}: ${bidAmount}`);

        const listing = this.listings.get(listingId);
        if (!listing) {
            console.error(`❌ Listing ${listingId} not found`);
            return;
        }

        if (bidAmount < listing.minBid) {
            alert(`Bid must be at least ${listing.minBid.toLocaleString()}`);
            return;
        }

        // Get the button element from the event
        const buttonElement = event ? event.target : null;
        this.placeBid(listingId, bidAmount, buttonElement);
    }

    /**
     * Update Market tab text with listing count
     */
    updateMarketTabCount(count) {
        const tabBtn = document.getElementById('marketplace-tab-btn');
        if (tabBtn) {
            tabBtn.textContent = count > 0 ? `Market (${count})` : 'Market';
        }
    }

    /**
     * Update sidebar market listings count
     */
    updateSidebarMarketCount(count) {
        const sidebarElement = document.getElementById('market-listings');
        if (sidebarElement) {
            sidebarElement.textContent = count === 1 ? '1 listing' : `${count} listings`;
        }
    }

    /**
     * Custom bid from input field
     */
    customBid(listingId) {
        const input = document.getElementById(`custom-bid-${listingId}`);
        if (!input) {
            console.error(`❌ Custom bid input for listing ${listingId} not found`);
            return;
        }

        const bidAmount = parseInt(input.value);
        if (!bidAmount || isNaN(bidAmount)) {
            alert('Please enter a valid bid amount');
            return;
        }

        const listing = this.listings.get(listingId);
        if (!listing) {
            console.error(`❌ Listing ${listingId} not found`);
            return;
        }

        if (bidAmount < listing.minBid) {
            alert(`Bid must be at least ${listing.minBid.toLocaleString()}`);
            return;
        }

        this.placeBid(listingId, bidAmount);
        input.value = '';
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