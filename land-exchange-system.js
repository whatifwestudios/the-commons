/**
 * Land Exchange System for The Commons
 * Strategic offer-based parcel trading with price discovery
 */

class LandExchangeSystem {
    constructor(game) {
        this.game = game;
        this.activeOffers = new Map(); // offerId -> offer data
        this.hasExpandedForListings = false; // Track if auto-expanded for marketplace

        // UI elements
        this.modal = null;
        this.sidebar = null;

        this.setupUI();
        this.setupWebSocketHandlers();

        console.log('💰 Marketplace System initialized');
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
                            <span class="land-exchange-label">Current Land Value</span>
                            <span class="land-exchange-value" id="offer-last-paid">$—</span>
                        </div>
                        <div class="land-exchange-row" style="align-items: center;">
                            <span class="land-exchange-label">Your Offer</span>
                            <input type="number" class="land-exchange-input" id="offer-amount" placeholder="Land offer amount" style="flex: 1; max-width: 150px;">
                        </div>
                        <div class="land-exchange-row" id="offer-building-row" style="display: none;">
                            <span class="land-exchange-label">Building Value (Current)</span>
                            <span class="land-exchange-value" id="offer-building-value">$—</span>
                        </div>
                        <div class="land-exchange-row" id="offer-total-row" style="display: none; border-top: 1px solid #333; padding-top: 8px; margin-top: 8px; font-weight: bold;">
                            <span class="land-exchange-label">Total Cost if Accepted</span>
                            <span class="land-exchange-value" id="offer-total-cost">$—</span>
                        </div>
                        <div style="margin-top: 12px; font-size: 11px; color: #888; line-height: 1.5;">
                            Your offer is for the land. If accepted, you'll also pay the current building value. All offers are public. Owner must accept or match. Making an offer costs you 1 Action. You may withdraw while pending (costs an additional action).
                        </div>
                    </div>

                    <div class="land-exchange-section" id="recent-offers-section" style="display: none;">
                        <div class="land-exchange-section-title">RECENT MARKET ACTIVITY</div>
                        <div id="recent-offers-list"></div>
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
        // Hide marketplace in solo mode
        if (!this.game.isMultiplayer) {
            console.log('💰 Marketplace hidden (solo mode)');
            return;
        }

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
                <span>MARKETPLACE <span id="land-exchange-indicator" class="land-exchange-indicator" style="display: none;">●</span></span>
                <span class="collapse-icon"></span>
            </div>
            <div id="land-exchange-content" class="section-content">
                <div id="marketplace-stats" style="padding: 8px 10px; border-bottom: 1px solid #1a1a1a; font-size: 14px;">
                    <div onclick="game.marketplace?.openMarketplace(); game.marketplace?.switchTab('actions');" style="display: flex; justify-content: space-between; margin-bottom: 6px; cursor: pointer; transition: background 0.2s; padding: 4px; margin: -4px -4px 2px -4px; border-radius: 4px;" onmouseover="this.style.background='rgba(232, 212, 160, 0.1)'" onmouseout="this.style.background='transparent'">
                        <span style="color: #888;">Actions:</span>
                        <span id="marketplace-actions-count" style="color: #E8D4A0;">—</span>
                    </div>
                    <div onclick="game.marketplace?.openMarketplace(); game.marketplace?.switchTab('buildings');" style="display: flex; justify-content: space-between; margin-bottom: 6px; cursor: pointer; transition: background 0.2s; padding: 4px; margin: -4px -4px 2px -4px; border-radius: 4px;" onmouseover="this.style.background='rgba(232, 212, 160, 0.1)'" onmouseout="this.style.background='transparent'">
                        <span style="color: #888;">Buildings:</span>
                        <span id="marketplace-buildings-count" style="color: #E8D4A0;">—</span>
                    </div>
                    <div onclick="game.marketplace?.openMarketplace(); game.marketplace?.switchTab('parcels');" style="display: flex; justify-content: space-between; cursor: pointer; transition: background 0.2s; padding: 4px; margin: -4px; border-radius: 4px;" onmouseover="this.style.background='rgba(232, 212, 160, 0.1)'" onmouseout="this.style.background='transparent'">
                        <span style="color: #888;">Parcels:</span>
                        <span id="marketplace-parcels-count" style="color: #E8D4A0;">—</span>
                    </div>
                </div>
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

        // Use player name instead of player ID
        const ownerName = parcel.owner ? this.game.getPlayerName(parcel.owner) : 'Unclaimed';
        document.getElementById('offer-current-owner').textContent = ownerName;

        // Get last purchase price (the real market price for land)
        const lastPaidPrice = parcel.lastPurchasePrice || 100;
        document.getElementById('offer-last-paid').textContent = `$${lastPaidPrice.toLocaleString()}`;

        // Pre-fill with suggested offer (land value + 20%, not including building)
        const suggestedOffer = Math.ceil(lastPaidPrice * 1.2);
        document.getElementById('offer-amount').value = suggestedOffer;

        // Get building value if there's a building
        let buildingValue = 0;
        if (parcel.building) {
            if (!this.game.economicClient) {
                console.error('[LandExchange] economicClient not available');
                buildingValue = 0;
            } else {
                buildingValue = await this.game.economicClient.getBuildingValue(row, col);
            }

            document.getElementById('offer-building-value').textContent = `$${buildingValue.toLocaleString()}`;
            document.getElementById('offer-building-row').style.display = 'flex';

            // Show total cost row - YOUR OFFER + building value (updates dynamically on input change)
            const offerInput = document.getElementById('offer-amount');
            const updateTotal = () => {
                const offerAmount = parseInt(offerInput.value) || 0;
                const totalCost = offerAmount + buildingValue;
                document.getElementById('offer-total-cost').textContent = `$${totalCost.toLocaleString()}`;
            };

            // Remove old listener if exists (prevent duplicates)
            offerInput.removeEventListener('input', this._updateTotalHandler);
            this._updateTotalHandler = updateTotal;
            offerInput.addEventListener('input', updateTotal);

            updateTotal(); // Initial calculation
            document.getElementById('offer-total-row').style.display = 'flex';
        } else {
            document.getElementById('offer-building-row').style.display = 'none';
            document.getElementById('offer-total-row').style.display = 'none';
        }

        // Show recent market activity if available (placeholder for now)
        const recentOffersSection = document.getElementById('recent-offers-section');
        recentOffersSection.style.display = 'none'; // Hide until we implement price history

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
            const buildingValueText = offer.buildingValue > 0 ? ` + $${offer.buildingValue.toLocaleString()} bldg` : '';
            html += `
                <div class="land-exchange-item as-owner"
                     data-offer-id="${offer.id}"
                     onmouseenter="game.landExchange.highlightParcel(${offer.row}, ${offer.col})"
                     onmouseleave="game.landExchange.unhighlightParcel()">
                    <div class="land-exchange-header">
                        <span class="land-exchange-parcel">${parcelCoord}</span>
                        <span class="land-exchange-role owner">MUST RESPOND</span>
                    </div>
                    <div class="land-exchange-price">$${offer.offerAmount.toLocaleString()} land${buildingValueText}</div>
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
            const buildingValueText = offer.buildingValue > 0 ? ` + $${offer.buildingValue.toLocaleString()} bldg` : '';
            html += `
                <div class="land-exchange-item as-offerer"
                     data-offer-id="${offer.id}"
                     onmouseenter="game.landExchange.highlightParcel(${offer.row}, ${offer.col})"
                     onmouseleave="game.landExchange.unhighlightParcel()">
                    <div class="land-exchange-header">
                        <span class="land-exchange-parcel">${parcelCoord}</span>
                        <span class="land-exchange-role offerer">YOUR OFFER</span>
                    </div>
                    <div class="land-exchange-price">$${offer.offerAmount.toLocaleString()} land${buildingValueText}</div>
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
        // Cancel any pending unhighlight
        clearTimeout(this.unhighlightTimer);

        // Track currently highlighted parcel to prevent flicker
        this.currentHighlightedParcel = { row, col };

        // Set hovered tile for rendering system
        this.game.hoveredTile = { row, col };

        // Set selected tile for visual effects (building lift + bounce)
        this.game.selectedTile = { row, col };
        this.game.selectedParcel = { row, col };

        // Get parcel data
        const parcel = this.game.grid[row][col];
        if (!parcel) return;

        // Calculate SCREEN coordinates for tooltip using isometric projection
        const canvas = this.game.canvas;
        const rect = canvas.getBoundingClientRect();

        // Use rendering system's isometric projection to get canvas coordinates
        // NOTE: toIsometric signature is (col, row) NOT (row, col)
        const isoCoords = this.game.renderingSystem?.toIsometric(col, row);

        if (!isoCoords) {
            console.warn('Could not calculate isometric coordinates for tooltip');
            return;
        }

        // Screen coordinates (canvas position + isometric offset)
        const screenX = rect.left + isoCoords.x;
        const screenY = rect.top + isoCoords.y;

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
     * Remove parcel highlight (with debounce to prevent flickering on child element hover)
     */
    unhighlightParcel() {
        // Clear tracking
        this.currentHighlightedParcel = null;

        // Add small delay to prevent flicker when moving within the offer box
        clearTimeout(this.unhighlightTimer);
        this.unhighlightTimer = setTimeout(() => {
            // Only clear if we haven't re-highlighted something else
            if (!this.currentHighlightedParcel) {
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
        }, 100); // 100ms delay to prevent flicker
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
     * Update marketplace stats (called by action marketplace)
     */
    updateMarketplaceStats(stats) {
        const actionsEl = document.getElementById('marketplace-actions-count');
        const buildingsEl = document.getElementById('marketplace-buildings-count');
        const parcelsEl = document.getElementById('marketplace-parcels-count');

        if (!actionsEl || !buildingsEl || !parcelsEl) return;

        const actionsCount = stats.actionsCount || 0;
        const buildingsCount = stats.buildingsCount || 0;
        const parcelsCount = stats.parcelsCount || 0;

        const avgActionPrice = stats.avgActionPrice || 0;
        const avgBuildingPrice = stats.avgBuildingPrice || 0;
        const avgParcelPrice = stats.avgParcelPrice || 0;

        // Format: "5 @ $1,200" or "0"
        actionsEl.textContent = actionsCount > 0
            ? `${actionsCount} @ $${Math.round(avgActionPrice).toLocaleString()}`
            : '0';
        buildingsEl.textContent = buildingsCount > 0
            ? `${buildingsCount} @ $${Math.round(avgBuildingPrice).toLocaleString()}`
            : '0';
        parcelsEl.textContent = parcelsCount > 0
            ? `${parcelsCount} @ $${Math.round(avgParcelPrice).toLocaleString()}`
            : '0';

        // Auto-expand when supply goes from 0 to 1+ (only if previously all were 0)
        const totalCount = actionsCount + buildingsCount + parcelsCount;
        const section = document.getElementById('land-exchange-section');

        if (totalCount > 0 && !this.hasExpandedForListings && section?.classList.contains('collapsed')) {
            section.classList.remove('collapsed');
            this.hasExpandedForListings = true;
        } else if (totalCount === 0) {
            // Reset flag when marketplace is empty
            this.hasExpandedForListings = false;
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
     * Get all pending offers where current player is the owner
     */
    getOffersAsOwner() {
        const offers = [];
        for (const offer of this.activeOffers.values()) {
            if (offer.ownerId === this.game.currentPlayerId) {
                offers.push(offer);
            }
        }
        return offers;
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
