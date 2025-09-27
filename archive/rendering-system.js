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

        // Server-authoritative building state (replaces legacy game.js grid)
        this.buildings = new Map(); // locationKey -> building state

        // Subscribe to economic client updates for real-time building state
        this.setupEconomicClientSubscription();

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
     * Setup subscription to economic client for real-time building updates
     */
    setupEconomicClientSubscription() {
        if (this.game.economicClient && this.game.economicClient.onUpdate) {
            this.game.economicClient.onUpdate((update) => {
                this.handleServerUpdate(update);
            });
            console.log('🎨 Rendering system subscribed to economic client updates');
        } else {
            // Retry connection if economic client isn't ready yet
            setTimeout(() => this.setupEconomicClientSubscription(), 1000);
        }
    }

    /**
     * Handle server updates for building state
     */
    handleServerUpdate(update) {
        console.log('🎨 Rendering system received update:', update.type, update);

        switch (update.type) {
            case 'BUILDING_COMPLETED':
                console.log('🎨 Processing BUILDING_COMPLETED:', update.data || update);
                this.handleBuildingCompleted(update.data || update);
                break;

            case 'SERVER_STATE_SYNC':
                if (update.data && update.data.gameState && update.data.gameState.buildings) {
                    console.log('🎨 Processing SERVER_STATE_SYNC with buildings:', update.data.gameState.buildings.length);
                    this.syncBuildingsFromServer(update.data.gameState.buildings);
                }
                break;

            case 'GAME_STATE':
                if (update.eventData && update.eventData.transaction && update.eventData.transaction.type === 'BUILD_COMPLETE_AUTO') {
                    console.log('🎨 Processing GAME_STATE BUILD_COMPLETE_AUTO:', update.eventData.transaction);
                    this.handleBuildingCompleted(update.eventData.transaction);
                }
                // Sync all buildings from full game state
                if (update.gameState && update.gameState.buildings) {
                    console.log('🎨 Processing GAME_STATE with buildings:', update.gameState.buildings.length);
                    this.syncBuildingsFromServer(update.gameState.buildings);
                }
                break;

            case 'ECONOMIC_UPDATE':
                if (update.data && update.data.transaction && update.data.transaction.type === 'BUILD_COMPLETE_AUTO') {
                    console.log('🎨 Processing ECONOMIC_UPDATE BUILD_COMPLETE_AUTO:', update.data.transaction);
                    this.handleBuildingCompleted(update.data.transaction);
                }
                break;

            case 'ROOM_STATE_SYNC':
                if (update.buildings) {
                    console.log('🎨 Processing ROOM_STATE_SYNC with buildings:', update.buildings.length);
                    this.syncBuildingsFromServer(update.buildings);
                }
                break;
        }
    }

    /**
     * Handle building completion from server
     */
    handleBuildingCompleted(buildingData) {
        console.log('🎨 handleBuildingCompleted called with:', buildingData);
        const { location, buildingId, playerId } = buildingData;
        if (location && buildingId) {
            const [row, col] = location;
            const locationKey = `${row},${col}`;

            // Update server-authoritative building state
            const buildingState = {
                id: buildingId,
                type: buildingId,
                ownerId: playerId,
                location: [row, col],
                underConstruction: false,
                constructionStartTime: null,
                age: 0,
                condition: 100,
                lastUpdated: Date.now()
            };
            this.buildings.set(locationKey, buildingState);

            console.log(`🎨 Rendering system: Building ${buildingId} completed at [${row}, ${col}]`);
            console.log(`🎨 Buildings map now has ${this.buildings.size} buildings:`, Array.from(this.buildings.entries()));

            // Force re-render to show completed building
            this.game.scheduleRender();
        } else {
            console.warn('🎨 handleBuildingCompleted: Missing location or buildingId:', buildingData);
        }
    }

    /**
     * Sync all buildings from server state
     */
    syncBuildingsFromServer(serverBuildings) {
        // Clear existing state
        this.buildings.clear();

        // Populate with server-authoritative state
        serverBuildings.forEach(building => {
            if (building.location) {
                const [row, col] = building.location;
                const locationKey = `${row},${col}`;
                this.buildings.set(locationKey, {
                    id: building.id,
                    type: building.id,
                    ownerId: building.ownerId,
                    location: building.location,
                    underConstruction: building.underConstruction,
                    constructionStartTime: building.constructionStartTime,
                    age: building.age || 0,
                    condition: building.condition || 100,
                    lastUpdated: Date.now()
                });
            }
        });

        console.log(`🎨 Rendering system: Synced ${this.buildings.size} buildings from server`);

        // Force re-render with new state
        this.game.scheduleRender();
    }

    /**
     * Get building at location (replaces legacy parcel.building access)
     */
    getBuildingAt(row, col) {
        const locationKey = `${row}-${col}`;
        const building = this.game.serverBuildings?.get(locationKey);
        // Removed verbose logging for performance
        return building;
    }

    /**
     * Initialize the rendering system
     */
    initialize() {
        this.setupCanvas();  // This now handles all canvas setup and calculations
        this.preloadImages();
        this.setupResizeHandler();
    }

    /**
     * Setup window resize handler for responsive canvas
     */
    setupResizeHandler() {
        // Debounced resize handler to avoid excessive recalculations
        let resizeTimeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                console.log('🔄 Window resized, recalculating canvas setup...');
                this.setupCanvas();
                // Trigger a re-render with the new dimensions
                if (this.game.scheduleRender) {
                    this.game.scheduleRender();
                }
            }, 150); // 150ms debounce
        };

        window.addEventListener('resize', handleResize);

        // Store reference for cleanup if needed
        this.resizeHandler = handleResize;
    }
    
    /**
     * Setup canvas properties
     */
    setupCanvas() {
        // Step 1: Calculate canvas dimensions based on container
        const container = document.getElementById('main-area');
        if (!container) {
            console.warn('Main-area container not found, using default canvas size');
            this.canvas.width = 800;
            this.canvas.height = 600;
        } else {
            const rect = container.getBoundingClientRect();
            this.canvas.width = rect.width - 40;  // 20px margin on each side
            this.canvas.height = rect.height - 40; // 20px margin top/bottom
        }

        // Step 2: Calculate optimal tile dimensions for the grid
        // Make tiles larger and more visible - aim for grid to use ~80% of canvas space
        const availableWidth = this.canvas.width * 0.8;
        const availableHeight = this.canvas.height * 0.8;

        // In isometric view, effective grid dimensions are:
        // Width: gridSize * tileWidth (diamond width spans)
        // Height: gridSize * tileHeight (diamond height spans)
        // But isometric projection creates a 2:1 width:height ratio for diamonds
        const maxTileWidth = availableWidth / this.game.gridSize;
        const maxTileHeight = (availableHeight / this.game.gridSize) * 2; // Account for isometric compression

        // Choose the limiting dimension and maintain 2:1 aspect ratio
        const constrainingTileWidth = Math.min(maxTileWidth, maxTileHeight);
        this.tileWidth = Math.max(60, constrainingTileWidth); // Minimum 60px for visibility
        this.tileHeight = this.tileWidth * 0.5; // Maintain isometric 2:1 ratio

        // Step 3: Calculate grid centering offsets
        // Center the grid on the intersection of the middle 4 parcels
        // For a gridSize x gridSize grid, the center is at (gridSize-1)/2
        const centerGridX = (this.game.gridSize - 1) / 2;
        const centerGridY = (this.game.gridSize - 1) / 2;

        // Convert center grid position to isometric coordinates
        const centerIsoX = (centerGridX - centerGridY) * (this.tileWidth / 2);
        const centerIsoY = (centerGridX + centerGridY) * (this.tileHeight / 2);

        // Position the grid so this center point is at the canvas center
        this.offsetX = this.canvas.width / 2 - centerIsoX;
        this.offsetY = this.canvas.height / 2 - centerIsoY;

        // Step 4: Sync calculated dimensions back to game object (for backwards compatibility)
        this.game.tileWidth = this.tileWidth;
        this.game.tileHeight = this.tileHeight;
        this.game.offsetX = this.offsetX;
        this.game.offsetY = this.offsetY;

        // Step 5: Set canvas rendering properties
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        // Step 6: Log setup for debugging
        console.log(`🎯 Canvas setup complete:`, {
            canvasSize: `${this.canvas.width}x${this.canvas.height}`,
            tileSize: `${this.tileWidth}x${this.tileHeight}`,
            gridSize: `${this.game.gridSize}x${this.game.gridSize}`,
            offset: `${this.offsetX.toFixed(1)}, ${this.offsetY.toFixed(1)}`,
            totalGridFootprint: `${(this.game.gridSize * this.tileWidth).toFixed(0)}x${(this.game.gridSize * this.tileHeight).toFixed(0)}`
        });
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
        // DISABLED: Mobility layer disabled for testing
        if (this.game.currentLayer === 'mobility') {
            console.log('⚠️ Mobility rendering disabled - switching to normal render');
            // Fall through to normal rendering instead of returning
        }
        // if (this.game.currentLayer === 'mobility') {
        //     if (this.game.mobilityLayer) {
        //         // Diagnostic logging
        //         console.log('🔧 DIAGNOSTIC: RenderingSystem calling mobility render');
        //         console.log('🔧 DIAGNOSTIC: mobilityLayer type =', this.game.mobilityLayer.constructor.name);
        //         this.game.mobilityLayer.render(this.ctx);
        //     } else {
        //         console.log('🔧 DIAGNOSTIC: No mobilityLayer found!');
        //     }
        //     return;
        // }
        
        // Apply transformations
        this.ctx.save();
        this.ctx.translate(this.game.panOffset.x, this.game.panOffset.y);
        this.ctx.scale(this.game.zoomScale, this.game.zoomScale);
        
        // Draw grid
        this.drawIsometricGrid();
        
        // Draw overlays based on layer
        this.drawLayerOverlays();
        
        this.ctx.restore();
        
    }
    
    /**
     * Draw the main isometric grid
     */
    drawIsometricGrid() {
        this.ctx.beginPath();

        // Draw tiles in the correct isometric order (back to front) with Z-index ordering
        const tiles = [];
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const iso = this.toIsometric(col, row);
                tiles.push({ col, row, zIndex: iso.zIndex || (row + col) });
            }
        }

        // Sort by Z-index for proper depth ordering
        tiles.sort((a, b) => a.zIndex - b.zIndex);

        // Draw tiles in correct order
        for (const tile of tiles) {
            this.drawTile(tile.col, tile.row);
        }

        // Draw special effects
        this.drawSpecialEffects();

        // REMOVED: this.ctx.stroke() - was overwriting hover effects
    }

    /**
     * Create batches of tiles organized by depth for efficient rendering
     */
    createTileBatches() {
        const batches = [];

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const iso = this.toIsometric(col, row);
                const zIndex = iso.zIndex || (row + col);

                if (!batches[zIndex]) batches[zIndex] = [];
                batches[zIndex].push({ col, row, iso });
            }
        }

        return batches;
    }

    /**
     * Render a batch of tiles with minimal state changes
     */
    renderTileBatch(batch) {
        this.ctx.save();

        // Group by similar properties to minimize state changes
        const groups = this.groupTilesByProperties(batch);

        for (const group of groups) {
            // Set common properties once per group
            if (group.alpha !== undefined) {
                this.ctx.globalAlpha = group.alpha;
            }

            // Render all tiles in this group
            for (const tile of group.tiles) {
                this.drawTileOptimized(tile.col, tile.row, tile.iso);
            }
        }

        this.ctx.restore();
    }

    /**
     * Group tiles by common rendering properties
     */
    groupTilesByProperties(batch) {
        const groups = new Map();

        for (const tile of batch) {
            const parcel = this.game.grid[tile.row][tile.col];
            const alpha = Math.max(0.7, tile.iso.depthFactor || 1);
            const hasBuilding = !!(parcel && parcel.building);

            const key = `${alpha.toFixed(2)}_${hasBuilding}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    alpha: alpha,
                    hasBuilding: hasBuilding,
                    tiles: []
                });
            }

            groups.get(key).tiles.push(tile);
        }

        return Array.from(groups.values());
    }
    
    /**
     * Draw layer-specific overlays
     */
    drawLayerOverlays() {
        switch(this.game.currentLayer) {
            case 'transportation':
                this.drawTransportationOverlay();
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

        // Hover effects now handled by ParcelHoverV2 in V2 rendering system
        if (this.game.parcelHover && !this.game.useV2Renderer) {
            this.game.parcelHover.renderEffects(row, col, this.ctx, iso.x, adjustedY, this.tileWidth, this.tileHeight);
        }

        // Draw building if present with unified rendering
        // Check both server-authoritative state AND local grid state for compatibility
        const serverBuilding = this.getBuildingAt(row, col);
        const gridBuilding = parcel && parcel.building;

        if ((serverBuilding || gridBuilding) && this.game.currentLayer !== 'mobility' && this.game.currentLayer !== 'players') {
            // Prefer server building if available, otherwise use grid building
            const buildingId = serverBuilding ? serverBuilding.type : gridBuilding;
            const buildingData = serverBuilding || {
                type: gridBuilding,
                underConstruction: parcel._isUnderConstruction || false,
                constructionStartTime: parcel._constructionStartTime,
                condition: parcel.condition || 100
            };
            this.drawBuilding(buildingId, 0, -this.tileHeight / 4, row, col, buildingData);
        }
        
        this.ctx.restore();
    }
    
    /**
     * DISABLED: Legacy parcel reach illumination system - replaced by ParcelSelectorManager
     * Draw parcel reach illumination for a single tile (draws behind buildings)
     */
    drawParcelReachForTile(row, col, x, y) {
        // DISABLED - replaced by ParcelSelectorManager system
        return;

        // console.log(`🔷 [RENDER DEBUG] drawParcelReachForTile called for ${row},${col} - parcelReach:`, this.game.parcelReach, 'selectedParcel:', this.game.selectedParcel);
        if (!this.game.parcelReach || !this.game.selectedParcel) {
            // console.log(`🔷 [RENDER DEBUG] Early return from drawParcelReachForTile - no parcelReach or selectedParcel`);
            return;
        }

        // Create a set of all reachable parcels including the selected one
        const allReachable = new Set(this.game.parcelReach);
        allReachable.add(`${this.game.selectedParcel.row},${this.game.selectedParcel.col}`);

        const tileKey = `${row},${col}`;

        // Check if this tile should be illuminated
        if (allReachable.has(tileKey)) {
            this.ctx.save();

            // Determine if this is the selected parcel or a reachable one
            const isSelected = (row === this.game.selectedParcel.row && col === this.game.selectedParcel.col);

            if (isSelected) {
                // Selected parcel - bright yellow with glow
                const time = Date.now() / 1000;
                const glowIntensity = 0.3 + Math.sin(time * 2) * 0.1;

                this.ctx.globalAlpha = glowIntensity;
                this.ctx.fillStyle = '#FFD700'; // Gold
                this.ctx.shadowBlur = 12;
                this.ctx.shadowColor = '#FFD700';
            } else {
                // Reachable parcel - subtle blue
                this.ctx.globalAlpha = 0.2;
                this.ctx.fillStyle = '#87CEEB'; // Sky blue
            }

            // Draw the illumination overlay
            // console.log(`🌟 [RENDER DEBUG] Drawing illumination overlay with fill style:`, this.ctx.fillStyle);
            this.drawDiamond(x, y, this.tileWidth, this.tileHeight);
            this.ctx.fill();

            this.ctx.restore();
        }
    }

    /**
     * Draw diamond shape for isometric tiles
     */
    drawDiamond(x, y, width, height) {
        // console.log(`💎 [RENDER DEBUG] drawDiamond called at (${x},${y}) with size ${width}x${height}`);
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
        return PlayerUtils.isCurrentPlayer(owner);
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

        // Check if this is the current player and use their chosen color
        if (this.isCurrentPlayer(playerId) && this.game.playerSettings && this.game.playerSettings.color) {
            return this.game.playerSettings.color;
        }

        // Get color from multiplayer manager if available (for other players)
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
            // Use consistent light gray border for all owned parcels
            this.ctx.strokeStyle = '#999';
            this.ctx.lineWidth = 1;
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
    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row, col, serverBuilding = null) {
        // Server-authoritative building rendering

        if (this.game.perfMonitor) {
            this.game.perfMonitor.recordDraw('building');
        }

        // Get building definition from building manager
        const buildingDef = this.game.buildingManager?.getBuildingById(buildingId);
        if (!buildingDef) return;

        // Use server-authoritative building state
        if (!serverBuilding) {
            serverBuilding = this.getBuildingAt(row, col);
        }
        if (!serverBuilding) return;

        const iso = this.toIsometric(col, row);
        const x = iso.x + offsetX;
        const y = iso.y + offsetY + this.currentElevation;

        // Use server building state for construction status
        const isUnderConstruction = serverBuilding.underConstruction || false;
        const constructionProgress = isUnderConstruction ?
            this.calculateConstructionProgress(serverBuilding) : 1.0;

        // Get performance data for completed buildings
        let performancePercent = 100;
        if (!isUnderConstruction) {
            // Use server condition or fallback to cached efficiency data
            if (serverBuilding.condition !== undefined) {
                performancePercent = serverBuilding.condition;
            } else {
                // Fallback to legacy efficiency cache if server data not available
                const key = `${row},${col}`;
                const efficiencyData = this.game.buildingEfficiencies?.get(key);
                if (efficiencyData && efficiencyData.overallEfficiency !== undefined) {
                    performancePercent = Math.round(efficiencyData.overallEfficiency * 100);
                } else {
                    performancePercent = 90; // Default good performance
                }
            }
        }

        // Draw building with server-authoritative state
        this.renderBuildingUnified(buildingDef, x, y, row, col, {
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
     * Calculate construction progress from server building state
     */
    calculateConstructionProgress(serverBuilding) {
        if (!serverBuilding.underConstruction || !serverBuilding.constructionStartTime) {
            return 1.0; // Completed
        }

        // Calculate progress based on elapsed time
        const elapsedMs = Date.now() - serverBuilding.constructionStartTime;
        const constructionDurationMs = (serverBuilding.constructionDays || 1) * (3600000 / 365); // ~9.86 seconds per day
        const progress = Math.min(elapsedMs / constructionDurationMs, 1.0);

        return Math.max(progress, 0.1); // Minimum 10% progress for visual consistency
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

        // Check for proximity tinting via V2 Rendering System
        if (this.game.renderingSystemV2) {
            const buildingTint = this.game.renderingSystemV2.getBuildingTint(row, col);
            if (buildingTint) {
                baseVariant = buildingTint;
                applyPerformanceFilter = false; // Proximity overrides performance
            }
        }

        // Step 2: Get the appropriate image variant (instant swap)
        let buildingImage = this.getVariantImageSafe(buildingName, baseVariant);

        // Step 3: Calculate all visual effects (construction, performance, decay)
        let filterEffects = '';
        const filters = [];

        // Get performance and decay data
        const performance = state.performancePercent;
        const parcel = this.game.grid[row][col];
        const decayPercent = (parcel?.decay || 0) * 100;

        // Construction visual state: desaturated and dimmed
        if (state.isUnderConstruction) {
            const constructionProgress = state.constructionProgress || 0;
            // Dimming: starts at 30% (70% dim), gradually brightens to 100% as construction progresses
            const brightness = 0.3 + (constructionProgress * 0.7); // 30% to 100%
            // Desaturation: remains at 0% saturation throughout construction
            const saturation = 0; // Total desaturation during construction
            filters.push(`brightness(${brightness})`);
            filters.push(`saturate(${saturation}%)`);
            filters.push(`contrast(${0.8 + constructionProgress * 0.2})`); // 80% to 100% contrast
        } else {
            // Performance-based effects for completed buildings
            // Building gets colorized according to performance score upon completion

            // Performance-based saturation (0-100%)
            // Buildings with 0% performance are fully desaturated
            // Buildings with 100% performance are fully saturated/colored
            let baseSaturation = Math.max(0, Math.min(100, performance));

            // Always apply saturation based on performance
            filters.push(`saturate(${baseSaturation}%)`);

            // Additional brightness adjustment for low performance
            if (performance < 50) {
                const dimming = 0.7 + (performance / 50) * 0.3; // 70% to 100% brightness
                filters.push(`brightness(${dimming})`);
            }

            // Glow effect for performance above 100%
            if (performance > 100) {
                const glowIntensity = Math.min((performance - 100) / 50, 1); // Max at 150%
                filters.push(`drop-shadow(0 0 ${Math.round(glowIntensity * 8)}px rgba(255, 215, 0, ${glowIntensity * 0.6}))`);
                filters.push(`brightness(${1 + glowIntensity * 0.3})`);
            }

            // DISABLED: Sepia filter for decay - now using needs-based performance
            // Legacy decay visual system replaced by server-side needs satisfaction
            // if (decayPercent > 20) { // 80% health = 20% decay
            //     const sepiaIntensity = Math.min((decayPercent - 20) / 80, 1); // Max at 100% decay
            //     filters.push(`sepia(${sepiaIntensity * 0.8})`);
            //     filters.push(`contrast(${1 - sepiaIntensity * 0.3})`);
            // }
        }

        if (filters.length > 0) {
            filterEffects = filters.join(' ');
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
        // Note: Proximity effects now handled by ParcelSelectorManager during tile rendering


        // Note: Parcel reach illumination now drawn per-tile behind buildings
        // Draw parcel reach border/perimeter only
        if (this.game.selectedParcel) {
            this.drawParcelReachBorder();
        }

        // DISABLED: Legacy selected tile highlight system - replaced by ParcelSelectorManager
        // if (this.game.selectedTile) {
        //     this.drawSelectedTileHighlight();
        // }
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
    
    /**
     * Convert grid coordinates to isometric screen coordinates
     */
    toIsometric(col, row, depthOffset = 0) {
        const baseCoords = window.CoordinateUtils?.toIsometric(
            col, row, this.tileWidth, this.tileHeight,
            this.game.offsetX || 0, this.game.offsetY || 0
        ) || {
            x: (col - row) * (this.tileWidth / 2) + (this.game.offsetX || 0),
            y: (col + row) * (this.tileHeight / 2) + (this.game.offsetY || 0)
        };

        return {
            x: baseCoords.x,
            y: baseCoords.y + depthOffset,
            zIndex: row + col // For proper rendering order
        };
    }

    /**
     * Adjust color brightness for depth perception
     */
    adjustColorBrightness(color, factor) {
        if (!color || typeof color !== 'string') return color;

        // Handle hex colors
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            const newR = Math.round(Math.min(255, r * factor));
            const newG = Math.round(Math.min(255, g * factor));
            const newB = Math.round(Math.min(255, b * factor));

            return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
        }

        // Handle rgb colors
        if (color.startsWith('rgb')) {
            const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (matches) {
                const r = Math.round(Math.min(255, parseInt(matches[1]) * factor));
                const g = Math.round(Math.min(255, parseInt(matches[2]) * factor));
                const b = Math.round(Math.min(255, parseInt(matches[3]) * factor));
                return `rgb(${r}, ${g}, ${b})`;
            }
        }

        return color; // Return original if can't parse
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
        if (parcel._isUnderConstruction) {
            return; // Still under construction
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
    drawParcelReachBorder() {
        if (!this.game.parcelReach || !this.game.selectedParcel) return;

        // Create a set of all reachable parcels including the selected one
        const allReachable = new Set(this.game.parcelReach);
        allReachable.add(`${this.game.selectedParcel.row},${this.game.selectedParcel.col}`);

        this.ctx.save();

        // Calculate animation values using time
        const time = Date.now() / 1000; // Convert to seconds
        const pulseAmount = Math.sin(time * 2) * 0.5 + 0.5; // Oscillates between 0 and 1
        const glowAmount = Math.sin(time * 3) * 0.3 + 0.7; // Faster, smaller oscillation for glow

        // Skip the fill since it's now drawn per-tile behind buildings
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
        
        // Highlight the selected parcel itself with animated glow (only if no building)
        const iso = this.toIsometric(this.game.selectedParcel.col, this.game.selectedParcel.row);
        const tile = this.game.grid[this.game.selectedParcel.row][this.game.selectedParcel.col];
        const elevation = tile ? tile.elevation * 8 : 0;

        // Only draw border if there's no building on this tile
        if (!tile || !tile.building) {
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
        }

        // Reset shadow properties before restore
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
        this.ctx.restore();

        // Animation is now handled by the main render loop
        // Removed redundant requestAnimationFrame that was causing blinking
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
        
        // Draw only the edge parcels (skip parcels with buildings)
        edgeParcels.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const iso = this.toIsometric(c, r);
            const tile = this.game.grid[r][c];
            const elevation = tile ? tile.elevation * 8 : 0;

            // Only draw border if there's no building on this tile
            if (!tile || !tile.building) {
                this.ctx.beginPath();
                this.ctx.moveTo(iso.x, iso.y - elevation - this.tileHeight / 2);
                this.ctx.lineTo(iso.x + this.tileWidth / 2, iso.y - elevation);
                this.ctx.lineTo(iso.x, iso.y - elevation + this.tileHeight / 2);
                this.ctx.lineTo(iso.x - this.tileWidth / 2, iso.y - elevation);
                this.ctx.closePath();
                this.ctx.stroke();
            }
        });
    }
    
    
    
    /**
     * Draw JEFH warning indicators for buildings with efficiency issues
     */
    drawJEFHWarningIndicators(buildingId, offsetX, offsetY, row, col) {
        // Don't show indicators for buildings under construction
        const parcel = this.game.grid[row][col];
        if (parcel?._isUnderConstruction) {
            return; // Hide indicators during construction
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
                if (parcel.owner && parcel.owner !== 'none') {
                    const playerColor = this.getPlayerColor(parcel.owner);
                    // Extract RGB from the rgba string and use lower opacity for minimap
                    const rgba = playerColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
                    if (rgba) {
                        ctx.fillStyle = `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, 0.3)`;
                    } else {
                        ctx.fillStyle = 'rgba(102, 102, 102, 0.2)'; // Fallback gray
                    }
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

    /**
     * Draw only the elevated building portion (no ground tile)
     */
    drawBuildingOnly(col, row, elevation) {
        const parcel = this.game.grid[row][col];
        if (!parcel || !parcel.building) return;

        const iso = this.game.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;

        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);

        // Draw elevation sides if elevated
        if (elevation > 0) {
            // Left side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            this.ctx.beginPath();
            this.ctx.moveTo(-this.game.tileWidth / 2, 0);
            this.ctx.lineTo(-this.game.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.game.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.game.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();

            // Right side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            this.ctx.beginPath();
            this.ctx.moveTo(this.game.tileWidth / 2, 0);
            this.ctx.lineTo(this.game.tileWidth / 2, elevationHeight);
            this.ctx.lineTo(0, this.game.tileHeight / 2 + elevationHeight);
            this.ctx.lineTo(0, this.game.tileHeight / 2);
            this.ctx.closePath();
            this.ctx.fill();

            // Top face
            this.ctx.fillStyle = this.getTileColor(row, col);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -this.game.tileHeight / 2);
            this.ctx.lineTo(this.game.tileWidth / 2, 0);
            this.ctx.lineTo(0, this.game.tileHeight / 2);
            this.ctx.lineTo(-this.game.tileWidth / 2, 0);
            this.ctx.closePath();
            this.ctx.fill();
        }

        // Draw building
        if (this.game.currentLayer === 'normal') {
            this.drawBuilding(parcel.building, 0, -this.game.tileHeight / 4, row, col);
        }

        this.ctx.restore();
    }

    /**
     * Optimized tile drawing for performance
     */
    drawTileOptimized(col, row, isoData, elevation = 0) {
        const parcel = this.game.grid[row][col];
        const tileColor = this.getTileColor(parcel, row, col);
        const elevationHeight = elevation * this.elevationHeight;
        const adjustedY = isoData.y - elevationHeight;

        this.ctx.save();

        // Draw tile shape
        this.ctx.fillStyle = tileColor;
        this.drawDiamond(isoData.x, adjustedY, this.tileWidth, this.tileHeight);
        this.ctx.fill();

        // Draw parcel borders
        this.drawParcelBorders(row, col, this.tileWidth, this.tileHeight);

        // V2 hover effects handled separately in V2 rendering pipeline

        this.ctx.restore();

        // Handle buildings separately for better performance
        if (parcel && parcel.building) {
            this.drawBuildingOptimized(parcel.building, col, row, isoData);
        }
    }

    /**
     * Optimized building rendering
     */
    drawBuildingOptimized(buildingId, col, row, isoData) {
        // Use existing building draw method but with optimized positioning
        const serverBuilding = this.game.serverBuildings?.get(`${row}-${col}`);
        if (serverBuilding) {
            this.drawBuilding(buildingId, 0, 0, row, col, serverBuilding);
        }

        // Restore transform
        this.ctx.setTransform(currentTransform);
    }

    /**
     * Draw green attenuation visualization for Data Insights
     */
    drawAttenuationVisualization() {
        if (!this.game.attenuationCenter) return;

        const { row: centerRow, col: centerCol } = this.game.attenuationCenter;
        const parcel = this.game.grid[centerRow][centerCol];
        if (!parcel || !parcel.building) return;

        // Get building data to get attenuation info
        const buildingData = this.game.getBuildingDataByName(parcel.building);
        if (!buildingData || !buildingData.livability) return;

        this.ctx.save();

        // Calculate maximum attenuation distance from all CARENS impacts
        let maxAttenuation = 1;
        Object.values(buildingData.livability).forEach(livabilityData => {
            if (livabilityData && typeof livabilityData.attenuation === 'number') {
                maxAttenuation = Math.max(maxAttenuation, livabilityData.attenuation);
            }
        });

        // Draw 6-step gradient around the building
        for (let step = 6; step >= 1; step--) {
            const distance = (step / 6) * maxAttenuation;
            const alpha = (7 - step) * 0.08; // Fade from 0.48 to 0.08

            // Draw all tiles within this distance
            for (let row = 0; row < this.game.gridSize; row++) {
                for (let col = 0; col < this.game.gridSize; col++) {
                    const dr = row - centerRow;
                    const dc = col - centerCol;
                    const tileDistance = Math.sqrt(dr * dr + dc * dc);

                    if (tileDistance <= distance && tileDistance > distance - (maxAttenuation / 6)) {
                        this.drawTileHighlight(col, row, `rgba(76, 175, 80, ${alpha})`, 0);
                    }
                }
            }
        }

        // Highlight the center building with a bright green outline
        this.drawTileHighlight(centerCol, centerRow, `rgba(76, 175, 80, 0.8)`, 0);

        this.ctx.restore();
    }

    /**
     * Draw tile highlight effect
     */
    drawTileHighlight(col, row, color, elevation = 0) {
        const iso = this.game.toIsometric(col, row);
        const elevationHeight = elevation * 8;
        const adjustedY = iso.y - elevationHeight;

        this.ctx.save();
        this.ctx.translate(iso.x, adjustedY);

        // Draw diamond-shaped highlight with white glow only
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.game.tileHeight / 2);
        this.ctx.lineTo(this.game.tileWidth / 2, 0);
        this.ctx.lineTo(0, this.game.tileHeight / 2);
        this.ctx.lineTo(-this.game.tileWidth / 2, 0);
        this.ctx.closePath();

        // Subtle white glow effect with fading alpha
        this.ctx.strokeStyle = color; // Use the color parameter which includes the alpha
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.restore();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderingSystem;
}