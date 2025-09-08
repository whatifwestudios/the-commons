# Building Graphics System Setup

## Overview

The Commons now supports custom graphics for all buildings defined in your CSV. Here's how the system works and how to add your own graphics.

## Directory Structure

```
assets/
└── buildings/
    ├── housing/          # Housing category buildings
    ├── education/        # Education category buildings  
    ├── healthcare/       # Healthcare category buildings
    ├── culture/          # Culture category buildings
    ├── recreation/       # Recreation category buildings
    ├── commercial/       # Commercial category buildings
    ├── civic/            # Civic category buildings
    ├── emergency/        # Emergency category buildings
    ├── default.svg       # Fallback graphic for missing images
    └── README.md         # Detailed asset guidelines
```

## How It Works

1. **CSV Integration**: Each building in your `buildings_all - core_buildings_master.csv` has a `GraphicsFile` column
2. **Automatic Loading**: The game automatically loads graphics based on the CSV filename
3. **Fallback System**: If a graphic is missing, the system gracefully falls back to default images
4. **Multiple Formats**: Supports PNG, SVG, JPG, and other web image formats

## CSV Format

Your CSV now includes a `GraphicsFile` column:

```csv
Category,Name,GraphicsFile,CostToBuild,...
Housing,Tent,tent.svg,10,...
Housing,Shack,shack.png,50,...
Education,Story Circle,story_circle.svg,15,...
Commercial,Market Stall,market_stall.svg,15,...
```

## Adding Graphics

### 1. Choose Your Graphics Files
- **Recommended Size**: 64x64 pixels
- **Formats**: PNG (with transparency), SVG (scalable), JPG
- **Style**: Isometric or top-down view works best
- **Consistency**: Match your game's visual style

### 2. Place in Correct Directory
```bash
# Example for housing buildings
assets/buildings/housing/tent.svg
assets/buildings/housing/shack.png
assets/buildings/housing/cabin.png

# Example for education buildings  
assets/buildings/education/story_circle.svg
assets/buildings/education/school.png
```

### 3. Update CSV
Set the `GraphicsFile` column to your filename:
```csv
Housing,Tent,tent.svg,...
Housing,Shack,shack.png,...
```

### 4. Test and Deploy
The system will automatically:
- Load your custom graphics
- Fall back to `default.svg` if files are missing
- Generate a simple colored rectangle as final fallback

## Example Graphics Included

I've created sample graphics for:
- **Housing**: `tent.svg` - Simple brown tent with stakes
- **Education**: `story_circle.svg` - People around a campfire
- **Commercial**: `market_stall.svg` - Colorful market stall with goods

## Fallback System

The system handles missing graphics gracefully:

1. **Primary**: Try loading the specified graphics file
2. **Secondary**: Fall back to `assets/buildings/default.svg`
3. **Final**: Generate a simple building shape programmatically

## API Usage

The BuildingManager now provides graphics methods:

```javascript
// Get graphics info for a building
const graphics = window.buildingManager.getBuildingGraphics('tent');
console.log(graphics.path); // "assets/buildings/housing/tent.svg"

// Load image with automatic fallback
const imageResult = await window.buildingManager.loadBuildingImage('tent');
console.log(imageResult.success); // true if loaded, false if using fallback
```

## Tips for Creating Graphics

1. **Consistent Perspective**: Use the same viewing angle for all buildings
2. **Readable at Small Size**: Ensure graphics look good at 64x64 pixels
3. **Clear Silhouettes**: Buildings should be easily distinguishable
4. **Appropriate Colors**: Match the building's function (green for parks, brown for housing, etc.)
5. **SVG Benefits**: SVG files scale perfectly and are often smaller than PNG

## Batch Operations

You can update many buildings at once by:

1. Editing the CSV file with new GraphicsFile values
2. Adding multiple graphics to the appropriate directories
3. Reloading the game or calling `forceReloadCSV()` in the console

## Future Enhancements

The graphics system is designed to support:
- Seasonal variations
- Building upgrade states
- Animation frames
- Multiple building orientations
- Day/night variations

## Troubleshooting

- **Graphics not loading**: Check the file path and ensure the file exists
- **Wrong category**: Ensure graphics are in the correct category folder
- **Case sensitivity**: File names are case-sensitive on some servers
- **CORS issues**: Ensure your web server can serve the graphics files

The system is production-ready and will work on both your local development server and deployed versions!