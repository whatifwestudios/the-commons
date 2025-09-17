# Remaining Multiplayer Issues - Local vs City-wide Calculations

## ✅ Already Fixed
1. **Population Calculation** - Now counts ALL buildings in city
2. **LVT Collection** - Now collects from ALL owned parcels
3. **Construction Sync** - All players see construction animations
4. **Context Menus** - Work for multiplayer ownership
5. **Tooltips** - Show correct ownership info
6. **Vitality Calculation** - Already counts all buildings correctly

## ❌ Still Broken - Only Counting Local Player

### 1. Daily Cashflow Calculation (CRITICAL)
**Location**: `game.js:2093-2113`
```javascript
if (this.isCurrentPlayer(parcel.owner)) {
    // Only calculating revenue/costs for current player's buildings
}
```
**Impact**: Each player sees different DCF numbers. Should show PERSONAL cashflow only.

### 2. Building Economics Cache
**Location**: `game.js:2113-2119`
```javascript
if (this.isCurrentPlayer(parcel.owner)) {
    const stats = this.calculateBuildingEconomics(parcel, row, col);
}
```
**Impact**: Economic calculations only cached for own buildings.

### 3. Wealth Calculation
**Location**: `game.js:2677, 2814`
```javascript
if (parcel && this.isCurrentPlayer(parcel.owner)) {
    ownedParcels++;
}
```
**Impact**: Only counts player's own parcels for wealth. This is CORRECT for personal wealth.

### 4. Building Repair Economics
**Location**: `game.js:3131`
```javascript
if (!parcel || !parcel.building || !this.isCurrentPlayer(parcel.owner)) {
    console.log('Cannot get data for non-player buildings');
}
```
**Impact**: Can't view economics of other players' buildings. May be intentional.

### 5. Auction System
**Location**: `game.js:1006`
Shows different UI for sellers vs buyers - this is CORRECT behavior.

### 6. Building Requirements Check
**Location**: `game.js:5212`
```javascript
if (!this.isCurrentPlayer(this.grid[row][col].owner)) {
    reasons.push('You do not own this parcel');
}
```
**Impact**: Correctly prevents building on others' land - CORRECT behavior.

## Classification of Calculations

### Should be PERSONAL (current player only) ✅
- Personal wealth/net worth
- Personal cashflow (DCF)
- Building permissions (can only build on own land)
- Repair permissions (can only repair own buildings)
- Auction UI (different for buyers/sellers)

### Should be CITY-WIDE (all players) ❌→✅
- Population (FIXED)
- City treasury/LVT collection (FIXED)
- City vitality scores (ALREADY CORRECT)
- Energy supply/demand (ALREADY CORRECT)
- Food supply/demand (ALREADY CORRECT)

### Ambiguous - Need Design Decision
1. **Cashflow Display**: Should it show:
   - Only YOUR revenue/costs? (Current, but broken)
   - Total city revenue/costs? (Would be confusing)
   - Both with clear labels?

2. **Data Insights**: Should players see:
   - Economics of their own buildings only?
   - All buildings in city?
   - Own buildings + summary of others?

## Recommended Fixes

### Priority 1: Fix DCF Display
The Daily Cashflow should show ONLY the current player's revenue and costs, but it needs to calculate correctly in multiplayer. Currently it's trying to be personal but the calculation is broken.

### Priority 2: Clarify UI Labels
- "City Population: X" (all players' residents)
- "Your Revenue: $X/day" (just your buildings)
- "City Treasury: $X" (shared funds)
- "Your Cash: $X" (personal funds)

### Priority 3: Add City-wide Statistics Panel
Show aggregate city statistics:
- Total buildings by type
- Total population housed
- Total jobs created
- Total energy produced/consumed
- Number of active players

## Testing Checklist
With 2+ players connected:
- [ ] Each player sees same population count
- [ ] Each player sees same treasury amount
- [ ] Each player sees own DCF correctly
- [ ] Construction animations sync
- [ ] Vitality scores match
- [ ] Can only build on own parcels
- [ ] Can only repair own buildings