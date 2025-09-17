# Multiplayer Architecture Issues & Solutions

## Current Problem: Distributed State Calculation

Each client is independently calculating:
- City treasury amounts
- Population/residents 
- Vitality statistics
- Building efficiency
- Economic calculations
- Construction animations

This causes **desynchronization** where each player sees different numbers for supposedly shared state.

## Root Cause

The game was originally single-player with all calculations happening locally. The multiplayer layer was added on top, but only syncs **actions** (purchases, construction) not **calculated state**.

## Current Architecture (Problematic)

```
Client A calculates treasury → Shows $5000
Client B calculates treasury → Shows $4800  
Server doesn't know treasury → Can't arbitrate
```

## Symptoms

1. **Construction animations** - Fixed! Now syncs `constructionStartDay` and `constructionDays`
2. **Treasury amounts differ** - Each client calculates LVT collection independently
3. **Population counts differ** - Each client counts residents from buildings
4. **Vitality stats differ** - Each client calculates city metrics

## Solution Approaches

### Option 1: Authoritative Server (Best for competitive play)
- Server calculates all game state
- Clients are "dumb" displays
- Single source of truth
- Prevents cheating
- Higher server costs

### Option 2: Host-Client Model (Good compromise)
- One player is the "host" 
- Host's calculations are authoritative
- Other clients sync from host
- P2P-like but with authority

### Option 3: Deterministic Lockstep (Complex but efficient)
- All clients run same calculations
- Sync only inputs, not state
- Requires perfect determinism
- Used by RTS games

### Option 4: Eventual Consistency (Current approach, needs fixes)
- Clients calculate independently
- Sync critical state periodically
- Accept temporary inconsistencies
- Add reconciliation logic

## Immediate Fixes Needed

1. **Sync calculated values** in `syncGameState()`:
   - Treasury amount
   - Population count
   - City vitality scores
   - Building revenues

2. **Add authoritative fields** to server state:
   ```javascript
   gameState.globalStats = {
     treasury: 0,
     population: 0, 
     vitality: {},
     lastUpdated: Date.now()
   }
   ```

3. **Periodic reconciliation**:
   - Every 10 seconds, sync global stats
   - Use server/host values as truth
   - Smooth transitions to avoid jumps

## Code Patterns to Fix

### Before (each client calculates)
```javascript
// In game.js
calculateTreasury() {
    let total = 0;
    // Each client calculates independently
    this.grid.forEach(parcel => {
        total += parcel.ltv;
    });
    return total;
}
```

### After (sync from authority)
```javascript
// In game.js
calculateTreasury() {
    if (this.multiplayerManager?.isConnected) {
        // Use authoritative value
        return this.multiplayerManager.gameState.globalStats.treasury;
    }
    // Fallback to local calculation for single-player
    return this.localCalculateTreasury();
}
```

## Testing Multiplayer Sync

1. Open two browser windows
2. Both join same game
3. Check these values match:
   - City treasury amount
   - Population count
   - Building construction progress
   - Vitality scores

## Long-term Recommendation

Move toward **authoritative server** architecture:
- Prevents cheating
- Ensures consistency
- Enables features like leaderboards
- Worth the server costs for serious multiplayer