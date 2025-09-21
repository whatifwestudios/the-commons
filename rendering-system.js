/**
 * Building Tint Manager
 * Handles on-demand generation and caching of building color variants
 */
class BuildingTintManager {
    constructor() {
        this.stockImages = new Map();        // "buildingId" -> Image (always loaded)
        this.tintedVariants = new Map();     // "buildingId:variant" -> Image (lazy loaded)
        this.placedBuildings = new Set();    // Track which buildings are actually placed
        this.variantUsage = new Map();       // Track last usage for cleanup
        this.generationPromises = new Map(); // Track ongoing generation to avoid duplicates

    }

    // Register a stock image when it loads
    registerStockImage(buildingId, image) {
        this.stockImages.set(buildingId, image);
    }

    // Ensure variants exist for a building type (called when building is placed)
    async ensureVariantsExist(buildingId) {
        if (this.placedBuildings.has(buildingId)) {
            return; // Already generated
        }

        // Check if generation is already in progress
        if (this.generationPromises.has(buildingId)) {
            return await this.generationPromises.get(buildingId);
        }

        // Start generation
        const generationPromise = this.generateVariantsForBuilding(buildingId);
        this.generationPromises.set(buildingId, generationPromise);

        try {
            await generationPromise;
            this.placedBuildings.add(buildingId);
        } finally {
            this.generationPromises.delete(buildingId);
        }
    }

    async generateVariantsForBuilding(buildingId) {
        const stockImage = this.stockImages.get(buildingId);
        if (!stockImage) {
            console.warn(`No stock image found for building: ${buildingId}`);
            return;
        }

        try {
            // Generate monochromatic yellow and blue variants
            const yellowImage = await this.applyMonochromaticFilter(stockImage, 'yellow');
            const blueImage = await this.applyMonochromaticFilter(stockImage, 'blue');

            this.tintedVariants.set(`${buildingId}:yellow`, yellowImage);
            this.tintedVariants.set(`${buildingId}:blue`, blueImage);

            console.log(`✨ Generated monochromatic variants for ${buildingId}`);
        } catch (error) {
            console.error(`Failed to generate variants for ${buildingId}:`, error);
        }
    }

    // Apply hue tint to an image using canvas processing
    async applyHueTint(sourceImage, hueRotate, saturation = 1.0, brightness = 1.0) {
        return new Promise((resolve, reject) => {
            try {
                // Create offscreen canvas for image processing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = sourceImage.width;
                canvas.height = sourceImage.height;

                // Apply CSS filter and draw the image
                ctx.filter = `hue-rotate(${hueRotate}deg) saturate(${saturation}) brightness(${brightness})`;
                ctx.drawImage(sourceImage, 0, 0);

                // Create new image from processed canvas
                const tintedImage = new Image();
                tintedImage.onload = () => resolve(tintedImage);
                tintedImage.onerror = reject;
                tintedImage.src = canvas.toDataURL();
            } catch (error) {
                reject(error);
            }
        });
    }

