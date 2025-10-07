/**
 * Simple, reliable parcel hover system (V2)
 *
 * Replaces complex parcel-selector-manager with:
 * - Direct coordinate conversion using CoordinateUtils
 * - Integration with tooltip-system.js
 * - Simple visual effects for hover + adjacent parcels
 * - Building color tints for connected parcels
 */

class ParcelHoverV2 {
    constructor(game) {
        this.game = game;

        // Simple state tracking
        this.currentHover = null; // { row, col }
        this.adjacentParcels = new Set(); // Set of "row,col" strings

        // Event cleanup manager
        this.eventManager = new window.EventCleanupManager();

        // Visual config - enhanced for better visibility
        this._playerColor = '#10AC84'; // Default, will be updated
        this.hoverOpacity = 0.35; // Increased from 0.3 for better visibility
        this.adjacentOpacity = 0.18; // Increased from 0.15 for better visibility
        this.borderWidth = 3; // Thicker border for clarity

        // Building hover animation config
        this.buildingLiftHeight = 4; // pixels to lift building
        this.buildingBobDuration = 800; // ms for complete down-up cycle
        this.hoverStartTime = null; // When hover started (for animation)

        // Tinted building cache (for adjacent buildings)
        this.tintedBuildingCache = new Map(); // key: "buildingId_color" -> canvas

        // Debug counter for renderEffects calls
        this.renderCallCount = 0;

        this.setupMouseHandling();
    }

    /**
     * Player color getter/setter with logging
     */
    get playerColor() {
        return this._playerColor;
    }

    set playerColor(color) {
        this._playerColor = color;
        // Force re-render to show new color
        if (this.game.scheduleRender) {
            this.game.scheduleRender();
        }
    }

    /**
     * Setup simple, reliable mouse handling
     */
    setupMouseHandling() {

        // Remove complex debug handlers from game.js
        this.clearExistingHandlers();

        // Simple mousemove handler with proper cleanup tracking
        this.eventManager.addEventListener(this.game.canvas, 'mousemove', (e) => {
            // Store mouse position for tooltip system
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            const rect = this.game.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Use screen coordinates directly (no zoom/pan conversion needed)
            const worldCoords = { x: screenX, y: screenY };

            // Use the rendering system's coordinate conversion
            const tile = this.game.renderingSystem?.fromIsometric(worldCoords.x, worldCoords.y);

            // Debug logging (only when tile changes)
            const newTile = tile ? `${tile.row},${tile.col}` : null;
            const currentTile = this.currentHover ? `${this.currentHover.row},${this.currentHover.col}` : null;

            this.updateHover(tile);
        });

        // Clear hover when mouse leaves canvas
        this.eventManager.addEventListener(this.game.canvas, 'mouseleave', () => {
            this.updateHover(null);
        });
    }

    /**
     * Remove existing complex mouse handlers
     */
    clearExistingHandlers() {
        // Use event cleanup manager to properly remove all tracked listeners
        this.eventManager.cleanup();
    }

    /**
     * Update hover state and adjacent parcels
     */
    updateHover(tile) {
        const newHover = tile ? { row: tile.row, col: tile.col } : null;

        // Only update if different
        if (!this.isSameParcel(this.currentHover, newHover)) {
            const wasHovering = this.currentHover !== null;
            const nowHovering = newHover !== null;

            this.currentHover = newHover;
            this.updateAdjacentParcels();
            this.updateTooltip();

            // Start animation timer when hover begins
            if (!wasHovering && nowHovering) {
                this.hoverStartTime = Date.now();
                this.startBobAnimation();
            } else if (!nowHovering) {
                this.hoverStartTime = null;
                this.stopBobAnimation();
            }

            this.game.scheduleRender();
        }
    }

    /**
     * Start bob animation loop (only runs while hovering)
     */
    startBobAnimation() {
        if (this.bobAnimationId) return; // Already running

        const animate = () => {
            if (!this.currentHover || !this.hoverStartTime) {
                this.bobAnimationId = null;
                return; // Stop if no longer hovering
            }

            this.game.scheduleRender();
            this.bobAnimationId = requestAnimationFrame(animate);
        };

        this.bobAnimationId = requestAnimationFrame(animate);
    }

    /**
     * Stop bob animation loop
     */
    stopBobAnimation() {
        if (this.bobAnimationId) {
            cancelAnimationFrame(this.bobAnimationId);
            this.bobAnimationId = null;
        }
    }

