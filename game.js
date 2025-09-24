
class IsometricGrid {
    constructor(canvas, gridSize = 12) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = gridSize;
        this.selectedTile = null;
        this.currentTool = 'grass';
        this.contextMenu = document.getElementById('context-menu');
        
        // Initialize state management system
        this.gameState = new GameState(this);
        
        
        
        // Initialize UI Manager for DOM caching
        this.uiManager = new UIManager();
        
        // Initialize Building System
        this.buildingSystem = new BuildingSystem(this);
        
        // Initialize Economic Engine (needed for client-side wealth calculation)
        this.economicEngine = new EconomicEngine(this);
        this.performanceEngine = new EconomicPerformanceEngine(this);

        // Initialize Server-Side Economic API
        this.economicAPI = new ClientEconomicAPI();

        // Initialize economic data structures with safe defaults
        this.initializeEconomicDefaults();
        
        // Initialize Rendering System
        this.renderingSystem = new RenderingSystem(this);

        // Initialize Building Visual Feedback System
        this.buildingVisualFeedback = new BuildingVisualFeedback(this);

        // Initialize Smart Tooltip System
        this.smartTooltipSystem = new SmartTooltipSystem(this);

        // Initialize Parcel Selection System
        this.parcelSelector = new ParcelSelectorManager(this);

        // Initialize Governance System - SINGLE SOURCE OF TRUTH
        this.governanceSystem = new GovernanceSystem(this);

        // Define legacy governance/budget proxies that delegate to GovernanceSystem
        Object.defineProperty(this, 'cityTreasury', {
            get: function() {
                return this.governanceSystem ? this.governanceSystem.governance.treasuryBalance : 0;
            },
            set: function(value) {
                console.warn('⚠️ Direct cityTreasury assignment blocked - use GovernanceSystem instead');
                console.trace();
            }
        });

        Object.defineProperty(this, 'totalBudget', {
            get: function() {
                return this.governanceSystem ? this.governanceSystem.governance.totalBudget : 0;
            },
            set: function(value) {
                console.warn('⚠️ Direct totalBudget assignment blocked - use GovernanceSystem instead');
                console.trace();
            }
        });

        // Initialize Auction System
        this.auctionSystem = new AuctionSystem(this);

        // Initialize crisp tooltip system
        this.crispTooltip = new CrispTooltip(this);

        // Initialize unified tooltip manager
        this.tooltipManager = new TooltipManager(this);

        // Initialize context menu system
        this.contextMenuSystem = new ContextMenuSystem(this);

        // Mobility tooltip timer
        this.mobilityTooltipTimer = null;
        
        // Performance optimizations
        this.isRenderScheduled = false;
        this.lastRenderTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Performance caching system
        this.landValueCache = new Map(); // Cache calculated land values
        this.accessibilityCache = new Map(); // Cache accessibility scores
        this.dirtyRegions = new Set(); // Track regions that need recalculation
        this.selectedStreetEdges = new Set(); // Track selected street edges for mobility layer
        this.lastCacheUpdate = 0; // Track when caches were last cleared
        
        // Event throttling
        this.throttleTimeout = null;
        this.lastMouseMoveTime = 0;
        this.pendingMouseUpdate = false;
        this.lastMousePosition = { x: 0, y: 0 };
        this.lastMouseEvent = { clientX: 0, clientY: 0 };
        
        
        // Economic calculation caching
        this.economicCache = {
            buildingStats: new Map(), // Key: "row-col", Value: {revenue, maintenance, lvt, buildingName, decay, age}
            playerParcels: new Set(), // Track which parcels are player-owned
            lastUpdate: 0,
            dirty: new Set() // Only recalculate changed buildings
        };
        
        // Standardized building category mapping
        this.buildingCategories = {
            // Normalize case and naming differences between CSV and code
            normalize: (category) => {
                const mapping = {
                    'Utilities': 'utilities',
                    'utilities': 'utilities',
                    'infrastructure': 'utilities',
                    'Housing': 'housing', 
                    'housing': 'housing',
                    'residential': 'housing',
                    'Commercial': 'commercial',
                    'commercial': 'commercial',
                    'Education': 'education',
                    'education': 'education',
                    'Civic': 'culture',
                    'culture': 'culture',
                    'Recreation': 'recreation',
                    'recreation': 'recreation',
                    'Healthcare': 'healthcare',
                    'healthcare': 'healthcare',
                    'office': 'commercial', // Treat office as commercial
                    'industrial': 'commercial', // Treat industrial as commercial  
                    'mixed': 'commercial' // Treat mixed as commercial
                };
                return mapping[category] || category.toLowerCase();
            },
            
            // Check if a building is an energy producer
            isEnergyProducer: (building) => {
                return (building.resources?.energyProvided || 0) > (building.resources?.energyRequired || 0);
            },
            
            // Check if a building needs transport accessibility for revenue
            needsTransportAccess: (building) => {
                const normalizedCategory = this.buildingCategories.normalize(building.category);
                return (normalizedCategory === 'commercial' || normalizedCategory === 'education') 
                       && !this.buildingCategories.isEnergyProducer(building);
            },
            
            // Check if a building needs road connectivity (different from population access)
            needsRoadConnectivity: (building) => {
                // Energy producers need roads for power distribution
                // Commercial/education buildings need roads for customer/worker access
                const normalizedCategory = this.buildingCategories.normalize(building.category);
                return this.buildingCategories.isEnergyProducer(building) || 
                       normalizedCategory === 'commercial' || 
                       normalizedCategory === 'education';
            }
        };
        
        // Vitality calculation caching
        this.vitalityCache = {
            supply: {},
            demand: {},
            netVitality: {},
            lastCalculated: 0,
            dirty: true, // Track if recalculation needed
            dirtyBuildings: new Set() // Track which buildings changed
        };
        
        // Building efficiency tracking for JEFH analysis
        this.buildingEfficiencies = new Map();
        
        // JEFH warning indicators (static, no animation)
        // Performance: removed animation for better frame rates
        
        // Prerequisite checking cache
        this.prereqCache = {
            availableBuildings: new Set(), // Buildings currently in the city
            lastUpdate: 0,
            dirty: true
        };
        
        // DOM element caching for performance
        this.domCache = {
            selectedTile: null,
            gameDate: null,
            playerCash: null,
            playerWealth: null,
            cityName: null,
            totalResidents: null
        };
        
        // City vitality tracking
        this.vitality = {
            ENERGY: 0,
            FOOD: 0,
            HOUSING: 0,
            MOBILITY: 0,
            JOBS: 0,
            EDUCATION: 0,
            HEALTH: 0,
            SAFETY: 0,
            CULTURE: 0,
            ENVIRONMENT: 0,
            AFFORDABILITY: 0,
            NOISE: 0,
            RESILIENCE: 0
        };

        // Game time and player stats
        this.gameStartTime = Date.now();

        // Initialize cash management system - SINGLE SOURCE OF TRUTH
        this.cashManager = new CashManager(this);

        // Legacy cityTreasury removed - now using governanceSystem.totalBudget
        console.log('💰 CashManager initialized');

        // Define playerCash as getter/setter that delegates to CashManager
        Object.defineProperty(this, 'playerCash', {
            get: function() {
                return this.cashManager ? this.cashManager.getBalance() : 0;
            },
            set: function(value) {
                console.warn('⚠️ Direct playerCash assignment blocked - use CashManager instead');
                console.trace(); // Show where this is being called from
            }
        });
        this.gameDate = { month: 'SEPT', day: 2 }; // September 2nd start date
        
        // Start game time updates (1 year = 1 hour = 3600 seconds)
        // 1 day in game = 3600/365 = ~9.86 seconds real time
        this.dayLength = 3600000 / 365; // milliseconds per game day
        this.dayDuration = this.dayLength; // Alias for construction calculations
        this.currentDay = 0;

        // Building manager handles all building data
        this.buildingManager = window.buildingManager;
        
        // Economic multipliers for balance tuning
        this.economicMultipliers = {
            energy: 1.0,
            food: 1.0,
            housing: 1.0,
            jobs: 1.0,
            populationGrowthRate: 0.02,
            shortageThreshold: 0.8,
            oversupplyThreshold: 2.0,
            baseRevenue: 1.0,
            maintenance: 1.0
        };
        
        // Market elasticity and locality settings
        this.marketSettings = {
            elasticity: {
                energy: 0.3,    // Inelastic - essential
                food: 0.5,      // Somewhat inelastic
                housing: 0.7,   // More elastic
                jobs: 1.2       // Elastic
            },
            radius: {
                energy: 999,    // City-wide
                food: 5,        // Regional
                housing: 3,     // Neighborhood
                jobs: 4         // Commute distance
            },
            priceBounds: {
                min: 0.25,      // Minimum price multiplier
                max: 4.0        // Maximum price multiplier
            }
        };
        
        // Create a simple square grid
        this.grid = [];
        for (let row = 0; row < gridSize; row++) {
            this.grid[row] = [];
            for (let col = 0; col < gridSize; col++) {
                this.grid[row][col] = { 
                    type: 'grass', 
                    elevation: 0,
                    
                    // Transportation data - will be redesigned
                    owner: null, // null = unowned, 'player' = owned by player, 'competitor1', etc.
                    building: null,
                    buildingAge: 0, // Days since building was constructed
                    constructionStartDay: null, // Day when construction began
                    constructionDays: 0, // Total days needed for construction
                    decay: 0, // Decay level (0-1, where 1 is fully decayed)
                    amenities: [], // Array of amenity objects
                    landValue: {
                        paidPrice: 0, // Amount paid in purchase/auction
                        calculatedValue: 0, // Game state calculated value
                        lastAuctionDay: 0, // Day of last auction
                        auctionThreshold: 0.3 // Trigger auction when calc value differs by this much
                    }
                };
            }
        }
        
        // Clean slate - all parcels start unowned
        
        // Edge parcels system - buildable spaces on grid lines
        this.initializeEdgeParcels();
        
        // Parcel selection and visualization
        this.hoveredTile = null; // {row, col} of currently hovered tile
        this.selectedParcel = null; // Currently selected parcel for reach display
        this.parcelReach = null; // Cached reach calculation for selected parcel
        this.hoverInfluenceRadius = null; // Set of tiles influenced by hover
        
        // Transportation System - Clean slate
        this.transportationSystem = new TransportationSystem(this);

        // Transport capacity modeling
        this.transportCapacitySystem = new TransportCapacitySystem(this);

        // Mobility Layer - New visualization system
        this.mobilityLayer = new MobilityLayer(this);
        
        // Parcel selector fade system
        this.hoverStartTime = null; // When current hover began
        this.selectorOpacity = 1.0; // Current opacity of white diamond selector
        this.completionAnimations = new Map(); // Map of "row,col" -> animation data
        
        // Simple hover with bouncing ball physics
        this.hoverElevation = 10; // Target elevation for hovered buildings
        this.currentElevation = 0; // Current animated elevation
        this.bounceAnimation = null; // Animation ID
        this.elevationVelocity = 0; // Physics: velocity for bounce
        
        // Hover effect system (simplified, no blur)
        this.bobAmount = 0.5; // Bob amount in pixels
        this.bobSpeed = 0.009; // Bob animation speed
        this.liftAmount = 3; // Base elevation for hovered buildings
        
        this.constructionAnimations = new Set(); // Set of buildings currently animating construction
        this.lastDayStartTime = performance.now(); // Track when current day started
        this.pixelRowTimestamps = new Map(); // Track when each pixel row was revealed: "row,col" -> [timestamps]
        
        // Dust cloud effects for construction starts
        this.dustClouds = new Map(); // Track active dust clouds: key -> {startTime, duration, x, y, type}
        
        // Sub-menu hover management
        this.currentSubmenu = null; // Currently visible submenu element
        this.submenuTimer = null; // Timer for submenu hide delay
        
        // Map layer system
        this.currentLayer = 'normal'; // 'normal', 'landvalue', 'cashflow'
        this.landValueMode = 'estimated'; // 'estimated' or 'paid' - toggle for LV view
        
        // Auction system - now handled by AuctionSystem module
        
        
        // Competitor names
        this.competitorNames = {
            'competitor1': 'Red Corp',
            'competitor2': 'Blue Industries',
            'competitor3': 'Green Ventures',
            'competitor4': 'Orange Holdings',
            'competitor5': 'Purple Group',
            'competitor6': 'Teal Associates'
        };
        
        // Legacy governance object removed - now using GovernanceSystem class
        
        // Transportation building state
        this.selectedRoadType = 'local_street';
        this.isBuilding = false;
        this.buildStart = null;
        
        // Zoom and pan functionality
        this.zoomLevel = 0.4; // Default zoom at 1.1x (0.4 * 0.25 = 0.1 additional scale)
        this.zoomScale = 1.1; // 1.1x scale
        this.panOffset = { x: 0, y: 0 };
        this.isPanning = false;
        this.lastPanPoint = { x: 0, y: 0 };
        
        // Cashflow tracking
        this.cashflowBreakdown = [];
        this.dailyCashflowTotals = {
            revenue: 0,
            maintenance: 0,
            lvt: 0,
            netCashflow: 0
        };
        
        // Separate tracking for UI preview (doesn't overwrite real daily totals)
        this.currentCashflowPreview = {
            revenue: 0,
            maintenance: 0,
            lvt: 0,
            netCashflow: 0
        };

        // Attenuation visualization toggle for Data Insights overlay
        this.showAttenuationVisualization = false;
        
        // Initialize unified Action Manager
        this.actionManager = new ActionManager(this);
        
        this.setupCanvas();
        this.initDOMCache();
        this.populateBuildingCategories();
        this.setupEventListeners();
        this.setupZoomControls();
        this.setupLayerControls();
        
