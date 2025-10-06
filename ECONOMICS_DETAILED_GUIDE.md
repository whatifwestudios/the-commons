# THE COMMONS - Detailed Economics Guide

## Table of Contents
1. [Core Economic Principles](#core-economic-principles)
2. [Commonwealth Score Calculation](#commonwealth-score-calculation)
3. [Revenue Calculations](#revenue-calculations)
4. [Cost & Tax Calculations](#cost--tax-calculations)
5. [Resource Systems](#resource-systems)
6. [Performance Multipliers](#performance-multipliers)
7. [Victory Conditions](#victory-conditions)
8. [Economic Formulas Reference](#economic-formulas-reference)

---

## Core Economic Principles

The Commons implements a sophisticated economic model based on:
- **Land Value Tax (LVT)**: Progressive taxation on unimproved land value
- **Performance-Based Revenue**: Building income varies based on local and global conditions
- **Decay System**: Buildings deteriorate over time, increasing maintenance costs
- **Resource Balance**: Supply (CARENS) and Demand (JEEFHH) systems

---

## Commonwealth Score Calculation

The Commonwealth Score is the primary victory metric, measuring both wealth accumulation and civic contribution through LVT payments.

### Formula

```
Commonwealth Score = (Wealth × (1 + LVT_Contribution_Ratio)) / 10000
```

### Components

#### 1. **Wealth Calculation**
```
Total Wealth = Cash + Land Value + Building Value
```

Where:
- **Cash**: Current player balance
- **Land Value**: $100 per owned parcel (base value)
- **Building Value**: Original build cost × current condition (0-1)

#### 2. **LVT Contribution Ratio**
```
LVT_Contribution_Ratio = Total_LVT_Paid / (Effective_Wealth × Baseline_LVT_Rate)
```

Where:
- **Baseline_LVT_Rate**: 0.30 (30% - prevents gaming by voting down rates)
- **Effective_Wealth**: Max(current_wealth, 1) to prevent division by zero

### Example Calculation

Player with:
- Cash: $50,000
- Parcels owned: 20 (20 × $100 = $2,000 land value)
- Building value: $15,000
- Total LVT paid: $5,000

```
Wealth = $50,000 + $2,000 + $15,000 = $67,000
LVT_Ratio = $5,000 / ($67,000 × 0.30) = 0.248
Commonwealth_Score = ($67,000 × (1 + 0.248)) / 10000 = 8.36
```

---

## Revenue Calculations

Building revenue is calculated through multiple layers of modifiers:

### Base Revenue Formula

```
Actual Revenue = Base_Revenue × Performance × Condition × Global_JEEFHH_Multiplier
```

### Components Breakdown

#### 1. **Base Revenue**
- Defined per building type in `buildings-data.json`
- Examples:
  - Small Shop: $20/day
  - Office Building: $100/day
  - Factory: $150/day
  - Apartment Complex: $60/day

#### 2. **Performance Multiplier**
```
Performance = Core_Needs_Satisfaction × CARENS_Multiplier
```

##### Core Needs Satisfaction (0-100%)
Calculated from adjacent 8 tiles' JEEFHH resources:

```
For each JEEFHH resource:
  Local_Supply = Sum of resource from adjacent buildings
  Local_Demand = Building's resource requirement
  Satisfaction = Min(1.0, Local_Supply / Max(1, Local_Demand))

Overall_Satisfaction = Average of all JEEFHH satisfactions
```

##### CARENS Multiplier (0.6x - 1.4x)
Only applies when city population > 100:

```
For each CARENS factor:
  Local_Value = Sum from adjacent tiles (with distance attenuation)

Culture_Score = Local_Culture / 100
Affordability_Score = (100 - Local_Cost) / 100
Resilience_Score = Local_Resilience / 100
Environment_Score = Local_Environment / 100
Noise_Penalty = Max(0, Local_Noise - 50) / 100
Safety_Score = Local_Safety / 100

CARENS_Average = Average of all scores
CARENS_Multiplier = 0.6 + (CARENS_Average × 0.8)  // Range: 0.6 to 1.4
```

#### 3. **Condition Factor**
```
Condition_Factor = Building_Condition  // 0.0 to 1.0
```

Buildings decay at 5% per game period:
- New building: 100% condition (1.0)
- After 10 periods: ~60% condition (0.6)
- After 20 periods: ~36% condition (0.36)

#### 4. **Global JEEFHH Multiplier (0.8x - 1.2x)**
City-wide economic health indicator:

```
For each JEEFHH resource:
  City_Supply = Total from all buildings
  City_Demand = Total required by all buildings
  Balance = Min(2.0, City_Supply / Max(1, City_Demand))

Average_Balance = Average of all JEEFHH balances
Global_Multiplier = 0.8 + (Average_Balance × 0.2)  // Range: 0.8 to 1.2
```

### Complete Revenue Example

Factory with:
- Base revenue: $150
- Core needs satisfaction: 80% (0.8)
- CARENS multiplier: 1.2x (good local livability)
- Building condition: 85% (0.85)
- Global JEEFHH: 1.1x (healthy city economy)

```
Performance = 0.8 × 1.2 = 0.96
Revenue = $150 × 0.96 × 0.85 × 1.1 = $134.64/day
```

---

## Cost & Tax Calculations

### Maintenance Costs

Maintenance increases exponentially with building age:

```
Maintenance = Base_Maintenance × (1 + Decay_Rate)^Building_Age
```

Where:
- **Base_Maintenance**: Defined per building type
- **Decay_Rate**: Typically 5% (0.05)
- **Building_Age**: Days since construction

#### Example
Office building after 10 days:
- Base maintenance: $10
- Decay rate: 5%
```
Maintenance = $10 × (1.05)^10 = $10 × 1.629 = $16.29/day
```

### Land Value Tax (LVT)

Daily LVT payment per parcel:

```
Daily_LVT = (Parcel_Value × LVT_Rate) / 365
```

Where:
- **Parcel_Value**: $100 (standard)
- **LVT_Rate**: Voted by players (default 50%)

#### Example
With 50% LVT rate:
```
Daily_LVT = ($100 × 0.50) / 365 = $0.137 per parcel per day
```

For 20 parcels:
```
Total_Daily_LVT = 20 × $0.137 = $2.74/day
```

### Net Income Calculation

```
Net_Daily_Income = Total_Revenue - Total_Maintenance - Total_LVT
```

---

## Resource Systems

### JEEFHH (Demand Resources)

Buildings require and provide JEEFHH resources:

| Resource | Symbol | Providers | Consumers |
|----------|--------|-----------|-----------|
| Jobs | J | Commercial, Industrial, Civic | Residential |
| Energy | E | Utilities (Power Plants) | All buildings |
| Education | E | Civic (Libraries, Schools) | Residential, Commercial |
| Food | F | Agricultural | Residential, Commercial |
| Healthcare | H | Civic (Hospitals) | Residential |
| Housing | H | Residential | Commercial, Industrial |

### CARENS (Supply/Livability Resources)

Affect building performance and citizen happiness:

| Resource | Symbol | Impact Range | Calculation |
|----------|--------|--------------|-------------|
| Culture | C | 0-100 | Positive from civic/commercial |
| Affordability | A | 0-100 | Inverse of local costs |
| Resilience | R | 0-100 | Emergency services coverage |
| Environment | E | 0-100 | Parks and green spaces |
| Noise | N | 0-100+ | Negative from industrial/commercial |
| Safety | S | 0-100 | Police, fire, medical coverage |

### Resource Attenuation

Resources affect nearby tiles with decreasing strength:

```
Effect_At_Distance = Base_Impact × (1 / (1 + Distance × Attenuation_Rate))
```

Example for Fire Station safety (Impact: 25, Attenuation: 6):
- Adjacent tile: 25 × (1/(1+1×6)) = 3.57
- 2 tiles away: 25 × (1/(1+2×6)) = 1.92
- 3 tiles away: 25 × (1/(1+3×6)) = 1.32

---

## Performance Multipliers

### Building Performance Calculation

Complete formula:

```
Building_Performance =
  Core_Needs_Satisfaction (0-1.0) ×
  CARENS_Multiplier (0.6-1.4) ×
  Condition (0-1.0) ×
  Global_JEEFHH (0.8-1.2)
```

Maximum theoretical performance: 1.0 × 1.4 × 1.0 × 1.2 = 168%
Minimum theoretical performance: 0 × 0.6 × 0 × 0.8 = 0%

### Typical Performance Ranges

| Scenario | Core Needs | CARENS | Condition | Global | Total |
|----------|------------|--------|-----------|---------|-------|
| Ideal | 100% | 1.4x | 100% | 1.2x | 168% |
| Good | 80% | 1.2x | 90% | 1.1x | 95% |
| Average | 60% | 1.0x | 75% | 1.0x | 45% |
| Poor | 40% | 0.8x | 50% | 0.9x | 14% |
| Failing | 20% | 0.6x | 25% | 0.8x | 2.4% |

---

## Victory Conditions

### Early Victory (Civic Victory)
Achieve before day 365:
- Commonwealth Score ≥ 25.0
- LVT Contribution Ratio ≥ 15%
- Total Wealth ≥ $50,000

### Year-End Victory
After 365 days:
- Highest Commonwealth Score wins

### Victory Score Benchmarks

| Score | Achievement Level | Typical Requirements |
|-------|------------------|---------------------|
| 5.0 | Beginner | $30k wealth, 10% LVT ratio |
| 10.0 | Competent | $70k wealth, 15% LVT ratio |
| 15.0 | Advanced | $120k wealth, 20% LVT ratio |
| 20.0 | Expert | $160k wealth, 25% LVT ratio |
| 25.0+ | Master (Victory) | $200k+ wealth, 30%+ LVT ratio |

---

## Economic Formulas Reference

### Quick Reference Card

#### Daily Cashflow
```
Cashflow = Σ(Building_Revenues) - Σ(Maintenance_Costs) - Σ(LVT_Payments)
```

#### Building Value Over Time
```
Current_Value = Build_Cost × (1 - Decay_Rate)^Age
```

#### Effective Tax Rate
```
Effective_Rate = (Total_LVT_Paid / Total_Land_Value) × 100%
```

#### ROI Calculation
```
ROI = (Annual_Revenue - Annual_Costs) / Build_Cost × 100%
```

#### Payback Period
```
Payback = Build_Cost / Daily_Net_Income
```

### Optimization Strategies

1. **Revenue Maximization**
   - Place buildings near complementary types
   - Maintain 80%+ condition through repairs
   - Balance JEEFHH resources locally

2. **Cost Minimization**
   - Replace buildings before decay becomes excessive
   - Vote for optimal LVT rates (balance revenue vs cost)
   - Cluster buildings to share resources

3. **Commonwealth Score Optimization**
   - Maintain high LVT contribution ratio
   - Build wealth through efficient operations
   - Balance expansion with maintenance

### Economic Cycles

The game simulates economic periods with varying multipliers:

| Period | Duration | Effects |
|--------|----------|---------|
| Growth | 30 days | Revenue +20%, Costs -10% |
| Stable | 60 days | Normal rates |
| Recession | 30 days | Revenue -20%, Costs +10% |

### Subsidy System

Government subsidies based on governance votes:
- Education buildings: Up to 50% maintenance reduction
- Healthcare buildings: Up to 40% maintenance reduction
- Civic buildings: Up to 30% maintenance reduction

---

## Advanced Economic Mechanics

### Action Point Economy

In multiplayer:
- Daily allocation: Based on city development level
- Base cost: 1-3 points per building
- Marketplace: Dynamic pricing based on supply/demand

### Parcel Auction Economics

Auction mechanics:
- Starting bid: Current land value
- Minimum increment: 10% of current bid
- Owner buyback: Automatic counter at 110% if inactive

### Treasury Management

Commonwealth treasury:
- Funded by: LVT payments, penalties
- Used for: Subsidies, public works
- Distribution: Based on governance votes

---

## Economic Data Tables

### Building Economics Summary

| Building Type | Build Cost | Base Revenue | Base Maintenance | Decay Rate |
|--------------|------------|--------------|------------------|------------|
| Small House | $200 | $10 | $2 | 5% |
| Apartment | $800 | $60 | $8 | 5% |
| Small Shop | $300 | $20 | $3 | 5% |
| Office | $1200 | $100 | $10 | 5% |
| Factory | $1500 | $150 | $15 | 7% |
| Farm | $400 | $30 | $4 | 3% |
| Power Plant | $2000 | $0 | $20 | 5% |
| Hospital | $1800 | $0 | $15 | 5% |
| Fire Station | $1500 | $0 | $8 | 5% |
| Library | $400 | $0 | $2 | 5% |

### Resource Impact Ranges

| Resource | Min Impact | Max Impact | Optimal Range |
|----------|------------|------------|---------------|
| Jobs | 0 | 20 per building | 1:1 with housing |
| Energy | 0 | 50 per plant | 1.2x demand |
| Education | 0 | 15 per facility | 0.3x population |
| Food | 0 | 30 per farm | 1.1x population |
| Healthcare | 0 | 20 per hospital | 0.2x population |
| Housing | 0 | 40 per complex | Match job supply |

---

## Conclusion

The Commons economic system rewards:
1. **Strategic Planning**: Optimal building placement and resource balance
2. **Civic Contribution**: High LVT payments benefit everyone
3. **Long-term Thinking**: Managing decay and planning replacements
4. **Collaborative Play**: Voting for beneficial policies
5. **Economic Efficiency**: Maximizing revenue while minimizing costs

Understanding these calculations enables players to make informed decisions and develop winning strategies.

---

*For the latest updates and community strategies, visit the game forums or Discord server.*