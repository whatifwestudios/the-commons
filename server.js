/**
 * Railway WebSocket Server for The Commons
 * Full multiplayer server with real WebSocket support
 */

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Enhanced game state with versioning and metadata
let gameState = {
  // Core game state
  core: {
    players: new Map(),
    parcels: {},
    currentMonth: 'SEPT',
    currentDay: 1,
    gameSpeed: 1,
    isPaused: false,
    governance: {
      budgetCategories: ['housing', 'commercial', 'industrial', 'utilities', 'transport', 'education', 'healthcare', 'emergency', 'parks', 'ubi'],
      categoryAllocations: {
        housing: 0,
        commercial: 0,
        industrial: 0,
        utilities: 0,
        transport: 0,
        education: 0,
        healthcare: 0,
        emergency: 0,
        parks: 0,
        ubi: 0
      },
      publicCoffers: {
        housing: 0,
        commercial: 0,
        industrial: 0,
        utilities: 0,
        transport: 0,
        education: 0,
        healthcare: 0,
        emergency: 0,
        parks: 0,
        ubi: 0
      },
      unallocatedFunds: 0,
      totalBudget: 0,
      currentLvtRate: 0.50
    },
    transportation: {
      roads: {}, // key: "row1,col1-row2,col2", value: road data
      transitStops: {}, // key: "row,col", value: stop data
      transitRoutes: {} // key: routeId, value: route data
    }
  },
  
  // Calculated state (server-authoritative)
  calculated: {
    treasury: 0,
    population: 0,
    vitality: {
      energy: { supply: 0, demand: 0, balance: 0 },
      food: { supply: 0, demand: 0, balance: 0 },
      housing: { supply: 0, demand: 0, balance: 0 },
      jobs: { supply: 0, demand: 0, balance: 0 }
    },
    marketMultipliers: {
      energy: 1.0,
      food: 1.0,
      housing: 1.0,
      jobs: 1.0
    },
    lastCalculated: Date.now()
  },
  
  // Version control for conflict resolution
  version: {
    global: 0,
    perParcel: {},
    perPlayer: {}
  },
  
  // Server metadata
  meta: {
    lastUpdate: Date.now(),
    activeConnections: new Set(),
    actionQueue: [],
    conflictLog: []
  }
};

// Connected clients
const clients = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    players: gameState.core.players.size,
    connections: clients.size,
    version: gameState.version.global
  });
});

// Serve main game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('🔌 New WebSocket connection');
  
  let clientId = null;
  let playerId = null;
  
  // Generate client ID
  clientId = 'client_' + Math.random().toString(36).substr(2, 9);
  clients.set(clientId, {
    ws,
    playerId: null,
    lastSeen: Date.now(),
    connected: true
  });
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      await handleWebSocketMessage(ws, clientId, data);
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        error: 'INVALID_MESSAGE',
        message: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`📱 Client ${clientId} disconnected`);
    
    if (playerId) {
      // Mark player as disconnected
      if (gameState.core.players.has(playerId)) {
        gameState.core.players.get(playerId).connected = false;
        gameState.core.players.get(playerId).lastSeen = Date.now();
      }
      
      // Broadcast player disconnection
      broadcastToAll({
        type: 'PLAYER_LEFT',
        playerId: playerId,
        timestamp: Date.now()
      });
    }
    
    clients.delete(clientId);
    gameState.meta.activeConnections.delete(playerId);
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
  
  // Send initial connection acknowledgment
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    clientId: clientId,
    timestamp: Date.now()
  }));
});

async function handleWebSocketMessage(ws, clientId, data) {
  const client = clients.get(clientId);
  if (!client) return;
  
  switch (data.type) {
    case 'JOIN_GAME':
      await handleJoinGame(ws, clientId, data);
      break;
      
    case 'ACTION':
      await handleGameAction(ws, clientId, data);
      break;
      
    case 'HEARTBEAT':
      handleHeartbeat(ws, clientId, data);
      break;
      
    case 'REQUEST_SYNC':
      handleRequestSync(ws, clientId, data);
      break;
      
    default:
      console.warn('Unknown message type:', data.type);
  }
}

