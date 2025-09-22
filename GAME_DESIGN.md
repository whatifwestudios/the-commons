# The Commons - Core Game Design & Narrative

## The North Star: A Multiplayer City-Building Economy

### Core Vision
The Commons is a multiplayer city-building game where players compete to create personal wealth while inadvertently (or deliberately) contributing to or detracting from the collective city's vitality. Every building placement, every infrastructure decision, ripples through both economic and social systems, creating emergent neighborhoods and economic clusters that no single player fully controls.

## The Two-Layer System

### Layer 1: JEEFHH - The Economic Foundation

JEEFHH represents the fundamental needs that determine whether a city can function at all. Without these basics, there is no population, no economy, no game.

#### The Original Four (JEFH) - Population Triggers
These four must ALL exist in some quantity for population to arrive:

1. **Jobs (J)** - Where people work
   - Provided by: Commercial buildings, Industrial buildings, Civic buildings
   - Needed by: Adult residents
   - Without jobs: Adults can't move in or stay

2. **Energy (E)** - Powers the city
   - Provided by: Power plants (coal, solar, wind, nuclear)
   - Needed by: Almost every building
   - Without energy: Buildings can't operate

3. **Food (F)** - Sustains the population
   - Provided by: Farms, Farmers Markets, Grocery Stores, Restaurants
   - Needed by: All residents (children, adults, seniors)
   - Without food: Population can't survive

4. **Housing (H)** - Where people live
   - Provided by: Cottages, Apartments, Condos, Houses
   - Needed by: All population
   - Without housing: No residents can exist

**Critical Mechanic**: These four create a chicken-and-egg puzzle. Buildings need energy to operate. Jobs need workers. Workers need housing. Housing needs food nearby. It's only when all four exist that the system "ignites" and population begins flowing in.

#### The Extended Two (HH) - Performance Modifiers
These determine how well buildings with residents perform:

5. **Healthcare (H)** - Medical care
   - Provided by: Hospitals, Clinics, Medical Centers
   - Needed by: All residents (especially seniors)
   - Effect: Unhealthy residents → reduced building performance → lower revenue

6. **Education (second H)** - Learning and development
   - Provided by: Schools, Libraries, Universities
   - Needed by: Children primarily, some adults
   - Effect: Uneducated population → reduced building performance → lower revenue

### Layer 2: CARENS - The Livability Multipliers

CARENS represents quality of life factors that don't prevent a city from functioning but dramatically affect its desirability, land values, and economic potential. These create the texture and character of different neighborhoods.

Each CARENS factor works on a distance-based system - effects are strongest at the source and attenuate over distance (typically 2-3 tiles).

1. **Culture (C)**
   - Positive sources: Museums, Theaters, Concert Halls, Libraries, Parks
   - Negative sources: Industrial zones, Warehouses
   - Effect: High culture → increased land values, attracts educated workers

2. **Affordability (A)**
   - Positive sources: Public Housing, Subsidized Services
   - Negative sources: Luxury Developments, High-end Retail
   - Effect: Creates economic diversity, affects who can live where

3. **Resilience (R)**
   - Positive sources: Emergency Services, Hospitals, Community Centers
   - Negative sources: Hazardous Industries, Flood-prone areas
   - Effect: City's ability to handle crises, affects long-term stability

4. **Environment (E)**
   - Positive sources: Parks, Green Spaces, Clean Energy
   - Negative sources: Factories, Coal Plants, Heavy Traffic
   - Effect: Health impacts, attractiveness to families

5. **Noise (N)**
   - Negative sources: Airports, Highways, Nightclubs, Industrial
   - Positive (quiet) sources: Parks, Residential zones
   - Effect: Residential desirability, sleep quality → productivity

6. **Safety (S)**
   - Positive sources: Police Stations, Fire Stations, Street Lighting
   - Negative sources: Abandoned Buildings, Industrial Accidents
   - Effect: Population willingness to move in, business investment

