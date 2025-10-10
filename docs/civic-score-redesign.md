# Civic Score Redesign: Measuring the Common Good

## Current System Analysis

### How It Works Now
**Civic Score Formula**: `(LVT Paid / Public Funding Received) × 10, capped at 187.9`

- If you pay taxes but use **no** public funds: **187.9 points** (maximum)
- If you pay taxes and use **some** public funds: **Variable** (ratio-based)
- If you pay **no** taxes: **0 points**

### The Problem
This creates a **perverse incentive**: Players maximize civic score by:
1. Getting rich (owning valuable land)
2. Paying high LVT taxes
3. **Avoiding all public infrastructure** (civic buildings, education, healthcare, etc.)

This is the **opposite** of pursuing the common good. A player who:
- Builds only private wealth-generating buildings
- Never contributes to schools, parks, or healthcare
- Hoards resources and avoids civic engagement

...gets the **highest civic score** simply by not "taking" from the treasury.

### What Should Civic Score Measure?

The civic score should reward players who:
- **Build public infrastructure** (schools, parks, hospitals, fire stations)
- **Improve livability** (CARENS scores: culture, environment, safety, etc.)
- **Provide public goods** (education, healthcare, jobs for all)
- **Reduce inequality** (affordable housing, UBI support, etc.)
- **Contribute to city resilience** (diverse economy, sustainability)

---

## Proposed Redesign Options

### Option 1: Public Goods Contribution Score (Simple & Intuitive)

**Core Idea**: Civic score = Value of public goods you've built + Room-wide benefits you've created

```javascript
civicScore = (
    publicBuildingsScore * 50 +      // 0-100 points
    livabilityContribution * 50 +    // 0-100 points
    communityBenefitsScore * 50      // 0-100 points
) capped at 187.9
```

**Components**:

1. **Public Buildings Score** (0-100):
   - Count civic, education, healthcare, recreation buildings owned by player
   - Weight by their benefit to the community (not just cost)
   - Examples:
     - Fire Station: 15 points (high safety impact)
     - Elementary School: 20 points (high education + culture)
     - Park: 10 points (environmental + recreation)
     - Public Pool: 12 points (healthcare + culture)

2. **Livability Contribution** (0-100):
   - Sum of **positive** CARENS impacts from player's buildings
   - Normalize to 0-100 scale based on room-wide impacts
   - Rewards buildings that improve culture, environment, safety
   - **Penalizes** pollution, noise, negative externalities

3. **Community Benefits Score** (0-100):
   - Jobs provided to other players' residents
   - Education slots filled by community children
   - Healthcare access for community seniors
   - Affordable housing units (housing with low rent)
   - Measured relative to community needs

**Why This Works**:
- ✅ **Simple to explain**: "Build good stuff for the community"
- ✅ **Intuitive**: Players know civic buildings = civic score
- ✅ **Strategic depth**: Which public goods? Where? For whom?
- ✅ **Can't game it**: You must actually build beneficial infrastructure
- ✅ **Scales with game**: More buildings = more opportunities

---

### Option 2: Common Good Multiplier (Elegant & Deep)

**Core Idea**: Civic score = How much your buildings benefit **others** vs. **yourself**

```javascript
const publicBenefit = sumOfPublicGoodsProvided(player);   // Education, healthcare, jobs for others
const privateBenefit = revenueGenerated(player);          // Income from your buildings
const commonGoodRatio = publicBenefit / (publicBenefit + privateBenefit);

civicScore = commonGoodRatio * CIVIC_SCORE_CAP;  // 0 to 187.9
```

**How It Scores**:
- **100% private** (all commercial/industrial): `civicScore = 0`
- **50/50 mix** (balanced economy): `civicScore = 93.95`
- **100% public** (all civic buildings): `civicScore = 187.9`

**Why This Works**:
- ✅ **Philosophically aligned**: Measures "common good" directly
- ✅ **Self-balancing**: Can't min-max by avoiding one thing
- ✅ **Encourages mixed development**: Best score comes from balance
- ✅ **Captures Henry George spirit**: Private gain vs. public benefit tradeoff

**Strategic Depth**:
- Do I build a **brewery** (revenue) or a **library** (civic points)?
- Can I build **both** and get wealthy + civic leader?
- Can I specialize in civic while trading for wealth?

---

### Option 3: Georgist Ideal Score (Thematic & Complex)

**Core Idea**: Civic score = How well you embody Georgist principles

