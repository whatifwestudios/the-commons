/**
 * Auction System for The Commons
 * Handles land auctions, bidding mechanics, and auction history
 */

class AuctionSystem {
    constructor(game) {
        this.game = game;
        
        // Auction state
        this.activeAuction = null;
        this.auctionHistory = [];
        this.auctionInterval = null;
        
        // Auction parameters
        this.auctionDuration = 60000; // 60 seconds in milliseconds
        this.dutchReductionRate = 0.99; // 1% reduction per interval
        this.dutchUpdateInterval = 1000; // 1 second
        this.bidExtensionTime = 2000; // 2 seconds added when bid placed near end
        this.bidExtensionThreshold = 5; // seconds
    }
    
    /**
     * Initialize the auction system
     */
    initialize() {
        // Setup event listeners if needed
        this.setupEventListeners();
    }
    
    /**
     * Setup event listeners for auction UI
     */
    setupEventListeners() {
        // Event delegation for dynamically created auction UI
        document.addEventListener('click', (e) => {
            if (e.target.id === 'place-bid-btn') {
                this.placeBid(0.05); // Default 5% increment
            }
        });
    }
    
    /**
     * Check if auctions should be triggered (called daily)
     */
    checkForAuctions() {
        // Update calculated values but don't auto-trigger auctions
        // Players must manually start auctions
        // This method is kept for compatibility but doesn't auto-trigger
    }
    
    /**
     * Start an auction for a parcel
     */
    startAuction(row, col) {
        // Validate coordinates
        if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
            this.game.showNotification('Invalid parcel coordinates', 'error');
            return false;
        }
        
        // Check if there's already an active auction
        if (this.activeAuction) {
            this.game.showNotification('An auction is already in progress', 'error');
            return false;
        }
        
        const parcel = this.game.grid[row][col];
        if (!parcel) {
            this.game.showNotification('No parcel at this location', 'error');
            return false;
        }
        
        // Calculate land value and building value
        const calculatedLandValue = this.game.buildingSystem ? 
            this.game.buildingSystem.calculateLandValue(parcel, row, col) : 1000;
        
        const buildingValue = this.calculateBuildingValue(parcel);
        const currentOwner = parcel.owner;
        
        // Initialize auction
        this.activeAuction = {
            row: row,
            col: col,
            coord: this.game.getParcelCoordinate(row, col),
            currentOwner: currentOwner,
            calculatedLandValue: calculatedLandValue,
            buildingValue: buildingValue,
            initialLandValue: calculatedLandValue,
            currentBid: Math.floor(calculatedLandValue * 1.2), // Start 20% above calculated
            currentBidder: null,
            startTime: Date.now(),
            endTime: Date.now() + this.auctionDuration,
            bidHistory: [],
            dutchPhase: true, // Start with Dutch auction phase
            lastDutchUpdate: Date.now()
        };
        
        this.showAuctionUI();
        this.startAuctionTimer();
        
        // Hide context menu
        this.game.hideContextMenu();
        
