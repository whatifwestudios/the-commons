# Civic Score - Uncapped Version

## Change

**Removed the 187.9 cap on civic scores.**

### Before
```javascript
civicScore = Math.min(civicScore, CIVIC_SCORE_CAP); // Capped at 187.9
```

### After
```javascript
// No cap - let civic score grow unbounded based on buildings built
```

## Implications

### Gameplay Effects

**Rewards continuous civic building:**
- Player with 2 solar farms + 2 parks = **449 civic points** (not capped at 187.9)
- Player with 10 cottages = **838 civic points**
- Civic score now scales with game length and building count

**Creates clearer differentiation:**
- Small civic contributor: 50-100 points
- Medium civic player: 200-400 points
- Dedicated civic builder: 600-1000+ points

**Balances against wealth score:**
- Wealth score is also unbounded (based on % of total wealth × 100)
- In 4-player game, max wealth score = 100 (if one player has all wealth)
- Now civic score can potentially exceed wealth score

**Encourages late-game civic building:**
- Without cap, there's always incentive to build more civic infrastructure
- Players can specialize in civic path without hitting ceiling early

### Potential Issues

**Civic score might dominate?**
- If one player builds 5 solar farms = **614 civic points**
- vs. wealth score capped at ~100 in multiplayer
- Civic-focused player might win easily

**Solutions if needed:**
1. **Scale civic scores down 50%** - Halve all pre-calculated scores
2. **Cap at higher value** - Cap at 500 or 1000 instead of 187.9
3. **Make it relative** - Civic score = (your civic / total civic) × 100
4. **Add diminishing returns** - nth building of same type = score × (1/√n)

### Expected Gameplay Patterns

**Pure Civic Strategy:**
- Solar Farm (122.9) × 3 = 368.7
- Park (101.5) × 2 = 203.0
- Fire Station (66.9) × 1 = 66.9
- **Total: 638.6 civic points**
- Wealth score: ~10-20 (poor but civic-minded)
- **Commonwealth: 648.6-658.6**

**Pure Wealth Strategy:**
- Coal plants, breweries, natural gas (negative civic)
- Total civic: -100 to -200
- Wealth score: ~50-70 (rich industrial baron)
- **Commonwealth: -50 to -130** (loses!)

**Balanced Strategy:**
- Mix of revenue-generating and civic buildings
- Solar farms (good civic + revenue)
- Taquerias (moderate civic + revenue)
- Total civic: 200-400
- Wealth score: 20-40
- **Commonwealth: 220-440** (competitive)

## Playtest Goals

Watch for:
1. **Does civic score dominate?** - Are civic builders winning every time?
2. **Is there still tension?** - Do players feel trade-offs between wealth and civic?
3. **Late-game behavior** - Do players keep building civic, or stop?
4. **Score ranges** - What's typical civic score by game end?

## Rebalancing Options

If civic scores get too high (500-1000 regularly):

### Option 1: Scale Down by 50%
```python
# In calculate-civic-scores.py, change:
weighted_impact = impact / math.sqrt(attenuation) * 0.5  # Half value
```

### Option 2: Relative Civic Score
```javascript
// Calculate as % of total civic contribution
const totalCivic = sum(allPlayers.map(p => p.rawCivicScore));
civicScore = (playerRawCivicScore / totalCivic) * 100;
```

### Option 3: Logarithmic Scale
```javascript
// Diminishing returns on high civic scores
civicScore = Math.log(rawCivicScore + 1) * 50;
```

## Current Status

**✅ Uncapped and ready to playtest!**

Let's observe actual gameplay and adjust if needed.