## The Narrative Arc of Play

### Phase 1: The Pioneer Phase
A player claims their first parcel and builds a cottage. It sits empty - no residents yet. The JEEFHH bars show:
- Housing: +2 surplus (empty bedrooms)
- Energy: -5 deficit (cottage needs power)
- Jobs: Balanced at 0
- Food: Balanced at 0
- Education: Balanced at 0
- Healthcare: Balanced at 0

The cottage is built but unprofitable. It's potential without purpose.

### Phase 2: Building the Foundation
The player (or others in multiplayer) adds:
- A Coal Plant: +50 energy, +10 jobs
- A Farmers Market: +40 food, +10 jobs

Now we have surpluses in Jobs, Energy, and Food, but still that Housing surplus. This triggers the first population wave! Residents move into the cottage. Suddenly:
- Those residents need jobs (adults)
- They consume food (everyone)
- Children appear needing education
- Everyone needs healthcare
- The cottage starts generating revenue (but below potential)

### Phase 3: The Service Economy
Players realize their cottages are underperforming. Residents lack education and healthcare access. Someone builds:
- Elementary School: +100 education capacity, requires -5 jobs, -10 energy
- Small Clinic: +50 healthcare capacity, requires -5 jobs, -5 energy

Now the cottage's children can walk to school, families can visit the doctor. The cottage's revenue increases! But these services need workers, creating job demand, requiring more housing, creating a growth cycle.

### Phase 4: The Livability Competition
As the basic economy stabilizes, players compete on CARENS:
- Player A builds a park near their apartments (+Environment, +Culture)
- Player B responds with a police station (+Safety, -Noise)
- Player C creates an entertainment district (+Culture, -Noise, -Affordability)

Neighborhoods begin differentiating:
- The "Green Quarter" - high environment, attractive to families
- "Little Industry" - great jobs, poor environment, cheap housing
- "Culture Row" - trendy, expensive, attracts young professionals

