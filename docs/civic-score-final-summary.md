# Civic Score System - Final Implementation

## Formula

```javascript
civicScore = sum(impact / sqrt(attenuation)) for all CARENS dimensions
```

**Why this works:**
- **Low attenuation (1-3)** = Wide city impact = Higher civic contribution
  - Park environment: 50 / √1 = 50.0 points
- **High attenuation (10+)** = Localized impact = Lower civic contribution
  - Coal plant environment: -80 / √40 = -12.6 points

## Civic Score Rankings

### Top Tier (100+): Game-Changers
1. **Solar Farm: 122.9** - Clean energy champion
2. **Park: 101.5** - Environmental powerhouse

### High Civic (60-90): Strong Contributors
3. **Cottage: 83.8** - Surprisingly civic! (affordable housing)
4. **Fire Station: 66.9** - Safety + resilience leader
5. **Farmers Market: 65.1** - Local food + environment

### Mid Civic (40-60): Solid Contributors
6. **High School: 51.6** - Culture + education
7. **Taqueria: 51.4** - Community gathering spot
8. **Elementary School: 45.5** - Foundation of education
9. **Skate Park: 41.0** - Youth culture + recreation
10. **Library: 38.8** - Knowledge hub

### Low Civic (20-40): Modest Contributors
11. **Apartment Complex: 33.8** - Dense housing tradeoff
12. **Public Pool: 28.3** - Recreation with noise

### Negative Civic (< 0): Polluters
13. **Natural Gas Plant: -15.4** - Cleaner but still fossil
14. **Brewery: -26.5** - Industrial externalities
15. **Coal Plant: -36.5** - Pollution + noise + danger

## Key Insights

### 1. Clean Energy Wins Big
- **Solar Farm (122.9)** crushes dirty energy
- **Coal Plant (-36.5)** massive penalty
- **158 point swing** between clean and dirty energy!

### 2. Housing is Surprisingly Civic
- **Cottage (83.8)** ranks #3 overall!
- Affordable housing gets high civic score
- **Apartment Complex (33.8)** lower due to noise/density

### 3. Parks Dominate Environment
- **Park (101.5)** second highest score
- Environment impact: 50 / √1 = **50 points alone**
- Low attenuation = city-wide green benefit

### 4. Education Matters
- **High School (51.6)** > Elementary (45.5)
- Culture impact heavily weighted
- Both solidly positive civic contributions

### 5. Industrial/Commercial Split
- **Farmers Market (65.1)** very civic (local food!)
- **Taqueria (51.4)** decent civic (community spot)
- **Brewery (-26.5)** pollution + noise penalty

## Gameplay Implications

### Path to Civic Victory (~187.9 points needed)

**Strategy A: Solar + Parks (2 buildings)**
- Solar Farm: 122.9
- Park: 101.5
- **Total: 224.4** → Capped at 187.9
- ✅ **Wins civic score in 2 buildings!**

**Strategy B: Balanced Civic Portfolio (3 buildings)**
- Fire Station: 66.9
- Farmers Market: 65.1
- High School: 51.6
- **Total: 183.6** → Very close to cap

**Strategy C: Housing + Civic Mix (3 buildings)**
- Cottage: 83.8
- Cottage: 83.8
- Library: 38.8
- **Total: 206.4** → Capped at 187.9

**Strategy D: Wealth + Civic Hybrid**
- Solar Farm: 122.9 (also generates revenue!)
- Taqueria: 51.4 (generates jobs + revenue)
- Brewery: -26.5 (high revenue but civic penalty)
- **Total: 147.8** → Competitive

### Anti-Pattern: Industrial Tycoon
- Coal Plant: -36.5
- Brewery: -26.5
- Natural Gas: -15.4
- **Total: -78.4** → Terrible civic score!

## Balance Assessment

### ✅ Pros
1. **Clear winner: Solar + Parks** - Thematically perfect!
2. **Multiple viable paths** - Can mix housing, education, civic
3. **Strong penalties for pollution** - Coal is punished heavily
4. **Affordable housing rewarded** - Cottages score high
5. **Can't ignore it** - Industrial players will tank civic score

### ⚠️ Potential Issues
1. **Too easy to max out?** - Just build solar + park = instant 187.9
2. **Cottage spam?** - 3 cottages = 250+ points (capped at 187.9)
3. **No reason to build multiple parks** - One park + solar is enough
4. **Library undervalued?** - Only 38.8 despite being civic building

### 🔧 Possible Tuning
If civic score is too easy to max:
1. **Scale down all scores by 50%** - Makes cap harder to reach
2. **Add diminishing returns** - First park = 101.5, second park = 50.8, etc.
3. **Make it relative** - Your civic score vs. other players
4. **Increase the cap** - 187.9 → 300 or higher

For now, **let's playtest** and see if it feels right!

## Implementation

### Step 1: Add civicScore to buildings-data.json
```json
{
  "id": "solar_farm",
  "name": "Solar Farm",
  "civicScore": 122.9,
  // ... rest of building data
}
```

### Step 2: Update calculateCivicScore() in server
```javascript
calculateCivicScore(playerId) {
    let totalCivicScore = 0;

    // Iterate through player's buildings
    for (const [locationKey, building] of this.gameState.buildings) {
        if (building.owner !== playerId) continue;

        // Get building definition (includes pre-calculated civicScore)
        const buildingDef = this.getBuildingDefinition(building.type);
        if (!buildingDef) continue;

        // Add pre-calculated civic score
        totalCivicScore += (buildingDef.civicScore || 0);
    }

    // Cap at 187.9 (Henry George reference)
    return Math.min(187.9, totalCivicScore);
}
```

### Computational Cost
- **O(buildings_owned)** - Just sum pre-calculated values!
- **Zero CARENS calculations** - All done at load time
- **Trivial performance impact**

## Next Steps

1. ✅ CARENS values rebalanced (double-digit impacts)
2. ✅ Civic scores calculated using attenuation
3. ⏭️ Update buildings-data.json with new values
4. ⏭️ Implement calculateCivicScore() in server-economic-engine.js
5. ⏭️ Test in-game and observe player behavior
6. ⏭️ Tune if needed based on gameplay

Ready to implement!
