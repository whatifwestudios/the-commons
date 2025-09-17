/**
 * Robust Multiplayer State Synchronization Server
 * Implements WebSocket-like behavior using SSE with state versioning,
 * conflict resolution, and authoritative state management
 */

export const config = {
  runtime: 'edge',
};

// Enhanced game state with versioning and metadata
let gameState = {
  // Core game state
  core: {
    players: new Map(),
    parcels: {},
    auctions: new Map(), // Active auctions: auctionId -> auction data
    currentMonth: 'SEPT',
    currentDay: 1,
    gameSpeed: 1,
    isPaused: false
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

// Persistent client connections for SSE
const activeStreams = new Map();

export default async function handler(req) {
  // For Vercel, we'll use Server-Sent Events (SSE) instead of WebSocket
  // since Vercel doesn't support persistent WebSocket connections
  // We'll implement a polling + SSE hybrid approach
  
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const playerId = searchParams.get('playerId');
  
  // Handle different action types
  if (action === 'join') {
    return handleJoin(playerId, req);
  } else if (action === 'update') {
    return handleUpdate(req, playerId);
  } else if (action === 'stream') {
    return handleStream(playerId);
  } else if (action === 'reset') {
    return handleReset();
  }
  
  return new Response('Invalid action', { status: 400 });
}

function handleJoin(playerId, req) {
  const { searchParams } = new URL(req.url);
  const playerName = searchParams.get('playerName') || 'Player';
  const playerColor = searchParams.get('playerColor') || '#2196F3';
  const playerEmoji = searchParams.get('playerEmoji') || '🏠';
  
  if (!playerId) {
    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  }
  
  // Check if player already exists
  if (!gameState.players.has(playerId)) {
    // Use player's chosen settings instead of auto-assigning
    gameState.players.set(playerId, {
      id: playerId,
      name: playerName,
      color: playerColor,
      emoji: playerEmoji,
      joinedAt: Date.now(),
      cash: 5000,
      wealth: 5000
    });
  }
  
  return new Response(JSON.stringify({
    playerId,
    gameState,
    players: Array.from(gameState.players.values())
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleUpdate(req, playerId) {
  const body = await req.json();
  
  // Update game state based on action
  if (body.type === 'PURCHASE_PARCEL') {
    // Check for parcel purchase collision
    if (gameState.parcels[body.parcelId] && gameState.parcels[body.parcelId].owner) {
      // Parcel already owned - reject purchase
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'PARCEL_ALREADY_OWNED',
        message: 'This parcel has already been purchased by another player',
        currentOwner: gameState.parcels[body.parcelId].owner,
        gameState 
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Valid purchase - process it
    gameState.parcels[body.parcelId] = {
      owner: playerId,
      building: body.building,
      timestamp: Date.now(),
      purchasePrice: body.purchasePrice || 0
    };
  } else if (body.type === 'CONSTRUCT_BUILDING') {
    if (gameState.parcels[body.parcelId]) {
      gameState.parcels[body.parcelId].building = body.building;
      gameState.parcels[body.parcelId].constructionStartDay = body.constructionStartDay;
      gameState.parcels[body.parcelId].constructionDays = body.constructionDays;
    }
  } else if (body.type === 'CREATE_AUCTION_LISTING') {
    // Add auction listing to global marketplace
    if (!gameState.marketplace) {
      gameState.marketplace = { listings: [], nextListingId: 1 };
    }
    gameState.marketplace.listings.push(body.listing);
  } else if (body.type === 'BID_ON_LISTING') {
    // Update listing with new bid
    if (gameState.marketplace && gameState.marketplace.listings) {
      const listing = gameState.marketplace.listings.find(l => l.id === body.listingId);
      if (listing && listing.status === 'active') {
        listing.currentBid = body.bidAmount;
        listing.highBidder = playerId;
      }
    }
  } else if (body.type === 'BUY_NOW_LISTING') {
    // Complete buy-now purchase
    if (gameState.marketplace && gameState.marketplace.listings) {
      const listing = gameState.marketplace.listings.find(l => l.id === body.listingId);
      if (listing && listing.status === 'active') {
        listing.status = 'sold';
        listing.finalPrice = listing.buyNowPrice;
        listing.winner = playerId;
      }
    }
  } else if (body.type === 'CANCEL_LISTING') {
    // Cancel listing
    if (gameState.marketplace && gameState.marketplace.listings) {
      const listing = gameState.marketplace.listings.find(l => l.id === body.listingId);
      if (listing && listing.status === 'active' && listing.seller === playerId && listing.currentBid === 0) {
        listing.status = 'cancelled';
      }
    }
  } else if (body.type === 'END_AUCTION_NOW') {
    // End auction early with fee
    if (gameState.marketplace && gameState.marketplace.listings) {
      const listing = gameState.marketplace.listings.find(l => l.id === body.listingId);
      if (listing && listing.status === 'active' && listing.seller === playerId && listing.currentBid > 0) {
        listing.status = 'ended_early';
        listing.finalPrice = listing.currentBid;
        listing.winner = listing.highBidder;
        listing.endItNowFee = body.fee;
      }
    }
  }
  
  gameState.lastUpdate = Date.now();
  
  return new Response(JSON.stringify({ success: true, gameState }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleStream(playerId) {
  // Server-Sent Events for real-time updates
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // Send initial state
  writer.write(encoder.encode(`data: ${JSON.stringify({
    type: 'STATE_UPDATE',
    gameState,
    players: Array.from(gameState.players.values())
  })}\n\n`));
  
  // Set up periodic state updates (every 1 second)
  const interval = setInterval(() => {
    writer.write(encoder.encode(`data: ${JSON.stringify({
      type: 'STATE_UPDATE',
      gameState,
      players: Array.from(gameState.players.values())
    })}\n\n`));
  }, 1000);
  
  // Clean up on disconnect
  setTimeout(() => {
    clearInterval(interval);
    writer.close();
  }, 30000); // 30 second timeout for demo
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleReset(corsHeaders) {
  // Reset all game state
  gameState = {
    core: {
      players: new Map(),
      parcels: {},
      auctions: new Map(),
      currentMonth: 'SEPT',
      currentDay: 1,
      gameSpeed: 1,
      isPaused: false
    },
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
    version: {
      global: 0,
      perParcel: {},
      perPlayer: {}
    },
    meta: {
      lastUpdate: Date.now(),
      activeConnections: new Set(),
      actionQueue: [],
      conflictLog: []
    }
  };
  
  // Close all active streams
  activeStreams.clear();
  
  // Broadcast reset to any remaining connections
  broadcastToAllClients({
    type: 'GAME_RESET',
    timestamp: Date.now(),
    version: 0
  });
  
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Game state reset successfully',
    gameState: getClientSafeState(),
    version: 0
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

// New handler functions
function handleHeartbeat(playerId, corsHeaders) {
  if (gameState.core.players.has(playerId)) {
    gameState.core.players.get(playerId).lastSeen = Date.now();
    gameState.meta.activeConnections.add(playerId);
  }
  
  return new Response(JSON.stringify({
    success: true,
    timestamp: Date.now(),
    version: gameState.version.global
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function handleStateSync(playerId, clientVersion, corsHeaders) {
  const fullState = getClientSafeState();
  
  return new Response(JSON.stringify({
    success: true,
    gameState: fullState,
    players: Array.from(gameState.core.players.values()),
    version: gameState.version.global,
    timestamp: Date.now(),
    type: 'FULL_SYNC'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
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

function broadcastToAllClients(message) {
  const encoder = new TextEncoder();
  const messageData = `data: ${JSON.stringify(message)}\n\n`;
  
  activeStreams.forEach((stream, playerId) => {
    try {
      stream.writer.write(encoder.encode(messageData));
      stream.lastSeen = Date.now();
    } catch (error) {
      console.error(`Failed to send to ${playerId}:`, error);
      activeStreams.delete(playerId);
    }
  });
}

async function processAction(action) {
  const { type, playerId } = action;
  
  switch (type) {
    case 'PURCHASE_PARCEL':
      return await processPurchaseParcel(action);
    case 'CONSTRUCT_BUILDING':
      return await processConstructBuilding(action);
    case 'UPDATE_CASH':
      return await processUpdateCash(action);
    case 'ADVANCE_TIME':
      return await processAdvanceTime(action);
    case 'START_AUCTION':
      return await processStartAuction(action);
    case 'PLACE_BID':
      return await processPlaceBid(action);
    case 'END_AUCTION':
      return await processEndAuction(action);
    default:
      throw new Error(`Unknown action type: ${type}`);
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
  const { day, month, playerId } = action;
  
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

// Authoritative state calculation
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
    'house': { 
      population: 4, 
      housing: 1, 
      energyDemand: 2, 
      maintenanceCost: 50,
      lvtRate: 0.01 
    },
    'apartment': { 
      population: 12, 
      housing: 3, 
      energyDemand: 6, 
      maintenanceCost: 120,
      lvtRate: 0.015 
    },
    'shop': { 
      jobs: 2, 
      energyDemand: 3, 
      revenue: 100,
      maintenanceCost: 75,
      lvtRate: 0.02 
    },
    'office': { 
      jobs: 8, 
      energyDemand: 5, 
      revenue: 300,
      maintenanceCost: 150,
      lvtRate: 0.025 
    },
    'solar': { 
      energySupply: 10, 
      maintenanceCost: 25,
      lvtRate: 0.005 
    },
    'wind': { 
      energySupply: 15, 
      maintenanceCost: 40,
      lvtRate: 0.008 
    },
    'farm': { 
      foodProduction: 8, 
      jobs: 1,
      maintenanceCost: 30,
      lvtRate: 0.005 
    },
    'market': { 
      foodSupply: 20, 
      jobs: 3,
      energyDemand: 4,
      revenue: 150,
      maintenanceCost: 90,
      lvtRate: 0.015 
    }
  };
  
  let totalRevenue = 0;
  let totalMaintenance = 0;
  
  // Calculate from all parcels
  Object.entries(gameState.core.parcels).forEach(([parcelId, parcel]) => {
    if (parcel.building) {
      const buildingType = buildingTypes[parcel.building];
      if (!buildingType) {
        console.warn(`Unknown building type: ${parcel.building}`);
        return;
      }
      
      // Population calculation
      if (buildingType.population) {
        gameState.calculated.population += buildingType.population;
      }
      
      // Housing supply
      if (buildingType.housing) {
        gameState.calculated.vitality.housing.supply += buildingType.housing;
      }
      
      // Jobs supply
      if (buildingType.jobs) {
        gameState.calculated.vitality.jobs.supply += buildingType.jobs;
      }
      
      // Energy supply/demand
      if (buildingType.energySupply) {
        gameState.calculated.vitality.energy.supply += buildingType.energySupply;
      }
      if (buildingType.energyDemand) {
        gameState.calculated.vitality.energy.demand += buildingType.energyDemand;
      }
      
      // Food supply/demand
      if (buildingType.foodProduction) {
        gameState.calculated.vitality.food.supply += buildingType.foodProduction;
      }
      if (buildingType.foodSupply) {
        gameState.calculated.vitality.food.supply += buildingType.foodSupply;
      }
      
      // Economic calculations
      if (buildingType.revenue) {
        totalRevenue += buildingType.revenue;
      }
      if (buildingType.maintenanceCost) {
        totalMaintenance += buildingType.maintenanceCost;
      }
      
      // LVT calculation based on building value and parcel cost
      const parcelValue = parcel.purchasePrice || 1000;
      const buildingValue = parcelValue * (buildingType.lvtRate || 0.01);
      gameState.calculated.treasury += buildingValue;
    }
  });
  
  // Calculate demands based on population
  if (gameState.calculated.population > 0) {
    // Each resident needs housing (calculated above) and generates demand
    gameState.calculated.vitality.food.demand = gameState.calculated.population * 0.5; // 0.5 food per person
    gameState.calculated.vitality.jobs.demand = gameState.calculated.population * 0.6; // 60% employment rate
    
    // Basic energy demand from population (in addition to buildings)
    gameState.calculated.vitality.energy.demand += gameState.calculated.population * 0.3;
  }
  
  // Calculate balances
  Object.keys(gameState.calculated.vitality).forEach(key => {
    const vitality = gameState.calculated.vitality[key];
    vitality.balance = vitality.supply - vitality.demand;
  });
  
  // Update market multipliers based on supply/demand balance
  Object.keys(gameState.calculated.vitality).forEach(key => {
    const vitality = gameState.calculated.vitality[key];
    if (vitality.supply > 0) {
      const ratio = vitality.demand / vitality.supply;
      // Multiplier ranges from 0.5 (oversupply) to 2.0 (high demand)
      gameState.calculated.marketMultipliers[key] = Math.max(0.5, Math.min(2.0, ratio));
    } else {
      gameState.calculated.marketMultipliers[key] = 2.0; // Maximum multiplier when no supply
    }
  });
  
  // Add economic performance to treasury (simplified daily revenue)
  gameState.calculated.treasury += Math.max(0, totalRevenue - totalMaintenance);
  
  gameState.calculated.lastCalculated = Date.now();
  
  const calculationTime = Date.now() - startTime;
  console.log(`✅ Authoritative state recalculated in ${calculationTime}ms:`, {
    population: gameState.calculated.population,
    treasury: Math.round(gameState.calculated.treasury),
    vitality: Object.fromEntries(
      Object.entries(gameState.calculated.vitality).map(([k, v]) => [k, Math.round(v.balance)])
    )
  });
}

// State versioning and diff system
function createStateDiff(oldState, newState) {
  const diff = {
    version: newState.version.global,
    timestamp: Date.now(),
    changes: {}
  };
  
  // Diff core state
  if (oldState.core) {
    // Diff parcels
    const parcelChanges = diffParcels(oldState.core.parcels, newState.core.parcels);
    if (Object.keys(parcelChanges).length > 0) {
      diff.changes.parcels = parcelChanges;
    }
    
    // Diff players
    const playerChanges = diffPlayers(oldState.core.players, newState.core.players);
    if (Object.keys(playerChanges).length > 0) {
      diff.changes.players = playerChanges;
    }
    
    // Diff world state
    const worldChanges = diffWorldState(oldState.core, newState.core);
    if (Object.keys(worldChanges).length > 0) {
      diff.changes.world = worldChanges;
    }
  }
  
  // Diff calculated state
  if (oldState.calculated) {
    const calculatedChanges = diffCalculatedState(oldState.calculated, newState.calculated);
    if (Object.keys(calculatedChanges).length > 0) {
      diff.changes.calculated = calculatedChanges;
    }
  }
  
  return diff;
}

function diffParcels(oldParcels, newParcels) {
  const changes = {};
  
  // Check for new or modified parcels
  Object.keys(newParcels).forEach(parcelId => {
    const oldParcel = oldParcels[parcelId];
    const newParcel = newParcels[parcelId];
    
    if (!oldParcel || JSON.stringify(oldParcel) !== JSON.stringify(newParcel)) {
      changes[parcelId] = newParcel;
    }
  });
  
  // Check for removed parcels
  Object.keys(oldParcels).forEach(parcelId => {
    if (!newParcels[parcelId]) {
      changes[parcelId] = null; // Indicates deletion
    }
  });
  
  return changes;
}

function diffPlayers(oldPlayers, newPlayers) {
  const changes = {};
  
  // Convert Maps to objects for comparison
  const oldPlayerObj = Object.fromEntries(oldPlayers);
  const newPlayerObj = Object.fromEntries(newPlayers);
  
  // Check for new or modified players
  Object.keys(newPlayerObj).forEach(playerId => {
    const oldPlayer = oldPlayerObj[playerId];
    const newPlayer = newPlayerObj[playerId];
    
    if (!oldPlayer || JSON.stringify(oldPlayer) !== JSON.stringify(newPlayer)) {
      changes[playerId] = newPlayer;
    }
  });
  
  // Check for removed players
  Object.keys(oldPlayerObj).forEach(playerId => {
    if (!newPlayerObj[playerId]) {
      changes[playerId] = null; // Indicates disconnection/removal
    }
  });
  
  return changes;
}

function diffWorldState(oldWorld, newWorld) {
  const changes = {};
  
  if (oldWorld.currentMonth !== newWorld.currentMonth) {
    changes.currentMonth = newWorld.currentMonth;
  }
  
  if (oldWorld.currentDay !== newWorld.currentDay) {
    changes.currentDay = newWorld.currentDay;
  }
  
  if (oldWorld.gameSpeed !== newWorld.gameSpeed) {
    changes.gameSpeed = newWorld.gameSpeed;
  }
  
  if (oldWorld.isPaused !== newWorld.isPaused) {
    changes.isPaused = newWorld.isPaused;
  }
  
  return changes;
}

function diffCalculatedState(oldCalculated, newCalculated) {
  const changes = {};
  
  if (oldCalculated.treasury !== newCalculated.treasury) {
    changes.treasury = newCalculated.treasury;
  }
  
  if (oldCalculated.population !== newCalculated.population) {
    changes.population = newCalculated.population;
  }
  
  // Diff vitality metrics
  const vitalityChanges = {};
  Object.keys(newCalculated.vitality).forEach(key => {
    const oldVitality = oldCalculated.vitality[key];
    const newVitality = newCalculated.vitality[key];
    
    if (!oldVitality || JSON.stringify(oldVitality) !== JSON.stringify(newVitality)) {
      vitalityChanges[key] = newVitality;
    }
  });
  
  if (Object.keys(vitalityChanges).length > 0) {
    changes.vitality = vitalityChanges;
  }
  
  // Diff market multipliers
  const multiplierChanges = {};
  Object.keys(newCalculated.marketMultipliers).forEach(key => {
    if (oldCalculated.marketMultipliers[key] !== newCalculated.marketMultipliers[key]) {
      multiplierChanges[key] = newCalculated.marketMultipliers[key];
    }
  });
  
  if (Object.keys(multiplierChanges).length > 0) {
    changes.marketMultipliers = multiplierChanges;
  }
  
  return changes;
}

// Apply diff to state (for client-side application)
function applyStateDiff(baseState, diff) {
  const newState = JSON.parse(JSON.stringify(baseState)); // Deep clone
  
  if (diff.changes.parcels) {
    Object.keys(diff.changes.parcels).forEach(parcelId => {
      if (diff.changes.parcels[parcelId] === null) {
        delete newState.core.parcels[parcelId];
      } else {
        newState.core.parcels[parcelId] = diff.changes.parcels[parcelId];
      }
    });
  }
  
  if (diff.changes.players) {
    Object.keys(diff.changes.players).forEach(playerId => {
      if (diff.changes.players[playerId] === null) {
        newState.core.players.delete(playerId);
      } else {
        newState.core.players.set(playerId, diff.changes.players[playerId]);
      }
    });
  }
  
  if (diff.changes.world) {
    Object.assign(newState.core, diff.changes.world);
  }
  
  if (diff.changes.calculated) {
    Object.assign(newState.calculated, diff.changes.calculated);
  }
  
  newState.version.global = diff.version;
  newState.meta.lastUpdate = diff.timestamp;
  
  return newState;
}

// Enhanced broadcast with diff support
function broadcastStateDiff(oldState, newState) {
  const diff = createStateDiff(oldState, newState);
  
  // Only broadcast if there are actual changes
  if (Object.keys(diff.changes).length > 0) {
    broadcastToAllClients({
      type: 'STATE_DIFF',
      diff: diff,
      timestamp: Date.now()
    });
    
    console.log(`Broadcasted diff with ${Object.keys(diff.changes).length} change categories`);
  }
}

// Auction processing functions
async function processStartAuction(action) {
  const { auctionId, row, col, challengingPlayerId, auctionData } = action;
  
  // Validate coordinates
  if (row < 0 || row >= 32 || col < 0 || col >= 32) {
    return {
      success: false,
      error: 'INVALID_COORDINATES',
      message: 'Invalid parcel coordinates'
    };
  }
  
  // Check if parcel exists
  const parcelId = `${row}-${col}`;
  if (!gameState.core.parcels[parcelId]) {
    return {
      success: false,
      error: 'PARCEL_NOT_FOUND',
      message: 'No parcel at this location'
    };
  }
  
  // Check if auction already exists for this parcel
  for (const auction of gameState.core.auctions.values()) {
    if (auction.row === row && auction.col === col) {
      return {
        success: false,
        error: 'AUCTION_EXISTS',
        message: 'Auction already exists for this parcel'
      };
    }
  }
  
  // Check maximum concurrent auctions (2)
  if (gameState.core.auctions.size >= 2) {
    return {
      success: false,
      error: 'MAX_AUCTIONS',
      message: 'Maximum 2 concurrent auctions allowed'
    };
  }
  
  // Create auction
  const auction = {
    ...auctionData,
    id: auctionId,
    row,
    col,
    challengingPlayer: challengingPlayerId,
    startTime: Date.now(),
    endTime: Date.now() + 60000, // 60 seconds
    bidHistory: [],
    dutchPhase: true,
    lastDutchUpdate: Date.now(),
    lastUpdateVersion: gameState.version.global + 1
  };
  
  gameState.core.auctions.set(auctionId, auction);
  
  // Set up server-side auction timer for automatic ending
  setTimeout(() => {
    const currentAuction = gameState.core.auctions.get(auctionId);
    if (currentAuction && Date.now() >= currentAuction.endTime) {
      // Auto-end auction if it's still active
      processEndAuction({ auctionId, reason: 'timer_expired' });
    }
  }, 61000); // 61 seconds to account for any timing differences
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      auctions: { [auctionId]: auction }
    }
  };
}

async function processPlaceBid(action) {
  const { auctionId, playerId, bidAmount, customAmount, clientAuctionVersion } = action;
  
  const auction = gameState.core.auctions.get(auctionId);
  if (!auction) {
    return {
      success: false,
      error: 'AUCTION_NOT_FOUND',
      message: 'Auction not found'
    };
  }
  
  // Check if auction has ended
  if (Date.now() > auction.endTime) {
    return {
      success: false,
      error: 'AUCTION_ENDED',
      message: 'Auction has already ended'
    };
  }
  
  // Race condition protection: check if auction state has changed since client's last view
  if (clientAuctionVersion && auction.lastUpdateVersion && clientAuctionVersion < auction.lastUpdateVersion) {
    return {
      success: false,
      error: 'AUCTION_STATE_CHANGED',
      message: 'Auction state has changed, please refresh and try again',
      currentAuctionState: auction
    };
  }
  
  // Check for conflicting bid (someone bid higher while this bid was in transit)
  if (!auction.dutchPhase && customAmount && customAmount <= auction.currentBid) {
    return {
      success: false,
      error: 'BID_SUPERSEDED',
      message: 'Another player has placed a higher bid',
      currentBid: auction.currentBid,
      currentBidder: auction.currentBidder
    };
  }
  
  // Handle Dutch auction phase
  if (auction.dutchPhase) {
    auction.currentBidder = playerId;
    auction.dutchPhase = false; // End Dutch phase when first bid is placed
    
    // Extend auction if bid placed near end
    const timeLeft = auction.endTime - Date.now();
    if (timeLeft < 5000) { // Less than 5 seconds left
      auction.endTime += 2000; // Add 2 seconds
    }
  } else {
    // Regular bidding phase - validate bid amount
    const minBid = customAmount || auction.currentBid * (1 + (bidAmount || 0.05));
    if ((customAmount || auction.currentBid * (1 + bidAmount)) <= auction.currentBid) {
      return {
        success: false,
        error: 'BID_TOO_LOW',
        message: 'Bid must be higher than current bid'
      };
    }
    
    auction.currentBid = customAmount || auction.currentBid * (1 + bidAmount);
    auction.currentBidder = playerId;
    
    // Extend auction if bid placed near end
    const timeLeft = auction.endTime - Date.now();
    if (timeLeft < 5000) { // Less than 5 seconds left
      auction.endTime += 2000; // Add 2 seconds
    }
  }
  
  // Add to bid history
  auction.bidHistory.push({
    playerId,
    amount: auction.currentBid,
    timestamp: Date.now()
  });
  
  // Update auction version for conflict detection
  auction.lastUpdateVersion = gameState.version.global + 1;
  
  // Update versions
  gameState.version.global++;
  gameState.meta.lastUpdate = Date.now();
  
  return {
    success: true,
    processedAction: action,
    stateChanges: {
      auctions: { [auctionId]: auction }
    }
  };
}

async function processEndAuction(action) {
  const { auctionId, reason = 'completed' } = action;
  
  const auction = gameState.core.auctions.get(auctionId);
  if (!auction) {
    return {
      success: false,
      error: 'AUCTION_NOT_FOUND',
      message: 'Auction not found'
    };
  }
  
  // Determine winner and transfer ownership
  const parcelId = `${auction.row}-${auction.col}`;
  const parcel = gameState.core.parcels[parcelId];
  
  if (auction.currentBidder && parcel) {
    // Transfer ownership
    const previousOwner = parcel.owner;
    parcel.owner = auction.currentBidder;
    
    // Update player cash (simplified - in real implementation would need to validate player has enough cash)
    const winner = gameState.core.players.get(auction.currentBidder);
    if (winner) {
      winner.cash -= auction.currentBid;
    }
    
    // Pay previous owner if exists
    if (previousOwner && previousOwner !== auction.currentBidder) {
      const previousPlayer = gameState.core.players.get(previousOwner);
      if (previousPlayer) {
        previousPlayer.cash += auction.currentBid;
      }
    }
  }
  
  // Remove auction
  gameState.core.auctions.delete(auctionId);
  
  // Update versions
  gameState.version.global++;
  gameState.version.perParcel[parcelId] = gameState.version.global;
  if (auction.currentBidder) {
    gameState.version.perPlayer[auction.currentBidder] = gameState.version.global;
  }
  gameState.meta.lastUpdate = Date.now();
  
  return {
    success: true,
    processedAction: action,
    auctionResult: {
      winner: auction.currentBidder,
      finalBid: auction.currentBid,
      reason
    },
    stateChanges: {
      auctions: { [auctionId]: null }, // Mark as deleted
      parcels: { [parcelId]: parcel },
      players: auction.currentBidder ? { [auction.currentBidder]: Object.fromEntries([[auction.currentBidder, gameState.core.players.get(auction.currentBidder)]]) } : {}
    }
  };
}