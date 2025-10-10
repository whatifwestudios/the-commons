# Building Data Workflow

## Overview
This document describes the workflow for managing building data in The Commons, including adding new buildings, updating existing ones, and converting between CSV and JSON formats.

## File Locations

- **JSON (Active)**: `buildings-data.json` - Used by the game at runtime
- **CSV (Editing)**: `buildings-data.csv` - Human-friendly format for bulk editing
- **Assets**: `assets/buildings/[category]/[building_name].png` - Building sprites (96px wide)

## Workflow for Adding/Updating Buildings

### Step 1: Export to CSV (if needed)
If starting fresh or need a clean export:
```bash
# The CSV export process converts buildings-data.json to buildings-data.csv
# This is already done - buildings-data.csv exists
```

### Step 2: Edit Buildings in CSV
1. Open `buildings-data.csv` in Excel, Google Sheets, or text editor
2. Each row represents one building with these columns:

**Basic Info:**
- `id` - Unique identifier (lowercase_with_underscores)
- `name` - Display name
- `category` - civic, housing, commercial, education, energy, industrial, recreation
- `description` - Flavor text shown in UI
- `graphicsFile` - Path to PNG sprite (e.g., `assets/buildings/civic/fire_station.png`)
- `isDefault` - Set to `true` for included buildings

**Economics:**
- `buildCost` - Initial cost to build (¢)
- `constructionDays` - Days to complete construction
- `maxRevenue` - Maximum revenue per day (¢)
- `maintenanceCost` - Daily upkeep cost (¢)
- `decayRate` - How fast condition degrades (0.0 to 1.0, typically 0.05-0.15)

**Resources (JEEFHH - Jobs, Energy, Education, Food, Housing, Healthcare):**
- `jobsProvided` / `jobsRequired`
- `energyProvided` / `energyRequired`
- `educationProvided` / `educationRequired`
- `foodProvided` / `foodRequired`
- `housingProvided` / `housingRequired`
- `healthcareProvided` / `healthcareRequired`

**Livability (CARENS - Culture, Affordability, Resilience, Environment, Noise, Safety):**
Each factor has `_impact` and `_attenuation`:
- `culture_impact` / `culture_attenuation`
- `affordability_impact` / `affordability_attenuation`
- `resilience_impact` / `resilience_attenuation`
- `environment_impact` / `environment_attenuation`
- `noise_impact` / `noise_attenuation`
- `safety_impact` / `safety_attenuation`

**Impact**: Positive or negative effect on nearby parcels
**Attenuation**: How fast the effect decreases with distance (higher = shorter range)

### Step 3: Create Building Sprites
Use the building sprite creation guide:
1. Read `docs/building-sprite-guide.md` for specifications
2. Open `docs/create-alignment-guide.html` in browser
3. Download reference templates
4. Create sprites using Layer.ai or other tools with these specs:
   - **Width**: 96px (EXACT)
   - **Height**: Variable (100-300px based on building size)
   - **Perspective**: 30° isometric (front and right faces visible)
   - **Bottom alignment**: Building must touch canvas bottom edge
   - **Format**: PNG with transparent background
5. Save to `assets/buildings/[category]/[building_id].png`

### Step 4: Convert CSV to JSON
When ready to import changes into the game:

```javascript
// TODO: Create conversion script
// For now, this needs to be done manually or with a script
```

**Manual Conversion Process:**
1. Parse CSV rows
2. Group by category
3. Reconstruct nested JSON structure with:
   - `resources` object (JEEFHH values)
   - `economics` object (costs, revenue, decay)
   - `livability` object (CARENS impacts with nested objects)
   - `graphics` object (paths)
   - `images` object (built state)

### Step 5: Test in Game
1. Ensure `buildings-data.json` is updated
2. Refresh the game (F5)
3. Check that new buildings appear in build menu
4. Test construction and rendering

## Common Tasks

### Adding a New Building
1. Copy an existing row in CSV as template
2. Update all fields with new values
3. Create sprite following sprite guide
4. Save sprite to `assets/buildings/[category]/[building_id].png`
5. Update `graphicsFile` column to match sprite path
6. Convert CSV → JSON
7. Test in game

### Bulk Updating Buildings
1. Edit multiple rows in CSV
2. Save CSV
3. Convert CSV → JSON
4. Test in game

### Balancing Buildings
Key considerations:
- **Resource balance**: Buildings should have meaningful tradeoffs
- **Cost vs. benefit**: Higher costs should provide proportional benefits
- **Construction time**: Reflects building complexity and cost
- **Decay rate**: More complex buildings decay faster (need maintenance)
- **Livability impacts**: Should reflect realistic urban planning effects
  - Positive: Parks (+environment), schools (+culture, +education)
  - Negative: Industrial (-environment, -noise), power plants (-safety)

### Reference: Typical Building Stats

**Small Residential (Cottage):**
- Cost: 250¢, Construction: 1 day
- Housing: 2, Energy use: 2
- Decay: 0.1, Maintenance: 1¢/day

**Medium Commercial (Bakery/Restaurant):**
- Cost: 500-700¢, Construction: 3-4 days
- Jobs: 4-6, Revenue: 20-30¢/day
- Food production: 8-12
- Decay: 0.12-0.15, Maintenance: 3-4¢/day

**Large Civic (School/Fire Station):**
- Cost: 600-1500¢, Construction: 5-8 days
- Jobs: 8-12, No revenue (public service)
- Significant livability impacts (culture, safety)
- Decay: 0.05-0.08, Maintenance: 4-8¢/day

**Industrial/Energy:**
- Cost: 1000-3700¢, Construction: 4-12 days
- Jobs: 8-20, High revenue: 50-220¢/day
- Large resource production (energy, goods)
- Negative livability impacts (pollution, noise)
- Decay: 0.08-0.15, Maintenance: 1-25¢/day

## Automation TODO

Future improvements:
- [ ] Create CSV → JSON conversion script
- [ ] Create JSON → CSV export script
- [ ] Add validation script (check for duplicate IDs, missing files, etc.)
- [ ] Auto-generate building reference documentation
- [ ] Sprite validation tool (check dimensions, transparency)

## Notes

- Always keep both CSV and JSON in sync
- CSV is source of truth for editing, JSON is for runtime
- Building IDs must be unique across all categories
- Graphics files must exist before adding to CSV
- Test in-game after every major change
- Consider game balance when adding new buildings

## Quick Reference: CSV Column Order

```
id, name, category, description, graphicsFile, isDefault,
buildCost, constructionDays, maxRevenue, maintenanceCost, decayRate,
jobsProvided, jobsRequired, energyProvided, energyRequired,
educationProvided, educationRequired, foodProvided, foodRequired,
housingProvided, housingRequired, healthcareProvided, healthcareRequired,
culture_impact, culture_attenuation,
affordability_impact, affordability_attenuation,
resilience_impact, resilience_attenuation,
environment_impact, environment_attenuation,
noise_impact, noise_attenuation,
safety_impact, safety_attenuation
```

Total: 35 columns

## Related Documentation

- `docs/building-sprite-guide.md` - Sprite creation specifications
- `docs/create-alignment-guide.html` - Visual reference generator
- `buildings.js` - Building manager system code
- `buildings-data.json` - Active building data (runtime)
- `buildings-data.csv` - Editable building data (source)
