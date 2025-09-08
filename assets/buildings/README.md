# Building Graphics Directory

This directory contains graphics for all buildings in The Commons game.

## Directory Structure

```
assets/buildings/
├── housing/          # Housing buildings (tent.png, shack.png, etc.)
├── education/        # Education buildings (story_circle.png, etc.)
├── healthcare/       # Healthcare buildings (herbalist_hut.png, etc.)
├── culture/          # Cultural buildings (storytelling_ring.png, etc.)
├── recreation/       # Recreation buildings (open_field.png, etc.)
├── commercial/       # Commercial buildings (market_stall.png, etc.)
├── civic/            # Civic buildings (council_hut.png, etc.)
├── emergency/        # Emergency buildings (guard_post.png, etc.)
└── default.png       # Fallback image for missing graphics
```

## File Naming Convention

Graphics files should be named according to the `GraphicsFile` column in the master CSV:
- Use lowercase letters
- Replace spaces with underscores
- Use .png format for best compatibility
- Example: "Single House" → `single_house.png`

## Recommended Image Specifications

- **Format**: PNG with transparency support
- **Size**: 64x64 pixels (isometric view)
- **Style**: Consistent with game's visual style
- **Perspective**: Top-down isometric view
- **Background**: Transparent

## Adding New Buildings

1. Add the building to `buildings_all - core_buildings_master.csv`
2. Set the `GraphicsFile` column to the desired filename
3. Place the graphic file in the appropriate category folder
4. The game will automatically load and use the graphic

## Fallback System

If a building's graphic file is missing:
1. The game will first try to load from the specified path
2. If that fails, it will try `default.png`
3. If that also fails, it will display a placeholder color block

This ensures the game continues to work even with missing graphics.