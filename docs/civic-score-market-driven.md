# Market-Driven Civic Score: Emergent Common Good

## The Core Insight

Instead of **calculating** civic contribution, let the **market reveal** it through player behavior and city outcomes.

**Key principle**: If you're truly serving the common good, the city will **thrive because of you**.

---

## Option 1: City Performance Attribution (Simplest)

**Core Idea**: Your civic score = Your share of credit for the city's success

```javascript
// Room-wide metrics (already calculated!)
const cityAttractivenessMultiplier = jeefhhMultiplier * carensMultiplier;  // 0.24 to 2.24
const cityPopulation = totalResidents;

// Your contribution to city success
const yourLandValue = sumOfYourParcelValues;  // Market-determined
const totalLandValue = sumOfAllParcelValues;  // Market-determined
const yourShareOfCity = yourLandValue / totalLandValue;  // 0 to 1

// Your civic score = Your share × City performance × Scale factor
civicScore = yourShareOfCity * cityAttractivenessMultiplier * 100;
// Capped at 187.9
```

**Why this works:**
- ✅ **Zero new computation**: Uses existing multipliers
- ✅ **Market-driven**: Land values reflect actual contribution
- ✅ **Simple formula**: One line of math
- ✅ **Self-balancing**: Good city = higher scores for all
- ✅ **Competitive**: Better land = bigger share

**Behavioral dynamics:**
- Players want **high city multipliers** (cooperation)
- Players want **high land values** (competition)
- Tension creates interesting gameplay

**Problems:**
- ❌ Land value ≠ civic contribution (rich ≠ civic-minded)
- ❌ Could correlate too much with wealth score
- ❌ Doesn't distinguish public vs private buildings

---

## Option 2: Public Goods Premium (Market Signal)

**Core Idea**: The market pays a premium for land near public goods

```javascript
// Calculate "civic premium" on land values
// Public buildings (schools, parks, etc.) boost nearby land values
// Your civic score = How much value you ADD to others' land

let civicScore = 0;

for (const yourBuilding of yourBuildings) {
    if (isCivicBuilding(yourBuilding)) {
        // Find all nearby parcels (radius based on building's attenuation)
        const affectedParcels = getNearbyParcels(yourBuilding);

        for (const parcel of affectedParcels) {
            if (parcel.owner !== you) {  // Only count OTHER players' parcels
                // How much does your building boost their land value?
                const valueBoosted = calculateLivabilityBoost(yourBuilding, parcel);
                civicScore += valueBoosted;
            }
        }
    }
}

// Negative externalities (pollution, noise) REDUCE civic score
for (const yourBuilding of yourBuildings) {
    const negativeImpact = calculateNegativeExternalities(yourBuilding);
    civicScore -= negativeImpact;
}

// Scale and cap
civicScore = Math.min(civicScore / scaleFactor, 187.9);
```

**Why this works:**
- ✅ **Market-driven**: Based on actual land value impacts
- ✅ **Simple to compute**: Already calculating CARENS impacts
- ✅ **Rewards positive externalities**: Schools boost neighbors
- ✅ **Punishes negative externalities**: Pollution hurts neighbors
- ✅ **Can't game it**: Have to actually help others

**Behavioral dynamics:**
- Build schools → neighbors' land values rise → you get civic points
- Build coal plant → neighbors' land values fall → you lose civic points
- Strategic positioning matters (build parks where they help most)

**Implementation:**
```javascript
calculateCivicScore(playerId) {
    let civicScore = 0;

    // Iterate through your buildings
    for (const [locationKey, building] of this.gameState.buildings) {
        if (building.owner !== playerId) continue;

        const buildingDef = this.getBuildingDefinition(building.type);
        const [row, col] = locationKey.split(',').map(Number);

        // For each CARENS factor, calculate impact on nearby parcels
        for (const [factor, data] of Object.entries(buildingDef.livability)) {
            const impact = data.impact || 0;
            const attenuation = data.attenuation || 2;

            if (impact === 0) continue;

            // Find affected parcels within radius
            const radius = Math.max(1, attenuation);
            const affectedParcels = this.getParcelsInRadius(row, col, radius);

            for (const parcel of affectedParcels) {
                // Only count impact on OTHER players' parcels
                if (parcel.owner && parcel.owner !== playerId) {
                    const distance = this.getDistance(row, col, parcel.row, parcel.col);
                    const decayedImpact = impact / Math.pow(distance + 1, 1.5);

                    // Convert CARENS impact to land value impact
                    // Positive impacts (parks, schools) = positive civic score
                    // Negative impacts (pollution) = negative civic score
                    const landValueImpact = decayedImpact * parcel.baseValue * 0.01;
                    civicScore += landValueImpact;
                }
            }
        }
    }

    // Scale to 0-187.9 range
    const scaledScore = (civicScore / 100) * 187.9;  // Tune denominator
    return Math.max(0, Math.min(187.9, scaledScore));
}
```

---

## Option 3: Population Attraction Score (Emergent Quality)

**Core Idea**: Civic contribution = How many people WANT to live near your buildings

