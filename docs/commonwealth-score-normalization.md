# Commonwealth Score Normalization & Victory Conditions

## Problem 1: Player-Count Dependency

### Current Issue
- **2 players**: Max possible = 100 + 100 = **200 total points** (winner likely 101-150)
- **4 players**: Max possible = ~25 + ~25 = **50 total points** (winner likely 30-40)
- **12 players**: Max possible = ~8 + ~8 = **16 total points** (winner likely 10-12)

Players can't tell if they're doing well without knowing the game size!

### Solution: Normalize to 0-200 Scale

**Elegant formula:**
```javascript
normalizedScore = (wealthScore + civicScore) × (playerCount / 2)
```

**Why divide by 2?**
- In a 2-player game: multiply by 1 (no change)
- In a 4-player game: multiply by 2
- In a 12-player game: multiply by 6

**Result:**
- All games scale to approximately 0-200 range
- Average player always around 50-75
- Strong player always around 100-150
- Winning player always around 150-200

### Examples

**2-Player Game:**
- Player A: 60 wealth + 40 civic = **100 × 1 = 100**
- Player B: 40 wealth + 60 civic = **100 × 1 = 100**

**4-Player Game:**
- Player A: 30 wealth + 25 civic = **55 × 2 = 110**
- Player B: 25 wealth + 25 civic = **50 × 2 = 100**
- Player C: 25 wealth + 25 civic = **50 × 2 = 100**
- Player D: 20 wealth + 25 civic = **45 × 2 = 90**

**12-Player Game:**
- Player A: 12 wealth + 10 civic = **22 × 6 = 132**
- Average player: 8 wealth + 8 civic = **16 × 6 = 96**
- Weak player: 5 wealth + 5 civic = **10 × 6 = 60**

### Intuitive Interpretation
- **0-50**: Behind (below average)
- **50-100**: Average player
- **100-150**: Strong player
- **150-200**: Winning player

---

## Problem 2: Early Victory Condition

### Current Issue
```
Early Victory: Commonwealth Score ≥ 50.0 AND population ≥ 100
```

This doesn't work well because:
- 50 means different things in different game sizes
- No dynamic element (just grind to 50 and wait)
- Population threshold is arbitrary

### Proposed Solutions

#### Option A: Relative Lead (Best)
```javascript
Early Victory:
  Your score ≥ (average score + 75) AND gameTime ≥ 30 days
```

**Why this works:**
- In 2-player: Average ~100, need 175 (huge lead)
- In 4-player: Average ~50, need 125 (significant lead)
- In 12-player: Average ~16, need 91 (dominant performance)
- Scales automatically with player count
- Rewards consistent dominance, not just grinding

**Example (4-player):**
```
Player A: 110
Player B: 100
Player C: 100
Player D: 90
Average: 100

Player A needs: 100 + 75 = 175 (not there yet)
No early victory - game continues!
```

#### Option B: Threshold Multiple
```javascript
Early Victory:
  Your score ≥ (2nd place score × 1.5) AND gameTime ≥ 30 days
```

**Why this works:**
- Must be 50% ahead of 2nd place
- Scales with competition
- Prevents runaway victories too early

#### Option C: City Performance Gate
```javascript
Early Victory:
  Your score ≥ 150 (normalized) AND
  city attractiveness ≥ 1.5 AND
  gameTime ≥ 30 days
```

**Why this works:**
- 150 normalized score = strong player in any game size
- City must be thriving (attractiveness > 1.5)
- Can't win by exploiting bad city conditions

### Recommendation: **Option A (Relative Lead)**

It's simple, elegant, and automatically scales with game size.

---

## Problem 3: Victory Screen on Sept 1

### Current Issue
Victory screen doesn't trigger on Sept 1 (game day 365).

### Solution: Check in Daily Tick
```javascript
// In processDayTick() or similar
if (gameTime === 365) { // Sept 1, Year 2
    this.triggerYearEndVictory();
}
```

Need to find where `gameTime` is incremented and add victory check.

---

## Problem 4: August Warning Modal

### Proposed Implementation

