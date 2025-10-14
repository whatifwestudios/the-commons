/**
 * Simple, reliable parcel hover system (V2)
 *
 * Replaces complex parcel-selector-manager with:
 * - Direct coordinate conversion using CoordinateUtils
 * - Integration with tooltip-system.js
 * - Simple visual effects for hover + adjacent parcels
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

            // Mark old hover and its neighbors dirty (before updating state)
            if (this.currentHover && this.game.renderingSystem?.markParcelAndNeighborsDirty) {
                this.game.renderingSystem.markParcelAndNeighborsDirty(
                    this.currentHover.row,
                    this.currentHover.col
                );
            }

            this.currentHover = newHover;
            this.updateAdjacentParcels();
            this.updateTooltip();

            // Mark new hover and its neighbors dirty
            if (this.currentHover && this.game.renderingSystem?.markParcelAndNeighborsDirty) {
                this.game.renderingSystem.markParcelAndNeighborsDirty(
                    this.currentHover.row,
                    this.currentHover.col
                );
            }

            // Trigger re-render on hover state change
            this.game.scheduleRender();
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
     * Get building bob offset (removed - no more bob animation)
     * Kept for backwards compatibility, always returns 0
     */
    getBuildingBobOffset(row, col) {
        return 0; // Bob animation removed for performance
    }

    /**
     * REMOVED: getTintedBuilding - Building tinting system removed for performance
     * Adjacent parcels now only show colored diamond overlays, not tinted buildings
     */

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