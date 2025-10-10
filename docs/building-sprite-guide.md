# Building Sprite Creation Guide for The Commons

## Overview
This guide provides exact specifications for creating building sprites that align perfectly with The Commons' isometric grid system.

## Critical Dimensions

### Canvas Size
- **Width**: 96 pixels (EXACT - do not deviate)
- **Height**: Variable based on building height
  - 1 story: ~100-120px
  - 2 stories: ~140-180px
  - 3+ stories: ~200-300px

### Isometric Grid Specifications
- **Tile Width**: 100px (building is 96px, 4px smaller for visual spacing)
- **Tile Height**: 50px (2:1 ratio for 30° isometric)
- **Diamond Base**: 96px wide at the bottom

## Diamond Footprint Coordinates

The building's base must form a diamond (rhombus) shape with these exact proportions:

```
Canvas width: 96px
Building base at canvas bottom (y = canvas height)

Diamond vertices (relative to canvas):
- Left point:   (0, y-24)      [midpoint of left edge]
- Top point:    (48, y-48)     [center top of diamond]
- Right point:  (96, y-24)     [midpoint of right edge]
- Bottom point: (48, y)        [center bottom - CANVAS EDGE]

Where y = canvas height (bottom edge)
```

## Visual Alignment Rules

### 1. Bottom Edge Alignment
- The building's bottom edge MUST touch y = canvas_height
- No padding, no floating
- The bottom center point of the diamond sits exactly at (48, canvas_height)

### 2. Width Alignment
- Building must span exactly 96px horizontally
- Left-most pixel at x = 0
- Right-most pixel at x = 95 (0-indexed)

### 3. Isometric Perspective
- **Angle**: 30° isometric (dimetric projection)
- **Visible Sides**: Front face and right face
- **Ratio**: Width to visible height should be 2:1 for the base diamond

### 4. Visual Depth
- Front face: Most prominent, facing bottom-left
- Right face: Secondary face, facing bottom-right
- Top face: May be visible for tall buildings
- Left and back faces: NOT visible

## Color & Style Guidelines

### Recommended Approach
- **Style**: Clean pixel art or simplified vector graphics
- **Colors**: Bright, saturated colors for visual clarity
- **Outlines**: Dark outlines (1-2px) for definition
- **Shadows**: Minimal or none (engine applies dynamic effects)
- **Background**: Fully transparent (PNG with alpha channel)

### Visual Effects (Applied by Engine)
The game engine will apply these effects automatically:
- Performance-based saturation (buildings lose color when performing poorly)
- Construction dimming (70% darker during construction)
- Condition sepia (aging buildings get brown tint)
- Hover tinting and opacity

Design your building with FULL saturation and brightness - the engine will adjust as needed.

## Common Mistakes to Avoid

### ❌ Floating Buildings
```
WRONG: Building has padding at bottom
[    Building    ]
[               ]  <- Empty space
----Canvas Bottom----
```

### ✅ Proper Alignment
```
CORRECT: Building touches bottom
[    Building    ]
----Canvas Bottom----
```

### ❌ Wrong Width
```
WRONG: Building too narrow (doesn't fill 96px)
  [  Building  ]
0              96
```

### ✅ Correct Width
```
CORRECT: Building spans full 96px
[   Building     ]
0               96
```

### ❌ Wrong Perspective
```
WRONG: Orthographic or wrong angle
+-------+
|       |  <- Front view only
|       |
+-------+
```

### ✅ Correct Perspective
```
CORRECT: 30° isometric with front and right visible
    /\
   /  \
  /    \
 /Front \
/--------\
|   ||   |  <- Right side visible
|   ||   |
+--------+
```

## Layer.ai Prompt Template

Use this template when generating buildings with Layer.ai:

```
Create an isometric building sprite with EXACT specifications:

BUILDING TYPE: [cottage/bakery/fire station/etc.]
STYLE: [pixel art/clean vector/hand-painted/etc.]

TECHNICAL REQUIREMENTS:
- Canvas: 96px width × [height]px
- Isometric angle: 30° (dimetric projection)
- Visible faces: Front (bottom-left) and right (bottom-right)
- Bottom edge MUST align with canvas bottom (y = height)
- Building MUST span full 96px width
- Transparent background (PNG)

VISUAL REQUIREMENTS:
- Diamond-shaped footprint (rhombus base)
- Front and right walls clearly visible
- Bright, saturated colors
- Clean outlines for definition
- Minimal/no shadows (engine handles this)

DIMENSIONS:
- Building base forms a diamond: 96px wide
- Building height: [specify for building type]
- No padding or margins
- Bottom center point at (48px, canvas_bottom)

OUTPUT: PNG with transparency, no padding
```

## Testing Your Sprite

### Quick Checklist
1. ✓ Canvas is exactly 96px wide?
2. ✓ Bottom edge of building touches canvas bottom?
3. ✓ Building spans left edge (x=0) to right edge (x=96)?
4. ✓ Front and right faces are both visible?
5. ✓ Perspective appears isometric (30° angle)?
6. ✓ Background is transparent?
7. ✓ Colors are bright and saturated?

### Visual Test
Place your sprite on a grid overlay to verify:
- Diamond footprint aligns with 96px × 48px diamond
- Building doesn't float or have bottom padding
- Left and right edges align with diamond left/right points

## Reference Buildings

Check these existing buildings in `assets/buildings/` for examples:
- **Small (1 story)**: `housing/cottage.png`, `commercial/corner_store.png`
- **Medium (2 stories)**: `commercial/bakery.png`, `education/library.png`
- **Large (3+ stories)**: `civic/fire_station.png`, `housing/apartments.png`

## Advanced: Multi-Tile Buildings (Future)

Currently, all buildings are single-tile (96px base). For future multi-tile buildings:
- 2×2 building: 192px wide × 96px deep diamond
- 3×3 building: 288px wide × 144px deep diamond
- Same alignment rules apply: bottom edge to canvas bottom

---

## Questions?

If a generated building doesn't align properly:
1. Check canvas width (must be 96px exactly)
2. Check bottom edge (must touch canvas bottom)
3. Check perspective (should show front + right faces)
4. Verify diamond footprint proportions

The rendering engine expects these exact dimensions - deviations will cause misalignment on the grid.
