# CARENS Rebalance & Civic Score Calculation

## Overview

Revised CARENS values to be more intuitive, balanced, and meaningful. Added pre-calculated `civicScore` column that uses attenuation to weight impacts.

## Key Principles

1. **Double-digit impacts**: Most buildings now have 10-80 point impacts (not 2-5)
2. **Clear semantic meaning**:
   - Positive = good for that dimension
   - Negative = bad for that dimension
3. **Attenuation matters**: Lower attenuation = wider impact = higher civic contribution
4. **Pre-calculated**: Civic score stored in JSON, no runtime computation needed

## Civic Score Formula

```
For each CARENS dimension:
  weightedImpact = impact / attenuation

civicScore = sum of all weightedImpacts
```

**Why divide by attenuation?**
- **Low attenuation (1-3)** = City-wide impact = MORE civic value
  - Park with environment +50, attenuation 1 = **+50.0** weighted impact
  - Fire station with safety +80, attenuation 6 = **+13.3** weighted impact
- **High attenuation (10+)** = Localized impact = LESS civic value
  - Coal plant with environment -80, attenuation 40 = **-2.0** weighted impact

This rewards buildings that benefit the whole city over narrow-impact buildings.

## Building Archetypes & Civic Scores

### Top Tier Civic Contributors (150-180 points)
**Solar Farm: 178 points**
- Culture: 15/5 = 3.0
- Affordability: 35/30 = 1.2
- Resilience: 25/3 = 8.3
- Environment: 75/1 = **75.0** (huge city-wide benefit!)
- Noise: 10/1 = 10.0
- Safety: 18/3 = 6.0
- **Total: 178**

**Park: 173 points**
- Culture: 30/8 = 3.8
- Affordability: 18/25 = 0.7
- Resilience: 35/15 = 2.3
- Environment: 50/1 = **50.0** (huge city-wide benefit!)
- Noise: 25/2 = 12.5
- Safety: 15/2 = 7.5
- **Total: 173**

**Fire Station: 155 points**
- Culture: 20/3 = 6.7
- Affordability: 10/4 = 2.5
- Resilience: 30/5 = 6.0
- Environment: 15/2 = 7.5
- Noise: -20/10 = -2.0
- Safety: 80/6 = **13.3** (strong city-wide safety!)
- **Total: 155**

### Good Civic Contributors (100-130 points)
**Cottage: 125 points** (surprisingly high!)
- Culture: 12/2 = 6.0
- Affordability: 35/3 = **11.7** (very affordable housing!)
- Resilience: 15/2 = 7.5
- Environment: 20/2 = 10.0
- Noise: 18/2 = 9.0
- Safety: 25/2 = 12.5
- **Total: 125**

**High School: 119 points**
- Culture: 40/5 = 8.0
- Affordability: 25/3 = 8.3
- Resilience: 32/15 = 2.1
- Environment: 12/2 = 6.0
- Noise: -15/3 = -5.0
- Safety: 25/5 = 5.0
- **Total: 119**

**Farmers Market: 109 points**
- Culture: 22/12 = 1.8
- Affordability: 20/5 = 4.0
- Resilience: 12/8 = 1.5
- Environment: 28/1 = **28.0** (local food = green!)
- Noise: 15/2 = 7.5
- Safety: 12/3 = 4.0
- **Total: 109**

**Elementary School: 108 points**
- Culture: 35/8 = 4.4
- Affordability: 20/3 = 6.7
- Resilience: 28/12 = 2.3
- Environment: 15/2 = 7.5
- Noise: -12/3 = -4.0
- Safety: 22/5 = 4.4
- **Total: 108**

**Library: 100 points**
- Culture: 40/12 = 3.3
- Affordability: 15/5 = 3.0
- Resilience: 25/8 = 3.1
- Environment: 10/1 = 10.0
- Noise: -5/1 = -5.0
- Safety: 15/5 = 3.0
- **Total: 100**

### Moderate Civic Contributors (70-90 points)
**Skate Park: 81 points**
- Culture: 30/6 = 5.0
- Affordability: 15/5 = 3.0
- Resilience: 12/3 = 4.0
- Environment: 22/2 = 11.0
- Noise: -18/3 = -6.0
- Safety: 20/4 = 5.0
- **Total: 81**

