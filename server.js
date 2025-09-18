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

// Game instances - one per active room/game
const gameInstances = new Map();

// Create a new game state template
function createGameStateTemplate() {
  return {
    // Core game state
    core: {
      players: new Map(),
      parcels: {},
      auctions: new Map(),
      currentMonth: 'SEPT',
      currentDay: 1,
      gameSpeed: 1,
      isPaused: false,
      governance: {
        budgetCategories: ['education', 'healthcare', 'infrastructure', 'housing', 'culture', 'recreation', 'commercial', 'civic', 'emergency', 'ubi'],
        categoryAllocations: {
          education: 0,
          healthcare: 0,
          infrastructure: 0,
          housing: 0,
          culture: 0,
          recreation: 0,
          commercial: 0,
          civic: 0,
          emergency: 0,
          ubi: 0
        },
        publicCoffers: {
          education: 0,
          healthcare: 0,
          infrastructure: 0,
          housing: 0,
          culture: 0,
          recreation: 0,
          commercial: 0,
          civic: 0,
          emergency: 0,
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
    },

    // Game lifecycle management
    lifecycle: {
      gameId: null, // Unique game identifier
      cityName: null, // Player-chosen city name
      status: 'waiting', // 'waiting', 'active', 'ended', 'archived'
      startTime: null,
      endTime: null,
      endReason: null, // 'all_players_left', 'time_limit', 'manual'
      maxPlayers: 4,
      activePlayers: new Set(), // Currently connected players
      departedPlayers: new Set(), // Players who left permanently
      allowRejoining: false, // Whether players can rejoin after leaving
      gameLength: 365, // Days until auto-end (1 year = Sept 1 to Sept 1)
      snapshot: null // End-game state snapshot
    }
  };
}

// Get or create game instance for a room
function getGameInstance(roomId) {
  if (!gameInstances.has(roomId)) {
    gameInstances.set(roomId, createGameStateTemplate());
  }
  return gameInstances.get(roomId);
}

// Get game instance for a client (based on their room)
function getGameInstanceForClient(clientId) {
  const client = clients.get(clientId);
  if (!client) return getGameInstance('default');

  // If client is in a room, use that room's game instance
  if (client.roomId) {
    const room = waitingRooms.get(client.roomId);
    if (room && room.gameInstanceId) {
      return getGameInstance(room.gameInstanceId);
    }
  }

  // Auto-assign clients without rooms to the default room
  if (!client.roomId) {
    client.roomId = 'default';
    console.log(`🏠 Auto-assigned client ${clientId} to default room`);
  }

  // Default fallback
  return getGameInstance('default');
}

// Legacy compatibility - default to 'default' room for now
let gameState = getGameInstance('default');

// Waiting room management
const waitingRooms = new Map();

// Game history and leaderboard system
const gameHistory = new Map(); // Map<gameId, completedGameState>
const cityLeaderboard = []; // Array of completed games sorted by performance
let nextGameId = 1;
let roomIdCounter = 1;

// Default waiting room (global room for now)
const defaultWaitingRoom = {
  id: 'default',
  players: new Map(),
  chatMessages: [],
  settings: {
    targetSize: 4,
    minPlayers: 10, // Temporarily set high to disable auto-start for testing
    autoStart: true
  },
  status: 'waiting', // waiting, starting, in-game
  gameInstanceId: 'default', // Links to gameInstances Map
  createdAt: Date.now()
};

waitingRooms.set('default', defaultWaitingRoom);

// Connected clients
const clients = new Map();
const parcelLocks = new Set();
const auctionLocks = new Set();
const roadLocks = new Set();

// Reset endpoint - clears all game state
app.post('/reset', (req, res) => {
  console.log('🔄 Server reset requested');

  // Clear all game instances
  gameInstances.clear();

  // Reset default game state reference
  gameState = getGameInstance('default');

  // Disconnect all clients
  clients.forEach((client, clientId) => {
    client.ws.send(JSON.stringify({
      type: 'SERVER_RESET',
      message: 'Server has been reset. Please refresh the page.'
    }));
    client.ws.close();
  });

  // Clear client connections
  clients.clear();

  // Reset waiting rooms
  waitingRooms.clear();

  // Recreate default waiting room
  const defaultWaitingRoom = {
    id: 'default',
    name: 'Multiplayer Lobby',
    players: new Map(),
    status: 'waiting',
    maxPlayers: 4,
    minPlayers: 2,
    autoStart: true,
    chatMessages: [],
    gameInstanceId: 'default', // Links to gameInstances Map
    createdAt: Date.now()
  };
  waitingRooms.set('default', defaultWaitingRoom);

  console.log('✅ Server reset complete');
  res.json({
    success: true,
    message: 'Server reset complete',
    timestamp: Date.now()
  });
});

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

// API endpoint for leaderboard
app.get('/api/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const leaderboard = getTopLeaderboard(limit);
  
  res.json({
    success: true,
    leaderboard: leaderboard,
    totalGames: cityLeaderboard.length,
    timestamp: Date.now()
  });
});

// API endpoint for permanent departure
app.post('/api/permanent-departure', (req, res) => {
  const { playerId, reason } = req.body;
  
  if (!playerId) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST',
      message: 'Player ID is required'
    });
  }
  
  // Handle permanent departure
  handlePlayerDeparture(playerId, reason || 'manual');
  
  res.json({
    success: true,
    message: 'Player departure processed',
    timestamp: Date.now()
  });
});

