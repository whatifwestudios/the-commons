/**
 * Parcel Auction System for The Commons
 * Handles hostile takeover auctions for land parcels
 * Independent from action marketplace
 */

class ParcelAuctionSystem {
    constructor(game) {
        // console.log('🔨 ParcelAuctionSystem constructor called');
        this.game = game;
        this.activeAuctions = new Map(); // auctionId -> auction data
        this.maxConcurrentAuctions = 2;

        // UI elements
        this.auctionModal = null;
        this.auctionSidebar = null;

        this.setupUI();
        this.setupWebSocketHandlers();
        this.startTimerUpdates();
        // console.log('🔨 ParcelAuctionSystem initialization complete');

        // Add global test function for debugging
        window.testAuctionModal = () => {
        // console.log('🔨 Testing auction modal...');
        // console.log('🔨 Modal element:', this.auctionModal);
        // console.log('🔨 Active auctions:', this.activeAuctions);

            // Create a test auction to show the modal
            const testAuction = {
                id: 'test-1',
                row: 5,
                col: 5,
                currentBid: 1000,
                buildingValue: 0,
                endTime: Date.now() + 30000,
                currentOwner: 'TestOwner'
            };

            this.activeAuctions.set('test-1', testAuction);
            this.showBiddingModal('test-1');
        };
    }

    /**
     * Start timer updates for real-time countdown
     */
    startTimerUpdates() {
        // Update timers every second
        setInterval(() => {
            this.updateTimers();
        }, 1000);
    }

    /**
     * Update all auction timers and urgency indicators
     */
    updateTimers() {
        // Track if any auctions expired this cycle
        let auctionsExpired = false;

        // Update sidebar timers
        for (const [auctionId, auction] of this.activeAuctions) {
            const timeRemaining = auction.endTime - Date.now();

            // Only remove auctions that have truly expired
            // Don't remove if they're transitioning to owner_response phase
            if (timeRemaining <= 0 && auction.phase !== 'owner_response') {
                // Server will handle phase transition, don't delete prematurely
                continue;
            }

            // Skip owner_response phase auctions that have expired
            if (auction.phase === 'owner_response' && auction.ownerResponseEnd && Date.now() >= auction.ownerResponseEnd) {
                continue;
            }

            // Update timer display in sidebar
            const auctionItem = document.querySelector(`[data-auction-id="${auctionId}"] .auction-sidebar-time`);
            const progressBar = document.querySelector(`[data-auction-id="${auctionId}"] .auction-progress`);

            if (auctionItem) {
                const timeText = this.formatTimeRemaining(auction.endTime);
                auctionItem.textContent = timeText;

                // Calculate time progress (assuming 60 second auctions)
                const totalAuctionTime = 60000; // 60 seconds in ms
                const elapsed = totalAuctionTime - timeRemaining;
                const progressPercent = Math.min(100, Math.max(0, (elapsed / totalAuctionTime) * 100));

                // Update progress bar
                if (progressBar) {
                    progressBar.style.width = `${progressPercent}%`;

                    // Color the progress bar based on urgency
                    const isUrgent = timeRemaining <= 10000; // 10 seconds
                    const isCritical = timeRemaining <= 5000; // 5 seconds

                    if (isCritical) {
                        progressBar.style.backgroundColor = '#ff4444';
                        progressBar.style.animation = 'pulse-red 0.5s infinite alternate';
                    } else if (isUrgent) {
                        progressBar.style.backgroundColor = '#ffa500';
                        progressBar.style.animation = 'none';
                    } else {
                        progressBar.style.backgroundColor = '#4CAF50';
                        progressBar.style.animation = 'none';
                    }
                }

                // Update text urgency styling and play sound alerts
                const isUrgent = timeRemaining <= 10000;
                const isCritical = timeRemaining <= 5000;

                if (isCritical) {
                    auctionItem.classList.add('critical');
                    auctionItem.classList.add('urgent');
                } else if (isUrgent) {
                    auctionItem.classList.add('urgent');
                    auctionItem.classList.remove('critical');
                } else {
                    auctionItem.classList.remove('urgent', 'critical');
                }
            }
        }

        // Update modal timer if open
        const modalTimer = document.getElementById('auction-time-remaining');
        if (modalTimer && this.currentModalAuctionId) {
            const auction = this.activeAuctions.get(this.currentModalAuctionId);
            if (auction) {
                modalTimer.textContent = this.formatTimeRemaining(auction.endTime);
            }
        }

        // Update indicator urgency
        this.updateIndicatorUrgency();

        // Refresh sidebar ONLY if auctions expired this cycle
        if (auctionsExpired) {
            this.updateAuctionSidebar();
        }
    }

