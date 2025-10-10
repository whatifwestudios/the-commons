# Civic Score Calculation Verification

## Current Implementation (Confirmed Correct)

### Step 1: Calculate Raw Civic Contributions
```javascript
for each player:
  civicContribution = 0
  for each building owned by player:
    civicContribution += buildingDef.civicScore

  playerCivicContributions[playerId] = civicContribution
  totalCivicContribution += max(0, civicContribution) // Only positive contributions
```

### Step 2: Calculate Relative Civic Score (0-100)
```javascript
if (rawCivicContribution <= 0):
  civicScore = 0
else:
  civicScore = (rawCivicContribution / totalCivicContribution) × 100
```

### Step 3: Normalize Commonwealth Score
```javascript
normalizedScore = (wealthScore + civicScore) × (playerCount / 2)
```

## Example 4-Player Game

### Buildings Owned
- **Player A**: Solar farm (122.9), Park (101.5) = **224.4**
- **Player B**: 3× Cottage (83.8 each) = **251.4**
- **Player C**: Coal plant (-36.5), Natural gas (-15.4) = **-51.9**
- **Player D**: Taqueria (51.4), Farmers Market (65.1) = **116.5**

### Total Civic Contribution
```
totalCivicContribution = max(0, 224.4) + max(0, 251.4) + max(0, -51.9) + max(0, 116.5)
                       = 224.4 + 251.4 + 0 + 116.5
                       = 592.3
```

### Civic Scores (0-100 scale)
```
Player A: (224.4 / 592.3) × 100 = 37.9
Player B: (251.4 / 592.3) × 100 = 42.4
Player C: 0 (negative contribution)
Player D: (116.5 / 592.3) × 100 = 19.7
```

### Wealth Scores (assume equal wealth for simplicity)
```
Each player has 25% of wealth = 25.0
```

### Raw Scores (before normalization)
```
Player A: 25.0 + 37.9 = 62.9
Player B: 25.0 + 42.4 = 67.4
Player C: 25.0 + 0.0 = 25.0
Player D: 25.0 + 19.7 = 44.7
```

### Normalized Scores (4 players → multiply by 2)
```
Player A: 62.9 × 2 = 125.8
Player B: 67.4 × 2 = 134.8 ← WINNER
Player C: 25.0 × 2 = 50.0
Player D: 44.7 × 2 = 89.4
```

## Key Observations

✅ **Civic score is relative (0-100)** - Your share of total civic contribution
✅ **Negative contributions = 0 civic score** - Polluters get nothing
✅ **Normalization scales to 0-200** - Consistent across game sizes
✅ **No artificial caps** - Civic score can reach full 100 if you have all civic buildings

## Edge Cases

### All Players Have Negative Civic
```
Player A: -50
Player B: -30
Player C: -20

totalCivicContribution = max(0, -50) + max(0, -30) + max(0, -20) = 0
totalCivicContribution = max(0, 1) = 1 (prevent division by zero)

All players: civicScore = 0
```

### One Player Has All Civic Buildings
```
Player A: 500 civic
Player B: 0 civic
Player C: 0 civic
Player D: 0 civic

totalCivicContribution = 500

Player A: (500 / 500) × 100 = 100 ← Full civic score
Player B, C, D: 0
```

### Mixed Positive and Negative
```
Player A: +200 civic
Player B: +100 civic
Player C: -50 civic
Player D: +50 civic

totalCivicContribution = 200 + 100 + 0 + 50 = 350

Player A: (200 / 350) × 100 = 57.1
Player B: (100 / 350) × 100 = 28.6
Player C: 0 (negative)
Player D: (50 / 350) × 100 = 14.3
```

## Verification Checklist

- [x] Raw civic contribution sums building scores
- [x] Negative contributions excluded from total
- [x] Civic score is relative (0-100 scale)
- [x] Negative players get 0 civic score
- [x] Commonwealth score is normalized by player count
- [x] No artificial 187.9 cap applied
- [x] Division by zero prevented (totalCivicContribution minimum 1)

## Current Status

✅ **IMPLEMENTATION IS CORRECT**

The civic score calculation:
1. Properly sums CARENS-based building scores
2. Calculates relative share (0-100)
3. Penalizes negative contributions (0 score)
4. Normalizes final score for player count independence

No bugs found! The 187.9 constant was just leftover code and not being used.