async function handleJoinGame(ws, clientId, data) {
  const { playerName = 'Player', playerColor = '#2196F3', playerEmoji = '🏠' } = data;
  
  // Generate or use existing player ID
  let playerId = data.playerId;
  if (!playerId || !gameState.core.players.has(playerId)) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  }
  
  // Create or update player
  const player = {
    id: playerId,
    name: playerName,
    color: playerColor,
    emoji: playerEmoji,
    joinedAt: Date.now(),
    cash: 5000,
    wealth: 5000,
    actionManager: {
      monthlyAllowance: 20,
      currentActions: 20,
      usedThisMonth: 0
    },
    votingPoints: 0,
    ownedParcels: [],
    lastSeen: Date.now(),
    connected: true
  };
  
  gameState.core.players.set(playerId, player);
  gameState.version.perPlayer[playerId] = 0;
  gameState.meta.activeConnections.add(playerId);
  
  // Update client record
  const client = clients.get(clientId);
  client.playerId = playerId;
  
  // Increment global version and recalculate state
  gameState.version.global++;
  await recalculateAuthoritativeState();
  
  // Send join confirmation
  ws.send(JSON.stringify({
    type: 'JOIN_SUCCESS',
    playerId: playerId,
    player: player,
    gameState: getClientSafeState(),
    players: Array.from(gameState.core.players.values()),
    version: gameState.version.global,
    timestamp: Date.now()
  }));
  
  // Broadcast player join to all other clients
  broadcastToOthers(clientId, {
    type: 'PLAYER_JOINED',
    player: player,
    version: gameState.version.global,
    timestamp: Date.now()
  });
  
  console.log(`✅ Player ${playerName} (${playerId}) joined the game`);
}

async function handleGameAction(ws, clientId, data) {
  const client = clients.get(clientId);
  if (!client || !client.playerId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'NOT_AUTHENTICATED',
      message: 'Must join game first'
    }));
    return;
  }
  
  const action = {
    ...data.action,
    id: data.id || crypto.randomUUID(),
    playerId: client.playerId,
    timestamp: Date.now(),
    clientVersion: data.clientVersion || 0
  };
  
  try {
    const result = await processGameAction(action);
    
    if (result.success) {
      // Send success response to sender
      ws.send(JSON.stringify({
        type: 'ACTION_SUCCESS',
        actionId: action.id,
        result: result,
        version: gameState.version.global,
        timestamp: Date.now()
      }));
      
      // Broadcast state changes to all clients
      if (result.stateChanges && Object.keys(result.stateChanges).length > 0) {
        broadcastToAll({
          type: 'STATE_DIFF',
          diff: {
            version: gameState.version.global,
            changes: result.stateChanges,
            timestamp: Date.now()
          }
        });
      }
    } else {
      // Send error response
      ws.send(JSON.stringify({
        type: 'ACTION_ERROR',
        actionId: action.id,
        error: result.error,
        message: result.message,
        timestamp: Date.now()
      }));
    }
  } catch (error) {
    console.error('❌ Error processing action:', error);
    ws.send(JSON.stringify({
      type: 'ACTION_ERROR',
      actionId: action.id,
      error: 'PROCESSING_ERROR',
      message: error.message,
      timestamp: Date.now()
    }));
  }
}

function handleHeartbeat(ws, clientId, data) {
  const client = clients.get(clientId);
  if (client) {
    client.lastSeen = Date.now();
    
    if (client.playerId && gameState.core.players.has(client.playerId)) {
      gameState.core.players.get(client.playerId).lastSeen = Date.now();
    }
  }
  
  ws.send(JSON.stringify({
    type: 'HEARTBEAT_ACK',
    timestamp: Date.now(),
    version: gameState.version.global
  }));
}

function handleRequestSync(ws, clientId, data) {
  ws.send(JSON.stringify({
    type: 'FULL_SYNC',
    gameState: getClientSafeState(),
    players: Array.from(gameState.core.players.values()),
    version: gameState.version.global,
    timestamp: Date.now()
  }));
}