    /**
     * Update indicator urgency based on auction status
     */
    updateIndicatorUrgency() {
        const indicator = document.getElementById('auction-indicator');
        if (!indicator || this.activeAuctions.size === 0) return;

        let hasUrgent = false;
        let hasCritical = false;
        for (const auction of this.activeAuctions.values()) {
            const timeRemaining = auction.endTime - Date.now();
            if (timeRemaining <= 5000) {
                hasCritical = true;
                break;
            } else if (timeRemaining <= 10000) {
                hasUrgent = true;
            }
        }

        // Update indicator based on most urgent state
        if (hasCritical) {
            indicator.textContent = '●';
            indicator.style.color = '#ff4444';
            indicator.style.animation = 'none';
            if (!indicator.blinkInterval) {
                indicator.blinkInterval = setInterval(() => {
                    indicator.style.opacity = indicator.style.opacity === '0.3' ? '1' : '0.3';
                }, 300); // Faster blinking for critical
            }
        } else if (hasUrgent) {
            indicator.textContent = '●';
            indicator.style.color = '#ffa500';
            indicator.style.animation = 'none';
            indicator.style.opacity = '1';
            // Clear any existing blink interval
            if (indicator.blinkInterval) {
                clearInterval(indicator.blinkInterval);
                indicator.blinkInterval = null;
            }
        } else {
            indicator.textContent = '●';
            indicator.style.color = '#4CAF50';
            indicator.style.animation = 'none';
            indicator.style.opacity = '1';
            // Clear any existing blink interval
            if (indicator.blinkInterval) {
                clearInterval(indicator.blinkInterval);
                indicator.blinkInterval = null;
            }
        }
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
     * Reset auction system for new game (board game pulled from shelf)
     */
    resetForNewGame() {
        // Clear all active auctions
        this.activeAuctions.clear();

        // Force recreate sidebar to remove any stale DOM elements with old event handlers
        const existingSection = document.getElementById('auction-section');
        if (existingSection) {
            existingSection.remove();
        }
        this.createAuctionSidebar();

        // Hide auction modal if open
        if (this.auctionModal) {
            this.auctionModal.classList.remove('visible');
        }

        console.log('🔨 Auction system reset - sidebar recreated fresh');
    }

    /**
     * Setup WebSocket message handlers for auction updates
     */
    setupWebSocketHandlers() {
        // Wait for economic client to be ready, then subscribe to auction updates
        const setupSubscription = () => {
            if (this.game.economicClient?.connectionManager) {
                this.game.economicClient.connectionManager.subscribe('PARCEL_AUCTION_UPDATE', (data) => {
                    this.handleAuctionUpdate(data);
                });
        // console.log('🔨 Parcel auction system subscribed to WebSocket updates');
            } else {
                // Retry after a short delay if not ready yet
                setTimeout(setupSubscription, 100);
            }
        };
        setupSubscription();
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
        // console.log('🔨 showBiddingModal called:', auctionId);
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) {
            console.error('🔨 No auction found for ID:', auctionId);
            return;
        }

        // console.log('🔨 Found auction:', auction);

        // Populate modal with auction data
        this.populateAuctionModal(auction);

        // Show modal
        if (this.auctionModal) {
        // console.log('🔨 Showing auction modal');
            this.auctionModal.classList.add('visible');
        } else {
            console.error('🔨 Auction modal not found!');
        }
    }

    /**
     * Populate auction modal with auction data
     */
    populateAuctionModal(auction) {
        // Clear any existing status messages and show bid controls
        this.clearStatusMessages();

        // Update auction info with Letter-Number coordinate
        const parcelCoord = this.game.getParcelCoordinate(auction.row, auction.col);
        document.getElementById('auction-parcel-coords').textContent = parcelCoord;
        document.getElementById('auction-current-owner').textContent = auction.currentOwner || 'Unclaimed';
        document.getElementById('auction-time-remaining').textContent = this.formatTimeRemaining(auction.endTime);

        // Update bid info
        document.getElementById('auction-current-bid').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-land-price').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-building-value').textContent = auction.buildingValue.toLocaleString();
        document.getElementById('auction-total-cost').textContent = (auction.currentBid + auction.buildingValue).toLocaleString();


