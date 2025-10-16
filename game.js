
class IsometricGrid {
    constructor(canvas, gridSize = 12) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = gridSize;
        this.selectedTile = null;
        this.currentTool = 'grass';
        this.contextMenu = document.getElementById('context-menu');
        
        // Legacy v1 GameState removed - conflicts with v2 server authority
        // this.gameState = new GameState(this);
        
        
        
        // Initialize UI Manager for DOM caching
        this.uiManager = new UIManager();
        window.uiManager = this.uiManager; // Make available globally for economic client
        
        // Initialize Building System
        this.buildingSystem = new BuildingSystem(this);
        
        // Initialize V2 Economic System (server-authoritative)
        // Enable WebSocket for real-time multiplayer state synchronization
        this.economicClient = new EconomicClient(this, true);
        window.gameEconomicClient = this.economicClient; // Make available globally

        // Economic engines replaced by v2 server-authoritative system

        // Initialize economic data structures with safe defaults
        this.initializeEconomicDefaults();
        
        // Initialize V2 Rendering System (now the standard)
        this.renderingSystem = new RenderingSystemV2(this);

        // Initialize map layer system (handles all layer-specific rendering)
        this.mapLayers = new MapLayerSystem(this);

        // Initialize map layer legend system
        this.layerLegend = new MapLayerLegend(this);

        // Initialize unified tooltip system
        this.tooltipSystemV2 = new TooltipSystemV2(this);

        // Connect V2 systems to data sources
        if (this.economicClient) {
            this.economicClient.onUpdate((update) => {
                // Send updates to rendering system
                if (this.renderingSystem) {
                    this.renderingSystem.handleServerUpdate(update);
                }

                // Handle VITALITY_UPDATE events to update CARENS/JEEFHH displays
                if (update.type === 'VITALITY_UPDATE' && this.uiManager) {
                    this.uiManager.updateEconomicDisplays(this.economicClient);
                }
            });
        }

        // V2 system is now the standard

        // V1 Context Menu System (restored as primary)
        this.contextMenuSystem = new ContextMenuSystem(this);


        // Initialize parcel selector manager for hover effects
        this.parcelHover = new ParcelHoverV2(this);

        // REMOVED: mobilityTooltipTimer - mobility layer completely disabled in V2
        
        // Performance optimizations
        this.isRenderScheduled = false;
        this.lastRenderTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Performance tracking
        this.dirtyRegions = new Set(); // Track regions that need recalculation
        // REMOVED: selectedStreetEdges - mobility layer completely disabled in V2
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
        
        // Building categories moved to BuildingSystem
        
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
        
        // ✅ BANDAID ELIMINATED: domCache removed, using direct uiManager calls
        
