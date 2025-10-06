/**
 * Land Exchange System for The Commons
 * Strategic offer-based parcel trading with price discovery
 */

class LandExchangeSystem {
    constructor(game) {
        this.game = game;
        this.activeOffers = new Map(); // offerId -> offer data

        // UI elements
        this.modal = null;
        this.sidebar = null;

        this.setupUI();
        this.setupWebSocketHandlers();

        console.log('💰 Land Exchange System initialized');
    }

    /**
     * Setup UI elements
     */
    setupUI() {
        this.createModal();
        this.createSidebar();
    }

    /**
     * Reset for new game
     */
    resetForNewGame() {
        this.activeOffers.clear();

        // Recreate sidebar to remove stale DOM
        const existingSection = document.getElementById('land-exchange-section');
        if (existingSection) {
            existingSection.remove();
        }
        this.createSidebar();

        // Hide modal if open
        if (this.modal) {
            this.modal.classList.remove('visible');
        }

        console.log('💰 Land Exchange system reset');
    }

    /**
     * Setup WebSocket message handlers
     */
    setupWebSocketHandlers() {
        const setupSubscription = () => {
            if (this.game.economicClient?.connectionManager) {
                this.game.economicClient.connectionManager.subscribe('LAND_EXCHANGE_UPDATE', (data) => {
                    this.handleExchangeUpdate(data);
                });
                console.log('💰 Land Exchange subscribed to WebSocket updates');
            } else {
                setTimeout(setupSubscription, 100);
            }
        };
        setupSubscription();
    }

    /**
     * Create offer modal
     */
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'land-exchange-modal';
        modal.id = 'land-exchange-modal';