// API endpoint for resetting server state
app.post('/api/reset', (req, res) => {
  try {
    // Clear all game instances
    gameInstances.clear();

    // Reset default game state reference
    gameState = getGameInstance('default');

    // Reset waiting rooms
    waitingRooms.clear();
    const defaultWaitingRoom = {
      id: 'default',
      players: new Map(),
      chatMessages: [],
      settings: {
        targetSize: 4,
        minPlayers: 10, // Temporarily set high to disable auto-start for testing
        autoStart: true
      },
      status: 'waiting',
      gameInstanceId: 'default',
      createdAt: Date.now()
    };
    waitingRooms.set('default', defaultWaitingRoom);

    res.json({
      success: true,
      message: 'Server state reset successfully',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to reset server state:', error);
    res.status(500).json({
      success: false,
      error: 'RESET_FAILED',
      message: 'Failed to reset server state'
    });
  }
});

// Serve main game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  // console.log('🔌 New WebSocket connection');
  
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
      // Mark player as disconnected in game state
      if (gameState.core.players.has(playerId)) {
        gameState.core.players.get(playerId).connected = false;
        gameState.core.players.get(playerId).lastSeen = Date.now();
      }
      
      // Handle permanent departure from game lifecycle
      handlePlayerDeparture(playerId, 'disconnect');
      
      // Remove from waiting rooms if they were in one
      waitingRooms.forEach((room, roomId) => {
        if (room.players.has(playerId)) {
          room.players.delete(playerId);
          broadcastToRoom(roomId, {
            type: 'PLAYER_LEFT_ROOM',
            playerId: playerId,
            playerCount: room.players.size
          });
        }
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
      
    case 'JOIN_WAITING_ROOM':
      await handleJoinWaitingRoom(ws, clientId, data);
      break;
      
    case 'LEAVE_WAITING_ROOM':
      await handleLeaveWaitingRoom(ws, clientId, data);
      break;
      
    case 'SEND_CHAT_MESSAGE':
      await handleChatMessage(ws, clientId, data);
      break;
      
    case 'UPDATE_ROOM_SETTINGS':
      await handleUpdateRoomSettings(ws, clientId, data);
      break;
      
    case 'START_MULTIPLAYER_GAME':
      await handleStartMultiplayerGame(ws, clientId, data);
      break;
      
    case 'VIEW_LEADERBOARD':
      handleViewLeaderboard(ws, clientId, data);
      break;
      
    case 'VIEW_GAME_HISTORY':
      handleViewGameHistory(ws, clientId, data);
      break;
      
    case 'START_NEW_GAME':
      await handleStartNewGame(ws, clientId, data);
      break;
      
    case 'ACTION_BATCH':
      await handleActionBatch(ws, clientId, data);
      break;
      
    default:
      console.warn('Unknown message type:', data.type);
  }
}

async function handleJoinGame(ws, clientId, data) {
  const { playerName = 'Player', playerColor = '#2196F3', playerEmoji = '🏠', cityName } = data;

  // Get the correct game instance for this client
  const gameState = getGameInstanceForClient(clientId);

  // Generate or use existing player ID
  let playerId = data.playerId;
  if (!playerId || !gameState.core.players.has(playerId)) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  }

  // Initialize new game if this is the first player or no game exists
  if (!gameState.lifecycle.gameId || gameState.lifecycle.status === 'ended' || gameState.lifecycle.status === 'archived') {
    const client = clients.get(clientId);
    const roomId = client?.roomId || 'default';
    const gameId = initializeNewGameForRoom(roomId, cityName || playerName + "'s City");
    console.log(`🎮 New game initialized: ${gameId} for room ${roomId}`);
  } else {
    // Game already exists - use existing city name (don't allow override)
    console.log(`🔗 Player ${playerName} joining existing game: ${gameState.lifecycle.cityName}`);
  }

  // Check if player can join this game
  const joinResult = handlePlayerJoinGameForInstance(playerId, gameState);
  if (!joinResult.success) {
    ws.send(JSON.stringify({
      type: 'JOIN_REJECTED',
      error: joinResult.error,
      message: joinResult.message,
      shouldRedirect: joinResult.shouldRedirect,
      timestamp: Date.now()
    }));
    return;
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
  
  // console.log(`✅ Player ${playerName} (${playerId}) joined the game`);
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

  if (data.clientVersion !== gameState.version.global) {
    ws.send(JSON.stringify({
        type: 'ERROR',
        error: 'VERSION_MISMATCH',
        message: 'Your game state is out of date. Please sync.',
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
    const result = await processGameAction(action, client.playerId);
    
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
    serverTime: Date.now(),
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

async function processGameAction(action, playerId) {
  console.log(`🎯 Debug: Processing action ${action.type} from player ${playerId}`);
  
  switch (action.type) {
    case 'PURCHASE_PARCEL':
      return await processPurchaseParcel(action, playerId);
    case 'CONSTRUCT_BUILDING':
      return await processConstructBuilding(action, playerId);
    case 'ADVANCE_TIME':
      return await processAdvanceTime(action, playerId);
    case 'TREASURY_FEE':
      return await processTreasuryFee(action, playerId);
    case 'REQUEST_LAND_PRICE':
      return await processLandPriceRequest(action, playerId);
    case 'BUILD_ROAD':
      return await processBuildRoad(action, playerId);
    case 'BUILD_TRANSIT_STOP':
      return await processBuildTransitStop(action, playerId);
    case 'CREATE_TRANSIT_ROUTE':
      return await processCreateTransitRoute(action, playerId);
    case 'ALLOCATE_VOTE':
      return await processAllocateVote(action, playerId);
    case 'ALLOCATE_LVT_POINT':
      return await processAllocateLVTPoint(action, playerId);
    case 'END_AUCTION_NOW':
        return await processEndAuctionNow(action, playerId);
    case 'CREATE_AUCTION_LISTING':
        return await processCreateAuctionListing(action, playerId);
    case 'BUY_NOW_LISTING':
        return await processBuyNowListing(action, playerId);
    case 'CANCEL_LISTING':
        return await processCancelListing(action, playerId);
    case 'BID_ON_LISTING':
        return await processBidOnListing(action, playerId);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function processPurchaseParcel(action, playerId) {
  const { parcelId, building, purchasePrice } = action;

  if (parcelLocks.has(parcelId)) {
    return {
      success: false,
      error: 'PARCEL_LOCKED',
      message: 'This parcel is currently being purchased. Please try again.'
    };
  }

  parcelLocks.add(parcelId);

  try {
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
          message: `Not enough cash. This parcel costs ${authoritativePrice} but you have ${Math.round(player.cash)}`
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
      
      // Phase 4: Mark parcel as dirty for cache invalidation
      calculationCache.dirtyParcels.add(parcelId);
      
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
          players: { [playerId]: gameState.core.players.get(playerId) }
        }
      };
    } finally {
        parcelLocks.delete(parcelId);
    }
}

async function processConstructBuilding(action, playerId) {
  const { parcelId, building, constructionStartDay, constructionDays, amenities } = action;
  console.log(`🏗️ Debug: Constructing ${building} at ${parcelId} by ${playerId}`);
  
  // Validate player and parcel
  if (!gameState.core.players.has(playerId)) {
    return {
      success: false,
      error: 'INVALID_PLAYER',
      message: 'Player not found'
    };
  }
  
  const parcel = gameState.core.parcels[parcelId];
  if (!parcel || parcel.owner !== playerId) {
    return {
      success: false,
      error: 'INVALID_PARCEL',
      message: 'Parcel not found or not owned by player'
    };
  }

  // IMPROVED: Check if building is already under construction or completed
  if (parcel.constructionStartDay !== null && parcel.constructionStartDay !== undefined) {
    const constructionInProgress = (gameState.core.currentDay - parcel.constructionStartDay) < parcel.constructionDays;
    if (constructionInProgress) {
      return {
        success: false,
        error: 'ALREADY_UNDER_CONSTRUCTION',
        message: 'Building is already under construction'
      };
    }
  }

  // Check if building is already completed
  if (parcel.constructionStartDay !== null && 
      (gameState.core.currentDay - parcel.constructionStartDay) >= parcel.constructionDays) {
    return {
      success: false,
      error: 'BUILDING_ALREADY_BUILT',
      message: 'Building construction is already complete'
    };
  }
  
  const player = gameState.core.players.get(playerId);
  const actionCost = 1;
  
  // Check action availability
  if (player.actionManager.currentActions < actionCost) {
    return {
      success: false,
      error: 'INSUFFICIENT_ACTIONS',
      message: 'Not enough actions remaining'
    };
  }
  
  // Set building and start construction
  parcel.building = building;
  parcel.constructionStartDay = constructionStartDay || gameState.core.currentDay;
  parcel.constructionDays = constructionDays || 3; // Use provided or default construction time
  
  // Set amenities if provided
  if (amenities) {
    parcel.amenities = amenities;
  }
  
  console.log(`🏗️ Server setting building: ${building} at ${parcelId} by ${playerId}`);
  
  // Deduct action cost
  player.actionManager.currentActions -= actionCost;
  player.actionManager.usedThisMonth += actionCost;
  
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
      parcels: { [parcelId]: parcel },
      players: { [playerId]: player }
    }
  };
}

async function processAdvanceTime(action, playerId) {
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

async function processTreasuryFee(action, playerId) {
  const { amount, reason } = action;
  
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
      players: { [playerId]: player }
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
      client.ws.send(messageStr, (error) => {
        if (error) {
          console.error(`Failed to send to ${clientId}:`, error);
          client.ws.close();
          clients.delete(clientId);
        }
      });
    }
  });
}

async function processLandPriceRequest(action, playerId) {
  const { parcelId } = action;
  
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

async function processBuildRoad(action, playerId) {
  const { roadKey, roadType, hasSidewalks, hasBikeLanes, cost, isUpgrade, existingRoad } = action;
  
  // CRITICAL: Lock road to prevent concurrent building
  if (roadLocks.has(roadKey)) {
    return {
      success: false,
      error: 'ROAD_LOCKED',
      message: 'This road segment is currently being built. Please try again.'
    };
  }

  roadLocks.add(roadKey);

  try {
    // Validate player and actions
    if (!gameState.core.players.has(playerId)) {
      return {
        success: false,
        error: 'INVALID_PLAYER',
        message: 'Player not found'
      };
    }

    // Check if road already exists (unless this is an upgrade)
    if (gameState.core.transportation.roads[roadKey] && !isUpgrade) {
      return {
        success: false,
        error: 'ROAD_ALREADY_EXISTS',
        message: 'This road segment already exists'
      };
    }
    
    const player = gameState.core.players.get(playerId);
    const roadCost = cost || 500;
    
    // Check cash availability (roads don't cost actions)
    if (player.cash < roadCost) {
      return {
        success: false,
        error: 'INSUFFICIENT_FUNDS',
        message: `Not enough cash. Road costs $${roadCost}`
      };
    }
  
    // Build road
    gameState.core.transportation.roads[roadKey] = {
      type: roadType,
      hasSidewalks: hasSidewalks,
      hasBikeLanes: hasBikeLanes,
      cost: roadCost,
      isUpgrade: isUpgrade,
      existingRoad: existingRoad,
      builtBy: playerId,
      timestamp: Date.now()
    };
    
    // Deduct costs (only cash, no actions for roads)
    player.cash -= roadCost;
    
    // Update versions
    gameState.version.global++;
    gameState.meta.lastUpdate = Date.now();
    
    await recalculateAuthoritativeState();
    
    return {
      success: true,
      processedAction: action,
      stateChanges: {
        transportation: {
          roads: { [roadKey]: gameState.core.transportation.roads[roadKey] }
        },
        players: { [playerId]: player }
      }
    };
  } finally {
    // CRITICAL: Always release road lock
    roadLocks.delete(roadKey);
  }
}

async function processBuildTransitStop(action, playerId) {
  const { stopId, stopData } = action;
  
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
      players: { [playerId]: player }
    }
  };
}

async function processCreateTransitRoute(action, playerId) {
  const { routeId, routeData } = action;
  
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
      players: { [playerId]: player }
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

// Phase 4: Optimized building type cache (moved outside function for reuse)
const BUILDING_TYPES_CACHE = {
  'cottage': { bedroomsAdded: 2, populationRequired: 0, energyDemand: 5, foodProduction: 0, jobsCreated: 0 },
  'apartments': { bedroomsAdded: 12, populationRequired: 0, energyDemand: 25, foodProduction: 0, jobsCreated: 0 },
  'farmers_market': { bedroomsAdded: 0, populationRequired: 0, energyDemand: 0, foodProduction: 40, jobsCreated: 10 },
  'solar_farm': { bedroomsAdded: 0, populationRequired: 0, energyDemand: -20, foodProduction: 0, jobsCreated: 2 }, // Negative = energy production
  'high_school': { bedroomsAdded: 0, populationRequired: 100, energyDemand: 50, foodProduction: 0, jobsCreated: 20 },
  'schoolhouse': { bedroomsAdded: 0, populationRequired: 25, energyDemand: 20, foodProduction: 0, jobsCreated: 12 },
  'corner_store': { bedroomsAdded: 0, populationRequired: 15, energyDemand: 15, foodProduction: 35, jobsCreated: 6 },
  'library': { bedroomsAdded: 0, populationRequired: 50, energyDemand: 12, foodProduction: 0, jobsCreated: 12 },
  'bakery': { bedroomsAdded: 0, populationRequired: 30, energyDemand: 15, foodProduction: 25, jobsCreated: 6 },
  'barbershop': { bedroomsAdded: 0, populationRequired: 25, energyDemand: 11, foodProduction: 0, jobsCreated: 4 },
  'brewery': { bedroomsAdded: 0, populationRequired: 75, energyDemand: 35, foodProduction: 5, jobsCreated: 15 }
};

// Phase 4: Performance optimization state
let calculationCache = {
  lastCalculatedVersion: -1,
  cachedVitality: null,
  dirtyParcels: new Set() // Track which parcels need recalculation
};

// Import the authoritative state calculator - Phase 4: Optimized
async function recalculateAuthoritativeState() {
  const startTime = Date.now();
  
  // Phase 4: Early exit if no changes since last calculation
  if (calculationCache.lastCalculatedVersion === gameState.version.global && 
      calculationCache.dirtyParcels.size === 0) {
    console.log('🚀 Calculation cache hit - skipping recalculation');
    return;
  }
  
  console.log(`🔍 Debug: Starting calculation - Version: ${gameState.version.global}, Dirty parcels: ${calculationCache.dirtyParcels.size}`);
  
  // Sync calculated values from authoritative sources
  gameState.calculated.treasury = gameState.core.governance?.unallocatedFunds || 0;
  gameState.calculated.population = 0; // Will be calculated below
  
  // Reset vitality for full recalculation
  Object.keys(gameState.calculated.vitality).forEach(key => {
    gameState.calculated.vitality[key] = { supply: 0, demand: 0, balance: 0 };
  });
  
  let totalRevenue = 0;
  let totalMaintenance = 0;
  
  // Phase 4: Batch process parcels with buildings for better performance
  const buildingParcels = Object.entries(gameState.core.parcels).filter(([_, parcel]) => parcel.building);
  
  // Phase 4: Pre-aggregate building counts for optimization
  const buildingCounts = {};
  buildingParcels.forEach(([parcelId, parcel]) => {
    const buildingType = parcel.building;
    buildingCounts[buildingType] = (buildingCounts[buildingType] || 0) + 1;
  });
  
  // Phase 4: Optimized JEFH calculation using batch processing
  Object.entries(buildingCounts).forEach(([buildingType, count]) => {
    const typeData = BUILDING_TYPES_CACHE[buildingType];
    if (!typeData) {
      console.warn(`⚠️ Unknown building type: ${buildingType}`);
      return;
    }
    
    // Batch calculate vitality contributions
    gameState.calculated.vitality.housing.supply += typeData.bedroomsAdded * count;
    gameState.calculated.population += typeData.bedroomsAdded * 2 * count; // 2 people per bedroom
    gameState.calculated.vitality.jobs.supply += typeData.jobsCreated * count;
    gameState.calculated.vitality.food.supply += typeData.foodProduction * count;
    gameState.calculated.vitality.jobs.demand += typeData.populationRequired * count;
    
    // Energy calculation (positive = demand, negative = production)
    if (typeData.energyDemand > 0) {
      gameState.calculated.vitality.energy.demand += typeData.energyDemand * count;
    } else if (typeData.energyDemand < 0) {
      gameState.calculated.vitality.energy.supply += Math.abs(typeData.energyDemand) * count;
    }
  });
  
  // Add population-based demands to building-specific demands
  if (gameState.calculated.population > 0) {
    // Residents need food (in addition to building energy demands already calculated)
    gameState.calculated.vitality.food.demand += gameState.calculated.population * 0.5;
    
    // Residents need jobs (this is demand for employment)
    gameState.calculated.vitality.housing.demand += gameState.calculated.vitality.jobs.supply; // Workers need housing
    
    // Additional residential energy consumption
    gameState.calculated.vitality.energy.demand += gameState.calculated.population * 0.2; // Base residential energy
  }
  
  // Phase 4: Optimized building efficiency calculation
  gameState.calculated.buildingEfficiencies = {};
  
  // Pre-calculate ratios once for all buildings (major optimization)
  const energyRatio = gameState.calculated.vitality.energy.supply / Math.max(1, gameState.calculated.vitality.energy.demand);
  const energySatisfaction = Math.min(1, energyRatio);
  const workerRatio = gameState.calculated.vitality.housing.supply / Math.max(1, gameState.calculated.vitality.jobs.demand);
  const workerSatisfaction = Math.min(1, workerRatio);
  
  // Process only building parcels with optimized loop
  buildingParcels.forEach(([parcelId, parcel]) => {
    const buildingType = BUILDING_TYPES_CACHE[parcel.building];
    if (buildingType) {
      let efficiency = 100; // Start at 100%
      const unsatisfiedNeeds = [];
      
      // Check energy needs (using pre-calculated satisfaction)
      if (buildingType.energyDemand > 0 && energySatisfaction < 1) {
        efficiency *= energySatisfaction;
        unsatisfiedNeeds.push({
          type: 'Energy',
          satisfaction: energySatisfaction,
          deficit: buildingType.energyDemand * (1 - energySatisfaction)
        });
      }
      
      // Check worker needs (using pre-calculated satisfaction)
      if (buildingType.populationRequired > 0 && workerSatisfaction < 1) {
        efficiency *= workerSatisfaction;
        unsatisfiedNeeds.push({
          type: 'Workers',
          satisfaction: workerSatisfaction,
          deficit: buildingType.populationRequired * (1 - workerSatisfaction)
        });
      }
      
      gameState.calculated.buildingEfficiencies[parcelId] = {
        efficiency: Math.round(efficiency),
        unsatisfiedNeeds: unsatisfiedNeeds
      };
    }
  });

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
  
  // Phase 4: Update cache state and performance tracking
  calculationCache.lastCalculatedVersion = gameState.version.global;
  calculationCache.dirtyParcels.clear();
  calculationCache.cachedVitality = JSON.parse(JSON.stringify(gameState.calculated.vitality)); // Deep copy
  
  const calculationTime = Date.now() - startTime;
  const buildingCount = buildingParcels.length;
  const uniqueBuildingTypes = Object.keys(buildingCounts).length;
  const efficiencyCount = Object.keys(gameState.calculated.buildingEfficiencies).length;
  
  console.log(`🚀 Optimized calculation complete: ${calculationTime}ms | ${buildingCount} buildings (${uniqueBuildingTypes} types) | ${efficiencyCount} efficiency calcs | Pop=${gameState.calculated.population} | Treasury=$${Math.round(gameState.calculated.treasury)}`);
  
  // Debug: Log game state info
  const parcelCount = Object.keys(gameState.core.parcels).length;
  const playerCount = gameState.core.players.size;
  console.log(`🔍 Debug game state: GameID=${gameState.lifecycle.gameId} | ${playerCount} players | ${parcelCount} parcels`);
  
  // Debug: Log a sample of building efficiencies
  if (efficiencyCount > 0) {
    const sampleParcel = Object.keys(gameState.calculated.buildingEfficiencies)[0];
    const sampleData = gameState.calculated.buildingEfficiencies[sampleParcel];
    console.log(`🔍 Debug sample efficiency: ${sampleParcel} = ${sampleData.efficiency}%, needs: ${sampleData.unsatisfiedNeeds.length}`);
  }
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
        
        // Phase 4: Mark parcel as dirty for cache invalidation when construction completes
        calculationCache.dirtyParcels.add(parcelId);
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

// Server-authoritative daily timer (every 60 seconds = 1 game day)
let isProcessingDailyUpdate = false;
setInterval(async () => {
  // Prevent overlapping executions
  if (isProcessingDailyUpdate) {
    console.log('⚠️ Skipping daily update - previous update still processing');
    return;
  }
  
  // Skip daily updates if no active game or players
  if (!gameState.lifecycle.gameId ||
      gameState.lifecycle.status !== 'active' ||
      gameState.core.players.size === 0) {
    console.log(`⚠️ Skipping daily update - Debug info:
      - gameId: ${gameState.lifecycle.gameId}
      - status: ${gameState.lifecycle.status}
      - players.size: ${gameState.core.players.size}
      - activePlayers.size: ${gameState.lifecycle.activePlayers.size}`);
    return;
  }
  
  isProcessingDailyUpdate = true;
  
  try {
    // CRITICAL: Advance the day first (server authoritative)
    gameState.core.currentDay++;
    
    // Advance month every 30 days
    if (gameState.core.currentDay > 30) {
      gameState.core.currentDay = 1;
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
      const currentIndex = months.indexOf(gameState.core.currentMonth);
      gameState.core.currentMonth = months[(currentIndex + 1) % 12];
    }
    
    console.log(`🕐 Day ${gameState.core.currentDay} (${gameState.core.currentMonth}) - Processing daily updates...`);
    
    let buildingsAged = 0;
    let buildingsDecayed = 0;
    let totalLVTCollected = 0;
    
    // Process daily economics: LVT collection and building aging
    Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
      if (parcel.owner && parcel.owner !== 'unclaimed') {
        // Calculate LVT for this parcel
        const [row, col] = parcelId.split('-').map(Number);
        const landValue = calculateParcelPrice(row, col);
        const lvtRate = gameState.core.governance?.currentLvtRate || 0.01; // Default 1%
        const dailyLVT = landValue * lvtRate;
        
        // Add to treasury (shared city fund)
        gameState.core.governance.unallocatedFunds = (gameState.core.governance.unallocatedFunds || 0) + dailyLVT;
        totalLVTCollected += dailyLVT;
        
        console.log(`💰 LVT collected from ${parcelId}: $${Math.round(dailyLVT)} (land value: $${landValue})`);
      }
      
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
    
    // Always increment global version and recalculate for time advancement
    gameState.version.global++;
    gameState.meta.lastUpdate = Date.now();
    
    await recalculateAuthoritativeState();
    
    // Broadcast time advancement to all clients
    const dailyUpdateMessage = {
      type: 'DAILY_UPDATE',
      timeState: {
        currentDay: gameState.core.currentDay,
        currentMonth: gameState.core.currentMonth
      },
      buildingSummary: {
        buildingsAged,
        buildingsDecayed
      },
      timestamp: Date.now(),
      version: gameState.version.global
    };
    
    broadcastToAll(dailyUpdateMessage);
    
    console.log(`📅 Advanced to Day ${gameState.core.currentDay} (${gameState.core.currentMonth}) | Buildings aged: ${buildingsAged}, Decayed: ${buildingsDecayed}, LVT collected: $${Math.round(totalLVTCollected)}`);
    
  } catch (error) {
    console.error('❌ Error processing daily update:', error);
  } finally {
    isProcessingDailyUpdate = false;
  }
}, 9863); // Every 9.863 seconds (1 game day = 1/365th of an hour)

// Governance action processors
async function processAllocateVote(action, playerId) {
  const { category, change } = action;
  
  // Validate category
  console.log(`🔍 Checking category: ${category}, budgetCategories:`, gameState.core.governance.budgetCategories);
  if (!category || !gameState.core.governance.budgetCategories || !gameState.core.governance.budgetCategories.includes(category)) {
    console.log(`❌ Invalid category: ${category}`);
    return {
      success: false,
      error: 'INVALID_CATEGORY',
      message: `Invalid category: ${category}`
    };
  }
  
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
  
  console.log(`🔍 Validation check for ${playerId}: current=${currentAllocation}, new=${newAllocation}, totalUsed=${totalUsedPoints}, available=${player.governance.totalVotingPoints}`);
  
  // Check if player has enough points
  if (totalUsedPoints > player.governance.totalVotingPoints) {
    console.log(`❌ BLOCKING: ${totalUsedPoints} > ${player.governance.totalVotingPoints}`);
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
  
  // Validate change parameter
  if (change === undefined || change === null || isNaN(change)) {
    console.log(`❌ Invalid LVT change value: ${change}`);
    return {
      success: false,
      error: 'INVALID_CHANGE',
      message: `Invalid change value: ${change}`
    };
  }
  
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
  if (player.governance.playerAllocations.lvtRate === undefined || isNaN(player.governance.playerAllocations.lvtRate)) {
    player.governance.playerAllocations.lvtRate = 0;
  }
  
  const currentAllocation = player.governance.playerAllocations.lvtRate;
  const newAllocation = currentAllocation + change; // Can be negative
  
  // Calculate total points that would be used after this change
  const totalUsedPoints = getTotalAllocatedPoints(player) - Math.abs(currentAllocation) + Math.abs(newAllocation);
  
  console.log(`🔍 LVT Validation check for ${playerId}: current=${currentAllocation}, new=${newAllocation}, totalUsed=${totalUsedPoints}, available=${player.governance.totalVotingPoints}`);
  
  // Check if player has enough points
  if (totalUsedPoints > player.governance.totalVotingPoints) {
    console.log(`❌ BLOCKING LVT: ${totalUsedPoints} > ${player.governance.totalVotingPoints}`);
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

async function processEndAuctionNow(action, playerId) {
    const { listingId, fee } = action;

    const listing = gameState.core.auctions.get(listingId);

    if (!listing) {
        return { success: false, error: "LISTING_NOT_FOUND", message: "Auction listing not found." };
    }

    if (listing.seller !== playerId) {
        return { success: false, error: "UNAUTHORIZED", message: "You are not the seller of this auction." };
    }

    const seller = gameState.core.players.get(listing.seller);
    const buyer = gameState.core.players.get(listing.highBidder);

    if (!seller) {
        return { success: false, error: "SELLER_NOT_FOUND", message: "Auction seller not found." };
    }

    if (listing.highBidder && !buyer) {
        return { success: false, error: "BUYER_NOT_FOUND", message: "Auction buyer not found." };
    }

    // Take the fee from the seller.
    seller.cash -= fee;

    // Transfer the bid amount from the buyer to the seller.
    if (buyer) {
        buyer.cash -= listing.currentBid;
        seller.cash += listing.currentBid;
    }

    // End the auction.
    listing.status = "ended_early";

    // Update the game state and broadcast the changes.
    await recalculateAuthoritativeState();
    broadcastToAll({
        type: "AUCTION_ENDED",
        listingId,
        listing,
    });

    return { success: true };
}

async function processCreateAuctionListing(action, playerId) {
    const { listing } = action;

    if (!listing) {
        return { success: false, error: "INVALID_LISTING", message: "Listing data is required." };
    }

    const player = gameState.core.players.get(playerId);
    if (!player) {
        return { success: false, error: "PLAYER_NOT_FOUND", message: "Player not found." };
    }

    if (player.actionManager.currentActions < listing.quantity) {
        return { success: false, error: "INSUFFICIENT_ACTIONS", message: "Not enough actions to sell." };
    }

    player.actionManager.currentActions -= listing.quantity;

    listing.seller = playerId;
    gameState.core.auctions.set(listing.id, listing);

    await recalculateAuthoritativeState();
    broadcastToAll({
        type: "AUCTION_CREATED",
        listing,
    });

    return { success: true };
}

async function processBuyNowListing(action, playerId) {
    const { listingId } = action;

    const listing = gameState.core.auctions.get(listingId);

    if (!listing) {
        return { success: false, error: "LISTING_NOT_FOUND", message: "Auction listing not found." };
    }

    if (listing.status !== 'active' || !listing.buyNowPrice) {
        return { success: false, error: "BUY_NOW_NOT_AVAILABLE", message: "Buy now is not available for this listing." };
    }

    const buyer = gameState.core.players.get(playerId);
    if (!buyer) {
        return { success: false, error: "PLAYER_NOT_FOUND", message: "Player not found." };
    }

    if (buyer.cash < listing.buyNowPrice) {
        return { success: false, error: "INSUFFICIENT_FUNDS", message: "Insufficient funds." };
    }

    const seller = gameState.core.players.get(listing.seller);
    if (!seller) {
        return { success: false, error: "SELLER_NOT_FOUND", message: "Seller not found." };
    }

    buyer.cash -= listing.buyNowPrice;
    seller.cash += listing.buyNowPrice;
    buyer.actionManager.currentActions += listing.quantity;

    listing.status = 'sold';
    listing.finalPrice = listing.buyNowPrice;
    listing.winner = playerId;

    await recalculateAuthoritativeState();
    broadcastToAll({
        type: "AUCTION_ENDED",
        listingId,
        listing,
    });

    return { success: true };
}

async function processCancelListing(action, playerId) {
    const { listingId } = action;

    const listing = gameState.core.auctions.get(listingId);

    if (!listing) {
        return { success: false, error: "LISTING_NOT_FOUND", message: "Auction listing not found." };
    }

    if (listing.seller !== playerId) {
        return { success: false, error: "UNAUTHORIZED", message: "You are not the seller of this auction." };
    }

    const seller = gameState.core.players.get(playerId);
    if (!seller) {
        return { success: false, error: "PLAYER_NOT_FOUND", message: "Player not found." };
    }

    if (listing.currentBid > 0) {
        const fee = calculateEndItNowFee(listing); // Assuming this function exists on the server
        if (seller.cash < fee) {
            return { success: false, error: "INSUFFICIENT_FUNDS", message: "Insufficient funds for cancellation fee." };
        }
        seller.cash -= fee;
        gameState.core.governance.unallocatedFunds += fee;
    }

    seller.actionManager.currentActions += listing.quantity;
    listing.status = 'cancelled';

    await recalculateAuthoritativeState();
    broadcastToAll({
        type: "AUCTION_ENDED",
        listingId,
        listing,
    });

    return { success: true };
}

async function processBidOnListing(action, playerId) {
    const { listingId, bidAmount } = action;

    // CRITICAL: Lock auction to prevent concurrent bids
    if (auctionLocks.has(listingId)) {
        return { 
            success: false, 
            error: "AUCTION_LOCKED", 
            message: "Another bid is being processed. Please try again." 
        };
    }

    auctionLocks.add(listingId);

    try {
        const listing = gameState.core.auctions.get(listingId);

        if (!listing) {
            return { success: false, error: "LISTING_NOT_FOUND", message: "Auction listing not found." };
        }

        if (listing.status !== 'active') {
            return { success: false, error: "AUCTION_NOT_ACTIVE", message: "This auction is not active." };
        }

        const bidder = gameState.core.players.get(playerId);
        if (!bidder) {
            return { success: false, error: "PLAYER_NOT_FOUND", message: "Player not found." };
        }

        if (bidder.cash < bidAmount) {
            return { success: false, error: "INSUFFICIENT_FUNDS", message: "Insufficient funds." };
        }

        // Re-check current bid (could have changed while waiting for lock)
        if (bidAmount <= listing.currentBid) {
            return { success: false, error: "BID_TOO_LOW", message: "Your bid must be higher than the current bid." };
        }

        // ATOMIC TRANSACTION: All cash operations together
        // Refund the previous high bidder if there was one
        if (listing.highBidder) {
            const previousBidder = gameState.core.players.get(listing.highBidder);
            if (previousBidder) {
                previousBidder.cash += listing.currentBid;
            }
        }

        // Deduct from new bidder
        bidder.cash -= bidAmount;
        
        // Update listing atomically
        listing.currentBid = bidAmount;
        listing.highBidder = playerId;

        // Extend auction if bid is in the last 30 seconds
        const timeRemaining = listing.expiresAt - Date.now();
        if (timeRemaining < 30000) { // Less than 30 seconds remaining
            listing.expiresAt += 5000; // Add 5 seconds
        }

        await recalculateAuthoritativeState();
        broadcastToAll({
            type: "AUCTION_UPDATED",
            listingId,
            listing,
        });

        return { success: true };
    } finally {
        // CRITICAL: Always release auction lock
        auctionLocks.delete(listingId);
    }
}

function calculateEndItNowFee(listing) {
    if (!listing || listing.currentBid === 0) return 0;

    // Calculate month progress using actual game calendar (0 = start of month, 1 = end of month)
    const monthLengths = {
        'SEPT': 30, 'OCT': 31, 'NOV': 30, 'DEC': 31,
        'JAN': 31, 'FEB': 28, 'MAR': 31, 'APR': 30,
        'MAY': 31, 'JUN': 30, 'JUL': 31, 'AUG': 31
    };

    const daysInMonth = monthLengths[gameState.core.currentMonth];
    const daysElapsed = gameState.core.currentDay - 1; // Day 1 = 0 elapsed, Day 2 = 1 elapsed, etc.

    // Add progress through current day
    const msIntoDay = 0; // Simplified for server-side
    const dayProgress = 0;
    const totalDaysElapsed = daysElapsed + dayProgress;

    // Calculate month progress (0 to 1)
    const monthProgress = Math.max(0, Math.min(1, totalDaysElapsed / daysInMonth));

    // Fee starts at 500% and decays to 0% over the month
    const maxFeeMultiplier = 5.0; // 500%
    const currentFeeMultiplier = maxFeeMultiplier * (1 - monthProgress);

    // Fee is based on current winning bid
    const baseFee = listing.currentBid * currentFeeMultiplier;
    return Math.floor(baseFee);
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
    if (player.governance && player.governance.playerAllocations && 
        player.governance.playerAllocations.lvtRate !== undefined && 
        !isNaN(player.governance.playerAllocations.lvtRate)) {
      totalLVTVotes += player.governance.playerAllocations.lvtRate;
      totalVoters += 1;
    }
  });
  
  // Calculate average and apply to base rate
  const baseLvtRate = 0.50; // 50% base rate (matching initial game state)
  const averageVoteChange = totalVoters > 0 ? totalLVTVotes / totalVoters : 0;
  const newRate = Math.max(0, Math.min(1, baseLvtRate + (averageVoteChange * 0.01))); // Each point = 1%
  
  gameState.core.governance.currentLvtRate = newRate;
  gameState.core.governance.proposedLvtRate = newRate;
  
  console.log(`💰 Recalculated LVT rate: ${(newRate * 100).toFixed(2)}% (base: ${(baseLvtRate * 100).toFixed(2)}%, votes: ${totalLVTVotes})`);
}

// Waiting Room Handler Functions
async function handleJoinWaitingRoom(ws, clientId, data) {
  const { player, roomId = 'default' } = data;
  
  if (!player || !player.name) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'INVALID_PLAYER_DATA',
      message: 'Player data is required'
    }));
    return;
  }
  
  const room = waitingRooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'ROOM_NOT_FOUND',
      message: 'Waiting room not found'
    }));
    return;
  }
  
  // Add player to room
  const playerData = {
    id: clientId,
    name: player.name,
    color: player.color || '#52C77E',
    emoji: player.emoji || '🏠',
    joinedAt: Date.now(),
    status: 'ready'
  };
  
  room.players.set(clientId, playerData);
  
  // Update client record
  const client = clients.get(clientId);
  if (client) {
    client.roomId = roomId;
  }
  
  console.log(`👥 Player ${player.name} joined waiting room ${roomId}`);
  
  // Send room state to joining player
  ws.send(JSON.stringify({
    type: 'JOINED_WAITING_ROOM',
    room: {
      id: room.id,
      players: Array.from(room.players.values()),
      chatMessages: room.chatMessages.slice(-20), // Last 20 messages
      settings: room.settings,
      status: room.status
    }
  }));
  
  // Broadcast player joined to other players in room
  broadcastToRoom(roomId, {
    type: 'PLAYER_JOINED_ROOM',
    player: playerData,
    playerCount: room.players.size
  }, clientId);
  
  // Add system message
  addChatMessageToRoom(roomId, {
    type: 'system',
    text: `${player.name} joined the room`,
    timestamp: Date.now()
  });
  
  // Check if room should auto-start
  if (room.settings.autoStart && room.players.size >= room.settings.minPlayers) {
    setTimeout(() => checkAutoStart(roomId), 1000);
  }
}