        // City vitality tracking
        this.vitality = {
            ENERGY: 0,
            FOOD: 0,
            HOUSING: 0,
            // REMOVED: MOBILITY - mobility layer completely disabled in V2
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

        // Client initialized, waiting for server sync

        // Legacy cityTreasury removed
        console.log('✅ Client cash tracking initialized (server-authoritative)');

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

        // Game date calculation from server time (matches server month boundaries)
        this.getGameDate = () => {
            if (this.economicClient && this.economicClient.gameTime !== undefined) {
                // Server starts at gameTime = 1.0 = Sept 2 (Henry George's birthday)
                const gameDay = Math.floor(this.economicClient.gameTime);
                const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];

                // Real month boundaries (matching server getMonthBoundaries())
                const monthBoundaries = [
                    30,   // Sept (29 days remaining from Sept 2)
                    61,   // Oct (31 days)
                    91,   // Nov (30 days)
                    122,  // Dec (31 days)
                    153,  // Jan (31 days)
                    181,  // Feb (28 days)
                    212,  // Mar (31 days)
                    242,  // Apr (30 days)
                    273,  // May (31 days)
                    303,  // Jun (30 days)
                    334,  // Jul (31 days)
                    365   // Aug (31 days)
                ];

                // Use server-consistent logic: find month first, then calculate day
                // Match server's getCurrentGameMonth logic exactly (uses <=, not <)
                let monthIndex = 0;
                for (let i = 0; i < monthBoundaries.length; i++) {
                    if (gameDay <= monthBoundaries[i]) {
                        monthIndex = i;
                        break;
                    }
                }

                // Calculate day within month using server's exact formula
                // Server: monthStart = i === 0 ? 1 : monthBoundaries[i - 1] + 1
                // Server: dayInMonth = currentDay - monthStart + 1
                const monthStart = monthIndex === 0 ? 1 : monthBoundaries[monthIndex - 1] + 1;
                const dayInMonth = gameDay - monthStart + 1;

                const month = monthOrder[monthIndex];
                const day = dayInMonth;
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
        // this.currentDay managed by server through economicClient.gameTime

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
        
        
        // Parcel selection and visualization
        // REMOVED: Legacy hoveredTile - ParcelHoverV2 handles hover state
        this.selectedParcel = null; // Currently selected parcel for reach display
        this.parcelReach = null; // Cached reach calculation for selected parcel
        this.hoverInfluenceRadius = null; // Set of tiles influenced by hover
        
        // Transportation System - Clean slate

        // Transport capacity system removed - was 75% dead code

        // REMOVED: mobilityLayer - mobility layer completely disabled in V2

        
        // REMOVED: All legacy animation systems - ParcelHoverV2 and building system handle animations
        // V2: Removed client-side day tracking - using server-authoritative time
        this.pixelRowTimestamps = new Map(); // Track when each pixel row was revealed: "row,col" -> [timestamps]
        
        
        // Sub-menu hover management
        this.currentSubmenu = null; // Currently visible submenu element
        this.submenuTimer = null; // Timer for submenu hide delay
        
        // Map layer system
        this.currentLayer = 'normal';
        this.landValueMode = 'estimated'; // 'estimated' or 'paid' - toggle for LV view
        
        // Auction system - now handled by AuctionSystem module
        
        
        
        // Legacy governance object removed
        
        
        
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

        
        // Initialize unified Action Manager
        this.actionManager = new ActionManager(this);
        
        this.renderingSystem.setupCanvas();
        this.initDOMCache();
        this.initializeBuildingDefinitions();
        this.populateBuildingCategories();

        // Setting up event listeners
        this.setupEventListeners();
        // Event listeners setup completed

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
        // V2: Cashflow will be handled by economic client initialization below

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

        // Action Manager and Auctions are disabled in solo mode
        // (Only available in multiplayer mode)

        // Multiplayer system removed for clean solo game
    }
    
    isCurrentPlayer(owner) {
        // Use PlayerUtils to check if owner matches current player ID
        return PlayerUtils.isCurrentPlayer(owner);
    }

    /**
     * Get player display name from economicClient game state
     * Falls back to player ID if name not found
     */
    getPlayerName(playerId) {
        // For current player, use beer hall lobby chosen name
        if (this.isCurrentPlayer(playerId)) {
            return window.beerHallLobby?.playerName || playerId;
        }

        // For other players, fetch from synchronized multiplayer game state
        if (this.economicClient?.gameState?.players) {
            let player = null;

            // Handle both Map and Object structures for compatibility
            if (this.economicClient.gameState.players instanceof Map) {
                player = this.economicClient.gameState.players.get(playerId);
            } else {
                player = this.economicClient.gameState.players[playerId];
            }

            if (player && player.name) {
                return player.name;
            }
        }

        // Fallback to player ID
        return playerId;
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
        
        // Reset time state - server manages authoritative time
        // this.currentDay managed by server through economicClient.gameTime
        this.currentMonth = 'SEPT';
        this.gameSpeed = 1;
        this.isPaused = false;
        // V2: Removed client-side day tracking - using server-authoritative time
        
        // Clear rendering caches
        this.dirtyRegions.clear();
        this.buildingEfficiencies?.clear();
        this.pixelRowTimestamps?.clear();
        
        // REMOVED: mobility layer cleanup - completely disabled in V2
        
        // Reset zoom and pan to default clean state
        
    }

    async initializeClientSystems() {
        // Multiplayer mode: Initialize client systems without resetting server-managed game state
        console.log('🎮 Initializing client systems for multiplayer (preserving server state)');

        // Initialize building system
        this.buildingSystem.initialize();

        // Initialize governance V3
        if (typeof initializeGovernanceV3 !== 'undefined') {
            initializeGovernanceV3(this.economicClient);
            this.governanceSystem = window.governanceV3; // For UI compatibility
        }

        // Initialize rendering system
        this.renderingSystem.initialize();

        // Context menu system v1 ready to use (no initialization needed)

        this.startGameTime();
        this.scheduleRender();

        // REMOVED: Construction animation manager - handled by building system now

        // Start live tooltip updates for time-based tooltips
        this.startLiveTooltipUpdates();

        // Initialize Action Marketplace V2 (multiplayer only)
        if (!this.actionMarketplace) {
            this.marketplace = new MarketplaceV3(this);
            // Legacy alias for backward compatibility
            this.actionMarketplace = this.marketplace;
        }

        // Initialize Land Exchange System (multiplayer only)
        if (!this.landExchange) {
            this.landExchange = new LandExchangeSystem(this);
        }

        // Initialize real-time synchronization for multiplayer reliability
        this.initializeRealtimeSync();

        // Initialize game loop for construction progress and cash accrual
        this.initializeGameLoop();

        // Load existing player settings if available
        await this.loadPlayerSettings();

        // Update player button with current settings (including beer hall lobby data)
        this.updatePlayerButton();

        // V2: Panel states initialized by UIManager
    }

    async startGame() {
        // Reset all game state for clean start (SOLO MODE ONLY)
        this.resetGameState();

        // Initialize building system
        this.buildingSystem.initialize();

        // Initialize governance V3
        if (typeof initializeGovernanceV3 !== 'undefined') {
            initializeGovernanceV3(this.economicClient);
            this.governanceSystem = window.governanceV3; // For UI compatibility
        }

        // Initialize rendering system
        this.renderingSystem.initialize();

        // Context menu system v1 ready to use (no initialization needed)

        this.startGameTime();
        this.scheduleRender();

        // REMOVED: Construction animation manager - handled by building system now

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

        // V2: Panel states initialized by UIManager

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
        console.log('✅ Initializing game with player configuration');


        // Store clean player config
        this.playerConfig = playerConfig;

        // Set multiplayer flag for context menu and other systems
        this.isMultiplayer = playerConfig.isMultiplayer || (playerConfig.mode !== 'solo');

        // All modes (solo and multiplayer) use server-based economic system
        // Solo mode gets its own isolated table with one player
        // Initializing server connection

        // WebSocket should already be connected via V2 server-first player ID system
        if (playerConfig.waitingForPlayers) {
            // Multiplayer mode - WebSocket managed by beer hall system
        } else if (playerConfig.mode === 'solo') {
            // Solo mode - isolated table with own economic engine
        } else {
            // V2: WebSocket managed by server-first player ID system
        }

        // Force economic WebSocket initialization for all modes
        // Solo and multiplayer both need server-side economic calculations
        // Initializing economic connection for building performance data
        this.economicClient.initializeConnection();

        // Set currentPlayerId for cash manager and transactions
        this.currentPlayerId = playerConfig.id;
        // Player ID set

        // Sync player ID to Economic Client immediately
        if (this.economicClient) {
            this.economicClient.playerId = this.currentPlayerId;
            // Economic Client player ID synced
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
        // Also save individual color
        localStorage.setItem('playerColor', playerConfig.color);

        // V2: Onboarding complete
        if (playerConfig.mode === 'solo') {
            // Solo mode onboarding complete

            // Hide Action Manager in solo mode
            const actionManagerSection = document.getElementById('action-manager-section');
            if (actionManagerSection) {
                actionManagerSection.style.display = 'none';
                // Action Manager hidden in solo mode
            }

            // Hide Chat section in solo mode
            const chatSection = document.getElementById('chat-section');
            if (chatSection) {
                chatSection.style.display = 'none';
                // Chat section hidden in solo mode
            }
        } else {
            // Multiplayer mode onboarding complete
        }

        // Update ParcelSelectorManager with player color (after playerSettings is set)
        // Setting parcel hover color
        if (this.parcelHover) {
            this.parcelHover.playerColor = this.playerSettings?.color || '#10AC84';
            // Parcel hover color set
        } else {
            console.warn('⚠️ parcelHover is null/undefined!');
        }

        // Force re-render to show updated player colors
        this.scheduleRender();

        // V2: Player color managed by WebSocket room system - no legacy API needed

        // Force cash reset to ensure clean start
        localStorage.setItem('theCommons_forceReset', 'true');

        // Update UI with player info
        this.updatePlayerNameInUI();

        // V2: City name provided by server in player configuration or updated from server state
        const cityName = playerConfig.cityName || `${playerConfig.name?.toUpperCase() || 'PLAYER'} CITY`;

        const cityNameElement = document.getElementById('city-name');
        if (cityNameElement) {
            cityNameElement.textContent = cityName;
        }

        // Initialize game systems (skip client-side reset for multiplayer)
        if (playerConfig.mode === 'solo') {
            // Solo mode: Client manages its own state
            await this.startGame();
        } else {
            // Multiplayer mode: Server manages game state, only initialize client UI
            console.log('🎮 Multiplayer mode: Initializing client systems without game state reset');
            await this.initializeClientSystems();
        }

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
                    // Resetting to server-authoritative balance
                    this.economicClient.syncBalanceWithServer();
                } else {
                    console.error('Economic Client not available');
                }
            };
        }

    }
    
    // REMOVED: initializePanelStates() - UIManager handles all panel state management
    
    

    // Legacy V1 resetServerForOnboarding() removed - V2 multiplayer doesn't need server resets

    async loadPlayerSettings() {
        try {
            // Only load from localStorage as fallback if no playerSettings exist
            // (Modern initialization via initializeWithPlayerConfig() takes precedence)
            if (!this.playerSettings) {
                const savedSettings = localStorage.getItem('theCommons_playerSettings');
                if (savedSettings) {
                    this.playerSettings = JSON.parse(savedSettings);
                    // Loaded fallback playerSettings from localStorage
                }
            } else {
                // PlayerSettings already set via modern initialization
            }

            if (this.playerSettings) {
                this.updatePlayerNameInUI();
            }
        } catch (error) {
            console.error('Failed to load player settings:', error);
        }
    }
    
    updatePlayerButton() {
        // Delegate to UI Manager for proper modularity
        if (this.uiManager) {
            this.uiManager.updatePlayerButton(this.playerSettings);
        }
    }

    updatePlayerNameInUI() {
        // Delegate to UI Manager for proper modularity
        if (this.uiManager) {
            this.uiManager.updatePlayerNameInUI(this.playerSettings);
        }
    }

    /**
     * Update city name display from server-generated city name
     * @param {string} cityName - Server-generated city name
     */
    updateCityNameFromServer(cityName) {
        if (!cityName) return;

        const cityNameElement = document.getElementById('city-name');
        if (cityNameElement) {
            cityNameElement.textContent = cityName;
        }
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

        // ✅ BANDAID ELIMINATED: Direct uiManager usage, no compatibility layer needed
    }

    /**
     * Initialize building definitions lookup from buildingManager
     * Creates a flat object with building ID as key for fast lookup
     */
    initializeBuildingDefinitions() {
        this.buildingDefinitions = {};

        if (!window.buildingManager || !window.buildingManager.buildings) {
            console.warn('⚠️ BuildingManager not ready, will retry...');
            // Retry after a short delay
            setTimeout(() => this.initializeBuildingDefinitions(), 100);
            return;
        }

        // Flatten the categorized buildings into a lookup object by ID
        const buildings = window.buildingManager.buildings;
        Object.values(buildings).forEach(category => {
            if (Array.isArray(category)) {
                category.forEach(building => {
                    this.buildingDefinitions[building.id] = building;
                });
            }
        });

        console.log('✅ Building definitions initialized:', Object.keys(this.buildingDefinitions).length, 'buildings');
    }

    populateBuildingCategories() {
        // Delegate to building system
        this.buildingSystem.populateBuildingCategories();
    }

    startGameTime() {
        // Solo game - client controls time advancement
        

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
    
    updateActionDisplay() {
        // Delegate to action manager (owns action state and display logic)
        if (this.actionManager) {
            this.actionManager.updateActionDisplay();
        }
    }
    
    updateMarketplaceDisplay() {
        const listingsElement = document.getElementById('market-listings');

        if (listingsElement) {
            const activeListings = this.actionManager.marketplace.listings.filter(l => l.status === 'active').length;
            listingsElement.textContent = activeListings;
        }
    }
    
    updateMonthCountdown() {
        const progressText = document.getElementById('month-progress-text');

        if (!progressText) return;

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

        // Format time estimate (anxiety-free version)
        let timeEstimate;
        const minutes = Math.floor(totalSecondsRemaining / 60);

        if (totalSecondsRemaining < 10) {
            timeEstimate = 'Less than 10 seconds';
        } else if (minutes < 1) {
            timeEstimate = 'Less than 1 minute';
        } else {
            timeEstimate = `~${minutes}m`;
        }

        // Update text display
        progressText.textContent = timeEstimate;
        
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

        // Started optimistic countdown timer
    }

    /**
     * Stop optimistic countdown timer
     */
    stopOptimisticCountdown() {
        if (this.optimisticCountdownInterval) {
            clearInterval(this.optimisticCountdownInterval);
            this.optimisticCountdownInterval = null;
            // Stopped optimistic countdown timer
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
        this.uiManager.get('gameDate').textContent = `${currentDate.month} ${currentDate.day}`;
    }

    async processDailyCashflow() {
        // V2: Daily cashflow is handled automatically by the server economic engine
        // The server processes DAILY_TICK events and updates player balances automatically
        // No client-side daily processing needed

        // Daily cashflow handled by server economic engine
        return { totalRevenue: 0, totalMaintenance: 0, netCashflow: 0 };
    }
    
    // Helper method: Update player parcel tracking and mark aging buildings as dirty
    // Legacy V1 calculateRoadMaintenance() removed - server handles road maintenance calculations
    
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
    
    
    // REMOVED: calculateBuildingEconomics() - server handles all economic calculations in V2
    
    // REMOVED: getLivabilityScores() - server handles all livability calculations in V2
    
    // REMOVED: checkRoadConnectivity() - server handles road connectivity in V2
    
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
    
    // REMOVED: calculateLivabilityMultipliers() - server handles multipliers in V2
    
    
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

    // REMOVED: updateCashflowAsync() - V2 economic client handles all cashflow calculations

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
            // V2: Use economic client instead of legacy API
            if (this.economicClient && this.economicClient.getPlayerData) {
                const playerData = this.economicClient.getPlayerData(playerId);
                if (playerData && playerData.cashflow) {
                    // Update the cached data for this player
                    this.cashflowBreakdown = playerData.cashflow.breakdown;
                    this.dailyCashflowTotals = {
                        revenue: playerData.cashflow.totalRevenue,
                        maintenance: playerData.cashflow.totalMaintenance,
                        lvt: playerData.cashflow.totalLVT,
                        netCashflow: playerData.cashflow.netCashflow
                    };
                    return playerData.cashflow;
                }
            }

            // Fallback if economic client not available
            console.warn('Economic client not available for cashflow calculation');
            return null;
        } catch (error) {
            console.error('Error calculating player cashflow:', error);
            // V2: Economic client handles all cashflow calculations
            return null;
        }
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

    /**
     * Calculate population - SERVER ONLY
     * Returns server data or placeholder
     */
    calculatePopulation() {
        // Use server data if available
        if (this.economicClient?.getCityPopulation) {
            return this.economicClient.getCityPopulation() || 0;
        }
        return 0; // Return 0 instead of 'Loading...' for calculations
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
        
        // ✅ BANDAID ELIMINATED: Direct uiManager usage, no compatibility layer needed
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

    // Visual feedback for insufficient actions (same style as insufficient funds)
    showInsufficientActionsFeedback() {
        // Find the action display
        const actionDisplay = document.querySelector('#current-actions');
        if (actionDisplay) {
            actionDisplay.classList.add('cash-blink');
            setTimeout(() => actionDisplay.classList.remove('cash-blink'), 1500);
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
                currentDay: this.economicClient ? Math.floor(this.economicClient.gameTime) : 1,
                gameDate: this.gameDate,
                grid: this.grid,
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
    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculatePlayerNetWorth() {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN Loading... PLACEHOLDER
        // This massive calculation was iterating through the entire grid!
        return 'Loading...';
    }
    
    // REMOVED: startConstructionAnimationManager() - handled by building system now
    
    // REMOVED: hasConstructionInProgress() - handled by building system now
    
    
    // ✅ BANDAID ELIMINATED: Event-driven tooltip updates via WebSocket
    startLiveTooltipUpdates() {
        // Register for server events that require tooltip updates
        if (this.economicClient && this.economicClient.onUpdate) {
            this.economicClient.onUpdate((update) => {
                // Update tooltips when server state changes
                if (update.type === 'STATE_UPDATE' ||
                    update.type === 'CONSTRUCTION_UPDATE' ||
                    update.type === 'TIME_UPDATE') {
                    this.updateLiveTooltips();
                }
            });
        }

        // Initial tooltip update
        this.updateLiveTooltips();
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
            if (serverState && serverState.totalResidents !== undefined) {
                population = serverState.totalResidents;
            }
        } catch (error) {
            console.warn('Failed to fetch population from server:', error);
            // Keep population as 0 (fallback)
        }

        // V2 Server-authoritative cash display ONLY - no fallbacks
        let currentCash = null;

        // ONLY source: Server balance from Economic Client
        if (this.economicClient) {
            currentCash = this.economicClient.getCurrentPlayerBalance();
            // Server-authoritative balance applied
        } else {
            console.warn('⚠️ No Economic Client - balance unknown');
        }

        // V2 Server-authoritative wealth from Economic Client
        const totalWealth = this.economicClient?.getCurrentPlayerWealth();
        // ✅ CLEANED: No more cashManager fallback - V2 server-authoritative only

        // updatePlayerStats cash check completed - handle null values properly
        const safeWealth = (totalWealth !== null && totalWealth !== undefined && !isNaN(totalWealth)) ? totalWealth :
                          (currentCash !== null && currentCash !== undefined && !isNaN(currentCash)) ? currentCash : 0;

        // Update the actual playerCash property for gameplay logic
        this.playerCash = currentCash;

        // Cash display managed by Economic Client (server-authoritative)
        // Only update wealth display here since it's calculated from client state
        this.uiManager.get('playerWealth').textContent = `$${Math.round(safeWealth).toLocaleString()}`;

        // Update cashflow with proper formatting and color coding

        // V2 Server-authoritative: Use Economic Client cashflow data
        const cashflowData = this.economicClient?.dailyCashflowTotals || this.dailyCashflowTotals;
        const playerCashflowElement = this.uiManager.get('playerCashflow');
        if (playerCashflowElement && cashflowData) {
            const rawNetCashflow = cashflowData.netCashflow;
            const netCashflow = isNaN(rawNetCashflow) || rawNetCashflow === null || rawNetCashflow === undefined ? 0 : rawNetCashflow;
            const roundedCashflow = Math.round(netCashflow);
            const formattedCashflow = roundedCashflow >= 0 ?
                `+$${roundedCashflow.toLocaleString()}` :
                `-$${Math.abs(roundedCashflow).toLocaleString()}`;

            playerCashflowElement.textContent = formattedCashflow;
            
            // Color coding: green for positive, red for negative, gray for zero
            if (roundedCashflow > 0) {
                playerCashflowElement.style.color = '#4CAF50';
            } else if (roundedCashflow < 0) {
                playerCashflowElement.style.color = '#f44336';
            } else {
                playerCashflowElement.style.color = '#ccc';
            }
        } else {
            // Fallback - set to $0 if no data
            if (playerCashflowElement) {
                playerCashflowElement.textContent = '$0';
                playerCashflowElement.style.color = '#ccc';
            }
        }
        
        // Update residents count using both methods for consistency
        if (this.uiManager.get('totalResidents')) {
            this.uiManager.get('totalResidents').textContent = population.toLocaleString();
        }

        // Also use UIManager's updateCityStats method for consistency
        if (this.uiManager && population !== undefined) {
            this.uiManager.updateCityStats({ residents: population });
        }

        // Demographics are now calculated by server and included in population update
        
        // Treasury display - connect to server governance data
        let totalTreasury = this.economicClient?.governance?.treasury || 0;

        // Update city treasury display
        const cityTreasuryEl = document.getElementById('city-treasury');
        if (cityTreasuryEl) {
            cityTreasuryEl.textContent = `$${Math.round(totalTreasury).toLocaleString()}`;
            
            const treasuryRow = document.getElementById('treasury-row');
            if (treasuryRow) {
                treasuryRow.setAttribute('data-tooltip',
                    `<strong>City Treasury</strong><br><br>` +
                    `💰 Total Treasury: $${Math.round(totalTreasury).toLocaleString()}`);

                // Basic treasury styling
                treasuryRow.style.color = '#FFD700'; // Gold color for text
                treasuryRow.onclick = () => {
                    // Governance removed - no action
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
    
    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    // GHOST-BUSTING VICTORY: This function was disabled during server authority migration.
    // It was causing cash balance issues by sending 'Loading...' prices to server transactions.
    // All callers have been updated to use economicClient.getParcelPrice() instead.
    getParcelPrice(row, col) {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN Loading... PLACEHOLDER
        return 'Loading...';
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
    
    
    // REMOVED: showMobilityTooltip() - mobility layer completely disabled in V2
    
    // REMOVED: handleMobilityTooltips() - mobility layer completely disabled in V2
    
    // REMOVED: getMobilitySupplyType() - mobility layer completely disabled in V2
    
    // REMOVED: Legacy V1 calculateParcelReach() - V2 architecture uses server-side reach calculations
    
    // drawParcelReach() moved to RenderingSystem
    // drawReachPerimeter() moved to RenderingSystem
    
    
    showContextMenu(row, col, mouseX, mouseY) {
        this.contextMenuSystem.show(row, col, mouseX, mouseY);
    }

    hideContextMenu() {
        this.contextMenuSystem.hide();
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
    
    // REMOVED: drawTopDownMap() - use renderingSystem directly
    
    hasTransitStop(row, col, type) {
        // Check if this parcel has a bus stop or subway entrance
        // This checks the roads around the parcel for amenities
        const sides = ['north', 'east', 'south', 'west'];
        
        for (const side of sides) {
            const roadCoords = this.getParcelSideCoordinates(row, col, side);
            if (!roadCoords) continue;
            
            // Amenity checking disabled - road amenity system not implemented
        }
        
        return false;
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

    

    
    
    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateMonthlyLVT() {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN Loading... PLACEHOLDER
        return 'Loading...';
    }
    
    // Check if public funds can cover building cost
    canPublicFundsCover(buildingCategory, cost) {
        // Governance removed - no category funding available
        const availableFunds = 0;
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
        
        // Note: Cash requirements are validated server-side during transaction
        // Client does not need to check balance - server will reject insufficient funds
        
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
     * Get building cost - governance removed
     */
    getBuildingCost(buildingId) {
        const building = this.buildingManager.getBuildingById(buildingId);
        if (!building) {
            console.warn('Building not found:', buildingId);
            return 0;
        }

        const baseCost = this.buildingManager.getBuildingCost(buildingId);
        // Building cost calculation
        return baseCost;
    }

    /**
     * Update building description in UI (placeholder for now)
     */
    // Legacy V1 updateBuildingDescription() removed - context menu system handles building UI

    /**
     * Update building requirements display (placeholder for now)
     */
    // Legacy V1 updateBuildingRequirements() removed - context menu system handles building requirements UI

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

        // Clear and rebuild the entire panel content
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingData.name);

        panel.innerHTML = `
            <div class="building-info-header">
                <h3 style="margin: 0; color: #ffffff; font-size: 16px; font-weight: 600;">${buildingData.name}</h3>
            </div>
            <div class="building-info-content" style="padding: 20px; display: flex; flex-direction: column; gap: 24px;">
                ${buildingData.image ? `
                    <div style="text-align: center;">
                        <img src="${buildingData.image}" style="max-width: 75%; height: auto; border-radius: 6px;" />
                    </div>
                ` : ''}

                <div class="investment-score-section">
                    ${this.createInvestmentScoreHTML(buildingData)}
                </div>

                <div class="construction-section">
                    ${this.createConstructionDetailsHTML(buildingData, building)}
                </div>

                <div class="resources-section">
                    ${this.createResourcesHTML(building)}
                </div>

                <div class="livability-section">
                    ${this.createLivabilityImpactsHTML(buildingData.impacts)}
                </div>
            </div>
        `;

        // Show panel
        panel.classList.add('visible');
    }

    hideBuildingInfo() {
        const panel = document.getElementById('building-info-panel');
        panel.classList.remove('visible');
    }

    createInvestmentScoreHTML(buildingData) {
        const scoreData = this.calculateInvestmentScore(buildingData);

        let scoreColor, scoreLabel;
        if (scoreData.score >= 80) {
            scoreColor = '#4CAF50';
            scoreLabel = 'Excellent';
        } else if (scoreData.score >= 60) {
            scoreColor = '#8BC34A';
            scoreLabel = 'Good';
        } else if (scoreData.score >= 40) {
            scoreColor = '#FFC107';
            scoreLabel = 'Fair';
        } else if (scoreData.score >= 20) {
            scoreColor = '#FF9800';
            scoreLabel = 'Poor';
        } else {
            scoreColor = '#F44336';
            scoreLabel = 'Very Poor';
        }

        // Decay rate is stored as a percentage value (e.g., 0.12 for 0.12%), not a ratio
        // So we display it directly without multiplying by 100
        const decayPercent = scoreData.decayRate.toFixed(2);

        return `
            <div style="text-align: center; color: #cccccc;">
                <h4 style="margin: 0 0 20px 0; font-size: 16px; font-weight: 400; color: #cccccc;">Investment Score</h4>
                <div style="display: flex; justify-content: center; margin-bottom: 20px;">
                    <div style="width: 160px; height: 160px; border: 4px solid ${scoreColor}; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: 48px; font-weight: bold; color: ${scoreColor}; line-height: 1;">${scoreData.score}</div>
                        <div style="font-size: 16px; font-weight: 600; color: ${scoreColor}; text-transform: capitalize;">${scoreLabel}</div>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; color: #aaa; font-weight: 400;">Optimal Revenue</span>
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">$${scoreData.revenue}/day</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; color: #aaa; font-weight: 400;">Maintenance</span>
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">$${scoreData.maintenance}/day</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 14px; color: #aaa; font-weight: 400;">Decay Rate</span>
                            <span style="font-size: 11px; color: #888;">(daily)</span>
                        </div>
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">${decayPercent}%/day</span>
                    </div>
                </div>
            </div>
        `;
    }

    createResourcesHTML(building) {
        const resources = building?.resources || {};
        const resourceConfig = {
            'jobs': { color: '#ec4899', label: 'Jobs', maxValue: 30 },
            'energy': { color: '#f59e0b', label: 'Energy', maxValue: 500 },
            'education': { color: '#8b5cf6', label: 'Education', maxValue: 30 },
            'food': { color: '#84cc16', label: 'Food', maxValue: 50 },
            'housing': { color: '#06b6d4', label: 'Housing', maxValue: 30 },
            'healthcare': { color: '#ef4444', label: 'Healthcare', maxValue: 30 }
        };

        let resourcesHTML = '';
        let hasResources = false;

        Object.entries(resourceConfig).forEach(([key, config]) => {
            const provided = resources[key + 'Provided'] || 0;
            const required = resources[key + 'Required'] || 0;
            const netValue = provided - required;

            if (provided > 0 || required > 0) {
                hasResources = true;
                const normalizedValue = Math.min(Math.max(netValue / config.maxValue, -1), 1);
                const absWidth = Math.abs(normalizedValue) * 50;

                let barHtml = '';
                let valueColor = '#888';
                let displayValue = '0';

                if (Math.abs(netValue) < 0.1) {
                    barHtml = `<div style="position: absolute; left: 49%; width: 2%; height: 8px; top: -1px; border-radius: 50%; background: #3b82f6; border: 1px solid rgba(255,255,255,0.3);"></div>`;
                    valueColor = '#3b82f6';
                    displayValue = '0';
                } else if (netValue > 0) {
                    barHtml = `<div style="position: absolute; left: 50%; width: ${absWidth}%; height: 100%; background: linear-gradient(90deg, ${config.color}, #4CAF50); border-radius: 0 3px 3px 0; opacity: 0.8;"></div>`;
                    valueColor = '#4CAF50';
                    displayValue = `+${netValue}`;
                } else {
                    barHtml = `<div style="position: absolute; left: ${50 - absWidth}%; width: ${absWidth}%; height: 100%; background: #ef4444; border-radius: 3px 0 0 3px; opacity: 0.8;"></div>`;
                    valueColor = '#ef4444';
                    displayValue = `${netValue}`;
                }

                resourcesHTML += `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <span style="color: ${config.color}; font-weight: 500; font-size: 14px;">${config.label}</span>
                            <span style="color: ${valueColor}; font-weight: 500; font-size: 14px;">${displayValue}</span>
                        </div>
                        <div style="position: relative; width: 100%; height: 6px; background: #2a2a2a; border-radius: 3px;">
                            <div style="position: absolute; left: 50%; width: 1px; height: 100%; background: #444;"></div>
                            ${barHtml}
                        </div>
                    </div>
                `;
            }
        });

        if (!hasResources) {
            resourcesHTML = '<div style="color: #666; font-size: 14px; font-style: italic; text-align: center;">No resource impacts</div>';
        }

        return `
            <div style="text-align: center; color: #cccccc;">
                <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 400; color: #cccccc;">Resources</h4>
                <div style="text-align: left;">
                    ${resourcesHTML}
                </div>
            </div>
        `;
    }

    createConstructionDetailsHTML(buildingData, building) {
        const fundingInfo = this.calculateBuildingCostWithFunding(building, buildingData.cost);
        const playerCost = fundingInfo.playerCost;
        const publicFunding = fundingInfo.publicFunding;
        const availableFunds = fundingInfo.availableFunds;

        let costHTML = '';
        if (publicFunding > 0) {
            costHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 14px; color: #aaa; font-weight: 400;">Cost</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">$${playerCost.toLocaleString()}</span>
                        <span style="font-size: 12px; color: #4CAF50; background: rgba(76, 175, 80, 0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">Funded</span>
                    </div>
                </div>
            `;
        } else if (availableFunds > 0) {
            costHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 14px; color: #aaa; font-weight: 400;">Cost</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">$${playerCost.toLocaleString()}</span>
                        <span style="font-size: 12px; color: #FFA726; background: rgba(255, 167, 38, 0.15); padding: 2px 6px; border-radius: 3px; font-weight: 500;">Partial</span>
                    </div>
                </div>
            `;
        } else {
            costHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 14px; color: #aaa; font-weight: 400;">Cost</span>
                    <span style="font-size: 14px; color: #fff; font-weight: 500;">$${playerCost.toLocaleString()}</span>
                </div>
            `;
        }

        return `
            <div style="text-align: center; color: #cccccc;">
                <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 400; color: #cccccc;">Construction Details</h4>
                <div style="text-align: left;">
                    ${costHTML}
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; color: #aaa; font-weight: 400;">Build Time</span>
                        <span style="font-size: 14px; color: #fff; font-weight: 500;">${buildingData.buildTime} days</span>
                    </div>
                </div>
            </div>
        `;
    }

    createLivabilityImpactsHTML(impacts) {

        if (!impacts || Object.keys(impacts).length === 0) {
            return `
                <div style="text-align: center; color: #cccccc;">
                    <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 400; color: #cccccc;">Livability Impacts</h4>
                    <div style="color: #666; font-size: 14px; font-style: italic; text-align: center;">No livability impacts</div>
                </div>
            `;
        }

        const carensConfig = {
            'safety': '#ef4444',
            'culture': '#a855f7',
            'affordability': '#f97316',
            'resilience': '#14b8a6',
            'environment': '#22c55e',
            'noise': '#6b7280'
        };

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

        let impactsHTML = '';
        sortedImpacts.forEach(([domain, value]) => {
            const color = carensConfig[domain.toLowerCase()] || '#808080';
            const maxImpact = 100;
            const normalizedValue = Math.min(Math.max(value / maxImpact, -1), 1);
            const absWidth = Math.abs(normalizedValue) * 50;

            let barHtml = '';
            let valueColor = '#888';

            if (Math.abs(value) < 5) {
                barHtml = `<div style="position: absolute; left: 49%; width: 2%; height: 8px; top: -1px; border-radius: 50%; background: #8b5cf6; border: 1px solid rgba(255,255,255,0.3);"></div>`;
                valueColor = '#8b5cf6';
            } else if (value > 0) {
                barHtml = `<div style="position: absolute; left: 50%; width: ${absWidth}%; height: 100%; background: #3b82f6; border-radius: 0 3px 3px 0; opacity: 0.8;"></div>`;
                valueColor = '#3b82f6';
            } else {
                barHtml = `<div style="position: absolute; left: ${50 - absWidth}%; width: ${absWidth}%; height: 100%; background: #ef4444; border-radius: 3px 0 0 3px; opacity: 0.8;"></div>`;
                valueColor = '#ef4444';
            }

            impactsHTML += `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: ${color}; font-weight: 500; font-size: 14px;">${domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase()}</span>
                        <span style="color: ${valueColor}; font-weight: 500; font-size: 14px;">${value > 0 ? '+' : ''}${Math.round(value)}</span>
                    </div>
                    <div style="position: relative; width: 100%; height: 6px; background: #2a2a2a; border-radius: 3px;">
                        <div style="position: absolute; left: 50%; width: 1px; height: 100%; background: #444;"></div>
                        ${barHtml}
                    </div>
                </div>
            `;
        });

        return `
            <div style="text-align: center; color: #cccccc;">
                <h4 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 400; color: #cccccc;">Livability Impacts</h4>
                <div style="text-align: left;">
                    ${impactsHTML}
                </div>
            </div>
        `;
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateInvestmentScore(buildingData) {
        const economics = buildingData.economics;
        if (!economics) {
            return {
                score: 0,
                revenue: 0,
                maintenance: 0,
                decayRate: 0
            };
        }

        // Extract economic data
        const maxRevenue = economics.maxRevenue || 0;
        const maintenanceCost = economics.maintenanceCost || 0;
        const decayRate = economics.decayRate || 0;
        const buildCost = economics.buildCost || 1;

        // Calculate raw investment score
        const netAnnualProfit = (maxRevenue * 12) - (maintenanceCost * 12);
        const roi = netAnnualProfit / buildCost;
        const decayPenalty = (1 - decayRate);
        const rawScore = roi * decayPenalty;

        // Get all buildings for normalization
        const allBuildings = this.buildingManager.getAllBuildings();
        const allScores = allBuildings.map(building => {
            const econ = building.economics;
            if (!econ) return 0;

            const revenue = econ.maxRevenue || 0;
            const maintenance = econ.maintenanceCost || 0;
            const decay = econ.decayRate || 0;
            const cost = econ.buildCost || 1;

            const profit = (revenue * 12) - (maintenance * 12);
            const buildingRoi = profit / cost;
            const penalty = (1 - decay);
            return buildingRoi * penalty;
        }).filter(score => !isNaN(score) && isFinite(score));

        // Normalize to 0-100 scale
        const minScore = Math.min(...allScores);
        const maxScore = Math.max(...allScores);
        const range = maxScore - minScore;

        let normalizedScore;
        if (range === 0) {
            normalizedScore = 50; // Default if all scores are equal
        } else {
            normalizedScore = ((rawScore - minScore) / range) * 100;
        }

        // Ensure score is between 0-100
        normalizedScore = Math.max(0, Math.min(100, normalizedScore));

        return {
            score: Math.round(normalizedScore),
            revenue: maxRevenue,
            maintenance: maintenanceCost,
            decayRate: decayRate
        };
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
                    // Check both direct number values and nested impact property
                    if (typeof data === 'number') {
                        softMetrics[key.toUpperCase()] = data;
                    } else if (data && typeof data.impact === 'number') {
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

        container.innerHTML = '';

        // Define resource configs with descriptions
        const resourceConfig = {
            'jobs': { color: '#ec4899', label: 'Jobs', maxValue: 30, description: 'Employment positions' },
            'energy': { color: '#f59e0b', label: 'Energy', maxValue: 500, description: 'Electrical power' },
            'education': { color: '#8b5cf6', label: 'Education', maxValue: 30, description: 'Learning capacity' },
            'food': { color: '#84cc16', label: 'Food', maxValue: 50, description: 'Nutrition access' },
            'housing': { color: '#06b6d4', label: 'Housing', maxValue: 30, description: 'Living spaces' },
            'healthcare': { color: '#ef4444', label: 'Healthcare', maxValue: 30, description: 'Medical services' }
        };

        // Get provided and required resources separately
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingData.name);
        const resources = building?.resources || {};

        // Create combined Resources section with center-based bars
        const resourcesSection = document.createElement('div');
        resourcesSection.innerHTML = '<div class="vitality-group-title">Resources</div>';

        let hasResources = false;
        Object.entries(resourceConfig).forEach(([key, config]) => {
            const provided = resources[key + 'Provided'] || 0;
            const required = resources[key + 'Required'] || 0;
            const netValue = provided - required;

            if (provided > 0 || required > 0) {
                hasResources = true;
                const row = document.createElement('div');
                row.className = 'resource-row';

                const normalizedValue = Math.min(Math.max(netValue / config.maxValue, -1), 1);
                const absWidth = Math.abs(normalizedValue) * 50; // 50% max in each direction

                let barHtml = '';
                let valueColor = '#888';
                let displayValue = '0';

                if (Math.abs(netValue) < 0.1) {
                    // Balanced - show center dot
                    barHtml = `
                        <div style="position: absolute; left: 49%; width: 2%; height: 8px; top: -1px; border-radius: 50%; background: #3b82f6; border: 1px solid rgba(255,255,255,0.3);"></div>
                    `;
                    valueColor = '#3b82f6';
                    displayValue = '0';
                } else if (netValue > 0) {
                    // Surplus - bar goes right from center
                    barHtml = `
                        <div style="position: absolute; left: 50%; width: ${absWidth}%; height: 100%; background: linear-gradient(90deg, ${config.color}, #4CAF50); border-radius: 0 3px 3px 0; opacity: 0.8;"></div>
                    `;
                    valueColor = '#4CAF50';
                    displayValue = `+${netValue}`;
                } else {
                    // Deficit - bar goes left from center
                    barHtml = `
                        <div style="position: absolute; left: ${50 - absWidth}%; width: ${absWidth}%; height: 100%; background: #ef4444; border-radius: 3px 0 0 3px; opacity: 0.8;"></div>
                    `;
                    valueColor = '#ef4444';
                    displayValue = `${netValue}`;
                }

                row.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: ${config.color}; font-weight: 600; font-size: 14px;">${config.label}</span>
                        <span style="color: ${valueColor}; font-weight: 600; font-size: 14px;">${displayValue}</span>
                    </div>
                    <div style="position: relative; width: 100%; height: 6px; background: #2a2a2a; border-radius: 3px; margin-bottom: 4px;">
                        <div style="position: absolute; left: 50%; width: 1px; height: 100%; background: #444;"></div>
                        ${barHtml}
                    </div>
                    <div style="color: #888; font-size: 12px; margin-bottom: 12px;">
                        ${provided > 0 && required > 0 ? `Provides ${provided}, needs ${required}` : config.description}
                    </div>
                `;
                resourcesSection.appendChild(row);
            }
        });

        if (!hasResources) {
            const noResources = document.createElement('div');
            noResources.style.cssText = 'color: #666; font-size: 14px; font-style: italic; margin-bottom: 12px;';
            noResources.textContent = 'No resource impacts';
            resourcesSection.appendChild(noResources);
        }

        container.appendChild(resourcesSection);

        // Add cost and build time at the bottom
        const metaSection = document.createElement('div');
        metaSection.innerHTML = '<div class="vitality-group-title">Building Details</div>';

        const buildingCategory = building?.category;
        const fundingInfo = this.calculateBuildingCostWithFunding(building, buildingData.cost);
        const playerCost = fundingInfo.playerCost;
        const publicFunding = fundingInfo.publicFunding;
        const availableFunds = fundingInfo.availableFunds;

        // Cost row
        const costRow = document.createElement('div');
        costRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';

        if (publicFunding > 0) {
            costRow.innerHTML = `
                <span style="color: #888; font-weight: 600; font-size: 14px;">Cost</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: #fff; font-weight: 600; font-size: 14px;">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 14px; color: #4CAF50; background: rgba(76, 175, 80, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">Funded</span>
                </div>
            `;
        } else if (availableFunds > 0) {
            costRow.innerHTML = `
                <span style="color: #888; font-weight: 600; font-size: 14px;">Cost</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="color: #fff; font-weight: 600; font-size: 14px;">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 14px; color: #FFA726; background: rgba(255, 167, 38, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">Partial</span>
                </div>
            `;
        } else {
            costRow.innerHTML = `
                <span style="color: #888; font-weight: 600; font-size: 14px;">Cost</span>
                <span style="color: #fff; font-weight: 600; font-size: 14px;">$${playerCost.toLocaleString()}</span>
            `;
        }

        const timeRow = document.createElement('div');
        timeRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';
        timeRow.innerHTML = `
            <span style="color: #888; font-weight: 600; font-size: 14px;">Build Time</span>
            <span style="color: #fff; font-weight: 600; font-size: 14px;">${buildingData.buildTime} days</span>
        `;

        metaSection.appendChild(costRow);
        metaSection.appendChild(timeRow);
        container.appendChild(metaSection);
    }

    updateBuildingImpacts(impacts) {
        const impactsList = document.getElementById('building-impacts-list');

        // Add section title
        impactsList.innerHTML = '<div class="vitality-group-title">Livability Impacts</div>';

        // Updating building impacts

        if (!impacts || Object.keys(impacts).length === 0) {
            const noImpacts = document.createElement('div');
            noImpacts.style.cssText = 'color: #666; font-size: 14px; font-style: italic; text-align: center;';
            noImpacts.textContent = 'No livability impacts';
            impactsList.appendChild(noImpacts);
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
            label.textContent = domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase();

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
            scoreLabel = 'Excellent';
        } else if (scoreData.score >= 60) {
            scoreColor = '#8BC34A'; // Light green
            scoreLabel = 'Good';
        } else if (scoreData.score >= 40) {
            scoreColor = '#FFC107'; // Amber
            scoreLabel = 'Fair';
        } else if (scoreData.score >= 20) {
            scoreColor = '#FF9800'; // Orange
            scoreLabel = 'Poor';
        } else {
            scoreColor = '#F44336'; // Red
            scoreLabel = 'Very Poor';
        }

        // Decay rate is stored as a percentage value (e.g., 0.12 for 0.12%), not a ratio
        // So we display it directly without multiplying by 100
        const decayBasisPoints = scoreData.decayRate.toFixed(4);

        container.innerHTML = `
            <div class="vitality-group-title">Investment Score</div>
            <div class="investment-score-main">
                <div class="investment-score-circle" style="border-color: ${scoreColor};">
                    <div class="investment-score-number" style="color: ${scoreColor};">${scoreData.score}</div>
                    <div class="investment-score-label" style="color: ${scoreColor};">${scoreLabel}</div>
                </div>
                <div class="investment-score-breakdown">
                    <div class="investment-metric">
                        <span class="metric-label">Optimal Revenue</span>
                        <span class="metric-value">$${scoreData.revenue}/day</span>
                    </div>
                    <div class="investment-metric">
                        <span class="metric-label">Maintenance</span>
                        <span class="metric-value">$${scoreData.maintenance}/day</span>
                    </div>
                    <div class="investment-metric">
                        <span class="metric-label">Decay Rate</span>
                        <span class="metric-value">${decayBasisPoints}%/day</span>
                    </div>
                </div>
            </div>
        `;
    }

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

    // setupCategoryHover, showSubmenu, hideSubmenu, scheduleSubmenuHide, cancelSubmenuHide moved to ContextMenuSystem

    // Land value helper methods
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
    
    // REMOVED: Legacy V1 buildTransportNetwork() - V2 architecture eliminates client-side transport calculations
    
    // REMOVED: Legacy V1 calculateAccessiblePopulation() - V2 architecture uses server-side population calculations
    
    
    calculateEffectiveDistance(row1, col1, row2, col2) {
        // Use Manhattan distance for simple grid-based distance calculation
        return Math.abs(row1 - row2) + Math.abs(col1 - col2);
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


    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    // Update building revenues based on supply/demand satisfaction
    applySupplyDemandEffects() {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN Loading... PLACEHOLDER
        // This massive function was doing complex economic calculations:
        // - Math.max() operations for supply/demand ratios (6+ instances!)
        // - Population change rate calculations with multiplication
        // - Business efficiency calculations with Math.max()
        // - Energy, food, housing, jobs ratio calculations
        // - Cumulative population changes with Math.max() limits
        // Server should handle all economic effect calculations for server authority!
        this.economicEffects = {
            energyMultiplier: 'Loading...',
            foodMultiplier: 'Loading...',
            housingMultiplier: 'Loading...',
            jobsMultiplier: 'Loading...',
            populationChangeRate: 'Loading...',
            businessEfficiency: 'Loading...'
        };
        this.supplyDemandEffects = this.economicEffects;
        return this.economicEffects;
    }

    setupZoomControls() {
    }
    
    setupLayerControls() {
        // Layer controls now handled by UI Manager
    }
    

    switchToLayer(layerName) {
        // Update current layer
        this.currentLayer = layerName;

        // Layer switching cleanup (if needed in future)
        
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
        
        // Update cursor style based on layer
        this.canvas.style.cursor = 'default';

        // Update legend for new layer
        if (this.layerLegend) {
            this.layerLegend.updateLegend(layerName);
        }

        // Re-render with new layer
        this.scheduleRender();
    }
    
    handlePanelTransitions(layerName) {
        const coreNeedsElement = document.querySelector('[data-target="core-needs"]');
        const playersElement = document.querySelector('[data-target="players-panel"]');

        const coreNeedsSection = coreNeedsElement?.parentElement;
        const playersSection = playersElement?.parentElement;

        // Standard panel handling for all layers
        if (layerName === 'normal') {
            // In normal view - open Core Needs panel
            if (coreNeedsSection) {
                this.openSidebarSection(coreNeedsSection);
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
        const currentPlayerId = this.playerId || this.currentPlayerId || window.PlayerUtils?.getCurrentPlayerId();
        allPlayers.set(currentPlayerId, {
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
    


    // Infrastructure building disabled in V2
    buildInfrastructure(edgeType, row, col, infrastructureType, value, playerId = null) {
        this.showNotification('Infrastructure building not available', 'error');
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
        // AUTHORITY VIOLATION FIXED: Infrastructure should be SERVER-AUTHORITATIVE
        // Client should send transaction to server and await confirmation
        // This method now only validates and sends transaction - no direct state modification

        const infra = edgeParcel.infrastructure;

        // Validate request before sending to server
        switch (infrastructureType) {
            case 'roadway':
                if (infra.roadway) {
                    this.showNotification('Road already exists here', 'error');
                    return false;
                }
                break;

            case 'sidewalks':
                if (infra.sidewalks) {
                    this.showNotification('Sidewalks already exist here', 'error');
                    return false;
                }
                break;

            case 'bikelanes':
                if (infra.bikelanes) {
                    this.showNotification('Bike lanes already exist here', 'error');
                    return false;
                }
                break;

            case 'busStop':
                if (infra.busStop) {
                    this.showNotification('Bus stop already exists here', 'error');
                    return false;
                }
                break;

            case 'subwayEntrance':
                if (infra.subwayEntrance) {
                    this.showNotification('Subway entrance already exists here', 'error');
                    return false;
                }
                break;

            case 'trafficControl':
                if (infra.trafficControl) {
                    this.showNotification('Traffic control already exists here', 'error');
                    return false;
                }
                break;

            default:
                return false;
        }

        // SERVER HANDLES STATE MODIFICATION - client only validates and sends transaction
        // State updates will come via server sync in multiplayer mode

        // Send infrastructure transaction to server in multiplayer mode
        if (this.economicClient && this.economicClient.isMultiplayer) {
            const infrastructureTransaction = {
                type: 'BUILD_INFRASTRUCTURE',
                data: {
                    row: row,
                    col: col,
                    infrastructureType: type,
                    cost: cost,
                    timestamp: Date.now()
                }
            };

            this.economicClient.sendTransaction(infrastructureTransaction);
        } else {
            // In solo mode, apply directly
            parcel.infrastructure = type;
            this.money -= cost;
        }

        return true;
    }

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
                const isWorkplace = building && (this.buildingSystem.buildingCategories.normalize(building.category) === 'commercial' || building.category === 'education');
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
                    // Use the unified color system from renderer for consistent colors
                    const playerColor = this.renderer?.getPlayerColor(parcel.owner);
                    if (playerColor) {
                        const hex = playerColor.replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16);
                        const g = parseInt(hex.substr(2, 2), 16);
                        const b = parseInt(hex.substr(4, 2), 16);
                        return `rgba(${r}, ${g}, ${b}, 0.4)`;
                    }
                    return this.getCompetitorColor(parcel.owner); // Fallback
                }
        }
    }
    
    
    // REMOVED: getMobilityLayerColor() - mobility layer completely disabled in V2
    
    getLandValueHeatmapColor(row, col) {
        const parcel = this.grid[row][col];

        // Get land value based on current mode
        let landValue;
        if (this.landValueMode === 'paid') {
            // Use most recently paid price
            // 🚫 Use server-authoritative data
            landValue = this.economicClient?.getParcelPrice(row, col) || 'Loading...';
        } else {
            // Use estimated/calculated land value
            // 🚫 Use server-authoritative data
            landValue = parcel?.landValue?.calculatedValue || this.economicClient?.getParcelPrice(row, col) || 'Loading...';
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
                    // 🚫 Use server-authoritative data
                    value = this.economicClient?.getParcelPrice(r, c) || 'Loading...';
                } else {
                    // 🚫 Use server-authoritative data
                    value = p?.landValue?.calculatedValue || this.economicClient?.getParcelPrice(r, c) || 'Loading...';
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
        const decayRate = building.economics.decayRate ? building.economics.decayRate / 100 : 0.001;
        const buildingAgeInDays = parcel.buildingAge || 0;
        const maintenanceMultiplier = Math.pow(1 + decayRate, buildingAgeInDays);
        let maintenanceCost = baseMaintenance * maintenanceMultiplier;
        
        // Note: Amenities in the current system don't have revenue/maintenance data
        // They only provide city vitality impacts, not direct economic benefits
        
        // Calculate land tax if owned by player
        // 🚫 CLIENT CALCULATION - MARKED FOR REMOVAL
        let landTax = 0;
        if (this.isCurrentPlayer(parcel.owner)) {
            // 🔧 BANDAID WARNING: Triple fallback chain for critical tax calculations
            if (!this.economicClient?.getLVTRate?.()) {
                console.warn('🔧 BANDAID: LVT rate missing from economic client, falling back to governance system');
                if (!this.governanceSystem?.getCurrentLVTRate?.()) {
                    console.warn('🔧 BANDAID: LVT rate missing from governance system, using hardcoded 50% fallback');
                }
            }
            const annualLVTRate = this.economicClient?.getLVTRate?.() || this.governanceSystem?.getCurrentLVTRate?.() || 0.50;
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
    
    
    // Performance optimization methods
    markRegionDirty(row, col, radius = 2) {
        // Mark affected regions as needing recalculation
        for (let r = Math.max(0, row - radius); r <= Math.min(this.gridSize - 1, row + radius); r++) {
            for (let c = Math.max(0, col - radius); c <= Math.min(this.gridSize - 1, col + radius); c++) {
                const key = `${r}-${c}`;
                this.dirtyRegions.add(key);
                // Cache clearing removed - using server-authoritative pricing
            }
        }
    }
    
    clearCachesIfStale() {
        const now = performance.now();
        // Clear all caches every 30 seconds to prevent memory leaks
        if (now - this.lastCacheUpdate > 30000) {
            this.dirtyRegions.clear();
            this.lastCacheUpdate = now;
        }
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
                
        return influencedTiles;
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

    
    setupEventListeners() {
        // setupEventListeners called

        // Prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        this.canvas.addEventListener('click', (e) => {
            // NOTE: TooltipSystemV2 handles most click interactions with capture:true
            // This is a fallback for edge cases and toggle-off behavior

            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldCoords = { x: screenX, y: screenY };
            const tile = this.renderingSystem?.fromIsometric(worldCoords.x, worldCoords.y);

            if (tile && tile.row >= 0 && tile.row < this.gridSize &&
                tile.col >= 0 && tile.col < this.gridSize) {

                // ENERGY LAYER: Street-based power line placement on edges
                if (this.currentLayer === 'energy') {
                    if (this.hoveredStreetEdge) {
                        this.handleStreetEdgeClick(this.hoveredStreetEdge);
                    }
                    return;
                }

                this.selectedTile = tile;

                // Toggle context menu off if clicking same tile
                if (this.contextMenu?.classList?.contains('visible')) {
                    const isSameTile = this.selectedTile.row === tile.row &&
                                      this.selectedTile.col === tile.col;
                    if (isSameTile) {
                        this.hideContextMenu();
                        return;
                    }
                }

                // Fallback: Show context menu if TooltipSystemV2 isn't handling it
                if (!this.tooltipSystemV2?.currentType) {
                    this.showContextMenu(tile.row, tile.col, e.clientX, e.clientY);
                }
            } else {
                // Clicked outside grid - hide context menu
                this.hideContextMenu();
            }
        });

        // Canvas mousemove handler for street edge detection in energy layer
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.currentLayer !== 'energy') {
                if (this.hoveredStreetEdge) {
                    this.hoveredStreetEdge = null;
                    this.scheduleRender();
                }
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Detect nearby street edge with wider hitbox (30px)
            const edge = this.detectStreetEdge(screenX, screenY, 30);

            if (edge) {
                this.hoveredStreetEdge = edge;
                this.scheduleRender();
            } else {
                if (this.hoveredStreetEdge) {
                    this.hoveredStreetEdge = null;
                    this.scheduleRender();
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

            
            switch(e.key) {
                case 'Escape':
                    this.scheduleRender();
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
        // Real-time sync disabled - using economicClient v2
        // No longer needed - economicClient handles all server communication
    }

    async performFastSync() {
    }

    async performMediumSync() {
        try {
            // Update building performance for all built parcels
            const promises = [];

            for (let row = 0; row < this.rows; row++) {
                for (let col = 0; col < this.cols; col++) {
                    const parcel = this.grid[row][col];
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
                                .catch(err => console.warn(`Building sync failed:`, err))
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

        // Real-time synchronization system destroyed
    }

    // Game loop system for construction and cash accrual
    initializeGameLoop() {
        // Initializing game loop for construction and cash accrual

        // DISABLED: Client-side construction and cash updates (SERVER AUTHORITATIVE)
        // Server manages construction via BUILD_COMPLETE_AUTO messages
        // Server manages cash accrual via economic engine

        // REMOVED: client-side construction and cash intervals - server-authoritative in V2
    }

    updateConstructionProgress() {
        // AUTHORITY VIOLATION FIXED: Construction progress is now SERVER-AUTHORITATIVE
        // Client should not calculate construction progress independently
        // Progress updates will come via server state sync in multiplayer mode
        // This method is kept for backwards compatibility but no longer modifies state

        // In multiplayer mode, construction progress comes from server updates
        // In solo mode, server handles construction timing as well

        // No longer needed: constructionUpdated always false since server handles progress
        const constructionUpdated = false;

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
                // SERVER HANDLES CASHFLOW - client should not modify cash directly
                // Cash updates will come via server state sync in multiplayer mode
                // Cash display managed by Economic Client - no manual updates needed

                // V2: Economic client handles server balance management automatically
                // No manual sync needed - server balance updated through economic client
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

        // Game loop destroyed
    }

    /**
     * Initialize V2 Economic Client with server communication
     */
    initializeEconomicClientV2() {
        // Initializing Economic Client v2

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

                                // Trigger re-render of entire scene (V2 approach)
                                this.scheduleRender();
                                // Player started building construction
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
                // V2: Economic client already handles cashflow updates via server sync
                this.updatePlayerStats();
                // Refresh building performances daily
                this.refreshAllBuildingPerformances();
                break;

            case 'DAILY_TICK':
                // Sync economic data from server on daily tick
                this.economicClient.getEconomicState().then(() => {
                    // Economic state synced from server on DAILY_TICK
                    // V2: UI updates handled by ui-manager
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
                    }
                    // V2: Economic client already updated via getEconomicState() above
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

                            // Trigger re-render of entire scene (V2 approach)
                            this.scheduleRender();

                            // Synced building from server
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

                    // Store building as ID string (not object) for rendering compatibility
                    parcel.building = buildingId;
                    parcel.owner = playerId;

                    // Update client-side construction state properties
                    parcel._isUnderConstruction = false;
                    parcel._constructionProgress = 1.0;
                    delete parcel._constructionStartTime;
                    delete parcel._constructionDays;

                    // Mark parcel and neighbors dirty for rendering optimization
                    if (this.renderingSystem?.markParcelAndNeighborsDirty) {
                        this.renderingSystem.markParcelAndNeighborsDirty(row, col);
                    }

                    // Trigger completion animation (queued, plays one at a time)
                    if (this.renderingSystem?.queueBuildingCompleteAnimation) {
                        this.renderingSystem.queueBuildingCompleteAnimation(row, col);
                    }

                    // Fetch and update performance
                    this.fetchBuildingPerformance(row, col);
                }
                break;

            case 'ROOM_RESET':
                // Clear all local building state and prepare for resync
                // Room reset - clearing all buildings from grid
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
                // Requesting fresh room state
                if (window.connectionManager && window.connectionManager.isConnected) {
                    window.connectionManager.send({
                        type: 'REQUEST_ROOM_STATE',
                        playerId: this.currentPlayerId,
                        timestamp: Date.now()
                    });
                }
                break;

            case 'VITALITY_UPDATE':
                // V2: Handle JEEFHH/CARENS vitality data updates via UI manager
                if (update.jeefhh || update.carens) {
                    // Simple delegation to UI manager
                    if (this.uiManager && this.economicClient) {
                        this.uiManager.updateEconomicDisplays(this.economicClient);
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
                console.warn('Unknown economic update type:', update.type);
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
                    // Trigger re-render of entire scene (V2 approach)
                    this.scheduleRender();
                }
            }
        }
        // Cleared all buildings from grid
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

                // Mark parcel and neighbors dirty for rendering optimization
                if (this.renderingSystem?.markParcelAndNeighborsDirty) {
                    this.renderingSystem.markParcelAndNeighborsDirty(row, col);
                }

                // Trigger re-render (V2 approach - will update all visual effects)
                this.scheduleRender();
            }
        } catch (error) {
            // Building might not exist on server yet - set default performance
            const parcel = this.grid[row]?.[col];
            if (parcel?.building && !parcel.building.underConstruction) {
                // Default performance for buildings not on server (25% baseline)
                parcel.building.performance = 25;

                // Mark parcel and neighbors dirty for rendering optimization
                if (this.renderingSystem?.markParcelAndNeighborsDirty) {
                    this.renderingSystem.markParcelAndNeighborsDirty(row, col);
                }

                this.scheduleRender();
            }
        }
    }

    /**
     * Detect gridline edge near click position (for power line placement)
     * Returns edge object {type, row, col, parcel1, parcel2} or null
     */
    detectGridlineEdge(screenX, screenY) {
        const result = this.detectGridlineWithNearest(screenX, screenY);
        return result.activeEdge;
    }

    /**
     * Detect street edge near cursor position with wider hitbox
     * Returns edge object {row1, col1, row2, col2, type} or null
     */
    detectStreetEdge(screenX, screenY, threshold = 30) {
        let closestEdge = null;
        let closestDistance = Infinity;

        // Iterate through all parcels and check their edges
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const iso = this.renderingSystem.toIsometric(col, row);

                // Check horizontal edge (top edge of this parcel)
                if (col < this.gridSize - 1) {
                    const isoRight = this.renderingSystem.toIsometric(col + 1, row);
                    const midX = (iso.x + isoRight.x) / 2;
                    const midY = (iso.y + isoRight.y) / 2;
                    const distance = Math.sqrt((screenX - midX) ** 2 + (screenY - midY) ** 2);

                    if (distance < threshold && distance < closestDistance) {
                        closestDistance = distance;
                        closestEdge = {
                            row1: row,
                            col1: col,
                            row2: row,
                            col2: col + 1,
                            type: 'h'
                        };
                    }
                }

                // Check vertical edge (right edge of this parcel)
                if (row < this.gridSize - 1) {
                    const isoBottom = this.renderingSystem.toIsometric(col, row + 1);
                    const midX = (iso.x + isoBottom.x) / 2;
                    const midY = (iso.y + isoBottom.y) / 2;
                    const distance = Math.sqrt((screenX - midX) ** 2 + (screenY - midY) ** 2);

                    if (distance < threshold && distance < closestDistance) {
                        closestDistance = distance;
                        closestEdge = {
                            row1: row,
                            col1: col,
                            row2: row + 1,
                            col2: col,
                            type: 'v'
                        };
                    }
                }
            }
        }

        return closestEdge;
    }

    /**
     * Detect gridline edge and find nearest 4 gridlines for selector rendering
     * Returns {activeEdge, nearestEdges: [edge1, edge2, edge3, edge4]}
     */
    detectGridlineWithNearest(screenX, screenY) {
        const EDGE_DETECTION_THRESHOLD = 15; // pixels from edge center to detect click
        const allEdgesWithDistance = [];

        // Iterate through all parcels and check their edges
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const iso = this.renderingSystem.toIsometric(col, row);

                // Check all 4 edges of this parcel
                const edges = [
                    // Top edge (between [row,col] and [row,col+1])
                    {
                        type: 'h',
                        row: row,
                        col: col,
                        parcel1: [row, col],
                        parcel2: [row, col + 1],
                        x1: iso.x,
                        y1: iso.y - this.tileHeight / 2,
                        x2: iso.x + this.tileWidth / 2,
                        y2: iso.y
                    },
                    // Right edge (between [row,col] and [row+1,col])
                    {
                        type: 'v',
                        row: row,
                        col: col,
                        parcel1: [row, col],
                        parcel2: [row + 1, col],
                        x1: iso.x + this.tileWidth / 2,
                        y1: iso.y,
                        x2: iso.x,
                        y2: iso.y + this.tileHeight / 2
                    }
                ];

                // Calculate distance from mouse to each edge
                for (const edge of edges) {
                    // Check if parcel2 exists (edge is within grid)
                    const [r2, c2] = edge.parcel2;
                    if (r2 >= this.gridSize || c2 >= this.gridSize) continue;

                    // Calculate distance from mouse to edge midpoint
                    const midX = (edge.x1 + edge.x2) / 2;
                    const midY = (edge.y1 + edge.y2) / 2;
                    const distance = Math.sqrt(Math.pow(screenX - midX, 2) + Math.pow(screenY - midY, 2));

                    allEdgesWithDistance.push({
                        edge,
                        distance,
                        midX,
                        midY
                    });
                }
            }
        }

        // Sort by distance
        allEdgesWithDistance.sort((a, b) => a.distance - b.distance);

        // Get closest edge as active edge
        const activeEdge = allEdgesWithDistance.length > 0 && allEdgesWithDistance[0].distance < EDGE_DETECTION_THRESHOLD
            ? allEdgesWithDistance[0].edge
            : null;

        // Get 4 nearest edges (including active)
        const nearestEdges = allEdgesWithDistance.slice(0, 4).map(item => item.edge);

        return { activeEdge, nearestEdges };
    }

    /**
     * Handle street edge click (street-based power line placement)
     */
    handleStreetEdgeClick(edge) {
        // Check if power line already exists
        const energyGrid = this.economicClient?.energyGrid;
        const edgeId = edge.type === 'h' ? `h_${edge.row1}_${edge.col1}` : `v_${edge.row1}_${edge.col1}`;

        if (energyGrid?.lines?.has(edgeId)) {
            this.showNotification('Power line already exists here', 'error');
            return;
        }

        // Build power line on this street edge
        this.buildPowerLine([edge.row1, edge.col1], [edge.row2, edge.col2]);
    }


    /**
     * Show gridline hover tooltip
     */
    showGridlineTooltip(clientX, clientY, edge) {
        // Create tooltip element if it doesn't exist
        if (!this.gridlineTooltip) {
            this.gridlineTooltip = document.createElement('div');
            this.gridlineTooltip.id = 'gridline-tooltip';
            this.gridlineTooltip.style.position = 'fixed';
            this.gridlineTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            this.gridlineTooltip.style.color = '#00FF41';
            this.gridlineTooltip.style.padding = '8px 12px';
            this.gridlineTooltip.style.borderRadius = '4px';
            this.gridlineTooltip.style.border = '1px solid #00FF41';
            this.gridlineTooltip.style.fontSize = '14px';
            this.gridlineTooltip.style.fontWeight = 'bold';
            this.gridlineTooltip.style.pointerEvents = 'none';
            this.gridlineTooltip.style.zIndex = '10000';
            this.gridlineTooltip.style.boxShadow = '0 0 10px rgba(0, 255, 65, 0.5)';
            document.body.appendChild(this.gridlineTooltip);
        }

        // Check if power line already exists
        const edgeId = edge.type === 'h' ? `h_${edge.row}_${edge.col}` : `v_${edge.row}_${edge.col}`;
        const lineExists = this.economicClient?.energyGrid?.lines?.has(edgeId);

        // Update tooltip content
        if (lineExists) {
            this.gridlineTooltip.innerHTML = 'Power line already exists';
            this.gridlineTooltip.style.color = '#FF4444';
            this.gridlineTooltip.style.border = '1px solid #FF4444';
        } else {
            this.gridlineTooltip.innerHTML = 'Build Power Line - $10';
            this.gridlineTooltip.style.color = '#00FF41';
            this.gridlineTooltip.style.border = '1px solid #00FF41';
        }

        // Position tooltip near cursor
        this.gridlineTooltip.style.left = `${clientX + 15}px`;
        this.gridlineTooltip.style.top = `${clientY + 15}px`;
        this.gridlineTooltip.style.display = 'block';
    }

    /**
     * Hide gridline hover tooltip
     */
    hideGridlineTooltip() {
        if (this.gridlineTooltip) {
            this.gridlineTooltip.style.display = 'none';
        }
    }


    /**
     * Send power line construction request to server
     */
    async buildPowerLine(parcel1, parcel2) {
        if (!this.economicClient) {
            console.error('❌ Economic client not initialized');
            return;
        }

        try {
            const transaction = {
                type: 'BUILD_POWER_LINE',
                parcel1: parcel1,
                parcel2: parcel2,
                playerId: this.currentPlayerId,
                timestamp: Date.now()
            };

            // Send via WebSocket
            const result = await this.economicClient.sendTransaction(transaction);

            if (result.success) {
                console.log(`✅ Power line built: ${result.edgeId} (cost: $${result.cost})`);

                // Balance is already updated in economic client's transaction response handler
                // No need to update here
            } else {
                console.error('❌ Failed to build power line:', result.error);
            }
        } catch (error) {
            console.error('❌ Error building power line:', error);
        }
    }

}

// Export IsometricGrid to global scope
window.IsometricGrid = IsometricGrid;
