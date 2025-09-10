class IsometricGrid {
    constructor(canvas, gridSize = 14) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = gridSize;
        this.selectedTile = null;
        this.currentTool = 'grass';
        this.tooltip = document.getElementById('tooltip');
        this.contextMenu = document.getElementById('context-menu');
        
        // Performance optimizations
        this.isRenderScheduled = false;
        this.lastRenderTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Event throttling
        this.throttleTimeout = null;
        this.lastMouseMoveTime = 0;
        
        // DOM element caching for performance
        this.domCache = {
            selectedTile: null,
            gameDate: null,
            playerCash: null,
            playerWealth: null,
            cityName: null
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
        this.currentDay = 0;
        this.startGameTime();

        // Building manager handles all building data
        this.buildingManager = window.buildingManager;
        
        // Create a simple square grid
        this.grid = [];
        for (let row = 0; row < gridSize; row++) {
            this.grid[row] = [];
            for (let col = 0; col < gridSize; col++) {
                this.grid[row][col] = { 
                    type: 'grass', 
                    elevation: 0,
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
        
        // Spotlight hover effect
        this.hoveredTile = null; // {row, col} of currently hovered tile
        this.parcelOpacity = new Map(); // Map to store opacity values for each parcel
        this.opacityTransitions = new Map(); // Map to store transition animations
        
        // Sub-menu hover management
        this.currentSubmenu = null; // Currently visible submenu element
        this.submenuTimer = null; // Timer for submenu hide delay
        
        // Map layer system
        this.currentLayer = 'normal'; // 'normal', 'landvalue', 'cashflow', 'transportation'
        
        // Transportation network system
        this.transportationNetwork = {
            roads: [], // Array of road segments
            subways: [], // Array of subway segments
            busRoutes: [] // Array of bus routes
        };
        
        // Competitor names
        this.competitorNames = {
            'competitor1': 'Red Corp',
            'competitor2': 'Blue Industries',
            'competitor3': 'Green Ventures',
            'competitor4': 'Orange Holdings',
            'competitor5': 'Purple Group',
            'competitor6': 'Teal Associates'
        };
        
        // Governance system
        this.governance = {
            votingPoints: 2, // Points awarded per month
            playerVotes: {}, // Track each player's vote allocations
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
                'ubi' // Universal Basic Income
            ],
            categoryAllocations: {}, // Percentage of LVT allocated to each category
            publicCoffers: {}, // Available funds in each category
            lvtPointsAllocated: 0, // Points allocated to LVT rate changes
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
        this.transportationMode = 'road'; // 'road', 'subway', 'bus'
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
        
        this.setupCanvas();
        this.initDOMCache();
        this.populateBuildingCategories();
        this.setupEventListeners();
        this.setupZoomControls();
        this.setupLayerControls();
        this.updateVitalityDisplay();
        this.updateDemographicsDisplay();
        this.calculateCurrentCashflow(); // Initialize cashflow data
        this.updatePlayerStats();
        // Transportation network starts empty - players build from scratch
        this.scheduleRender();
    }
    
    
    // Cache frequently accessed DOM elements for performance
    initDOMCache() {
        this.domCache.selectedTile = document.getElementById('selected-tile');
        this.domCache.gameDate = document.getElementById('game-date');
        this.domCache.playerCash = document.getElementById('player-cash');
        this.domCache.playerWealth = document.getElementById('player-wealth');
        this.domCache.cityName = document.getElementById('city-name');
        this.domCache.playerCashflow = document.getElementById('player-cashflow');
    }

    populateBuildingCategories() {
        const categorySelect = document.getElementById('building-category');
        if (!categorySelect) return;
        
        // Clear existing options
        categorySelect.innerHTML = '';
        
        // Get categories from building manager
        const categories = this.buildingManager.getCategories();
        
        // If no categories available, show loading message
        if (categories.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Loading buildings...';
            categorySelect.appendChild(option);
            
            // Try to reload buildings from CSV if empty
            console.log('No building categories found, attempting to load from CSV...');
            if (this.buildingManager.isBuildingsEmpty()) {
                this.buildingManager.initializeBuildingsFromMasterCSV();
            }
            return;
        }
        
        // Add options for each category
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categorySelect.appendChild(option);
        });
    }

    startGameTime() {
        setInterval(() => {
            this.currentDay++;
            this.updateGameDate();
            this.processDailyCashflow();
            this.updatePlayerStats();
            // Re-render to update building construction stages
            this.scheduleRender();
        }, this.dayLength);
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
            
            // Award voting points and trigger governance button animation
            this.awardMonthlyVotingPoints();
            this.highlightGovernanceButton();
        } else {
            this.gameDate.day++;
        }
        
        this.domCache.gameDate.textContent = `${this.gameDate.month} ${this.gameDate.day}`;
    }

    processDailyCashflow() {
        let dailyRevenue = 0;
        let dailyMaintenance = 0;
        let dailyLVT = 0;
        
        // Store detailed breakdown for UI
        this.cashflowBreakdown = [];
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                if (parcel.owner === 'player') {
                    // Process Land Value Tax (50% annually = 0.137% daily)
                    const dailyLVTRate = 0.50 / 365; // 50% per year, paid daily
                    const landTax = parcel.landValue.paidPrice * dailyLVTRate;
                    dailyLVT += landTax;
                    
                    let buildingRevenue = 0;
                    let buildingMaintenance = 0;
                    let buildingName = 'Empty Land';
                    let buildingAge = 0;
                    let decay = 0;
                    
                    if (parcel.building) {
                        // Age the building
                        parcel.buildingAge++;
                        buildingAge = parcel.buildingAge;
                        
                        // Calculate decay (increases over time)
                        const building = this.buildingManager.getBuildingById(parcel.building);
                        if (building) {
                            buildingName = building.name;
                            
                            // Decay rate: 0.1% per day base, accelerating over time
                            const baseDecayRate = 0.001;
                            const ageMultiplier = 1 + (parcel.buildingAge / 1000); // Accelerates slowly
                            const dailyDecayIncrease = baseDecayRate * ageMultiplier;
                            parcel.decay = Math.min(1, parcel.decay + dailyDecayIncrease);
                            decay = parcel.decay;
                            
                            // Calculate revenue (already daily, affected by decay and satisfaction)
                            const maxRevenue = building.economics.maxRevenue || 0;
                            const decayMultiplier = Math.max(0, 1 - parcel.decay);
                            
                            // Apply city satisfaction multiplier (0.5 to 1.2x based on happiness)
                            const satisfactionMultiplier = 0.5 + (this.citySatisfaction?.overall || 0.5) * 0.7;
                            
                            // Apply building efficiency penalty for very unhappy cities
                            const efficiencyPenalty = this.buildingEfficiencyPenalty || 1.0;
                            
                            // Apply population growth modifier (represents changing demand/occupancy)
                            const growthModifier = this.populationGrowthModifier || 1.0;
                            
                            buildingRevenue = maxRevenue * decayMultiplier * satisfactionMultiplier * efficiencyPenalty * growthModifier;
                            dailyRevenue += buildingRevenue;
                            
                            // Calculate maintenance (already daily, increases with decay)
                            const baseMaintenance = building.economics.maintenanceCost || 0;
                            const maintenanceMultiplier = 1 + (parcel.decay * 2); // Doubles at full decay
                            buildingMaintenance = baseMaintenance * maintenanceMultiplier;
                            dailyMaintenance += buildingMaintenance;
                        }
                    }
                    
                    // Store breakdown data (preserve full precision)
                    const netCashflow = buildingRevenue - buildingMaintenance - landTax;
                    this.cashflowBreakdown.push({
                        row,
                        col,
                        coordinates: `(${row}, ${col})`,
                        buildingName,
                        buildingAge,
                        decay: decay * 100, // Convert to percentage
                        landValue: parcel.landValue.paidPrice,
                        revenue: buildingRevenue,
                        maintenance: buildingMaintenance,
                        lvt: landTax,
                        netCashflow
                    });
                }
            }
        }
        
        // Apply cashflow (preserve full precision)
        const netCashflow = dailyRevenue - dailyMaintenance - dailyLVT;
        this.playerCash += netCashflow;
        
        // Store daily totals for UI
        this.dailyCashflowTotals = {
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            lvt: dailyLVT,
            netCashflow
        };
        
        // Ensure cash doesn't go below zero
        this.playerCash = Math.max(0, this.playerCash);
        
        // Check for auction triggers
        this.checkForAuctions();
        
        // Log cashflow for debugging (can be removed later)
        if (Math.abs(netCashflow) > 0.01) {
            console.log(`Daily Cashflow: Revenue $${dailyRevenue.toFixed(2)}, Maintenance $${dailyMaintenance.toFixed(2)}, LVT $${dailyLVT.toFixed(2)}, Net: $${netCashflow.toFixed(2)}`);
        }
    }

    calculateCurrentCashflow() {
        // Calculate current cashflow without aging buildings or applying cash changes
        let dailyRevenue = 0;
        let dailyMaintenance = 0;
        let dailyLVT = 0;
        
        // Store detailed breakdown for UI
        this.cashflowBreakdown = [];
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                if (parcel.owner === 'player') {
                    // Process Land Value Tax (50% annually = 0.137% daily)
                    const dailyLVTRate = 0.50 / 365; // 50% per year, paid daily
                    const landTax = parcel.landValue.paidPrice * dailyLVTRate;
                    dailyLVT += landTax;
                    
                    let buildingRevenue = 0;
                    let buildingMaintenance = 0;
                    let buildingName = 'Empty Land';
                    let buildingAge = parcel.buildingAge || 0;
                    let decay = parcel.decay || 0;
                    
                    if (parcel.building) {
                        const building = this.buildingManager.getBuildingById(parcel.building);
                        if (building) {
                            buildingName = building.name;
                            
                            // Calculate revenue (already daily, decreases with decay)
                            const maxRevenue = building.economics.maxRevenue || 0;
                            const decayMultiplier = Math.max(0, 1 - decay);
                            buildingRevenue = maxRevenue * decayMultiplier; // Already daily revenue
                            dailyRevenue += buildingRevenue;
                            
                            // Calculate maintenance (already daily, increases with decay)
                            const baseMaintenance = building.economics.maintenanceCost || 0;
                            const maintenanceMultiplier = 1 + (decay * 2); // Doubles at full decay
                            buildingMaintenance = baseMaintenance * maintenanceMultiplier;
                            dailyMaintenance += buildingMaintenance;
                        }
                    }
                    
                    // Store breakdown data (preserve full precision)
                    const netCashflow = buildingRevenue - buildingMaintenance - landTax;
                    this.cashflowBreakdown.push({
                        row,
                        col,
                        coordinates: `(${row}, ${col})`,
                        buildingName,
                        buildingAge,
                        decay: decay * 100, // Convert to percentage
                        landValue: parcel.landValue.paidPrice,
                        revenue: buildingRevenue,
                        maintenance: buildingMaintenance,
                        lvt: landTax,
                        netCashflow
                    });
                }
            }
        }
        
        // Store daily totals for UI
        this.dailyCashflowTotals = {
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            lvt: dailyLVT,
            netCashflow: dailyRevenue - dailyMaintenance - dailyLVT
        };
    }

    checkForAuctions() {
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                
                if (parcel.owner === 'player') {
                    // Update calculated land value
                    parcel.landValue.calculatedValue = this.calculateLandValue(row, col);
                    
                    // Check if auction should trigger
                    const paidPrice = parcel.landValue.paidPrice;
                    const calculatedValue = parcel.landValue.calculatedValue;
                    const daysSinceLastAuction = this.currentDay - parcel.landValue.lastAuctionDay;
                    
                    // Trigger auction if:
                    // 1. Value has changed significantly (30% by default)
                    // 2. At least 90 days have passed since last auction
                    // 3. The parcel has been owned for at least 30 days
                    if (paidPrice > 0 && daysSinceLastAuction > 90) {
                        const valueChange = Math.abs(calculatedValue - paidPrice) / paidPrice;
                        if (valueChange > parcel.landValue.auctionThreshold) {
                            this.triggerLandAuction(row, col);
                        }
                    }
                }
            }
        }
    }

    triggerLandAuction(row, col) {
        const parcel = this.grid[row][col];
        const calculatedValue = parcel.landValue.calculatedValue;
        const paidPrice = parcel.landValue.paidPrice;
        
        // Simple auction simulation: new price is between calculated value and old price
        // Market efficiency means price moves toward calculated value but doesn't fully reach it
        const marketEfficiency = 0.7; // 70% of the gap closes
        const priceGap = calculatedValue - paidPrice;
        const newPrice = paidPrice + (priceGap * marketEfficiency);
        
        // Add some randomness to simulate market dynamics (±10%)
        const randomFactor = 0.9 + (Math.random() * 0.2); // 0.9 to 1.1
        const finalPrice = Math.max(1000, Math.round(newPrice * randomFactor)); // Minimum $1000
        
        // Update the parcel
        parcel.landValue.paidPrice = finalPrice;
        parcel.landValue.lastAuctionDay = this.currentDay;
        
        // Log the auction (can be made optional later)
        console.log(`🏛️ AUCTION: Parcel (${row},${col}) - Old: $${paidPrice.toLocaleString()}, New: $${finalPrice.toLocaleString()}, Calculated: $${calculatedValue.toLocaleString()}`);
        
        // Could trigger UI notification here
        this.showAuctionNotification(row, col, paidPrice, finalPrice);
    }

    showAuctionNotification(row, col, oldPrice, newPrice) {
        // Simple console notification for now - could be enhanced with UI alerts
        const priceChange = newPrice - oldPrice;
        const percentChange = ((priceChange / oldPrice) * 100).toFixed(1);
        const direction = priceChange > 0 ? 'increased' : 'decreased';
        
        console.log(`📈 Land value ${direction} by ${Math.abs(percentChange)}% at parcel (${row},${col})`);
        
        // Future enhancement: Add to a notifications system
        // this.addNotification({
        //     type: 'auction',
        //     message: `Land auction completed at (${row},${col}). Value ${direction} by ${Math.abs(percentChange)}%`,
        //     row, col, oldPrice, newPrice
        // });
    }

    calculatePopulation() {
        let totalBedrooms = 0;
        let totalJobs = 0;
        let schoolCapacity = 0;
        
        // Get bedroom counts and jobs from all player-owned buildings
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel.owner === 'player' && parcel.building) {
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
        
        // Calculate detailed population demographics
        const totalPopulation = Math.floor(totalBedrooms * 2.2); // Average household size
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
        let wealth = this.playerCash;
        
        // Add value of owned parcels using higher of paid price or calculated value
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel.owner === 'player') {
                    // Use the higher of the two land values
                    const landValue = Math.max(
                        parcel.landValue.paidPrice,
                        parcel.landValue.calculatedValue
                    );
                    wealth += landValue;
                    
                    // Add building values (simplified - could factor in decay later)
                    if (parcel.building) {
                        wealth += this.getBuildingValue(parcel.building);
                    }
                }
            }
        }
        
        return wealth;
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
        console.log('Debug updatePlayerStats:', {
            hasCashflowElement: !!this.domCache.playerCashflow,
            hasDailyCashflowTotals: !!this.dailyCashflowTotals,
            dailyCashflowTotals: this.dailyCashflowTotals
        });
        
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
        
        // Update population in sidebar - target the CITIZENS row specifically
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
        // Calculate distance from center (6.5, 6.5) using max of row/col distance
        const centerRow = 6.5;
        const centerCol = 6.5;
        const distanceFromCenter = Math.max(
            Math.abs(row - centerRow),
            Math.abs(col - centerCol)
        );
        
        // Center 4 parcels are $150, each ring out costs $10 less
        const basePrice = 150;
        const ring = Math.floor(distanceFromCenter);
        return Math.max(10, basePrice - (ring * 10)); // Minimum $10
    }
    
    showTooltip(row, col, mouseX, mouseY) {
        // Don't show tooltip if context menu is open
        if (this.contextMenu.classList.contains('visible')) {
            return;
        }
        
        const parcel = this.grid[row][col];
        const coord = this.getParcelCoordinate(row, col);
        
        this.tooltip.querySelector('.parcel-coord').textContent = coord;
        
        const tooltipPrice = this.tooltip.querySelector('.tooltip-price');
        const tooltipBuilding = this.tooltip.querySelector('.tooltip-building');
        
        if (parcel.building) {
            // Show building information instead of price
            tooltipPrice.style.display = 'none';
            tooltipBuilding.style.display = 'block';
            
            const building = this.buildingManager.getBuildingById(parcel.building);
            if (building) {
                const buildingNameEl = tooltipBuilding.querySelector('.building-name');
                const buildingStatsEl = tooltipBuilding.querySelector('.building-stats');
                
                buildingNameEl.textContent = building.name;
                
                // Show key building stats
                const stats = [];
                
                // Owner information
                if (parcel.owner === 'player') {
                    const emoji = (this.playerSettings && this.playerSettings.emoji) || '🏠';
                    stats.push(`${emoji} OWNED`);
                } else if (parcel.owner) {
                    stats.push(`🏢 ${parcel.owner.toUpperCase()}`);
                }
                
                // Economic information
                if (building.economics) {
                    const revenue = building.economics.maxRevenue || 0;
                    const maintenance = building.economics.maintenanceCost || 0;
                    if (revenue > 0) stats.push(`💰 $${revenue}/day revenue`);
                    if (maintenance > 0) stats.push(`🔧 $${maintenance}/day maintenance`);
                }
                
                // Population information
                if (building.population) {
                    if (building.population.jobsCreated) {
                        stats.push(`💼 ${building.population.jobsCreated} jobs`);
                    }
                    if (building.population.bedroomsAdded) {
                        stats.push(`🛏️ ${building.population.bedroomsAdded} bedrooms`);
                    }
                }
                
                // Age and condition
                if (parcel.buildingAge) {
                    stats.push(`📅 ${parcel.buildingAge} days old`);
                }
                if (parcel.decay && parcel.decay > 0.05) {
                    const condition = parcel.decay < 0.2 ? 'Good' : 
                                    parcel.decay < 0.5 ? 'Fair' : 
                                    parcel.decay < 0.8 ? 'Poor' : 'Critical';
                    stats.push(`⚠️ Condition: ${condition}`);
                }
                
                // Land value information
                if (parcel.landValue) {
                    const currentValue = parcel.landValue.calculatedValue || 0;
                    stats.push(`🏡 Land value: $${Math.round(currentValue)}`);
                }
                
                buildingStatsEl.innerHTML = stats.map(stat => `<div>${stat}</div>`).join('');
            }
        } else {
            // Show price for empty parcels
            tooltipBuilding.style.display = 'none';
            tooltipPrice.style.display = 'block';
            
            const price = this.getParcelPrice(row, col);
            this.tooltip.querySelector('.price-value').textContent = `$${price}`;
        }
        
        // Position 30px to the right of cursor, 80px higher
        // mouseX, mouseY are now page coordinates (e.clientX, e.clientY)
        this.tooltip.style.left = `${mouseX + 30}px`;
        this.tooltip.style.top = `${mouseY - 80}px`;
        this.tooltip.classList.add('visible');
    }
    
    hideTooltip() {
        this.tooltip.classList.remove('visible');
    }
    
    showContextMenu(row, col, mouseX, mouseY) {
        const parcel = this.grid[row][col];
        const coord = this.getParcelCoordinate(row, col);
        const price = this.getParcelPrice(row, col);
        
        this.contextMenu.querySelector('.context-coord').textContent = coord;
        
        const statusEl = this.contextMenu.querySelector('.context-status');
        const contentEl = this.contextMenu.querySelector('.context-content');
        
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
            buyBtn.onclick = () => this.buyParcel(row, col);
            contentEl.appendChild(buyBtn);
            
        } else if (parcel.owner === 'player' || (this.multiplayerClient && parcel.owner === this.multiplayerClient.playerId)) {
            // Player-owned parcel (single-player or multiplayer)
            const playerName = (this.playerSettings && this.playerSettings.name) || 'PLAYER';
            statusEl.textContent = `OWNED BY ${playerName.toUpperCase()}`;
            statusEl.classList.add('owned');
            
            if (!parcel.building) {
                // Empty parcel - show auction and building categories
                this.createEmptyParcelMenu(contentEl, row, col);
            } else {
                // Built parcel - show auction, destroy, upgrade, and amenity options
                this.createBuiltParcelMenu(contentEl, row, col, parcel);
            }
            
        } else {
            // Competitor-owned or other player-owned parcel
            // Check if it's a multiplayer game and we have player data
            let ownerName = parcel.owner.toUpperCase();
            
            // Check for competitor names first
            if (this.competitorNames[parcel.owner]) {
                ownerName = this.competitorNames[parcel.owner].toUpperCase();
            } 
            // In multiplayer, try to get the actual player name
            else if (this.multiplayerClient && this.multiplayerClient.playerData) {
                // Check if we have player info from the multiplayer session
                const players = this.multiplayerClient.lastKnownPlayers || [];
                const player = players.find(p => p.id === parcel.owner);
                if (player && player.name) {
                    ownerName = player.name.toUpperCase();
                }
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
        this.contextMenu.style.left = `${mouseX + 30}px`;
        this.contextMenu.style.top = `${mouseY - 80}px`;
        this.contextMenu.classList.add('visible');
    }
    
    hideContextMenu() {
        this.contextMenu.classList.remove('visible');
    }
    
    showTransportationModal(row, col) {
        const parcel = this.grid[row][col];
        const coord = this.getParcelCoordinate(row, col);
        const landValue = Math.max(parcel.landValue.paidPrice, parcel.landValue.calculatedValue);
        
        // Update modal content
        document.getElementById('modal-parcel-coord').textContent = coord;
        document.getElementById('modal-land-value').textContent = landValue >= 1000 ? 
            `$${(landValue/1000).toFixed(1)}k` : `$${landValue.toFixed(0)}`;
        
        // Load current road configuration for this parcel
        this.loadParcelRoadConfiguration(row, col);
        
        // Show modal
        document.getElementById('transportation-modal').classList.add('visible');
        
        // Store current parcel for later use
        this.currentModalParcel = { row, col };
    }
    
    hideTransportationModal() {
        document.getElementById('transportation-modal').classList.remove('visible');
        this.currentModalParcel = null;
    }
    
    loadParcelRoadConfiguration(row, col) {
        // Reset all selects to "none"
        ['north', 'east', 'south', 'west'].forEach(side => {
            document.getElementById(`road-${side}`).value = 'none';
        });
        
        // Load existing roads that connect to this parcel's edges
        this.transportationNetwork.roads.forEach(road => {
            const roadSide = this.getRoadSideForParcel(road, row, col);
            if (roadSide) {
                document.getElementById(`road-${roadSide}`).value = road.type;
            }
        });
        
        // Update cost calculation
        this.updateRoadCostDisplay();
    }
    
    getRoadSideForParcel(road, row, col) {
        // Determine which side of the parcel this road affects
        const { startRow, startCol, endRow, endCol } = road;
        
        // Check if road runs along parcel edges
        if (startRow === endRow) {
            // Horizontal road
            if (startRow === row - 0.5) return 'north';
            if (startRow === row + 0.5) return 'south';
        } else if (startCol === endCol) {
            // Vertical road
            if (startCol === col - 0.5) return 'west';
            if (startCol === col + 0.5) return 'east';
        }
        
        return null;
    }
    
    updateRoadCostDisplay() {
        let totalCost = 0;
        
        ['north', 'east', 'south', 'west'].forEach(side => {
            const roadType = document.getElementById(`road-${side}`).value;
            if (roadType !== 'none') {
                totalCost += this.getRoadCost(roadType);
            }
            
            // Add amenity costs for this side
            const amenitiesContainer = document.getElementById(`amenities-${side}`);
            if (amenitiesContainer) {
                const checkedAmenities = amenitiesContainer.querySelectorAll('input[type="checkbox"]:checked');
                checkedAmenities.forEach(checkbox => {
                    const cost = parseInt(checkbox.getAttribute('data-cost')) || 0;
                    totalCost += cost;
                });
            }
        });
        
        document.getElementById('total-road-cost').textContent = `$${totalCost.toLocaleString()}`;
        
        // Update road visuals
        this.updateRoadVisuals();
    }
    
    updateRoadVisuals() {
        ['north', 'east', 'south', 'west'].forEach(side => {
            const roadType = document.getElementById(`road-${side}`).value;
            const visualElement = document.getElementById(`road-visual-${side}`);
            
            if (visualElement) {
                // Clear existing classes
                visualElement.className = 'road-visual';
                
                // Add road type class
                if (roadType !== 'none') {
                    visualElement.classList.add(roadType);
                }
            }
        });
    }
    
    getRoadCost(roadType) {
        const costs = {
            'dirt_path': 25,
            'local_street': 100,
            'arterial': 250,
            'highway': 1000
        };
        
        return costs[roadType] || 0;
    }
    
    getAmenityCost(amenityType) {
        const costs = {
            'sidewalk': 25,
            'bike_lane': 50,
            'bus_stop': 75,
            'subway_entrance': 200
        };
        
        return costs[amenityType] || 0;
    }
    
    applyRoadDesign() {
        if (!this.currentModalParcel) return;
        
        const { row, col } = this.currentModalParcel;
        
        // Calculate total cost
        let totalCost = 0;
        const roadChanges = [];
        
        ['north', 'east', 'south', 'west'].forEach(side => {
            const roadType = document.getElementById(`road-${side}`).value;
            if (roadType !== 'none') {
                totalCost += this.getRoadCost(roadType);
                
                // Collect amenities for this side
                const amenities = [];
                const amenitiesContainer = document.getElementById(`amenities-${side}`);
                if (amenitiesContainer) {
                    const checkedAmenities = amenitiesContainer.querySelectorAll('input[type="checkbox"]:checked');
                    checkedAmenities.forEach(checkbox => {
                        const amenityType = checkbox.getAttribute('data-amenity');
                        const cost = parseInt(checkbox.getAttribute('data-cost')) || 0;
                        totalCost += cost;
                        amenities.push(amenityType);
                    });
                }
                
                roadChanges.push({ side, roadType, amenities, row, col });
            }
        });
        
        // Check if player can afford the total cost
        if (totalCost > this.money) {
            alert(`Insufficient funds! Total cost: $${totalCost.toLocaleString()}, Available: $${this.money.toLocaleString()}`);
            return;
        }
        
        // Remove existing roads for this parcel
        this.transportationNetwork.roads = this.transportationNetwork.roads.filter(road => {
            const roadSide = this.getRoadSideForParcel(road, row, col);
            return !roadSide;
        });
        
        // Add new roads with amenities
        roadChanges.forEach(change => {
            const roadCoords = this.getParcelSideCoordinates(row, col, change.side);
            if (roadCoords) {
                this.transportationNetwork.roads.push({
                    id: `road_${Date.now()}_${Math.random()}`,
                    type: change.roadType,
                    amenities: change.amenities,
                    startRow: roadCoords.startRow,
                    startCol: roadCoords.startCol,
                    endRow: roadCoords.endRow,
                    endCol: roadCoords.endCol
                });
            }
        });
        
        // Deduct cost from money
        this.money -= totalCost;
        this.updatePlayerStats();
        
        // Hide modal
        this.hideTransportationModal();
        
        // Trigger re-render
        this.scheduleRender();
    }
    
    getParcelSideCoordinates(row, col, side) {
        // Calculate road coordinates for each side of a parcel
        // Roads occupy the spaces between parcels
        switch (side) {
            case 'north':
                return {
                    startRow: row - 0.5,
                    startCol: col - 0.5,
                    endRow: row - 0.5,
                    endCol: col + 0.5
                };
            case 'south':
                return {
                    startRow: row + 0.5,
                    startCol: col - 0.5,
                    endRow: row + 0.5,
                    endCol: col + 0.5
                };
            case 'west':
                return {
                    startRow: row - 0.5,
                    startCol: col - 0.5,
                    endRow: row + 0.5,
                    endCol: col - 0.5
                };
            case 'east':
                return {
                    startRow: row - 0.5,
                    startCol: col + 0.5,
                    endRow: row + 0.5,
                    endCol: col + 0.5
                };
            default:
                return null;
        }
    }
    
    switchTransportMode(mode) {
        // Update active button
        document.querySelectorAll('.transport-mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`${mode}-mode`).classList.add('active');
        
        // Hide all panels
        document.getElementById('road-design-panel').style.display = 'none';
        document.getElementById('bus-design-panel').style.display = 'none';
        document.getElementById('subway-design-panel').style.display = 'none';
        
        // Show selected panel
        switch (mode) {
            case 'road':
                document.getElementById('road-design-panel').style.display = 'block';
                break;
            case 'bus':
                document.getElementById('bus-design-panel').style.display = 'block';
                this.initBusRouteBuilder();
                break;
            case 'subway':
                document.getElementById('subway-design-panel').style.display = 'block';
                this.initSubwayRouteBuilder();
                break;
        }
        
        this.currentTransportMode = mode;
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
                if (parcel.owner === 'player') {
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
            
            // Check if there's a road with the appropriate amenity
            const road = this.transportationNetwork.roads.find(r => {
                return (r.startRow === roadCoords.startRow && 
                        r.startCol === roadCoords.startCol &&
                        r.endRow === roadCoords.endRow && 
                        r.endCol === roadCoords.endCol) ||
                       (r.startRow === roadCoords.endRow && 
                        r.startCol === roadCoords.endCol &&
                        r.endRow === roadCoords.startRow && 
                        r.endCol === roadCoords.startCol);
            });
            
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
    
    drawExistingBusRoutes(ctx, cellSize) {
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.5)';
        ctx.lineWidth = 2;
        
        this.transportationNetwork.busRoutes.forEach(route => {
            if (route.stops.length < 2) return;
            
            ctx.beginPath();
            for (let i = 0; i < route.stops.length; i++) {
                const stop = route.stops[i];
                const x = stop.col * cellSize + cellSize / 2;
                const y = stop.row * cellSize + cellSize / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        });
    }
    
    drawExistingSubwayLines(ctx, cellSize) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        
        this.transportationNetwork.subways.forEach(line => {
            if (line.entrances.length < 2) return;
            
            ctx.beginPath();
            for (let i = 0; i < line.entrances.length; i++) {
                const entrance = line.entrances[i];
                const x = entrance.col * cellSize + cellSize / 2;
                const y = entrance.row * cellSize + cellSize / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        });
    }
    
    updateBusRoutesList() {
        const listEl = document.getElementById('bus-route-list');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        
        this.transportationNetwork.busRoutes.forEach((route, index) => {
            const routeEl = document.createElement('div');
            routeEl.className = 'route-item';
            
            const cost = this.calculateRouteCost(route.length, route.serviceLevel);
            
            routeEl.innerHTML = `
                <div>
                    <div class="route-name">${route.name}</div>
                    <div class="route-details">${route.stops.length} stops, ${route.length} parcels</div>
                </div>
                <div>
                    <span class="route-cost">$${cost.toFixed(2)}/day</span>
                    <button class="delete-route" data-index="${index}" data-type="bus">Delete</button>
                </div>
            `;
            
            listEl.appendChild(routeEl);
        });
    }
    
    updateSubwayRoutesList() {
        const listEl = document.getElementById('subway-route-list');
        if (!listEl) return;
        
        listEl.innerHTML = '';
        
        this.transportationNetwork.subways.forEach((line, index) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'route-item';
            
            const cost = this.calculateRouteCost(line.length, line.serviceLevel);
            
            lineEl.innerHTML = `
                <div>
                    <div class="route-name">${line.name}</div>
                    <div class="route-details">${line.entrances.length} entrances, ${line.length} parcels</div>
                </div>
                <div>
                    <span class="route-cost">$${cost.toFixed(2)}/day</span>
                    <button class="delete-route" data-index="${index}" data-type="subway">Delete</button>
                </div>
            `;
            
            listEl.appendChild(lineEl);
        });
    }
    
    calculateRouteCost(length, serviceLevel) {
        const costPerParcel = {
            'rush_hour': 0.01,
            'daytime': 0.10,
            'late_night': 0.50,
            '24_hour': 1.00
        };
        
        return length * (costPerParcel[serviceLevel] || 0.01);
    }
    
    handleBusCanvasClick(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const cellSize = 400 / this.gridSize;
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        
        // Check if this parcel has a bus stop
        if (!this.hasTransitStop(row, col, 'bus')) {
            return; // No bus stop here
        }
        
        // Check if already selected
        const existingIndex = this.busRouteSelection.stops.findIndex(
            stop => stop.row === row && stop.col === col
        );
        
        if (existingIndex >= 0) {
            // Remove from selection
            this.busRouteSelection.stops.splice(existingIndex, 1);
        } else {
            // Add to selection
            this.busRouteSelection.stops.push({ row, col });
        }
        
        // Redraw map with selection
        this.initBusRouteBuilder();
        this.drawBusRouteSelection();
        
        // Update UI
        this.updateBusRouteInfo();
    }
    
    handleSubwayCanvasClick(e) {
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const cellSize = 400 / this.gridSize;
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        
        // Check if this parcel has a subway entrance
        if (!this.hasTransitStop(row, col, 'subway')) {
            return; // No subway entrance here
        }
        
        // Check if already selected
        const existingIndex = this.subwayRouteSelection.entrances.findIndex(
            entrance => entrance.row === row && entrance.col === col
        );
        
        if (existingIndex >= 0) {
            // Remove from selection
            this.subwayRouteSelection.entrances.splice(existingIndex, 1);
        } else {
            // Add to selection
            this.subwayRouteSelection.entrances.push({ row, col });
        }
        
        // Redraw map with selection
        this.initSubwayRouteBuilder();
        this.drawSubwayRouteSelection();
        
        // Update UI
        this.updateSubwayRouteInfo();
    }
    
    drawBusRouteSelection() {
        const canvas = document.getElementById('bus-route-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const cellSize = 400 / this.gridSize;
        
        // Draw selection connections
        if (this.busRouteSelection.stops.length > 1) {
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            for (let i = 0; i < this.busRouteSelection.stops.length; i++) {
                const stop = this.busRouteSelection.stops[i];
                const x = stop.col * cellSize + cellSize / 2;
                const y = stop.row * cellSize + cellSize / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Highlight selected stops
        this.busRouteSelection.stops.forEach(stop => {
            const x = stop.col * cellSize + cellSize / 2;
            const y = stop.row * cellSize + cellSize / 2;
            
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
    
    drawSubwayRouteSelection() {
        const canvas = document.getElementById('subway-route-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const cellSize = 400 / this.gridSize;
        
        // Draw selection connections
        if (this.subwayRouteSelection.entrances.length > 1) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 4;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            for (let i = 0; i < this.subwayRouteSelection.entrances.length; i++) {
                const entrance = this.subwayRouteSelection.entrances[i];
                const x = entrance.col * cellSize + cellSize / 2;
                const y = entrance.row * cellSize + cellSize / 2;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Highlight selected entrances
        this.subwayRouteSelection.entrances.forEach(entrance => {
            const x = entrance.col * cellSize + cellSize / 2;
            const y = entrance.row * cellSize + cellSize / 2;
            
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 6, y - 6, 12, 12);
        });
    }
    
    updateBusRouteInfo() {
        const stopCount = this.busRouteSelection.stops.length;
        document.getElementById('bus-stop-count').textContent = stopCount;
        
        // Show config if 2+ stops selected
        if (stopCount >= 2) {
            document.getElementById('bus-route-config').style.display = 'block';
            this.updateBusRouteCost();
        } else {
            document.getElementById('bus-route-config').style.display = 'none';
        }
    }
    
    updateSubwayRouteInfo() {
        const entranceCount = this.subwayRouteSelection.entrances.length;
        document.getElementById('subway-stop-count').textContent = entranceCount;
        
        // Show config if 2+ entrances selected
        if (entranceCount >= 2) {
            document.getElementById('subway-route-config').style.display = 'block';
            this.updateSubwayRouteCost();
        } else {
            document.getElementById('subway-route-config').style.display = 'none';
        }
    }
    
    updateBusRouteCost() {
        const stops = this.busRouteSelection.stops;
        if (stops.length < 2) return;
        
        // Calculate route length (Manhattan distance)
        let totalLength = 0;
        for (let i = 1; i < stops.length; i++) {
            const dist = Math.abs(stops[i].row - stops[i-1].row) + 
                        Math.abs(stops[i].col - stops[i-1].col);
            totalLength += dist;
        }
        
        const serviceLevel = document.getElementById('bus-service-level').value;
        const cost = this.calculateRouteCost(totalLength, serviceLevel);
        
        document.getElementById('bus-route-length').textContent = totalLength;
        document.getElementById('bus-route-cost').textContent = cost.toFixed(2);
    }
    
    updateSubwayRouteCost() {
        const entrances = this.subwayRouteSelection.entrances;
        if (entrances.length < 2) return;
        
        // Calculate route length (Manhattan distance)
        let totalLength = 0;
        for (let i = 1; i < entrances.length; i++) {
            const dist = Math.abs(entrances[i].row - entrances[i-1].row) + 
                        Math.abs(entrances[i].col - entrances[i-1].col);
            totalLength += dist;
        }
        
        const serviceLevel = document.getElementById('subway-service-level').value;
        const cost = this.calculateRouteCost(totalLength, serviceLevel);
        
        document.getElementById('subway-route-length').textContent = totalLength;
        document.getElementById('subway-route-cost').textContent = cost.toFixed(2);
    }
    
    clearBusRouteSelection() {
        this.busRouteSelection = { stops: [], connections: [] };
        this.initBusRouteBuilder();
        this.updateBusRouteInfo();
    }
    
    clearSubwayRouteSelection() {
        this.subwayRouteSelection = { entrances: [], connections: [] };
        this.initSubwayRouteBuilder();
        this.updateSubwayRouteInfo();
    }
    
    createBusRoute() {
        if (this.busRouteSelection.stops.length < 2) return;
        
        const name = document.getElementById('bus-route-name').value || 'Bus Route';
        const serviceLevel = document.getElementById('bus-service-level').value;
        
        // Calculate route length
        let totalLength = 0;
        for (let i = 1; i < this.busRouteSelection.stops.length; i++) {
            const dist = Math.abs(this.busRouteSelection.stops[i].row - this.busRouteSelection.stops[i-1].row) + 
                        Math.abs(this.busRouteSelection.stops[i].col - this.busRouteSelection.stops[i-1].col);
            totalLength += dist;
        }
        
        // Add route to network
        this.transportationNetwork.busRoutes.push({
            id: `bus_route_${Date.now()}`,
            name: name,
            stops: [...this.busRouteSelection.stops],
            length: totalLength,
            serviceLevel: serviceLevel,
            owner: 'player'
        });
        
        // Clear selection
        this.clearBusRouteSelection();
        
        // Update list
        this.updateBusRoutesList();
        
        // Reset name input
        document.getElementById('bus-route-name').value = '';
    }
    
    createSubwayRoute() {
        if (this.subwayRouteSelection.entrances.length < 2) return;
        
        const name = document.getElementById('subway-route-name').value || 'Subway Line';
        const serviceLevel = document.getElementById('subway-service-level').value;
        
        // Calculate route length
        let totalLength = 0;
        for (let i = 1; i < this.subwayRouteSelection.entrances.length; i++) {
            const dist = Math.abs(this.subwayRouteSelection.entrances[i].row - this.subwayRouteSelection.entrances[i-1].row) + 
                        Math.abs(this.subwayRouteSelection.entrances[i].col - this.subwayRouteSelection.entrances[i-1].col);
            totalLength += dist;
        }
        
        // Add route to network
        this.transportationNetwork.subways.push({
            id: `subway_line_${Date.now()}`,
            name: name,
            entrances: [...this.subwayRouteSelection.entrances],
            length: totalLength,
            serviceLevel: serviceLevel,
            owner: 'player'
        });
        
        // Clear selection
        this.clearSubwayRouteSelection();
        
        // Update list
        this.updateSubwayRoutesList();
        
        // Reset name input
        document.getElementById('subway-route-name').value = '';
    }
    
    // Governance System Methods
    showGovernanceModal() {
        // Update UI with current data
        this.updateGovernanceUI();
        document.getElementById('governance-modal').classList.add('visible');
    }
    
    hideGovernanceModal() {
        document.getElementById('governance-modal').classList.remove('visible');
    }
    
    updateGovernanceUI() {
        // Update voting points
        const playerVotes = this.governance.playerVotes['player'] || {};
        let usedPoints = 0;
        
        // Update budget categories
        this.governance.budgetCategories.forEach(category => {
            const categoryEl = document.querySelector(`[data-category="${category}"]`);
            if (categoryEl) {
                const voteCount = playerVotes[category] || 0;
                usedPoints += voteCount;
                
                categoryEl.querySelector('.vote-count').textContent = voteCount;
                categoryEl.querySelector('.category-allocation').textContent = 
                    `${(this.governance.categoryAllocations[category] * 100).toFixed(1)}%`;
                
                if (category === 'ubi') {
                    const ubiPerCitizen = this.governance.publicCoffers[category] / Math.max(1, this.calculatePopulation());
                    categoryEl.querySelector('.category-coffers span').textContent = ubiPerCitizen.toFixed(2);
                } else {
                    categoryEl.querySelector('.category-coffers span').textContent = 
                        this.governance.publicCoffers[category].toLocaleString();
                }
            }
        });
        
        // Add LVT points to total used points
        usedPoints += Math.abs(this.governance.lvtPointsAllocated);
        
        // Update LVT rate info
        document.getElementById('current-lvt-rate').textContent = `${(this.governance.currentLvtRate * 100).toFixed(0)}%`;
        document.getElementById('current-lvt-display').textContent = `${(this.governance.currentLvtRate * 100).toFixed(0)}%`;
        document.getElementById('proposed-lvt-rate').textContent = `${(this.governance.proposedLvtRate * 100).toFixed(0)}%`;
        
        // Update LVT point allocation
        document.getElementById('lvt-vote-points').textContent = this.governance.lvtPointsAllocated;
        
        // Update monthly collection
        document.getElementById('monthly-lvt-amount').textContent = this.governance.monthlyLvtCollected.toLocaleString();
        
        // Update vote summary
        document.getElementById('points-used').textContent = usedPoints;
        document.getElementById('points-available').textContent = this.governance.votingPoints;
        document.getElementById('player-voting-points').textContent = this.governance.votingPoints - usedPoints;
    }
    
    allocateVoteToCategory(category, change) {
        if (!this.governance.playerVotes['player']) {
            this.governance.playerVotes['player'] = {};
        }
        
        const currentVotes = this.governance.playerVotes['player'][category] || 0;
        const newVotes = Math.max(0, currentVotes + change);
        
        // Check if player has enough points
        const usedPoints = this.getTotalUsedPoints('player') - currentVotes + newVotes;
        if (usedPoints > this.governance.votingPoints) {
            return false; // Not enough points
        }
        
        this.governance.playerVotes['player'][category] = newVotes;
        this.calculateBudgetAllocations();
        this.updateGovernanceUI();
        return true;
    }
    
    allocateLVTPoint(change) {
        const newPoints = this.governance.lvtPointsAllocated + change;
        
        // Check if player has enough points
        const playerVotes = this.governance.playerVotes['player'] || {};
        const categoryVotes = Object.values(playerVotes).reduce((sum, votes) => sum + votes, 0);
        const totalUsedPoints = categoryVotes + Math.abs(newPoints);
        
        if (totalUsedPoints > this.governance.votingPoints) {
            return false; // Not enough points
        }
        
        this.governance.lvtPointsAllocated = newPoints;
        this.governance.proposedLvtRate = Math.max(0, Math.min(1, this.governance.currentLvtRate + (newPoints * 0.01)));
        this.updateGovernanceUI();
        return true;
    }

    getTotalUsedPoints(player) {
        const playerVotes = this.governance.playerVotes[player] || {};
        return Object.values(playerVotes).reduce((sum, votes) => sum + votes, 0);
    }
    
    calculateBudgetAllocations() {
        // Calculate total votes for each category across all players
        const totalVotes = {};
        this.governance.budgetCategories.forEach(category => {
            totalVotes[category] = 0;
        });
        
        // Sum up all player votes
        Object.values(this.governance.playerVotes).forEach(playerVotes => {
            this.governance.budgetCategories.forEach(category => {
                totalVotes[category] += playerVotes[category] || 0;
            });
        });
        
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
        // Apply LVT rate change
        this.governance.currentLvtRate = this.governance.proposedLvtRate;
        
        // Hide modal
        this.hideGovernanceModal();
        
        console.log('Governance changes applied:', this.governance);
    }
    
    // Called at the beginning of each month
    awardMonthlyVotingPoints() {
        // Award points to all players (for now just player)
        if (!this.governance.playerVotes['player']) {
            this.governance.playerVotes['player'] = {};
        }
        
        this.governance.votingPoints += 2; // Add 2 points per month (accumulate)
        
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
        
        // Distribute to categories based on allocations
        this.governance.budgetCategories.forEach(category => {
            const allocation = this.governance.categoryAllocations[category] || 0;
            this.governance.publicCoffers[category] += this.governance.monthlyLvtCollected * allocation;
        });
    }
    
    calculateMonthlyLVT() {
        let totalLVT = 0;
        
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel.owner === 'player') {
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
        auctionBtn.textContent = 'START AUCTION';
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
            categoryBtn.innerHTML = `
                <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                <span class="arrow">▶</span>
            `;
            
            const submenu = document.createElement('div');
            submenu.className = 'building-submenu';
            
            // Add all buildings for this category
            this.buildingManager.getBuildingsByCategory(category).forEach(building => {
                const buildingBtn = document.createElement('button');
                buildingBtn.className = 'building-btn';
                const cost = building.economics?.buildCost || building.cost || 0;
                buildingBtn.textContent = `${building.name} - $${cost.toLocaleString()}`;
                buildingBtn.onclick = () => this.buildBuilding(row, col, building.id);
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
        destroyBtn.textContent = 'DESTROY BUILDING';
        destroyBtn.onclick = () => this.destroyBuilding(row, col);
        actionsSection.appendChild(destroyBtn);
        
        contentEl.appendChild(actionsSection);
        
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
                upgradeBtn.textContent = `→ ${upgrade.name} - $${upgradeCost.toLocaleString()}`;
                upgradeBtn.onclick = () => this.upgradeBuilding(row, col, upgrade.id);
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
        
        // Amenities section
        const amenitySection = document.createElement('div');
        amenitySection.className = 'context-section';
        
        const amenityTitle = document.createElement('div');
        amenityTitle.className = 'build-menu-title';
        amenityTitle.textContent = 'AMENITIES';
        amenitySection.appendChild(amenityTitle);
        
        // Get available amenities
        const amenities = this.getAvailableAmenities(parcel);
        if (amenities.length > 0) {
            amenities.slice(0, 5).forEach(amenity => { // Show max 5
                const amenityBtn = document.createElement('button');
                amenityBtn.className = 'context-btn';
                const amenityCost = amenity.economics?.buildCost || amenity.cost || 0;
                amenityBtn.textContent = `+ ${amenity.name} - $${amenityCost.toLocaleString()}`;
                amenityBtn.onclick = () => this.addAmenity(row, col, amenity.id);
                amenitySection.appendChild(amenityBtn);
            });
        } else {
            const noAmenities = document.createElement('div');
            noAmenities.textContent = 'No amenities available';
            noAmenities.style.color = '#666666';
            noAmenities.style.fontSize = '9px';
            noAmenities.style.padding = '4px 8px';
            amenitySection.appendChild(noAmenities);
        }
        
        contentEl.appendChild(amenitySection);
    }
    
    buyParcel(row, col) {
        const coord = this.getParcelCoordinate(row, col);
        // Use static distance-based pricing for initial purchases
        const price = this.getParcelPrice(row, col);
        
        // Check if player has enough cash
        if (this.playerCash < price) {
            // Insufficient funds - could show UI feedback here instead
            return;
        }

        // Check if parcel is already owned
        if (this.grid[row][col].owner && this.grid[row][col].owner !== 'unclaimed') {
            console.log(`Parcel ${coord} is already owned by ${this.grid[row][col].owner}`);
            return;
        }
        
        console.log(`Attempting to purchase parcel ${coord} for $${price}`);
        
        // Use multiplayer client if available, otherwise fall back to local
        if (this.multiplayerClient && this.multiplayerClient.connected) {
            const result = this.multiplayerClient.sendAction({
                type: 'buyParcel',
                data: { row, col, bidAmount: price }
            });
            
            if (!result.success) {
                console.log(`Failed to purchase parcel: ${result.error}`);
                return;
            }
        } else {
            // Fallback for single player
            this.playerCash -= price;
            this.grid[row][col].owner = 'player';
            this.grid[row][col].landValue.paidPrice = price;
            this.grid[row][col].landValue.lastAuctionDay = this.currentDay;
            
            // Update calculated land values for all parcels
            this.updateAllLandValues();
            
            this.updateVitalityDisplay();
            this.updateDemographicsDisplay();
            this.calculateCurrentCashflow();
            this.updatePlayerStats();
            this.scheduleRender();
        }
        
        this.hideContextMenu();
    }
    
    startAuction(row, col) {
        const coord = this.getParcelCoordinate(row, col);
        console.log(`Starting auction for parcel ${coord}`);
        this.hideContextMenu();
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

    buildBuilding(row, col, buildingId) {
        const coord = this.getParcelCoordinate(row, col);
        const buildingCost = this.getBuildingCost(buildingId);
        
        // Check if player has enough cash
        if (this.playerCash < buildingCost) {
            // Insufficient funds for building - could show UI feedback here instead
            return;
        }

        // Check if parcel already has a building
        if (this.grid[row][col].building) {
            console.log(`Parcel ${coord} already has a building: ${this.grid[row][col].building}`);
            return;
        }

        // Check if player owns this parcel (in multiplayer, check against player ID)
        const expectedOwner = this.multiplayerClient && this.multiplayerClient.connected 
            ? this.multiplayerClient.playerId 
            : 'player';
        
        if (this.grid[row][col].owner !== expectedOwner) {
            console.log(`You don't own parcel ${coord} (owner: ${this.grid[row][col].owner})`);
            return;
        }
        
        console.log(`Attempting to build ${buildingId} at ${coord} for $${buildingCost}`);
        
        // Use multiplayer client if available, otherwise fall back to local
        if (this.multiplayerClient && this.multiplayerClient.connected) {
            const result = this.multiplayerClient.sendAction({
                type: 'buildStructure',
                data: { row, col, buildingId }
            });
            
            if (!result.success) {
                console.log(`Failed to build structure: ${result.error}`);
                return;
            }
        } else {
            // Fallback for single player
            this.playerCash -= buildingCost;
            this.grid[row][col].building = buildingId;
            
            // Set construction start day and duration
            const building = this.buildingManager.getBuildingById(buildingId);
            if (building && building.economics) {
                this.grid[row][col].constructionStartDay = this.currentDay;
                this.grid[row][col].constructionDays = building.economics.constructionDays || 14;
                this.grid[row][col].buildingAge = 0;
            }
            
            // Update land values, vitality, cashflow and re-render
            this.updateAllLandValues();
            this.updateVitalityDisplay();
            this.updateDemographicsDisplay();
            this.calculateCurrentCashflow();
            this.updatePlayerStats();
            this.scheduleRender();
        }
        
        this.hideContextMenu();
    }

    getBuildingCost(buildingId) {
        return this.buildingManager.getBuildingCost(buildingId);
    }

    destroyBuilding(row, col) {
        const coord = this.getParcelCoordinate(row, col);
        const building = this.grid[row][col].building;
        
        // Destroy building silently
        if (true) {
            console.log(`Destroying ${building} at ${coord}`);
            
            // Remove building and amenities
            this.grid[row][col].building = null;
            this.grid[row][col].amenities = [];
            
            // Update vitality, cashflow and re-render
            this.updateVitalityDisplay();
            this.calculateCurrentCashflow();
            this.updatePlayerStats();
            this.scheduleRender();
            this.hideContextMenu();
            
            // Building destroyed silently
        }
    }

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

    upgradeBuilding(row, col, upgradeId) {
        const coord = this.getParcelCoordinate(row, col);
        console.log(`Upgrading building at ${coord} to ${upgradeId}`);
        
        // Replace the building
        this.grid[row][col].building = upgradeId;
        
        // Update vitality and re-render
        this.updateVitalityDisplay();
        this.scheduleRender();
        this.hideContextMenu();
        
        // Building upgraded silently
    }

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

    addAmenity(row, col, amenityId) {
        const coord = this.getParcelCoordinate(row, col);
        console.log(`Adding amenity ${amenityId} at ${coord}`);
        
        // Add amenity to parcel
        if (!this.grid[row][col].amenities.includes(amenityId)) {
            this.grid[row][col].amenities.push(amenityId);
        }
        
        // Update vitality and re-render
        this.updateVitalityDisplay();
        this.scheduleRender();
        this.hideContextMenu();
        
        // Amenity installed silently
    }

    addBuildingHoverHandlers(submenu) {
        const buildingButtons = submenu.querySelectorAll('.building-btn');
        buildingButtons.forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                const buildingName = e.target.textContent.split(' - ')[0];
                this.showBuildingInfo(buildingName);
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
        const displayCost = buildingData.economics?.buildCost || buildingData.cost || 0;
        document.getElementById('building-cost').textContent = `$${displayCost.toLocaleString()}`;
        document.getElementById('building-time').textContent = `${buildingData.buildTime} days`;
        document.getElementById('building-category').textContent = buildingData.category;
        document.getElementById('building-bedrooms').textContent = buildingData.bedrooms || 0;
        document.getElementById('building-jobs').textContent = buildingData.jobs || 0;

        // Set building image
        const img = document.getElementById('building-info-img');
        if (buildingData.image) {
            img.src = buildingData.image;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }

        // Update impacts
        this.updateBuildingImpacts(buildingData.impacts);

        // Show panel
        panel.classList.add('visible');
    }

    hideBuildingInfo() {
        const panel = document.getElementById('building-info-panel');
        panel.classList.remove('visible');
    }

    getBuildingDataByName(buildingName) {
        const building = this.buildingManager.getAllBuildings().find(b => b.name === buildingName);
        
        if (building) {
            return {
                id: building.id,
                name: building.name,
                cost: building.economics?.buildCost || building.cost || 0,
                buildTime: building.economics?.constructionDays || 30,
                category: building.category,
                bedrooms: building.population?.bedroomsAdded || this.getBuildingBedrooms(building.id),
                jobs: building.population?.jobsCreated || this.getDefaultBuildingJobs(building.id),
                impacts: building.domainImpacts || this.getBuildingImpacts(building.id),
                image: building.images?.built || null
            };
        }
        
        return null;
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

    updateBuildingImpacts(impacts) {
        const impactsList = document.getElementById('building-impacts-list');
        impactsList.innerHTML = '';

        if (!impacts || Object.keys(impacts).length === 0) {
            impactsList.innerHTML = '<div style="color: #666666; font-size: 9px; text-align: center; grid-column: 1 / -1;">No domain impacts</div>';
            return;
        }

        Object.entries(impacts).forEach(([domain, value]) => {
            const impactItem = document.createElement('div');
            impactItem.className = 'impact-item';
            
            const valueClass = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
            const valueSign = value > 0 ? '+' : '';
            
            impactItem.innerHTML = `
                <span class="impact-label">${domain}</span>
                <span class="impact-value ${valueClass}">${valueSign}${value}</span>
            `;
            
            impactsList.appendChild(impactItem);
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
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                this.grid[row][col].landValue.calculatedValue = this.calculateLandValue(row, col);
            }
        }
    }

    calculateLandValue(row, col) {
        const basePrice = this.getParcelPrice(row, col);
        let multiplier = 1.0;

        // Proximity to developed parcels increases value
        const developedNeighbors = this.getAdjacentDevelopedParcels(row, col);
        multiplier += developedNeighbors * 0.15; // +15% per developed neighbor

        // Infrastructure buildings nearby increase value
        const infrastructureNearby = this.getNearbyBuildingsByCategory(row, col, 'infrastructure', 3);
        multiplier += infrastructureNearby * 0.1; // +10% per infrastructure building within 3 tiles

        // Education buildings increase value
        const educationNearby = this.getNearbyBuildingsByCategory(row, col, 'education', 2);
        multiplier += educationNearby * 0.08; // +8% per education building within 2 tiles

        // Commercial buildings have mixed effect
        const commercialNearby = this.getNearbyBuildingsByCategory(row, col, 'commercial', 2);
        if (commercialNearby <= 2) {
            multiplier += commercialNearby * 0.05; // +5% for 1-2 commercial nearby
        } else {
            multiplier += 0.1 - (commercialNearby - 2) * 0.03; // Diminishing returns
        }

        // Healthcare increases value
        const healthcareNearby = this.getNearbyBuildingsByCategory(row, col, 'healthcare', 3);
        multiplier += healthcareNearby * 0.06; // +6% per healthcare building

        // Culture and recreation add value
        const cultureNearby = this.getNearbyBuildingsByCategory(row, col, 'culture', 2);
        const recreationNearby = this.getNearbyBuildingsByCategory(row, col, 'recreation', 2);
        multiplier += (cultureNearby + recreationNearby) * 0.04; // +4% each

        // Overall city prosperity affects all land values
        const totalVitality = Object.values(this.vitality).reduce((sum, val) => sum + Math.max(0, val), 0);
        const prosperityBonus = Math.min(totalVitality / 500, 0.5); // Up to 50% bonus
        multiplier += prosperityBonus;

        // Ensure minimum multiplier of 0.5
        multiplier = Math.max(0.5, multiplier);

        return Math.round(basePrice * multiplier);
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

    setupZoomControls() {
        document.getElementById('zoom-in').addEventListener('click', () => {
            if (this.zoomLevel < 2.4) { // Max 2 ticks from default (0.4 + 2)
                this.zoomLevel++;
                this.updateZoom();
            }
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            if (this.zoomLevel > 0.4) { // Can't zoom out below default 1.1x
                this.zoomLevel--;
                this.updateZoom();
            }
        });

        document.getElementById('zoom-reset').addEventListener('click', () => {
            this.zoomLevel = 0.4; // Reset to default 1.1x
            this.panOffset = { x: 0, y: 0 };
            this.updateZoom();
        });

        this.updateZoomButtons();
    }
    
    setupLayerControls() {
        // Setup city name dropdown toggle
        const cityNameBtn = document.getElementById('city-name-btn');
        const cityMenu = document.getElementById('city-menu');
        
        cityNameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cityMenu.classList.toggle('active');
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', () => {
            cityMenu.classList.remove('active');
        });
        
        // Prevent dropdown from closing when clicking inside it
        cityMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Setup layer switching
        document.querySelectorAll('.layer-option').forEach(option => {
            option.addEventListener('click', () => {
                const layer = option.getAttribute('data-layer');
                this.switchToLayer(layer);
                cityMenu.classList.remove('active'); // Close dropdown after selection
            });
        });
    }
    
    switchToLayer(layerName) {
        // Update current layer
        this.currentLayer = layerName;
        
        // Update active states in dropdown
        document.querySelectorAll('.layer-option').forEach(option => option.classList.remove('active'));
        document.getElementById(`layer-${layerName}`).classList.add('active');
        
        // Update cursor style based on layer - remove 3D rotation for cashflow now
        this.canvas.style.cursor = this.zoomScale > 1.1 ? 'grab' : 'default';
        
        // Re-render with new layer
        this.scheduleRender();
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
    
    calculateCityVitality() {
        // Initialize supply and demand tracking
        this.vitalitySupply = {};
        this.vitalityDemand = {};
        
        Object.keys(this.vitality).forEach(domain => {
            this.vitalitySupply[domain] = 0;
            this.vitalityDemand[domain] = 0;
            this.vitality[domain] = 0; // Net will be supply - demand
        });
        
        // Calculate base demand from population demographics
        const population = this.calculatePopulation();
        const demographics = this.demographics || {};
        
        // Real needs-based demand
        this.vitalityDemand.ENERGY += population * 0.1;     // Energy per person
        this.vitalityDemand.FOOD += population * 0.05;      // Food per person
        this.vitalityDemand.HOUSING += Math.max(0, population - (demographics.total || 0)) * 0.1; // Unhoused population
        this.vitalityDemand.HEALTH += population * 0.02;    // Healthcare per person
        this.vitalityDemand.EDUCATION += (demographics.schoolAge || 0) * 0.1; // School-age children
        this.vitalityDemand.JOBS += (demographics.workingAge || 0) * 0.05;   // Working adults need jobs
        this.vitalityDemand.CULTURE += population * 0.01;   // Cultural needs
        this.vitalityDemand.MOBILITY += population * 0.01;  // Transport needs
        
        // Calculate supply and demand from buildings
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const parcel = this.grid[row][col];
                if (parcel.owner === 'player') {
                    // Add building impacts
                    if (parcel.building) {
                        const building = this.buildingManager.getBuildingById(parcel.building);
                        if (building && building.domainImpacts) {
                            Object.keys(building.domainImpacts).forEach(domain => {
                                if (this.vitality.hasOwnProperty(domain)) {
                                    const impact = building.domainImpacts[domain];
                                    
                                    // Categorize impact as supply (positive) or demand (negative)
                                    if (impact > 0) {
                                        // Positive impact = supply/benefit
                                        this.vitalitySupply[domain] += impact;
                                    } else if (impact < 0) {
                                        // Negative impact = demand/cost
                                        this.vitalityDemand[domain] += Math.abs(impact);
                                    }
                                }
                            });
                        } else {
                            // Fallback to old system for buildings without domainImpacts
                            const buildingImpacts = this.getBuildingImpacts(parcel.building);
                            Object.keys(buildingImpacts).forEach(domain => {
                                const impact = buildingImpacts[domain];
                                if (impact > 0) {
                                    this.vitalitySupply[domain] += impact;
                                } else if (impact < 0) {
                                    this.vitalityDemand[domain] += Math.abs(impact);
                                }
                            });
                        }
                    }
                    
                    // Add amenity impacts
                    parcel.amenities.forEach(amenity => {
                        const amenityImpacts = this.getAmenityImpacts(amenity);
                        Object.keys(amenityImpacts).forEach(domain => {
                            const impact = amenityImpacts[domain];
                            if (impact > 0) {
                                this.vitalitySupply[domain] += impact;
                            } else if (impact < 0) {
                                this.vitalityDemand[domain] += Math.abs(impact);
                            }
                        });
                    });
                }
            }
        }
        
        // Calculate net vitality (supply - demand)
        Object.keys(this.vitality).forEach(domain => {
            this.vitality[domain] = this.vitalitySupply[domain] - this.vitalityDemand[domain];
        });
        
        // Calculate city satisfaction based on met needs
        this.calculateCitySatisfaction();
    }
    
    calculateCitySatisfaction() {
        const demographics = this.demographics || {};
        
        // Calculate satisfaction scores for each domain (0-1 scale)
        const satisfaction = {};
        
        // Employment: Target 60%+ employment rate
        satisfaction.employment = Math.min(1, (demographics.employmentRate || 0) / 0.6);
        
        // Education: Target 90%+ school enrollment
        satisfaction.education = Math.min(1, (demographics.schoolEnrollmentRate || 0) / 0.9);
        
        // Housing: Based on vitality balance
        satisfaction.housing = this.vitality.HOUSING >= 0 ? 1.0 : Math.max(0, 1 + (this.vitality.HOUSING / 50));
        
        // Healthcare: Based on vitality balance
        satisfaction.healthcare = this.vitality.HEALTH >= 0 ? 1.0 : Math.max(0, 1 + (this.vitality.HEALTH / 30));
        
        // Culture & Recreation: Based on vitality balance
        satisfaction.culture = this.vitality.CULTURE >= 0 ? 1.0 : Math.max(0, 1 + (this.vitality.CULTURE / 20));
        
        // Overall satisfaction (weighted average)
        const weights = {
            employment: 0.3,
            education: 0.25,
            housing: 0.2,
            healthcare: 0.15,
            culture: 0.1
        };
        
        let overallSatisfaction = 0;
        let totalWeight = 0;
        Object.keys(satisfaction).forEach(key => {
            if (weights[key]) {
                overallSatisfaction += satisfaction[key] * weights[key];
                totalWeight += weights[key];
            }
        });
        
        this.citySatisfaction = {
            ...satisfaction,
            overall: totalWeight > 0 ? overallSatisfaction / totalWeight : 0
        };
        
        // Apply satisfaction effects to revenue (in processDailyCashflow)
        return this.citySatisfaction;
    }
    
    updateVitalityDisplay() {
        // In multiplayer, vitality is calculated on the server
        // Only calculate locally in single-player mode
        if (!this.multiplayerClient || !this.multiplayerClient.connected) {
            this.calculateCityVitality();
        }
        
        // Supply & Demand bars (Energy, Food, Housing, Jobs)
        const supplyDemandMetrics = ['ENERGY', 'FOOD', 'HOUSING', 'JOBS'];
        
        supplyDemandMetrics.forEach(domain => {
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
    
    drawTile(col, row, color, elevation = 0) {
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;
        
        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);
        
        // Calculate tile size based on layer (75% smaller for transportation, so 25% of original)
        const sizeMultiplier = this.currentLayer === 'transportation' ? 0.25 : 1.0;
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
            this.drawBuilding(parcel.building, 0, -this.tileHeight / 4, row, col);
        }
        
        this.ctx.restore();
    }

    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row = 0, col = 0) {
        // Get opacity from cursor-based system
        const tileKey = `${row}-${col}`;
        const opacity = this.parcelOpacity.get(tileKey) || 1.0;
        
        // Set canvas global alpha for dimming effect
        this.ctx.globalAlpha = opacity;
        
        // Get parcel to check construction status
        const parcel = this.grid[row][col];
        
        // Check if building has custom image
        const building = this.buildingManager.getBuildingById(buildingId);
        
        // Calculate construction progress if under construction
        let constructionStage = 4; // Default to fully built
        if (parcel && parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
            const daysElapsed = this.currentDay - parcel.constructionStartDay;
            if (daysElapsed < parcel.constructionDays) {
                // Building is still under construction
                const progress = daysElapsed / parcel.constructionDays;
                // Calculate stage (1-4): 1=32x32, 2=64x64, 3=128x128, 4=full res
                constructionStage = Math.min(4, Math.floor(progress * 4) + 1);
                
                // Debug logging for the first few updates
                if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
                    console.log(`Building ${buildingId} at (${row},${col}): Day ${daysElapsed}/${parcel.constructionDays}, Progress ${(progress*100).toFixed(1)}%, Stage ${constructionStage}`);
                }
            } else {
                // Construction complete - clear construction data
                parcel.constructionStartDay = null;
                parcel.constructionDays = 0;
            }
        }
        
        if (building && building.images && building.images.built) {
            // Draw custom building image
            this.drawBuildingImage(building.images.built, offsetX, offsetY, constructionStage);
        } else {
            // Draw simple building representation
            this.drawSimpleBuilding(buildingId, offsetX, offsetY, constructionStage);
        }
        
        // Reset global alpha
        this.ctx.globalAlpha = 1.0;
    }

    drawBuildingImage(imageSrc, offsetX, offsetY, constructionStage = 4) {
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
            img.src = imageSrc;
            this.buildingImageCache.set(imageSrc, img);
            return; // Skip drawing until image loads
        }
        
        if (img.complete) {
            // Get adjustable building parameters (same as simple buildings)
            const yOffset = window.buildingPositionControls?.yOffset || 12;
            const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
            const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
            
            // Fill diamond width completely (left point to right point)
            const baseDrawWidth = this.tileWidth * widthMultiplier;
            const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;
            
            // Apply pixelation effect based on construction stage
            if (constructionStage < 4) {
                // Create pixelated version
                const pixelSizes = [32, 64, 128]; // Pixel sizes for stages 1-3
                const pixelSize = pixelSizes[constructionStage - 1];
                
                // Create temporary canvas for pixelation
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                // Set temporary canvas to pixel size
                tempCanvas.width = pixelSize;
                tempCanvas.height = pixelSize;
                
                // Draw image at low resolution
                tempCtx.imageSmoothingEnabled = false;
                tempCtx.drawImage(img, 0, 0, pixelSize, pixelSize);
                
                // Draw pixelated version to main canvas
                this.ctx.imageSmoothingEnabled = false;
                const imageY = offsetY + this.tileHeight/2 - baseDrawHeight + yOffset;
                this.ctx.drawImage(
                    tempCanvas,
                    offsetX - baseDrawWidth/2,
                    imageY,
                    baseDrawWidth,
                    baseDrawHeight
                );
                this.ctx.imageSmoothingEnabled = true;
            } else {
                // Draw at full resolution
                const imageY = offsetY + this.tileHeight/2 - baseDrawHeight + yOffset;
                this.ctx.drawImage(
                    img, 
                    offsetX - baseDrawWidth/2, 
                    imageY, 
                    baseDrawWidth, 
                    baseDrawHeight
                );
            }
        }
    }

    drawSimpleBuilding(buildingId, offsetX, offsetY, constructionStage = 4) {
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
        const yOffset = window.buildingPositionControls?.yOffset || 12;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        
        // Rectangle dimensions with multipliers
        const width = this.tileWidth * widthMultiplier;
        const height = this.tileHeight * heightMultiplier;
        
        // Position rectangle so bottom edge touches diamond's bottom point (with Y offset)
        // Diamond bottom point is at offsetY + tileHeight/2
        // Rectangle top-left Y coordinate should be: bottom point - building height + yOffset
        const buildingY = offsetY + this.tileHeight/2 - height + yOffset;
        
        // Apply pixelation effect for construction stages
        if (constructionStage < 4) {
            // Create pixelated version
            const pixelSizes = [32, 64, 128]; // Pixel sizes for stages 1-3
            const pixelSize = pixelSizes[constructionStage - 1];
            
            // Create temporary canvas for pixelation
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set temporary canvas to pixel size
            tempCanvas.width = pixelSize;
            tempCanvas.height = pixelSize;
            
            // Draw building at low resolution
            tempCtx.imageSmoothingEnabled = false;
            tempCtx.fillStyle = color;
            tempCtx.fillRect(0, 0, pixelSize, pixelSize);
            
            // Add simple border at low res
            tempCtx.strokeStyle = '#ffffff';
            tempCtx.lineWidth = Math.max(1, pixelSize / 32);
            tempCtx.strokeRect(0, 0, pixelSize, pixelSize);
            
            // Draw pixelated version to main canvas
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(
                tempCanvas,
                offsetX - width/2,
                buildingY,
                width,
                height
            );
            this.ctx.imageSmoothingEnabled = true;
        } else {
            // Draw at full resolution
            this.ctx.fillStyle = color;
            this.ctx.fillRect(offsetX - width/2, buildingY, width, height);
            
            // Add simple border
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(offsetX - width/2, buildingY, width, height);
        }
    }
    
    getTileColor(row, col) {
        const parcel = this.grid[row][col];
        
        // Switch based on current map layer
        switch (this.currentLayer) {
            case 'landvalue':
                return this.getLandValueHeatmapColor(row, col);
            case 'cashflow':
                return this.getCashflowHeatmapColor(row, col);
            case 'transportation':
                return this.getTransportationLayerColor(row, col);
            case 'normal':
            default:
                // Original logic for normal view
                if (parcel.building) {
                    return '#2a2a2a'; // Standard ground color
                }
                
                // Base parcel color based on ownership (only for empty parcels)
                if (!parcel.owner) {
                    return '#2a2a2a'; // Unowned - gray
                } else if (parcel.owner === 'player') {
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
    
    getLandValueHeatmapColor(row, col) {
        const parcel = this.grid[row][col];
        const landValue = Math.max(parcel.landValue.paidPrice, parcel.landValue.calculatedValue);
        
        // Find min and max land values across all parcels for normalization
        let minValue = Infinity;
        let maxValue = -Infinity;
        
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const p = this.grid[r][c];
                const value = Math.max(p.landValue.paidPrice, p.landValue.calculatedValue);
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        }
        
        // Normalize land value to 0-1 range
        const normalizedValue = maxValue > minValue ? (landValue - minValue) / (maxValue - minValue) : 0;
        
        // Create heatmap: blue (low) to red (high)
        // Blue: rgb(0, 100, 255)
        // Red: rgb(255, 100, 0)
        const r = Math.round(normalizedValue * 255);
        const g = 100;
        const b = Math.round((1 - normalizedValue) * 255);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    getCashflowHeatmapColor(row, col) {
        const cashflow = this.getParcelCashflow(row, col);
        
        // Find min and max cashflow values across all parcels for normalization
        let minCashflow = 0;
        let maxCashflow = 0;
        
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cf = this.getParcelCashflow(r, c);
                minCashflow = Math.min(minCashflow, cf);
                maxCashflow = Math.max(maxCashflow, cf);
            }
        }
        
        // If no cashflow variation, return neutral color
        if (minCashflow === 0 && maxCashflow === 0) {
            return '#2a2a2a';
        }
        
        // Normalize cashflow to color range
        if (cashflow > 0) {
            // Positive cashflow: green intensity based on value
            const intensity = Math.min(cashflow / maxCashflow, 1);
            const greenValue = Math.round(intensity * 180 + 50); // 50-230 range
            return `rgb(0, ${greenValue}, 0)`;
        } else if (cashflow < 0) {
            // Negative cashflow: red intensity based on absolute value
            const intensity = Math.min(Math.abs(cashflow) / Math.abs(minCashflow), 1);
            const redValue = Math.round(intensity * 180 + 50); // 50-230 range
            return `rgb(${redValue}, 0, 0)`;
        } else {
            // Zero cashflow: neutral gray
            return '#2a2a2a';
        }
    }
    
    getTransportationLayerColor(row, col) {
        const parcel = this.grid[row][col];
        
        // Show ownership with muted colors since parcels are smaller
        if (!parcel.owner) {
            return '#1a1a1a'; // Dark gray for unowned
        } else if (parcel.owner === 'player') {
            // Use player's selected color with lower transparency for transportation view
            if (this.playerSettings && this.playerSettings.color) {
                const hex = this.playerSettings.color.replace('#', '');
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                return `rgba(${r}, ${g}, ${b}, 0.2)`;
            }
            return 'rgba(255, 255, 255, 0.2)'; // Fallback
        } else {
            // Very muted competitor colors
            const competitorColor = this.getCompetitorColor(parcel.owner);
            return competitorColor.replace('3a1a2a', '2a1a1a').replace('2a3a1a', '1a2a1a').replace('1a2a3a', '1a1a2a');
        }
    }
    
    getParcelCashflow(row, col) {
        const parcel = this.grid[row][col];
        if (!parcel.building || !parcel.owner) return 0;
        
        const building = this.buildingManager.getBuildingById(parcel.building);
        if (!building) return 0;
        
        // Calculate revenue (accounting for decay)
        const maxRevenue = building.economics.maxRevenue || 0;
        const decay = parcel.decay || 0;
        const decayMultiplier = Math.max(0, 1 - decay);
        let revenue = maxRevenue * decayMultiplier;
        
        // Calculate maintenance costs (increases with decay)
        const baseMaintenance = building.economics.maintenanceCost || 0;
        const maintenanceMultiplier = 1 + (decay * 2); // Doubles at full decay
        let maintenanceCost = baseMaintenance * maintenanceMultiplier;
        
        // Note: Amenities in the current system don't have revenue/maintenance data
        // They only provide city vitality impacts, not direct economic benefits
        
        // Calculate land tax if owned by player
        let landTax = 0;
        if (parcel.owner === 'player') {
            const dailyLVTRate = 0.50 / 365; // 50% annual LVT (matching existing system)
            landTax = parcel.landValue.paidPrice * dailyLVTRate;
        }
        
        return revenue - maintenanceCost - landTax;
    }
    
    drawCashflowNumbers() {
        // Draw cashflow numbers on each parcel
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const cashflow = this.getParcelCashflow(row, col);
                
                // Only draw numbers for parcels with cashflow
                if (Math.abs(cashflow) >= 0.1) {
                    const iso = this.toIsometric(col, row);
                    this.drawCashflowNumber(iso.x, iso.y, cashflow);
                }
            }
        }
    }
    
    drawCashflowNumber(x, y, cashflow) {
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Format the cashflow number
        const formatted = cashflow >= 0 ? `+$${cashflow.toFixed(1)}` : `-$${Math.abs(cashflow).toFixed(1)}`;
        
        // Set text properties
        this.ctx.font = '10px SF Mono, Monaco, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Choose text color based on value
        this.ctx.fillStyle = cashflow >= 0 ? '#ffffff' : '#ffffff';
        
        // Add text shadow for better readability
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        // Draw the number
        this.ctx.fillText(formatted, 0, 0);
        
        this.ctx.restore();
    }
    
    drawTransportationNetwork() {
        // Draw roads
        this.transportationNetwork.roads.forEach(road => {
            this.drawRoad(road);
        });
        
        // Draw subway entrances and lines
        this.transportationNetwork.subways.forEach(subway => {
            this.drawSubway(subway);
        });
        
        // Draw bus routes
        this.transportationNetwork.busRoutes.forEach(route => {
            this.drawBusRoute(route);
        });
    }
    
    drawRoad(road) {
        this.ctx.save();
        
        const startIso = this.toIsometric(road.startCol, road.startRow);
        const endIso = this.toIsometric(road.endCol, road.endRow);
        
        // Set road appearance based on type
        const roadStyles = this.getRoadStyle(road.type);
        this.ctx.strokeStyle = roadStyles.color;
        this.ctx.lineWidth = roadStyles.width;
        this.ctx.setLineDash(roadStyles.dash || []);
        
        // Draw road line
        this.ctx.beginPath();
        this.ctx.moveTo(startIso.x, startIso.y);
        this.ctx.lineTo(endIso.x, endIso.y);
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    drawSubway(subway) {
        this.ctx.save();
        
        if (subway.type === 'entrance') {
            // Draw subway entrance
            const iso = this.toIsometric(subway.col, subway.row);
            this.ctx.fillStyle = '#8b5cf6'; // Purple for subway
            this.ctx.beginPath();
            this.ctx.arc(iso.x, iso.y, 4, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Add entrance symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('M', iso.x, iso.y);
        } else if (subway.type === 'line') {
            // Draw subway line (dashed, below grade)
            const startIso = this.toIsometric(subway.startCol, subway.startRow);
            const endIso = this.toIsometric(subway.endCol, subway.endRow);
            
            this.ctx.strokeStyle = '#8b5cf6';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.globalAlpha = 0.7;
            
            this.ctx.beginPath();
            this.ctx.moveTo(startIso.x, startIso.y);
            this.ctx.lineTo(endIso.x, endIso.y);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    drawBusRoute(route) {
        this.ctx.save();
        
        // Draw bus route as dotted line
        this.ctx.strokeStyle = '#f59e0b'; // Orange for bus
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([3, 3]);
        this.ctx.globalAlpha = 0.8;
        
        // Draw lines between stops
        for (let i = 0; i < route.stops.length - 1; i++) {
            const startStop = route.stops[i];
            const endStop = route.stops[i + 1];
            const startIso = this.toIsometric(startStop.col, startStop.row);
            const endIso = this.toIsometric(endStop.col, endStop.row);
            
            this.ctx.beginPath();
            this.ctx.moveTo(startIso.x, startIso.y);
            this.ctx.lineTo(endIso.x, endIso.y);
            this.ctx.stroke();
        }
        
        // Draw bus stops
        route.stops.forEach(stop => {
            const iso = this.toIsometric(stop.col, stop.row);
            this.ctx.fillStyle = '#f59e0b';
            this.ctx.beginPath();
            this.ctx.arc(iso.x, iso.y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Add bus stop symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '6px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('B', iso.x, iso.y);
        });
        
        this.ctx.restore();
    }
    
    getRoadStyle(roadType) {
        const styles = {
            'pedestrian_plaza': { color: '#94a3b8', width: 8, dash: [] },
            'walkway': { color: '#cbd5e1', width: 2, dash: [] },
            'bike_lane': { color: '#22c55e', width: 3, dash: [2, 2] },
            'local_street': { color: '#64748b', width: 4, dash: [] },
            'collector_road': { color: '#475569', width: 6, dash: [] },
            'arterial': { color: '#334155', width: 8, dash: [] },
            'highway': { color: '#1e293b', width: 12, dash: [] },
            'expressway': { color: '#0f172a', width: 16, dash: [] }
        };
        
        return styles[roadType] || styles['local_street'];
    }
    
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply zoom and pan transformations
        this.ctx.save();
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoomScale, this.zoomScale);
        
        // Batch canvas operations for better performance
        this.ctx.beginPath();
        
        // Render tiles back to front for proper depth (A-1 is farthest, N-14 is closest)
        // This means we render from row 0 to gridSize-1 (A to N)
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const tile = this.grid[row][col];
                if (tile) {
                    this.drawTile(col, row, this.getTileColor(row, col), tile.elevation);
                }
            }
        }
        
        // Draw cashflow numbers if in cashflow layer mode
        if (this.currentLayer === 'cashflow') {
            this.drawCashflowNumbers();
        }
        
        // Draw transportation network if in transportation layer mode
        if (this.currentLayer === 'transportation') {
            this.drawTransportationNetwork();
            this.drawParcelLandValues();
        }
        
        // Draw selection highlight (ensure it's drawn last, on top of everything)
        if (this.selectedTile && 
            this.selectedTile.row >= 0 && this.selectedTile.row < this.gridSize &&
            this.selectedTile.col >= 0 && this.selectedTile.col < this.gridSize) {
            const tile = this.grid[this.selectedTile.row][this.selectedTile.col];
            if (tile) {
                // Draw with a subtle white glow
                this.drawTileHighlight(this.selectedTile.col, this.selectedTile.row, 
                                     'rgba(255, 255, 255, 0.3)', tile.elevation);
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
            this.drawBuilding(parcel.building, 0, -this.tileHeight / 4, row, col);
        }
        
        // Restore transform
        this.ctx.setTransform(currentTransform);
    }
    
    // Update cursor-based parcel illumination with smooth animations
    updateParcelIllumination(cursorTile) {
        const targetOpacities = new Map();
        
        // Calculate target opacities for all tiles
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const tileKey = `${row}-${col}`;
                
                if (!cursorTile) {
                    // No cursor hover - all tiles at full opacity
                    targetOpacities.set(tileKey, 1.0);
                } else {
                    const distance = Math.max(
                        Math.abs(row - cursorTile.row),
                        Math.abs(col - cursorTile.col)
                    );
                    
                    if (distance === 0) {
                        // Hovered tile - full brightness
                        targetOpacities.set(tileKey, 1.0);
                    } else if (distance === 1) {
                        // Adjacent tiles - dimmed to 10%
                        targetOpacities.set(tileKey, 0.1);
                    } else {
                        // Gradual 5% increments: 15%, 20%, 25%, 30%, then full brightness
                        const opacity = Math.min(1.0, 0.1 + (distance - 1) * 0.05);
                        targetOpacities.set(tileKey, opacity);
                    }
                }
            }
        }
        
        // Animate opacity changes
        targetOpacities.forEach((targetOpacity, tileKey) => {
            const currentOpacity = this.parcelOpacity.get(tileKey) || 1.0;
            
            if (Math.abs(currentOpacity - targetOpacity) > 0.01) {
                this.animateParcelOpacity(tileKey, currentOpacity, targetOpacity);
            }
        });
    }
    
    // Animate smooth opacity transition for a single parcel
    animateParcelOpacity(tileKey, startOpacity, targetOpacity) {
        // Cancel any existing animation for this tile
        if (this.opacityTransitions.has(tileKey)) {
            cancelAnimationFrame(this.opacityTransitions.get(tileKey));
        }
        
        const duration = 200; // 200ms animation
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing function
            const easeOut = 1 - Math.pow(1 - progress, 2);
            const currentOpacity = startOpacity + (targetOpacity - startOpacity) * easeOut;
            
            this.parcelOpacity.set(tileKey, currentOpacity);
            
            if (progress < 1) {
                const animationId = requestAnimationFrame(animate);
                this.opacityTransitions.set(tileKey, animationId);
            } else {
                this.opacityTransitions.delete(tileKey);
            }
            
            this.scheduleRender();
        };
        
        const animationId = requestAnimationFrame(animate);
        this.opacityTransitions.set(tileKey, animationId);
    }

    // Throttle utility for event optimization
    throttleEvent(func, delay) {
        return (...args) => {
            const now = performance.now();
            if (now - this.lastMouseMoveTime >= delay) {
                this.lastMouseMoveTime = now;
                func.apply(this, args);
            }
        };
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
        
        // Subtle white glow effect
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
    
    setupEventListeners() {
        // Throttled mouse move handler for better performance  
        const throttledMouseMove = this.throttleEvent((e) => {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            
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
            
            if (tile) {
                this.selectedTile = tile;
                const coord = this.getParcelCoordinate(tile.row, tile.col);
                this.domCache.selectedTile.textContent = coord;
                
                
                // Force a render to show the highlight
                this.scheduleRender();
                
                // Update cursor-based illumination
                if (!this.hoveredTile || 
                    this.hoveredTile.row !== tile.row || 
                    this.hoveredTile.col !== tile.col) {
                    this.hoveredTile = { row: tile.row, col: tile.col };
                    this.updateParcelIllumination(this.hoveredTile);
                }
                this.showTooltip(tile.row, tile.col, e.clientX, e.clientY);
            } else {
                this.selectedTile = null;
                this.domCache.selectedTile.textContent = '--';
                
                // Clear illumination when not hovering any tile
                if (this.hoveredTile) {
                    this.hoveredTile = null;
                    this.updateParcelIllumination(null);
                }
                
                this.hideTooltip();
            }
        }, 16); // 60fps throttling
        
        this.canvas.addEventListener('mousemove', throttledMouseMove, { passive: true });

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
            
            if (tile && tile.row >= 0 && tile.row < this.gridSize &&
                tile.col >= 0 && tile.col < this.gridSize) {
                
                if (this.currentLayer === 'transportation') {
                    this.showTransportationModal(tile.row, tile.col);
                } else {
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
    }
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
    
    // Player setup functionality
    const setupModal = document.getElementById('setup-modal');
    const playerHandle = document.getElementById('player-handle');
    const previewName = document.getElementById('preview-name');
    const previewTile = document.getElementById('preview-tile');
    const previewEmoji = previewTile.querySelector('.preview-emoji');
    const startGameBtn = document.getElementById('start-game-btn');
    
    let selectedColor = '#52C77E';
    let selectedEmoji = '🏠';
    
    // Handle name input
    playerHandle.addEventListener('input', (e) => {
        const name = e.target.value || 'Player';
        previewName.textContent = name;
    });
    
    // Handle color selection
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = btn.dataset.color;
            previewTile.style.background = selectedColor;
        });
    });
    
    // Handle emoji selection
    document.querySelectorAll('.emoji-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedEmoji = btn.dataset.emoji;
            previewEmoji.textContent = selectedEmoji;
        });
    });
    
    // Start game button
    startGameBtn.addEventListener('click', () => {
        const playerName = playerHandle.value || 'Player';
        
        // Hide setup modal
        setupModal.classList.add('hidden');
        
        // Initialize game with player settings
        const game = new IsometricGrid(canvas, 14);
        game.playerSettings = {
            name: playerName,
            color: selectedColor,
            emoji: selectedEmoji
        };
        
        // Update player name in UI if needed
        const playerBtn = document.getElementById('player-btn');
        if (playerBtn) {
            playerBtn.innerHTML = `${playerName.toUpperCase()}<span class="indicator">▼</span>`;
        }
        
        // Initialize multiplayer client
        if (window.MultiplayerClient) {
            game.multiplayerClient = new MultiplayerClient(game);
            game.multiplayerClient.connect();
        }
        
        window.game = game; // Make game accessible globally for devtools
    });
    
    document.getElementById('city-name').textContent = generateCityName().toUpperCase();
    
    // Close context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!game.contextMenu.contains(e.target) && e.target !== game.canvas) {
            game.hideContextMenu();
        }
    });
    
    const playerBtn = document.getElementById('player-btn');
    const playerMenu = document.getElementById('player-menu');
    const devtoolsPanel = document.getElementById('devtools-panel');
    const governanceBtn = document.getElementById('governance-btn');
    
    // Governance button functionality
    governanceBtn.addEventListener('click', () => {
        game.showGovernanceModal();
    });
    
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
    document.querySelectorAll('.dropdown-item').forEach(item => {
        if (item.textContent === 'DEVTOOLS') {
            item.addEventListener('click', () => {
                devtoolsPanel.classList.add('visible');
                playerMenu.classList.remove('active');
            });
        }
    });
    
    // Hard reset functionality
    document.getElementById('hard-reset-btn').addEventListener('click', async () => {
        if (confirm('⚠️ HARD RESET\n\nThis will completely reset the game:\n• Clear all buildings and progress\n• Reset cash to starting amount\n• Force reload buildings from CSV\n• Clear all saved data\n\nThis cannot be undone. Are you sure?')) {
            // Clear all localStorage data
            localStorage.removeItem('theCommons_buildings');
            localStorage.removeItem('theCommons_customBuildings');
            localStorage.removeItem('theCommons_customAmenities');
            localStorage.removeItem('theCommons_gameState');
            localStorage.removeItem('theCommons_playerSettings');
            
            // Try to refresh buildings before reload
            if (window.refreshBuildingsFromCSV) {
                try {
                    await window.refreshBuildingsFromCSV();
                } catch (e) {
                    console.log('CSV refresh failed, will reload page:', e);
                }
            }
            
            // Force reload the page to start fresh
            window.location.reload(true);
        }
        playerMenu.classList.remove('active');
    });
    
    document.getElementById('close-devtools').addEventListener('click', () => {
        devtoolsPanel.classList.remove('visible');
    });
    
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
        yOffset: 12,
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
        yOffsetSlider.value = 12;
        heightSlider.value = 1.0;
        widthSlider.value = 1.0;
        
        window.buildingPositionControls.yOffset = 12;
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
    
    // Initialize comprehensive tooltips for vitality bars
    const tooltip = document.getElementById('custom-tooltip');
    
    function generateTooltipContent(tooltipData) {
        const data = JSON.parse(tooltipData);
        
        if (data.type === 'supply-demand') {
            let content = `${data.domain} (Supply & Demand)\n`;
            content += `═════════════════════════════\n`;
            content += `Supply: ${data.supply.toFixed(1)}\n`;
            content += `Demand: ${data.demand.toFixed(1)}\n`;
            content += `Balance: ${data.balance >= 0 ? '+' : ''}${data.balance.toFixed(1)}\n`;
            content += `Ratio: ${data.ratio.toFixed(0)}%\n\n`;
            
            if (data.ratio > 0) {
                content += `✓ Surplus available`;
            } else if (data.ratio < -50) {
                content += `⚠ Critical shortage`;
            } else if (data.ratio < 0) {
                content += `⚠ Shortage detected`;
            } else {
                content += `— Balanced`;
            }
            
            return content;
        } else if (data.type === 'net-score') {
            let content = `${data.domain} (Net Score)\n`;
            content += `═════════════════════════════\n`;
            content += `Score: ${data.score >= 0 ? '+' : ''}${data.score.toFixed(0)}\n`;
            content += `Buildings: ${data.buildingCount}\n\n`;
            
            if (Object.keys(data.impactDetails).length > 0) {
                content += `Building Breakdown:\n`;
                Object.entries(data.impactDetails)
                    .sort(([,a], [,b]) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact))
                    .slice(0, 4) // Show top 4 contributors
                    .forEach(([name, details]) => {
                        const impact = details.totalImpact >= 0 ? '+' : '';
                        content += `• ${name} (×${details.count}): ${impact}${details.totalImpact.toFixed(1)}\n`;
                    });
                    
                if (Object.keys(data.impactDetails).length > 4) {
                    content += `• ... and ${Object.keys(data.impactDetails).length - 4} others\n`;
                }
            } else {
                content += `No buildings affecting this metric`;
            }
            
            return content;
        }
        
        return 'No data available';
    }
    
    document.querySelectorAll('.vitality-row[data-vitality]').forEach(row => {
        row.addEventListener('mouseenter', (e) => {
            const tooltipData = row.getAttribute('data-tooltip-data');
            if (tooltipData) {
                const content = generateTooltipContent(tooltipData);
                tooltip.textContent = content;
                
                // Position tooltip relative to the hovered element
                const rect = row.getBoundingClientRect();
                const tooltipHeight = tooltip.offsetHeight || 100; // Estimate if not rendered yet
                
                // Position to the left of the sidebar, aligned with the row
                tooltip.style.left = `${rect.left - 300}px`; // 300px left of the row
                tooltip.style.top = `${rect.top + (rect.height / 2) - (tooltipHeight / 2)}px`;
                tooltip.style.transform = 'none'; // Remove the transform since we're using absolute positioning
                
                tooltip.classList.add('visible');
            }
        });
        
        row.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
    
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
        
        console.log('Created building:', buildingData);
        
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
        
        console.log('Created amenity:', amenityData);
        
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
        console.log(`Building ${action}:`, buildingData);
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
            console.log('Amenity saved to storage:', amenityData);
            // Amenity created and saved successfully (removed alert)
        } else {
            console.log('Amenity created but not saved:', amenityData);
            // Amenity created but could not be saved (removed alert)
        }
    });

    // Load saved data on startup
    console.log('Loaded buildings from storage:', loadFromStorage(STORAGE_KEYS.BUILDINGS));
    console.log('Loaded amenities from storage:', loadFromStorage(STORAGE_KEYS.AMENITIES));

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
        
        // Close cashflow menu
        closeCashflowBtn.addEventListener('click', () => {
            hideCashflowMenu();
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (cashflowMenu.classList.contains('visible') && 
                !cashflowMenu.contains(e.target) && 
                !cashflowItem.contains(e.target)) {
                hideCashflowMenu();
            }
        });
        
        // Setup table sorting
        setupTableSorting();
    }
    
    function showCashflowMenu() {
        const menu = document.getElementById('cashflow-menu');
        // Trigger cashflow calculation to get current data
        game.calculateCurrentCashflow();
        populateCashflowData();
        menu.classList.add('visible');
    }
    
    function hideCashflowMenu() {
        const menu = document.getElementById('cashflow-menu');
        menu.classList.remove('visible');
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
                <td>${item.coordinates}</td>
                <td>${item.buildingName}</td>
                <td>${item.buildingAge} days</td>
                <td>${item.decay.toFixed(1)}%</td>
                <td>$${Math.round(item.landValue).toLocaleString()}</td>
                <td class="${getValueClass(item.revenue)}">${formatCurrency(item.revenue)}</td>
                <td class="${getValueClass(-item.maintenance)}">${formatCurrency(-item.maintenance)}</td>
                <td class="${getValueClass(-item.lvt)}">${formatCurrency(-item.lvt)}</td>
                <td class="${getValueClass(item.netCashflow)}">${formatCurrency(item.netCashflow)}</td>
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
    
    // Setup transportation modal event handlers
    function setupTransportationModal() {
        // Close modal button
        document.getElementById('close-transportation-modal').addEventListener('click', () => {
            game.hideTransportationModal();
        });
        
        // Close modal on backdrop click
        document.getElementById('transportation-modal').addEventListener('click', (e) => {
            if (e.target.id === 'transportation-modal') {
                game.hideTransportationModal();
            }
        });
        
        // Transport mode buttons
        document.getElementById('road-mode').addEventListener('click', () => {
            game.switchTransportMode('road');
        });
        
        document.getElementById('bus-mode').addEventListener('click', () => {
            game.switchTransportMode('bus');
        });
        
        document.getElementById('subway-mode').addEventListener('click', () => {
            game.switchTransportMode('subway');
        });
        
        // Road type selector change events
        ['north', 'east', 'south', 'west'].forEach(side => {
            document.getElementById(`road-${side}`).addEventListener('change', () => {
                game.updateRoadCostDisplay();
            });
            
            // Amenity checkbox events for this side
            const amenitiesContainer = document.getElementById(`amenities-${side}`);
            if (amenitiesContainer) {
                const checkboxes = amenitiesContainer.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        game.updateRoadCostDisplay();
                    });
                });
            }
        });
        
        // Apply design button
        document.getElementById('apply-road-design').addEventListener('click', () => {
            game.applyRoadDesign();
        });
        
        // Bus route builder events
        const busCanvas = document.getElementById('bus-route-canvas');
        if (busCanvas) {
            busCanvas.addEventListener('click', (e) => {
                game.handleBusCanvasClick(e);
            });
        }
        
        document.getElementById('bus-service-level').addEventListener('change', () => {
            game.updateBusRouteCost();
        });
        
        document.getElementById('clear-bus-route').addEventListener('click', () => {
            game.clearBusRouteSelection();
        });
        
        document.getElementById('create-bus-route').addEventListener('click', () => {
            game.createBusRoute();
        });
        
        // Subway route builder events
        const subwayCanvas = document.getElementById('subway-route-canvas');
        if (subwayCanvas) {
            subwayCanvas.addEventListener('click', (e) => {
                game.handleSubwayCanvasClick(e);
            });
        }
        
        document.getElementById('subway-service-level').addEventListener('change', () => {
            game.updateSubwayRouteCost();
        });
        
        document.getElementById('clear-subway-route').addEventListener('click', () => {
            game.clearSubwayRouteSelection();
        });
        
        document.getElementById('create-subway-route').addEventListener('click', () => {
            game.createSubwayRoute();
        });
    }
    
    // Initialize transportation modal
    setupTransportationModal();
    
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
        
        // Apply changes button
        document.getElementById('apply-governance').addEventListener('click', () => {
            game.applyGovernanceChanges();
        });
    }
    
    // Initialize governance modal
    setupGovernanceModal();

    // Initialize cashflow menu
    setupCashflowMenu();

});