async function processGameAction(action) {
  switch (action.type) {
    case 'PURCHASE_PARCEL':
      return await processPurchaseParcel(action);
    case 'CONSTRUCT_BUILDING':
      return await processConstructBuilding(action);
    case 'UPDATE_CASH':
      return await processUpdateCash(action);
    case 'ADVANCE_TIME':
      return await processAdvanceTime(action);
    case 'TREASURY_FEE':
      return await processTreasuryFee(action);
    case 'REQUEST_LAND_PRICE':
      return await processLandPriceRequest(action);
    case 'BUILD_ROAD':
      return await processBuildRoad(action);
    case 'BUILD_TRANSIT_STOP':
      return await processBuildTransitStop(action);
    case 'CREATE_TRANSIT_ROUTE':
      return await processCreateTransitRoute(action);
    case 'ALLOCATE_VOTE':
      return await processAllocateVote(action, playerId);
    case 'ALLOCATE_LVT_POINT':
      return await processAllocateLVTPoint(action, playerId);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function processPurchaseParcel(action) {
  const { parcelId, building, purchasePrice, playerId } = action;
  
  // Check for conflicts
  if (gameState.core.parcels[parcelId]?.owner) {
    return {
      success: false,
      error: 'PARCEL_ALREADY_OWNED',
      message: 'This parcel has already been purchased',
      currentOwner: gameState.core.parcels[parcelId].owner
    };
  }
  
  // Validate player and actions
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 1; // Cost to purchase a parcel
  
  // Check action availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  // Calculate authoritative land price
  const [row, col] = parcelId.split('-').map(Number);
  const authoritativePrice = calculateParcelPrice(row, col);
  
  // Check cash availability using server price (ignore client's suggested price)
  if (player.cash < authoritativePrice) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Not enough cash. This parcel costs $${authoritativePrice} but you have $${Math.round(player.cash)}`
    };
  }
  
  // Process purchase using authoritative price
  gameState.core.parcels[parcelId] = {
    owner: playerId,
    building: building,
    timestamp: Date.now(),
    purchasePrice: authoritativePrice,
    buildingAge: 0,
    decay: 0,
    amenities: []
  };
  
  // Update player data
  player.ownedParcels.push(parcelId);
  player.cash -= authoritativePrice;
  
  // Deduct action cost
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
  // Add immediate LVT fee to treasury (typically 1-2% of purchase price)
  const lvtFee = authoritativePrice * 0.01; // 1% immediate LVT fee
  gameState.core.governance.unallocatedFunds += lvtFee;
  
  // Update versions
  gameState.version.global++;
  gameState.version.perParcel[parcelId] = gameState.version.global;
  gameState.version.perPlayer[playerId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      parcels: { [parcelId]: gameState.core.parcels[parcelId] },
      players: { [playerId]: Object.fromEntries([[playerId, gameState.core.players.get(playerId)]]) }
    }
  };
}

async function processConstructBuilding(action) {
  const { parcelId, building, constructionStartDay, constructionDays, playerId } = action;
  
  if (!gameState.core.parcels[parcelId] || gameState.core.parcels[parcelId].owner !== playerId) {
    return {
      success: false,
      error: 'UNAUTHORIZED',
      message: 'You do not own this parcel'
    };
  }
  
  // Validate player and actions
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 1; // Cost to construct a building
  
  // Check action availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  // Update building
  gameState.core.parcels[parcelId].building = building;
  gameState.core.parcels[parcelId].constructionStartDay = constructionStartDay;
  gameState.core.parcels[parcelId].constructionDays = constructionDays;
  
  // Deduct action cost
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
  // Update versions
  gameState.version.global++;
  gameState.version.perParcel[parcelId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      parcels: { [parcelId]: gameState.core.parcels[parcelId] }
    }
  };
}

async function processUpdateCash(action) {
  const { playerId, amount } = action;
  
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'PLAYER_NOT_FOUND',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  player.cash += amount;
  
  // Update versions
  gameState.version.global++;
  gameState.version.perPlayer[playerId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      players: { [playerId]: Object.fromEntries([[playerId, player]]) }
    }
  };
}

async function processAdvanceTime(action) {
  const { day, month } = action;
  
  gameState.core.currentDay = day;
  gameState.core.currentMonth = month;
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      world: {
        currentDay: day,
        currentMonth: month
      }
    }
  };
}

async function processTreasuryFee(action) {
  const { playerId, amount, reason } = action;
  
  // Validate inputs
  if (!playerId || !gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  if (!amount || amount <= 0) {
    return {
      success: false,
      error: 'INVALID_AMOUNT',
      message: 'Fee amount must be positive'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  
  // Check if player has enough cash
  if (player.cash < amount) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: 'Player does not have enough cash for this fee'
    };
  }
  
  // Process fee transaction
  player.cash -= amount;
  gameState.core.governance.unallocatedFunds += amount;
  
  // Update versions
  gameState.version.global++;
  gameState.version.perPlayer[playerId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  console.log(`💰 ${reason || 'Fee'}: $${amount} from ${player.name} → Treasury`);
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      players: { [playerId]: Object.fromEntries([[playerId, player]]) }
    }
  };
}

// Utility functions
function getClientSafeState() {
  return {
    core: {
      players: Object.fromEntries(gameState.core.players),
      parcels: gameState.core.parcels,
      currentMonth: gameState.core.currentMonth,
      currentDay: gameState.core.currentDay,
      gameSpeed: gameState.core.gameSpeed,
      isPaused: gameState.core.isPaused,
      transportation: gameState.core.transportation,
      governance: gameState.core.governance
    },
    calculated: gameState.calculated,
    version: gameState.version.global,
    timestamp: gameState.meta.lastUpdate
  };
}

function broadcastToAll(message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, clientId) => {
    if (client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${clientId}:`, error);
        clients.delete(clientId);
      }
    }
  });
}