async function handleLeaveWaitingRoom(ws, clientId, data) {
  const client = clients.get(clientId);
  if (!client || !client.roomId) return;
  
  const room = waitingRooms.get(client.roomId);
  if (!room) return;
  
  const player = room.players.get(clientId);
  if (player) {
    room.players.delete(clientId);
    client.roomId = null;
    
    console.log(`👋 Player ${player.name} left waiting room ${room.id}`);
    
    // Broadcast player left to other players
    broadcastToRoom(room.id, {
      type: 'PLAYER_LEFT_ROOM',
      playerId: clientId,
      playerCount: room.players.size
    });
    
    // Add system message
    addChatMessageToRoom(room.id, {
      type: 'system',
      text: `${player.name} left the room`,
      timestamp: Date.now()
    });
  }
}

async function handleChatMessage(ws, clientId, data) {
  const { message, roomId = 'default' } = data;
  
  if (!message || message.trim().length === 0) return;
  
  const client = clients.get(clientId);
  const room = waitingRooms.get(roomId);
  
  if (!room || !room.players.has(clientId)) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'NOT_IN_ROOM',
      message: 'You are not in this waiting room'
    }));
    return;
  }
  
  const player = room.players.get(clientId);
  const chatMessage = {
    id: Date.now().toString(),
    type: 'player',
    author: player.name,
    authorId: clientId,
    text: message.trim().substring(0, 200), // Limit message length
    timestamp: Date.now()
  };
  
  addChatMessageToRoom(roomId, chatMessage);
  
  console.log(`💬 Chat in ${roomId}: ${player.name}: ${chatMessage.text}`);
}

