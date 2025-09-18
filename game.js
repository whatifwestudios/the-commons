
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
        
        // Initialize performance monitoring
        this.perfMonitor = new PerformanceMonitor();
        this.perfMonitor.initDisplay();
        
        // Initialize server stats monitoring
        this.serverStatsMonitor = new ServerStatsMonitor();
        
        // Initialize UI Manager for DOM caching
        this.uiManager = new UIManager();
        
        // Initialize Building System
        this.buildingSystem = new BuildingSystem(this);
        
        // Initialize Economic Engine
        this.economicEngine = new EconomicEngine(this);
        
        // Initialize Rendering System
        this.renderingSystem = new RenderingSystem(this);
        
        // Initialize Governance System
        this.governanceSystem = new GovernanceSystem(this);
        
        // Initialize Auction System
        this.auctionSystem = new AuctionSystem(this);
        
        // Initialize unified tooltip manager
        this.tooltipManager = new TooltipManager();
        
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
                return building.resources?.energyDemand < 0;
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
            totalResidents: null,
            cityTreasury: null
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
        this.playerCash = 5000;
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
        
        // Sub-menu hover management
        this.currentSubmenu = null; // Currently visible submenu element
        this.submenuTimer = null; // Timer for submenu hide delay
        
        // Map layer system
        this.currentLayer = 'normal'; // 'normal', 'landvalue', 'cashflow'
        
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
        
        // Unified Governance system - players start with 2 points, get 2 more each month
        this.governance = {
            totalVotingPoints: 2, // Total points player has earned (starts with 2)
            playerAllocations: { // Track where player has allocated their points
                // Budget categories (10 options)
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0,
                // LVT rate adjustment (1 option) - can be negative
                lvtRate: 0
            },
            budgetCategories: [
                'education',
                'healthcare', 
                'infrastructure',
                'housing',
                'culture',
                'recreation',
                'commercial',
                'civic',
                'emergency',
                'ubi'
            ],
            categoryAllocations: {}, // Percentage of LVT allocated to each category
            publicCoffers: {}, // Available funds in each category
            unallocatedFunds: 0, // Funds collected but not yet allocated to categories
            baseLvtRate: 0.50, // 50% base rate (unchanged)
            currentLvtRate: 0.50, // 50% starting rate
            proposedLvtRate: 0.50,
            monthlyLvtCollected: 0
        };
        
        // Initialize budget categories
        this.governance.budgetCategories.forEach(category => {
            this.governance.categoryAllocations[category] = 0;
            this.governance.publicCoffers[category] = 0;
        });
        
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
        
        // Action Manager System
        this.actionManager = {
            monthlyAllowance: this.calculateMonthlyActionAllowance(), // Dynamic based on month
            currentActions: this.calculateMonthlyActionAllowance(),   // Player's current action balance
            usedThisMonth: 0,      // Track monthly usage
            
            // Action marketplace
            marketplace: {
                listings: [],      // Active action auctions
                nextListingId: 1,  // Auto-increment ID
                priceHistory: [],  // Track sale prices for market stats
                avgPrice: 0        // Running average price
            }
        };
        
        // Action costs (only these three things cost actions)
        this.actionCosts = {
            purchaseParcel: 1,     // Buy a parcel at market price
            constructBuilding: 1,  // Build any building
            participateAuction: 1  // Enter a land auction
        };
        
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
            this.updateAuctionCountdowns(); // Update auction timers
        }, 1000);
        
        // Periodic sync check to catch any state drift (every 10 seconds)
        if (this.multiplayerManager) {
            setInterval(() => {
                this.checkForStateDrift();
            }, 10000);
        }
        
        // Initialize Action Marketplace
        this.actionMarketplace = new ActionMarketplace(this);
        
        // Initialize multiplayer system
        this.multiplayerManager = new RailwayMultiplayerManager(this);
        this.multiplayerManager.connect();
    }
    
    isCurrentPlayer(owner) {
        if (owner === 'player') return true; // Legacy single-player mode
        if (this.multiplayerManager && this.multiplayerManager.playerId) {
            return owner === this.multiplayerManager.playerId;
        }
        return false;
    }

    resetGameState() {
        console.log('🧹 Resetting all game state for new game...');
        
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
        
        console.log('✅ Game state reset complete');
    }

    startGame() {
        // Reset all game state for clean start
        this.resetGameState();
        
        // Initialize building system
        this.buildingSystem.initialize();
        
        // Reset and initialize economic engine for new game
        this.economicEngine.reset();
        this.economicEngine.initialize();
        
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
        this.loadPlayerSettings();
        
        // Update player button with current settings
        this.updatePlayerButton();
        
        // Initialize panel states - ensure players panel is collapsed by default
        this.initializePanelStates();
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
                
                // Reset local multiplayer state
                if (this.multiplayerManager) {
                    this.multiplayerManager.players.clear();
                }
                
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
    
    loadPlayerSettings() {
        try {
            const savedSettings = localStorage.getItem('theCommons_playerSettings');
            if (savedSettings && !this.playerSettings) {
                this.playerSettings = JSON.parse(savedSettings);
            }
        } catch (error) {
            console.error('Failed to load player settings:', error);
        }
    }
    
    updatePlayerButton() {
        const playerBtn = document.getElementById('player-btn');
        if (playerBtn) {
            const playerName = this.playerSettings?.name || 'PLAYER';
            playerBtn.innerHTML = `${playerName.toUpperCase()}<span class="indicator">▼</span>`;
        }
    }
    
    
    
    // Street edge interaction methods
    // Street edge methods moved to TransportationSystem
    
    // Drawing methods moved to TransportationSystem
    
    // Road drawing methods moved to TransportationSystem
    
    // Road drawing methods moved to TransportationSystem

    drawDebugGrid() {
        // Debug visualization to understand parcel vs gap positioning
        this.ctx.save();
        
        // Draw only for a few tiles to avoid clutter
        for (let row = 5; row <= 7; row++) {
            for (let col = 5; col <= 7; col++) {
                const iso = this.toIsometric(col, row);
                const tile = this.grid[row][col];
                const elevation = tile ? tile.elevation * 8 : 0;
                
                // Draw full tile boundary (gray)
                this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(iso.x, iso.y - elevation - this.tileHeight / 2);
                this.ctx.lineTo(iso.x + this.tileWidth / 2, iso.y - elevation);
                this.ctx.lineTo(iso.x, iso.y - elevation + this.tileHeight / 2);
                this.ctx.lineTo(iso.x - this.tileWidth / 2, iso.y - elevation);
                this.ctx.closePath();
                this.ctx.stroke();
                
                // Draw shrunken parcel boundary (red) - 50% scale
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                this.ctx.lineWidth = 2;
                const shrunkW = this.tileWidth * 0.25; // 50% scale = 25% from center
                const shrunkH = this.tileHeight * 0.25;
                this.ctx.beginPath();
                this.ctx.moveTo(iso.x, iso.y - elevation - shrunkH);
                this.ctx.lineTo(iso.x + shrunkW, iso.y - elevation);
                this.ctx.lineTo(iso.x, iso.y - elevation + shrunkH);
                this.ctx.lineTo(iso.x - shrunkW, iso.y - elevation);
                this.ctx.closePath();
                this.ctx.stroke();
                
                // Draw gap positions (yellow dots) where roads should be
                // Gaps are between the EDGES of shrunken parcels, not between tile centers
                this.ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
                const gapPositions = [
                    // NE gap: between this parcel's NE edge and next parcel's SW edge
                    { x: iso.x + shrunkW + (this.tileWidth * 0.5 - shrunkW) / 2, 
                      y: iso.y - elevation - shrunkH - (this.tileHeight * 0.5 - shrunkH) / 2 },
                    // SE gap: between this parcel's SE edge and next parcel's NW edge  
                    { x: iso.x + shrunkW + (this.tileWidth * 0.5 - shrunkW) / 2,
                      y: iso.y - elevation + shrunkH + (this.tileHeight * 0.5 - shrunkH) / 2 },
                    // SW gap: between this parcel's SW edge and next parcel's NE edge
                    { x: iso.x - shrunkW - (this.tileWidth * 0.5 - shrunkW) / 2,
                      y: iso.y - elevation + shrunkH + (this.tileHeight * 0.5 - shrunkH) / 2 },
                    // NW gap: between this parcel's NW edge and next parcel's SE edge
                    { x: iso.x - shrunkW - (this.tileWidth * 0.5 - shrunkW) / 2,
                      y: iso.y - elevation - shrunkH - (this.tileHeight * 0.5 - shrunkH) / 2 }
                ];
                
                gapPositions.forEach(pos => {
                    this.ctx.beginPath();
                    this.ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI);
                    this.ctx.fill();
                });
                
                // Label the tile
                this.ctx.fillStyle = 'white';
                this.ctx.font = '10px monospace';
                this.ctx.fillText(`${row},${col}`, iso.x - 10, iso.y - elevation);
            }
        }
        
        this.ctx.restore();
    }

    // Road segment methods moved to TransportationSystem

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
        this.domCache.cityTreasury = this.uiManager.get('cityTreasury');
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

        console.log('Edge parcels initialized:', {
            horizontal: `${this.gridSize - 1}x${this.gridSize}`,
            vertical: `${this.gridSize}x${this.gridSize - 1}`,
            intersections: `${this.gridSize - 1}x${this.gridSize - 1}`
        });

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
        // CRITICAL: Only start client-side timer in solo mode
        // In multiplayer, time is server-authoritative via DAILY_UPDATE messages
        if (this.multiplayerManager && this.multiplayerManager.isConnected) {
            console.log('🔗 Multiplayer detected - server will control time advancement');
            return;
        }
        
        console.log('🕐 Starting solo game timer');
        setInterval(() => {
            this.currentDay++;
            this.lastDayStartTime = performance.now(); // Track when this day started
            this.updateGameDate();
            this.processDailyCashflow();
            this.updatePlayerStats();
            // Re-render to update building construction stages
            this.scheduleRender();
        }, this.dayLength);
    }

    // Action Manager Methods
    calculateMonthlyActionAllowance() {
        // September gets 20 actions, then 2 less each month until minimum of 10
        const monthOrder = ['SEPT', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];
        const currentMonthIndex = monthOrder.indexOf(this.gameDate.month);
        const baseActions = 20;
        const reduction = currentMonthIndex * 2;
        const minimumActions = 10;
        
        return Math.max(minimumActions, baseActions - reduction);
    }
    
    refreshMonthlyActions() {
        // Update monthly allowance based on current month
        const currentActions = this.actionManager.currentActions;
        const oldAllowance = this.actionManager.monthlyAllowance;
        const newAllowance = this.calculateMonthlyActionAllowance();
        
        // Update the monthly allowance
        this.actionManager.monthlyAllowance = newAllowance;
        
        // Calculate purchased actions (any actions beyond the old monthly allowance)
        const purchasedActions = Math.max(0, currentActions - oldAllowance);
        
        // Reset to new monthly allowance + purchased actions only
        this.actionManager.currentActions = newAllowance + purchasedActions;
        this.actionManager.usedThisMonth = 0;
        this.updateActionDisplay();
        
        // Add visual flair for actions refresh
        this.addActionsRefreshAnimation();
        
        // Visual feedback via animations instead of notifications
        // (Notifications removed to reduce clutter - visual effects provide feedback)
    }
    
    useAction(actionType, cost = 1) {
        if (this.actionManager.currentActions < cost) {
            this.showNotification('Not enough actions! Visit the marketplace to buy more.', 'error');
            return false;
        }
        
        this.actionManager.currentActions -= cost;
        this.actionManager.usedThisMonth += cost;
        this.updateActionDisplay();
        return true;
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
        
        // Update marketplace stats
        this.actionMarketplace.updateMarketplaceDisplay();
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
        let dailyRevenue = 0;
        let dailyMaintenance = 0;
        let dailyLVT = 0;
        
        // Calculate and apply supply/demand effects first
        this.applySupplyDemandEffects();
        
        // Update player parcel tracking and mark aging buildings as dirty
        this.updatePlayerParcelsAndAging();
        
        // Process only dirty/changed buildings + new calculations
        this.updateEconomicCache();
        
        // Sum cached values for totals
        this.economicCache.buildingStats.forEach(stats => {
            dailyRevenue += stats.revenue;
            dailyMaintenance += stats.maintenance;
            dailyLVT += stats.lvt;
        });
        
        // Add road maintenance costs (until LVT funds infrastructure budget)
        const roadMaintenance = this.calculateRoadMaintenance();
        dailyMaintenance += roadMaintenance;
        
        // Update transit system (revenue, costs, maintenance, decay)
        if (this.mobilityLayer && this.mobilityLayer.updateTransitSystem) {
            this.mobilityLayer.updateTransitSystem();
        }
        
        // Build UI breakdown from cache
        this.buildCashflowBreakdown();
        
        // Apply cashflow (preserve full precision)
        const netCashflow = dailyRevenue - dailyMaintenance - dailyLVT;
        this.playerCash += netCashflow;
        
        // Add daily LVT to unallocated funds (city treasury)
        if (dailyLVT > 0) {
            this.governance.unallocatedFunds += dailyLVT;
        }
        
        // Store daily totals for UI
        this.dailyCashflowTotals = {
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            lvt: dailyLVT,
            netCashflow
        };
        
        console.log(`🔍 Cashflow Summary: Revenue=$${Math.round(dailyRevenue)}, Maintenance=$${Math.round(dailyMaintenance)}, LVT=$${Math.round(dailyLVT)}`);
        
        // Ensure cash doesn't go below zero
        if (this.playerCash < 0) {
            this.playerCash = 0;
        }
        
        // Clear dirty flags after processing
        this.economicCache.dirty.clear();
        this.economicCache.lastUpdate = performance.now();
        
        // Check for auction triggers
        this.auctionSystem.checkForAuctions();
        
    }
    
    // Helper method: Update player parcel tracking and mark aging buildings as dirty
    calculateRoadMaintenance() {
        // Calculate daily road maintenance costs
        // TODO: Later this will be covered by infrastructure budget from LVT
        if (!this.mobilityLayer || !this.mobilityLayer.roads) {
            return 0;
        }
        
        let totalMaintenance = 0;
        
        // Count roads by type
        const roadCounts = { local: 0, arterial: 0, highway: 0 };
        this.mobilityLayer.roads.forEach((road) => {
            roadCounts[road.type] = (roadCounts[road.type] || 0) + 1;
        });
        
        // Calculate maintenance costs based on road types
        if (this.mobilityLayer.roadTypes) {
            Object.entries(roadCounts).forEach(([type, count]) => {
                const roadType = this.mobilityLayer.roadTypes[type];
                if (roadType && roadType.maintenance) {
                    totalMaintenance += count * roadType.maintenance;
                }
            });
        }
        
        // Log if there's significant road maintenance
        if (totalMaintenance > 0) {
            console.log(`🛣️ Road maintenance: $${totalMaintenance}/day (${roadCounts.local} local, ${roadCounts.arterial} arterial, ${roadCounts.highway} highway)`);
        }
        
        return totalMaintenance;
    }
    
    updatePlayerParcelsAndAging() {
        this.economicCache.playerParcels.clear();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                if (this.isCurrentPlayer(parcel.owner)) {
                    const key = `${row}-${col}`;
                    this.economicCache.playerParcels.add(key);
                    
                    // Age buildings and mark as dirty (all buildings age daily)
                    // Only age locally if not connected to multiplayer server
                    if (parcel.building && (!this.multiplayerManager || !this.multiplayerManager.isConnected)) {
                        parcel.buildingAge++;
                        this.markBuildingEconomicsDirty(row, col);
                    } else if (parcel.building && this.multiplayerManager && this.multiplayerManager.isConnected) {
                        // Just mark as dirty for recalculation, aging is handled by server
                        this.markBuildingEconomicsDirty(row, col);
                    }
                }
            }
        }
    }
    
    // Helper method: Update economic cache for dirty buildings only
    updateEconomicCache() {
        this.economicCache.dirty.forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const parcel = this.grid[row][col];
            
            if (this.isCurrentPlayer(parcel.owner)) {
                const stats = this.calculateBuildingEconomics(parcel, row, col);
                this.economicCache.buildingStats.set(key, stats);
            } else {
                // Remove if no longer player-owned
                this.economicCache.buildingStats.delete(key);
            }
        });
        
        // Remove any cached buildings that are no longer player parcels
        this.economicCache.buildingStats.forEach((stats, key) => {
            if (!this.economicCache.playerParcels.has(key)) {
                this.economicCache.buildingStats.delete(key);
            }
        });
    }
    
    // Helper method: Calculate economics for a single building/parcel
    calculateBuildingEconomics(parcel, row, col) {
        // Delegate to the building system
        return this.buildingSystem.calculateBuildingEconomics(parcel, row, col);
    }
    
    // Helper method: Get localized livability scores around a building location
    getLivabilityScores(row, col) {
        const livabilityScores = {};
        const livabilityDomains = ['health', 'education', 'safety', 'culture', 'mobility', 'environment', 'affordability', 'resilience', 'noise'];
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
                            if (building && building.domainImpacts && building.domainImpacts[domain]) {
                                // Distance decay for impact (closer buildings have more effect)
                                const distance = Math.sqrt(dr*dr + dc*dc);
                                const distanceMultiplier = Math.max(0.1, 1 - distance / searchRadius);
                                totalImpact += building.domainImpacts[domain] * distanceMultiplier;
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
    
    // Helper method: Calculate demographic breakdown from total population
    calculateDemographics(totalPopulation) {
        // Use realistic demographic distributions (US-based approximations)
        const childrenPercent = 22; // Ages 0-17
        const adultsPercent = 60;   // Ages 18-64 (working age)
        const seniorsPercent = 18;  // Ages 65+
        
        const children = Math.round(totalPopulation * childrenPercent / 100);
        const adults = Math.round(totalPopulation * adultsPercent / 100);
        const seniors = totalPopulation - children - adults; // Ensure total adds up
        
        // Labor force is working age adults who are actually available to work (not all adults work)
        const laborForceParticipation = 0.75; // 75% of working age adults
        const laborForce = Math.round(adults * laborForceParticipation);
        
        return {
            children,
            adults,
            seniors,
            laborForce,
            childrenPercent,
            adultsPercent,
            seniorsPercent: Math.round(seniors / totalPopulation * 100)
        };
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
        this.cashflowBreakdown = [];
        
        this.economicCache.buildingStats.forEach(stats => {
            this.cashflowBreakdown.push({ ...stats }); // Clone stats for UI
        });
        
        // Add transit system financials if available
        if (this.transitFinancials && (this.transitFinancials.dailyRevenue > 0 || this.transitFinancials.dailyCosts > 0)) {
            this.cashflowBreakdown.push({
                building: 'Transit System',
                category: 'Transportation',
                count: this.transitFinancials.activeRoutes,
                revenue: this.transitFinancials.dailyRevenue,
                maintenance: this.transitFinancials.dailyCosts,
                lvt: 0,
                net: this.transitFinancials.dailyProfit,
                details: `${this.transitFinancials.activeRoutes} routes, ${this.transitFinancials.totalStops} stops`
            });
        }
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
        // Get the building category for public funding check
        const category = building?.category || 'housing';
        const availableFunds = this.governance.publicCoffers[category] || 0;
        const publicFunding = Math.min(availableFunds, fullCost);
        const playerCost = fullCost - publicFunding;
        
        return {
            fullCost,
            publicFunding,
            playerCost,
            availableFunds,
            category,
            fundingStatus: publicFunding >= fullCost ? 'full' : 
                          publicFunding > 0 ? 'partial' : 'none'
        };
    }

    calculateCurrentCashflow() {
        // Delegate to economic engine
        const cashflow = this.economicEngine.calculatePlayerCashflow();
        
        // Store breakdown for UI compatibility
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

    updatePlayerStats() {
        const population = this.calculatePopulation();
        const totalWealth = this.calculateTotalWealth();
        
        // Round cash and wealth to nearest dollar for display
        this.domCache.playerCash.textContent = `$${Math.round(this.playerCash).toLocaleString()}`;
        this.domCache.playerWealth.textContent = `$${Math.round(totalWealth).toLocaleString()}`;
        this.domCache.totalResidents.textContent = population.toLocaleString();
        
    }

    calculatePopulation() {
        let totalBedrooms = 0;
        let totalJobs = 0;
        let schoolCapacity = 0;
        let buildingCount = 0;
        
        // Get bedroom counts and jobs from ALL COMPLETED buildings (city-wide)
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                // Skip if no building (but count ALL owned buildings, not just current player's)
                if (!parcel || !parcel.building || !parcel.owner || parcel.owner === 'unclaimed') continue;
                
                buildingCount++;
                
                // Add bedroom and job counts for completed buildings
                const building = this.buildingManager.getBuildingById(parcel.building);
                if (building && building.population) {
                    totalBedrooms += building.population.bedroomsAdded || 0;
                    totalJobs += building.population.jobsCreated || 0;
                }
            }
        }
        
        const totalPopulation = Math.min(totalBedrooms, totalJobs); // Population limited by available housing AND jobs
        
        console.log(`👥 Population calculation: ${buildingCount} buildings, ${totalBedrooms} bedrooms, ${totalJobs} jobs → ${totalPopulation} residents`);
        return totalPopulation;
    }
    
    // Check for state drift between clients
    checkForStateDrift() {
        if (!this.multiplayerManager?.isConnected) return;
        
        const currentPop = this.calculatePopulation();
        const buildingCount = this.countAllBuildings();
        
        console.log(`🔍 State check: ${buildingCount} buildings, ${currentPop} residents`);
        
        // Force a sync request to server to compare state
        // This will trigger syncGameState if there are differences
    }
    
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
        // Delegate to economic engine
        return this.economicEngine.calculateTotalWealth();
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
        this.domCache.cityTreasury = this.uiManager.get('cityTreasury');
    }

    populateBuildingCategories() {
        // Delegate to building system
        this.buildingSystem.populateBuildingCategories();
    }

    startGameTime() {
        // CRITICAL: Only start client-side timer in solo mode
        // In multiplayer, time is server-authoritative via DAILY_UPDATE messages
        if (this.multiplayerManager && this.multiplayerManager.isConnected) {
            console.log('🔗 Multiplayer detected - server will control time advancement');
            return;
        }
        
        console.log('🕐 Starting solo game timer');
        setInterval(() => {
            this.currentDay++;
            this.lastDayStartTime = performance.now(); // Track when this day started
            this.updateGameDate();
            this.processDailyCashflow();
            this.updatePlayerStats();
            // Re-render to update building construction stages
            this.scheduleRender();
        }, this.dayLength);
    }
    
    showNotification(message, type = 'info') {
        // Create or get notification container
        let container = document.getElementById('notifications');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                max-width: 300px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }
        
        // Create notification element
        const notification = document.createElement('div');
        const colors = {
            'error': '#fee2e2 #dc2626',
            'success': '#dcfce7 #16a34a', 
            'info': '#dbeafe #2563eb'
        };
        const [bgColor, textColor] = colors[type]?.split(' ') || colors.info.split(' ');
        
        notification.style.cssText = `
            background-color: ${bgColor};
            color: ${textColor};
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: all 0.3s ease;
            pointer-events: auto;
            border-left: 4px solid ${textColor};
        `;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 4000);
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
    
    // Generate comprehensive player statistics
    generatePlayerStats() {
        const netWorth = this.calculatePlayerNetWorth();
        const population = this.calculatePopulation();
        const totalWealth = this.calculateTotalWealth();
        
        // Count player-owned parcels and buildings
        let ownedParcels = 0;
        let ownedBuildings = 0;
        let buildingsByCategory = {};
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && this.isCurrentPlayer(parcel.owner)) {
                    ownedParcels++;
                    if (parcel.building) {
                        ownedBuildings++;
                        const building = this.buildingManager?.getBuildingById(parcel.building);
                        if (building) {
                            const category = building.category || 'other';
                            buildingsByCategory[category] = (buildingsByCategory[category] || 0) + 1;
                        }
                    }
                }
            }
        }
        
        // Calculate current cashflow
        const cashflow = this.calculateCurrentCashflow();
        
        return {
            netWorth: {
                title: 'Net Worth',
                value: `$${netWorth.toLocaleString()}`,
                subtitle: 'Cash + Assets'
            },
            cash: {
                title: 'Current Cash',
                value: `$${Math.round(this.playerCash).toLocaleString()}`,
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
                subtitle: `Out of ${this.gridSize * this.gridSize} total`
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
                value: this.getPlayTimeString(),
                subtitle: 'Current session'
            },
            gameDate: {
                title: 'Game Date',
                value: `${this.gameDate.month} ${this.gameDate.day}`,
                subtitle: 'In-game calendar'
            }
        };
    }
    
    // Get formatted play time
    getPlayTimeString() {
        if (!this.gameStartTime) return '0m';
        
        const elapsed = Date.now() - this.gameStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
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
                governance: this.governance,
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
                    parcel.constructionStartDay !== null && 
                    parcel.constructionDays > 0) {
                    
                    // Check if construction is still in progress
                    const totalConstructionTimeMs = parcel.constructionDays * this.dayDuration;
                    const elapsedTimeMs = (this.currentDay - parcel.constructionStartDay) * this.dayDuration + 
                                          (performance.now() - (this.lastDayStartTime || Date.now()));
                    
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
        // Update time-based tooltips every second
        this.liveTooltipInterval = setInterval(() => {
            this.updateLiveTooltips();
        }, 1000); // Update every second for live time display
    }
    
    // Update any visible tooltips that contain time information
    updateLiveTooltips() {
        // Check if tooltip manager exists and a tooltip is currently visible
        if (this.tooltipManager && this.tooltipManager.isVisible) {
            // Check if the current tooltip content contains "Time Left in Month"
            const tooltipElement = this.tooltipManager.tooltipElement;
            if (tooltipElement && tooltipElement.innerHTML && 
                tooltipElement.innerHTML.includes('Time Left in Month')) {
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
        }
    }

    calculatePopulation() {
        let totalBedrooms = 0;
        let totalJobs = 0;
        let schoolCapacity = 0;
        
        // Get bedroom counts and jobs from ALL COMPLETED buildings (city-wide)
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                // Check if building is completed (not under construction)
                const isUnderConstruction = parcel.constructionStartDay !== null && 
                    parcel.constructionDays > 0 && 
                    (this.currentDay - parcel.constructionStartDay) < parcel.constructionDays;
                
                // Count ALL owned buildings in the city, not just current player's
                if (parcel.owner && parcel.owner !== 'unclaimed' && parcel.building && !isUnderConstruction) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.population) {
                        totalBedrooms += building.population.bedroomsAdded || 0;
                        totalJobs += building.population.jobsCreated || 0;
                    }
                    
                    // Count school capacity
                    if (building && building.category === 'education') {
                        // Elementary: 200 students, High School: 400, University: 600
                        if (building.id === 'elementary_school') schoolCapacity += 200;
                        else if (building.id === 'high_school') schoolCapacity += 400;
                        else if (building.id === 'university') schoolCapacity += 600;
                    }
                }
            }
        }
        
        // Calculate detailed population demographics (STANDARDIZED: 2 people per bedroom)
        const totalPopulation = totalBedrooms * 2; // Standardized ratio
        
        console.log(`🔍 Population calculation: ${totalBedrooms} bedrooms × 2 = ${totalPopulation} population`);
        const adults = Math.floor(totalBedrooms * 1.5);  // ~1.5 adults per bedroom
        const children = Math.floor(totalBedrooms * 0.7); // ~0.7 children per bedroom
        const workingAge = Math.floor(adults * 0.8);     // 80% of adults are working age
        const schoolAge = Math.floor(children * 0.9);    // 90% of children need school
        
        // Store detailed demographics for use elsewhere
        this.demographics = {
            total: totalPopulation,
            adults,
            children,
            workingAge,
            schoolAge,
            totalJobs,
            schoolCapacity,
            employmentRate: workingAge > 0 ? (totalJobs / workingAge) : 0,
            schoolEnrollmentRate: schoolAge > 0 ? (schoolCapacity / schoolAge) : 1
        };
        
        return totalPopulation;
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

    calculateTotalWealth() {
        // Delegate to economic engine
        return this.economicEngine.calculateTotalWealth();
    }

    getBuildingValue(buildingId) {
        return this.buildingManager.getBuildingCost(buildingId);
    }

    updatePlayerStats() {
        const population = this.calculatePopulation();
        const totalWealth = this.calculateTotalWealth();
        
        // Round cash and wealth to nearest dollar for display
        this.domCache.playerCash.textContent = `$${Math.round(this.playerCash).toLocaleString()}`;
        this.domCache.playerWealth.textContent = `$${Math.round(totalWealth).toLocaleString()}`;
        
        // Update cashflow with proper formatting and color coding
        
        if (this.domCache.playerCashflow && this.dailyCashflowTotals) {
            const netCashflow = this.dailyCashflowTotals.netCashflow;
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
        
        // Calculate demographics breakdown
        const demographics = this.calculateDemographics(population);
        
        // Update residents count with demographic tooltip
        if (this.domCache.totalResidents) {
            this.domCache.totalResidents.textContent = population.toLocaleString();
            const residentsRow = document.getElementById('residents-row');
            if (residentsRow) {
                residentsRow.setAttribute('data-tooltip', 
                    `<strong>Population Breakdown</strong><br><br>` +
                    `<strong>Children:</strong> ${demographics.children.toLocaleString()}<br>` +
                    `<strong>Adults:</strong> ${demographics.adults.toLocaleString()}<br>` +
                    `<strong>Seniors:</strong> ${demographics.seniors.toLocaleString()}<br><br>` +
                    `<strong>Available Workers:</strong> ${demographics.laborForce.toLocaleString()}`);
            }
        }
        
        // Calculate total city treasury (sum of all public coffers + unallocated funds)
        let totalTreasury = 0;
        if (this.governance && this.governance.publicCoffers) {
            Object.values(this.governance.publicCoffers).forEach(amount => {
                totalTreasury += amount || 0;
            });
            // Include unallocated funds in treasury total
            totalTreasury += this.governance.unallocatedFunds || 0;
        }
        
        // Update city treasury display with detailed breakdown
        if (this.domCache.cityTreasury) {
            this.domCache.cityTreasury.textContent = `$${Math.round(totalTreasury).toLocaleString()}`;
            
            // Create detailed treasury breakdown for tooltip
            const allocatedFunds = totalTreasury - (this.governance.unallocatedFunds || 0);
            const unallocatedAmount = this.governance.unallocatedFunds || 0;
            
            const treasuryRow = document.getElementById('treasury-row');
            if (treasuryRow) {
                treasuryRow.setAttribute('data-tooltip', 
                    `<strong>City Treasury Breakdown</strong><br><br>` +
                    `💰 Total: $${Math.round(totalTreasury).toLocaleString()}<br>` +
                    `📂 Allocated to Budgets: $${Math.round(allocatedFunds).toLocaleString()}<br>` +
                    `🏛️ Unassigned Funds: $${Math.round(unallocatedAmount).toLocaleString()}<br><br>` +
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
        // Remove any existing overlay
        const existingOverlay = document.getElementById('data-insights-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        const stats = this.calculateBuildingEconomics(parcel, row, col);
        const coord = this.getParcelCoordinate(row, col);
        
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
            const satisfaction = this.citySatisfaction?.overall || 0.5;
            const satisfactionMultiplier = 0.5 + satisfaction * 0.7;
            const efficiencyPenalty = this.buildingEfficiencyPenalty || 1.0;
            const growthModifier = this.populationGrowthModifier || 1.0;
            
            // Transport connectivity
            let transportMultiplier = 1.0;
            let transportType = '';
            if (this.buildingCategories.isEnergyProducer(building)) {
                const hasRoadConnectivity = this.checkRoadConnectivity(row, col);
                transportMultiplier = hasRoadConnectivity ? 1.0 : 0.2;
                transportType = 'Road Connectivity';
            } else if (this.buildingCategories.needsTransportAccess(building)) {
                const accessiblePop = this.calculateAccessiblePopulation(row, col);
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
                            <span class="value">${Math.round((this.supplyDemandEffects?.businessEfficiency || 1.0) * 100)}%</span>
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
        const age = parcel.buildingAge || 0;
        const decayPercent = Math.round((parcel.decay || 0) * 100);
        const repairCost = this.calculateRepairCost(parcel, building);
        
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
    
    generateTooltipContent(row, col) {
        const parcel = this.grid[row][col];
        const coord = this.getParcelCoordinate(row, col);
        
        if (parcel.building) {
            const building = this.buildingManager.getBuildingById(parcel.building);
            if (building) {
                let content = `<strong>${building.name}</strong> (${coord})<br>`;
                
                // Ownership
                if (this.isCurrentPlayer(parcel.owner)) {
                    content += '👤 <span style="color: #4CAF50">Owned by You</span><br>';
                } else if (parcel.owner && parcel.owner !== 'unclaimed') {
                    // Competitor-owned building
                    let ownerName = parcel.owner;
                    if (this.competitorNames && this.competitorNames[parcel.owner]) {
                        ownerName = this.competitorNames[parcel.owner];
                    }
                    content += `🏛️ <span style="color: #9E9E9E">Owned by ${ownerName}</span><br>`;
                } else {
                    content += '🏛️ <span style="color: #9E9E9E">City Owned</span><br>';
                }
                
                // Show construction progress if building is under construction
                const isUnderConstruction = parcel._isUnderConstruction || 
                    (parcel.constructionStartDay !== null && parcel.constructionDays > 0 &&
                     (this.gameDate.day - parcel.constructionStartDay) < parcel.constructionDays);
                
                if (isUnderConstruction) {
                    let progressPercent = 0;
                    
                    // Use cached progress if available, otherwise calculate
                    if (parcel._constructionProgress !== undefined) {
                        progressPercent = Math.round(parcel._constructionProgress * 100);
                    } else if (parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
                        const daysPassed = this.gameDate.day - parcel.constructionStartDay;
                        const progress = Math.max(0, Math.min(1.0, daysPassed / parcel.constructionDays));
                        progressPercent = Math.round(progress * 100);
                    }
                    
                    const progressColor = progressPercent < 25 ? '#F44336' : 
                                         progressPercent < 50 ? '#FF9800' :
                                         progressPercent < 75 ? '#FFC107' : '#4CAF50';
                    
                    // Calculate estimated completion time
                    let timeRemaining = '';
                    if (parcel.constructionDays > 0) {
                        const daysRemaining = Math.max(0, parcel.constructionDays - (this.gameDate.day - parcel.constructionStartDay));
                        if (daysRemaining > 0) {
                            timeRemaining = ` (${Math.ceil(daysRemaining)} day${daysRemaining === 1 ? '' : 's'} remaining)`;
                        } else {
                            timeRemaining = ' (completing soon...)';
                        }
                    }
                    
                    content += `🚧 <span style="color: ${progressColor}; font-weight: bold;">Construction: ${progressPercent}% Complete</span>${timeRemaining}<br>`;
                    
                    // Add helpful message about what happens when construction completes
                    if (progressPercent < 100) {
                        content += '<span style="color: #888; font-size: 0.9em; font-style: italic;">Building efficiency will be assessed once construction is complete.</span><br>';
                    }
                }
                
                // Calculate and show efficiency percentage for buildings with needs (only for completed buildings)
                const efficiencyInfo = !isUnderConstruction ? this.economicEngine.calculateBuildingEfficiencyPercentage(row, col) : null;
                if (efficiencyInfo) {
                    const effColor = efficiencyInfo.percentage >= 80 ? '#4CAF50' : 
                                    efficiencyInfo.percentage >= 60 ? '#FFC107' :
                                    efficiencyInfo.percentage >= 40 ? '#FF9800' : '#F44336';
                    content += `⚙️ <span style="color: ${effColor}">Efficiency: ${Math.round(efficiencyInfo.percentage)}%</span><br>`;
                    
                    // Show detailed JEFH needs for full transparency
                    if (efficiencyInfo.allNeeds && efficiencyInfo.allNeeds.length > 0) {
                        content += '<br><strong>Resource Status:</strong><br>';
                        efficiencyInfo.allNeeds.forEach(need => {
                            const percentage = Math.round(need.satisfaction * 100);
                            const statusIcon = percentage >= 80 ? '✅' : percentage >= 50 ? '⚠️' : '❌';
                            const color = percentage >= 80 ? '#4CAF50' : percentage >= 50 ? '#FFC107' : '#F44336';
                            content += `${statusIcon} <span style="color: ${color}">${need.name}: ${percentage}%</span><br>`;
                        });
                    } else if (efficiencyInfo.unsatisfiedNeeds.length > 0) {
                        content += '<span style="color: #FF9800; font-size: 0.9em;">⚠️ Needs: ';
                        content += efficiencyInfo.unsatisfiedNeeds.map(need => 
                            `${need.name} (${Math.round(need.satisfaction * 100)}%)`
                        ).join(', ');
                        content += '</span><br>';
                    }
                }
                
                // Show performance score and economics for completed buildings only (full transparency)
                if (!isUnderConstruction && parcel.owner && parcel.owner !== 'unclaimed') {
                    // Calculate overall performance score (0-100)
                    let performanceScore = 100;
                    const improvements = [];
                    
                    // Factor in decay
                    const decay = parcel.decay || 0;
                    if (decay > 0.05) {
                        performanceScore -= Math.round(decay * 100);
                        if (decay > 0.3) {
                            improvements.push('Repair building');
                        } else if (decay > 0.15) {
                            improvements.push('Repair soon');
                        }
                    }
                    
                    // Factor in transport connectivity
                    let transportMultiplier = 1.0;
                    if (building.economics?.maxRevenue > 0) {
                        if (this.buildingCategories.isEnergyProducer(building)) {
                            const hasRoadConnectivity = this.checkRoadConnectivity(row, col);
                            transportMultiplier = hasRoadConnectivity ? 1.0 : 0.2;
                        } else if (this.buildingCategories.needsTransportAccess(building)) {
                            const accessiblePop = this.calculateAccessiblePopulation(row, col);
                            const optimalPop = building.jobs ? building.jobs * 10 : 100;
                            transportMultiplier = Math.max(0.1, Math.min(1.0, accessiblePop / optimalPop));
                        }
                        
                        if (transportMultiplier < 0.95) {
                            performanceScore -= Math.round((1 - transportMultiplier) * 30);
                            if (transportMultiplier < 0.5) {
                                improvements.push('Build roads');
                            } else {
                                improvements.push('Better transit');
                            }
                        }
                    }
                    
                    // Factor in city satisfaction
                    const satisfaction = this.citySatisfaction?.overall || 0.5;
                    const satisfactionMultiplier = 0.5 + satisfaction * 0.7;
                    if (satisfactionMultiplier < 0.9) {
                        performanceScore -= Math.round((1 - satisfactionMultiplier) * 20);
                        improvements.push('Improve city services');
                    }
                    
                    // Factor in market conditions and supply/demand effects
                    let marketImpact = 1.0;
                    if (this.supplyDemandEffects) {
                        // Apply same logic as revenue calculation
                        if (this.buildingCategories.isEnergyProducer(building)) {
                            marketImpact *= this.supplyDemandEffects.energyMultiplier;
                            if (this.supplyDemandEffects.energyMultiplier < 0.4) {
                                improvements.push('Energy oversupply - reduce power plants');
                                performanceScore -= 40;
                            } else if (this.supplyDemandEffects.energyMultiplier < 0.7) {
                                improvements.push('Too much energy production');
                                performanceScore -= 20;
                            }
                        }
                        
                        marketImpact *= this.supplyDemandEffects.businessEfficiency;
                        if (this.supplyDemandEffects.businessEfficiency < 0.9) {
                            performanceScore -= Math.round((1 - this.supplyDemandEffects.businessEfficiency) * 15);
                            if (this.supplyDemandEffects.businessEfficiency < 0.7) {
                                improvements.push('Poor business conditions');
                            }
                        }
                    }
                    
                    // Ensure score stays within bounds
                    performanceScore = Math.max(0, Math.min(100, performanceScore));
                    
                    // Show performance score with color coding
                    const scoreColor = performanceScore >= 80 ? '#4CAF50' : performanceScore >= 60 ? '#ff9800' : '#f44336';
                    content += `<br><strong>Performance: <span style="color: ${scoreColor}">${performanceScore}/100</span></strong><br>`;
                    
                    // Show top improvement suggestions
                    if (improvements.length > 0) {
                        content += `<br><strong>To improve:</strong> ${improvements.slice(0, 2).join(', ')}<br>`;
                    }
                } else {
                    // City-owned building - simpler display
                    if (building.economics?.maxRevenue > 0) {
                        content += `💰 Max Revenue: $${building.economics.maxRevenue}/day<br>`;
                    }
                    if (building.economics?.maintenanceCost > 0) {
                        content += `🔧 Maintenance: $${building.economics.maintenanceCost}/day<br>`;
                    }
                }
                
                // Building needs info - make it friendlier
                if (building.resources || building.population) {
                    content += '<br><strong>💡 What it does:</strong><br>';
                    const info = [];
                    
                    // What it provides first (positive framing)
                    if (building.population?.jobsCreated > 0) {
                        const jobs = building.population.jobsCreated;
                        if (jobs === 1) {
                            info.push(`💼 Creates 1 job for the community`);
                        } else {
                            info.push(`💼 Creates ${jobs} jobs for the community`);
                        }
                    }
                    if (building.resources?.energyProduction > 0) {
                        info.push(`⚡ Generates power for the city`);
                    }
                    if (building.resources?.foodProduction > 0) {
                        info.push(`🍎 Produces food for residents`);
                    }
                    if (building.population?.bedroomsAdded > 0) {
                        const homes = building.population.bedroomsAdded;
                        if (homes === 1) {
                            info.push(`🏠 Houses 1 person`);
                        } else {
                            info.push(`🏠 Houses ${homes} people`);
                        }
                    }
                    
                    // What it needs (framed as requirements, not problems)
                    if (building.resources?.energyDemand > 0) {
                        info.push(`⚡ Needs electricity to operate`);
                    }
                    if (building.resources?.foodDemand > 0) {
                        info.push(`🍎 Residents need food deliveries`);
                    }
                    if (building.population?.populationRequired > 0) {
                        const workers = building.population.populationRequired;
                        if (workers === 1) {
                            info.push(`👥 Needs 1 worker to run`);
                        } else {
                            info.push(`👥 Needs ${workers} workers to run`);
                        }
                    }
                    
                    if (info.length > 0) {
                        content += info.join('<br>') + '<br>';
                    }
                }
                
                // Building category info
                content += `<br><span style="color: #9E9E9E">Category: ${building.category}</span>`;
                
                return content;
            } else {
                // Building ID exists but building not found in manager - this is the bug!
                console.warn(`🚨 TOOLTIP BUG: Building ID "${parcel.building}" exists but not found in buildingManager!`);
                console.log(`🔍 BuildingManager state:`, {
                    hasManager: !!this.buildingManager,
                    categoriesCount: this.buildingManager?.getCategories?.()?.length,
                    sampleBuildings: this.buildingManager?.buildings ? Object.keys(this.buildingManager.buildings).slice(0, 5) : 'no buildings'
                });
                
                // Show a temporary debug tooltip instead of falling through to empty land
                return `<strong>🚨 DEBUG: Missing Building</strong> (${coord})<br>Building ID: ${parcel.building}<br>Owner: ${parcel.owner}<br><em>Building definition not found</em>`;
            }
        } else {
            // Empty parcel - check ownership
            const price = this.getParcelPrice(row, col);
            const landValue = parcel.landValue?.calculatedValue || price;
            
            // Check ownership more robustly
            const isPlayerOwned = this.isCurrentPlayer(parcel.owner) || 
                                 (this.multiplayerManager && parcel.owner === this.multiplayerManager.playerId) ||
                                 (parcel.owner === 'player'); // Fallback for legacy mode
                                 
            if (isPlayerOwned) {
                // Player-owned empty land
                let content = `<strong>Your Land</strong> (${coord})<br>`;
                content += '👤 <span style="color: #4CAF50">Owned by You</span><br>';
                content += `📈 Land Value: $${landValue}<br>`;
                content += '<br><em>Click to manage</em>';
                return content;
            } else if (parcel.owner && parcel.owner !== 'unclaimed') {
                // Competitor-owned empty land
                let ownerName = parcel.owner;
                if (this.competitorNames && this.competitorNames[parcel.owner]) {
                    ownerName = this.competitorNames[parcel.owner];
                }
                let content = `<strong>Empty Land</strong> (${coord})<br>`;
                content += `🏛️ <span style="color: #9E9E9E">Owned by ${ownerName}</span><br>`;
                content += `📈 Land Value: $${landValue}<br>`;
                return content;
            } else {
                // Unowned empty land
                let content = `<strong>Empty Land</strong> (${coord})<br>`;
                content += `💰 Purchase Price: $${price}<br>`;
                return content;
            }
        }
        
        return null;
    }
    
    showTooltip(row, col, mouseX, mouseY) {
        // Don't show tooltip if context menu is open
        if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
            return;
        }
        
        // Use unified tooltip manager for detailed display
        if (this.tooltipManager && this.tooltipManager.tooltipElement) {
            const content = this.generateTooltipContent(row, col);
            if (content) {
                const parcel = this.grid[row][col];
                // Include building ID and construction state in cache key to prevent stale data
                const buildingId = parcel.building || 'empty';
                const constructionState = parcel._isUnderConstruction ? `_constructing_${Math.round((parcel._constructionProgress || 0) * 100)}` : '';
                const ownerState = parcel.owner || 'unowned';
                const cacheKey = `grid_${row}_${col}_${buildingId}_${ownerState}_${parcel.buildingAge || 0}_${Math.round((parcel.decay || 0) * 100)}${constructionState}`;
                
                // Ensure content is properly formatted for HTML display
                const cleanContent = content.replace(/\\n/g, '<br>');
                
                this.tooltipManager.show(cleanContent, mouseX, mouseY, {
                    html: true,
                    maxWidth: 350,
                    priority: 1,
                    cacheKey: cacheKey,
                    delay: 0,
                    animationSpeed: 'fast'
                });
            }
            return;
        }
    }
    
    hideTooltip() {
        if (this.tooltipManager && this.tooltipManager.tooltipElement) {
            this.tooltipManager.hide();
        }
    }
    
    showMobilityTooltip(row, col, mouseX, mouseY) {
        // Don't show tooltip if context menu is open
        if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
            return;
        }
        
        if (!this.tooltipManager) {
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
        this.hideTooltip();
        
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
    
    // Legacy road drawing functions removed - now using TransportationSystem
    
    showContextMenu(row, col, mouseX, mouseY) {
        console.log('🎯 showContextMenu called:', { row, col, mouseX, mouseY });
        
        // Early return if context menu element doesn't exist or doesn't have querySelector
        if (!this.contextMenu || typeof this.contextMenu.querySelector !== 'function') {
            console.error('❌ Context menu element not found or invalid');
            return;
        }
        
        console.log('✅ Context menu element exists');
        
        // Set the selected tile and calculate reach
        this.selectedTile = { row, col };
        this.selectedParcel = { row, col };
        this.parcelReach = this.calculateParcelReach(row, col);
        this.scheduleRender(); // Redraw to show reach visualization
        this.hoveredTile = { row, col };
        this.updateParcelIllumination(this.hoveredTile);
        
        // Update the selected tile display
        const coord = this.getParcelCoordinate(row, col);
        if (this.domCache.selectedTile) {
            this.domCache.selectedTile.textContent = coord;
        }
        
        const parcel = this.grid[row][col];
        const price = this.getParcelPrice(row, col);
        
        const coordEl = this.contextMenu.querySelector('.context-coord');
        if (coordEl) coordEl.textContent = coord;
        
        const statusEl = this.contextMenu.querySelector('.context-status');
        const contentEl = this.contextMenu.querySelector('.context-content');
        
        if (!statusEl || !contentEl) {
            console.error('Context menu elements not found');
            return;
        }
        
        // Clear previous content
        contentEl.innerHTML = '';
        statusEl.className = 'context-status';
        
        if (!parcel.owner) {
            // Unowned parcel
            statusEl.textContent = 'UNOWNED';
            statusEl.classList.add('unowned');
            
            const buyBtn = document.createElement('button');
            buyBtn.className = 'context-btn primary';
            buyBtn.textContent = `BUY PARCEL - $${price}`;
            buyBtn.onclick = () => this.buildingSystem.purchaseParcel(row, col);
            contentEl.appendChild(buyBtn);
            
        } else if (this.isCurrentPlayer(parcel.owner)) {
            // Player-owned parcel
            const playerName = (this.playerSettings && this.playerSettings.name) || 'PLAYER';
            statusEl.textContent = `OWNED BY ${playerName.toUpperCase()}`;
            statusEl.classList.add('owned');
            
            console.log('✅ Recognized as current player parcel');
            
            if (!parcel.building) {
                // Empty parcel - show auction and building categories
                this.createEmptyParcelMenu(contentEl, row, col);
            } else {
                // Built parcel - show auction, destroy, upgrade, and amenity options
                this.createBuiltParcelMenu(contentEl, row, col, parcel);
            }
            
        } else {
            // Competitor-owned parcel
            let ownerName = parcel.owner.toUpperCase();
            
            // Check for competitor names
            if (this.competitorNames[parcel.owner]) {
                ownerName = this.competitorNames[parcel.owner].toUpperCase();
            }
            
            statusEl.textContent = `OWNED BY ${ownerName}`;
            statusEl.classList.add('competitor');
            
            // Show what building they have if any
            if (parcel.building) {
                const buildingInfo = document.createElement('div');
                buildingInfo.className = 'building-info';
                buildingInfo.style.marginBottom = '10px';
                buildingInfo.style.fontSize = '12px';
                buildingInfo.style.color = '#ccc';
                buildingInfo.textContent = `Building: ${parcel.building}`;
                contentEl.appendChild(buildingInfo);
            }
            
            const auctionBtn = document.createElement('button');
            auctionBtn.className = 'context-btn primary';
            auctionBtn.textContent = 'START AUCTION';
            auctionBtn.onclick = () => this.startAuction(row, col);
            contentEl.appendChild(auctionBtn);
        }
        
        // Position the context menu to match tooltip position exactly  
        // Note: mouseX, mouseY here are page coordinates from e.clientX, e.clientY
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.style.left = `${mouseX + 30}px`;
            this.contextMenu.style.top = `${mouseY - 80}px`;
            this.contextMenu.classList.add('visible');
        }
    }
    
    hideContextMenu() {
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.classList.remove('visible');
        }
        
        // Clear selection and reach visualization when context menu closes
        this.selectedTile = null;
        this.hoveredTile = null;
        this.selectedParcel = null;
        this.parcelReach = null;
        this.scheduleRender(); // Redraw to remove reach visualization
        if (this.domCache.selectedTile) {
            this.domCache.selectedTile.textContent = '--';
        }
        this.updateParcelIllumination(null);
        this.scheduleRender();
    }
    
    // Legacy road design functions removed - functionality moved to TransportationSystem
    
    generateTransitStopId() {
        // Generate a simple incrementing ID
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // Legacy transit system functions removed - will be redesigned from scratch
    
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
        const cellSize = 400 / this.gridSize;
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, 400, 400);
        
        // Draw grid
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        
        for (let i = 0; i <= this.gridSize; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, 400);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(400, i * cellSize);
            ctx.stroke();
        }
        
        // Draw parcels and stops/entrances
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                const x = col * cellSize;
                const y = row * cellSize;
                
                // Draw parcel ownership
                if (this.isCurrentPlayer(parcel.owner)) {
                    // Use player's selected color for minimap
                    if (this.playerSettings && this.playerSettings.color) {
                        const hex = this.playerSettings.color.replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16);
                        const g = parseInt(hex.substr(2, 2), 16);
                        const b = parseInt(hex.substr(4, 2), 16);
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
                    } else {
                        ctx.fillStyle = 'rgba(0, 102, 204, 0.2)';
                    }
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (parcel.owner && parcel.owner !== 'none') {
                    ctx.fillStyle = 'rgba(204, 102, 0, 0.2)';
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
                
                // Check for bus stops or subway entrances
                const hasStop = this.hasTransitStop(row, col, type);
                if (hasStop) {
                    const centerX = x + cellSize / 2;
                    const centerY = y + cellSize / 2;
                    
                    if (type === 'bus') {
                        // Draw bus stop
                        ctx.fillStyle = '#ffcc00';
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    } else if (type === 'subway') {
                        // Draw subway entrance
                        ctx.fillStyle = '#ff0000';
                        ctx.fillRect(centerX - 4, centerY - 4, 8, 8);
                        
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(centerX - 4, centerY - 4, 8, 8);
                    }
                }
            }
        }
        
        // Draw existing routes
        if (type === 'bus') {
            this.drawExistingBusRoutes(ctx, cellSize);
        } else if (type === 'subway') {
            this.drawExistingSubwayLines(ctx, cellSize);
        }
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
    
    
    
    // Legacy transportation functions removed - will be redesigned from scratch
    
    // Governance System Methods
    showGovernanceModal() {
        // Delegate to governance system
        this.governanceSystem.openGovernanceModal();
    }
    
    hideGovernanceModal() {
        // Delegate to governance system
        this.governanceSystem.closeGovernanceModal();
    }
    
    updateGovernanceUI() {
        // Update voting points (using new unified system)
        const playerAllocations = this.governance.playerAllocations || {};
        let usedPoints = 0;
        
        // Update budget categories
        this.governance.budgetCategories.forEach(category => {
            const categoryEl = document.querySelector(`[data-category="${category}"]`);
            if (categoryEl) {
                const voteCount = playerAllocations[category] || 0;
                usedPoints += voteCount;
                
                const voteCountEl = categoryEl.querySelector('.vote-count');
                if (voteCountEl) {
                    voteCountEl.textContent = voteCount;
                }
                
                const allocationEl = categoryEl.querySelector('.category-allocation');
                if (allocationEl) {
                    const allocation = (this.governance.categoryAllocations && this.governance.categoryAllocations[category]) || 0;
                    allocationEl.textContent = `${(allocation * 100).toFixed(1)}%`;
                }
                
                // Update coffers display with null safety
                const coffersEl = categoryEl.querySelector('.category-coffers span');
                if (coffersEl) {
                    if (category === 'ubi') {
                        const ubiAmount = (this.governance.publicCoffers && this.governance.publicCoffers[category]) || 0;
                        const ubiPerCitizen = ubiAmount / Math.max(1, this.calculatePopulation());
                        coffersEl.textContent = ubiPerCitizen.toFixed(2);
                    } else {
                        const cofferAmount = (this.governance.publicCoffers && this.governance.publicCoffers[category]) || 0;
                        coffersEl.textContent = cofferAmount.toLocaleString();
                    }
                }
            }
        });
        
        // Add LVT points to total used points
        usedPoints += Math.abs(this.governance.lvtPointsAllocated);
        
        // Update LVT rate info - with null checks
        const currentLvtRateEl = document.getElementById('current-lvt-rate');
        if (currentLvtRateEl) {
            currentLvtRateEl.textContent = `${(this.governance.currentLvtRate * 100).toFixed(0)}%`;
        }
        
        const currentLvtDisplayEl = document.getElementById('current-lvt-display');
        if (currentLvtDisplayEl) {
            currentLvtDisplayEl.textContent = `${(this.governance.currentLvtRate * 100).toFixed(0)}%`;
        }
        
        const proposedLvtRateEl = document.getElementById('proposed-lvt-rate');
        if (proposedLvtRateEl) {
            proposedLvtRateEl.textContent = `${(this.governance.proposedLvtRate * 100).toFixed(0)}%`;
        }
        
        // Update LVT point allocation (old system - keeping for compatibility)
        const lvtVotePointsElOld = document.getElementById('lvt-vote-points-old');
        if (lvtVotePointsElOld) {
            lvtVotePointsElOld.textContent = this.governance.lvtPointsAllocated;
        }
        
        // Update monthly collection
        const monthlyLvtAmountEl = document.getElementById('monthly-lvt-amount');
        if (monthlyLvtAmountEl) {
            monthlyLvtAmountEl.textContent = this.governance.monthlyLvtCollected.toLocaleString();
        }
        
        // Update unallocated funds display
        const unallocatedFundsAmountEl = document.getElementById('unallocated-funds-amount');
        if (unallocatedFundsAmountEl) {
            unallocatedFundsAmountEl.textContent = (this.governance.unallocatedFunds || 0).toLocaleString();
        }
        
        // Update vote summary with new unified system
        const pointsUsedEl = document.getElementById('points-used');
        const totalAllocated = this.getTotalAllocatedPoints();
        if (pointsUsedEl) {
            pointsUsedEl.textContent = totalAllocated;
        }
        
        const pointsAvailableEl = document.getElementById('points-available');
        if (pointsAvailableEl) {
            pointsAvailableEl.textContent = this.governance.totalVotingPoints;
        }
        
        const playerVotingPointsEl = document.getElementById('player-voting-points');
        if (playerVotingPointsEl) {
            playerVotingPointsEl.textContent = this.getUnallocatedPoints();
        }
        
        // Update LVT display
        const lvtVotePointsEl = document.getElementById('lvt-vote-points');
        if (lvtVotePointsEl) {
            lvtVotePointsEl.textContent = this.governance.playerAllocations.lvtRate || 0;
        }
    }
    
    allocateVoteToCategory(category, change) {
        // Use multiplayer system for governance voting
        if (this.multiplayerManager && this.multiplayerManager.isConnected) {
            this.multiplayerManager.broadcastAction({
                type: 'ALLOCATE_VOTE',
                category: category,
                change: change
            });
        } else {
            // Fallback to local governance for offline mode
            const currentAllocation = this.governance.playerAllocations[category] || 0;
            const newAllocation = Math.max(0, currentAllocation + change);
            
            // Calculate total points that would be used after this change
            const totalUsedPoints = this.getTotalAllocatedPoints() - currentAllocation + newAllocation;
            
            // Check if player has enough points
            if (totalUsedPoints > this.governance.totalVotingPoints) {
                console.log(`Not enough points: ${totalUsedPoints} > ${this.governance.totalVotingPoints}`);
                return false;
            }
            
            this.governance.playerAllocations[category] = newAllocation;
            this.calculateBudgetAllocations();
            this.updateGovernanceUI();
        }
        return true;
    }
    
    allocateLVTPoint(change) {
        // Use multiplayer system for LVT voting
        if (this.multiplayerManager && this.multiplayerManager.isConnected) {
            this.multiplayerManager.broadcastAction({
                type: 'ALLOCATE_LVT_POINT',
                change: change
            });
        } else {
            // Fallback to local governance for offline mode
            const currentAllocation = this.governance.playerAllocations.lvtRate || 0;
            const newAllocation = currentAllocation + change; // Can be negative
            
            // Calculate total points that would be used after this change
            const totalUsedPoints = this.getTotalAllocatedPoints() - Math.abs(currentAllocation) + Math.abs(newAllocation);
            
            // Check if player has enough points
            if (totalUsedPoints > this.governance.totalVotingPoints) {
                console.log(`Not enough points: ${totalUsedPoints} > ${this.governance.totalVotingPoints}`);
                return false;
            }
            
            this.governance.playerAllocations.lvtRate = newAllocation;
            
            // Calculate new rate based on base rate + point allocations
            this.governance.proposedLvtRate = Math.max(0, Math.min(1, this.governance.baseLvtRate + (newAllocation * 0.01)));
            
            // Apply changes immediately for real-time feedback
            this.governance.currentLvtRate = this.governance.proposedLvtRate;
            
            this.updateGovernanceUI();
            
            console.log('LVT point allocated successfully:', {
                change,
                newAllocation,
                proposedRate: this.governance.proposedLvtRate
            });
        }
        return true;
    }

    getTotalAllocatedPoints() {
        // Sum all allocated points (budget categories + absolute value of LVT)
        const budgetPoints = this.governance.budgetCategories.reduce((sum, category) => {
            return sum + (this.governance.playerAllocations[category] || 0);
        }, 0);
        
        const lvtPoints = Math.abs(this.governance.playerAllocations.lvtRate || 0);
        
        return budgetPoints + lvtPoints;
    }
    
    getUnallocatedPoints() {
        return this.governance.totalVotingPoints - this.getTotalAllocatedPoints();
    }
    
    calculateBudgetAllocations() {
        // Calculate total votes for each category across all players
        const totalVotes = {};
        this.governance.budgetCategories.forEach(category => {
            totalVotes[category] = 0;
        });
        
        // Sum up player allocations (using new unified governance structure)
        if (this.governance.playerAllocations) {
            this.governance.budgetCategories.forEach(category => {
                totalVotes[category] = this.governance.playerAllocations[category] || 0;
            });
        }
        
        // Calculate total votes across all categories
        const grandTotal = Object.values(totalVotes).reduce((sum, votes) => sum + votes, 0);
        
        // Calculate percentages
        this.governance.budgetCategories.forEach(category => {
            this.governance.categoryAllocations[category] = grandTotal > 0 ? 
                totalVotes[category] / grandTotal : 0;
        });
    }
    
    voteLVTRate(direction) {
        // Reset previous votes for this player (assuming single player for now)
        this.governance.lvtRateVotes.decrease = 0;
        this.governance.lvtRateVotes.maintain = 0;
        this.governance.lvtRateVotes.increase = 0;
        
        // Apply new vote
        this.governance.lvtRateVotes[direction] = 1;
        
        // Calculate proposed rate based on votes
        if (direction === 'increase') {
            this.governance.proposedLvtRate = Math.min(1.0, this.governance.currentLvtRate + 0.05);
        } else if (direction === 'decrease') {
            this.governance.proposedLvtRate = Math.max(0.0, this.governance.currentLvtRate - 0.05);
        } else {
            this.governance.proposedLvtRate = this.governance.currentLvtRate;
        }
        
        this.updateGovernanceUI();
    }
    
    applyGovernanceChanges() {
        // Distribute unallocated funds according to new allocations
        if (this.governance.unallocatedFunds > 0) {
            this.governance.budgetCategories.forEach(category => {
                const allocation = this.governance.categoryAllocations[category] || 0;
                const distributedAmount = this.governance.unallocatedFunds * allocation;
                this.governance.publicCoffers[category] += distributedAmount;
                
                if (distributedAmount > 0) {
                }
            });
            
            this.governance.unallocatedFunds = 0; // Clear unallocated funds
        }
        
        // Apply LVT rate change
        this.governance.currentLvtRate = this.governance.proposedLvtRate;
        
        // Hide modal
        this.hideGovernanceModal();
        
    }
    
    // Called at the beginning of each month
    awardMonthlyVotingPoints() {
        // Award points to player (new unified system)
        this.governance.totalVotingPoints += 2; // Add 2 points per month (accumulate)
        
        // Reset LVT votes
        this.governance.lvtRateVotes = { increase: 0, decrease: 0, maintain: 0 };
        
        // Update the UI
        this.updateGovernanceUI();
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
    
    distributeLVTToBudgets() {
        // Calculate monthly LVT collection
        this.governance.monthlyLvtCollected = this.calculateMonthlyLVT();
        
        // Add to unallocated funds instead of distributing directly
        this.governance.unallocatedFunds += this.governance.monthlyLvtCollected;
        
    }
    
    calculateMonthlyLVT() {
        let totalLVT = 0;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                // Collect LVT from ALL owned parcels in the city
                if (parcel.owner && parcel.owner !== 'unclaimed') {
                    const landValue = Math.max(parcel.landValue.paidPrice, parcel.landValue.calculatedValue);
                    totalLVT += landValue * this.governance.currentLvtRate / 12; // Monthly portion
                }
            }
        }
        
        return totalLVT;
    }
    
    // Check if public funds can cover building cost
    canPublicFundsCover(buildingCategory, cost) {
        const availableFunds = this.governance.publicCoffers[buildingCategory] || 0;
        return { 
            canCover: availableFunds >= cost,
            availableFunds: availableFunds,
            shortfall: Math.max(0, cost - availableFunds)
        };
    }
    
    // Use public funds for building
    usePublicFunds(buildingCategory, amount) {
        const availableFunds = this.governance.publicCoffers[buildingCategory] || 0;
        const usedAmount = Math.min(availableFunds, amount);
        this.governance.publicCoffers[buildingCategory] -= usedAmount;
        return usedAmount;
    }

    createEmptyParcelMenu(contentEl, row, col) {
        // Start Auction section
        const auctionSection = document.createElement('div');
        auctionSection.className = 'context-section';
        
        const auctionBtn = document.createElement('button');
        auctionBtn.className = 'context-btn primary';
        
        // Get market value for display
        const parcel = this.grid[row][col];
        const landValue = parcel.landValue?.calculatedValue || this.getParcelPrice(row, col);
        
        auctionBtn.innerHTML = `START AUCTION<br><small>Mkt: $${landValue.toLocaleString()}</small>`;
        auctionBtn.onclick = () => this.startAuction(row, col);
        auctionSection.appendChild(auctionBtn);
        contentEl.appendChild(auctionSection);

        // Build Menu section
        const buildSection = document.createElement('div');
        buildSection.className = 'context-section';
        
        const buildTitle = document.createElement('div');
        buildTitle.className = 'build-menu-title';
        buildTitle.textContent = 'BUILD MENU';
        buildSection.appendChild(buildTitle);

        // Create category buttons with submenus
        this.buildingManager.getCategories().forEach(category => {
            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'category-container';
            categoryContainer.style.position = 'relative';
            
            const categoryBtn = document.createElement('button');
            categoryBtn.className = 'category-btn';
            const availableFunds = this.governance.publicCoffers[category] || 0;
            
            // Determine funding status for this category
            const buildings = this.buildingManager.getBuildingsByCategory(category);
            let fundingStatus = 'none'; // none, partial, full
            
            if (availableFunds > 0 && buildings.length > 0) {
                const cheapestBuilding = Math.min(...buildings.map(b => b.economics?.buildCost || b.cost || 0));
                const mostExpensiveBuilding = Math.max(...buildings.map(b => b.economics?.buildCost || b.cost || 0));
                
                if (availableFunds >= mostExpensiveBuilding) {
                    fundingStatus = 'full'; // Can fund most expensive building
                } else if (availableFunds >= cheapestBuilding) {
                    fundingStatus = 'partial'; // Can fund some buildings
                }
            }
            
            // Set indicator color based on funding status
            let indicatorColor = '#666'; // Default gray
            if (fundingStatus === 'full') {
                indicatorColor = '#2196F3'; // Blue for full funding
            } else if (fundingStatus === 'partial') {
                indicatorColor = '#FFA726'; // Yellow/orange for partial funding
            }
            
            // Only show funding amount if there are funds available
            const fundingDisplay = availableFunds > 0 ? 
                `<span style="font-size: 10px; color: ${indicatorColor};">$${availableFunds.toLocaleString()}</span>` : 
                '';
            
            categoryBtn.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 6px; height: 6px; border-radius: 50%; background: ${indicatorColor};"></div>
                        <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${fundingDisplay}
                        <span class="arrow">▶</span>
                    </div>
                </div>
            `;
            
            const submenu = document.createElement('div');
            submenu.className = 'building-submenu';
            
            // Add all buildings for this category
            this.buildingManager.getBuildingsByCategory(category).forEach(building => {
                const buildingBtn = document.createElement('button');
                
                // Check building requirements
                const requirements = this.checkBuildingRequirements(building.id, row, col);
                
                // Set button class based on buildability
                if (requirements.canBuild) {
                    buildingBtn.className = 'building-btn';
                } else {
                    buildingBtn.className = 'building-btn disabled';
                    buildingBtn.style.opacity = '0.6';
                    buildingBtn.style.borderLeft = '3px solid #ff6b6b';
                    buildingBtn.disabled = true; // Actually disable the button
                }
                
                const fullCost = building.economics?.buildCost || building.cost || 0;
                const fundingInfo = this.calculateBuildingCostWithFunding(building, fullCost);
                const playerCost = fundingInfo.playerCost;
                const publicFunding = fundingInfo.publicFunding;
                
                // Determine price color based on funding status with gradients
                let priceColor = '#ccc'; // Default white/gray
                if (playerCost === 0) {
                    priceColor = '#2196F3'; // Blue for $0 (fully funded)
                } else if (publicFunding > 0) {
                    // Calculate discount percentage for gradient effect
                    const discountPercent = publicFunding / fullCost;
                    
                    if (discountPercent >= 0.75) {
                        // High discount (75%+) - more blue
                        priceColor = '#42A5F5'; // Light blue
                    } else if (discountPercent >= 0.5) {
                        // Medium discount (50-74%) - blue-orange mix
                        priceColor = '#66BB6A'; // Green-blue
                    } else if (discountPercent >= 0.25) {
                        // Low discount (25-49%) - orange
                        priceColor = '#FFA726'; // Orange
                    } else {
                        // Very low discount (1-24%) - yellow-orange
                        priceColor = '#FFCC02'; // Yellow
                    }
                }
                
                if (publicFunding > 0) {
                    buildingBtn.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${building.name}</span>
                            <div style="text-align: right; font-size: 11px;">
                                <div style="color: #4CAF50;">Public: $${publicFunding.toLocaleString()}</div>
                                <div style="color: ${priceColor}; font-weight: 600;">You pay: $${playerCost.toLocaleString()}</div>
                            </div>
                        </div>
                    `;
                } else {
                    buildingBtn.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${building.name}</span>
                            <span style="color: ${priceColor}; font-weight: 600;">$${playerCost.toLocaleString()}</span>
                        </div>
                    `;
                }
                
                buildingBtn.onclick = () => this.buildingSystem.constructBuilding(row, col, building.id);
                submenu.appendChild(buildingBtn);
            });
            
            // Add hover handlers for building info display
            this.addBuildingHoverHandlers(submenu);
            
            // Add category hover management
            this.setupCategoryHover(categoryBtn, submenu);
            
            categoryContainer.appendChild(categoryBtn);
            categoryContainer.appendChild(submenu);
            buildSection.appendChild(categoryContainer);
        });
        
        contentEl.appendChild(buildSection);
    }

    createBuiltParcelMenu(contentEl, row, col, parcel) {
        // Main actions section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'context-section';
        
        const auctionBtn = document.createElement('button');
        auctionBtn.className = 'context-btn primary';
        auctionBtn.textContent = 'START AUCTION';
        auctionBtn.onclick = () => this.startAuction(row, col);
        actionsSection.appendChild(auctionBtn);
        
        const destroyBtn = document.createElement('button');
        destroyBtn.className = 'context-btn';
        
        // Calculate and show demolition fee
        const building = this.buildingManager.getBuildingById(parcel.building);
        const currentValue = this.calculateCurrentBuildingValue(parcel, building);
        const demolitionFee = Math.round(currentValue * 0.1);
        
        destroyBtn.textContent = `DESTROY BUILDING - $${demolitionFee}`;
        destroyBtn.onclick = () => this.buildingSystem.demolishBuilding(row, col);
        
        // Disable if player can't afford demolition fee
        if (this.playerCash < demolitionFee) {
            destroyBtn.disabled = true;
            destroyBtn.classList.add('disabled');
        }
        
        actionsSection.appendChild(destroyBtn);
        
        contentEl.appendChild(actionsSection);
        
        // Data insights functionality moved to separate system
        
        // Upgrade section
        const upgradeSection = document.createElement('div');
        upgradeSection.className = 'context-section';
        
        const upgradeTitle = document.createElement('div');
        upgradeTitle.className = 'build-menu-title';
        upgradeTitle.textContent = 'UPGRADES';
        upgradeSection.appendChild(upgradeTitle);
        
        // Get potential upgrades for current building
        const upgrades = this.getPotentialUpgrades(parcel.building);
        if (upgrades.length > 0) {
            upgrades.forEach(upgrade => {
                const upgradeBtn = document.createElement('button');
                upgradeBtn.className = 'context-btn';
                const upgradeCost = upgrade.economics?.buildCost || upgrade.cost || 0;
                
                // Calculate public funding for upgrades
                const upgradeCategory = upgrade.category;
                const fundingInfo = this.calculateBuildingCostWithFunding({category: upgradeCategory}, upgradeCost);
                const playerCost = fundingInfo.playerCost;
                const publicFunding = fundingInfo.publicFunding;
                
                upgradeBtn.textContent = `→ ${upgrade.name} - $${playerCost.toLocaleString()}`;
                upgradeBtn.onclick = () => this.buildingSystem.upgradeBuilding(row, col, upgrade.id);
                upgradeSection.appendChild(upgradeBtn);
            });
        } else {
            const noUpgrades = document.createElement('div');
            noUpgrades.textContent = 'No upgrades available';
            noUpgrades.style.color = '#666666';
            noUpgrades.style.fontSize = '9px';
            noUpgrades.style.padding = '4px 8px';
            upgradeSection.appendChild(noUpgrades);
        }
        
        contentEl.appendChild(upgradeSection);
        
        // Repair Building section
        const repairSection = document.createElement('div');
        repairSection.className = 'context-section';
        
        const repairBtn = document.createElement('button');
        repairBtn.className = 'context-btn';
        
        // Calculate repair cost based on building age/decay
        const buildingData = this.buildingManager.getBuildingById(parcel.building);
        const repairCost = this.calculateRepairCost(parcel, buildingData);
        
        if (repairCost > 0) {
            repairBtn.textContent = `Repair Building - $${repairCost}`;
            repairBtn.onclick = () => this.buildingSystem.repairBuilding(row, col);
            
            // Disable if player can't afford
            if (this.playerCash < repairCost) {
                repairBtn.disabled = true;
                repairBtn.classList.add('disabled');
            }
        } else {
            repairBtn.textContent = 'Building in Good Condition';
            repairBtn.disabled = true;
            repairBtn.classList.add('disabled');
        }
        
        repairSection.appendChild(repairBtn);
        contentEl.appendChild(repairSection);
    }
    
    calculateRepairCost(parcel, building) {
        // Calculate cost to repair building based on maintenance increase due to exponential decay
        // Cost = 200 × (current_maintenance - original_maintenance)
        if (!parcel || !building || !parcel.buildingAge || parcel.buildingAge <= 0) {
            return 0;
        }
        
        // Get base maintenance cost and decay rate
        const baseMaintenance = building.economics.maintenanceCost || 0;
        const decayRate = building.economics.decayRatePercent ? building.economics.decayRatePercent / 100 : 0.001;
        const buildingAgeInDays = parcel.buildingAge || 0;
        
        // Calculate current maintenance using exponential formula: baseMaintenance * (1 + decayRate)^days
        const maintenanceMultiplier = Math.pow(1 + decayRate, buildingAgeInDays);
        const currentMaintenance = baseMaintenance * maintenanceMultiplier;
        
        // Calculate maintenance increase due to decay
        const maintenanceIncrease = currentMaintenance - baseMaintenance;
        
        // Repair cost is 200x the maintenance increase
        const repairCost = maintenanceIncrease * 200;
        
        return Math.round(repairCost * 100) / 100; // Round to nearest cent
    }
    
    calculateCurrentBuildingValue(parcel, building) {
        // Calculate current building value accounting for decay
        if (!building || !building.economics) return 0;
        
        const baseCost = building.economics.buildCost || 0;
        const decayFactor = 1 - (parcel.decay || 0);
        
        // Current value is base cost reduced by decay
        return Math.round(baseCost * decayFactor);
    }
    
    // Moved to BuildingSystem.repairBuilding()
    
    // Moved to BuildingSystem.purchaseParcel()
    
    startAuction(row, col) {
        const coord = this.getParcelCoordinate(row, col);
        const parcel = this.grid[row][col];
        
        // Check if there's already an active auction
        if (this.activeAuction) {
            this.showNotification('An auction is already in progress', 'error');
            this.hideContextMenu();
            return;
        }
        
        // Calculate starting bid based on calculated land value
        const calculatedValue = this.economicEngine.calculateLandValue(row, col);
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
            console.log(`Requirements check: parcel (${row},${col}) already has building:`, this.grid[row][col].building);
            reasons.push('Parcel already has a building');
        }
        
        // Check population requirement using single source of truth
        const currentPopulation = this.calculatePopulation(); // Always use the main function
        const requiredPopulation = building?.population?.populationRequired || 0;
        if (currentPopulation < requiredPopulation) {
            reasons.push(`Requires ${requiredPopulation} population (current: ${Math.floor(currentPopulation)})`);
        }
        
        // Check cash requirement
        const buildingCost = this.getBuildingCost(buildingId);
        let publicFunding = 0;
        const buildingCategory = building?.category;
        if (buildingCategory && this.governance.publicCoffers[buildingCategory]) {
            const availableFunds = this.governance.publicCoffers[buildingCategory];
            publicFunding = Math.min(availableFunds, buildingCost);
        }
        const playerCostRequired = buildingCost - publicFunding;
        
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

    addBuildingHoverHandlers(submenu) {
        const buildingButtons = submenu.querySelectorAll('.building-btn');
        buildingButtons.forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                // Extract building name from the button structure
                let buildingName = '';
                
                // Try to find the building name in the button structure
                const spans = btn.querySelectorAll('span');
                if (spans.length > 0) {
                    // Get the first span which should contain the building name
                    buildingName = spans[0].textContent.trim();
                } else {
                    // Fallback: try to extract from textContent
                    buildingName = btn.textContent.split(' - ')[0].trim();
                }
                
                if (buildingName) {
                    this.showBuildingInfo(buildingName);
                }
            });
            
            btn.addEventListener('mouseleave', () => {
                this.hideBuildingInfo();
            });
        });
    }

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
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingName);
        
        if (building) {
            // Separate supply/demand from soft metrics
            const allImpacts = building.domainImpacts || this.getBuildingImpacts(building.id);
            const supplyDemandMetrics = ['energy', 'food', 'housing', 'jobs'];
            
            const supplyDemand = {};
            const softMetrics = {};
            
            // Get direct supply/demand from building properties
            const bedroomsAdded = building.population?.bedroomsAdded || 0;
            const jobsCreated = building.population?.jobsCreated || 0;
            const energyDemand = building.resources?.energyDemand || 0;
            const foodProduction = building.resources?.foodProduction || 0;
            
            // Calculate net supply/demand for each metric
            // ENERGY: Negative energyDemand means energy production
            if (energyDemand < 0) {
                // Energy producer (utilities)
                supplyDemand.energy = Math.abs(energyDemand); // Show as positive supply
            } else if (energyDemand > 0) {
                // Energy consumer
                supplyDemand.energy = -energyDemand; // Show as negative demand
            } else {
                supplyDemand.energy = 0;
            }
            
            // FOOD: Production vs consumption (3 per person per day)
            const peopleInBuilding = bedroomsAdded * 2; // 2 people per bedroom
            const foodDemand = peopleInBuilding * 3; // 3 food per person per day
            supplyDemand.food = foodProduction - foodDemand; // Net food balance
            
            // HOUSING: Bedrooms supplied vs demanded by jobs
            if (bedroomsAdded > 0) {
                supplyDemand.housing = bedroomsAdded; // Supply bedrooms
            } else if (jobsCreated > 0) {
                // Jobs create housing demand (0.6 bedrooms per job)
                supplyDemand.housing = -(jobsCreated * 0.6);
            } else {
                supplyDemand.housing = 0;
            }
            
            // JOBS: Jobs created vs demanded by housing
            if (jobsCreated > 0) {
                supplyDemand.jobs = jobsCreated; // Supply jobs
            } else if (bedroomsAdded > 0) {
                // Housing creates job demand (0.6 jobs per bedroom)
                supplyDemand.jobs = -(bedroomsAdded * 0.6);
            } else {
                supplyDemand.jobs = 0;
            }
            
            // Separate soft metrics from impacts
            if (allImpacts) {
                Object.entries(allImpacts).forEach(([key, value]) => {
                    if (!supplyDemandMetrics.includes(key.toLowerCase())) {
                        softMetrics[key] = value;
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
                economics: building.economics
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
        container.innerHTML = '<div class="vitality-group-title">SUPPLY & DEMAND</div>';
        
        // Define supply/demand metrics with colors
        const supplyDemandConfig = {
            'energy': { color: '#f59e0b', label: 'ENERGY' },
            'food': { color: '#84cc16', label: 'FOOD' },
            'housing': { color: '#06b6d4', label: 'HOUSING' },
            'jobs': { color: '#ec4899', label: 'JOBS' }
        };
        
        Object.entries(supplyDemandConfig).forEach(([key, config]) => {
            const value = buildingData.supplyDemand?.[key] || 0;
            if (value === 0 && key !== 'energy') return; // Skip if no impact (except energy which can be 0)
            
            const row = document.createElement('div');
            row.className = 'vitality-row';
            
            // Create label
            const label = document.createElement('span');
            label.className = 'vitality-label';
            label.style.color = config.color;
            label.textContent = config.label;
            
            // Create bar container
            const barContainer = document.createElement('div');
            barContainer.className = 'vitality-bar';
            
            // Create progress bar
            const progress = document.createElement('div');
            progress.className = 'vitality-progress';
            
            // Calculate width - supply goes right (green), demand goes left (red)
            const maxValue = key === 'energy' ? 500 : key === 'food' ? 50 : 30;
            const normalizedValue = Math.min(Math.max(value / maxValue, -1), 1);
            
            // Set position absolute for proper positioning
            progress.style.position = 'absolute';
            
            if (value > 0) {
                // Supply - goes right from center
                progress.style.left = '50%';
                progress.style.width = `${Math.abs(normalizedValue) * 50}%`;
                progress.style.background = '#22c55e'; // Green for supply
            } else if (value < 0) {
                // Demand - goes left from center
                const width = Math.abs(normalizedValue) * 50;
                progress.style.left = `${50 - width}%`;
                progress.style.width = `${width}%`;
                progress.style.background = '#ef4444'; // Red for demand
            } else {
                // Zero - show tiny gray bar at center
                progress.style.left = '49.5%';
                progress.style.width = '1%';
                progress.style.background = '#666666';
            }
            
            barContainer.appendChild(progress);
            row.appendChild(label);
            row.appendChild(barContainer);
            
            container.appendChild(row);
        });
        
        // Add cost and build time at the bottom
        const costRow = document.createElement('div');
        costRow.className = 'vitality-row';
        
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
                <span class="vitality-label">COST</span>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
                    <span class="info-value">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 8px; color: #4CAF50; background: rgba(76, 175, 80, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">FUNDED</span>
                </div>
            `;
        } else if (availableFunds > 0) {
            // Public funds exist but not enough to cover full cost - show partial funding indicator
            costRow.innerHTML = `
                <span class="vitality-label">COST</span>
                <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">
                    <span class="info-value">$${playerCost.toLocaleString()}</span>
                    <span style="font-size: 8px; color: #FFA726; background: rgba(255, 167, 38, 0.15); padding: 1px 4px; border-radius: 2px; font-weight: 600;">PARTIAL</span>
                </div>
            `;
        } else {
            // No public funding available
            costRow.innerHTML = `
                <span class="vitality-label">COST</span>
                <span class="info-value" style="margin-left: auto;">$${playerCost.toLocaleString()}</span>
            `;
        }
        container.appendChild(costRow);
        
        const timeRow = document.createElement('div');
        timeRow.className = 'vitality-row';
        timeRow.innerHTML = `
            <span class="vitality-label">BUILD TIME</span>
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

        // Define soft metrics (livability) order and colors
        const livabilityConfig = {
            'health': '#ef4444',
            'education': '#3b82f6',
            'safety': '#10b981',
            'culture': '#a855f7',
            'mobility': '#8b5cf6',
            'environment': '#22c55e',
            'affordability': '#f97316',
            'resilience': '#14b8a6',
            'noise': '#6b7280'
        };
        
        // Sort impacts by livability order
        const sortedImpacts = Object.entries(impacts)
            .filter(([_, value]) => value !== 0)
            .sort(([a], [b]) => {
                const aIndex = Object.keys(livabilityConfig).indexOf(a.toLowerCase());
                const bIndex = Object.keys(livabilityConfig).indexOf(b.toLowerCase());
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

        sortedImpacts.forEach(([domain, value]) => {
            const row = document.createElement('div');
            row.className = 'vitality-row';
            
            // Create label
            const label = document.createElement('span');
            label.className = 'vitality-label';
            label.style.color = livabilityConfig[domain.toLowerCase()] || '#808080';
            label.textContent = domain.toUpperCase();
            
            // Create bar container
            const barContainer = document.createElement('div');
            barContainer.className = 'vitality-bar';
            
            // Create progress bar
            const progress = document.createElement('div');
            progress.className = 'vitality-progress';
            
            // Set position absolute for proper positioning
            progress.style.position = 'absolute';
            
            // For soft metrics, positive is always good (right/colored), negative is bad (left/red)
            const maxImpact = 50;
            const normalizedValue = Math.min(Math.max(value / maxImpact, -1), 1);
            
            if (value > 0) {
                progress.style.left = '50%';
                progress.style.width = `${Math.abs(normalizedValue) * 50}%`;
                progress.style.background = livabilityConfig[domain.toLowerCase()] || '#4a90e2';
            } else {
                const width = Math.abs(normalizedValue) * 50;
                progress.style.left = `${50 - width}%`;
                progress.style.width = `${width}%`;
                progress.style.background = '#ef4444'; // Red for negative
            }
            
            barContainer.appendChild(progress);
            row.appendChild(label);
            row.appendChild(barContainer);
            
            impactsList.appendChild(row);
        });
    }

    setupCategoryHover(categoryBtn, submenu) {
        // Category button hover enter
        categoryBtn.addEventListener('mouseenter', () => {
            this.showSubmenu(submenu);
        });

        // Category button hover leave
        categoryBtn.addEventListener('mouseleave', () => {
            this.scheduleSubmenuHide(submenu);
        });

        // Submenu hover enter (cancel hide timer)
        submenu.addEventListener('mouseenter', () => {
            this.cancelSubmenuHide();
        });

        // Submenu hover leave
        submenu.addEventListener('mouseleave', () => {
            this.scheduleSubmenuHide(submenu);
        });
    }

    showSubmenu(submenu) {
        // Clear any existing timer
        this.cancelSubmenuHide();
        
        // Hide current submenu if different from the one being shown
        if (this.currentSubmenu && this.currentSubmenu !== submenu) {
            this.hideSubmenu(this.currentSubmenu);
        }
        
        // Show the new submenu
        submenu.classList.add('show');
        this.currentSubmenu = submenu;
    }

    hideSubmenu(submenu) {
        submenu.classList.remove('show');
        if (this.currentSubmenu === submenu) {
            this.currentSubmenu = null;
        }
    }

    scheduleSubmenuHide(submenu) {
        this.cancelSubmenuHide();
        this.submenuTimer = setTimeout(() => {
            this.hideSubmenu(submenu);
        }, 200); // 200ms delay
    }

    cancelSubmenuHide() {
        if (this.submenuTimer) {
            clearTimeout(this.submenuTimer);
            this.submenuTimer = null;
        }
    }

    // Land value calculation methods
    updateAllLandValues() {
        // Clear stale caches periodically
        this.clearCachesIfStale();
        
        // If no dirty regions, skip update (major performance optimization)
        if (this.dirtyRegions.size === 0) {
            return;
        }
        
        // Only update dirty regions instead of entire grid
        for (const regionKey of this.dirtyRegions) {
            const [row, col] = regionKey.split('-').map(Number);
            if (row >= 0 && row < this.gridSize && col >= 0 && col < this.gridSize) {
                this.grid[row][col].landValue.calculatedValue = this.economicEngine.calculateLandValue(row, col);
            }
        }
        
        // Clear dirty regions after update
        this.dirtyRegions.clear();
        
    }

    
    calculateAccessibilityScores(row, col) {
        // Check cache first
        const cacheKey = `accessibility-${row}-${col}`;
        if (this.accessibilityCache.has(cacheKey)) {
            return this.accessibilityCache.get(cacheKey);
        }
        
        const scores = {
            food: 0,
            energy: 0,
            jobs: 0,
            healthcare: 0,
            education: 0,
            transport: 0,
            culture: 0,
            safety: 0
        };
        
        // Maximum influence distance for any amenity
        const MAX_DISTANCE = 5;
        
        // Scan all parcels within influence range
        for (let r = Math.max(0, row - MAX_DISTANCE); r <= Math.min(this.gridSize - 1, row + MAX_DISTANCE); r++) {
            for (let c = Math.max(0, col - MAX_DISTANCE); c <= Math.min(this.gridSize - 1, col + MAX_DISTANCE); c++) {
                if (r === row && c === col) continue;
                
                const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
                const parcel = this.grid[r][c];
                
                if (parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (!building) continue;
                    
                    // Distance decay function: 1.0 at distance 1, 0.2 at distance 5
                    const influence = Math.max(0, 1.2 - (distance * 0.2));
                    
                    // Food access from commercial buildings with food production
                    if (building.foodProduction && building.foodProduction > 0) {
                        scores.food += (building.foodProduction / 50) * influence;
                    }
                    
                    // Jobs from any building that creates employment
                    if (building.jobs && building.jobs > 0) {
                        scores.jobs += (building.jobs / 20) * influence;
                    }
                    
                    // Healthcare from healthcare category
                    if (building.category === 'healthcare') {
                        scores.healthcare += influence * (building.healthImpact || 10) / 10;
                    }
                    
                    // Education from education category
                    if (building.category === 'education') {
                        scores.education += influence * (building.educationImpact || 10) / 10;
                    }
                    
                    // Transport/mobility from relevant buildings
                    if (building.mobilityImpact && building.mobilityImpact > 0) {
                        scores.transport += (building.mobilityImpact / 10) * influence;
                    }
                    
                    // Culture from culture/recreation categories
                    if (building.category === 'culture' || building.category === 'recreation') {
                        scores.culture += influence * (building.cultureImpact || 10) / 10;
                    }
                    
                    // Safety from civic/emergency buildings
                    if (building.safetyImpact && building.safetyImpact > 0) {
                        scores.safety += (building.safetyImpact / 10) * influence;
                    }
                    
                    // Energy is currently simplified - could expand later
                    if (building.category === 'infrastructure') {
                        scores.energy += influence * 0.5;
                    }
                }
            }
        }
        
        // Normalize scores to 0-1 range with diminishing returns
        Object.keys(scores).forEach(key => {
            scores[key] = Math.tanh(scores[key] * 0.5); // Smooth curve that caps around 1.0
        });
        
        // Cache the result
        this.accessibilityCache.set(cacheKey, scores);
        
        return scores;
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
    
    
    // Supply/Demand System with Transport Networks
    calculateSupplyDemandBalance() {
        const balance = {
            energy: { supply: [], demand: [], balance: 0, satisfaction: 0 },
            food: { supply: [], demand: [], balance: 0, satisfaction: 0 },
            housing: { supply: [], demand: [], balance: 0, satisfaction: 0 },
            jobs: { supply: [], demand: [], balance: 0, satisfaction: 0 },
            workers: { supply: [], demand: [], balance: 0, satisfaction: 0 }, // Workers for jobs
            residents: { supply: [], demand: [], balance: 0, satisfaction: 0 }, // For commercial/service demand
            students: { supply: [], demand: [], balance: 0, satisfaction: 0 }, // For schools
            recreation: { supply: [], demand: [], balance: 0, satisfaction: 0 } // For parks/culture
        };
        
        // Track individual building efficiency and needs (initialized in constructor)
        
        // Clear previous efficiency tracking
        this.buildingEfficiencies.clear();
        
        // BUILD TRANSPORT NETWORK FIRST - before all calculations
        const transportNetwork = this.buildTransportNetwork();
        
        // First pass: Identify all supply and demand points
        let buildingsFound = 0;
        console.log('🔍 Starting grid scan, gridSize:', this.gridSize, 'grid exists:', !!this.grid);
        if (!this.grid) {
            console.log('❌ Grid is null/undefined!');
            return;
        }
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                // Debug: Check what's in parcels that should have buildings
                if ((row === 11 && col === 11) || parcel?.building) {
                    console.log(`🔍 Parcel at ${row},${col}:`, {
                        hasBuilding: !!parcel?.building,
                        buildingId: parcel?.building,
                        parcelKeys: parcel ? Object.keys(parcel) : 'null parcel'
                    });
                }
                
                if (!parcel.building) continue;
                buildingsFound++;
                
                const building = this.buildingManager.getBuildingById(parcel.building);
                if (!building) {
                    console.log(`⚠️ Building ${parcel.building} not found at ${row},${col}`);
                    continue;
                }
                
                console.log(`🏢 Found building ${building.name} at ${row},${col}`);
                
                const key = `${row},${col}`;
                
                // Initialize efficiency tracking for ALL buildings
                this.buildingEfficiencies.set(key, {
                    row, col,
                    building: building.name,
                    category: building.category,
                    needs: {}
                });
                
                // Debug: Log building efficiency initialization
                if (Math.random() < 0.1) { // Log 10% of buildings to avoid spam
                    console.log(`Building efficiency tracking initialized for ${building.name} at ${key}`);
                }
                
                // Housing supplies workers and residents, demands food/energy/jobs/recreation
                if (this.buildingCategories.normalize(building.category) === 'housing') {
                    const residents = building.bedrooms || 0;
                    
                    // Supply housing capacity
                    balance.housing.supply.push({
                        row, col,
                        amount: residents,
                        building: building.name
                    });
                    
                    // Supply workers for jobs (0.6 workers per bedroom)
                    balance.workers.supply.push({
                        row, col,
                        amount: residents * 0.6,
                        building: building.name
                    });
                    
                    // Supply residents for commercial/service demand
                    balance.residents.supply.push({
                        row, col,
                        amount: residents,
                        building: building.name
                    });
                    
                    // Supply potential students
                    balance.students.supply.push({
                        row, col,
                        amount: residents * 0.3, // 30% are school-age
                        building: building.name
                    });
                    
                    // Demand food (1 unit per resident per day)
                    balance.food.demand.push({
                        row, col,
                        amount: residents,
                        building: building.name
                    });
                    
                    // Demand energy
                    const energyDemand = building.energyDemand || residents * 2;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                    
                    // Demand jobs (0.6 jobs per bedroom - residents need employment)
                    balance.jobs.demand.push({
                        row, col,
                        amount: residents * 0.6,
                        building: building.name
                    });
                    
                    // Demand recreation
                    balance.recreation.demand.push({
                        row, col,
                        amount: residents * 0.5,
                        building: building.name
                    });
                }
                
                // Commercial buildings need workers, customers and energy
                if (this.buildingCategories.normalize(building.category) === 'commercial') {
                    // Supply jobs
                    if (building.jobs > 0) {
                        balance.jobs.supply.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                        
                        // Demand workers for those jobs
                        balance.workers.demand.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                    }
                    
                    // Supply food if applicable
                    if (building.foodProduction > 0) {
                        balance.food.supply.push({
                            row, col,
                            amount: building.foodProduction,
                            building: building.name
                        });
                    }
                    
                    // Demand customers (residents)
                    const customerDemand = (building.jobs || 0) * 10; // 10 customers per employee
                    balance.residents.demand.push({
                        row, col,
                        amount: customerDemand,
                        building: building.name
                    });
                    
                    // Demand energy
                    const energyDemand = building.energyDemand || 20;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                }
                
                // Education buildings need students, workers and energy
                if (building.category === 'education') {
                    // Supply jobs and demand workers
                    if (building.jobs > 0) {
                        balance.jobs.supply.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                        
                        balance.workers.demand.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                    }
                    
                    // Demand students based on capacity
                    const studentCapacity = building.populationReq || 50;
                    balance.students.demand.push({
                        row, col,
                        amount: studentCapacity,
                        building: building.name
                    });
                    
                    // Demand energy
                    const energyDemand = building.energyDemand || 30;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                }
                
                // Recreation/Culture buildings
                if (building.category === 'recreation' || building.category === 'culture') {
                    // Supply recreation
                    const recreationSupply = 100; // Base capacity
                    balance.recreation.supply.push({
                        row, col,
                        amount: recreationSupply,
                        building: building.name
                    });
                    
                    // Demand visitors (residents)
                    balance.residents.demand.push({
                        row, col,
                        amount: recreationSupply,
                        building: building.name
                    });
                    
                    // Demand energy
                    const energyDemand = building.energyDemand || 10;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                }
                
                // Healthcare buildings
                if (building.category === 'healthcare') {
                    // Supply jobs and demand workers
                    if (building.jobs > 0) {
                        balance.jobs.supply.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                        
                        balance.workers.demand.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                    }
                    
                    // Demand patients (residents)
                    const patientCapacity = 200; // Can serve 200 residents
                    balance.residents.demand.push({
                        row, col,
                        amount: patientCapacity,
                        building: building.name
                    });
                    
                    // Demand energy
                    const energyDemand = building.energyDemand || 40;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                }
                
                // Infrastructure supplies energy
                if (building.category === 'infrastructure') {
                    // Simplified - each infrastructure building provides 100 energy units
                    balance.energy.supply.push({
                        row, col,
                        amount: 100,
                        building: building.name
                    });
                    
                    // Infrastructure buildings with jobs also need workers
                    if (building.jobs > 0) {
                        balance.jobs.supply.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                        
                        balance.workers.demand.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                    }
                }
                
                // Industrial buildings
                if (building.category === 'industrial') {
                    // Supply jobs and demand workers
                    if (building.jobs > 0) {
                        balance.jobs.supply.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                        
                        balance.workers.demand.push({
                            row, col,
                            amount: building.jobs,
                            building: building.name
                        });
                    }
                    
                    // Demand energy (high)
                    const energyDemand = building.energyDemand || 50;
                    balance.energy.demand.push({
                        row, col,
                        amount: energyDemand,
                        building: building.name
                    });
                }
            }
        }
        
        console.log(`🔍 Grid scan complete: ${buildingsFound} buildings found in grid`);
        
        // Second pass: Match supply with demand using distance-attenuated distribution
        // (Transport network already built at beginning of method)
        ['energy', 'food', 'jobs', 'workers', 'residents', 'students', 'recreation'].forEach(resource => {
            const resourceBalance = balance[resource];
            
            // Calculate satisfaction for each demand point
            resourceBalance.demand.forEach(demandPoint => {
                let fulfilledDemand = 0;
                
                // Debug: Log JEFH demand processing
                if (['jobs', 'education', 'food', 'housing'].includes(resource)) {
                    console.log(`📊 Processing ${resource} demand at ${demandPoint.row},${demandPoint.col}, amount: ${demandPoint.amount}`);
                }
                
                resourceBalance.supply.forEach(supplyPoint => {
                    // Calculate effective distance considering transport
                    const effectiveDistance = this.calculateEffectiveDistance(
                        demandPoint.row, demandPoint.col,
                        supplyPoint.row, supplyPoint.col,
                        transportNetwork
                    );
                    
                    // Enhanced distance attenuation based on road type and resource
                    let accessibility = 0;
                    
                    // Check if connected by roads and get the road type
                    const roadConnection = transportNetwork.roads ? 
                        this.hasRoadConnection(demandPoint.row, demandPoint.col, 
                                             supplyPoint.row, supplyPoint.col, 
                                             transportNetwork.roads) : { connected: false };
                    
                    // Debug logging for road connections
                    if (resource === 'food' && Math.random() < 0.1) { // Log 10% of food connections
                        console.log(`🔍 Road check: (${demandPoint.row},${demandPoint.col}) → (${supplyPoint.row},${supplyPoint.col}): ${roadConnection.connected ? 'CONNECTED via ' + roadConnection.bestRoadType : 'NOT CONNECTED'}`);
                        if (transportNetwork.roads.size > 0) {
                            console.log(`📍 Transport network has ${transportNetwork.roads.size} parcel connections`);
                            const sample = Array.from(transportNetwork.roads.entries()).slice(0, 2);
                            sample.forEach(([key, connections]) => {
                                console.log(`  ${key} → [${connections.map(c => `(${c.row},${c.col})`).join(', ')}]`);
                            });
                        }
                    }
                    
                    if (roadConnection.connected) {
                        const roadType = roadConnection.bestRoadType;
                        const actualDistance = Math.abs(demandPoint.row - supplyPoint.row) + 
                                             Math.abs(demandPoint.col - supplyPoint.col);
                        
                        // Different resources travel differently on roads
                        if (resource === 'food' || resource === 'workers' || resource === 'residents') {
                            // Food and people can travel far on highways
                            if (roadType === 'highway') {
                                // Highways: minimal distance penalty for food/people
                                accessibility = 1.0 - (actualDistance * 0.01); // Only 1% loss per tile
                                accessibility = Math.max(0.8, accessibility); // Minimum 80% efficiency
                                
                                // Check capacity constraints for people movement
                                if (resource === 'workers' || resource === 'residents') {
                                    // Highway capacity is limited for people (1000 capacity)
                                    const roadCapacity = 1000;
                                    const currentFlow = supplyPoint.amount;
                                    if (currentFlow > roadCapacity) {
                                        // Reduce efficiency if over capacity
                                        accessibility *= (roadCapacity / currentFlow);
                                        console.log(`🚗 Highway capacity limit: ${roadCapacity} people, reducing efficiency`);
                                    }
                                }
                                console.log(`🛣️ Highway ${resource} transport: ${Math.round(accessibility * 100)}% efficient over ${actualDistance} tiles`);
                            } else if (roadType === 'arterial') {
                                // Arterials: moderate distance penalty
                                accessibility = 1.0 - (actualDistance * 0.03); // 3% loss per tile
                                accessibility = Math.max(0.6, accessibility); // Minimum 60% efficiency
                            } else {
                                // Local roads: significant distance penalty
                                accessibility = 1.0 - (actualDistance * 0.06); // 6% loss per tile
                                accessibility = Math.max(0.4, accessibility); // Minimum 40% efficiency
                            }
                        } else {
                            // Other resources (energy, jobs, etc.) use standard road efficiency
                            if (roadType === 'highway') {
                                accessibility = 0.95; // Highways still best
                            } else if (roadType === 'arterial') {
                                accessibility = 0.85; // Arterials decent
                            } else {
                                accessibility = 0.75; // Local roads basic
                            }
                        }
                        
                        // Boost for very close connections
                        if (effectiveDistance <= 2) {
                            accessibility = Math.min(1.0, accessibility * 1.1);
                        }
                        
                    } else if (effectiveDistance <= 2) {
                        // Walking distance - full access
                        accessibility = 1.0;
                    } else if (effectiveDistance <= 15) {
                        // No road connection and too far to walk - very limited access
                        accessibility = Math.exp(-0.5 * (effectiveDistance - 2)); // Steeper decay without roads
                    }
                    
                    // Amount of supply accessible from this point
                    const accessibleSupply = supplyPoint.amount * accessibility;
                    fulfilledDemand += accessibleSupply;
                });
                
                // Calculate satisfaction ratio for this demand point
                demandPoint.satisfaction = Math.min(1.0, fulfilledDemand / demandPoint.amount);
                
                // Debug: Log low satisfaction for JEFH resources
                if (['jobs', 'education', 'food', 'housing'].includes(resource) && demandPoint.satisfaction < 0.8) {
                    console.log(`Low JEFH satisfaction: ${resource} at ${demandPoint.row},${demandPoint.col} = ${Math.round(demandPoint.satisfaction * 100)}%`);
                }
                
                // Store building-specific satisfaction
                const key = `${demandPoint.row},${demandPoint.col}`;
                if (!this.buildingEfficiencies.has(key)) {
                    this.buildingEfficiencies.set(key, {
                        row: demandPoint.row,
                        col: demandPoint.col,
                        building: demandPoint.building,
                        needs: {}
                    });
                }
                this.buildingEfficiencies.get(key).needs[resource] = {
                    satisfaction: demandPoint.satisfaction,
                    demand: demandPoint.amount,
                    fulfilled: fulfilledDemand
                };
            });
            
            // Calculate overall balance and satisfaction
            const totalSupply = resourceBalance.supply.reduce((sum, s) => sum + s.amount, 0);
            const totalDemand = resourceBalance.demand.reduce((sum, d) => sum + d.amount, 0);
            resourceBalance.balance = totalSupply - totalDemand;
            
            // Average satisfaction across all demand points
            if (resourceBalance.demand.length > 0) {
                const totalSatisfaction = resourceBalance.demand.reduce((sum, d) => sum + d.satisfaction, 0);
                resourceBalance.satisfaction = totalSatisfaction / resourceBalance.demand.length;
            } else {
                resourceBalance.satisfaction = 1.0; // No demand = fully satisfied
            }
        });
        
        // Housing is simpler - just total supply vs population need
        const totalHousing = balance.housing.supply.reduce((sum, s) => sum + s.amount, 0);
        const populationNeed = this.totalPopulation || 0;
        balance.housing.balance = totalHousing - populationNeed;
        balance.housing.satisfaction = totalHousing > 0 ? Math.min(1.0, populationNeed / totalHousing) : 0;
        
        return balance;
    }
    
    buildTransportNetwork() {
        // Build transport network using mobility layer roads
        if (!this.mobilityLayer) {
            // Fallback for when mobility layer is not available
            return {
                nodes: [],
                connections: new Map()
            };
        }
        
        const network = {
            nodes: [],
            connections: new Map(),
            roads: new Map() // Parcel-based road connections for hasRoadConnection method
        };
        
        // Get all intersections from mobility layer as network nodes
        this.mobilityLayer.intersections.forEach((intersection, key) => {
            network.nodes.push({
                id: key,
                row: intersection.row,
                col: intersection.col,
                x: intersection.x,
                y: intersection.y
            });
        });
        
        // Build parcel-based road connectivity map using a different approach
        // Create a map of which parcels are connected to which intersections
        console.log(`🛣️ Building transport network from ${this.mobilityLayer.roads.size} road segments`);
        
        // First, map parcels to their adjacent intersections
        const parcelToIntersections = new Map();
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcelKey = `${row},${col}`;
                const adjacentIntersections = [];
                
                // A parcel at (r,c) is adjacent to intersections at:
                // (r,c), (r,c+1), (r+1,c), (r+1,c+1)
                const intersectionPositions = [
                    { iRow: row, iCol: col },           // top-left
                    { iRow: row, iCol: col + 1 },       // top-right
                    { iRow: row + 1, iCol: col },       // bottom-left
                    { iRow: row + 1, iCol: col + 1 }    // bottom-right
                ];
                
                intersectionPositions.forEach(pos => {
                    if (pos.iRow >= 0 && pos.iRow <= this.gridSize && 
                        pos.iCol >= 0 && pos.iCol <= this.gridSize) {
                        adjacentIntersections.push(`${pos.iRow},${pos.iCol}`);
                    }
                });
                
                parcelToIntersections.set(parcelKey, adjacentIntersections);
            }
        }
        
        // Now, for each road segment, connect all parcels that share connected intersections
        this.mobilityLayer.roads.forEach((road, edgeKey) => {
            const [fromIntersection, toIntersection] = edgeKey.split('-');
            
            // Find all parcels adjacent to these intersections
            const fromParcels = [];
            const toParcels = [];
            
            parcelToIntersections.forEach((intersections, parcelKey) => {
                if (intersections.includes(fromIntersection)) {
                    fromParcels.push(parcelKey);
                }
                if (intersections.includes(toIntersection)) {
                    toParcels.push(parcelKey);
                }
            });
            
            // Connect all parcels at the 'from' end to all parcels at the 'to' end
            fromParcels.forEach(fromParcel => {
                if (!network.roads.has(fromParcel)) {
                    network.roads.set(fromParcel, []);
                }
                
                toParcels.forEach(toParcel => {
                    if (fromParcel !== toParcel) {
                        const [row, col] = toParcel.split(',').map(Number);
                        const existing = network.roads.get(fromParcel);
                        
                        // Avoid duplicates
                        if (!existing.some(conn => conn.row === row && conn.col === col)) {
                            existing.push({ row, col, roadType: road.type });
                        }
                    }
                });
            });
            
            // Also connect toParcels back to fromParcels (bidirectional)
            toParcels.forEach(toParcel => {
                if (!network.roads.has(toParcel)) {
                    network.roads.set(toParcel, []);
                }
                
                fromParcels.forEach(fromParcel => {
                    if (toParcel !== fromParcel) {
                        const [row, col] = fromParcel.split(',').map(Number);
                        const existing = network.roads.get(toParcel);
                        
                        // Avoid duplicates
                        if (!existing.some(conn => conn.row === row && conn.col === col)) {
                            existing.push({ row, col, roadType: road.type });
                        }
                    }
                });
            });
        });
        
        console.log(`📍 Final transport network: ${network.roads.size} parcel connections`);
        if (network.roads.size > 0) {
            const sample = Array.from(network.roads.entries()).slice(0, 3);
            sample.forEach(([key, connections]) => {
                console.log(`  Parcel ${key} connects to: ${connections.map(c => `(${c.row},${c.col})`).join(', ')}`);
            });
        }
        
        // Get all roads from mobility layer as intersection-based network connections  
        this.mobilityLayer.roads.forEach((road, edgeKey) => {
            const [from, to] = edgeKey.split('-');
            const fromNode = network.nodes.find(n => n.id === from);
            const toNode = network.nodes.find(n => n.id === to);
            
            if (fromNode && toNode) {
                // Calculate road distance and capacity
                const distance = Math.sqrt(
                    Math.pow(toNode.x - fromNode.x, 2) + 
                    Math.pow(toNode.y - fromNode.y, 2)
                );
                
                // Road capacity affects transport efficiency
                const roadType = this.mobilityLayer.roadTypes[road.type];
                const capacity = roadType ? roadType.capacity : 100;
                
                // Store bidirectional connections
                if (!network.connections.has(from)) {
                    network.connections.set(from, []);
                }
                if (!network.connections.has(to)) {
                    network.connections.set(to, []);
                }
                
                network.connections.get(from).push({
                    to: to,
                    distance: distance,
                    capacity: capacity,
                    roadType: road.type
                });
                
                network.connections.get(to).push({
                    to: from,
                    distance: distance,
                    capacity: capacity,
                    roadType: road.type
                });
            }
        });
        
        return network;
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
                return Math.max(1, Math.floor(manhattanDistance * 0.5));
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
    
    // Calculate smooth price multiplier using supply/demand curves
    calculateSmoothMultiplier(supplyRatio, elasticity) {
        // Smooth price curve: 0.5x to 2.5x range (5x max swing)
        if (supplyRatio >= 1.0) {
            // Oversupply: prices drop gradually
            const excess = Math.min(supplyRatio - 1.0, 2.0); // Cap at 3x oversupply
            return Math.max(0.5, 1.0 - (excess * elasticity * 0.5));
        } else {
            // Shortage: prices rise gradually  
            const shortage = Math.min(1.0 - supplyRatio, 0.8); // Cap at 80% shortage
            return Math.min(2.5, 1.0 + (shortage * elasticity * 1.5));
        }
    }

    // Update building revenues based on supply/demand satisfaction
    applySupplyDemandEffects() {
        this.economicEngine.calculateCityVitality(); // Ensure we have current supply/demand data
        
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
        this.economicEffects.energyMultiplier = this.calculateSmoothMultiplier(energyRatio, 0.2); // Energy is inelastic
        
        // Business efficiency affected by severe energy shortages only
        if (energyRatio < 0.3) {
            this.economicEffects.businessEfficiency = Math.max(0.4, energyRatio + 0.1);
            this.economicEffects.populationChangeRate -= (0.3 - energyRatio) * 0.1; // Gradual exodus
        }
        
        // FOOD EFFECTS - smooth curves
        this.economicEffects.foodMultiplier = this.calculateSmoothMultiplier(foodRatio, 0.4); // Food is semi-elastic
        
        // Population effects only for severe food shortages
        if (foodRatio < 0.4) {
            this.economicEffects.populationChangeRate -= (0.4 - foodRatio) * 0.15; // Gradual exodus
            this.economicEffects.businessEfficiency *= Math.max(0.5, foodRatio + 0.3); // Less severe impact
        }
        
        // HOUSING EFFECTS - smooth curves
        this.economicEffects.housingMultiplier = this.calculateSmoothMultiplier(housingRatio, 0.6); // Housing is elastic
        
        // Business and population effects for severe housing shortages only
        if (housingRatio < 0.5) {
            this.economicEffects.businessEfficiency *= Math.max(0.6, housingRatio + 0.3);
            this.economicEffects.populationChangeRate -= (0.5 - housingRatio) * 0.08; // Gradual exodus
        }
        
        // JOBS EFFECTS - smooth curves
        this.economicEffects.jobsMultiplier = this.calculateSmoothMultiplier(jobsRatio, 0.8); // Jobs are elastic
        
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
        console.log('🔧 Layer controls setup delegated to UI Manager');
    }
    
    switchToLayer(layerName) {
        console.log(`🎯 Switching to layer: ${layerName} (was: ${this.currentLayer})`);
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
        console.log(`🎨 Scheduling render for layer switch to: ${layerName}`);
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
        
        // Get all players including current player
        const allPlayers = new Map();
        
        // Add current player
        if (this.multiplayerManager && this.multiplayerManager.playerId) {
            const currentPlayerId = this.multiplayerManager.playerId;
            if (this.multiplayerManager.players.has(currentPlayerId)) {
                allPlayers.set(currentPlayerId, {
                    ...this.multiplayerManager.players.get(currentPlayerId),
                    isCurrent: true
                });
            }
        }
        
        // Add other players
        if (this.multiplayerManager && this.multiplayerManager.players) {
            this.multiplayerManager.players.forEach((player, playerId) => {
                if (!allPlayers.has(playerId)) {
                    allPlayers.set(playerId, { ...player, isCurrent: false });
                }
            });
        }
        
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
            const icon = sectionElement.querySelector('.collapse-icon');
            if (icon) icon.textContent = '▼';
        }
    }
    
    closeSidebarSection(sectionElement) {
        if (sectionElement) {
            sectionElement.classList.add('collapsed');
            const icon = sectionElement.querySelector('.collapse-icon');
            if (icon) icon.textContent = '▶';
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
    
    // Building and amenity impact definitions
    getBuildingImpacts(buildingType) {
        const impacts = {
            'residential_apartment': {
                HOUSING: 5,
                AFFORDABILITY: 3,
                ENERGY: -2,
                NOISE: -1
            },
            'residential_luxury': {
                HOUSING: 3,
                CULTURE: 2,
                ENVIRONMENT: 1,
                AFFORDABILITY: -4,
                ENERGY: -3
            },
            'commercial_shop': {
                JOBS: 3,
                CULTURE: 1,
                MOBILITY: -1,
                NOISE: -1
            },
            'commercial_mall': {
                JOBS: 8,
                CULTURE: 3,
                MOBILITY: -3,
                NOISE: -2,
                ENVIRONMENT: -1
            },
            'industrial_factory': {
                JOBS: 10,
                ENERGY: 2,
                NOISE: -5,
                ENVIRONMENT: -4,
                HEALTH: -2
            },
            'education_school': {
                EDUCATION: 8,
                CULTURE: 2,
                SAFETY: 1,
                NOISE: -1
            },
            'health_clinic': {
                HEALTH: 6,
                JOBS: 2,
                SAFETY: 1
            }
        };
        return impacts[buildingType] || {};
    }
    
    getAmenityImpacts(amenityType) {
        const impacts = {
            'solar_panels': {
                ENERGY: 3,
                ENVIRONMENT: 2,
                RESILIENCE: 1
            },
            'garden': {
                ENVIRONMENT: 2,
                HEALTH: 1,
                CULTURE: 1,
                NOISE: 1
            },
            'security_system': {
                SAFETY: 3,
                AFFORDABILITY: -1
            },
            'parking_garage': {
                MOBILITY: 2,
                ENVIRONMENT: -1,
                NOISE: -1
            }
        };
        return impacts[amenityType] || {};
    }
    
    
    updateVitalityDisplay() {
        // Only calculate vitality locally if not using server-side calculations
        if (!this.multiplayerManager || !this.multiplayerManager.isConnected) {
            this.economicEngine.calculateCityVitality();
        }
        
        // Supply & Demand bars (Energy, Food, Housing, Jobs)
        const supplyDemandMetrics = ['ENERGY', 'FOOD', 'HOUSING', 'JOBS'];
        
        supplyDemandMetrics.forEach(domain => {
            const progressBar = document.getElementById(`${domain.toLowerCase()}-bar`);
            if (!progressBar) return;
            
            const supply = this.vitalitySupply[domain] || 0;
            const demand = this.vitalityDemand[domain] || 0;
            const netBalance = supply - demand;
            
            // Debug logging for JEFH
            if (supply > 0 || demand > 0) {
                console.log(`🔍 JEFH Update - ${domain}: Supply=${supply}, Demand=${demand}, NetBalance=${netBalance}`);
            }
            
            // Calculate ratio: -100 to +100 scale
            let ratio = 0;
            if (demand > 0) {
                ratio = ((supply - demand) / demand) * 100;
            } else if (supply > 0) {
                ratio = 100; // Infinite supply, no demand
            }
            
            // Clamp to -100 to +100 range
            ratio = Math.max(-100, Math.min(100, ratio));
            
            this.updateSupplyDemandBar(progressBar, ratio, supply, demand, domain);
        });
        
        // Net Score bars (all others)
        const netScoreMetrics = ['MOBILITY', 'EDUCATION', 'HEALTH', 'SAFETY', 'CULTURE', 'ENVIRONMENT', 'AFFORDABILITY', 'NOISE', 'RESILIENCE'];
        
        netScoreMetrics.forEach(domain => {
            const progressBar = document.getElementById(`${domain.toLowerCase()}-bar`);
            if (!progressBar) return;
            
            // Calculate net score from building impacts (-100 to +100)
            const netScore = this.calculateNetScore(domain);
            this.updateNetScoreBar(progressBar, netScore, domain);
        });
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
        
        progressBar.closest('.vitality-row').setAttribute('data-tooltip-data', JSON.stringify(tooltipData));
    }
    
    updateNetScoreBar(progressBar, score, domain) {
        // Clear ALL existing positioning and styling
        progressBar.style.cssText = '';
        
        // Convert score (-100 to +100) to bar display
        const absScore = Math.abs(score);
        const barPercent = Math.min(absScore, 100); // 0-100% of half container width
        
        if (Math.abs(score) < 0.5) {
            // Nearly neutral - show minimal indicator at center
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
        } else if (score < 0) {
            // Negative: Red bar extending LEFT from center
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
            // Positive: Green bar extending RIGHT from center
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
            type: 'net-score',
            domain: domain,
            score: score,
            buildingCount: this.getBuildingCountForDomain(domain),
            impactDetails: this.getDomainImpactBreakdown(domain)
        };
        
        progressBar.closest('.vitality-row').setAttribute('data-tooltip-data', JSON.stringify(tooltipData));
    }
    
    getBuildingCountForDomain(domain) {
        let count = 0;
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.domainImpacts && building.domainImpacts[domain] && Math.abs(building.domainImpacts[domain]) > 0) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
    
    getDomainImpactBreakdown(domain) {
        const breakdown = {};
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.domainImpacts && building.domainImpacts[domain] && Math.abs(building.domainImpacts[domain]) > 0) {
                        if (!breakdown[building.name]) {
                            breakdown[building.name] = { count: 0, totalImpact: 0, unitImpact: building.domainImpacts[domain] };
                        }
                        breakdown[building.name].count++;
                        breakdown[building.name].totalImpact += building.domainImpacts[domain];
                    }
                }
            }
        }
        return breakdown;
    }
    
    calculateNetScore(domain) {
        // Sum all building impacts for this domain across the city
        let netScore = 0;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel && parcel.building) {
                    const building = this.buildingManager.getBuildingById(parcel.building);
                    if (building && building.domainImpacts && building.domainImpacts[domain]) {
                        netScore += building.domainImpacts[domain];
                    }
                }
            }
        }
        
        // Clamp to -100 to +100 range for display
        return Math.max(-100, Math.min(100, netScore));
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
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width - 40;
        this.canvas.height = rect.height - 40;
        
        
        
        // Calculate diamond dimensions for a rotated square
        // In isometric view, a tile appears as a diamond with 2:1 width:height ratio
        const diamondWidth = Math.min(this.canvas.width, this.canvas.height * 2) / this.gridSize * 0.8; // Back to original scale
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
    
    drawTile(col, row, color, elevation = 0) {
        // Track draw call for performance monitoring
        if (this.perfMonitor) {
            this.perfMonitor.recordDraw('tile');
        }
        
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;
        
        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);
        
        // Calculate tile size based on layer
        const sizeMultiplier = 1.0;
        const tileWidth = this.tileWidth * sizeMultiplier;
        const tileHeight = this.tileHeight * sizeMultiplier;
        
        // Draw diamond-shaped tile (rotated square)
        this.ctx.beginPath();
        this.ctx.moveTo(0, -tileHeight / 2);  // top
        this.ctx.lineTo(tileWidth / 2, 0);    // right
        this.ctx.lineTo(0, tileHeight / 2);   // bottom
        this.ctx.lineTo(-tileWidth / 2, 0);   // left
        this.ctx.closePath();
        
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        // Check if this parcel has roads along its edges and draw white lines accordingly
        this.drawParcelBorders(row, col, tileWidth, tileHeight);
        
        // Default border for areas without roads
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();
        
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
        
        this.ctx.restore();
    }
    
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

    drawEdgeParcels() {
        // Draw public infrastructure on grid lines
        if (!this.edgeParcels) return;

        this.ctx.save();
        
        // Draw horizontal edge infrastructure
        for (let row = 0; row < this.edgeParcels.horizontal.length; row++) {
            for (let col = 0; col < this.edgeParcels.horizontal[row].length; col++) {
                const edgeParcel = this.edgeParcels.horizontal[row][col];
                if (this.hasInfrastructure(edgeParcel)) {
                    this.drawHorizontalInfrastructure(row, col, edgeParcel);
                }
            }
        }

        // Draw vertical edge infrastructure
        for (let row = 0; row < this.edgeParcels.vertical.length; row++) {
            for (let col = 0; col < this.edgeParcels.vertical[row].length; col++) {
                const edgeParcel = this.edgeParcels.vertical[row][col];
                if (this.hasInfrastructure(edgeParcel)) {
                    this.drawVerticalInfrastructure(row, col, edgeParcel);
                }
            }
        }

        // Draw intersection infrastructure
        for (let row = 0; row < this.edgeParcels.intersections.length; row++) {
            for (let col = 0; col < this.edgeParcels.intersections[row].length; col++) {
                const edgeParcel = this.edgeParcels.intersections[row][col];
                if (this.hasIntersectionInfrastructure(edgeParcel)) {
                    this.drawIntersectionInfrastructure(row, col, edgeParcel);
                }
            }
        }

        this.ctx.restore();
    }

    hasInfrastructure(edgeParcel) {
        const infra = edgeParcel.infrastructure;
        return infra.roadway || infra.sidewalks || infra.bikelanes || infra.busStop || infra.subwayEntrance;
    }

    hasIntersectionInfrastructure(edgeParcel) {
        const infra = edgeParcel.infrastructure;
        return infra.crosswalks.length > 0 || infra.trafficControl;
    }

    drawHorizontalInfrastructure(row, col, edgeParcel) {
        // Draw horizontal infrastructure between row and row+1
        const startIso = this.toIsometric(col, row);
        const endIso = this.toIsometric(col, row + 1);
        
        const centerX = (startIso.x + endIso.x) / 2;
        const centerY = (startIso.y + endIso.y) / 2;

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        
        const infra = edgeParcel.infrastructure;
        let yOffset = 0;
        
        // Draw roadway (bottom layer)
        if (infra.roadway) {
            this.renderingSystem.drawRoadway(infra.roadway, 'horizontal');
        }
        
        // Draw bike lanes (vibrant green, end to end)
        if (infra.bikelanes) {
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(-this.tileWidth * 0.45, -1, this.tileWidth * 0.9, 2);
            yOffset += 3;
        }
        
        // Draw sidewalks (gray, stop short of intersections)
        if (infra.sidewalks) {
            this.ctx.fillStyle = '#888888';
            // Stop short of intersections
            this.ctx.fillRect(-this.tileWidth * 0.35, yOffset - 1, this.tileWidth * 0.7, 2);
            yOffset += 3;
        }
        
        // Draw transit stops
        if (infra.busStop) {
            this.renderingSystem.drawBusStop(infra.busStop, 'horizontal');
        }
        
        if (infra.subwayEntrance) {
            this.renderingSystem.drawSubwayEntrance(infra.subwayEntrance, 'horizontal');
        }
        
        this.ctx.restore();
    }

    drawVerticalInfrastructure(row, col, edgeParcel) {
        // Draw vertical infrastructure between col and col+1
        const startIso = this.toIsometric(col, row);
        const endIso = this.toIsometric(col + 1, row);
        
        const centerX = (startIso.x + endIso.x) / 2;
        const centerY = (startIso.y + endIso.y) / 2;

        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate(Math.PI / 2); // Rotate for vertical edge
        
        const infra = edgeParcel.infrastructure;
        let yOffset = 0;
        
        // Draw roadway (bottom layer)
        if (infra.roadway) {
            this.renderingSystem.drawRoadway(infra.roadway, 'vertical');
        }
        
        // Draw bike lanes (vibrant green, end to end)
        if (infra.bikelanes) {
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(-this.tileWidth * 0.45, -1, this.tileWidth * 0.9, 2);
            yOffset += 3;
        }
        
        // Draw sidewalks (gray, stop short of intersections)
        if (infra.sidewalks) {
            this.ctx.fillStyle = '#888888';
            // Stop short of intersections
            this.ctx.fillRect(-this.tileWidth * 0.35, yOffset - 1, this.tileWidth * 0.7, 2);
            yOffset += 3;
        }
        
        // Draw transit stops (rotate back to normal orientation for icons)
        this.ctx.rotate(-Math.PI / 2);
        if (infra.busStop) {
            this.renderingSystem.drawBusStop(infra.busStop, 'vertical');
        }
        
        if (infra.subwayEntrance) {
            this.renderingSystem.drawSubwayEntrance(infra.subwayEntrance, 'vertical');
        }
        
        this.ctx.restore();
    }

    drawIntersectionInfrastructure(row, col, edgeParcel) {
        // Draw intersection infrastructure where grid lines cross
        const iso = this.toIsometric(col + 0.5, row + 0.5);

        this.ctx.save();
        this.ctx.translate(iso.x, iso.y);
        
        const infra = edgeParcel.infrastructure;
        
        // Draw crosswalks as zebra stripes
        if (infra.crosswalks.length > 0) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            
            infra.crosswalks.forEach(direction => {
                this.renderingSystem.drawCrosswalk(direction);
            });
        }
        
        // Draw traffic control
        if (infra.trafficControl) {
            this.renderingSystem.drawTrafficControl(infra.trafficControl);
        }
        
        this.ctx.restore();
    }

    // Infrastructure drawing methods moved to RenderingSystem





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

    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row = 0, col = 0) {
        // Apply hover elevation with bouncing physics
        const isHovered = this.hoveredTile && this.hoveredTile.row === row && this.hoveredTile.col === col;
        let elevation = isHovered ? this.currentElevation : 0;
        let scale = 1.0;
        
        // No completion animations in simplified system
        
        // Get parcel to check construction status
        const parcel = this.grid[row][col];
        
        // Check if building has custom image
        const building = this.buildingManager.getBuildingById(buildingId);
        
        // Calculate construction progress if under construction
        let constructionProgress = 1.0; // Default to fully built (1.0 = full color)
        let isUnderConstruction = false;
        
        if (parcel && parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
            // Use server-synchronized construction progress if available
            if (parcel._constructionProgress !== undefined && parcel._isUnderConstruction !== undefined) {
                constructionProgress = parcel._constructionProgress;
                isUnderConstruction = parcel._isUnderConstruction;
            } else {
                // Fallback to real-time calculation (for offline/solo mode)
                const totalConstructionTimeMs = parcel.constructionDays * this.dayDuration; // Total time in milliseconds
                const elapsedTimeMs = (this.currentDay - parcel.constructionStartDay) * this.dayDuration + 
                                      (performance.now() - this.lastDayStartTime); // Include current day progress
                
                if (elapsedTimeMs < totalConstructionTimeMs) {
                    // Building is still under construction
                    isUnderConstruction = true;
                    constructionProgress = Math.max(0, Math.min(1.0, elapsedTimeMs / totalConstructionTimeMs));
                } else {
                    // Construction complete - trigger completion animation and cleanup
                    if (parcel.constructionStartDay !== null && !parcel._completionTriggered) {
                        // Trigger the completion pop animation
                        this.triggerCompletionPop(row, col);
                        parcel._completionTriggered = true; // Prevent multiple triggers
                        
                        console.log(`🎉 Building construction completed at ${row},${col}!`);
                    }
                    
                    // Clear construction data
                parcel.constructionStartDay = null;
                parcel.constructionDays = 0;
                parcel._constructionAnimating = false;
                
                // Clean up pixel row timestamps
                this.pixelRowTimestamps.delete(`${row},${col}`);
                
                // Update economic balance after construction completion
                this.economicEngine.calculateCityVitality();
                this.updateVitalityDisplay();
                
                constructionProgress = 1.0;
                }
            }
            
            // Schedule frequent re-renders during construction for smooth animation
            if (isUnderConstruction && !parcel._constructionAnimating) {
                parcel._constructionAnimating = true;
                this.scheduleConstructionAnimation(row, col);
            }
        }
        
        // Store construction data for tooltip access
        if (parcel) {
            parcel._constructionProgress = constructionProgress;
            parcel._isUnderConstruction = isUnderConstruction;
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
        if (Math.random() < 0.001) console.log('JEFH system active');
        
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
        // Don't show indicators for buildings under construction
        const parcel = this.grid[row][col];
        if (parcel?.constructionStartDay !== null && parcel?.constructionDays > 0) {
            const isUnderConstruction = (this.currentDay - parcel.constructionStartDay) < parcel.constructionDays;
            if (isUnderConstruction) {
                return; // Hide indicators during construction
            }
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
                    const isUnderConstruction = parcel.constructionStartDay !== null && 
                        parcel.constructionDays > 0 && 
                        (this.currentDay - parcel.constructionStartDay) < parcel.constructionDays;
                    if (isUnderConstruction) continue;
                    
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
        
        // Get land value for this parcel
        const landValue = parcel?.landValue?.calculatedValue || this.getParcelPrice(row, col);
        
        // Handle edge cases
        if (!landValue || landValue <= 0) {
            return '#2a2a2a'; // Neutral gray for no value
        }
        
        // Calculate global land value range for normalization
        let minValue = Infinity;
        let maxValue = 0;
        
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const p = this.grid[r][c];
                const value = p?.landValue?.calculatedValue || this.getParcelPrice(r, c);
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
            // Positive cashflow: green scale
            const intensity = Math.min(cashflow / maxCashflow, 1);
            const greenValue = Math.round(intensity * 200 + 55); // 55-255 range
            return `rgb(0, ${greenValue}, 0)`;
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
            const dailyLVTRate = 0.50 / 365; // 50% annual LVT (matching existing system)
            landTax = parcel.landValue.paidPrice * dailyLVTRate;
        }
        
        return revenue - maintenanceCost - landTax;
    }
    
    // drawCashflowNumbers() moved to RenderingSystem
    // drawCashflowNumber() moved to RenderingSystem
    
    
    // Legacy transportation drawing functions removed - will be redesigned from scratch
    
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
    
    drawScene() {
        // Check if we're in mobility layer mode - use completely different rendering
        if (this.currentLayer === 'mobility') {
            // Use the new mobility layer rendering system
            this.mobilityLayer.render(this.ctx);
            return;
        }
        
        // Apply zoom and pan transformations for normal rendering
        this.ctx.save();
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoomScale, this.zoomScale);
        
        // Check if we're in special layer mode
        if (false) {
            // Future special layer rendering
        } else {
            // Normal isometric rendering
            this.ctx.beginPath();
            
            for (let row = 0; row < this.gridSize; row++) {
                for (let col = 0; col < this.gridSize; col++) {
                    const tile = this.grid[row][col];
                    if (tile) {
                        this.drawTile(col, row, this.getTileColor(row, col), tile.elevation);
                    }
                }
            }
        }
        
        // NEW: Draw parcel reach visualization if a parcel is selected
        if (this.selectedParcel) {
            this.renderingSystem.drawParcelReach();
        }
        
        // Draw hover influence radius
        if (this.hoverInfluenceRadius && this.hoverInfluenceRadius.size > 0) {
            this.drawHoverInfluenceRadius();
        }
        
        // Street edge drawing removed
        
        // Draw cashflow numbers now handled in rendering system layer overlays
        
        // Draw selection highlight (ensure it's drawn last, on top of everything)
        if (this.selectedTile && 
            this.selectedTile.row >= 0 && this.selectedTile.row < this.gridSize &&
            this.selectedTile.col >= 0 && this.selectedTile.col < this.gridSize) {
            const tile = this.grid[this.selectedTile.row][this.selectedTile.col];
            if (tile) {
                // Draw with a subtle white glow that fades with hover time
                const alpha = 0.3 * this.selectorOpacity; // Apply fade to the base alpha
                this.drawTileHighlight(this.selectedTile.col, this.selectedTile.row, 
                                     `rgba(255, 255, 255, ${alpha})`, tile.elevation);
            }
        }
        
        // Restore transformation matrix
        this.ctx.restore();
    }
    
    
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
    
    // Draw hover influence radius with different intensities for adjacent vs road-connected
    drawHoverInfluenceRadius() {
        if (!this.hoverInfluenceRadius) return;
        
        this.ctx.save();
        
        // Draw influence tiles with different colors based on connection type
        this.hoverInfluenceRadius.forEach(tileKey => {
            const isExtended = tileKey.includes(':extended');
            const actualKey = isExtended ? tileKey.split(':')[0] : tileKey;
            const [row, col] = actualKey.split(',').map(Number);
            
            // Different styling for adjacent vs road-connected
            if (isExtended) {
                // Road-connected tiles: subtle blue glow
                const alpha = 0.15;
                this.drawTileHighlight(col, row, `rgba(33, 150, 243, ${alpha})`, 0);
            } else {
                // Adjacent tiles: stronger white glow
                const alpha = 0.25;
                this.drawTileHighlight(col, row, `rgba(255, 255, 255, ${alpha})`, 0);
            }
        });
        
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
            
            // Update cursor-based illumination and start hover timing
            if (!this.hoveredTile || 
                this.hoveredTile.row !== tile.row || 
                this.hoveredTile.col !== tile.col) {
                this.hoveredTile = { row: tile.row, col: tile.col };
                this.updateParcelIllumination(this.hoveredTile);
                // this.updateBlurredBackground(); // Removed - no longer using blur
                
                // Reset hover timing and selector opacity when moving to new tile
                this.hoverStartTime = performance.now();
                this.selectorOpacity = 1.0;
                
                // Start hover lift for buildings
                const parcel = this.grid[tile.row][tile.col];
                if (parcel && parcel.building) {
                    this.startContinuousBob(); // Direct lift, no bounce
                }
            }
            // Show tooltip using stored mouse event coordinates
            if (this.lastMouseEvent) {
                this.showTooltip(tile.row, tile.col, this.lastMouseEvent.clientX, this.lastMouseEvent.clientY);
            }
        } else {
            this.selectedTile = null;
            if (this.domCache.selectedTile) {
                this.domCache.selectedTile.textContent = '--';
            }
            
            // Clear illumination when not hovering any tile
            if (this.hoveredTile) {
                this.hoveredTile = null;
                this.updateParcelIllumination(null);
                // this.updateBlurredBackground(); // Removed - no longer using blur
                
                // Reset hover timing and selector opacity
                this.hoverStartTime = null;
                this.selectorOpacity = 1.0;
                this.stopBounceAnimation();
            }
            
            this.hideTooltip();
        }
    }

    drawTileHighlight(col, row, color, elevation = 0) {
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
            
            this.debouncedMouseMove(screenX, screenY);
        };
        
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
            
            if (tile && tile.row >= 0 && tile.row < this.gridSize &&
                tile.col >= 0 && tile.col < this.gridSize) {
                
                console.log('🖱️ Valid tile clicked:', tile);
                
                // Check if clicking the same selected tile - toggle it off
                if (this.selectedTile && 
                    this.selectedTile.row === tile.row && 
                    this.selectedTile.col === tile.col &&
                    this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                    this.hideContextMenu();
                } else {
                    // Clicking any other parcel: hide previous menu and show new one
                    if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {
                        this.hideContextMenu();
                    }
                    this.showContextMenu(tile.row, tile.col, e.clientX, e.clientY);
                }
                this.hideTooltip();
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
        this.economicEngine.calculateCityVitality();
        
        // Update market stats
        const markets = ['energy', 'food', 'housing', 'jobs'];
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
    const elasticityInputs = ['energy', 'food', 'housing', 'jobs'];
    elasticityInputs.forEach(market => {
        const input = document.getElementById(`${market}-elasticity`);
        if (input) {
            window.game.marketSettings.elasticity[market] = parseFloat(input.value);
        }
    });
    
    // Update radius settings
    const radiusInputs = ['energy', 'food', 'housing', 'jobs'];
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
    
    console.log('🔄 Market settings updated:', window.game.marketSettings);
}

function resetMarketDefaults() {
    if (!window.game) return;
    
    // Reset to defaults
    window.game.marketSettings = {
        elasticity: { energy: 0.3, food: 0.5, housing: 0.7, jobs: 1.2 },
        radius: { energy: 999, food: 5, housing: 3, jobs: 4 },
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
    
    console.log('↩️ Market settings reset to defaults');
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
    
    // Load leaderboard on setup screen
    loadCityLeaderboard();
    
    // Handle browser refresh/close as permanent departure
    window.addEventListener('beforeunload', (event) => {
        if (game.multiplayerManager && game.multiplayerManager.isConnected && game.multiplayerManager.playerId) {
            // Send permanent departure signal
            try {
                // Use synchronous request for immediate departure
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/permanent-departure', false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({
                    playerId: game.multiplayerManager.playerId,
                    reason: 'browser_close'
                }));
            } catch (error) {
                console.log('Failed to send departure signal:', error);
            }
        }
    });
    
    // Player setup functionality
    const setupScreen = document.getElementById('setup-screen');
    const gameInterface = document.getElementById('game-interface');
    const playerHandle = document.getElementById('player-handle');
    const previewName = document.getElementById('preview-name');
    const previewTile = document.getElementById('preview-tile');
    const previewEmoji = previewTile?.querySelector('.preview-emoji');
    const startSoloBtn = document.getElementById('start-solo-btn');
    const joinWaitingBtn = document.getElementById('join-waiting-btn');
    
    // Debug: Check if elements exist
    console.log('🔧 Setup elements found:', {
        setupScreen: !!setupScreen,
        gameInterface: !!gameInterface,
        playerHandle: !!playerHandle,
        previewName: !!previewName,
        previewTile: !!previewTile,
        previewEmoji: !!previewEmoji,
        startSoloBtn: !!startSoloBtn,
        joinWaitingBtn: !!joinWaitingBtn,
        waitingRoom: !!document.getElementById('waiting-room')
    });
    
    
    // Expanded color palette
    const allColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#52C77E',
        '#E74C3C', '#3498DB', '#9B59B6', '#E67E22', '#F39C12', '#27AE60', '#16A085', '#2C3E50', '#34495E',
        '#FF5722', '#607D8B', '#795548', '#8BC34A', '#CDDC39', '#FFC107', '#FF9800', '#03A9F4', '#00BCD4',
        '#009688', '#4CAF50', '#8BC34A', '#FFEB3B', '#FF5722', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3'
    ];
    
    // Expanded emoji collection
    const allEmojis = [
        '🏠', '🌳', '🏗️', '🌆', '🏛️', '🌱', '🚀', '⭐', '🎯', '💎', '🔨', '🎨',
        '🏰', '🏞️', '🌉', '🗼', '🏭', '🏪', '🎪', '🎭', '🎮', '🎲', '🎵', '🎸',
        '🌟', '💫', '⚡', '🔥', '💧', '🌈', '🦋', '🌺', '🍀', '🌙', '☀️', '⛅'
    ];
    
    let selectedColor = '#52C77E';
    let selectedEmoji = '🏠';
    
    // Function to get contrasting colors
    function getContrastingColors(colors, count = 5) {
        // Sort colors by hue and brightness for good contrast
        const contrastingColors = [];
        const shuffled = [...colors].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < count && i < shuffled.length; i++) {
            contrastingColors.push(shuffled[i]);
        }
        
        return contrastingColors;
    }
    
    // Function to randomly select items
    function getRandomSelection(items, count = 5) {
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
    
    // Force setup screen to be visible and game interface to be hidden
    setupScreen.style.display = 'flex';
    gameInterface.classList.add('hidden');
    
    console.log('🔧 Setup screen forced visible');
    console.log('🔧 Game interface forced hidden');
    
    // Generate random selections
    const displayColors = getContrastingColors(allColors, 5);
    const displayEmojis = getRandomSelection(allEmojis, 5);
    
    // Randomly choose defaults from the displayed options
    selectedColor = displayColors[Math.floor(Math.random() * displayColors.length)];
    selectedEmoji = displayEmojis[Math.floor(Math.random() * displayEmojis.length)];
    
    // Update the HTML with new options
    const colorPicker = document.querySelector('.color-picker');
    const emojiPicker = document.querySelector('.emoji-picker');
    
    console.log('🔧 Picker elements found:', {
        colorPicker: !!colorPicker,
        emojiPicker: !!emojiPicker
    });
    
    if (!colorPicker || !emojiPicker) {
        console.error('❌ Setup screen picker elements not found!');
        return;
    }
    
    colorPicker.innerHTML = '';
    console.log('🎨 Creating color options:', displayColors);
    displayColors.forEach((color, index) => {
        const btn = document.createElement('button');
        btn.className = 'color-option';
        btn.dataset.color = color;
        btn.style.backgroundColor = color;
        if (color === selectedColor) btn.classList.add('selected');
        
        console.log('🎨 Created color button:', { color, element: btn });
        
        // Add click listener to each color button
        btn.addEventListener('click', () => {
            console.log('🎨 Color clicked:', color);
            document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = btn.dataset.color;
            previewTile.style.background = selectedColor;
            console.log('🎨 Preview tile updated:', previewTile.style.background);
        });
        
        colorPicker.appendChild(btn);
    });
    
    emojiPicker.innerHTML = '';
    displayEmojis.forEach((emoji, index) => {
        const btn = document.createElement('button');
        btn.className = 'emoji-option';
        btn.dataset.emoji = emoji;
        btn.textContent = emoji;
        if (emoji === selectedEmoji) btn.classList.add('selected');
        
        // Add click listener to each emoji button
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedEmoji = btn.dataset.emoji;
            previewEmoji.textContent = selectedEmoji;
        });
        
        emojiPicker.appendChild(btn);
    });
    
    // Update preview with random selections
    previewTile.style.background = selectedColor;
    previewEmoji.textContent = selectedEmoji;
    
    // Always show setup screen - don't auto-start with saved settings
    // const savedPlayerData = localStorage.getItem('theCommons_playerSettings');
    // Commented out to force setup screen to always show
    
    // Handle name input
    playerHandle.addEventListener('input', (e) => {
        const name = e.target.value || 'Player';
        previewName.textContent = name;
    });
    
    // Function to start the game (shared logic)
    function startGame(gameMode = 'solo') {
        const playerName = playerHandle.value || 'Player';
        const playerSettings = {
            name: playerName,
            color: selectedColor,
            emoji: selectedEmoji,
            gameMode: gameMode
        };
        
        // Save player settings
        localStorage.setItem('theCommons_playerSettings', JSON.stringify(playerSettings));
        
        // Get transition overlay
        const transitionOverlay = document.getElementById('transition-overlay');
        const transitionText = document.getElementById('transition-text');
        
        // Start cinematic transition - complete fade to black
        setupScreen.classList.add('fade-out');
        
        // Start transition overlay as setup begins fading (perfect overlap)
        setTimeout(() => {
            transitionOverlay.classList.add('active');
            transitionText.style.animation = 'welcomeGlow 3s ease-in-out infinite alternate';
        }, 150); // Start earlier for seamless transition
        
        // Hide setup screen completely as it finishes fading
        setTimeout(() => {
            setupScreen.style.setProperty('display', 'none', 'important');
            setupScreen.classList.add('hidden');
            setupScreen.classList.remove('visible', 'fade-out');
        }, 600); // Match the fade-out duration exactly
        
        // Enhanced loading sequence with better messages
        const messages = [
            'Initializing City Simulation',
            'Loading Economic Models', 
            'Preparing Urban Infrastructure',
            'Calculating Transit Networks',
            'Finalizing Systems'
        ];
        let messageIndex = 0;
        
        // Start first message immediately when overlay appears
        // setTimeout(() => {
        //     transitionText.textContent = messages[0];
        // }, 150);
        
        // Cycle through remaining messages with smooth transitions
        // const messageInterval = setInterval(() => {
        //     messageIndex++;
        //     if (messageIndex < messages.length) {
        //         // Fade out current text
        //         transitionText.classList.add('changing');
        //         
        //         // Change text and fade back in
        //         setTimeout(() => {
        //             transitionText.textContent = messages[messageIndex];
        //             transitionText.classList.remove('changing');
        //         }, 150);
        //     }
        // }, 180); // Smooth message progression
        
        // Prepare game interface (starts while messages are still cycling)
        setTimeout(() => {
            // Show the interface first so containers have proper dimensions
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
            
            // Now setup canvas with proper container dimensions
            setTimeout(() => {
                game.setupCanvas();
                game.render();
                game.scheduleRender();
            }, 50); // Small delay to ensure layout is complete
        }, 2800); // Extended timing for thoughtful experience
        
        // Begin game interface fade-in (distinct stage)
        setTimeout(() => {
            gameInterface.classList.add('fade-in');
        }, 3200);
        
        // Begin overlay fade-out (game UI is now visible)
        setTimeout(() => {
            transitionOverlay.classList.remove('active');
        }, 3600);
        
        // Complete transition cleanup - ensure no flashing
        setTimeout(() => {
            transitionOverlay.style.display = 'none';
            transitionText.style.animation = ''; // Stop glow animation
            
            // Ensure grid is fully drawn
            game.render();
            
            // Add canvas smooth fade-in without movement
            const canvas = document.getElementById('gameCanvas');
            if (canvas) {
                canvas.style.opacity = '0';
                canvas.style.transition = 'opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                
                // Fade canvas into view smoothly
                setTimeout(() => {
                    canvas.style.opacity = '1';
                }, 200);
            }
        }, 4000); // Extended timing for elegance
        
        // Configure the existing game object with player settings
        game.playerSettings = playerSettings;
        
        // Update player name in UI if needed
        const playerBtn = document.getElementById('player-btn');
        if (playerBtn) {
            playerBtn.innerHTML = `${playerName.toUpperCase()}<span class="indicator">▼</span>`;
        }

        // Start the game after transition completes - extended for elegance
        setTimeout(() => {
            game.startGame();
            
            // Initialize tooltip system after game starts
            if (typeof initializeTooltips === 'function') {
                initializeTooltips();
            }
            
            // Set up governance button after game is ready
            if (window.setupGovernanceButton) {
                window.setupGovernanceButton();
            }
        }, 4200); // Extended timing to match transition cleanup
        
        // Setup road adjustment controls
        // Road controls removed - segments should naturally fit without adjustments
        
        // Multiplayer removed - focusing on core mechanics
        
        // Setup context menu close listener now that game exists
        setupContextMenuCloseListener();
        
        // Setup multiplier controls after game is available
        setupMultiplierControls();
        // setupSidebarMultipliers(); // Removed - economic balance controls moved to dev tools only
        setupCashflowMenu();
        setupVitalityTooltips();
    }
    
    // Setup button event listener for new two-phase flow
    const continueToLobbyBtn = document.getElementById('continue-to-lobby-btn');
    if (continueToLobbyBtn) {
        continueToLobbyBtn.addEventListener('click', () => {
            console.log('🚀 Continuing to lobby...');
            showLobby();
        });
    }
    
    // Function to show the lobby (Phase 2) - Buttery smooth transitions
    function showLobby() {
        const setupScreen = document.getElementById('setup-screen');
        const waitingRoom = document.getElementById('waiting-room');
        
        if (!waitingRoom) {
            console.error('❌ Lobby element not found!');
            return;
        }
        
        // Stage 1: Fade out setup screen
        if (setupScreen) {
            console.log('🎬 Starting fade out transition...');
            setupScreen.classList.add('fade-out');
            
            // Stage 2: Hide setup and show lobby after fade completes
            setTimeout(() => {
                setupScreen.style.setProperty('display', 'none', 'important');
                setupScreen.classList.add('hidden');
                setupScreen.classList.remove('visible', 'fade-out');
                
                // Stage 3: Prepare and fade in lobby
                console.log('🎬 Starting fade in transition...');
                waitingRoom.classList.remove('hidden');
                waitingRoom.classList.add('visible', 'fade-in');
                
                // Clean up fade-in class after animation completes
                setTimeout(() => {
                    waitingRoom.classList.remove('fade-in');
                }, 700); // Match fade-in duration (0.7s)
                
                // Initialize lobby functionality
                initializeLobby();
            }, 600); // Match fade-out duration (0.6s)
        } else {
            // Fallback if no setup screen
            waitingRoom.classList.remove('hidden');
            waitingRoom.classList.add('visible');
            initializeLobby();
        }
    }
    
    // Initialize lobby functionality
    function initializeLobby() {
        const backBtn = document.getElementById('back-to-setup-btn');
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-message-btn');
        const startSoloBtn = document.getElementById('start-solo-from-lobby');
        const joinMultiplayerBtn = document.getElementById('join-multiplayer-queue');
        const startMultiplayerBtn = document.getElementById('start-multiplayer-game');
        const multiplayerSettings = document.getElementById('multiplayer-settings');
        
        // Add current player to lobby
        const playerName = playerHandle.value || 'Player';
        const playerSettings = {
            name: playerName,
            color: selectedColor,
            emoji: selectedEmoji
        };
        
        // Connect to WebSocket for lobby
        connectToWaitingRoom(playerSettings);
        addPlayerToRoom(playerSettings);
        
        // Back to setup button
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                hideLobby();
            });
        }
        
        // Solo play button
        if (startSoloBtn) {
            startSoloBtn.addEventListener('click', () => {
                console.log('🎮 Starting solo game from lobby...');
                hideLobby();
                startGame('solo');
            });
        }
        
        // Multiplayer queue button
        if (joinMultiplayerBtn) {
            joinMultiplayerBtn.addEventListener('click', () => {
                console.log('👥 Joining multiplayer queue...');
                // Show multiplayer settings
                if (multiplayerSettings) {
                    multiplayerSettings.style.display = 'block';
                }
                // Update UI to show "in queue" state
                joinMultiplayerBtn.classList.add('selected');
                joinMultiplayerBtn.querySelector('.mode-description').textContent = 'Looking for players...';
                
                // Reset server to normal auto-start settings
                resetMultiplayerSettings();
            });
        }
        
        // Start multiplayer game button
        if (startMultiplayerBtn) {
            startMultiplayerBtn.addEventListener('click', () => {
                console.log('🚀 Starting multiplayer game from lobby...');
                
                // Send message to server to start game for all players
                if (window.waitingRoomWS && window.waitingRoomWS.readyState === WebSocket.OPEN) {
                    window.waitingRoomWS.send(JSON.stringify({
                        type: 'START_MULTIPLAYER_GAME',
                        roomId: 'default'
                    }));
                } else {
                    // Fallback to local start if no WebSocket connection
                    console.warn('⚠️ No WebSocket connection, starting locally');
                    hideLobby();
                    startGame('multiplayer');
                }
            });
        }
        
        // Chat functionality
        if (chatInput && sendBtn) {
            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (message) {
                    // Send message to server via WebSocket
                    if (window.waitingRoomWS && window.waitingRoomWS.readyState === WebSocket.OPEN) {
                        window.waitingRoomWS.send(JSON.stringify({
                            type: 'SEND_CHAT_MESSAGE',
                            message: message,
                            roomId: 'default'
                        }));
                    }
                    chatInput.value = '';
                }
            };
            
            sendBtn.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }
    }
    
    // Function to reset multiplayer settings to enable auto-start
    function resetMultiplayerSettings() {
        if (window.waitingRoomWS && window.waitingRoomWS.readyState === WebSocket.OPEN) {
            window.waitingRoomWS.send(JSON.stringify({
                type: 'UPDATE_ROOM_SETTINGS',
                settings: {
                    minPlayers: 2,
                    targetSize: 4,
                    autoStart: true
                },
                roomId: 'default'
            }));
        }
    }
    
    // Function to disconnect from waiting room
    function disconnectFromWaitingRoom() {
        if (window.waitingRoomWS && window.waitingRoomWS.readyState === WebSocket.OPEN) {
            window.waitingRoomWS.send(JSON.stringify({
                type: 'LEAVE_WAITING_ROOM'
            }));
            window.waitingRoomWS.close();
            window.waitingRoomWS = null;
        }
    }
    
    // Function to hide lobby and return to setup - Buttery smooth transitions
    function hideLobby() {
        // Disconnect from lobby first
        disconnectFromWaitingRoom();
        
        const setupScreen = document.getElementById('setup-screen');
        const waitingRoom = document.getElementById('waiting-room');
        
        // Stage 1: Fade out lobby with reverse animation
        if (waitingRoom) {
            waitingRoom.style.animation = 'lobbyFadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse forwards';
            
            // Stage 2: Hide lobby and show setup after fade completes
            setTimeout(() => {
                waitingRoom.classList.add('hidden');
                waitingRoom.classList.remove('visible', 'fade-in');
                waitingRoom.style.animation = '';
                
                // Stage 3: Prepare and show setup screen
                if (setupScreen) {
                    setupScreen.style.setProperty('display', 'flex', 'important');
                    setupScreen.classList.remove('hidden');
                    setupScreen.classList.add('visible');
                }
            }, 500); // Match reverse animation duration
        } else if (setupScreen) {
            // Fallback if no lobby
            setupScreen.classList.remove('hidden');
            setupScreen.classList.add('visible');
        }
        
        console.log('✅ Returned to setup screen with clean class management');
    }
    
    // Function to add a player to the waiting room
    function addPlayerToRoom(player) {
        const playersList = document.getElementById('waiting-players-list');
        const playerCount = document.getElementById('player-count');
        const statusText = document.getElementById('room-status-text');
        const startBtn = document.getElementById('start-game-from-room');
        
        // Create player element
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <div class="player-avatar" style="background-color: ${player.color}">
                ${player.emoji}
            </div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">Ready</div>
            </div>
        `;
        
        playersList.appendChild(playerElement);
        
        // Player count will be updated when server responds
        playerCount.textContent = '0';
        statusText.textContent = 'Connecting to waiting room...';
    }
    
    // Function to add a chat message
    function addChatMessage(author, message, isOwn = false, isSystem = false) {
        const chatMessages = document.getElementById('chat-messages');
        
        const messageElement = document.createElement('div');
        messageElement.dataset.author = author; // Track message author
        
        if (isSystem) {
            messageElement.className = 'system-message';
            messageElement.textContent = message;
        } else {
            messageElement.className = `chat-message${isOwn ? ' own' : ''}`;
            
            const currentTime = new Date().toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-author">${author}</span>
                    <span class="message-time">${currentTime}</span>
                </div>
                <div class="message-text">${message}</div>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        
        // Limit to 12 most recent messages
        const messages = chatMessages.querySelectorAll('.chat-message, .system-message');
        if (messages.length > 12) {
            messages[0].remove();
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Function to connect to waiting room WebSocket
    function connectToWaitingRoom(playerSettings) {
        // Connect to the same WebSocket server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        window.waitingRoomWS = new WebSocket(wsUrl);
        
        window.waitingRoomWS.onopen = () => {
            console.log('🔗 Connected to waiting room WebSocket');
            
            // Join the waiting room
            window.waitingRoomWS.send(JSON.stringify({
                type: 'JOIN_WAITING_ROOM',
                player: playerSettings,
                roomId: 'default'
            }));
        };
        
        window.waitingRoomWS.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWaitingRoomMessage(data);
            } catch (error) {
                console.error('❌ Error parsing waiting room message:', error);
            }
        };
        
        window.waitingRoomWS.onclose = () => {
            console.log('📱 Waiting room WebSocket disconnected');
        };
        
        window.waitingRoomWS.onerror = (error) => {
            console.error('❌ Waiting room WebSocket error:', error);
        };
    }
    
    // Function to handle waiting room WebSocket messages
    function handleWaitingRoomMessage(data) {
        console.log('📨 Waiting room message:', data);
        
        switch (data.type) {
            case 'JOINED_WAITING_ROOM':
                updateWaitingRoomFromServer(data.room);
                break;
                
            case 'PLAYER_JOINED_ROOM':
                addPlayerToRoomFromServer(data.player);
                updatePlayerCount(data.playerCount);
                break;
                
            case 'PLAYER_LEFT_ROOM':
                removePlayerFromRoom(data.playerId);
                updatePlayerCount(data.playerCount);
                break;
                
            case 'CHAT_MESSAGE':
                addChatMessageFromServer(data.message);
                break;
                
            case 'ROOM_SETTINGS_UPDATED':
                updateRoomSettings(data.settings);
                break;
                
            case 'GAME_STARTING':
                showGameStarting(data);
                break;
                
            case 'GAME_STARTED':
                startGameFromWaitingRoom(data.players);
                break;
                
            case 'CONNECTED':
                console.log('🔗 WebSocket connected to server');
                break;
                
            case 'ERROR':
                console.error('❌ Waiting room error:', data.error, data.message);
                break;
                
            default:
                console.warn('Unknown waiting room message type:', data.type);
        }
    }
    
    // Helper functions for waiting room WebSocket integration
    function updateWaitingRoomFromServer(room) {
        // Update player list
        const playersList = document.getElementById('waiting-players-list');
        playersList.innerHTML = '';
        
        room.players.forEach(player => {
            addPlayerToRoomFromServer(player);
        });
        
        // Update chat with server messages
        room.chatMessages.forEach(message => {
            addChatMessageFromServer(message);
        });
        
        // Update room settings
        updateRoomSettings(room.settings);
        updatePlayerCount(room.players.length);
    }
    
    function addPlayerToRoomFromServer(player) {
        const playersList = document.getElementById('waiting-players-list');
        
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.dataset.playerId = player.id;
        playerElement.innerHTML = `
            <div class="player-avatar" style="background-color: ${player.color}">
                ${player.emoji}
            </div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-status">${player.status}</div>
            </div>
        `;
        
        playersList.appendChild(playerElement);
    }
    
    function removePlayerFromRoom(playerId) {
        const playerElement = document.querySelector(`[data-player-id="${playerId}"]`);
        if (playerElement) {
            const playerName = playerElement.querySelector('.player-name')?.textContent;
            playerElement.remove();
            
            // Remove chat messages from this player
            if (playerName) {
                removeChatMessagesFromPlayer(playerName);
            }
        }
    }
    
    function removeChatMessagesFromPlayer(playerName) {
        const chatMessages = document.getElementById('chat-messages');
        const messages = chatMessages.querySelectorAll('.chat-message, .system-message');
        
        messages.forEach(message => {
            if (message.dataset.author === playerName) {
                message.remove();
            }
        });
    }
    
    function addChatMessageFromServer(message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.dataset.author = message.author || 'System'; // Track message author
        
        if (message.type === 'system') {
            messageElement.className = 'system-message';
            messageElement.textContent = message.text;
        } else {
            messageElement.className = 'chat-message';
            
            const currentTime = new Date(message.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-author">${message.author}</span>
                    <span class="message-time">${currentTime}</span>
                </div>
                <div class="message-text">${message.text}</div>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        
        // Limit to 12 most recent messages
        const messages = chatMessages.querySelectorAll('.chat-message, .system-message');
        if (messages.length > 12) {
            messages[0].remove();
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    function updatePlayerCount(count) {
        const playerCount = document.getElementById('player-count');
        const statusText = document.getElementById('room-status-text');
        const startMultiplayerBtn = document.getElementById('start-multiplayer-game');
        const minPlayers = 2; // Fixed minimum for multiplayer
        
        // Update player count display
        if (playerCount) {
            playerCount.textContent = count;
        }
        
        // Update status text for lobby
        if (statusText) {
            if (count === 1) {
                statusText.textContent = 'Choose a game mode to continue';
            } else {
                statusText.textContent = `${count} players in lobby`;
            }
        }
        
        // Update multiplayer button state
        if (startMultiplayerBtn) {
            if (count >= minPlayers) {
                startMultiplayerBtn.disabled = false;
                const startInfo = startMultiplayerBtn.parentElement.querySelector('.start-info');
                if (startInfo) startInfo.textContent = 'Click to start multiplayer game';
            } else {
                startMultiplayerBtn.disabled = true;
                const startInfo = startMultiplayerBtn.parentElement.querySelector('.start-info');
                if (startInfo) startInfo.textContent = `Need at least ${minPlayers} players to start`;
            }
        }
    }
    
    function updateRoomSettings(settings) {
        const gameSizeSelect = document.getElementById('game-size-select');
        const autoStartCheckbox = document.getElementById('auto-start');
        
        if (gameSizeSelect) gameSizeSelect.value = settings.targetSize;
        if (autoStartCheckbox) autoStartCheckbox.checked = settings.autoStart;
        
        console.log('🔧 Room settings updated:', settings);
    }
    
    function showGameStarting(data) {
        const statusText = document.getElementById('room-status-text');
        if (statusText) {
            statusText.textContent = data.message;
        }
        
        // Add system message to chat
        addChatMessage('System', data.message, false, true);
    }
    
    function startGameFromWaitingRoom(players) {
        console.log('🚀 Starting multiplayer game with players:', players);
        
        // Close waiting room WebSocket
        if (window.waitingRoomWS) {
            window.waitingRoomWS.close();
            window.waitingRoomWS = null;
        }
        
        // Hide lobby and start game
        hideLobby();
        startGame('multiplayer');
    }
    
    
    // Keyboard shortcut to toggle testing mode (Ctrl+Shift+M)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            document.body.classList.toggle('testing-mode');
            const isTestingMode = document.body.classList.contains('testing-mode');
            console.log(`Testing mode ${isTestingMode ? 'enabled' : 'disabled'} - Magic link buttons now ${isTestingMode ? 'visible' : 'hidden'}`);
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
        
        console.log(`🔗 Magic link request for: ${email}`);
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
    
    const playerBtn = document.getElementById('player-btn');
    const playerMenu = document.getElementById('player-menu');
    const devtoolsPanel = document.getElementById('devtools-panel');
    // Governance button functionality - only set up after game starts
    window.setupGovernanceButton = function() {
        const governanceBtn = document.getElementById('governance-btn');
        if (governanceBtn && game) {
            governanceBtn.addEventListener('click', () => {
                console.log('Governance button clicked');
                console.log('Governance system exists:', !!game.governanceSystem);
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
        'energy-elasticity', 'food-elasticity', 'housing-elasticity', 'jobs-elasticity',
        'energy-radius', 'food-radius', 'housing-radius', 'jobs-radius',
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
    
    playerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playerMenu.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        playerMenu.classList.remove('active');
    });
    
    playerMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Devtools functionality
    // Devtools is now accessible via Ctrl+Shift+D keyboard shortcut
    
    
    document.getElementById('close-devtools').addEventListener('click', () => {
        devtoolsPanel.classList.remove('visible');
    });
    
    // Keyboard shortcut to toggle devtools (Ctrl+Shift+D)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            const devtoolsPanel = document.getElementById('devtools-panel');
            if (devtoolsPanel.classList.contains('visible')) {
                devtoolsPanel.classList.remove('visible');
            } else {
                devtoolsPanel.classList.add('visible');
                // Close player menu if open
                const playerMenu = document.querySelector('.player-menu');
                if (playerMenu) {
                    playerMenu.classList.remove('active');
                }
            }
        }
    });
    
    // FPS Monitor control in devtools
    document.getElementById('fps-monitor-mode').addEventListener('change', (e) => {
        const mode = e.target.value;
        if (window.game && window.game.perfMonitor) {
            window.game.perfMonitor.displayMode = mode;
            window.game.perfMonitor.updateDisplay();
        }
    });
    
    // Server Stats Monitor control in devtools
    document.getElementById('server-stats-toggle').addEventListener('change', (e) => {
        if (window.game && window.game.serverStatsMonitor) {
            if (e.target.checked) {
                window.game.serverStatsMonitor.show();
            } else {
                window.game.serverStatsMonitor.hide();
            }
        }
    });
    
    // Player menu options
    document.getElementById('show-leaderboard').addEventListener('click', () => {
        if (window.game) {
            window.game.showLeaderboardModal();
        }
        // Close player menu
        document.getElementById('player-menu').classList.remove('active');
    });
    
    document.getElementById('show-player-stats').addEventListener('click', () => {
        if (window.game) {
            window.game.showPlayerStatsModal();
        }
        // Close player menu
        document.getElementById('player-menu').classList.remove('active');
    });
    
    document.getElementById('save-game').addEventListener('click', () => {
        if (window.game) {
            window.game.showSaveGameModal();
        }
        // Close player menu
        document.getElementById('player-menu').classList.remove('active');
    });
    
    document.getElementById('confirm-save').addEventListener('click', () => {
        if (window.game) {
            window.game.saveGame();
        }
    });
    
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
    document.getElementById('refresh-csv-btn').addEventListener('click', async () => {
        const btn = document.getElementById('refresh-csv-btn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '⏳ Refreshing...';
            btn.disabled = true;
            
            if (window.refreshBuildingsFromCSV) {
                await window.refreshBuildingsFromCSV();
                btn.innerHTML = '✅ Refreshed!';
                
                // Update the building list in devtools
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
        yOffsetValue.textContent = yOffsetSlider.value + 'px';
        heightValue.textContent = heightSlider.value + 'x';
        widthValue.textContent = widthSlider.value + 'x';
        
        debugYOffset.textContent = yOffsetSlider.value;
        debugHeight.textContent = heightSlider.value;
        debugWidth.textContent = widthSlider.value;
    }
    
    yOffsetSlider.addEventListener('input', () => {
        window.buildingPositionControls.yOffset = parseInt(yOffsetSlider.value);
        updateBuildingPositionDisplay();
        game.scheduleRender();
    });
    
    heightSlider.addEventListener('input', () => {
        window.buildingPositionControls.heightMultiplier = parseFloat(heightSlider.value);
        updateBuildingPositionDisplay();
        game.scheduleRender();
    });
    
    widthSlider.addEventListener('input', () => {
        window.buildingPositionControls.widthMultiplier = parseFloat(widthSlider.value);
        updateBuildingPositionDisplay();
        game.scheduleRender();
    });
    
    document.getElementById('reset-building-position').addEventListener('click', () => {
        yOffsetSlider.value = 22;
        heightSlider.value = 1.0;
        widthSlider.value = 1.0;
        
        window.buildingPositionControls.yOffset = 22;
        window.buildingPositionControls.heightMultiplier = 1.0;
        window.buildingPositionControls.widthMultiplier = 1.0;
        
        updateBuildingPositionDisplay();
        game.scheduleRender();
    });
    
    document.getElementById('apply-position').addEventListener('click', () => {
        // Position applied (removed alert)
    });
    
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
        setupVitalityTooltips();
    }
    if (typeof setupMetricTooltips === 'function') {
        setupMetricTooltips();
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
    
    // Building creator functionality
    document.getElementById('create-building').addEventListener('click', () => {
        const name = document.getElementById('building-name').value;
        const category = document.getElementById('building-category').value;
        
        if (!name.trim()) {
            return; // No building name entered
            return;
        }
        
        // Collect all form data
        const buildingData = {
            id: `custom_${category}_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            images: {
                construction: document.getElementById('construction-image').value,
                built: document.getElementById('built-image').value
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
            prerequisites: document.getElementById('prerequisites').value
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0),
            impacts: {}
        };
        
        // Collect domain impacts
        document.querySelectorAll('.impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            if (value !== 0) {
                buildingData.impacts[domain] = value;
            }
        });
        
        
        // Building created successfully (removed alert)
    });
    
    document.getElementById('export-building').addEventListener('click', () => {
        const name = document.getElementById('building-name').value;
        const category = document.getElementById('building-category').value;
        
        if (!name.trim()) {
            return; // No building name entered
            return;
        }
        
        // Collect all form data (same as create building)
        const buildingData = {
            id: `custom_${category}_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            images: {
                construction: document.getElementById('construction-image').value,
                built: document.getElementById('built-image').value
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
            prerequisites: document.getElementById('prerequisites').value
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0),
            impacts: {}
        };
        
        document.querySelectorAll('.impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            if (value !== 0) {
                buildingData.impacts[domain] = value;
            }
        });
        
        // Create downloadable JSON file
        const jsonString = JSON.stringify(buildingData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${buildingData.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    
    document.getElementById('reset-form').addEventListener('click', () => {
        // Reset all form fields to defaults
        document.getElementById('building-name').value = '';
        document.getElementById('building-category').value = 'education';
        document.getElementById('construction-image').value = '';
        document.getElementById('built-image').value = '';
        document.getElementById('build-cost').value = '1000';
        document.getElementById('construction-days').value = '30';
        document.getElementById('max-revenue').value = '0';
        document.getElementById('maintenance-cost').value = '10';
        document.getElementById('jobs-created').value = '0';
        document.getElementById('bedrooms-added').value = '0';
        document.getElementById('population-required').value = '0';
        document.getElementById('energy-demand').value = '0';
        document.getElementById('food-production').value = '0';
        document.getElementById('decay-rate').value = '0.1';
        document.getElementById('prerequisites').value = '';
        document.querySelectorAll('.impact-row input').forEach(input => {
            input.value = '0';
        });
    });

    // Amenity Creator functionality
    let buildingImageCounter = 1;

    document.getElementById('add-building-image').addEventListener('click', () => {
        const container = document.getElementById('building-images-container');
        const newRow = document.createElement('div');
        newRow.className = 'building-image-row';
        newRow.innerHTML = `
            <div class="form-group">
                <label>Building Type</label>
                <input type="text" class="building-type-input" placeholder="e.g. single_family_home">
            </div>
            <div class="form-group">
                <label>Image URL with Amenity</label>
                <input type="url" class="building-image-input" placeholder="https://...">
            </div>
            <button type="button" class="remove-image-btn">×</button>
        `;
        
        container.appendChild(newRow);
        buildingImageCounter++;
        
        // Add remove functionality to new button
        newRow.querySelector('.remove-image-btn').addEventListener('click', () => {
            container.removeChild(newRow);
        });
    });

    // Add remove functionality to initial row
    document.querySelector('.remove-image-btn').addEventListener('click', function() {
        const rows = document.querySelectorAll('.building-image-row');
        if (rows.length > 1) {
            this.closest('.building-image-row').remove();
        }
    });

    document.getElementById('create-amenity').addEventListener('click', () => {
        const name = document.getElementById('amenity-name').value;
        const category = document.getElementById('amenity-category').value;
        
        if (!name.trim()) {
            return; // No amenity name entered
            return;
        }
        
        // Collect building images
        const buildingImages = {};
        document.querySelectorAll('.building-image-row').forEach(row => {
            const buildingType = row.querySelector('.building-type-input').value.trim();
            const imageUrl = row.querySelector('.building-image-input').value.trim();
            if (buildingType && imageUrl) {
                buildingImages[buildingType] = imageUrl;
            }
        });
        
        const amenityData = {
            id: `custom_amenity_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            economics: {
                installCost: parseInt(document.getElementById('amenity-cost').value) || 0,
                installationDays: parseInt(document.getElementById('amenity-install-days').value) || 1,
                maintenanceCost: parseInt(document.getElementById('amenity-maintenance').value) || 0,
                energyImpact: parseInt(document.getElementById('amenity-energy').value) || 0
            },
            decay: {
                rate: parseFloat(document.getElementById('amenity-decay-rate').value) || 3.0
            },
            buildingImages: buildingImages,
            prerequisites: {
                buildings: document.getElementById('amenity-building-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0),
                amenities: document.getElementById('amenity-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
            },
            impacts: {}
        };
        
        // Collect domain impacts from amenity tab
        document.querySelector('#amenity-creator .impact-grid').querySelectorAll('.impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            if (value !== 0) {
                amenityData.impacts[domain] = value;
            }
        });
        
        
        // Amenity created successfully (removed alert)
    });

    document.getElementById('export-amenity').addEventListener('click', () => {
        const name = document.getElementById('amenity-name').value;
        const category = document.getElementById('amenity-category').value;
        
        if (!name.trim()) {
            return; // No amenity name entered
            return;
        }
        
        // Collect building images
        const buildingImages = {};
        document.querySelectorAll('.building-image-row').forEach(row => {
            const buildingType = row.querySelector('.building-type-input').value.trim();
            const imageUrl = row.querySelector('.building-image-input').value.trim();
            if (buildingType && imageUrl) {
                buildingImages[buildingType] = imageUrl;
            }
        });
        
        const amenityData = {
            id: `custom_amenity_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            economics: {
                installCost: parseInt(document.getElementById('amenity-cost').value) || 0,
                installationDays: parseInt(document.getElementById('amenity-install-days').value) || 1,
                maintenanceCost: parseInt(document.getElementById('amenity-maintenance').value) || 0,
                energyImpact: parseInt(document.getElementById('amenity-energy').value) || 0
            },
            decay: {
                rate: parseFloat(document.getElementById('amenity-decay-rate').value) || 3.0
            },
            buildingImages: buildingImages,
            prerequisites: {
                buildings: document.getElementById('amenity-building-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0),
                amenities: document.getElementById('amenity-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
            },
            impacts: {}
        };
        
        document.querySelector('#amenity-creator .impact-grid').querySelectorAll('.impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            if (value !== 0) {
                amenityData.impacts[domain] = value;
            }
        });
        
        // Create downloadable JSON file
        const jsonString = JSON.stringify(amenityData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${amenityData.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    document.getElementById('reset-amenity-form').addEventListener('click', () => {
        // Reset all amenity form fields
        document.getElementById('amenity-name').value = '';
        document.getElementById('amenity-category').value = 'energy';
        document.getElementById('amenity-cost').value = '500';
        document.getElementById('amenity-install-days').value = '7';
        document.getElementById('amenity-maintenance').value = '1';
        document.getElementById('amenity-energy').value = '0';
        document.getElementById('amenity-decay-rate').value = '0.05';
        document.getElementById('amenity-building-prereqs').value = '';
        document.getElementById('amenity-prereqs').value = '';
        
        // Reset building images to just one row
        const container = document.getElementById('building-images-container');
        container.innerHTML = `
            <div class="building-image-row">
                <div class="form-group">
                    <label>Building Type</label>
                    <input type="text" class="building-type-input" placeholder="e.g. apartment_building">
                </div>
                <div class="form-group">
                    <label>Image URL with Amenity</label>
                    <input type="url" class="building-image-input" placeholder="https://...">
                </div>
                <button type="button" class="remove-image-btn">×</button>
            </div>
        `;
        
        // Re-add remove functionality
        document.querySelector('.remove-image-btn').addEventListener('click', function() {
            const rows = document.querySelectorAll('.building-image-row');
            if (rows.length > 1) {
                this.closest('.building-image-row').remove();
            }
        });
        
        // Reset domain impacts
        document.querySelector('#amenity-creator .impact-grid').querySelectorAll('.impact-row input').forEach(input => {
            input.value = '0';
        });
    });

    // File upload and image preview functionality
    function setupImagePreview(fileInput, previewDiv) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        previewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                        previewDiv.classList.add('has-image');
                        // Store the base64 data for later use
                        fileInput.dataset.imageData = e.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    return; // Invalid image file
                    fileInput.value = '';
                    previewDiv.innerHTML = '<div class="placeholder">No image selected</div>';
                    previewDiv.classList.remove('has-image');
                }
            } else {
                previewDiv.innerHTML = '<div class="placeholder">No image selected</div>';
                previewDiv.classList.remove('has-image');
                delete fileInput.dataset.imageData;
            }
        });

        // Initialize placeholder
        if (!fileInput.files.length) {
            previewDiv.innerHTML = '<div class="placeholder">No image selected</div>';
        }
    }

    // Setup image previews for building creator
    setupImagePreview(
        document.getElementById('construction-image'),
        document.getElementById('construction-preview')
    );
    setupImagePreview(
        document.getElementById('built-image'),
        document.getElementById('built-preview')
    );

    // Setup image preview for amenity building images (dynamic)
    function setupAmenityImagePreviews() {
        document.querySelectorAll('.building-image-input').forEach((input, index) => {
            const previewDiv = input.nextElementSibling;
            if (previewDiv && previewDiv.classList.contains('image-preview')) {
                setupImagePreview(input, previewDiv);
            }
        });
    }

    // Initial setup for amenity images
    setupAmenityImagePreviews();

    // Override the add building image functionality to include file inputs and previews
    const originalAddImageButton = document.getElementById('add-building-image');
    originalAddImageButton.replaceWith(originalAddImageButton.cloneNode(true));
    
    document.getElementById('add-building-image').addEventListener('click', () => {
        const container = document.getElementById('building-images-container');
        const newRow = document.createElement('div');
        newRow.className = 'building-image-row';
        newRow.innerHTML = `
            <div class="form-group">
                <label>Building Type</label>
                <input type="text" class="building-type-input" placeholder="e.g. single_family_home">
            </div>
            <div class="form-group">
                <label>Image with Amenity</label>
                <input type="file" class="building-image-input" accept="image/*">
                <div class="image-preview"><div class="placeholder">No image selected</div></div>
            </div>
            <button type="button" class="remove-image-btn">×</button>
        `;
        
        container.appendChild(newRow);
        
        // Setup image preview for new row
        const newInput = newRow.querySelector('.building-image-input');
        const newPreview = newRow.querySelector('.image-preview');
        setupImagePreview(newInput, newPreview);
        
        // Add remove functionality to new button
        newRow.querySelector('.remove-image-btn').addEventListener('click', () => {
            container.removeChild(newRow);
        });
    });

    // Data persistence functionality
    const STORAGE_KEYS = {
        BUILDINGS: 'theCommons_customBuildings',
        AMENITIES: 'theCommons_customAmenities'
    };

    function saveToStorage(key, data) {
        try {
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push(data);
            localStorage.setItem(key, JSON.stringify(existing));
            return true;
        } catch (error) {
            console.error('Failed to save to storage:', error);
            return false;
        }
    }

    function loadFromStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch (error) {
            console.error('Failed to load from storage:', error);
            return [];
        }
    }

    function removeFromStorage(key, id) {
        try {
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            const filtered = existing.filter(item => item.id !== id);
            localStorage.setItem(key, JSON.stringify(filtered));
            return true;
        } catch (error) {
            console.error('Failed to remove from storage:', error);
            return false;
        }
    }

    // Update building creator to use file data and persistence
    const originalCreateBuilding = document.getElementById('create-building');
    originalCreateBuilding.replaceWith(originalCreateBuilding.cloneNode(true));

    document.getElementById('create-building').addEventListener('click', () => {
        const name = document.getElementById('building-name').value;
        const category = document.getElementById('building-category').value;
        const editingId = document.getElementById('create-building').dataset.editingId;
        const isDefaultCopy = document.getElementById('create-building').dataset.isDefaultCopy === 'true';
        
        if (!name.trim()) {
            return; // No building name entered
            return;
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
            domainImpacts: {}
        };
        
        // Collect domain impacts
        document.querySelectorAll('#building-creator .impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            buildingData.domainImpacts[domain] = value;
        });
        
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

    // Update amenity creator to use file data and persistence
    const originalCreateAmenity = document.getElementById('create-amenity');
    originalCreateAmenity.replaceWith(originalCreateAmenity.cloneNode(true));

    document.getElementById('create-amenity').addEventListener('click', () => {
        const name = document.getElementById('amenity-name').value;
        const category = document.getElementById('amenity-category').value;
        
        if (!name.trim()) {
            return; // No amenity name entered
            return;
        }
        
        // Collect building images with file data
        const buildingImages = {};
        document.querySelectorAll('.building-image-row').forEach(row => {
            const buildingType = row.querySelector('.building-type-input').value.trim();
            const imageInput = row.querySelector('.building-image-input');
            const imageData = imageInput.dataset.imageData || '';
            
            if (buildingType && imageData) {
                buildingImages[buildingType] = imageData;
            }
        });
        
        const amenityData = {
            id: `custom_amenity_${name.toLowerCase().replace(/\s+/g, '_')}`,
            name: name,
            category: category,
            economics: {
                installCost: parseInt(document.getElementById('amenity-cost').value) || 0,
                installationDays: parseInt(document.getElementById('amenity-install-days').value) || 1,
                maintenanceCost: parseInt(document.getElementById('amenity-maintenance').value) || 0,
                energyImpact: parseInt(document.getElementById('amenity-energy').value) || 0
            },
            decay: {
                rate: parseFloat(document.getElementById('amenity-decay-rate').value) || 3.0
            },
            buildingImages: buildingImages,
            prerequisites: {
                buildings: document.getElementById('amenity-building-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0),
                amenities: document.getElementById('amenity-prereqs').value
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
            },
            impacts: {},
            createdAt: new Date().toISOString()
        };
        
        // Collect domain impacts
        document.querySelector('#amenity-creator .impact-grid').querySelectorAll('.impact-row input').forEach(input => {
            const domain = input.dataset.domain;
            const value = parseInt(input.value) || 0;
            if (value !== 0) {
                amenityData.impacts[domain] = value;
            }
        });
        
        // Save to localStorage
        if (saveToStorage(STORAGE_KEYS.AMENITIES, amenityData)) {
            // Amenity created and saved successfully (removed alert)
        } else {
            // Amenity created but could not be saved (removed alert)
        }
    });

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
            
            // Set domain impacts
            document.querySelectorAll('#building-creator .impact-row input').forEach(input => {
                const domain = input.dataset.domain;
                input.value = (building.domainImpacts && building.domainImpacts[domain]) || 0;
            });
            
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
            return;
        }
        
        if (confirm(`Are you sure you want to delete "${building.name}"? This action cannot be undone.`)) {
            window.buildingManager.deleteBuilding(buildingId);
            populateBuildingList();
            // Building deleted (removed alert)
        }
    }

    // Cashflow Menu Functionality
    function setupCashflowMenu() {
        const cashflowItem = document.getElementById('cashflow-item');
        const cashflowMenu = document.getElementById('cashflow-menu');
        const closeCashflowBtn = document.getElementById('close-cashflow');
        
        if (!cashflowItem || !cashflowMenu || !closeCashflowBtn) return;
        
        // Show cashflow menu on click
        cashflowItem.addEventListener('click', () => {
            showCashflowMenu();
        });
        
        // Add hover tooltip with summary numbers
        let hoverTimeout;
        cashflowItem.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            hoverTimeout = setTimeout(() => {
                showCashflowTooltip(cashflowItem);
            }, 300); // Small delay to avoid flickering
        });
        
        cashflowItem.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimeout);
            hideCashflowTooltip();
        });
        
        // Close cashflow menu
        closeCashflowBtn.addEventListener('click', () => {
            hideCashflowMenu();
        });
        
        // Close modal on backdrop click
        cashflowMenu.addEventListener('click', (e) => {
            if (e.target.id === 'cashflow-menu') {
                hideCashflowMenu();
            }
        });
        
        // Setup table sorting
        setupTableSorting();
    }
    
    function showCashflowMenu() {
        const modal = document.getElementById('cashflow-menu');
        
        if (!modal) {
            console.error('Cashflow modal not found!');
            return;
        }
        
        // Move modal to body to ensure it's not hidden by parent elements
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        
        // Apply visible styles
        modal.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.8) !important;
            z-index: 99999 !important;
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            align-items: center !important;
            justify-content: center !important;
        `;
        
        modal.classList.add('visible');
        
        // Ensure modal content is visible
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.display = 'block';
            modalContent.style.visibility = 'visible';
            modalContent.style.opacity = '1';
        }
        
        // Trigger cashflow calculation to get current data
        game.calculateCurrentCashflow();
        populateCashflowData();
    }
    
    function hideCashflowMenu() {
        const modal = document.getElementById('cashflow-menu');
        
        if (modal) {
            modal.classList.remove('visible');
            // Reset inline styles
            modal.style.cssText = '';
            
            // Also reset modal content styles
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.cssText = '';
            }
        }
    }
    
    function showCashflowTooltip(element) {
        // Calculate current cashflow data
        game.calculateCurrentCashflow();
        const totals = game.dailyCashflowTotals || { revenue: 0, maintenance: 0, lvt: 0, netCashflow: 0 };
        
        // Create tooltip content
        const tooltipContent = `
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 200px;">
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">Revenue:</span>
                    <span style="color: #4CAF50; font-weight: 600;">$${totals.revenue.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">Maintenance:</span>
                    <span style="color: #F44336; font-weight: 600;">-$${Math.abs(totals.maintenance).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">LVT:</span>
                    <span style="color: #F44336; font-weight: 600;">-$${Math.abs(totals.lvt).toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid #444; padding-top: 4px; margin-top: 4px;">
                    <span style="color: #ccc; font-weight: 600;">Net Daily:</span>
                    <span style="color: ${totals.netCashflow >= 0 ? '#FFD700' : '#F44336'}; font-weight: 700;">$${totals.netCashflow.toLocaleString()}</span>
                </div>
            </div>
        `;
        
        // Use the existing tooltip system with HTML enabled
        if (game.tooltipManager) {
            const rect = element.getBoundingClientRect();
            // Position tooltip below the top bar (40px height + small margin)
            const x = rect.left + rect.width / 2;
            const y = rect.bottom + 10; // Position below the element with 10px margin
            game.tooltipManager.show(tooltipContent, x, y, {
                html: true,
                delay: 0,
                maxWidth: 250
            });
        }
    }
    
    function hideCashflowTooltip() {
        if (game.tooltipManager) {
            game.tooltipManager.hide();
        }
    }
    
    function populateCashflowData() {
        const totals = game.dailyCashflowTotals || { revenue: 0, maintenance: 0, lvt: 0, netCashflow: 0 };
        const breakdown = game.cashflowBreakdown || [];
        
        // Update summary
        document.getElementById('total-revenue').textContent = `$${Math.round(totals.revenue).toLocaleString()}`;
        document.getElementById('total-maintenance').textContent = `-$${Math.round(totals.maintenance).toLocaleString()}`;
        document.getElementById('total-lvt').textContent = `-$${Math.round(totals.lvt).toLocaleString()}`;
        
        const netDaily = Math.round(totals.netCashflow);
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
                <td>${item.buildingAge || 0} days</td>
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
    
    function setupTableSorting() {
        const table = document.getElementById('cashflow-table');
        const headers = table.querySelectorAll('th.sortable');
        
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.getAttribute('data-sort');
                sortTable(sortKey, header);
            });
        });
    }
    
    function sortTable(key, headerElement) {
        const tbody = document.getElementById('cashflow-tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // Toggle sort direction
        const isAscending = !headerElement.classList.contains('sorted-asc');
        
        // Clear all sort indicators
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        
        // Set current sort indicator
        headerElement.classList.add(isAscending ? 'sorted-asc' : 'sorted-desc');
        
        // Sort rows
        rows.sort((a, b) => {
            let aVal, bVal;
            
            // Get data from game breakdown rather than DOM for accuracy
            const aCoords = a.cells[0].textContent;
            const bCoords = b.cells[0].textContent;
            const breakdown = game.cashflowBreakdown || [];
            
            const aData = breakdown.find(item => item.coordinates === aCoords);
            const bData = breakdown.find(item => item.coordinates === bCoords);
            
            if (!aData || !bData) return 0;
            
            switch (key) {
                case 'coordinates':
                    aVal = aCoords;
                    bVal = bCoords;
                    break;
                case 'buildingName':
                    aVal = aData.buildingName;
                    bVal = bData.buildingName;
                    break;
                case 'buildingAge':
                    aVal = aData.buildingAge;
                    bVal = bData.buildingAge;
                    break;
                case 'decay':
                    aVal = aData.decay;
                    bVal = bData.decay;
                    break;
                case 'landValue':
                    aVal = aData.landValue;
                    bVal = bData.landValue;
                    break;
                case 'revenue':
                    aVal = aData.revenue;
                    bVal = bData.revenue;
                    break;
                case 'maintenance':
                    aVal = aData.maintenance;
                    bVal = bData.maintenance;
                    break;
                case 'lvt':
                    aVal = aData.lvt;
                    bVal = bData.lvt;
                    break;
                case 'netCashflow':
                    aVal = aData.netCashflow;
                    bVal = bData.netCashflow;
                    break;
                default:
                    return 0;
            }
            
            // Handle numeric vs string sorting
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return isAscending ? aVal - bVal : bVal - aVal;
            } else {
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                if (isAscending) {
                    return aStr.localeCompare(bStr);
                } else {
                    return bStr.localeCompare(aStr);
                }
            }
        });
        
        // Re-append sorted rows
        rows.forEach(row => tbody.appendChild(row));
    }
    
    // Transportation modal functions removed - now using modular transportation system
    
    // Setup governance modal event handlers
    function setupGovernanceModal() {
        // Close modal button
        document.getElementById('close-governance-modal').addEventListener('click', () => {
            game.hideGovernanceModal();
        });
        
        // Close modal on backdrop click
        document.getElementById('governance-modal').addEventListener('click', (e) => {
            if (e.target.id === 'governance-modal') {
                game.hideGovernanceModal();
            }
        });
        
        // Budget category voting buttons
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.getAttribute('data-category');
                const action = btn.getAttribute('data-action');
                const change = action === 'increase' ? 1 : -1;
                
                game.allocateVoteToCategory(category, change);
            });
        });
        
        // LVT point allocation buttons
        document.getElementById('lvt-increase-btn').addEventListener('click', () => {
            game.allocateLVTPoint(1);
        });
        
        document.getElementById('lvt-decrease-btn').addEventListener('click', () => {
            game.allocateLVTPoint(-1);
        });
        
        // Apply changes button - removed as element doesn't exist in current HTML
        // Governance changes are now applied automatically
        
        // Setup governance tooltips - now handled by external tooltip-manager.js
        if (typeof setupGovernanceTooltips === 'function') {
            setupGovernanceTooltips();
        }
    }
    
    // Initialize governance modal
    setupGovernanceModal();


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
            const valueDisplay = slider.parentElement.querySelector('.multiplier-value');
            
            if (!slider || !valueDisplay) return;
            
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
        document.getElementById('reset-multipliers').addEventListener('click', () => {
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
        
        // Apply button (mainly for feedback, changes are already applied in real-time)
        document.getElementById('apply-multipliers').addEventListener('click', () => {
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

    // Setup integrated sidebar multipliers (integrated into main sidebar)
    // REMOVED - Economic balance controls are now only in dev tools
    /*
    function setupSidebarMultipliers() {
        // Setup sidebar sliders - map to same properties as devtools
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
                
                // Sync with devtools panel if it exists
                syncDevtoolsSlider(propertyName, value);
                
                // Recalculate vitality in real-time
                window.game.calculateCityVitality();
                window.game.updateVitalityDisplay();
            });
        });
        
        // Sidebar reset button
        document.getElementById('sidebar-reset-multipliers').addEventListener('click', () => {
            if (confirm('Reset all multipliers to default values?')) {
                Object.keys(sidebarSliders).forEach(sliderId => {
                    const slider = document.getElementById(sliderId);
                    const propertyName = sidebarSliders[sliderId];
                    const defaultValue = getDefaultMultiplier(propertyName);
                    
                    slider.value = defaultValue;
                    window.game.economicMultipliers[propertyName] = defaultValue;
                    
                    const valueDisplay = slider.parentElement.querySelector('.multiplier-value-compact');
                    updateSidebarValueDisplay(slider, valueDisplay, propertyName);
                    
                    // Clear localStorage
                    localStorage.removeItem(`multiplier_${propertyName}`);
                    
                    // Sync with devtools
                    syncDevtoolsSlider(propertyName, defaultValue);
                });
                
                // Recalculate
                window.game.calculateCityVitality();
                window.game.updateVitalityDisplay();
            }
        });
        
        // Sidebar apply button
        document.getElementById('sidebar-apply-multipliers').addEventListener('click', () => {
            // Force recalculation
            window.game.calculateCityVitality();
            window.game.updateVitalityDisplay();
            
            // Visual feedback
            const btn = document.getElementById('sidebar-apply-multipliers');
            const originalText = btn.textContent;
            btn.textContent = 'Applied!';
            btn.style.background = '#42B96E';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 1000);
        });
    }
    */

    // REMOVED - Part of sidebar economic balance controls
    /*
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

    function syncDevtoolsSlider(propertyName, value) {
        // Map property names to devtools slider IDs
        const devtoolsSliderMap = {
            energy: 'energy-multiplier',
            food: 'food-multiplier',
            housing: 'housing-multiplier',
            jobs: 'jobs-multiplier',
            populationGrowthRate: 'population-growth-rate',
            baseRevenue: 'base-revenue-multiplier',
            maintenance: 'maintenance-multiplier'
        };
        
        const devtoolsSliderId = devtoolsSliderMap[propertyName];
        if (devtoolsSliderId) {
            const devtoolsSlider = document.getElementById(devtoolsSliderId);
            if (devtoolsSlider) {
                devtoolsSlider.value = value;
                const valueDisplay = devtoolsSlider.parentElement.querySelector('.multiplier-value');
                if (valueDisplay) {
                    updateValueDisplay(devtoolsSlider, valueDisplay, propertyName);
                }
            }
        }
    }

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

// Setup road adjustment controls
function setupRoadControls(game) {
    const roadAngle = document.getElementById('road-angle');
    const roadAngleValue = document.getElementById('road-angle-value');
    const roadWidthMultiplier = document.getElementById('road-width-multiplier');
    const roadWidthValue = document.getElementById('road-width-value');
    const roadOffsetX = document.getElementById('road-offset-x');
    const roadOffsetXValue = document.getElementById('road-offset-x-value');
    const roadOffsetY = document.getElementById('road-offset-y');
    const roadOffsetYValue = document.getElementById('road-offset-y-value');
    
    const resetBtn = document.getElementById('reset-road-controls');
    
    // Helper function to update road values and trigger redraw (roads only!)
    function updateRoadAdjustment(property, value, displayElement, suffix = '') {
        game.roadAdjustments[property] = parseFloat(value);
        displayElement.textContent = value + suffix;
        console.log(`Road adjustment: ${property} = ${value}`, game.roadAdjustments);
        game.scheduleRender();
    }
    
    // Road angle control
    roadAngle.addEventListener('input', (e) => {
        updateRoadAdjustment('angle', e.target.value, roadAngleValue, '°');
    });
    
    // Road width multiplier control
    roadWidthMultiplier.addEventListener('input', (e) => {
        updateRoadAdjustment('widthMultiplier', e.target.value, roadWidthValue, 'x');
    });
    
    // Road X offset control
    roadOffsetX.addEventListener('input', (e) => {
        updateRoadAdjustment('offsetX', e.target.value, roadOffsetXValue, 'px');
    });
    
    // Road Y offset control
    roadOffsetY.addEventListener('input', (e) => {
        updateRoadAdjustment('offsetY', e.target.value, roadOffsetYValue, 'px');
    });
    
    // Reset button
    resetBtn.addEventListener('click', () => {
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

// City Leaderboard Functionality
async function loadCityLeaderboard() {
    const leaderboardContent = document.getElementById('leaderboard-content');
    if (!leaderboardContent) return;
    
    try {
        // Show loading state
        leaderboardContent.innerHTML = `
            <div class="leaderboard-loading">
                <div class="loading-spinner"></div>
                <span>Loading rankings...</span>
            </div>
        `;
        
        // Fetch leaderboard data from server
        const response = await fetch('/api/leaderboard?limit=10');
        const data = await response.json();
        
        if (data.success && data.leaderboard && data.leaderboard.length > 0) {
            // Display enhanced leaderboard
            const leaderboardHtml = `
                <div class="leaderboard-list">
                    ${data.leaderboard.map((city) => `
                        <div class="leaderboard-item">
                            <div class="leaderboard-rank">#${city.rank}</div>
                            <div class="leaderboard-city">
                                <div class="leaderboard-name">${city.cityName || 'Unnamed City'}</div>
                                <div class="leaderboard-meta">
                                    <span class="leaderboard-date">${city.endDate}</span>
                                    <span class="leaderboard-duration">${city.durationFormatted}</span>
                                    <span class="leaderboard-players">${city.playerCount} player${city.playerCount !== 1 ? 's' : ''}</span>
                                </div>
                                <div class="leaderboard-strategy">${formatStrategy(city.strategy)}</div>
                            </div>
                            <div class="leaderboard-score">${city.score}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            leaderboardContent.innerHTML = leaderboardHtml;
        } else {
            // No data available
            leaderboardContent.innerHTML = `
                <div class="leaderboard-loading">
                    <span style="color: #666;">No completed cities yet</span>
                    <span style="color: #444; font-size: 12px;">Be the first to build a thriving city!</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
        leaderboardContent.innerHTML = `
            <div class="leaderboard-loading">
                <span style="color: #666;">Unable to load rankings</span>
                <span style="color: #444; font-size: 12px;">Check your connection</span>
            </div>
        `;
    }
}

// Helper function to format strategy names
function formatStrategy(strategy) {
    const strategyMap = {
        'energy_focused': 'Energy Focused',
        'agricultural': 'Agricultural',
        'commercial_focused': 'Commercial',
        'residential_focused': 'Residential',
        'balanced': 'Balanced',
        'mixed': 'Mixed',
        'none': 'No Strategy',
        'unknown': 'Unknown'
    };
    return strategyMap[strategy] || strategy;
}

});