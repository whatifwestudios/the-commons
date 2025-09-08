# The Commons - Competitive Multiplayer Design

## 🎯 Core Game Loop (1 Hour = 1 Year)

**Objective**: Accumulate the most personal wealth while contributing to overall city land value

### Game Flow
```
GAME START (12 players join city)
    ↓
LIVE DEVELOPMENT (60 minutes real-time)
    ↓
FINAL SCORING (wealth + city ranking bonus)
```

## 🏆 Victory Conditions

### Individual Victory (Primary)
- **Personal Wealth** = Cash + Property Values + Building Equity
- Winner has highest personal wealth after 1 hour

### City Ranking Bonus (Secondary)
- Cities compete on global leaderboard for:
  - Total land value
  - Average happiness
  - Economic efficiency
- Top 25% cities give all players +20% wealth bonus
- Bottom 25% cities give all players -10% wealth penalty

## ⚖️ Tension Mechanics

### 1. **Land Value Paradox**
- Higher city land value = better city ranking bonus
- BUT higher land values = more expensive land for competitors
- Players must balance personal acquisition vs city improvement

### 2. **Resident Happiness vs Profit**
```javascript
// Happiness affects city-wide multipliers
cityHappiness = (
  housingAffordability * 0.3 +
  jobAvailability * 0.2 +
  publicServicesQuality * 0.2 +
  environmentalQuality * 0.2 +
  transportationAccess * 0.1
)

// Happy cities attract more residents (more rent, more land value)
// Unhappy cities lose residents (less rent, land values stagnate)
```

### 3. **Public vs Private Investment**
- **Public spending** (voted on by all players):
  - Increases city happiness
  - Boosts overall land values
  - Benefits everyone equally
  
- **Private development**:
  - Increases personal wealth directly
  - May harm city metrics if not balanced
  - Creates competitive advantages

### 4. **Resource Scarcity**
- Limited prime locations (city center, waterfront, etc.)
- Finite infrastructure budget per month
- Competition for building permits

## 👥 Player Dynamics

### Cooperation Incentives
- **Governance Voting**: All players vote on city budget
- **Infrastructure**: Roads, utilities benefit everyone
- **City Reputation**: Attracts more residents = higher land values for all

### Competition Mechanics
- **Land Auctions**: Players bid against each other for prime parcels
- **Building Permits**: Limited number issued per month
- **Labor Market**: Building attracts workers, reducing labor for others
- **Market Manipulation**: Strategic zoning changes

## 🎲 Live Events (Every 5-10 minutes)

### Economic Events
- **Market Boom/Bust**: Affects specific building types
- **Interest Rate Changes**: Impacts development costs
- **Population Migration**: New residents arrive seeking specific amenities

### Crisis Events
- **Infrastructure Failure**: Requires collective response
- **Natural Disasters**: Players vote on recovery spending
- **Economic Recession**: Reduces all income temporarily

### Opportunity Events
- **Government Grants**: Available for specific development types
- **Corporate Headquarters**: Major employer seeks location
- **Cultural Events**: Temporary happiness and land value boosts

## 🏛️ Governance System (Enhanced)

### Monthly Budget Allocation (All players vote)
```javascript
const budgetCategories = {
  infrastructure: 0,    // Roads, utilities
  education: 0,         // Schools, libraries  
  healthcare: 0,        // Hospitals, clinics
  environment: 0,       // Parks, pollution control
  safety: 0,           // Police, fire services
  development: 0        // Business incentives, zoning
}
```

### Voting Power
- Base: 2 votes per player per month
- Bonus votes earned through:
  - Contributing to city happiness
  - Paying above-average taxes
  - Completing city objectives

### Policy Votes (Quarterly)
- **Zoning Density**: Allow high-rises vs preserve character
- **Tax Policy**: Higher LVT vs development incentives  
- **Environmental Standards**: Strict regulations vs business-friendly
- **Housing Policy**: Rent control vs market-rate development

## 💰 Enhanced Economics

