const { v4: uuidv4 } = require('uuid');

class GameRoom {
  constructor(id, io, minPlayers = 4, globalLeaderboard = null) {
    this.id = id;
    this.io = io;
    this.players = new Map();
    this.minPlayers = minPlayers; // Minimum players needed to start
    this.maxPlayers = 12;
    this.globalLeaderboard = globalLeaderboard;
    this.gameState = this.initializeGameState();
    this.gameStarted = false;
    this.gameTimer = null;
    this.createdAt = Date.now();
    
    // Game mechanics intervals
    this.marketUpdateInterval = null;
    this.revenueCollectionInterval = null;
  }

  initializeGameState() {
    return {
      // Game timing (1 hour = 1 year)
      gameTime: {
        totalDuration: 3600000, // 1 hour in milliseconds
        elapsed: 0,
        startTime: null,
        gameYear: 2024,
        gameMonth: 1,
        gameDay: 1
      },
      
      // City state
      city: {
        name: this.generateCityName(),
        totalLandValue: 0,
        totalPopulation: 1000,
        globalRanking: null
      },

      // Grid (14x14)
      grid: this.initializeGrid(),
      
      // Governance - simplified pool system
      governance: {
        lvtRate: 0.02, // 2% monthly LVT
        treasuryPools: {
          infrastructure: 0,    // Available for roads, utilities
          education: 0,         // Available for schools, libraries  
          healthcare: 0,        // Available for hospitals, clinics
          environment: 0,       // Available for parks, green spaces
          safety: 0,           // Available for police, fire stations
          development: 0       // Available for economic incentives
        },
        playerAllocations: new Map() // Track each player's point allocations
      },

      // Market conditions (no crisis events)
      market: {
        conditions: 'stable',
        interestRate: 0.05,
        demandMultipliers: {
          residential: 1.0,
          commercial: 1.0,
          industrial: 1.0,
          civic: 1.0
        }
      },
      
      // Leaderboard
      leaderboard: []
    };
  }

  initializeGrid() {
    const grid = [];
    const size = 14;
    
    for (let row = 0; row < size; row++) {
      grid[row] = [];
      for (let col = 0; col < size; col++) {
        grid[row][col] = {
          type: 'grass',
          elevation: Math.random() * 3,
          owner: null,
          building: null,
          buildingAge: 0,
          constructionStartDay: null,
          constructionDays: 0,
          landValue: {
            baseValue: this.calculateBaseLandValue(row, col, size),
            currentValue: 0,
            lastUpdate: Date.now()
          },
          utilities: {
            power: false,
            water: false,
            sewer: false,
            roads: false
          },
          zoning: this.getInitialZoning(row, col, size)
        };
        
        // Calculate initial land value
        grid[row][col].landValue.currentValue = grid[row][col].landValue.baseValue;
      }
    }
    
    return grid;
  }

  calculateBaseLandValue(row, col, size) {
    // Calculate distance from center (6.5, 6.5) using max of row/col distance
    // This matches the client's getParcelPrice calculation
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

  getInitialZoning(row, col, size) {
    const centerRow = size / 2;
    const centerCol = size / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
    );
    
    if (distanceFromCenter < 2) return 'commercial';
    if (distanceFromCenter < 4) return 'mixed';
    if (distanceFromCenter < 6) return 'residential';
    return 'industrial';
  }