        // Initialize performance caches - mark all regions as dirty for first calculation
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                this.dirtyRegions.add(`${row}-${col}`);
            }
        }
        
        this.updateVitalityDisplay();
        this.updateDemographicsDisplay();
        this.calculateCurrentCashflow(); // Initialize cashflow data
        this.updatePlayerStats();
        this.updateActionDisplay(); // Initialize action display
        this.updateMonthCountdown(); // Initialize countdown
        // Transportation network starts empty - players build from scratch
        
        // Update countdown every second
        setInterval(() => {
            this.updateMonthCountdown();
            // Update auction timers (with safety check for initialization order)
            if (this.actionMarketplace && this.actionMarketplace.updateAuctionCountdowns) {
                this.actionMarketplace.updateAuctionCountdowns();
            }
            // Update building construction progress
            if (this.buildingSystem) {
                this.buildingSystem.ageBuildings();
                this.buildingSystem.updateConstructionProgress();
            }
        }, 1000);
        
        // Periodic sync removed - not needed for solo game
        
        // Initialize Action Marketplace
        this.actionMarketplace = new ActionMarketplace(this);

        // Multiplayer system removed for clean solo game
    }
    
    isCurrentPlayer(owner) {
        // Solo game - player always owns their own parcels
        return owner === 'player';
    }

    resetGameState() {
        
        // Clear grid state
        if (this.grid) {
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    if (this.grid[row] && this.grid[row][col]) {
                        // Reset parcel to default state
                        this.grid[row][col] = {
                            row: row,
                            col: col,
                            owner: null,
                            building: null,
                            landValue: {
                                paidPrice: 0,
                                calculatedValue: 100,
                                lastAuctionDay: 0
                            },
                            constructionStartDay: null,
                            constructionDays: 0,
                            _constructionProgress: 1.0,
                            _isUnderConstruction: false
                        };
                    }
                }
            }
        }
        
        // Reset player state
        this.currentPlayer = 1;
        this.playerSettings = null;
        
        // Clear any ongoing timers or animations
        if (this.gameTimeInterval) {
            clearInterval(this.gameTimeInterval);
            this.gameTimeInterval = null;
        }
        
        // Reset time state
        this.currentDay = 1;
        this.currentMonth = 'SEPT';
        this.gameSpeed = 1;
        this.isPaused = false;
        this.lastDayStartTime = performance.now();
        
        // Clear rendering caches
        this.dirtyRegions.clear();
        this.buildingEfficiencies?.clear();
        this.pixelRowTimestamps?.clear();
        
        // Clear mobility layer if it exists
        if (this.mobilityLayer) {
            this.mobilityLayer.roads?.clear();
            this.mobilityLayer.reset?.();
        }
        
        // Reset zoom and pan to default clean state
        this.zoomLevel = 0.4;
        this.zoomScale = 1.1;
        this.panOffset = { x: 0, y: 0 };
        
        // Update zoom buttons to reflect clean state
        if (this.updateZoomButtons) {
            this.updateZoomButtons();
        }
        
    }

    async startGame() {
        // Reset all game state for clean start
        this.resetGameState();
        
        // Initialize building system
        this.buildingSystem.initialize();
        
        // DISABLED: Legacy client-side economic engine - using server-authoritative system
        // this.economicEngine.reset();
        // this.economicEngine.initialize();
        
        // Initialize rendering system
        this.renderingSystem.initialize();
        
        // Reset and initialize governance system for new game
        this.governanceSystem.reset();
        this.governanceSystem.initialize();
        
        // Reset and initialize auction system for new game
        this.auctionSystem.reset();
        this.auctionSystem.initialize();
        
        this.startGameTime();
        this.scheduleRender();
        
        // Start construction animation manager
        this.startConstructionAnimationManager();
        
        // Start live tooltip updates for time-based tooltips
        this.startLiveTooltipUpdates();
        
        // Load existing player settings if available
        await this.loadPlayerSettings();
        
        // Update player button with current settings
        this.updatePlayerButton();

        // Initialize panel states - ensure players panel is collapsed by default
        this.initializePanelStates();

        // Initialize UI displays with current values
        this.updatePlayerStats();
        this.updateActionDisplay();
        this.updateMonthCountdown();
    }
    
    initializePanelStates() {
        // Hide players panel completely on game start (only shown on players layer)
        const playersSection = document.querySelector('[data-target="players-panel"]');
        if (playersSection) {
            const parentSection = playersSection.parentElement;
            if (parentSection) {
                parentSection.style.display = 'none';
            }
        }
        
        // Ensure vitality panel is open by default (main panel for normal layer)
        const vitalitySection = document.querySelector('[data-target="vitality"]');
        if (vitalitySection) {
            const parentSection = vitalitySection.parentElement;
            if (parentSection && parentSection.classList.contains('collapsed')) {
                this.openSidebarSection(parentSection);
            }
        }
    }
    
    
    async resetServerState() {
        if (!confirm('Reset server state? This will clear all multiplayer data including players, parcels, and marketplace listings.')) {
            return;
        }
        
        try {
            const response = await fetch('/api/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Server state reset successfully', 'success');
                
                // Solo game - no multiplayer state to reset
                
                // Clear mobility layer roads
                if (this.mobilityLayer) {
                    this.mobilityLayer.roads.clear();
                    this.mobilityLayer.transitStops.clear();
                    this.mobilityLayer.transitRoutes.clear();
                }
                
                // Clear local marketplace
                this.actionManager.marketplace = {
                    listings: [],
                    priceHistory: [],
                    avgPrice: 0,
                    nextListingId: 1
                };
                
                this.actionMarketplace.refreshListings();
                this.actionMarketplace.updateModal();
            } else {
                this.showNotification('Failed to reset server state', 'error');
            }
        } catch (error) {
            console.error('Reset server state error:', error);
            this.showNotification('Error resetting server state', 'error');
        }
    }
    
    async loadPlayerSettings() {
        try {
            const savedSettings = localStorage.getItem('theCommons_playerSettings');
            if (savedSettings && !this.playerSettings) {
                this.playerSettings = JSON.parse(savedSettings);
            }

            // Fetch player color from server to override local settings
            try {
                const response = await fetch('/api/players');
                if (response.ok) {
                    const data = await response.json();
                    const serverPlayer = data.players?.player || data.players?.[Object.keys(data.players)[0]];
                    if (serverPlayer && serverPlayer.color) {
                        // Update player settings with server color
                        if (!this.playerSettings) {
                            this.playerSettings = { name: 'Player', emoji: '🏛️' };
                        }
                        this.playerSettings.color = serverPlayer.color;
                        // Set CSS custom property for welcome underline
                        document.documentElement.style.setProperty('--player-color', serverPlayer.color);
                        // Update ParcelSelectorManager with new color
                        if (this.parcelSelector) {
                            this.parcelSelector.updatePlayerColor();
                        }
                        // Also save to localStorage for consistency
                        localStorage.setItem('theCommons_playerSettings', JSON.stringify(this.playerSettings));
                    }
                }
            } catch (serverError) {
                console.warn('Could not fetch player color from server:', serverError);
            }

            if (this.playerSettings) {
                this.updatePlayerNameInUI();
            }
        } catch (error) {
            console.error('Failed to load player settings:', error);
        }
    }
    
    updatePlayerButton() {
        const playerBtn = document.getElementById('player-btn');
        if (playerBtn) {
            const playerName = this.playerSettings?.name || 'PLAYER';
            playerBtn.innerHTML = `${playerName.toUpperCase()}<span class="indicator">⌄</span>`;
        }
    }

    updatePlayerNameInUI() {
        // Update player button
        this.updatePlayerButton();

        // Update cashflow modal player tab
        const playerTab = document.querySelector('[data-player="current"]');
        if (playerTab) {
            const playerName = this.playerSettings?.name || 'Player';
            playerTab.textContent = playerName;
        }

        // Update any other UI elements that should show player name
        const playerElements = document.querySelectorAll('.player-name-display');
        const playerName = this.playerSettings?.name || 'Player';
        playerElements.forEach(element => {
            element.textContent = playerName;
        });

        console.log('🎮 Updated player name in UI elements:', playerName);
    }
    
    
    
    // Street edge interaction methods
    // Street edge methods moved to TransportationSystem
    
    // Drawing methods moved to TransportationSystem
    
    



    getNeighborElevation(row, col, edge) {
        let neighborRow = row, neighborCol = col;
        
        switch (edge) {
            case 'northeast':
                neighborRow = row - 1;
                neighborCol = col + 1;
                break;
            case 'southeast':
                neighborRow = row + 1;
                neighborCol = col + 1;
                break;
            case 'southwest':
                neighborRow = row + 1;
                neighborCol = col - 1;
                break;
            case 'northwest':
                neighborRow = row - 1;
                neighborCol = col - 1;
                break;
        }
        
        // Check bounds and return elevation
        if (neighborRow >= 0 && neighborRow < this.gridSize && 
            neighborCol >= 0 && neighborCol < this.gridSize) {
            return this.grid[neighborRow][neighborCol].elevation || 0;
        }
        
        // Default elevation if out of bounds
        return 0;
    }
    
    // Road amenities drawing moved to TransportationSystem
    
    // Transit stops removed - will be redesigned from scratch
    
    // Cache frequently accessed DOM elements for performance
    initDOMCache() {
        // Initialize the UI Manager's comprehensive DOM cache
        this.uiManager.initialize();
        
        // Setup UI event listeners via UI Manager
        this.uiManager.setupEventListeners(this);
        
        // Keep backward compatibility with old domCache references
        this.domCache.selectedTile = this.uiManager.get('selectedTile');
        this.domCache.gameDate = this.uiManager.get('gameDate');
        this.domCache.playerCash = this.uiManager.get('playerCash');
        this.domCache.playerWealth = this.uiManager.get('playerWealth');
        this.domCache.cityName = this.uiManager.get('cityName');
        this.domCache.playerCashflow = this.uiManager.get('playerCashflow');
        this.domCache.totalResidents = this.uiManager.get('totalResidents');
    }

    initializeEdgeParcels() {
        // Create buildable spaces on grid lines between parcels
        this.edgeParcels = {
            horizontal: [], // Horizontal edges between rows
            vertical: [],   // Vertical edges between columns
            intersections: [] // Where grid lines cross
        };

        // Horizontal edges (between rows)
        for (let row = 0; row < this.gridSize - 1; row++) {
            this.edgeParcels.horizontal[row] = [];
            for (let col = 0; col < this.gridSize; col++) {
                this.edgeParcels.horizontal[row][col] = {
                    type: 'edge_horizontal',
                    // Public infrastructure - no ownership or land value
                    infrastructure: {
                        roadway: null, // 'local', 'arterial', 'highway'
                        sidewalks: false, // boolean
                        bikelanes: false, // boolean
                        busStop: null, // null or {type, direction, builtBy, cost}
                        subwayEntrance: null, // null or {type, direction, builtBy, cost}
                        totalInvestment: 0 // Total money spent on this edge parcel
                    }
                };
            }
        }

        // Vertical edges (between columns)
        for (let row = 0; row < this.gridSize; row++) {
            this.edgeParcels.vertical[row] = [];
            for (let col = 0; col < this.gridSize - 1; col++) {
                this.edgeParcels.vertical[row][col] = {
                    type: 'edge_vertical',
                    // Public infrastructure - no ownership or land value
                    infrastructure: {
                        roadway: null, // 'local', 'arterial', 'highway'
                        sidewalks: false, // boolean
                        bikelanes: false, // boolean
                        busStop: null, // null or {type, direction, builtBy, cost}
                        subwayEntrance: null, // null or {type, direction, builtBy, cost}
                        totalInvestment: 0 // Total money spent on this edge parcel
                    }
                };
            }
        }

        // Intersections (where grid lines cross)
        for (let row = 0; row < this.gridSize - 1; row++) {
            this.edgeParcels.intersections[row] = [];
            for (let col = 0; col < this.gridSize - 1; col++) {
                this.edgeParcels.intersections[row][col] = {
                    type: 'edge_intersection',
                    // Public infrastructure - intersections handle crosswalks and connections
                    infrastructure: {
                        crosswalks: [], // Array of crosswalk directions: 'north', 'south', 'east', 'west'
                        trafficControl: null, // 'stop_sign', 'traffic_light', 'roundabout'
                        totalInvestment: 0 // Total money spent on this intersection
                    }
                };
            }
        }

        // Infrastructure costs (no actions required, only money)
        this.infrastructureCosts = {
            roadway: {
                local: 50,      // $50 per block
                arterial: 200,  // $200 per block  
                highway: 500    // $500 per block
            },
            sidewalks: 25,      // $25 per block
            bikelanes: 75,      // $75 per block
            busStop: 100,       // $100 per stop
            subwayEntrance: 1000, // $1000 per entrance
            trafficControl: {
                stop_sign: 50,      // $50 per sign
                traffic_light: 500,  // $500 per light
                roundabout: 2000    // $2000 per roundabout
            }
        };

        // Test: Add some infrastructure for demonstration
        if (this.edgeParcels.horizontal[0]) {
            this.edgeParcels.horizontal[0][0].infrastructure.roadway = 'local';
            this.edgeParcels.horizontal[0][0].infrastructure.sidewalks = true;
            this.edgeParcels.horizontal[0][1].infrastructure.roadway = 'arterial';
            this.edgeParcels.horizontal[0][1].infrastructure.bikelanes = true;
        }
        if (this.edgeParcels.vertical[0]) {
            this.edgeParcels.vertical[0][0].infrastructure.roadway = 'highway';
            this.edgeParcels.vertical[0][0].infrastructure.busStop = {type: 'standard', direction: 'both', builtBy: 'player'};
        }
        if (this.edgeParcels.intersections[0]) {
            this.edgeParcels.intersections[0][0].infrastructure.crosswalks = ['north', 'south'];
            this.edgeParcels.intersections[0][0].infrastructure.trafficControl = 'stop_sign';
        }
    }

    populateBuildingCategories() {
        // Delegate to building system
        this.buildingSystem.populateBuildingCategories();
    }

    startGameTime() {
        // Solo game - client controls time advancement
        
        setInterval(() => {
            this.currentDay++;
            this.lastDayStartTime = performance.now(); // Track when this day started
            this.updateGameDate();
            this.processDailyCashflow();
            this.updatePlayerStats();

            // Run commute simulation every 7 game days
            if (this.currentDay % 7 === 0 && this.transportCapacitySystem) {
                this.transportCapacitySystem.simulateCommutes();
            }

            // Re-render to update building construction stages
            this.scheduleRender();
        }, this.dayLength);
    }

    // Action Manager Methods
    calculateMonthlyActionAllowance() {
        // Delegate to action manager
        return this.actionManager.calculateMonthlyActionAllowance();
    }
    
    refreshMonthlyActions() {
        // Delegate to action manager
        this.actionManager.refreshMonthlyActions();
    }
    
    useAction(actionType, cost = 1) {
        // Delegate to action manager
        return this.actionManager.useAction(actionType, cost);
    }
    
    addActionsRefreshAnimation() {
        const actionsElement = document.getElementById('current-actions');
        if (!actionsElement) return;
        
        // Get the parent row for full effect
        const parentRow = actionsElement.closest('.action-stat-row');
        if (!parentRow) return;
        
        // Apply governance-style glow effect
        parentRow.style.transition = 'all 0.3s ease';
        parentRow.style.backgroundColor = 'rgba(34, 197, 94, 0.15)'; // Green glow
        parentRow.style.border = '1px solid rgba(34, 197, 94, 0.4)';
        parentRow.style.borderRadius = '6px';
        parentRow.style.boxShadow = '0 0 15px rgba(34, 197, 94, 0.3)';
        
        // Pulse the text color
        actionsElement.style.color = '#22c55e';
        actionsElement.style.fontWeight = '700';
        
        // Remove the effect after 3 seconds
        setTimeout(() => {
            parentRow.style.backgroundColor = '';
            parentRow.style.border = '';
            parentRow.style.borderRadius = '';
            parentRow.style.boxShadow = '';
            actionsElement.style.color = '';
            actionsElement.style.fontWeight = '';
        }, 3000);
    }
    
    updateActionDisplay() {
        const currentActions = this.actionManager.currentActions;
        const monthlyAllowance = this.actionManager.monthlyAllowance;
        
        // Calculate expiring vs rolling over actions
        const expiringActions = Math.min(currentActions, monthlyAllowance);
        const rollingOverActions = Math.max(0, currentActions - monthlyAllowance);
        
        // Build display text
        let displayText = '';
        if (rollingOverActions > 0) {
            displayText = `${expiringActions} expiring | ${rollingOverActions} rolling over`;
        } else {
            displayText = `${expiringActions} expiring`;
        }
        
        // Use UI Manager for efficient update
        this.uiManager.updateText('currentActions', displayText);
        
        // Color code based on remaining actions
        let color = '#42B96E'; // Default green
        if (currentActions === 0) {
            color = '#FF4444'; // Red
        } else if (currentActions <= 3) {
            color = '#FFD700'; // Gold
        }
        this.uiManager.updateStyle('currentActions', 'color', color);
        
        // Update marketplace stats (with safety check for initialization order)
        if (this.actionMarketplace && this.actionMarketplace.updateMarketplaceDisplay) {
            this.actionMarketplace.updateMarketplaceDisplay();
        }
    }
    
    updateMarketplaceDisplay() {
        const listingsElement = document.getElementById('market-listings');
        const avgPriceElement = document.getElementById('action-avg-price');
        
        if (listingsElement) {
            const activeListings = this.actionManager.marketplace.listings.filter(l => l.status === 'active').length;
            listingsElement.textContent = `${activeListings} listing${activeListings !== 1 ? 's' : ''}`;
        }
        
        if (avgPriceElement) {
            if (this.actionManager.marketplace.avgPrice > 0) {
                avgPriceElement.textContent = `$${Math.round(this.actionManager.marketplace.avgPrice).toLocaleString()}`;
            } else {
                avgPriceElement.textContent = '--';
            }
        }
    }
    
    updateMonthCountdown() {
        const progressBar = document.getElementById('month-progress-bar');
        const progressText = document.getElementById('month-progress-text');
        const progressContainer = document.getElementById('month-progress-container');
        
        if (!progressBar || !progressText || !progressContainer) return;
        
        // Month lengths in days
        const monthLengths = {
            'SEPT': 30, 'OCT': 31, 'NOV': 30, 'DEC': 31,
            'JAN': 31, 'FEB': 28, 'MAR': 31, 'APR': 30,
            'MAY': 31, 'JUN': 30, 'JUL': 31, 'AUG': 31
        };
        
        const daysInMonth = monthLengths[this.gameDate.month];
        const daysRemaining = daysInMonth - this.gameDate.day;
        
        // Calculate real-time seconds remaining
        // Total year = 1 hour = 3600 seconds
        // Total days in year = 365
        // Seconds per day = 3600 / 365 = 9.863 seconds
        const secondsPerDay = 3600 / 365;
        
        // Time remaining in current day (in milliseconds)
        const msIntoDay = performance.now() - this.lastDayStartTime;
        const msRemainingInDay = this.dayLength - msIntoDay;
        const secondsRemainingInDay = msRemainingInDay / 1000;
        
        // Total seconds remaining in month
        const totalSecondsRemaining = (daysRemaining * secondsPerDay) + secondsRemainingInDay;
        const totalSecondsInMonth = daysInMonth * secondsPerDay;
        
        // Calculate progress percentage (100% to 0%)
        const progressPercent = Math.max(0, Math.min(100, (totalSecondsRemaining / totalSecondsInMonth) * 100));
        
        // Show urgent timer only in final 30 seconds
        const isUrgent = totalSecondsRemaining <= 30;
        
        // Format time as MM:SS (needed for both display and tooltip)
        const minutes = Math.floor(totalSecondsRemaining / 60);
        const seconds = Math.floor(totalSecondsRemaining % 60);
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Always show the container
        progressContainer.style.display = 'block';
        progressContainer.style.opacity = '1';
        progressBar.style.width = `${progressPercent}%`;
        
        if (isUrgent) {
            // Final 30 seconds - add urgent styling and show timer
            progressContainer.classList.add('urgent');
            progressText.textContent = timeText;
            progressText.style.display = 'block';
        } else {
            // Normal state - remove urgent styling and show days
            progressContainer.classList.remove('urgent');
            
            if (daysRemaining === 1) {
                progressText.textContent = 'Final Day';
            } else {
                progressText.textContent = `${daysRemaining} days left`;
            }
            progressText.style.display = 'block';
        }
        
        // Calculate game progress (12 months ending Sept 1)
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const currentMonthIndex = monthOrder.indexOf(this.gameDate.month);
        const gameMonthsElapsed = currentMonthIndex + 1;
        const gameMonthsRemaining = 12 - gameMonthsElapsed;
        
        // Update tooltip with detailed information
        const daysText = daysRemaining === 1 ? 'day' : 'days';
        const monthsRemainingText = gameMonthsRemaining === 1 ? 'month' : 'months';
        
        progressContainer.setAttribute('data-tooltip', 
            `<strong>Time Left in Month</strong><br><br>` +
            `⏱️ ${timeText} remaining in month<br>` +
            `📆 ${daysRemaining} ${daysText} left in month<br><br>` +
            `<strong>🎮 Game Progress</strong><br>` +
            `⏳ ${gameMonthsRemaining} ${monthsRemainingText} until Sept 1<br><br>` +
            `💼 Actions refresh when month ends`);
    }
    
    updateGameDate() {
        const monthLengths = {
            'SEPT': 30, 'OCT': 31, 'NOV': 30, 'DEC': 31,
            'JAN': 31, 'FEB': 28, 'MAR': 31, 'APR': 30,
            'MAY': 31, 'JUN': 30, 'JUL': 31, 'AUG': 31
        };
        
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        
        const daysInCurrentMonth = monthLengths[this.gameDate.month];
        
        if (this.gameDate.day >= daysInCurrentMonth) {
            // Move to next month
            this.gameDate.day = 1;
            const currentMonthIndex = monthOrder.indexOf(this.gameDate.month);
            const nextMonthIndex = (currentMonthIndex + 1) % monthOrder.length;
            this.gameDate.month = monthOrder[nextMonthIndex];
            
            // NEW: Refresh actions at month start
            this.refreshMonthlyActions();

            // Distribute treasury funds to budget allocations
            this.governanceSystem.distributeMonthlyBudget();

            // Process expired auctions at month end
            this.actionMarketplace.processExpiredAuctions();

            // Award voting points and trigger governance button animation
            this.governanceSystem.processMonthlyGovernance();
        } else {
            this.gameDate.day++;
        }
        
        this.domCache.gameDate.textContent = `${this.gameDate.month} ${this.gameDate.day}`;
    }

    processDailyCashflow() {
        // Use economic engine's cashflow calculation
        if (this.economicEngine) {
            return this.economicEngine.processDailyCashflow();
        }
        console.warn('⚠️ No economic engine available for cashflow calculation');
        return { totalRevenue: 0, totalMaintenance: 0, netCashflow: 0 };
    }
    
    // Helper method: Update player parcel tracking and mark aging buildings as dirty
    calculateRoadMaintenance() {
        // TODO: Move to server-side calculation
        console.log('⚠️ calculateRoadMaintenance() - placeholder for server migration');
        return 0;
    }
    
    updatePlayerParcelsAndAging() {
        this.economicCache.playerParcels.clear();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                if (this.isCurrentPlayer(parcel.owner)) {
                    const key = `${row}-${col}`;
                    this.economicCache.playerParcels.add(key);
                    
                    // Mark buildings as dirty for economic recalculation (aging handled by building system)
                    if (parcel.building) {
                        this.markBuildingEconomicsDirty(row, col);
                    }
                }
            }
        }
    }
    
    // Helper method: Update economic cache for dirty buildings only
    updateEconomicCache() {
        // DISABLED: Legacy client-side economic cache - using server-authoritative system
        console.log('⚠️ Legacy updateEconomicCache disabled - using server-authoritative system');
        return Promise.resolve();
    }
    
    // Helper method: Calculate economics for a single building/parcel
    calculateBuildingEconomics(parcel, row, col) {
        // Delegate to the building system
        return this.buildingSystem.calculateBuildingEconomics(parcel, row, col);
    }
    
    // Helper method: Get localized livability scores around a building location
    getLivabilityScores(row, col) {
        const livabilityScores = {};
        // Use new CARENS system domains (Culture, Affordability, Resilience, Environment, Noise, Safety)
        const livabilityDomains = ['culture', 'affordability', 'resilience', 'environment', 'noise', 'safety'];
        const searchRadius = 3; // Check buildings within 3 tiles for livability impacts

        livabilityDomains.forEach(domain => {
            let totalImpact = 0;

            // Sum impacts from nearby buildings
            for (let dr = -searchRadius; dr <= searchRadius; dr++) {
                for (let dc = -searchRadius; dc <= searchRadius; dc++) {
                    const checkRow = row + dr;
                    const checkCol = col + dc;

                    if (checkRow >= 0 && checkRow < this.gridSize &&
                        checkCol >= 0 && checkCol < this.gridSize) {

                        const parcel = this.grid[checkRow][checkCol];
                        if (parcel && parcel.building) {
                            const building = this.buildingManager.getBuildingById(parcel.building);
                            if (building && building.livability && building.livability[domain]) {
                                const livabilityData = building.livability[domain];
                                const impact = livabilityData.impact || 0;
                                const attenuation = livabilityData.attenuation || 1;

                                // Distance-based attenuation as specified in building data
                                const distance = Math.sqrt(dr*dr + dc*dc);
                                const attenuationMultiplier = Math.max(0.1, 1 - distance / attenuation);
                                totalImpact += impact * attenuationMultiplier;
                            }
                        }
                    }
                }
            }
            
            livabilityScores[domain] = totalImpact;
        });
        
        return livabilityScores;
    }
    
    // Helper method: Check if a parcel has road connectivity
    checkRoadConnectivity(row, col) {
        // Check all 8 adjacent cells for roads
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];
        
        for (const [dr, dc] of directions) {
            const checkRow = row + dr;
            const checkCol = col + dc;
            
            if (checkRow >= 0 && checkRow < this.gridSize && 
                checkCol >= 0 && checkCol < this.gridSize) {
                
                const parcel = this.grid[checkRow][checkCol];
                if (parcel && parcel.roadType) {
                    return true; // Found adjacent road
                }
            }
        }
        
        return false; // No adjacent roads found
    }
    
    // Delegation method for demographic calculation
    async calculateDemographics(totalPopulation) {
        // Use server-side calculation for demographics (consolidated economic flow)
        try {
            return await this.economicAPI.getDemographics(totalPopulation);
        } catch (error) {
            console.error('Server demographics calculation failed:', error);
            return null;
        }
    }
    
    // Helper method: Calculate livability-based multipliers for revenue and decay
    calculateLivabilityMultipliers(row, col) {
        // Get livability scores for this location
        const livabilityScores = this.getLivabilityScores(row, col);
        
        // Calculate overall livability score (-1 to 1 range)
        const livabilityDomains = ['health', 'education', 'safety', 'culture', 'mobility', 'environment', 'affordability', 'resilience', 'noise'];
        let totalScore = 0;
        let domainCount = 0;
        
        livabilityDomains.forEach(domain => {
            if (livabilityScores[domain] !== undefined) {
                totalScore += livabilityScores[domain];
                domainCount++;
            }
        });
        
        const averageLivability = domainCount > 0 ? totalScore / domainCount : 0;
        
        // Convert to multipliers
        // Revenue: 0.9x (max negative) to 1.15x (max positive)
        const revenueMultiplier = 1.0 + (averageLivability * 0.125); // Range: 0.875 to 1.125
        const clampedRevenueMultiplier = Math.max(0.9, Math.min(1.15, revenueMultiplier));
        
        // Decay: 1.1x (max negative livability = faster decay) to 0.9x (max positive = slower decay)  
        const decayMultiplier = 1.0 - (averageLivability * 0.1); // Range: 1.1 to 0.9
        const clampedDecayMultiplier = Math.max(0.9, Math.min(1.1, decayMultiplier));
        
        return {
            revenue: clampedRevenueMultiplier,
            decay: clampedDecayMultiplier
        };
    }
    
    // Helper method: Build cashflow breakdown from cached stats for UI
    buildCashflowBreakdown() {
        // DISABLED: Legacy client-side cashflow breakdown - using server-authoritative system
        console.log('⚠️ Legacy buildCashflowBreakdown disabled - using server-authoritative system');
        return { breakdown: [], totalRevenue: 0, totalMaintenance: 0, totalLVT: 0, netCashflow: 0 };
    }
    
    // Mark building for economic recalculation
    markBuildingEconomicsDirty(row, col) {
        this.economicCache.dirty.add(`${row}-${col}`);
    }
    
    // Mark vitality calculations as needing update
    markVitalityDirty(row = null, col = null) {
        this.vitalityCache.dirty = true;
        if (row !== null && col !== null) {
            this.vitalityCache.dirtyBuildings.add(`${row}-${col}`);
        }
    }
    
    // Update prerequisite cache
    updatePrereqCache() {
        const now = performance.now();
        
        // Use cache if recent and not dirty
        if (!this.prereqCache.dirty && (now - this.prereqCache.lastUpdate) < 500) {
            return;
        }
        
        this.prereqCache.availableBuildings.clear();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building) {
                        this.prereqCache.availableBuildings.add(building.name);
                    }
                }
            }
        }
        
        this.prereqCache.lastUpdate = now;
        this.prereqCache.dirty = false;
    }
    
    // Mark prerequisites as needing update
    markPrereqDirty() {
        this.prereqCache.dirty = true;
    }
    
    // Centralized method to calculate building cost with public funding
    calculateBuildingCostWithFunding(building, fullCost) {
        // Delegate to building system for proper modularity
        return this.buildingSystem.calculateBuildingCostWithFunding(building, fullCost);
    }

    calculateCurrentCashflow() {
        console.log('🔍 calculateCurrentCashflow called:', {
            cache: this.cache?.cashflowBreakdown,
            dailyCashflowTotals: this.dailyCashflowTotals
        });

        // Trigger async server-side calculation in background
        this.updateCashflowAsync();

        // DISABLED: Legacy economic engine cashflow breakdown - using server-authoritative system

        // Return cached values immediately for UI responsiveness
        if (this.cache?.cashflowBreakdown) {
            const cashflow = this.cache.cashflowBreakdown;
            this.cashflowBreakdown = cashflow.breakdown;
            this.currentCashflowPreview = {
                revenue: cashflow.totalRevenue,
                maintenance: cashflow.totalMaintenance,
                lvt: cashflow.totalLVT,
                netCashflow: cashflow.netCashflow
            };
            this.dailyCashflowTotals = this.currentCashflowPreview;
            return cashflow.netCashflow;
        }

        // DISABLED: Legacy economic engine cache fallback - using server-authoritative system
        // Fallback to default values
        if (false) {
            // Disabled legacy code path
            this.currentCashflowPreview = {
                revenue: engineCashflow.totalRevenue,
                maintenance: engineCashflow.totalMaintenance,
                lvt: engineCashflow.totalLVT,
                netCashflow: engineCashflow.netCashflow
            };
            this.dailyCashflowTotals = this.currentCashflowPreview;
            return engineCashflow.netCashflow;
        }

        return 0; // Default fallback
    }

    async updateCashflowAsync() {
        try {
            // Use server-side cashflow calculation (consolidated economic flow)
            const gameState = this.economicAPI.prepareGameState(this);
            const cashflow = await this.economicAPI.getPlayerCashflow(gameState);

            if (cashflow && cashflow.totalRevenue !== undefined) {
                // Update local cache
                this.cache = this.cache || {};
                this.cache.cashflowBreakdown = cashflow;

                // Update UI if needed
                this.cashflowBreakdown = cashflow.breakdown;
                this.currentCashflowPreview = {
                    revenue: cashflow.totalRevenue,
                    maintenance: cashflow.totalMaintenance,
                    lvt: cashflow.totalLVT,
                    netCashflow: cashflow.netCashflow
                };
                this.dailyCashflowTotals = this.currentCashflowPreview;

                // Update UI displays with fresh cashflow data
                this.updateCashflowDisplay();
            } else {
                console.warn('Server cashflow calculation returned null or invalid data');
            }
        } catch (error) {
            console.error('Async cashflow update failed:', error);
        }
    }

    updateCashflowDisplay() {
        const totals = this.dailyCashflowTotals || { revenue: 0, maintenance: 0, lvt: 0, netCashflow: 0 };
        const cashflowElement = document.getElementById('player-cashflow');

        if (cashflowElement) {
            // Ensure netCashflow is a valid number
            const rawNetDaily = totals.netCashflow;
            const netDaily = isNaN(rawNetDaily) || rawNetDaily === null || rawNetDaily === undefined ? 0 : Math.round(rawNetDaily);

            cashflowElement.textContent = netDaily >= 0 ? `+$${netDaily.toLocaleString()}` : `-$${Math.abs(netDaily).toLocaleString()}`;

            // Add color coding
            cashflowElement.className = `info-value ${netDaily >= 0 ? 'positive' : 'negative'}`;
        }
    }

    // Calculate cashflow for a specific player (for multiplayer DCF modal)
    async calculatePlayerCashflow(playerId) {
        try {
            // Use economic engine to calculate cashflow for specific player
            const result = await fetch('/api/calculate-player-cashflow', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameState: this.gameState || this.getGameState(),
                    playerId: playerId
                })
            });

            if (result.ok) {
                const cashflow = await result.json();

                // Update the cached data for this player
                this.cashflowBreakdown = cashflow.breakdown;
                this.dailyCashflowTotals = {
                    revenue: cashflow.totalRevenue,
                    maintenance: cashflow.totalMaintenance,
                    lvt: cashflow.totalLVT,
                    netCashflow: cashflow.netCashflow
                };

                return cashflow;
            } else {
                throw new Error('Failed to calculate player cashflow');
            }
        } catch (error) {
            console.error('Error calculating player cashflow:', error);
            // Fallback to current player calculation
            this.calculateCurrentCashflow();
        }
    }

    async updateDemographicsAsync(population) {
        try {
            const demographics = await this.calculateDemographics(population);

            if (demographics) {
                // Update demographic tooltip
                const residentsRow = document.getElementById('residents-row');
                if (residentsRow) {
                    residentsRow.setAttribute('data-tooltip',
                        `<strong>Population Breakdown</strong><br><br>` +
                        `<strong>Children:</strong> ${demographics.children.toLocaleString()}<br>` +
                        `<strong>Adults:</strong> ${demographics.adults.toLocaleString()}<br>` +
                        `<strong>Seniors:</strong> ${demographics.seniors.toLocaleString()}<br><br>` +
                        `<strong>Available Workers:</strong> ${demographics.laborForce.toLocaleString()}`);
                }

                // Store demographics for other systems
                this.demographics = demographics;
                console.log('📊 Demographics updated:', demographics);
            }
        } catch (error) {
            console.error('Async demographics update failed:', error);
            // Fallback: provide basic population info
            const residentsRow = document.getElementById('residents-row');
            if (residentsRow) {
                residentsRow.setAttribute('data-tooltip',
                    `<strong>Population:</strong> ${population.toLocaleString()}<br>` +
                    `<em>Detailed breakdown unavailable</em>`);
            }
        }
    }

    checkForAuctions() {
        // Delegate to auction system
        this.auctionSystem.checkForAuctions();
    }

    // Auction system methods - now delegated to AuctionSystem
    showAuctionUI() {
        // Delegate to auction system
        this.auctionSystem.showAuctionUI();
    }
    
    startAuction(row, col) {
        // Delegate to auction system
        return this.auctionSystem.startAuction(row, col);
    }
    
    startAuctionTimer() {
        // Delegate to auction system
        this.auctionSystem.startAuctionTimer();
    }
    
    placeBid(increment) {
        // Delegate to auction system
        this.auctionSystem.placeBid(increment);
    }
    
    endAuction() {
        // Delegate to auction system
        this.auctionSystem.endAuction();
    }
    
    updateAuctionActions() {
        // Delegate to auction system
        this.auctionSystem.updateAuctionActions();
    }

    getCustomBuildings() {
        try {
            return JSON.parse(localStorage.getItem('theCommons_customBuildings') || '[]');
        } catch (error) {
            console.error('Failed to load custom buildings:', error);
            return [];
        }
    }

    getCustomAmenities() {
        try {
            return JSON.parse(localStorage.getItem('theCommons_customAmenities') || '[]');
        } catch (error) {
            console.error('Failed to load custom amenities:', error);
            return [];
        }
    }


    getBuildingCost(buildingId) {
        // Delegate to building manager
        return this.buildingManager.getBuildingCost(buildingId);
    }

    getBuildingValue(buildingId) {
        return this.buildingManager.getBuildingCost(buildingId);
    }


    calculatePopulation() {
        // DISABLED: Legacy client-side population calculation - using server-authoritative system
        console.log('⚠️ Legacy calculatePopulation disabled - using server-authoritative system');
        return 0;
    }
    
    // Solo game - no state drift checking needed
    
    countAllBuildings() {
        let count = 0;
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building && parcel.owner && parcel.owner !== 'unclaimed') {
                    count++;
                }
            }
        }
        return count;
    }

    calculateTotalWealth() {
        // Use economic engine's wealth calculation
        if (this.economicEngine) {
            return this.economicEngine.calculateTotalWealth();
        }
        console.warn('⚠️ No economic engine available for wealth calculation');
        return 0;
    }

    initDOMCache() {
        // Initialize the UI Manager's comprehensive DOM cache
        this.uiManager.initialize();
        
        // Setup UI event listeners via UI Manager
        this.uiManager.setupEventListeners(this);
        
        // Keep backward compatibility with old domCache references
        this.domCache.selectedTile = this.uiManager.get('selectedTile');
        this.domCache.gameDate = this.uiManager.get('gameDate');
        this.domCache.playerCash = this.uiManager.get('playerCash');
        this.domCache.playerWealth = this.uiManager.get('playerWealth');
        this.domCache.cityName = this.uiManager.get('cityName');
        this.domCache.playerCashflow = this.uiManager.get('playerCashflow');
        this.domCache.totalResidents = this.uiManager.get('totalResidents');
    }

    populateBuildingCategories() {
        // Delegate to building system
        this.buildingSystem.populateBuildingCategories();
    }

    startGameTime() {
        // Solo game - client controls time advancement
        
        setInterval(() => {
            this.currentDay++;
            this.lastDayStartTime = performance.now(); // Track when this day started
            this.updateGameDate();
            this.processDailyCashflow();
            this.updatePlayerStats();

            // Run commute simulation every 7 game days
            if (this.currentDay % 7 === 0 && this.transportCapacitySystem) {
                this.transportCapacitySystem.simulateCommutes();
            }

            // Re-render to update building construction stages
            this.scheduleRender();
        }, this.dayLength);
    }
    
    showNotification(message, type = 'info') {
        // Disabled - no toast notifications
        return;
    }
    
    // Visual feedback for insufficient funds (replaces distracting toasts)
    showInsufficientFundsFeedback() {
        // Find the player cash display
        const cashDisplay = document.querySelector('#city-treasury');
        if (cashDisplay) {
            cashDisplay.classList.add('cash-blink');
            setTimeout(() => cashDisplay.classList.remove('cash-blink'), 1500);
        }
        
        // Add red border blink to context menu or relevant UI element
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu && contextMenu.style.display !== 'none') {
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
    
    // Show leaderboard modal
    showLeaderboardModal() {
        const playerNetWorth = this.calculatePlayerNetWorth();
        const playerName = this.playerSettings?.name || 'You';
        
        // Simulated leaderboard data - in real multiplayer this would come from server
        const leaderboardData = [
            { name: playerName, wealth: playerNetWorth, isPlayer: true },
            { name: 'CityBuilder42', wealth: 12500 },
            { name: 'UrbanPlanner', wealth: 9800 },
            { name: 'MetroMaster', wealth: 7200 },
            { name: 'GridGuru', wealth: 6100 },
            { name: 'TownDesigner', wealth: 4900 },
            { name: 'ZoneKing', wealth: 3800 }
        ];
        
        // Sort by wealth (descending)
        leaderboardData.sort((a, b) => b.wealth - a.wealth);
        
        // Take top 10 for modal
        const topPlayers = leaderboardData.slice(0, 10);
        
        // Update modal content
        const modalList = document.getElementById('modal-leaderboard-list');
        if (modalList) {
            modalList.innerHTML = topPlayers.map((player, index) => `
                <div class="leaderboard-item ${player.isPlayer ? 'player-item' : ''}">
                    <span class="rank">#${index + 1}</span>
                    <span class="player-name">${player.name}</span>
                    <span class="player-wealth">$${player.wealth.toLocaleString()}</span>
                </div>
            `).join('');
        }
        
        // Show modal via UI Manager
        this.uiManager.showModal('leaderboard-modal');
    }
    
    // Show player stats modal
    showPlayerStatsModal() {
        const stats = this.generatePlayerStats();
        const statsContent = document.getElementById('player-stats-content');
        
        if (statsContent) {
            statsContent.innerHTML = Object.entries(stats).map(([category, data]) => `
                <div class="stat-card">
                    <div class="stat-title">${data.title}</div>
                    <div class="stat-value">${data.value}</div>
                    <div class="stat-subtitle">${data.subtitle}</div>
                </div>
            `).join('');
        }
        
        // Show modal via UI Manager
        this.uiManager.showModal('player-stats-modal');
    }
    
    // Show save game modal
    showSaveGameModal() {
        // Generate default save name
        const date = new Date();
        const defaultName = `${this.playerSettings?.name || 'Player'} - ${date.toLocaleDateString()}`;
        document.getElementById('save-name').value = defaultName;
        
        // Update save details
        const saveDetails = document.getElementById('save-details');
        if (saveDetails) {
            const gameInfo = this.getGameInfo();
            saveDetails.innerHTML = Object.entries(gameInfo).map(([key, value]) => 
                `<div><strong>${key}:</strong> ${value}</div>`
            ).join('');
        }
        
        // Show modal via UI Manager
        this.uiManager.showModal('save-game-modal');
    }

    async resetGame() {
        console.log('🔄 Resetting game...');

        try {
            // Clear ALL game-related localStorage data to prevent restored state
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('theCommons_') && key !== 'theCommons_playerSettings') {
                    localStorage.removeItem(key);
                }
            });

            // Set a flag to force cash reset on next load
            localStorage.setItem('theCommons_forceReset', 'true');

            // Reset player balance on server first
            if (this.economicAPI) {
                await this.economicAPI.resetPlayerBalance();
            }

            // Reload the page to completely reset client state
            window.location.reload();
        } catch (error) {
            console.error('❌ Reset failed:', error);
            // Fallback: clear localStorage and reload anyway
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('theCommons_') && key !== 'theCommons_playerSettings') {
                    localStorage.removeItem(key);
                }
            });
            localStorage.setItem('theCommons_forceReset', 'true');
            window.location.reload();
        }
    }

    // Generate comprehensive player statistics
    generatePlayerStats() {
        return this.uiManager.generatePlayerStats(this);
    }
    
    // Get formatted play time
    getPlayTimeString() {
        return this.uiManager.getPlayTimeString(this);
    }
    
    // Get game info for saving
    getGameInfo() {
        return {
            'Player Name': this.playerSettings?.name || 'Player',
            'City Name': document.getElementById('city-name')?.textContent || 'Unknown',
            'Game Date': `${this.gameDate.month} ${this.gameDate.day}`,
            'Net Worth': `$${this.calculatePlayerNetWorth().toLocaleString()}`,
            'Population': this.calculatePopulation().toLocaleString(),
            'Play Time': this.getPlayTimeString()
        };
    }
    
    // Save game functionality
    saveGame() {
        const saveName = document.getElementById('save-name').value.trim();
        if (!saveName) {
            alert('Please enter a save name');
            return;
        }
        
        // Create save data
        const saveData = {
            version: '1.0',
            timestamp: Date.now(),
            saveName: saveName,
            playerSettings: this.playerSettings,
            gameState: {
                playerCash: this.playerCash,
                currentDay: this.currentDay,
                gameDate: this.gameDate,
                grid: this.grid,
                governance: this.governanceSystem ? this.governanceSystem.exportData() : null,
                economicMultipliers: this.economicMultipliers,
                actionManager: this.actionManager
            },
            gameInfo: this.getGameInfo()
        };
        
        try {
            // Save to localStorage
            const saves = JSON.parse(localStorage.getItem('theCommons_saves') || '{}');
            saves[saveName] = saveData;
            localStorage.setItem('theCommons_saves', JSON.stringify(saves));
            
            // Show success and close modal
            alert(`Game saved as "${saveName}"`);
            this.uiManager.closeModal('save-game-modal');
            
        } catch (error) {
            alert('Failed to save game. Save data may be too large.');
            console.error('Save failed:', error);
        }
    }
    
    // Calculate player's total net worth (cash + asset value)
    calculatePlayerNetWorth() {
        let assetValue = 0;
        
        // Calculate value of owned parcels and buildings
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && this.isCurrentPlayer(parcel.owner)) {
                    // Add land value
                    if (parcel.landValue && parcel.landValue.current) {
                        assetValue += parcel.landValue.current;
                    }
                    
                    // Add building value
                    if (parcel.building) {
                        const building = this.buildingManager?.getBuildingById(parcel.building);
                        if (building) {
                            assetValue += this.calculateCurrentBuildingValue(parcel, building);
                        }
                    }
                }
            }
        }
        
        return Math.round(this.playerCash + assetValue);
    }
    
    // Construction animation manager - ensures smooth construction progress updates
    startConstructionAnimationManager() {
        // Check for buildings under construction and schedule regular updates
        this.constructionAnimationInterval = setInterval(() => {
            if (this.hasConstructionInProgress()) {
                this.scheduleRender();
            }
        }, 100); // Update every 100ms for smooth 10fps construction animation
    }
    
    // Check if any buildings are currently under construction
    hasConstructionInProgress() {
        if (!this.grid) return false;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building &&
                    parcel._constructionStartTime !== null &&
                    parcel._constructionDays > 0) {
                    
                    // Check if construction is still in progress
                    const constructionDurationPerDay = 3600000 / 365; // ~9.86 seconds per construction day
                    const totalConstructionTimeMs = parcel._constructionDays * constructionDurationPerDay;
                    const elapsedTimeMs = Date.now() - parcel._constructionStartTime;
                    
                    if (elapsedTimeMs < totalConstructionTimeMs) {
                        return true; // Found at least one building under construction
                    }
                }
            }
        }
        
        return false;
    }
    
    // Create dust cloud effect at construction start
    createDustCloud(x, y, type = 'building') {
        const key = `${x}-${y}-${Date.now()}`;
        const duration = 800 + Math.random() * 400; // 800-1200ms randomized
        
        this.dustClouds.set(key, {
            startTime: performance.now(),
            duration: duration,
            x: x,
            y: y,
            type: type,
            particles: this.generateDustParticles(6 + Math.floor(Math.random() * 4)) // 6-9 particles
        });
        
        
        // Schedule render to show the effect
        this.scheduleRender();
        
        // Clean up after effect completes
        setTimeout(() => {
            this.dustClouds.delete(key);
        }, duration + 100);
    }
    
    // Generate randomized dust particles
    generateDustParticles(count) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                offsetX: (Math.random() - 0.5) * 30, // Spread over 30 pixels
                offsetY: (Math.random() - 0.5) * 20, // Spread over 20 pixels
                size: 2 + Math.random() * 3, // 2-5 pixel size
                opacity: 0.3 + Math.random() * 0.4, // 0.3-0.7 initial opacity
                velocityX: (Math.random() - 0.5) * 0.5, // Slow horizontal drift
                velocityY: -0.5 - Math.random() * 0.3 // Upward movement
            });
        }
        return particles;
    }
    
    // Render all active dust clouds
    renderDustClouds() {
        const currentTime = performance.now();
        
        if (this.dustClouds.size > 0) {
        }
        
        this.dustClouds.forEach((cloud, key) => {
            const elapsed = currentTime - cloud.startTime;
            const progress = Math.min(elapsed / cloud.duration, 1);
            
            // Fade out over time
            const cloudOpacity = 1 - progress;
            if (cloudOpacity <= 0) return;
            
            // Convert world coordinates to screen coordinates
            const screenPos = this.worldToScreenCoords(cloud.x, cloud.y);
            
            this.ctx.save();
            this.ctx.globalAlpha = cloudOpacity;
            
            // Render each particle
            cloud.particles.forEach(particle => {
                const particleProgress = progress;
                const particleX = screenPos.x + particle.offsetX + (particle.velocityX * elapsed * 0.05);
                const particleY = screenPos.y + particle.offsetY + (particle.velocityY * elapsed * 0.05);
                const particleOpacity = particle.opacity * cloudOpacity;
                const particleSize = particle.size * (1 - particleProgress * 0.3); // Shrink slightly
                
                this.ctx.globalAlpha = particleOpacity;
                this.ctx.fillStyle = '#8B7355'; // Dusty brown color
                this.ctx.beginPath();
                this.ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
                this.ctx.fill();
            });
            
            this.ctx.restore();
        });
    }
    
    // Live tooltip updates for time-based content
    startLiveTooltipUpdates() {
        // Update time-based tooltips frequently for smooth construction progress
        this.liveTooltipInterval = setInterval(() => {
            this.updateLiveTooltips();
        }, 250); // Update every 250ms for smooth construction progress
    }
    
    // Update any visible tooltips that contain time information
    updateLiveTooltips() {
        // Check if tooltip manager exists and a tooltip is currently visible
        if (this.tooltipManager && this.tooltipManager.isVisible) {
            const tooltipElement = this.tooltipManager.tooltipElement;
            if (tooltipElement && tooltipElement.innerHTML) {

                // Handle month progress tooltips
                if (tooltipElement.innerHTML.includes('Time Left in Month')) {
                    // Re-show the month progress tooltip with updated time
                    const progressContainer = document.getElementById('month-progress-container');
                    if (progressContainer) {
                        // Update the tooltip data first
                        this.updateMonthCountdown();
                        // Force refresh the visible tooltip by re-triggering it
                        const rect = progressContainer.getBoundingClientRect();
                        const x = rect.left - 20;
                        const y = rect.top + rect.height / 2;
                        const tooltipContent = progressContainer.getAttribute('data-tooltip');
                        if (tooltipContent) {
                            this.tooltipManager.show(tooltipContent, x, y, {
                                delay: 0,
                                maxWidth: 300,
                                priority: 1,
                                html: true
                            });
                        }
                    }
                }

                // Handle construction progress tooltips
                else if (tooltipElement.innerHTML.includes('Under Construction') && this.currentTooltipCell) {
                    // Tooltip now handled automatically by CrispTooltip system
                }
            }
        }
    }


    getBuildingBedrooms(buildingId) {
        const building = this.buildingManager.getBuildingById(buildingId);
        
        if (building && building.population) {
            return building.population.bedroomsAdded || 0;
        }
        
        // Fallback for default buildings without population data
        const defaultBedrooms = {
            'apartment_building': 24,
            'single_family': 3,
            'townhouse': 4,
            'luxury_condos': 16
        };
        
        return defaultBedrooms[buildingId] || 0;
    }

    getBuildingValue(buildingId) {
        return this.buildingManager.getBuildingCost(buildingId);
    }

    updatePlayerStats() {
        const population = this.calculatePopulation();
        const totalWealth = this.calculateTotalWealth();

        // Cash is now guaranteed valid by CashManager
        // Force immediate cash sync to fix display timing issues
        let currentCash = 0;
        if (this.cashManager) {
            currentCash = this.cashManager.getBalance();
            // Ensure UI gets the correct value immediately
            if (currentCash === 6000 && this.domCache.playerCash && this.domCache.playerCash.textContent !== '$6,000') {
                console.log('💰 Forcing immediate cash display sync from', this.domCache.playerCash.textContent, 'to $6,000');
            }
        }

        console.log('💰 updatePlayerStats cash check:', {
            currentCash,
            hasCashManager: !!this.cashManager,
            cashManagerBalance: this.cashManager ? this.cashManager.getBalance() : 'N/A',
            domCashDisplay: this.domCache.playerCash ? this.domCache.playerCash.textContent : 'N/A'
        });
        const safeWealth = isNaN(totalWealth) || totalWealth === null || totalWealth === undefined ? 0 : totalWealth;

        // Round cash and wealth to nearest dollar for display
        this.domCache.playerCash.textContent = `$${Math.round(currentCash).toLocaleString()}`;
        this.domCache.playerWealth.textContent = `$${Math.round(safeWealth).toLocaleString()}`;

        // Update cashflow with proper formatting and color coding

        if (this.domCache.playerCashflow && this.dailyCashflowTotals) {
            const rawNetCashflow = this.dailyCashflowTotals.netCashflow;
            const netCashflow = isNaN(rawNetCashflow) || rawNetCashflow === null || rawNetCashflow === undefined ? 0 : rawNetCashflow;
            const roundedCashflow = Math.round(netCashflow);
            const formattedCashflow = roundedCashflow >= 0 ?
                `+$${roundedCashflow.toLocaleString()}` :
                `-$${Math.abs(roundedCashflow).toLocaleString()}`;

            this.domCache.playerCashflow.textContent = formattedCashflow;
            
            // Color coding: green for positive, red for negative, gray for zero
            if (roundedCashflow > 0) {
                this.domCache.playerCashflow.style.color = '#4CAF50';
            } else if (roundedCashflow < 0) {
                this.domCache.playerCashflow.style.color = '#f44336';
            } else {
                this.domCache.playerCashflow.style.color = '#ccc';
            }
        } else {
            // Fallback - set to $0 if no data
            if (this.domCache.playerCashflow) {
                this.domCache.playerCashflow.textContent = '$0';
                this.domCache.playerCashflow.style.color = '#ccc';
            }
        }
        
        // Update residents count (demographics will be calculated async)
        if (this.domCache.totalResidents) {
            this.domCache.totalResidents.textContent = population.toLocaleString();
        }

        // Calculate demographics breakdown asynchronously
        this.updateDemographicsAsync(population);
        
        // Use treasury balance directly from governance system
        let totalTreasury = 0;
        if (this.governanceSystem) {
            totalTreasury = this.governanceSystem.governance.treasuryBalance || 0;
        }
        
        // Update city treasury display with detailed breakdown
        const cityTreasuryEl = document.getElementById('city-treasury');
        if (cityTreasuryEl) {
            cityTreasuryEl.textContent = `$${Math.round(totalTreasury).toLocaleString()}`;
            
            // Create detailed treasury breakdown for tooltip
            const totalAllocated = this.governanceSystem ?
                Object.values(this.governanceSystem.governance.allocations).reduce((sum, val) => sum + val, 0) : 0;
            const unallocatedAmount = totalTreasury - totalAllocated;
            
            const treasuryRow = document.getElementById('treasury-row');
            if (treasuryRow) {
                treasuryRow.setAttribute('data-tooltip',
                    `<strong>City Treasury Breakdown</strong><br><br>` +
                    `💰 Total Treasury: $${Math.round(totalTreasury).toLocaleString()}<br>` +
                    `📂 Allocated to Budgets: $${Math.round(totalAllocated).toLocaleString()}<br>` +
                    `🏛️ Unallocated Funds: $${Math.round(unallocatedAmount).toLocaleString()}<br><br>` +
                    `💡 Click to open Governance!`);
                
                // Always make treasury clickable and gold
                treasuryRow.style.cursor = 'pointer';
                treasuryRow.style.color = '#FFD700'; // Gold color for text
                treasuryRow.style.backgroundColor = 'rgba(255, 215, 0, 0.1)'; // Subtle gold highlight
                treasuryRow.style.border = '1px solid rgba(255, 215, 0, 0.3)';
                treasuryRow.onclick = () => {
                    // Open governance modal/section
                    this.showGovernanceModal();
                };
            }
        }
        
        // Legacy: Update population in sidebar - target the CITIZENS row specifically (if it still exists)
        const metricRows = document.querySelectorAll('.metric-row');
        metricRows.forEach(row => {
            const label = row.querySelector('.metric-label');
            if (label && label.textContent === 'CITIZENS') {
                const valueElement = row.querySelector('.metric-value');
                if (valueElement) {
                    valueElement.textContent = population.toString();
                }
            }
        });
        
    }

    async completeGameReset() {
        console.log('🔄 Performing complete game reset - clearing all state');

        try {
            // Step 1: Reset server state (cash balance and any server-side data)
            const resetResponse = await fetch('/api/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!resetResponse.ok) {
                console.error('Failed to reset server state');
            } else {
                console.log('✅ Server state reset complete');
            }

            // Step 2: Clear all localStorage
            localStorage.clear();
            console.log('✅ localStorage cleared');

            // Step 3: Reset all client-side game state
            // Grid initialization now handled by server state
            this.buildings = {};
            this.buildingEfficiencies.clear();
            this.currentDay = 1;
            this.currentMonth = 1;
            this.currentYear = 2025;
            this.isGameActive = false;

            // Step 4: Reset cash manager to $6,000
            if (this.cashManager) {
                this.cashManager.balance = 6000;
                this.cashManager.notifyBalanceChange();
                console.log('✅ Cash reset to $6,000');
            }

            // Step 5: Reset governance system
            if (this.governanceSystem) {
                this.governanceSystem.reset();
                console.log('✅ Governance system reset');
            }

            // Step 6: Clear and reinitialize all UI displays
            this.initializePanelStates();
            this.updatePlayerStats();
            this.updateActionDisplay();
            this.updateMonthCountdown();
            this.updateVitalityDisplay();
            this.updateDemographicsDisplay();

            // Step 7: Redraw empty grid
            this.renderingSystem.render();

            console.log('🎉 Complete game reset finished - fresh start ready!');

        } catch (error) {
            console.error('❌ Game reset failed:', error);
        }
    }

    getParcelCoordinate(row, col) {
        const letter = String.fromCharCode(65 + col); // A-N (0-13)
        const number = row + 1; // 1-14 (0-13)
        return `${letter}-${number}`;
    }
    
    getParcelPrice(row, col) {
        // Updated pricing: $500 at center, $100 at perimeter
        // Scales based on distance from center
        
        const centerRow = 6.5;
        const centerCol = 6.5;
        
        // Calculate Chebyshev distance (max of row/col distance)
        const distanceFromCenter = Math.max(
            Math.abs(row - centerRow),
            Math.abs(col - centerCol)
        );
        
        // Maximum distance is about 6.5 (from center to corner)
        const maxDistance = 6.5;
        
        // Linear interpolation from $500 (center) to $100 (perimeter)
        const priceRange = 500 - 100; // $400 range
        const priceReduction = (distanceFromCenter / maxDistance) * priceRange;
        
        return Math.round(500 - priceReduction);
    }
    
    showBuildingDataInsights(row, col) {
        const parcel = this.grid[row][col];
        // Allow viewing data insights for ANY building (full transparency)
        if (!parcel || !parcel.building || !parcel.owner || parcel.owner === 'unclaimed') {
            return;
        }
        
        // Hide context menu
        this.hideContextMenu();
        
        // Create or update data insights overlay in sidebar
        this.createDataInsightsOverlay(row, col, parcel);
    }
    
    createDataInsightsOverlay(row, col, parcel) {
        return this.uiManager.createDataInsightsOverlay(row, col, parcel, this);
    }
    
    
    showMobilityTooltip(row, col, mouseX, mouseY) {
        // Don't show tooltip if context menu is open
        if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
            return;
        }
        
        if (!this.simpleTooltip) {
            return;
        }
        
        const parcel = this.grid[row][col];
        const coord = this.getParcelCoordinate(row, col);
        let content = '';
        
        if (parcel.building) {
            // Show mobility-focused building information
            const building = this.buildingManager.getBuildingById(parcel.building);
            if (building) {
                content += `<strong>${building.name}</strong> (${coord})<br>`;
                
                // Supply type and category
                const supplyType = this.getMobilitySupplyType(building.category);
                content += `🚛 Supply: ${supplyType}<br>`;
                
                // Connectivity info
                try {
                    const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);
                    const connectStatus = connectivity.connected ? '✅ Connected' : '❌ Isolated';
                    content += `🛣️ Road Access: ${connectStatus}<br>`;
                    
                    if (connectivity.connected && connectivity.networkDistance) {
                        content += `📏 Network Distance: ${connectivity.networkDistance}<br>`;
                    }
                } catch (e) {
                    content += `🛣️ Road Access: Checking...<br>`;
                }
                
                // Transportation info
                try {
                    const nearbyRoads = this.mobilityLayer.getNearbyRoads(row, col);
                    if (nearbyRoads.length > 0) {
                        content += `🔗 Adjacent Roads: ${nearbyRoads.length}<br>`;
                    }
                } catch (e) {
                    // Skip if error
                }
                
                // Owner information
                if (this.isCurrentPlayer(parcel.owner)) {
                    const emoji = (this.playerSettings && this.playerSettings.emoji) || '🏠';
                    content += `${emoji} <span style="color: #4CAF50">OWNED</span>`;
                } else if (parcel.owner) {
                    content += `🏢 <span style="color: #9E9E9E">${parcel.owner.toUpperCase()}</span>`;
                }
            }
        } else {
            // Show empty parcel with mobility info
            const price = this.getParcelPrice(row, col);
            content += `<strong>Empty Parcel</strong> (${coord})<br>`;
            content += `💰 Price: $${price}<br>`;
            
            // Add connectivity info for empty parcels
            try {
                const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);
                const connectStatus = connectivity.connected ? '✅ Connected to road network' : '❌ No road access';
                content += `🛣️ ${connectStatus}`;
            } catch (e) {
                content += `🛣️ Checking connectivity...`;
            }
        }
        
        // Use unified tooltip manager with proper positioning
        this.tooltipManager.show(content, mouseX, mouseY, {
            html: true,
            delay: 0, // No delay since this is triggered by timer
            priority: 10 // High priority for mobility mode
        });
    }
    
    handleMobilityTooltips(tile, mouseEvent) {
        // Clear any existing tooltip timer
        if (this.mobilityTooltipTimer) {
            clearTimeout(this.mobilityTooltipTimer);
            this.mobilityTooltipTimer = null;
        }
        
        // Always hide tooltip immediately when mouse moves
        if (this.crispTooltip) this.crispTooltip.hide();
        
        // Update selected tile display
        if (tile && tile.row >= 0 && tile.row < this.gridSize &&
            tile.col >= 0 && tile.col < this.gridSize) {
            
            this.selectedTile = tile;
            const coord = this.getParcelCoordinate(tile.row, tile.col);
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = coord;
            }
            
            // Set timer to show tooltip after mouse stops for 500ms
            this.mobilityTooltipTimer = setTimeout(() => {
                // Double-check we're still in mobility mode and on the same tile
                if (this.currentLayer === 'mobility' && 
                    this.selectedTile && 
                    this.selectedTile.row === tile.row && 
                    this.selectedTile.col === tile.col) {
                    
                    this.showMobilityTooltip(tile.row, tile.col, mouseEvent.clientX, mouseEvent.clientY);
                }
            }, 500); // 500ms delay
            
        } else {
            this.selectedTile = null;
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = '--';
            }
        }
    }
    
    getMobilitySupplyType(category) {
        const supplyTypes = {
            'housing': 'Housing',
            'commercial': 'Food/Goods',
            'utilities': 'Energy',
            'office': 'Jobs/Workers',
            'education': 'Jobs/Workers',
            'civic': 'Jobs/Workers',
            'industrial': 'Mixed Supply',
            'recreation': 'Culture/Recreation',
            'emergency': 'Emergency Services'
        };
        return supplyTypes[category] || 'Other';
    }
    
    // Calculate and visualize parcel reach
    calculateParcelReach(row, col) {
        const reachableParcels = new Set();
        const transportNetwork = this.buildTransportNetwork();
        
        // Check all parcels to see if they're reachable
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                if (r === row && c === col) continue;
                
                const distance = this.calculateEffectiveDistance(row, col, r, c, transportNetwork);
                
                // Only highlight parcels within walking distance (1) for visual clarity
                // Transport connections work in the background but aren't highlighted
                if (distance <= 1) {
                    reachableParcels.add(`${r},${c}`);
                }
            }
        }
        
        return reachableParcels;
    }
    
    // drawParcelReach() moved to RenderingSystem
    // drawReachPerimeter() moved to RenderingSystem
    
    
    showContextMenu(row, col, mouseX, mouseY) {
        this.contextMenuSystem.show(row, col, mouseX, mouseY);
        if (this.crispTooltip) this.crispTooltip.hide();
    }
    
    hideContextMenu() {
        this.contextMenuSystem.hide();
    }
    
    hideStreetEdgeContextMenu() {
        // Hide street edge context menu if it exists
        // This is called when switching layers to clear layer-specific UI
        const streetEdgeMenu = document.getElementById('street-edge-context-menu');
        if (streetEdgeMenu) {
            streetEdgeMenu.classList.remove('visible');
        }
    }
    
    clearSelectedStreetEdges() {
        // Clear selected street edges when switching layers
        if (this.selectedStreetEdges) {
            this.selectedStreetEdges.clear();
        }
    }
    
    
    generateTransitStopId() {
        // Generate a simple incrementing ID
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    
    getTransitStopAt(row, col) {
        return null; // Transit system redesign in progress
    }
    
    selectAllStreetEdges() {
        // Select all street edges in the grid
        this.selectedStreetEdges.clear();
        
        const edges = ['northeast', 'northwest', 'southeast', 'southwest'];
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                for (const edge of edges) {
                    const edgeKey = `${row}-${col}-${edge}`;
                    this.selectedStreetEdges.add(edgeKey);
                }
            }
        }
        
        // Show context menu at center of screen if edges selected
        if (this.selectedStreetEdges.size > 0) {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            this.showStreetEdgeContextMenu(centerX, centerY);
        }
        
        this.scheduleRender();
    }
    
    makeDraggable(element) {
        const handle = element.querySelector('.draggable-handle');
        if (!handle) return;
        
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        handle.style.cursor = 'move';
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = element.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            handle.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            // Keep menu within viewport bounds
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;
            
            const finalX = Math.max(0, Math.min(maxX, x));
            const finalY = Math.max(0, Math.min(maxY, y));
            
            element.style.left = finalX + 'px';
            element.style.top = finalY + 'px';
            
            // Update persistent position if this is the road design menu
            if (element.className.includes('street-edge-context-menu')) {
                this.roadDesignMenuPosition = { x: finalX, y: finalY };
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'move';
            }
        });
    }
    
    createProgressBar(percentage, fillColor = '#4ade80', bgColor = '#1f2937', width = 120, height = 8) {
        const progressHtml = `
            <div style="
                width: ${width}px; 
                height: ${height}px; 
                background: ${bgColor}; 
                border-radius: 4px; 
                overflow: hidden;
                margin: 4px 0;
                border: 1px solid #374151;
            ">
                <div style="
                    width: ${percentage}%; 
                    height: 100%; 
                    background: linear-gradient(90deg, ${fillColor} 0%, ${fillColor}dd 100%);
                    transition: width 0.3s ease;
                    border-radius: 3px;
                "></div>
            </div>
        `;
        return progressHtml;
    }
    
    
    initBusRouteBuilder() {
        const canvas = document.getElementById('bus-route-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = 400;
        canvas.height = 400;
        
        // Draw top-down map
        this.drawTopDownMap(ctx, 'bus');
        
        // Initialize route selection
        if (!this.busRouteSelection) {
            this.busRouteSelection = {
                stops: [],
                connections: []
            };
        }
        
        // Update existing routes list
        this.updateBusRoutesList();
    }
    
    initSubwayRouteBuilder() {
        const canvas = document.getElementById('subway-route-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.width = 400;
        canvas.height = 400;
        
        // Draw top-down map
        this.drawTopDownMap(ctx, 'subway');
        
        // Initialize route selection
        if (!this.subwayRouteSelection) {
            this.subwayRouteSelection = {
                entrances: [],
                connections: []
            };
        }
        
        // Update existing routes list
        this.updateSubwayRoutesList();
    }
    
    drawTopDownMap(ctx, type) {
        return this.renderingSystem.drawTopDownMap(ctx, type);
    }
    
    hasTransitStop(row, col, type) {
        // Check if this parcel has a bus stop or subway entrance
        // This checks the roads around the parcel for amenities
        const sides = ['north', 'east', 'south', 'west'];
        
        for (const side of sides) {
            const roadCoords = this.getParcelSideCoordinates(row, col, side);
            if (!roadCoords) continue;
            
            // TODO: Check if there's a road with the appropriate amenity
            // Temporarily disabled - old road system removed
            const road = null; // Legacy road finding code removed
            
            if (road && road.amenities) {
                if (type === 'bus' && road.amenities.includes('bus_stop')) {
                    return true;
                }
                if (type === 'subway' && road.amenities.includes('subway_entrance')) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    
    
    
    // Governance System Methods
    showGovernanceModal() {
        // Delegate to governance system
        this.governanceSystem.openGovernanceModal();
    }
    
    hideGovernanceModal() {
        // Delegate to governance system
        this.governanceSystem.closeGovernanceModal();
    }
    
    showActionMarketplace() {
        // Delegate to action marketplace
        if (this.actionMarketplace) {
            this.actionMarketplace.openMarketplace();
        }
    }
    
    closeActionMarketplace() {
        // Delegate to action marketplace
        if (this.actionMarketplace) {
            this.actionMarketplace.closeMarketplace();
        }
    }
    
    updateGovernanceUI() {
        console.log('🔄 updateGovernanceUI called, delegating to new governance system');
        this.updateGovernanceModal();
    }

    updateGovernanceModal() {
        // Delegate to governance system for modal updates
        if (this.governanceSystem) {
            this.governanceSystem.updateGovernanceModal();
        }
    }
    

    getUnallocatedPoints() {
        // Legacy method - now delegated to governance system
        if (this.governanceSystem) {
            return this.governanceSystem.governance.votingPoints;
        }
        return 0;
    }
    
    calculateBudgetAllocations() {
        // Legacy method - budget allocations now handled by GovernanceSystem
        // This method is no longer needed as the governance system
        // handles allocations directly
    }
    
    
    
    // Called at the beginning of each month
    awardMonthlyVotingPoints() {
        // Delegate to new governance system
        if (this.governanceSystem) {
            this.governanceSystem.awardVotingPoints(2); // Award 2 points per month
            this.updateGovernanceModal(); // Update UI
        }
    }
    
    highlightGovernanceButton() {
        const governanceBtn = document.getElementById('governance-btn');
        if (governanceBtn) {
            // Remove any existing animation class first
            governanceBtn.classList.remove('governance-highlight-animation');
            // Force reflow to restart animation
            void governanceBtn.offsetWidth;
            // Add the animation class
            governanceBtn.classList.add('governance-highlight-animation');
            
            // Remove the class after animation completes
            setTimeout(() => {
                governanceBtn.classList.remove('governance-highlight-animation');
            }, 5000);
        }
    }
    
    
    calculateMonthlyLVT() {
        // Fixed to use governance system for tax rate
        let totalLVT = 0;

        const currentLVTRate = this.governanceSystem ? this.governanceSystem.getCurrentLVTRate() : 0.50;

        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                // Collect LVT from ALL owned parcels in the city
                if (parcel && parcel.owner && parcel.owner !== 'unclaimed') {
                    const landValue = Math.max(parcel.landValue?.paidPrice || 0, parcel.landValue?.calculatedValue || 0);
                    totalLVT += landValue * currentLVTRate / 12; // Monthly portion
                }
            }
        }

        return totalLVT;
    }
    
    // Check if public funds can cover building cost
    canPublicFundsCover(buildingCategory, cost) {
        // Now use governance system funding
        const availableFunds = this.governanceSystem ? this.governanceSystem.getCategoryFunding(buildingCategory) : 0;
        return {
            canCover: availableFunds >= cost,
            availableFunds: availableFunds,
            shortfall: Math.max(0, cost - availableFunds)
        };
    }
    

    // createEmptyParcelMenu moved to ContextMenuSystem

    // createBuiltParcelMenu moved to ContextMenuSystem
    
    calculateRepairCost(parcel, building) {
        // Delegate to building system for proper modularity
        return this.buildingSystem.calculateRepairCost(parcel, building);
    }
    
    calculateCurrentBuildingValue(parcel, building) {
        // Delegate to building system for proper modularity
        return this.buildingSystem.calculateCurrentBuildingValue(parcel, building);
    }
    
    // Moved to BuildingSystem.repairBuilding()
    
    // Moved to BuildingSystem.purchaseParcel()
    
    async startAuction(row, col) {
        const coord = this.getParcelCoordinate(row, col);
        const parcel = this.grid[row][col];

        // Check if there's already an active auction
        if (this.activeAuction) {
            this.showNotification('An auction is already in progress', 'error');
            this.hideContextMenu();
            return;
        }

        // Calculate starting bid based on calculated land value (server-side)
        const gameState = this.economicAPI.prepareGameState(this);
        const landValueResult = await this.economicAPI.getLandValue(gameState, row, col);
        const calculatedValue = landValueResult?.landValue || 100; // fallback value
        const initialLandValue = this.getParcelPrice(row, col);
        
        // Get building value if present (building value - decay)
        let buildingValue = 0;
        if (parcel.building) {
            const building = this.buildingManager.getBuildingById(parcel.building);
            if (building) {
                const decayFactor = 1 - parcel.decay;
                buildingValue = Math.floor(building.economics.buildCost * decayFactor);
            }
        }
        
        // Initialize auction
        this.activeAuction = {
            row,
            col,
            coord,
            startTime: Date.now(),
            endTime: Date.now() + 60000, // 60 seconds
            currentOwner: parcel.owner,
            calculatedLandValue: calculatedValue,
            initialLandValue: initialLandValue,
            buildingValue: buildingValue,
            currentBid: calculatedValue, // Starts at calculated value
            currentBidder: null,
            bidHistory: [],
            dutchPhase: true, // Start with Dutch auction phase
            dutchDecrement: 0.01, // 1% decrements
            lastDutchUpdate: Date.now()
        };
        
        
        this.hideContextMenu();
        this.showAuctionUI();
        this.startAuctionTimer();
    }

    getCustomBuildings() {
        try {
            return JSON.parse(localStorage.getItem('theCommons_customBuildings') || '[]');
        } catch (error) {
            console.error('Failed to load custom buildings:', error);
            return [];
        }
    }

    getCustomAmenities() {
        try {
            return JSON.parse(localStorage.getItem('theCommons_customAmenities') || '[]');
        } catch (error) {
            console.error('Failed to load custom amenities:', error);
            return [];
        }
    }

    // Moved to BuildingSystem.constructBuilding()

    getBuildingCost(buildingId) {
        return this.buildingManager.getBuildingCost(buildingId);
    }
    
    checkBuildingRequirements(buildingId, row, col) {
        const building = this.buildingManager.getBuildingById(buildingId);
        if (!building) return { canBuild: false, reasons: ['Building not found'] };
        
        const reasons = [];
        
        // Check if parcel is owned by player
        if (!this.isCurrentPlayer(this.grid[row][col].owner)) {
            // Skip - players can only access building menu on owned parcels
        }
        
        // Check if parcel already has a building
        if (this.grid[row][col].building) {
            reasons.push('Parcel already has a building');
        }
        
        // Check population requirement using single source of truth
        const currentPopulation = this.calculatePopulation(); // Always use the main function
        const requiredPopulation = building?.population?.populationRequired || 0;
        if (currentPopulation < requiredPopulation) {
            reasons.push(`Requires ${requiredPopulation} population (current: ${Math.floor(currentPopulation)})`);
        }
        
        // Check cash requirement - now use governance system discounts
        const baseBuildingCost = this.getBuildingCost(buildingId);
        const discountedCost = this.governanceSystem ?
            this.governanceSystem.getBuildingCostWithFunding(building) :
            baseBuildingCost;

        const playerCostRequired = discountedCost;
        
        if (this.playerCash < playerCostRequired) {
            reasons.push(`Insufficient funds: need $${playerCostRequired.toLocaleString()} (have $${Math.floor(this.playerCash).toLocaleString()})`);
        }
        
        // Check prerequisites (if any) - use cache for performance
        if (building.prerequisites && building.prerequisites.length > 0) {
            // Ensure prerequisite cache is up to date
            this.updatePrereqCache();
            
            const missingPrereqs = building.prerequisites.filter(prereq => {
                return !this.prereqCache.availableBuildings.has(prereq);
            });
            
            if (missingPrereqs.length > 0) {
                reasons.push(`Requires: ${missingPrereqs.join(', ')}`);
            }
        }
        
        return {
            canBuild: reasons.length === 0,
            reasons: reasons,
            building: building
        };
    }

    // Moved to BuildingSystem.demolishBuilding()

    getPotentialUpgrades(currentBuildingId) {
        // Simple upgrade logic - return some example upgrades
        const upgradeMap = {
            'elementary_school': [
                { id: 'high_school', name: 'High School', cost: 30000 }
            ],
            'clinic': [
                { id: 'hospital', name: 'Hospital', cost: 120000 }
            ],
            'apartment_building': [
                { id: 'luxury_condos', name: 'Luxury Condos', cost: 80000 }
            ],
            'single_family': [
                { id: 'townhouse', name: 'Townhouse', cost: 10000 }
            ]
        };
        
        return upgradeMap[currentBuildingId] || [];
    }

    // Moved to BuildingSystem.upgradeBuilding()

    getAvailableAmenities(parcel) {
        // Get default amenities plus custom ones
        const defaultAmenities = [
            { id: 'solar_panels', name: 'Solar Panels', cost: 15000 },
            { id: 'garden', name: 'Garden', cost: 5000 },
            { id: 'security_system', name: 'Security System', cost: 8000 },
            { id: 'parking_garage', name: 'Parking Garage', cost: 25000 }
        ];
        
        const customAmenities = this.getCustomAmenities().map(a => ({
            id: a.id,
            name: a.name,
            cost: a.economics.installCost
        }));
        
        const allAmenities = [...defaultAmenities, ...customAmenities];
        
        // Filter out amenities already installed
        return allAmenities.filter(amenity => 
            !parcel.amenities.includes(amenity.id)
        );
    }

    // Moved to BuildingSystem.addAmenityToBuilding()

    // addBuildingHoverHandlers moved to ContextMenuSystem

    showBuildingInfo(buildingName) {
        const buildingData = this.getBuildingDataByName(buildingName);
        if (!buildingData) return;

        const panel = document.getElementById('building-info-panel');
        
        // Update panel content
        document.getElementById('building-info-title').textContent = buildingData.name;
        
        // Add building description
        this.updateBuildingDescription(buildingData.name);
        
        // Update supply/demand displays (includes cost and time)
        this.updateSupplyDemandDisplay(buildingData);
        
        // Update requirements display
        this.updateBuildingRequirements(buildingData.name);

        // Set building image
        const img = document.getElementById('building-info-img');
        if (buildingData.image) {
            img.src = buildingData.image;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }

        // Update soft metric impacts (livability)
        this.updateBuildingImpacts(buildingData.impacts);

        // Add Investment Score
        this.updateInvestmentScore(buildingData);

        // Show panel
        panel.classList.add('visible');
    }

    hideBuildingInfo() {
        const panel = document.getElementById('building-info-panel');
        panel.classList.remove('visible');
    }

    calculateInvestmentScore(buildingData) {
        // Get all buildings to find max/min values for normalization
        const allBuildings = this.buildingManager.getAllBuildings();
        
        // Extract financial metrics from all buildings
        const revenues = allBuildings.map(b => b.economics?.maxRevenue || 0);
        const maintenances = allBuildings.map(b => b.economics?.maintenanceCost || 0);
        const decayRates = allBuildings.map(b => b.economics?.decayRate || 0);
        
        const maxRevenue = Math.max(...revenues);
        const minRevenue = Math.min(...revenues);
        const maxMaintenance = Math.max(...maintenances);
        const minMaintenance = Math.min(...maintenances);
        const maxDecayRate = Math.max(...decayRates);
        const minDecayRate = Math.min(...decayRates);
        
        // Current building's metrics
        const revenue = buildingData.economics?.maxRevenue || 0;
        const maintenance = buildingData.economics?.maintenanceCost || 0;
        const decayRate = buildingData.economics?.decayRate || 0;
        
        // Calculate normalized scores (0-1)
        const revenueScore = maxRevenue > minRevenue ? 
            (revenue - minRevenue) / (maxRevenue - minRevenue) : 0.5;
        
        // Lower maintenance is better, so invert the score
        const maintenanceScore = maxMaintenance > minMaintenance ? 
            1 - (maintenance - minMaintenance) / (maxMaintenance - minMaintenance) : 0.5;
        
        // Lower decay rate is better, so invert the score
        const decayScore = maxDecayRate > minDecayRate ? 
            1 - (decayRate - minDecayRate) / (maxDecayRate - minDecayRate) : 0.5;
        
        // Weighted average (revenue is most important, then maintenance, then decay)
        const weightedScore = (revenueScore * 0.5) + (maintenanceScore * 0.3) + (decayScore * 0.2);
        
        // Convert to 1-100 scale
        const investmentScore = Math.max(1, Math.min(100, Math.round(weightedScore * 100)));
        
        return {
            score: investmentScore,
            revenue: revenue,
            maintenance: maintenance,
            decayRate: decayRate
        };
    }

    updateInvestmentScore(buildingData) {
        // Find or create investment score container
        let container = document.querySelector('.investment-score-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'investment-score-container';
            
            // Insert after supply-demand section
            const supplyDemandSection = document.querySelector('.building-supply-demand');
            if (supplyDemandSection && supplyDemandSection.parentNode) {
                supplyDemandSection.parentNode.insertBefore(container, supplyDemandSection.nextSibling);
            } else {
                // Fallback - add to building-info-content
                const infoContent = document.querySelector('.building-info-content');
                if (infoContent) infoContent.appendChild(container);
            }
        }
        
        const scoreData = this.calculateInvestmentScore(buildingData);
        
        // Determine score color and label
        let scoreColor, scoreLabel;
        if (scoreData.score >= 80) {
            scoreColor = '#4CAF50'; // Green
            scoreLabel = 'EXCELLENT';
        } else if (scoreData.score >= 60) {
            scoreColor = '#8BC34A'; // Light green
            scoreLabel = 'GOOD';
        } else if (scoreData.score >= 40) {
            scoreColor = '#FFC107'; // Amber
            scoreLabel = 'FAIR';
        } else if (scoreData.score >= 20) {
            scoreColor = '#FF9800'; // Orange
            scoreLabel = 'POOR';
        } else {
            scoreColor = '#F44336'; // Red
            scoreLabel = 'VERY POOR';
        }
        
        container.innerHTML = `
            <div class="vitality-group-title">INVESTMENT SCORE</div>
            <div class="investment-score-main">
                <div class="investment-score-circle" style="border-color: ${scoreColor};">
                    <div class="investment-score-number" style="color: ${scoreColor};">${scoreData.score}</div>
                    <div class="investment-score-label" style="color: ${scoreColor};">${scoreLabel}</div>
                </div>
                <div class="investment-score-breakdown">
                    <div class="investment-metric">
                        <span class="metric-label">Max Revenue</span>
                        <span class="metric-value">$${scoreData.revenue}/day</span>
                    </div>
                    <div class="investment-metric">
                        <span class="metric-label">Maintenance</span>
                        <span class="metric-value">$${scoreData.maintenance}/day</span>
                    </div>
                    <div class="investment-metric">
                        <span class="metric-label">Decay Rate</span>
                        <span class="metric-value">${scoreData.decayRate}%/day</span>
                    </div>
                </div>
            </div>
        `;
    }

    getBuildingDataByName(buildingName) {
        const building = this.buildingManager.getAllBuildings().find(b =>
            b.name === buildingName || b.id === buildingName
        );
        
        if (building) {
            // Separate supply/demand from soft metrics
            // Legacy domainImpacts system removed - now use resources and livability
            const supplyDemandMetrics = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];
            
            const supplyDemand = {};
            const softMetrics = {};
            
            // Get direct supply/demand from building properties (NEW CSV FORMAT)
            const resources = building.resources || {};

            // JEEFHH Supply/Demand using new CSV format
            supplyDemand.jobs = (resources.jobsProvided || 0) - (resources.jobsRequired || 0);
            supplyDemand.energy = (resources.energyProvided || 0) - (resources.energyRequired || 0);
            supplyDemand.education = (resources.educationProvided || 0) - (resources.educationRequired || 0);
            supplyDemand.food = (resources.foodProvided || 0) - (resources.foodRequired || 0);
            supplyDemand.housing = (resources.housingProvided || 0) - (resources.housingRequired || 0);
            supplyDemand.healthcare = (resources.healthcareProvided || 0) - (resources.healthcareRequired || 0);
            
            // CARENS Livability impacts using new JSON format
            const livability = building.livability || {};
            if (livability) {
                Object.entries(livability).forEach(([key, data]) => {
                    if (data && typeof data.impact === 'number') {
                        softMetrics[key.toUpperCase()] = data.impact;
                    }
                });
            }
            
            return {
                id: building.id,
                name: building.name,
                cost: building.economics?.buildCost || building.cost || 0,
                buildTime: building.economics?.constructionDays || 30,
                category: building.category,
                supplyDemand: supplyDemand,
                impacts: softMetrics,
                image: building.images?.built || null,
                economics: building.economics,
                resources: resources, // Include original resources for tooltip
                livability: livability // Include livability for tooltip
            };
        }
        
        return null;
    }
    
    updateBuildingDescription(buildingName) {
        const descriptions = {
            // Housing
            'Cottage': 'A cozy starter home with a white picket fence and room for dreams to grow. Perfect for young families taking their first steps into homeownership.',
            'Apartments': 'Efficient urban living stacked toward the sky. Where neighbors become friends and every square foot counts.',
            
            // Commercial
            'Farmers Market': 'Fresh produce and friendly faces gather here every weekend. The heartbeat of local commerce where tomatoes come with stories.',
            'Cornerstore': 'Open late when you need milk at midnight. The neighborhood\'s reliable friend, always there with essentials and a smile.',
            'Bakery': 'Wake up to the aroma of fresh bread and possibility. Where flour becomes art and mornings become special.',
            'Barbershop': 'More than just haircuts—it\'s the community\'s living room. Where local news travels faster than scissors.',
            'Brewery': 'Craft beer and conversation flow freely here. A gathering place where hops meet hopes and stories get better with each pint.',
            
            // Education
            'Schoolhouse': 'One room, endless possibilities. Where ABC\'s meet 123\'s and every child\'s potential begins to shine.',
            'High School': 'Lockers, learning, and life lessons collide. The forge where teenagers transform into tomorrow\'s leaders.',
            
            // Civic
            'Library': 'A temple of free knowledge and quiet contemplation. Where adventures live on shelves and WiFi is always free.',
            
            // Recreation
            'Playground': 'Swings reach for clouds while imaginations run wild. The embassy of childhood where scraped knees are badges of honor.',
            'Public Pool': 'Summer\'s favorite destination and winter\'s fondest memory. Where the community goes to make a splash together.',
            
            // Utilities
            'Solar Farm': 'Panels catch sunlight like mechanical sunflowers. Clean energy for a brighter tomorrow, one photon at a time.',
            'Coal Plant': 'Industrial might powers progress at a cost. Black smoke writes checks that future generations must cash.'
        };
        
        const description = descriptions[buildingName] || 'A vital piece of community infrastructure.';
        
        // Check if description element exists, if not create it
        let descElement = document.querySelector('.building-description');
        if (!descElement) {
            descElement = document.createElement('div');
            descElement.className = 'building-description';
            const infoContent = document.querySelector('.building-info-content');
            const firstChild = infoContent.firstChild;
            infoContent.insertBefore(descElement, firstChild);
        }
        
        descElement.textContent = description;
    }
    
    updateBuildingRequirements(buildingName) {
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingName);
        if (!building) return;
        
        const requirementsContainer = document.querySelector('.building-requirements');
        const requirementsList = document.getElementById('building-requirements-list');
        
        // Check requirements (use row=0, col=0 as placeholder for general checking)
        const requirements = this.checkBuildingRequirements(building.id, 0, 0);
        
        if (requirements.reasons.length > 0) {
            requirementsContainer.style.display = 'block';
            requirementsList.innerHTML = '';
            
            requirements.reasons.forEach(reason => {
                const reasonDiv = document.createElement('div');
                reasonDiv.style.cssText = `
                    padding: 6px 10px;
                    background: #1a1a1a;
                    border-radius: 4px;
                    margin-bottom: 4px;
                    font-size: 11px;
                    color: #ff6b6b;
                    border-left: 3px solid #ff6b6b;
                `;
                reasonDiv.textContent = reason;
                requirementsList.appendChild(reasonDiv);
            });
        } else {
            // Building is buildable, hide requirements section entirely
            requirementsContainer.style.display = 'none';
        }
    }

    getDefaultBuildingJobs(buildingId) {
        const defaultJobs = {
            'elementary_school': 15,
            'high_school': 25,
            'university': 100,
            'library': 8,
            'clinic': 12,
            'hospital': 80,
            'pharmacy': 6,
            'power_plant': 40,
            'water_treatment': 20,
            'waste_management': 15,
            'apartment_building': 2,
            'single_family': 0,
            'townhouse': 0,
            'art_gallery': 5,
            'theater': 20,
            'museum': 15,
            'park': 3,
            'gym': 8,
            'sports_complex': 25,
            'grocery_store': 20,
            'shopping_mall': 60,
            'restaurant': 15,
            'city_hall': 30,
            'police_station': 25,
            'fire_station': 20
        };
        
        return defaultJobs[buildingId] || 0;
    }

    updateSupplyDemandDisplay(buildingData) {
        const container = document.querySelector('.building-supply-demand');
        if (!container) return;
        
        // Clear and rebuild supply/demand section
        container.innerHTML = '<div class="vitality-group-title">JEEFHH (SUPPLY & DEMAND)</div>';

        // Define supply/demand metrics with colors (JEEFHH)
        const supplyDemandConfig = {
            'jobs': { color: '#ec4899', label: 'JOBS' },
            'energy': { color: '#f59e0b', label: 'ENERGY' },
            'education': { color: '#8b5cf6', label: 'EDUCATION' },
            'food': { color: '#84cc16', label: 'FOOD' },
            'housing': { color: '#06b6d4', label: 'HOUSING' },
            'healthcare': { color: '#ef4444', label: 'HEALTHCARE' }
        };

        Object.entries(supplyDemandConfig).forEach(([key, config]) => {
            const value = buildingData.supplyDemand?.[key] || 0;
            if (value === 0 && key !== 'energy') return; // Skip if no impact (except energy which can be 0)

            const row = document.createElement('div');
            row.className = 'jeefhh-bar-row';

            // Create label
            const label = document.createElement('span');
            label.className = 'jeefhh-label';
            label.style.color = config.color;
            label.textContent = config.label;

            // Create bar container
            const barContainer = document.createElement('div');
            barContainer.className = 'jeefhh-bar';

            // Create progress bar
            const progress = document.createElement('div');
            progress.className = 'jeefhh-progress';
            
            // Calculate width - supply goes right (green), demand goes left (red)
            const maxValue = key === 'energy' ? 500 : key === 'food' ? 50 : 30;
            const normalizedValue = Math.min(Math.max(value / maxValue, -1), 1);
            
            // Set position absolute for proper positioning
            progress.style.position = 'absolute';
            
            // JEEFHH center-balanced bars: Blue dot when balanced, red when imbalanced
            const isJEEFHH = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'].includes(key);

            if (Math.abs(value) < 0.1) {
                // Nearly balanced - show satisfying blue dot in center
                progress.style.left = '49%';
                progress.style.width = '2%';
                progress.style.height = '8px';
                progress.style.borderRadius = '50%';
                progress.style.background = isJEEFHH ? '#3b82f6' : '#8b5cf6'; // Blue for JEEFHH, Purple for CARENS
                progress.style.border = '1px solid rgba(255,255,255,0.3)';
            } else if (value > 0) {
                // Supply - goes right from center
                progress.style.left = '50%';
                progress.style.width = `${Math.abs(normalizedValue) * 50}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                if (isJEEFHH) {
                    // Supply excess turns blue fading to red
                    const intensity = Math.min(normalizedValue, 1);
                    const redComponent = Math.floor(intensity * 255);
                    progress.style.background = `rgb(${redComponent}, ${100 + redComponent}, 255)`;
                } else {
                    // CARENS: positive moves toward blue on right
                    progress.style.background = '#3b82f6'; // Blue for positive CARENS
                }
            } else {
                // Demand - goes left from center
                const width = Math.abs(normalizedValue) * 50;
                progress.style.left = `${50 - width}%`;
                progress.style.width = `${width}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                if (isJEEFHH) {
                    // Demand excess turns red
                    progress.style.background = '#ef4444';
                } else {
                    // CARENS: negative moves toward red on left
                    progress.style.background = '#ef4444'; // Red for negative CARENS
                }
            }
            
            barContainer.appendChild(progress);
            row.appendChild(label);
            row.appendChild(barContainer);
            
            container.appendChild(row);
        });
        
        // Add cost and build time at the bottom
        const costRow = document.createElement('div');
        costRow.className = 'jeefhh-bar-row';
        
        // Calculate public funding for this building
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingData.name);
        const buildingCategory = building?.category;
        const fundingInfo = this.calculateBuildingCostWithFunding(building, buildingData.cost);
        const playerCost = fundingInfo.playerCost;
        const publicFunding = fundingInfo.publicFunding;
        const availableFunds = fundingInfo.availableFunds;
        
        // Show player cost and public funding indicator
        if (publicFunding > 0) {
            // Show actual player cost (could be $0) with public funding indicator
            costRow.innerHTML = `
                <span class="jeefhh-label">COST</span>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
                    <span class="info-value">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 8px; color: #4CAF50; background: rgba(76, 175, 80, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">FUNDED</span>
                </div>
            `;
        } else if (availableFunds > 0) {
            // Public funds exist but not enough to cover full cost - show partial funding indicator
            costRow.innerHTML = `
                <span class="jeefhh-label">COST</span>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
                    <span class="info-value">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 8px; color: #FFA726; background: rgba(255, 167, 38, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">PARTIAL</span>
                </div>
            `;
        } else {
            // No public funding available
            costRow.innerHTML = `
                <span class="jeefhh-label">COST</span>
                <span class="info-value" style="margin-left: auto;">$${playerCost.toLocaleString()}</span>
            `;
        }
        container.appendChild(costRow);
        
        const timeRow = document.createElement('div');
        timeRow.className = 'jeefhh-bar-row';
        timeRow.innerHTML = `
            <span class="jeefhh-label">BUILD TIME</span>
            <span class="info-value" style="margin-left: auto;">${buildingData.buildTime} days</span>
        `;
        container.appendChild(timeRow);
    }
    
    updateBuildingImpacts(impacts) {
        const impactsList = document.getElementById('building-impacts-list');
        impactsList.innerHTML = '';

        if (!impacts || Object.keys(impacts).length === 0) {
            impactsList.innerHTML = '<div style="color: #666666; font-size: 10px; text-align: center;">No livability impacts</div>';
            return;
        }

        // Define CARENS metrics (livability) order and colors with purple center theme
        const carensConfig = {
            'safety': '#ef4444',      // Red to purple gradient
            'culture': '#a855f7',     // Purple
            'affordability': '#f97316', // Orange to purple gradient
            'resilience': '#14b8a6',  // Teal to purple gradient
            'environment': '#22c55e', // Green to purple gradient
            'noise': '#6b7280'        // Gray to purple gradient
        };
        
        // Sort impacts by livability order
        const sortedImpacts = Object.entries(impacts)
            .filter(([_, value]) => value !== 0)
            .sort(([a], [b]) => {
                const aIndex = Object.keys(carensConfig).indexOf(a.toLowerCase());
                const bIndex = Object.keys(carensConfig).indexOf(b.toLowerCase());
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

        sortedImpacts.forEach(([domain, value]) => {
            const row = document.createElement('div');
            row.className = 'carens-bar-row';

            // Create label
            const label = document.createElement('span');
            label.className = 'carens-label';
            label.style.color = carensConfig[domain.toLowerCase()] || '#808080';
            label.textContent = domain.toUpperCase();

            // Create bar container
            const barContainer = document.createElement('div');
            barContainer.className = 'carens-bar';

            // Create progress bar
            const progress = document.createElement('div');
            progress.className = 'carens-progress';
            
            // Set position absolute for proper positioning
            progress.style.position = 'absolute';
            
            // CARENS purple-centered visualization: purple center, red left, blue right
            const maxImpact = 50;
            const normalizedValue = Math.min(Math.max(value / maxImpact, -1), 1);

            if (Math.abs(value) < 0.1) {
                // Nearly neutral - show purple dot in center
                progress.style.left = '49%';
                progress.style.width = '2%';
                progress.style.height = '8px';
                progress.style.borderRadius = '50%';
                progress.style.background = '#8b5cf6'; // Purple for CARENS center
                progress.style.border = '1px solid rgba(255,255,255,0.3)';
            } else if (value > 0) {
                // Positive impact - goes right toward blue
                progress.style.left = '50%';
                progress.style.width = `${Math.abs(normalizedValue) * 50}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                progress.style.background = '#3b82f6'; // Blue for positive CARENS
            } else {
                // Negative impact - goes left toward red
                const width = Math.abs(normalizedValue) * 50;
                progress.style.left = `${50 - width}%`;
                progress.style.width = `${width}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                progress.style.background = '#ef4444'; // Red for negative CARENS
            }
            
            barContainer.appendChild(progress);
            row.appendChild(label);
            row.appendChild(barContainer);
            
            impactsList.appendChild(row);
        });
    }

    // setupCategoryHover, showSubmenu, hideSubmenu, scheduleSubmenuHide, cancelSubmenuHide moved to ContextMenuSystem

    // Land value calculation methods
    updateAllLandValues() {
        // Clear stale caches periodically
        this.clearCachesIfStale();

        // If no dirty regions, skip update (major performance optimization)
        if (this.dirtyRegions.size === 0) {
            return;
        }

        // For performance reasons in this bulk update method, use local calculation
        // Server-side calculation will be used for individual parcel queries
        for (const regionKey of this.dirtyRegions) {
            const [row, col] = regionKey.split('-').map(Number);
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
                // DISABLED: Legacy client-side land value calculation - using server-authoritative system
                this.grid[row][col].landValue.calculatedValue = 0;
            }
        }

        // Clear dirty regions after update
        this.dirtyRegions.clear();
    }

    
    async calculateAccessibilityScores(row, col) {
        // Use server-side accessibility calculation (consolidated economic flow)
        try {
            const gameState = this.economicAPI.prepareGameState(this);
            return await this.economicAPI.getAccessibilityScores(gameState, row, col);
        } catch (error) {
            console.error('Server accessibility calculation failed:', error);
            return null;
        }
    }

    calculateAccessibilityScoresLocal(row, col) {
        // DISABLED: Legacy client-side accessibility calculation - using server-authoritative system
        console.log('⚠️ Legacy calculateAccessibilityScoresLocal disabled - using server-authoritative system');
        return { accessibility: 0, transport: 0, commerce: 0, entertainment: 0 };
    }
    
    getNearbyPopulation(row, col, maxDistance) {
        let population = 0;
        
        for (let r = Math.max(0, row - maxDistance); r <= Math.min(this.gridSize - 1, row + maxDistance); r++) {
            for (let c = Math.max(0, col - maxDistance); c <= Math.min(this.gridSize - 1, col + maxDistance); c++) {
                const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
                if (distance <= maxDistance) {
                    const parcel = this.grid[r][c];
                    if (parcel.building) {
                        const building = this.buildingManager.getBuildingById(parcel.building);
                        if (building && this.buildingCategories.normalize(building.category) === 'housing') {
                            // Weight population by inverse distance
                            const weight = 1.0 / (1 + distance * 0.5);
                            population += (building.bedrooms || 0) * weight;
                        }
                    }
                }
            }
        }
        
        return population;
    }

    getAdjacentDevelopedParcels(row, col) {
        let count = 0;
        const directions = [[-1,0], [1,0], [0,-1], [0,1], [-1,-1], [-1,1], [1,-1], [1,1]];
        
        directions.forEach(([dr, dc]) => {
            const newRow = row + dr;
            const newCol = col + dc;
            
            if (newRow >= 0 && newRow < this.gridSize && 
                newCol >= 0 && newCol < this.gridSize) {
                const neighbor = this.grid[newRow][newCol];
                if (neighbor.owner && neighbor.building) {
                    count++;
                }
            }
        });
        
        return count;
    }

    getNearbyBuildingsByCategory(row, col, category, maxDistance) {
        let count = 0;
        
        for (let r = Math.max(0, row - maxDistance); r <= Math.min(this.gridSize - 1, row + maxDistance); r++) {
            for (let c = Math.max(0, col - maxDistance); c <= Math.min(this.gridSize - 1, col + maxDistance); c++) {
                if (r === row && c === col) continue;
                
                const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
                if (distance <= maxDistance) {
                    const parcel = this.grid[r][c];
                    if (parcel.building) {
                        const buildingCategory = this.getBuildingCategory(parcel.building);
                        if (buildingCategory === category) {
                            count++;
                        }
                    }
                }
            }
        }
        
        return count;
    }

    getBuildingCategory(buildingId) {
        return this.buildingManager.getBuildingCategory(buildingId);
    }
    
    
    getBuildingEfficiencyInfo(row, col) {
        const key = `${row},${col}`;
        const efficiencyData = this.buildingEfficiencies?.get(key);
        
        if (!efficiencyData || !efficiencyData.needs) {
            // Check if this building should have efficiency tracking
            const parcel = this.grid[row]?.[col];
            if (parcel?.building) {
                const building = this.buildingManager.getBuildingById(parcel.building);
                if (building?.population?.populationRequired > 0) {
                    // Building requires workers but has no efficiency data - should be 0%
                    return {
                        efficiency: 0,
                        topNeeds: [{ resource: 'workers', satisfaction: 0, deficit: building.population.populationRequired }]
                    };
                }
            }
            return {
                efficiency: 100,
                topNeeds: []
            };
        }
        
        // Calculate overall efficiency based on all needs
        const needs = efficiencyData.needs;
        let totalSatisfaction = 0;
        let needCount = 0;
        const needsList = [];
        
        Object.entries(needs).forEach(([resource, data]) => {
            totalSatisfaction += data.satisfaction;
            needCount++;
            needsList.push({
                resource,
                satisfaction: data.satisfaction,
                deficit: data.demand - data.fulfilled
            });
        });
        
        // Overall efficiency as percentage (0% to 100%)
        const avgSatisfaction = needCount > 0 ? totalSatisfaction / needCount : 1.0;
        const efficiency = Math.round(avgSatisfaction * 100);
        
        // Sort needs by worst satisfaction first
        needsList.sort((a, b) => a.satisfaction - b.satisfaction);
        
        // Get top 3 worst needs
        const topNeeds = needsList.slice(0, 3).map(need => {
            const satisfactionPercent = Math.round(need.satisfaction * 100);
            const emoji = {
                'food': '🍎',
                'energy': '⚡',
                'jobs': '💼',
                'workers': '👷',
                'housing': '🏠',
                'residents': '👥',
                'students': '🎓',
                'recreation': '🎭'
            }[need.resource] || '📊';
            
            // Friendly resource names
            const friendlyName = {
                'food': 'Food',
                'energy': 'Energy',
                'jobs': 'Jobs',
                'workers': 'Workers',
                'housing': 'Housing',
                'residents': 'Customers',
                'students': 'Students',
                'recreation': 'Recreation'
            }[need.resource] || need.resource;
            
            return {
                resource: friendlyName,
                emoji: emoji,
                satisfaction: satisfactionPercent,
                deficit: Math.round(need.deficit)
            };
        });
        
        return {
            efficiency,
            topNeeds
        };
    }
    

    // Delegation method for supply/demand calculation
    calculateSupplyDemandBalance() {
        // DISABLED: Legacy client-side supply/demand calculation - using server-authoritative system
        console.log('⚠️ Legacy calculateSupplyDemandBalance disabled - using server-authoritative system');
        return { energy: { supply: 0, demand: 0 }, food: { supply: 0, demand: 0 }, housing: { supply: 0, demand: 0 }, jobs: { supply: 0, demand: 0 } };
    }
    
    buildTransportNetwork() {
        return this.transportationSystem.buildTransportNetwork();
    }
    
    // NEW: Calculate how much population can access a building through transport
    calculateAccessiblePopulation(row, col) {
        let totalAccessible = 0;
        const transportNetwork = this.buildTransportNetwork();
        
        // Check all parcels in the grid
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const parcel = this.grid[r][c];
                
                // Look for residential buildings
                if (parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.category === 'residential') {
                        // Calculate effective distance considering transport
                        const distance = this.calculateEffectiveDistance(row, col, r, c, transportNetwork);
                        
                        // People can only access if within reasonable distance
                        let accessibility = 0;
                        if (distance <= 1) {
                            accessibility = 1.0; // Walking distance - full access
                        } else if (distance <= 10) {
                            // Need transport, exponential decay
                            accessibility = Math.exp(-0.3 * (distance - 1));
                        }
                        // Beyond 10 effective distance = no access
                        
                        // Add accessible population from this building
                        const buildingPop = building.bedrooms ? building.bedrooms * 2 : 0; // 2 people per bedroom
                        totalAccessible += buildingPop * accessibility;
                    }
                }
            }
        }
        
        return Math.round(totalAccessible);
    }
    
    hasRoadConnection(row1, col1, row2, col2, roads) {
        // Enhanced BFS to find connection and track the best road type in the path
        if (row1 === row2 && col1 === col2) return { connected: true, bestRoadType: 'highway' };
        
        const visited = new Set();
        const queue = [{
            key: `${row1},${col1}`,
            depth: 0,
            worstRoadType: 'highway' // Track the worst road in the path (bottleneck)
        }];
        const maxDepth = 20; // Prevent infinite loops
        
        // Road type hierarchy (higher number = better)
        const roadHierarchy = { 'local': 1, 'arterial': 2, 'highway': 3 };
        
        while (queue.length > 0) {
            const current = queue.shift();
            const [row, col] = current.key.split(',').map(Number);
            
            if (row === row2 && col === col2) {
                return { connected: true, bestRoadType: current.worstRoadType };
            }
            
            if (visited.has(current.key) || current.depth >= maxDepth) continue;
            visited.add(current.key);
            
            // Check all road connections from current position
            const connections = roads.get(current.key) || [];
            connections.forEach(conn => {
                const connKey = `${conn.row},${conn.col}`;
                if (!visited.has(connKey)) {
                    // Track the worst road type in the path (bottleneck principle)
                    const connRoadLevel = roadHierarchy[conn.roadType] || 1;
                    const currentWorstLevel = roadHierarchy[current.worstRoadType] || 1;
                    const newWorstLevel = Math.min(connRoadLevel, currentWorstLevel);
                    
                    // Convert back to road type name
                    let newWorstType = 'local';
                    if (newWorstLevel === 2) newWorstType = 'arterial';
                    if (newWorstLevel === 3) newWorstType = 'highway';
                    
                    queue.push({
                        key: connKey,
                        depth: current.depth + 1,
                        worstRoadType: newWorstType
                    });
                }
            });
        }
        
        return { connected: false, bestRoadType: null };
    }
    
    calculateEffectiveDistance(row1, col1, row2, col2, transportNetwork) {
        // Use Chebyshev distance (max of row/col differences) for walking
        // This makes all 8 surrounding parcels distance 1
        const chebyshevDistance = Math.max(
            Math.abs(row1 - row2), 
            Math.abs(col1 - col2)
        );
        
        // Manhattan distance for transport calculations
        const manhattanDistance = Math.abs(row1 - row2) + Math.abs(col1 - col2);
        
        // Walking is limited to immediate neighbors (Chebyshev distance 1)
        const WALKING_LIMIT = 1;
        
        // First check if there's a road connection path (basic pathfinding)
        if (transportNetwork.roads) {
            const roadConnection = this.hasRoadConnection(row1, col1, row2, col2, transportNetwork.roads);
            if (roadConnection.connected) {
                // Roads provide significant distance reduction for farther parcels
                const roadDistance = Math.max(1, Math.floor(manhattanDistance * 0.5));
                return roadDistance;
            }
        }
        
        // Check if both points are near transport nodes
        let nearestToPoint1 = null;
        let nearestToPoint2 = null;
        let minDist1 = Infinity;
        let minDist2 = Infinity;
        
        transportNetwork.nodes.forEach(node => {
            const dist1 = Math.max(Math.abs(row1 - node.row), Math.abs(col1 - node.col));
            const dist2 = Math.max(Math.abs(row2 - node.row), Math.abs(col2 - node.col));
            
            if (dist1 < minDist1 && dist1 <= 2) { // Reduced from 3 to 2 - must be very close to transport
                minDist1 = dist1;
                nearestToPoint1 = node;
            }
            
            if (dist2 < minDist2 && dist2 <= 2) {
                minDist2 = dist2;
                nearestToPoint2 = node;
            }
        });
        
        // If both points are near transport and the nodes are connected
        if (nearestToPoint1 && nearestToPoint2) {
            const key1 = `${nearestToPoint1.row},${nearestToPoint1.col}`;
            const connections = transportNetwork.connections.get(key1) || [];
            
            const connected = connections.some(conn => 
                conn.row === nearestToPoint2.row && conn.col === nearestToPoint2.col
            );
            
            if (connected) {
                // Effective distance = walk to station + reduced transit distance + walk from station
                const transitDistance = Math.max(
                    Math.abs(nearestToPoint1.row - nearestToPoint2.row),
                    Math.abs(nearestToPoint1.col - nearestToPoint2.col)
                ) * 0.1; // Transit is 10x faster (was 5x)
                
                return minDist1 + transitDistance + minDist2;
            }
        }
        
        // Without transport, only immediate neighbors (Chebyshev distance 1) are accessible
        if (chebyshevDistance > WALKING_LIMIT) {
            // Beyond walking distance without transport = effectively unreachable
            // Return a very high value to indicate no connection
            return 999; // Effectively infinite distance without transport
        }

        // Within walking distance (the 8 surrounding parcels)
        return chebyshevDistance;
    }

    // Initialize economic data structures with safe defaults
    initializeEconomicDefaults() {
        // Initialize vitality supply/demand with zero values for all domains
        this.vitalitySupply = {
            ENERGY: 0,
            FOOD: 0,
            HOUSING: 0,
            JOBS: 0,
            MOBILITY: 0,
            EDUCATION: 0,
            HEALTH: 0,
            SAFETY: 0,
            CULTURE: 0,
            ENVIRONMENT: 0,
            AFFORDABILITY: 0,
            NOISE: 0,
            RESILIENCE: 0
        };

        this.vitalityDemand = {
            ENERGY: 0,
            FOOD: 0,
            HOUSING: 0,
            JOBS: 0,
            MOBILITY: 0,
            EDUCATION: 0,
            HEALTH: 0,
            SAFETY: 0,
            CULTURE: 0,
            ENVIRONMENT: 0,
            AFFORDABILITY: 0,
            NOISE: 0,
            RESILIENCE: 0
        };

        // Initialize city stats if not exists
        if (!this.cityStats) {
            this.cityStats = {};
        }
        if (!this.cityStats.vitality) {
            this.cityStats.vitality = {};
        }
    }

    // Server-only vitality calculation system (as per architecture requirements)
    async calculateCityVitality() {
        try {
            // Get authoritative server calculation only
            const gameState = this.economicAPI.prepareGameState(this);
            const result = await this.economicAPI.calculateCityEconomics(gameState);

            if (result && result.success && result.vitality) {
                // Update with server data
                this.cityStats.vitality = result.vitality;
                this.vitalitySupply = result.vitality.supply || {};
                this.vitalityDemand = result.vitality.demand || {};

                // Clear legacy building efficiency data to ensure fresh server data
                this.buildingEfficiencies.clear();
                console.log('🔍 [DEBUG] Cleared legacy buildingEfficiencies data');

                // Process building performance data from server
                if (result.affectedBuildings && Array.isArray(result.affectedBuildings)) {
                    console.log('🔍 [DEBUG] Processing affectedBuildings from server:', result.affectedBuildings.length, 'buildings');

                    result.affectedBuildings.forEach(building => {
                        const key = `${building.row},${building.col}`;
                        console.log(`🔍 [DEBUG] Server building performance for ${key}:`, building);

                        // Convert server building performance to client buildingEfficiencies format
                        const efficiencyData = {
                            row: building.row,
                            col: building.col,
                            building: building.buildingId,
                            category: building.category || 'unknown',
                            overallEfficiency: building.performance || 1.0, // Add overall performance
                            needs: {}
                        };

                        // Convert needs to format expected by UI
                        if (building.needs && Array.isArray(building.needs)) {
                            building.needs.forEach(need => {
                                efficiencyData.needs[need.type] = {
                                    satisfaction: need.satisfaction,
                                    demand: need.required,
                                    fulfilled: need.required * need.satisfaction,
                                    accessibleSources: need.satisfaction > 0 ? 1 : 0,
                                    connectivityIssue: need.satisfaction === 0,
                                    supplyShortage: need.satisfaction < 1.0
                                };
                            });
                        }

                        this.buildingEfficiencies.set(key, efficiencyData);
                        console.log(`🔍 [DEBUG] Updated buildingEfficiencies for ${key}:`, efficiencyData);
                    });
                } else {
                    console.log('🔍 [DEBUG] No affectedBuildings data from server');
                }

                // Ensure all buildings have efficiency data - add defaults for buildings not in server response
                for (let row = 0; row < this.gridSize; row++) {
                    for (let col = 0; col < this.gridSize; col++) {
                        const key = `${row},${col}`;
                        const parcel = this.grid[row][col];

                        if (parcel && parcel.building && !this.buildingEfficiencies.has(key)) {
                            // Add default high-efficiency data for buildings not reported by server
                            const building = this.buildingManager.getBuildingById(parcel.building);
                            if (building) {
                                const defaultEfficiencyData = {
                                    row, col,
                                    building: building.id,
                                    category: building.category || 'unknown',
                                    overallEfficiency: 1.0, // Default to full efficiency
                                    needs: {
                                        jobs: { satisfaction: 1.0, demand: 0, fulfilled: 0, connectivityIssue: false, supplyShortage: false },
                                        education: { satisfaction: 1.0, demand: 0, fulfilled: 0, connectivityIssue: false, supplyShortage: false },
                                        food: { satisfaction: 1.0, demand: 0, fulfilled: 0, connectivityIssue: false, supplyShortage: false },
                                        housing: { satisfaction: 1.0, demand: 0, fulfilled: 0, connectivityIssue: false, supplyShortage: false }
                                    }
                                };
                                this.buildingEfficiencies.set(key, defaultEfficiencyData);
                                console.log(`🔍 [DEBUG] Added default efficiency data for ${key} (${building.name})`);
                            }
                        }
                    }
                }

                // Update UI with server data
                await this.updateVitalityUI();
                return result.vitality;
            } else {
                console.warn('Server vitality calculation failed or returned invalid data');
                return null;
            }
        } catch (error) {
            console.error('Server vitality calculation error:', error);
            // No fallback to local calculation - maintain server authority
            return null;
        }
    }

    // Check if server data differs significantly from current data
    hasSignificantVitalityChange(newVitality) {
        if (!newVitality.supply || !newVitality.demand) return false;

        const categories = ['ENERGY', 'FOOD', 'HOUSING', 'JOBS'];
        const threshold = 0.1; // 10% change threshold

        for (const cat of categories) {
            const oldSupply = this.vitalitySupply[cat] || 0;
            const newSupply = newVitality.supply[cat] || 0;
            const oldDemand = this.vitalityDemand[cat] || 0;
            const newDemand = newVitality.demand[cat] || 0;

            if (Math.abs(oldSupply - newSupply) > oldSupply * threshold ||
                Math.abs(oldDemand - newDemand) > oldDemand * threshold) {
                return true;
            }
        }
        return false;
    }


    // Update building revenues based on supply/demand satisfaction
    applySupplyDemandEffects() {
        this.calculateCityVitality(); // Ensure we have current supply/demand data (now uses server API)
        
        // Calculate supply/demand ratios for JEFH
        const energyRatio = this.vitalitySupply.ENERGY / Math.max(1, this.vitalityDemand.ENERGY);
        const foodRatio = this.vitalitySupply.FOOD / Math.max(1, this.vitalityDemand.FOOD);
        const housingRatio = this.vitalitySupply.HOUSING / Math.max(1, this.vitalityDemand.HOUSING);
        const jobsRatio = this.vitalitySupply.JOBS / Math.max(1, this.vitalityDemand.JOBS);
        
        // Initialize economic modifiers
        this.economicEffects = {
            energyMultiplier: 1.0,
            foodMultiplier: 1.0,
            housingMultiplier: 1.0,
            jobsMultiplier: 1.0,
            populationChangeRate: 0.0, // Daily population change rate
            businessEfficiency: 1.0 // Overall business performance
        };
        
        // ENERGY EFFECTS - smooth curves instead of cliffs
        // DISABLED: Legacy client-side multiplier calculation - using server-authoritative system
        this.economicEffects.energyMultiplier = 1.0; // Default neutral multiplier
        
        // Business efficiency affected by severe energy shortages only
        if (energyRatio < 0.3) {
            this.economicEffects.businessEfficiency = Math.max(0.4, energyRatio + 0.1);
            this.economicEffects.populationChangeRate -= (0.3 - energyRatio) * 0.1; // Gradual exodus
        }
        
        // FOOD EFFECTS - smooth curves
        // DISABLED: Legacy client-side multiplier calculation - using server-authoritative system
        this.economicEffects.foodMultiplier = 1.0; // Default neutral multiplier
        
        // Population effects only for severe food shortages
        if (foodRatio < 0.4) {
            this.economicEffects.populationChangeRate -= (0.4 - foodRatio) * 0.15; // Gradual exodus
            this.economicEffects.businessEfficiency *= Math.max(0.5, foodRatio + 0.3); // Less severe impact
        }
        
        // HOUSING EFFECTS - smooth curves
        // DISABLED: Legacy client-side multiplier calculation - using server-authoritative system
        this.economicEffects.housingMultiplier = 1.0; // Default neutral multiplier
        
        // Business and population effects for severe housing shortages only
        if (housingRatio < 0.5) {
            this.economicEffects.businessEfficiency *= Math.max(0.6, housingRatio + 0.3);
            this.economicEffects.populationChangeRate -= (0.5 - housingRatio) * 0.08; // Gradual exodus
        }
        
        // JOBS EFFECTS - smooth curves
        // DISABLED: Legacy client-side multiplier calculation - using server-authoritative system
        this.economicEffects.jobsMultiplier = 1.0; // Default neutral multiplier
        
        // Population and business effects for severe job shortages only
        if (jobsRatio < 0.4) {
            this.economicEffects.populationChangeRate -= (0.4 - jobsRatio) * 0.12; // Gradual exodus
            this.economicEffects.businessEfficiency *= Math.max(0.5, jobsRatio + 0.3); // Less severe impact
        }
        
        // Apply cumulative population change (with limits)
        // Initialize from single source of truth if not set, then apply economic effects
        if (!this.currentPopulation) {
            this.currentPopulation = this.calculatePopulation();
        }
        const populationChange = this.currentPopulation * this.economicEffects.populationChangeRate;
        this.currentPopulation = Math.max(0, this.currentPopulation + populationChange);
        
        // Store effects for building revenue calculations
        this.supplyDemandEffects = this.economicEffects;
        
        return this.economicEffects;
    }

    setupZoomControls() {
        // Zoom controls now handled by UI Manager
        this.updateZoomButtons();
    }
    
    setupLayerControls() {
        // Layer controls now handled by UI Manager
    }
    
    toggleLandValueMode() {
        if (this.currentLayer === 'landvalue') {
            this.landValueMode = this.landValueMode === 'estimated' ? 'paid' : 'estimated';

            // Show notification to user
            const modeText = this.landValueMode === 'estimated' ? 'Estimated Land Value' : 'Last Paid Price';
            this.showNotification(`LV View: ${modeText}`, 'info');

            // Re-render to show the change
            this.scheduleRender();
        }
    }

    switchToLayer(layerName) {
        // Update current layer
        this.currentLayer = layerName;
        
        // Clear any layer-specific menus when switching layers
        this.hideStreetEdgeContextMenu();
        this.clearSelectedStreetEdges();
        
        // Clear mobility tooltip timer when switching layers
        if (this.mobilityTooltipTimer) {
            clearTimeout(this.mobilityTooltipTimer);
            this.mobilityTooltipTimer = null;
        }
        
        // Update active states in dropdown
        document.querySelectorAll('.layer-option').forEach(option => option.classList.remove('active'));
        document.getElementById(`layer-${layerName}`).classList.add('active');
        
        // Handle panel visibility based on layer
        this.handlePanelTransitions(layerName);
        
        // Update cursor style based on layer - remove 3D rotation for cashflow now
        this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
        
        // Re-render with new layer
        this.scheduleRender();
    }
    
    handlePanelTransitions(layerName) {
        const vitalitySection = document.querySelector('[data-target="vitality"]').parentElement;
        const mobilitySection = document.querySelector('[data-target="mobility-panel"]').parentElement;
        const playersSection = document.querySelector('[data-target="players-panel"]').parentElement;
        
        if (layerName === 'mobility') {
            // Entering mobility view - open mobility panel, optionally close vitality
            this.openSidebarSection(mobilitySection);
            
            // Auto-close vitality panel when entering mobility (can be reopened manually)
            if (!vitalitySection.classList.contains('collapsed')) {
                this.closeSidebarSection(vitalitySection);
            }
            
            // Remove players panel completely (not just hide)
            if (playersSection) {
                playersSection.style.display = 'none';
            }
        } else if (layerName === 'players') {
            // Entering players view - show and open players panel, update player list
            if (playersSection) {
                playersSection.style.display = 'block';
                this.openSidebarSection(playersSection);
                this.updatePlayersList();
            }
            
            // Auto-close vitality and mobility panels when entering players view
            if (!vitalitySection.classList.contains('collapsed')) {
                this.closeSidebarSection(vitalitySection);
            }
            if (!mobilitySection.classList.contains('collapsed')) {
                this.closeSidebarSection(mobilitySection);
            }
        } else {
            // Leaving special views - open vitality panel, close special panels
            this.openSidebarSection(vitalitySection);
            
            // Auto-close mobility panel when leaving mobility view
            if (!mobilitySection.classList.contains('collapsed')) {
                this.closeSidebarSection(mobilitySection);
            }
            
            // Remove players panel completely (not just hide)
            if (playersSection) {
                playersSection.style.display = 'none';
            }
        }
    }
    
    updatePlayersList() {
        const playersList = document.getElementById('players-list');
        if (!playersList) return;
        
        playersList.innerHTML = '';
        
        // Solo game - just track the main player
        const allPlayers = new Map();
        allPlayers.set('player', {
            name: this.playerSettings?.name || 'Player',
            isCurrent: true
        });
        
        // Count parcels for each player
        const parcelCounts = new Map();
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const tile = this.grid[row][col];
                if (tile.owner && tile.owner !== 'unowned') {
                    parcelCounts.set(tile.owner, (parcelCounts.get(tile.owner) || 0) + 1);
                }
            }
        }
        
        // Create player items
        allPlayers.forEach((player, playerId) => {
            const parcelCount = parcelCounts.get(playerId) || 0;
            
            const playerItem = document.createElement('div');
            playerItem.className = `player-item ${player.isCurrent ? 'current-player' : ''}`;
            playerItem.dataset.playerId = playerId;
            
            playerItem.innerHTML = `
                <div class="player-info">
                    <div class="player-color-indicator" style="background-color: ${player.color}"></div>
                    <span class="player-name">${player.isCurrent ? 'You' : `Player ${playerId.slice(-4)}`}</span>
                </div>
                <div class="player-stats">
                    <span class="parcel-count">${parcelCount} parcels</span>
                </div>
            `;
            
            // Add click handler for filtering
            playerItem.addEventListener('click', () => {
                this.togglePlayerFilter(playerId);
            });
            
            playersList.appendChild(playerItem);
        });
        
        // Add clear filter button functionality
        const clearFilterBtn = document.getElementById('clear-player-filter');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', () => {
                this.clearPlayerFilter();
            });
        }
    }
    
    togglePlayerFilter(playerId) {
        // Toggle filter state
        if (this.filteredPlayerId === playerId) {
            this.clearPlayerFilter();
        } else {
            this.filteredPlayerId = playerId;
            this.updatePlayerFilterDisplay();
            this.scheduleRender();
        }
    }
    
    clearPlayerFilter() {
        this.filteredPlayerId = null;
        this.updatePlayerFilterDisplay();
        this.scheduleRender();
    }
    
    updatePlayerFilterDisplay() {
        const playerItems = document.querySelectorAll('.player-item');
        playerItems.forEach(item => {
            const playerId = item.dataset.playerId;
            if (this.filteredPlayerId === playerId) {
                item.classList.add('filtered');
            } else {
                item.classList.remove('filtered');
            }
        });
    }
    
    openSidebarSection(sectionElement) {
        if (sectionElement) {
            sectionElement.classList.remove('collapsed');
            // CSS handles the circle icon appearance via classes
        }
    }

    closeSidebarSection(sectionElement) {
        if (sectionElement) {
            sectionElement.classList.add('collapsed');
            // CSS handles the circle icon appearance via classes
        }
    }

    updateZoom() {
        // Linear zoom scaling: each tick is 0.25x
        // Default 0.8 = 1.2x scale
        this.zoomScale = 1.0 + (this.zoomLevel * 0.25);
        
        // Update cursor style based on zoom
        // Only allow grabbing when zoomed in (beyond 1.1x)
        if (this.zoomScale > 1.1) {
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.cursor = 'default';
        }
        
        this.updateZoomButtons();
        this.scheduleRender();
    }

    updateZoomButtons() {
        document.getElementById('zoom-in').disabled = this.zoomLevel >= 2.4;
        document.getElementById('zoom-out').disabled = this.zoomLevel <= 0.4;
    }

    // Convert screen coordinates to world coordinates accounting for zoom and pan
    screenToWorldCoords(screenX, screenY) {
        return {
            x: (screenX - this.panOffset.x) / this.zoomScale,
            y: (screenY - this.panOffset.y) / this.zoomScale
        };
    }
    
    // Convert world coordinates to screen coordinates accounting for zoom and pan
    worldToScreenCoords(worldX, worldY) {
        return {
            x: worldX * this.zoomScale + this.panOffset.x,
            y: worldY * this.zoomScale + this.panOffset.y
        };
    }
    
    
    
    async updateVitalityDisplay() {
        // This method is now deprecated - all vitality updates go through calculateCityVitality()
        // Just update the UI with current data
        await this.updateVitalityUI();
    }

    async updateVitalityUI() {
        // First sync game state with server, then fetch supply/demand data
        try {
            // Sync complete game state with server first
            const gameState = this.economicAPI.prepareGameState(this);
            await this.economicAPI.calculateCityEconomics(gameState);

            // Now fetch fresh supply/demand data from server
            const supplyDemandData = await this.economicAPI.getSupplyDemand();
            if (supplyDemandData && typeof supplyDemandData === 'object') {
                // Update vitality properties with server data
                this.vitalitySupply = {
                    JOBS: supplyDemandData.jobs?.supply || 0,
                    ENERGY: supplyDemandData.energy?.supply || 0,
                    EDUCATION: 0, // TODO: Add to server calculation
                    FOOD: supplyDemandData.food?.supply || 0,
                    HOUSING: supplyDemandData.housing?.supply || 0,
                    HEALTHCARE: 0 // TODO: Add to server calculation
                };

                this.vitalityDemand = {
                    JOBS: supplyDemandData.jobs?.demand || 0,
                    ENERGY: supplyDemandData.energy?.demand || 0,
                    EDUCATION: 0, // TODO: Add to server calculation
                    FOOD: supplyDemandData.food?.demand || 0,
                    HOUSING: supplyDemandData.housing?.demand || 0,
                    HEALTHCARE: 0 // TODO: Add to server calculation
                };

                console.log('📊 Updated vitality from server:', { supply: this.vitalitySupply, demand: this.vitalityDemand });
            }
        } catch (error) {
            console.warn('Failed to fetch server vitality data, using cached values:', error);
            // Fallback to existing values or defaults
            if (!this.vitalitySupply || !this.vitalityDemand) {
                this.initializeEconomicDefaults();
            }
        }

        // JEEFHH bars (Jobs, Energy, Education, Food, Housing, Healthcare)
        const jeefhhMetrics = ['JOBS', 'ENERGY', 'EDUCATION', 'FOOD', 'HOUSING', 'HEALTHCARE'];

        jeefhhMetrics.forEach(domain => {
            const progressBar = document.getElementById(`${domain.toLowerCase()}-bar`);
            if (!progressBar) return;

            const supply = this.vitalitySupply[domain] || 0;
            const demand = this.vitalityDemand[domain] || 0;
            const netBalance = supply - demand;

            // Calculate ratio: -100 to +100 scale
            let ratio = 0;
            if (demand > 0) {
                ratio = ((supply - demand) / demand) * 100;
            } else if (supply > 0) {
                ratio = 100; // Infinite supply, no demand
            }

            // Clamp to -100 to +100 range
            ratio = Math.max(-100, Math.min(100, ratio));

            // Update the JEEFHH balance-based bar
            this.updateBalanceBasedBar(progressBar, ratio, supply, demand, domain);
        });

        // CARENS livability bars (Culture, Affordability, Resilience, Environment, Noise, Safety)
        const carensMetrics = ['SAFETY', 'CULTURE', 'AFFORDABILITY', 'RESILIENCE', 'ENVIRONMENT', 'NOISE'];

        // Calculate city-wide CARENS net scores
        const carensScores = this.calculateCityWideCarensScores();

        carensMetrics.forEach(domain => {
            const progressBar = document.getElementById(`${domain.toLowerCase()}-bar`);
            if (!progressBar) return;

            const netScore = carensScores[domain.toLowerCase()] || 0;
            this.updateNetScoreBar(progressBar, netScore, domain);
        });
    }

    calculateCityWideCarensScores() {
        // Initialize scores for all CARENS domains
        const carensScores = {
            safety: 0,
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0
        };

        // Sum up impacts from all completed buildings across the city
        if (!this.grid) {
            console.warn('Grid not initialized yet for CARENS calculation');
            return carensScores;
        }

        // Iterate through the grid to find all buildings
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                // Check if parcel has a building that's not under construction
                if (parcel && parcel.building && !parcel._isUnderConstruction) {
                    const buildingData = this.getBuildingDataByName(parcel.building);
                    if (buildingData && buildingData.livability) {
                        // Add impacts from each CARENS domain
                        Object.keys(carensScores).forEach(domain => {
                            const livabilityData = buildingData.livability[domain];
                            if (livabilityData && typeof livabilityData.impact === 'number') {
                                carensScores[domain] += livabilityData.impact;
                            }
                        });
                    }
                }
            }
        }

        return carensScores;
    }

    updateSupplyDemandBar(progressBar, ratio, supply, demand, domain) {
        // Clear ALL existing positioning and styling
        progressBar.style.cssText = '';
        
        // Convert ratio (-100 to +100) to bar display
        const absRatio = Math.abs(ratio);
        const barPercent = Math.min(absRatio, 100); // 0-100% of half container width
        
        if (Math.abs(ratio) < 0.5) {
            // Nearly balanced - show minimal indicator at center
            progressBar.style.cssText = `
                position: absolute !important;
                left: 50% !important;
                top: 0 !important;
                width: 2px !important;
                height: 100% !important;
                transform: translateX(-1px) !important;
                background: #666 !important;
                border-radius: 4px !important;
            `;
        } else if (ratio < 0) {
            // Shortage: Red bar extending LEFT from center
            const width = (barPercent / 100) * 50; // Convert to percentage of half container
            progressBar.style.cssText = `
                position: absolute !important;
                right: 50% !important;
                top: 0 !important;
                width: ${width}% !important;
                height: 100% !important;
                background: linear-gradient(to left, #ff6b6b 0%, #c92a2a 100%) !important;
                border-radius: 4px !important;
            `;
        } else {
            // Surplus: Green bar extending RIGHT from center  
            const width = (barPercent / 100) * 50; // Convert to percentage of half container
            progressBar.style.cssText = `
                position: absolute !important;
                left: 50% !important;
                top: 0 !important;
                width: ${width}% !important;
                height: 100% !important;
                background: linear-gradient(to right, #69db7c 0%, #2b8a3e 100%) !important;
                border-radius: 4px !important;
            `;
        }
        
        // Set up comprehensive tooltip data
        const tooltipData = {
            type: 'supply-demand',
            domain: domain,
            supply: supply,
            demand: demand,
            ratio: ratio,
            balance: supply - demand
        };
        
        const parentRow = progressBar.closest('.jeefhh-bar-row') || progressBar.closest('.carens-bar-row') || progressBar.closest('.vitality-row');
        if (parentRow) {
            parentRow.setAttribute('data-tooltip-data', JSON.stringify(tooltipData));
        }
    }
    
    updateNetScoreBar(progressBar, score, domain) {
        // Clear and reset the progress bar completely
        progressBar.style.cssText = '';
        progressBar.innerHTML = '';

        // Set up container with center-balanced design for CARENS (purple theme)
        progressBar.style.cssText = `
            position: relative !important;
            width: 100% !important;
            height: 8px !important;
            background: #2a2a2a !important;
            border-radius: 4px !important;
            overflow: hidden !important;
        `;

        // Convert score (-100 to +100) to bar display
        const absScore = Math.abs(score);
        const isBalanced = absScore < 2; // Nearly balanced threshold

        if (isBalanced) {
            // Perfect balance: Purple dot at center with ripples
            const centerDot = document.createElement('div');
            centerDot.style.cssText = `
                position: absolute !important;
                left: 50% !important;
                top: 50% !important;
                width: 8px !important;
                height: 8px !important;
                background: #8b5cf6 !important;
                border-radius: 50% !important;
                transform: translate(-50%, -50%) !important;
                box-shadow: 0 0 4px rgba(139, 92, 246, 0.6) !important;
                z-index: 10 !important;
            `;

            // Add ripple effects if there's any activity (score is not exactly 0)
            if (absScore > 0.01) {
                // Calculate ripple intensity based on balance optimality
                const balanceOptimality = Math.max(0, 1 - absScore / 2);
                const rippleIntensity = Math.max(0.3, balanceOptimality);

                // Create purple ripple layers for CARENS
                for (let i = 1; i <= 3; i++) {
                    const ripple = document.createElement('div');
                    const delay = i * 0.6; // Stagger the ripples
                    const duration = 2.5 + (i * 0.5); // Vary duration for wave effect

                    ripple.style.cssText = `
                        position: absolute !important;
                        left: 50% !important;
                        top: 50% !important;
                        width: 8px !important;
                        height: 8px !important;
                        border: 2px solid rgba(139, 92, 246, ${rippleIntensity * 0.4}) !important;
                        border-radius: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        pointer-events: none !important;
                        animation: carens-ripple-${i} ${duration}s infinite ease-out !important;
                        animation-delay: ${delay}s !important;
                    `;
                    progressBar.appendChild(ripple);
                }

                // Add the CSS keyframes for CARENS if not already added
                if (!document.getElementById('carens-ripple-styles')) {
                    const style = document.createElement('style');
                    style.id = 'carens-ripple-styles';
                    style.textContent = `
                        @keyframes carens-ripple-1 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.5;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(3);
                                opacity: 0;
                            }
                        }
                        @keyframes carens-ripple-2 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.4;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(2.5);
                                opacity: 0;
                            }
                        }
                        @keyframes carens-ripple-3 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.45;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(2.2);
                                opacity: 0;
                            }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }

            progressBar.appendChild(centerDot);
        } else {
            // Imbalanced: Red (negative) or Green (positive) bar extending from center
            const barWidth = Math.min(50, (absScore / 100) * 50); // Max 50% of container width

            const imbalanceBar = document.createElement('div');

            if (score < 0) {
                // Negative impact: Red bar extending LEFT from center
                imbalanceBar.style.cssText = `
                    position: absolute !important;
                    right: 50% !important;
                    top: 50% !important;
                    width: ${barWidth}% !important;
                    height: 6px !important;
                    background: linear-gradient(to left, #ff6b6b 0%, #c92a2a 100%) !important;
                    border-radius: 3px !important;
                    transform: translateY(-50%) !important;
                `;
            } else {
                // Positive impact: Green bar extending RIGHT from center
                imbalanceBar.style.cssText = `
                    position: absolute !important;
                    left: 50% !important;
                    top: 50% !important;
                    width: ${barWidth}% !important;
                    height: 6px !important;
                    background: linear-gradient(to right, #69db7c 0%, #2b8a3e 100%) !important;
                    border-radius: 3px !important;
                    transform: translateY(-50%) !important;
                `;
            }

            progressBar.appendChild(imbalanceBar);
        }
        
        // Set up comprehensive tooltip data
        const tooltipData = {
            type: 'net-score',
            domain: domain,
            score: score,
            // TODO: Calculate from building.livability data when server-side CARENS is implemented
            buildingCount: 0,
            impactDetails: {}
        };
        
        const parentRow = progressBar.closest('.jeefhh-bar-row') || progressBar.closest('.carens-bar-row') || progressBar.closest('.vitality-row');
        if (parentRow) {
            parentRow.setAttribute('data-tooltip-data', JSON.stringify(tooltipData));
        }
    }

    updateBalanceBasedBar(progressBar, ratio, supply, demand, domain) {
        // Clear existing styling
        progressBar.style.cssText = '';
        progressBar.innerHTML = '';

        // Set up container with center-balanced design
        progressBar.style.cssText = `
            position: relative !important;
            width: 100% !important;
            height: 8px !important;
            background: #2a2a2a !important;
            border-radius: 4px !important;
            overflow: hidden !important;
        `;

        // Calculate balance state
        const absRatio = Math.abs(ratio);
        const isBalanced = absRatio < 2; // Nearly balanced threshold

        if (isBalanced) {
            // Perfect balance: Blue dot at center with ripples
            const centerDot = document.createElement('div');
            centerDot.style.cssText = `
                position: absolute !important;
                left: 50% !important;
                top: 50% !important;
                width: 8px !important;
                height: 8px !important;
                background: #4a9eff !important;
                border-radius: 50% !important;
                transform: translate(-50%, -50%) !important;
                box-shadow: 0 0 4px rgba(74, 158, 255, 0.6) !important;
                z-index: 10 !important;
            `;

            // Add ripple effects if both supply and demand exist
            if (supply > 0 && demand > 0) {
                // Calculate ripple intensity based on balance optimality (closer to 1.0 = more intense)
                const balanceOptimality = Math.max(0, 1 - Math.abs(ratio - 1) / 2);
                const rippleIntensity = Math.max(0.3, balanceOptimality);

                // Create multiple ripple layers for depth
                for (let i = 1; i <= 3; i++) {
                    const ripple = document.createElement('div');
                    const delay = i * 0.6; // Stagger the ripples
                    const duration = 2 + (i * 0.5); // Vary duration for wave effect

                    ripple.style.cssText = `
                        position: absolute !important;
                        left: 50% !important;
                        top: 50% !important;
                        width: 8px !important;
                        height: 8px !important;
                        border: 2px solid rgba(74, 158, 255, ${rippleIntensity * 0.4}) !important;
                        border-radius: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        pointer-events: none !important;
                        animation: jefhh-ripple-${i} ${duration}s infinite ease-out !important;
                        animation-delay: ${delay}s !important;
                    `;
                    progressBar.appendChild(ripple);
                }

                // Add the CSS keyframes if not already added
                if (!document.getElementById('jefhh-ripple-styles')) {
                    const style = document.createElement('style');
                    style.id = 'jefhh-ripple-styles';
                    style.textContent = `
                        @keyframes jefhh-ripple-1 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.6;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(3);
                                opacity: 0;
                            }
                        }
                        @keyframes jefhh-ripple-2 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.4;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(2.5);
                                opacity: 0;
                            }
                        }
                        @keyframes jefhh-ripple-3 {
                            0% {
                                transform: translate(-50%, -50%) scale(1);
                                opacity: 0.5;
                            }
                            100% {
                                transform: translate(-50%, -50%) scale(2);
                                opacity: 0;
                            }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }

            progressBar.appendChild(centerDot);
        } else {
            // Imbalanced: Red bar extending from center
            const barWidth = Math.min(50, (absRatio / 100) * 50); // Max 50% of container width

            const imbalanceBar = document.createElement('div');
            if (ratio < 0) {
                // Deficit: Red bar extending LEFT from center
                imbalanceBar.style.cssText = `
                    position: absolute !important;
                    right: 50% !important;
                    top: 0 !important;
                    width: ${barWidth}% !important;
                    height: 100% !important;
                    background: linear-gradient(to left, #ff6b6b 0%, #c92a2a 100%) !important;
                    border-radius: 8px 0 0 8px !important;
                `;
            } else {
                // Surplus: Red bar extending RIGHT from center
                imbalanceBar.style.cssText = `
                    position: absolute !important;
                    left: 50% !important;
                    top: 0 !important;
                    width: ${barWidth}% !important;
                    height: 100% !important;
                    background: linear-gradient(to right, #ff6b6b 0%, #c92a2a 100%) !important;
                    border-radius: 0 8px 8px 0 !important;
                `;
            }
            progressBar.appendChild(imbalanceBar);
        }

        // Add tooltip data for hover information
        const tooltipData = {
            type: 'supply-demand',
            domain: domain,
            supply: supply,
            demand: demand,
            ratio: ratio,
            balance: supply - demand,
            status: ratio >= 20 ? 'Surplus' :
                   Math.abs(ratio) < 2 ? 'Balanced' :
                   ratio >= 0 ? 'Minor Surplus' :
                   ratio >= -20 ? 'Minor Shortage' :
                   ratio >= -50 ? 'Shortage' : 'Critical Shortage'
        };

        const parentRow = progressBar.closest('.jeefhh-bar-row') || progressBar.closest('.carens-bar-row') || progressBar.closest('.vitality-row');
        if (parentRow) {
            parentRow.setAttribute('data-tooltip-data', JSON.stringify(tooltipData));
        }
    }


    
    
    
    updateDemographicsDisplay() {
        if (!this.demographics) return;
        
        const employmentRate = document.getElementById('employment-rate');
        const schoolEnrollment = document.getElementById('school-enrollment');
        const citySatisfaction = document.getElementById('city-satisfaction');
        
        if (employmentRate) {
            const empRate = this.demographics.employmentRate || 0;
            employmentRate.textContent = `${(empRate * 100).toFixed(1)}%`;
            
            // Add warning classes based on employment rate
            employmentRate.className = 'metric-value';
            if (empRate < 0.4) {
                employmentRate.classList.add('critical-warning');
            } else if (empRate < 0.6) {
                employmentRate.classList.add('warning');
            } else if (empRate >= 0.8) {
                employmentRate.classList.add('excellent');
            }
        }
        
        if (schoolEnrollment) {
            const enrollRate = this.demographics.schoolEnrollmentRate || 0;
            schoolEnrollment.textContent = `${(enrollRate * 100).toFixed(1)}%`;
            
            // Add warning classes based on enrollment rate
            schoolEnrollment.className = 'metric-value';
            if (enrollRate < 0.7) {
                schoolEnrollment.classList.add('critical-warning');
            } else if (enrollRate < 0.9) {
                schoolEnrollment.classList.add('warning');
            } else if (enrollRate >= 1.0) {
                schoolEnrollment.classList.add('excellent');
            }
        }
        
        if (citySatisfaction && this.citySatisfaction) {
            const satisfaction = this.citySatisfaction.overall;
            citySatisfaction.textContent = `${(satisfaction * 100).toFixed(0)}%`;
            
            // Add warning classes based on satisfaction level
            citySatisfaction.className = 'metric-value';
            if (satisfaction < 0.3) {
                citySatisfaction.classList.add('critical-warning');
            } else if (satisfaction < 0.5) {
                citySatisfaction.classList.add('warning');
            } else if (satisfaction >= 0.8) {
                citySatisfaction.classList.add('excellent');
            }
        }
        
        // Apply population feedback without notifications
        this.checkCriticalThresholds();
    }
    
    checkCriticalThresholds() {
        // Apply population growth/decline based on satisfaction (removed notifications)
        this.applyPopulationFeedback();
    }
    
    applyPopulationFeedback() {
        if (!this.citySatisfaction || !this.demographics) return;
        
        const satisfaction = this.citySatisfaction.overall;
        
        // Calculate population growth/decline modifier
        let growthModifier = 1.0;
        
        if (satisfaction < 0.3) {
            // Critical dissatisfaction: population decline
            growthModifier = 0.95; // 5% decline
        } else if (satisfaction < 0.5) {
            // Low satisfaction: slow decline
            growthModifier = 0.98; // 2% decline
        } else if (satisfaction > 0.7) {
            // High satisfaction: growth
            growthModifier = 1.02; // 2% growth
        } else if (satisfaction > 0.8) {
            // Excellent satisfaction: fast growth
            growthModifier = 1.05; // 5% growth
        }
        
        // Apply growth modifier to revenue (represents population changes)
        if (growthModifier !== 1.0) {
            // Store the growth effect to be applied in processDailyCashflow
            this.populationGrowthModifier = growthModifier;
        }
        
        // Apply immediate effects on building efficiency when satisfaction is very low
        if (satisfaction < 0.4) {
            // Very unhappy city: reduce building effectiveness
            this.buildingEfficiencyPenalty = 0.9; // 10% penalty to all revenue
        } else {
            this.buildingEfficiencyPenalty = 1.0; // No penalty
        }
    }
    
    setupCanvas() {
        const container = document.getElementById('main-area');
        if (!container) {
            console.warn('Main-area container not found, using default canvas size');
            this.canvas.width = 800;
            this.canvas.height = 600;
            return;
        }
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width - 40;
        this.canvas.height = rect.height - 40;
        
        
        
        // Calculate diamond dimensions for a rotated square
        // In isometric view, a tile appears as a diamond with 2:1 width:height ratio
        const diamondWidth = Math.min(this.canvas.width, this.canvas.height * 2) / this.gridSize * 0.80; // 5% smaller grid for better layout
        const diamondHeight = diamondWidth * 0.5;
        
        this.tileWidth = diamondWidth;
        this.tileHeight = diamondHeight;
        
        // Center the grid on the intersection of the middle 4 parcels
        // For a 14x14 grid, the center is between parcels (6,6), (6,7), (7,6), (7,7)
        // The center point in grid coordinates is (6.5, 6.5)
        const centerGridX = (this.gridSize - 1) / 2;
        const centerGridY = (this.gridSize - 1) / 2;
        
        // Convert center grid position to isometric coordinates
        const centerIsoX = (centerGridX - centerGridY) * (this.tileWidth / 2);
        const centerIsoY = (centerGridX + centerGridY) * (this.tileHeight / 2);
        
        // Position the grid so this center point is at the canvas center
        this.offsetX = this.canvas.width / 2 - centerIsoX;
        this.offsetY = this.canvas.height / 2 - centerIsoY;
    }
    
    toIsometric(col, row) {
        // True isometric projection: rotate square 45° and apply 2:1 foreshortening
        const isoX = (col - row) * (this.tileWidth / 2);
        const isoY = (col + row) * (this.tileHeight / 2);
        return {
            x: isoX + this.offsetX,
            y: isoY + this.offsetY
        };
    }
    
    fromIsometric(screenX, screenY) {
        const x = screenX - this.offsetX;
        const y = screenY - this.offsetY;
        
        // Reverse the isometric transformation
        const col = Math.round((x / (this.tileWidth / 2) + y / (this.tileHeight / 2)) / 2);
        const row = Math.round((y / (this.tileHeight / 2) - x / (this.tileWidth / 2)) / 2);
        
        if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
            return null;
        }
        
        return { row: row, col: col };
    }

    fromIsometricToEdge(screenX, screenY) {
        // Convert screen coordinates to detect edge parcels
        const x = screenX - this.offsetX;
        const y = screenY - this.offsetY;
        
        // Calculate precise position without rounding
        const preciseCol = (x / (this.tileWidth / 2) + y / (this.tileHeight / 2)) / 2;
        const preciseRow = (y / (this.tileHeight / 2) - x / (this.tileWidth / 2)) / 2;
        
        // Check if we're close to a grid line (edge)
        const tolerance = 0.15; // How close to a grid line to detect edge
        
        // Check for horizontal edges (between rows)
        const nearHorizontalEdge = Math.abs(preciseRow - Math.floor(preciseRow + 0.5)) > (0.5 - tolerance);
        const nearVerticalEdge = Math.abs(preciseCol - Math.floor(preciseCol + 0.5)) > (0.5 - tolerance);
        
        if (nearHorizontalEdge || nearVerticalEdge) {
            const baseRow = Math.floor(preciseRow);
            const baseCol = Math.floor(preciseCol);
            
            if (nearHorizontalEdge && nearVerticalEdge) {
                // Intersection
                const intersectionRow = Math.floor(preciseRow + 0.5);
                const intersectionCol = Math.floor(preciseCol + 0.5);
                
                if (intersectionRow >= 0 && intersectionRow < this.gridSize - 1 && 
                    intersectionCol >= 0 && intersectionCol < this.gridSize - 1) {
                    return {
                        type: 'intersection',
                        row: intersectionRow,
                        col: intersectionCol
                    };
                }
            } else if (nearHorizontalEdge) {
                // Horizontal edge
                const edgeRow = Math.round(preciseRow - 0.5);
                const edgeCol = Math.round(preciseCol);
                
                if (edgeRow >= 0 && edgeRow < this.gridSize - 1 && 
                    edgeCol >= 0 && edgeCol < this.gridSize) {
                    return {
                        type: 'horizontal',
                        row: edgeRow,
                        col: edgeCol
                    };
                }
            } else if (nearVerticalEdge) {
                // Vertical edge
                const edgeRow = Math.round(preciseRow);
                const edgeCol = Math.round(preciseCol - 0.5);
                
                if (edgeRow >= 0 && edgeRow < this.gridSize && 
                    edgeCol >= 0 && edgeCol < this.gridSize - 1) {
                    return {
                        type: 'vertical',
                        row: edgeRow,
                        col: edgeCol
                    };
                }
            }
        }
        
        return null; // Not on an edge
    }
    
    // drawTile method removed - now delegated to rendering system
    
    drawParcelBorders(row, col, tileWidth, tileHeight) {
        // Draw white lines where roads exist instead of black parcel borders
        if (!this.mobilityLayer || !this.mobilityLayer.roads) return;
        
        this.ctx.save();
        
        // Check each edge of the parcel for roads
        const edges = [
            { name: 'north', from: `${row},${col}`, to: `${row},${col+1}` },
            { name: 'east', from: `${row},${col+1}`, to: `${row+1},${col+1}` },
            { name: 'south', from: `${row+1},${col+1}`, to: `${row+1},${col}` },
            { name: 'west', from: `${row+1},${col}`, to: `${row},${col}` }
        ];
        
        edges.forEach(edge => {
            const edgeKey = `${edge.from}-${edge.to}`;
            const reverseEdgeKey = `${edge.to}-${edge.from}`;
            
            // Check if there's a road on this edge
            if (this.mobilityLayer.roads.has(edgeKey) || this.mobilityLayer.roads.has(reverseEdgeKey)) {
                // Draw white line for this edge
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                
                // Draw the specific edge with white
                switch(edge.name) {
                    case 'north':
                        this.ctx.moveTo(0, -tileHeight / 2);
                        this.ctx.lineTo(tileWidth / 2, 0);
                        break;
                    case 'east':
                        this.ctx.moveTo(tileWidth / 2, 0);
                        this.ctx.lineTo(0, tileHeight / 2);
                        break;
                    case 'south':
                        this.ctx.moveTo(0, tileHeight / 2);
                        this.ctx.lineTo(-tileWidth / 2, 0);
                        break;
                    case 'west':
                        this.ctx.moveTo(-tileWidth / 2, 0);
                        this.ctx.lineTo(0, -tileHeight / 2);
                        break;
                }
                this.ctx.stroke();
            }
        });
        
        this.ctx.restore();
    }

    // Draw only the elevated building portion (no ground tile)
    drawBuildingOnly(col, row, elevation) {
        const parcel = this.grid[row][col];
        if (!parcel || !parcel.building) return;
        
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;
        
        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);
        
        // Draw elevation sides if elevated
        if (elevation > 0) {
            // Left side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.moveTo(-this.tileWidth / 2, 0);
            this.ctx.lineTo(-this.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Right side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            this.ctx.beginPath();
            this.ctx.moveTo(this.tileWidth / 2, 0);
            this.ctx.lineTo(this.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Top face
            this.ctx.fillStyle = this.getTileColor(row, col);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -this.tileHeight / 2);
            this.ctx.lineTo(this.tileWidth / 2, 0);
            this.ctx.lineTo(0, this.tileHeight / 2);
            this.ctx.lineTo(-this.tileWidth / 2, 0);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        // Draw building
        if (this.currentLayer === 'normal') {
            this.renderingSystem.drawBuilding(parcel.building, 0, -this.tileHeight / 4, row, col);
        }
        
        this.ctx.restore();
    }






    // Infrastructure building methods with cost validation
    buildInfrastructure(edgeType, row, col, infrastructureType, value, playerId = 'player') {
        // Only allow infrastructure building in mobility layer
        if (this.currentLayer !== 'mobility') {
            this.showNotification('Switch to Mobility View to build infrastructure', 'error');
            return false;
        }
        
        // Check if player has enough money
        const cost = this.getInfrastructureCost(infrastructureType, value);
        if (this.playerData.cash < cost) {
            this.showNotification(`Not enough cash! Need $${cost}`, 'error');
            return false;
        }

        // Get the edge parcel
        let edgeParcel;
        if (edgeType === 'horizontal') {
            edgeParcel = this.edgeParcels.horizontal[row][col];
        } else if (edgeType === 'vertical') {
            edgeParcel = this.edgeParcels.vertical[row][col];
        } else if (edgeType === 'intersection') {
            edgeParcel = this.edgeParcels.intersections[row][col];
        }

        if (!edgeParcel) {
            this.showNotification('Invalid edge parcel', 'error');
            return false;
        }

        // Build the infrastructure
        const success = this.addInfrastructureToParcel(edgeParcel, infrastructureType, value, cost, playerId);
        
        if (success) {
            // Deduct cost from player
            this.playerData.cash -= cost;
            this.updatePlayerDisplay();
            // Visual confirmation via UI update - notification removed to reduce clutter
            this.scheduleRender();
            return true;
        }

        return false;
    }

    getInfrastructureCost(infrastructureType, value) {
        const costs = this.infrastructureCosts;
        
        switch (infrastructureType) {
            case 'roadway':
                return costs.roadway[value] || 0;
            case 'sidewalks':
                return costs.sidewalks;
            case 'bikelanes':
                return costs.bikelanes;
            case 'busStop':
                return costs.busStop;
            case 'subwayEntrance':
                return costs.subwayEntrance;
            case 'trafficControl':
                return costs.trafficControl[value] || 0;
            default:
                return 0;
        }
    }

    addInfrastructureToParcel(edgeParcel, infrastructureType, value, cost, playerId) {
        const infra = edgeParcel.infrastructure;

        switch (infrastructureType) {
            case 'roadway':
                if (infra.roadway) {
                    this.showNotification('Road already exists here', 'error');
                    return false;
                }
                infra.roadway = value;
                break;

            case 'sidewalks':
                if (infra.sidewalks) {
                    this.showNotification('Sidewalks already exist here', 'error');
                    return false;
                }
                infra.sidewalks = true;
                break;

            case 'bikelanes':
                if (infra.bikelanes) {
                    this.showNotification('Bike lanes already exist here', 'error');
                    return false;
                }
                infra.bikelanes = true;
                break;

            case 'busStop':
                if (infra.busStop) {
                    this.showNotification('Bus stop already exists here', 'error');
                    return false;
                }
                infra.busStop = {
                    type: 'standard',
                    direction: 'both',
                    builtBy: playerId,
                    cost: cost
                };
                break;

            case 'subwayEntrance':
                if (infra.subwayEntrance) {
                    this.showNotification('Subway entrance already exists here', 'error');
                    return false;
                }
                infra.subwayEntrance = {
                    type: 'standard',
                    direction: 'both',
                    builtBy: playerId,
                    cost: cost
                };
                break;

            case 'trafficControl':
                if (infra.trafficControl) {
                    this.showNotification('Traffic control already exists here', 'error');
                    return false;
                }
                infra.trafficControl = value;
                break;

            default:
                return false;
        }

        // Track total investment
        infra.totalInvestment += cost;
        return true;
    }

    // REMOVED: calculateConstructionProgress() - Now using unified getBuildingState() from buildings.js

    /**
     * Handle construction completion cleanup and notifications
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {Object} parcel - Parcel object
     */
    handleConstructionCompletion(row, col, parcel) {
        if (parcel._constructionStartTime !== null && !parcel._completionTriggered) {
            // Trigger the completion pop animation
            this.triggerCompletionPop(row, col);
            parcel._completionTriggered = true;
        }

        // Clear construction data
        parcel._constructionStartTime = null;
        parcel._constructionDays = 0;
        parcel._constructionAnimating = false;
        parcel._isUnderConstruction = false;
        parcel._constructionProgress = 1.0;

        // Clean up pixel row timestamps
        this.pixelRowTimestamps.delete(`${row},${col}`);

        // Update economic balance after construction completion (server-side)
        this.calculateCityVitality().catch(error => {
            console.error('Failed to update vitality after construction completion:', error);
        });
    }

    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row = 0, col = 0) {
        // DISABLED: Legacy hover elevation - replaced by ParcelSelectorManager
        // const isHovered = this.hoveredTile && this.hoveredTile.row === row && this.hoveredTile.col === col;
        // let elevation = isHovered ? this.currentElevation : 0;
        let elevation = 0; // No elevation for buildings
        let scale = 1.0;
        
        // No completion animations in simplified system
        
        // Get parcel to check construction status
        const parcel = this.grid[row][col];
        
        // Check if building has custom image
        const building = this.buildingManager.getBuildingById(buildingId);

        // Use unified building state from buildings.js
        const buildingState = this.buildingManager.getBuildingState(row, col);
        const constructionProgress = buildingState ? buildingState.construction.progress : 1.0;
        const isUnderConstruction = buildingState ? !buildingState.construction.isComplete : false;

        // Schedule frequent re-renders during construction for smooth animation
        if (isUnderConstruction && parcel && !parcel._constructionAnimating) {
            parcel._constructionAnimating = true;
            this.scheduleConstructionAnimation(row, col);
        }
        
        // Apply scale transformation if needed
        if (scale !== 1.0) {
            this.ctx.save();
            this.ctx.translate(offsetX, offsetY - elevation);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-offsetX, -(offsetY - elevation));
        }
        
        // No per-building filters - using overlay approach
        
        if (building && building.images && building.images.built) {
            // Draw custom building image with elevation
            this.drawBuildingImage(building.images.built, offsetX, offsetY - elevation, constructionProgress, row, col);
        } else {
            // Draw simple building representation with elevation
            if (building && Math.random() < 0.01) { // Debug log 1% of the time
            }
            this.drawSimpleBuilding(buildingId, offsetX, offsetY - elevation, constructionProgress, 0);
        }
        
        
        // Add visual indicators for buildings with unsatisfied JEFH needs
        this.drawJEFHWarningIndicators(buildingId, offsetX, offsetY - elevation, row, col);
        
        // Force cache refresh
        
        // Restore transformation
        if (scale !== 1.0) {
            this.ctx.restore();
        }
    }

    drawBuildingImage(imageSrc, offsetX, offsetY, constructionProgress = 1.0, row = 0, col = 0) {
        // Create image if not cached
        if (!this.buildingImageCache) {
            this.buildingImageCache = new Map();
        }
        
        let img = this.buildingImageCache.get(imageSrc);
        
        if (!img) {
            img = new Image();
            img.onload = () => {
                // Re-render when image loads
                this.scheduleRender();
            };
            img.onerror = () => {
                console.warn(`Failed to load building image: ${imageSrc}`);
                // Mark image as broken to avoid repeated attempts
                img.broken = true;
            };
            img.src = imageSrc;
            this.buildingImageCache.set(imageSrc, img);
            return; // Skip drawing until image loads
        }
        
        if (img.complete && !img.broken && img.naturalWidth > 0) {
            // Get adjustable building parameters (same as simple buildings)
            const yOffset = window.buildingPositionControls?.yOffset || 22;
            const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
            const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
            
            // Fill diamond width completely (left point to right point)
            const baseDrawWidth = this.tileWidth * widthMultiplier;
            const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;
            
            const imageY = offsetY + this.tileHeight/2 - baseDrawHeight + yOffset;
            
            // Apply construction animation - progressive opacity with desaturation  
            if (constructionProgress < 1.0) {
                // Progressive opacity from 10% to 100%
                const opacity = 0.1 + (constructionProgress * 0.9);
                
                this.ctx.save();
                this.ctx.globalAlpha = opacity;
                
                // Apply desaturation for under-construction look
                this.ctx.filter = 'brightness(0.6) saturate(0.3) sepia(0.4)';
                
                this.ctx.drawImage(img, 
                    offsetX - baseDrawWidth/2, 
                    offsetY + imageY, 
                    baseDrawWidth, 
                    baseDrawHeight
                );
                
                this.ctx.restore();
            } else {
                // Draw at full height (construction complete)
                
                // Get efficiency data for desaturation effect
                const efficiencyKey = `${row},${col}`;
                const efficiencyData = this.buildingEfficiencies?.get(efficiencyKey);
                let overallEfficiency = 1.0; // Default to full efficiency
                
                if (efficiencyData && efficiencyData.needs) {
                    // Calculate overall efficiency from JEFH satisfaction levels
                    const jefhCategories = ['jobs', 'education', 'food', 'housing'];
                    let totalSatisfaction = 0;
                    let countCategories = 0;
                    
                    jefhCategories.forEach(category => {
                        const need = efficiencyData.needs[category];
                        if (need && need.satisfaction !== undefined) {
                            totalSatisfaction += need.satisfaction;
                            countCategories++;
                        }
                    });
                    
                    if (countCategories > 0) {
                        overallEfficiency = totalSatisfaction / countCategories;
                        // Clamp between 0.0 (completely desaturated) and 1.0 (full color)
                        overallEfficiency = Math.max(0.0, Math.min(1.0, overallEfficiency));
                    }
                }
                
                // Apply 2D visual effects: brightness for efficiency, color tint for decay
                // Get decay data for this building
                const parcelKey = `${row}-${col}`;
                const parcel = this.grid[row] && this.grid[row][col];
                const decayLevel = parcel?.decay || 0; // 0 = new, 1 = fully decayed
                
                // Calculate visual effects
                const brightness = 0.5 + (overallEfficiency * 0.5); // Range: 0.5 to 1.0 (50% to 100%)
                const redTint = decayLevel * 0.3; // Range: 0 to 0.3 red tint for high decay
                const saturation = 1.0 - (decayLevel * 0.4); // Range: 1.0 to 0.6 (less saturated = more decayed)
                
                // Apply CSS-style filters using canvas
                this.ctx.filter = `brightness(${brightness}) saturate(${saturation}) sepia(${redTint}) hue-rotate(350deg)`;
                
                // Check for completion pop animation
                const completionPopScale = this.getCompletionPopScale(row, col);
                
                if (completionPopScale > 1.0) {
                    // Apply completion pop effect (5% size increase)
                    this.ctx.save();
                    const centerX = offsetX;
                    const centerY = imageY + baseDrawHeight/2;
                    this.ctx.translate(centerX, centerY);
                    this.ctx.scale(completionPopScale, completionPopScale);
                    this.ctx.translate(-centerX, -centerY);
                }
                
                // Draw building with visual effects
                this.ctx.drawImage(
                    img, 
                    offsetX - baseDrawWidth/2, 
                    imageY, 
                    baseDrawWidth, 
                    baseDrawHeight
                );
                
                if (completionPopScale > 1.0) {
                    this.ctx.restore();
                }
                
                // Reset filter for subsequent drawing operations
                this.ctx.filter = 'none';
            }
        }
    }

    getCompletionPopScale(row, col) {
        const parcel = this.grid[row][col];
        if (!parcel || !parcel._completionPopStartTime) {
            return 1.0; // No pop animation
        }
        
        const currentTime = performance.now();
        const elapsed = currentTime - parcel._completionPopStartTime;
        const popDuration = 300; // 300ms pop animation
        
        if (elapsed > popDuration) {
            // Animation complete - clean up
            delete parcel._completionPopStartTime;
            return 1.0;
        }
        
        // Create a quick bounce effect: scale up 5% then back down
        const progress = elapsed / popDuration;
        const bounceScale = Math.sin(progress * Math.PI) * 0.05; // 0 to 0.05 to 0
        return 1.0 + bounceScale;
    }
    
    triggerCompletionPop(row, col) {
        const parcel = this.grid[row][col];
        if (parcel) {
            parcel._completionPopStartTime = performance.now();
            // Schedule re-renders during animation
            const animationInterval = setInterval(() => {
                this.redrawCanvas();
                if (!parcel._completionPopStartTime) {
                    clearInterval(animationInterval);
                }
            }, 16); // ~60fps
        }
    }

    
    adjustColorBrightness(color, brightness) {
        if (brightness >= 1.0) return color;
        
        // Parse hex color
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        // Apply brightness
        const newR = Math.floor(r * brightness);
        const newG = Math.floor(g * brightness);
        const newB = Math.floor(b * brightness);
        
        return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    drawSimpleBuilding(buildingId, offsetX, offsetY, constructionProgress = 1.0, brightness = 1.0) {
        // Simple colored rectangle for default buildings
        const buildingColors = {
            'education': '#3b82f6',
            'healthcare': '#ef4444', 
            'infrastructure': '#6b7280',
            'housing': '#8b5cf6',
            'culture': '#ec4899',
            'recreation': '#22c55e',
            'commercial': '#f59e0b',
            'civic': '#14b8a6'
        };
        
        // Get building category
        const category = this.buildingManager.getBuildingCategory(buildingId) || 'civic';
        
        const color = buildingColors[category] || '#6b7280';
        
        // Get adjustable building parameters (with defaults)
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        
        // Rectangle dimensions with multipliers
        const width = this.tileWidth * widthMultiplier;
        const height = this.tileHeight * heightMultiplier;
        
        // Position rectangle so bottom edge touches diamond's bottom point (with Y offset)
        // Diamond bottom point is at offsetY + tileHeight/2
        // Rectangle top-left Y coordinate should be: bottom point - building height + yOffset
        const buildingY = offsetY + this.tileHeight/2 - height + yOffset;
        
        // Apply construction animation - bottom-up reveal with brightness
        const adjustedColor = this.adjustColorBrightness(color, brightness);
        this.ctx.fillStyle = adjustedColor;
        
        if (constructionProgress < 1.0) {
            // Progressive opacity from 10% to 100%
            const opacity = 0.1 + (constructionProgress * 0.9);
            
            this.ctx.save();
            this.ctx.globalAlpha = opacity;
            
            // Apply desaturation for under-construction look
            this.ctx.filter = 'brightness(0.6) saturate(0.3) sepia(0.4)';
            
            this.ctx.fillRect(offsetX - width/2, buildingY, width, height);

            // Reset filter before restoring context
            this.ctx.filter = 'none';
            this.ctx.restore();
        } else {
            // Draw full building (construction complete)
            this.ctx.fillRect(offsetX - width/2, buildingY, width, height);
        }
        
        // Add border (white for normal, gray for under construction)
        this.ctx.strokeStyle = constructionProgress < 1.0 ? '#666666' : '#ffffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(offsetX - width/2, buildingY, width, height);
    }
    
    drawJEFHWarningIndicators(buildingId, offsetX, offsetY, row, col) {
        // DISABLED: Duplicate warning system - rendering-system.js handles warnings
        // Legacy warning system replaced by server-side needs satisfaction
        return;

        // Don't show indicators for buildings under construction
        const parcel = this.grid[row][col];
        if (parcel?._isUnderConstruction) {
            return; // Hide indicators during construction
        }
        
        // Get building efficiency data
        const key = `${row},${col}`;
        const efficiencyData = this.buildingEfficiencies?.get(key);
        
        if (!efficiencyData || !efficiencyData.needs) {
            return; // No efficiency data available
        }
        
        // Check satisfaction levels for JEFH categories
        const jefhCategories = ['jobs', 'education', 'food', 'housing'];
        const warningThreshold = 0.6; // Show warnings when satisfaction < 60%
        const criticalThreshold = 0.3; // Critical level < 30%
        
        const warnings = [];
        jefhCategories.forEach(category => {
            const need = efficiencyData.needs[category];
            if (need && need.satisfaction < warningThreshold) {
                warnings.push({
                    category,
                    satisfaction: need.satisfaction,
                    critical: need.satisfaction < criticalThreshold
                });
            }
        });
        
        
        if (warnings.length === 0) {
            return; // No warnings to display
        }
        
        // Show only the MOST critical indicator - find worst satisfaction level
        let mostCritical = warnings[0];
        for (let i = 1; i < warnings.length; i++) {
            if (warnings[i].satisfaction < mostCritical.satisfaction) {
                mostCritical = warnings[i];
            }
        }
        
        // Check if this is a workplace building for worker indicator display
        const building = this.buildingManager.getBuildingById(buildingId);
        const isWorkplace = building && (this.buildingCategories.normalize(building.category) === 'commercial' || building.category === 'education');
        
        // Draw single warning indicator (most critical)
        this.ctx.save();
        
        const indicatorSize = 8;
        const x = offsetX - indicatorSize / 2; // Center horizontally
        
        // Static Y position based on severity
        const severityOffset = mostCritical.critical ? -8 : 0; // Critical issues higher up
        const y = offsetY - 25 + severityOffset;
        
        // Choose color based on severity
        const color = mostCritical.critical ? '#ff4444' : '#ffaa00';
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        
        if (mostCritical.critical) {
            // Draw triangle for critical warnings
            this.ctx.beginPath();
            this.ctx.moveTo(x + indicatorSize / 2, y);
            this.ctx.lineTo(x, y + indicatorSize);
            this.ctx.lineTo(x + indicatorSize, y + indicatorSize);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            // Add exclamation mark
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '6px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('!', x + indicatorSize / 2, y + indicatorSize - 2);
        } else {
            // Draw circle for regular warnings
            this.ctx.beginPath();
            this.ctx.arc(x + indicatorSize / 2, y + indicatorSize / 2, indicatorSize / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Add letter based on category
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '5px Arial';
            this.ctx.textAlign = 'center';
            
            // Show 'W' for workers when housing represents worker need
            let displayLetter = mostCritical.category[0].toUpperCase();
            if (mostCritical.category === 'housing' && isWorkplace) {
                displayLetter = 'W'; // Workers
            }
            
            this.ctx.fillText(displayLetter, x + indicatorSize / 2, y + indicatorSize / 2 + 2);
        }
        
        this.ctx.restore();
    }
    
    getJEFHAnalysis(row, col) {
        const key = `${row},${col}`;
        const efficiencyData = this.buildingEfficiencies?.get(key);
        
        if (!efficiencyData || !efficiencyData.needs) {
            return { hasIssues: false, issues: [] };
        }
        
        const issues = [];
        const jefhCategories = ['jobs', 'education', 'food', 'housing'];
        const warningThreshold = 0.6;
        
        jefhCategories.forEach(category => {
            const need = efficiencyData.needs[category];
            if (need && need.satisfaction < warningThreshold) {
                const satisfactionPercent = Math.round(need.satisfaction * 100);
                const resourceAnalysis = this.analyzeResourceAccess(row, col, category);
                
                // For commercial/education buildings, "housing" need means "workers" need
                const building = this.buildingManager.getBuildingById(efficiencyData.building);
                const isWorkplace = building && (this.buildingCategories.normalize(building.category) === 'commercial' || building.category === 'education');
                const needsWorkers = category === 'housing' && isWorkplace;
                
                let displayName, reason;
                if (needsWorkers) {
                    displayName = 'Workers';
                    if (resourceAnalysis.totalAvailable === 0) {
                        reason = `No housing available in ${this.getCityName()}`;
                    } else if (resourceAnalysis.withinWalking === 0) {
                        reason = `No housing accessible`;
                    } else {
                        reason = `Worker demand exceeds supply`;
                    }
                } else {
                    displayName = category.charAt(0).toUpperCase() + category.slice(1);
                    if (resourceAnalysis.totalAvailable === 0) {
                        reason = `No ${category} available in ${this.getCityName()}`;
                    } else if (resourceAnalysis.withinWalking === 0) {
                        reason = `No ${category} accessible`;
                    } else {
                        reason = `${category} demand exceeds supply`;
                    }
                }
                
                // Format: "Workers: 0% (No housing accessible)" or "Jobs: 0% (No jobs accessible)"
                issues.push(`${displayName}: ${satisfactionPercent}% (${reason})`);
            }
        });
        
        return {
            hasIssues: issues.length > 0,
            issues
        };
    }
    
    analyzeResourceAccess(row, col, resource) {
        let withinWalking = 0;
        let totalAvailable = 0;
        
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const parcel = this.grid[r][c];
                if (parcel?.building) {
                    // Skip buildings under construction
                    if (parcel._isUnderConstruction) continue;
                    
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    const supply = this.getBuildingSupply(building, resource);
                    
                    if (supply > 0) {
                        totalAvailable += supply;
                        
                        // Check if within walking distance (Chebyshev distance <= 1)
                        const distance = Math.max(Math.abs(row - r), Math.abs(col - c));
                        if (distance <= 1) {
                            withinWalking += supply;
                        }
                    }
                }
            }
        }
        
        return { withinWalking, totalAvailable };
    }
    
    getBuildingSupply(building, resource) {
        if (!building) return 0;
        
        switch (resource) {
            case 'jobs':
                return building.population?.jobsCreated || 0;
            case 'education':
                return building.population?.schoolCapacity || 0;
            case 'food':
                return building.resources?.foodProduction || 0;
            case 'housing':
                return building.population?.bedroomsAdded || 0;
            default:
                return 0;
        }
    }
    
    getJEFHEmoji(category) {
        const emojis = {
            'jobs': '💼',
            'education': '🏫',
            'food': '🍎',
            'housing': '👥' // Use people emoji when housing represents workers
        };
        return emojis[category] || '❓';
    }
    
    getCityName() {
        // Get city name from the DOM or return default
        const cityNameEl = document.getElementById('city-name');
        return cityNameEl?.textContent || 'the city';
    }
    
    getTileColor(row, col) {
        const parcel = this.grid[row][col];
        
        // Switch based on current map layer
        switch (this.currentLayer) {
            case 'landvalue':
                return this.getLandValueHeatmapColor(row, col);
            case 'cashflow':
                return this.getCashflowHeatmapColor(row, col);
            case 'mobility':
                return this.getMobilityLayerColor(row, col);
            case 'normal':
            default:
                // Original logic for normal view
                if (parcel.building) {
                    return '#2a2a2a'; // Standard ground color
                }
                
                // Base parcel color based on ownership (only for empty parcels)
                if (!parcel.owner) {
                    return '#2a2a2a'; // Unowned - gray
                } else if (this.isCurrentPlayer(parcel.owner)) {
                    // Use player's selected color with transparency
                    if (this.playerSettings && this.playerSettings.color) {
                        const hex = this.playerSettings.color.replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16);
                        const g = parseInt(hex.substr(2, 2), 16);
                        const b = parseInt(hex.substr(4, 2), 16);
                        return `rgba(${r}, ${g}, ${b}, 0.4)`;
                    }
                    return 'rgba(255, 255, 255, 0.4)'; // Fallback to white
                } else {
                    return this.getCompetitorColor(parcel.owner); // Competitor owned - assigned colors
                }
        }
    }
    
    
    getMobilityLayerColor(row, col) {
        const parcel = this.grid[row][col];
        
        // Show ownership with clear colors for better visibility
        if (!parcel.owner) {
            return '#1a1a1a'; // Dark gray for unowned
        } else if (this.isCurrentPlayer(parcel.owner)) {
            // Use player's selected color with higher opacity for better visibility
            if (this.playerSettings && this.playerSettings.color) {
                const hex = this.playerSettings.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, 0.6)`;
            }
            return 'rgba(255, 255, 255, 0.6)'; // Fallback
        } else {
            // Competitor colors with better visibility
            const competitorColor = this.getCompetitorColor(parcel.owner);
            // Convert hex to rgba with 0.6 opacity for consistency
            if (competitorColor.startsWith('#')) {
                const hex = competitorColor.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, 0.6)`;
            }
            return competitorColor;
        }
    }
    
    getLandValueHeatmapColor(row, col) {
        const parcel = this.grid[row][col];

        // Get land value based on current mode
        let landValue;
        if (this.landValueMode === 'paid') {
            // Use most recently paid price
            landValue = this.getParcelPrice(row, col);
        } else {
            // Use estimated/calculated land value
            landValue = parcel?.landValue?.calculatedValue || this.getParcelPrice(row, col);
        }

        // Handle edge cases
        if (!landValue || landValue <= 0) {
            return '#2a2a2a'; // Neutral gray for no value
        }

        // Calculate global land value range for normalization based on current mode
        let minValue = Infinity;
        let maxValue = 0;

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const p = this.grid[r][c];
                let value;
                if (this.landValueMode === 'paid') {
                    value = this.getParcelPrice(r, c);
                } else {
                    value = p?.landValue?.calculatedValue || this.getParcelPrice(r, c);
                }
                if (value > 0) {
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }
            }
        }
        
        // Handle case where no valid values found
        if (minValue === Infinity || maxValue === 0 || maxValue <= minValue) {
            return '#2a2a2a'; // Default gray
        }
        
        // Normalize value to 0-1 range
        const normalizedValue = (landValue - minValue) / (maxValue - minValue);
        
        // Create heatmap: blue (low) to yellow (medium) to red (high)
        if (normalizedValue < 0.5) {
            // Blue to yellow transition
            const ratio = normalizedValue * 2;
            const r = Math.round(ratio * 255);
            const g = Math.round(ratio * 255);
            const b = Math.round((1 - ratio) * 255);
            return `rgb(${r}, ${g}, ${b})`;
        } else {
            // Yellow to red transition
            const ratio = (normalizedValue - 0.5) * 2;
            const r = 255;
            const g = Math.round((1 - ratio) * 255);
            const b = 0;
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    
    getCashflowHeatmapColor(row, col) {
        const cashflow = this.getParcelCashflow(row, col);
        
        // Handle edge cases
        if (cashflow === 0) {
            return '#2a2a2a'; // Neutral gray for zero cashflow
        }
        
        // Calculate global cashflow range for normalization
        let minCashflow = 0;
        let maxCashflow = 0;
        
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cf = this.getParcelCashflow(r, c);
                minCashflow = Math.min(minCashflow, cf);
                maxCashflow = Math.max(maxCashflow, cf);
            }
        }
        
        // If no variation, return neutral
        if (minCashflow === 0 && maxCashflow === 0) {
            return '#2a2a2a';
        }
        
        // Generate color based on cashflow
        if (cashflow > 0) {
            // Positive cashflow: blue scale
            const intensity = Math.min(cashflow / maxCashflow, 1);
            const blueValue = Math.round(intensity * 200 + 55); // 55-255 range
            return `rgb(0, 0, ${blueValue})`;
        } else {
            // Negative cashflow: red scale
            const intensity = Math.min(Math.abs(cashflow) / Math.abs(minCashflow), 1);
            const redValue = Math.round(intensity * 200 + 55); // 55-255 range
            return `rgb(${redValue}, 0, 0)`;
        }
    }
    
    getParcelCashflow(row, col) {
        const parcel = this.grid[row][col];
        if (!parcel || !parcel.building || !parcel.owner) return 0;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        if (!building) return 0;
        
        // Calculate revenue (accounting for decay)
        const maxRevenue = building.economics.maxRevenue || 0;
        const decay = parcel.decay || 0;
        const decayMultiplier = Math.max(0, 1 - decay);
        let revenue = maxRevenue * decayMultiplier;
        
        // Calculate maintenance costs using exponential decay formula
        const baseMaintenance = building.economics.maintenanceCost || 0;
        const decayRate = building.economics.decayRatePercent ? building.economics.decayRatePercent / 100 : 0.001;
        const buildingAgeInDays = parcel.buildingAge || 0;
        const maintenanceMultiplier = Math.pow(1 + decayRate, buildingAgeInDays);
        let maintenanceCost = baseMaintenance * maintenanceMultiplier;
        
        // Note: Amenities in the current system don't have revenue/maintenance data
        // They only provide city vitality impacts, not direct economic benefits
        
        // Calculate land tax if owned by player
        let landTax = 0;
        if (this.isCurrentPlayer(parcel.owner)) {
            // Use dynamic LVT rate from governance system
            const annualLVTRate = this.governanceSystem ? this.governanceSystem.getCurrentLVTRate() : 0.50;
            const dailyLVTRate = annualLVTRate / 365;
            landTax = parcel.landValue.paidPrice * dailyLVTRate;
        }
        
        return revenue - maintenanceCost - landTax;
    }
    
    // drawCashflowNumbers() moved to RenderingSystem
    // drawCashflowNumber() moved to RenderingSystem
    
    
    
    drawParcelLandValues() {
        // Draw land values on each parcel in transportation mode
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                const landValue = Math.max(parcel.landValue.paidPrice, parcel.landValue.calculatedValue);
                
                if (landValue > 0) {
                    const iso = this.toIsometric(col, row);
                    this.drawParcelLandValue(iso.x, iso.y, landValue);
                }
            }
        }
    }
    
    drawParcelLandValue(x, y, landValue) {
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Format the land value
        const formatted = landValue >= 1000 ? `$${(landValue/1000).toFixed(0)}k` : `$${landValue.toFixed(0)}`;
        
        // Set text properties - smaller font for transportation mode
        this.ctx.font = '8px SF Mono, Monaco, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // White text with dark shadow for readability
        this.ctx.fillStyle = '#ffffff';
        
        // Add text shadow for better readability
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        // Draw the land value
        this.ctx.fillText(formatted, 0, 0);
        
        this.ctx.restore();
    }
    
    getCompetitorColor(ownerId) {
        const competitorColors = {
            'competitor1': '#3a1a2a', // Dark red
            'competitor2': '#1a2a3a', // Dark blue  
            'competitor3': '#2a3a1a', // Dark green
            'competitor4': '#3a2a1a', // Dark orange
            'competitor5': '#2a1a3a', // Dark purple
            'competitor6': '#1a3a2a', // Dark teal
        };
        return competitorColors[ownerId] || '#3a1a1a'; // Default dark brown
    }
    
    // Optimized render with frame rate limiting
    scheduleRender() {
        if (this.isRenderScheduled) return;
        
        this.isRenderScheduled = true;
        requestAnimationFrame((timestamp) => {
            // Frame rate limiting
            if (timestamp - this.lastRenderTime >= this.frameInterval) {
                this.render();
                this.lastRenderTime = timestamp;
            } else {
                // Re-schedule for next frame
                this.isRenderScheduled = false;
                this.scheduleRender();
                return;
            }
            this.isRenderScheduled = false;
        });
    }

    render() {
        // Delegate to rendering system
        this.renderingSystem.render();

        // Update building visual feedback
        if (this.buildingVisualFeedback) {
            const deltaTime = 16; // Approximate 60fps frame time
            this.buildingVisualFeedback.update(deltaTime);
        }
    }
    
    // Keep drawScene for backward compatibility
    drawScene() {
        // Delegate to rendering system
        this.renderingSystem.drawScene();
    }
    
    // Keep scheduleRender for backward compatibility  
    scheduleRender() {
        this.renderingSystem.scheduleRender();
    }
    
    // Delegate other rendering methods
    drawTile(col, row, color, elevation) {
        return this.renderingSystem.drawTile(col, row, color, elevation);
    }
    
    toIsometric(col, row) {
        return this.renderingSystem.toIsometric(col, row);
    }
    
    fromIsometric(x, y) {
        return this.renderingSystem.fromIsometric(x, y);
    }
    
    // renderOld method removed - functionality moved to rendering system
    
    // Performance optimization methods
    markRegionDirty(row, col, radius = 2) {
        // Mark affected regions as needing recalculation
        for (let r = Math.max(0, row - radius); r <= Math.min(this.gridSize - 1, row + radius); r++) {
            for (let c = Math.max(0, col - radius); c <= Math.min(this.gridSize - 1, col + radius); c++) {
                const key = `${r}-${c}`;
                this.dirtyRegions.add(key);
                this.landValueCache.delete(key);
                this.accessibilityCache.delete(key);
            }
        }
    }
    
    clearCachesIfStale() {
        const now = performance.now();
        // Clear all caches every 30 seconds to prevent memory leaks
        if (now - this.lastCacheUpdate > 30000) {
            this.landValueCache.clear();
            this.accessibilityCache.clear();
            this.dirtyRegions.clear();
            this.lastCacheUpdate = now;
        }
    }
    
    // Legacy drawScene method removed - now handled by rendering system delegation
    
    
    // Optimized tile drawing with reduced save/restore calls
    drawTileOptimized(col, row, color, elevation = 0) {
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;
        
        // Cache the current transform state instead of save/restore
        const currentTransform = this.ctx.getTransform();
        this.ctx.translate(iso.x, adjustedY);
        
        // Draw diamond-shaped tile (rotated square)
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.tileHeight / 2);  // top
        this.ctx.lineTo(this.tileWidth / 2, 0);    // right
        this.ctx.lineTo(0, this.tileHeight / 2);   // bottom
        this.ctx.lineTo(-this.tileWidth / 2, 0);   // left
        this.ctx.closePath();
        
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        // this.ctx.strokeStyle = '#1a1a1a';
        // this.ctx.lineWidth = 0.5;
        // this.ctx.stroke();
        
        // Draw elevation sides if elevated
        if (elevation > 0) {
            // Left side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.moveTo(-this.tileWidth / 2, 0);
            this.ctx.lineTo(-this.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Right side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            this.ctx.beginPath();
            this.ctx.moveTo(this.tileWidth / 2, 0);
            this.ctx.lineTo(this.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        // Draw building if present (only on normal layer)
        const parcel = this.grid[row][col];
        if (parcel && parcel.building && this.currentLayer === 'normal') {
            this.renderingSystem.drawBuilding(parcel.building, 0, -this.tileHeight / 4, row, col);
        }
        
        // Restore transform
        this.ctx.setTransform(currentTransform);
    }
    
    // Update parcel illumination to show building influence radius
    updateParcelIllumination(cursorTile) {
        if (!cursorTile) {
            // Clear any existing hover effects
            this.hoverInfluenceRadius = null;
            this.scheduleRender();
            return;
        }
        
        // Calculate influence radius for the hovered parcel
        this.hoverInfluenceRadius = this.calculateHoverInfluenceRadius(cursorTile.row, cursorTile.col);
        this.scheduleRender();
    }
    
    // Calculate the influence radius for hover effects (8 adjacent + road connections)
    calculateHoverInfluenceRadius(row, col) {
        const influencedTiles = new Set();
        
        // Always include the 8 adjacent parcels (basic radius - yellow)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const newRow = row + dr;
                const newCol = col + dc;
                
                if (newRow >= 0 && newRow < this.gridSize && 
                    newCol >= 0 && newCol < this.gridSize) {
                    // Skip center tile (that's the main hover)
                    if (dr === 0 && dc === 0) continue;
                    
                    influencedTiles.add(`${newRow},${newCol}`);
                }
            }
        }
        
        // Get all parcels connected via roads using a simpler approach
        const roadConnectedParcels = this.getRoadConnectedParcels(row, col);
        
        // Add road-connected parcels that aren't already in basic radius
        roadConnectedParcels.forEach(parcelKey => {
            if (!influencedTiles.has(parcelKey)) {
                influencedTiles.add(`${parcelKey}:extended`);
            }
        });
        
        return influencedTiles;
    }
    
    // Get all parcels connected to this position via roads (simplified)
    getRoadConnectedParcels(startRow, startCol) {
        const connectedParcels = new Set();
        const transportNetwork = this.buildTransportNetwork();
        
        // If no roads exist, return empty set
        if (!transportNetwork.roads || transportNetwork.roads.size === 0) {
            return connectedParcels;
        }
        
        // Use BFS to find all connected parcels via roads
        const visited = new Set();
        const queue = [`${startRow},${startCol}`];
        visited.add(`${startRow},${startCol}`);
        
        while (queue.length > 0) {
            const currentKey = queue.shift();
            const [currentRow, currentCol] = currentKey.split(',').map(Number);
            
            // Check all parcels in the grid to see if they're connected to current position
            for (let r = 0; r < this.gridSize; r++) {
                for (let c = 0; c < this.gridSize; c++) {
                    const targetKey = `${r},${c}`;
                    
                    if (visited.has(targetKey)) continue;
                    
                    // Check if there's a direct road connection
                    if (this.hasDirectRoadConnection(currentRow, currentCol, r, c, transportNetwork.roads)) {
                        visited.add(targetKey);
                        queue.push(targetKey);
                        connectedParcels.add(targetKey);
                    }
                }
            }
        }
        
        return connectedParcels;
    }
    
    // Check if two parcels have a direct road connection
    hasDirectRoadConnection(row1, col1, row2, col2, roads) {
        const key1 = `${row1},${col1}`;
        const key2 = `${row2},${col2}`;
        
        // Check if either parcel connects to the other
        const connections1 = roads.get(key1) || [];
        const connections2 = roads.get(key2) || [];
        
        return connections1.some(conn => conn.row === row2 && conn.col === col2) ||
               connections2.some(conn => conn.row === row1 && conn.col === col1);
    }
    

    // Draw green attenuation visualization for Data Insights
    drawAttenuationVisualization() {
        if (!this.attenuationCenter) return;

        const { row: centerRow, col: centerCol } = this.attenuationCenter;
        const parcel = this.grid[centerRow][centerCol];
        if (!parcel || !parcel.building) return;

        // Get building data to get attenuation info
        const buildingData = this.getBuildingDataByName(parcel.building);
        if (!buildingData || !buildingData.livability) return;

        this.ctx.save();

        // Calculate maximum attenuation distance from all CARENS impacts
        let maxAttenuation = 1;
        Object.values(buildingData.livability).forEach(livabilityData => {
            if (livabilityData && typeof livabilityData.attenuation === 'number') {
                maxAttenuation = Math.max(maxAttenuation, livabilityData.attenuation);
            }
        });

        // Draw 6-step gradient around the building
        for (let step = 6; step >= 1; step--) {
            const distance = (step / 6) * maxAttenuation;
            const alpha = (7 - step) * 0.08; // Fade from 0.48 to 0.08

            // Draw all tiles within this distance
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    const dr = row - centerRow;
                    const dc = col - centerCol;
                    const tileDistance = Math.sqrt(dr * dr + dc * dc);

                    if (tileDistance <= distance && tileDistance > distance - (maxAttenuation / 6)) {
                        this.drawTileHighlight(col, row, `rgba(76, 175, 80, ${alpha})`, 0);
                    }
                }
            }
        }

        // Highlight the center building with a bright green outline
        this.drawTileHighlight(centerCol, centerRow, `rgba(76, 175, 80, 0.8)`, 0);

        this.ctx.restore();
    }

    // Depth-of-field rendering with tilt-shift blur
    // REMOVED - No longer using blur for performance
    /*
    renderWithDepthOfField() {
        if (!this.hoveredTile) {
            // No hover - render normally without blur effect
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    const tile = this.grid[row][col];
                    if (tile) {
                        this.drawTile(col, row, this.getTileColor(row, col), tile.elevation);
                    }
                }
            }
            return;
        }

        // Fast approach: pre-rendered blur + depth-ordered sharp focused building
        const focusRow = this.hoveredTile.row;
        const focusCol = this.hoveredTile.col;
        
        // Step 1: Draw the pre-rendered blurred background with blur
        if (this.blurredBackgroundReady) {
            this.ctx.save();
            this.ctx.filter = `blur(2.5px)`;
            this.ctx.drawImage(this.backgroundBlurCanvas, 0, 0);
            this.ctx.filter = 'none';
            this.ctx.restore();
        }
        
        // Step 2: Render focused building at correct depth without breaking layer order
        // First pass: render all tiles up to (but not including) the focused tile depth
        const focusDepth = focusRow + focusCol;
        
        for (let depth = 0; depth < focusDepth; depth++) {
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    if (row + col !== depth) continue;
                    
                    const tile = this.grid[row][col];
                    if (!tile) continue;
                    
                    // Draw any non-focused buildings at this depth that aren't in background
                    if (!(row === focusRow && col === focusCol)) {
                        // These should already be in blurred background, skip
                    }
                }
            }
        }
        
        // Second pass: render the focused building at its exact depth
        const focusedTile = this.grid[focusRow][focusCol];
        if (focusedTile) {
            this.drawTile(focusCol, focusRow, this.getTileColor(focusRow, focusCol), focusedTile.elevation);
        }
        
        // Third pass: render all tiles that should appear in front of the focused tile
        for (let depth = focusDepth + 1; depth < this.gridSize * 2; depth++) {
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    if (row + col !== depth) continue;
                    
                    const tile = this.grid[row][col];
                    if (!tile || !tile.building) continue;
                    
                    // Draw buildings that should appear in front, blurred and without hover effects
                    this.ctx.save();
                    this.ctx.filter = `blur(2.5px)`;
                    
                    // Temporarily disable hover effects for buildings in front
                    const originalHovered = this.hoveredTile;
                    this.hoveredTile = null;
                    
                    this.drawTile(col, row, this.getTileColor(row, col), tile.elevation);
                    
                    // Restore hover state
                    this.hoveredTile = originalHovered;
                    this.ctx.filter = 'none';
                    this.ctx.restore();
                }
            }
        }
    }
    */
    
    // Pre-render the entire scene to blur canvas (without the currently hovered building)
    // REMOVED - No longer using blur for performance
    /*
    prerenderBlurredBackground() {
        if (!this.hoveredTile) {
            this.blurredBackgroundReady = false;
            return;
        }
        
        this.backgroundBlurCanvas.width = this.canvas.width;
        this.backgroundBlurCanvas.height = this.canvas.height;
        
        this.backgroundBlurCtx.clearRect(0, 0, this.backgroundBlurCanvas.width, this.backgroundBlurCanvas.height);
        
        // Temporarily switch to blur canvas context
        const originalCtx = this.ctx;
        this.ctx = this.backgroundBlurCtx;
        
        // First render ground spaces except under the hovered building
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                // Skip ground space under hovered building
                if (row === this.hoveredTile.row && col === this.hoveredTile.col) continue;
                
                // Draw ground space only
                this.drawTile(col, row, this.getTileColor(row, col), 0);
            }
        }
        
        // Then render buildings except the hovered one (blur will be applied when drawing to main canvas)
        for (let depth = 0; depth < this.gridSize * 2; depth++) {
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    if (row + col !== depth) continue;
                    
                    const tile = this.grid[row][col];
                    if (tile && !(row === this.hoveredTile.row && col === this.hoveredTile.col)) {
                        // Draw building with elevation but no ground
                        if (tile.elevation > 0) {
                            this.drawBuildingOnly(col, row, tile.elevation);
                        }
                    }
                }
            }
        }
        
        // Switch back to original context
        this.ctx = originalCtx;
        this.blurredBackgroundReady = true;
    }
    
    // Update the blurred background when hover changes
    updateBlurredBackground() {
        this.prerenderBlurredBackground();
    }
    */
    
    
    
    // Simple bouncing ball physics for hover elevation
    startBounceAnimation() {
        if (this.bounceAnimation) {
            cancelAnimationFrame(this.bounceAnimation);
        }
        
        // Reset to ground level when starting new animation
        this.currentElevation = 0;
        
        // Initial upward velocity (like a ball being dropped upward)
        this.elevationVelocity = 0.8; // Start with upward velocity
        
        const animate = () => {
            if (!this.hoveredTile) {
                this.currentElevation = 0;
                this.bounceAnimation = null;
                return;
            }
            
            // Physics simulation
            const gravity = 0.05; // Gravity pulls down
            const damping = 0.85; // Energy loss on bounce
            const ground = 0; // Ground level
            
            // Update velocity and position
            this.elevationVelocity -= gravity; // Gravity
            this.currentElevation += this.elevationVelocity;
            
            // Bounce when hitting the target elevation (like a rubber ball)
            if (this.currentElevation >= this.hoverElevation) {
                this.currentElevation = this.hoverElevation;
                this.elevationVelocity = -Math.abs(this.elevationVelocity) * damping; // Reverse and dampen
            }
            
            // Settle when velocity is very small
            if (Math.abs(this.elevationVelocity) < 0.02 && 
                Math.abs(this.currentElevation - this.hoverElevation) < 0.5) {
                this.currentElevation = this.hoverElevation;
                this.elevationVelocity = 0;
                // Start continuous bobbing
                this.startContinuousBob();
                return;
            }
            
            this.scheduleRender();
            
            // Continue animation if still bouncing
            if (Math.abs(this.elevationVelocity) > 0.01) {
                this.bounceAnimation = requestAnimationFrame(animate);
            } else {
                // Start continuous bobbing when done bouncing
                this.startContinuousBob();
            }
        };
        
        this.bounceAnimation = requestAnimationFrame(animate);
    }
    
    // Gentle continuous bobbing while hovering
    startContinuousBob() {
        if (this.bounceAnimation) {
            cancelAnimationFrame(this.bounceAnimation);
        }
        
        const startTime = performance.now();
        
        const bob = () => {
            if (!this.hoveredTile) {
                return;
            }
            
            const elapsed = performance.now() - startTime;
            const bobOffset = Math.sin(elapsed * this.bobSpeed) * this.bobAmount;
            this.currentElevation = this.liftAmount + bobOffset; // Lift + bob motion
            
            this.scheduleRender();
            this.bounceAnimation = requestAnimationFrame(bob);
        };
        
        this.bounceAnimation = requestAnimationFrame(bob);
    }
    
    stopBounceAnimation() {
        if (this.bounceAnimation) {
            cancelAnimationFrame(this.bounceAnimation);
            this.bounceAnimation = null;
        }
        
        // Smoothly return to ground
        const returnToGround = () => {
            if (this.currentElevation > 0.1) {
                this.currentElevation *= 0.9; // Exponential decay
                this.scheduleRender();
                requestAnimationFrame(returnToGround);
            } else {
                this.currentElevation = 0;
                this.scheduleRender();
            }
        };
        
        requestAnimationFrame(returnToGround);
    }
    
    // Update pixel row timestamps for fade-in effect
    updatePixelRowTimestamps(row, col, pixelRowsToShow, totalPixelRows) {
        const key = `${row},${col}`;
        
        if (!this.pixelRowTimestamps.has(key)) {
            this.pixelRowTimestamps.set(key, new Array(totalPixelRows).fill(null));
        }
        
        const timestamps = this.pixelRowTimestamps.get(key);
        const currentTime = performance.now();
        
        // Mark timestamp for newly revealed pixel rows
        for (let i = 0; i < pixelRowsToShow; i++) {
            if (timestamps[i] === null) {
                timestamps[i] = currentTime;
            }
        }
    }
    
    // Draw construction with fade-in effect for individual pixel rows
    drawConstructionWithFadeIn(img, offsetX, offsetY, baseDrawWidth, baseDrawHeight, imageY, pixelRowsToShow, totalPixelRows, brightness, row, col) {
        const key = `${row},${col}`;
        const timestamps = this.pixelRowTimestamps.get(key);
        
        if (!timestamps) {
            // Fallback to normal drawing if no timestamps
            this.ctx.drawImage(img, offsetX - baseDrawWidth/2, imageY, baseDrawWidth, baseDrawHeight);
            return;
        }
        
        const currentTime = performance.now();
        const fadeInDuration = 3000; // 3 seconds fade-in
        
        // Draw each pixel row with individual opacity based on age
        const pixelRowHeight = baseDrawHeight / totalPixelRows;
        
        for (let pixelRow = 0; pixelRow < pixelRowsToShow; pixelRow++) {
            const timestamp = timestamps[pixelRow];
            if (timestamp === null) continue;
            
            // Calculate opacity based on how long this row has been visible
            const age = currentTime - timestamp;
            const opacity = Math.min(1.0, age / fadeInDuration);
            
            // Calculate source and destination for this pixel row
            const srcY = img.height - (pixelRow + 1) * (img.height / totalPixelRows);
            const srcHeight = img.height / totalPixelRows;
            const destY = imageY + baseDrawHeight - (pixelRow + 1) * pixelRowHeight;
            const destHeight = pixelRowHeight;
            
            // Apply combined brightness and fade-in opacity
            this.ctx.save();
            this.ctx.globalAlpha = opacity;
            this.ctx.filter = `brightness(${brightness})`;
            
            this.ctx.drawImage(
                img,
                0, srcY, img.width, srcHeight,
                offsetX - baseDrawWidth/2, destY, baseDrawWidth, destHeight
            );

            // Reset filter before restoring context
            this.ctx.filter = 'none';
            this.ctx.restore();
        }
    }
    
    // Lightweight construction animation using gradient mask (much more performant)
    drawConstructionWithGradientMask(img, offsetX, offsetY, baseDrawWidth, baseDrawHeight, imageY, constructionProgress, row, col) {
        const key = `${row},${col}`;
        const timestamps = this.pixelRowTimestamps.get(key);
        
        if (!timestamps) {
            // Fallback to normal drawing if no timestamps
            this.ctx.drawImage(img, offsetX - baseDrawWidth/2, imageY, baseDrawWidth, baseDrawHeight);
            return;
        }
        
        const currentTime = performance.now();
        const fadeInDuration = 3000; // 3 seconds fade-in
        const revealHeight = baseDrawHeight * constructionProgress;
        
        // Create gradient for fade-in effect based on construction progress
        this.ctx.save();
        
        // Set up clipping region for the revealed portion
        this.ctx.beginPath();
        this.ctx.rect(offsetX - baseDrawWidth/2, imageY + baseDrawHeight - revealHeight, baseDrawWidth, revealHeight);
        this.ctx.clip();
        
        // Create gradient mask for fade-in effect - validate parameters
        const gradientStart = imageY + baseDrawHeight - revealHeight;
        const gradientEnd = imageY + baseDrawHeight;
        
        // Check for invalid values that would cause createLinearGradient to fail
        if (!isFinite(gradientStart) || !isFinite(gradientEnd)) {
            // Fallback to normal drawing if gradient parameters are invalid
            this.ctx.drawImage(img, offsetX - baseDrawWidth/2, imageY, baseDrawWidth, baseDrawHeight);
            return;
        }
        
        const gradient = this.ctx.createLinearGradient(0, gradientStart, 0, gradientEnd);
        
        // Calculate how much of the revealed area should have fade effect
        const totalPixelRows = img.height;
        const pixelRowsToShow = Math.floor(totalPixelRows * constructionProgress);
        const fadeRows = Math.min(20, pixelRowsToShow); // Limit fade effect to last 20 rows for performance
        
        // Add gradient stops based on pixel row ages
        const rowHeight = revealHeight / pixelRowsToShow;
        for (let i = 0; i < pixelRowsToShow; i++) {
            const timestamp = timestamps[i];
            if (timestamp === null) continue;
            
            const age = currentTime - timestamp;
            const opacity = Math.min(1.0, age / fadeInDuration);
            const position = i / pixelRowsToShow;
            
            // Only add fade effect to recent rows for better performance
            if (i >= pixelRowsToShow - fadeRows) {
                gradient.addColorStop(position, `rgba(255,255,255,${opacity})`);
            }
        }
        
        // Apply alpha-based fade effect for construction
        const avgOpacity = this.calculateAverageOpacity(timestamps, pixelRowsToShow, currentTime, fadeInDuration);
        this.ctx.globalAlpha = avgOpacity;
        
        this.ctx.drawImage(img, offsetX - baseDrawWidth/2, imageY, baseDrawWidth, baseDrawHeight);
        
        this.ctx.restore();
    }
    
    // Calculate average opacity for fade-in effect
    calculateAverageOpacity(timestamps, pixelRowsToShow, currentTime, fadeInDuration) {
        if (!timestamps || pixelRowsToShow === 0) return 1.0;
        
        let totalOpacity = 0;
        let validRows = 0;
        
        // Calculate opacity for recent rows (fade effect)
        const fadeRows = Math.min(20, pixelRowsToShow);
        const startRow = Math.max(0, pixelRowsToShow - fadeRows);
        
        for (let i = startRow; i < pixelRowsToShow; i++) {
            const timestamp = timestamps[i];
            if (timestamp !== null) {
                const age = currentTime - timestamp;
                const opacity = Math.min(1.0, age / fadeInDuration);
                totalOpacity += opacity;
                validRows++;
            }
        }
        
        // Older rows are fully opaque
        const olderRows = startRow;
        totalOpacity += olderRows;
        validRows += olderRows;
        
        return validRows > 0 ? totalOpacity / validRows : 1.0;
    }
    
    // Schedule frequent re-renders for construction animation
    scheduleConstructionAnimation(row, col) {
        const key = `${row},${col}`;
        
        if (this.constructionAnimations.has(key)) {
            return; // Already animating
        }
        
        this.constructionAnimations.add(key);
        
        const animate = () => {
            const parcel = this.grid[row][col];
            
            // Check if construction is still ongoing
            if (!parcel || !parcel._constructionAnimating || !parcel.constructionStartDay) {
                this.constructionAnimations.delete(key);
                return;
            }
            
            // Re-render for smooth pixel animation
            this.scheduleRender();
            
            // Continue animation at 60fps for smooth pixel reveal
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }

    // Restore mouse movement debouncing for performance
    debouncedMouseMove(screenX, screenY) {
        this.lastMousePosition = { x: screenX, y: screenY };
        
        if (!this.pendingMouseUpdate) {
            this.pendingMouseUpdate = true;
            requestAnimationFrame(() => {
                this.processMouseMove(this.lastMousePosition.x, this.lastMousePosition.y);
                this.pendingMouseUpdate = false;
            });
        }
    }

    // Process mouse movement with all hover logic
    processMouseMove(screenX, screenY) {
        // Handle panning
        if (this.isPanning) {
            const deltaX = screenX - this.lastPanPoint.x;
            const deltaY = screenY - this.lastPanPoint.y;
            
            this.panOffset.x += deltaX;
            this.panOffset.y += deltaY;
            
            this.lastPanPoint = { x: screenX, y: screenY };
            this.scheduleRender();
            return; // Don't process tile selection while panning
        }
        
        // Convert screen coordinates to world coordinates for tile detection
        const worldCoords = this.screenToWorldCoords(screenX, screenY);
        const tile = this.fromIsometric(worldCoords.x, worldCoords.y);
        
        // In mobility mode, use the mobility layer's mouse handling
        if (this.currentLayer === 'mobility') {
            // Delegate to mobility layer for road building
            const needsRender = this.mobilityLayer.handleMouseMove(worldCoords.x, worldCoords.y);

            // Update ParcelSelectorManager with mobility effects
            if (this.parcelSelector && this.mobilityLayer.hoveredEdge) {
                // Clear previous effects and add new mobility effects
                this.parcelSelector.clearProximityEffects();
                this.parcelSelector.addMobilityEffects();
            } else if (this.parcelSelector) {
                // Clear mobility effects when no edge is hovered
                this.parcelSelector.clearProximityEffects();
            }

            if (needsRender) {
                this.scheduleRender();
            }

            // Handle delayed tooltips in mobility mode
            const mockEvent = { clientX: screenX, clientY: screenY };
            this.handleMobilityTooltips(tile, mockEvent);
            return; // Early return to prevent normal tooltip logic
        }
        
        if (tile) {
            this.selectedTile = tile;
            const coord = this.getParcelCoordinate(tile.row, tile.col);
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = coord;
            }
            
            // Force a render to show the highlight
            this.scheduleRender();
            
            // Update parcel illumination for connected roads calculation
            this.updateParcelIllumination(tile);

            // Update cursor-based hover state using new parcel selector
            if (this.parcelSelector) {
                this.parcelSelector.setHoveredParcel(tile.row, tile.col);
            }

            // Keep legacy hoveredTile for compatibility with other systems
            this.hoveredTile = { row: tile.row, col: tile.col };

            // Reset hover timing and selector opacity when moving to new tile
            this.hoverStartTime = performance.now();
            this.selectorOpacity = 1.0;

            // Start hover lift for buildings
            if (this.grid && this.grid[tile.row] && this.grid[tile.row][tile.col]) {
                const parcel = this.grid[tile.row][tile.col];
                if (parcel && parcel.building) {
                    this.startContinuousBob(); // Direct lift, no bounce
                }
            }
            // Tooltip now handled automatically by CrispTooltip system
        } else {
            this.selectedTile = null;
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = '--';
            }
            
            // Clear hover state when not hovering any tile
            if (this.hoveredTile) {
                // Clear hover state in new parcel selector
                if (this.parcelSelector) {
                    this.parcelSelector.setHoveredParcel(null, null);
                }

                // Clear legacy hoveredTile for compatibility
                this.hoveredTile = null;

                // Reset hover timing and selector opacity
                this.hoverStartTime = null;
                this.selectorOpacity = 1.0;
                this.stopBounceAnimation();
            }
            
            if (this.crispTooltip) this.crispTooltip.hide();
        }
    }

    drawTileHighlight(col, row, color, elevation = 0) {
        console.log(`🚨 [DEBUG] drawTileHighlight called for ${row},${col} with color ${color}`);
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;

        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);
        
        // Draw diamond-shaped highlight with white glow only
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.tileHeight / 2);
        this.ctx.lineTo(this.tileWidth / 2, 0);
        this.ctx.lineTo(0, this.tileHeight / 2);
        this.ctx.lineTo(-this.tileWidth / 2, 0);
        this.ctx.closePath();
        
        // Subtle white glow effect with fading alpha
        this.ctx.strokeStyle = color; // Use the color parameter which includes the alpha
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    
    setupEventListeners() {
        // Debounced mouse move handler for optimal performance  
        const debouncedMouseMove = (e) => {
            // Don't process mouse moves if context menu is open - preserve current selection
            if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                return;
            }
            
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
            // Store mouse event for tooltip positioning
            this.lastMouseEvent = { clientX: e.clientX, clientY: e.clientY };
            
            this.processMouseMove(screenX, screenY);
        };
        
        // Re-enabled with new parcel selector system
        this.canvas.addEventListener('mousemove', debouncedMouseMove, { passive: true });

        // Add mouse down handler for panning and 3D rotation
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
            if (this.zoomScale > 1.1 && e.button === 0) {
                // Panning mode when zoomed
                this.isPanning = true;
                this.lastPanPoint = { x: screenX, y: screenY };
                this.canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        // Prevent context menu on canvas to avoid interference
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Add mouse up handler
        this.canvas.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
            }
        });

        // Add mouse leave handler to stop panning when mouse leaves canvas
        this.canvas.addEventListener('mouseleave', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
            }

            // Clear hover state and auto-deselect when cursor leaves canvas
            if (this.parcelSelector) {
                this.parcelSelector.setHoveredParcel(null, null);
            }
        });
        
        this.canvas.addEventListener('click', (e) => {
            // Don't process clicks while panning
            if (this.isPanning) {
                return;
            }
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
            // Convert to world coordinates
            const worldCoords = this.screenToWorldCoords(screenX, screenY);
            const tile = this.fromIsometric(worldCoords.x, worldCoords.y);
            
            // Handle mobility layer clicks first (including UI areas)
            if (this.currentLayer === 'mobility') {
                const handled = this.mobilityLayer.handleClickEnhanced(worldCoords.x, worldCoords.y, screenX, screenY);
                if (handled) {
                    this.scheduleRender(); // Update the display
                }
                return; // Don't process other clicks in mobility mode
            }

            // Handle parcel selection via ParcelSelectorManager
            if (tile && this.parcelSelector) {
                this.parcelSelector.handleParcelClick(tile.row, tile.col, this.currentPlayerId || 1);
                this.scheduleRender();
            }

            if (tile && tile.row >= 0 && tile.row < this.gridSize &&
                tile.col >= 0 && tile.col < this.gridSize) {
                
                
                // Check if clicking the same selected tile - toggle it off
                if (this.selectedTile && 
                    this.selectedTile.row === tile.row && 
                    this.selectedTile.col === tile.col &&
                    this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                    this.hideContextMenu();
                } else {
                    // Skip legacy context menu handling if tooltip transition is in progress
                    if (this.preventLegacyContextMenu) {
                        return;
                    }

                    // Clicking any other parcel: hide previous menu and show new one
                    if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                        this.hideContextMenu();
                    }
                    // Only show context menu if it's not already being shown for this tile (prevents tooltip transition interference)
                    if (!this.contextMenu || !this.contextMenu.classList.contains('visible') ||
                        !this.selectedTile || this.selectedTile.row !== tile.row || this.selectedTile.col !== tile.col) {
                        this.showContextMenu(tile.row, tile.col, e.clientX, e.clientY);
                    }
                }
                if (this.crispTooltip) this.crispTooltip.hide();
            } else {
                if (this.currentLayer !== 'transportation') {
                    this.hideContextMenu();
                }
            }
        });
        
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
            });
        });
        
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.scheduleRender();
        });
        
        // Keyboard shortcuts for mobility layer
        document.addEventListener('keydown', (e) => {
            // Handle land value mode toggle (T key when in landvalue layer)
            if (e.key === 't' || e.key === 'T') {
                if (this.currentLayer === 'landvalue') {
                    e.preventDefault();
                    this.toggleLandValueMode();
                    return;
                }
            }

            // Handle mobility layer shortcuts
            if (this.currentLayer === 'mobility') {
                const handled = this.mobilityLayer.handleKeyPress(e.key);
                if (handled) {
                    e.preventDefault();
                    this.scheduleRender();
                }
                return;
            }
            
            switch(e.key) {
                case 'Escape':
                    // Clear all selected street edges
                    this.selectedStreetEdges.clear();
                    this.hideStreetEdgeContextMenu();
                    this.scheduleRender();
                    break;
                    
                case 'a':
                case 'A':
                    // Ctrl+A: Select all visible street edges
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.selectAllStreetEdges();
                    }
                    break;
                    
                case 'Delete':
                case 'Backspace':
                    // Delete selected roads
                    if (this.selectedStreetEdges.size > 0) {
                        e.preventDefault();
                        this.removeRoadFromSelectedEdges();
                    }
                    break;
            }
        });
    }
    
    // Update the real-time market dashboard
    updateMarketDashboard() {
        if (!document.getElementById('market-dashboard-modal') || 
            document.getElementById('market-dashboard-modal').style.display === 'none') {
            return;
        }
        
        // Get current supply/demand data
        this.calculateCityVitality(); // Now uses server API
        
        // Update market stats
        const markets = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];
        markets.forEach(market => {
            const supply = this.vitalitySupply[market.toUpperCase()] || 0;
            const demand = this.vitalityDemand[market.toUpperCase()] || 1;
            const ratio = (supply / demand * 100).toFixed(1);
            
            // Calculate price multiplier based on current system
            let priceMultiplier = 1.0;
            if (this.supplyDemandEffects) {
                priceMultiplier = this.supplyDemandEffects[`${market}Multiplier`] || 1.0;
            }
            
            // Update DOM elements
            document.getElementById(`${market}-supply`).textContent = supply.toFixed(1);
            document.getElementById(`${market}-demand`).textContent = demand.toFixed(1);
            document.getElementById(`${market}-ratio`).textContent = ratio + '%';
            
            const priceEl = document.getElementById(`${market}-price`);
            priceEl.textContent = priceMultiplier.toFixed(2) + 'x';
            
            // Color code the price based on value
            if (priceMultiplier > 1.2) {
                priceEl.style.color = '#f44336'; // Red for expensive
            } else if (priceMultiplier < 0.8) {
                priceEl.style.color = '#2196F3'; // Blue for cheap
            } else {
                priceEl.style.color = '#4CAF50'; // Green for normal
            }
        });
    }
    
    
}

