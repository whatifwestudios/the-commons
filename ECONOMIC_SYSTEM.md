# The Commons Economic System V2 Documentation

## Overview

The Commons uses a server-authoritative economic system with real-time multiplayer synchronization. The V2 architecture replaces client-side calculations with server-managed state, ensuring consistency across all players.

## Core Architecture

### 1. Server-Authoritative Design

**Key Files:**
- `server-economic-engine-v2.js` - Main economic calculations and state management
- `economic-client-v2.js` - Client-side interface for server communication
- `server-room-manager.js` - Multiplayer room management with isolated economic states

**Data Flow:**
```
Client Action → WebSocket → Server Economic Engine → State Update → Broadcast to All Clients
```

### 2. Economic Metrics: JEEFHH & CARENS

#### JEEFHH (Jobs, Energy, Education, Food, Housing, Healthcare)
- **Supply vs Demand**: Each category tracks building supply and population demand
- **Multipliers**: Dynamic modifiers based on supply/demand ratios
- **Revenue Impact**: Buildings with unmet needs generate reduced revenue

#### CARENS (Culture, Affordability, Resilience, Environment, Noise, Safety)
- **Quality of Life**: Affects city attractiveness and growth
- **Land Value Impact**: Higher CARENS scores increase property values
- **Governance Integration**: Players vote on policies affecting CARENS metrics

### 3. Dynamic Pricing System

#### Land Value Calculation
```javascript
// Distance-based base pricing with neighbor effects
basePrice = 200 - (distanceFromCenter / maxDistance) * 100;
finalPrice = basePrice + neighborInfluence + buildingValueBonus;
```

#### Building Economics
- **Construction Costs**: Fixed base costs with governance discounts
- **Monthly Revenue**: Based on building type, accessibility, and efficiency
- **Maintenance Costs**: Percentage of building value, varies by age/condition
- **Land Value Tax (LVT)**: Monthly tax based on land values, separate from building value

## Key Components

### 1. Server Economic Engine (`server-economic-engine-v2.js`)

**Primary Responsibilities:**
- Maintain authoritative game state
- Calculate JEEFHH/CARENS metrics
- Process building construction/transactions
- Manage game time progression
- Handle player balances and cashflow

**Key Methods:**
- `updateGameTime()` - Advances game time and triggers economic updates
- `calculateJEEFHH()` - Computes supply/demand for all categories
- `processConstruction()` - Handles building placement and costs
- `broadcastGameState()` - Sends updates to all connected clients

### 2. Economic Client (`economic-client-v2.js`)

**Primary Responsibilities:**
- WebSocket communication with server
- Local caching of economic data for UI
- Transaction initiation (buy parcels, construct buildings)
- Real-time state synchronization

**Key Methods:**
- `purchaseParcel()` - Initiates land purchase transaction
- `constructBuilding()` - Sends building construction request
- `onUpdate()` - Processes incoming server state updates
- `getParcelPrice()` - Returns cached or calculated parcel prices

### 3. Governance System Integration

**Treasury Management:**
- Players vote on budget allocations using governance points
- Public funding can subsidize building construction costs
- LVT revenue flows to city treasury for collective use

**Policy Effects:**
- Education funding affects school efficiency
- Infrastructure spending impacts transport accessibility
- Environmental policies influence CARENS scores

### 4. Building System Integration

**Construction Pipeline:**
```
Client Request → Server Validation → Economic Impact → State Broadcast → UI Update
```

**Economic Validation:**
- Player affordability checks using server balance
- Population requirements verification
- Resource availability confirmation
- Governance discount application

## Data Structures

### Game State
```javascript
gameState = {
    gameTime: 1.0,           // Game days since start
    playerBalances: Map(),   // Player ID → current cash
    buildings: Map(),        // Location → building data
    parcels: Map(),          // Grid coordinates → parcel info
    jeefhh: {               // Economic metrics
        jobs: { supply: 100, demand: 80, multiplier: 1.2 }
        // ... other categories
    },
    carens: {               // Quality of life metrics
        culture: 0.6, affordability: 0.8
        // ... other factors
    }
}
```

### WebSocket Messages
```javascript
// Server → Client: Economic Update
{
    type: 'ECONOMIC_UPDATE',
    gameTime: 1.5,
    playerBalance: 5500,
    jeefhh: { /* metrics */ },
    carens: { /* metrics */ }
}

// Client → Server: Construction Request
{
    type: 'CONSTRUCT_BUILDING',
    buildingId: 'basic_house',
    row: 3, col: 4,
    playerId: 'player123'
}
```

## Performance Optimizations

### 1. Caching Strategy
- **Client-side**: Cache building performance, land values, and UI data
- **Server-side**: Dirty region tracking for selective recalculation
- **Economic cache**: Store computed building stats to avoid repeated calculations

### 2. Update Frequency
- **Game Time**: Updates every 30 seconds (real-time)
- **Economic Metrics**: Recalculated when buildings change
- **UI Updates**: Throttled to 60fps for smooth user experience

### 3. WebSocket Optimization
- **State Diffs**: Only send changed data, not full state
- **Player Filtering**: Each player receives relevant subset of global state
- **Compression**: Economic data compressed before transmission

## Common Integration Patterns

### 1. Adding New Building Types
1. Define building in CSV with economic properties
2. Add JEEFHH supply/demand values
3. Implement special economic effects in `calculateBuildingEconomics()`
4. Test with server validation and client UI

### 2. Creating New Economic Effects
1. Add calculation logic to `server-economic-engine-v2.js`
2. Update client cache structure in `economic-client-v2.js`
3. Implement UI display in relevant components
4. Add WebSocket message handling for real-time updates

### 3. Multiplayer Considerations
- Each room has isolated economic state
- Player actions only affect their current room
- State synchronization ensures all players see same economic data
- Real-time updates maintain multiplayer consistency

## Debugging & Monitoring

### Server Logs
- Economic calculation timing and results
- Player transaction validation and processing
- WebSocket connection and message flow
- Game time progression and state changes

### Client Debug Tools
- Console logging of server updates and local cache
- UI elements showing current economic metrics
- Performance monitoring for update frequency
- WebSocket connection status indicators

## Migration Notes (V1 → V2)

**Breaking Changes:**
- Client-side economic calculations removed
- All state management moved to server
- WebSocket required for real-time functionality
- Player balances now server-authoritative

**Compatibility:**
- Building definitions remain compatible
- UI components adapted for server data
- Economic formulas preserved but moved server-side
- Multiplayer functionality added without breaking single-player

---

*This documentation covers the core economic system architecture. For implementation details, see the respective source files and inline comments.*