        // Store current auction ID for form submission
        this.currentModalAuctionId = auction.id;
    }

    /**
     * Populate modal for challenger (auction starter)
     */
    populateChallengerModal(auction) {
        // Update basic auction info
        const parcelCoord = this.game.getParcelCoordinate(auction.row, auction.col);
        document.getElementById('auction-parcel-coords').textContent = parcelCoord;
        document.getElementById('auction-current-owner').textContent = auction.currentOwner || 'Unclaimed';
        document.getElementById('auction-time-remaining').textContent = this.formatTimeRemaining(auction.endTime);

        // Update bid info
        document.getElementById('auction-current-bid').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-land-price').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-building-value').textContent = auction.buildingValue.toLocaleString();
        document.getElementById('auction-total-cost').textContent = (auction.currentBid + auction.buildingValue).toLocaleString();

        // Clear any existing status messages
        this.clearStatusMessages();

        // Hide bid controls and show challenger status
        const bidControls = this.auctionModal.querySelector('.bid-controls');
        if (bidControls) {
            bidControls.style.display = 'none';
        }

        // Add challenger status message
        const modalBody = this.auctionModal.querySelector('.modal-body');
        if (modalBody) {
            let statusMessage = modalBody.querySelector('.challenger-status');
            if (!statusMessage) {
                statusMessage = document.createElement('div');
                statusMessage.className = 'challenger-status';
                modalBody.appendChild(statusMessage);
            }
            statusMessage.innerHTML = `
                <div style="background: #2a2a2a; border: 2px solid #4CAF50; border-radius: 4px; padding: 15px; margin-top: 15px; text-align: center;">
                    <h3 style="color: #4CAF50; margin: 0 0 10px 0;">🎯 Your Auction is Active</h3>
                    <p style="margin: 0; color: #ccc;">You started this auction. Other players can now bid on this parcel.</p>
                    <p style="margin: 10px 0 0 0; color: #fff; font-weight: bold;">Current bid: $${auction.currentBid.toLocaleString()}</p>
                </div>
            `;
        }

        this.currentModalAuctionId = auction.id;
    }

    /**
     * Populate modal for property owner (being challenged)
     */
    populateOwnerNotificationModal(auction) {
        // Update basic auction info
        const parcelCoord = this.game.getParcelCoordinate(auction.row, auction.col);
        document.getElementById('auction-parcel-coords').textContent = parcelCoord;
        document.getElementById('auction-current-owner').textContent = auction.currentOwner || 'Unclaimed';
        document.getElementById('auction-time-remaining').textContent = this.formatTimeRemaining(auction.endTime);

        // Update bid info
        document.getElementById('auction-current-bid').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-land-price').textContent = auction.currentBid.toLocaleString();
        document.getElementById('auction-building-value').textContent = auction.buildingValue.toLocaleString();
        document.getElementById('auction-total-cost').textContent = (auction.currentBid + auction.buildingValue).toLocaleString();

        // Clear any existing status messages
        this.clearStatusMessages();

        // Hide bid controls and show owner notification
        const bidControls = this.auctionModal.querySelector('.bid-controls');
        if (bidControls) {
            bidControls.style.display = 'none';
        }

        // Add owner notification message
        const modalBody = this.auctionModal.querySelector('.modal-body');
        if (modalBody) {
            let statusMessage = modalBody.querySelector('.owner-notification');
            if (!statusMessage) {
                statusMessage = document.createElement('div');
                statusMessage.className = 'owner-notification';
                modalBody.appendChild(statusMessage);
            }
            statusMessage.innerHTML = `
                <div style="background: #2a2a2a; border: 2px solid #ffa500; border-radius: 4px; padding: 15px; margin-top: 15px; text-align: center;">
                    <h3 style="color: #ffa500; margin: 0 0 10px 0;">⚠️ Your Property is Being Auctioned</h3>
                    <p style="margin: 0; color: #ccc;">Someone has started an auction for your parcel ${parcelCoord}.</p>
                    <p style="margin: 10px 0 0 0; color: #fff; font-weight: bold;">Opening bid: $${auction.currentBid.toLocaleString()}</p>
                    <p style="margin: 5px 0 0 0; color: #ccc; font-size: 14px;">You'll have 30 seconds to match the winning bid if the auction is successful.</p>
                </div>
            `;
        }

        this.currentModalAuctionId = auction.id;
    }

    /**
     * Clear any existing status messages from modal
     */
    clearStatusMessages() {
        if (!this.auctionModal) return;

        const statusMessage = this.auctionModal.querySelector('#auction-status-message');
        if (statusMessage) {
            statusMessage.innerHTML = '';
        }

        // Show bid controls for normal bidding
        const bidControls = this.auctionModal.querySelector('#bid-controls-section');
        if (bidControls) {
            bidControls.classList.remove('hidden');
        }
    }

    /**
     * Close the auction modal
     */
    closeModal() {
        if (this.auctionModal) {
            this.auctionModal.classList.remove('visible');
        }
    }

    /**
     * Place a bid on an auction
     */
    async placeBid(auctionId, bidAmount) {
        // console.log('🔨 placeBid called:', { auctionId, bidAmount });
        try {
            if (!this.game.economicClient) {
                console.error('🔨 No economic client available');
                this.game.showNotification('Economic client not available', 'error');
                return;
            }

        // console.log('🔨 Sending bid transaction...');
            const result = await this.game.economicClient.sendTransaction({
                type: 'PARCEL_AUCTION_BID',
                auctionId: auctionId,
                bidAmount: bidAmount
            });

        // console.log('🔨 Bid result:', result);
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
        const parcel = this.game.grid[row][col];

        // Get last paid price from parcel data or game state
        let lastPaidPrice = 100; // Default base price

        if (parcel?.lastPurchasePrice) {
            lastPaidPrice = parcel.lastPurchasePrice;
        } else if (this.game.economicClient?.gameState?.parcels) {
            // Try to get from server game state
            const serverParcel = this.game.economicClient.gameState.parcels
                .find(p => p.row === row && p.col === col);
            if (serverParcel?.lastPurchasePrice) {
                lastPaidPrice = serverParcel.lastPurchasePrice;
            }
        }

        return {
            row: row,
            col: col,
            owner: parcel?.owner,
            lastPaidPrice: lastPaidPrice,
            buildingValue: this.calculateBuildingValue(row, col),
            hasBuilding: !!parcel?.building
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
        modal.className = 'modal auction-modal';
        modal.id = 'auction-modal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>PARCEL AUCTION</h2>
                    <button class="modal-close" onclick="game.parcelAuctionSystem.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Auction Details Section -->
                    <div class="auction-modal-section">
                        <div class="auction-modal-row">
                            <span class="auction-modal-label">PARCEL</span>
                            <span class="auction-modal-value" id="auction-parcel-coords">—</span>
                        </div>
                        <div class="auction-modal-row">
                            <span class="auction-modal-label">OWNER</span>
                            <span class="auction-modal-value" id="auction-current-owner">—</span>
                        </div>
                        <div class="auction-modal-row">
                            <span class="auction-modal-label">TIME</span>
                            <span class="auction-modal-value" id="auction-time-remaining">—</span>
                        </div>
                    </div>

                    <!-- Pricing Section -->
                    <div class="auction-modal-section">
                        <div class="auction-modal-row highlight">
                            <span class="auction-modal-label">CURRENT BID</span>
                            <span class="auction-modal-value" id="auction-current-bid">$—</span>
                        </div>
                        <div class="auction-modal-row">
                            <span class="auction-modal-label">LAND VALUE</span>
                            <span class="auction-modal-value" id="auction-land-price">$—</span>
                        </div>
                        <div class="auction-modal-row">
                            <span class="auction-modal-label">BUILDING VALUE</span>
                            <span class="auction-modal-value" id="auction-building-value">$—</span>
                        </div>
                        <div class="auction-modal-row total">
                            <span class="auction-modal-label">TOTAL COST</span>
                            <span class="auction-modal-value" id="auction-total-cost">$—</span>
                        </div>
                    </div>

                    <!-- Bid Controls Section -->
                    <div class="auction-modal-section bid-controls-section" id="bid-controls-section">
                        <div class="auction-modal-subsection-title">PLACE BID</div>
                        <div class="auction-bid-actions">
                            <button class="auction-btn auction-btn-quick" onclick="game.parcelAuctionSystem.quickBid(5)">+5%</button>
                            <button class="auction-btn auction-btn-quick" onclick="game.parcelAuctionSystem.quickBid(10)">+10%</button>
                        </div>
                        <div class="auction-custom-bid-row">
                            <input type="number" class="auction-bid-input" id="custom-bid-amount" placeholder="Custom amount" onkeypress="if(event.key === 'Enter') game.parcelAuctionSystem.customBid()">
                            <button class="auction-btn auction-btn-primary" onclick="game.parcelAuctionSystem.customBid()">SUBMIT BID</button>
                        </div>
                    </div>

                    <!-- Owner Response Section -->
                    <div class="auction-modal-section owner-response-section hidden" id="owner-response-section">
                        <div class="auction-modal-subsection-title">OWNER RESPONSE <span id="response-time-remaining" class="response-timer-value">30s</span></div>
                        <div class="auction-bid-actions">
                            <button class="auction-btn auction-btn-success" onclick="game.parcelAuctionSystem.ownerResponse('match')">MATCH BID</button>
                            <button class="auction-btn auction-btn-danger" onclick="game.parcelAuctionSystem.ownerResponse('decline')">DECLINE</button>
                        </div>
                    </div>

                    <!-- Status Message Placeholder -->
                    <div id="auction-status-message"></div>
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
        // Find existing sidebar or create it
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'sidebar';
            document.body.appendChild(sidebar);
        }

        // Check if auction section already exists
        const existingAuctionSection = document.getElementById('auction-section');
        if (existingAuctionSection) {
        // console.log('🔨 Auction section already exists, removing it first');
            existingAuctionSection.remove();
        }

        const auctionSection = document.createElement('div');
        auctionSection.className = 'sidebar-section collapsible collapsed';
        auctionSection.id = 'auction-section';

        auctionSection.innerHTML = `
            <div class="section-header" data-target="auction-content">
                <span>AUCTIONS <span id="auction-indicator" class="auction-indicator" style="display: none;">●</span></span>
                <span class="collapse-icon"></span>
            </div>
            <div id="auction-content" class="section-content">
                <div class="auction-list" id="auction-list">
                    <div class="no-auctions">No active auctions</div>
                </div>
            </div>
        `;

        // Insert after Action Manager section
        const actionManagerSection = document.getElementById('action-manager-section');
        if (actionManagerSection) {
        // console.log('🔨 Inserting auction section after Action Manager');
            sidebar.insertBefore(auctionSection, actionManagerSection.nextSibling);
        } else {
        // console.log('🔨 Action Manager not found, appending auction section to sidebar');
            sidebar.appendChild(auctionSection);
        }

        this.auctionSidebar = auctionSection;
        // console.log('🔨 Auction sidebar created successfully:', auctionSection);

        // Add click event listener for collapse functionality
        const sectionHeader = auctionSection.querySelector('.section-header');
        if (sectionHeader) {
            sectionHeader.addEventListener('click', function() {
                const collapsibleSection = this.parentElement;
                if (collapsibleSection && collapsibleSection.classList.contains('collapsible')) {
                    collapsibleSection.classList.toggle('collapsed');
        // console.log('🔨 Auction section toggled, collapsed:', collapsibleSection.classList.contains('collapsed'));
                }
            });
        // console.log('🔨 Added click event listener to auction section header');
        }
    }

    /**
     * Update auction sidebar with current auctions
     */
    updateAuctionSidebar() {
        const auctionList = document.getElementById('auction-list');
        if (!auctionList) {
            return;
        }

        if (this.activeAuctions.size === 0) {
            auctionList.innerHTML = '<div class="no-auctions">No active auctions</div>';
            this.hideAuctionIndicator();
            return;
        }

        let html = '';
        for (const [auctionId, auction] of this.activeAuctions) {
            const timeRemaining = auction.endTime - Date.now();
            const isUrgent = timeRemaining <= 5000; // Final 5 seconds
            const timeText = this.formatTimeRemaining(auction.endTime);
            const currentBid = auction.currentBid;
            const quickBid1 = Math.ceil(currentBid * 1.05); // +5%
            const quickBid2 = Math.ceil(currentBid * 1.10); // +10%
            const parcelCoord = this.game.getParcelCoordinate(auction.row, auction.col);

            // Determine user role for this auction
            const isChallenger = auction.startedBy === this.game.currentPlayerId;
            const isCurrentOwner = auction.currentOwner === this.game.currentPlayerId;

            // Determine modal function and role indicator
            let modalFunction, roleIndicator, bidActions;

            if (isChallenger) {
                modalFunction = 'showChallengerModal';
                roleIndicator = '<span class="auction-role-tag auction-role-challenger">CHALLENGER</span>';
                bidActions = '';
            } else if (isCurrentOwner) {
                modalFunction = 'showOwnerNotificationModal';
                roleIndicator = '<span class="auction-role-tag auction-role-owner">OWNER</span>';
                bidActions = '';
            } else {
                modalFunction = 'showBiddingModal';
                roleIndicator = '';
                bidActions = `
                    <div class="auction-sidebar-actions">
                        <button class="auction-sidebar-btn" onclick="event.stopPropagation(); game.parcelAuctionSystem.quickBidOnAuction(${auctionId}, ${quickBid1})">
                            +5%
                        </button>
                        <button class="auction-sidebar-btn" onclick="event.stopPropagation(); game.parcelAuctionSystem.quickBidOnAuction(${auctionId}, ${quickBid2})">
                            +10%
                        </button>
                    </div>
                `;
            }

            html += `
                <div class="auction-sidebar-item" data-auction-id="${auctionId}" onclick="game.parcelAuctionSystem.${modalFunction}(${auctionId})">
                    <div class="auction-sidebar-header">
                        <span class="auction-sidebar-parcel">${parcelCoord}</span>
                        ${roleIndicator}
                        <span class="auction-sidebar-time ${isUrgent ? 'urgent' : ''}">${timeText}</span>
                    </div>
                    <div class="auction-sidebar-bid">$${currentBid.toLocaleString()}</div>
                    ${bidActions}
                </div>
            `;
        }

        auctionList.innerHTML = html;
        this.showAuctionIndicator();
    }

    /**
     * Show auction indicator when auctions are active
     */
    showAuctionIndicator() {
        const indicator = document.getElementById('auction-indicator');
        if (indicator) {
            indicator.style.display = 'inline';
            indicator.textContent = '●';
            indicator.style.color = '#4CAF50'; // Always green initially
            indicator.style.animation = 'none';
        }
    }

    /**
     * Hide auction indicator when no auctions are active
     */
    hideAuctionIndicator() {
        const indicator = document.getElementById('auction-indicator');
        if (indicator) {
            indicator.style.display = 'none';
            indicator.style.animation = 'none';
        }
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
        // console.log('🔨 Auction update received:', data);
        // console.log('🔨 Message type:', data.type, 'subtype:', data.subtype);
        switch (data.subtype) {
            case 'AUCTION_STARTED':
        // console.log('🔨 AUCTION_STARTED:', data);
        // console.log('🔨 Current player ID:', this.game.currentPlayerId);
        // console.log('🔨 Started by:', data.auction.startedBy);
                this.activeAuctions.set(data.auctionId, data.auction);
                this.updateAuctionSidebar();


                // Show appropriate interface based on user role
                const isChallenger = data.auction.startedBy === this.game.currentPlayerId;
                const isCurrentOwner = data.auction.currentOwner === this.game.currentPlayerId;

                if (isChallenger) {
        // console.log('🔨 Showing challenger status modal');
                    this.showChallengerModal(data.auctionId);
                } else if (isCurrentOwner) {
        // console.log('🔨 Showing owner notification modal');
                    this.showOwnerNotificationModal(data.auctionId);
                } else {
                    // Show notification for others who can bid
                    const parcelCoord = this.game.getParcelCoordinate(data.auction.row, data.auction.col);
                    this.game.showNotification(`🔨 Auction started on parcel ${parcelCoord} - Check sidebar to bid!`, 'info');
                }
                break;

            case 'NEW_BID':
                if (this.activeAuctions.has(data.auctionId)) {
                    this.activeAuctions.get(data.auctionId).currentBid = data.bidAmount;
                    this.activeAuctions.get(data.auctionId).highBidderId = data.bidderId;


                    this.updateAuctionDisplay(data.auctionId);
                }
                break;

            case 'OWNER_RESPONSE_PHASE':
                // Auction moved to owner response phase
                if (this.activeAuctions.has(data.auctionId)) {
                    const auction = this.activeAuctions.get(data.auctionId);
                    auction.phase = 'owner_response';
                    auction.ownerResponseEnd = data.responseTimeEnd;

                    // Store financial data from server
                    if (data.financialData) {
                        auction.financialData = data.financialData;
                    }

                    // Show modal automatically for the current owner
                    const isCurrentOwner = auction.currentOwnerId === this.game.currentPlayerId;
                    if (isCurrentOwner) {
        // console.log('🔨 Showing owner response modal for current owner');
                        this.showOwnerResponseModal(data.auctionId);
                    }

                    this.updateAuctionDisplay(data.auctionId);
                }
                break;

            case 'AUCTION_COMPLETED':
        // console.log('🔨 AUCTION_COMPLETED:', data);
                // Get auction data before deleting it
                const auction = this.activeAuctions.get(data.auctionId);
                if (auction) {

                    this.showAuctionConclusionModal({
                        auctionId: data.auctionId,
                        auction: auction,
                        result: {
                            success: data.finalResult === 'ownership_transferred',
                            action: data.action,
                            finalResult: data.finalResult
                        }
                    });
                }
                this.activeAuctions.delete(data.auctionId);
                this.updateAuctionSidebar();
                break;
        }
    }

    /**
     * Show challenger status modal (auction starter)
     */
    showChallengerModal(auctionId) {
        // console.log('🔨 showChallengerModal called:', auctionId);
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) {
            console.error('🔨 No auction found for ID:', auctionId);
            return;
        }

        // Populate modal with challenger-specific content
        this.populateChallengerModal(auction);

        // Show modal
        if (this.auctionModal) {
        // console.log('🔨 Showing challenger status modal');
            this.auctionModal.classList.add('visible');
        } else {
            console.error('🔨 Auction modal not found!');
        }
    }

    /**
     * Show owner notification modal (current property owner during bidding phase)
     */
    showOwnerNotificationModal(auctionId) {
        // console.log('🔨 showOwnerNotificationModal called:', auctionId);
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) {
            console.error('🔨 No auction found for ID:', auctionId);
            return;
        }

        // Populate modal with owner-specific content
        this.populateOwnerNotificationModal(auction);

        // Show modal
        if (this.auctionModal) {
        // console.log('🔨 Showing owner notification modal');
            this.auctionModal.classList.add('visible');
        } else {
            console.error('🔨 Auction modal not found!');
        }
    }

    /**
     * Show owner response modal (owner must match or decline winning bid)
     */
    showOwnerResponseModal(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction) {
            console.error('🔨 No auction found for ID:', auctionId);
            return;
        }

        // Get financial data
        const financialData = auction.financialData || {};
        const winningBid = financialData.winningBid || auction.currentBid;
        const currentNetRevenue = financialData.currentNetRevenue || 0;
        const cashGainByDeclining = financialData.cashGainByDeclining || winningBid;

        // Clear modal and rebuild with owner response UI
        const modalBody = this.auctionModal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="auction-modal-section">
                <div class="auction-modal-row highlight">
                    <span class="auction-modal-label">WINNING BID</span>
                    <span class="auction-modal-value">$${winningBid.toLocaleString()}</span>
                </div>
                <div class="auction-modal-row">
                    <span class="auction-modal-label">CURRENT NET REVENUE</span>
                    <span class="auction-modal-value">$${currentNetRevenue.toLocaleString()}/turn</span>
                </div>
                <div class="auction-modal-row">
                    <span class="auction-modal-label">CASH GAIN (DECLINE)</span>
                    <span class="auction-modal-value">$${cashGainByDeclining.toLocaleString()}</span>
                </div>
            </div>

            <div class="auction-modal-section owner-response-section">
                <div class="auction-modal-subsection-title">YOUR DECISION <span id="response-time-remaining" class="response-timer-value">30s</span></div>
                <div class="auction-bid-actions">
                    <button class="auction-btn auction-btn-success" onclick="game.parcelAuctionSystem.ownerResponse(${auctionId}, 'match')">MATCH BID</button>
                    <button class="auction-btn auction-btn-danger" onclick="game.parcelAuctionSystem.ownerResponse(${auctionId}, 'decline')">SELL FOR $${winningBid.toLocaleString()}</button>
                </div>
            </div>
        `;

        // Start countdown timer
        this.startOwnerResponseTimer(auction.ownerResponseEnd);

        // Store current auction ID
        this.currentModalAuctionId = auctionId;

        // Show modal
        this.auctionModal.classList.add('visible');
    }

    /**
     * Update auction modal display based on current phase
     */
    updateAuctionDisplay(auctionId) {
        const auction = this.activeAuctions.get(auctionId);
        if (!auction || !this.auctionModal) return;

        const currentPlayerId = this.game.currentPlayerId;
        const isCurrentOwner = auction.currentOwnerId === currentPlayerId;

        // Get UI elements
        const bidControls = this.auctionModal.querySelector('.bid-controls');
        const ownerResponseSection = this.auctionModal.querySelector('#owner-response-section');

        if (auction.phase === 'owner_response' && isCurrentOwner) {
            // Show owner response UI, hide bidding UI
            if (bidControls) bidControls.style.display = 'none';
            if (ownerResponseSection) {
                ownerResponseSection.classList.remove('hidden');

                // Update the response buttons to include auctionId
                const matchBtn = ownerResponseSection.querySelector('.match-btn');
                const declineBtn = ownerResponseSection.querySelector('.decline-btn');

                if (matchBtn) {
                    matchBtn.onclick = () => this.ownerResponse(auctionId, 'match');
                }
                if (declineBtn) {
                    declineBtn.onclick = () => this.ownerResponse(auctionId, 'decline');
                }

                // Start countdown timer
                this.startOwnerResponseTimer(auction.ownerResponseEnd);
            }
        } else {
            // Show normal bidding UI, hide owner response
            if (bidControls) bidControls.style.display = 'block';
            if (ownerResponseSection) ownerResponseSection.classList.add('hidden');
        }

        // Update modal content with current auction data
        this.populateAuctionModal(auction);
    }

    /**
     * Start countdown timer for owner response
     */
    startOwnerResponseTimer(endTime) {
        const timerElement = this.auctionModal?.querySelector('#response-time-remaining');
        if (!timerElement) return;

        const updateTimer = () => {
            const timeLeft = Math.max(0, endTime - Date.now());
            const seconds = Math.ceil(timeLeft / 1000);

            if (timerElement) {
                timerElement.textContent = `${seconds}s`;

                if (seconds <= 5) {
                    timerElement.style.color = '#ff4444';
                } else {
                    timerElement.style.color = '#fff';
                }
            }

            if (timeLeft > 0) {
                setTimeout(updateTimer, 100);
            }
        };

        updateTimer();
    }

    /**
     * Show auction conclusion modal
     */
    showAuctionConclusionModal(auctionData) {
        const { auctionId, result, auction } = auctionData;
        const parcelCoord = this.game.getParcelCoordinate(auction.row, auction.col);

        // Determine if current player was involved
        const currentPlayerId = this.game.currentPlayerId;
        const isOwnershipTransferred = result.finalResult === 'ownership_transferred';
        const isOriginalOwner = auction.currentOwnerId === currentPlayerId;
        const isChallenger = auction.startedBy === currentPlayerId;
        const isHighestBidder = auction.highestBidderId === currentPlayerId;

        // Show modal for involved parties
        if (!isOriginalOwner && !isChallenger && !isHighestBidder) {
            return;
        }

        let title, message, resultClass;

        if (isOwnershipTransferred) {
            // Property changed hands - someone won the auction
            if (isHighestBidder) {
                title = "🎉 Auction Won!";
                message = `You won the auction for parcel ${parcelCoord} with a bid of $${auction.currentBid.toLocaleString()}`;
                resultClass = "auction-success";
            } else if (isOriginalOwner) {
                title = "📉 Property Lost";
                message = `Your property at parcel ${parcelCoord} was sold for $${auction.currentBid.toLocaleString()}`;
                resultClass = "auction-failure";
            } else if (isChallenger) {
                title = "📉 Auction Lost";
                message = `You lost the auction for parcel ${parcelCoord}. Winning bid: $${auction.currentBid.toLocaleString()}`;
                resultClass = "auction-failure";
            }
        } else {
            // Owner kept property or auction expired without bids
            if (isOriginalOwner) {
                title = "🏠 Property Retained";
                message = `You kept your property at parcel ${parcelCoord}`;
                resultClass = "auction-success";
            } else {
                title = "⏰ Auction Expired";
                message = `The auction for parcel ${parcelCoord} has ended. Property remains with original owner.`;
                resultClass = "auction-neutral";
            }
        }

        // Reuse the auction modal but modify it for conclusion
        if (this.auctionModal) {
            const modalContent = this.auctionModal.querySelector('.modal-content');
            modalContent.innerHTML = `
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button class="modal-close" onclick="game.parcelAuctionSystem.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="auction-conclusion ${resultClass}">
                        <p>${message}</p>
                        <div class="auction-details">
                            <div>Parcel: ${parcelCoord}</div>
                            ${isOwnershipTransferred ? `<div>Final Bid: $${auction.currentBid.toLocaleString()}</div>` : ''}
                            ${isOwnershipTransferred && auction.highestBidderId ? `<div>Winner: ${auction.highestBidderId}</div>` : ''}
                        </div>
                        <button class="btn-primary" onclick="game.parcelAuctionSystem.closeModal()">OK</button>
                    </div>
                </div>
            `;
            this.auctionModal.classList.add('visible');
        }
    }

    /**
     * Quick bid with percentage increase
     */
    quickBid(percentage) {
        // Implementation for quick bid buttons in modal
        if (!this.currentModalAuctionId) {
            this.game.showNotification('No auction selected', 'error');
            return;
        }

        const auction = this.activeAuctions.get(this.currentModalAuctionId);
        if (!auction) return;

        const newBid = Math.ceil(auction.currentBid * (1 + percentage / 100));


        this.placeBid(this.currentModalAuctionId, newBid);
    }

    /**
     * Quick bid on specific auction from sidebar
     */
    quickBidOnAuction(auctionId, bidAmount) {
        // console.log('🔨 Quick bid clicked:', auctionId, bidAmount);
        this.placeBid(auctionId, bidAmount);
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

        if (!this.currentModalAuctionId) {
            this.game.showNotification('No auction selected', 'error');
            return;
        }

        this.placeBid(this.currentModalAuctionId, amount);
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