async function handleUpdateRoomSettings(ws, clientId, data) {
  const { settings, roomId = 'default' } = data;
  
  const room = waitingRooms.get(roomId);
  if (!room || !room.players.has(clientId)) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'UNAUTHORIZED',
      message: 'You are not authorized to update room settings'
    }));
    return;
  }
  
  // Update settings (with validation)
  if (settings.targetSize && settings.targetSize >= 2 && settings.targetSize <= 12) {
    room.settings.targetSize = settings.targetSize;
  }
  
  if (settings.minPlayers && settings.minPlayers >= 2 && settings.minPlayers <= room.settings.targetSize) {
    room.settings.minPlayers = settings.minPlayers;
  }
  
  if (typeof settings.autoStart === 'boolean') {
    room.settings.autoStart = settings.autoStart;
  }
  
  // Broadcast updated settings to all players in room
  broadcastToRoom(roomId, {
    type: 'ROOM_SETTINGS_UPDATED',
    settings: room.settings
  });
  
  console.log(`⚙️ Room ${roomId} settings updated:`, room.settings);
}

async function handleStartMultiplayerGame(ws, clientId, data) {
  const { roomId = 'default' } = data;
  
  const room = waitingRooms.get(roomId);
  if (!room || !room.players.has(clientId)) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'UNAUTHORIZED',
      message: 'You are not authorized to start this game'
    }));
    return;
  }
  
  if (room.players.size < 2) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: 'INSUFFICIENT_PLAYERS',
      message: 'Need at least 2 players to start multiplayer game'
    }));
    return;
  }
  
  console.log(`🚀 Starting multiplayer game in room ${roomId} with ${room.players.size} players`);
  
  // Start the game for all players in the room
  startGameFromRoom(roomId);
}