    /**
     * Calculate 8 adjacent parcels for current hover
     */
    updateAdjacentParcels() {
        this.adjacentParcels.clear();

        if (!this.currentHover) return;

        const { row, col } = this.currentHover;

        // 8 adjacent parcels
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip center

                const adjRow = row + dr;
                const adjCol = col + dc;

                // Check bounds
                if (adjRow >= 0 && adjRow < this.game.gridSize &&
                    adjCol >= 0 && adjCol < this.game.gridSize) {
                    this.adjacentParcels.add(`${adjRow},${adjCol}`);
                }
            }
        }
    }

    /**
     * Update V2 tooltip with parcel information
     * Delegates to TooltipSystemV2 for proper rendering
     */
    updateTooltip() {
        if (!this.currentHover) {
            // Clear tooltip
            if (this.game.tooltipSystemV2?.hide) {
                this.game.tooltipSystemV2.hide();
            }
            return;
        }

        const { row, col } = this.currentHover;

        // Delegate to TooltipSystemV2 with proper data format
        // Use our tracked mouse position instead of game.lastMouseEvent
        if (this.game.tooltipSystemV2?.show) {
            const mouseX = this.lastMouseX || 0;
            const mouseY = this.lastMouseY || 0;
            this.game.tooltipSystemV2.show('parcel', { row, col }, mouseX, mouseY);
        }
    }

    /**
     * REMOVED: Tooltip content building delegated to TooltipSystemV2
     * TooltipSystemV2 handles all tooltip rendering with proper data formatting
     */

    /**
     * Render hover effects during tile rendering
     */
    renderEffects(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {

        const key = `${row},${col}`;
        const isHovered = this.currentHover &&
                         this.currentHover.row === row && this.currentHover.col === col;
        const isAdjacent = this.adjacentParcels.has(key);

        if (!isHovered && !isAdjacent) return;

        ctx.save();

        if (isHovered) {
            // Subtle glow effect for depth
            ctx.shadowColor = this._playerColor;
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Bright hover fill
            ctx.fillStyle = this.hexToRgba(this._playerColor, this.hoverOpacity);
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.fill();

            // Clear shadow for crisp border
            ctx.shadowBlur = 0;

            // Bold border for clarity
            ctx.strokeStyle = this._playerColor;
            ctx.lineWidth = this.borderWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.stroke();
        } else if (isAdjacent) {
            // Subtle adjacent effect with slight glow
            ctx.shadowColor = this._playerColor;
            ctx.shadowBlur = 8;
            ctx.fillStyle = this.hexToRgba(this._playerColor, this.adjacentOpacity);
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * REMOVED: getBuildingTint - no longer used
     * Building tint overlay was a legacy UI approach that has been removed
     */

    /**
     * Calculate building bob animation offset
     * Returns vertical offset in pixels (negative = up)
     */
    getBuildingBobOffset(row, col) {
        // Only animate if this is the hovered parcel with a building
        if (!this.currentHover || !this.hoverStartTime) return 0;
        if (this.currentHover.row !== row || this.currentHover.col !== col) return 0;

        // Check if parcel has a building
        const parcel = this.game.grid?.[row]?.[col];
        if (!parcel || !parcel.building) return 0;

        // Calculate animation progress
        const elapsed = Date.now() - this.hoverStartTime;
        const cycleProgress = (elapsed % this.buildingBobDuration) / this.buildingBobDuration;

        // Ease-in-out sine wave: starts lifted, bobs down then back up
        // 0 -> 0.5 = down from lift, 0.5 -> 1.0 = back up to lift
        const easedProgress = (Math.cos(cycleProgress * Math.PI * 2) + 1) / 2;

        // Start lifted by full amount, bob between 0 and lift height
        const bobOffset = -this.buildingLiftHeight * easedProgress;

        // Animation loop is now handled by startBobAnimation/stopBobAnimation
        // No need to call scheduleRender here - already handled by animation loop

        return bobOffset;
    }

    /**
     * Get or create tinted building image for adjacent parcels
     * Returns { image, opacity } or null
     */
    getTintedBuilding(row, col) {
        const key = `${row},${col}`;

        // Only for adjacent parcels (not hovered)
        if (!this.adjacentParcels.has(key)) return null;
        if (this.currentHover && this.currentHover.row === row && this.currentHover.col === col) {
            return null;
        }

        // Check if parcel has a building
        const parcel = this.game.grid?.[row]?.[col];
        if (!parcel || !parcel.building) return null;

        const buildingId = parcel.building;
        const cacheKey = `${buildingId}_${this._playerColor}`;

        // Return cached version if available
        if (this.tintedBuildingCache.has(cacheKey)) {
            return {
                image: this.tintedBuildingCache.get(cacheKey),
                opacity: 0.3
            };
        }

        // Enforce cache size limit (LRU eviction)
        const MAX_CACHE_SIZE = 50;
        if (this.tintedBuildingCache.size >= MAX_CACHE_SIZE) {
            // Remove oldest entry (first key in Map)
            const firstKey = this.tintedBuildingCache.keys().next().value;
            this.tintedBuildingCache.delete(firstKey);
        }

        // Create tinted version on-demand
        // Get image from building definitions and global cache
        const buildingDef = this.game.buildingManager?.getBuildingById(buildingId);
        if (!buildingDef?.graphics?.src) return null;

        const imagePath = buildingDef.graphics.src;
        const originalImage = window.buildingImageCache?.get(imagePath);
        if (!originalImage || !originalImage.complete) return null;

        // OPTIMIZED: Use canvas composite operations instead of pixel manipulation
        // This is GPU-accelerated and much faster than iterating over pixels
        const canvas = document.createElement('canvas');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: false }); // Performance hint

        // Draw original image
        ctx.drawImage(originalImage, 0, 0);

        // Apply color tint using composite operations (much faster than pixel iteration)
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = this._playerColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Restore original brightness by blending with original
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(originalImage, 0, 0);

        // Reset composite mode
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;

        // Cache the result
        this.tintedBuildingCache.set(cacheKey, canvas);

        return {
            image: canvas,
            opacity: 0.3
        };
    }

    /**
     * Utility: Check if two parcels are the same
     */
    isSameParcel(p1, p2) {
        if (!p1 && !p2) return true;
        if (!p1 || !p2) return false;
        return p1.row === p2.row && p1.col === p2.col;
    }

    /**
     * Utility: Convert hex color to rgba
     */
    hexToRgba(hex, alpha) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(16, 172, 132, ${alpha})`;

        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}