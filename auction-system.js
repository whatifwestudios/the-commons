/**
 * Auction System for The Commons
 * Handles land auctions, bidding mechanics, and auction history
 */

class AuctionSystem {
    constructor(game) {
        this.game = game;
        
        // Auction state - support multiple concurrent auctions
        this.activeAuctions = new Map(); // Map of auctionId -> auction
        this.maxConcurrentAuctions = 2;
        this.auctionHistory = [];
        this.auctionIntervals = new Map(); // Map of auctionId -> interval
        
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
    startAuction(row, col, challengingPlayerId = 'player') {
        // Validate coordinates
        if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
            this.game.showNotification('Invalid parcel coordinates', 'error');
            return false;
        }
        
        // Check if we've reached max concurrent auctions
        if (this.activeAuctions.size >= this.maxConcurrentAuctions) {
            this.game.showNotification(`Maximum ${this.maxConcurrentAuctions} auctions allowed at once`, 'error');
            return false;
        }
        
        // Check if this parcel is already being auctioned
        const parcelKey = `${row}-${col}`;
        for (const auction of this.activeAuctions.values()) {
            if (auction.row === row && auction.col === col) {
                this.game.showNotification('This parcel is already being auctioned', 'error');
                return false;
            }
        }
        
        // Check if player has enough actions to start auction
        if (this.isCurrentPlayer(challengingPlayerId) && this.game.actionManager) {
            if (!this.game.actionManager.canUseActions(1)) {
                this.game.showNotification('Need 1 action to start an auction', 'error');
                return false;
            }
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
        
        // Create unique auction ID
        const auctionId = crypto.randomUUID();
        
        // Initialize auction
        const auction = {
            id: auctionId,
            row: row,
            col: col,
            coord: this.game.getParcelCoordinate(row, col),
            currentOwner: currentOwner,
            challengingPlayer: challengingPlayerId,
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
        
        // Use action for starting auction
        if (this.isCurrentPlayer(challengingPlayerId) && this.game.actionManager) {
            if (!this.game.actionManager.useActions(1)) {
                return false;
            }
        }
        
        // Send auction start to server for multiplayer sync
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'START_AUCTION',
                auctionId: auctionId,
                row: row,
                col: col,
                challengingPlayerId: challengingPlayerId,
                auctionData: auction
            });
        } else {
            // Fallback for solo play - add to local auctions
            this.activeAuctions.set(auctionId, auction);
            this.showAuctionModals(auction);
            this.startAuctionTimer(auctionId);
        }
        
        this.updateSidebar();
        
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
     * Legacy compatibility method - just shows most recent auction modal
     */
    showAuctionUI() {
        const auctions = Array.from(this.activeAuctions.values());
        if (auctions.length > 0) {
            const mostRecentAuction = auctions[auctions.length - 1];
            this.showAuctionModal(mostRecentAuction, 'challenger');
        }
    }

    /**
     * Show auction modals for both players
     */
    showAuctionModals(auction) {
        // Show modal for challenging player
        if (this.isCurrentPlayer(auction.challengingPlayer)) {
            this.showAuctionModal(auction, 'challenger');
        }
        
        // Show modal for current owner (if not the same as challenger)
        if (auction.currentOwner && auction.currentOwner !== auction.challengingPlayer) {
            if (this.isCurrentPlayer(auction.currentOwner)) {
                this.showAuctionModal(auction, 'owner');
            }
        }
    }

