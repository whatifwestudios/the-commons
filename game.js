
class IsometricGrid {
    constructor(canvas, gridSize = 12) {
        console.log('🎯 🎯 🎯 CONSTRUCTOR CALLED WITH CANVAS:', canvas);
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
        
        // Initialize V2 Economic System (server-authoritative)
        // Enable WebSocket for real-time multiplayer state synchronization
        this.economicClient = new EconomicClient(this, true);

        // Economic engines replaced by v2 server-authoritative system

        // Initialize economic data structures with safe defaults
        this.initializeEconomicDefaults();
        
        // Initialize V2 Rendering System (now the standard)
        this.renderingSystem = new RenderingSystemV2(this);

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


        // Initialize unified tooltip system
        this.tooltipSystemV2 = new TooltipSystemV2(this);

        // Connect V2 systems to data sources
        if (this.economicClient) {
            this.economicClient.onUpdate((update) => {
                // Send updates to rendering system
                if (this.renderingSystem) {
                    this.renderingSystem.handleServerUpdate(update);
                }
            });
        }

        // V2 system is now the standard

        // Initialize context menu system
        this.contextMenuSystem = new ContextMenuSystem(this);

        // Initialize parcel selector manager for hover effects
        this.parcelHover = new ParcelHoverV2(this);

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

        // V2: Simple client-side balance tracking (server-authoritative)
        // ❌ REMOVED: Initial cash value set by server
        this._playerCash = 0; // Will be set by server sync
        this._playerWealth = 0; // Will be calculated from server data

        console.log('💰 DEBUG: Client initialized with $0, waiting for server sync...');

        // Legacy cityTreasury removed - now using governanceSystem.totalBudget
        console.log('💰 Client cash tracking initialized (server-authoritative)');

        // Define playerCash as getter/setter for compatibility
        Object.defineProperty(this, 'playerCash', {
            get: function() {
                return this._playerCash;
            },
            set: function(value) {
                this._playerCash = value;
            }
        });

        // ✅ CLEANED: CashManager removed - using V2 server-authoritative Economic Client directly

        // ❌ REMOVED: Legacy hardcoded date - server manages game time
        // Date is now synced from server gameTime broadcasts

        // Game date calculation from server time
        this.getGameDate = () => {
            if (this.economicClient && this.economicClient.gameTime !== undefined) {
                // Server starts at gameTime = 1.0 = Sept 2 (Henry George's birthday)
                const gameDay = Math.floor(this.economicClient.gameTime);
                const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
                const month = monthOrder[Math.floor(gameDay / 30) % 12];
                const day = (gameDay % 30) + 1;
                return { month, day };
            }
            return { month: 'SEPT', day: 2 }; // Fallback to correct starting date
        };

        // Compatibility property for legacy systems that expect this.gameDate
        Object.defineProperty(this, 'gameDate', {
            get: () => this.getGameDate()
        });
        
        // Start game time updates (1 year = 1 hour = 3600 seconds)
        // 1 day in game = 3600/365 = ~9.86 seconds real time
        // V2: Removed client-side day timing - using server-authoritative time
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
                        paidPrice: 0, // Amount paid in purchase
                        calculatedValue: 0 // Game state calculated value
                    }
                };
            }
        }
        
        // Clean slate - all parcels start unowned
        
        // Edge parcels system - buildable spaces on grid lines
        this.initializeEdgeParcels();
        
        // Parcel selection and visualization
        // REMOVED: Legacy hoveredTile - ParcelHoverV2 handles hover state
        this.selectedParcel = null; // Currently selected parcel for reach display
        this.parcelReach = null; // Cached reach calculation for selected parcel
        this.hoverInfluenceRadius = null; // Set of tiles influenced by hover
        
        // Transportation System - Clean slate
        // this.transportationSystem = new TransportationSystem(this); // Disabled: Replaced by mobility-layer-v2.js
        this.transportationSystem = null; // Will be replaced by v2 integration

        // Transport capacity system removed - was 75% dead code

        // Mobility Layer - Legacy system (being replaced by v2)
        // this.mobilityLayer = new MobilityLayer(this); // Disabled: Replaced by v2
        this.mobilityLayer = null; // Will be replaced by v2 integration

        // Initialize Mobility Layer v2 - Clean Replacement System
        // DISABLED: Testing without any mobility systems
        // this.mobilityV2 = new MobilityV2Integration(this);
        // this.mobilityV2.initialize().then(success => {
        //     if (success) {
        //         console.log('🚀 Mobility Layer v2 initialized successfully!');
        //         console.log('🎯 Ready to replace legacy transportation.js system');
        //         console.log('📋 Use mobilityV2.replaceLegacySystems() to fully replace legacy');
        //     } else {
        //         console.error('❌ Mobility v2 initialization failed - keeping legacy systems');
        //     }
        // });
        this.mobilityV2 = null; // DISABLED: Testing without mobility
        
        // Parcel selector fade system
        // REMOVED: Legacy hover timing - ParcelHoverV2 handles animations
        // REMOVED: Legacy selectorOpacity - ParcelHoverV2 handles opacity
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
        // V2: Removed client-side day tracking - using server-authoritative time
        this.pixelRowTimestamps = new Map(); // Track when each pixel row was revealed: "row,col" -> [timestamps]
        
        
        // Sub-menu hover management
        this.currentSubmenu = null; // Currently visible submenu element
        this.submenuTimer = null; // Timer for submenu hide delay
        
        // Map layer system
        this.currentLayer = 'normal'; // 'normal', 'transportation'
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
        
        this.renderingSystem.setupCanvas();
        this.initDOMCache();
        this.populateBuildingCategories();

        console.log('🎯 About to call setupEventListeners from constructor');
        this.setupEventListeners();
        console.log('🎯 setupEventListeners completed from constructor');

        this.setupZoomControls();
        this.setupLayerControls();
        
        // Initialize performance caches - mark all regions as dirty for first calculation
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                this.dirtyRegions.add(`${row}-${col}`);
            }
        }
        
        // V2: UI updates handled by ui-manager
        if (this.uiManager && this.economicClient) {
            this.uiManager.updateEconomicDisplays(this.economicClient);
        }
        // V2: Cashflow handled by economic client - initialize through updateCashflowAsync()
        this.updateCashflowAsync();

        // Initialize V2 Economic System
        this.initializeEconomicClientV2();

        this.updatePlayerStats(); // Async call - don't await to avoid blocking initialization
        this.updateActionDisplay(); // Initialize action display
        this.updateMonthCountdown(); // Initialize countdown
        // Transportation network starts empty - players build from scratch
        
        // Update countdown every second
        setInterval(async () => {
            this.updateMonthCountdown();
            if (this.actionMarketplace && this.actionMarketplace.updateAuctionCountdowns) {
                this.actionMarketplace.updateAuctionCountdowns();
            }
            // Building construction progress - SERVER AUTHORITATIVE (disabled client-side time progression)
            // Construction updates now come from server via BUILD_COMPLETE_AUTO messages
            // Client just renders current state, doesn't advance time
        }, 1000);
        
        // Periodic sync removed - not needed for solo game
        
        // Initialize Action Marketplace V2
        this.actionMarketplace = new ActionMarketplaceV2(this);

        // Multiplayer system removed for clean solo game
    }
    
    isCurrentPlayer(owner) {
        // Use PlayerUtils to check if owner matches current player ID
        return PlayerUtils.isCurrentPlayer(owner);
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
                            buildingAge: 0,
                            decay: 0,
                            population: 0,
                            maxPopulation: 0,
                            landValue: {
                                paidPrice: 0,
                                calculatedValue: 100,
                                lastAuctionDay: 0
                            },
                            constructionStartDay: null,
                            constructionDays: 0,
                            _constructionProgress: 1.0,
                            _isUnderConstruction: false,
                            _constructionStartTime: null,
                            _constructionDays: 0
                        };
                    }
                }
            }
        }
        
        // Reset player state
        this.currentPlayer = 1;
        // Preserve playerSettings if they were set during initialization (don't reset to null)
        // This prevents the color from being wiped out when startGame() is called after initializeWithPlayerConfig()
        
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
        // V2: Removed client-side day tracking - using server-authoritative time
        
        // Clear rendering caches
        this.dirtyRegions.clear();
        this.buildingEfficiencies?.clear();
        this.pixelRowTimestamps?.clear();
        
        // Clear mobility layer if it exists (legacy v1 - disabled for v2)
        // if (this.mobilityLayer) {
        //     this.mobilityLayer.roads?.clear();
        //     this.mobilityLayer.reset?.();
        // }
        
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
        
        
        this.startGameTime();
        this.scheduleRender();

        // Start construction animation manager
        this.startConstructionAnimationManager();

        // Start live tooltip updates for time-based tooltips
        this.startLiveTooltipUpdates();

        // Initialize real-time synchronization for multiplayer reliability
        this.initializeRealtimeSync();

        // Initialize game loop for construction progress and cash accrual
        this.initializeGameLoop();
        
        // Load existing player settings if available
        await this.loadPlayerSettings();

        // Update player button with current settings (including beer hall lobby data)
        this.updatePlayerButton();

        // Initialize panel states - ensure players panel is collapsed by default
        this.initializePanelStates();

        // Initialize UI displays with current values
        this.updatePlayerStats(); // Async call - don't await to avoid blocking
        this.updateActionDisplay();
        this.updateMonthCountdown();
    }

    /**
     * Initialize game with clean player configuration from onboarding system
     * @param {Object} playerConfig - Clean player configuration from onboarding
     */
    async initializeWithPlayerConfig(playerConfig) {
        console.log('🎮 🎮 🎮 INITIALIZING WITH PLAYER CONFIG 🎮 🎮 🎮');
        console.log('🎮 Initializing game with player config:', playerConfig);
        console.log('🎨 DEBUG: Player config color:', playerConfig.color);


        // Store clean player config
        this.playerConfig = playerConfig;

        // All modes (solo and multiplayer) use server-based economic system
        // Solo mode gets its own isolated table with one player
        console.log('🔌 Initializing server connection for isolated game state');

        // WebSocket should already be connected via V2 server-first player ID system
        if (playerConfig.waitingForPlayers) {
            console.log('🔌 Multiplayer mode - WebSocket managed by beer hall system');
        } else if (playerConfig.mode === 'solo') {
            console.log('🎮 Solo mode - isolated table with own economic engine');
        } else {
            console.log('🔌 V2: WebSocket already managed by server-first player ID system');
        }

        // Force economic WebSocket initialization for all modes
        // Solo and multiplayer both need server-side economic calculations
        console.log('🔌 FORCE: Initializing economic WebSocket for building performance data');
        this.economicClient.initializeWebSocket();

        // Set currentPlayerId for cash manager and transactions
        this.currentPlayerId = playerConfig.id;
        console.log('🆔 Set currentPlayerId to:', this.currentPlayerId);

        // Sync player ID to Economic Client immediately
        if (this.economicClient) {
            this.economicClient.playerId = this.currentPlayerId;
            console.log('🔗 Economic Client player ID synced:', this.currentPlayerId);
        }

        // Convert to legacy playerSettings format for compatibility
        this.playerSettings = {
            name: playerConfig.name,
            color: playerConfig.color,
            emoji: '🏛️', // Default emoji
            id: playerConfig.id
        };

        // Set CSS custom property for UI elements
        document.documentElement.style.setProperty('--player-color', playerConfig.color);

        // Save to localStorage for consistency
        localStorage.setItem('theCommons_playerSettings', JSON.stringify(this.playerSettings));
        // Also save individual color for governance system
        localStorage.setItem('playerColor', playerConfig.color);

        // V2: Onboarding complete
        if (playerConfig.mode === 'solo') {
            console.log('🎮 V2: Solo mode onboarding complete - isolated table ready');

            // Hide Action Manager in solo mode
            const actionManagerSection = document.getElementById('action-manager-section');
            if (actionManagerSection) {
                actionManagerSection.style.display = 'none';
                console.log('🎮 Action Manager hidden in solo mode');
            }
        } else {
            console.log('🍺 V2: Multiplayer mode onboarding complete - no legacy server reset needed');
        }

        // Update ParcelSelectorManager with player color (after playerSettings is set)
        console.log('🎨 DEBUG: About to set parcelHover color. parcelHover exists:', !!this.parcelHover);
        console.log('🎨 DEBUG: playerSettings:', this.playerSettings);
        console.log('🎨 DEBUG: playerSettings.color:', this.playerSettings?.color);
        if (this.parcelHover) {
            this.parcelHover.playerColor = this.playerSettings?.color || '#10AC84';
            console.log('🎨 DEBUG: Set parcelHover.playerColor to:', this.parcelHover.playerColor);
        } else {
            console.warn('🎨 DEBUG: parcelHover is null/undefined!');
        }

        // Force re-render to show updated player colors
        this.scheduleRender();

        // Sync player color with server (essential for multiplayer consistency)
        try {
            await fetch('/api/player/color', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: 'player', // Solo game always uses 'player' as ID
                    color: playerConfig.color
                })
            });
        } catch (error) {
            console.warn('Could not sync player color with server:', error);
        }

        // Force cash reset to ensure clean start
        localStorage.setItem('theCommons_forceReset', 'true');

        // Update UI with player info
        this.updatePlayerNameInUI();

        // Generate and set city name - make it persistent per player ID
        let cityName = localStorage.getItem(`cityName_${playerConfig.id}`);
        if (!cityName) {
            cityName = generateCityName().toUpperCase();
            localStorage.setItem(`cityName_${playerConfig.id}`, cityName);
        }

        const cityNameElement = document.getElementById('city-name');
        if (cityNameElement) {
            cityNameElement.textContent = cityName;
        }

        // Start the game
        await this.startGame();

        // Start the game timer now that the game has truly begun (not during lobby/chat)
        if (this.economicClient) {
            this.economicClient.startClientClock();
        }

        // Explicit canvas setup and render (ensures proper initialization)
        if (this.renderingSystem) {
            this.renderingSystem.setupCanvas();
            // Use scheduleRender instead of direct render to respect V1/V2 routing
        }

        // Schedule initial render with new player color
        this.scheduleRender();

        // ❌ REMOVED: Force reset conflicts with server-authoritative balance
        // Server sets initial balance, client should not override

        // Set up testing helpers for development
        if (!window.resetCash) {
            window.resetCash = () => {
                // ✅ CLEANED: Using server-authoritative reset via Economic Client
                if (this.economicClient) {
                    console.log('🔄 Resetting to server-authoritative balance...');
                    this.economicClient.syncBalanceWithServer();
                } else {
                    console.error('Economic Client not available');
                }
            };
        }

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
    
    

    async resetServerForOnboarding() {
        // V2: Multiplayer mode - no legacy server resets
        console.log('🍺 V2: resetServerForOnboarding() disabled in multiplayer mode');
        return; // Early return - no legacy reset in multiplayer

    }

    async loadPlayerSettings() {
        try {
            // Only load from localStorage as fallback if no playerSettings exist
            // (Modern initialization via initializeWithPlayerConfig() takes precedence)
            if (!this.playerSettings) {
                const savedSettings = localStorage.getItem('theCommons_playerSettings');
                if (savedSettings) {
                    this.playerSettings = JSON.parse(savedSettings);
                    console.log('🔄 Loaded fallback playerSettings from localStorage');
                }
            } else {
                console.log('✅ PlayerSettings already set via modern initialization, skipping legacy load');
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
            // Get player name and color from beer hall lobby first, then fallback to player settings
            const playerName = window.beerHallLobby?.playerName || this.playerSettings?.name || 'PLAYER';
            const playerColor = window.beerHallLobby?.selectedColor || this.playerSettings?.color || '#4CAF50';

            // Update button with colored name
            playerBtn.innerHTML = `
                <span style="color: ${playerColor}; font-weight: bold;">${playerName.toUpperCase()}</span>
                <span class="indicator">⌄</span>
            `;
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
        
        // DISABLED: Client-side day progression (SERVER AUTHORITATIVE TIME)
        // Server manages game time via economicClient updates
        // Client receives time updates and only renders current state

        // setInterval(async () => {
        //     this.currentDay++;
        //     this.lastDayStartTime = performance.now();
        //     await this.updateGameDate();
        //     await this.processDailyCashflow(); // Server handles this
        //     this.updatePlayerStats();
        //     this.scheduleRender();
        // }, this.dayLength);
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

        // Start optimistic countdown if not already running
        this.startOptimisticCountdown();

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

        // V2: Use server-authoritative time instead of client performance.now()
        let secondsRemainingInDay = 0;
        if (this.economicClient && this.economicClient.gameTime !== undefined) {
            // Server-authoritative time calculation
            const currentDay = Math.floor(this.economicClient.gameTime);
            const dayProgress = this.economicClient.gameTime - currentDay; // 0.0 to 0.999...
            secondsRemainingInDay = (1 - dayProgress) * secondsPerDay;
        } else {
            // Fallback to approximate remaining time if server time not available
            secondsRemainingInDay = secondsPerDay / 2; // Assume mid-day
        }

        // Store server-authoritative data for optimistic countdown
        this.countdownData = {
            daysInMonth,
            daysRemaining,
            secondsPerDay,
            serverTime: this.economicClient?.gameTime || 0,
            clientSyncTime: Date.now() / 1000 // Client timestamp when we got server data
        };

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

    /**
     * Start optimistic countdown timer that updates every second
     */
    startOptimisticCountdown() {
        // Don't start multiple timers
        if (this.optimisticCountdownInterval) return;

        this.optimisticCountdownInterval = setInterval(() => {
            this.updateOptimisticCountdown();
        }, 1000); // Update every second

        console.log('🕐 Started optimistic countdown timer');
    }

    /**
     * Stop optimistic countdown timer
     */
    stopOptimisticCountdown() {
        if (this.optimisticCountdownInterval) {
            clearInterval(this.optimisticCountdownInterval);
            this.optimisticCountdownInterval = null;
            console.log('🕐 Stopped optimistic countdown timer');
        }
    }

    /**
     * Update countdown optimistically between server updates
     */
    updateOptimisticCountdown() {
        if (!this.countdownData) return;

        const progressBar = document.getElementById('month-progress-bar');
        const progressText = document.getElementById('month-progress-text');
        const progressContainer = document.getElementById('month-progress-container');

        if (!progressBar || !progressText || !progressContainer) return;

        const { daysInMonth, daysRemaining, secondsPerDay, serverTime, clientSyncTime } = this.countdownData;

        // Calculate elapsed time since server sync
        const currentClientTime = Date.now() / 1000;
        const clientElapsedSeconds = currentClientTime - clientSyncTime;

        // Calculate optimistic server time
        const optimisticServerTime = serverTime + clientElapsedSeconds;

        // Calculate optimistic day progress and remaining time
        const currentDay = Math.floor(optimisticServerTime);
        const dayProgress = optimisticServerTime - currentDay;
        const secondsRemainingInDay = (1 - dayProgress) * secondsPerDay;

        // Total seconds remaining in month
        const totalSecondsRemaining = Math.max(0, (daysRemaining * secondsPerDay) + secondsRemainingInDay);
        const totalSecondsInMonth = daysInMonth * secondsPerDay;

        // Calculate progress percentage (100% to 0%)
        const progressPercent = Math.max(0, Math.min(100, (totalSecondsRemaining / totalSecondsInMonth) * 100));

        // Show urgent timer only in final 30 seconds
        const isUrgent = totalSecondsRemaining <= 30;

        // Format time as MM:SS
        const minutes = Math.floor(totalSecondsRemaining / 60);
        const seconds = Math.floor(totalSecondsRemaining % 60);
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Update progress bar
        progressBar.style.width = `${progressPercent}%`;

        if (isUrgent) {
            // Final 30 seconds - add urgent styling and show timer
            progressContainer.classList.add('urgent');
            progressText.textContent = timeText;
            progressText.style.display = 'block';
        } else {
            // Normal state - remove urgent styling and show days
            progressContainer.classList.remove('urgent');

            const remainingDays = Math.ceil(totalSecondsRemaining / secondsPerDay);

            if (remainingDays === 1) {
                progressText.textContent = 'Final Day';
            } else {
                progressText.textContent = `${remainingDays} days left`;
            }
            progressText.style.display = 'block';
        }

        // Update tooltip with current time (keep other info from server update)
        const existingTooltip = progressContainer.getAttribute('data-tooltip') || '';
        if (existingTooltip) {
            // Replace the time portion in the tooltip
            const updatedTooltip = existingTooltip.replace(
                /⏱️ \d+:\d+ remaining in month/,
                `⏱️ ${timeText} remaining in month`
            );
            progressContainer.setAttribute('data-tooltip', updatedTooltip);
        }
    }

    async updateGameDate() {
        // Simple date display for top bar - no countdown
        const currentDate = this.getGameDate();
        this.domCache.gameDate.textContent = `${currentDate.month} ${currentDate.day}`;
    }

    async processDailyCashflow() {
        // V2: Daily cashflow is handled automatically by the server economic engine
        // The server processes DAILY_TICK events and updates player balances automatically
        // No client-side daily processing needed

        console.log('💰 V2: Daily cashflow handled by server economic engine');
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
        // V2: Demographics are calculated automatically by the server
        // and included in economic state updates
        try {
            const economicState = await this.economicClient.getEconomicState();
            return {
                totalResidents: economicState.totalResidents || 0,
                totalPopulation: economicState.totalResidents || 0
            };
        } catch (error) {
            console.error('Server demographics calculation failed:', error);
            return { totalResidents: 0, totalPopulation: 0 };
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

    // REMOVED: calculateCurrentCashflow() - V2 architecture uses updateCashflowAsync() directly

    async updateCashflowAsync() {
        // Skip cashflow calculation if no player ID is available
        if (!this.currentPlayerId) {
            console.log('🔄 Cashflow: Skipping calculation, no player ID available');
            return;
        }

        try {
            // Use server-side cashflow calculation (consolidated economic flow)
            const cashflow = this.economicClient.getPlayerCashflow(this.currentPlayerId);

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
                // Cashflow data not yet available - this is normal during initial loading
                // Use cached values if available
                if (this.currentCashflowPreview) {
                    this.dailyCashflowTotals = this.currentCashflowPreview;
                }
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
            const result = await fetch('/api/economics/player-cashflow', {
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
            // V2: Fallback to economic client async calculation
            this.updateCashflowAsync();
        }
    }








    calculatePopulation() {
        // DISABLED: Legacy client-side population calculation - using server-authoritative system
        return 0;
    }
    
    // Solo game - no state drift checking needed
    
    countAllBuildings() {
        let count = 0;
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building && parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed') {
                    count++;
                }
            }
        }
        return count;
    }

    calculateTotalWealth() {
        // ELIMINATED: Client-side wealth calculation has been blocked
        console.error('🚫 CLIENT-SIDE CALCULATION BLOCKED: calculateTotalWealth() - Use server-side calculation only');
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
        console.log('=== DEBUG: calculatePlayerNetWorth() ===');

        // Get current player ID for debugging
        const currentPlayerId = window.PlayerUtils?.getCurrentPlayerId();
        console.log('Current Player ID:', currentPlayerId);
        console.log('Player Cash:', this.playerCash);

        let assetValue = 0;
        let ownedParcelsCount = 0;
        let totalLandValue = 0;
        let totalBuildingValue = 0;
        let debugParcels = [];

        // Calculate value of owned parcels and buildings
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel) {
                    // Debug: Log parcel owner vs current player
                    const isOwned = this.isCurrentPlayer(parcel.owner);
                    if (parcel.owner) {
                        console.log(`Parcel [${row},${col}] owner: "${parcel.owner}", isCurrentPlayer: ${isOwned}`);
                    }

                    if (isOwned) {
                        ownedParcelsCount++;
                        let parcelLandValue = 0;
                        let parcelBuildingValue = 0;

                        // Add land value
                        if (parcel.landValue && parcel.landValue.current) {
                            parcelLandValue = parcel.landValue.current;
                            assetValue += parcelLandValue;
                            totalLandValue += parcelLandValue;
                        } else {
                            console.log(`Parcel [${row},${col}] - Missing land value:`, parcel.landValue);
                        }

                        // Add building value
                        if (parcel.building) {
                            const building = this.buildingManager?.getBuildingById(parcel.building);
                            if (building) {
                                parcelBuildingValue = this.calculateCurrentBuildingValue(parcel, building);
                                assetValue += parcelBuildingValue;
                                totalBuildingValue += parcelBuildingValue;
                            } else {
                                console.log(`Parcel [${row},${col}] - Building not found:`, parcel.building);
                            }
                        }

                        // Store debug info for this parcel
                        debugParcels.push({
                            position: `[${row},${col}]`,
                            landValue: parcelLandValue,
                            buildingValue: parcelBuildingValue,
                            building: parcel.building || 'none'
                        });
                    }
                }
            }
        }

        const totalNetWorth = Math.round(this.playerCash + assetValue);

        // Comprehensive debug output
        console.log('=== NET WORTH CALCULATION BREAKDOWN ===');
        console.log('Owned Parcels Found:', ownedParcelsCount);
        console.log('Total Land Value:', totalLandValue);
        console.log('Total Building Value:', totalBuildingValue);
        console.log('Total Asset Value:', assetValue);
        console.log('Player Cash:', this.playerCash);
        console.log('Final Net Worth:', totalNetWorth);

        if (debugParcels.length > 0) {
            console.log('Owned Parcels Details:');
            debugParcels.forEach(p => {
                console.log(`  ${p.position}: Land=$${p.landValue}, Building=$${p.buildingValue} (${p.building})`);
            });
        } else {
            console.log('No owned parcels found!');
        }

        console.log('=== END DEBUG ===');

        return totalNetWorth;
    }
    
    // Construction animation manager - ensures smooth construction progress updates
    startConstructionAnimationManager() {
        // Check for buildings under construction and schedule regular updates
        this.constructionAnimationInterval = setInterval(async () => {
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
    
    
    // Live tooltip updates for time-based content
    startLiveTooltipUpdates() {
        // Update time-based tooltips frequently for smooth construction progress
        this.liveTooltipInterval = setInterval(async () => {
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


    async updatePlayerStats() {
        // Fetch population from server instead of using disabled calculatePopulation
        let population = 0;
        try {
            const serverState = await this.economicClient.getEconomicState();
            if (serverState && serverState.statistics && serverState.statistics.totalPopulation !== undefined) {
                population = serverState.statistics.totalPopulation;
            }
        } catch (error) {
            console.warn('Failed to fetch population from server, using fallback:', error);
            // Keep population as 0 (fallback)
        }

        // Server-authoritative cash display: Check Economic Client first, fallback to cashManager
        let currentCash = 0;

        // First priority: Server balance from Economic Client (server-authoritative)
        if (this.economicClient) {
            currentCash = this.economicClient.getCurrentPlayerBalance() || 0;
            console.log('💰 Using server-authoritative balance from Economic Client:', currentCash);
        }

        const totalWealth = this._playerWealth || currentCash || 6000; // Start with same as cash
        // ✅ CLEANED: No more cashManager fallback - V2 server-authoritative only

        console.log('💰 updatePlayerStats cash check:', {
            currentCash,
            hasEconomicClient: !!this.economicClient,
            economicClientBalance: this.economicClient ? this.economicClient.getCurrentPlayerBalance() : 'N/A',
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
        
        // Update residents count using both methods for consistency
        if (this.domCache.totalResidents) {
            this.domCache.totalResidents.textContent = population.toLocaleString();
        }

        // Also use UIManager's updateCityStats method for consistency
        if (this.uiManager && population !== undefined) {
            this.uiManager.updateCityStats({ residents: population });
        }

        // Demographics are now calculated by server and included in population update
        
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


    getParcelCoordinate(row, col) {
        const letter = String.fromCharCode(65 + col); // A-L (0-11)
        const number = row + 1; // 1-12 (0-11)
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
        if (!parcel || !parcel.building || !parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
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
                
                // Connectivity info (legacy v1 - disabled for v2)
                try {
                    // const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);
                    // const connectStatus = connectivity.connected ? '✅ Connected' : '❌ Isolated';
                    // content += `🛣️ Road Access: ${connectStatus}<br>`;
                    //
                    // if (connectivity.connected && connectivity.networkDistance) {
                    //     content += `📏 Network Distance: ${connectivity.networkDistance}<br>`;
                    // }
                } catch (e) {
                    content += `🛣️ Road Access: Checking...<br>`;
                }
                
                // Transportation info (legacy v1 - disabled for v2)
                try {
                    // const nearbyRoads = this.mobilityLayer.getNearbyRoads(row, col);
                    // if (nearbyRoads.length > 0) {
                    //     content += `🔗 Adjacent Roads: ${nearbyRoads.length}<br>`;
                    // }
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
            
            // Add connectivity info for empty parcels (legacy v1 - disabled for v2)
            try {
                // const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);
                // const connectStatus = connectivity.connected ? '✅ Connected to road network' : '❌ No road access';
                // content += `🛣️ ${connectStatus}`;
            } catch (e) {
                // content += `🛣️ Checking connectivity...`;
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
        // REMOVED: Legacy crispTooltip - TooltipSystemV2 handles all tooltips
        
        // Update selected tile display
        if (tile && tile.row >= 0 && tile.row < this.gridSize &&
            tile.col >= 0 && tile.col < this.gridSize) {
            
            this.selectedTile = tile;
            const coord = this.getParcelCoordinate(tile.row, tile.col);
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = coord;
            }
            
            // Set timer to show tooltip after mouse stops for 1000ms
            this.mobilityTooltipTimer = setTimeout(() => {
                // Double-check we're still in mobility mode and on the same tile
                if (this.currentLayer === 'mobility' && 
                    this.selectedTile && 
                    this.selectedTile.row === tile.row && 
                    this.selectedTile.col === tile.col) {
                    
                    this.showMobilityTooltip(tile.row, tile.col, mouseEvent.clientX, mouseEvent.clientY);
                }
            }, 1000); // 1000ms delay
            
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
        // REMOVED: Legacy crispTooltip - TooltipSystemV2 handles all tooltips
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

    listActionsForSale() {
        // Delegate to action marketplace
        if (this.actionMarketplace) {
            this.actionMarketplace.listActionsForSale();
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
                if (parcel && parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed') {
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
    


    // Moved to BuildingSystem.constructBuilding()

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
        const baseBuildingCost = this.buildingManager.getBuildingCost(buildingId);
        const discountedCost = this.governanceSystem ?
            this.governanceSystem.getBuildingCostWithFunding(building, baseBuildingCost) :
            baseBuildingCost;

        const playerCostRequired = discountedCost;

        // Use server-authoritative balance for affordability check
        const currentBalance = (this.economicClient && typeof this.economicClient.serverBalance === 'number')
            ? this.economicClient.serverBalance
            : this.playerCash;

        if (currentBalance < playerCostRequired) {
            reasons.push(`Insufficient funds: need $${playerCostRequired.toLocaleString()} (have $${Math.floor(currentBalance).toLocaleString()})`);
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

    /**
     * Get building cost with governance discounts
     */
    getBuildingCost(buildingId) {
        const building = this.buildingManager.getBuildingById(buildingId);
        if (!building) {
            console.warn('Building not found:', buildingId);
            return 0;
        }

        const baseCost = this.buildingManager.getBuildingCost(buildingId);
        const finalCost = this.governanceSystem ?
            this.governanceSystem.getBuildingCostWithFunding(building, baseCost) :
            baseCost;

        console.log('💰 Building cost calculation:', { buildingId, baseCost, finalCost });
        return finalCost;
    }

    /**
     * Update building description in UI (placeholder for now)
     */
    updateBuildingDescription(buildingName) {
        // This could update a UI element showing building info
        // For now, it's a no-op to prevent the error
        console.log('Building selected:', buildingName);
    }

    /**
     * Update building requirements display (placeholder for now)
     */
    updateBuildingRequirements(buildingData) {
        // This could update a UI element showing building requirements
        // For now, it's a no-op to prevent the error
        if (buildingData) {
            console.log('🏗️ Building requirements for', buildingData.name || buildingData.id, ':', {
                cost: buildingData.cost || 'unknown',
                population: buildingData.population || 'none',
                prerequisites: buildingData.prerequisites || 'none'
            });
        } else {
            console.log('Building requirements: no data provided');
        }
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


    // Moved to BuildingSystem.addAmenityToBuilding()

    // addBuildingHoverHandlers moved to ContextMenuSystem

    showBuildingInfo(buildingName) {
        const buildingData = this.getBuildingDataByName(buildingName);
        if (!buildingData) return;

        const panel = document.getElementById('building-info-panel');
        
        // Update panel content
        document.getElementById('building-info-title').textContent = buildingData.name;
        
        // Building description and requirements now handled by dedicated building modules

        // Update supply/demand displays (includes cost and time)
        this.updateSupplyDemandDisplay(buildingData);

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
    
    // Building descriptions removed - handled by dedicated building modules
    
    // Building requirements UI removed - handled by dedicated building modules

    // Default building jobs removed - job data should come from building configuration files

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
            const maxImpact = 100; // Use full range for faster color transitions
            const normalizedValue = Math.min(Math.max(value / maxImpact, -1), 1);
            const absValue = Math.abs(value);

            // Add pulsing glow effect for extreme values (90-100 range)
            const isExtreme = absValue >= 90;
            const pulseClass = isExtreme ? ' carens-extreme-pulse' : '';

            if (Math.abs(value) < 5) {
                // Nearly neutral - show purple dot in center
                progress.style.left = '49%';
                progress.style.width = '2%';
                progress.style.height = '8px';
                progress.style.borderRadius = '50%';
                progress.style.background = '#8b5cf6'; // Purple for CARENS center
                progress.style.border = '1px solid rgba(255,255,255,0.3)';
                progress.className = 'carens-progress' + pulseClass;
            } else if (value > 0) {
                // Positive impact - goes right toward blue, faster transition
                progress.style.left = '50%';
                progress.style.width = `${Math.abs(normalizedValue) * 50}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                // Faster blue transition - more intense blue for smaller values
                const blueIntensity = Math.min(255, 100 + (absValue * 2));
                progress.style.background = `rgb(59, 130, ${blueIntensity})`;
                progress.className = 'carens-progress' + pulseClass;
            } else {
                // Negative impact - goes left toward red, faster transition
                const width = Math.abs(normalizedValue) * 50;
                progress.style.left = `${50 - width}%`;
                progress.style.width = `${width}%`;
                progress.style.height = '6px';
                progress.style.borderRadius = '0';
                progress.style.border = 'none';
                // Faster red transition - more intense red for smaller values
                const redIntensity = Math.min(255, 150 + (absValue * 2));
                progress.style.background = `rgb(${redIntensity}, 68, 68)`;
                progress.className = 'carens-progress' + pulseClass;
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
            return await this.economicClient.getAccessibilityScores(row, col);
        } catch (error) {
            console.error('Server accessibility calculation failed:', error);
            return null;
        }
    }

    calculateAccessibilityScoresLocal(row, col) {
        // DISABLED: Legacy client-side accessibility calculation - using server-authoritative system
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
                        const buildingCategory = this.buildingManager.getBuildingCategory(parcel.building);
                        if (buildingCategory === category) {
                            count++;
                        }
                    }
                }
            }
        }
        
        return count;
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
    

    // Legacy supply/demand calculation removed - using server-authoritative economic engine
    
    buildTransportNetwork() {
        // Legacy transportation system disabled - using mobility v2 instead
        // Return empty network for compatibility
        return {
            nodes: [],
            roads: new Map(),
            connections: new Map()
        };
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
        
        if (transportNetwork.nodes && transportNetwork.nodes.length > 0) {
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
        }

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
    // REMOVED: calculateCityVitality() - V2 architecture uses ui-manager.updateEconomicDisplays() instead

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
        // V2: Economic client already has current data, just update UI
        
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
        const layerElement = document.getElementById(`layer-${layerName}`);
        if (layerElement) {
            layerElement.classList.add('active');
        } else {
            console.warn(`Layer button not found: layer-${layerName}`);
        }
        
        // Handle panel visibility based on layer
        this.handlePanelTransitions(layerName);
        
        // Update cursor style based on layer - remove 3D rotation for cashflow now
        this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
        
        // Re-render with new layer
        this.scheduleRender();
    }
    
    handlePanelTransitions(layerName) {
        const vitalityElement = document.querySelector('[data-target="vitality"]');
        const playersElement = document.querySelector('[data-target="players-panel"]');

        const vitalitySection = vitalityElement?.parentElement;
        const playersSection = playersElement?.parentElement;

        // DISABLED: Mobility layer completely removed
        if (layerName === 'mobility') {
            console.log('⚠️ Mobility layer completely disabled - redirecting to normal mode');
            layerName = 'normal'; // Override to normal mode
            this.currentLayer = 'normal'; // Ensure currentLayer is also updated
        }

        // Standard panel handling (mobility code completely removed)
        if (layerName === 'normal') {
            // In normal view - open vitality panel
            if (vitalitySection) {
                this.openSidebarSection(vitalitySection);
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
        // Zoom buttons have been removed - this method is now a no-op
        const zoomIn = document.getElementById('zoom-in');
        const zoomOut = document.getElementById('zoom-out');
        if (zoomIn) zoomIn.disabled = this.zoomLevel >= 2.4;
        if (zoomOut) zoomOut.disabled = this.zoomLevel <= 0.4;
    }

    // Convert screen coordinates to world coordinates accounting for zoom and pan
    screenToWorldCoords(screenX, screenY) {
        // Safety check to prevent errors during initialization
        if (!this.panOffset || !this.zoomScale) {
            return { x: screenX, y: screenY };
        }

        return {
            x: (screenX - this.panOffset.x) / this.zoomScale,
            y: (screenY - this.panOffset.y) / this.zoomScale
        };
    }
    
    // Convert world coordinates to screen coordinates accounting for zoom and pan
    worldToScreenCoords(worldX, worldY) {
        // Safety check to prevent errors during initialization
        if (!this.panOffset || !this.zoomScale) {
            return { x: worldX, y: worldY };
        }

        return {
            x: worldX * this.zoomScale + this.panOffset.x,
            y: worldY * this.zoomScale + this.panOffset.y
        };
    }
    
    
    
    updateVitalityDisplay() {
        // V2: Simple method - just update UI with economic client data
        this.updateVitalityUI();
    }

    updateVitalityUI() {
        // V2: Simple coordinator - delegate to UI manager
        if (this.uiManager && this.economicClient) {
            this.uiManager.updateVitalityFromEconomicClient(this.economicClient);
        }
    }


    
    // REMOVED: updateNetScoreBar() - V2 architecture uses ui-manager.updateNetScoreBar() instead

    // REMOVED: updateBalanceBasedBar() - V2 architecture uses ui-manager.updateBalanceBasedBar() instead


    
    
    
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
    
    
    // Legacy coordinate methods removed - all coordinate conversion now handled by V2 rendering system
    
    // drawTile method removed - now delegated to rendering system
    

    // Draw only the elevated building portion (no ground tile) - delegates to rendering system
    drawBuildingOnly(col, row, elevation) {
        return this.renderingSystem.drawBuildingOnly(col, row, elevation);
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

            // Server autonomously completes buildings based on deterministic construction time
            // No need to send BUILD_COMPLETE transaction - server handles this automatically
        }

        // Clear construction data
        parcel._constructionStartTime = null;
        parcel._constructionDays = 0;
        parcel._constructionAnimating = false;
        parcel._isUnderConstruction = false;
        parcel._constructionProgress = 1.0;

        // Clean up pixel row timestamps
        this.pixelRowTimestamps.delete(`${row},${col}`);

        // V2: Server will broadcast economic updates automatically via VITALITY_UPDATE
        if (this.uiManager && this.economicClient) {
            this.uiManager.updateEconomicDisplays(this.economicClient);
        }
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
                // DISABLED: Mobility layer disabled for testing
                return '#2a2a2a'; // Default ground color instead
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
    

    render() {
        this.renderingSystem.render();
    }

    // Main rendering method - now V2 only
    drawScene() {
        this.renderingSystem.render();
    }

    // Schedule render - now V2 only
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
    
    
    // Optimized tile drawing with reduced save/restore calls - delegates to rendering system
    drawTileOptimized(col, row, color, elevation = 0) {
        return this.renderingSystem.drawTileOptimized(col, row, color, elevation);
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
    

    // Draw green attenuation visualization for Data Insights - delegates to rendering system
    drawAttenuationVisualization() {
        return this.renderingSystem.drawAttenuationVisualization();
    }

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

    // Construction animation methods removed - keeping core game lean until everything works properly
    // Previously: drawConstructionWithFadeIn, drawConstructionWithGradientMask, calculateAverageOpacity, scheduleConstructionAnimation

    // Restore mouse movement debouncing for performance
    // REMOVED: Legacy mouse handling - ParcelHoverV2 handles all mouse events now


    // Draw tile highlight effect - delegates to rendering system
    drawTileHighlight(col, row, color, elevation = 0) {
        return this.renderingSystem.drawTileHighlight(col, row, color, elevation);
    }
    
    
    setupEventListeners() {
        console.log('🎯 setupEventListeners called');

        // REMOVED: Legacy debouncedMouseMove - ParcelHoverV2 handles all mouse events
        // Mousemove handling delegated to ParcelHoverV2 - no duplicate handlers needed

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

        // Removed conflicting mousemove handler - using debouncedMouseMove instead

        // SOLUTION: Use mouseenter/mouseleave with position tracking
        let mouseOverCanvas = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        // Legacy mouse enter handler removed

        // Removed temporary debug click test

        // Add mouse leave handler to stop panning when mouse leaves canvas
        this.canvas.addEventListener('mouseleave', () => {

            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
            }

            // Clear hover state when cursor leaves canvas
            // ParcelHoverV2 handles mouseleave automatically
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
            const tile = this.renderingSystem?.fromIsometric(worldCoords.x, worldCoords.y);

            
            // Handle mobility layer clicks first (including UI areas)
            // DISABLED: Testing without mobility
            // if (this.currentLayer === 'mobility') {
            //     const handled = this.mobilityLayer.handleClickEnhanced(worldCoords.x, worldCoords.y, screenX, screenY);
            //     if (handled) {
            //         this.scheduleRender(); // Update the display
            //         return; // Only return early if mobility layer actually handled the click
            //     }
            //     // If mobility layer didn't handle the click, fall through to normal canvas click processing
            // }

            // ParcelHoverV2 doesn't handle clicks - preserve context menu functionality

            if (tile && tile.row >= 0 && tile.row < this.gridSize &&
                tile.col >= 0 && tile.col < this.gridSize) {

                // Set selectedTile for context menu logic
                this.selectedTile = tile;

                // Check if clicking the same selected tile - toggle it off
                if (this.selectedTile && 
                    this.selectedTile.row === tile.row && 
                    this.selectedTile.col === tile.col &&
                    this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                    this.hideContextMenu();
                } else {
                    // LEGACY REMOVAL: Let TooltipSystemV2 handle all click-to-context-menu transitions
                    // The tooltip system will show context menu via transitionToContextMenu()

                    // Only handle case where there's no tooltip (empty parcels)
                    if (!this.tooltipSystemV2?.currentType) {
                        this.showContextMenu(tile.row, tile.col, e.clientX, e.clientY);
                    }
                }
                // REMOVED: Legacy crispTooltip - TooltipSystemV2 handles all tooltips
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
            this.renderingSystem.setupCanvas();
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
            // DISABLED: Testing without mobility
            // if (this.currentLayer === 'mobility') {
            //     const handled = this.mobilityLayer.handleKeyPress(e.key);
            //     if (handled) {
            //         e.preventDefault();
            //         this.scheduleRender();
            //     }
            //     return;
            // }
            
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
        
        // Get current supply/demand data - V2: Economic client already has current data
        if (this.uiManager && this.economicClient) {
            this.uiManager.updateEconomicDisplays(this.economicClient);
        }
        
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

    // DISABLED: Legacy multiplayer synchronization - replaced by economicClient v2
    initializeRealtimeSync() {
        console.log('💡 Real-time sync disabled - using economicClient v2 for state management');
        // No longer needed - economicClient handles all server communication
    }

    async performFastSync() {
        // DISABLED: Legacy multiplayer sync system - replaced by economicClient v2
        // Fast sync is no longer needed in the v2 architecture
        // All state management is handled through economicClient.getEconomicState()
    }

    async performMediumSync() {
        try {
            // Update building performance for all built parcels
            const promises = [];

            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const parcel = this.gameState.parcels[row][col];
                    if (parcel && parcel.building && parcel._constructionProgress >= 1.0) {
                        // Use economicClient v2 for building performance
                        promises.push(
                            this.economicClient.getBuildingPerformance(row, col)
                                .then(performance => {
                                    if (performance && performance.efficiency !== undefined) {
                                        parcel._efficiency = performance.efficiency;
                                        parcel._revenue = performance.revenue || 0;
                                    }
                                })
                                .catch(err => console.warn(`Building sync failed for ${row},${col}:`, err))
                        );
                    }
                }
            }

            await Promise.all(promises);

            // Update displays after sync - V2: Use ui-manager for display updates
            if (this.uiManager && this.economicClient) {
                this.uiManager.updateEconomicDisplays(this.economicClient);
            }

        } catch (error) {
            console.warn('Medium sync failed:', error);
        }
    }

    destroyRealtimeSync() {
        if (this.fastSyncInterval) {
            clearInterval(this.fastSyncInterval);
            this.fastSyncInterval = null;
        }

        if (this.mediumSyncInterval) {
            clearInterval(this.mediumSyncInterval);
            this.mediumSyncInterval = null;
        }

        // Stop optimistic countdown timer
        this.stopOptimisticCountdown();

        console.log('Real-time synchronization system destroyed');
    }

    // Game loop system for construction and cash accrual
    initializeGameLoop() {
        console.log('Initializing game loop for construction and cash accrual...');

        // DISABLED: Client-side construction and cash updates (SERVER AUTHORITATIVE)
        // Server manages construction via BUILD_COMPLETE_AUTO messages
        // Server manages cash accrual via economic engine

        // this.constructionInterval = setInterval(() => {
        //     this.updateConstructionProgress(); // Server handles this
        // }, 1000);

        // this.cashAccrualInterval = setInterval(() => {
        //     this.applyCashAccrual(); // Server handles this
        // }, 5000);
    }

    updateConstructionProgress() {
        let constructionUpdated = false;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const parcel = this.gameState.parcels[row][col];
                if (parcel && parcel.building && parcel._constructionProgress < 1.0) {
                    // Progress construction by 2% per second (50 seconds total)
                    const progressIncrement = 0.02;
                    parcel._constructionProgress = Math.min(1.0, parcel._constructionProgress + progressIncrement);

                    if (parcel._constructionProgress >= 1.0) {
                        console.log(`🏗️ Construction completed for ${parcel.building} at ${row},${col}`);
                        constructionUpdated = true;

                        // CRITICAL FIX: Call construction completion handler to send BUILD_COMPLETE transaction
                        this.handleConstructionCompletion(row, col, parcel);
                    }
                }
            }
        }

        // Refresh displays if construction was completed
        if (constructionUpdated) {
            this.render();
            // V2: Use ui-manager for display updates
            if (this.uiManager && this.economicClient) {
                this.uiManager.updateEconomicDisplays(this.economicClient);
            }
        }
    }

    async applyCashAccrual() {
        try {
            // Get current cashflow from server
            const cashflowResponse = this.economicClient.getPlayerCashflow(this.currentPlayerId);

            if (cashflowResponse.success && cashflowResponse.netCashflow > 0) {
                console.log(`💰 Applying cashflow: +$${cashflowResponse.netCashflow.toFixed(2)}`);

                // Add cash to player balance
                this.cash += cashflowResponse.netCashflow;
                this.updateCashDisplay();

                // Update server balance
                try {
                    await fetch('/api/cash', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'earn',
                            amount: cashflowResponse.netCashflow,
                            playerId: this.playerId,
                            description: 'Building revenue'
                        })
                    });
                } catch (error) {
                    console.warn('Failed to sync cash with server:', error);
                }
            }
        } catch (error) {
            console.warn('Cash accrual failed:', error);
        }
    }

    destroyGameLoop() {
        if (this.constructionInterval) {
            clearInterval(this.constructionInterval);
            this.constructionInterval = null;
        }

        if (this.cashAccrualInterval) {
            clearInterval(this.cashAccrualInterval);
            this.cashAccrualInterval = null;
        }

        console.log('Game loop destroyed');
    }

    /**
     * Initialize V2 Economic Client with server communication
     */
    initializeEconomicClientV2() {
        console.log('🔄 Initializing Economic Client v2...');

        // Initialize the client
        this.economicClient.initialize()
            .then(() => {
                console.log('✅ Economic Client v2 initialized successfully');

                // Set up update callbacks for real-time economic updates
                this.economicClient.onUpdate((update) => {
                    this.handleEconomicUpdate(update);
                });
            })
            .catch((error) => {
                console.error('❌ Failed to initialize Economic Client v2:', error);
            });
    }

    /**
     * Handle economic updates from the server
     */
    handleEconomicUpdate(update) {
        console.log('📥 Economic update received:', update.type);

        // Update UI based on the update type
        switch (update.type) {
            case 'ECONOMIC_UPDATE':
                // Handle building transactions from other players
                if (update.transaction) {
                    const tx = update.transaction;
                    if (tx.type === 'BUILD_START' && tx.location) {
                        const [row, col] = tx.location;

                        // Ensure parcel and building exist for other players' constructions
                        if (!this.grid[row]) this.grid[row] = {};
                        if (!this.grid[row][col]) {
                            this.grid[row][col] = {
                                id: `${row}-${col}`,
                                owner: tx.playerId,
                                isOwned: true
                            };
                        }

                        const parcel = this.grid[row][col];
                        if (!parcel.building || parcel.building.owner !== this.currentPlayerId) {
                            // Add building from another player
                            const buildingDef = this.buildingDefinitions[tx.buildingId];
                            if (buildingDef) {
                                parcel.building = {
                                    type: tx.buildingId,
                                    health: 100,
                                    age: 0,
                                    underConstruction: true,
                                    constructionProgress: 0,
                                    performance: 0,
                                    owner: tx.playerId
                                };
                                parcel.owner = tx.playerId;

                                // Render the new building
                                this.renderingSystem.renderParcel(row, col, parcel);
                                console.log(`🏗️ Player ${tx.playerId} started ${tx.buildingId} at [${row}, ${col}]`);
                            }
                        }
                    }
                }

                // V2: UI updates handled by ui-manager
                if (update.jeefhh || update.totalResidents !== undefined) {
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
                    }
                }
                // Refresh all building performances after economic changes
                this.refreshAllBuildingPerformances();
                break;

            case 'DAILY_UPDATE':
                // V2: Cashflow handled by economic client
                this.updateCashflowAsync();
                this.updatePlayerStats();
                // Refresh building performances daily
                this.refreshAllBuildingPerformances();
                break;

            case 'DAILY_TICK':
                // Sync economic data from server on daily tick
                this.economicClient.getEconomicState().then(() => {
                    console.log('🔄 Economic state synced from server on DAILY_TICK');
                    // V2: UI updates handled by ui-manager
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
                    }
                    // V2: Cashflow handled by economic client
                    this.updateCashflowAsync();
                    this.updatePlayerStats();
                    this.refreshAllBuildingPerformances();
                }).catch(error => {
                    console.error('❌ Failed to sync economic state on DAILY_TICK:', error);
                });
                break;

            case 'ROOM_STATE_SYNC':
                // Sync existing buildings when joining a room
                if (update.data.buildings) {
                    update.data.buildings.forEach(building => {
                        const locationKey = building.locationKey;
                        const [row, col] = locationKey.split(',').map(Number);

                        // Ensure parcel exists
                        if (!this.grid[row]) this.grid[row] = {};
                        if (!this.grid[row][col]) {
                            this.grid[row][col] = {
                                id: `${row}-${col}`,
                                owner: building.ownerId,
                                isOwned: true
                            };
                        }

                        const parcel = this.grid[row][col];

                        // Create building from server data
                        const buildingDef = this.buildingDefinitions[building.id];
                        if (buildingDef) {
                            parcel.building = {
                                type: building.id,
                                health: building.condition * 100 || 100,
                                age: building.age || 0,
                                underConstruction: building.underConstruction || false,
                                performance: 100, // Will be fetched
                                owner: building.ownerId
                            };
                            parcel.owner = building.ownerId;

                            // Render the building
                            this.renderingSystem.renderParcel(row, col, parcel);

                            console.log(`🏗️ Synced building ${building.id} from ${building.ownerId} at [${row}, ${col}]`);
                        }
                    });

                    // Refresh all performance data
                    this.refreshAllBuildingPerformances();
                }
                break;

            case 'BUILDING_COMPLETED':
                // Building was auto-completed by server - handle for ANY player
                const buildingData = update.data || update;
                const { location, buildingId, playerId } = buildingData;
                if (location) {
                    const [row, col] = location;

                    // Ensure parcel exists
                    if (!this.grid[row]) this.grid[row] = {};
                    if (!this.grid[row][col]) {
                        this.grid[row][col] = {
                            id: `${row}-${col}`,
                            owner: playerId,
                            isOwned: true
                        };
                    }

                    const parcel = this.grid[row][col];

                    // CRITICAL FIX: Store building as ID string (not object) for rendering compatibility
                    parcel.building = buildingId;
                    parcel.owner = playerId;

                    console.log(`🏗️ Building ${buildingId} from player ${playerId} completed at [${row}, ${col}]`);

                    // CRITICAL FIX: Update client-side construction state properties
                    parcel._isUnderConstruction = false;
                    parcel._constructionProgress = 1.0;
                    delete parcel._constructionStartTime;
                    delete parcel._constructionDays;

                    // Fetch and update performance
                    this.fetchBuildingPerformance(row, col);
                }
                break;

            case 'ROOM_RESET':
                // Clear all local building state and prepare for resync
                console.log('🔄 Room reset - clearing all buildings from grid');
                this.clearAllBuildings();
                this.economicClient.clearAllCaches();
                // V2: UI updates handled by ui-manager
                if (this.uiManager && this.economicClient) {
                    this.uiManager.updateEconomicDisplays(this.economicClient);
                }
                this.updatePlayerStats();
                break;

            case 'REQUEST_ROOM_SYNC':
                // Request fresh room state from server via WebSocket
                console.log('📡 Requesting fresh room state');
                if (this.economicClient.ws && this.economicClient.ws.readyState === 1) {
                    this.economicClient.ws.send(JSON.stringify({
                        type: 'REQUEST_ROOM_STATE',
                        playerId: this.currentPlayerId,
                        timestamp: Date.now()
                    }));
                }
                break;

            case 'VITALITY_UPDATE':
                // V2: Handle JEEFHH/CARENS vitality data updates via UI manager
                console.log('📊 VITALITY_UPDATE received - delegating to UI manager');
                if (update.jeefhh || update.carens) {
                    // Simple delegation to UI manager
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
                        console.log('✅ Economic displays updated via UI manager');
                    }
                }
                if (update.totalResidents !== undefined) {
                    // V2: Demographics updates handled by ui-manager
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
                    }
                }
                break;

            case 'GAME_TIME_UPDATE':
                // Server-authoritative time update for smooth display
                if (this.economicClient && update.gameTime !== undefined) {
                    this.economicClient.syncGameTime(update.gameTime);
                }
                break;

            default:
                console.log('Unknown economic update type:', update.type);
        }
    }

    /**
     * Refresh all building performances from server
     */
    async refreshAllBuildingPerformances() {
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row]?.[col];
                if (parcel?.building && !parcel.building.underConstruction) {
                    await this.fetchBuildingPerformance(row, col);
                }
            }
        }
    }

    /**
     * Clear all buildings from the grid (for room reset)
     */
    clearAllBuildings() {
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row]?.[col];
                if (parcel?.building) {
                    delete parcel.building;
                    // Re-render the now-empty parcel
                    this.renderingSystem.renderParcel(row, col, parcel);
                }
            }
        }
        console.log('🗑️ Cleared all buildings from grid');
    }

    /**
     * Fetch and update building performance from server
     */
    async fetchBuildingPerformance(row, col) {
        try {
            const parcel = this.grid[row]?.[col];
            if (!parcel?.building) return;

            // Don't fetch performance for buildings under construction
            if (parcel.building.underConstruction) {
                parcel.building.performance = 0;
                return;
            }

            const performance = await this.economicClient.getBuildingPerformance(row, col, false); // Don't use cache
            if (performance && performance.summary) {
                // Calculate performance score (0-100) based on net income
                const netIncome = performance.summary.netIncome || 0;
                const buildingDef = this.buildingDefinitions[parcel.building.type];
                const maxRevenue = buildingDef?.economics?.maxRevenue || 100;

                // Performance based on how close to max potential
                parcel.building.performance = Math.max(0, Math.min(100, (netIncome / maxRevenue) * 100));

                // Store detailed performance data
                parcel.building.economicPerformance = performance.summary;

                // Immediately redraw this parcel with new performance
                this.renderingSystem.renderParcel(row, col, parcel);
            }
        } catch (error) {
            // Building might not exist on server yet - set default performance
            const parcel = this.grid[row]?.[col];
            if (parcel?.building && !parcel.building.underConstruction) {
                // Default performance for buildings not on server (25% baseline)
                parcel.building.performance = 25;
                this.renderingSystem.renderParcel(row, col, parcel);
            }
        }
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
    
    // Force recalculation - V2: Use ui-manager for display updates
    if (window.game.uiManager && window.game.economicClient) {
        window.game.uiManager.updateEconomicDisplays(window.game.economicClient);
    }
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
                    game.marketDashboardInterval = setInterval(async () => {
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
    
    // Building position controls removed - handled by dedicated building modules

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
        if (window.game && window.game.tooltipManager && window.game.tooltipManager.setupVitalityTooltips) {
            window.game.tooltipManager.setupVitalityTooltips();
        }
    }
    if (window.game && window.game.tooltipManager && window.game.tooltipManager.setupGameTooltips) {
        window.game.tooltipManager.setupGameTooltips();
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

    // Building creator form removed - handled by dedicated building modules

    // Load saved data on startup

    // Building manager setup removed - handled by dedicated building modules

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
                
                // Recalculate vitality in real-time - V2: Use ui-manager for display updates
                if (window.game.uiManager && window.game.economicClient) {
                    window.game.uiManager.updateEconomicDisplays(window.game.economicClient);
                }
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
                
                // Recalculate - V2: Use ui-manager for display updates
                if (window.game.uiManager && window.game.economicClient) {
                    window.game.uiManager.updateEconomicDisplays(window.game.economicClient);
                }
            }
            });
        }

        // Apply button (mainly for feedback, changes are already applied in real-time)
        const applyBtn = document.getElementById('apply-multipliers');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
            // Force recalculation - V2: Use ui-manager for display updates
            // V2: Force recalculation - Use ui-manager for display updates
            if (window.game.uiManager && window.game.economicClient) {
                window.game.uiManager.updateEconomicDisplays(window.game.economicClient);
            }

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

// REMOVED - Economic balance controls are now only in dev tools

// REMOVED - Part of sidebar economic balance controls

// Export IsometricGrid to global scope
window.IsometricGrid = IsometricGrid;