```javascript
civicScore = (
    landUsedForPublicGood * 40 +        // % of owned parcels with civic buildings
    lvtPaymentConsistency * 30 +        // Did you pay fair share without delinquency?
    antiMonopolyScore * 40 +            // Avoiding land monopoly (spread vs. hoarded)
    equalOpportunityScore * 40 +        // Jobs, education, housing for all classes
    sustainabilityScore * 37.9          // Renewable vs. extractive economy
) capped at 187.9
```

**Why This Works**:
- ✅ **Thematically perfect**: Directly from Henry George's philosophy
- ✅ **Educational**: Players learn Georgist economics
- ✅ **Rich strategy**: Multiple paths to civic greatness
- ✅ **Anti-exploitation**: Punishes monopoly, rewards shared prosperity

**Why This Might Not**:
- ❌ **Complex to understand**: 5 sub-scores to track
- ❌ **Harder to communicate**: "What's antiMonopolyScore?"
- ❌ **May feel arbitrary**: Why these weights?

---

### Option 4: Hybrid - "Common Good Index" (Recommended)

**Core Idea**: Combine the best of Options 1 & 2 with clear, visible components

```javascript
// Three pillars of civic contribution (each 0-100)
const publicInfrastructure = calculatePublicBuildingsScore(player);
const livabilityImpact = calculateLivabilityContribution(player);
const sharedProsperity = calculateCommunityBenefitsScore(player);

// Average the three pillars
const civicIndex = (publicInfrastructure + livabilityImpact + sharedProsperity) / 3;

// Scale to civic score (0 to 187.9)
civicScore = (civicIndex / 100) * CIVIC_SCORE_CAP;
```

**The Three Pillars**:

#### 1. Public Infrastructure (0-100)
**"What civic buildings have you built?"**

Count and weight civic category buildings:
```javascript
const CIVIC_BUILDING_VALUES = {
    fire_station: 18,      // High safety impact
    library: 15,           // Education + culture
    park: 12,              // Environment + recreation
    public_pool: 14,       // Healthcare + culture
    elementary_school: 20, // Critical public good
    high_school: 22,       // High-tier public good
    // ...player can see these values in-game
};

publicInfrastructure = Math.min(100,
    sum(playerCivicBuildings.map(b => CIVIC_BUILDING_VALUES[b.id]))
);
```

#### 2. Livability Impact (0-100)
**"Have you made the city better or worse?"**

Sum CARENS impacts (positive - negative):
```javascript
livabilityImpact = normalizeToScale(
    sumPositiveCarens(player) - sumNegativeCarens(player),
    0, 100
);
```

Examples:
- **+** Parks improve environment (+6 per park)
- **+** Schools boost culture (+15 to +18)
- **-** Coal plants hurt environment (-40 penalty)
- **-** Industrial buildings create noise (-6 to -10)

#### 3. Shared Prosperity (0-100)
**"Are you helping others succeed?"**

Measure public goods provided to community:
```javascript
const jobsForOthers = jobsSlotsProvided - jobsFilledBySelf;
const educationForOthers = educationSlotsProvided - educationUsedBySelf;
const healthcareForOthers = healthcareSlotsProvided - healthcareUsedBySelf;

// Normalize based on community needs
sharedProsperity = normalizeToScale(
    jobsForOthers + educationForOthers + healthcareForOthers,
    0, totalCommunityNeeds
) * 100;
```

**Why This Works Best**:
- ✅ **Simple to understand**: Three clear categories
- ✅ **Visible in UI**: Show player's score in each pillar
- ✅ **Strategic diversity**: Multiple paths (specialize or balance?)
- ✅ **Can't easily game**: Need real civic contribution
- ✅ **Intuitive**: "Build civic stuff, make city nice, help others"
- ✅ **Scales with complexity**: More buildings = more nuance

**UI Display**:
```
Civic Score: 142.3 / 187.9
├─ Public Infrastructure: 85/100 ⭐⭐⭐⭐
├─ Livability Impact: 72/100 ⭐⭐⭐
└─ Shared Prosperity: 68/100 ⭐⭐⭐
```

---

## Detailed Implementation: Hybrid System

### Step 1: Track Additional Metrics

Add to player state:
```javascript
playerState.civicMetrics = {
    // Pillar 1: Public Infrastructure
    civicBuildingsOwned: [],
    civicBuildingScore: 0,

    // Pillar 2: Livability Impact
    positiveCarensContribution: 0,
    negativeCarensContribution: 0,
    netLivabilityImpact: 0,

    // Pillar 3: Shared Prosperity
    jobsProvidedToOthers: 0,
    educationProvidedToOthers: 0,
    healthcareProvidedToOthers: 0,
    affordableHousingUnits: 0,
    sharedProsperityScore: 0
};
```