```javascript
// Already tracking: residents per building (residentsPerBuilding Map)
// Use this as a proxy for "civic quality"

// Your civic score = Residents attracted to YOUR buildings / Total residents
const yourResidents = sumOfResidentsInYourBuildings;
const totalResidents = cityPopulation;

civicScore = (yourResidents / totalResidents) * 187.9;
```

**Refinement - Weight by building type:**
```javascript
let civicScore = 0;

for (const yourBuilding of yourBuildings) {
    const residents = residentsInBuilding(yourBuilding);

    // Civic buildings get BONUS multiplier (more civic contribution)
    const isCivic = ['civic', 'education', 'recreation', 'healthcare'].includes(building.category);
    const multiplier = isCivic ? 3.0 : 1.0;  // Civic buildings worth 3x

    civicScore += residents * multiplier;
}

// Normalize to 0-187.9
civicScore = (civicScore / totalCityResidents) * 187.9;
```

**Why this works:**
- ✅ **Market-driven**: People vote with their feet
- ✅ **Minimal computation**: Just sum existing resident counts
- ✅ **Intuitive**: More people = more contribution
- ✅ **Weights civic buildings**: Bonus for schools, parks, etc.

**Problems:**
- ❌ Favors housing over non-housing civic buildings
- ❌ Could be gamed by building lots of cheap housing

---

## Option 4: JEEFHH Provision Score (Supply/Demand Market)

**Core Idea**: Civic score = How much you provide vs. how much you consume

```javascript
// For each JEEFHH resource, calculate your net contribution
const yourNetJobs = jobsYouProvide - jobsYouConsume;
const yourNetEnergy = energyYouProvide - energyYouConsume;
const yourNetEducation = educationYouProvide - educationYouConsume;
const yourNetFood = foodYouProvide - foodYouConsume;
const yourNetHousing = housingYouProvide - housingYouConsume;
const yourNetHealthcare = healthcareYouProvide - healthcareYouConsume;

// Sum positive contributions (ignore consumption - only reward provision)
const positiveContribution = (
    Math.max(0, yourNetJobs) * 5 +
    Math.max(0, yourNetEnergy) * 2 +
    Math.max(0, yourNetEducation) * 8 +
    Math.max(0, yourNetFood) * 3 +
    Math.max(0, yourNetHousing) * 6 +
    Math.max(0, yourNetHealthcare) * 7
);

// Scale to civic score
civicScore = Math.min(187.9, positiveContribution);
```

**Why this works:**
- ✅ **Market-based**: Supply/demand already tracked
- ✅ **Zero new computation**: Uses existing JEEFHH system
- ✅ **Rewards providers**: Schools, hospitals, farms
- ✅ **Intuitive**: "Give more than you take"

**Problems:**
- ❌ Doesn't account for quality/location
- ❌ Easy to game (build tons of low-quality farms)

---

## Option 5: Tax Efficiency Score (Georgist Spin)

**Core Idea**: Civic score = How much value you create PER DOLLAR of land value held

```javascript
// Your land value (what you OWN)
const yourLandValue = sumOfYourParcelValues;

// Your contribution to city (CARENS + JEEFHH)
const yourCityContribution = (
    yourPositiveCarensImpacts * 10 +     // Livability improvements
    yourJEEFHHProvision * 5              // Resource provision
);

// Efficiency ratio: Contribution per unit of land monopolized
const efficiency = yourCityContribution / yourLandValue;

// Civic score = Efficiency × Scale factor
civicScore = Math.min(187.9, efficiency * 1000);
```

**Why this works:**
- ✅ **Georgist theme**: Rewards productive land use
- ✅ **Anti-monopoly**: Hoarding land hurts your score
- ✅ **Market-driven**: Land value is market price
- ✅ **Encourages density**: Better to build up than sprawl

**Behavioral dynamics:**
- Small land holdings + high contribution = HIGH civic score
- Large land holdings + low contribution = LOW civic score
- Encourages "efficient" civic-minded development

---

## Recommendation: Hybrid of Options 2 + 5

**"Externality Score"**: Your civic score = Value you ADD to others - Value you TAKE from them