// Helper functions for waiting room
function broadcastToRoom(roomId, message, excludeClientId = null) {
  const room = waitingRooms.get(roomId);
  if (!room) return;
  
  room.players.forEach((player, clientId) => {
    if (clientId === excludeClientId) return;
    
    const client = clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  });
}

function addChatMessageToRoom(roomId, message) {
  const room = waitingRooms.get(roomId);
  if (!room) return;
  
  room.chatMessages.push(message);
  
  // Keep only last 100 messages
  if (room.chatMessages.length > 100) {
    room.chatMessages = room.chatMessages.slice(-100);
  }
  
  // Broadcast message to all players in room
  broadcastToRoom(roomId, {
    type: 'CHAT_MESSAGE',
    message: message
  });
}

function checkAutoStart(roomId) {
  const room = waitingRooms.get(roomId);
  if (!room || room.status !== 'waiting') return;
  
  if (room.players.size >= room.settings.minPlayers && room.settings.autoStart) {
    // Start game countdown
    room.status = 'starting';
    
    broadcastToRoom(roomId, {
      type: 'GAME_STARTING',
      countdown: 5,
      message: 'Game starting in 5 seconds...'
    });
    
    addChatMessageToRoom(roomId, {
      type: 'system',
      text: 'Minimum players reached! Game starting in 5 seconds...',
      timestamp: Date.now()
    });
    
    setTimeout(() => {
      startGameFromRoom(roomId);
    }, 5000);
  }
}

function startGameFromRoom(roomId) {
  const room = waitingRooms.get(roomId);
  if (!room) return;

  room.status = 'in-game';

  // Get the game instance for this room
  const gameState = getGameInstance(room.gameInstanceId || roomId);

  // Move all players from waiting room to game
  const playersToStart = Array.from(room.players.values());

  // CRITICAL FIX: Initialize a new active game when starting from room
  if (gameState.lifecycle.status === 'ended' || gameState.lifecycle.status === 'archived' || !gameState.lifecycle.gameId) {
    const gameId = initializeNewGameForRoom(roomId, "Multiplayer Session");
    console.log(`🎮 New multiplayer game initialized: ${gameId} for room ${roomId}`);
  }

  // CRITICAL FIX: Set game status to active and add players to active set
  gameState.lifecycle.status = 'active';
  gameState.lifecycle.startTime = Date.now();

  // Add all room players to active players
  room.players.forEach((player, clientId) => {
    const client = clients.get(clientId);
    if (client && client.playerId) {
      gameState.lifecycle.activePlayers.add(client.playerId);
      console.log(`✅ Added player ${client.playerId} to active game in room ${roomId}`);
    }
  });

  console.log(`🚀 Game ${gameState.lifecycle.gameId} now active with ${gameState.lifecycle.activePlayers.size} players in room ${roomId}`);

  broadcastToRoom(roomId, {
    type: 'GAME_STARTED',
    players: playersToStart,
    gameId: gameState.lifecycle.gameId
  });

  console.log(`🚀 Starting game from room ${roomId} with ${playersToStart.length} players`);

  // Clear room players (they're now in game)
  room.players.clear();
  room.status = 'waiting';

  // Reset room state for next game
  room.chatMessages = [];
}

// ====== NEW GAME LIFECYCLE HANDLERS ======

function handleViewLeaderboard(ws, clientId, data) {
  const limit = data.limit || 10;
  const leaderboard = getTopLeaderboard(limit);
  
  ws.send(JSON.stringify({
    type: 'LEADERBOARD_DATA',
    leaderboard: leaderboard,
    totalGames: cityLeaderboard.length,
    timestamp: Date.now()
  }));
}

function handleViewGameHistory(ws, clientId, data) {
  const playerId = data.playerId;
  const limit = data.limit || 20;
  
  // Filter games where this player participated
  const playerGames = Array.from(gameHistory.values())
    .filter(game => {
      if (!game.snapshot || !game.snapshot.players) return false;
      return Object.keys(game.snapshot.players).includes(playerId);
    })
    .sort((a, b) => b.endTime - a.endTime) // Most recent first
    .slice(0, limit)
    .map(game => ({
      gameId: game.gameId,
      cityName: game.cityName,
      score: game.score,
      playerCount: game.playerCount,
      duration: game.duration,
      endTime: game.endTime,
      endReason: game.endReason,
      rank: cityLeaderboard.findIndex(lb => lb.gameId === game.gameId) + 1
    }));
  
  ws.send(JSON.stringify({
    type: 'GAME_HISTORY_DATA',
    games: playerGames,
    totalPlayerGames: playerGames.length,
    timestamp: Date.now()
  }));
}