// Global functions for market dashboard
function applyMarketSettings() {
    if (!window.game) return;
    
    // Update elasticity settings
    const elasticityInputs = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];
    elasticityInputs.forEach(market => {
        const input = document.getElementById(`${market}-elasticity`);
        if (input) {
            window.game.marketSettings.elasticity[market] = parseFloat(input.value);
        }
    });
    
    // Update radius settings
    const radiusInputs = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];
    radiusInputs.forEach(market => {
        const input = document.getElementById(`${market}-radius`);
        if (input) {
            window.game.marketSettings.radius[market] = parseInt(input.value);
        }
    });
    
    // Update price bounds
    const minPriceInput = document.getElementById('min-price');
    const maxPriceInput = document.getElementById('max-price');
    if (minPriceInput) window.game.marketSettings.priceBounds.min = parseFloat(minPriceInput.value);
    if (maxPriceInput) window.game.marketSettings.priceBounds.max = parseFloat(maxPriceInput.value);
    
    // Force recalculation
    window.game.calculateCityVitality();
    window.game.updateVitalityDisplay();
    
}

function resetMarketDefaults() {
    if (!window.game) return;
    
    // Reset to defaults
    window.game.marketSettings = {
        elasticity: { jobs: 1.2, energy: 0.3, education: 0.6, food: 0.5, housing: 0.7, healthcare: 0.8 },
        radius: { jobs: 4, energy: 999, education: 6, food: 5, housing: 3, healthcare: 5 },
        priceBounds: { min: 0.25, max: 4.0 }
    };
    
    // Update UI controls
    document.getElementById('energy-elasticity').value = 0.3;
    document.getElementById('energy-elasticity-val').textContent = '0.3';
    document.getElementById('food-elasticity').value = 0.5;
    document.getElementById('food-elasticity-val').textContent = '0.5';
    document.getElementById('housing-elasticity').value = 0.7;
    document.getElementById('housing-elasticity-val').textContent = '0.7';
    document.getElementById('jobs-elasticity').value = 1.2;
    document.getElementById('jobs-elasticity-val').textContent = '1.2';
    
    document.getElementById('energy-radius').value = 999;
    document.getElementById('energy-radius-val').textContent = '999';
    document.getElementById('food-radius').value = 5;
    document.getElementById('food-radius-val').textContent = '5';
    document.getElementById('housing-radius').value = 3;
    document.getElementById('housing-radius-val').textContent = '3';
    document.getElementById('jobs-radius').value = 4;
    document.getElementById('jobs-radius-val').textContent = '4';
    
    document.getElementById('min-price').value = 0.25;
    document.getElementById('min-price-val').textContent = '0.25x';
    document.getElementById('max-price').value = 4.0;
    document.getElementById('max-price-val').textContent = '4.0x';
    
}

