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
        
        // Phase 5: Enhanced graphics features using freed computational resources
        this.enhancedEffects = {
            particles: [], // Active particle effects
            shadows: new Map(), // Building shadow cache
            lighting: { enabled: false, angle: 45, intensity: 0.7 }, // Dynamic lighting
            animations: new Map(), // Building animations (pulsing, breathing, etc.)
            weather: { type: 'clear', intensity: 0, particles: [] } // Weather effects
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
        
        // Draw building if present with construction animation
        if (parcel && parcel.building && this.game.currentLayer !== 'mobility' && this.game.currentLayer !== 'players') {
            // Check for hover effect
            const isHovered = this.game.hoveredTile && this.game.hoveredTile.row === row && this.game.hoveredTile.col === col;
            const hoverOffset = isHovered ? -(this.game.currentElevation || 0) : 0;
            
            this.drawBuildingWithConstruction(parcel.building, 0, -this.tileHeight / 4 + hoverOffset, row, col, parcel);
            
            // Draw efficiency hazard indicator if needed
            this.drawEfficiencyIndicator(row, col, iso.x, iso.y + hoverOffset);
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
            // All players get their server-assigned color as border
            if (this.game.multiplayerManager && this.game.multiplayerManager.players.has(parcel.owner)) {
                const player = this.game.multiplayerManager.players.get(parcel.owner);
                if (player.color) {
                    // Use solid hex color for border
                    this.ctx.strokeStyle = player.color;
                } else {
                    this.ctx.strokeStyle = '#999';
                }
            } else {
                // Fallback for legacy single-player mode
                this.ctx.strokeStyle = this.isCurrentPlayer(parcel.owner) ? '#4CAF50' : '#999';
            }
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
        
        // Add JEFH warning indicators
        this.drawJEFHWarningIndicators(buildingId, offsetX, offsetY, row, col);
    }
    
    /**
     * Draw building image with construction progress (pixel-by-pixel)
     */
    drawBuildingImageWithProgress(building, x, y, row, col, constructionProgress = 1.0) {
        const imagePath = building.graphicsFile || building.graphics?.path || building.images?.built || `assets/buildings/default.svg`;
        
        // Image loading (debug logs removed to reduce console noise)
        
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
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        
        // Fill diamond width completely (preserving aspect ratio)
        const baseDrawWidth = this.tileWidth * widthMultiplier;
        const baseDrawHeight = (baseDrawWidth / (img.width / img.height)) * heightMultiplier;
        
        // Position building properly on tile
        const imageY = y + this.tileHeight/2 - baseDrawHeight + yOffset;
        
        // Apply elevation effect
        const elevationOffset = this.currentElevation;
        
        // Phase 5: Enhanced shadow rendering using freed computational resources
        const parcelId = `${row}-${col}`;
        this.renderEnhancedShadow(x, imageY, baseDrawWidth, baseDrawHeight, elevationOffset, parcelId);
        
        // Phase 5: Building efficiency animations (pulsing for low efficiency)
        let additionalEffects = '';
        if (this.performanceMode === 'high') {
            const efficiency = this.game.buildingEfficiencies?.[parcelId]?.efficiency || 100;
            if (efficiency < 70) {
                // Low efficiency buildings pulse with warning color
                const pulseStrength = Math.sin(Date.now() / 800) * 0.3 + 0.7; // 0.4 to 1.0
                additionalEffects += ` brightness(${pulseStrength}) hue-rotate(${efficiency < 50 ? '15deg' : '0deg'})`;
            }
        }
        
        // Apply desaturation and dimming for buildings under construction
        if (constructionProgress < 1.0) {
            this.ctx.save();
            // Apply sepia/desaturated filter for under construction (no opacity to save for later use)
            this.ctx.filter = 'sepia(0.8) saturate(0.3) brightness(0.6) contrast(0.7)' + additionalEffects;
        } else if (additionalEffects) {
            this.ctx.save();
            this.ctx.filter = additionalEffects.trim();
        }
        
        // Phase 5: Dynamic lighting effects (if enabled)
        if (this.enhancedEffects.lighting.enabled && this.performanceMode === 'high') {
            this.applyDynamicLighting(x, imageY, baseDrawWidth, baseDrawHeight);
        }
        
        // Always draw the complete building (no pixel-by-pixel reveal)
        this.ctx.drawImage(
            img, 
            x - baseDrawWidth/2, 
            imageY + elevationOffset, 
            baseDrawWidth, 
            baseDrawHeight
        );
        
        // Restore context if effects were applied
        if (constructionProgress < 1.0 || additionalEffects) {
            this.ctx.restore();
        }
        
        // Phase 5: Add building activity indicators for operational buildings
        if (constructionProgress >= 1.0 && this.performanceMode !== 'low') {
            this.renderBuildingActivityIndicators(buildingName, x, imageY, baseDrawWidth, baseDrawHeight, parcelId);
        }
    }
    
    /**
     * Render loaded building image (legacy method)
     */
    renderBuildingImage(img, x, y, buildingName, row, col) {
        // Use proper aspect-ratio preserving scaling
        const widthMultiplier = window.buildingPositionControls?.widthMultiplier || 1.0;
        const heightMultiplier = window.buildingPositionControls?.heightMultiplier || 1.0;
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        
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
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        
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
        const yOffset = window.buildingPositionControls?.yOffset || 22;
        
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
        // Draw hover influence radius FIRST (so it appears under other highlights)
        if (this.game.hoverInfluenceRadius && this.game.hoverInfluenceRadius.size > 0) {
            this.drawHoverInfluenceRadius();
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
            
            const iso = this.toIsometric(col, row);
            
            // Different styling for adjacent vs road-connected
            if (isExtended) {
                // Road-connected tiles: blue border showing transportation reach
                this.ctx.globalAlpha = 0.4;
                this.ctx.strokeStyle = 'rgba(33, 150, 243, 1)';
                this.ctx.lineWidth = 1;
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
     * Draw roadway infrastructure
     */
    drawRoadway(type, orientation) {
        const widths = { local: 6, arterial: 8, highway: 12 };
        const colors = { local: '#444444', arterial: '#555555', highway: '#666666' };
        
        this.ctx.fillStyle = colors[type];
        const width = widths[type];
        this.ctx.fillRect(-this.tileWidth * 0.45, -width/2, this.tileWidth * 0.9, width);
        
        // Add center lines for arterial and highway
        if (type !== 'local') {
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(-this.tileWidth * 0.45, 0);
            this.ctx.lineTo(this.tileWidth * 0.45, 0);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }
    
    /**
     * Draw bus stop
     */
    drawBusStop(busStop, orientation) {
        // Draw as a blue square with 'B' icon
        this.ctx.fillStyle = '#0066cc';
        this.ctx.fillRect(-6, -6, 12, 12);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('B', 0, 0);
    }
    
    /**
     * Draw subway entrance
     */
    drawSubwayEntrance(entrance, orientation) {
        // Draw as a red circle with 'S' icon
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#cc0000';
        this.ctx.fill();
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '8px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('S', 0, 0);
    }
    
    /**
     * Draw crosswalk
     */
    drawCrosswalk(direction) {
        // Draw zebra crosswalk in specified direction
        this.ctx.save();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1;
        
        let angle = 0;
        if (direction === 'east') angle = 0;
        else if (direction === 'south') angle = Math.PI / 2;
        else if (direction === 'west') angle = Math.PI;
        else if (direction === 'north') angle = -Math.PI / 2;
        
        this.ctx.rotate(angle);
        
        // Draw zebra stripes
        for (let i = -8; i <= 8; i += 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(-12, i);
            this.ctx.lineTo(12, i);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    /**
     * Draw traffic control
     */
    drawTrafficControl(type) {
        if (type === 'stop_sign') {
            // Draw red octagon
            this.ctx.fillStyle = '#cc0000';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        } else if (type === 'traffic_light') {
            // Draw traffic light pole
            this.ctx.fillStyle = '#333333';
            this.ctx.fillRect(-1, -8, 2, 16);
            this.ctx.fillRect(-3, -6, 6, 4);
        }
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
        
        this.ctx.restore();
    }
    
    /**
     * Phase 5: Building activity indicators (smoke, particles, etc.)
     */
    renderBuildingActivityIndicators(buildingName, x, y, width, height, parcelId) {
        const now = Date.now();
        
        // Add activity particles for productive buildings
        if (buildingName.includes('farm') || buildingName.includes('market')) {
            this.addActivityParticles(x, y - height + 10, 'productive', parcelId);
        } else if (buildingName.includes('solar')) {
            this.addEnergyShimmer(x, y, width, height, parcelId);
        }
        
        // Render existing particles
        this.updateAndRenderParticles();
    }
    
    /**
     * Phase 5: Add activity particles 
     */
    addActivityParticles(x, y, type, parcelId) {
        const now = Date.now();
        const particleKey = `${parcelId}-${type}`;
        
        // Throttle particle creation
        if (this.lastParticleTime?.[particleKey] && now - this.lastParticleTime[particleKey] < 2000) {
            return;
        }
        
        if (!this.lastParticleTime) this.lastParticleTime = {};
        this.lastParticleTime[particleKey] = now;
        
        // Add new particle
        this.enhancedEffects.particles.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.5 - Math.random() * 0.5,
            life: 1.0,
            decay: 0.01,
            type: type,
            size: 2 + Math.random() * 2
        });
    }
    
    /**
     * Phase 5: Add energy shimmer effect
     */
    addEnergyShimmer(x, y, width, height, parcelId) {
        if (Math.random() < 0.7) return; // Occasional shimmer
        
        this.enhancedEffects.particles.push({
            x: x + (Math.random() - 0.5) * width,
            y: y + Math.random() * height,
            vx: 0,
            vy: 0,
            life: 1.0,
            decay: 0.05,
            type: 'energy',
            size: 1 + Math.random() * 1
        });
    }
    
    /**
     * Phase 5: Update and render all particles
     */
    updateAndRenderParticles() {
        if (this.performanceMode === 'low') return;
        
        this.ctx.save();
        
        // Update and render particles
        this.enhancedEffects.particles = this.enhancedEffects.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= particle.decay;
            
            if (particle.life <= 0) return false;
            
            // Render particle based on type
            this.ctx.globalAlpha = particle.life;
            
            switch (particle.type) {
                case 'productive':
                    this.ctx.fillStyle = '#8FBC8F';
                    break;
                case 'energy':
                    this.ctx.fillStyle = '#FFD700';
                    break;
                default:
                    this.ctx.fillStyle = '#888';
            }
            
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            return true;
        });
        
        this.ctx.restore();
        
        // Schedule re-render if particles are active
        if (this.enhancedEffects.particles.length > 0) {
            this.scheduleRender();
        }
    }
    
    /**
     * Phase 5: Toggle enhanced graphics features
     */
    setPerformanceMode(mode) {
        this.performanceMode = mode;
        if (mode === 'low') {
            this.enhancedEffects.particles = [];
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
            particles: this.enhancedEffects.particles.length,
            shadowsCache: this.enhancedEffects.shadows.size,
            performanceMode: this.performanceMode,
            lightingEnabled: this.enhancedEffects.lighting.enabled
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderingSystem;
}