async function handleStartNewGame(ws, clientId, data) {
  const { playerName = 'Player', playerColor = '#2196F3', playerEmoji = '🏠', cityName, maxPlayers = 4 } = data;
  
  // Force end the current game if it exists
  if (gameState.lifecycle.gameId && gameState.lifecycle.status === 'active') {
    console.log(`🔄 Force ending current game ${gameState.lifecycle.gameId} to start new game`);
    endGame('manual_restart');
  }
  
  // Initialize new game
  const gameId = initializeNewGame(cityName || playerName + "'s City", maxPlayers);
  
  // Generate new player ID for this game
  const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  
  // Join the new game
  const joinResult = handlePlayerJoinGame(playerId);
  if (!joinResult.success) {
    ws.send(JSON.stringify({
      type: 'NEW_GAME_FAILED',
      error: joinResult.error,
      message: joinResult.message,
      timestamp: Date.now()
    }));
    return;
  }
  
  // Create player
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
  
  // Update client mapping
  const client = clients.get(clientId);
  if (client) {
    client.playerId = playerId;
    gameState.meta.activeConnections.add(playerId);
  }
  
  console.log(`🎮 Player ${playerName} started new game: ${gameId}`);
  
  // Send success response
  ws.send(JSON.stringify({
    type: 'NEW_GAME_STARTED',
    gameId: gameId,
    playerId: playerId,
    player: player,
    gameState: {
      core: {
        players: Object.fromEntries(gameState.core.players),
        parcels: gameState.core.parcels,
        auctions: Object.fromEntries(gameState.core.auctions),
        currentMonth: gameState.core.currentMonth,
        currentDay: gameState.core.currentDay,
        gameSpeed: gameState.core.gameSpeed,
        isPaused: gameState.core.isPaused,
        governance: gameState.core.governance,
        transportation: gameState.core.transportation
      },
      calculated: gameState.calculated,
      version: gameState.version.global,
      lifecycle: gameState.lifecycle
    },
    timestamp: Date.now()
  }));
}

async function handleActionBatch(ws, clientId, data) {
  const { actions, compressed, batchId, clientVersion } = data;
  
  // Get player ID from client
  const client = clients.get(clientId);
  if (!client || !client.playerId) {
    ws.send(JSON.stringify({
      type: 'ACTION_BATCH_ERROR',
      batchId: batchId,
      error: 'INVALID_CLIENT',
      message: 'Client not associated with player'
    }));
    return;
  }
  
  const playerId = client.playerId;
  console.log(`📦 Processing action batch from ${playerId}: ${actions.length} actions`);
  
  // Process each action in the batch
  const results = [];
  for (const action of actions) {
    try {
      // Add player ID to action
      const actionWithPlayer = { ...action, playerId };
      const result = await processGameAction(actionWithPlayer, playerId);
      results.push({
        actionId: action.id,
        success: result.success,
        result: result,
        error: result.error,
        message: result.message
      });
      
      // If action succeeded, broadcast to other clients
      if (result.success) {
        ws.send(JSON.stringify({
          type: 'ACTION_SUCCESS',
          actionId: action.id,
          result: result,
          version: gameState.version.global
        }));
        
        // CRITICAL FIX: Broadcast state changes to ALL players in the game
        if (result.stateChanges) {
          console.log(`🔄 Broadcasting selective state changes to all players: ${action.type}`);
          broadcastToAll({
            type: 'PARTIAL_UPDATE',
            actionType: action.type,
            changes: result.stateChanges, // Only send what actually changed
            version: gameState.version.global,
            timestamp: Date.now()
          });
        }
      } else {
        ws.send(JSON.stringify({
          type: 'ACTION_ERROR',
          actionId: action.id,
          error: result.error,
          message: result.message
        }));
      }
    } catch (error) {
      console.error(`❌ Error processing action ${action.id}:`, error);
      results.push({
        actionId: action.id,
        success: false,
        error: 'PROCESSING_ERROR',
        message: error.message
      });
      
      ws.send(JSON.stringify({
        type: 'ACTION_ERROR',
        actionId: action.id,
        error: 'PROCESSING_ERROR',
        message: error.message
      }));
    }
  }
  
  console.log(`✅ Batch processed: ${results.filter(r => r.success).length}/${results.length} actions succeeded`);
}

// ====== GAME LIFECYCLE MANAGEMENT ======

// Initialize new game with unique ID and city name
function initializeNewGame(cityName, maxPlayers = 4) {
  return initializeNewGameForRoom('default', cityName, maxPlayers);
}

function initializeNewGameForRoom(roomId, cityName, maxPlayers = 4) {
  const timestamp = Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
  const gameId = `${cityName || 'NewCity'}_${dateStr}_${nextGameId++}`;

  // Get the game instance for this room
  const gameState = getGameInstance(roomId);

  // Reset game state for new game
  gameState.lifecycle = {
    gameId: gameId,
    cityName: cityName || `New City ${nextGameId - 1}`,
    status: 'waiting', // 'waiting', 'active', 'ended', 'archived'
    startTime: null,
    endTime: null,
    endReason: null,
    maxPlayers: maxPlayers,
    activePlayers: new Set(),
    departedPlayers: new Set(),
    allowRejoining: false,
    gameLength: 365, // Days until auto-end
    snapshot: null
  };
  
  // Reset core game state
  gameState.core.players.clear();
  gameState.core.parcels = {};
  gameState.core.auctions.clear();
  gameState.core.currentMonth = 'SEPT';
  gameState.core.currentDay = 1;
  gameState.core.gameSpeed = 1;
  gameState.core.isPaused = false;
  
  // Reset transportation system
  gameState.core.transportation = {
    roads: {},
    transitStops: {},
    transitRoutes: {}
  };
  
  // Reset governance system
  gameState.core.governance = {
    budgetCategories: ['education', 'healthcare', 'infrastructure', 'housing', 'culture', 'recreation', 'commercial', 'civic', 'emergency', 'ubi'],
    unallocatedFunds: 0,
    totalBudget: 0,
    proposedLvtRate: 0.50, // 50% default
    currentLvtRate: 0.50,
    categoryAllocations: {
      education: 0,
      healthcare: 0,
      infrastructure: 0,
      housing: 0,
      culture: 0,
      recreation: 0,
      commercial: 0,
      civic: 0,
      emergency: 0,
      ubi: 0
    },
    publicCoffers: {
      education: 0,
      healthcare: 0,
      infrastructure: 0,
      housing: 0,
      culture: 0,
      recreation: 0,
      commercial: 0,
      civic: 0,
      emergency: 0,
      ubi: 0
    }
  };
  
  // Reset calculated state
  gameState.calculated = {
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
  };
  
  // Reset version tracking
  gameState.version = {
    global: 1,
    perParcel: {},
    perPlayer: {}
  };
  
  // Reset metadata
  gameState.meta = {
    lastUpdate: Date.now(),
    activeConnections: new Set(),
    actionQueue: [],
    conflictLog: []
  };
  
  console.log(`🎮 Initialized new game: ${gameId} - "${cityName}"`);
  return gameId;
}

// Handle player permanent departure
function handlePlayerDeparture(playerId, reason = 'disconnect') {
  if (!gameState.lifecycle.activePlayers.has(playerId)) {
    console.log(`⚠️ Player ${playerId} not in active players, ignoring departure`);
    return;
  }
  
  console.log(`👋 Player ${playerId} departing permanently: ${reason}`);
  
  // Move from active to departed
  gameState.lifecycle.activePlayers.delete(playerId);
  gameState.lifecycle.departedPlayers.add(playerId);
  
  // Broadcast departure to remaining players
  broadcastToAll({
    type: 'PLAYER_DEPARTED',
    playerId: playerId,
    reason: reason,
    activePlayers: Array.from(gameState.lifecycle.activePlayers),
    timestamp: Date.now()
  });
  
  // Check if all players have left
  if (gameState.lifecycle.activePlayers.size === 0) {
    console.log(`🏁 All players have left game ${gameState.lifecycle.gameId}`);
    endGame('all_players_left');
  }
}

// Handle player joining game
function handlePlayerJoinGame(playerId) {
  return handlePlayerJoinGameForInstance(playerId, gameState);
}

function handlePlayerJoinGameForInstance(playerId, gameState) {
  // Prevent rejoining if player already departed
  if (gameState.lifecycle.departedPlayers.has(playerId)) {
    console.log(`🚫 Player ${playerId} attempted to rejoin after departure`);
    return {
      success: false,
      error: 'PERMANENT_DEPARTURE',
      message: 'You have permanently left this game. Please start a new game.',
      shouldRedirect: true
    };
  }

  // Check if game is full
  if (gameState.lifecycle.activePlayers.size >= gameState.lifecycle.maxPlayers) {
    return {
      success: false,
      error: 'GAME_FULL',
      message: 'This game is full. Please join a different game.',
      shouldRedirect: true
    };
  }

  // Check if game has ended
  if (gameState.lifecycle.status === 'ended' || gameState.lifecycle.status === 'archived') {
    return {
      success: false,
      error: 'GAME_ENDED',
      message: 'This game has ended. Please start a new game.',
      shouldRedirect: true
    };
  }
  
  // Add to active players
  gameState.lifecycle.activePlayers.add(playerId);
  
  // Start game if this is the first player
  if (gameState.lifecycle.status === 'waiting' && gameState.lifecycle.activePlayers.size === 1) {
    gameState.lifecycle.status = 'active';
    gameState.lifecycle.startTime = Date.now();
    console.log(`🚀 Game ${gameState.lifecycle.gameId} started by first player ${playerId}`);
  }
  
  return { success: true };
}

