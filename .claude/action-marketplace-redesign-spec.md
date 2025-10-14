# Action Marketplace Redesign Specification

## Overview
Transform the action marketplace from an auction-based system to a simple instant-purchase listing system with price history tracking and visualization.

## Core Changes

### 1. Initial Actions
- **OLD**: Players receive monthly action refreshes (18 declining to 7)
- **NEW**: Players start with 100 actions (solo mode: 9999), no monthly refresh
- **Status**: ✅ IMPLEMENTED

### 2. Listing System
- **OLD**: Auction with reserve price, bids, buy-now price, time-based fees
- **NEW**: Simple instant purchase at fixed price
  - Each listing = exactly 1 action
  - Player sets a single price
  - Instant purchase (no bidding)
  - No fees (listing, cancellation, or transaction)
  - Actions are escrowed when listed

### 3. UI Changes
- **Move Actions Display**: Actions remaining moves from sidebar to top bar
- **Click to Open**: Clicking actions in top bar opens marketplace
- **Visual Feedback**: "Pop" animation when actions change

## Data Structures

### Listing Object
```javascript
{
    id: number,                    // Unique listing ID
    sellerId: string,              // Player ID of seller
    price: number,                 // Sale price in dollars
    quantity: 1,                   // Always 1 action per listing
    status: 'active'|'sold'|'cancelled',
    createdAt: timestamp,          // When listed
    soldAt: timestamp | null,      // When sold (null if not sold)
    soldTo: string | null          // Buyer ID (null if not sold)
}
```

### Price History Object
```javascript
{
    listings: [                    // All non-cancelled listings
        {timestamp, price}
    ],
    sales: [                       // All completed sales
        {timestamp, price}
    ]
}
```

### Marketplace State
```javascript
{
    listings: Map<id, Listing>,    // All listings
    priceHistory: {listings, sales},
    avgListingPrice: number,       // Avg of all active listings
    avgSalePrice: number           // Weighted avg by recency
}
```

## Business Rules

### Listing Creation
1. Player must have available actions (not escrowed/spent)
2. Actions are immediately escrowed (deducted from available)
3. Quantity is always 1 action
4. Any price > 0 is valid (no max price)
5. Players can create multiple listings simultaneously

### Listing Cancellation
1. Player can cancel their own active listing anytime
2. Action is returned immediately (no fee)
3. Listing status changed to 'cancelled'
4. Cancelled listings excluded from price averages

### Purchase Flow
1. Click "Buy" on any listing → instant purchase
2. Server validates:
   - Listing is still active
   - Buyer has sufficient funds
   - Buyer is not the seller
   - Listing hasn't been sold to someone else
3. Transaction is atomic (first-come-first-served if concurrent)
4. On success:
   - Funds transfer: buyer → seller
   - Action transfer: seller escrow → buyer
   - Listing status: 'active' → 'sold'
   - Record in price history
   - Show "pop" animation for buyer's action count

### Cannot Buy Own Listing
- UI hides "Buy" button on own listings
- Server validates and rejects if attempted

## Display & Sorting

### Marketplace Listings View
- **Sort Order**:
  1. Price (lowest to highest)
  2. Timestamp (earlier first) if same price
- **Visual Distinction**: Container border colored by seller's player color
- **Show All**: Both player's own listings and others in same list
- **Layout**: Grid or list showing:
  - Seller name badge (colored)
  - Price
  - Buy button (hidden for own listings)
  - Cancel button (shown only for own listings)

### Your Listings Tab
- Show only player's active listings
- Same sorting and display style
- Cancel button for each

## Price Statistics

### Average Listing Price
- **Calculation**: Simple average of all currently active listings
- **Updates**: Recalculated whenever listings change (create/cancel/purchase)
- **Display**: "Avg Listing: $X,XXX"

