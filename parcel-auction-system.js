/**
 * Parcel Auction System for The Commons
 * Handles hostile takeover auctions for land parcels
 * Independent from action marketplace
 */

class ParcelAuctionSystem {
    constructor(game) {
        this.game = game;
        this.activeAuctions = new Map(); // auctionId -> auction data
        this.maxConcurrentAuctions = 2;

        // UI elements
        this.auctionModal = null;
        this.auctionSidebar = null;
        this.setupUI();
    }

    /**
     * Setup auction UI elements
     */
    setupUI() {
        // Create auction modal for bidding
        this.createAuctionModal();

        // Create auction sidebar panel
        this.createAuctionSidebar();
    }

    /**
     * Start an auction on a parcel
     */
    async startAuction(row, col) {
        // Check if we're at the auction limit
        if (this.activeAuctions.size >= this.maxConcurrentAuctions) {
            this.game.showNotification(`Maximum ${this.maxConcurrentAuctions} auctions allowed at once`, 'error');
            return;
        }

        // Check if parcel is already being auctioned
        const existingAuction = Array.from(this.activeAuctions.values())
            .find(auction => auction.row === row && auction.col === col);

        if (existingAuction) {
            this.game.showNotification('This parcel is already being auctioned', 'error');
            return;
        }

        // Check protection period (30 days after previous auction win)
        const parcel = this.game.grid[row][col];
        if (parcel.lastAuctionWin && this.isInProtectionPeriod(parcel.lastAuctionWin)) {
            const daysLeft = this.getProtectionDaysLeft(parcel.lastAuctionWin);
            this.game.showNotification(`Parcel protected for ${daysLeft} more days`, 'error');
            return;
        }

        // Prevent auctions on City-owned parcels
        if (parcel.owner === 'City') {
            this.game.showNotification('Cannot auction City-owned parcels', 'error');
            return;
        }

        // Get parcel info and calculate opening bid
        const parcelInfo = await this.getParcelAuctionInfo(row, col);
        if (!parcelInfo) {
            this.game.showNotification('Unable to get parcel information', 'error');
            return;
        }

        // Send auction start request to server
        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'START_PARCEL_AUCTION',
                row: row,
                col: col,
                openingBid: parcelInfo.lastPaidPrice
            });

            if (result.success) {
                this.game.showNotification(`Auction started for parcel [${row},${col}]`, 'success');
                this.updateAuctionSidebar();
            } else {
                this.game.showNotification(result.error || 'Failed to start auction', 'error');
            }
        } catch (error) {
            console.error('Failed to start auction:', error);
            this.game.showNotification('Failed to start auction', 'error');
        }
    }

    /**
     * Show bidding modal for an auction
     */
    showBiddingModal(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;

        // Populate modal with auction data
        this.populateAuctionModal(auction);

        // Show modal
        this.auctionModal.classList.add('visible');
    }

    /**
     * Place a bid on an auction
     */
    async placeBid(auctionId, bidAmount) {
        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'PARCEL_AUCTION_BID',
                auctionId: auctionId,
                bidAmount: bidAmount
            });

            if (result.success) {
                this.game.showNotification(`Bid placed: $${bidAmount.toLocaleString()}`, 'success');
                this.updateAuctionDisplay(auctionId);
            } else {
                this.game.showNotification(result.error || 'Failed to place bid', 'error');
            }
        } catch (error) {
            console.error('Failed to place bid:', error);
            this.game.showNotification('Failed to place bid', 'error');
        }
    }

    /**
     * Owner response to auction (match or decline)
     */
    async ownerResponse(auctionId, action) {
        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'PARCEL_AUCTION_OWNER_RESPONSE',
                auctionId: auctionId,
                action: action // 'match' or 'decline'
            });

            if (result.success) {
                const actionText = action === 'match' ? 'matched the winning bid' : 'declined to match';
                this.game.showNotification(`You ${actionText}`, 'success');
            } else {
                this.game.showNotification(result.error || 'Failed to respond', 'error');
            }
        } catch (error) {
            console.error('Failed to respond to auction:', error);
            this.game.showNotification('Failed to respond to auction', 'error');
        }
    }

    /**
     * Get parcel information for auction
     */
    async getParcelAuctionInfo(row, col) {
        // This would get parcel info from server including last paid price
        // For now, using placeholder
        return {
            row: row,
            col: col,
            owner: this.game.grid[row][col]?.owner,
            lastPaidPrice: 100, // TODO: Get actual last paid price from server
            buildingValue: this.calculateBuildingValue(row, col),
            hasBuilding: !!this.game.grid[row][col]?.building
        };
    }

    /**
     * Calculate building value for total cost display
     */
    calculateBuildingValue(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel?.building) return 0;

        const building = this.game.buildingManager.getBuildingById(parcel.building);
        return building?.cost || 0;
    }

    /**
     * Check if parcel is in 30-day protection period
     */
    isInProtectionPeriod(lastAuctionWin) {
        const now = Date.now();
        const protectionEnd = lastAuctionWin + (30 * 24 * 60 * 60 * 1000); // 30 days in ms
        return now < protectionEnd;
    }

    /**
     * Get remaining protection days
     */
    getProtectionDaysLeft(lastAuctionWin) {
        const now = Date.now();
        const protectionEnd = lastAuctionWin + (30 * 24 * 60 * 60 * 1000);
        const msLeft = protectionEnd - now;
        return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    }

    /**
     * Create auction bidding modal
     */
    createAuctionModal() {
        const modal = document.createElement('div');
        modal.className = 'auction-modal hidden';
        modal.id = 'auction-modal';

        modal.innerHTML = `
            <div class="auction-modal-content">
                <div class="auction-modal-header">
                    <h3>Parcel Auction</h3>
                    <button class="close-btn" onclick="this.closest('.auction-modal').classList.remove('visible')">&times;</button>
                </div>

                <div class="auction-info">
                    <div class="parcel-location">Parcel: <span id="auction-parcel-coords">[0,0]</span></div>
                    <div class="current-owner">Owner: <span id="auction-current-owner">-</span></div>
                    <div class="time-remaining">Time: <span id="auction-time-remaining">-</span></div>
                </div>

                <div class="bid-info">
                    <div class="current-bid">Current Bid: $<span id="auction-current-bid">0</span></div>
                    <div class="total-cost">Total Cost: $<span id="auction-total-cost">0</span></div>
                    <div class="cost-breakdown">
                        <small>Land Price: $<span id="auction-land-price">0</span> + Building Value: $<span id="auction-building-value">0</span></small>
                    </div>
                </div>

                <div class="bid-controls">
                    <div class="quick-bid-buttons">
                        <button class="bid-btn" onclick="game.parcelAuctionSystem.quickBid(1)">+1%</button>
                        <button class="bid-btn" onclick="game.parcelAuctionSystem.quickBid(5)">+5%</button>
                        <button class="bid-btn" onclick="game.parcelAuctionSystem.quickBid(10)">+10%</button>
                    </div>

                    <div class="custom-bid">
                        <input type="number" id="custom-bid-amount" placeholder="Enter bid amount">
                        <button onclick="game.parcelAuctionSystem.customBid()">Place Bid</button>
                    </div>
                </div>

                <div class="owner-response hidden" id="owner-response-section">
                    <div class="response-timer">Response Time: <span id="response-time-remaining">30s</span></div>
                    <div class="response-buttons">
                        <button class="match-btn" onclick="game.parcelAuctionSystem.ownerResponse('match')">Match Bid</button>
                        <button class="decline-btn" onclick="game.parcelAuctionSystem.ownerResponse('decline')">Decline</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.auctionModal = modal;
    }

    /**
     * Create auction sidebar panel
     */
    createAuctionSidebar() {
        // Find sidebar container or create it
        let sidebarContainer = document.querySelector('.sidebar-container');
        if (!sidebarContainer) {
            sidebarContainer = document.createElement('div');
            sidebarContainer.className = 'sidebar-container';
            document.body.appendChild(sidebarContainer);
        }

        const sidebar = document.createElement('div');
        sidebar.className = 'sidebar-panel auction-sidebar hidden';
        sidebar.id = 'auction-sidebar';

        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>Active Auctions</h3>
                <button class="close-sidebar-btn" onclick="this.closest('.sidebar-panel').classList.add('hidden')">&times;</button>
            </div>

            <div class="auction-list" id="auction-list">
                <div class="no-auctions">No active auctions</div>
            </div>
        `;

        sidebarContainer.appendChild(sidebar);
        this.auctionSidebar = sidebar;
    }

    /**
     * Update auction sidebar with current auctions
     */
    updateAuctionSidebar() {
        const auctionList = document.getElementById('auction-list');
        if (!auctionList) return;

        if (this.activeAuctions.size === 0) {
            auctionList.innerHTML = '<div class="no-auctions">No active auctions</div>';
            return;
        }

        let html = '';
        for (const [auctionId, auction] of this.activeAuctions) {
            html += `
                <div class="auction-item" onclick="game.parcelAuctionSystem.showBiddingModal('${auctionId}')">
                    <div class="auction-parcel">[${auction.row},${auction.col}]</div>
                    <div class="auction-current-bid">$${auction.currentBid.toLocaleString()}</div>
                    <div class="auction-time">${this.formatTimeRemaining(auction.endTime)}</div>
                </div>
            `;
        }

        auctionList.innerHTML = html;
    }

    /**
     * Format time remaining for display
     */
    formatTimeRemaining(endTime) {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const seconds = Math.ceil(remaining / 1000);

        if (seconds > 60) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }

        return `${seconds}s`;
    }

    /**
     * Handle WebSocket auction updates
     */
    handleAuctionUpdate(data) {
        switch (data.type) {
            case 'AUCTION_STARTED':
                this.activeAuctions.set(data.auctionId, data.auction);
                this.updateAuctionSidebar();
                break;

            case 'AUCTION_BID':
                if (this.activeAuctions.has(data.auctionId)) {
                    this.activeAuctions.get(data.auctionId).currentBid = data.bidAmount;
                    this.activeAuctions.get(data.auctionId).highBidderId = data.bidderId;
                    this.updateAuctionDisplay(data.auctionId);
                }
                break;

            case 'AUCTION_ENDED':
                this.handleAuctionEnd(data);
                break;

            case 'AUCTION_COMPLETED':
                this.activeAuctions.delete(data.auctionId);
                this.updateAuctionSidebar();
                break;
        }
    }

    /**
     * Quick bid with percentage increase
     */
    quickBid(percentage) {
        // Implementation for quick bid buttons
        const currentAuctionId = this.getCurrentAuctionId();
        if (!currentAuctionId) return;

        const auction = this.activeAuctions.get(currentAuctionId);
        const newBid = Math.ceil(auction.currentBid * (1 + percentage / 100));

        this.placeBid(currentAuctionId, newBid);
    }

    /**
     * Custom bid amount
     */
    customBid() {
        const input = document.getElementById('custom-bid-amount');
        const amount = parseInt(input.value);

        if (!amount || amount <= 0) {
            this.game.showNotification('Enter a valid bid amount', 'error');
            return;
        }

        const currentAuctionId = this.getCurrentAuctionId();
        if (!currentAuctionId) return;

        this.placeBid(currentAuctionId, amount);
        input.value = '';
    }

    /**
     * Get current auction ID from modal
     */
    getCurrentAuctionId() {
        // Would need to track which auction is currently shown in modal
        // For now, returning first active auction
        return Array.from(this.activeAuctions.keys())[0];
    }

    /**
     * Show/hide auction sidebar
     */
    toggleAuctionSidebar() {
        if (this.auctionSidebar) {
            this.auctionSidebar.classList.toggle('hidden');
        }
    }
}

// Make available globally
window.ParcelAuctionSystem = ParcelAuctionSystem;