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
    actions: 20,
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
  
  // Process purchase
  gameState.core.parcels[parcelId] = {
    owner: playerId,
    building: building,
    timestamp: Date.now(),
    purchasePrice: purchasePrice || 0
  };
  
  // Update player data
  if (gameState.core.players.has(playerId)) {
    const player = gameState.core.players.get(playerId);
    player.ownedParcels.push(parcelId);
    player.cash -= purchasePrice || 0;
  }
  
  // Add immediate LVT fee to treasury (typically 1-2% of purchase price)
  const lvtFee = (purchasePrice || 0) * 0.01; // 1% immediate LVT fee
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
  
  // Update building
  gameState.core.parcels[parcelId].building = building;
  gameState.core.parcels[parcelId].constructionStartDay = constructionStartDay;
  gameState.core.parcels[parcelId].constructionDays = constructionDays;
  
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
      isPaused: gameState.core.isPaused
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 The Commons WebSocket server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, wss };