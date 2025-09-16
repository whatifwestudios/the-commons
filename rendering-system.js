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
        
        // Draw building if present with construction animation
        if (parcel && parcel.building && this.game.currentLayer !== 'mobility') {
            this.drawBuildingWithConstruction(parcel.building, 0, -this.tileHeight / 4, row, col, parcel);
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
        if (!parcel) return '#2a2a2a'; // Unowned - charcoal gray
        
        // Under construction
        if (parcel._isUnderConstruction) {
            return '#8B4513'; // Brown for construction
        }
        
        // Based on owner
        if (!parcel.owner) {
            return '#2a2a2a'; // Unowned - charcoal gray
        } else if (parcel.owner === 'player') {
            // Use player's selected color with some transparency/modification
            if (this.game.playerSettings && this.game.playerSettings.color) {
                return this.game.playerSettings.color;
            }
            return 'rgba(255, 255, 255, 0.4)'; // Fallback to white with transparency
        } else {
            // Competitor owned - use assigned colors
            return this.game.getCompetitorColor ? this.game.getCompetitorColor(parcel.owner) : '#6a6a6a';
        }
    }
    
    /**
     * Draw parcel borders
     */
    drawParcelBorders(row, col, tileWidth, tileHeight) {
        const parcel = this.game.grid[row][col];
        
        // Different border styles based on state
        if (parcel && parcel.owner === 'player') {
            this.ctx.strokeStyle = '#4CAF50';
            this.ctx.lineWidth = 2;
        } else {
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
        }
        
        // Draw border (already in diamond shape from drawTile)
        this.ctx.stroke();
    }
    
    /**
     * Draw a building with construction animation support
     */
    drawBuildingWithConstruction(buildingId, offsetX = 0, offsetY = 0, row, col, parcel) {
        if (this.game.perfMonitor) {
            this.game.perfMonitor.recordDraw('building');
        }
        
        const building = this.game.buildingManager?.getBuildingById(buildingId);
        if (!building) return;

        const iso = this.toIsometric(col, row);
        const x = iso.x + offsetX;
        const y = iso.y + offsetY + this.currentElevation;
        
        // Calculate construction progress
        let constructionProgress = 1.0;
        if (parcel && parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
            const totalConstructionTimeMs = parcel.constructionDays * this.game.dayDuration;
            const elapsedTimeMs = (this.game.currentDay - parcel.constructionStartDay) * this.game.dayDuration + 
                                  (performance.now() - (this.game.lastDayStartTime || Date.now()));
            
            if (elapsedTimeMs < totalConstructionTimeMs) {
                constructionProgress = Math.max(0, Math.min(1.0, elapsedTimeMs / totalConstructionTimeMs));
            }
        }
        
        // Draw building with construction progress
        this.drawBuildingImageWithProgress(building, x, y, row, col, constructionProgress);
    }
    
    /**
     * Draw a building on a parcel (legacy method)
     */
    drawBuilding(buildingId, offsetX = 0, offsetY = 0, row, col) {
        if (this.game.perfMonitor) {
            this.game.perfMonitor.recordDraw('building');
        }
        
        const building = this.game.buildingManager?.getBuildingById(buildingId);
        if (!building) return;
        
        const iso = this.toIsometric(col, row);
        const x = iso.x + offsetX;
        const y = iso.y + offsetY + this.currentElevation;
        
        // Try to load and draw building image
        this.drawBuildingImage(building, x, y, row, col);
    }
    
    /**
     * Draw building image with construction progress (pixel-by-pixel)
     */
    drawBuildingImageWithProgress(building, x, y, row, col, constructionProgress = 1.0) {
        const imagePath = building.graphicsFile || building.graphics?.path || building.images?.built || `assets/buildings/default.svg`;
        
        // Debug logging for image paths
        if (Math.random() < 0.1) { // Log 10% of the time
            console.log(`Building ${building.name}: Trying to load image from ${imagePath}`);
            console.log('Building object:', {
                graphicsFile: building.graphicsFile,
                graphics: building.graphics,
                images: building.images
            });
        }
        
        // Check cache first
        if (this.buildingImageCache.has(imagePath)) {
            const img = this.buildingImageCache.get(imagePath);
            if (img.complete) {
                this.renderBuildingImageWithProgress(img, x, y, building.name, row, col, constructionProgress);
                return;
            }
        }
        
        // Load image if not cached
        if (!this.imageLoadPromises.has(imagePath)) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    this.buildingImageCache.set(imagePath, img);
                    resolve(img);
                };
                img.onerror = () => reject(new Error(`Failed to load ${imagePath}`));
            });
            
            this.imageLoadPromises.set(imagePath, promise);
            img.src = imagePath;
        }
        
        // Use fallback while loading
        this.drawBuildingFallbackWithProgress(building, x, y, constructionProgress);
        
        // Try to render when loaded
        this.imageLoadPromises.get(imagePath).then(img => {
            if (img.complete) {
                this.game.scheduleRender(); // Re-render when image loads
            }
        }).catch(() => {
            // Image failed to load, continue with fallback
        });
    }
    
    /**
     * Draw building image with fallback (legacy method)
     */
    drawBuildingImage(building, x, y, row, col) {
        const imagePath = building.graphicsFile || building.graphics?.path || building.images?.built || `assets/buildings/default.svg`;
        
        // Check cache first
        if (this.buildingImageCache.has(imagePath)) {
            const img = this.buildingImageCache.get(imagePath);
            if (img.complete) {
                this.renderBuildingImage(img, x, y, building.name, row, col);
                return;
            }
        }
        
        // Load image if not cached
        if (!this.imageLoadPromises.has(imagePath)) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    this.buildingImageCache.set(imagePath, img);
                    resolve(img);
                };
                img.onerror = () => reject(new Error(`Failed to load ${imagePath}`));
            });
            
            this.imageLoadPromises.set(imagePath, promise);
            img.src = imagePath;
        }
        
        // Use fallback while loading
        this.drawBuildingFallback(building, x, y);
        
        // Try to render when loaded
        this.imageLoadPromises.get(imagePath).then(img => {
            if (img.complete) {
                this.game.scheduleRender(); // Re-render when image loads
            }
        }).catch(() => {
            // Image failed to load, continue with fallback
        });
    }
    
    /**
     * Render loaded building image with construction progress
     */
    renderBuildingImageWithProgress(img, x, y, buildingName, row, col, constructionProgress = 1.0) {
        // Use proper aspect-ratio preserving scaling like the original system
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 12;
        
        // Fill diamond width completely (preserving aspect ratio)
        const baseDrawWidth = this.tileWidth * widthMultiplier;
        const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;
        
        // Position building properly on tile
        const imageY = y + this.tileHeight/2 - baseDrawHeight + yOffset;
        
        // Apply elevation effect
        const elevationOffset = this.currentElevation;
        
        // Draw shadow first (if elevated)
        if (elevationOffset > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(x - baseDrawWidth/2 + 2, imageY + elevationOffset + 2, baseDrawWidth, baseDrawHeight/2);
            this.ctx.restore();
        }
        
        // Draw building image with construction progress (pixel-by-pixel reveal)
        if (constructionProgress < 1.0) {
            const revealHeight = Math.floor(baseDrawHeight * constructionProgress);
            
            if (revealHeight > 0) {
                // Create clipping path for bottom-up reveal
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.rect(
                    x - baseDrawWidth/2, 
                    imageY + elevationOffset + (baseDrawHeight - revealHeight), 
                    baseDrawWidth, 
                    revealHeight
                );
                this.ctx.clip();
                
                // Draw the complete building (clipped to reveal area)
                this.ctx.drawImage(
                    img, 
                    x - baseDrawWidth/2, 
                    imageY + elevationOffset, 
                    baseDrawWidth, 
                    baseDrawHeight
                );
                
                this.ctx.restore();
            }
        } else {
            // Draw complete building
            this.ctx.drawImage(
                img, 
                x - baseDrawWidth/2, 
                imageY + elevationOffset, 
                baseDrawWidth, 
                baseDrawHeight
            );
        }
        
        // Draw construction overlay if under construction
        const parcel = this.game.grid[row]?.[col];
        if (parcel?._isUnderConstruction) {
            this.drawConstructionOverlay(x, y, constructionProgress);
        }
    }
    
    /**
     * Render loaded building image (legacy method)
     */
    renderBuildingImage(img, x, y, buildingName, row, col) {
        // Use proper aspect-ratio preserving scaling
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 12;
        
        // Fill diamond width completely (preserving aspect ratio)
        const baseDrawWidth = this.tileWidth * widthMultiplier;
        const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;
        
        // Position building properly on tile
        const imageY = y + this.tileHeight/2 - baseDrawHeight + yOffset;
        
        // Apply elevation effect
        const elevationOffset = this.currentElevation;
        
        // Draw shadow first (if elevated)
        if (elevationOffset > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(x - baseDrawWidth/2 + 2, imageY + elevationOffset + 2, baseDrawWidth, baseDrawHeight/2);
            this.ctx.restore();
        }
        
        // Draw building image
        this.ctx.drawImage(
            img, 
            x - baseDrawWidth/2, 
            imageY + elevationOffset, 
            baseDrawWidth, 
            baseDrawHeight
        );
        
        // Draw construction overlay if under construction
        const parcel = this.game.grid[row]?.[col];
        if (parcel?._isUnderConstruction) {
            this.drawConstructionOverlay(x, y, parcel._constructionProgress || 0);
        }
    }
    
    /**
     * Draw fallback building representation with construction progress
     */
    drawBuildingFallbackWithProgress(building, x, y, constructionProgress = 1.0) {
        // Use same sizing logic as images but for rectangles
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 12;
        
        // Fallback buildings use a standard aspect ratio (4:3)
        const buildingWidth = this.tileWidth * widthMultiplier;
        const buildingHeight = (buildingWidth * 0.75) * heightMultiplier; // 4:3 aspect ratio
        
        const buildingY = y + this.tileHeight/2 - buildingHeight + yOffset;
        const color = this.getBuildingColor(building.category);
        
        this.ctx.fillStyle = color;
        
        if (constructionProgress < 1.0) {
            // Draw partially constructed building (from bottom up)
            const revealHeight = Math.floor(buildingHeight * constructionProgress);
            if (revealHeight > 0) {
                this.ctx.fillRect(
                    x - buildingWidth/2, 
                    buildingY + this.currentElevation + (buildingHeight - revealHeight), 
                    buildingWidth, 
                    revealHeight
                );
            }
        } else {
            // Draw complete building
            this.ctx.fillRect(x - buildingWidth/2, buildingY + this.currentElevation, buildingWidth, buildingHeight);
        }
        
        // Draw building name only if fully constructed
        if (constructionProgress >= 1.0) {
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                building.name.substring(0, 8), 
                x, 
                buildingY + buildingHeight + this.currentElevation + 10
            );
        }
    }
    
    /**
     * Draw fallback building representation (legacy method)
     */
    drawBuildingFallback(building, x, y) {
        // Use same sizing logic as images but for rectangles  
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 12;
        
        // Fallback buildings use a standard aspect ratio (4:3)
        const buildingWidth = this.tileWidth * widthMultiplier;
        const buildingHeight = (buildingWidth * 0.75) * heightMultiplier; // 4:3 aspect ratio
        
        const buildingY = y + this.tileHeight/2 - buildingHeight + yOffset;
        const color = this.getBuildingColor(building.category);
        
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x - buildingWidth/2, buildingY + this.currentElevation, buildingWidth, buildingHeight);
        
        // Draw building name
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            building.name.substring(0, 8), 
            x, 
            buildingY + buildingHeight + this.currentElevation + 10
        );
    }
    
    /**
     * Get color for building category
     */
    getBuildingColor(category) {
        const colors = {
            housing: '#4CAF50',
            commercial: '#2196F3',
            utilities: '#FF9800',
            education: '#9C27B0',
            recreation: '#4CAF50',
            civic: '#607D8B'
        };
        
        return colors[category?.toLowerCase()] || '#666';
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
        // Draw parcel reach if active
        if (this.game.parcelReach) {
            this.drawParcelReach();
        }
        
        // Draw selected tile highlight
        if (this.game.selectedTile) {
            this.drawSelectedTileHighlight();
        }
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
        const isoX = (col - row) * (this.tileWidth / 2);
        const isoY = (col + row) * (this.tileHeight / 2);
        return {
            x: isoX + (this.game.offsetX || 0),
            y: isoY + (this.game.offsetY || 0)
        };
    }
    
    /**
     * Convert isometric screen coordinates to grid coordinates
     */
    fromIsometric(screenX, screenY) {
        const x = screenX - (this.game.offsetX || 0);
        const y = screenY - (this.game.offsetY || 0);
        
        const col = Math.round((x / (this.tileWidth / 2) + y / (this.tileHeight / 2)) / 2);
        const row = Math.round((y / (this.tileHeight / 2) - x / (this.tileWidth / 2)) / 2);
        
        if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
            return null;
        }
        
        return {
            col: col,
            row: row
        };
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
     * Get rendering statistics
     */
    getStats() {
        return {
            cachedImages: this.buildingImageCache.size,
            loadingImages: this.imageLoadPromises.size,
            currentElevation: this.currentElevation,
            bounceActive: !!this.bounceAnimation
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderingSystem;
}