    // Apply monochromatic filter to create yellow or blue versions
    async applyMonochromaticFilter(sourceImage, color) {
        return new Promise((resolve, reject) => {
            try {
                // Create offscreen canvas for image processing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = sourceImage.width;
                canvas.height = sourceImage.height;

                // Draw the original image
                ctx.drawImage(sourceImage, 0, 0);

                // Get image data for pixel manipulation
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Define monochromatic color schemes
                const colorSchemes = {
                    yellow: { r: 255, g: 220, b: 0 },    // Bright yellow
                    blue: { r: 0, g: 120, b: 255 }       // Bright blue
                };

                const scheme = colorSchemes[color];
                if (!scheme) {
                    reject(new Error(`Unknown color scheme: ${color}`));
                    return;
                }

                // Process each pixel
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];

                    // Skip transparent pixels
                    if (alpha === 0) continue;

                    // Calculate grayscale value (luminance)
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;

                    // Apply the color scheme based on the grayscale intensity at 60% tint strength
                    const intensity = grayscale / 255;
                    const tintStrength = 0.6; // Reduce proximity tinting intensity to 60%

                    // Blend between original color and tinted color
                    const originalR = r;
                    const originalG = g;
                    const originalB = b;
                    const tintedR = scheme.r * intensity;
                    const tintedG = scheme.g * intensity;
                    const tintedB = scheme.b * intensity;

                    data[i] = originalR * (1 - tintStrength) + tintedR * tintStrength;     // Red
                    data[i + 1] = originalG * (1 - tintStrength) + tintedG * tintStrength; // Green
                    data[i + 2] = originalB * (1 - tintStrength) + tintedB * tintStrength; // Blue
                    // Alpha stays the same
                }

                // Put the modified image data back
                ctx.putImageData(imageData, 0, 0);

                // Create new image from processed canvas
                const monochromaticImage = new Image();
                monochromaticImage.onload = () => resolve(monochromaticImage);
                monochromaticImage.onerror = reject;
                monochromaticImage.src = canvas.toDataURL();
            } catch (error) {
                reject(error);
            }
        });
    }

    // Get image variant (stock, yellow, or blue)
    getVariantImage(buildingId, variant) {
        if (variant === 'stock') {
            return this.stockImages.get(buildingId);
        }

        // Track usage for cleanup
        this.variantUsage.set(`${buildingId}:${variant}`, Date.now());
        return this.tintedVariants.get(`${buildingId}:${variant}`);
    }

    // Check if variants are ready for a building
    hasVariants(buildingId) {
        return this.placedBuildings.has(buildingId);
    }

    // Clean up unused variants (called periodically)
    cleanupUnusedVariants(maxAgeMs = 300000) { // 5 minutes
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, lastUsed] of this.variantUsage.entries()) {
            if (now - lastUsed > maxAgeMs) {
                this.tintedVariants.delete(key);
                this.variantUsage.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} unused building variants`);
        }
    }

    // Clean up all variants for a specific building type
    cleanupBuildingVariants(buildingId) {
        this.tintedVariants.delete(`${buildingId}:yellow`);
        this.tintedVariants.delete(`${buildingId}:blue`);
        this.variantUsage.delete(`${buildingId}:yellow`);
        this.variantUsage.delete(`${buildingId}:blue`);
        this.placedBuildings.delete(buildingId);
        console.log(`🗑️ Cleaned up all variants for ${buildingId}`);
    }

}

/**
 * Rendering System for The Commons
 * Handles all canvas drawing, isometric rendering, and visual effects
 */

class RenderingSystem {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
        this.canvas = game.canvas;
        
        // Rendering parameters - will be set from game after canvas setup
        this.tileWidth = 40;  // Default fallback
        this.tileHeight = 20; // Default fallback
        this.elevationHeight = 8;
        
        // Performance optimization
        this.renderQueue = [];
        this.isRenderScheduled = false;
        this.lastRenderTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Visual effects
        this.currentElevation = 0;
        this.liftAmount = 10;
        this.bounceAnimation = null;
        
        // Cache for frequently used graphics
        this.buildingImageCache = new Map();
        this.imageLoadPromises = new Map();

        // Re-enabled: Building tint manager
        this.buildingTintManager = new BuildingTintManager();

        // Re-enabled: Periodic cleanup
        setInterval(() => {
            this.buildingTintManager.cleanupUnusedVariants();
        }, 300000);

        
        // Phase 5: Enhanced graphics features using freed computational resources
        this.enhancedEffects = {
            shadows: new Map(), // Building shadow cache
            lighting: { enabled: false, angle: 45, intensity: 0.7 }, // Dynamic lighting
            animations: new Map(), // Building animations (pulsing, breathing, etc.)
            weather: { type: 'clear', intensity: 0 } // Weather effects
        };
        
        // Phase 5: High-performance animation system
        this.animationFrame = null;
        this.deltaTime = 0;
        this.lastFrameTime = 0;
        this.performanceMode = 'high'; // 'low', 'medium', 'high'
    }
    
    /**
     * Initialize the rendering system
     */
    initialize() {
        this.setupCanvas();
        this.preloadImages();
        this.syncTileDimensions();
    }
    
    /**
     * Sync tile dimensions from game object
     */
    syncTileDimensions() {
        if (this.game.tileWidth && this.game.tileHeight) {
            this.tileWidth = this.game.tileWidth;
            this.tileHeight = this.game.tileHeight;
        }
    }
    
    /**
     * Setup canvas properties
     */
    setupCanvas() {
        // Enable image smoothing for better quality
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Set default styles
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
    }
    
    /**
     * Preload commonly used images
     */
    preloadImages() {
        // This could preload building images, UI elements, etc.
        // For now, images are loaded on-demand
    }
    
    /**
     * Main render method - draw the entire game scene
     */
    render() {
        // Performance monitoring
        if (this.game.perfMonitor) {
            this.game.perfMonitor.startFrame();
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw scene based on current layer
        this.drawScene();
        
        // Performance monitoring
        if (this.game.perfMonitor) {
            this.game.perfMonitor.endFrame();
            
            if (this.game.perfMonitor.frameCount % 60 === 0) {
                const stats = this.game.buildingSystem ? 
                    {
                        totalBuildings: this.game.buildingSystem.getTotalBuildingCount(),
                        populationCount: this.getTotalPopulation(),
                        activeRoutes: this.game.transportationSystem?.routes.length || 0
                    } : {};
                this.game.perfMonitor.updateGameStats(stats);
            }
        }
    }
    
    /**
     * Draw the complete game scene
     */
    drawScene() {
        // Check for mobility layer
        if (this.game.currentLayer === 'mobility') {
            if (this.game.mobilityLayer) {
                this.game.mobilityLayer.render(this.ctx);
            }
            return;
        }
        
        // Apply transformations
        this.ctx.save();
        this.ctx.translate(this.game.panOffset.x, this.game.panOffset.y);
        this.ctx.scale(this.game.zoomScale, this.game.zoomScale);
        
        // Draw grid
        this.drawIsometricGrid();
        
        // Draw overlays based on layer
        this.drawLayerOverlays();
        
        this.ctx.restore();
        
        // Draw dust clouds on top of everything (not affected by zoom/pan)
        if (this.game.renderDustClouds) {
            this.game.renderDustClouds();
        }
    }
    
    /**
     * Draw the main isometric grid
     */
    drawIsometricGrid() {
        this.ctx.beginPath();
        
        // Draw tiles in the correct isometric order (back to front)
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                this.drawTile(col, row);
            }
        }
        
        // Draw special effects
        this.drawSpecialEffects();
        
        this.ctx.stroke();
    }
    
    /**
     * Draw layer-specific overlays
     */
    drawLayerOverlays() {
        switch(this.game.currentLayer) {
            case 'transportation':
                this.drawTransportationOverlay();
                break;
            case 'land_values':
                this.drawLandValueOverlay();
                break;
            case 'cashflow':
                this.drawCashflowNumbers();
                break;
            default:
                // Normal building layer
                break;
        }
    }
    
    /**
     * Draw a single tile
     */
    drawTile(col, row, color = null, elevation = 0) {
        // Performance tracking
        if (this.game.perfMonitor) {
            this.game.perfMonitor.recordDraw('tile');
        }
        
        const iso = this.toIsometric(col, row);
        const elevationHeight = elevation * this.elevationHeight;
        const adjustedY = iso.y - elevationHeight;
        
        this.ctx.save();
        
        // Get parcel data
        const parcel = this.game.grid[row][col];
        const tileColor = color || this.getTileColor(parcel, row, col);
        
        // Draw tile shape
        this.ctx.fillStyle = tileColor;
        this.drawDiamond(iso.x, adjustedY, this.tileWidth, this.tileHeight);
        this.ctx.fill();
        
        // Draw parcel borders
        this.drawParcelBorders(row, col, this.tileWidth, this.tileHeight);
        
        // Draw building if present with unified rendering
        if (parcel && parcel.building && this.game.currentLayer !== 'mobility' && this.game.currentLayer !== 'players') {
            // Check for hover effect
            const isHovered = this.game.hoveredTile && this.game.hoveredTile.row === row && this.game.hoveredTile.col === col;
            const hoverOffset = isHovered ? -(this.game.currentElevation || 0) : 0;

            this.drawBuilding(parcel.building, 0, -this.tileHeight / 4 + hoverOffset, row, col, parcel);
        }
        
        this.ctx.restore();
    }
    
    /**
     * Draw diamond shape for isometric tiles
     */
    drawDiamond(x, y, width, height) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - height / 2); // Top
        this.ctx.lineTo(x + width / 2, y);  // Right
        this.ctx.lineTo(x, y + height / 2); // Bottom
        this.ctx.lineTo(x - width / 2, y);  // Left
        this.ctx.closePath();
    }
    
    /**
     * Get color for a tile based on its state
     */
    getTileColor(parcel, row, col) {
        // Handle layer-specific coloring first
        switch(this.game.currentLayer) {
            case 'landvalue':
                // New land value heatmap implementation
                return this.game.getTileColor(row, col);
            case 'cashflow':
                // New cashflow heatmap implementation  
                return this.game.getTileColor(row, col);
            case 'mobility':
                return this.game.getMobilityLayerColor(row, col);
            case 'players':
                // Players layer filtering
                if (!parcel || !parcel.owner) {
                    return '#2a2a2a'; // Unowned - charcoal gray
                }
                if (this.game.filteredPlayerId) {
                    // Show filtered player in full color, others dimmed
                    if (parcel.owner === this.game.filteredPlayerId) {
                        return this.getPlayerColor(parcel.owner);
                    } else {
                        return 'rgba(60, 60, 60, 0.3)'; // Dimmed for non-filtered players
                    }
                } else {
                    // No filter - show all players normally
                    return this.getPlayerColor(parcel.owner);
                }
                break;
            case 'normal':
            default:
                // Fall through to normal logic
                break;
        }
        
        // Normal layer logic
        if (!parcel) return '#2a2a2a'; // Unowned - charcoal gray
        
        // Under construction
        if (parcel._isUnderConstruction) {
            return '#8B4513'; // Brown for construction
        }
        
        // Based on owner
        if (!parcel.owner) {
            return '#2a2a2a'; // Unowned - charcoal gray
        } else {
            return this.getPlayerColor(parcel.owner);
        }
    }
    
    /**
     * Check if the given owner is the current player
     */
    isCurrentPlayer(owner) {
        if (owner === 'player') return true; // Legacy single-player mode
        if (this.game.multiplayerManager && this.game.multiplayerManager.playerId) {
            return owner === this.game.multiplayerManager.playerId;
        }
        return false;
    }

    /**
     * Get building category color
     */
    getBuildingCategoryColor(category) {
        const colors = {
            residential: '#4CAF50',
            commercial: '#2196F3',
            industrial: '#FF9800',
            civic: '#9C27B0',
            utilities: '#FFC107',
            agriculture: '#8BC34A'
        };
        return colors[category] || '#666';
    }

    /**
     * Get color for a multiplayer participant
     */
    getPlayerColor(playerId) {
        if (!playerId) return '#6a6a6a';
        
        // Get color from multiplayer manager if available
        if (this.game.multiplayerManager && this.game.multiplayerManager.players.has(playerId)) {
            const player = this.game.multiplayerManager.players.get(playerId);
            if (player.color) {
                // Convert hex color to rgba with transparency
                return this.hexToRgba(player.color, 0.4);
            }
        }
        
        // Fallback: deterministic colors based on player ID
        const colors = [
            'rgba(33, 150, 243, 0.4)',  // Blue
            'rgba(255, 152, 0, 0.4)',   // Orange  
            'rgba(156, 39, 176, 0.4)',  // Purple
            'rgba(255, 193, 7, 0.4)',   // Amber
            'rgba(244, 67, 54, 0.4)',   // Red
            'rgba(96, 125, 139, 0.4)',  // Blue Grey
            'rgba(139, 195, 74, 0.4)',  // Light Green
            'rgba(255, 87, 34, 0.4)'    // Deep Orange
        ];
        
        // Hash player ID to get consistent color
        let hash = 0;
        for (let i = 0; i < playerId.length; i++) {
            hash = ((hash << 5) - hash) + playerId.charCodeAt(i);
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return colors[Math.abs(hash) % colors.length];
    }
    
    /**
     * Convert hex color to rgba with transparency
     */
    hexToRgba(hex, alpha = 1) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    /**
     * Draw parcel borders
     */
    drawParcelBorders(row, col, tileWidth, tileHeight) {
        const parcel = this.game.grid[row][col];
        
        // Different border styles based on state
        if (parcel && parcel.owner) {
            // Get border color using ColorUtils
            this.ctx.strokeStyle = window.ColorUtils?.getPlayerBorderColor(parcel.owner, this.game) ||
                                  (this.isCurrentPlayer(parcel.owner) ? '#4CAF50' : '#999');
            this.ctx.lineWidth = 2;
        } else {
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
        }
        
        // Draw border (already in diamond shape from drawTile)
        this.ctx.stroke();
    }
    
    /**
     * Unified building rendering method
     * Handles construction state, performance effects, and all visual states
     */
    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row, col, parcel = null) {
        if (this.game.perfMonitor) {
            this.game.perfMonitor.recordDraw('building');
        }

        const building = this.game.buildingManager?.getBuildingById(buildingId);
        if (!building) return;

        // Use passed parcel or get from grid
        if (!parcel) {
            parcel = this.game.grid[row][col];
        }
        if (!parcel) return;

        const iso = this.toIsometric(col, row);
        const x = iso.x + offsetX;
        const y = iso.y + offsetY + this.currentElevation;

        // Calculate construction progress
        let constructionProgress = 1.0;
        let isUnderConstruction = false;

        if (parcel._isUnderConstruction ||
            (parcel.constructionStartDay !== null && parcel.constructionDays > 0)) {

            if (parcel._constructionProgress !== undefined) {
                constructionProgress = parcel._constructionProgress;
                isUnderConstruction = constructionProgress < 1.0;
            } else if (parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
                const totalConstructionTimeMs = parcel.constructionDays * this.game.dayDuration;
                const elapsedTimeMs = (this.game.currentDay - parcel.constructionStartDay) * this.game.dayDuration +
                                      (performance.now() - (this.game.lastDayStartTime || Date.now()));

                if (elapsedTimeMs < totalConstructionTimeMs) {
                    constructionProgress = Math.max(0, Math.min(1.0, elapsedTimeMs / totalConstructionTimeMs));
                    isUnderConstruction = true;
                }
            }
        }

        // Get performance data for completed buildings
        let performancePercent = 100;
        if (!isUnderConstruction) {
            if (this.game.buildingSystem) {
                performancePercent = this.game.buildingSystem.getBuildingEfficiency(row, col);
            }
        }

        // Draw building with all states
        this.renderBuildingUnified(building, x, y, row, col, {
            constructionProgress,
            isUnderConstruction,
            performancePercent
        });

        // Add efficiency hazard indicator if needed (only for completed buildings)
        if (!isUnderConstruction && performancePercent < 80) {
            this.drawEfficiencyIndicator(row, col, iso.x, iso.y);
        }
    }
    
    /**
     * Unified building rendering with all visual effects
     */
    renderBuildingUnified(building, x, y, row, col, state) {
        const imagePath = building.graphicsFile || building.graphics?.path || building.images?.built || `assets/buildings/default.svg`;

        // Check cache first
        if (this.buildingImageCache.has(imagePath)) {
            const img = this.buildingImageCache.get(imagePath);
            if (img.complete) {
                // Re-enabled: Ensure stock image is registered with tint manager
                this.buildingTintManager.registerStockImage(building.name, img);
                this.renderBuildingImageUnified(img, x, y, building.name, row, col, state);
                return;
            }
        }

        // Load image if not cached
        if (!this.imageLoadPromises.has(imagePath)) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    this.buildingImageCache.set(imagePath, img);
                    // Re-enabled: Register stock image with tint manager
                    this.buildingTintManager.registerStockImage(building.name, img);
                    resolve(img);
                };
                img.onerror = () => reject(new Error(`Failed to load ${imagePath}`));
            });

            this.imageLoadPromises.set(imagePath, promise);
            img.src = imagePath;
        }

        // Use fallback while loading
        this.renderBuildingFallbackUnified(building, x, y, state);

        // Try to render when loaded
        this.imageLoadPromises.get(imagePath).then(img => {
            if (img.complete) {
                this.game.scheduleRender();
            }
        }).catch(() => {
            // Image failed to load, continue with fallback
        });
    }
    
    /**
     * Render building image with unified visual effects
     */
    renderBuildingImageUnified(img, x, y, buildingName, row, col, state) {
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 22;

        // Fill diamond width completely (preserving aspect ratio)
        const baseDrawWidth = this.tileWidth * widthMultiplier;
        const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;

        // Position building properly on tile
        const imageY = y + this.tileHeight/2 - baseDrawHeight + yOffset;
        const elevationOffset = this.currentElevation;

        // Enhanced shadow rendering
        const parcelId = `${row}-${col}`;
        this.renderEnhancedShadow(x, imageY, baseDrawWidth, baseDrawHeight, elevationOffset, parcelId);

        // Apply hybrid tinting system
        this.ctx.save();

        // Re-enabled: Building tinting system with proper context management
        // Step 1: Determine base variant and proximity state
        const tileKey = `${row},${col}`;
        const extendedKey = `${row},${col}:extended`;
        let baseVariant = 'stock';
        let applyPerformanceFilter = true;

        // Check for proximity tinting (overrides performance)
        if (this.game.hoverInfluenceRadius) {
            if (this.game.hoverInfluenceRadius.has(extendedKey)) {
                baseVariant = 'blue';
                applyPerformanceFilter = false; // Proximity overrides performance
            } else if (this.game.hoverInfluenceRadius.has(tileKey)) {
                baseVariant = 'yellow';
                applyPerformanceFilter = false; // Proximity overrides performance
            }
        }

        // Step 2: Get the appropriate image variant (instant swap)
        let buildingImage = this.getVariantImageSafe(buildingName, baseVariant);

        // Step 3: Apply performance-based filters if not overridden by proximity
        let filterEffects = '';
        if (state.isUnderConstruction) {
            // Under construction: always desaturated regardless of proximity
            filterEffects = 'sepia(0.8) saturate(30%) brightness(0.6) contrast(0.7)';
        } else if (applyPerformanceFilter) {
            // Apply performance-based desaturation in 10% increments
            const performance = state.performancePercent;
            const desaturationLevel = Math.max(0, Math.min(100, Math.round((100 - performance) / 10) * 10));

            if (desaturationLevel > 0) {
                const saturationPercent = 100 - desaturationLevel;
                filterEffects = `saturate(${saturationPercent}%)`;
            }
        }

        if (filterEffects) {
            this.ctx.filter = filterEffects;
        }

        // Dynamic lighting effects (if enabled)
        if (this.enhancedEffects.lighting.enabled && this.performanceMode === 'high') {
            this.applyDynamicLighting(x, imageY, baseDrawWidth, baseDrawHeight);
        }

        // Draw building (instant swap)
        this.ctx.drawImage(
            buildingImage,
            x - baseDrawWidth/2,
            imageY + elevationOffset,
            baseDrawWidth,
            baseDrawHeight
        );


        // Explicitly reset filter before restoring context (critical for avoiding black parcels)
        this.ctx.filter = 'none';

        // Restore context
        this.ctx.restore();

    }

    // Helper method to safely get variant images with fallback
    getVariantImageSafe(buildingName, variant) {
        if (variant === 'stock') {
            return this.buildingTintManager.stockImages.get(buildingName);
        }

        // Ensure variants exist (generate on-demand if needed)
        if (!this.buildingTintManager.hasVariants(buildingName)) {
            this.buildingTintManager.ensureVariantsExist(buildingName);
            // Return stock image while variants are being generated
            return this.buildingTintManager.stockImages.get(buildingName);
        }

        const variantImage = this.buildingTintManager.getVariantImage(buildingName, variant);
        return variantImage || this.buildingTintManager.stockImages.get(buildingName);
    }

    
    /**
     * Render fallback building with unified effects
     */
    renderBuildingFallbackUnified(building, x, y, state) {
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 22;

        // Fallback buildings use a standard aspect ratio (4:3)
        const buildingWidth = this.tileWidth * widthMultiplier;
        const buildingHeight = (buildingWidth * 0.75) * heightMultiplier;

        const buildingY = y + this.tileHeight/2 - buildingHeight + yOffset;
        const baseColor = window.ColorUtils?.getBuildingColor(building.category) || '#666';

        this.ctx.save();

        // Apply state-based visual effects
        if (state.isUnderConstruction) {
            // Under construction: partial height and desaturated
            const revealHeight = Math.floor(buildingHeight * state.constructionProgress);
            if (revealHeight > 0) {
                this.ctx.fillStyle = baseColor;
                this.ctx.globalAlpha = 0.6; // Dimmed
                this.ctx.fillRect(
                    x - buildingWidth/2,
                    buildingY + this.currentElevation + (buildingHeight - revealHeight),
                    buildingWidth,
                    revealHeight
                );
            }
        } else {
            // Completed building with performance-based coloring
            let color = baseColor;
            let alpha = 1.0;

            if (state.performancePercent < 50) {
                // Poor performance: red tint and pulsing alpha
                color = '#cc4444';
                alpha = 0.7 + (Math.sin(Date.now() / 800) * 0.2);
            } else if (state.performancePercent < 80) {
                // Medium performance: orange tint
                color = '#cc8844';
                alpha = 0.9;
            }

            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillRect(x - buildingWidth/2, buildingY + this.currentElevation, buildingWidth, buildingHeight);

            // Draw building name only if fully constructed
            this.ctx.globalAlpha = 1.0;
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                building.name.substring(0, 8),
                x,
                buildingY + buildingHeight + this.currentElevation + 10
            );
        }

        this.ctx.restore();
    }
    
    
    
    
    
    
    /**
     * Draw construction overlay
     */
    drawConstructionOverlay(x, y, progress) {
        const size = 32;
        const barHeight = 4;
        
        // Draw progress bar background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x - size/2, y + size/2 - barHeight, size, barHeight);
        
        // Draw progress bar fill
        this.ctx.fillStyle = '#4CAF50';
        this.ctx.fillRect(x - size/2, y + size/2 - barHeight, size * progress, barHeight);
        
        // Draw construction icon
        this.ctx.fillStyle = '#FF9800';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🚧', x, y - 10);
    }
    
    /**
     * Draw special effects (parcel reach, selection, etc.)
     */
    drawSpecialEffects() {
        // Draw hover influence radius FIRST (so it appears under other highlights)
        if (this.game.hoverInfluenceRadius && this.game.hoverInfluenceRadius.size > 0) {
            this.drawHoverInfluenceRadius();
            // Note: Building tints are now applied during building rendering via CSS filters
        }

        // Draw white border for the core hovered parcel
        if (this.game.hoveredTile) {
            this.drawHoveredParcelBorder();
        }
        
        // Draw parcel reach if active
        if (this.game.selectedParcel) {
            this.drawParcelReach();
        }
        
        // Draw selected tile highlight
        if (this.game.selectedTile) {
            this.drawSelectedTileHighlight();
        }
    }
    
    /**
     * Draw white border for the core hovered parcel
     */
    drawHoveredParcelBorder() {
        if (!this.game.hoveredTile) return;
        
        const { row, col } = this.game.hoveredTile;
        const iso = this.toIsometric(col, row);
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.8;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; // White
        this.ctx.lineWidth = 2;
        
        // Draw diamond border for the hovered parcel
        this.drawDiamond(iso.x, iso.y, this.tileWidth, this.tileHeight);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    /**
     * Draw hover influence radius with border highlights for adjacent vs road-connected
     */
    drawHoverInfluenceRadius() {
        if (!this.game.hoverInfluenceRadius) return;

        this.ctx.save();

        // Draw influence tiles with different border colors based on connection type
        this.game.hoverInfluenceRadius.forEach(tileKey => {
            const isExtended = tileKey.includes(':extended');
            const actualKey = isExtended ? tileKey.split(':')[0] : tileKey;
            const [row, col] = actualKey.split(',').map(Number);

            // Skip drawing borders on parcels that have buildings (they get building tints instead)
            const parcel = this.game.grid[row][col];
            if (parcel && parcel.building) {
                return; // Skip this tile - let building tinting handle the visual effect
            }

            const iso = this.toIsometric(col, row);

            // Different styling for adjacent vs road-connected
            if (isExtended) {
                // Road-connected tiles: blue border showing transportation reach
                this.ctx.globalAlpha = 0.4;
                this.ctx.strokeStyle = 'rgba(33, 150, 243, 1)';
                this.ctx.lineWidth = 2;
            } else {
                // Adjacent tiles: yellow border for immediate neighbors
                this.ctx.globalAlpha = 0.4;
                this.ctx.strokeStyle = 'rgba(255, 235, 59, 1)'; // Soft yellow
                this.ctx.lineWidth = 1.5;
            }

            // Draw diamond border only
            this.drawDiamond(iso.x, iso.y, this.tileWidth, this.tileHeight);
            this.ctx.stroke();
        });

        this.ctx.restore();
    }


    /**
     * Draw parcel reach visualization
     */
    drawParcelReach() {
        if (!this.game.parcelReach?.reachable) return;
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#4CAF50';
        
        for (const reachableKey of this.game.parcelReach.reachable) {
            const [row, col] = reachableKey.split(',').map(Number);
            const iso = this.toIsometric(col, row);
            this.drawDiamond(iso.x, iso.y, this.tileWidth, this.tileHeight);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    /**
     * Draw selected tile highlight
     */
    drawSelectedTileHighlight() {
        const { row, col } = this.game.selectedTile;
        const iso = this.toIsometric(col, row);
        
        this.ctx.save();
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 3;
        this.drawDiamond(iso.x, iso.y, this.tileWidth + 4, this.tileHeight + 2);
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * Draw transportation overlay
     */
    drawTransportationOverlay() {
        this.drawParcelLandValues();
        // Additional transportation-specific rendering could go here
    }
    
    /**
     * Draw land values on parcels
     */
    drawParcelLandValues() {
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (parcel?.landValue) {
                    this.drawLandValueLabel(row, col, parcel.landValue.current || 0);
                }
            }
        }
    }
    
    /**
     * Draw land value label on a parcel
     */
    drawLandValueLabel(row, col, landValue) {
        const iso = this.toIsometric(col, row);
        const formatted = landValue >= 1000 ? 
            `$${(landValue/1000).toFixed(0)}k` : 
            `$${landValue.toFixed(0)}`;
        
        this.ctx.font = '8px SF Mono, Monaco, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        
        // Draw text with outline
        this.ctx.strokeText(formatted, iso.x, iso.y + 3);
        this.ctx.fillText(formatted, iso.x, iso.y + 3);
    }
    
    /**
     * Draw land value overlay
     */
    drawLandValueOverlay() {
        // Could add heat map visualization here
        this.drawParcelLandValues();
    }
    
    /**
     * Convert grid coordinates to isometric screen coordinates
     */
    toIsometric(col, row) {
        return window.CoordinateUtils?.toIsometric(
            col, row, this.tileWidth, this.tileHeight,
            this.game.offsetX || 0, this.game.offsetY || 0
        ) || {
            x: (col - row) * (this.tileWidth / 2) + (this.game.offsetX || 0),
            y: (col + row) * (this.tileHeight / 2) + (this.game.offsetY || 0)
        };
    }

    /**
     * Convert isometric screen coordinates to grid coordinates
     */
    fromIsometric(screenX, screenY) {
        return window.CoordinateUtils?.fromIsometric(
            screenX, screenY, this.tileWidth, this.tileHeight,
            this.game.offsetX || 0, this.game.offsetY || 0, this.game.gridSize
        ) || (() => {
            const x = screenX - (this.game.offsetX || 0);
            const y = screenY - (this.game.offsetY || 0);

            const col = Math.round((x / (this.tileWidth / 2) + y / (this.tileHeight / 2)) / 2);
            const row = Math.round((y / (this.tileHeight / 2) - x / (this.tileWidth / 2)) / 2);

            // Validate bounds - return null if outside 12x12 grid
            if (row < 0 || row >= 12 || col < 0 || col >= 12) {
                return null;
            }

            return { col, row };
        })();
    }
    
    /**
     * Schedule a render on the next animation frame
     */
    scheduleRender() {
        if (this.isRenderScheduled) return;
        
        this.isRenderScheduled = true;
        requestAnimationFrame((timestamp) => {
            if (timestamp - this.lastRenderTime >= this.frameInterval) {
                this.render();
                this.lastRenderTime = timestamp;
            }
            this.isRenderScheduled = false;
        });
    }
    
    /**
     * Start bounce animation for building placement
     */
    startBounceAnimation() {
        this.currentElevation = 0;
        this.elevationVelocity = -4; // Start moving up
        
        const animate = () => {
            this.elevationVelocity += 0.8; // Gravity
            this.currentElevation += this.elevationVelocity;
            
            // Bounce when hitting ground
            if (this.currentElevation >= 0) {
                this.currentElevation = 0;
                this.elevationVelocity *= -0.6; // Damping
            }
            
            this.scheduleRender();
            
            // Continue animation if still bouncing
            if (Math.abs(this.elevationVelocity) > 0.01) {
                this.bounceAnimation = requestAnimationFrame(animate);
            } else {
                this.startContinuousBob();
            }
        };
        
        this.bounceAnimation = requestAnimationFrame(animate);
    }
    
    /**
     * Start continuous bobbing animation
     */
    startContinuousBob() {
        let startTime = Date.now();
        
        const bob = () => {
            const elapsed = Date.now() - startTime;
            const bobOffset = Math.sin(elapsed / 1000) * 2; // 2px amplitude
            this.currentElevation = this.liftAmount + bobOffset;
            
            this.scheduleRender();
            this.bounceAnimation = requestAnimationFrame(bob);
        };
        
        this.bounceAnimation = requestAnimationFrame(bob);
    }
    
    /**
     * Stop bounce animation
     */
    stopBounceAnimation() {
        if (this.bounceAnimation) {
            cancelAnimationFrame(this.bounceAnimation);
            this.bounceAnimation = null;
        }
        
        // Gradually return to ground
        const returnToGround = () => {
            if (this.currentElevation > 0.1) {
                this.currentElevation *= 0.9;
                this.scheduleRender();
                requestAnimationFrame(returnToGround);
            } else {
                this.currentElevation = 0;
                this.scheduleRender();
            }
        };
        
        requestAnimationFrame(returnToGround);
    }
    
    /**
     * Get total population for performance stats
     */
    getTotalPopulation() {
        let total = 0;
        if (!this.game.grid) return 0;
        
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (parcel && parcel.population) {
                    total += parcel.population;
                }
            }
        }
        return total;
    }
    
    /**
     * Clear image cache
     */
    clearImageCache() {
        this.buildingImageCache.clear();
        this.imageLoadPromises.clear();
    }
    
    /**
     * Draw efficiency hazard indicator for buildings under 80% efficiency
     */
    drawEfficiencyIndicator(row, col, x, y) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return;
        
        // Don't show hazard during construction
        if (parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
            const totalConstructionTimeMs = parcel.constructionDays * this.game.dayDuration;
            const elapsedTimeMs = (this.game.currentDay - parcel.constructionStartDay) * this.game.dayDuration + 
                                  (performance.now() - (this.game.lastDayStartTime || Date.now()));
            
            if (elapsedTimeMs < totalConstructionTimeMs) {
                return; // Still under construction
            }
        }
        
        // Get building efficiency from the economic engine
        const efficiency = this.game.buildingEfficiencies?.get(`${row},${col}`) || 1.0;
        
        // Only show hazard if efficiency is below 80%
        if (efficiency >= 0.8) return;
        
        // Calculate building height to position hazard above it
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        
        // Calculate building dimensions (same logic as in renderBuildingImage)
        const baseDrawWidth = this.tileWidth * widthMultiplier;
        // Assume standard 4:3 aspect ratio for buildings when we can't get actual image dimensions
        const baseDrawHeight = (baseDrawWidth * 0.75) * heightMultiplier;
        
        // Position hazard 10px above the top of the building
        const buildingTop = y + this.tileHeight/2 - baseDrawHeight + yOffset;
        const hazardY = buildingTop - 10;
        
        // Draw hazard emoji at fixed position above building
        this.ctx.save();
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Draw with slight shadow for visibility
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillText('⚠️', x + 1, hazardY + 1);
        
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillText('⚠️', x, hazardY);
        
        this.ctx.restore();
    }
    
    /**
     * Draw parcel reach visualization with animations
     */
    drawParcelReach() {
        if (!this.game.parcelReach || !this.game.selectedParcel) return;
        
        // Create a set of all reachable parcels including the selected one
        const allReachable = new Set(this.game.parcelReach);
        allReachable.add(`${this.game.selectedParcel.row},${this.game.selectedParcel.col}`);
        
        this.ctx.save();
        
        // Calculate animation values using time
        const time = Date.now() / 1000; // Convert to seconds
        const pulseAmount = Math.sin(time * 2) * 0.5 + 0.5; // Oscillates between 0 and 1
        const glowAmount = Math.sin(time * 3) * 0.3 + 0.7; // Faster, smaller oscillation for glow
        
        // Animated fill for reachable area with pulsing opacity
        const baseOpacity = 0.04;
        const maxOpacity = 0.08;
        const fillOpacity = baseOpacity + (maxOpacity - baseOpacity) * pulseAmount;
        this.ctx.fillStyle = `rgba(255, 215, 0, ${fillOpacity})`; // Pulsing yellow fill
        
        allReachable.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const iso = this.toIsometric(c, r);
            const tile = this.game.grid[r][c];
            const elevation = tile ? tile.elevation * 8 : 0;
            
            this.ctx.beginPath();
            this.ctx.moveTo(iso.x, iso.y - elevation - this.tileHeight / 2);
            this.ctx.lineTo(iso.x + this.tileWidth / 2, iso.y - elevation);
            this.ctx.lineTo(iso.x, iso.y - elevation + this.tileHeight / 2);
            this.ctx.lineTo(iso.x - this.tileWidth / 2, iso.y - elevation);
            this.ctx.closePath();
            this.ctx.fill();
        });
        
        // Animated border with glow effect
        this.ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
        this.ctx.shadowBlur = 3 + (2 * glowAmount); // Animated glow
        
        // Draw only the outer border of the reachable area
        const borderOpacity = 0.25 + (0.15 * glowAmount); // Oscillating border opacity
        this.ctx.strokeStyle = `rgba(255, 215, 0, ${borderOpacity})`;
        this.ctx.lineWidth = 1 + (0.5 * pulseAmount); // Subtle width animation
        
        // Animated dash pattern
        const dashOffset = (time * 10) % 5; // Animate dash movement
        this.ctx.lineDashOffset = dashOffset;
        this.ctx.setLineDash([3, 2]); // Subtle dashed line
        
        // Find and draw only the perimeter of the reachable area
        this.drawReachPerimeter(allReachable);
        
        // Reset shadow for selected parcel
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
        
        // Highlight the selected parcel itself with animated glow
        const iso = this.toIsometric(this.game.selectedParcel.col, this.game.selectedParcel.row);
        const tile = this.game.grid[this.game.selectedParcel.row][this.game.selectedParcel.col];
        const elevation = tile ? tile.elevation * 8 : 0;
        
        // Strong glow for selected parcel to make it stand out
        this.ctx.shadowColor = 'rgba(255, 215, 0, 1)';
        this.ctx.shadowBlur = 5 + (3 * pulseAmount); // Stronger glow for selected
        
        this.ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + 0.2 * glowAmount})`; // Brighter yellow for selected
        this.ctx.lineWidth = 2 + (0.5 * pulseAmount); // Thicker, animated line
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(iso.x, iso.y - elevation - this.tileHeight / 2);
        this.ctx.lineTo(iso.x + this.tileWidth / 2, iso.y - elevation);
        this.ctx.lineTo(iso.x, iso.y - elevation + this.tileHeight / 2);
        this.ctx.lineTo(iso.x - this.tileWidth / 2, iso.y - elevation);
        this.ctx.closePath();
        this.ctx.stroke();

        // Reset shadow properties before restore
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
        this.ctx.restore();
        
        // Request animation frame to keep the animation running
        if (this.game.parcelReach) {
            requestAnimationFrame(() => {
                if (this.game.parcelReach) {
                    this.game.scheduleRender();
                }
            });
        }
    }
    
    /**
     * Draw perimeter of reachable parcels
     */
    drawReachPerimeter(reachableParcels) {
        // Find parcels that are on the edge of the reachable area
        const edgeParcels = new Set();
        
        reachableParcels.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            
            // Check if this parcel has at least one non-reachable neighbor
            const neighbors = [
                [r-1, c], [r+1, c], [r, c-1], [r, c+1],
                [r-1, c-1], [r-1, c+1], [r+1, c-1], [r+1, c+1]
            ];
            
            const hasUnreachableNeighbor = neighbors.some(([nr, nc]) => {
                if (nr < 0 || nr >= this.game.gridSize || nc < 0 || nc >= this.game.gridSize) {
                    return true; // Out of bounds counts as unreachable
                }
                return !reachableParcels.has(`${nr},${nc}`);
            });
            
            if (hasUnreachableNeighbor) {
                edgeParcels.add(key);
            }
        });
        
        // Draw only the edge parcels
        edgeParcels.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const iso = this.toIsometric(c, r);
            const tile = this.game.grid[r][c];
            const elevation = tile ? tile.elevation * 8 : 0;
            
            this.ctx.beginPath();
            this.ctx.moveTo(iso.x, iso.y - elevation - this.tileHeight / 2);
            this.ctx.lineTo(iso.x + this.tileWidth / 2, iso.y - elevation);
            this.ctx.lineTo(iso.x, iso.y - elevation + this.tileHeight / 2);
            this.ctx.lineTo(iso.x - this.tileWidth / 2, iso.y - elevation);
            this.ctx.closePath();
            this.ctx.stroke();
        });
    }
    
    /**
     * Draw cashflow numbers on parcels
     */
    drawCashflowNumbers() {
        // Draw cashflow numbers on each parcel
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const cashflow = this.game.getParcelCashflow ? this.game.getParcelCashflow(row, col) : 0;
                
                if (Math.abs(cashflow) >= 0.1) {
                    const iso = this.toIsometric(col, row);
                    this.drawCashflowNumber(iso.x, iso.y, cashflow);
                }
            }
        }
    }
    
    /**
     * Draw a single cashflow number
     */
    drawCashflowNumber(x, y, cashflow) {
        this.ctx.save();
        this.ctx.translate(x, y);
        
        // Format the cashflow number
        const formatted = cashflow >= 0 ? `+$${cashflow.toFixed(1)}` : `-$${Math.abs(cashflow).toFixed(1)}`;
        const color = cashflow >= 0 ? '#4caf50' : '#f44336';
        
        // Draw text with outline for visibility
        this.ctx.font = '8px SF Mono, Monaco, monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeText(formatted, 0, 3);
        this.ctx.fillStyle = color;
        this.ctx.fillText(formatted, 0, 3);
        
        this.ctx.restore();
    }
    
    
    /**
     * Draw JEFH warning indicators for buildings with efficiency issues
     */
    drawJEFHWarningIndicators(buildingId, offsetX, offsetY, row, col) {
        // Don't show indicators for buildings under construction
        const parcel = this.game.grid[row][col];
        if (parcel?.constructionStartDay !== null && parcel?.constructionDays > 0) {
            const isUnderConstruction = (this.game.currentDay - parcel.constructionStartDay) < parcel.constructionDays;
            if (isUnderConstruction) {
                return; // Hide indicators during construction
            }
        }
        
        // Get building efficiency data
        const key = `${row},${col}`;
        const efficiencyData = this.game.buildingEfficiencies?.get(key);
        
        if (!efficiencyData || !efficiencyData.needs) {
            return; // No efficiency data available
        }
        
        // Check satisfaction levels for JEFH categories
        const jefhCategories = ['jobs', 'education', 'food', 'housing'];
        const warningThreshold = 0.6; // Show warnings when satisfaction < 60%
        const criticalThreshold = 0.3; // Critical level < 30%
        
        const warnings = [];
        jefhCategories.forEach(category => {
            const need = efficiencyData.needs[category];
            if (need && need.satisfaction < warningThreshold) {
                warnings.push({
                    category,
                    satisfaction: need.satisfaction,
                    critical: need.satisfaction < criticalThreshold
                });
            }
        });
        
        
        if (warnings.length === 0) {
            return; // No warnings to display
        }
        
        // Show only the MOST critical indicator - find worst satisfaction level
        let mostCritical = warnings[0];
        for (let i = 1; i < warnings.length; i++) {
            if (warnings[i].satisfaction < mostCritical.satisfaction) {
                mostCritical = warnings[i];
            }
        }
        
        // Check if this is a workplace building for worker indicator display
        const building = this.game.buildingManager?.getBuildingById(buildingId);
        const isWorkplace = building && (this.game.buildingCategories?.normalize(building.category) === 'commercial' || building.category === 'education');
        
        // Draw single warning indicator (most critical)
        this.ctx.save();
        
        const indicatorSize = 8;
        const x = offsetX - indicatorSize / 2; // Center horizontally
        
        // Static Y position based on severity
        const severityOffset = mostCritical.critical ? -8 : 0; // Critical issues higher up
        const y = offsetY - 25 + severityOffset;
        
        // Choose color based on severity
        const color = mostCritical.critical ? '#ff4444' : '#ffaa00';
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        
        if (mostCritical.critical) {
            // Draw triangle for critical warnings
            this.ctx.beginPath();
            this.ctx.moveTo(x + indicatorSize / 2, y);
            this.ctx.lineTo(x, y + indicatorSize);
            this.ctx.lineTo(x + indicatorSize, y + indicatorSize);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            // Add exclamation mark
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '6px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('!', x + indicatorSize / 2, y + indicatorSize - 2);
        } else {
            // Draw circle for regular warnings
            this.ctx.beginPath();
            this.ctx.arc(x + indicatorSize / 2, y + indicatorSize / 2, indicatorSize / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Add letter based on category
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '5px Arial';
            this.ctx.textAlign = 'center';
            
            // Show 'W' for workers when housing represents worker need
            let displayLetter = mostCritical.category[0].toUpperCase();
            if (mostCritical.category === 'housing' && isWorkplace) {
                displayLetter = 'W'; // Workers
            }
            
            this.ctx.fillText(displayLetter, x + indicatorSize / 2, y + indicatorSize / 2 + 2);
        }
        
        this.ctx.restore();
    }
    
    /**
     * Phase 5: Enhanced shadow rendering with caching
     */
    renderEnhancedShadow(x, y, width, height, elevationOffset, parcelId) {
        if (elevationOffset <= 0 && this.performanceMode === 'low') return;
        
        // Use cached shadow if available in high performance mode
        const shadowKey = `${parcelId}-${Math.round(elevationOffset)}`;
        if (this.performanceMode === 'high' && this.enhancedEffects.shadows.has(shadowKey)) {
            const cachedShadow = this.enhancedEffects.shadows.get(shadowKey);
            this.ctx.save();
            this.ctx.globalAlpha = cachedShadow.alpha;
            this.ctx.fillStyle = cachedShadow.gradient;
            this.ctx.fillRect(cachedShadow.x, cachedShadow.y, cachedShadow.width, cachedShadow.height);
            this.ctx.restore();
            return;
        }
        
        this.ctx.save();
        
        // Enhanced shadow with gradient and perspective
        const shadowOffset = Math.max(2, elevationOffset * 0.3);
        const shadowAlpha = Math.min(0.4, 0.1 + elevationOffset * 0.02);
        
        if (this.performanceMode === 'high') {
            // High-quality gradient shadow
            const gradient = this.ctx.createRadialGradient(
                x, y + elevationOffset + shadowOffset, 0,
                x, y + elevationOffset + shadowOffset, width * 0.7
            );
            gradient.addColorStop(0, `rgba(0, 0, 0, ${shadowAlpha})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            this.ctx.fillStyle = gradient;
            
            // Cache for reuse
            this.enhancedEffects.shadows.set(shadowKey, {
                x: x - width/2,
                y: y + elevationOffset + shadowOffset,
                width: width,
                height: height/3,
                alpha: shadowAlpha,
                gradient: gradient
            });
        } else {
            // Simple shadow
            this.ctx.globalAlpha = shadowAlpha;
            this.ctx.fillStyle = '#000';
        }
        
        this.ctx.fillRect(x - width/2 + shadowOffset, y + elevationOffset + shadowOffset, width, height/3);
        this.ctx.restore();
    }
    
    /**
     * Phase 5: Dynamic lighting effects
     */
    applyDynamicLighting(x, y, width, height) {
        const lighting = this.enhancedEffects.lighting;
        if (!lighting.enabled) return;
        
        this.ctx.save();
        
        // Create lighting gradient based on angle and intensity
        const lightX = x + Math.cos(lighting.angle * Math.PI / 180) * width * 0.3;
        const lightY = y + Math.sin(lighting.angle * Math.PI / 180) * height * 0.3;
        
        const lightGradient = this.ctx.createRadialGradient(
            lightX, lightY, 0,
            lightX, lightY, Math.max(width, height)
        );
        
        lightGradient.addColorStop(0, `rgba(255, 255, 200, ${lighting.intensity * 0.1})`);
        lightGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        this.ctx.globalCompositeOperation = 'overlay';
        this.ctx.fillStyle = lightGradient;
        this.ctx.fillRect(x - width/2, y, width, height);

        // Reset composite operation before restoring context (critical for avoiding rendering corruption)
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.restore();
    }
    
    
    /**
     * Phase 5: Toggle enhanced graphics features
     */
    setPerformanceMode(mode) {
        this.performanceMode = mode;
        if (mode === 'low') {
            this.enhancedEffects.shadows.clear();
            this.enhancedEffects.lighting.enabled = false;
        } else if (mode === 'high') {
            this.enhancedEffects.lighting.enabled = true;
        }
    }
    
    /**
     * Get rendering statistics
     */
    getStats() {
        return {
            cachedImages: this.buildingImageCache.size,
            loadingImages: this.imageLoadPromises.size,
            currentElevation: this.currentElevation,
            bounceActive: !!this.bounceAnimation,
            // Phase 5: Enhanced graphics stats
            shadowsCache: this.enhancedEffects.shadows.size,
            performanceMode: this.performanceMode,
            lightingEnabled: this.enhancedEffects.lighting.enabled
        };
    }

    /**
     * Draw top-down minimap for route builder interface
     * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on
     * @param {string} type - Type of route ('bus' or 'subway')
     */
    drawTopDownMap(ctx, type) {
        const cellSize = 400 / this.game.gridSize;

        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, 400, 400);

        // Draw grid
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;

        for (let i = 0; i <= this.game.gridSize; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, 400);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(400, i * cellSize);
            ctx.stroke();
        }

        // Draw parcels and stops/entrances
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                const x = col * cellSize;
                const y = row * cellSize;

                // Draw parcel ownership
                if (this.game.isCurrentPlayer(parcel.owner)) {
                    // Use player's selected color for minimap
                    if (this.game.playerSettings && this.game.playerSettings.color) {
                        const hex = this.game.playerSettings.color.replace('#', '');
                        const r = parseInt(hex.substr(0, 2), 16);
                        const g = parseInt(hex.substr(2, 2), 16);
                        const b = parseInt(hex.substr(4, 2), 16);
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
                    } else {
                        ctx.fillStyle = 'rgba(0, 102, 204, 0.2)';
                    }
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (parcel.owner && parcel.owner !== 'none') {
                    ctx.fillStyle = 'rgba(204, 102, 0, 0.2)';
                    ctx.fillRect(x, y, cellSize, cellSize);
                }

                // Check for bus stops or subway entrances
                const hasStop = this.game.hasTransitStop(row, col, type);
                if (hasStop) {
                    const centerX = x + cellSize / 2;
                    const centerY = y + cellSize / 2;

                    if (type === 'bus') {
                        // Draw bus stop
                        ctx.fillStyle = '#ffcc00';
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    } else if (type === 'subway') {
                        // Draw subway entrance
                        ctx.fillStyle = '#ff0000';
                        ctx.fillRect(centerX - 4, centerY - 4, 8, 8);

                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(centerX - 4, centerY - 4, 8, 8);
                    }
                }
            }
        }

        // Draw existing routes
        if (type === 'bus') {
            this.game.drawExistingBusRoutes(ctx, cellSize);
        } else if (type === 'subway') {
            this.game.drawExistingSubwayLines(ctx, cellSize);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderingSystem;
}