function generateCityName() {
    const prefixes = ['New', 'North', 'South', 'East', 'West', 'Port', 'Mount', 'Fort', 'Saint'];
    const bases = ['Haven', 'Ridge', 'Vale', 'Shore', 'Field', 'Brook', 'Gate', 'Hill', 'Peak', 'Cross'];
    const suffixes = ['ton', 'burg', 'ville', 'shire', 'ford', 'worth', 'land', 'stead', 'hurst', 'crest'];
    
    const r = Math.random();
    if (r < 0.3) {
        return prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + 
               bases[Math.floor(Math.random() * bases.length)];
    } else if (r < 0.6) {
        return bases[Math.floor(Math.random() * bases.length)] + 
               suffixes[Math.floor(Math.random() * suffixes.length)];
    } else {
        return prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' +
               bases[Math.floor(Math.random() * bases.length)] +
               suffixes[Math.floor(Math.random() * suffixes.length)];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new IsometricGrid(canvas, 12);
    window.game = game; // Make game accessible globally right away

    // COMPLETE RESET ON EVERY BROWSER RELOAD - Fresh start guaranteed
    game.completeGameReset().then(() => {
        console.log('🎯 Fresh game session initialized');
    }).catch(error => {
        console.error('🚨 Reset failed:', error);
    });

    // Solo game - no multiplayer departure handling needed
    
    // Simple auto-start functionality
    const welcomeScreen = document.getElementById('welcome-screen');
    const gameInterface = document.getElementById('game-interface');

    // Set up default player settings
    const playerSettings = {
        name: 'Player',
        color: '#52C77E',
        emoji: '🏠',
        gameMode: 'solo'
    };

    // Save default player settings
    localStorage.setItem('theCommons_playerSettings', JSON.stringify(playerSettings));

    // Force cash reset to $6000 for new session
    localStorage.setItem('theCommons_forceReset', 'true');

    // Enhanced welcome screen with DOM readiness check
    if (welcomeScreen) {
        // Validate all required welcome screen elements exist
        const startGameBtn = document.getElementById('start-game-btn');
        const playerNameInput = document.getElementById('player-name');
        const colorSelector = document.getElementById('color-selector');

        if (!startGameBtn || !playerNameInput || !colorSelector) {
            console.error('⚠️ Critical welcome screen elements missing:', {
                startGameBtn: !!startGameBtn,
                playerNameInput: !!playerNameInput,
                colorSelector: !!colorSelector
            });

            // Show error and exit
            document.body.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #0a0a0a; display: flex; align-items: center; justify-content: center; color: #ff6b6b; font-family: sans-serif; text-align: center; z-index: 99999;">
                    <div>
                        <h2>Welcome Screen Setup Error</h2>
                        <p>Required elements are missing. Please refresh the page.</p>
                        <button onclick="window.location.reload()" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;">Reload Page</button>
                    </div>
                </div>
            `;
            return;
        }

        // Show welcome screen
        welcomeScreen.style.display = 'flex';
        welcomeScreen.classList.add('visible');
        gameInterface.classList.add('hidden');

        // Welcome screen is now ready - no title animations needed

        // Setup welcome screen interactions
        setupWelcomeScreenHandlers();

        // Add space bar shortcut to skip welcome screen
        document.addEventListener('keydown', async (e) => {
            if (e.code === 'Space' && welcomeScreen.style.display !== 'none') {
                e.preventDefault();
                // Use current color and trigger instant start
                const currentSelected = document.querySelector('.color-option.selected');
                const selectedColor = currentSelected ? currentSelected.dataset.color : '#10AC84';
                const playerName = document.getElementById('player-name')?.value.trim() || 'Player';

                const playerSettings = {
                    name: playerName,
                    color: selectedColor,
                    emoji: '🏛️',
                    setupComplete: true
                };

                localStorage.setItem('theCommons_playerSettings', JSON.stringify(playerSettings));

                // Sync player color with server
                try {
                    await fetch('/api/player/color', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            playerId: 'player',
                            color: selectedColor
                        })
                    });
                } catch (error) {
                    console.warn('Could not sync player color with server:', error);
                }

                if (window.game) {
                    window.game.playerSettings = playerSettings;
                    // Update ParcelSelectorManager with new color
                    if (window.game.parcelSelector) {
                        window.game.parcelSelector.updatePlayerColor();
                    }
                    // Set CSS custom property for welcome underline
                    document.documentElement.style.setProperty('--player-color', selectedColor);
                    window.game.updatePlayerNameInUI();
                    window.game.scheduleRender();
                }

                // Skip all animations and go straight to game
                welcomeScreen.style.display = 'none';
                const transitionOverlay = document.getElementById('transition-overlay');
                if (transitionOverlay) transitionOverlay.style.display = 'none';
                continueGameTransition();
            }
        });

        function startGameTransition() {
            // Phase 1: Fade out the entire modal first
            welcomeScreen.classList.add('fade-out');

            // Phase 2: After modal fade out, pause briefly on black screen
            setTimeout(() => {
                // Hide the modal completely
                welcomeScreen.style.display = 'none';

                // Phase 3: Brief pause for mental space, then show "Welcome to..." text
                setTimeout(() => {
                    // Show transition overlay with "Welcome to The Commons"
                    const transitionOverlay = document.getElementById('transition-overlay');
                    const transitionText = document.getElementById('transition-text');

                    if (transitionOverlay && transitionText) {
                        transitionOverlay.style.display = 'flex';
                        transitionOverlay.style.opacity = '0';
                        transitionOverlay.style.transition = 'none'; // Remove any existing transition

                        // Force reflow to ensure display change takes effect
                        transitionOverlay.offsetHeight;

                        // Fade in the welcome text
                        setTimeout(() => {
                            transitionOverlay.style.transition = 'opacity 0.7s ease-out';
                            transitionOverlay.style.opacity = '1';
                        }, 50);

                        // After showing welcome text, continue with normal transition
                        setTimeout(() => {
                            transitionOverlay.style.transition = 'opacity 0.7s ease-out';
                            transitionOverlay.style.opacity = '0';

                            // Hide transition overlay and proceed to game
                            setTimeout(() => {
                                transitionOverlay.style.display = 'none';
                                // Continue with the original Phase 3 logic
                                continueGameTransition();
                            }, 700);
                        }, 2500); // Show welcome text for 2.5 seconds
                    } else {
                        // Fallback if transition overlay not found
                        continueGameTransition();
                    }
                }, 300); // Brief pause on black screen for mental space
            }, 500); // Match the 0.5s CSS transition

            // Helper function to continue the game transition
            function continueGameTransition() {
                welcomeScreen.style.display = 'none';
                welcomeScreen.classList.remove('visible', 'fade-out');

                // Show game interface with fade-in
                gameInterface.classList.remove('hidden');
                gameInterface.style.removeProperty('display');

                // Ensure all game containers are ready
                const containers = ['game-container', 'main-area', 'sidebar'];
                containers.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.style.removeProperty('display');
                        element.style.removeProperty('opacity');
                        element.style.removeProperty('visibility');
                    }
                });

                // Trigger fade-in animation immediately since text is fully gone
                setTimeout(() => {
                    gameInterface.classList.add('fade-in');
                }, 50);

                // Setup canvas and start game
                setTimeout(async () => {
                    game.setupCanvas();
                    game.render();
                    game.scheduleRender();

                    // Configure game with player settings
                    game.playerSettings = playerSettings;

                    // Update player name throughout UI
                    game.updatePlayerNameInUI();

                    // Expose useful testing methods to console
                    window.resetCash = () => {
                        if (game.cashManager) {
                            game.cashManager.forceReset6k();
                        } else {
                            console.error('CashManager not available');
                        }
                    };
                    console.log('🧪 Testing helper: Use resetCash() in console to reset cash to $6,000');

                    // Force correct cash display immediately after initialization
                    setTimeout(() => {
                        if (game.cashManager) {
                            game.cashManager.forceReset6k();
                            console.log('🔧 Auto-corrected cash to $6,000 on startup');
                        }
                    }, 200);

                    // Start the game
                    await game.startGame();

                    // Initialize tooltip system
                    if (typeof initializeTooltips === 'function') {
                        initializeTooltips();
                    }

                    // Set up governance button
                    if (window.setupGovernanceButton) {
                        window.setupGovernanceButton();
                    }

                    // Setup other game systems
                    setupContextMenuCloseListener();

                    // Add delay to ensure DOM is fully ready
                    setTimeout(() => {
                        console.log('🔧 Setting up systems after DOM ready...');
                        if (game.governanceSystem) {
                            game.governanceSystem.setupEventListeners();
                        }
                        try {
                            if (typeof setupMultiplierControls === 'function') {
                                setupMultiplierControls();
                            }
                        } catch (error) {
                            console.warn('setupMultiplierControls not available:', error.message);
                        }
                        // Setup DCF functionality via UIManager
                        try {
                            game.uiManager.setupCashflowMenu(game);
                        } catch (error) {
                            console.warn('DCF setup failed:', error.message);
                        }
                        if (game.tooltipManager && game.tooltipManager.setupVitalityTooltips) {
                            game.tooltipManager.setupVitalityTooltips();
                        }
                    }, 50);

                }, 100);

            }
        }

        function setupWelcomeScreenHandlers() {
        // Generate 10 random colors for territorial markers
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
            '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
            '#10AC84', '#EE5A6F', '#C44569', '#F8B500', '#6C5CE7',
            '#A55EEA', '#26DE81', '#FD79A8', '#74B9FF', '#E17055'
        ];

        // Shuffle array and take first 5
        const shuffledColors = colors.sort(() => 0.5 - Math.random()).slice(0, 5);
        let selectedColor = shuffledColors[0]; // Default to first color

        // Generate color picker HTML
        const colorSelector = document.getElementById('color-selector');
        if (colorSelector) {
            colorSelector.innerHTML = shuffledColors.map((color, index) =>
                `<div class="color-option ${index === 0 ? 'selected' : ''}"
                      data-color="${color}"
                      style="background: ${color}">
                </div>`
            ).join('');

            // Setup color selection handlers
            const colorOptions = colorSelector.querySelectorAll('.color-option');
            colorOptions.forEach(option => {
                option.addEventListener('click', () => {
                    // Remove selected class from all options
                    colorOptions.forEach(opt => opt.classList.remove('selected'));
                    // Add selected class to clicked option
                    option.classList.add('selected');
                    selectedColor = option.dataset.color;
                });
            });
        }

        // Start game button
        const startGameBtn = document.getElementById('start-game-btn');
        const playerNameInput = document.getElementById('player-name');

        if (startGameBtn && playerNameInput) {
            startGameBtn.addEventListener('click', async () => {
                console.log('🚀 Enter button clicked - starting transition');

                const playerName = playerNameInput.value.trim() || 'Player';

                // Save player settings
                const playerSettings = {
                    name: playerName,
                    color: selectedColor,
                    emoji: '🏛️', // Default civic emoji
                    setupComplete: true
                };

                localStorage.setItem('theCommons_playerSettings', JSON.stringify(playerSettings));

                // Sync player color with server
                try {
                    await fetch('/api/player/color', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            playerId: 'player',
                            color: selectedColor
                        })
                    });
                } catch (error) {
                    console.warn('Could not sync player color with server:', error);
                }

                // Update game settings and trigger transition
                if (window.game) {
                    window.game.playerSettings = playerSettings;
                    // Set CSS custom property for welcome underline
                    document.documentElement.style.setProperty('--player-color', selectedColor);
                    window.game.updatePlayerNameInUI();
                    window.game.scheduleRender(); // Force re-render with new color
                }

                // Start transition immediately when user clicks
                startGameTransition();
            });

            // Allow Enter key to start game
            playerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    startGameBtn.click();
                }
            });
        }
    }

} else {
        // CRITICAL: Never auto-start if welcome screen is missing
        console.error('⚠️ Welcome screen not found! Cannot start game without user consent.');

        // Show error message instead of auto-starting
        document.body.innerHTML = `
            <div style="
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: #0a0a0a;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ff6b6b;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 18px;
                text-align: center;
                z-index: 99999;
            ">
                <div>
                    <h2 style="color: #ff6b6b; margin-bottom: 16px;">Welcome Screen Missing</h2>
                    <p style="margin-bottom: 24px;">The game cannot start without proper user registration.</p>
                    <button onclick="window.location.reload()" style="
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                    ">Reload Page</button>
                </div>
            </div>
        `;

        // Exit without starting any game systems
        return;

        // Add delay to ensure DOM is fully ready
        setTimeout(() => {
            console.log('🔧 Setting up systems after DOM ready (fallback)...');
            if (game.governanceSystem) {
                game.governanceSystem.setupEventListeners();
            }
            try {
                if (typeof setupMultiplierControls === 'function') {
                    setupMultiplierControls();
                }
            } catch (error) {
                console.warn('setupMultiplierControls not available:', error.message);
            }
            // DCF functionality now handled by UIManager
            if (game.tooltipManager && game.tooltipManager.setupVitalityTooltips) {
                game.tooltipManager.setupVitalityTooltips();
            }
        }, 50);
    }
    
    
    // Keyboard shortcut to toggle testing mode (Ctrl+Shift+M)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            document.body.classList.toggle('testing-mode');
            const isTestingMode = document.body.classList.contains('testing-mode');
        }
    });

    // Space bar shortcut to skip welcome screen for faster development
    document.addEventListener('keydown', async (e) => {
        if (e.code === 'Space') {
            const welcomeScreen = document.getElementById('welcome-screen');
            if (welcomeScreen && welcomeScreen.style.display !== 'none') {
                e.preventDefault();

                // Get current form values
                const nameInput = document.getElementById('player-name');
                const selectedColorOption = document.querySelector('.color-option.selected');

                const playerName = nameInput ? nameInput.value.trim() || 'Player' : 'Player';
                const selectedColor = selectedColorOption ? selectedColorOption.dataset.color : '#10AC84';

                // Save to localStorage
                localStorage.setItem('playerName', playerName);
                localStorage.setItem('playerColor', selectedColor);

                // Sync player color with server
                try {
                    await fetch('/api/player/color', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            playerId: 'player',
                            color: selectedColor
                        })
                    });
                } catch (error) {
                    console.warn('Could not sync player color with server:', error);
                }

                // Update player settings
                if (!this.playerSettings) {
                    this.playerSettings = { name: 'Player', emoji: '🏛️' };
                }
                this.playerSettings.name = playerName;
                this.playerSettings.color = selectedColor;

                // Update ParcelSelectorManager with new color
                if (this.parcelSelector) {
                    this.parcelSelector.updatePlayerColor();
                }

                // Update current player (legacy support)
                if (typeof currentPlayer !== 'undefined' && currentPlayer) {
                    currentPlayer.name = playerName;
                    currentPlayer.color = selectedColor;
                }

                // Set CSS custom property for welcome underline
                document.documentElement.style.setProperty('--player-color', selectedColor);

                // Hide all welcome elements immediately
                welcomeScreen.style.display = 'none';
                const overlay = document.getElementById('transition-overlay');
                if (overlay) overlay.style.display = 'none';

                // Continue to game immediately
                continueGameTransition();
            }
        }
    });

    // Magic link button event listener
    const magicLinkBtn = document.getElementById('magic-link-btn');
    if (magicLinkBtn) {
        magicLinkBtn.addEventListener('click', () => {
        const emailInput = document.getElementById('player-email');
        const email = emailInput.value.trim();
        
        if (!email) {
            emailInput.style.borderColor = '#ef4444';
            emailInput.placeholder = 'Email required';
            setTimeout(() => {
                emailInput.style.borderColor = '';
                emailInput.placeholder = 'your@email.com';
            }, 2000);
            return;
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            emailInput.style.borderColor = '#ef4444';
            emailInput.value = '';
            emailInput.placeholder = 'Valid email required';
            setTimeout(() => {
                emailInput.style.borderColor = '';
                emailInput.placeholder = 'your@email.com';
            }, 2000);
            return;
        }
        
        // Simulate sending magic link
        const magicBtn = document.getElementById('magic-link-btn');
        const originalText = magicBtn.textContent;
        
        magicBtn.textContent = 'SENDING...';
        magicBtn.disabled = true;
        magicBtn.style.opacity = '0.7';
        
        setTimeout(() => {
            magicBtn.textContent = 'LINK SENT!';
            magicBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            
            setTimeout(() => {
                magicBtn.textContent = originalText;
                magicBtn.disabled = false;
                magicBtn.style.opacity = '1';
                magicBtn.style.background = '';
            }, 3000);
        }, 1500);
        
        // Store email for potential multiplayer session
        localStorage.setItem('theCommons_playerEmail', email);
        
        });
    }
    
    
    document.getElementById('city-name').textContent = generateCityName().toUpperCase();
    
    // Close context menu when clicking elsewhere - will be set up after game is created
    function setupContextMenuCloseListener() {
        document.addEventListener('click', (e) => {
            if (window.game && window.game.contextMenu && !window.game.contextMenu.contains(e.target) && e.target !== window.game.canvas) {
                window.game.hideContextMenu();
            }
        });
    }
    
    // Governance button functionality - only set up after game starts
    window.setupGovernanceButton = function() {
        const governanceBtn = document.getElementById('governance-btn');
        if (governanceBtn && game) {
            governanceBtn.addEventListener('click', () => {
                if (game.governanceSystem) {
                    game.governanceSystem.openGovernanceModal();
                } else {
                    console.error('Governance system not initialized');
                }
            });
        }
    };
    
    // Market Dashboard button
    const openMarketDashboardBtn = document.getElementById('open-market-dashboard');
    if (openMarketDashboardBtn) {
        openMarketDashboardBtn.addEventListener('click', () => {
            const modal = document.getElementById('market-dashboard-modal');
            if (modal) {
                modal.style.display = 'block';
                game.updateMarketDashboard();
                
                // Set up real-time updates
                if (!game.marketDashboardInterval) {
                    game.marketDashboardInterval = setInterval(() => {
                        game.updateMarketDashboard();
                    }, 1000); // Update every second
                }
            }
        });
    }
    
    // Route configuration modal functionality
    const createRouteBtn = document.getElementById('create-route');
    const cancelRouteBtn = document.getElementById('cancel-route');
    const routeModal = document.getElementById('route-modal');
    
    if (createRouteBtn) {
        createRouteBtn.addEventListener('click', () => {
            const ticketPrice = parseFloat(document.getElementById('ticket-price').value) || 2.50;
            const serviceLevel = document.querySelector('input[name="service-level"]:checked')?.value || 'daytime';
            
            // Get route configuration from mobility layer
            if (window.game.mobilityLayer && window.game.mobilityLayer.pendingRoute) {
                const routeConfig = {
                    ticketPrice: ticketPrice,
                    serviceLevel: serviceLevel
                };
                
                // Create the route
                window.game.mobilityLayer.createRoute(routeConfig);
                
                // Hide the modal
                if (routeModal) {
                    routeModal.style.display = 'none';
                }
            }
        });
    }
    
    if (cancelRouteBtn) {
        cancelRouteBtn.addEventListener('click', () => {
            // Reset route creation state
            if (window.game.mobilityLayer) {
                window.game.mobilityLayer.isCreatingRoute = false;
                window.game.mobilityLayer.selectedTransitStops = [];
                window.game.mobilityLayer.pendingRoute = null;
                window.game.mobilityLayer.transitMode = null;
            }
            
            // Hide the modal
            if (routeModal) {
                routeModal.style.display = 'none';
            }
        });
    }
    
    // Optimal pricing functionality
    const optimalPricingBtn = document.getElementById('optimal-pricing');
    if (optimalPricingBtn) {
        optimalPricingBtn.addEventListener('click', () => {
            // Calculate optimal price based on demand/supply economics
            const baseDemand = 200; // Base daily ridership
            const optimalPrice = 2.75; // Sweet spot for supply/demand balance
            
            // Update the ticket price input
            const ticketPriceInput = document.getElementById('ticket-price');
            if (ticketPriceInput) {
                ticketPriceInput.value = optimalPrice.toFixed(2);
                
                // Update revenue projections
                const ridership = Math.max(50, baseDemand - (optimalPrice - 1.0) * 60);
                const dailyRevenue = ridership * optimalPrice;
                const dailyCosts = 25;
                const dailyProfit = dailyRevenue - dailyCosts;
                
                // Update displays
                document.getElementById('daily-ridership').textContent = Math.round(ridership);
                document.getElementById('daily-revenue').textContent = `$${Math.round(dailyRevenue)}`;
                document.getElementById('daily-profit').textContent = `$${Math.round(dailyProfit)}`;
                document.getElementById('monthly-profit').textContent = `$${Math.round(dailyProfit * 30).toLocaleString()}`;
                
                // Visual feedback
                optimalPricingBtn.textContent = '✓ Optimal Price Applied';
                optimalPricingBtn.style.backgroundColor = '#4CAF50';
                setTimeout(() => {
                    optimalPricingBtn.textContent = 'Suggest Optimal Price';
                    optimalPricingBtn.style.backgroundColor = '';
                }, 2000);
            }
        });
    }
    
    // Market dashboard slider event listeners
    const marketSliders = [
        'jobs-elasticity', 'energy-elasticity', 'education-elasticity', 'food-elasticity', 'housing-elasticity', 'healthcare-elasticity',
        'jobs-radius', 'energy-radius', 'education-radius', 'food-radius', 'housing-radius', 'healthcare-radius',
        'min-price', 'max-price'
    ];
    
    marketSliders.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        if (slider) {
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                const valueDisplay = document.getElementById(sliderId + '-val');
                if (valueDisplay) {
                    if (sliderId.includes('price')) {
                        valueDisplay.textContent = value.toFixed(2) + 'x';
                    } else if (sliderId.includes('radius')) {
                        valueDisplay.textContent = value + (value === 999 ? ' (City-wide)' : '');
                    } else {
                        valueDisplay.textContent = value.toFixed(1);
                    }
                }
            });
        }
    });
    
    // Update revenue projections when ticket price changes
    const ticketPriceInput = document.getElementById('ticket-price');
    if (ticketPriceInput) {
        ticketPriceInput.addEventListener('input', () => {
            const price = parseFloat(ticketPriceInput.value) || 2.50;
            const baseDemand = 200;
            const ridership = Math.max(50, baseDemand - (price - 1.0) * 60);
            const dailyRevenue = ridership * price;
            const dailyCosts = 25;
            const dailyProfit = dailyRevenue - dailyCosts;
            
            // Update displays
            document.getElementById('daily-ridership').textContent = Math.round(ridership);
            document.getElementById('daily-revenue').textContent = `$${Math.round(dailyRevenue)}`;
            document.getElementById('daily-profit').textContent = `$${Math.round(dailyProfit)}`;
            document.getElementById('monthly-profit').textContent = `$${Math.round(dailyProfit * 30).toLocaleString()}`;
        });
    }
    
    // Player menu options
    const showLeaderboardBtn = document.getElementById('show-leaderboard');
    if (showLeaderboardBtn) {
        showLeaderboardBtn.addEventListener('click', () => {
            if (window.game) {
                window.game.showLeaderboardModal();
            }
            // Close player menu
            const playerMenu = document.getElementById('player-menu');
            if (playerMenu) {
                playerMenu.classList.remove('active');
            }
        });
    }

    const showPlayerStatsBtn = document.getElementById('show-player-stats');
    if (showPlayerStatsBtn) {
        showPlayerStatsBtn.addEventListener('click', () => {
            if (window.game) {
                window.game.showPlayerStatsModal();
            }
            // Close player menu
            const playerMenu = document.getElementById('player-menu');
            if (playerMenu) {
                playerMenu.classList.remove('active');
            }
        });
    }

    const saveGameBtn = document.getElementById('save-game');
    if (saveGameBtn) {
        saveGameBtn.addEventListener('click', () => {
            if (window.game) {
                window.game.showSaveGameModal();
            }
            // Close player menu
            const playerMenu = document.getElementById('player-menu');
            if (playerMenu) {
                playerMenu.classList.remove('active');
            }
        });
    }

    // Reset game button
    const resetGameBtn = document.getElementById('reset-game');
    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the game? This will clear all progress and cannot be undone.')) {
                if (window.game) {
                    window.game.resetGame();
                }
            }
            // Close player menu
            const playerMenu = document.getElementById('player-menu');
            if (playerMenu) {
                playerMenu.classList.remove('active');
            }
        });
    }

    // Attenuation overlay toggle button
    const toggleAttenuationBtn = document.getElementById('toggle-attenuation-overlay');
    if (toggleAttenuationBtn) {
        toggleAttenuationBtn.addEventListener('click', () => {
            if (window.game) {
                // Toggle the visualization state
                window.game.showAttenuationVisualization = !window.game.showAttenuationVisualization;

                // Update the status text
                const statusSpan = document.getElementById('attenuation-status');
                if (statusSpan) {
                    statusSpan.textContent = window.game.showAttenuationVisualization ? 'ON' : 'OFF';
                }

                // Request a re-render to show/hide the overlay
                window.game.scheduleRender();

                console.log('🌿 Attenuation visualization:', window.game.showAttenuationVisualization ? 'enabled' : 'disabled');
            }
            // Close player menu
            const playerMenu = document.getElementById('player-menu');
            if (playerMenu) {
                playerMenu.classList.remove('active');
            }
        });
    }

    const confirmSaveBtn = document.getElementById('confirm-save');
    if (confirmSaveBtn) {
        confirmSaveBtn.addEventListener('click', () => {
            if (window.game) {
                window.game.saveGame();
            }
        });
    }
    
    // Global modal functions with smooth animations
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
    
    
    // CSV refresh button functionality
    const refreshCsvBtn = document.getElementById('refresh-csv-btn');
    if (refreshCsvBtn) {
        refreshCsvBtn.addEventListener('click', async () => {
        const btn = document.getElementById('refresh-csv-btn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '⏳ Refreshing...';
            btn.disabled = true;
            
            if (window.refreshBuildingsFromCSV) {
                await window.refreshBuildingsFromCSV();
                btn.innerHTML = '✅ Refreshed!';
                
                if (game && game.populateBuildingCategories) {
                    game.populateBuildingCategories();
                }
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 2000);
            } else {
                throw new Error('Refresh function not available');
            }
        } catch (error) {
            console.error('Failed to refresh buildings:', error);
            btn.innerHTML = '❌ Failed';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
        }
        });
    }
    
    // Initialize building position controls
    window.buildingPositionControls = {
        yOffset: 22,
        heightMultiplier: 1.0,
        widthMultiplier: 1.0
    };
    
    // Building position control event listeners
    const yOffsetSlider = document.getElementById('building-y-offset');
    const heightSlider = document.getElementById('building-height-multiplier');
    const widthSlider = document.getElementById('building-width-multiplier');

    const yOffsetValue = document.getElementById('y-offset-value');
    const heightValue = document.getElementById('height-multiplier-value');
    const widthValue = document.getElementById('width-multiplier-value');

    const debugYOffset = document.getElementById('debug-y-offset');
    const debugHeight = document.getElementById('debug-height');
    const debugWidth = document.getElementById('debug-width');

    function updateBuildingPositionDisplay() {
        if (yOffsetValue && yOffsetSlider) yOffsetValue.textContent = yOffsetSlider.value + 'px';
        if (heightValue && heightSlider) heightValue.textContent = heightSlider.value + 'x';
        if (widthValue && widthSlider) widthValue.textContent = widthSlider.value + 'x';

        if (debugYOffset && yOffsetSlider) debugYOffset.textContent = yOffsetSlider.value;
        if (debugHeight && heightSlider) debugHeight.textContent = heightSlider.value;
        if (debugWidth && widthSlider) debugWidth.textContent = widthSlider.value;
    }

    if (yOffsetSlider) {
        yOffsetSlider.addEventListener('input', () => {
            window.buildingPositionControls.yOffset = parseInt(yOffsetSlider.value);
            updateBuildingPositionDisplay();
            game.scheduleRender();
        });
    }

    if (heightSlider) {
        heightSlider.addEventListener('input', () => {
            window.buildingPositionControls.heightMultiplier = parseFloat(heightSlider.value);
            updateBuildingPositionDisplay();
            game.scheduleRender();
        });
    }

    if (widthSlider) {
        widthSlider.addEventListener('input', () => {
            window.buildingPositionControls.widthMultiplier = parseFloat(widthSlider.value);
            updateBuildingPositionDisplay();
            game.scheduleRender();
        });
    }
    
    const resetBuildingBtn = document.getElementById('reset-building-position');
    if (resetBuildingBtn) {
        resetBuildingBtn.addEventListener('click', () => {
        yOffsetSlider.value = 22;
        heightSlider.value = 1.0;
        widthSlider.value = 1.0;
        
        window.buildingPositionControls.yOffset = 22;
        window.buildingPositionControls.heightMultiplier = 1.0;
        window.buildingPositionControls.widthMultiplier = 1.0;
        
        updateBuildingPositionDisplay();
        game.scheduleRender();
        });
    }

    const applyPositionBtn = document.getElementById('apply-position');
    if (applyPositionBtn) {
        applyPositionBtn.addEventListener('click', () => {
        // Position applied (removed alert)
        });
    }

    // Initialize display
    updateBuildingPositionDisplay();
    
    // Initialize collapsible sections
    document.querySelectorAll('.section-header[data-target]').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            section.classList.toggle('collapsed');
        });
    });
    
    // Setup tooltips - now handled by external tooltip-manager.js
    if (typeof setupVitalityTooltips === 'function') {
        if (game.tooltipManager && game.tooltipManager.setupVitalityTooltips) {
            game.tooltipManager.setupVitalityTooltips();
        }
    }
    if (game.tooltipManager && game.tooltipManager.setupGameTooltips) {
        game.tooltipManager.setupGameTooltips();
    }
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all tabs
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active to clicked tab
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
    
    // Legacy Building Creator removed - now using CSV→JSON upload system
    
    // Legacy Building Export and Form Reset removed - now using CSV→JSON upload system

    // Legacy Amenity Creator removed - now using CSV→JSON upload system

    // Update building creator to use file data and persistence
    const originalCreateBuilding = document.getElementById('create-building');
    if (originalCreateBuilding) {
        originalCreateBuilding.replaceWith(originalCreateBuilding.cloneNode(true));
    }

    const createBuildingBtn = document.getElementById('create-building');
    if (createBuildingBtn) {
        createBuildingBtn.addEventListener('click', () => {
        const name = document.getElementById('building-name').value;
        const category = document.getElementById('building-category').value;
        const editingId = document.getElementById('create-building').dataset.editingId;
        const isDefaultCopy = document.getElementById('create-building').dataset.isDefaultCopy === 'true';
        
        if (!name.trim()) {
            return; // No building name entered
        }
        
        // Collect form data with file data
        const buildingData = {
            id: editingId || `custom_${category}_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            images: {
                construction: document.getElementById('construction-image').dataset.imageData || '',
                built: document.getElementById('built-image').dataset.imageData || ''
            },
            economics: {
                buildCost: parseInt(document.getElementById('build-cost').value) || 0,
                constructionDays: parseInt(document.getElementById('construction-days').value) || 1,
                maxRevenue: parseInt(document.getElementById('max-revenue').value) || 0,
                maintenanceCost: parseInt(document.getElementById('maintenance-cost').value) || 0
            },
            population: {
                jobsCreated: parseInt(document.getElementById('jobs-created').value) || 0,
                bedroomsAdded: parseInt(document.getElementById('bedrooms-added').value) || 0,
                populationRequired: parseInt(document.getElementById('population-required').value) || 0
            },
            resources: {
                energyDemand: parseInt(document.getElementById('energy-demand').value) || 0,
                foodProduction: parseInt(document.getElementById('food-production').value) || 0
            },
            decay: {
                rate: parseFloat(document.getElementById('decay-rate').value) || 5.0
            },
            prerequisites: document.getElementById('prerequisites').value
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0),
            // Note: domainImpacts removed - now using JSON building data with livability system
        };
        
        // Save using building manager
        window.buildingManager.saveBuilding(buildingData);
        
        const action = editingId ? 'updated' : (isDefaultCopy ? 'customized' : 'created');
        // Building saved successfully (removed alert)
        
        // Reset form and button if we were editing
        if (editingId || isDefaultCopy) {
            delete document.getElementById('create-building').dataset.editingId;
            delete document.getElementById('create-building').dataset.isDefaultCopy;
            document.getElementById('create-building').textContent = 'CREATE BUILDING';
            // Clear form
            document.getElementById('building-form').reset();
            document.querySelectorAll('#building-creator .impact-row input').forEach(input => {
                input.value = '0';
            });
            document.getElementById('construction-image').dataset.imageData = '';
            document.getElementById('built-image').dataset.imageData = '';
            document.getElementById('construction-preview').style.display = 'none';
            document.getElementById('built-preview').style.display = 'none';
            // Refresh building manager
            showTab('building-manager');
            showTab('building-creator');
        }
    });
    }

    // Load saved data on startup

    // Setup building manager
    setupBuildingManager();

    function setupBuildingManager() {
        populateBuildingList();
        
        // Setup filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Filter buildings
                const filter = btn.dataset.filter;
                populateBuildingList(filter);
            });
        });
        
        // Refresh building list when tab is activated
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tab === 'building-manager') {
                    populateBuildingList(); // Remove setTimeout for immediate response
                }
            });
        });
    }

    function populateBuildingList(filter = 'all') {
        const buildingList = document.getElementById('all-building-list');

        // Check if building list element exists
        if (!buildingList) {
            console.warn('Building list element not found - skipping population');
            return;
        }

        // Get all buildings from the building manager
        let allBuildings = window.buildingManager.getAllBuildings();
        
        // Apply filter
        if (filter === 'default') {
            allBuildings = allBuildings.filter(b => b.isDefault);
        } else if (filter === 'custom') {
            allBuildings = allBuildings.filter(b => !b.isDefault);
        }
        
        if (allBuildings.length === 0) {
            buildingList.innerHTML = `<p class="no-buildings">No ${filter === 'custom' ? 'custom' : filter === 'default' ? 'default' : ''} buildings found.</p>`;
            return;
        }
        
        // Batch DOM operations for better performance
        const fragment = document.createDocumentFragment();
        
        allBuildings.forEach(building => {
            const buildingItem = document.createElement('div');
            buildingItem.className = 'building-item';
            const isCustom = !building.isDefault;
            const buildCost = building.economics ? building.economics.buildCost : building.cost;
            const createdDate = isCustom && building.createdAt ? new Date(building.createdAt).toLocaleDateString() : 'Default';
            
            buildingItem.innerHTML = `
                <div class="building-info">
                    <h5>${building.name} ${building.isDefault ? '<span style="color: #888; font-size: 0.8em;">(DEFAULT)</span>' : '<span style="color: #4CAF50; font-size: 0.8em;">(CUSTOM)</span>'}</h5>
                    <p>Category: ${building.category} | Cost: $${buildCost.toLocaleString()} | ${isCustom ? 'Created' : 'Type'}: ${createdDate}</p>
                </div>
                <div class="building-actions">
                    <button class="secondary-btn edit-building-btn" data-building-id="${building.id}">EDIT</button>
                    <button class="danger-btn delete-building-btn" data-building-id="${building.id}">DELETE</button>
                </div>
            `;
            
            fragment.appendChild(buildingItem);
        });
        
        // Single DOM update
        buildingList.innerHTML = '';
        buildingList.appendChild(fragment);
        
        // Add event listeners for edit and delete buttons
        buildingList.querySelectorAll('.edit-building-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buildingId = e.target.dataset.buildingId;
                editBuilding(buildingId);
            });
        });
        
        buildingList.querySelectorAll('.delete-building-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buildingId = e.target.dataset.buildingId;
                deleteBuilding(buildingId);
            });
        });
    }

    function editBuilding(buildingId) {
        // Find building in the building manager
        const building = window.buildingManager.getBuildingById(buildingId);
        
        if (!building) {
            return; // Building not found
            return;
        }
        
        // Switch to building creator tab
        document.querySelector('[data-tab="building-creator"]').click();
        
        // Populate form with building data
        setTimeout(() => {
            document.getElementById('building-name').value = building.name;
            document.getElementById('building-category').value = building.category;
            document.getElementById('build-cost').value = building.economics?.buildCost || building.cost || 0;
            document.getElementById('construction-days').value = building.economics?.constructionDays || 7;
            document.getElementById('max-revenue').value = building.economics?.maxRevenue || 0;
            document.getElementById('maintenance-cost').value = building.economics?.maintenanceCost || 0;
            document.getElementById('decay-rate').value = building.decay?.rate || 0.01;
            document.getElementById('jobs-created').value = building.population?.jobsCreated || 0;
            document.getElementById('bedrooms-added').value = building.population?.bedroomsAdded || 0;
            document.getElementById('population-required').value = building.population?.populationRequired || 0;
            document.getElementById('energy-demand').value = building.resources?.energyDemand || 0;
            document.getElementById('food-production').value = building.resources?.foodProduction || 0;
            document.getElementById('prerequisites').value = building.prerequisites?.join(', ') || '';
            
            // Note: Domain impacts section removed - now using livability data from JSON buildings
            
            // Store building ID for update
            if (building.isDefault) {
                // For default buildings, create a custom copy with a new ID
                document.getElementById('create-building').dataset.isDefaultCopy = 'true';
                document.getElementById('create-building').textContent = 'CREATE CUSTOM COPY';
                // Don't set editingId for default buildings as we want to create new
            } else {
                document.getElementById('create-building').dataset.editingId = buildingId;
                document.getElementById('create-building').textContent = 'UPDATE BUILDING';
            }
            
            // Set images if they exist
            if (building.images.construction) {
                const constructionInput = document.getElementById('construction-image');
                constructionInput.dataset.imageData = building.images.construction;
                document.getElementById('construction-preview').innerHTML = 
                    `<img src="${building.images.construction}" alt="Preview">`;
            }
            
            if (building.images.built) {
                const builtInput = document.getElementById('built-image');
                builtInput.dataset.imageData = building.images.built;
                document.getElementById('built-preview').innerHTML = 
                    `<img src="${building.images.built}" alt="Preview">`;
            }
        }, 100);
    }

    function deleteBuilding(buildingId) {
        const building = window.buildingManager.getBuildingById(buildingId);

        if (!building) {
            return; // Building not found
        }
        
        if (confirm(`Are you sure you want to delete "${building.name}"? This action cannot be undone.`)) {
            window.buildingManager.deleteBuilding(buildingId);
            populateBuildingList();
            // Building deleted (removed alert)
        }
    }

    // Legacy DCF functions removed - now handled by UIManager

    // Transportation modal functions removed - now using modular transportation system


    // Setup economic multiplier controls
    function setupMultiplierControls() {
        // Get all slider elements and their corresponding value displays
        const sliders = {
            'energy-multiplier': 'energy',
            'food-multiplier': 'food',
            'housing-multiplier': 'housing',
            'jobs-multiplier': 'jobs',
            'population-growth-rate': 'populationGrowthRate',
            'shortage-threshold': 'shortageThreshold',
            'oversupply-threshold': 'oversupplyThreshold',
            'base-revenue-multiplier': 'baseRevenue',
            'maintenance-multiplier': 'maintenance'
        };
        
        // Setup each slider
        Object.entries(sliders).forEach(([sliderId, propertyName]) => {
            const slider = document.getElementById(sliderId);
            if (!slider) {
                return;
            }

            const valueDisplay = slider.parentElement.querySelector('.multiplier-value');
            if (!valueDisplay) {
                console.warn(`Value display not found for slider: ${sliderId}`);
                return;
            }
            
            // Load saved value or use current game value
            const savedValue = localStorage.getItem(`multiplier_${propertyName}`);
            if (savedValue) {
                slider.value = savedValue;
                window.game.economicMultipliers[propertyName] = parseFloat(savedValue);
            }
            
            // Update display
            updateValueDisplay(slider, valueDisplay, propertyName);
            
            // Add event listener for real-time updates
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                window.game.economicMultipliers[propertyName] = value;
                updateValueDisplay(slider, valueDisplay, propertyName);
                
                // Save to localStorage
                localStorage.setItem(`multiplier_${propertyName}`, value);
                
                // Sync with sidebar panel if it exists
                // syncSidebarSlider(propertyName, value); // Removed - sidebar economic controls no longer exist
                
                // Recalculate vitality in real-time
                window.game.calculateCityVitality();
                window.game.updateVitalityDisplay();
            });
        });
        
        // Reset button
        const resetMultipliersBtn = document.getElementById('reset-multipliers');
        if (resetMultipliersBtn) {
            resetMultipliersBtn.addEventListener('click', () => {
            if (confirm('Reset all multipliers to default values?')) {
                Object.keys(sliders).forEach(sliderId => {
                    const slider = document.getElementById(sliderId);
                    const propertyName = sliders[sliderId];
                    const defaultValue = getDefaultMultiplier(propertyName);
                    
                    slider.value = defaultValue;
                    window.game.economicMultipliers[propertyName] = defaultValue;
                    
                    const valueDisplay = slider.parentElement.querySelector('.multiplier-value');
                    updateValueDisplay(slider, valueDisplay, propertyName);
                    
                    // Clear localStorage
                    localStorage.removeItem(`multiplier_${propertyName}`);
                });
                
                // Recalculate
                window.game.calculateCityVitality();
                window.game.updateVitalityDisplay();
            }
            });
        }

        // Apply button (mainly for feedback, changes are already applied in real-time)
        const applyBtn = document.getElementById('apply-multipliers');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
            // Force recalculation
            window.game.calculateCityVitality();
            window.game.updateVitalityDisplay();

            // Visual feedback
            const btn = document.getElementById('apply-multipliers');
            const originalText = btn.textContent;
            btn.textContent = 'Applied!';
            btn.style.background = '#42B96E';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 1000);
            });
        }

        // Server reset button
        const resetServerBtn = document.getElementById('reset-server');
        if (resetServerBtn) {
            resetServerBtn.addEventListener('click', async () => {
            if (confirm('⚠️ This will reset the server and disconnect all players. Are you sure?')) {
                const btn = document.getElementById('reset-server');
                const statusDiv = document.getElementById('server-status');

                btn.textContent = 'Resetting...';
                btn.disabled = true;
                statusDiv.textContent = 'Sending reset request...';

                try {
                    const response = await fetch('/reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const result = await response.json();

                    if (result.success) {
                        statusDiv.textContent = `✅ Server reset at ${new Date(result.timestamp).toLocaleTimeString()}`;

                        // Show reset success message
                        btn.textContent = '✅ Reset Complete';
                        btn.style.background = '#28a745';

                        setTimeout(() => {
                            alert('Server has been reset. Please refresh the page to reconnect.');
                            window.location.reload();
                        }, 1000);
                    } else {
                        statusDiv.textContent = `❌ Reset failed: ${result.message || 'Unknown error'}`;
                    }
                } catch (error) {
                    console.error('Reset failed:', error);
                    statusDiv.textContent = `❌ Reset failed: ${error.message}`;
                } finally {
                    btn.disabled = false;
                    setTimeout(() => {
                        btn.textContent = '🔄 Reset Server';
                        btn.style.background = '';
                    }, 3000);
                }
            }
            });
        }

        // Update server status periodically
        async function updateServerStatus() {
            const statusDiv = document.getElementById('server-status');
            if (!statusDiv) return;

            try {
                const response = await fetch('/health');
                const data = await response.json();
                statusDiv.textContent = `✅ Online | Players: ${data.players} | Connections: ${data.connections} | Uptime: ${Math.floor(data.uptime)}s`;
            } catch (error) {
                statusDiv.textContent = `❌ Server unreachable`;
            }
        }

        // Update status every 5 seconds
        updateServerStatus();
        setInterval(updateServerStatus, 5000);
    }

    function updateValueDisplay(slider, valueDisplay, propertyName) {
        const value = parseFloat(slider.value);
        
        // Format display based on property type
        if (propertyName === 'populationGrowthRate') {
            valueDisplay.textContent = `${(value * 100).toFixed(1)}%`;
        } else if (propertyName.includes('threshold')) {
            valueDisplay.textContent = value.toFixed(2);
        } else {
            valueDisplay.textContent = `${value.toFixed(1)}x`;
        }
    }

    function getDefaultMultiplier(propertyName) {
        const defaults = {
            energy: 1.0,
            food: 1.0,
            housing: 1.0,
            jobs: 1.0,
            populationGrowthRate: 0.02,
            shortageThreshold: 0.8,
            oversupplyThreshold: 2.0,
            baseRevenue: 1.0,
            maintenance: 1.0
        };
        return defaults[propertyName] || 1.0;
    }

    // Setup road adjustment controls
    const roadAngle = document.getElementById('road-angle');
    const roadAngleValue = document.getElementById('road-angle-value');
    const roadWidthMultiplier = document.getElementById('road-width-multiplier');
    const roadWidthValue = document.getElementById('road-width-value');
    const roadOffsetX = document.getElementById('road-offset-x');
    const roadOffsetXValue = document.getElementById('road-offset-x-value');
    const roadOffsetY = document.getElementById('road-offset-y');
    const roadOffsetYValue = document.getElementById('road-offset-y-value');

    const resetRoadBtn = document.getElementById('reset-road-controls');

    // Helper function to update road values and trigger redraw (roads only!)
    function updateRoadAdjustment(property, value, displayElement, suffix = '') {
        game.roadAdjustments[property] = parseFloat(value);
        displayElement.textContent = value + suffix;
        game.scheduleRender();
    }

    // Road angle control
    if (roadAngle) {
        roadAngle.addEventListener('input', (e) => {
            updateRoadAdjustment('angle', e.target.value, roadAngleValue, '°');
        });
    }

    // Road width multiplier control
    if (roadWidthMultiplier) {
        roadWidthMultiplier.addEventListener('input', (e) => {
            updateRoadAdjustment('widthMultiplier', e.target.value, roadWidthValue, 'x');
        });
    }

    // Road X offset control
    if (roadOffsetX) {
        roadOffsetX.addEventListener('input', (e) => {
            updateRoadAdjustment('offsetX', e.target.value, roadOffsetXValue, 'px');
        });
    }

    // Road Y offset control
    if (roadOffsetY) {
        roadOffsetY.addEventListener('input', (e) => {
            updateRoadAdjustment('offsetY', e.target.value, roadOffsetYValue, 'px');
        });
    }

    // Reset button
    if (resetRoadBtn) {
        resetRoadBtn.addEventListener('click', () => {
        // Reset all road adjustment values to defaults
        game.roadAdjustments = {
            angle: 0,
            widthMultiplier: 1.0,
            offsetX: 0,
            offsetY: 0,
        };

        // Update UI controls
        roadAngle.value = 0;
        roadAngleValue.textContent = '0°';
        roadWidthMultiplier.value = 1.0;
        roadWidthValue.textContent = '1.0x';
        roadOffsetX.value = 0;
        roadOffsetXValue.textContent = '0px';
        roadOffsetY.value = 0;
        roadOffsetYValue.textContent = '0px';

        game.scheduleRender();
        });
    }

}); // End DOMContentLoaded listener