// End game and create snapshot
function endGame(reason = 'manual') {
  if (gameState.lifecycle.status === 'ended' || gameState.lifecycle.status === 'archived') {
    console.log(`⚠️ Game ${gameState.lifecycle.gameId} already ended`);
    return;
  }
  
  console.log(`🏁 Ending game ${gameState.lifecycle.gameId}: ${reason}`);
  
  // Update lifecycle status
  gameState.lifecycle.status = 'ended';
  gameState.lifecycle.endTime = Date.now();
  gameState.lifecycle.endReason = reason;
  
  // Create end-game snapshot
  const snapshot = createGameSnapshot();
  gameState.lifecycle.snapshot = snapshot;
  
  // Add to game history
  const completedGame = {
    gameId: gameState.lifecycle.gameId,
    cityName: gameState.lifecycle.cityName,
    startTime: gameState.lifecycle.startTime,
    endTime: gameState.lifecycle.endTime,
    endReason: reason,
    playerCount: gameState.core.players.size,
    duration: gameState.lifecycle.endTime - gameState.lifecycle.startTime,
    snapshot: snapshot,
    score: calculateGameScore(snapshot)
  };
  
  gameHistory.set(gameState.lifecycle.gameId, completedGame);
  
  // Update leaderboard
  updateLeaderboard(completedGame);
  
  // Broadcast game end to all remaining players
  broadcastToAll({
    type: 'GAME_ENDED',
    reason: reason,
    snapshot: snapshot,
    leaderboard: getTopLeaderboard(10),
    timestamp: Date.now()
  });
  
  console.log(`📸 Game snapshot created for ${gameState.lifecycle.gameId}`);
  
  // Archive game after a delay
  setTimeout(() => {
    archiveGame(gameState.lifecycle.gameId);
  }, 300000); // 5 minutes
}

// Create comprehensive game state snapshot for strategic analysis
function createGameSnapshot() {
  const snapshot = {
    gameInfo: {
      gameId: gameState.lifecycle.gameId,
      cityName: gameState.lifecycle.cityName,
      endTime: Date.now(),
      createdAt: new Date().toISOString(),
      duration: Date.now() - gameState.lifecycle.startTime,
      finalDay: gameState.core.currentDay,
      finalMonth: gameState.core.currentMonth,
      endReason: gameState.lifecycle.endReason,
      totalPlayers: gameState.lifecycle.activePlayers.size + gameState.lifecycle.departedPlayers.size,
      activePlayers: gameState.lifecycle.activePlayers.size,
      departedPlayers: gameState.lifecycle.departedPlayers.size
    },
    
    // Complete player data for strategic analysis
    players: Object.fromEntries(
      Array.from(gameState.core.players.entries()).map(([id, player]) => [
        id,
        {
          ...player,
          // Add strategic metrics per player
          totalLandValue: calculatePlayerLandValue(id),
          buildingDistribution: calculatePlayerBuildingDistribution(id),
          economicStrategy: analyzePlayerStrategy(id),
          governanceInfluence: calculateGovernanceInfluence(id)
        }
      ])
    ),
    
    // Complete city state
    city: {
      parcels: gameState.core.parcels,
      transportation: gameState.core.transportation,
      governance: gameState.core.governance,
      buildingCounts: calculateBuildingCounts(),
      landUsePattern: analyzeLandUsePattern(),
      connectionNetwork: analyzeTransportationNetwork()
    },
    
    // Enhanced metrics
    metrics: {
      population: gameState.calculated.population,
      treasury: gameState.calculated.treasury,
      vitality: gameState.calculated.vitality,
      marketMultipliers: gameState.calculated.marketMultipliers,
      avgParcelValue: calculateAverageParcelValue(),
      economicConcentration: calculateEconomicConcentration(),
      spatialDistribution: analyzeSpatialDistribution()
    },
    
    // Strategic analysis
    performance: {
      totalRevenue: calculateTotalRevenue(),
      totalExpenses: calculateTotalExpenses(),
      efficiency: calculateEfficiency(),
      sustainability: calculateSustainability(),
      collaboration: calculateCollaborationIndex(),
      competition: calculateCompetitionIndex(),
      innovation: calculateInnovationScore()
    },
    
    // Timeline of key events for replay analysis
    timeline: gameState.meta.actionQueue?.slice(-100) || [], // Last 100 actions
    
    // Potential exploits/strategies identified
    strategicInsights: {
      dominantStrategies: identifyDominantStrategies(),
      unusualPatterns: detectUnusualPatterns(),
      efficiencyOpportunities: findEfficiencyOpportunities(),
      governanceExploits: detectGovernanceExploits()
    }
  };
  
  return snapshot;
}

// Calculate game performance score for leaderboard
function calculateGameScore(snapshot) {
  const weights = {
    population: 0.3,
    treasury: 0.2,
    sustainability: 0.25,
    efficiency: 0.25
  };
  
  // Normalize metrics to 0-100 scale
  const populationScore = Math.min(100, (snapshot.metrics.population / 1000) * 100);
  const treasuryScore = Math.min(100, Math.max(0, snapshot.metrics.treasury / 100000) * 100);
  const sustainabilityScore = snapshot.performance.sustainability;
  const efficiencyScore = snapshot.performance.efficiency;
  
  const totalScore = 
    (populationScore * weights.population) +
    (treasuryScore * weights.treasury) +
    (sustainabilityScore * weights.sustainability) +
    (efficiencyScore * weights.efficiency);
  
  return Math.round(totalScore);
}

// Strategic Analysis Helper Functions
function calculatePlayerLandValue(playerId) {
  let totalValue = 0;
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.owner === playerId && parcel.purchasePrice) {
      totalValue += parcel.purchasePrice;
    }
  });
  return totalValue;
}

function calculatePlayerBuildingDistribution(playerId) {
  const distribution = {};
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.owner === playerId && parcel.building) {
      distribution[parcel.building] = (distribution[parcel.building] || 0) + 1;
    }
  });
  return distribution;
}

function analyzePlayerStrategy(playerId) {
  const distribution = calculatePlayerBuildingDistribution(playerId);
  const totalBuildings = Object.values(distribution).reduce((a, b) => a + b, 0);
  
  if (totalBuildings === 0) return 'none';
  
  // Analyze strategy based on building patterns
  const residential = (distribution.house || 0) + (distribution.apartment || 0);
  const commercial = (distribution.shop || 0) + (distribution.office || 0) + (distribution.market || 0);
  const energy = (distribution.solar || 0) + (distribution.wind || 0);
  const agriculture = distribution.farm || 0;
  
  const resRatio = residential / totalBuildings;
  const comRatio = commercial / totalBuildings;
  const enerRatio = energy / totalBuildings;
  const agriRatio = agriculture / totalBuildings;
  
  if (enerRatio > 0.4) return 'energy_focused';
  if (agriRatio > 0.3) return 'agricultural';
  if (comRatio > 0.5) return 'commercial_focused';
  if (resRatio > 0.6) return 'residential_focused';
  if (Math.abs(resRatio - comRatio) < 0.2) return 'balanced';
  
  return 'mixed';
}

function calculateGovernanceInfluence(playerId) {
  const player = gameState.core.players.get(playerId);
  if (!player || !player.governance) return 0;
  
  // Sum all governance allocations for influence score
  let influence = 0;
  if (player.governance.playerAllocations) {
    Object.values(player.governance.playerAllocations).forEach(allocation => {
      influence += Math.abs(allocation);
    });
  }
  return influence;
}

function calculateBuildingCounts() {
  const counts = {};
  Object.values(gameState.core.parcels).forEach(parcel => {
    if (parcel.building) {
      counts[parcel.building] = (counts[parcel.building] || 0) + 1;
    }
  });
  return counts;
}

function analyzeLandUsePattern() {
  const pattern = {
    totalParcels: Object.keys(gameState.core.parcels).length,
    ownedParcels: 0,
    builtParcels: 0,
    centerUtilization: 0,
    edgeUtilization: 0
  };
  
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.owner) pattern.ownedParcels++;
    if (parcel.building) pattern.builtParcels++;
    
    // Analyze spatial distribution
    const [row, col] = parcelId.split('-').map(Number);
    const distanceFromCenter = Math.max(Math.abs(row - 6), Math.abs(col - 6));
    
    if (parcel.building) {
      if (distanceFromCenter <= 2) pattern.centerUtilization++;
      else if (distanceFromCenter >= 5) pattern.edgeUtilization++;
    }
  });
  
  return pattern;
}

function analyzeTransportationNetwork() {
  return {
    roads: Object.keys(gameState.core.transportation.roads).length,
    transitStops: Object.keys(gameState.core.transportation.transitStops).length,
    transitRoutes: Object.keys(gameState.core.transportation.transitRoutes).length,
    connectivity: calculateNetworkConnectivity()
  };
}

function calculateNetworkConnectivity() {
  // Simplified connectivity measure
  const roads = Object.keys(gameState.core.transportation.roads).length;
  const stops = Object.keys(gameState.core.transportation.transitStops).length;
  const routes = Object.keys(gameState.core.transportation.transitRoutes).length;
  
  return roads + (stops * 2) + (routes * 3); // Weighted connectivity score
}

function calculateAverageParcelValue() {
  const parcelsWithPrice = Object.values(gameState.core.parcels).filter(p => p.purchasePrice);
  if (parcelsWithPrice.length === 0) return 0;
  
  const totalValue = parcelsWithPrice.reduce((sum, p) => sum + p.purchasePrice, 0);
  return totalValue / parcelsWithPrice.length;
}

function calculateEconomicConcentration() {
  const playerWealth = Array.from(gameState.core.players.values()).map(p => p.cash + p.wealth);
  if (playerWealth.length <= 1) return 0;
  
  // Gini coefficient calculation for wealth concentration
  playerWealth.sort((a, b) => a - b);
  const n = playerWealth.length;
  const totalWealth = playerWealth.reduce((a, b) => a + b, 0);
  
  if (totalWealth === 0) return 0;
  
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * playerWealth[i];
  }
  
  return giniSum / (n * totalWealth);
}

