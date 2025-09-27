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
            routeModal: 'route-modal',
            cashflowModal: 'cashflow-menu',

            // DCF Interface
            cashflowItem: 'cashflow-item',
            closeCashflowBtn: 'close-cashflow',
            
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

        // DCF functionality will be setup later when game instance is available

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
    /**
     * Create data insights overlay for building analysis
     * @param {number} row - Row position of the building
     * @param {number} col - Column position of the building
     * @param {Object} parcel - Parcel data
     * @param {Object} game - Game instance for calculations
     */
    createDataInsightsOverlay(row, col, parcel, game) {
        // Remove any existing overlay
        const existingOverlay = document.getElementById('data-insights-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        const building = game.buildingManager.getBuildingById(parcel.building);
        const stats = game.calculateBuildingEconomics(parcel, row, col);
        const coord = game.getParcelCoordinate(row, col);

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'data-insights-overlay';
        overlay.className = 'data-insights-overlay';

        let content = `
            <div class="insights-header">
                <h3>${building.name} - ${coord}</h3>
                <button class="close-btn" onclick="document.getElementById('data-insights-overlay').remove()">×</button>
            </div>

            <div class="insights-content">
                <div class="insights-section">
                    <h4>💰 Economic Performance</h4>
                    <div class="data-grid">
                        <div class="data-item">
                            <span class="label">Base Revenue:</span>
                            <span class="value">$${building.economics?.maxRevenue || 0}/day</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Actual Revenue:</span>
                            <span class="value ${stats.revenue >= (building.economics?.maxRevenue || 0) * 0.8 ? 'good' : 'poor'}">$${stats.revenue.toFixed(2)}/day</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Revenue Efficiency:</span>
                            <span class="value">${building.economics?.maxRevenue ? Math.round((stats.revenue / building.economics.maxRevenue) * 100) : 0}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Base Maintenance:</span>
                            <span class="value">$${building.economics?.maintenanceCost || 0}/day</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Actual Maintenance:</span>
                            <span class="value">$${stats.maintenance.toFixed(2)}/day</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Land Value Tax:</span>
                            <span class="value">$${stats.lvt.toFixed(2)}/day</span>
                        </div>
                        <div class="data-item total">
                            <span class="label">Net Daily Profit:</span>
                            <span class="value ${stats.revenue - stats.maintenance - stats.lvt >= 0 ? 'good' : 'poor'}">$${(stats.revenue - stats.maintenance - stats.lvt).toFixed(2)}/day</span>
                        </div>
                    </div>
                </div>
        `;

        // Performance multipliers section
        if (building.economics?.maxRevenue > 0) {
            const decay = parcel.decay || 0;
            const decayMultiplier = Math.max(0, 1 - decay);
            const satisfaction = game.citySatisfaction?.overall || 0.5;
            const satisfactionMultiplier = 0.5 + satisfaction * 0.7;
            const efficiencyPenalty = game.buildingEfficiencyPenalty || 1.0;
            const growthModifier = game.populationGrowthModifier || 1.0;

            // Transport connectivity
            let transportMultiplier = 1.0;
            let transportType = '';
            if (game.buildingCategories.isEnergyProducer(building)) {
                const hasRoadConnectivity = game.checkRoadConnectivity(row, col);
                transportMultiplier = hasRoadConnectivity ? 1.0 : 0.2;
                transportType = 'Road Connectivity';
            } else if (game.buildingCategories.needsTransportAccess(building)) {
                const accessiblePop = game.calculateAccessiblePopulation(row, col);
                const optimalPop = building.jobs ? building.jobs * 10 : 100;
                transportMultiplier = Math.max(0.1, Math.min(1.0, accessiblePop / optimalPop));
                transportType = 'Population Access';
            }

            content += `
                <div class="insights-section">
                    <h4>📊 Performance Multipliers</h4>
                    <div class="data-grid">
                        <div class="data-item">
                            <span class="label">Building Condition:</span>
                            <span class="value ${decayMultiplier >= 0.9 ? 'good' : decayMultiplier >= 0.7 ? 'ok' : 'poor'}">${Math.round(decayMultiplier * 100)}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">City Satisfaction:</span>
                            <span class="value ${satisfactionMultiplier >= 0.9 ? 'good' : satisfactionMultiplier >= 0.7 ? 'ok' : 'poor'}">${Math.round(satisfactionMultiplier * 100)}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">${transportType}:</span>
                            <span class="value ${transportMultiplier >= 0.9 ? 'good' : transportMultiplier >= 0.5 ? 'ok' : 'poor'}">${Math.round(transportMultiplier * 100)}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Market Conditions:</span>
                            <span class="value">${Math.round((game.supplyDemandEffects?.businessEfficiency || 1.0) * 100)}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Economic Stability:</span>
                            <span class="value">${Math.round(efficiencyPenalty * 100)}%</span>
                        </div>
                        <div class="data-item">
                            <span class="label">Population Growth:</span>
                            <span class="value">${Math.round(growthModifier * 100)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Building details section
        const age = Math.floor(parcel.buildingAge || 0);
        const decayPercent = Math.round((parcel.decay || 0) * 100);
        const repairCost = game.calculateRepairCost(parcel, building);

        content += `
            <div class="insights-section">
                <h4>🏗️ Building Details</h4>
                <div class="data-grid">
                    <div class="data-item">
                        <span class="label">Age:</span>
                        <span class="value">${age} days</span>
                    </div>
                    <div class="data-item">
                        <span class="label">Wear & Tear:</span>
                        <span class="value ${decayPercent < 25 ? 'good' : decayPercent < 50 ? 'ok' : 'poor'}">${decayPercent}%</span>
                    </div>
                    <div class="data-item">
                        <span class="label">Repair Cost:</span>
                        <span class="value">$${repairCost.toFixed(2)}</span>
                    </div>
                    <div class="data-item">
                        <span class="label">Category:</span>
                        <span class="value">${building.category}</span>
                    </div>
                    <div class="data-item">
                        <span class="label">Build Cost:</span>
                        <span class="value">$${building.economics?.buildCost || 0}</span>
                    </div>
                    <div class="data-item">
                        <span class="label">Land Value:</span>
                        <span class="value">$${parcel.landValue?.paidPrice || 0}</span>
                    </div>
                </div>
            </div>
        `;

        // Resource needs section
        if (building.resources || building.population) {
            content += `
                <div class="insights-section">
                    <h4>🔄 Resource Needs & Output</h4>
                    <div class="data-grid">
            `;

            if (building.resources?.energyDemand > 0) {
                content += `<div class="data-item"><span class="label">Energy Demand:</span><span class="value">${building.resources.energyDemand}</span></div>`;
            }
            if (building.resources?.foodDemand > 0) {
                content += `<div class="data-item"><span class="label">Food Demand:</span><span class="value">${building.resources.foodDemand}</span></div>`;
            }
            if (building.resources?.energyProduction > 0) {
                content += `<div class="data-item"><span class="label">Energy Production:</span><span class="value">${building.resources.energyProduction}</span></div>`;
            }
            if (building.resources?.foodProduction > 0) {
                content += `<div class="data-item"><span class="label">Food Production:</span><span class="value">${building.resources.foodProduction}</span></div>`;
            }
            if (building.population?.jobsCreated > 0) {
                content += `<div class="data-item"><span class="label">Jobs Created:</span><span class="value">${building.population.jobsCreated}</span></div>`;
            }
            if (building.population?.populationRequired > 0) {
                content += `<div class="data-item"><span class="label">Workers Needed:</span><span class="value">${building.population.populationRequired}</span></div>`;
            }
            if (building.population?.bedroomsAdded > 0) {
                content += `<div class="data-item"><span class="label">Housing Provided:</span><span class="value">${building.population.bedroomsAdded}</span></div>`;
            }

            content += `
                    </div>
                </div>
            `;
        }

        content += `
            </div>
        `;

        overlay.innerHTML = content;

        // Add to sidebar
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) {
            sidebar.appendChild(overlay);
        }
    }

    /**
     * Update governance UI with current voting and budget information
     * @param {Object} game - Game instance for governance data access
     */
    updateGovernanceUI(game) {
        // Update voting points (using new unified system)
        const playerAllocations = game.governance.playerAllocations || {};
        let usedPoints = 0;

        // Update budget categories
        game.governance.budgetCategories.forEach(category => {
            const categoryEl = document.querySelector(`[data-category="${category}"]`);
            if (categoryEl) {
                const voteCount = playerAllocations[category] || 0;
                usedPoints += voteCount;

                const voteCountEl = categoryEl.querySelector('.vote-count');
                if (voteCountEl) {
                    voteCountEl.textContent = voteCount;
                }

                // Remove all player-allocated classes first
                for (let i = 1; i <= 10; i++) {
                    categoryEl.classList.remove(`player-allocated-${i}`);
                }

                // Add appropriate class if player has allocated points
                if (voteCount > 0) {
                    const classNum = Math.min(voteCount, 10); // Cap at 10 for CSS classes
                    categoryEl.classList.add(`player-allocated-${classNum}`);
                }

                const allocationEl = categoryEl.querySelector('.category-allocation');
                if (allocationEl) {
                    const allocation = (game.governance.categoryAllocations && game.governance.categoryAllocations[category]) || 0;
                    allocationEl.textContent = `${(allocation * 100).toFixed(1)}%`;
                }

                // Update coffers display with new governance system
                const coffersEl = categoryEl.querySelector('.category-coffers span');
                if (coffersEl && game.governanceSystem) {
                    if (category === 'ubi') {
                        const ubiAmount = game.governanceSystem.governance.allocations[category] || 0;
                        const ubiPerCitizen = ubiAmount / Math.max(1, game.calculatePopulation());
                        coffersEl.textContent = ubiPerCitizen.toFixed(2);
                    } else {
                        const cofferAmount = game.governanceSystem.governance.allocations[category] || 0;
                        coffersEl.textContent = cofferAmount.toLocaleString();
                    }
                }
            }
        });

        // Add LVT points to total used points
        const lvtPoints = Math.abs(game.governance.playerAllocations?.lvtRate || 0);
        usedPoints += lvtPoints;

        // Update LVT rate info - with null checks
        const currentLvtRateEl = document.getElementById('current-lvt-rate');
        if (currentLvtRateEl) {
            currentLvtRateEl.textContent = `${(game.governance.currentLvtRate * 100).toFixed(0)}%`;
        }

        const currentLvtDisplayEl = document.getElementById('current-lvt-display');
        if (currentLvtDisplayEl) {
            currentLvtDisplayEl.textContent = `${(game.governance.currentLvtRate * 100).toFixed(0)}%`;
        }

        const proposedLvtRateEl = document.getElementById('proposed-lvt-rate');
        if (proposedLvtRateEl) {
            proposedLvtRateEl.textContent = `${(game.governance.proposedLvtRate * 100).toFixed(0)}%`;
        }

        // Update LVT point allocation (old system - keeping for compatibility)
        const lvtVotePointsElOld = document.getElementById('lvt-vote-points-old');
        if (lvtVotePointsElOld) {
            lvtVotePointsElOld.textContent = game.governance.playerAllocations?.lvtRate || 0;
        }

        // Update monthly collection
        const monthlyLvtAmountEl = document.getElementById('monthly-lvt-amount');
        if (monthlyLvtAmountEl) {
            monthlyLvtAmountEl.textContent = game.governance.monthlyLvtCollected.toLocaleString();
        }

        // Update unallocated funds display
        const unallocatedFundsAmountEl = document.getElementById('unallocated-funds-amount');
        if (unallocatedFundsAmountEl) {
            unallocatedFundsAmountEl.textContent = (game.governance.unallocatedFunds || 0).toLocaleString();
        }

        // Update vote summary with new unified system
        const pointsUsedEl = document.getElementById('points-used');
        const totalAllocated = game.getTotalAllocatedPoints();
        if (pointsUsedEl) {
            pointsUsedEl.textContent = totalAllocated;
        }

        const pointsAvailableEl = document.getElementById('points-available');
        if (pointsAvailableEl) {
            pointsAvailableEl.textContent = game.governance.totalVotingPoints;
        }

        const playerVotingPointsEl = document.getElementById('player-voting-points');
        if (playerVotingPointsEl) {
            const unallocatedPoints = game.getUnallocatedPoints();
            console.log(`🗳️ Updating UI: Total=${game.governance.totalVotingPoints}, Used=${game.getTotalAllocatedPoints()}, Available=${unallocatedPoints}`);
            playerVotingPointsEl.textContent = unallocatedPoints;
        }

        // Update LVT display (show absolute value for points used)
        const lvtVotePointsEl = document.getElementById('lvt-vote-points');
        if (lvtVotePointsEl) {
            const lvtPoints = game.governance.playerAllocations.lvtRate || 0;
            lvtVotePointsEl.textContent = Math.abs(lvtPoints);

            // Add visual indicator if player has allocated LVT points
            const lvtAdjuster = document.querySelector('.lvt-adjuster');
            if (lvtAdjuster) {
                if (lvtPoints !== 0) {
                    lvtAdjuster.classList.add('player-allocated');
                } else {
                    lvtAdjuster.classList.remove('player-allocated');
                }
            }
        }
    }

    /**
     * Generate comprehensive player statistics
     * @param {Object} game - Game instance for data access
     * @returns {Object} Player statistics object
     */
    generatePlayerStats(game) {
        const netWorth = game.calculatePlayerNetWorth();
        const population = game.calculatePopulation();
        const totalWealth = 0; // ELIMINATED: Client-side wealth calculation blocked

        // Count player-owned parcels and buildings
        let ownedParcels = 0;
        let ownedBuildings = 0;
        let buildingsByCategory = {};

        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                const parcel = game.grid[row][col];
                if (parcel && game.isCurrentPlayer(parcel.owner)) {
                    ownedParcels++;
                    if (parcel.building) {
                        ownedBuildings++;
                        const building = game.buildingManager?.getBuildingById(parcel.building);
                        if (building) {
                            const category = building.category || 'other';
                            buildingsByCategory[category] = (buildingsByCategory[category] || 0) + 1;
                        }
                    }
                }
            }
        }

        // Calculate current cashflow
        const cashflow = game.calculateCurrentCashflow();

        return {
            netWorth: {
                title: 'Net Worth',
                value: `$${netWorth.toLocaleString()}`,
                subtitle: 'Cash + Assets'
            },
            cash: {
                title: 'Current Cash',
                value: `$${Math.round(game.playerCash).toLocaleString()}`,
                subtitle: 'Available funds'
            },
            cashflow: {
                title: 'Daily Cashflow',
                value: cashflow >= 0 ? `+$${Math.round(cashflow).toLocaleString()}` : `-$${Math.abs(Math.round(cashflow)).toLocaleString()}`,
                subtitle: 'Revenue - expenses'
            },
            parcels: {
                title: 'Owned Parcels',
                value: ownedParcels.toString(),
                subtitle: `Out of ${game.gridSize * game.gridSize} total`
            },
            buildings: {
                title: 'Buildings',
                value: ownedBuildings.toString(),
                subtitle: 'Constructed & operational'
            },
            population: {
                title: 'Population',
                value: population.toLocaleString(),
                subtitle: 'City residents'
            },
            playTime: {
                title: 'Play Time',
                value: this.getPlayTimeString(game),
                subtitle: 'Current session'
            },
            gameDate: {
                title: 'Game Date',
                value: `${game.gameDate.month} ${game.gameDate.day}`,
                subtitle: 'In-game calendar'
            }
        };
    }

    /**
     * Get formatted play time string
     * @param {Object} game - Game instance for play time data
     * @returns {string} Formatted play time
     */
    getPlayTimeString(game) {
        if (!game.gameStartTime) return '0m';

        const elapsed = Date.now() - game.gameStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    }

    /**
     * Setup DCF (Daily Cash Flow) interactive functionality
     * Integrates with existing tooltip and modal systems
     */
    setupCashflowMenu(game) {
        if (!this.elements.cashflowItem || !this.elements.cashflowModal || !this.elements.closeCashflowBtn) {
            console.warn('DCF elements not found in UIManager cache');
            return;
        }

        const cashflowItem = this.elements.cashflowItem;
        const cashflowModal = this.elements.cashflowModal;
        const closeCashflowBtn = this.elements.closeCashflowBtn;

        // Show modal on click
        cashflowItem.addEventListener('click', () => {
            this.showCashflowModal(game);
        });

        // Show tooltip on hover
        let hoverTimeout;
        cashflowItem.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                this.showCashflowTooltip(game, cashflowItem);
            }, 300);
        });

        cashflowItem.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimeout);
            this.hideCashflowTooltip(game);
        });

        // Close modal
        closeCashflowBtn.addEventListener('click', () => {
            this.hideCashflowModal();
        });

        // Close on backdrop click
        cashflowModal.addEventListener('click', (e) => {
            if (e.target.id === 'cashflow-menu') {
                this.hideCashflowModal();
            }
        });

        console.log('✅ DCF functionality initialized in UIManager');
    }

    /**
     * Show cashflow tooltip using game's tooltip system
     */
    showCashflowTooltip(game, element) {
        if (!game || !game.tooltipManager) return;

        console.log('🔍 DCF Tooltip called - checking data sources:', {
            dailyCashflowTotals: game.dailyCashflowTotals,
            topBarElement: document.getElementById('player-cashflow')?.textContent,
            cache: game.cache?.cashflowBreakdown,
            economicClient: game.economicClient?.isConnected || false
        });

        // Use the same exact check as the top bar
        if (game.dailyCashflowTotals) {
            const totals = game.dailyCashflowTotals;
            console.log('✅ Using dailyCashflowTotals:', totals);

        const tooltipContent = `
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 200px;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">Revenue:</span>
                    <span style="color: #4CAF50; font-weight: 600;">$${Math.round(totals.revenue || 0).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">Maintenance:</span>
                    <span style="color: #F44336; font-weight: 600;">-$${Math.round(Math.abs(totals.maintenance || 0)).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">LVT:</span>
                    <span style="color: #F44336; font-weight: 600;">-$${Math.round(Math.abs(totals.lvt || 0)).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #444; padding-top: 4px; margin-top: 4px;">
                    <span style="color: #ccc; font-weight: 600;">Net Daily:</span>
                    <span style="color: ${(totals.netCashflow || 0) >= 0 ? '#FFD700' : '#F44336'}; font-weight: 700;">$${Math.round(totals.netCashflow || 0).toLocaleString()}</span>
                </div>
            </div>
        `;

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.bottom + 10;

            game.tooltipManager.show(tooltipContent, x, y, {
                html: true,
                delay: 0,
                maxWidth: 250
            });
        } else {
            console.warn('❌ No dailyCashflowTotals available for tooltip');
        }
    }

    /**
     * Hide cashflow tooltip
     */
    hideCashflowTooltip(game) {
        if (game && game.tooltipManager) {
            game.tooltipManager.hide();
        }
    }

    /**
     * Show cashflow modal with detailed breakdown
     */
    showCashflowModal(game) {
        if (!this.elements.cashflowModal) return;

        // Show modal immediately
        this.elements.cashflowModal.classList.add('visible');

        // Add small delay to ensure async data is available before populating
        setTimeout(() => {
            this.populateCashflowData(game);
        }, 50);
    }

    /**
     * Hide cashflow modal
     */
    hideCashflowModal() {
        if (this.elements.cashflowModal) {
            this.elements.cashflowModal.classList.remove('visible');
        }
    }

    /**
     * Populate cashflow modal with current data
     * Uses existing player stats generation and calculations
     */
    populateCashflowData(game) {
        // Trigger async cashflow calculation to ensure data is fresh
        game.calculateCurrentCashflow();

        // Use the same data source as the top bar display for consistency
        const totals = game.dailyCashflowTotals || { revenue: 0, maintenance: 0, lvt: 0, netCashflow: 0 };
        const breakdown = game.cashflowBreakdown || [];

        console.log('🔍 DCF Modal Debug:', {
            dailyCashflowTotals: game.dailyCashflowTotals,
            totals: totals,
            breakdown: breakdown,
            cache: game.cache?.cashflowBreakdown,
            currentCashflowPreview: game.currentCashflowPreview
        });

        // Update modal title to show current player
        const modalTitle = document.querySelector('.cashflow-modal h3');
        if (modalTitle) {
            const currentPlayer = window.currentCashflowPlayer || 'current';
            if (currentPlayer === 'current') {
                modalTitle.textContent = 'DAILY CASHFLOW';
            } else {
                const playerData = game.gameState?.players?.[currentPlayer];
                const playerName = playerData?.name || `Player ${currentPlayer.slice(-4)}`;
                modalTitle.textContent = `DAILY CASHFLOW - ${playerName.toUpperCase()}`;
            }
        }

        // Update summary with safe rounding
        document.getElementById('total-revenue').textContent = `$${Math.round(totals.revenue || 0).toLocaleString()}`;
        document.getElementById('total-maintenance').textContent = `-$${Math.round(Math.abs(totals.maintenance || 0)).toLocaleString()}`;
        document.getElementById('total-lvt').textContent = `-$${Math.round(Math.abs(totals.lvt || 0)).toLocaleString()}`;

        const netDaily = Math.round(totals.netCashflow || 0);
        const netElement = document.getElementById('net-daily');
        netElement.textContent = netDaily >= 0 ? `+$${netDaily.toLocaleString()}` : `-$${Math.abs(netDaily).toLocaleString()}`;
        netElement.className = `summary-value ${netDaily >= 0 ? 'positive' : 'negative'}`;

        // Update table
        const tbody = document.getElementById('cashflow-tbody');
        tbody.innerHTML = '';

        breakdown.forEach(item => {
            const row = document.createElement('tr');

            const formatCurrency = (value) => {
                const rounded = Math.round(value);
                return rounded >= 0 ? `$${rounded.toLocaleString()}` : `-$${Math.abs(rounded).toLocaleString()}`;
            };

            const getValueClass = (value) => {
                return Math.round(value) > 0 ? 'positive' : Math.round(value) < 0 ? 'negative' : 'neutral';
            };

            row.innerHTML = `
                <td>${item.coordinates || 'N/A'}</td>
                <td>${item.buildingName || 'Unknown'}</td>
                <td>${Math.floor(item.buildingAge || 0)} days</td>
                <td>${item.decay ? item.decay.toFixed(1) + '%' : 'N/A'}</td>
                <td>$${Math.round(item.landValue || 0).toLocaleString()}</td>
                <td class="${getValueClass(item.revenue || 0)}">${formatCurrency(item.revenue || 0)}</td>
                <td class="${getValueClass(-(item.maintenance || 0))}">${formatCurrency(-(item.maintenance || 0))}</td>
                <td class="${getValueClass(-(item.lvt || 0))}">${formatCurrency(-(item.lvt || 0))}</td>
                <td class="${getValueClass(item.netCashflow || 0)}">${formatCurrency(item.netCashflow || 0)}</td>
            `;

            tbody.appendChild(row);
        });
    }
}

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