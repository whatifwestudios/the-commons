/**
 * Action Marketplace System
 * Handles buying, selling, and auctioning of player actions
 */
class ActionMarketplace {
    constructor(game) {
        this.game = game;
        this.setupMarketplace();
    }
    
    setupMarketplace() {
        const marketplaceBtn = document.getElementById('open-action-marketplace');
        if (marketplaceBtn) {
            marketplaceBtn.addEventListener('click', () => this.openMarketplace());
        }
        
        // Setup backdrop click-to-close
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'action-marketplace-modal') {
                    this.closeMarketplace();
                }
            });
        }
        
        // Setup tab switching
        const tabs = document.querySelectorAll('.marketplace-tabs .tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetTab = e.target.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });
    }
    
    openMarketplace() {
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            modal.classList.add('visible');
            this.updateModal();
        }
    }
    
    closeMarketplace() {
        const modal = document.getElementById('action-marketplace-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }
    
    switchTab(tabName) {
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
        // Update action balance display
        document.getElementById('modal-action-balance').textContent = this.game.actionManager.currentActions;
        document.getElementById('modal-actions-used').textContent = this.game.actionManager.usedThisMonth;
        document.getElementById('modal-next-refresh').textContent = document.getElementById('month-progress-text')?.textContent || '--:--';
        
        // Update market stats
        const activeListings = this.game.actionManager.marketplace.listings.filter(l => l.status === 'active').length;
        document.getElementById('modal-active-listings').textContent = activeListings;
        
        if (this.game.actionManager.marketplace.avgPrice > 0) {
            document.getElementById('modal-avg-price').textContent = `$${Math.round(this.game.actionManager.marketplace.avgPrice).toLocaleString()}`;
        }
        
        // Refresh marketplace listings if we're on that tab
        const activeTab = document.querySelector('.marketplace-tabs .tab-btn.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'marketplace') {
            this.refreshListings();
        }
    }
    
    listActionsForSale() {
        const quantity = parseInt(document.getElementById('sell-quantity').value) || 0;
        const reservePrice = parseInt(document.getElementById('sell-reserve').value) || 0;
        const buyNowPrice = parseInt(document.getElementById('sell-buynow').value) || 0;
        
        // Validate
        if (quantity <= 0 || quantity > this.game.actionManager.currentActions) {
            this.game.showNotification('Invalid quantity!', 'error');
            return;
        }
        
        if (reservePrice <= 0) {
            this.game.showNotification('Please set a reserve price!', 'error');
            return;
        }
        
        // Calculate end of month expiration
        const endOfMonth = this.getEndOfMonthTimestamp();
        
        // Create listing
        const listing = {
            id: this.game.actionManager.marketplace.nextListingId++,
            seller: (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player',
            quantity: quantity,
            reservePrice: reservePrice,
            buyNowPrice: buyNowPrice || null,
            currentBid: 0,
            highBidder: null,
            status: 'active',
            createdAt: Date.now(),
            expiresAt: endOfMonth,
            month: this.game.gameDate.month
        };
        
        // Broadcast to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.broadcastAction({
                type: 'CREATE_AUCTION_LISTING',
                listing: listing,
                timestamp: Date.now()
            });
        }
        
        // Clear form
        document.getElementById('sell-quantity').value = 1;
        document.getElementById('sell-reserve').value = '';
        document.getElementById('sell-buynow').value = '';
        
        // Visual confirmation via UI update - notification removed to reduce clutter
        this.updateModal();
        this.switchTab('marketplace');
    }
    
    getEndOfMonthTimestamp() {
        // Calculate end of current month based on actual game calendar
        const monthLengths = {
            'SEPT': 30, 'OCT': 31, 'NOV': 30, 'DEC': 31,
            'JAN': 31, 'FEB': 28, 'MAR': 31, 'APR': 30,
            'MAY': 31, 'JUN': 30, 'JUL': 31, 'AUG': 31
        };
        
        const daysInMonth = monthLengths[this.game.gameDate.month];
        const daysRemaining = daysInMonth - this.game.gameDate.day;
        
        // Time remaining in current day (in milliseconds)
        const msIntoDay = performance.now() - (this.game.lastDayStartTime || Date.now());
        const msRemainingInDay = this.game.dayLength - msIntoDay;
        
        // Total milliseconds remaining in month
        const totalMsRemaining = (daysRemaining * this.game.dayLength) + msRemainingInDay;
        
        return Date.now() + totalMsRemaining;
    }
    
    calculateEndItNowFee(listing) {
        if (!listing || listing.currentBid === 0) return 0;
        
        // Calculate month progress using actual game calendar (0 = start of month, 1 = end of month)
        const monthLengths = {
            'SEPT': 30, 'OCT': 31, 'NOV': 30, 'DEC': 31,
            'JAN': 31, 'FEB': 28, 'MAR': 31, 'APR': 30,
            'MAY': 31, 'JUN': 30, 'JUL': 31, 'AUG': 31
        };
        
        const daysInMonth = monthLengths[this.game.gameDate.month];
        const daysElapsed = this.game.gameDate.day - 1; // Day 1 = 0 elapsed, Day 2 = 1 elapsed, etc.
        
        // Add progress through current day
        const msIntoDay = performance.now() - (this.game.lastDayStartTime || Date.now());
        const dayProgress = Math.max(0, Math.min(1, msIntoDay / this.game.dayLength));
        const totalDaysElapsed = daysElapsed + dayProgress;
        
        // Calculate month progress (0 to 1)
        const monthProgress = Math.max(0, Math.min(1, totalDaysElapsed / daysInMonth));
        
        // Fee starts at 500% and decays to 0% over the month
        const maxFeeMultiplier = 5.0; // 500%
        const currentFeeMultiplier = maxFeeMultiplier * (1 - monthProgress);
        
        // Fee is based on current winning bid
        const baseFee = listing.currentBid * currentFeeMultiplier;
        return Math.floor(baseFee);
    }
    
    refreshListings() {
        const container = document.getElementById('action-listings');
        container.innerHTML = '';
        
        const activeListings = this.game.actionManager.marketplace.listings.filter(l => l.status === 'active');
        
        if (activeListings.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No active listings</p>';
            return;
        }
        
        activeListings.forEach(listing => {
            const listingEl = document.createElement('div');
            listingEl.className = 'action-listing';
            
            listingEl.innerHTML = `
                <div class="listing-info">
                    <div class="listing-seller">Seller: ${this.getPlayerDisplayName(listing.seller)}</div>
                    <div class="listing-quantity">${listing.quantity} actions</div>
                    <div class="listing-prices">
                        <span class="listing-reserve">${listing.currentBid >= listing.reservePrice ? 'Starting Price Met' : `Starting Price: $${listing.reservePrice.toLocaleString()}`}</span>
                        ${listing.currentBid > 0 ? `<span class="listing-current-bid">Current Bid: $${listing.currentBid.toLocaleString()}</span>` : ''}
                        ${listing.buyNowPrice ? `<span class="listing-buynow">Buy Now: $${this.getInflatedBuyNowPrice(listing).toLocaleString()} <span class="reserve-countdown" id="reserve-countdown-${listing.id}"></span></span>` : ''}
                    </div>
                    <div class="listing-time" id="listing-timer-${listing.id}">Expires: End of ${listing.month}</div>
                </div>
                <div class="listing-actions">
                    ${this.game.isCurrentPlayer(listing.seller) ? `
                        ${listing.currentBid === 0 ? `
                            <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})">Cancel</button>
                        ` : `
                            <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})" title="Cancel auction and take back actions (they will expire) for the fee">
                                Cancel ($${this.calculateEndItNowFee(listing).toLocaleString()} fee)
                            </button>
                        `}
                    ` : `
                        <button class="btn-bid" onclick="window.game.actionMarketplace.bidOnListing(${listing.id})">
                            Bid $${listing.currentBid > 0 ? Math.ceil(listing.currentBid * 1.1).toLocaleString() : listing.reservePrice.toLocaleString()}
                        </button>
                        ${listing.buyNowPrice ? `
                            <button class="btn-buynow" onclick="window.game.actionMarketplace.buyNowListing(${listing.id})">
                                Buy Now $${this.getInflatedBuyNowPrice(listing).toLocaleString()}
                            </button>
                        ` : ''}
                    `}
                    <button class="btn-end-now" onclick="window.game.actionMarketplace.endAuctionNow(${listing.id})" title="End auction early for a fee">
                        End It Now ($${this.calculateEndItNowFee(listing).toLocaleString()} fee)
                    </button>
                </div>
            `;
            
            container.appendChild(listingEl);
        });
        
        // Start live countdown updates for all listings
        this.updateAuctionCountdowns();
    }
    
    updateAuctionCountdowns() {
        // Update countdown timers for active listings
        this.game.actionManager.marketplace.listings.forEach(listing => {
            if (listing.status !== 'active') return;
            
            const timerEl = document.getElementById(`listing-timer-${listing.id}`);
            if (!timerEl) return;
            
            // Calculate time remaining until auction expires (may be extended by bids)
            const timeRemaining = Math.max(0, listing.expiresAt - Date.now());
            
            if (timeRemaining > 0) {
                // Format as days, hours, minutes, seconds
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
            
            // Update fee countdown (every ~10 seconds) - only shows on Buy Now line when there are bids
            const reserveCountdownEl = document.getElementById(`reserve-countdown-${listing.id}`);
            if (reserveCountdownEl && listing.currentBid > 0 && listing.buyNowPrice) {
                const currentTime = Date.now();
                const tenSecondCycle = 10000; // 10 seconds
                const timeInCycle = currentTime % tenSecondCycle;
                const secondsUntilShrink = Math.ceil((tenSecondCycle - timeInCycle) / 1000);
                
                reserveCountdownEl.textContent = `(fee shrinks in ${secondsUntilShrink}s)`;
                reserveCountdownEl.className = secondsUntilShrink <= 3 ? 'reserve-countdown urgent' : 'reserve-countdown';
            } else if (reserveCountdownEl) {
                reserveCountdownEl.textContent = '';
            }
        });
    }
    
    refreshTransactionHistory() {
        const container = document.getElementById('transaction-history');
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No transactions yet</p>';
        // Would populate with actual transaction history in full implementation
    }
    
    bidOnListing(listingId) {
        const listing = this.game.actionManager.marketplace.listings.find(l => l.id === listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Check if current player is the seller
        const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
        if (listing.seller === currentPlayerId) {
            this.game.showNotification('Cannot bid on your own listing', 'error');
            return;
        }

        const bidIncrement = Math.max(100, Math.round(listing.reservePrice * 0.1));
        const newBid = Math.max(listing.reservePrice, listing.currentBid + bidIncrement);

        if (this.game.playerCash < newBid) {
            this.game.showNotification(`Insufficient funds! Need ${newBid.toLocaleString()}`, 'error');
            return;
        }

        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.broadcastAction({
                type: 'BID_ON_LISTING',
                listingId: listingId,
                bidAmount: newBid,
                timestamp: Date.now()
            });
        }
    }
    
    buyNowListing(listingId) {
        const listing = this.game.actionManager.marketplace.listings.find(l => l.id === listingId);
        if (!listing || listing.status !== 'active' || !listing.buyNowPrice) {
            this.game.showNotification('Buy now not available', 'error');
            return;
        }
        
        // Check if current player is the seller
        const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
        if (listing.seller === currentPlayerId) {
            this.game.showNotification('Cannot buy your own listing', 'error');
            return;
        }
        
        if (this.game.playerCash < listing.buyNowPrice) {
            this.game.showNotification(`Insufficient funds! Need $${listing.buyNowPrice.toLocaleString()}`, 'error');
            return;
        }
        
        // Broadcast purchase to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.broadcastAction({
                type: 'BUY_NOW_LISTING',
                listingId: listingId,
                timestamp: Date.now()
            });
        }
        
        // Update marketplace stats
        this.game.actionManager.marketplace.priceHistory.push({
            price: listing.buyNowPrice,
            quantity: listing.quantity,
            date: Date.now()
        });
        
        // Recalculate average price
        const recent = this.game.actionManager.marketplace.priceHistory.slice(-10);
        this.game.actionManager.marketplace.avgPrice = recent.reduce((sum, sale) => sum + sale.price, 0) / recent.length;
        
        this.game.showNotification(`Purchased ${listing.quantity} actions for $${listing.buyNowPrice.toLocaleString()}`, 'success');
        this.game.updateActionDisplay();
        this.game.updatePlayerStats();
        this.refreshListings();
    }
    
    cancelListing(listingId) {
        const listing = this.game.actionManager.marketplace.listings.find(l => l.id === listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Check if current player is the seller
        const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
        if (listing.seller !== currentPlayerId) {
            this.game.showNotification('Can only cancel your own listings', 'error');
            return;
        }

        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.broadcastAction({
                type: 'CANCEL_LISTING',
                listingId: listingId,
                timestamp: Date.now()
            });
        }
    }
    
    endAuctionNow(listingId) {
        const listing = this.game.actionManager.marketplace.listings.find(l => l.id === listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }
        
        // Check if current player is the seller
        const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
        if (listing.seller !== currentPlayerId) {
            this.game.showNotification('Can only end your own auctions', 'error');
            return;
        }
        
        // Check if there are any bids
        if (listing.currentBid === 0) {
            this.game.showNotification('No bids to end - just cancel the listing', 'error');
            return;
        }
        
        // Calculate fee
        const fee = this.calculateEndItNowFee(listing);
        
        // Check if player can afford the fee
        if (this.game.playerCash < fee) {
            this.game.showNotification(`Insufficient funds for End It Now fee: $${fee.toLocaleString()}`, 'error');
            return;
        }
        
        // Confirm the action
        const feePercentage = Math.round((fee / listing.currentBid) * 100);
        if (!confirm(`End auction now for $${listing.currentBid.toLocaleString()}?\n\nEnd It Now fee: $${fee.toLocaleString()} (${feePercentage}%)\nYou'll receive: $${(listing.currentBid - fee).toLocaleString()}`)) {
            return;
        }
        
        // Process the early ending
        
        // Add fee to city treasury
        if (this.game.governance && this.game.governance.unallocatedFunds !== undefined) {
            this.game.governance.unallocatedFunds += fee;
        }
        
        // Mark auction as ended early
        listing.status = 'ended_early';
        listing.finalPrice = listing.currentBid;
        listing.winner = listing.highBidder;
        listing.endItNowFee = fee;
        
        // Award actions to winner if they're the current player
        if (listing.highBidder === currentPlayerId) {
            this.game.actionManager.currentActions += listing.quantity;
        }
        
        // Broadcast to other players
        if (this.game.multiplayerManager) {
            this.game.multiplayerManager.broadcastAction({
                type: 'END_AUCTION_NOW',
                listingId: listingId,
                fee: fee,
                timestamp: Date.now()
            });
        }
        
        // Update marketplace stats
        this.game.actionManager.marketplace.priceHistory.push({
            price: listing.currentBid,
            quantity: listing.quantity,
            date: Date.now(),
            endedEarly: true
        });
        
        // Recalculate average price
        const recent = this.game.actionManager.marketplace.priceHistory.slice(-10);
        if (recent.length > 0) {
            this.game.actionManager.marketplace.avgPrice = recent.reduce((sum, sale) => sum + sale.price, 0) / recent.length;
        }
        
        this.game.showNotification(`Auction ended early. Fee: $${fee.toLocaleString()} paid to city treasury`, 'success');
        this.game.updateActionDisplay();
        this.game.updatePlayerStats();
        this.refreshListings();
    }
    
    getPlayerDisplayName(playerId) {
        if (!playerId) return 'Unknown';
        
        // Check if it's the current player
        if (playerId === 'player' || (this.game.multiplayerManager?.playerId === playerId)) {
            return 'You';
        }
        
        // Get player name from multiplayer manager
        if (this.game.multiplayerManager && this.game.multiplayerManager.players.has(playerId)) {
            const player = this.game.multiplayerManager.players.get(playerId);
            return player.name || playerId.slice(-4);
        }
        
        // Fallback to last 4 characters of ID
        return playerId.slice(-4);
    }
    
    getInflatedBuyNowPrice(listing) {
        if (!listing.buyNowPrice) return 0;
        
        // If there are no bids, just return the normal buy now price
        if (!listing.currentBid || listing.currentBid === 0) {
            return listing.buyNowPrice;
        }
        
        // Calculate the End It Now fee and add it to the buy now price
        const endItNowFee = this.calculateEndItNowFee(listing);
        return listing.buyNowPrice + endItNowFee;
    }
    
    startMarketplaceTimer() {
        // Auctions now process at month-end during game progression
        // This function kept for compatibility but no longer needed
    }
    
    processExpiredAuctions() {
        let anyExpired = false;
        
        this.game.actionManager.marketplace.listings.forEach(listing => {
            if (listing.status === 'active' && listing.month !== this.game.gameDate.month) {
                // Auction expired
                if (listing.currentBid > 0 && listing.highBidder) {
                    // Someone won the auction
                    listing.status = 'sold';
                    listing.finalPrice = listing.currentBid;
                    listing.winner = listing.highBidder;
                    
                    // Update price history
                    this.game.actionManager.marketplace.priceHistory.push({
                        price: listing.currentBid,
                        quantity: listing.quantity,
                        date: Date.now()
                    });
                    
                    // Handle payment and transfer
                    const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
                    
                    // If player won, give them the actions and charge them
                    if (listing.highBidder === currentPlayerId) {
                        this.game.playerCash -= listing.currentBid;
                        this.game.actionManager.currentActions += listing.quantity;
                        this.game.showNotification(`Won auction: ${listing.quantity} actions for $${listing.currentBid.toLocaleString()}`, 'success');
                    }
                    
                    // If player was the seller, give them 100% of winning price
                    if (listing.seller === currentPlayerId) {
                        this.game.playerCash += listing.currentBid;
                        this.game.showNotification(`Auction sold: ${listing.quantity} actions for $${listing.currentBid.toLocaleString()}`, 'success');
                    }
                } else {
                    // No bids - return actions to seller
                    listing.status = 'expired';
                    const currentPlayerId = (this.game.multiplayerManager && this.game.multiplayerManager.playerId) ? this.game.multiplayerManager.playerId : 'player';
                    if (listing.seller === currentPlayerId) {
                        this.game.actionManager.currentActions += listing.quantity;
                        this.game.showNotification(`Auction expired: ${listing.quantity} actions returned`, 'info');
                    }
                }
                anyExpired = true;
            }
        });
        
        if (anyExpired) {
            // Recalculate average price
            const recent = this.game.actionManager.marketplace.priceHistory.slice(-10);
            if (recent.length > 0) {
                this.game.actionManager.marketplace.avgPrice = recent.reduce((sum, sale) => sum + sale.price, 0) / recent.length;
            }
            
            this.game.updateActionDisplay();
            this.game.updatePlayerStats();
            this.updateModal();
            this.updateMarketplaceDisplay();
        }
    }
    
    updateMarketplaceDisplay() {
        // Update marketplace modal if it's open
        const modal = document.getElementById('action-marketplace-modal');
        if (modal && modal.classList.contains('visible')) {
            this.updateModal();
        }
    }
    
    reset() {
        // Clear local marketplace
        if (this.game.actionManager && this.game.actionManager.marketplace) {
            this.game.actionManager.marketplace = {
                listings: [],
                priceHistory: [],
                avgPrice: 0,
                nextListingId: 1
            };
        }
        
        this.refreshListings();
        this.updateModal();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionMarketplace;
}