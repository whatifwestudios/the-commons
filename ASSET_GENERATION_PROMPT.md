# Game Asset Generation Prompt for The Commons

## Parcel Dimensions & Perspective

### Diamond Shape Specifications
- **Shape**: Perfect diamond (45° rotated square)
- **Display Dimensions**: 60px × 60px canvas
- **Actual Diamond**: 42px × 42px (30px sides at 45° rotation)
- **Aspect Ratio**: 1:1 (square canvas containing diamond)

### Viewing Angle
- **Perspective**: Isometric 3/4 view (30-45 degree angle)
- **Camera Position**: Elevated view looking down at approximately 35° from horizontal
- **Orientation**: Building faces toward bottom-right corner of diamond
- **Depth**: Subtle 3D with visible front and right sides of structures

## Building Asset Requirements

### Technical Specifications
- **Format**: PNG with transparent background
- **Resolution**: 128px × 128px (will be scaled to fit parcel)
- **Style**: Clean, slightly stylized/simplified architecture
- **Color Palette**: Vibrant but not oversaturated
- **Lighting**: Soft ambient light from top-left, subtle shadows

### Visual Guidelines
1. **Scale**: Buildings should fill 60-80% of the diamond parcel
2. **Base**: All buildings sit flush on the diamond surface
3. **Height**: Vary by building type (1-4 stories typical)
4. **Details**: Enough to be recognizable, not so much to be cluttered at small size
5. **Consistency**: Maintain same angle and lighting across all assets

### Example Prompt Template
"Create an isometric 3/4 view game asset of a [BUILDING TYPE] for a city-building game. The building should be viewed from a 35-degree elevated angle, facing toward the bottom-right. The structure sits on a diamond-shaped plot (rotated square). Style: clean, slightly stylized architecture with soft colors. Include subtle shadows and highlights. Transparent PNG background. Building should fill 70% of frame."

### Specific Building Examples

**Cottage**
"Cozy single-story house with peaked roof, small porch, white picket fence detail, warm yellow windows, chimney with slight smoke"

**Farmers Market**
"Open-air market structure with colorful awnings, visible produce stands, striped canvas tops, wooden stalls, small crowd indicators"

**Library**
"Classical two-story building with columns, large windows, steps leading to entrance, book symbol or sign, scholarly appearance"

**Solar Farm**
"Array of blue solar panels angled toward sun, support structures visible, small control building, clean/modern aesthetic"

## Diamond Parcel Grid Context
- Parcels connect edge-to-edge in a grid pattern
- Roads run between parcels in the gaps
- Buildings should leave small margin from parcel edges
- Multiple parcels can display as a continuous cityscape

## Color Coding by Category
- **Housing**: Warm tones (browns, beiges, warm grays)
- **Commercial**: Vibrant colors (blues, greens, purples)
- **Education**: Academic colors (brick red, ivy green)
- **Civic**: Official colors (navy, gray, gold accents)
- **Recreation**: Playful colors (bright greens, yellows, oranges)
- **Utilities**: Industrial colors (grays, metallics, technical blues)

## Export Settings
- PNG-24 with alpha channel
- sRGB color space
- Optimized for web (under 50KB per asset ideal)
- Consistent naming: category_buildingname.png