### Step 2: Calculate Each Pillar

#### Pillar 1: Public Infrastructure Score
```javascript
calculatePublicInfrastructureScore(playerId) {
    const CIVIC_VALUES = {
        // Civic buildings
        fire_station: 18,
        library: 15,
        park: 12,
        public_pool: 14,

        // Education
        elementary_school: 20,
        high_school: 22,

        // Healthcare (if you add them)
        clinic: 12,
        hospital: 18,

        // Recreation
        skate_park: 10,
        community_center: 15,
    };

    let score = 0;

    // Iterate through player's buildings
    for (const [locationKey, building] of this.gameState.buildings) {
        if (building.owner === playerId) {
            const buildingDef = this.getBuildingDefinition(building.type);

            // Only count civic categories: civic, education, recreation, healthcare
            const isCivicCategory = ['civic', 'education', 'recreation', 'healthcare'].includes(buildingDef.category);

            if (isCivicCategory && CIVIC_VALUES[building.type]) {
                score += CIVIC_VALUES[building.type];
            }
        }
    }

    // Cap at 100
    return Math.min(100, score);
}
```

#### Pillar 2: Livability Impact Score
```javascript
calculateLivabilityImpactScore(playerId) {
    let positiveImpact = 0;
    let negativeImpact = 0;

    // Iterate through player's buildings
    for (const [locationKey, building] of this.gameState.buildings) {
        if (building.owner === playerId) {
            const buildingDef = this.getBuildingDefinition(building.type);
            const livability = buildingDef.livability;

            // Sum all CARENS impacts (culture, affordability, resilience, environment, noise, safety)
            for (const [factor, data] of Object.entries(livability)) {
                const impact = data.impact || 0;

                if (impact > 0) {
                    positiveImpact += impact;
                } else if (impact < 0) {
                    negativeImpact += Math.abs(impact);
                }
            }
        }
    }

    // Net impact (positive - negative)
    const netImpact = positiveImpact - negativeImpact;

    // Normalize to 0-100 scale
    // Assume typical range is -100 to +200 for active players
    const normalized = ((netImpact + 100) / 300) * 100;

    return Math.max(0, Math.min(100, normalized));
}
```

#### Pillar 3: Shared Prosperity Score
```javascript
calculateSharedProsperityScore(playerId) {
    let prosperityPoints = 0;

    // Count public goods provided to community
    let jobsForOthers = 0;
    let educationForOthers = 0;
    let healthcareForOthers = 0;
    let affordableHousing = 0;

    // Iterate through player's buildings
    for (const [locationKey, building] of this.gameState.buildings) {
        if (building.owner === playerId) {
            const buildingDef = this.getBuildingDefinition(building.type);
            const resources = buildingDef.resources;

            // Jobs provided (if jobs > 0 and not self-employed)
            if (resources.jobsProvided > 0) {
                // Check if jobs are filled by other players' residents
                const jobsUsedByOthers = this.getJobsUsedByOthers(playerId, locationKey);
                jobsForOthers += jobsUsedByOthers;
            }

            // Education provided (if education > 0)
            if (resources.educationProvided > 0) {
                const educationUsedByOthers = this.getEducationUsedByOthers(playerId, locationKey);
                educationForOthers += educationUsedByOthers;
            }

            // Healthcare provided (if healthcare > 0)
            if (resources.healthcareProvided > 0) {
                const healthcareUsedByOthers = this.getHealthcareUsedByOthers(playerId, locationKey);
                healthcareForOthers += healthcareUsedByOthers;
            }

            // Affordable housing (housing with low revenue - subsidized)
            if (resources.housingProvided > 0) {
                const revenue = buildingDef.economics?.maxRevenue || 0;
                const isAffordable = revenue < 15; // Threshold for "affordable"
                if (isAffordable) {
                    affordableHousing += resources.housingProvided;
                }
            }
        }
    }

    // Calculate prosperity points
    // Weight each category based on community needs
    const totalCommunityNeeds = this.calculateTotalCommunityNeeds();

    prosperityPoints = (
        (jobsForOthers / totalCommunityNeeds.jobs) * 25 +
        (educationForOthers / totalCommunityNeeds.education) * 25 +
        (healthcareForOthers / totalCommunityNeeds.healthcare) * 25 +
        (affordableHousing / totalCommunityNeeds.housing) * 25
    );

    return Math.min(100, prosperityPoints * 100);
}
```

