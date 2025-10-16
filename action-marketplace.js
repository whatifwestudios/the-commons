/**
 * Marketplace V3 - Unified Trading System
 *
 * Features:
 * - Actions: Buy/sell actions for cash (instant purchase)
 * - Buildings: Fire sales and player-initiated building sales
 * - Parcels: Buy/sell empty parcels (future)
 * - No fees (listing, cancellation, or transaction)
 * - Price history tracking and visualization
 * - Slide-down tray UI (matching governance pattern)
 * - Real-time sync via WebSocket
 */
class MarketplaceV3 {
    constructor(game) {
        this.game = game;
        this.isOpen = false;
        this.activeTab = 'actions';
        this.priceChart = null;

        // Server-authoritative data (synced via WebSocket)
        this.listings = new Map();
        this.stats = {
            avgListingPrice: null,
            avgSalePrice: null,
            totalSales: 0
        };
        this.priceHistory = {
            listings: [],
            sales: []
        };

        // Event cleanup manager for memory leak prevention
        if (typeof window !== 'undefined' && window.EventCleanupManager) {
            this.eventManager = new window.EventCleanupManager();
        } else if (typeof require !== 'undefined') {
            const EventCleanupManager = require('./event-cleanup-manager');
            this.eventManager = new EventCleanupManager();
        } else {
            // Fallback: basic event tracking
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
        // Setup Actions button in top bar
        const actionsBtn = document.getElementById('actions-btn');
        if (actionsBtn) {
            this.eventManager.addEventListener(actionsBtn, 'click', () => this.openMarketplace());
        }

        // Setup tray
        const tray = document.getElementById('action-marketplace-tray');
        if (tray) {
            // Click outside to close
            this.eventManager.addEventListener(tray, 'click', (e) => {
                if (e.target.id === 'action-marketplace-tray' && this.isOpen) {
                    this.closeMarketplace();
                }
            });
        }

        // Setup close button
        const closeBtn = document.getElementById('close-marketplace-tray');
        if (closeBtn) {
            this.eventManager.addEventListener(closeBtn, 'click', () => this.closeMarketplace());
        }

        // Setup tab switching
        const tabs = document.querySelectorAll('.action-marketplace-tray .tab-btn');
        tabs.forEach(tab => {
            this.eventManager.addEventListener(tab, 'click', (e) => {
                const targetTab = e.target.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Setup list action button
        const listBtn = document.getElementById('list-action-btn');
        if (listBtn) {
            this.eventManager.addEventListener(listBtn, 'click', () => this.listActionForSale());
        }
    }

    openMarketplace() {
        const tray = document.getElementById('action-marketplace-tray');
        if (!tray) return;

        // Show tray with animation
        tray.style.display = 'block';
        tray.offsetHeight; // Force reflow
        requestAnimationFrame(() => {
            tray.classList.add('visible');
        });

        this.isOpen = true;
        this.updateDisplay();
        this.refreshListings();
    }

    closeMarketplace() {
        const tray = document.getElementById('action-marketplace-tray');
        if (!tray) return;

        tray.classList.remove('visible');

        // Wait for animation to complete before hiding
        setTimeout(() => {
            if (!this.isOpen) {
                tray.style.display = 'none';
            }
        }, 350);

        this.isOpen = false;
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        const tabs = document.querySelectorAll('.action-marketplace-tray .tab-btn');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
        });

        // Update tab content
        const contents = document.querySelectorAll('.action-marketplace-tray .tab-content');
        contents.forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        // Refresh content based on tab
        this.refreshListings();
    }

    updateDisplay() {
        // Update action count in tray header
        const currentActions = this.game.economicClient?.getCurrentPlayerActions();
        const actionCount = document.getElementById('marketplace-action-count');
        if (actionCount) {
            actionCount.textContent = currentActions !== null ? currentActions : '--';
        }

        // Update top bar action count
        const topBarCount = document.getElementById('top-bar-actions-count');
        if (topBarCount) {
            topBarCount.textContent = currentActions !== null ? currentActions : '--';
        }

        // Update stats
        this.updateStats();

        // Update graph if we have data
        const hasListings = this.priceHistory.actions?.listings?.length > 0 || this.priceHistory.listings?.length > 0;
        const hasSales = this.priceHistory.actions?.sales?.length > 0 || this.priceHistory.sales?.length > 0;
        if (hasListings || hasSales) {
            this.renderPriceGraph();
        }
    }

    updateStats() {
        // Active Listings
        const activeListings = Array.from(this.listings.values()).filter(l => l.status === 'active').length;
        const activeListingsEl = document.getElementById('marketplace-active-listings');
        if (activeListingsEl) {
            activeListingsEl.textContent = activeListings;
        }

        // Avg Listing Price (handle both old flat structure and new nested structure)
        const avgListingEl = document.getElementById('marketplace-avg-listing');
        if (avgListingEl) {
            const avgListingPrice = this.stats.avgListingPrice?.actions ?? this.stats.avgListingPrice;
            avgListingEl.textContent = (avgListingPrice !== null && avgListingPrice !== undefined)
                ? `$${Math.round(avgListingPrice).toLocaleString()}`
                : 'N/A';
        }

        // Avg Sale Price (handle both old flat structure and new nested structure)
        const avgSaleEl = document.getElementById('marketplace-avg-sale');
        if (avgSaleEl) {
            const avgSalePrice = this.stats.avgSalePrice?.actions ?? this.stats.avgSalePrice;
            avgSaleEl.textContent = (avgSalePrice !== null && avgSalePrice !== undefined)
                ? `$${Math.round(avgSalePrice).toLocaleString()}`
                : 'No data yet';
        }

        // Total Sales
        const totalSalesEl = document.getElementById('marketplace-total-sales');
        if (totalSalesEl) {
            totalSalesEl.textContent = this.stats.totalSales || 0;
        }
    }

    renderPriceGraph() {
        const canvas = document.getElementById('price-history-chart');
        if (!canvas) return;

        // Handle both old flat structure and new nested structure
        const listings = this.priceHistory.actions?.listings || this.priceHistory.listings || [];
        const sales = this.priceHistory.actions?.sales || this.priceHistory.sales || [];

        // Group data by month
        const listingsByMonth = this.groupPricesByMonth(listings);
        const salesByMonth = this.groupPricesByMonth(sales);

        // Get all unique months and sort them
        const allMonths = new Set([...Object.keys(listingsByMonth), ...Object.keys(salesByMonth)]);
        const sortedMonths = Array.from(allMonths).sort((a, b) => this.monthToNumber(a) - this.monthToNumber(b));

        // Calculate average prices for each month
        const listingData = sortedMonths.map(month => {
            const prices = listingsByMonth[month];
            return prices ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
        });

        const salesData = sortedMonths.map(month => {
            const prices = salesByMonth[month];
            return prices ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
        });

        // Destroy existing chart if any
        if (this.priceChart) {
            this.priceChart.destroy();
        }

        // Create new chart
        const ctx = canvas.getContext('2d');
        this.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [
                    {
                        label: 'Avg Listing Price',
                        data: listingData,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.3,
                        spanGaps: true
                    },
                    {
                        label: 'Avg Sale Price',
                        data: salesData,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        tension: 0.3,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#fff',
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Action Price History',
                        color: '#fff',
                        font: {
                            size: 14,
                            weight: 'normal'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#888'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#888',
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    groupPricesByMonth(priceData) {
        const grouped = {};
        if (!priceData || !Array.isArray(priceData)) {
            return grouped;
        }
        priceData.forEach(item => {
            const month = item.gameMonth || 'UNKNOWN';
            if (!grouped[month]) {
                grouped[month] = [];
            }
            grouped[month].push(item.price);
        });
        return grouped;
    }

    monthToNumber(monthStr) {
        const months = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const index = months.indexOf(monthStr.toUpperCase());
        return index >= 0 ? index : 999;
    }

    /**
     * LISTING MANAGEMENT
     */

    async listActionForSale() {
        const priceInput = document.getElementById('sell-price');
        if (!priceInput) return;

        const price = parseInt(priceInput.value) || 0;

        // Validate
        const currentActions = this.game.economicClient?.getCurrentPlayerActions();
        if (currentActions === null) {
            this.game.showNotification('Loading action data...', 'info');
            return;
        }
        if (currentActions < 1) {
            this.game.showNotification('You need at least 1 action to list', 'error');
            return;
        }
        if (price <= 0) {
            this.game.showNotification('Please enter a valid price', 'error');
            return;
        }

        if (!this.game.economicClient || !this.game.economicClient.connectionManager) {
            this.game.showNotification('Connection not ready', 'error');
            return;
        }

        if (!this.game.economicClient.connectionManager.isConnected) {
            this.game.showNotification('Not connected to server', 'error');
            return;
        }

        if (!this.game.currentPlayerId) {
            this.game.showNotification('Player ID not ready', 'error');
            return;
        }

        // Send listing transaction to server
        try {
            const transaction = {
                type: 'ACTION_CREATE_LISTING',
                playerId: this.game.currentPlayerId,
                price: price
            };

            console.log('⚡ Action Marketplace: Creating listing:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);
            console.log('⚡ Action Marketplace: Server response:', result);

            if (result.success) {
                // Clear form
                priceInput.value = '';

                this.game.showNotification(`Listed 1 action for $${price.toLocaleString()}`, 'success');
                this.updateDisplay();
                this.refreshListings();
            } else {
                console.error('Server rejected transaction:', result.error);
                this.game.showNotification(result.error || 'Failed to create listing', 'error');
            }
        } catch (error) {
            console.error('Exception during transaction:', error);
            this.game.showNotification('Failed to create listing', 'error');
        }
    }

    async purchaseListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
        if (currentBalance < listing.price) {
            this.game.showNotification(`Insufficient funds! Need $${listing.price.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'ACTION_PURCHASE',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            console.log('⚡ Action Marketplace: Purchasing listing:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bought 1 action for $${listing.price.toLocaleString()}`, 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to purchase', 'error');
            }
        } catch (error) {
            console.error('Failed to purchase:', error);
            this.game.showNotification('Failed to purchase', 'error');
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

            console.log('⚡ Action Marketplace: Cancelling listing:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification('Listing cancelled (no fee)', 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to cancel listing', 'error');
            }
        } catch (error) {
            console.error('Failed to cancel listing:', error);
            this.game.showNotification('Failed to cancel listing', 'error');
        }
    }

    /**
     * UI RENDERING
     */

    // Convert row,col to letter-number format (A-1, F-1, etc)
    formatCoordinates(row, col) {
        const letter = String.fromCharCode(65 + row); // A=65 in ASCII
        return `${letter}-${col + 1}`;
    }

    refreshListings() {
        // Refresh based on active tab
        if (this.activeTab === 'actions') {
            this.refreshActionListings();
        } else if (this.activeTab === 'buildings') {
            this.refreshBuildingListings();
        } else if (this.activeTab === 'parcels') {
            this.refreshParcelListings();
        }
    }

    refreshActionListings() {
        const container = document.getElementById('action-listings-grid');
        if (!container) return;

        const allListings = Array.from(this.listings.values());
        const actionListings = allListings
            .filter(l => l.type === 'ACTION_SALE' && l.status === 'active')
            .sort((a, b) => {
                // Sort by price (lowest first), then by timestamp (oldest first)
                if (a.price !== b.price) {
                    return a.price - b.price;
                }
                return a.createdAt - b.createdAt;
            });

        container.innerHTML = '';
        if (actionListings.length === 0) {
            container.innerHTML = '<p class="empty-state">No actions for sale</p>';
        } else {
            actionListings.forEach(listing => {
                const isOwn = listing.sellerId === this.game.currentPlayerId;
                const listingEl = this.createActionListingCard(listing, isOwn);
                container.appendChild(listingEl);
            });
        }
    }

    refreshBuildingListings() {
        const container = document.getElementById('building-listings-grid');
        if (!container) return;

        const allListings = Array.from(this.listings.values());
        const buildingListings = allListings
            .filter(l => l.type === 'BUILDING_SALE' && l.status === 'active')
            .sort((a, b) => {
                // Fire sales first, then by price
                if (a.isFireSale && !b.isFireSale) return -1;
                if (!a.isFireSale && b.isFireSale) return 1;
                return a.currentPrice - b.currentPrice;
            });

        container.innerHTML = '';
        if (buildingListings.length === 0) {
            container.innerHTML = '<p class="empty-state">No buildings for sale</p>';
        } else {
            buildingListings.forEach(listing => {
                const listingEl = this.createBuildingListingCard(listing);
                container.appendChild(listingEl);
            });
        }
    }

    refreshParcelListings() {
        const container = document.getElementById('parcel-listings-grid');
        if (!container) return;

        const allListings = Array.from(this.listings.values());
        const parcelListings = allListings
            .filter(l => l.type === 'PARCEL_SALE' && l.status === 'active')
            .sort((a, b) => a.price - b.price); // Sort by price

        container.innerHTML = '';
        if (parcelListings.length === 0) {
            container.innerHTML = '<p class="empty-state">No parcels for sale</p>';
        } else {
            parcelListings.forEach(listing => {
                const listingEl = this.createParcelListingCard(listing);
                container.appendChild(listingEl);
            });
        }
    }

    createBuildingListingCard(listing) {
        const card = document.createElement('div');
        card.className = 'listing-card';

        // Get player info and color
        const playerInfo = this.getPlayerInfo(listing.sellerId);
        card.style.borderColor = listing.isFireSale ? '#ff5252' : playerInfo.color;

        // Get building name from definitions
        const buildingName = listing.buildingId || 'Unknown Building';
        const [row, col] = listing.location;

        // Format timestamp
        const createdDate = new Date(listing.createdAt);
        const timeAgo = this.getTimeAgo(createdDate);

        // Calculate days listed
        const daysListed = this.game.economicClient?.gameState?.gameTime
            ? (this.game.economicClient.gameState.gameTime - listing.listedDay)
            : 0;

        const isOwnListing = listing.sellerId === this.game.currentPlayerId;

        card.innerHTML = `
            <div class="listing-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="seller-badge" style="background-color: ${listing.isFireSale ? '#ff5252' : playerInfo.color}; color: white; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">
                    ${listing.isFireSale ? '🔥 FIRE SALE' : playerInfo.name}
                </span>
                <span class="listing-time" style="color: #666; font-size: 10px;">
                    ${timeAgo}
                </span>
            </div>
            <div class="listing-details" style="margin: 10px 0;">
                <div style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 5px;">
                    ${buildingName}
                </div>
                <div style="color: #888; font-size: 11px; margin-bottom: 8px;">
                    Location: ${this.formatCoordinates(row, col)} • Condition: ${Math.round((listing.condition || 1.0) * 100)}%
                    ${listing.isFireSale ? ` • Day ${daysListed}/30` : ''}
                </div>
                <div style="font-size: 24px; font-weight: 700; color: #E8D4A0;">
                    $${listing.currentPrice.toLocaleString()}
                </div>
                ${listing.isFireSale && listing.originalPrice !== listing.currentPrice ? `
                    <div style="color: #ff5252; font-size: 11px; text-decoration: line-through; opacity: 0.7;">
                        Was $${listing.originalPrice.toLocaleString()}
                    </div>
                ` : ''}
            </div>
            <div class="listing-actions">
                ${isOwnListing && !listing.isFireSale ? `
                    <button class="btn-cancel" onclick="window.game.marketplace.cancelBuildingListing(${listing.id})" style="width: 100%; padding: 8px; background: rgba(255, 82, 82, 0.2); color: #ff5252; border: 1px solid #ff5252; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Cancel Listing
                    </button>
                ` : !isOwnListing ? `
                    <button class="btn-buy" onclick="window.game.marketplace.purchaseBuilding(${listing.id})" style="width: 100%; padding: 8px; background: ${listing.isFireSale ? '#ff5252' : '#E8D4A0'}; color: ${listing.isFireSale ? '#fff' : '#000'}; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        ${listing.isFireSale ? 'Buy Fire Sale' : 'Buy Building'}
                    </button>
                ` : `
                    <div style="color: #888; font-size: 11px; text-align: center;">Your fire sale</div>
                `}
            </div>
        `;

        return card;
    }

    createParcelListingCard(listing) {
        const card = document.createElement('div');
        card.className = 'listing-card';

        // Get player info and color
        const playerInfo = this.getPlayerInfo(listing.sellerId);
        card.style.borderColor = playerInfo.color;

        const [row, col] = listing.location;

        // Format timestamp
        const createdDate = new Date(listing.createdAt);
        const timeAgo = this.getTimeAgo(createdDate);

        const isOwnListing = listing.sellerId === this.game.currentPlayerId;

        card.innerHTML = `
            <div class="listing-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="seller-badge" style="background-color: ${playerInfo.color}; color: white; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">
                    ${playerInfo.name}
                </span>
                <span class="listing-time" style="color: #666; font-size: 10px;">
                    ${timeAgo}
                </span>
            </div>
            <div class="listing-details" style="margin: 10px 0;">
                <div style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 5px;">
                    Empty Parcel
                </div>
                <div style="color: #888; font-size: 11px; margin-bottom: 8px;">
                    Location: ${this.formatCoordinates(row, col)}
                </div>
                <div style="font-size: 24px; font-weight: 700; color: #E8D4A0;">
                    $${(listing.price || 0).toLocaleString()}
                </div>
            </div>
            <div class="listing-actions">
                ${isOwnListing ? `
                    <button class="btn-cancel" onclick="window.game.marketplace.cancelParcelListing(${listing.id})" style="width: 100%; padding: 8px; background: rgba(255, 82, 82, 0.2); color: #ff5252; border: 1px solid #ff5252; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Cancel Listing
                    </button>
                ` : `
                    <button class="btn-buy" onclick="window.game.marketplace.purchaseParcel(${listing.id})" style="width: 100%; padding: 8px; background: #E8D4A0; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Buy Parcel
                    </button>
                `}
            </div>
        `;

        return card;
    }

    async purchaseBuilding(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
        if (currentBalance < listing.currentPrice) {
            this.game.showNotification(`Insufficient funds! Need $${listing.currentPrice.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'BUILDING_PURCHASE',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            console.log('🏪 Marketplace: Purchasing building:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bought ${listing.buildingId} for $${listing.currentPrice.toLocaleString()}!`, 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to purchase', 'error');
            }
        } catch (error) {
            console.error('Failed to purchase building:', error);
            this.game.showNotification('Failed to purchase building', 'error');
        }
    }

    async purchaseParcel(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        // Check player balance
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            this.game.showNotification('Loading balance data...', 'info');
            return;
        }
        if (currentBalance < listing.price) {
            this.game.showNotification(`Insufficient funds! Need $${listing.price.toLocaleString()}`, 'error');
            return;
        }

        try {
            const transaction = {
                type: 'PARCEL_MARKETPLACE_PURCHASE',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            console.log('🏪 Marketplace: Purchasing parcel:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification(`Bought parcel for $${listing.price.toLocaleString()}!`, 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to purchase', 'error');
            }
        } catch (error) {
            console.error('Failed to purchase parcel:', error);
            this.game.showNotification('Failed to purchase parcel', 'error');
        }
    }

    async cancelBuildingListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        try {
            const transaction = {
                type: 'BUILDING_CANCEL_LISTING',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            console.log('🏪 Marketplace: Cancelling building listing:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification('Building listing cancelled', 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to cancel listing', 'error');
            }
        } catch (error) {
            console.error('Failed to cancel building listing:', error);
            this.game.showNotification('Failed to cancel listing', 'error');
        }
    }

    async cancelParcelListing(listingId) {
        const listing = this.listings.get(listingId);
        if (!listing || listing.status !== 'active') {
            this.game.showNotification('Listing not available', 'error');
            return;
        }

        try {
            const transaction = {
                type: 'PARCEL_CANCEL_LISTING',
                playerId: this.game.currentPlayerId,
                listingId: listingId
            };

            console.log('🏪 Marketplace: Cancelling parcel listing:', transaction);
            const result = await this.game.economicClient.sendTransaction(transaction);

            if (result.success) {
                this.game.showNotification('Parcel listing cancelled', 'success');
                this.refreshListings();
                this.updateDisplay();
            } else {
                this.game.showNotification(result.error || 'Failed to cancel listing', 'error');
            }
        } catch (error) {
            console.error('Failed to cancel parcel listing:', error);
            this.game.showNotification('Failed to cancel listing', 'error');
        }
    }

    /**
     * PLAYER-INITIATED SALES
     */

    showSellBuildingModal(row, col) {
        const parcel = this.game.grid[row][col];
        const building = this.game.economicClient?.buildings?.get(`${row},${col}`);
        if (!building) {
            this.game.showNotification('Building not found', 'error');
            return;
        }

        const buildingDef = this.game.buildingManager?.getBuildingById(building.id);
        const buildingName = buildingDef?.name || building.id;

        // Calculate suggested price (80% of building value + parcel cost)
        const buildCost = buildingDef?.economics?.buildCost || 0;
        const condition = building.condition || 1.0;
        const parcelPrice = parcel.purchasePrice || 0;
        const suggestedPrice = Math.floor((buildCost * condition + parcelPrice) * 0.80);

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: linear-gradient(145deg, #111111, #0a0a0a); border: 1px solid #2a2a2a; border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05); padding: 0; max-width: 480px; width: 90%;">
                <div style="padding: 20px 24px; border-bottom: 1px solid rgba(42, 42, 42, 0.4); background: linear-gradient(135deg, rgba(26, 26, 26, 0.7), rgba(20, 20, 20, 0.8));">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 500; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">List Building for Sale</h3>
                </div>
                <div style="padding: 24px;">
                    <div style="margin-bottom: 24px;">
                        <div style="color: #fff; font-size: 18px; font-weight: 600; margin-bottom: 8px;">${buildingName}</div>
                        <div style="color: #999; font-size: 13px; margin-bottom: 4px;">Location: ${this.formatCoordinates(row, col)}</div>
                        <div style="color: #777; font-size: 13px;">Condition: ${Math.round(condition * 100)}%</div>
                    </div>
                    <div style="background: rgba(42, 42, 42, 0.3); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <div style="color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Suggested Price</div>
                        <div style="color: #fff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">$${suggestedPrice.toLocaleString()}</div>
                        <div style="color: #666; font-size: 12px; margin-top: 6px;">Based on 80% of current value</div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Your Price</label>
                        <input type="number" id="sell-building-price" placeholder="Enter amount" min="1" value="${suggestedPrice}" style="width: 100%; padding: 12px 14px; background: rgba(26, 26, 26, 0.8); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; font-size: 16px; font-weight: 500; box-sizing: border-box; transition: border-color 0.2s;">
                    </div>
                    <div style="background: rgba(42, 42, 42, 0.2); border-left: 2px solid rgba(255, 255, 255, 0.15); padding: 12px 14px; margin-bottom: 24px; border-radius: 4px;">
                        <div style="color: #999; font-size: 12px; line-height: 1.6;">
                            • Costs 1 action to list<br>
                            • Fixed price (no decay)<br>
                            • Cancel anytime for free
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="cancel-sell-building" style="flex: 1; padding: 12px; background: rgba(26, 26, 26, 0.8); color: #999; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;">Cancel</button>
                        <button id="confirm-sell-building" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #ffffff, #cccccc); color: #000; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s;">List Building</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('cancel-sell-building').onclick = () => modal.remove();
        document.getElementById('confirm-sell-building').onclick = async () => {
            const price = parseInt(document.getElementById('sell-building-price').value);
            if (!price || price < 1) {
                this.game.showNotification('Invalid price', 'error');
                return;
            }

            try {
                const transaction = {
                    type: 'PLAYER_BUILDING_SALE',
                    playerId: this.game.currentPlayerId,
                    location: [row, col],
                    price: price
                };

                console.log('🏪 Marketplace: Creating building listing:', transaction);
                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    this.game.showNotification('Building listed for sale!', 'success');
                    modal.remove();
                    this.switchTab('buildings');
                    this.openMarketplace();
                } else {
                    // If already listed, pulse the price input instead of showing toast
                    if (result.error && result.error.includes('already listed')) {
                        const priceInput = document.getElementById('sell-building-price');
                        if (priceInput) {
                            this.pulseInputError(priceInput);
                        }
                    } else {
                        this.game.showNotification(result.error || 'Failed to list building', 'error');
                    }
                }
            } catch (error) {
                console.error('Failed to list building:', error);
                this.game.showNotification('Failed to list building', 'error');
            }
        };
    }

    showSellParcelModal(row, col) {
        const parcel = this.game.grid[row][col];
        if (!parcel || parcel.building) {
            this.game.showNotification('Can only sell empty parcels', 'error');
            return;
        }

        // Calculate suggested price (80% of purchase price)
        const purchasePrice = parcel.purchasePrice || 150;
        const suggestedPrice = Math.floor(purchasePrice * 0.80);

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000;';
        modal.innerHTML = `
            <div style="background: linear-gradient(145deg, #111111, #0a0a0a); border: 1px solid #2a2a2a; border-radius: 12px; box-shadow: 0 15px 35px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05); padding: 0; max-width: 480px; width: 90%;">
                <div style="padding: 20px 24px; border-bottom: 1px solid rgba(42, 42, 42, 0.4); background: linear-gradient(135deg, rgba(26, 26, 26, 0.7), rgba(20, 20, 20, 0.8));">
                    <h3 style="margin: 0; font-size: 14px; font-weight: 500; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">List Parcel for Sale</h3>
                </div>
                <div style="padding: 24px;">
                    <div style="margin-bottom: 24px;">
                        <div style="color: #fff; font-size: 18px; font-weight: 600; margin-bottom: 8px;">Empty Parcel</div>
                        <div style="color: #999; font-size: 13px; margin-bottom: 4px;">Location: ${this.formatCoordinates(row, col)}</div>
                        <div style="color: #777; font-size: 13px;">Purchased for: $${purchasePrice.toLocaleString()}</div>
                    </div>
                    <div style="background: rgba(42, 42, 42, 0.3); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                        <div style="color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Suggested Price</div>
                        <div style="color: #fff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">$${suggestedPrice.toLocaleString()}</div>
                        <div style="color: #666; font-size: 12px; margin-top: 6px;">Based on 80% of purchase price</div>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; color: #999; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Your Price</label>
                        <input type="number" id="sell-parcel-price" placeholder="Enter amount" min="1" value="${suggestedPrice}" style="width: 100%; padding: 12px 14px; background: rgba(26, 26, 26, 0.8); color: #fff; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; font-size: 16px; font-weight: 500; box-sizing: border-box; transition: border-color 0.2s;">
                    </div>
                    <div style="background: rgba(42, 42, 42, 0.2); border-left: 2px solid rgba(255, 255, 255, 0.15); padding: 12px 14px; margin-bottom: 24px; border-radius: 4px;">
                        <div style="color: #999; font-size: 12px; line-height: 1.6;">
                            • Costs 1 action to list<br>
                            • Fixed price (no decay)<br>
                            • Cancel anytime for free
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="cancel-sell-parcel" style="flex: 1; padding: 12px; background: rgba(26, 26, 26, 0.8); color: #999; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;">Cancel</button>
                        <button id="confirm-sell-parcel" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #ffffff, #cccccc); color: #000; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s;">List Parcel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('cancel-sell-parcel').onclick = () => modal.remove();
        document.getElementById('confirm-sell-parcel').onclick = async () => {
            const price = parseInt(document.getElementById('sell-parcel-price').value);
            if (!price || price < 1) {
                this.game.showNotification('Invalid price', 'error');
                return;
            }

            try {
                const transaction = {
                    type: 'PLAYER_PARCEL_SALE',
                    playerId: this.game.currentPlayerId,
                    location: [row, col],
                    price: price
                };

                console.log('🏪 Marketplace: Creating parcel listing:', transaction);
                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    this.game.showNotification('Parcel listed for sale!', 'success');
                    modal.remove();
                    this.switchTab('parcels');
                    this.openMarketplace();
                } else {
                    // If already listed, pulse the price input instead of showing toast
                    if (result.error && result.error.includes('already listed')) {
                        const priceInput = document.getElementById('sell-parcel-price');
                        if (priceInput) {
                            this.pulseInputError(priceInput);
                        }
                    } else {
                        this.game.showNotification(result.error || 'Failed to list parcel', 'error');
                    }
                }
            } catch (error) {
                console.error('Failed to list parcel:', error);
                this.game.showNotification('Failed to list parcel', 'error');
            }
        };
    }

    createActionListingCard(listing, isOwnListing) {
        const card = document.createElement('div');
        card.className = 'listing-card';

        // Get player info and color
        const playerInfo = this.getPlayerInfo(listing.sellerId);
        card.style.borderColor = playerInfo.color;

        // Format timestamp
        const createdDate = new Date(listing.createdAt);
        const timeAgo = this.getTimeAgo(createdDate);

        card.innerHTML = `
            <div class="listing-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="seller-badge" style="background-color: ${playerInfo.color}; color: white; padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">
                    ${playerInfo.name}
                </span>
                <span class="listing-time" style="color: #666; font-size: 10px;">
                    ${timeAgo}
                </span>
            </div>
            <div class="listing-details" style="margin: 10px 0;">
                <div style="font-size: 24px; font-weight: 700; color: #E8D4A0;">
                    $${listing.price.toLocaleString()}
                </div>
                <div style="color: #888; font-size: 12px; margin-top: 2px;">
                    1 Action
                </div>
            </div>
            <div class="listing-actions">
                ${isOwnListing ? `
                    <button class="btn-cancel" onclick="window.game.marketplace.cancelListing(${listing.id})" style="width: 100%; padding: 8px; background: rgba(255, 82, 82, 0.2); color: #ff5252; border: 1px solid #ff5252; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Cancel Listing
                    </button>
                ` : `
                    <button class="btn-buy" onclick="window.game.marketplace.purchaseListing(${listing.id})" style="width: 100%; padding: 8px; background: #E8D4A0; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Buy Now
                    </button>
                `}
            </div>
        `;

        return card;
    }

    getPlayerInfo(playerId) {
        if (!playerId) return { name: 'Unknown', color: '#666' };

        if (playerId === this.game.currentPlayerId) {
            const playerColor = this.game.playerSettings?.color || '#4CAF50';
            return { name: 'You', color: playerColor };
        }

        // Try to get from economic client
        const playerData = this.game.economicClient?.getPlayerData?.(playerId);
        if (playerData) {
            return {
                name: playerData.name || playerId.slice(-4),
                color: playerData.color || '#666'
            };
        }

        // Fallback
        return {
            name: playerId.slice(-4),
            color: '#666'
        };
    }

    getTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    // Pulse an input with red border to indicate error (used for duplicate listings)
    pulseInputError(inputElement) {
        // Add keyframes if not already added
        if (!document.getElementById('pulse-error-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pulse-error-keyframes';
            style.textContent = `
                @keyframes pulseError {
                    0%, 100% { border-color: rgba(255, 82, 82, 0.3); box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.7); }
                    50% { border-color: rgba(255, 82, 82, 1); box-shadow: 0 0 0 4px rgba(255, 82, 82, 0); }
                }
            `;
            document.head.appendChild(style);
        }

        // Apply pulse animation
        inputElement.style.animation = 'pulseError 0.6s ease-in-out 2';
        inputElement.style.borderColor = '#ff5252';

        // Reset after animation
        setTimeout(() => {
            inputElement.style.animation = '';
            inputElement.style.borderColor = '';
        }, 1200);
    }

    /**
     * DATA SYNC FROM SERVER
     */

    syncMarketplaceData(marketplaceData) {
        if (!marketplaceData) return;

        console.log('⚡ Action Marketplace: Syncing data:', marketplaceData);

        // Update listings
        if (marketplaceData.listings) {
            this.listings.clear();
            marketplaceData.listings.forEach(listing => {
                this.listings.set(listing.id, listing);
            });
        }

        // Update stats
        if (marketplaceData.stats) {
            this.stats = marketplaceData.stats;
        }

        // Update price history
        if (marketplaceData.priceHistory) {
            this.priceHistory = marketplaceData.priceHistory;
        }

        // Refresh UI if tray is open
        if (this.isOpen) {
            this.updateDisplay();
            this.refreshListings();
        } else {
            // Still update top bar action count
            const currentActions = this.game.economicClient?.getCurrentPlayerActions();
            const topBarCount = document.getElementById('top-bar-actions-count');
            if (topBarCount) {
                topBarCount.textContent = currentActions !== null ? currentActions : '--';
            }
        }

        // Update Land Exchange sidebar stats
        this.updateLandExchangeSidebarStats();
    }

    /**
     * Update the Land Exchange sidebar with marketplace stats
     */
    updateLandExchangeSidebarStats() {
        if (!this.game.landExchange || !this.game.landExchange.updateMarketplaceStats) return;

        const allListings = Array.from(this.listings.values());

        // Count active listings by type
        const actionsCount = allListings.filter(l => l.type === 'ACTION_SALE' && l.status === 'active').length;
        const buildingsCount = allListings.filter(l => l.type === 'BUILDING_SALE' && l.status === 'active').length;
        const parcelsCount = allListings.filter(l => l.type === 'PARCEL_SALE' && l.status === 'active').length;

        // Calculate average prices
        const actionListings = allListings.filter(l => l.type === 'ACTION_SALE' && l.status === 'active');
        const buildingListings = allListings.filter(l => l.type === 'BUILDING_SALE' && l.status === 'active');
        const parcelListings = allListings.filter(l => l.type === 'PARCEL_SALE' && l.status === 'active');

        const avgActionPrice = actionsCount > 0
            ? actionListings.reduce((sum, l) => sum + l.price, 0) / actionsCount
            : 0;
        const avgBuildingPrice = buildingsCount > 0
            ? buildingListings.reduce((sum, l) => sum + (l.currentPrice || l.price), 0) / buildingsCount
            : 0;
        const avgParcelPrice = parcelsCount > 0
            ? parcelListings.reduce((sum, l) => sum + l.price, 0) / parcelsCount
            : 0;

        this.game.landExchange.updateMarketplaceStats({
            actionsCount,
            buildingsCount,
            parcelsCount,
            avgActionPrice,
            avgBuildingPrice,
            avgParcelPrice
        });
    }

    /**
     * CLEANUP
     */

    reset() {
        this.listings.clear();
        this.stats = {
            avgListingPrice: null,
            avgSalePrice: null,
            totalSales: 0
        };
        this.priceHistory = {
            listings: [],
            sales: []
        };

        if (this.priceChart) {
            this.priceChart.destroy();
            this.priceChart = null;
        }

        if (this.isOpen) {
            this.updateDisplay();
            this.refreshListings();
        }
    }

    destroy() {
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        if (this.eventManager) {
            this.eventManager.cleanup();
        }
        console.log('🗑️ Marketplace V3 destroyed');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarketplaceV3;
}

// Legacy alias for backward compatibility
if (typeof window !== 'undefined') {
    window.ActionMarketplaceV2 = MarketplaceV3;
}