  generateCityName() {
    const prefixes = ['New', 'Port', 'Mount', 'Lake', 'West', 'East', 'North', 'South'];
    const suffixes = ['ville', 'ton', 'burg', 'field', 'wood', 'land', 'ford', 'haven'];
    const bases = ['Spring', 'River', 'Oak', 'Pine', 'Stone', 'Gold', 'Silver', 'Green'];
    
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const base = bases[Math.floor(Math.random() * bases.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    return Math.random() > 0.5 ? `${prefix} ${base}` : `${base}${suffix}`;
  }

  // Player management
  addPlayer(socket, playerData, globalLeaderboard = null) {
    if (this.players.size >= this.maxPlayers) return false;
    
    // Get starting cash from player's profile (includes multipliers)
    let startingCash = 5000;
    if (globalLeaderboard) {
      const profile = globalLeaderboard.getPlayerProfile(playerData.id, playerData.name);
      startingCash = profile.getStartingCash();
    }
    
    this.players.set(playerData.id, {
      ...playerData,
      socket: socket,
      cash: startingCash,
      wealth: startingCash,
      properties: [],
      buildings: [],
      votingPoints: 2,
      lastActivity: Date.now()
    });
    
    return true;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      // Return voting point allocations to pools when player leaves
      this.returnPlayerAllocations(playerId);
    }
    return this.players.delete(playerId);
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  hasPlayer(playerId) {
    return this.players.has(playerId);
  }

  updatePlayerSocket(playerId, newSocket) {
    const player = this.players.get(playerId);
    if (player) {
      player.socket = newSocket;
      player.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  getPlayerSocket(playerId) {
    const player = this.players.get(playerId);
    return player ? player.socket : null;
  }

  get playerCount() {
    return this.players.size;
  }

  canStart() {
    return this.playerCount >= this.minPlayers && !this.gameStarted;
  }

  // Game mechanics
  startGame() {
    if (this.gameStarted || this.playerCount < this.minPlayers) return false;
    
    this.gameStarted = true;
    this.gameState.gameTime.startTime = Date.now();
    
    console.log(`🎮 Game started in room ${this.id} with ${this.playerCount} players (min: ${this.minPlayers})`);
    
    // Start game timer (1 hour)
    this.gameTimer = setTimeout(() => {
      this.endGame(this.globalLeaderboard);
    }, this.gameState.gameTime.totalDuration);
    
    // Start periodic updates
    this.startPeriodicUpdates();
    
    // Notify all players
    this.broadcast('gameStarted', {
      message: `Game started with ${this.playerCount} players! You have 1 hour to accumulate the most wealth!`,
      gameState: this.getGameState(),
      playerCount: this.playerCount,
      totalStartingCash: this.playerCount * 5000
    });
    
    return true;
  }

  startPeriodicUpdates() {
    // Day advancement (1 hour game = 365 days, so ~10 seconds per day)
    this.dayAdvanceInterval = setInterval(() => {
      this.gameState.gameTime.gameDay++;
      console.log(`Server day advanced to: ${this.gameState.gameTime.gameDay}`);
    }, 10000); // ~10 seconds per game day
    
    // Market updates every 2 minutes (natural market fluctuations)
    this.marketUpdateInterval = setInterval(() => {
      this.updateMarketConditions();
      this.calculateLandValues();
      this.broadcast('marketUpdate', {
        market: this.gameState.market,
        landValues: this.getLandValueSnapshot()
      });
    }, 120000);

    // Revenue collection every 5 minutes
    this.revenueCollectionInterval = setInterval(() => {
      this.collectPlayerRevenues();
      this.collectLandValueTax();
      this.updatePlayerWealth();
      this.broadcast('revenueCollection', {
        leaderboard: this.calculateLeaderboard(),
        treasuryPools: this.gameState.governance.treasuryPools
      });
    }, 300000);
  }

  handlePlayerAction(playerId, action) {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    try {
      switch (action.type) {
        case 'buyParcel':
          return this.handleBuyParcel(playerId, action.data);
        
        case 'buildStructure':
          return this.handleBuildStructure(playerId, action.data);
        
        case 'buildWithTreasury':
          return this.handleBuildWithTreasury(playerId, action.data);
        
        case 'sellProperty':
          return this.handleSellProperty(playerId, action.data);
        
        case 'allocateVotingPoints':
          return this.handleVotingPointAllocation(playerId, action.data);
        
        default:
          return { success: false, error: 'Unknown action type' };
      }
    } catch (error) {
      console.error(`Error handling action ${action.type}:`, error);
      return { success: false, error: 'Action failed' };
    }
  }

  handleBuyParcel(playerId, { row, col, bidAmount }) {
    const player = this.getPlayer(playerId);
    const parcel = this.gameState.grid[row][col];
    
    if (!parcel) {
      return { success: false, error: 'Invalid parcel' };
    }
    
    if (parcel.owner) {
      return { success: false, error: 'Parcel already owned' };
    }
    
    // For initial purchases, use the base static price
    // For auctions (future feature), would use currentValue
    const landValue = parcel.landValue.baseValue;
    const minimumBid = landValue; // Exact base value for initial purchase
    
    if (bidAmount < minimumBid) {
      return { success: false, error: 'Bid too low' };
    }
    
    if (player.cash < bidAmount) {
      return { success: false, error: 'Insufficient funds' };
    }
    
    // Execute purchase
    player.cash -= bidAmount;
    parcel.owner = playerId;
    parcel.landValue.currentValue = bidAmount;
    player.properties.push({ row, col, purchasePrice: bidAmount });
    
    return { 
      success: true, 
      data: { 
        parcel: { row, col, owner: playerId, landValue: bidAmount },
        playerCash: player.cash 
      } 
    };
  }

  handleBuildStructure(playerId, { row, col, buildingId, buildingCost }) {
    const player = this.getPlayer(playerId);
    const parcel = this.gameState.grid[row][col];
    
    if (!parcel || parcel.owner !== playerId) {
      return { success: false, error: 'You do not own this parcel' };
    }
    
    if (parcel.building) {
      return { success: false, error: 'Parcel already has a building' };
    }
    
    if (player.cash < buildingCost) {
      return { success: false, error: 'Insufficient funds' };
    }
    
    player.cash -= buildingCost;
    parcel.building = buildingId;
    parcel.buildingAge = 0;
    
    // Set construction start day and duration
    const buildingData = this.getBuildingData(buildingId);
    if (buildingData && buildingData.economics) {
      // Use gameTime.gameDay, not gameState.day (which doesn't exist)
      parcel.constructionStartDay = this.gameState.gameTime.gameDay || 0;
      parcel.constructionDays = buildingData.economics.constructionDays || 14;
    }
    
    player.buildings.push({
      row, col, 
      buildingId, 
      constructionCost: buildingCost,
      constructedAt: Date.now()
    });
    
    return { 
      success: true, 
      data: { 
        parcel: { 
          row, 
          col, 
          building: buildingId, 
          buildingAge: parcel.buildingAge,
          constructionStartDay: parcel.constructionStartDay,
          constructionDays: parcel.constructionDays
        },
        playerCash: player.cash 
      } 
    };
  }

  handleBuildWithTreasury(playerId, { row, col, buildingId, buildingCost, treasuryCategory }) {
    const player = this.getPlayer(playerId);
    const parcel = this.gameState.grid[row][col];
    
    if (!parcel) {
      return { success: false, error: 'Invalid parcel' };
    }
    
    if (parcel.building) {
      return { success: false, error: 'Parcel already has a building' };
    }
    
    // Check if building type matches treasury category
    if (!this.isBuildingEligibleForTreasury(buildingId, treasuryCategory)) {
      return { success: false, error: 'Building type not eligible for this treasury pool' };
    }
    
    // Check treasury funds
    const treasuryPool = this.gameState.governance.treasuryPools[treasuryCategory];
    if (treasuryPool < buildingCost) {
      return { success: false, error: `Insufficient funds in ${treasuryCategory} treasury (${treasuryPool} available)` };
    }
    
    // First come, first served - deduct from treasury
    this.gameState.governance.treasuryPools[treasuryCategory] -= buildingCost;
    
    // Build the structure (owned by the city, maintained by treasury)
    parcel.building = buildingId;
    parcel.buildingAge = 0;
    parcel.owner = 'city'; // City-owned building
    parcel.builder = playerId; // Track who built it for stats
    
    // Set construction start day and duration
    const buildingData = this.getBuildingData(buildingId);
    if (buildingData && buildingData.economics) {
      // Use gameTime.gameDay, not gameState.day (which doesn't exist)
      parcel.constructionStartDay = this.gameState.gameTime.gameDay || 0;
      parcel.constructionDays = buildingData.economics.constructionDays || 14;
    }
    
    return { 
      success: true, 
      data: { 
        parcel: { 
          row, 
          col, 
          building: buildingId, 
          owner: 'city', 
          builder: playerId,
          buildingAge: parcel.buildingAge,
          constructionStartDay: parcel.constructionStartDay,
          constructionDays: parcel.constructionDays
        },
        treasuryRemaining: this.gameState.governance.treasuryPools[treasuryCategory],
        category: treasuryCategory
      } 
    };
  }

  isBuildingEligibleForTreasury(buildingId, category) {
    // Define which building types can be built with each treasury pool
    const eligibility = {
      infrastructure: ['road', 'bridge', 'power_plant', 'water_treatment'],
      education: ['school', 'library', 'university', 'research_center'],
      healthcare: ['clinic', 'hospital', 'health_center'],
      environment: ['park', 'garden', 'nature_reserve', 'recycling_center'],
      safety: ['police_station', 'fire_station', 'emergency_center'],
      development: ['business_center', 'tech_hub', 'industrial_park']
    };
    
    return eligibility[category] && eligibility[category].includes(buildingId);
  }

  getBuildingData(buildingId) {
    // TODO: Load building data from the same CSV as the client (buildings_all - core_buildings_master.csv)
    // For now, return basic structure with default construction time
    // The client-side BuildingManager should be the source of truth for building data
    
    // CSV buildings from buildings_all - core_buildings_master.csv:
    // - cottage (1 day construction)
    // - farmers_market (2 days construction)  
    // - high_school (3 days construction)
    // - schoolhouse (5 days construction)
    // - cornerstore (4 days construction)
    
    const csvBuildingData = {
      cottage: { economics: { constructionDays: 1 } },
      farmers_market: { economics: { constructionDays: 2 } },
      high_school: { economics: { constructionDays: 3 } },
      schoolhouse: { economics: { constructionDays: 5 } },
      cornerstore: { economics: { constructionDays: 4 } }
    };
    
    return csvBuildingData[buildingId] || { economics: { constructionDays: 1 } };
  }

  // Simplified governance - direct point allocation
  handleVotingPointAllocation(playerId, { allocations }) {
    const player = this.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Calculate total points being allocated
    const totalPoints = Object.values(allocations).reduce((sum, points) => sum + points, 0);
    
    if (totalPoints > player.votingPoints) {
      return { success: false, error: 'Not enough voting points' };
    }

    // Remove previous allocations if any
    const previousAllocations = this.gameState.governance.playerAllocations.get(playerId) || {};
    
    // Update allocations
    this.gameState.governance.playerAllocations.set(playerId, allocations);
    player.votingPoints = player.votingPoints - totalPoints;

    // Immediately affect treasury pools based on allocation
    // Each voting point directs a portion of that player's LVT contribution
    // This happens during the next revenue collection
    
    return { 
      success: true, 
      data: { 
        allocations,
        remainingPoints: player.votingPoints,
        message: 'Your voting points will direct LVT funds to the specified pools'
      } 
    };
  }

  returnPlayerAllocations(playerId) {
    // When a player leaves, return their allocations
    const allocations = this.gameState.governance.playerAllocations.get(playerId);
    if (allocations) {
      this.gameState.governance.playerAllocations.delete(playerId);
    }
  }

  // Market simulation (natural fluctuations only, no crisis events)
  updateMarketConditions() {
    const conditions = ['recession', 'stable', 'growth', 'boom'];
    const currentIndex = conditions.indexOf(this.gameState.market.conditions);
    
    // Gradual, natural market changes
    if (Math.random() < 0.3) {
      const change = Math.random() < 0.5 ? -1 : 1;
      const newIndex = Math.max(0, Math.min(conditions.length - 1, currentIndex + change));
      this.gameState.market.conditions = conditions[newIndex];
    }
    
    // Update demand multipliers based on market conditions
    const multiplier = {
      recession: 0.7,
      stable: 1.0,
      growth: 1.2,
      boom: 1.5
    }[this.gameState.market.conditions];
    
    Object.keys(this.gameState.market.demandMultipliers).forEach(type => {
      this.gameState.market.demandMultipliers[type] = multiplier + (Math.random() - 0.5) * 0.2;
    });
  }

  calculateLandValues() {
    let totalLandValue = 0;
    
    for (let row = 0; row < this.gameState.grid.length; row++) {
      for (let col = 0; col < this.gameState.grid[row].length; col++) {
        const parcel = this.gameState.grid[row][col];
        parcel.landValue.currentValue = this.calculateParcelValue(row, col);
        parcel.landValue.lastUpdate = Date.now();
        totalLandValue += parcel.landValue.currentValue;
      }
    }
    
    this.gameState.city.totalLandValue = totalLandValue;
  }

  calculateParcelValue(row, col) {
    const parcel = this.gameState.grid[row][col];
    let value = parcel.landValue.baseValue;
    
    // Market condition multiplier
    value *= this.gameState.market.demandMultipliers[parcel.zoning] || 1.0;
    
    // Proximity bonuses (buildings, infrastructure, etc.)
    value += this.calculateProximityBonus(row, col);
    
    // City development multiplier (more buildings = higher land values)
    const developmentRatio = this.calculateDevelopmentRatio();
    value *= (1 + developmentRatio * 0.5);
    
    return Math.max(100, Math.round(value));
  }

  calculateProximityBonus(row, col) {
    let bonus = 0;
    const searchRadius = 3;
    
    for (let r = Math.max(0, row - searchRadius); r <= Math.min(this.gameState.grid.length - 1, row + searchRadius); r++) {
      for (let c = Math.max(0, col - searchRadius); c <= Math.min(this.gameState.grid[0].length - 1, col + searchRadius); c++) {
        if (r === row && c === col) continue;
        
        const distance = Math.sqrt((r - row) ** 2 + (c - col) ** 2);
        const parcel = this.gameState.grid[r][c];
        
        if (parcel.building) {
          bonus += (200 / distance); // Buildings increase nearby land values
        }
        
        if (parcel.utilities.roads) {
          bonus += (100 / distance); // Roads increase accessibility
        }
      }
    }
    
    return Math.round(bonus);
  }

  calculateDevelopmentRatio() {
    let developedParcels = 0;
    let totalParcels = this.gameState.grid.length * this.gameState.grid[0].length;
    
    for (let row = 0; row < this.gameState.grid.length; row++) {
      for (let col = 0; col < this.gameState.grid[row].length; col++) {
        if (this.gameState.grid[row][col].building) {
          developedParcels++;
        }
      }
    }
    
    return developedParcels / totalParcels;
  }

  // Revenue collection
  collectPlayerRevenues() {
    this.players.forEach(player => {
      let totalRevenue = 0;
      let totalExpenses = 0;
      
      // Collect rent from buildings
      player.buildings.forEach(building => {
        const parcel = this.gameState.grid[building.row][building.col];
        if (parcel && parcel.building) {
          const monthlyRent = this.calculateBuildingRevenue(parcel, building);
          totalRevenue += monthlyRent;
        }
      });
      
      // Pay building maintenance
      player.buildings.forEach(building => {
        const maintenanceCost = this.calculateMaintenanceCost(building);
        totalExpenses += maintenanceCost;
      });
      
      // Update player cash (LVT is collected separately)
      const netRevenue = totalRevenue - totalExpenses;
      player.cash += netRevenue;
      
      // Track for wealth calculation
      player.lastMonthlyRevenue = totalRevenue;
      player.lastMonthlyExpenses = totalExpenses;
    });
  }

  collectLandValueTax() {
    let totalLVTCollected = 0;
    
    this.players.forEach((player, playerId) => {
      let playerLVT = 0;
      
      // Calculate LVT for all owned properties
      player.properties.forEach(property => {
        const parcel = this.gameState.grid[property.row][property.col];
        if (parcel) {
          const monthlyTax = parcel.landValue.currentValue * this.gameState.governance.lvtRate;
          playerLVT += monthlyTax;
        }
      });
      
      // Deduct LVT from player
      player.cash -= playerLVT;
      totalLVTCollected += playerLVT;
      
      // Distribute LVT to treasury pools based on player's voting allocations
      const allocations = this.gameState.governance.playerAllocations.get(playerId) || {};
      const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
      
      if (totalAllocated > 0) {
        // Distribute based on player's allocations
        Object.entries(allocations).forEach(([category, points]) => {
          const portion = (points / totalAllocated) * playerLVT;
          this.gameState.governance.treasuryPools[category] += portion;
        });
      } else {
        // If no allocations, distribute evenly to all pools
        const categories = Object.keys(this.gameState.governance.treasuryPools);
        const portionPerCategory = playerLVT / categories.length;
        categories.forEach(category => {
          this.gameState.governance.treasuryPools[category] += portionPerCategory;
        });
      }
    });
    
    return totalLVTCollected;
  }

  calculateBuildingRevenue(parcel, building) {
    // Simplified revenue calculation based on land value and market conditions
    const baseRent = 500;
    const landValueMultiplier = parcel.landValue.currentValue / 5000;
    const marketMultiplier = this.gameState.market.demandMultipliers[parcel.zoning] || 1.0;
    const ageMultiplier = Math.max(0.5, 1 - (building.buildingAge * 0.01)); // Depreciation
    
    return Math.round(baseRent * landValueMultiplier * marketMultiplier * ageMultiplier);
  }

  calculateMaintenanceCost(building) {
    // Maintenance increases with building age
    const ageDays = (Date.now() - building.constructedAt) / (1000 * 60 * 60 * 24);
    const ageMonths = ageDays / 30;
    return Math.round(100 + ageMonths * 10);
  }

  // Treasury can also pay for city-owned building maintenance
  payTreasuryMaintenance() {
    // Find all city-owned buildings
    for (let row = 0; row < this.gameState.grid.length; row++) {
      for (let col = 0; col < this.gameState.grid[row].length; col++) {
        const parcel = this.gameState.grid[row][col];
        
        if (parcel.owner === 'city' && parcel.building) {
          const maintenanceCost = 50; // Fixed cost for city buildings
          const buildingType = this.getBuildingCategory(parcel.building);
          
          // Deduct from appropriate treasury pool
          if (this.gameState.governance.treasuryPools[buildingType] >= maintenanceCost) {
            this.gameState.governance.treasuryPools[buildingType] -= maintenanceCost;
          } else {
            // If treasury can't pay, building deteriorates (could add decay mechanic)
            parcel.buildingAge += 1; // Accelerated aging
          }
        }
      }
    }
  }

  getBuildingCategory(buildingId) {
    // Map building types to treasury categories
    const categoryMap = {
      'road': 'infrastructure',
      'school': 'education',
      'hospital': 'healthcare',
      'park': 'environment',
      'police_station': 'safety',
      'business_center': 'development'
    };
    
    return categoryMap[buildingId] || 'development';
  }

  updatePlayerWealth() {
    this.players.forEach(player => {
      let totalPropertyValue = 0;
      let totalBuildingValue = 0;
      
      // Calculate property values
      player.properties.forEach(property => {
        const parcel = this.gameState.grid[property.row][property.col];
        if (parcel) {
          totalPropertyValue += parcel.landValue.currentValue;
        }
      });
      
      // Calculate building values (depreciate over time)
      player.buildings.forEach(building => {
        const ageMonths = (Date.now() - building.constructedAt) / (1000 * 60 * 60 * 24 * 30);
        const depreciation = Math.max(0.3, 1 - (ageMonths * 0.02)); // Min 30% value
        totalBuildingValue += building.constructionCost * depreciation;
      });
      
      player.wealth = player.cash + totalPropertyValue + totalBuildingValue;
    });
  }

  calculateLeaderboard() {
    const leaderboard = Array.from(this.players.values())
      .map(player => ({
        id: player.id,
        name: player.name,
        color: player.color,
        emoji: player.emoji,
        wealth: player.wealth,
        cash: player.cash,
        properties: player.properties.length,
        buildings: player.buildings.length
      }))
      .sort((a, b) => b.wealth - a.wealth);
    
    this.gameState.leaderboard = leaderboard;
    return leaderboard;
  }

  endGame(globalLeaderboard = null) {
    console.log(`🏁 Game ended in room ${this.id}`);
    
    this.updatePlayerWealth();
    const finalLeaderboard = this.calculateLeaderboard();
    
    // Calculate city score for global comparison
    const cityScore = this.calculateCityScore();
    cityScore.cityName = this.gameState.city.name;
    cityScore.totalLandValue = this.gameState.city.totalLandValue;
    
    // Prepare game results for global leaderboard processing
    const gameResults = {
      gameId: this.id,
      finalLeaderboard: finalLeaderboard,
      cityScore: cityScore,
      playerCount: this.playerCount,
      totalStartingCash: Array.from(this.players.values())
        .reduce((sum, player) => sum + (player.originalStartingCash || 5000), 0),
      gameStats: this.calculateGameStats(),
      treasuryFinalState: this.gameState.governance.treasuryPools
    };

    let processedResults = null;
    
    // Process through global leaderboard if available
    if (globalLeaderboard) {
      processedResults = globalLeaderboard.processGameResults(gameResults);
    }
    
    // Send final results to players
    const finalResults = {
      ...gameResults,
      processedResults,
      message: this.generateVictoryMessage(processedResults)
    };
    
    this.broadcast('gameEnded', finalResults);
    
    // Clean up intervals
    this.destroy();
    
    return processedResults;
  }

  generateVictoryMessage(processedResults) {
    if (!processedResults) return 'Game completed!';
    
    const messages = [];
    
    // City performance
    if (processedResults.isBestCity) {
      messages.push('🏆 BEST CITY WORLDWIDE! All players earn +2% starting cash bonus!');
    } else {
      messages.push(`🏙️ Your city ranked #${processedResults.cityRank} globally`);
    }
    
    // Individual performance
    const winner = processedResults.playerResults.find(p => p.hadHighestGain);
    if (winner) {
      messages.push(`💰 ${winner.name} had the highest wealth gain (${winner.wealthGainPercent}) and earns +1% starting cash bonus!`);
    }
    
    // Double bonus
    if (winner && processedResults.isBestCity) {
      messages.push(`🎉 ${winner.name} gets an additional +2% bonus for winning in the best city! (Total: +5% starting cash)`);
    }
    
    return messages.join('\n\n');
  }

  calculateCityScore() {
    const totalLandValue = this.gameState.city.totalLandValue;
    const developmentRatio = this.calculateDevelopmentRatio();
    
    return {
      landValueIndex: totalLandValue / (14 * 14),
      developmentScore: developmentRatio * 100,
      totalScore: (totalLandValue / (14 * 14)) + (developmentRatio * 1000)
    };
  }

  getCityRankingMultiplier(cityScore) {
    // This would compare against other cities globally
    // For now, simplified based on total score
    if (cityScore.totalScore > 8000) return 1.2;  // Top 25%
    if (cityScore.totalScore < 4000) return 0.9;  // Bottom 25%
    return 1.0; // Middle 50%
  }

  calculateGameStats() {
    const totalBuildings = Array.from(this.players.values())
      .reduce((sum, player) => sum + player.buildings.length, 0);
    
    const cityBuildings = this.gameState.grid.flat()
      .filter(parcel => parcel.owner === 'city' && parcel.building)
      .length;
    
    return {
      totalBuildings,
      cityBuildings,
      totalLandValue: this.gameState.city.totalLandValue,
      treasurySpent: this.calculateTotalTreasurySpent(),
      finalTreasuryBalance: Object.values(this.gameState.governance.treasuryPools)
        .reduce((sum, val) => sum + val, 0)
    };
  }

  calculateTotalTreasurySpent() {
    // Track how much was spent from treasury (would need to track this during game)
    return 0; // Placeholder
  }

  // Utility methods
  broadcast(event, data, excludeSocket = null) {
    this.players.forEach(player => {
      if (player.socket && player.socket !== excludeSocket) {
        player.socket.emit(event, data);
      }
    });
  }

  getGameState() {
    return {
      ...this.gameState,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        emoji: p.emoji,
        wealth: p.wealth,
        cash: p.cash,
        properties: p.properties.length,
        buildings: p.buildings.length,
        votingPoints: p.votingPoints
      })),
      gameStarted: this.gameStarted,
      playerCount: this.playerCount,
      minPlayers: this.minPlayers
    };
  }

  getLandValueSnapshot() {
    return this.gameState.grid.map(row => 
      row.map(parcel => parcel.landValue.currentValue)
    );
  }

  destroy() {
    if (this.gameTimer) clearTimeout(this.gameTimer);
    if (this.dayAdvanceInterval) clearInterval(this.dayAdvanceInterval);
    if (this.marketUpdateInterval) clearInterval(this.marketUpdateInterval);
    if (this.revenueCollectionInterval) clearInterval(this.revenueCollectionInterval);
  }
}

module.exports = GameRoom;