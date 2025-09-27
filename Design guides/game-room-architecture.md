# Game Room Architecture - Board Game Design

## Overview
The Commons multiplayer follows a board game metaphor where players join a "table" (room) to play together.

## Architecture Components

### 1. Game Rooms/Tables
- Each room is an isolated game instance (like separate Monopoly boards)
- Rooms have unique IDs (e.g., "room-abc123")
- Each room maintains its own:
  - Economic engine instance
  - Building grid state
  - Player list (2-6 players)
  - Game clock/day counter
  - JEEFHH/CARENS state

### 2. Lobby/Waiting Room
- Players enter lobby first
- Can see available rooms or create new ones
- Quick Join: Auto-assigns to room needing players
- Create Room: Start new table with settings
- Join Room: Enter specific room by code

### 3. Room States
```
WAITING -> STARTING -> IN_PROGRESS -> COMPLETED
```
- WAITING: Gathering players (1-6)
- STARTING: All players ready, countdown
- IN_PROGRESS: Active gameplay
- COMPLETED: Game ended

### 4. Player States
- IN_LOBBY: Browsing rooms
- IN_ROOM_WAITING: In room, waiting for start
- IN_GAME: Actively playing
- SPECTATING: Watching active game

## Implementation Plan

### Phase 1: Room Management (Current Focus)
1. Add room concept to server
2. Isolate economic engines per room
3. Route WebSocket messages by room

### Phase 2: Lobby System
1. Create lobby UI in onboarding
2. Room creation/joining flow
3. Player ready system

### Phase 3: State Synchronization
1. Sync existing buildings when joining
2. Broadcast only within rooms
3. Handle player disconnection/reconnection

## Server Structure
```
server.js
├── rooms: Map<roomId, Room>
│   └── Room {
│       ├── id: string
│       ├── economicEngine: ServerEconomicEngine
│       ├── players: Map<playerId, Player>
│       ├── state: RoomState
│       └── createdAt: timestamp
│   }
└── playerRooms: Map<playerId, roomId>
```

## WebSocket Message Flow
```
Client -> Server: { type: 'JOIN_ROOM', roomId, playerId }
Server -> Room Clients: { type: 'PLAYER_JOINED', playerId, players }
Server -> New Client: { type: 'ROOM_STATE', buildings, players, gameTime }
```

## Benefits
1. **True Multiplayer**: Multiple concurrent games
2. **Scalable**: Each room is independent
3. **Social**: Players choose who to play with
4. **Persistent**: Rooms can be saved/resumed
5. **Fair**: Everyone starts together