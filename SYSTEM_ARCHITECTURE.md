# The Commons - System Architecture Documentation

*Auto-generated analysis by Claude Code*

## Overview

The Commons is a multiplayer city-building simulation game with a sophisticated economic system, governance mechanics, and real-time collaborative gameplay. The system uses a client-server architecture with WebSocket communication for real-time synchronization.

## Core Components

### 1. Server-Side Architecture

#### **Main Server (server.js)**
- **Role**: HTTP server, WebSocket hub, game room orchestration
- **Key Responsibilities**:
  - Serves static files and main game interface
  - Manages WebSocket connections
  - Routes players to appropriate game rooms
  - Handles Beer Hall lobby functionality

#### **Room Manager (server-room-manager.js)**
- **Role**: Individual game room lifecycle management
- **Key Responsibilities**:
  - Creates and destroys game rooms
  - Manages player connections within rooms
  - Coordinates between economic engine and connected clients
  - Handles player disconnection/reconnection

#### **Economic Engine (server-economic-engine-v2.js)**
- **Role**: Authoritative game state and economic calculations
- **Key Responsibilities**:
  - All economic simulations and calculations
  - Building placement and management
  - Resource supply/demand modeling
  - Population dynamics
  - Governance system (voting, LVT rates, budget allocation)
  - Real-time broadcasting of state changes
  - Action marketplace transactions

### 2. Client-Side Architecture

#### **Main Game Client (game.js)**
- **Role**: Primary game interface and interaction handler
- **Key Responsibilities**:
  - Canvas-based isometric rendering
  - User input handling (clicks, keyboard, UI interactions)
  - Building placement interface
  - Layer switching (governance, transit, etc.)
  - Modal management (building info, governance, etc.)

#### **Economic Client (economic-client-v2.js)**
- **Role**: Server state synchronization and economic data management
- **Key Responsibilities**:
  - WebSocket communication with server
  - State synchronization and caching
  - Economic data processing and validation
  - Real-time updates distribution to UI components

#### **UI Manager (ui-manager.js)**
- **Role**: User interface coordination and data presentation
- **Key Responsibilities**:
  - Sidebar panel management
  - Financial overview updates
  - Player statistics display
  - Leaderboard and player list management
  - Budget allocation interface

#### **Governance System (governance-v3.js)**
- **Role**: Democratic governance interface and voting mechanics
- **Key Responsibilities**:
  - Voting point allocation
  - Budget category management
  - LVT (Land Value Tax) voting interface
  - Real-time governance updates
  - Player allocation visualization

### 3. Specialized Systems

#### **Rendering System (rendering-system-v2.js)**
- **Role**: Optimized graphics rendering and visual effects
- **Key Responsibilities**:
  - Isometric tile rendering
  - Building sprite management
  - Performance-optimized draw calls
  - Layer-based rendering (buildings, overlays, UI)

#### **Building System (building-system.js)**
- **Role**: Building-specific logic and interactions
- **Key Responsibilities**:
  - Building placement validation
  - Construction cost calculations
  - Building lifecycle management
  - Upgrade and maintenance systems

#### **Tooltip System (tooltip-system-v2.js)**
- **Role**: Context-sensitive information display
- **Key Responsibilities**:
  - Building information tooltips
  - CARENS (livability) impact display
  - Resource production/consumption details
  - Performance metrics visualization

#### **Action Marketplace (action-marketplace-v2.js)**
- **Role**: Player-to-player transaction system
- **Key Responsibilities**:
  - Action listing and bidding
  - Transaction processing
  - Market price tracking
  - Player action inventory management

### 4. Utility and Support Systems

#### **Context Menu System (context-menu-system.js)**
- Dynamic right-click context menus
- Building-specific action options
- Resource management shortcuts

#### **Beer Hall Lobby (beer-hall-lobby.js)**
- Pre-game lobby system
- Room creation and joining
- Player name and city configuration
- Solo vs multiplayer game modes

#### **Event Cleanup Manager (event-cleanup-manager.js)**
- Memory management and event listener cleanup
- Prevents memory leaks in long-running sessions

#### **CSV Uploader (csv-uploader.js)**
- Data import functionality
- Building data and economic parameter updates
- Real-time preview and validation

## Data Flow Architecture

### 1. WebSocket Communication Pattern

```
Client Action → Economic Client → WebSocket → Server → Room Manager → Economic Engine → Broadcast → All Clients
```

### 2. State Synchronization

The system follows a server-authoritative model:
- **Client**: Optimistic UI updates + server validation
- **Server**: Authoritative state + real-time broadcasting
- **Conflict Resolution**: Server state always wins

### 3. Real-Time Updates

Key update frequencies:
- **Economic Calculations**: Every game "month" (configurable interval)
- **Building Updates**: On placement, upgrade, or demolition
- **Governance Changes**: Immediate on vote changes
- **Player Actions**: Real-time on user interaction

## Technology Stack

### Backend
- **Node.js**: Server runtime
- **WebSocket**: Real-time communication
- **Express.js**: HTTP server (implied from server structure)

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **HTML5 Canvas**: Isometric rendering
- **CSS3**: UI styling and animations
- **WebSocket API**: Client-server communication

## Security Considerations

### Current Implementation
- **Input Validation**: Economic engine validates all client actions
- **State Authority**: Server maintains authoritative game state
- **Action Validation**: All player actions verified server-side

### Potential Vulnerabilities
- **Client Trust**: Some UI optimizations may trust client state
- **WebSocket Security**: No visible authentication/authorization layer
- **Data Exposure**: Full game state broadcast to all players

## Performance Characteristics

### Strengths
- **Server Authority**: Prevents cheating and ensures consistency
- **Real-Time Updates**: Responsive multiplayer experience
- **Modular Architecture**: Clean separation of concerns

### Potential Bottlenecks
- **Economic Calculations**: Complex formulas run every game cycle
- **State Broadcasting**: Full state sync to all clients
- **Canvas Rendering**: Single-threaded isometric rendering

## File Dependencies

### Server Dependencies
```
server.js
├── server-room-manager.js
├── server-economic-engine-v2.js
└── beer-hall-lobby.js (client-facing)
```

### Client Dependencies
```
index.html
├── game.js (main client)
├── economic-client-v2.js
├── ui-manager.js
├── governance-v3.js
├── rendering-system-v2.js
├── building-system.js
├── tooltip-system-v2.js
├── action-marketplace-v2.js
├── context-menu-system.js
└── various utilities
```

---

*Generated: $(date)*
*Next: WebSocket Message Flow Documentation*