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
            vitalityEnergy: 'energy-bar',
            vitalityFood: 'food-bar',
            vitalityHousing: 'housing-bar',
            vitalityJobs: 'jobs-bar',
            vitalityMobility: 'mobility-bar',
            vitalityEducation: 'education-bar',
            vitalityHealth: 'health-bar',
            vitalitySafety: 'safety-bar',
            vitalityCulture: 'culture-bar',
            vitalityEnvironment: 'environment-bar',
            vitalityAffordability: 'affordability-bar',
            vitalityResilience: 'resilience-bar',
            vitalityNoise: 'noise-bar',
            
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
    
    /**
     * Modal Management Functions
     */
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('visible');
        }
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('visible');
        }
    }
    
    /**
     * Setup Event Listeners for UI Components
     */
    setupEventListeners(game) {
        console.log('🎯 Setting up UI event listeners...');
        
        // Setup zoom controls
        this.setupZoomControls(game);
        
        // Setup city menu
        this.setupCityMenu(game);
        
        // Setup player menu
        this.setupPlayerMenu(game);
        
        // Setup layer controls
        this.setupLayerControls(game);
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts(game);
        
        // Setup tool buttons
        this.setupToolButtons(game);
        
        // Setup window resize handler
        this.setupWindowResize(game);
    }
    
    /**
     * Setup zoom control event listeners
     */
    setupZoomControls(game) {
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        const zoomResetBtn = document.getElementById('zoom-reset');
        
        if (zoomInBtn && !zoomInBtn.dataset.listenerAdded) {
            zoomInBtn.addEventListener('click', () => {
                if (game.zoomLevel < 2.4) {
                    game.zoomLevel++;
                    game.updateZoom();
                }
            });
            zoomInBtn.dataset.listenerAdded = 'true';
        }
        
        if (zoomOutBtn && !zoomOutBtn.dataset.listenerAdded) {
            zoomOutBtn.addEventListener('click', () => {
                if (game.zoomLevel > 0.4) {
                    game.zoomLevel--;
                    game.updateZoom();
                }
            });
            zoomOutBtn.dataset.listenerAdded = 'true';
        }
        
        if (zoomResetBtn && !zoomResetBtn.dataset.listenerAdded) {
            zoomResetBtn.addEventListener('click', () => {
                game.zoomLevel = 0.4;
                game.panOffset = { x: 0, y: 0 };
                game.updateZoom();
            });
            zoomResetBtn.dataset.listenerAdded = 'true';
        }
        
        // Update zoom buttons state
        if (game.updateZoomButtons) {
            game.updateZoomButtons();
        }
    }
    
    /**
     * Setup city menu event listeners
     */
    setupCityMenu(game) {
        const cityNameBtn = document.getElementById('city-name-btn');
        const cityMenu = document.getElementById('city-menu');
        const citySection = cityNameBtn?.parentElement;
        
        if (cityNameBtn && cityMenu && citySection) {
            let menuTimeout;
            
            cityNameBtn.addEventListener('mouseenter', () => {
                clearTimeout(menuTimeout);
                cityMenu.classList.add('active');
            });
            
            citySection.addEventListener('mouseleave', () => {
                menuTimeout = setTimeout(() => {
                    cityMenu.classList.remove('active');
                }, 300);
            });
            
            cityMenu.addEventListener('mouseenter', () => {
                clearTimeout(menuTimeout);
            });
        }
    }
    
    /**
     * Setup player menu event listeners
     */
    setupPlayerMenu(game) {
        // Player menu toggle
        const playerBtn = document.getElementById('player-btn');
        const playerMenu = document.getElementById('player-menu');
        
        if (playerBtn && playerMenu) {
            playerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playerMenu.classList.toggle('active');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!playerMenu.contains(e.target) && !playerBtn.contains(e.target)) {
                    playerMenu.classList.remove('active');
                }
            });
        }
        
        // Player menu options
        const showLeaderboard = document.getElementById('show-leaderboard');
        if (showLeaderboard) {
            showLeaderboard.addEventListener('click', () => {
                if (game) {
                    game.showLeaderboardModal();
                }
                playerMenu?.classList.remove('active');
            });
        }
        
        const showPlayerStats = document.getElementById('show-player-stats');
        if (showPlayerStats) {
            showPlayerStats.addEventListener('click', () => {
                if (game) {
                    game.showPlayerStatsModal();
                }
                playerMenu?.classList.remove('active');
            });
        }
        
        const saveGame = document.getElementById('save-game');
        if (saveGame) {
            saveGame.addEventListener('click', () => {
                if (game) {
                    game.showSaveGameModal();
                }
                playerMenu?.classList.remove('active');
            });
        }
        
        // Governance button
        const governanceBtn = document.getElementById('governance-btn');
        if (governanceBtn) {
            governanceBtn.addEventListener('click', () => {
                if (game && game.governanceSystem) {
                    game.governanceSystem.openGovernanceModal();
                }
                playerMenu?.classList.remove('active');
            });
        }
        
        // Market dashboard button
        const openMarketDashboard = document.getElementById('open-market-dashboard');
        if (openMarketDashboard) {
            openMarketDashboard.addEventListener('click', () => {
                const modal = document.getElementById('market-dashboard-modal');
                if (modal) {
                    modal.style.display = 'block';
                    if (game) {
                        game.updateMarketDashboard();
                    }
                }
                playerMenu?.classList.remove('active');
            });
        }
        
        // Magic link button
        const magicLinkBtn = document.getElementById('magic-link-btn');
        if (magicLinkBtn) {
            magicLinkBtn.addEventListener('click', () => {
                const emailInput = document.getElementById('player-email');
                const email = emailInput?.value;
                
                if (email) {
                    // Send magic link (placeholder for now)
                    console.log('Sending magic link to:', email);
                    
                    // Update button state
                    magicLinkBtn.textContent = 'Link Sent!';
                    magicLinkBtn.disabled = true;
                    
                    setTimeout(() => {
                        magicLinkBtn.textContent = 'Send Magic Link';
                        magicLinkBtn.disabled = false;
                    }, 3000);
                }
            });
        }
    }
    
    /**
     * Setup layer control event listeners
     */
    setupLayerControls(game) {
        const layerOptions = document.querySelectorAll('.layer-option');
        
        layerOptions.forEach(option => {
            if (!option.dataset.listenerAdded) {
                option.addEventListener('click', (e) => {
                    e.preventDefault();
                    const layerName = option.dataset.layer;
                    
                    if (game && layerName) {
                        game.switchToLayer(layerName);
                        // Close dropdown after selection
                        const cityMenu = document.getElementById('city-menu');
                        if (cityMenu) {
                            cityMenu.classList.remove('active');
                        }
                    }
                });
                option.dataset.listenerAdded = 'true';
            }
        });
    }
    
    /**
     * Setup keyboard shortcut event listeners
     */
    setupKeyboardShortcuts(game) {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            switch(e.key) {
                case 'g':
                case 'G':
                    if (game && game.governanceSystem) {
                        e.preventDefault();
                        game.governanceSystem.openGovernanceModal();
                    }
                    break;
                case 'Escape':
                    // Close any open modals or menus
                    const playerMenu = document.getElementById('player-menu');
                    if (playerMenu) {
                        playerMenu.classList.remove('active');
                    }
                    break;
            }
        });
    }
    
    /**
     * Setup tool button event listeners
     */
    setupToolButtons(game) {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            if (!btn.dataset.listenerAdded) {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    if (game) {
                        game.currentTool = btn.dataset.tool;
                    }
                });
                btn.dataset.listenerAdded = 'true';
            }
        });
    }
    
    /**
     * Setup window resize handler
     */
    setupWindowResize(game) {
        window.addEventListener('resize', () => {
            if (game && game.resizeCanvas) {
                game.resizeCanvas();
            }
        });
    }
    
    /**
     * Make draggable element
     */
    makeDraggable(element) {
        const handle = element.querySelector('.draggable-handle');
        if (!handle) return;
        
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            element.style.position = 'absolute';
            element.style.zIndex = '1000';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    /**
     * Show notification
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Disabled - no toast notifications
        return;
    }
    
    /**
     * Show insufficient funds effect
     */
    showInsufficientFundsEffect() {
        const cashDisplay = document.querySelector('#city-treasury');
        if (cashDisplay) {
            cashDisplay.classList.add('insufficient-funds-blink');
            setTimeout(() => cashDisplay.classList.remove('insufficient-funds-blink'), 1500);
        }
        
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.classList.add('insufficient-funds-blink');
            setTimeout(() => contextMenu.classList.remove('insufficient-funds-blink'), 1500);
        }
        
        // If there's a modal open, apply to it
        const openModal = document.querySelector('.modal[style*="block"]');
        if (openModal) {
            openModal.classList.add('insufficient-funds-blink');
            setTimeout(() => openModal.classList.remove('insufficient-funds-blink'), 1500);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}

// Global modal functions for backward compatibility
if (typeof window !== 'undefined') {
    window.showModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('visible');
        }
    };
    
    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('visible');
        }
    };
}