async function processLandPriceRequest(action) {
  const { parcelId, playerId } = action;
  
  if (!parcelId) {
    return {
      success: false,
      error: 'INVALID_PARCEL',
      message: 'Parcel ID is required'
    };
  }
  
  // Check if parcel is already owned
  if (gameState.core.parcels[parcelId]?.owner) {
    return {
      success: false,
      error: 'PARCEL_ALREADY_OWNED',
      message: 'This parcel has already been purchased',
      currentOwner: gameState.core.parcels[parcelId].owner
    };
  }
  
  // Calculate price
  const [row, col] = parcelId.split('-').map(Number);
  const price = calculateParcelPrice(row, col);
  
  return {
    success: true,
    parcelId: parcelId,
    price: price,
    coordinates: `${row}-${col}`,
    processedAction: action
  };
}

async function processBuildRoad(action) {
  const { roadId, roadData, playerId } = action;
  
  // Validate player and actions
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 1;
  const roadCost = roadData.cost || 500;
  
  // Check action and cash availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  if (player.cash < roadCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Not enough cash. Road costs $${roadCost}`
    };
  }
  
  // Build road
  gameState.core.transportation.roads[roadId] = {
    ...roadData,
    builtBy: playerId,
    timestamp: Date.now()
  };
  
  // Deduct costs
  player.cash -= roadCost;
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      transportation: {
        roads: { [roadId]: gameState.core.transportation.roads[roadId] }
      },
      players: { [playerId]: Object.fromEntries([[playerId, player]]) }
    }
  };
}

async function processBuildTransitStop(action) {
  const { stopId, stopData, playerId } = action;
  
  // Validate player and actions
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 1;
  const stopCost = stopData.cost || 2000;
  
  // Check action and cash availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  if (player.cash < stopCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Not enough cash. Transit stop costs $${stopCost}`
    };
  }
  
  // Build transit stop
  gameState.core.transportation.transitStops[stopId] = {
    ...stopData,
    builtBy: playerId,
    timestamp: Date.now()
  };
  
  // Deduct costs
  player.cash -= stopCost;
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      transportation: {
        transitStops: { [stopId]: gameState.core.transportation.transitStops[stopId] }
      },
      players: { [playerId]: Object.fromEntries([[playerId, player]]) }
    }
  };
}

