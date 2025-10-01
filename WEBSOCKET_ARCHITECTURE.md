# WebSocket Communication Architecture

## Overview

The Commons game uses a WebSocket-based real-time communication architecture between client and server. The WebSocket connection is established at `/ws` and handles all real-time game events, state synchronization, and player interactions.

## WebSocket Connection Flow

1. **Client connects** to `ws://localhost:3000/ws`
2. **Server assigns** unique player ID (`player_${random}`)
3. **Server sends** `CONNECTED` message with player ID
4. **Client can identify** itself with existing player data via `IDENTIFY_PLAYER`
5. **Room assignment** happens through Beer Hall lobby system
6. **Game state sync** begins when player joins a room

## Message Types and Structures

### Connection & Identity Messages

#### CONNECTED (Server → Client)
```javascript
{
  type: 'CONNECTED',
  message: 'Connected to The Commons multiplayer server',
  playerId: 'player_abc123'
}
```

#### IDENTIFY_PLAYER (Client → Server)
```javascript
{
  type: 'IDENTIFY_PLAYER',
  playerId: 'existing_player_id',
  playerName: 'Player Name',
  playerColor: '#4CAF50'
}
```

#### PLAYER_IDENTIFIED (Server → Client)
```javascript
{
  type: 'PLAYER_IDENTIFIED',
  playerId: 'confirmed_player_id',
  message: 'Successfully identified as player_id'
}
```

### Room Management Messages

#### PLAYER_JOINED (Server → All Room Players)
```javascript
{
  type: 'PLAYER_JOINED',
  playerId: 'player_abc123',
  playerData: {
    name: 'Player Name',
    color: '#4CAF50',
    cityName: 'Generated City Name'
  },
  roomInfo: { /* room details */ }
}
```

#### PLAYER_LEFT (Server → All Room Players)
```javascript
{
  type: 'PLAYER_LEFT',
  playerId: 'player_abc123',
  reason: 'disconnect'
}
```

#### READY_CHECK_STARTED (Server → All Room Players)
```javascript
{
  type: 'READY_CHECK_STARTED',
  timeout: 30000,
  playersReady: []
}
```

#### READY (Client → Server)
```javascript
{
  type: 'READY',
  ready: true
}
```

#### PLAYER_READY (Server → All Room Players)
```javascript
{
  type: 'PLAYER_READY',
  playerId: 'player_abc123',
  ready: true
}
```

### Game Flow Messages

#### START_GAME (Client → Server)
```javascript
{
  type: 'START_GAME'
}
```

#### GAME_STARTING (Server → All Room Players)
```javascript
{
  type: 'GAME_STARTING',
  countdown: 3000,
  players: [/* player data */]
}
```

#### REQUEST_ROOM_STATE (Client → Server)
```javascript
{
  type: 'REQUEST_ROOM_STATE'
}
```

#### ROOM_STATE_SYNC (Server → Client)
```javascript
{
  type: 'ROOM_STATE_SYNC',
  roomState: {
    players: { /* player data */ },
    gameState: { /* current game state */ },
    roomInfo: { /* room metadata */ }
  },
  timestamp: 1234567890
}
```

### Economic Transaction Messages

#### ECONOMIC_TRANSACTION (Client → Server)
```javascript
{
  type: 'ECONOMIC_TRANSACTION',
  transaction: {
    id: 'unique_transaction_id',
    type: 'BUILD_START', // or other transaction types
    playerId: 'player_abc123',
    buildingId: 'residential_1',
    location: [5, 7],
    cost: 250,
    timestamp: 1234567890
  }
}
```

#### TRANSACTION_RESPONSE (Server → Client)
```javascript
{
  type: 'TRANSACTION_RESPONSE',
  transactionId: 'unique_transaction_id',
  result: {
    success: true,
    newBalance: 5750,
    message: 'Building construction started'
  }
}
```

### Game State Broadcast Messages

