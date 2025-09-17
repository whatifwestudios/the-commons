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
        
        const totalValue = this.activeAuction.calculatedLandValue + this.activeAuction.buildingValue;
        const phaseLabel = this.activeAuction.dutchPhase ? 'Dutch Phase' : 'Bidding Phase';
        const phaseDescription = this.activeAuction.dutchPhase ? 
            'Price decreasing automatically' : 
            'Players can place competitive bids';
        
        const auctionUI = document.createElement('div');
        auctionUI.id = 'auction-ui';
        auctionUI.className = 'modal auction-modal';
        auctionUI.innerHTML = `
            <div class="modal-content parcel-auction">
                <div class="modal-header">
                    <h2>Parcel Auction - ${this.activeAuction.coord}</h2>
                    <button class="modal-close" onclick="window.game.auctionSystem.cancelAuction()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="auction-tabs">
                        <button class="tab-btn active" data-tab="current-auction">Live Auction</button>
                        <button class="tab-btn" data-tab="parcel-details">Property Details</button>
                        <button class="tab-btn" data-tab="auction-history">Bid History</button>
                    </div>
                    
                    <div class="tab-content active" id="current-auction">
                        <div class="auction-status-card">
                            <div class="auction-phase">
                                <div class="phase-indicator ${this.activeAuction.dutchPhase ? 'dutch' : 'bidding'}">
                                    <div class="phase-dot"></div>
                                    <span class="phase-label">${phaseLabel}</span>
                                </div>
                                <div class="phase-description">${phaseDescription}</div>
                            </div>
                            
                            <div class="auction-timer-section">
                                <div class="timer-label">Time Remaining</div>
                                <div class="timer-display" id="auction-timer">60s</div>
                                <div class="timer-bar">
                                    <div class="timer-progress" id="timer-progress"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="current-bid-card">
                            <div class="bid-header">
                                <h3>Current Price</h3>
                                <div class="bid-trend ${this.activeAuction.dutchPhase ? 'decreasing' : 'stable'}">
                                    <span class="trend-icon">${this.activeAuction.dutchPhase ? '↓' : '→'}</span>
                                    <span class="trend-text">${this.activeAuction.dutchPhase ? 'Decreasing' : 'Stable'}</span>
                                </div>
                            </div>
                            <div class="bid-amount-display">
                                <span class="currency">$</span>
                                <span class="amount" id="current-bid">${this.activeAuction.currentBid.toLocaleString()}</span>
                            </div>
                            <div class="bid-details">
                                <div class="bid-breakdown">
                                    <div class="breakdown-item">
                                        <span class="label">Land Value:</span>
                                        <span class="value">$${this.activeAuction.calculatedLandValue.toLocaleString()}</span>
                                    </div>
                                    ${this.activeAuction.buildingValue > 0 ? `
                                    <div class="breakdown-item">
                                        <span class="label">Building Value:</span>
                                        <span class="value">$${this.activeAuction.buildingValue.toLocaleString()}</span>
                                    </div>
                                    <div class="breakdown-item total">
                                        <span class="label">Total Value:</span>
                                        <span class="value">$${totalValue.toLocaleString()}</span>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <div class="bidding-section" id="bidding-section">
                            <div class="bid-controls">
                                <div class="quick-bid-buttons">
                                    <button class="quick-bid-btn" data-increment="0.05">+5%</button>
                                    <button class="quick-bid-btn" data-increment="0.10">+10%</button>
                                    <button class="quick-bid-btn" data-increment="0.20">+20%</button>
                                </div>
                                <div class="custom-bid-form">
                                    <input type="number" id="custom-bid-input" placeholder="Enter custom bid..." min="${this.activeAuction.currentBid + 1}">
                                    <button class="btn-primary" id="place-custom-bid">Place Bid</button>
                                </div>
                                <button class="btn-primary large" id="place-bid-btn">
                                    <span class="btn-icon">💰</span>
                                    Accept Current Price
                                </button>
                            </div>
                            
                            <div class="bid-info">
                                <div class="info-item">
                                    <span class="label">Your Cash:</span>
                                    <span class="value">$${this.game.playerCash.toLocaleString()}</span>
                                </div>
                                <div class="info-item">
                                    <span class="label">After Purchase:</span>
                                    <span class="value ${(this.game.playerCash - this.activeAuction.currentBid) < 0 ? 'insufficient' : ''}">
                                        $${(this.game.playerCash - this.activeAuction.currentBid).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="parcel-details">
                        <div class="parcel-info-card">
                            <div class="parcel-header">
                                <h3>Property Information</h3>
                                <div class="parcel-coordinate">${this.activeAuction.coord}</div>
                            </div>
                            <div class="parcel-details-grid">
                                <div class="detail-item">
                                    <span class="label">Current Owner:</span>
                                    <span class="value">${this.activeAuction.currentOwner || 'Unowned'}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Land Value:</span>
                                    <span class="value">$${this.activeAuction.calculatedLandValue.toLocaleString()}</span>
                                </div>
                                ${this.activeAuction.buildingValue > 0 ? `
                                <div class="detail-item">
                                    <span class="label">Building Present:</span>
                                    <span class="value">Yes</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Building Value:</span>
                                    <span class="value">$${this.activeAuction.buildingValue.toLocaleString()}</span>
                                </div>
                                ` : `
                                <div class="detail-item">
                                    <span class="label">Building Present:</span>
                                    <span class="value">No</span>
                                </div>
                                `}
                                <div class="detail-item">
                                    <span class="label">Auction Type:</span>
                                    <span class="value">Dutch → English</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="auction-history">
                        <div class="bid-history-card">
                            <h3>Bidding Activity</h3>
                            <div class="bid-list" id="bid-list">
                                <div class="no-bids">
                                    <div class="no-bids-icon">📋</div>
                                    <div class="no-bids-text">No bids placed yet</div>
                                    <div class="no-bids-subtext">Be the first to place a bid!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(auctionUI);
        
        // Add animation class
        setTimeout(() => {
            auctionUI.classList.add('visible');
        }, 10);
        
        // Setup tab switching
        this.setupAuctionTabs();
        
        // Setup bid controls
        this.setupBidControls();
        
        // Update timer display
        this.updateAuctionTimer();
    }
    
    /**
     * Setup auction tab switching
     */
    setupAuctionTabs() {
        const tabButtons = document.querySelectorAll('.auction-tabs .tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Update active tab button
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update active tab content
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetTab) {
                        content.classList.add('active');
                    }
                });
            });
        });
    }
    
    /**
     * Setup bid control event listeners
     */
    setupBidControls() {
        // Quick bid buttons
        const quickBidButtons = document.querySelectorAll('.quick-bid-btn');
        quickBidButtons.forEach(button => {
            button.addEventListener('click', () => {
                const increment = parseFloat(button.getAttribute('data-increment'));
                this.placeBid(increment);
            });
        });
        
        // Custom bid form
        const customBidInput = document.getElementById('custom-bid-input');
        const customBidButton = document.getElementById('place-custom-bid');
        
        if (customBidInput && customBidButton) {
            customBidButton.addEventListener('click', () => {
                const customAmount = parseInt(customBidInput.value);
                if (customAmount && customAmount > this.activeAuction.currentBid) {
                    // Calculate the percentage increase for custom bid
                    const currentBid = this.activeAuction.currentBid;
                    const customBidAsIncrement = (customAmount - currentBid) / currentBid;
                    this.placeBid(customBidAsIncrement, customAmount);
                    customBidInput.value = '';
                } else {
                    this.game.showNotification('Please enter a valid bid higher than current price', 'error');
                }
            });
            
            // Allow Enter key to submit custom bid
            customBidInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    customBidButton.click();
                }
            });
        }
        
        // Accept current price button  
        const placeBidButton = document.getElementById('place-bid-btn');
        if (placeBidButton) {
            placeBidButton.addEventListener('click', () => {
                this.placeBid(0); // Accept current price
            });
        }
    }
    
    /**
     * Update auction timer display
     */
    updateAuctionTimer() {
        if (!this.activeAuction) return;
        
        const now = Date.now();
        const timeLeft = Math.max(0, this.activeAuction.endTime - now) / 1000;
        const totalDuration = this.auctionDuration / 1000;
        const progress = Math.max(0, 1 - (timeLeft / totalDuration));
        
        // Update timer display
        const timerEl = document.getElementById('auction-timer');
        if (timerEl) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = Math.floor(timeLeft % 60);
            const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            timerEl.textContent = timeString;
            
            // Add urgency styling for last 10 seconds
            if (timeLeft <= 10) {
                timerEl.classList.add('urgent');
            } else {
                timerEl.classList.remove('urgent');
            }
        }
        
        // Update progress bar
        const progressEl = document.getElementById('timer-progress');
        if (progressEl) {
            progressEl.style.width = `${progress * 100}%`;
            
            // Change color based on time remaining
            if (timeLeft <= 10) {
                progressEl.style.background = 'linear-gradient(90deg, #ff4444, #ff6666)';
            } else if (timeLeft <= 30) {
                progressEl.style.background = 'linear-gradient(90deg, #ff9500, #ffb84d)';
            } else {
                progressEl.style.background = 'linear-gradient(90deg, #ff9500, #ffb84d)';
            }
        }
        
        // Update current bid display
        const currentBidEl = document.getElementById('current-bid');
        if (currentBidEl && this.activeAuction) {
            currentBidEl.textContent = this.activeAuction.currentBid.toLocaleString();
        }
        
        // Update bid trend indicator
        const trendEl = document.querySelector('.bid-trend');
        if (trendEl) {
            const isDecreasing = this.activeAuction.dutchPhase && !this.activeAuction.currentBidder;
            trendEl.className = `bid-trend ${isDecreasing ? 'decreasing' : 'stable'}`;
            
            const trendIcon = trendEl.querySelector('.trend-icon');
            const trendText = trendEl.querySelector('.trend-text');
            if (trendIcon && trendText) {
                trendIcon.textContent = isDecreasing ? '↓' : '→';
                trendText.textContent = isDecreasing ? 'Decreasing' : 'Stable';
            }
        }
        
        // Update phase indicator
        const phaseIndicator = document.querySelector('.phase-indicator');
        if (phaseIndicator) {
            phaseIndicator.className = `phase-indicator ${this.activeAuction.dutchPhase ? 'dutch' : 'bidding'}`;
            
            const phaseLabel = phaseIndicator.querySelector('.phase-label');
            if (phaseLabel) {
                phaseLabel.textContent = this.activeAuction.dutchPhase ? 'Dutch Phase' : 'Bidding Phase';
            }
        }
        
        // Update after purchase amount
        const afterPurchaseEl = document.querySelector('.bid-info .info-item:last-child .value');
        if (afterPurchaseEl) {
            const remaining = this.game.playerCash - this.activeAuction.currentBid;
            afterPurchaseEl.textContent = `$${remaining.toLocaleString()}`;
            afterPurchaseEl.className = remaining < 0 ? 'value insufficient' : 'value';
        }
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
            this.updateAuctionTimer();
            
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
    placeBid(increment = 0.05, customAmount = null) {
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
            const newBid = customAmount || Math.floor(this.activeAuction.currentBid * (1 + increment));
            
            // Validate minimum bid
            if (newBid <= this.activeAuction.currentBid) {
                this.game.showNotification('Bid must be higher than current price', 'error');
                return;
            }
            
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