        modal.innerHTML = `
            <div class="land-exchange-modal-content">
                <div class="land-exchange-modal-header">
                    <h2>MAKE OFFER</h2>
                    <button class="modal-close" onclick="game.landExchange.closeModal()">&times;</button>
                </div>
                <div class="land-exchange-modal-body">
                    <div class="land-exchange-section">
                        <div class="land-exchange-section-title">PARCEL INFO</div>
                        <div class="land-exchange-row">
                            <span class="land-exchange-label">Location</span>
                            <span class="land-exchange-value" id="offer-parcel-coords">—</span>
                        </div>
                        <div class="land-exchange-row">
                            <span class="land-exchange-label">Owner</span>
                            <span class="land-exchange-value" id="offer-current-owner">—</span>
                        </div>
                        <div class="land-exchange-row">
                            <span class="land-exchange-label">Last Paid</span>
                            <span class="land-exchange-value" id="offer-last-paid">$—</span>
                        </div>
                    </div>

                    <div class="land-exchange-section" id="recent-offers-section" style="display: none;">
                        <div class="land-exchange-section-title">RECENT MARKET ACTIVITY</div>
                        <div id="recent-offers-list"></div>
                    </div>

                    <div class="land-exchange-section">
                        <div class="land-exchange-section-title">YOUR OFFER</div>
                        <input type="number" class="land-exchange-input" id="offer-amount" placeholder="Enter offer amount">
                        <div style="margin-top: 8px; font-size: 11px; color: #888;">
                            ⚠️ All offers are public. Owner must accept or match (costs them 1 action).
                        </div>
                    </div>

                    <button class="land-exchange-submit" onclick="game.landExchange.submitOffer()">SUBMIT OFFER</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;
    }

    /**
     * Create sidebar panel
     */
    createSidebar() {
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'sidebar';
            document.body.appendChild(sidebar);
        }

        const section = document.createElement('div');
        section.className = 'sidebar-section collapsible collapsed';
        section.id = 'land-exchange-section';

        section.innerHTML = `
            <div class="section-header" data-target="land-exchange-content">
                <span>LAND EXCHANGE <span id="land-exchange-indicator" class="land-exchange-indicator" style="display: none;">●</span></span>
                <span class="collapse-icon"></span>
            </div>
            <div id="land-exchange-content" class="section-content">
                <div class="land-exchange-list" id="land-exchange-list">
                    <div class="no-offers" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">No active offers</div>
                </div>
            </div>
        `;

        // Insert after Action Manager section
        const actionManagerSection = document.getElementById('action-manager-section');
        if (actionManagerSection) {
            sidebar.insertBefore(section, actionManagerSection.nextSibling);
        } else {
            sidebar.appendChild(section);
        }

        this.sidebar = section;

        // Add click handler for collapse
        const header = section.querySelector('.section-header');
        if (header) {
            header.addEventListener('click', function() {
                const collapsible = this.parentElement;
                if (collapsible && collapsible.classList.contains('collapsible')) {
                    collapsible.classList.toggle('collapsed');
                }
            });
        }
    }

    /**
     * Show make offer modal for a parcel
     */
    async showMakeOfferModal(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel) return;

        // Populate parcel info
        const parcelCoord = this.game.getParcelCoordinate(row, col);
        document.getElementById('offer-parcel-coords').textContent = parcelCoord;
        document.getElementById('offer-current-owner').textContent = parcel.owner || 'Unclaimed';
        document.getElementById('offer-last-paid').textContent = `$${(parcel.lastPurchasePrice || 100).toLocaleString()}`;

        // Show recent market activity if available (placeholder for now)
        const recentOffersSection = document.getElementById('recent-offers-section');
        recentOffersSection.style.display = 'none'; // Hide until we implement price history

        // Pre-fill with suggested offer (last paid + 20%)
        const suggestedOffer = Math.ceil((parcel.lastPurchasePrice || 100) * 1.2);
        document.getElementById('offer-amount').value = suggestedOffer;

        // Store current parcel for submission
        this.currentOfferParcel = { row, col };

        // Show modal
        this.modal.classList.add('visible');
    }

    /**
     * Submit offer
     */
    async submitOffer() {
        const offerAmount = parseInt(document.getElementById('offer-amount').value);

        if (!offerAmount || offerAmount <= 0) {
            this.game.showNotification('Enter a valid offer amount', 'error');
            return;
        }

        if (!this.currentOfferParcel) {
            this.game.showNotification('No parcel selected', 'error');
            return;
        }

        const { row, col } = this.currentOfferParcel;

        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'LAND_EXCHANGE_MAKE_OFFER',
                row: row,
                col: col,
                offerAmount: offerAmount
            });

            if (result.success) {
                this.game.showNotification(`Offer of $${offerAmount.toLocaleString()} submitted`, 'success');
                this.closeModal();
            } else {
                this.game.showNotification(result.error || 'Failed to submit offer', 'error');
            }
        } catch (error) {
            console.error('Failed to submit offer:', error);
            this.game.showNotification('Failed to submit offer', 'error');
        }
    }

    /**
     * Close modal
     */
    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('visible');
        }
        this.currentOfferParcel = null;
    }

    /**
     * Respond to an offer (accept or match)
     */
    async respondToOffer(offerId, action) {
        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'LAND_EXCHANGE_RESPOND',
                offerId: offerId,
                action: action // 'accept' or 'match'
            });

            if (result.success) {
                const actionText = action === 'accept' ? 'accepted' : 'matched';
                this.game.showNotification(`Offer ${actionText}`, 'success');
            } else {
                this.game.showNotification(result.error || 'Failed to respond', 'error');
            }
        } catch (error) {
            console.error('Failed to respond to offer:', error);
            this.game.showNotification('Failed to respond to offer', 'error');
        }
    }

    /**
     * Withdraw an offer
     */
    async withdrawOffer(offerId) {
        try {
            const result = await this.game.economicClient.sendTransaction({
                type: 'LAND_EXCHANGE_WITHDRAW',
                offerId: offerId
            });

            if (result.success) {
                this.game.showNotification('Offer withdrawn (cost 1 action)', 'success');
            } else {
                this.game.showNotification(result.error || 'Failed to withdraw', 'error');
            }
        } catch (error) {
            console.error('Failed to withdraw offer:', error);
            this.game.showNotification('Failed to withdraw offer', 'error');
        }
    }

    /**
     * Handle WebSocket exchange updates
     */
    handleExchangeUpdate(data) {
        console.log('💰 Exchange update:', data);

        switch (data.subtype) {
            case 'OFFER_MADE':
                this.activeOffers.set(data.offerId, data.offer);
                this.updateSidebar();

                // Notify if you're the owner
                if (data.offer.ownerId === this.game.currentPlayerId) {
                    const parcelCoord = this.game.getParcelCoordinate(data.offer.row, data.offer.col);
                    this.game.showNotification(`💰 New offer on your parcel ${parcelCoord}: $${data.offer.offerAmount.toLocaleString()}`, 'info');
                }
                break;

            case 'OFFER_ACCEPTED':
            case 'OFFER_MATCHED':
            case 'OFFER_WITHDRAWN':
                if (this.activeOffers.has(data.offerId)) {
                    this.activeOffers.delete(data.offerId);
                    this.updateSidebar();
                }
                break;
        }
    }

    /**
     * Update sidebar with current offers
     */
    updateSidebar() {
        const list = document.getElementById('land-exchange-list');
        if (!list) return;

        // Get offers for current player
        const offersAsOwner = [];
        const offersAsOfferer = [];

        for (const offer of this.activeOffers.values()) {
            if (offer.ownerId === this.game.currentPlayerId) {
                offersAsOwner.push(offer);
            } else if (offer.offererId === this.game.currentPlayerId) {
                offersAsOfferer.push(offer);
            }
        }

        if (offersAsOwner.length === 0 && offersAsOfferer.length === 0) {
            list.innerHTML = '<div class="no-offers" style="padding: 10px; text-align: center; color: #666; font-size: 12px;">No active offers</div>';
            this.hideIndicator();
            return;
        }

        let html = '';

        // Show offers where you're the owner (need to respond)
        for (const offer of offersAsOwner) {
            const parcelCoord = this.game.getParcelCoordinate(offer.row, offer.col);
            html += `
                <div class="land-exchange-item as-owner"
                     data-offer-id="${offer.id}"
                     onmouseenter="game.landExchange.highlightParcel(${offer.row}, ${offer.col})"
                     onmouseleave="game.landExchange.unhighlightParcel()">
                    <div class="land-exchange-header">
                        <span class="land-exchange-parcel">${parcelCoord}</span>
                        <span class="land-exchange-role owner">MUST RESPOND</span>
                    </div>
                    <div class="land-exchange-price">$${offer.offerAmount.toLocaleString()}</div>
                    <div class="land-exchange-actions">
                        <button class="land-exchange-btn accept" onclick="event.stopPropagation(); game.landExchange.respondToOffer(${offer.id}, 'accept')">
                            ACCEPT
                        </button>
                        <button class="land-exchange-btn match" onclick="event.stopPropagation(); game.landExchange.respondToOffer(${offer.id}, 'match')">
                            MATCH (1⚡)
                        </button>
                    </div>
                </div>
            `;
        }

        // Show offers you made (can withdraw)
        for (const offer of offersAsOfferer) {
            const parcelCoord = this.game.getParcelCoordinate(offer.row, offer.col);
            html += `
                <div class="land-exchange-item as-offerer"
                     data-offer-id="${offer.id}"
                     onmouseenter="game.landExchange.highlightParcel(${offer.row}, ${offer.col})"
                     onmouseleave="game.landExchange.unhighlightParcel()">
                    <div class="land-exchange-header">
                        <span class="land-exchange-parcel">${parcelCoord}</span>
                        <span class="land-exchange-role offerer">YOUR OFFER</span>
                    </div>
                    <div class="land-exchange-price">$${offer.offerAmount.toLocaleString()}</div>
                    <div class="land-exchange-actions">
                        <button class="land-exchange-btn withdraw" onclick="event.stopPropagation(); game.landExchange.withdrawOffer(${offer.id})">
                            WITHDRAW (1⚡)
                        </button>
                    </div>
                </div>
            `;
        }

        list.innerHTML = html;
        this.showIndicator(offersAsOwner.length > 0);
    }

    /**
     * Highlight parcel on hover
     */
    highlightParcel(row, col) {
        // Set hovered tile for rendering system
        this.game.hoveredTile = { row, col };

        // Set selected tile for visual effects (building lift + bounce)
        this.game.selectedTile = { row, col };
        this.game.selectedParcel = { row, col };

        // Get parcel data
        const parcel = this.game.grid[row][col];
        if (!parcel) return;

        // Calculate SCREEN coordinates for tooltip (convert canvas to screen)
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const tileSize = this.game.renderingSystem?.tileSize || 32;

        // Canvas coordinates
        const canvasX = col * tileSize + tileSize / 2;
        const canvasY = row * tileSize + tileSize / 2;

        // Screen coordinates (canvas position + offset within canvas)
        const screenX = rect.left + canvasX;
        const screenY = rect.top + canvasY;

        // Show tooltip using existing tooltip system
        if (this.game.tooltipSystemV2) {
            this.game.tooltipSystemV2.show('parcel', {
                row: row,
                col: col,
                parcel: parcel,
                coord: this.game.getParcelCoordinate(row, col)
            }, screenX, screenY);
        }

        // Update parcel illumination (shows building influence radius + adjacent highlighting)
        this.game.updateParcelIllumination({ row, col });

        // Calculate and display parcel reach (adjacent parcels in player color)
        if (parcel.building) {
            const buildingDef = this.game.buildingManager?.getBuildingById(parcel.building);
            if (buildingDef && buildingDef.reach) {
                this.game.parcelReach = {
                    center: { row, col },
                    radius: buildingDef.reach
                };
            }
        }

        // Trigger render to show all visual effects
        this.game.scheduleRender();
    }

    /**
     * Remove parcel highlight
     */
    unhighlightParcel() {
        // Clear hovered tile
        this.game.hoveredTile = null;

        // Hide tooltip
        if (this.game.tooltipSystemV2) {
            this.game.tooltipSystemV2.hide();
        }

        // Clear illumination
        this.game.updateParcelIllumination(null);

        // Trigger render to remove highlighting
        this.game.scheduleRender();
    }

    /**
     * Show indicator
     */
    showIndicator(hasOffersToRespond) {
        const indicator = document.getElementById('land-exchange-indicator');
        if (indicator) {
            indicator.style.display = 'inline';
            if (hasOffersToRespond) {
                indicator.classList.add('has-offers');
            } else {
                indicator.classList.remove('has-offers');
            }
        }
    }

    /**
     * Hide indicator
     */
    hideIndicator() {
        const indicator = document.getElementById('land-exchange-indicator');
        if (indicator) {
            indicator.style.display = 'none';
            indicator.classList.remove('has-offers');
        }
    }

    /**
     * Check if player has pending offers (for blocking builds/purchases)
     */
    hasPendingOffersAsOwner() {
        for (const offer of this.activeOffers.values()) {
            if (offer.ownerId === this.game.currentPlayerId) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get pending offers for a specific parcel
     */
    getOffersForParcel(row, col) {
        const offers = [];
        for (const offer of this.activeOffers.values()) {
            if (offer.row === row && offer.col === col) {
                offers.push(offer);
            }
        }
        return offers;
    }
}

// Make available globally
window.LandExchangeSystem = LandExchangeSystem;
