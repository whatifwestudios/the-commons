/**
 * Action Marketplace V3 - Instant Purchase System
 *
 * Features:
 * - Simple instant purchase listings (1 action each)
 * - No fees (listing, cancellation, or transaction)
 * - Price history tracking and visualization
 * - Slide-down tray UI (matching governance pattern)
 * - Real-time sync via WebSocket
 */
class ActionMarketplaceV2 {
    constructor(game) {
        this.game = game;
        this.isOpen = false;
        this.activeTab = 'marketplace';
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
        if (tabName === 'marketplace' || tabName === 'your-listings') {
            this.refreshListings();
        }
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
        if (this.priceHistory.listings.length > 0 || this.priceHistory.sales.length > 0) {
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

        // Avg Listing Price
        const avgListingEl = document.getElementById('marketplace-avg-listing');
        if (avgListingEl) {
            avgListingEl.textContent = this.stats.avgListingPrice !== null
                ? `$${Math.round(this.stats.avgListingPrice).toLocaleString()}`
                : 'N/A';
        }

        // Avg Sale Price
        const avgSaleEl = document.getElementById('marketplace-avg-sale');
        if (avgSaleEl) {
            avgSaleEl.textContent = this.stats.avgSalePrice !== null
                ? `$${Math.round(this.stats.avgSalePrice).toLocaleString()}`
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

        // Group data by month
        const listingsByMonth = this.groupPricesByMonth(this.priceHistory.listings);
        const salesByMonth = this.groupPricesByMonth(this.priceHistory.sales);

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
                this.switchTab('your-listings');
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

    refreshListings() {
        this.refreshYourListings();
        this.refreshMarketplaceListings();
    }

    refreshYourListings() {
        const container = document.getElementById('your-listings-grid');
        if (!container) return;

        const allListings = Array.from(this.listings.values());
        const yourListings = allListings
            .filter(l => l.sellerId === this.game.currentPlayerId && l.status === 'active')
            .sort((a, b) => a.price - b.price); // Sort by price

        container.innerHTML = '';
        if (yourListings.length === 0) {
            container.innerHTML = '<p class="empty-state">You have no active listings</p>';
        } else {
            yourListings.forEach(listing => {
                const listingEl = this.createListingCard(listing, true);
                container.appendChild(listingEl);
            });
        }
    }

    refreshMarketplaceListings() {
        const container = document.getElementById('marketplace-listings-grid');
        if (!container) return;

        const allListings = Array.from(this.listings.values());
        const activeListings = allListings
            .filter(l => l.status === 'active')
            .sort((a, b) => {
                // Sort by price (lowest first), then by timestamp (oldest first)
                if (a.price !== b.price) {
                    return a.price - b.price;
                }
                return a.createdAt - b.createdAt;
            });

        container.innerHTML = '';
        if (activeListings.length === 0) {
            container.innerHTML = '<p class="empty-state">No active listings in the marketplace</p>';
        } else {
            activeListings.forEach(listing => {
                const isOwn = listing.sellerId === this.game.currentPlayerId;
                const listingEl = this.createListingCard(listing, isOwn);
                container.appendChild(listingEl);
            });
        }
    }

    createListingCard(listing, isOwnListing) {
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
                    <button class="btn-cancel" onclick="window.game.actionMarketplace.cancelListing(${listing.id})" style="width: 100%; padding: 8px; background: rgba(255, 82, 82, 0.2); color: #ff5252; border: 1px solid #ff5252; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
                        Cancel Listing
                    </button>
                ` : `
                    <button class="btn-buy" onclick="window.game.actionMarketplace.purchaseListing(${listing.id})" style="width: 100%; padding: 8px; background: #E8D4A0; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: all 0.2s;">
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
        console.log('🗑️ Action Marketplace V3 destroyed');
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionMarketplaceV2;
}