    /**
     * Show the auction UI
     */
    showAuctionModal(auction, playerRole = 'challenger') {
        // Remove existing auction UI for this specific modal
        const modalId = `auction-ui-${auction.id}-${playerRole}`;
        const existingUI = document.getElementById(modalId);
        if (existingUI) existingUI.remove();
        
        const totalValue = auction.calculatedLandValue + auction.buildingValue;
        const phaseLabel = auction.dutchPhase ? 'Dutch Phase' : 'Bidding Phase';
        const phaseDescription = auction.dutchPhase ? 
            'Price decreasing automatically' : 
            'Players can place competitive bids';
        
        const roleTitle = playerRole === 'challenger' ? 'Challenge Auction' : 'Defend Property';
        const roleDescription = playerRole === 'challenger' 
            ? 'You are challenging for this property' 
            : 'Your property is being challenged';
        
        const auctionUI = document.createElement('div');
        auctionUI.id = modalId;
        auctionUI.className = 'modal auction-modal';
        auctionUI.dataset.auctionId = auction.id;
        auctionUI.dataset.playerRole = playerRole;
        auctionUI.innerHTML = `
            <div class="modal-content parcel-auction">
                <div class="modal-header">
                    <h2>${roleTitle} - ${auction.coord}</h2>
                    <div class="role-description">${roleDescription}</div>
                    <button class="modal-close" onclick="window.game.auctionSystem.closeModal('${auction.id}', '${playerRole}')">&times;</button>
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
                                <div class="phase-indicator ${auction.dutchPhase ? 'dutch' : 'bidding'}">
                                    <div class="phase-dot"></div>
                                    <span class="phase-label">${phaseLabel}</span>
                                </div>
                                <div class="phase-description">${phaseDescription}</div>
                            </div>
                            
                            <div class="auction-timer-section">
                                <div class="timer-label">Time Remaining</div>
                                <div class="timer-display" id="auction-timer-${auction.id}">60s</div>
                                <div class="timer-bar">
                                    <div class="timer-progress" id="timer-progress-${auction.id}"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="current-bid-card">
                            <div class="bid-header">
                                <h3>Current Price</h3>
                                <div class="bid-trend ${auction.dutchPhase ? 'decreasing' : 'stable'}">
                                    <span class="trend-icon">${auction.dutchPhase ? '↓' : '→'}</span>
                                    <span class="trend-text">${auction.dutchPhase ? 'Decreasing' : 'Stable'}</span>
                                </div>
                            </div>
                            <div class="bid-amount-display">
                                <span class="currency">$</span>
                                <span class="amount" id="current-bid-${auction.id}">${auction.currentBid.toLocaleString()}</span>
                            </div>
                            <div class="bid-details">
                                <div class="bid-breakdown">
                                    <div class="breakdown-item">
                                        <span class="label">Land Value:</span>
                                        <span class="value">$${auction.calculatedLandValue.toLocaleString()}</span>
                                    </div>
                                    ${auction.buildingValue > 0 ? `
                                    <div class="breakdown-item">
                                        <span class="label">Building Value:</span>
                                        <span class="value">$${auction.buildingValue.toLocaleString()}</span>
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
                                    <input type="number" id="custom-bid-input-${auction.id}" placeholder="Enter custom bid..." min="${auction.currentBid + 1}">
                                    <button class="btn-primary" id="place-custom-bid-${auction.id}" data-auction-id="${auction.id}">Place Bid</button>
                                </div>
                                <button class="btn-primary large" id="place-bid-btn-${auction.id}" data-auction-id="${auction.id}">
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
                                    <span class="value ${(this.game.playerCash - auction.currentBid) < 0 ? 'insufficient' : ''}">
                                        $${(this.game.playerCash - auction.currentBid).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tab-content" id="parcel-details">
                        <div class="parcel-info-card">
                            <div class="parcel-header">
                                <h3>Property Information</h3>
                                <div class="parcel-coordinate">${auction.coord}</div>
                            </div>
                            <div class="parcel-details-grid">
                                <div class="detail-item">
                                    <span class="label">Current Owner:</span>
                                    <span class="value">${auction.currentOwner || 'Unowned'}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Land Value:</span>
                                    <span class="value">$${auction.calculatedLandValue.toLocaleString()}</span>
                                </div>
                                ${auction.buildingValue > 0 ? `
                                <div class="detail-item">
                                    <span class="label">Building Present:</span>
                                    <span class="value">Yes</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Building Value:</span>
                                    <span class="value">$${auction.buildingValue.toLocaleString()}</span>
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
        this.setupAuctionTabs(auction.id);
        
        // Setup bid controls
        this.setupBidControls(auction.id);
        
        // Update timer display
        this.updateAuctionTimer(auction.id);
    }
    
    /**
     * Close a specific auction modal
     */
    closeModal(auctionId, playerRole) {
        const modalId = `auction-ui-${auctionId}-${playerRole}`;
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Update sidebar with active auctions
     */
    updateSidebar() {
        // Remove existing sidebar
        const existingSidebar = document.getElementById('auction-sidebar');
        if (existingSidebar) existingSidebar.remove();
        
        if (this.activeAuctions.size === 0) return;
        
        const sidebar = document.createElement('div');
        sidebar.id = 'auction-sidebar';
        sidebar.className = 'auction-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>Active Auctions</h3>
                <span class="auction-count">${this.activeAuctions.size}/${this.maxConcurrentAuctions}</span>
            </div>
            <div class="auction-list" id="auction-list">
                ${Array.from(this.activeAuctions.values()).map(auction => `
                    <div class="auction-item" data-auction-id="${auction.id}">
                        <div class="auction-location">${auction.coord}</div>
                        <div class="auction-price">$${auction.currentBid.toLocaleString()}</div>
                        <div class="auction-time" id="sidebar-timer-${auction.id}">60s</div>
                        <div class="auction-players">
                            <span class="current-owner">${auction.currentOwner ? this.getPlayerDisplayName(auction.currentOwner) : 'Unowned'}</span>
                            <span class="vs">vs</span>
                            <span class="challenger">${this.getPlayerDisplayName(auction.challengingPlayer)}</span>
                        </div>
                        <button class="view-auction-btn" onclick="window.game.auctionSystem.focusAuction('${auction.id}')">
                            View
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        
        document.body.appendChild(sidebar);
        
        // Add animation
        setTimeout(() => {
            sidebar.classList.add('visible');
        }, 10);
    }

    /**
     * Focus on a specific auction (bring up modal)
     */
    focusAuction(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Show modal for current player
        this.showAuctionModal(auction, 'challenger');
    }

    /**
     * Setup auction tab switching
     */
    setupAuctionTabs(auctionId) {
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
    setupBidControls(auctionId) {
        // Quick bid buttons
        const quickBidButtons = document.querySelectorAll('.quick-bid-btn');
        quickBidButtons.forEach(button => {
            button.addEventListener('click', () => {
                const increment = parseFloat(button.getAttribute('data-increment'));
                this.placeBid(auctionId, increment);
            });
        });
        
        // Custom bid form
        const customBidInput = document.getElementById(`custom-bid-input-${auctionId}`);
        const customBidButton = document.getElementById(`place-custom-bid-${auctionId}`);
        
        if (customBidInput && customBidButton) {
            customBidButton.addEventListener('click', () => {
                const auction = this.activeAuctions.get(auctionId);
                if (!auction) return;
                
                const customAmount = parseInt(customBidInput.value);
                if (customAmount && customAmount > auction.currentBid) {
                    // Calculate the percentage increase for custom bid
                    const currentBid = auction.currentBid;
                    const customBidAsIncrement = (customAmount - currentBid) / currentBid;
                    this.placeBid(auctionId, customBidAsIncrement, customAmount);
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
        const placeBidButton = document.getElementById(`place-bid-btn-${auctionId}`);
        if (placeBidButton) {
            placeBidButton.addEventListener('click', () => {
                this.placeBid(auctionId, 0); // Accept current price
            });
        }
    }
    
    /**
     * Update auction timer display
     */
    updateAuctionTimer(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        const now = Date.now();
        const timeLeft = Math.max(0, auction.endTime - now) / 1000;
        const totalDuration = this.auctionDuration / 1000;
        const progress = Math.max(0, 1 - (timeLeft / totalDuration));
        
        // Update timer display
        const timerEl = document.getElementById(`auction-timer-${auctionId}`);
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
        const progressEl = document.getElementById(`timer-progress-${auctionId}`);
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
        const currentBidEl = document.getElementById(`current-bid-${auctionId}`);
        if (currentBidEl && auction) {
            currentBidEl.textContent = auction.currentBid.toLocaleString();
        }
        
        // Update bid trend indicator
        const modalElement = document.getElementById(`auction-ui-${auctionId}-challenger`) || document.getElementById(`auction-ui-${auctionId}-owner`);
        if (modalElement) {
            const trendEl = modalElement.querySelector('.bid-trend');
            if (trendEl) {
                const isDecreasing = auction.dutchPhase && !auction.currentBidder;
                trendEl.className = `bid-trend ${isDecreasing ? 'decreasing' : 'stable'}`;
                
                const trendIcon = trendEl.querySelector('.trend-icon');
                const trendText = trendEl.querySelector('.trend-text');
                if (trendIcon && trendText) {
                    trendIcon.textContent = isDecreasing ? '↓' : '→';
                    trendText.textContent = isDecreasing ? 'Decreasing' : 'Stable';
                }
            }
        }
        
        // Update phase indicator
        if (modalElement) {
            const phaseIndicator = modalElement.querySelector('.phase-indicator');
            if (phaseIndicator) {
                phaseIndicator.className = `phase-indicator ${auction.dutchPhase ? 'dutch' : 'bidding'}`;
                
                const phaseLabel = phaseIndicator.querySelector('.phase-label');
                if (phaseLabel) {
                    phaseLabel.textContent = auction.dutchPhase ? 'Dutch Phase' : 'Bidding Phase';
                }
            }
        }
        
        // Update after purchase amount
        if (modalElement) {
            const afterPurchaseEl = modalElement.querySelector('.bid-info .info-item:last-child .value');
            if (afterPurchaseEl) {
                const remaining = this.game.playerCash - auction.currentBid;
                afterPurchaseEl.textContent = `$${remaining.toLocaleString()}`;
                afterPurchaseEl.className = remaining < 0 ? 'value insufficient' : 'value';
            }
        }
        
        // Update sidebar timer
        const sidebarTimer = document.getElementById(`sidebar-timer-${auctionId}`);
        if (sidebarTimer) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = Math.floor(timeLeft % 60);
            const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            sidebarTimer.textContent = timeString;
        }
    }
    
    /**
     * Start the auction timer
     */
    startAuctionTimer(auctionId) {
        // Clear existing interval for this auction if it exists
        if (this.auctionIntervals.has(auctionId)) {
            clearInterval(this.auctionIntervals.get(auctionId));
        }
        
        const interval = setInterval(() => {
            const auction = this.activeAuctions.get(auctionId);
            if (!auction) {
                clearInterval(interval);
                this.auctionIntervals.delete(auctionId);
                return;
            }
            
            // Use server-synchronized time
            const now = this.getServerTime();
            const timeLeft = Math.max(0, auction.endTime - now) / 1000;
            
            // Update timer display
            this.updateAuctionTimer(auctionId);
            
            // Dutch auction phase - price drops (only in solo mode, server handles in multiplayer)
            if (auction.dutchPhase && !auction.currentBidder && !this.game.multiplayerManager?.isConnected) {
                const timeSinceLastUpdate = now - auction.lastDutchUpdate;
                if (timeSinceLastUpdate >= this.dutchUpdateInterval) {
                    const minPrice = auction.initialLandValue;
                    const newBid = Math.max(minPrice, Math.floor(auction.currentBid * this.dutchReductionRate));
                    auction.currentBid = newBid;
                    auction.lastDutchUpdate = now;
                    
                    // Update UI
                    const bidEl = document.getElementById(`current-bid-${auctionId}`);
                    if (bidEl) {
                        bidEl.textContent = newBid.toLocaleString();
                    }
                    
                    // Update sidebar
                    this.updateSidebar();
                }
            }
            
            // End auction when time expires (server handles in multiplayer, local handles in solo)
            if (timeLeft <= 0) {
                if (this.game.multiplayerManager?.isConnected) {
                    // In multiplayer, server handles ending - just update UI
                    this.updateAuctionEndedState(auctionId);
                } else {
                    // In solo mode, handle locally
                    this.endAuction(auctionId);
                }
            }
        }, 100); // Update every 100ms for smooth timer
        
        this.auctionIntervals.set(auctionId, interval);
    }
    
    /**
     * Place a bid in the auction
     */
    placeBid(auctionId, increment = 0.05, customAmount = null) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Validate bid before sending to server
        if (!auction.dutchPhase) {
            const newBid = customAmount || Math.floor(auction.currentBid * (1 + increment));
            
            // Validate minimum bid
            if (newBid <= auction.currentBid) {
                this.game.showNotification('Bid must be higher than current price', 'error');
                return;
            }
            
            // Check if player can afford this bid
            const totalCost = auction.currentOwner && !this.isCurrentPlayer(auction.currentOwner)
                ? newBid + auction.buildingValue 
                : newBid;
                
            if (this.game.playerCash < totalCost) {
                this.game.showInsufficientFundsFeedback();
                return;
            }
        }
        
        // Send bid to server for multiplayer sync
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'PLACE_BID',
                auctionId: auctionId,
                playerId: this.game.playerId,
                bidAmount: increment,
                customAmount: customAmount,
                clientAuctionVersion: auction.lastUpdateVersion || 0
            });
        } else {
            // Fallback for solo play - update locally
            this.updateAuctionLocally(auctionId, increment, customAmount);
        }
        
        // Update UI
        const currentBidEl = document.getElementById(`current-bid-${auctionId}`);
        if (currentBidEl) {
            currentBidEl.textContent = auction.currentBid.toLocaleString();
        }
        
        const statusEl = document.getElementById('bid-status');
        if (statusEl) {
            statusEl.textContent = auction.dutchPhase ? 'Dutch Auction - Price Dropping' : 'Highest Bidder: Player';
        }
        
        // Update sidebar
        this.updateSidebar();
        
        // Bidding is free (no action cost)
        // Actions are only used for starting and winning auctions
    }
    
    /**
     * Update auction action buttons
     */
    updateAuctionActions(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        const actionsEl = document.getElementById('auction-actions');
        if (!actionsEl || !auction) return;
        
        if (!auction.dutchPhase) {
            actionsEl.innerHTML = `
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid('${auctionId}', 0.01)">+1%</button>
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid('${auctionId}', 0.05)">+5%</button>
                <button class="auction-btn small" onclick="game.auctionSystem.placeBid('${auctionId}', 0.10)">+10%</button>
            `;
        }
    }
    
    /**
     * End a specific auction
     */
    endAuction(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Clear interval for this auction
        if (this.auctionIntervals.has(auctionId)) {
            clearInterval(this.auctionIntervals.get(auctionId));
            this.auctionIntervals.delete(auctionId);
        }
        
        const parcel = this.game.grid[auction.row][auction.col];
        const winner = auction.currentBidder;
        const finalBid = auction.currentBid;
        
        if (winner === 'player') {
            // Winner pays action cost
            if (this.game.actionManager && this.game.actionManager.canUseActions(1)) {
                this.game.actionManager.useActions(1);
            }
            
            // Process the auction result
            const previousOwner = parcel.owner;

            // Handle treasury collection based on previous ownership
            if (!previousOwner || previousOwner === null) {
                // Parcel was owned by the city - full purchase price goes to treasury
                this.game.governanceSystem.addFunds(finalBid, 'land sales');
            } else if (previousOwner === 'player') {
                // Current owner won their own auction - they keep the parcel, only pay 1% auction fee
                const auctionFee = Math.round(finalBid * 0.01);
                this.game.governanceSystem.addFunds(auctionFee, 'auction fees');

                // Update land value for LVT calculation but don't transfer ownership
                parcel.landValue.paidPrice = finalBid;
                parcel.landValue.lastAuctionDay = this.game.currentDay;

                // Player only pays auction fee, not full bid
                this.game.playerCash -= auctionFee;
                this.game.showNotification(`Kept parcel! Paid $${auctionFee.toLocaleString()} auction fee. New land value: $${finalBid.toLocaleString()}`, 'success');

                return; // Early return - no ownership transfer needed
            } else {
                // Parcel was owned by another player - 1% auction fee to governance budget, rest to previous owner
                const auctionFee = Math.round(finalBid * 0.01);
                const ownerPayment = finalBid - auctionFee;

                this.game.governanceSystem.addFunds(auctionFee, 'auction fees');

                // TODO: Pay previous owner $ownerPayment when multiplayer owner payment system is implemented
                console.log(`💳 Previous owner ${previousOwner} should receive $${ownerPayment.toLocaleString()}`);
            }

            // Transfer ownership
            parcel.owner = 'player';
            const totalCost = finalBid + auction.buildingValue;
            this.game.playerCash -= totalCost;
            
            parcel.landValue.paidPrice = finalBid;
            
            this.game.showNotification(`Won auction! Paid $${totalCost.toLocaleString()}. Used 1 action.`, 'success');
            
            // Update economic cache
            this.game.economicCache.playerParcels.add(`${auction.row}-${auction.col}`);
            this.game.economicCache.dirty.add(`${auction.row}-${auction.col}`);
        } else {
            // No winner or auction cancelled
            parcel.landValue.lastAuctionDay = this.game.currentDay;
            this.game.showNotification('Auction ended with no winner', 'info');
        }
        
        // Remove auction UI modals for this auction
        const challengerModal = document.getElementById(`auction-ui-${auctionId}-challenger`);
        const ownerModal = document.getElementById(`auction-ui-${auctionId}-owner`);
        if (challengerModal) challengerModal.remove();
        if (ownerModal) ownerModal.remove();
        
        // Add to history
        this.auctionHistory.push({
            ...auction,
            winner: winner,
            finalBid: finalBid,
            endTime: Date.now()
        });
        
        // Remove from active auctions
        this.activeAuctions.delete(auctionId);
        
        // Update sidebar
        this.updateSidebar();
        
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
     * Get server-synchronized time (with offset correction)
     */
    getServerTime() {
        const localTime = Date.now();
        const serverOffset = this.game.multiplayerManager?.serverTimeOffset || 0;
        return localTime + serverOffset;
    }
    
    /**
     * Update UI when auction ends (server will handle the actual ending)
     */
    updateAuctionEndedState(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Update timer displays to show "Ended"
        const timerElements = document.querySelectorAll(`[id*="timer-${auctionId}"]`);
        timerElements.forEach(el => {
            el.textContent = 'Ended';
            el.classList.add('auction-ended');
        });
        
        // Disable bid buttons
        const bidButtons = document.querySelectorAll(`[id*="bid-${auctionId}"]`);
        bidButtons.forEach(btn => {
            btn.disabled = true;
            btn.textContent = 'Auction Ended';
        });
    }
    
    /**
     * Get player display name from player ID
     */
    getPlayerDisplayName(playerId) {
        if (!playerId) return 'Unknown';
        
        // Handle legacy 'player' ID for current player
        if (playerId === 'player') {
            return this.game.playerSettings?.name || 'You';
        }
        
        // Get player name from multiplayer manager
        if (this.game.multiplayerManager && this.game.multiplayerManager.players) {
            const player = this.game.multiplayerManager.players.get(playerId);
            if (player) {
                return player.name || player.id;
            }
        }
        
        // Fallback to player ID
        return playerId;
    }
    
    /**
     * Check if player ID represents the current player
     */
    isCurrentPlayer(playerId) {
        if (playerId === 'player') return true;
        if (this.game.multiplayerManager && this.game.multiplayerManager.playerId) {
            return playerId === this.game.multiplayerManager.playerId;
        }
        return false;
    }
    
    /**
     * Check if any auctions are currently active
     */
    isAuctionActive() {
        return this.activeAuctions.size > 0;
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
        return Array.from(this.activeAuctions.values()).map(auction => ({ ...auction }));
    }
    
    /**
     * Get specific auction by ID
     */
    getAuctionById(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        return auction ? { ...auction } : null;
    }
    
    /**
     * Cancel a specific auction (admin function)
     */
    cancelAuction(auctionId) {
        if (!auctionId) {
            // Cancel all auctions if no ID specified
            for (const id of this.activeAuctions.keys()) {
                this.cancelAuction(id);
            }
            return true;
        }
        
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return false;
        
        // Clear interval
        if (this.auctionIntervals.has(auctionId)) {
            clearInterval(this.auctionIntervals.get(auctionId));
            this.auctionIntervals.delete(auctionId);
        }
        
        // Remove UI elements
        const challengerModal = document.getElementById(`auction-ui-${auctionId}-challenger`);
        const ownerModal = document.getElementById(`auction-ui-${auctionId}-owner`);
        if (challengerModal) challengerModal.remove();
        if (ownerModal) ownerModal.remove();
        
        // Remove from active auctions
        this.activeAuctions.delete(auctionId);
        
        // Update sidebar
        this.updateSidebar();
        
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
            activeAuctions: this.activeAuctions.size,
            maxConcurrentAuctions: this.maxConcurrentAuctions
        };
    }
    
    /**
     * Reset auction system
     */
    reset() {
        // Clear all intervals
        for (const interval of this.auctionIntervals.values()) {
            clearInterval(interval);
        }
        this.auctionIntervals.clear();
        
        // Remove all auction UIs
        for (const auctionId of this.activeAuctions.keys()) {
            const challengerModal = document.getElementById(`auction-ui-${auctionId}-challenger`);
            const ownerModal = document.getElementById(`auction-ui-${auctionId}-owner`);
            if (challengerModal) challengerModal.remove();
            if (ownerModal) ownerModal.remove();
        }
        
        // Remove sidebar
        const sidebar = document.getElementById('auction-sidebar');
        if (sidebar) sidebar.remove();
        
        this.activeAuctions.clear();
        this.auctionHistory = [];
    }
    
    /**
     * Export auction data
     */
    exportData() {
        return {
            activeAuctions: Array.from(this.activeAuctions.entries()),
            auctionHistory: this.auctionHistory,
            isActive: this.activeAuctions.size > 0,
            maxConcurrentAuctions: this.maxConcurrentAuctions
        };
    }
    
    /**
     * Import auction data
     */
    importData(data) {
        if (data.auctionHistory) {
            this.auctionHistory = data.auctionHistory;
        }
        
        if (data.maxConcurrentAuctions !== undefined) {
            this.maxConcurrentAuctions = data.maxConcurrentAuctions;
        }
        
        if (data.activeAuctions && data.isActive) {
            // Clear existing auctions
            this.activeAuctions.clear();
            
            // Import active auctions
            data.activeAuctions.forEach(([auctionId, auction]) => {
                this.activeAuctions.set(auctionId, auction);
            });
            
            // Don't automatically restart timers on import
            // Let the game decide when to resume
        }
    }
    
    /**
     * Update auction locally (solo play fallback)
     */
    updateAuctionLocally(auctionId, increment, customAmount) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Handle Dutch auction phase
        if (auction.dutchPhase) {
            auction.dutchPhase = false;
            auction.currentBidder = 'player';
            auction.bidHistory.push({
                bidder: 'player',
                amount: auction.currentBid,
                timestamp: Date.now()
            });
            
            this.updateAuctionActions(auctionId);
        } else {
            // Regular bidding phase - increase bid
            const newBid = customAmount || Math.floor(auction.currentBid * (1 + increment));
            
            auction.currentBid = newBid;
            auction.currentBidder = 'player';
            auction.bidHistory.push({
                bidder: 'player',
                amount: newBid,
                timestamp: Date.now()
            });
            
            // Extend time if bid placed near end
            const timeLeft = (auction.endTime - Date.now()) / 1000;
            if (timeLeft <= this.bidExtensionThreshold) {
                auction.endTime += this.bidExtensionTime;
            }
        }
        
        // Update UI immediately for solo play
        this.updateAuctionDisplay(auctionId);
    }
    
    /**
     * Handle server auction updates (multiplayer)
     */
    onAuctionStateUpdate(auctions) {
        // Sync local auction state with server state
        if (!auctions) return;
        
        // Update existing auctions or add new ones
        Object.entries(auctions).forEach(([auctionId, auctionData]) => {
            if (auctionData === null) {
                // Auction was deleted on server
                this.removeAuction(auctionId);
            } else if (auctionData) {
                // Update or add auction
                this.activeAuctions.set(auctionId, auctionData);
                this.updateAuctionDisplay(auctionId);
                
                // Start timer if this is a new auction
                if (!this.auctionIntervals.has(auctionId)) {
                    this.startAuctionTimer(auctionId);
                }
            }
        });
        
        this.updateSidebar();
    }
    
    /**
     * Update auction display for a specific auction
     */
    updateAuctionDisplay(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) return;
        
        // Update current bid display
        const currentBidEl = document.getElementById(`current-bid-${auctionId}`);
        if (currentBidEl) {
            currentBidEl.textContent = `$${auction.currentBid.toLocaleString()}`;
        }
        
        // Update current bidder display
        const currentBidderEl = document.getElementById(`current-bidder-${auctionId}`);
        if (currentBidderEl) {
            currentBidderEl.textContent = auction.currentBidder ? this.getPlayerDisplayName(auction.currentBidder) : 'None';
        }
        
        // Update bid history
        this.updateBidHistory(auctionId);
        
        // Update auction actions if in bidding phase
        if (!auction.dutchPhase) {
            this.updateAuctionActions(auctionId);
        }
    }
    
    /**
     * Remove auction and clean up
     */
    removeAuction(auctionId) {
        // Clear timer
        if (this.auctionIntervals.has(auctionId)) {
            clearInterval(this.auctionIntervals.get(auctionId));
            this.auctionIntervals.delete(auctionId);
        }
        
        // Remove from active auctions
        this.activeAuctions.delete(auctionId);
        
        // Remove modal if open
        const modal = document.getElementById(`auction-ui-${auctionId}-challenger`);
        if (modal) modal.remove();
        
        const ownerModal = document.getElementById(`auction-ui-${auctionId}-owner`);
        if (ownerModal) ownerModal.remove();
        
        // Update sidebar
        this.updateSidebar();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuctionSystem;
}