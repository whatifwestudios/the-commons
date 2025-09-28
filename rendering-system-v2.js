/**
 * Rendering System V2 - Clean, reliable, fast
 *
 * Replaces complex legacy systems with:
 * - Single mouse handler for all interactions
 * - Clean rendering pipeline with predictable order
 * - Integrated tooltip + visual effects
 * - Simple state management
 */

class RenderingSystemV2 {
    constructor(game) {
        this.game = game;
        this.ctx = game.ctx;
        this.canvas = game.canvas;

        // Simple state
        this.currentHover = null; // { row, col }
        this.adjacentParcels = new Set(); // "row,col" strings

        // Visual config
        this.hoverOpacity = 0.4;
        this.adjacentOpacity = 0.2;
        this.tileWidth = 100.0;
        this.tileHeight = 55.0;

        // Performance
        this.renderScheduled = false;

        this.init();
    }

    /**
     * Initialize V2 system - replace all legacy handlers
     */
    init() {
        this.cleanupLegacyHandlers();
        // Mouse handling delegated to ParcelHoverV2 - no duplicate handlers

        // Trigger initial render
        setTimeout(() => {
            this.scheduleRender();
        }, 100);
    }

    /**
     * Remove all legacy mouse handlers for clean slate
     */
    cleanupLegacyHandlers() {
        // Clone canvas to remove ALL event listeners
        const oldCanvas = this.canvas;
        const newCanvas = oldCanvas.cloneNode(true);
        oldCanvas.parentNode.replaceChild(newCanvas, oldCanvas);

        // Update references
        this.canvas = newCanvas;
        this.ctx = newCanvas.getContext('2d');
        this.game.canvas = newCanvas;
        this.game.ctx = this.ctx;

        // CRITICAL: Update V1 rendering system references too!
        if (this.game.renderingSystem) {
            this.game.renderingSystem.canvas = newCanvas;
            this.game.renderingSystem.ctx = this.ctx;
        }

    }

    /**
     * Single, clean mouse handling system
     */
    setupCleanMouseHandling() {
        // Main mouse handler - routes all interactions
        this.canvas.addEventListener('mousemove', (e) => {
            const coords = this.getCleanCoordinates(e);
            this.handleHover(coords);
            this.handlePanning(e, coords);
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const coords = this.getCleanCoordinates(e);
            this.handleMouseDown(e, coords);
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.clearHover();
            this.endPanning();
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Clean context menu handling
        });
    }

    /**
     * Clean coordinate conversion - single source of truth
     */
    getCleanCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Convert to world coordinates
        const worldCoords = {
            x: (screenX - this.game.panOffset.x) / this.game.zoomScale,
            y: (screenY - this.game.panOffset.y) / this.game.zoomScale
        };

        // Use V1's coordinate conversion for consistency
        const tile = this.game.renderingSystem.fromIsometric(worldCoords.x, worldCoords.y);

