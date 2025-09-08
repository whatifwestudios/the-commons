# The Commons - Deployment & Multiplayer Architecture Plan

## Deployment Options Analysis

### 1. **Vercel** (Recommended for initial launch)
**Pros:**
- Zero-config deployment for static sites
- Automatic HTTPS and CDN
- Serverless functions for backend API
- Free tier generous for prototyping
- GitHub integration for auto-deploys
- Edge functions for low-latency

**Cons:**
- WebSocket support requires workarounds
- Serverless functions have cold starts
- Limited persistent connections

**Best for:** Initial launch, single-player mode, turn-based multiplayer

### 2. **Fly.io** (Recommended for real-time multiplayer)
**Pros:**
- Full WebSocket support
- Persistent Node.js servers
- Global edge deployment
- Built-in Redis for game state
- Scales horizontally easily
- Good for real-time games

**Cons:**
- More complex setup than Vercel
- Requires Docker configuration
- Costs scale with always-on servers

**Best for:** Real-time multiplayer, persistent game worlds

### 3. **Hybrid Approach** (Optimal)
- **Vercel**: Frontend hosting, CDN, authentication
- **Fly.io**: WebSocket server for real-time updates
- **Supabase/PostgreSQL**: Game state persistence
- **Redis**: Session management and caching

## Multiplayer Architecture Design

### Phase 1: Turn-Based Multiplayer (MVP)
```
CLIENT → VERCEL (Frontend) → SUPABASE
                ↓
         Serverless API
                ↓
         PostgreSQL
```

**Implementation:**
1. Each player takes turns (daily cycles)
2. Game state stored in PostgreSQL
3. Optimistic UI updates with conflict resolution
4. REST API for all actions

### Phase 2: Real-Time Multiplayer
```
CLIENT ← WebSocket → FLY.IO (Game Server)
   ↓                        ↓
VERCEL                   Redis
(Static)                    ↓
                      PostgreSQL
```

**Key Components:**

#### Game Server (Node.js + Socket.io)
```javascript
// server.js
const io = require('socket.io')(server);
const Redis = require('ioredis');

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map();
    this.gameState = new GameState();
  }
  
  handlePlayerAction(playerId, action) {
    // Validate action
    // Update game state
    // Broadcast to other players
    this.broadcast('gameUpdate', {
      playerId,
      action,
      timestamp: Date.now()
    });
  }
}

io.on('connection', (socket) => {
  socket.on('joinRoom', (roomId, playerData) => {
    socket.join(roomId);
    // Initialize or retrieve game room
  });
  
  socket.on('playerAction', (action) => {
    // Process and broadcast action
  });
});
```

#### Client Synchronization
```javascript
// client-multiplayer.js
class MultiplayerClient {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.socket = io('wss://game-server.fly.dev');
    this.localActions = [];
    this.serverState = null;
  }
  
  connect(roomId, playerData) {
    this.socket.emit('joinRoom', roomId, playerData);
    
    this.socket.on('gameUpdate', (update) => {
      this.reconcileState(update);
    });
  }
  
  sendAction(action) {
    // Optimistic update
    this.game.applyAction(action);
    this.localActions.push(action);
    
    // Send to server
    this.socket.emit('playerAction', action);
  }
  
  reconcileState(serverUpdate) {
    // Rollback and replay local actions
    // Resolve conflicts
  }
}
```

### Game State Synchronization

#### Shared State
- Grid ownership
- Building placements  
- Land values
- Public infrastructure

#### Private State
- Player finances
- Voting allocations
- Private strategies

#### Conflict Resolution
1. **Last Write Wins**: For non-critical updates
2. **Operational Transformation**: For concurrent edits
3. **Server Authority**: For critical game rules

### Database Schema (PostgreSQL)

```sql
-- Game rooms
CREATE TABLE game_rooms (
  id UUID PRIMARY KEY,
  name VARCHAR(100),
  created_at TIMESTAMP,
  settings JSONB,
  state JSONB
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES game_rooms(id),
  name VARCHAR(50),
  color VARCHAR(7),
  emoji VARCHAR(10),
  cash INTEGER,
  joined_at TIMESTAMP
);

-- Game events (event sourcing)
CREATE TABLE game_events (
  id SERIAL PRIMARY KEY,
  room_id UUID REFERENCES game_rooms(id),
  player_id UUID REFERENCES players(id),
  event_type VARCHAR(50),
  payload JSONB,
  timestamp TIMESTAMP
);

-- Parcels
CREATE TABLE parcels (
  room_id UUID REFERENCES game_rooms(id),
  x INTEGER,
  y INTEGER,
  owner_id UUID REFERENCES players(id),
  building_id VARCHAR(100),
  land_value INTEGER,
  PRIMARY KEY (room_id, x, y)
);
```

## Implementation Roadmap

### Step 1: Deploy Single-Player (1 week)
- [ ] Set up Vercel project
- [ ] Configure GitHub integration
- [ ] Deploy current version
- [ ] Add analytics

### Step 2: Add User Accounts (1 week)
- [ ] Integrate Supabase Auth
- [ ] Save game states
- [ ] Player profiles
- [ ] Leaderboards

### Step 3: Turn-Based Multiplayer (2 weeks)
- [ ] Create game rooms
- [ ] Implement turn system
- [ ] Add notifications
- [ ] Test conflict resolution

### Step 4: Real-Time Features (2 weeks)
- [ ] Set up Fly.io WebSocket server
- [ ] Implement state synchronization
- [ ] Add real-time cursors
- [ ] Live building placement

### Step 5: Scale & Optimize (ongoing)
- [ ] Add Redis caching
- [ ] Implement sharding
- [ ] Optimize network traffic
- [ ] Add replay system

## Environment Variables

```env
# .env.production
NEXT_PUBLIC_WS_URL=wss://commons-game.fly.dev
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
```

## Deployment Commands

### Vercel
```bash
npm i -g vercel
vercel --prod
```

### Fly.io
```bash
fly launch
fly secrets set DATABASE_URL=...
fly deploy
```

## Cost Estimates

### MVP (Turn-based)
- Vercel: Free tier
- Supabase: Free tier
- **Total: $0/month**

### Small Scale (100 concurrent)
- Vercel: $20/month
- Fly.io: $25/month
- Database: $25/month
- **Total: ~$70/month**

### Medium Scale (1000 concurrent)
- Vercel: $20/month
- Fly.io: $100/month
- Database: $100/month
- Redis: $50/month
- **Total: ~$270/month**

## Security Considerations

1. **Input Validation**: Server-side validation for all actions
2. **Rate Limiting**: Prevent action spam
3. **Authentication**: JWT tokens for player identity
4. **Anti-Cheat**: Server authoritative game logic
5. **Data Encryption**: TLS for all connections

## Next Steps

1. Create a GitHub repo if not already done
2. Set up Vercel project for immediate deployment
3. Create Supabase project for backend
4. Implement basic save/load functionality
5. Add room creation for multiplayer