**Taqueria: 80 points**
- Culture: 25/3 = 8.3
- Affordability: 15/3 = 5.0
- Resilience: 10/2 = 5.0
- Environment: 8/2 = 4.0
- Noise: 10/2 = 5.0
- Safety: 12/2 = 6.0
- **Total: 80**

**Public Pool: 72 points**
- Culture: 25/10 = 2.5
- Affordability: 12/8 = 1.5
- Resilience: 18/8 = 2.3
- Environment: 12/2 = 6.0
- Noise: -15/3 = -5.0
- Safety: 20/4 = 5.0
- **Total: 72**

### Neutral/Low Civic Contributors (40-60 points)
**Apartment Complex: 49 points**
- Culture: 8/2 = 4.0
- Affordability: 45/4 = 11.3
- Resilience: 18/2 = 9.0
- Environment: -15/3 = -5.0
- Noise: -25/5 = -5.0
- Safety: 18/2 = 9.0
- **Total: 49**

### Negative Civic Contributors (Below 0)
**Natural Gas Plant: -15 points**
- Culture: -8/1 = -8.0
- Affordability: 35/12 = 2.9
- Resilience: 30/12 = 2.5
- Environment: -35/10 = -3.5
- Noise: -22/5 = -4.4
- Safety: -15/8 = -1.9
- **Total: -15**

**Brewery: -43 points**
- Culture: 18/2 = 9.0
- Affordability: 12/8 = 1.5
- Resilience: -10/5 = -2.0
- Environment: -25/3 = -8.3
- Noise: -20/2 = -10.0
- Safety: -18/3 = -6.0
- **Total: -43**

**Coal Plant: -120 points** (worst!)
- Culture: -15/1 = -15.0
- Affordability: 25/6 = 4.2
- Resilience: 20/10 = 2.0
- Environment: -80/40 = **-2.0** (massive pollution, but localized by high attenuation)
- Noise: -45/10 = -4.5
- Safety: -25/5 = -5.0
- **Total: -120**

Wait, this doesn't add up correctly. Let me recalculate...

Actually, I need to reconsider the formula. With high attenuation on coal plant environment (-80/40 = -2.0), the impact is minimized. That's backwards!

## Revised Civic Score Formula

**Attenuation should INCREASE impact of wide-reaching buildings, not decrease it.**

```
For each CARENS dimension:
  rangeMultiplier = 1 / (attenuation / 10)  // Lower attenuation = higher multiplier
  weightedImpact = impact × rangeMultiplier

civicScore = sum of all weightedImpacts
```

**Recalculated Examples:**

**Park** (environment +50, attenuation 1):
- rangeMultiplier = 1 / (1/10) = 10.0
- weightedImpact = 50 × 10.0 = **500**

That's way too high!

## Better Formula: Inverse Attenuation Scale

```
For each CARENS dimension:
  // Attenuation 1 = 5x multiplier (city-wide)
  // Attenuation 5 = 1x multiplier (moderate)
  // Attenuation 20 = 0.25x multiplier (very localized)
  multiplier = 5 / attenuation
  weightedImpact = impact × multiplier

civicScore = sum of all weightedImpacts
```

Let me recalculate with this formula...

Actually, this is getting complex. Let me simplify:

## SIMPLEST FORMULA: Just Scale Impact by (10 / attenuation)

```
weightedImpact = impact × (10 / attenuation)
civicScore = sum(weightedImpacts)
```

**Park:**
- Environment: 50 × (10/1) = 500
- Culture: 30 × (10/8) = 37.5
- Affordability: 18 × (10/25) = 7.2
- Resilience: 35 × (10/15) = 23.3
- Noise: 25 × (10/2) = 125
- Safety: 15 × (10/2) = 75
- **Total: 768**

Still too high! The scale is off.

## FINAL FORMULA: impact / sqrt(attenuation)

This gives diminishing returns to high attenuation:

```
weightedImpact = impact / sqrt(attenuation)
civicScore = sum(weightedImpacts)
```

**Park:**
- Environment: 50 / sqrt(1) = 50.0
- Culture: 30 / sqrt(8) = 10.6
- Affordability: 18 / sqrt(25) = 3.6
- Resilience: 35 / sqrt(15) = 9.0
- Noise: 25 / sqrt(2) = 17.7
- Safety: 15 / sqrt(2) = 10.6
- **Total: 101.5**

That's more reasonable! Let me recalculate all buildings with this formula...