```javascript
calculateCivicScore(playerId) {
    const CIVIC_SCORE_CAP = 187.9;

    // PART 1: Positive externalities (you boost others' land values)
    let positiveExternalities = 0;

    for (const yourBuilding of yourBuildings) {
        const buildingDef = getBuildingDefinition(yourBuilding.type);
        const [row, col] = yourBuilding.location;

        // Calculate CARENS impacts on nearby parcels owned by OTHERS
        for (const [factor, data] of Object.entries(buildingDef.livability)) {
            const impact = data.impact || 0;
            if (impact <= 0) continue;  // Skip neutral/negative

            const attenuation = data.attenuation || 2;
            const affectedParcels = getParcelsInRadius(row, col, attenuation);

            for (const parcel of affectedParcels) {
                if (parcel.owner && parcel.owner !== playerId) {
                    const distance = getDistance(row, col, parcel.row, parcel.col);
                    const decayedImpact = impact / Math.pow(distance + 1, 1.5);
                    positiveExternalities += decayedImpact;
                }
            }
        }
    }

    // PART 2: Negative externalities (you hurt others' land values)
    let negativeExternalities = 0;

    for (const yourBuilding of yourBuildings) {
        const buildingDef = getBuildingDefinition(yourBuilding.type);
        const [row, col] = yourBuilding.location;

        // Calculate negative CARENS impacts
        for (const [factor, data] of Object.entries(buildingDef.livability)) {
            const impact = data.impact || 0;
            if (impact >= 0) continue;  // Skip neutral/positive

            const attenuation = data.attenuation || 2;
            const affectedParcels = getParcelsInRadius(row, col, attenuation);

            for (const parcel of affectedParcels) {
                if (parcel.owner && parcel.owner !== playerId) {
                    const distance = getDistance(row, col, parcel.row, parcel.col);
                    const decayedImpact = Math.abs(impact) / Math.pow(distance + 1, 1.5);
                    negativeExternalities += decayedImpact;
                }
            }
        }
    }

    // PART 3: Net externality score
    const netExternalities = positiveExternalities - negativeExternalities;

    // PART 4: Normalize by your land holdings (Georgist efficiency)
    const yourLandValue = calculateTotalLandValue(playerId);
    const efficiency = netExternalities / Math.max(1, yourLandValue / 100);

    // Scale to 0-187.9
    const civicScore = Math.min(CIVIC_SCORE_CAP, efficiency * 20);  // Tune multiplier

    return Math.max(0, civicScore);
}
```

**Why this is BEST:**

1. **Purely market-driven**:
   - Land values determined by players
   - CARENS impacts already calculated
   - No new metrics needed

2. **Minimal computation**:
   - Iterate buildings once
   - Sum CARENS impacts (already cached!)
   - One division operation
   - O(n) where n = your buildings × nearby parcels

3. **Can't game it**:
   - Must actually build civic buildings near others
   - Pollution hurts your score
   - Hoarding land reduces efficiency

4. **Creates emergent strategy**:
   - Build schools in dense areas (impact more parcels)
   - Avoid polluting buildings near others
   - Strategic positioning matters
   - Encourages "good neighbor" behavior

5. **Thematically perfect**:
   - Georgist: Efficient land use rewarded
   - Commons: You're judged by how you affect others
   - Market: Price signals reveal contribution

**Tuning levers:**
- Distance decay exponent (currently 1.5)
- Efficiency multiplier (currently 20)
- Land value normalization (currently /100)

---

## Computational Cost Analysis

**Current system (ratio-based):**
```
Operations: 2 divisions per player
Total: O(p) where p = players
```

**Proposed system (externality-based):**
```
For each player:
  - Iterate your buildings: O(b)
  - For each building, check nearby parcels: O(r²) where r = radius
  - Sum impacts: O(1)

Total: O(p × b × r²)

With typical values:
- p = 4 players
- b = 10 buildings per player
- r = 3 radius

Total ops: 4 × 10 × 9 = 360 simple additions
```

**Optimization - Cache CARENS impacts:**
```javascript
// Already cached in building-performance-cache.js!
// Just sum pre-calculated values

Total: O(p × b) = 40 operations worst case
```

**Result**: Negligible performance impact, especially with caching.

---

## Implementation Plan

### Phase 1: Simple Version (1 hour)
```javascript
// Just positive externalities, no efficiency normalization
civicScore = sumOfPositiveCarensImpactsOnOthers * scaleFactor;
```

Test and tune the scale factor.

### Phase 2: Add Negative Externalities (30 min)
```javascript
civicScore = (positiveExternalities - negativeExternalities) * scaleFactor;
```

Test that pollution/noise properly reduces score.

### Phase 3: Add Efficiency Normalization (30 min)
```javascript
const efficiency = netExternalities / yourLandValue;
civicScore = efficiency * scaleFactor;
```

Test that land hoarders get lower scores.

### Phase 4: Polish & UI (1 hour)
- Show breakdown in UI
- Add tooltips explaining civic score
- Playtest and balance

**Total effort: ~3 hours**

---

## Alternative Simple Version: "Good Neighbor Score"

If the above is still too complex, absolute simplest version:

```javascript
calculateCivicScore(playerId) {
    let score = 0;

    // For each civic building you own
    for (const building of yourBuildings) {
        if (isCivicCategory(building)) {  // civic, education, recreation, healthcare
            // Count nearby parcels owned by OTHERS
            const nearbyOtherParcels = countNearbyParcelsOwnedByOthers(building);
            score += nearbyOtherParcels * 10;  // 10 points per neighbor helped
        }
    }

    return Math.min(187.9, score);
}
```

**Computation**: Count operation only. Ultra-fast.

**Behavior**:
- Build schools near other players = high score
- Build schools in your own corner = low score
- Encourages mixed neighborhoods, not segregation

---

What do you think? The **Externality Score** (Hybrid 2+5) feels like the sweet spot to me - market-driven, computationally cheap, and strategically deep.

Want me to implement it?