        return true;
    }
    
    /**
     * Calculate the value of buildings on a parcel
     */
    calculateBuildingValue(parcel) {
        if (!parcel || !parcel.building) return 0;
        
        const building = this.game.buildingManager?.getBuildingById(parcel.building);
        if (!building) return 0;
        
        // Base building cost
        let value = building.cost || 0;
        
        // Apply depreciation based on age and decay
        const age = parcel.buildingAge || 0;
        const condition = 1 - (parcel.decay || 0);
        const depreciation = Math.max(0.2, 1 - (age * 0.01)); // Min 20% value retained
        
        return Math.round(value * condition * depreciation);
    }
    
    /**
     * Show the auction UI
     */
    showAuctionUI() {
        // Remove existing auction UI
        const existingUI = document.getElementById('auction-ui');
        if (existingUI) existingUI.remove();
        
        const auctionUI = document.createElement('div');
        auctionUI.id = 'auction-ui';
        auctionUI.className = 'auction-overlay';
        auctionUI.innerHTML = `
            <div class="auction-panel">
                <div class="auction-header">
                    <h3>LAND AUCTION - ${this.activeAuction.coord}</h3>
                    <span class="auction-timer" id="auction-timer">60</span>
                </div>
                <div class="auction-info">
                    <div class="info-row">
                        <span>Current Owner:</span>
                        <span>${this.activeAuction.currentOwner || 'UNOWNED'}</span>
                    </div>
                    <div class="info-row">
                        <span>Land Value:</span>
                        <span>$${this.activeAuction.calculatedLandValue.toLocaleString()}</span>
                    </div>
                    <div class="info-row" ${this.activeAuction.buildingValue ? '' : 'style="display:none"'}>
                        <span>Building Value:</span>
                        <span>$${this.activeAuction.buildingValue.toLocaleString()}</span>
                    </div>
                </div>
                <div class="auction-current-bid">
                    <div class="bid-label">Current Bid</div>
                    <div class="bid-amount" id="current-bid">$${this.activeAuction.currentBid.toLocaleString()}</div>
                    <div class="bid-status" id="bid-status">Dutch Auction - Price Dropping</div>
                </div>
                <div class="auction-actions" id="auction-actions">
                    <button class="auction-btn" id="place-bid-btn">PLACE BID</button>
                </div>
                <div class="auction-history" id="auction-history">
                    <h4>Bid History</h4>
                    <div class="history-content"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(auctionUI);
        
        // Close auction when clicking outside
        auctionUI.addEventListener('click', (e) => {
            if (e.target === auctionUI) {
                this.endAuction();
            }
        });
    }
    
    /**
     * Start the auction timer
     */
    startAuctionTimer() {
        if (this.auctionInterval) clearInterval(this.auctionInterval);
        
        this.auctionInterval = setInterval(() => {
            if (!this.activeAuction) {
                clearInterval(this.auctionInterval);
                return;
            }
            
            const now = Date.now();
            const timeLeft = Math.max(0, this.activeAuction.endTime - now) / 1000;
            
            // Update timer display
            const timerEl = document.getElementById('auction-timer');
            if (timerEl) {
                timerEl.textContent = Math.ceil(timeLeft);
                timerEl.className = timeLeft <= 10 ? 'auction-timer urgent' : 'auction-timer';
            }
            
            // Dutch auction phase - price drops
            if (this.activeAuction.dutchPhase && !this.activeAuction.currentBidder) {
                const timeSinceLastUpdate = now - this.activeAuction.lastDutchUpdate;
                if (timeSinceLastUpdate >= this.dutchUpdateInterval) {
                    const minPrice = this.activeAuction.initialLandValue;
                    const newBid = Math.max(minPrice, Math.floor(this.activeAuction.currentBid * this.dutchReductionRate));
                    this.activeAuction.currentBid = newBid;
                    this.activeAuction.lastDutchUpdate = now;
                    
                    // Update UI
                    const bidEl = document.getElementById('current-bid');
                    if (bidEl) {
                        bidEl.textContent = `$${newBid.toLocaleString()}`;
                    }
                }
            }
            
            // End auction when time expires
            if (timeLeft <= 0) {
                this.endAuction();
            }
        }, 100); // Update every 100ms for smooth timer
    }
    
    /**
     * Place a bid in the auction
     */
    placeBid(increment = 0.05) {
        if (!this.activeAuction) return;
        
        // Handle Dutch auction phase
        if (this.activeAuction.dutchPhase) {
            this.activeAuction.dutchPhase = false;
            this.activeAuction.currentBidder = 'player';
            this.activeAuction.bidHistory.push({
                bidder: 'player',
                amount: this.activeAuction.currentBid,
                timestamp: Date.now()
            });
            
            this.updateAuctionActions();
        } else {
            // Regular bidding phase - increase bid
            const newBid = Math.floor(this.activeAuction.currentBid * (1 + increment));
            
            // Check if player can afford this bid
            const totalCost = this.activeAuction.currentOwner && this.activeAuction.currentOwner !== 'player' 
                ? newBid + this.activeAuction.buildingValue 
                : newBid;
                
            if (this.game.playerCash < totalCost) {
                this.game.showInsufficientFundsFeedback();
                return;
            }
            
            this.activeAuction.currentBid = newBid;
            this.activeAuction.currentBidder = 'player';
            this.activeAuction.bidHistory.push({
                bidder: 'player',
                amount: newBid,
                timestamp: Date.now()
            });
            
            // Extend time if bid placed near end
            const timeLeft = (this.activeAuction.endTime - Date.now()) / 1000;
            if (timeLeft <= this.bidExtensionThreshold) {
                this.activeAuction.endTime += this.bidExtensionTime;
            }
        }
        
        // Update UI
        document.getElementById('current-bid').textContent = `$${this.activeAuction.currentBid.toLocaleString()}`;
        
        const statusEl = document.getElementById('bid-status');
        if (statusEl) {
            statusEl.textContent = this.activeAuction.dutchPhase ? 'Dutch Auction - Price Dropping' : 'Highest Bidder: Player';
        }
    }
    
    /**
     * Update auction action buttons
     */
    updateAuctionActions() {
        const actionsEl = document.getElementById('auction-actions');
        if (!actionsEl || !this.activeAuction) return;
        
        if (!this.activeAuction.dutchPhase) {
            actionsEl.innerHTML = `
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid(0.01)">+1%</button>
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid(0.05)">+5%</button>
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid(0.10)">+10%</button>
            `;
        }
    }
    
    /**
     * End the current auction
     */
    endAuction() {
        if (!this.activeAuction) return;
        
        clearInterval(this.auctionInterval);
        
        const auction = this.activeAuction;
        const parcel = this.game.grid[auction.row][auction.col];
        const winner = auction.currentBidder;
        const finalBid = auction.currentBid;
        
        if (winner === 'player') {
            // Process the auction result
            const previousOwner = parcel.owner;
            
            if (previousOwner && previousOwner !== 'player') {
                // Compensate previous owner
                parcel.landValue.paidPrice = finalBid;
                parcel.landValue.lastAuctionDay = this.game.currentDay;
            }
            
            // Transfer ownership
            parcel.owner = 'player';
            const totalCost = finalBid + auction.buildingValue;
            this.game.playerCash -= totalCost;
            
            parcel.landValue.paidPrice = finalBid;
            
            this.game.showNotification(`Won auction! Paid $${totalCost.toLocaleString()}`, 'success');
            
            // Update economic cache
            this.game.economicCache.playerParcels.add(`${auction.row}-${auction.col}`);
            this.game.economicCache.dirty.add(`${auction.row}-${auction.col}`);
        } else {
            // No winner or auction cancelled
            parcel.landValue.lastAuctionDay = this.game.currentDay;
            this.game.showNotification('Auction ended with no winner', 'info');
        }
        
        // Remove auction UI
        const auctionUI = document.getElementById('auction-ui');
        if (auctionUI) auctionUI.remove();
        
        // Add to history
        this.auctionHistory.push({
            ...auction,
            winner: winner,
            finalBid: finalBid,
            endTime: Date.now()
        });
        
        this.activeAuction = null;
        
        // Trigger re-render
        this.game.scheduleRender();
        
        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'AUCTION_COMPLETED',
                auction: {
                    row: auction.row,
                    col: auction.col,
                    winner: winner,
                    finalBid: finalBid
                }
            });
        }
    }
    
    /**
     * Check if an auction is currently active
     */
    isAuctionActive() {
        return this.activeAuction !== null;
    }
    
    /**
     * Get auction history
     */
    getAuctionHistory() {
        return [...this.auctionHistory];
    }
    
    /**
     * Get current auction details
     */
    getCurrentAuction() {
        return this.activeAuction ? { ...this.activeAuction } : null;
    }
    
    /**
     * Cancel current auction (admin function)
     */
    cancelAuction() {
        if (!this.activeAuction) return false;
        
        clearInterval(this.auctionInterval);
        
        const auctionUI = document.getElementById('auction-ui');
        if (auctionUI) auctionUI.remove();
        
        this.activeAuction = null;
        
        this.game.showNotification('Auction cancelled', 'info');
        return true;
    }
    
    /**
     * Get auction statistics
     */
    getAuctionStats() {
        const totalAuctions = this.auctionHistory.length;
        const playerWins = this.auctionHistory.filter(auction => auction.winner === 'player').length;
        const totalSpent = this.auctionHistory
            .filter(auction => auction.winner === 'player')
            .reduce((sum, auction) => sum + auction.finalBid, 0);
            
        const averageBid = totalSpent / Math.max(1, playerWins);
        
        return {
            totalAuctions,
            playerWins,
            winRate: totalAuctions > 0 ? (playerWins / totalAuctions) : 0,
            totalSpent,
            averageBid,
            activeAuction: this.activeAuction !== null
        };
    }
    
    /**
     * Reset auction system
     */
    reset() {
        if (this.auctionInterval) {
            clearInterval(this.auctionInterval);
        }
        
        const auctionUI = document.getElementById('auction-ui');
        if (auctionUI) auctionUI.remove();
        
        this.activeAuction = null;
        this.auctionHistory = [];
        this.auctionInterval = null;
    }
    
    /**
     * Export auction data
     */
    exportData() {
        return {
            activeAuction: this.activeAuction,
            auctionHistory: this.auctionHistory,
            isActive: this.activeAuction !== null
        };
    }
    
    /**
     * Import auction data
     */
    importData(data) {
        if (data.auctionHistory) {
            this.auctionHistory = data.auctionHistory;
        }
        
        if (data.activeAuction && data.isActive) {
            this.activeAuction = data.activeAuction;
            // Don't automatically restart timers on import
            // Let the game decide when to resume
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuctionSystem;
}