### Phase 5: The Multiplayer Dance
In multiplayer, fascinating dynamics emerge:
- **Cooperation**: Players build complementary buildings (you build housing, I'll build the grocery store)
- **Competition**: Players compete for the best parcels, highest land values
- **Parasitism**: Players build housing near others' job centers, capturing the benefit
- **Speculation**: Players grab land near planned infrastructure, waiting for values to rise
- **Sabotage**: Industrial buildings placed to reduce neighboring land values

## Critical Game Mechanics

### Population Flow
1. **The JEFH Check**: Every game tick, the system checks if Jobs, Energy, Food, and Housing all exist in positive quantities
2. **Population Arrival**: If yes, population grows toward housing capacity
3. **Demand Generation**: Each resident generates demand based on age:
   - Children: High education, medium food, low healthcare
   - Adults: High jobs, high food, medium healthcare
   - Seniors: No jobs, medium food, high healthcare

### Building Performance Calculation
```
Base Revenue = Building's max potential revenue
Needs Met % = Average of (Education satisfaction, Healthcare satisfaction)
CARENS Multiplier = Weighted average of CARENS factors affecting this parcel
Final Revenue = Base Revenue × Needs Met % × CARENS Multiplier
```

### Connectivity Requirements
Residents need physical access (adjacency or roads) to:
- Their workplaces (jobs)
- Food sources (markets, stores)
- Schools (education)
- Medical facilities (healthcare)

Without connectivity, even if services exist in the city, residents can't access them, crushing building performance.

### Land Value Calculation
```
Base Land Value = Distance from city center
JEEFHH Accessibility = How many JEEFHH services are accessible from here
CARENS Score = Net positive/negative CARENS impacts on this parcel
Final Land Value = Base × JEEFHH Accessibility × CARENS Score
```

## Advanced Economic Systems

### Governance - The Public Commons
The city maintains a public surplus funded through Land Value Tax (LVT) and other revenue sources. This creates a meta-game of collective decision-making:

#### Public Surplus Sources
- **Land Value Tax (LVT)**: Based on most recent purchase/auction price
- **Transaction Fees**: Small percentage of all economic activity
- **Public Service Revenue**: If city-owned buildings generate profit

#### Governance Decisions
- **Funding Allocation**: Where should public money go?
  - Infrastructure (roads, utilities)
  - Public services (schools, hospitals)
  - Economic incentives (subsidies for needed buildings)
  - Emergency reserves (disaster response)
- **Tax Rate Setting**: Higher taxes = more public funds but slower growth
- **Public vs Private**: Should the city build that hospital or wait for private investment?

This creates fascinating dynamics where players must balance their role as private developers with their collective role as city stewards.

### The Action System - Pacing and Priority
Not all players can do everything at once. The Action System creates scarcity of decision-making:

#### Action Points
- Each player has limited actions per turn/day
- Actions might include:
  - Bidding on land
  - Constructing buildings
  - Upgrading infrastructure
  - Participating in governance votes
  - Trading resources

#### The Action Market
A revolutionary mechanic where players can trade actions:
- **Selling Actions**: "I'll skip my turn for $X"
- **Buying Priority**: "I'll pay $Y for an extra action"
- **Action Futures**: "I'll trade my next turn's action for resources now"

This creates a meta-economy where TIME itself becomes a tradable resource. Players must decide:
- Is it worth spending an action on that marginal improvement?
- Should I save actions for a big move?
- Can I profit by selling my actions to a player with urgent needs?

The Action Market establishes the true value of decisions - when actions are scarce, only the most profitable moves get made.

### The LVT Auction System - Creative Destruction
The Land Value Tax combined with competitive auctions creates constant pressure for optimization:

#### The LVT Spread Mechanism
1. **Taxed Value**: Set at the most recent purchase price (auction or initial sale)
2. **Calculated Land Value**: Dynamically updates based on:
   - JEEFHH accessibility
   - CARENS scores
   - Proximity to services
   - Economic activity
3. **The Spread**: Gap between taxed value and calculated value

When the spread gets large, it signals an underutilized parcel - the owner is paying low taxes on high-value land.

#### Hostile Takeover Auctions
When a parcel is underperforming:
1. **Challenge Initiation**: Any player can initiate an auction for any parcel
2. **Minimum Bid**: Must exceed current taxed value by X% (e.g., 20%)
3. **Current Owner Rights**: Can retain by matching the winning bid
4. **Tax Reset**: Winner's bid becomes new taxed value (higher tax burden)

#### Strategic Implications
- **Use It or Lose It**: Sitting on valuable land becomes expensive
- **Optimization Pressure**: Underperforming buildings invite takeover
- **Tax Planning**: Winning an auction means higher ongoing taxes
- **Defensive Building**: Develop land well to discourage challenges
- **Speculative Attacks**: Identify undervalued parcels, force auctions
- **Tax Arbitrage**: The spread between taxed and real value creates opportunities

Example Scenario:
- Player A owns prime downtown land, paying $100/turn LVT (bought for $1000)
- Land value has risen to $3000 due to surrounding development
- Player A has just a cottage there (underutilized)
- Player B initiates auction, bidding $2000
- If Player B wins, they now pay $200/turn LVT but control prime real estate
- Player A must decide: Match the bid (doubling their tax burden) or let it go?

This system ensures land naturally flows to those who can use it most productively, preventing speculation and encouraging active development.

### The Transport Layer - Connectivity Premium
Roads and transit aren't just connectivity - they're value multipliers:

#### Transport Infrastructure
- **Roads**: Basic connectivity, player-funded or public
- **Transit**: High-capacity, usually requires public funding
- **Proximity Effects**: Properties near transit gain value bonuses

#### Network Effects
- **Connectivity Clusters**: Well-connected areas attract more development
- **Transit-Oriented Development**: Buildings near transit perform better
- **Traffic Congestion**: Too many buildings without adequate transport = penalties

### Economic Feedback Loops

#### Positive Spirals
1. **Development Attracts Development**: Success breeds success
   - Good buildings → Higher land values → More tax revenue → Better infrastructure → More good buildings

2. **The Network Effect**: Connectivity creates value
   - More connections → More accessible → Higher demand → Higher values → More connections

3. **Specialization Rewards**: Focused districts perform better
   - Industrial cluster → Shared infrastructure → Lower costs → More industry

#### Negative Spirals (to avoid)
1. **The Decay Trap**: Neglect breeds neglect
   - Poor maintenance → Lower performance → Less revenue → Less maintenance

2. **The Isolation Penalty**: Disconnected areas wither
   - No roads → No access → No development → No reason to build roads

3. **The Monopoly Problem**: Single points of failure
   - One player controls all healthcare → They leave → City crisis

## Victory Conditions & Player Goals

### Individual Goals (Competitive)
- Maximize personal wealth (cash + property values)
- Control prime real estate
- Create the most profitable building clusters
- Corner specific markets (e.g., be the only healthcare provider)

### Collective Outcomes (Emergent)
- Total city population
- Overall city vitality (JEEFHH balance)
- Neighborhood diversity (different CARENS profiles)
- Economic resilience (multiple players providing key services)

### The Beautiful Paradox
Players pursuing individual wealth must provide city services. Even the greediest player must ensure their residents have food, energy, and jobs. This forced interdependence creates a living city where individual greed drives collective growth - Adam Smith's invisible hand made visible through game mechanics.

## Multiplayer Dynamics

### Competition Points
- **Land Auctions**: Players bid on parcels
- **Service Monopolies**: Controlling all hospitals/schools in an area
- **Wage Competition**: Jobs buildings competing for workers
- **Customer Competition**: Shops competing for residents

### Cooperation Opportunities
- **Infrastructure Sharing**: Roads benefit everyone
- **Service Exchanges**: "I'll build power if you build food"
- **Neighborhood Development**: Coordinated CARENS improvements
- **Crisis Response**: Working together during disasters

### Griefing Prevention
- Buildings can't be destroyed by others
- Negative CARENS effects attenuate with distance
- Minimum service requirements prevent total monopolies
- Public funding for essential services if privately underprovided

## The Emotional Journey

**Early Game**: Frustration and discovery - "Why won't people move in?" Leading to the "aha!" moment of understanding JEFH balance.

**Mid Game**: Optimization and competition - "How do I make my buildings more profitable?" Racing to provide services, fighting for good land.

**Late Game**: Emergent complexity - "How do we save downtown?" Collaborative city planning, managing negative externalities, creating sustainable systems.

**The Meta Game**: Understanding that your success depends on others' participation. The richest player in a dead city is still poor. This creates natural pressure toward city vitality even in competitive play.

## Implementation Priority

### Phase 1: Core JEEFHH System
- Population triggers based on JEFH existence
- Building supply/demand mechanics
- Basic performance calculation
- Simple connectivity (adjacency only)

### Phase 2: CARENS Layer
- Distance-based effects
- Livability multipliers
- Land value impacts
- Neighborhood emergence

### Phase 3: Multiplayer Economics
- Competitive bidding
- Shared resources
- Market dynamics
- Player interaction

### Phase 4: Polish & Balance
- Economic tuning
- Griefing prevention
- Victory conditions
- Quality of life features

## Conclusion

The Commons is not just a city builder - it's an economic laboratory where individual ambition and collective needs create endless emergent stories. Every building placement is both a personal investment and a civic contribution. Every player action ripples through interconnected systems, creating a living city that's greater than the sum of its parts.

The genius is in the forced interdependence: You can't get rich alone. You need other players to provide services, create jobs, build infrastructure. But you're still competing with them for wealth and status. This tension between cooperation and competition, between individual gain and collective good, is the beating heart of The Commons.

This is our north star: A game where building a city is never the goal - it's the beautiful accident that happens while players pursue their individual dreams.