// REMOVED - Economic balance controls are now only in dev tools
/*
function setupSidebarMultipliers() {
    const sidebarSliders = {
        'sidebar-energy-multiplier': 'energy',
        'sidebar-food-multiplier': 'food',
        'sidebar-housing-multiplier': 'housing',
        'sidebar-jobs-multiplier': 'jobs',
        'sidebar-population-growth-rate': 'populationGrowthRate',
        'sidebar-base-revenue-multiplier': 'baseRevenue',
        'sidebar-maintenance-multiplier': 'maintenance'
    };

    // Setup each sidebar slider
    Object.entries(sidebarSliders).forEach(([sliderId, propertyName]) => {
        const slider = document.getElementById(sliderId);
        const valueDisplay = slider.parentElement.querySelector('.multiplier-value-compact');

        if (!slider || !valueDisplay) return;

        // Load saved value or use current game value
        const savedValue = localStorage.getItem(`multiplier_${propertyName}`);
        if (savedValue) {
            slider.value = savedValue;
            window.game.economicMultipliers[propertyName] = parseFloat(savedValue);
        }

        // Update display
        updateSidebarValueDisplay(slider, valueDisplay, propertyName);

        // Add event listener for real-time updates
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            window.game.economicMultipliers[propertyName] = value;
            updateSidebarValueDisplay(slider, valueDisplay, propertyName);

            // Save to localStorage
            localStorage.setItem(`multiplier_${propertyName}`, value);
        });
    });
}

function updateSidebarValueDisplay(slider, valueDisplay, propertyName) {
    const value = parseFloat(slider.value);

    // Format display based on property type
    if (propertyName === 'populationGrowthRate') {
        valueDisplay.textContent = `${(value * 100).toFixed(1)}%`;
    } else {
        valueDisplay.textContent = `${value.toFixed(1)}x`;
    }
}
*/

// REMOVED - Part of sidebar economic balance controls
/*
function syncSidebarSlider(propertyName, value) {
    // Map property names to sidebar slider IDs
    const sidebarSliderMap = {
        energy: 'sidebar-energy-multiplier',
        food: 'sidebar-food-multiplier',
        housing: 'sidebar-housing-multiplier',
        jobs: 'sidebar-jobs-multiplier',
        populationGrowthRate: 'sidebar-population-growth-rate',
        baseRevenue: 'sidebar-base-revenue-multiplier',
        maintenance: 'sidebar-maintenance-multiplier'
    };

    const sidebarSliderId = sidebarSliderMap[propertyName];
    if (sidebarSliderId) {
        const sidebarSlider = document.getElementById(sidebarSliderId);
        if (sidebarSlider) {
            sidebarSlider.value = value;
            const valueDisplay = sidebarSlider.parentElement.querySelector('.multiplier-value-compact');
            if (valueDisplay) {
                updateSidebarValueDisplay(sidebarSlider, valueDisplay, propertyName);
            }
        }
    }
}
*/