function analyzeSpatialDistribution() {
  const quadrants = { nw: 0, ne: 0, sw: 0, se: 0 };
  
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.building) {
      const [row, col] = parcelId.split('-').map(Number);
      
      if (row < 6 && col < 6) quadrants.nw++;
      else if (row < 6 && col >= 6) quadrants.ne++;
      else if (row >= 6 && col < 6) quadrants.sw++;
      else quadrants.se++;
    }
  });
  
  return quadrants;
}

function calculateCollaborationIndex() {
  // Measure how much players work together vs compete
  let collaborationScore = 0;
  
  // Check for complementary building patterns
  const players = Array.from(gameState.core.players.keys());
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const dist1 = calculatePlayerBuildingDistribution(players[i]);
      const dist2 = calculatePlayerBuildingDistribution(players[j]);
      
      // Award points for complementary strategies
      const overlap = Object.keys(dist1).filter(building => dist2[building]).length;
      const unique = Object.keys(dist1).length + Object.keys(dist2).length - overlap;
      
      if (unique > overlap) collaborationScore += unique - overlap;
    }
  }
  
  return Math.min(100, collaborationScore * 10); // Scale to 0-100
}

function calculateCompetitionIndex() {
  // Measure direct competition between players
  let competitionScore = 0;
  const players = Array.from(gameState.core.players.keys());
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const dist1 = calculatePlayerBuildingDistribution(players[i]);
      const dist2 = calculatePlayerBuildingDistribution(players[j]);
      
      // Award points for similar strategies (competition)
      const overlap = Object.keys(dist1).filter(building => dist2[building]).length;
      competitionScore += overlap;
    }
  }
  
  return Math.min(100, competitionScore * 15); // Scale to 0-100
}

function calculateInnovationScore() {
  // Measure unusual or innovative building/strategy patterns
  let innovationScore = 0;
  
  // Check for unusual building ratios
  const counts = calculateBuildingCounts();
  const totalBuildings = Object.values(counts).reduce((a, b) => a + b, 0);
  
  if (totalBuildings > 0) {
    // Award points for balanced development
    const types = Object.keys(counts).length;
    const evenness = types / Math.max(1, Math.max(...Object.values(counts)));
    innovationScore += evenness * 25;
    
    // Award points for advanced infrastructure
    const transitScore = (counts.transitStop || 0) + (counts.transitRoute || 0) * 2;
    innovationScore += Math.min(25, transitScore * 5);
    
    // Award points for energy independence
    const energyProduction = (counts.solar || 0) + (counts.wind || 0);
    const energyNeeds = totalBuildings * 0.3; // Rough estimate
    if (energyProduction >= energyNeeds) innovationScore += 25;
  }
  
  return Math.min(100, innovationScore);
}

function identifyDominantStrategies() {
  const strategies = Array.from(gameState.core.players.values()).map(player => 
    analyzePlayerStrategy(player.id)
  );
  
  const strategyCounts = {};
  strategies.forEach(strategy => {
    strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
  });
  
  return Object.entries(strategyCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([strategy, count]) => ({ strategy, count }));
}

function detectUnusualPatterns() {
  const patterns = [];
  
  // Check for extremely rapid expansion
  const avgParcelsPerPlayer = Object.keys(gameState.core.parcels).length / Math.max(1, gameState.core.players.size);
  if (avgParcelsPerPlayer > 20) {
    patterns.push({ type: 'rapid_expansion', severity: 'high' });
  }
  
  // Check for governance concentration
  let maxGovernanceInfluence = 0;
  gameState.core.players.forEach(player => {
    const influence = calculateGovernanceInfluence(player.id);
    if (influence > maxGovernanceInfluence) {
      maxGovernanceInfluence = influence;
    }
  });
  
  if (maxGovernanceInfluence > 10) {
    patterns.push({ type: 'governance_dominance', severity: 'medium' });
  }
  
  return patterns;
}

function findEfficiencyOpportunities() {
  const opportunities = [];
  
  // Check energy balance
  const energyBalance = gameState.calculated.vitality.energy.balance;
  if (energyBalance < -10) {
    opportunities.push({ type: 'energy_shortage', impact: 'high' });
  } else if (energyBalance > 20) {
    opportunities.push({ type: 'energy_surplus', impact: 'medium' });
  }
  
  // Check transportation efficiency
  const connectivity = calculateNetworkConnectivity();
  const buildings = Object.values(calculateBuildingCounts()).reduce((a, b) => a + b, 0);
  
  if (buildings > 15 && connectivity < buildings * 0.5) {
    opportunities.push({ type: 'poor_connectivity', impact: 'high' });
  }
  
  return opportunities;
}

function detectGovernanceExploits() {
  const exploits = [];
  
  // Check for potential vote manipulation
  const totalBudget = gameState.core.governance.totalBudget;
  const unallocated = gameState.core.governance.unallocatedFunds;
  
  if (unallocated > totalBudget * 0.8) {
    exploits.push({ type: 'budget_hoarding', risk: 'medium' });
  }
  
  // Check for LVT rate manipulation
  const lvtRate = gameState.core.governance.currentLvtRate;
  if (lvtRate < 0.1 || lvtRate > 0.9) {
    exploits.push({ type: 'extreme_lvt_rate', risk: 'high' });
  }
  
  return exploits;
}

// Helper functions for performance metrics
function calculateTotalRevenue() {
  // This would sum up all revenue from buildings, auctions, etc.
  // Simplified implementation
  return Object.values(gameState.core.parcels).reduce((total, parcel) => {
    if (parcel.building) {
      // Add building revenue based on type
      return total + (getBuildingRevenue(parcel.building) || 0);
    }
    return total;
  }, 0);
}

function calculateTotalExpenses() {
  // Sum up maintenance costs, construction costs, etc.
  return Object.values(gameState.core.parcels).reduce((total, parcel) => {
    if (parcel.building) {
      return total + (getBuildingMaintenance(parcel.building) || 0);
    }
    return total;
  }, 0);
}

function calculateEfficiency() {
  // Calculate overall city efficiency (0-100)
  const vitality = gameState.calculated.vitality;
  const efficiencyScores = Object.values(vitality).map(v => {
    if (v.demand === 0) return 100;
    return Math.max(0, Math.min(100, (v.supply / v.demand) * 100));
  });
  return efficiencyScores.reduce((sum, score) => sum + score, 0) / efficiencyScores.length;
}

function calculateSustainability() {
  // Calculate environmental/economic sustainability (0-100)
  const energyBalance = gameState.calculated.vitality.energy.balance;
  const foodBalance = gameState.calculated.vitality.food.balance;
  const treasury = gameState.calculated.treasury;
  
  const energySustainability = Math.min(100, Math.max(0, (energyBalance + 50) * 2));
  const foodSustainability = Math.min(100, Math.max(0, (foodBalance + 50) * 2));
  const economicSustainability = Math.min(100, Math.max(0, treasury / 1000));
  
  return (energySustainability + foodSustainability + economicSustainability) / 3;
}

function getBuildingRevenue(buildingType) {
  const revenues = {
    'shop': 100,
    'office': 300,
    'market': 150
  };
  return revenues[buildingType] || 0;
}

function getBuildingMaintenance(buildingType) {
  const maintenance = {
    'house': 50,
    'apartment': 120,
    'shop': 75,
    'office': 150,
    'solar': 25,
    'wind': 40,
    'farm': 30,
    'market': 90
  };
  return maintenance[buildingType] || 0;
}

// Update leaderboard with new completed game
function updateLeaderboard(completedGame) {
  cityLeaderboard.push(completedGame);
  
  // Sort by score (descending) then by duration (ascending for ties)
  cityLeaderboard.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.duration - b.duration; // Faster completion wins ties
  });
  
  // Keep only top 100 games
  if (cityLeaderboard.length > 100) {
    cityLeaderboard.splice(100);
  }
  
  console.log(`📊 Leaderboard updated. ${completedGame.cityName} scored ${completedGame.score} points`);
}

// Get top N games from leaderboard
function getTopLeaderboard(limit = 10) {
  return cityLeaderboard.slice(0, limit).map((game, index) => ({
    rank: index + 1,
    gameId: game.gameId,
    cityName: game.cityName,
    score: game.score,
    playerCount: game.playerCount,
    duration: game.duration,
    durationFormatted: formatDuration(game.duration),
    endTime: game.endTime,
    endDate: new Date(game.endTime).toLocaleDateString(),
    endReason: game.endReason || 'completed',
    strategy: game.snapshot?.strategicInsights?.dominantStrategies?.[0]?.strategy || 'unknown'
  }));
}

// Helper function to format duration
function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Archive completed game
function archiveGame(gameId) {
  const game = gameHistory.get(gameId);
  if (!game) return;
  
  game.snapshot.archived = true;
  game.status = 'archived';
  
  console.log(`📦 Archived game ${gameId}`);
}

// Check if game should end due to time limit
function checkGameTimeLimit() {
  if (gameState.lifecycle.status !== 'active') return;
  
  // Check if we've reached September 1st of the following year
  if (gameState.core.currentMonth === 'SEPT' && gameState.core.currentDay === 1) {
    // Check if this is the second September (game started in previous September)
    const gameAgeInDays = (Date.now() - gameState.lifecycle.startTime) / (1000 * 60 * 60 * 24);
    if (gameAgeInDays > 30) { // Game has been running for more than 30 real days (approximate)
      endGame('time_limit');
    }
  }
}

// Monitor player connections and handle departures
function monitorPlayerConnections() {
  setInterval(() => {
    // Check for players who haven't been seen recently
    const now = Date.now();
    const disconnectThreshold = 30000; // 30 seconds
    
    gameState.lifecycle.activePlayers.forEach(playerId => {
      const player = gameState.core.players.get(playerId);
      const client = clients.get(playerId);
      
      if (!client || !player || (player.lastSeen && now - player.lastSeen > disconnectThreshold)) {
        // console.log(`🔌 Player ${playerId} appears disconnected`);
        handlePlayerDeparture(playerId, 'disconnect');
      }
    });
    
    // Check game time limit
    checkGameTimeLimit();
    
  }, 10000); // Check every 10 seconds
}

// Start monitoring when server starts
monitorPlayerConnections();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 The Commons WebSocket server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = { app, server, wss };