### Average Sale Price
- **Calculation**: Weighted by recency
  - Recent sales have more weight
  - Formula: `sum(price * recencyWeight) / sum(recencyWeight)`
  - Recency weight decreases exponentially with age
- **Updates**: Recalculated after each sale
- **Display**: "Avg Sale: $X,XXX"

### Edge Cases
- If no active listings: "Avg Listing: N/A"
- If no sales yet: "Avg Sale: No data yet"

## Price History Graph

### Graph Specifications
- **Library**: Chart.js (need to add if not present)
- **Location**: Above listings, full width of modal
- **Type**: Line chart with two lines
- **Size**: Full modal width, ~300px height

### X-Axis (Time)
- **Scale**: Game months (SEPT, OCT, NOV, etc.)
- **Range**: From game start to current month
- **Labels**: Month names

### Y-Axis (Price)
- **Scale**: Auto-scale to fit all data points
- **Format**: Dollar amounts ($XXX)
- **Grid**: Show horizontal grid lines

### Data Lines
1. **Average Listing Price Line**
   - Color: Blue (#2196F3)
   - Shows average listing price for each month
   - Calculated from all listings created that month

2. **Average Sale Price Line**
   - Color: Green (#4CAF50)
   - Shows average sale price for each month
   - Calculated from all sales completed that month
   - Weighted by recency within the month

### Graph Behavior
- **No Data**: Display "No data yet" text over empty graph area
- **Partial Data**:
  - If no sales yet, hide green line, show blue line only
  - If no listings yet, hide blue line
- **Updates**: Real-time update as new listings/sales occur
- **Tooltips**: Hover shows exact price and date

### Statistics Display with Graph
- Position stats above or beside graph
- Show:
  - Total Active Listings: X
  - Average Listing Price: $X,XXX
  - Average Sale Price: $X,XXX (or "No sales yet")
  - Total Sales This Game: X

## UI Layout

### Top Bar Changes
```
[Logo] [Actions: 47 ⚡] [Governance] [...other buttons...]
        ^^^^^^^^^
        Clickable - slides down marketplace tray
```

### Marketplace Slide-Down Tray Layout
**Design Pattern**: Same as Governance tray
- Slides down from top bar when clicked
- Covers canvas with dimmed background (no blur)
- Click outside/below tray to close
- Tray slides back up when closed

```
Top Bar (40px height)
─────────────────────────────────────────────
                ↓ Slides down from here
┌─────────────────────────────────────────────┐
│ Action Marketplace        Your Actions  [×] │  ← Header with stats
├─────────────────────────────────────────────┤
│ Active Listings: 5 | Avg List: $150        │  ← Stats row
│ Total Sales: 12   | Avg Sale: $145         │
│                                             │
│ ┌─────────────────────────────────────────┐│
│ │      [Price History Graph]              ││  ← Full width graph
│ │  Blue line: Avg listing price           ││
│ │  Green line: Avg sale price             ││
│ └─────────────────────────────────────────┘│
│                                             │
│ [Your Listings] [Marketplace]               │  ← Tabs
├─────────────────────────────────────────────┤
│ Marketplace Tab Content:                    │
│                                             │
│ ┌─────────────────┐  ┌──────────────────┐ │  ← Listings grid
│ │ 🟢 PlayerName    │  │ 🔵 You           │ │
│ │ Price: $120     │  │ Price: $180      │ │
│ │ [Buy Now]       │  │ [Cancel]         │ │
│ └─────────────────┘  └──────────────────┘ │
│                                             │
│ (More listings sorted by price...)          │
│                                             │
└─────────────────────────────────────────────┘
                ↑ Slides up when closed
─────────────────────────────────────────────
Dimmed background (click to close)
```

### CSS Implementation (similar to governance tray)
```css
.action-marketplace-tray {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    background: rgba(0, 0, 0, 0);
    z-index: 9999;  /* Below governance (10000) */
    pointer-events: none;
    transition: background 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-marketplace-tray.visible {
    background: rgba(0, 0, 0, 0.6);
    pointer-events: auto;
}

.action-marketplace-tray .tray-content {
    background: linear-gradient(145deg, #111111, #0a0a0a);
    border: 1px solid #2a2a2a;
    border-bottom-left-radius: 12px;
    border-bottom-right-radius: 12px;
    border-top: none;
    width: 90vw;
    max-width: 1400px;
    margin: 0 auto;
    margin-top: 40px;
    transform: translateY(calc(-100% - 40px));
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    max-height: calc(100vh - 60px);
    overflow: visible;
}

.action-marketplace-tray.visible .tray-content {
    transform: translateY(0);
}
```

### Header Display
- **Top-right of tray header**: Display current action count
  - Example: "Your Actions: 47"
  - Updates in real-time with purchases/sales
  - Same "pop" animation as top bar

### Animations
1. **Tray Open/Close**: Smooth slide down/up (same as governance)
2. **Action Count Change**: Scale "pop" effect (scale 1 → 1.3 → 1)
3. **Purchase Success**: Brief green highlight on action count
4. **Listing Created**: Brief highlight on "Your Listings" count
5. **Opening Animation**: requestAnimationFrame to ensure smooth animation every time

## Server Implementation Changes

### Transaction Types
- **Keep**: `ACTION_CREATE_LISTING` (simplified)
- **Remove**: `ACTION_BID`, `ACTION_END_EARLY`
- **Rename**: `ACTION_BUY_NOW` → `ACTION_PURCHASE` (instant purchase)
- **Keep**: `ACTION_CANCEL_LISTING`

### processCreateActionListing()
```javascript
- Validate: player has available actions
- Validate: quantity === 1
- Validate: price > 0
- Escrow action (deduct from player.actions.total)
- Create listing with status 'active'
- Add to marketplace.listings
- Record in priceHistory.listings
- Recalculate avgListingPrice
- Broadcast marketplace update
```

### processActionPurchase() (replaces processActionBuyNow)
```javascript
- Validate: listing exists and is active
- Validate: buyer !== seller
- Validate: buyer has sufficient funds
- Atomic transaction:
  - Transfer funds: buyer.cash -= price, seller.cash += price
  - Transfer action: buyer.actions.total += 1
  - Update listing: status = 'sold', soldAt = now, soldTo = buyerId
- Record in priceHistory.sales
- Recalculate avgSalePrice (with recency weighting)
- Broadcast marketplace update
- Return success
```

### processActionCancelListing()
```javascript
- Validate: listing exists and is active
- Validate: requester === seller
- Return action to seller (seller.actions.total += 1)
- Update listing: status = 'cancelled'
- Recalculate avgListingPrice (exclude cancelled)
- Broadcast marketplace update
```

### Price History Management
```javascript
// Add listing
priceHistory.listings.push({
    timestamp: Date.now(),
    gameMonth: getCurrentGameMonth(),
    price: listing.price
})

// Add sale
priceHistory.sales.push({
    timestamp: Date.now(),
    gameMonth: getCurrentGameMonth(),
    price: listing.price
})

// Calculate weighted avg sale price
calculateAvgSalePrice() {
    const now = Date.now()
    const recencyWindow = 7 * 24 * 60 * 60 * 1000 // 7 days

    let totalWeighted = 0
    let totalWeight = 0

    sales.forEach(sale => {
        const age = now - sale.timestamp
        const weight = Math.exp(-age / recencyWindow) // Exponential decay
        totalWeighted += sale.price * weight
        totalWeight += weight
    })

    return totalWeight > 0 ? totalWeighted / totalWeight : 0
}
```

### Marketplace State Sync
```javascript
// Broadcast to all clients
{
    type: 'MARKETPLACE_UPDATE',
    listings: Array.from(marketplace.listings.values())
        .filter(l => l.status === 'active')
        .sort((a, b) => {
            if (a.price !== b.price) return a.price - b.price
            return a.createdAt - b.createdAt
        }),
    stats: {
        avgListingPrice: calculateAvgListingPrice(),
        avgSalePrice: calculateAvgSalePrice(),
        totalSales: priceHistory.sales.length
    },
    priceHistory: {
        listings: aggregateByMonth(priceHistory.listings),
        sales: aggregateByMonth(priceHistory.sales)
    }
}
```

## Client Implementation Changes

### action-marketplace.js Refactor
- Remove bidding UI and logic
- Remove auction timer/countdown
- Simplify to instant purchase
- Add graph rendering with Chart.js
- Update listing display to show border colors

### Key Methods to Update
- `listActionsForSale()` - simplify to single action
- `createListingElement()` - remove bid buttons, add border color
- `syncMarketplaceData()` - handle new data structure
- `renderPriceGraph()` - NEW method to render chart
- `updateMarketplaceStats()` - NEW method to update stats

### index.html Changes
- Move action display to top bar
- Make it clickable
- Add graph container in modal
- Add Chart.js library (CDN or local)

## Testing Checklist

### Functionality
- [ ] Players start with 100 actions
- [ ] No monthly action refresh
- [ ] Can list 1 action at any price
- [ ] Actions escrowed when listed
- [ ] Cannot buy own listing
- [ ] Instant purchase works
- [ ] Funds transfer correctly
- [ ] Actions transfer correctly
- [ ] Can cancel listing and get action back
- [ ] Concurrent purchases handled correctly (first wins)

### Display
- [ ] Listings sorted by price then timestamp
- [ ] Border colors match seller colors
- [ ] Own listings show cancel button
- [ ] Others' listings show buy button
- [ ] Stats update in real-time
- [ ] Graph renders correctly
- [ ] Graph updates with new data
- [ ] "No data yet" shows when appropriate

### Edge Cases
- [ ] Handle simultaneous purchases
- [ ] Handle listing while purchase in progress
- [ ] Handle cancellation while purchase in progress
- [ ] Handle player with 0 actions
- [ ] Handle very high prices (display formatting)
- [ ] Handle many listings (performance)

## Migration Notes

### Data Migration (if needed)
- Existing auction listings should be cancelled/resolved before deploying
- Price history from old system can be discarded
- Player action counts already fixed at 100

### Rollout Plan
1. Deploy server changes
2. Restart server (clears old auction listings)
3. Deploy client changes
4. All players start fresh with new system

## Dependencies

### New Dependencies
- **Chart.js**: For price history graph
  - Add via CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
  - Or install: `npm install chart.js`

### Files to Modify
- `server-economic-engine.js` - Core marketplace logic
- `action-marketplace.js` - Client marketplace UI
- `action-manager.js` - Remove monthly refresh references
- `index.html` - Move actions to top bar, add graph container
- `style.css` - Style top bar actions, graph container

### Files to Review
- `server.js` - Marketplace WebSocket broadcasts
- `economic-client.js` - Marketplace data sync
- `ui-manager.js` - Action display updates

## Success Criteria

1. ✅ Players start with 100 actions, no monthly refresh
2. Simple listing creation (1 action, 1 price)
3. Instant purchase (no auction/bidding)
4. No fees anywhere
5. Price history tracked and graphed
6. Statistics calculated correctly
7. Smooth UX with animations
8. All edge cases handled

---

**Document Version**: 1.1
**Date**: 2025-10-14
**Status**: Ready for Implementation

## Changelog

### Version 1.1 (2025-10-14)
- **Updated UI Pattern**: Changed from centered modal to slide-down tray (matching governance pattern)
- Added CSS implementation details for tray
- Added header display specifications
- Added animation details for tray open/close
- Set z-index to 9999 (below governance at 10000)

### Version 1.0 (2025-10-14)
- Initial specification
- Core system design
- Data structures
- Business rules
- Server/client implementation plan