#### GAME_STATE (Server → All Room Players)
**Primary real-time game state synchronization message**
```javascript
{
  type: 'GAME_STATE',
  eventType: 'TRANSACTION_COMPLETE', // or other event types
  eventData: { /* context about what triggered this update */ },
  timestamp: 1234567890,
  gameState: {
    gameTime: 12.5, // game days elapsed
    gameDay: 12,
    totalResidents: 150,
    demographics: { /* population data */ },
    jeefhh: { /* jobs, energy, education, food, housing, healthcare data */ },
    carens: { /* culture, affordability, resilience, environment, noise, safety */ },
    attractiveness: 0.85,
    buildings: [
      {
        id: 'building_123',
        ownerId: 'player_abc123',
        location: [5, 7],
        locationKey: '5,7',
        underConstruction: false,
        age: 5,
        decay: 0.1,
        condition: 0.9,
        graphics: { /* rendering data */ },
        residents: 8,
        workers: 12,
        efficiency: 0.95,
        revenue: 120,
        expenses: 30,
        netIncome: 90
      }
    ],
    players: {
      'player_abc123': {
        id: 'player_abc123',
        cash: 5750,
        wealth: 8200, // cash + assets
        governance: {
          votingPoints: 4,
          allocations: { education: 2, healthcare: 1, infrastructure: 1 },
          votes: { /* detailed vote allocations */ }
        },
        name: 'Player Name',
        color: '#4CAF50',
        cityName: 'Springfield'
      }
    },
    cashflow: {
      'player_abc123': {
        income: 450,
        expenses: 120,
        netCashflow: 330,
        breakdown: { /* detailed cashflow */ }
      }
    },
    grid: { /* parcel ownership data */ },
    governance: {
      treasury: 1250,
      taxRate: 0.5
    },
    lvtRate: 0.5
  }
}
```

### Economic Update Messages

#### ECONOMIC_UPDATE (Server → All Room Players)
```javascript
{
  type: 'ECONOMIC_UPDATE',
  eventType: 'BUILD_COMPLETE_AUTO',
  eventData: {
    type: 'BUILD_COMPLETE_AUTO',
    buildingId: 'building_123',
    playerId: 'player_abc123',
    location: [5, 7]
  },
  timestamp: 1234567890
}
```

#### DAILY_UPDATE (Server → All Room Players)
```javascript
{
  type: 'DAILY_UPDATE',
  source: 'timer',
  gameDay: 13,
  gameTime: 13.0,
  timestamp: 1234567890
}
```

#### MONTHLY_UPDATE (Server → All Room Players)
```javascript
{
  type: 'MONTHLY_UPDATE',
  month: 'OCTOBER',
  votingPointsAwarded: 2,
  timestamp: 1234567890
}
```

### Governance Messages

#### GOVERNANCE_VOTE (Client → Server)
```javascript
{
  type: 'GOVERNANCE_VOTE',
  voteType: 'allocation', // or 'lvt'
  playerId: 'player_abc123',
  category: 'education', // for allocation votes
  amount: 2, // points allocated
  lvtRate: 0.6 // for LVT votes
}
```

#### GOVERNANCE_UPDATE (Server → All Room Players)
```javascript
{
  type: 'GOVERNANCE_UPDATE',
  gameState: { /* updated game state with new governance data */ },
  transaction: { /* governance transaction details */ },
  timestamp: 1234567890
}
```

#### GOVERNANCE_ERROR (Server → Client)
```javascript
{
  type: 'GOVERNANCE_ERROR',
  error: 'Insufficient voting points',
  transaction: { /* failed transaction */ },
  timestamp: 1234567890
}
```

### Chat Messages

#### CHAT_MESSAGE (Client → Server)
```javascript
{
  type: 'CHAT_MESSAGE', // or 'CHAT'
  playerId: 'player_abc123',
  playerName: 'Player Name',
  message: 'Hello everyone!',
  color: '#4CAF50'
}
```

#### CHAT_MESSAGE (Server → All Room Players)
```javascript
{
  type: 'CHAT_MESSAGE',
  playerId: 'player_abc123',
  playerName: 'Player Name',
  message: 'Hello everyone!',
  color: '#4CAF50',
  timestamp: 1234567890
}
```

### Reconnection Messages

#### PLAYER_DISCONNECTED (Server → All Room Players)
```javascript
{
  type: 'PLAYER_DISCONNECTED',
  playerId: 'player_abc123',
  timestamp: 1234567890
}
```

#### RECONNECTED (Server → Reconnecting Client)
```javascript
{
  type: 'RECONNECTED',
  playerId: 'player_abc123',
  roomState: { /* current room state */ }
}
```

