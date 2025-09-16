/**
 * UI Manager for The Commons
 * Centralized DOM caching and UI update system for optimal performance
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.initialized = false;
        this.updateQueue = [];
        this.isUpdateScheduled = false;
        
        // Track which elements exist for safe updates
        this.elementExists = {};
    }
    
    /**
     * Initialize and cache all DOM elements
     * Call this after DOM is ready
     */
    initialize() {
        console.log('🎯 Initializing UI Manager with DOM caching...');
        
        // Core UI Elements
        this.cacheElements({
            // Game status
            selectedTile: 'selected-tile',
            gameDate: 'game-date',
            playerCash: 'player-cash',
            playerWealth: 'player-wealth',
            playerCashflow: 'player-cashflow',
            cityName: 'city-name',
            totalResidents: 'total-residents',
            cityTreasury: 'city-treasury',
            
            // Actions
            currentActions: 'current-actions',
            marketListings: 'market-listings',
            actionAvgPrice: 'action-avg-price',
            
            // Building selector
            buildingCategory: 'building-category',
            buildingButtons: 'building-buttons',
            selectedBuilding: 'selected-building',
            
            // Modals
            actionMarketplaceModal: 'action-marketplace-modal',
            governanceModal: 'governance-modal',
            auctionModal: 'auction-modal',
            routeModal: 'route-modal',
            
            // Action marketplace
            modalActionBalance: 'modal-action-balance',
            modalActionsUsed: 'modal-actions-used',
            modalNextRefresh: 'modal-next-refresh',
            modalActiveListings: 'modal-active-listings',
            modalAvgPrice: 'modal-avg-price',
            sellQuantity: 'sell-quantity',
            sellReserve: 'sell-reserve',
            sellBuyNow: 'sell-buynow',
            actionListings: 'action-listings',
            transactionHistory: 'transaction-history',
            
            // Month progress
            monthProgressBar: 'month-progress-bar',
            monthProgressText: 'month-progress-text',
            monthProgressContainer: 'month-progress-container',
            
            // Auction
            auctionTimer: 'auction-timer',
            currentBid: 'current-bid',
            currentBidder: 'current-bidder',
            auctionParcel: 'auction-parcel',
            
            // Governance
            votingPoints: 'voting-points',
            totalBudget: 'total-budget',
            budgetAllocated: 'budget-allocated',
            budgetUnallocated: 'budget-unallocated',
            taxRate: 'tax-rate',
            
            // Route planning
            routeName: 'route-name',
            routeMode: 'route-mode',
            routeFrequency: 'route-frequency',
            routeStops: 'route-stops',
            routePrice: 'route-price',
            
            // Context menu
            contextMenu: 'context-menu',
            
            // Buttons
            openActionMarketplace: 'open-action-marketplace',
            closeActionMarketplace: 'close-action-marketplace',
            createListing: 'create-listing',
            showGovernance: 'show-governance',
            closeGovernance: 'close-governance',
            startAuction: 'start-auction',
            placeBid: 'place-bid',
            buyNow: 'buy-now',
            
            // Vitality bars
            vitalityEnergy: 'vitality-energy',
            vitalityFood: 'vitality-food',
            vitalityHousing: 'vitality-housing',
            vitalityJobs: 'vitality-jobs',
            vitalityMobility: 'vitality-mobility',
            vitalityEducation: 'vitality-education',
            vitalityHealth: 'vitality-health',
            vitalitySafety: 'vitality-safety',
            vitalityCulture: 'vitality-culture',
            vitalityEnvironment: 'vitality-environment',
            vitalityAffordability: 'vitality-affordability',
            vitalityResilience: 'vitality-resilience',
            
            // Rows for data attributes
            residentsRow: 'residents-row',
            treasuryRow: 'treasury-row'
        });
        
        // Cache query selector groups
        this.querySelectorGroups = {
            budgetCategories: this.querySelectorAll('.budget-category'),
            vitalityRows: this.querySelectorAll('.vitality-row'),
            metricTooltips: this.querySelectorAll('.metric-tooltip'),
            modalCloseButtons: this.querySelectorAll('.modal-close'),
            layerButtons: this.querySelectorAll('.layer-btn')
        };
        
        this.initialized = true;
        console.log(`✅ UI Manager initialized with ${Object.keys(this.elements).length} cached elements`);
        
        return this;
    }
    
    /**
     * Cache multiple elements by ID
     */
    cacheElements(elementMap) {
        for (const [key, id] of Object.entries(elementMap)) {
            const element = document.getElementById(id);
            if (element) {
                this.elements[key] = element;
                this.elementExists[key] = true;
            } else {
                this.elementExists[key] = false;
                // Don't warn for optional elements
                if (!['routeModal', 'routeStops', 'routeName'].includes(key)) {
                    // console.debug(`⚠️ Element not found: ${id}`);
                }
            }
        }
    }
    
    /**
     * Safe querySelector with caching
     */
    querySelector(selector) {
        if (!this.elements[selector]) {
            this.elements[selector] = document.querySelector(selector);
        }
        return this.elements[selector];
    }
    
    /**
     * Safe querySelectorAll with caching
     */
    querySelectorAll(selector) {
        if (!this.elements[selector]) {
            this.elements[selector] = document.querySelectorAll(selector);
        }
        return this.elements[selector];
    }
    
    /**
     * Get cached element
     */
    get(key) {
        if (!this.elementExists[key]) return null;
        return this.elements[key];
    }
    
    /**
     * Update element text content
     */
    updateText(key, text) {
        const element = this.get(key);
        if (element && element.textContent !== String(text)) {
            element.textContent = text;
        }
    }
    
    /**
     * Update element HTML
     */
    updateHTML(key, html) {
        const element = this.get(key);
        if (element) {
            element.innerHTML = html;
        }
    }
    
    /**
     * Update element value (for inputs)
     */
    updateValue(key, value) {
        const element = this.get(key);
        if (element && 'value' in element) {
            element.value = value;
        }
    }
    
    /**
     * Update element style
     */
    updateStyle(key, property, value) {
        const element = this.get(key);
        if (element) {
            element.style[property] = value;
        }
    }
    
    /**
     * Add class to element
     */
    addClass(key, className) {
        const element = this.get(key);
        if (element && !element.classList.contains(className)) {
            element.classList.add(className);
        }
    }
    
    /**
     * Remove class from element
     */
    removeClass(key, className) {
        const element = this.get(key);
        if (element) {
            element.classList.remove(className);
        }
    }
    
    /**
     * Toggle class on element
     */
    toggleClass(key, className) {
        const element = this.get(key);
        if (element) {
            element.classList.toggle(className);
        }
    }
    
    /**
     * Set attribute on element
     */
    setAttribute(key, attribute, value) {
        const element = this.get(key);
        if (element) {
            element.setAttribute(attribute, value);
        }
    }
    
    /**
     * Show element
     */
    show(key) {
        const element = this.get(key);
        if (element) {
            element.style.display = '';
            element.classList.remove('hidden');
        }
    }
    
    /**
     * Hide element
     */
    hide(key) {
        const element = this.get(key);
        if (element) {
            element.style.display = 'none';
        }
    }
    
    /**
     * Batch UI updates for better performance
     */
    batchUpdate(updates) {
        this.updateQueue.push(...updates);
        
        if (!this.isUpdateScheduled) {
            this.isUpdateScheduled = true;
            requestAnimationFrame(() => {
                this.processBatchedUpdates();
            });
        }
    }
    
    /**
     * Process batched updates
     */
    processBatchedUpdates() {
        const updates = this.updateQueue;
        this.updateQueue = [];
        this.isUpdateScheduled = false;
        
        updates.forEach(update => {
            const { type, key, value, property } = update;
            
            switch(type) {
                case 'text':
                    this.updateText(key, value);
                    break;
                case 'html':
                    this.updateHTML(key, value);
                    break;
                case 'value':
                    this.updateValue(key, value);
                    break;
                case 'style':
                    this.updateStyle(key, property, value);
                    break;
                case 'class':
                    if (update.action === 'add') {
                        this.addClass(key, value);
                    } else if (update.action === 'remove') {
                        this.removeClass(key, value);
                    } else {
                        this.toggleClass(key, value);
                    }
                    break;
                case 'attribute':
                    this.setAttribute(key, property, value);
                    break;
            }
        });
    }
    
    /**
     * Update player stats efficiently
     */
    updatePlayerStats(stats) {
        const updates = [];
        
        if (stats.cash !== undefined) {
            updates.push({ type: 'text', key: 'playerCash', value: `$${stats.cash.toLocaleString()}` });
        }
        if (stats.wealth !== undefined) {
            updates.push({ type: 'text', key: 'playerWealth', value: `$${Math.round(stats.wealth).toLocaleString()}` });
        }
        if (stats.cashflow !== undefined) {
            const sign = stats.cashflow >= 0 ? '+' : '';
            const color = stats.cashflow >= 0 ? '#4CAF50' : '#f44336';
            updates.push({ 
                type: 'text', 
                key: 'playerCashflow', 
                value: `${sign}$${Math.round(stats.cashflow).toLocaleString()}/day` 
            });
            updates.push({ 
                type: 'style', 
                key: 'playerCashflow', 
                property: 'color', 
                value: color 
            });
        }
        if (stats.actions !== undefined) {
            updates.push({ type: 'text', key: 'currentActions', value: stats.actions });
        }
        
        this.batchUpdate(updates);
    }
    
    /**
     * Update city stats efficiently
     */
    updateCityStats(stats) {
        const updates = [];
        
        if (stats.residents !== undefined) {
            updates.push({ type: 'text', key: 'totalResidents', value: stats.residents.toLocaleString() });
        }
        if (stats.treasury !== undefined) {
            updates.push({ type: 'text', key: 'cityTreasury', value: `$${Math.round(stats.treasury).toLocaleString()}` });
        }
        if (stats.date !== undefined) {
            updates.push({ type: 'text', key: 'gameDate', value: `${stats.date.month} ${stats.date.day}` });
        }
        
        this.batchUpdate(updates);
    }
    
    /**
     * Update vitality bar efficiently
     */
    updateVitalityBar(domain, percentage, color) {
        const key = `vitality${domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase()}`;
        const element = this.get(key);
        
        if (element) {
            // Update width and color in one operation
            element.style.cssText = `width: ${percentage}%; background: ${color};`;
        }
    }
    
    /**
     * Clear all cached elements (for cleanup)
     */
    clear() {
        this.elements = {};
        this.elementExists = {};
        this.updateQueue = [];
        this.initialized = false;
    }
    
    /**
     * Re-initialize after DOM changes
     */
    refresh() {
        this.clear();
        this.initialize();
    }
    
    /**
     * Get performance stats
     */
    getStats() {
        return {
            cachedElements: Object.keys(this.elements).length,
            existingElements: Object.values(this.elementExists).filter(e => e).length,
            queuedUpdates: this.updateQueue.length
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}