### Personal Wealth Calculation
```javascript
personalWealth = {
  cash: currentCash,
  propertyValue: ownedParcels.reduce((sum, parcel) => 
    sum + parcel.landValue + parcel.buildingValue, 0),
  businessEquity: buildings.filter(b => b.owner === playerId)
    .reduce((sum, b) => sum + b.capitalValue, 0),
  investments: portfolioValue // stocks, bonds, city development funds
}
```

### Revenue Streams
1. **Rental Income**: From owned residential/commercial buildings
2. **Business Profits**: From owned industrial/commercial operations
3. **Capital Gains**: From property value appreciation
4. **Dividends**: From city development fund investments
5. **Speculation**: Buying low, selling high during market cycles

### Costs & Risks
1. **Land Value Tax**: Based on land value, not improvements
2. **Building Maintenance**: Scales with building age/complexity
3. **Interest Payments**: On development loans
4. **Insurance**: Against disasters and economic downturns
5. **Opportunity Costs**: Missed developments due to resource limits

## 🏙️ City Scoring Metrics

### Land Value Index (40% weight)
- Average land value per parcel
- Growth rate over game duration
- Distribution equality (Gini coefficient)

### Quality of Life Index (30% weight)
```javascript
qualityOfLife = {
  housing: housingAffordabilityScore,
  employment: jobsPerCapita,
  environment: airQuality + greenSpace,
  mobility: transportationAccess,
  services: educationLevel + healthcareAccess
}
```

### Economic Efficiency (20% weight)
- GDP per capita
- Tax revenue sustainability
- Infrastructure utilization rates

### Innovation Index (10% weight)
- High-tech businesses attracted
- Educational institutions developed
- Cultural amenities created

## 🎮 Real-Time Multiplayer Features

### Live Collaboration
- **Shared Construction**: Players can co-invest in major projects
- **Real-time Auctions**: Live bidding with countdown timers
- **Chat Integration**: City-wide chat + private messaging
- **Live Cursors**: See other players exploring the city

### Information Transparency
- **Public Data**: Land values, zoning, public infrastructure
- **Semi-Public**: Building permits applied for, pending votes
- **Private Data**: Personal wealth, private development plans

### Synchronization Events
- **Market Updates**: Every 2 minutes, land values recalculated
- **Revenue Collection**: Every 5 minutes, rent and business income
- **Governance Phases**: Monthly voting periods
- **Crisis Response**: Immediate voting when events occur

## 🚀 Technical Architecture

### Real-Time State Management
```javascript
// Game state synchronized across all clients
const cityState = {
  gameTimer: { remaining: 3600, paused: false },
  players: Map<playerId, PlayerState>,
  parcels: Array<ParcelState>,
  governance: GovernanceState,
  events: Array<ActiveEvent>,
  market: MarketConditions
}

// Optimistic updates with server reconciliation
class MultiplayerSync {
  applyAction(action) {
    // 1. Apply immediately (optimistic)
    this.game.applyLocalAction(action);
    
    // 2. Send to server
    this.socket.emit('playerAction', action);
    
    // 3. Server validates and broadcasts
    // 4. Reconcile if conflicts arise
  }
}
```

### Conflict Resolution
- **Server Authority**: For auctions, governance votes, game rules
- **Last Write Wins**: For non-critical UI states
- **Operational Transform**: For collaborative construction projects

## 🎯 Starting Conditions

### Player Spawn
- Each player starts with $10,000 cash
- Random spawn location (but balanced for fairness)
- 2 voting points for first governance cycle
- Access to basic building types

### City Initialization  
- 14x14 grid with varied terrain
- Some parcels start with basic infrastructure
- Central civic buildings (city hall, basic utilities)
- Transportation network skeleton

### Victory Balancing
- Early advantage mechanics (land rush bonus)
- Mid-game catch-up mechanics (crisis opportunities)
- Late-game scaling (compound interest, speculation)

This creates a fascinating dynamic where players must constantly balance individual gain against collective city success, with the added pressure of inter-city competition and a ticking clock!