#### PLAYER_RECONNECTED (Server → All Other Room Players)
```javascript
{
  type: 'PLAYER_RECONNECTED',
  playerId: 'player_abc123',
  timestamp: 1234567890
}
```

### Error Messages

#### ERROR (Server → Client)
```javascript
{
  type: 'ERROR',
  message: 'Need at least 2 players to start',
  context: 'START_GAME',
  timestamp: 1234567890
}
```

## Transaction Types

### Building Transactions
- `BUILD_START` - Start building construction
- `BUILD_COMPLETE` - Complete building construction
- `BUILD_COMPLETE_AUTO` - Automatic building completion (server-triggered)
- `DESTROY_BUILDING` - Demolish a building
- `REPAIR_BUILDING` - Repair building condition

### Economic Transactions
- `CASH_SPEND` - General cash expenditure
- `PARCEL_PURCHASE` - Buy land parcel

### Action Marketplace Transactions
- `ACTION_SPEND` - Spend action points
- `ACTION_PURCHASE` - Buy action points
- `ACTION_BID` - Bid on action marketplace
- `ACTION_BUY_NOW` - Buy action immediately
- `ACTION_SALE` - List action for sale
- `ACTION_WIN` - Win action auction
- `BID_REFUND` - Refund failed bid
- `LISTING_CANCEL_FEE` - Fee for canceling listing
- `END_EARLY_FEE` - Fee for ending auction early

### Governance Transactions
- `GOVERNANCE_VOTE` - Submit governance vote
- `budget_vote` - Allocate budget points (via economic transaction)

## Message Flow Patterns

### Request/Response Pattern
1. Client sends transaction request (`ECONOMIC_TRANSACTION`)
2. Server processes and validates
3. Server sends response (`TRANSACTION_RESPONSE`)
4. Server broadcasts state update (`GAME_STATE`)

### Broadcast Pattern
1. Server event occurs (timer, player action, etc.)
2. Server calculates new state
3. Server broadcasts to all room players (`GAME_STATE`, `ECONOMIC_UPDATE`, etc.)

### Room-based Routing
- All messages are scoped to specific rooms
- Players only receive messages from their assigned room
- Server uses room manager to route messages appropriately

## Authentication & Validation

### Player Identification
- Server assigns unique player IDs on connection
- Clients can identify with existing player data
- Player metadata (name, color) validated by server

### Transaction Validation
- All economic transactions validated server-side
- Insufficient funds/resources rejected with error response
- State changes only occur on successful validation

### Room Authorization
- Players must be in room to receive room-specific messages
- Chat and game actions restricted to room members
- Room state requests validated against player membership

## Error Handling

### Connection Errors
- WebSocket disconnections handled gracefully
- Automatic reconnection attempts by client
- Player state preserved during brief disconnections

### Transaction Errors
- Invalid transactions return error responses
- Client state remains unchanged until server confirmation
- Detailed error messages for debugging

### State Synchronization
- Clients can request full state sync with `REQUEST_ROOM_STATE`
- Server broadcasts authoritative state updates
- Local client state updated only after server confirmation

## Performance Considerations

### Message Frequency
- Game state broadcasts triggered by events, not timers
- Daily updates sent once per game day
- Monthly updates sent once per game month

### Data Optimization
- Building performance calculated server-side
- Cached data included in broadcasts to reduce client computation
- Player data normalized for efficient transmission

### Connection Management
- Inactive connections cleaned up automatically
- Room cleanup when all players disconnect
- Efficient message routing to minimize bandwidth

## Key Files

### Server-Side
- `/home/zjb/the-commons-clean/server.js` - Main WebSocket handling and routing
- `/home/zjb/the-commons-clean/server-economic-engine-v2.js` - Economic logic and state broadcasting
- `/home/zjb/the-commons-clean/server-room-manager.js` - Room lifecycle and player management

### Client-Side
- `/home/zjb/the-commons-clean/economic-client-v2.js` - WebSocket client and state management
- `/home/zjb/the-commons-clean/governance-v3.js` - Governance transaction sending
- `/home/zjb/the-commons-clean/beer-hall-lobby.js` - Room joining and lobby management

This architecture provides real-time, server-authoritative multiplayer gameplay with robust error handling and efficient state synchronization.