### Step 3: Calculate Final Civic Score
```javascript
calculateCivicScore(playerId) {
    const CIVIC_SCORE_CAP = 187.9;

    // Calculate the three pillars (each 0-100)
    const publicInfrastructure = this.calculatePublicInfrastructureScore(playerId);
    const livabilityImpact = this.calculateLivabilityImpactScore(playerId);
    const sharedProsperity = this.calculateSharedProsperityScore(playerId);

    // Average the three pillars to get civic index (0-100)
    const civicIndex = (publicInfrastructure + livabilityImpact + sharedProsperity) / 3;

    // Scale to civic score (0 to 187.9)
    const civicScore = (civicIndex / 100) * CIVIC_SCORE_CAP;

    // Store breakdown for UI display
    const playerState = this.gameState.players.get(playerId);
    if (playerState) {
        playerState.civicMetrics = {
            publicInfrastructure,
            livabilityImpact,
            sharedProsperity,
            civicIndex,
            civicScore
        };
    }

    return civicScore;
}
```

---

## Benefits of This System

### For Gameplay
1. **Multiple viable strategies**:
   - Specialist: Focus on one pillar (e.g., build tons of parks)
   - Generalist: Balance all three pillars
   - Wealth + Civic: Be rich AND civic-minded

2. **Dynamic tension**:
   - Private revenue vs. public benefit
   - Short-term gain vs. long-term civic score
   - Competition for limited civic building slots

3. **Clearer feedback**:
   - UI shows exactly which pillar needs work
   - Players can see immediate impact of civic buildings
   - Encourages experimentation

### For Balance
1. **Can't easily game**: Requires actual civic contribution
2. **Scales with game length**: More time = more nuanced strategies
3. **Rewards cooperation**: Helping others = civic points
4. **Punishes negative externalities**: Pollution hurts civic score

### For Theme
1. **Aligns with "The Commons"**: Building for community good
2. **Teaches urban planning**: Real-world tradeoffs
3. **Embodies Georgist ideals**: Public benefit from land use
4. **Creates meaningful choices**: Every building decision matters

---

## Alternative Variations

### Variation A: Weighted Pillars (Tunable)
Instead of equal weight (33.3% each), adjust for game balance:
```javascript
civicIndex = (
    publicInfrastructure * 0.4 +    // 40% weight (most visible)
    livabilityImpact * 0.3 +        // 30% weight (room-wide effect)
    sharedProsperity * 0.3          // 30% weight (player interaction)
);
```

### Variation B: Add "Sustainability" Pillar
```javascript
// Fourth pillar: Environmental sustainability
const sustainability = (
    renewableEnergyRatio * 40 +           // % of energy from solar/wind
    greenSpacePercentage * 30 +           // % of land as parks/nature
    lowPollutionScore * 30                // Absence of coal/pollution
);

civicIndex = (publicInfrastructure + livabilityImpact + sharedProsperity + sustainability) / 4;
```

### Variation C: Relative Civic Score
Make civic score **competitive** like wealth score:
```javascript
// Civic score as % of total civic contribution
const totalCivicContribution = sum(allPlayers.map(p => p.civicIndex));
civicScore = (playerCivicIndex / totalCivicContribution) * CIVIC_SCORE_CAP;
```

**Pros**: More competitive, zero-sum civic rivalry
**Cons**: Less intuitive, can't "win" civic by doing good alone

---

## Recommendation

**Implement Option 4: Hybrid "Common Good Index"** with these refinements:

1. **Three clear pillars**: Public Infrastructure, Livability Impact, Shared Prosperity
2. **Equal weighting**: 33.3% each (simple, balanced)
3. **Visible UI breakdown**: Show players their score in each pillar
4. **Absolute scoring**: Not relative to other players (encourages all to do good)
5. **Cap at 187.9**: Keep the thematic reference to Henry George

**Why this wins**:
- Simple enough to explain in 30 seconds
- Deep enough for 2+ hours of strategic play
- Can't be easily gamed or min-maxed
- Encourages actual civic contribution
- Aligns with game's theme and values

---

## Next Steps

1. **Validate the formulas**: Test with sample buildings to ensure balanced scoring
2. **Create UI mockups**: Show how civic breakdown appears in-game
3. **Implement tracking**: Add civicMetrics to player state
4. **Build calculator functions**: Start with Pillar 1 (easiest to implement)
5. **Playtest**: Does it feel good? Is it too easy/hard to max out?
6. **Tune weights**: Adjust CIVIC_VALUES and formulas based on playtesting

Let me know which direction resonates with you!