        return { screenX, screenY, worldCoords, tile };
    }

    /**
     * Handle hover detection and visual effects
     */
    handleHover(coords) {
        const { tile } = coords;
        const newHover = tile ? { row: tile.row, col: tile.col } : null;

        if (!this.isSameParcel(this.currentHover, newHover)) {
            this.currentHover = newHover;
            this.updateAdjacentParcels();
            this.updateTooltip(coords);
            this.scheduleRender();
        }
    }

    /**
     * Calculate 8 adjacent parcels
     */
    updateAdjacentParcels() {
        this.adjacentParcels.clear();

        if (!this.currentHover) return;

        const { row, col } = this.currentHover;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;

                const adjRow = row + dr;
                const adjCol = col + dc;

                if (adjRow >= 0 && adjRow < this.game.gridSize &&
                    adjCol >= 0 && adjCol < this.game.gridSize) {
                    this.adjacentParcels.add(`${adjRow},${adjCol}`);
                }
            }
        }
    }

    /**
     * Integrate with V2 tooltip system
     */
    updateTooltip(coords) {
        if (!this.currentHover) {
            this.hideTooltip();
            return;
        }

        const { row, col } = this.currentHover;

        // Use game's V2 tooltip system with proper data format
        if (this.game.tooltipSystemV2?.show) {
            // Smart positioning to avoid screen edges
            const offsetX = coords.screenX + 15;
            const offsetY = coords.screenY - 10;

            // Adjust if too close to right edge
            const adjustedX = offsetX + 200 > window.innerWidth ? coords.screenX - 215 : offsetX;
            // Adjust if too close to top edge
            const adjustedY = offsetY < 50 ? coords.screenY + 20 : offsetY;

            // Use V2 tooltip system's expected format
            this.game.tooltipSystemV2.show('parcel', { row, col }, adjustedX, adjustedY);
        }
    }

    /**
     * Build informative tooltip content
     */
    buildTooltipContent(parcel, row, col) {
        const lines = [];

        // Location with grid coordinates
        lines.push(`<strong>Parcel ${String.fromCharCode(65 + col)}${row + 1}</strong>`);
        lines.push(`<small>Grid: ${row}, ${col}</small>`);

        // Owner information
        if (parcel?.owner) {
            lines.push(`🏠 Owner: Player ${parcel.owner}`);
        } else {
            lines.push(`🏠 <em>Available for purchase</em>`);
        }

        // Building information
        if (parcel?.building) {
            const buildingStatus = parcel._isUnderConstruction ?
                ' <span style="color: orange">(Under Construction)</span>' : '';
            lines.push(`🏗️ ${parcel.building}${buildingStatus}`);

            // Building condition
            if (parcel.condition !== undefined) {
                const condition = Math.round(parcel.condition);
                const conditionColor = condition > 80 ? 'green' : condition > 50 ? 'orange' : 'red';
                lines.push(`🔧 Condition: <span style="color: ${conditionColor}">${condition}%</span>`);
            }
        } else {
            lines.push(`🏗️ <em>Empty lot</em>`);
        }

        // Economic information
        if (parcel?.rent) {
            lines.push(`💰 Rent: $${parcel.rent}/month`);
        }

        // Population if available
        if (parcel?.population) {
            lines.push(`👥 Population: ${parcel.population}`);
        }

        // Land value if available
        if (parcel?.landValue) {
            lines.push(`💎 Land Value: $${parcel.landValue.toLocaleString()}`);
        }

        return lines.join('<br>');
    }

    /**
     * Handle panning
     */
    handlePanning(e, coords) {
        if (!this.game.isPanning) return;

        if (this.game.lastPanPoint) {
            const deltaX = coords.screenX - this.game.lastPanPoint.x;
            const deltaY = coords.screenY - this.game.lastPanPoint.y;

            this.game.panOffset.x += deltaX;
            this.game.panOffset.y += deltaY;

            this.scheduleRender();
        }

        this.game.lastPanPoint = { x: coords.screenX, y: coords.screenY };
    }

    /**
     * Handle mouse down events
     */
    handleMouseDown(e, coords) {
        // Start panning if zoomed
        if (this.game.zoomScale > 1.1 && e.button === 0) {
            this.game.isPanning = true;
            this.game.lastPanPoint = { x: coords.screenX, y: coords.screenY };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    /**
     * Handle mouse up events
     */
    handleMouseUp(e) {
        this.endPanning();
    }

    /**
     * End panning state
     */
    endPanning() {
        if (this.game.isPanning) {
            this.game.isPanning = false;
            this.canvas.style.cursor = this.game.zoomScale > 1.1 ? 'grab' : 'default';
        }
    }

    /**
     * Clear hover state
     */
    clearHover() {
        if (this.currentHover) {
            this.currentHover = null;
            this.adjacentParcels.clear();
            this.hideTooltip();
            this.scheduleRender();
        }
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        if (this.game.tooltipSystemV2?.hide) {
            this.game.tooltipSystemV2.hide();
        }
    }

    /**
     * Complete V2 rendering pipeline - clean and efficient
     */
    render() {
        if (!this.renderScheduled) return;
        this.renderScheduled = false;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply transformations
        this.ctx.save();
        this.ctx.translate(this.game.panOffset.x || 0, this.game.panOffset.y || 0);
        this.ctx.scale(this.game.zoomScale || 1, this.game.zoomScale || 1);

        // Complete V2 rendering pipeline
        this.renderGrid();
        this.renderBuildings(); // ✅ FIX: Add building rendering to V2 pipeline
        this.renderHoverEffects();

        this.ctx.restore();
    }

    /**
     * Render the isometric grid
     */
    renderGrid() {
        // Use V1's proven approach: direct grid access and V1's methods
        if (!this.game.grid || !this.game.gridSize) {
            return; // No grid data available
        }

        // Use V1's exact tile ordering approach
        const tiles = [];
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                // Use V1's toIsometric method for consistency
                const iso = this.game.renderingSystem.toIsometric(col, row);
                tiles.push({ col, row, zIndex: iso.zIndex || (row + col) });
            }
        }

        // Sort by Z-index (V1's approach)
        tiles.sort((a, b) => a.zIndex - b.zIndex);

        // Draw tiles using V1's proven data access pattern
        for (const tile of tiles) {
            this.renderTileV2(tile.col, tile.row);
        }
    }

    // Basic grid rendering removed - using V1's proven data access

    /**
     * Render a single tile
     */
    /**
     * V2 tile rendering using V1's proven data access
     */
    renderTileV2(col, row) {
        // Use V1's exact data access pattern
        const parcel = this.game.grid[row][col];
        if (!parcel) return;

        // Use V2's coordinate system
        const iso = this.toIsometric(col, row);

        this.ctx.save();

        // Get tile color - simplified for V2
        const tileColor = this.getTileColor(parcel, row, col);

        // Draw tile using V2's drawDiamond method
        this.ctx.fillStyle = tileColor;
        this.drawDiamond(iso.x, iso.y, this.tileWidth, this.tileHeight);
        this.ctx.fill();

        // Draw parcel borders using V2's method
        this.drawParcelBorders(row, col, this.tileWidth, this.tileHeight);

        // Add hover effects using ParcelHoverV2
        if (this.game.parcelHover) {
            this.game.parcelHover.renderEffects(row, col, this.ctx, iso.x, iso.y,
                this.tileWidth, this.tileHeight);
        }

        this.ctx.restore();
    }

    /**
     * Convert grid coordinates to isometric screen coordinates
     */
    toIsometric(col, row) {
        const offsetX = this.game.offsetX || (this.canvas.width / 2);
        const offsetY = this.game.offsetY || (this.canvas.height / 2 - 200);

        const isoX = (col - row) * (this.tileWidth / 2) + offsetX;
        const isoY = (col + row) * (this.tileHeight / 2) + offsetY;
        return { x: isoX, y: isoY };
    }

    /**
     * Draw a diamond (isometric tile shape)
     */
    drawDiamond(x, y, width, height) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        this.ctx.beginPath();
        this.ctx.moveTo(x, y - halfHeight); // Top
        this.ctx.lineTo(x + halfWidth, y); // Right
        this.ctx.lineTo(x, y + halfHeight); // Bottom
        this.ctx.lineTo(x - halfWidth, y); // Left
        this.ctx.closePath();
    }

    /**
     * Get tile color based on ownership and state
     */
    getTileColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a'; // Default unowned

        // Under construction
        if (parcel._isUnderConstruction) {
            return '#8B4513'; // Brown
        }

        // Based on owner
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            return '#2a2a2a'; // Unowned - charcoal gray
        } else {
            return this.getPlayerColor(parcel.owner);
        }
    }

    /**
     * Get player color
     */
    getPlayerColor(playerId) {
        const colors = [
            '#10AC84', '#3498DB', '#E74C3C', '#F39C12',
            '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
            '#2ECC71', '#E91E63', '#FF5722', '#795548'
        ];

        // Check if this is the current player (support multiple ID formats)
        if (playerId === 'player' ||
            playerId === 1 ||
            playerId === this.game.currentPlayerId) {
            return this.game.playerSettings?.color || '#10AC84';
        }

        // Handle numeric player IDs for competitors
        if (typeof playerId === 'number') {
            return colors[(playerId - 1) % colors.length];
        }

        // For unknown player IDs, return default but log a warning
        console.warn('🎨 Unknown player ID in getPlayerColor:', playerId, 'using default color');
        return '#10AC84'; // Default green
    }

    /**
     * Render buildings on tiles
     */
    renderBuildings() {
        if (!this.game.grid) return;

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                this.renderBuilding(row, col);
            }
        }
    }

    /**
     * Render building on a tile
     */
    renderBuilding(row, col) {
        const parcel = this.game.grid[row]?.[col];
        if (!parcel?.building) return;

        const iso = this.toIsometric(col, row);

        // Apply dynamic offsets from position adjuster (if active)
        const baseYOffset = 36;
        const dynamicXOffset = this.buildingXOffset || 0;
        const dynamicYOffset = this.buildingYOffset || baseYOffset;

        const buildingY = iso.y + dynamicYOffset;
        const buildingX = iso.x + dynamicXOffset;

        // Simple building representation
        this.ctx.save();

        // Get building graphics from building data
        // parcel.building is now just the building ID, need to look up full data
        const buildingId = parcel.building;
        const locationKey = `${row},${col}`;
        const building = this.game.economicClient?.buildings?.get(locationKey);

        if (!building) {
            console.log(`⚠️ No building data found for ${buildingId} at [${row},${col}]`);
            return;
        }

        let imagePath = building.graphicsFile || building.images?.built;

        if (imagePath) {
            // Try to load and draw building image
            this.drawBuildingImage(imagePath, buildingX, buildingY, row, col);
        } else {
            // Fallback: draw simple rectangle if no graphics found
            console.log(`⚠️ No graphics found for building: ${building.id || building.type}`);

            const tint = this.getBuildingTint(row, col);
            if (tint === 'yellow') {
                this.ctx.fillStyle = this.hexToRgba(this.playerColor, 0.7);
            } else {
                this.ctx.fillStyle = '#666';
            }

            const buildingWidth = this.tileWidth * 0.8;
            const buildingHeight = this.tileHeight * 1.5;

            this.ctx.fillRect(
                iso.x - buildingWidth / 2,
                buildingY - buildingHeight,
                buildingWidth,
                buildingHeight
            );

            // Building border
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(
                iso.x - buildingWidth / 2,
                buildingY - buildingHeight,
                buildingWidth,
                buildingHeight
            );
        }

        this.ctx.restore();
    }

    /**
     * Draw building image from assets
     */
    drawBuildingImage(imagePath, x, y, row, col) {
        // Use global preloaded image cache
        if (window.buildingImageCache && window.buildingImageCache.has(imagePath)) {
            const img = window.buildingImageCache.get(imagePath);
            if (img && img.complete) {
                this.drawImageAtPosition(img, x, y, row, col);
                return;
            }
        }

        // Fallback: draw warning if image not preloaded
        console.warn(`⚠️ Building image not preloaded: ${imagePath}`);
        this.drawImageNotFoundPlaceholder(x, y, row, col);
    }

    /**
     * Draw placeholder for missing building images
     */
    drawImageNotFoundPlaceholder(x, y, row, col) {
        // Match precise alignment: width exactly matches parcel width
        const buildingWidth = this.tileWidth;
        const buildingHeight = this.tileHeight * 2; // Default height for placeholder

        // Position building so bottom aligns with diamond bottom point
        // x,y parameters are already the center point from toIsometric, so true bottom is y + halfHeight
        const diamondBottomY = y + (this.tileHeight / 2);
        const finalY = diamondBottomY - buildingHeight;

        // Draw a simple colored rectangle as fallback
        this.ctx.fillStyle = '#888'; // Gray fallback
        this.ctx.fillRect(
            x - buildingWidth / 2,
            finalY,
            buildingWidth,
            buildingHeight
        );

        // Add a "?" symbol to indicate missing image
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${this.tileWidth * 0.4}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('?', x, finalY + buildingHeight / 2);
    }

    /**
     * Draw the loaded image at the building position
     */
    drawImageAtPosition(img, x, y, row, col) {
        // PRECISE ALIGNMENT: Building width exactly matches diamond parcel width
        // Left/right edges align with diamond left/right points
        const buildingWidth = this.tileWidth; // Exactly match parcel width

        // Height maintains aspect ratio, unbounded vertically for tall cities
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const buildingHeight = buildingWidth / aspectRatio;

        // Apply final positioning with user's +9 adjustment
        const buildingY = y + 9;
        const buildingX = x;

        // Apply dynamic offsets from position adjuster (if active)
        const finalX = buildingX + (this.buildingXOffset || 0);
        const finalY = buildingY - buildingHeight + (this.buildingYOffset || 0);

        // Apply building tint if this parcel is connected
        const tint = this.getBuildingTint(row, col);
        if (tint === 'yellow') {
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = this.hexToRgba(this.playerColor, 0.8);
            this.ctx.fillRect(
                finalX - buildingWidth / 2,
                finalY,
                buildingWidth,
                buildingHeight
            );
            this.ctx.globalCompositeOperation = 'source-over';
        }

        // Draw building with edges perfectly aligned to diamond parcel
        this.ctx.drawImage(
            img,
            finalX - buildingWidth / 2,  // Center horizontally on diamond
            finalY,                      // Bottom-align with diamond bottom
            buildingWidth,               // Exactly match parcel width
            buildingHeight               // Maintain aspect ratio
        );
    }

    /**
     * Render hover effects on top
     */
    renderHoverEffects() {
        if (!this.currentHover) return;

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                this.renderParcelEffect(row, col);
            }
        }
    }

    /**
     * Render effect for a single parcel
     */
    renderParcelEffect(row, col) {
        const key = `${row},${col}`;
        const isHovered = this.currentHover &&
                         this.currentHover.row === row && this.currentHover.col === col;
        const isAdjacent = this.adjacentParcels.has(key);

        if (!isHovered && !isAdjacent) return;

        const iso = this.game.renderingSystem.toIsometric(col, row);

        this.ctx.save();

        if (isHovered) {
            // Get current player color dynamically
            const playerColor = this.game.playerSettings?.color || '#10AC84';

            // Bright center effect - use full tile size from V1
            this.ctx.fillStyle = this.hexToRgba(playerColor, this.hoverOpacity);
            this.game.renderingSystem.drawDiamond(iso.x, iso.y,
                this.game.renderingSystem.tileWidth,
                this.game.renderingSystem.tileHeight);
            this.ctx.fill();

            // Border - use full tile size with glow effect
            this.ctx.strokeStyle = playerColor;
            this.ctx.lineWidth = 2;
            this.ctx.shadowColor = playerColor;
            this.ctx.shadowBlur = 8;
            this.game.renderingSystem.drawDiamond(iso.x, iso.y,
                this.game.renderingSystem.tileWidth,
                this.game.renderingSystem.tileHeight);
            this.ctx.stroke();

            // Reset shadow
            this.ctx.shadowBlur = 0;
        } else if (isAdjacent) {
            // Get current player color dynamically
            const playerColor = this.game.playerSettings?.color || '#10AC84';

            // Subtle adjacent effect - use full tile size
            this.ctx.fillStyle = this.hexToRgba(playerColor, this.adjacentOpacity);
            this.game.renderingSystem.drawDiamond(iso.x, iso.y,
                this.game.renderingSystem.tileWidth,
                this.game.renderingSystem.tileHeight);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    /**
     * Get building tint for connected parcels
     */
    getBuildingTint(row, col) {
        const key = `${row},${col}`;
        const isHovered = this.currentHover &&
                         this.currentHover.row === row && this.currentHover.col === col;
        const isAdjacent = this.adjacentParcels.has(key);

        return (isHovered || isAdjacent) ? 'yellow' : null;
    }

    /**
     * Schedule render for next frame
     */
    scheduleRender() {
        if (!this.renderScheduled) {
            this.renderScheduled = true;
            requestAnimationFrame(() => this.render());
        }
    }

    /**
     * Utility methods
     */
    isSameParcel(p1, p2) {
        if (!p1 && !p2) return true;
        if (!p1 || !p2) return false;
        return p1.row === p2.row && p1.col === p2.col;
    }

    hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(16, 172, 132, ${alpha})`;

        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Get tile color based on parcel state (simplified for V2)
     */
    getTileColor(parcel, row, col) {
        // Normal layer logic
        if (!parcel) return '#2a2a2a'; // Unowned - charcoal gray

        // Under construction
        if (parcel._isUnderConstruction) {
            return '#8B4513'; // Brown for construction
        }

        // Based on owner
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            return '#2a2a2a'; // Unowned - charcoal gray
        } else {
            return this.getPlayerColor(parcel.owner);
        }
    }


    /**
     * Setup canvas dimensions and tile calculations
     */
    setupCanvas() {
        // Calculate canvas dimensions based on container
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

        // Calculate optimal tile dimensions for the grid
        const availableWidth = this.canvas.width * 0.9;
        const availableHeight = this.canvas.height * 0.9;

        // CORRECT ISOMETRIC GRID CALCULATION
        // For a gridSize x gridSize grid (indices 0 to gridSize-1):
        // - Grid spans (gridSize-1) * tileWidth horizontally
        // - Grid spans (gridSize-1) * tileHeight vertically
        const gridSpan = this.game.gridSize - 1;

        // Calculate maximum tile size that fits in available space
        const maxTileWidth = availableWidth / gridSpan;
        const maxTileHeight = availableHeight / gridSpan;

        // Use optimal tile dimensions (maintain 2:1 ratio for isometric look)
        this.tileWidth = Math.min(maxTileWidth, 100);
        this.tileHeight = Math.min(maxTileHeight, this.tileWidth / 2);

        // CORRECT CENTERING CALCULATION
        // Isometric grid bounds (before offset):
        // minX = -gridSpan * tileWidth/2, maxX = gridSpan * tileWidth/2
        // minY = 0, maxY = gridSpan * tileHeight

        // Center the grid properly:
        this.game.offsetX = this.canvas.width / 2;  // Centers the diamond horizontally
        this.game.offsetY = (this.canvas.height - gridSpan * this.tileHeight) / 2;  // Centers vertically

        // Set tile dimensions on game object for backwards compatibility
        this.game.tileWidth = this.tileWidth;
        this.game.tileHeight = this.tileHeight;
    }

    /**
     * Draw parcel borders
     */
    drawParcelBorders(row, col, tileWidth, tileHeight) {
        const parcel = this.game.grid[row][col];

        // Different border styles based on state
        if (parcel && parcel.owner) {
            this.ctx.strokeStyle = '#999';
            this.ctx.lineWidth = 1;
        } else {
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
        }

        // Use isometric coordinate conversion
        const iso = this.toIsometric(col, row);
        this.drawDiamond(iso.x, iso.y, tileWidth, tileHeight);
        this.ctx.stroke();
    }

    /**
     * Convert screen coordinates to grid coordinates
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

            // Validate bounds
            if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
                return null;
            }

            return { row, col };
        })();
    }

    /**
     * Convert grid coordinates to isometric screen coordinates
     */
    toIsometric(col, row) {
        const isoX = (col - row) * (this.tileWidth / 2) + (this.game.offsetX || 0);
        const isoY = (col + row) * (this.tileHeight / 2) + (this.game.offsetY || 0);
        return { x: isoX, y: isoY };
    }

    /**
     * Draw diamond shape for isometric tiles
     */
    drawDiamond(centerX, centerY, width, height) {
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - height / 2);  // Top
        this.ctx.lineTo(centerX + width / 2, centerY);   // Right
        this.ctx.lineTo(centerX, centerY + height / 2);  // Bottom
        this.ctx.lineTo(centerX - width / 2, centerY);   // Left
        this.ctx.closePath();
    }

    /**
     * Initialize the rendering system (compatibility method)
     */
    initialize() {
        // V2 system is already initialized in constructor
        // This method exists for backwards compatibility
        console.log('🎨 V2 Rendering System initialized');
        this.scheduleRender();
    }

    /**
     * Handle server updates (compatibility method)
     */
    handleServerUpdate(update) {
        // V2 system is lightweight - just trigger a render if needed
        if (update && (update.type === 'BUILDING_COMPLETED' || update.type === 'SERVER_STATE_SYNC')) {
            this.scheduleRender();
        }
    }
}