**Trigger:** gameTime === 335 (Aug 1 = day 335)

**Modal Content:**
```
┌─────────────────────────────────────┐
│  ⏰  ONE MONTH REMAINING  ⏰        │
├─────────────────────────────────────┤
│                                     │
│  The year ends on September 1st.   │
│  Current standings:                 │
│                                     │
│  1st: Alice      - 142 points       │
│  2nd: Bob        - 128 points       │
│  3rd: Carol      - 95 points        │
│  4th: Dave       - 72 points        │
│                                     │
│  Push for the lead or defend your   │
│  position! Build civic buildings    │
│  and grow your wealth to maximize   │
│  your final score.                  │
│                                     │
│         [CONTINUE PLAYING]          │
└─────────────────────────────────────┘
```

---

## Implementation Plan

### 1. Normalize Commonwealth Score
```javascript
// In calculateCommonwealthScores()
const playerCount = this.gameState.players.size;
const normalizer = playerCount / 2;

for (const [playerId, playerState] of this.gameState.players) {
    const wealthScore = (playerWealth / totalWealth) * 100;
    const civicScore = (rawCivicContribution / totalCivicContribution) * 100;

    // Normalize to 0-200 scale
    const rawScore = wealthScore + civicScore;
    const normalizedScore = rawScore * normalizer;

    scores.set(playerId, {
        score: normalizedScore,
        rawScore: rawScore, // Keep for debugging
        wealthScore: wealthScore,
        civicScore: civicScore,
        // ...
    });
}
```

### 2. Update Early Victory Condition
```javascript
// In checkVictoryConditions()
const scores = this.calculateCommonwealthScores();
const averageScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
const topScore = Math.max(...scores.map(s => s.score));

if (topScore >= (averageScore + 75) && this.gameState.gameTime >= 30) {
    this.triggerEarlyVictory(topScorer);
}
```

### 3. Add Sept 1 Victory Check
```javascript
// In processDayTick() or daily update loop
if (this.gameState.gameTime === 365) { // Sept 1, Year 2
    this.triggerYearEndVictory();
}
```

### 4. Add Aug 1 Warning
```javascript
// In processDayTick()
if (this.gameState.gameTime === 335) { // Aug 1, Year 2
    this.broadcastOneMonthWarning();
}

broadcastOneMonthWarning() {
    const scores = this.calculateCommonwealthScores();

    this.broadcastFunction({
        type: 'ONE_MONTH_WARNING',
        scores: scores.map(s => ({
            playerId: s.playerId,
            playerName: s.playerName,
            score: s.score,
            rank: s.rank
        })),
        message: 'The year ends on September 1st. One month remaining!'
    });
}
```

---

## Updated UI Text

### Leaderboard Modal
```
How Scoring Works:
• Wealth Score (0-100): Your share of total game wealth
• Civic Score (0-100): Your share of total civic contribution
• Commonwealth Score: (Wealth + Civic) × (players ÷ 2)
  Normalized to 0-200 scale for easy comparison

Target Scores:
• 0-50: Below average
• 50-100: Average player
• 100-150: Strong player
• 150-200: Winning position

Victory Conditions:
• Early Victory: Score ≥ (average + 75) after day 30
• Year-End Victory: Highest score on Sept 1

Strategy: Balance wealth and civic contribution.
Pure wealth or pure civic strategies will not win!
```

---

## Benefits of Normalization

1. **Intuitive across game sizes** - 100 always means "good player"
2. **Consistent targets** - Always aim for 150+ to win
3. **Better pacing** - Early victory threshold scales naturally
4. **Easier spectating** - Viewers understand standings immediately
5. **Fair competition** - 2-player game as competitive as 12-player

---

## Next Steps

1. ✅ Implement score normalization in `calculateCommonwealthScores()`
2. ✅ Update early victory condition to relative lead
3. ✅ Add Sept 1 victory check in daily tick
4. ✅ Add Aug 1 warning modal with leaderboard
5. ✅ Update all UI text to reflect normalized scoring
6. 🧪 Playtest with different player counts (2, 4, 8 players)