async function processCreateTransitRoute(action) {
  const { routeId, routeData, playerId } = action;
  
  // Validate player and actions
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 2; // Routes cost more actions
  const routeCost = routeData.cost || 5000;
  
  // Check action and cash availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  if (player.cash < routeCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_FUNDS',
      message: `Not enough cash. Transit route costs $${routeCost}`
    };
  }
  
  // Create transit route
  gameState.core.transportation.transitRoutes[routeId] = {
    ...routeData,
    createdBy: playerId,
    timestamp: Date.now()
  };
  
  // Deduct costs
  player.cash -= routeCost;
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  await recalculateAuthoritativeState();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      transportation: {
        transitRoutes: { [routeId]: gameState.core.transportation.transitRoutes[routeId] }
      },
      players: { [playerId]: Object.fromEntries([[playerId, player]]) }
    }
  };
}

function broadcastToOthers(excludeClientId, message) {
  const messageStr = JSON.stringify(message);
  clients.forEach((client, clientId) => {
    if (clientId !== excludeClientId && client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${clientId}:`, error);
        clients.delete(clientId);
      }
    }
  });
}

// Server-side land value calculation
function calculateParcelPrice(row, col) {
  // Same algorithm as client, but server-authoritative
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
  
  const basePrice = 500 - priceReduction;
  
  // Add some variance for realism (±10%)
  const variance = (Math.random() - 0.5) * 0.2; // -10% to +10%
  const finalPrice = Math.max(100, basePrice * (1 + variance));
  
  return Math.round(finalPrice);
}

// Import the authoritative state calculator
async function recalculateAuthoritativeState() {
  const startTime = Date.now();
  
  // Reset calculated values
  gameState.calculated.treasury = 0;
  gameState.calculated.population = 0;
  
  // Reset vitality
  Object.keys(gameState.calculated.vitality).forEach(key => {
    gameState.calculated.vitality[key] = { supply: 0, demand: 0, balance: 0 };
  });
  
  // Building type definitions (server-side copy of building data)
  const buildingTypes = {
    'house': { population: 4, housing: 1, energyDemand: 2, maintenanceCost: 50, lvtRate: 0.01 },
    'apartment': { population: 12, housing: 3, energyDemand: 6, maintenanceCost: 120, lvtRate: 0.015 },
    'shop': { jobs: 2, energyDemand: 3, revenue: 100, maintenanceCost: 75, lvtRate: 0.02 },
    'office': { jobs: 8, energyDemand: 5, revenue: 300, maintenanceCost: 150, lvtRate: 0.025 },
    'solar': { energySupply: 10, maintenanceCost: 25, lvtRate: 0.005 },
    'wind': { energySupply: 15, maintenanceCost: 40, lvtRate: 0.008 },
    'farm': { foodProduction: 8, jobs: 1, maintenanceCost: 30, lvtRate: 0.005 },
    'market': { foodSupply: 20, jobs: 3, energyDemand: 4, revenue: 150, maintenanceCost: 90, lvtRate: 0.015 }
  };
  
  let totalRevenue = 0;
  let totalMaintenance = 0;
  
  // Calculate from all parcels
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.building) {
      const buildingType = buildingTypes[parcel.building];
      if (!buildingType) return;
      
      // Apply all building effects
      if (buildingType.population) gameState.calculated.population += buildingType.population;
      if (buildingType.housing) gameState.calculated.vitality.housing.supply += buildingType.housing;
      if (buildingType.jobs) gameState.calculated.vitality.jobs.supply += buildingType.jobs;
      if (buildingType.energySupply) gameState.calculated.vitality.energy.supply += buildingType.energySupply;
      if (buildingType.energyDemand) gameState.calculated.vitality.energy.demand += buildingType.energyDemand;
      if (buildingType.foodProduction) gameState.calculated.vitality.food.supply += buildingType.foodProduction;
      if (buildingType.foodSupply) gameState.calculated.vitality.food.supply += buildingType.foodSupply;
      if (buildingType.revenue) totalRevenue += buildingType.revenue;
      if (buildingType.maintenanceCost) totalMaintenance += buildingType.maintenanceCost;
      
      // LVT calculation
      const parcelValue = parcel.purchasePrice || 1000;
      gameState.calculated.treasury += parcelValue * (buildingType.lvtRate || 0.01);
    }
  });
  
  // Calculate population-based demands
  if (gameState.calculated.population > 0) {
    gameState.calculated.vitality.food.demand = gameState.calculated.population * 0.5;
    gameState.calculated.vitality.jobs.demand = gameState.calculated.population * 0.6;
    gameState.calculated.vitality.energy.demand += gameState.calculated.population * 0.3;
  }
  
  // Calculate balances and multipliers
  Object.keys(gameState.calculated.vitality).forEach(key => {
    const vitality = gameState.calculated.vitality[key];
    vitality.balance = vitality.supply - vitality.demand;
    
    if (vitality.supply > 0) {
      const ratio = vitality.demand / vitality.supply;
      gameState.calculated.marketMultipliers[key] = Math.max(0.5, Math.min(2.0, ratio));
    } else {
      gameState.calculated.marketMultipliers[key] = 2.0;
    }
  });
  
  // Add economic performance to treasury (daily building revenue minus maintenance)
  gameState.calculated.treasury += Math.max(0, totalRevenue - totalMaintenance);
  
  // Calculate comprehensive treasury from governance system
  let totalTreasury = 0;
  
  // Add all allocated funds in public coffers
  Object.values(gameState.core.governance.publicCoffers).forEach(amount => {
    totalTreasury += amount || 0;
  });
  
  // Add unallocated funds
  totalTreasury += gameState.core.governance.unallocatedFunds || 0;
  
  // Add LVT collection to unallocated funds (this would normally happen during daily time advance)
  gameState.core.governance.unallocatedFunds += gameState.calculated.treasury;
  
  // Update final treasury total
  gameState.calculated.treasury = totalTreasury + gameState.calculated.treasury;
  gameState.calculated.lastCalculated = Date.now();
  
  console.log(`✅ State recalculated in ${Date.now() - startTime}ms: Pop=${gameState.calculated.population}, Treasury=$${Math.round(gameState.calculated.treasury)} (Unallocated: $${Math.round(gameState.core.governance.unallocatedFunds)})`);
}

// Cleanup disconnected clients every 5 minutes
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  clients.forEach((client, clientId) => {
    if (now - client.lastSeen > timeout) {
      console.log(`🧹 Cleaning up stale client: ${clientId}`);
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.close();
      }
      clients.delete(clientId);
    }
  });
}, 5 * 60 * 1000);

// Broadcast construction progress updates every 5 seconds
setInterval(async () => {
  let hasConstructionUpdates = false;
  let constructionUpdates = {};
  
  // Check all parcels for ongoing construction
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.constructionStartDay !== undefined && parcel.constructionDays > 0) {
      // Calculate construction progress (simplified - assumes 1 day = real time)
      const daysPassed = gameState.core.currentDay - parcel.constructionStartDay;
      const progress = Math.min(1.0, Math.max(0.0, daysPassed / parcel.constructionDays));
      
      // Store construction progress
      constructionUpdates[parcelId] = {
        building: parcel.building,
        constructionStartDay: parcel.constructionStartDay,
        constructionDays: parcel.constructionDays,
        progress: progress,
        isComplete: progress >= 1.0
      };
      
      hasConstructionUpdates = true;
      
      // If construction is complete, clean up construction fields
      if (progress >= 1.0) {
        delete parcel.constructionStartDay;
        delete parcel.constructionDays;
        gameState.version.global++;
        gameState.version.perParcel[parcelId] = gameState.version.global;
      }
    }
  });
  
  // Broadcast construction updates if any exist
  if (hasConstructionUpdates) {
    const constructionMessage = {
      type: 'CONSTRUCTION_UPDATE',
      construction: constructionUpdates,
      timestamp: Date.now(),
      version: gameState.version.global
    };
    
    broadcastToAll(constructionMessage);
    
    // Recalculate state if any construction completed
    const completedCount = Object.values(constructionUpdates).filter(c => c.isComplete).length;
    if (completedCount > 0) {
      await recalculateAuthoritativeState();
      console.log(`🏗️ ${completedCount} buildings completed construction`);
    }
  }
}, 5000); // Every 5 seconds

// Daily building aging system (every 60 seconds = 1 game day)
setInterval(async () => {
  console.log('🕐 Processing daily building aging...');
  
  let buildingsAged = 0;
  let buildingsDecayed = 0;
  
  // Age all buildings
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.building && parcel.owner) {
      // Age the building
      parcel.buildingAge = (parcel.buildingAge || 0) + 1;
      buildingsAged++;
      
      // Calculate decay based on age (buildings start decaying after 30 days)
      if (parcel.buildingAge > 30) {
        const ageOverThreshold = parcel.buildingAge - 30;
        const decayRate = 0.002; // 0.2% per day after threshold
        const newDecay = Math.min(0.8, ageOverThreshold * decayRate); // Max 80% decay
        
        if (newDecay > (parcel.decay || 0)) {
          parcel.decay = newDecay;
          buildingsDecayed++;
        }
      }
      
      // Mark parcel as updated
      gameState.version.perParcel[parcelId] = gameState.version.global + 1;
    }
  });
  
  if (buildingsAged > 0) {
    // Increment global version and recalculate
    gameState.version.global++;
    gameState.meta.lastUpdate = Date.now();
    
    await recalculateAuthoritativeState();
    
    // Broadcast aging updates to all clients
    const agingMessage = {
      type: 'BUILDING_AGING_UPDATE',
      summary: {
        buildingsAged,
        buildingsDecayed,
        gameDay: gameState.core.currentDay
      },
      timestamp: Date.now(),
      version: gameState.version.global
    };
    
    broadcastToAll(agingMessage);
    
    console.log(`📈 Buildings aged: ${buildingsAged}, Decayed: ${buildingsDecayed}`);
  }
}, 60000); // Every 60 seconds (1 game day)

// Governance action processors
async function processAllocateVote(action, playerId) {
  const { category, change } = action;
  
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'PLAYER_NOT_FOUND',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  
  // Initialize player governance data if needed
  if (!player.governance) {
    player.governance = {
      playerAllocations: {},
      totalVotingPoints: 2 // Starting points
    };
  }
  
  // Initialize category allocation if needed
  if (!player.governance.playerAllocations[category]) {
    player.governance.playerAllocations[category] = 0;
  }
  
  const currentAllocation = player.governance.playerAllocations[category];
  const newAllocation = Math.max(0, currentAllocation + change);
  
  // Calculate total points that would be used after this change
  const totalUsedPoints = getTotalAllocatedPoints(player) - currentAllocation + newAllocation;
  
  // Check if player has enough points
  if (totalUsedPoints > player.governance.totalVotingPoints) {
    return {
      success: false,
      error: 'INSUFFICIENT_POINTS',
      message: `Not enough voting points: ${totalUsedPoints} > ${player.governance.totalVotingPoints}`
    };
  }
  
  // Apply the allocation
  player.governance.playerAllocations[category] = newAllocation;
  
  // Recalculate global budget allocations based on all players
  recalculateGlobalBudgetAllocations();
  
  // Update versions
  gameState.version.global++;
  gameState.version.perPlayer[playerId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  console.log(`🗳️ Player ${playerId} allocated ${change} points to ${category} (total: ${newAllocation})`);
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      players: { [playerId]: player },
      governance: gameState.core.governance
    }
  };
}

async function processAllocateLVTPoint(action, playerId) {
  const { change } = action;
  
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'PLAYER_NOT_FOUND',
      message: 'Player not found'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  
  // Initialize player governance data if needed
  if (!player.governance) {
    player.governance = {
      playerAllocations: {},
      totalVotingPoints: 2
    };
  }
  
  // Initialize LVT allocation if needed
  if (!player.governance.playerAllocations.lvtRate) {
    player.governance.playerAllocations.lvtRate = 0;
  }
  
  const currentAllocation = player.governance.playerAllocations.lvtRate;
  const newAllocation = currentAllocation + change; // Can be negative
  
  // Calculate total points that would be used after this change
  const totalUsedPoints = getTotalAllocatedPoints(player) - Math.abs(currentAllocation) + Math.abs(newAllocation);
  
  // Check if player has enough points
  if (totalUsedPoints > player.governance.totalVotingPoints) {
    return {
      success: false,
      error: 'INSUFFICIENT_POINTS',
      message: `Not enough voting points: ${totalUsedPoints} > ${player.governance.totalVotingPoints}`
    };
  }
  
  // Apply the allocation
  player.governance.playerAllocations.lvtRate = newAllocation;
  
  // Recalculate global LVT rate based on all players
  recalculateGlobalLVTRate();
  
  // Update versions
  gameState.version.global++;
  gameState.version.perPlayer[playerId] = gameState.version.global;
  gameState.meta.lastUpdate = Date.now();
  
  console.log(`💰 Player ${playerId} allocated ${change} LVT points (total: ${newAllocation})`);
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      players: { [playerId]: player },
      governance: gameState.core.governance
    }
  };
}

// Helper function to calculate total allocated points for a player
function getTotalAllocatedPoints(player) {
  if (!player.governance || !player.governance.playerAllocations) {
    return 0;
  }
  
  let total = 0;
  Object.entries(player.governance.playerAllocations).forEach(([key, value]) => {
    if (key === 'lvtRate') {
      total += Math.abs(value); // LVT points can be negative
    } else {
      total += value;
    }
  });
  
  return total;
}

// Recalculate global budget allocations based on all player votes
function recalculateGlobalBudgetAllocations() {
  const totalVotes = {};
  let totalVotingPower = 0;
  
  // Aggregate all player votes
  gameState.core.players.forEach(player => {
    if (player.governance && player.governance.playerAllocations) {
      Object.entries(player.governance.playerAllocations).forEach(([category, allocation]) => {
        if (category !== 'lvtRate' && allocation > 0) {
          totalVotes[category] = (totalVotes[category] || 0) + allocation;
          totalVotingPower += allocation;
        }
      });
    }
  });
  
  // Calculate proportional allocations
  if (totalVotingPower > 0) {
    Object.keys(gameState.core.governance.categoryAllocations).forEach(category => {
      const votes = totalVotes[category] || 0;
      gameState.core.governance.categoryAllocations[category] = votes / totalVotingPower;
    });
  }
  
  console.log('🗳️ Recalculated budget allocations:', gameState.core.governance.categoryAllocations);
}

// Recalculate global LVT rate based on all player votes
function recalculateGlobalLVTRate() {
  let totalLVTVotes = 0;
  let totalVoters = 0;
  
  // Aggregate all player LVT votes
  gameState.core.players.forEach(player => {
    if (player.governance && player.governance.playerAllocations && player.governance.playerAllocations.lvtRate !== undefined) {
      totalLVTVotes += player.governance.playerAllocations.lvtRate;
      totalVoters += 1;
    }
  });
  
  // Calculate average and apply to base rate
  const baseLvtRate = 0.15; // 15% base rate
  const averageVoteChange = totalVoters > 0 ? totalLVTVotes / totalVoters : 0;
  const newRate = Math.max(0, Math.min(1, baseLvtRate + (averageVoteChange * 0.01))); // Each point = 1%
  
  gameState.core.governance.currentLvtRate = newRate;
  gameState.core.governance.proposedLvtRate = newRate;
  
  console.log(`💰 Recalculated LVT rate: ${(newRate * 100).toFixed(2)}% (base: ${(baseLvtRate * 100).toFixed(2)}%, votes: ${totalLVTVotes})`);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 The Commons WebSocket server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, wss };