/**
 * Simple, reliable parcel hover system (V2)
 *
 * Replaces complex parcel-selector-manager with:
 * - Direct coordinate conversion using CoordinateUtils
 * - Integration with tooltip-system-v2.js
 * - Simple visual effects for hover + adjacent parcels
 * - Building color tints for connected parcels
 */

class ParcelHoverV2 {
    constructor(game) {
        console.log('🎯 ParcelHoverV2: Initializing with game:', game);
        this.game = game;

        // Simple state tracking
        this.currentHover = null; // { row, col }
        this.adjacentParcels = new Set(); // Set of "row,col" strings

        // Visual config
        this._playerColor = '#10AC84'; // Default, will be updated
        this.hoverOpacity = 0.3;
        this.adjacentOpacity = 0.15;

        console.log('🎨 ParcelHoverV2: Initial player color:', this._playerColor);

        // Debug counter for renderEffects calls
        this.renderCallCount = 0;

        this.setupMouseHandling();
        console.log('🎯 ParcelHoverV2: Initialization complete');
    }

    /**
     * Player color getter/setter with logging
     */
    get playerColor() {
        return this._playerColor;
    }

    set playerColor(color) {
        console.log('🎨 ParcelHoverV2: Player color updated from', this._playerColor, 'to', color);
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
        console.log('🎯 ParcelHoverV2: Setting up mouse handling on canvas:', this.game.canvas);

        // Remove complex debug handlers from game.js
        this.clearExistingHandlers();

        // Simple mousemove handler
        this.game.canvas.addEventListener('mousemove', (e) => {
            const rect = this.game.canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Convert to world coordinates
            const worldCoords = this.game.screenToWorldCoords(screenX, screenY);

            // Use the rendering system's coordinate conversion
            const tile = this.game.renderingSystem?.fromIsometric(worldCoords.x, worldCoords.y);

            // Debug logging (only when tile changes)
            const newTile = tile ? `${tile.row},${tile.col}` : null;
            const currentTile = this.currentHover ? `${this.currentHover.row},${this.currentHover.col}` : null;
            if (newTile !== currentTile) {
                console.log(`🎯 ParcelHoverV2: Tile changed from ${currentTile} to ${newTile}`);
            }

            this.updateHover(tile);
        });

        // Clear hover when mouse leaves canvas
        this.game.canvas.addEventListener('mouseleave', () => {
            this.updateHover(null);
        });
    }

    /**
     * Remove existing complex mouse handlers
     */
    clearExistingHandlers() {
        // Skip canvas cloning to preserve other event handlers
        // The V2 system should work alongside existing handlers
        console.log('🎯 ParcelHoverV2: Skipping canvas cloning - preserving existing handlers');
    }

    /**
     * Update hover state and adjacent parcels
     */
    updateHover(tile) {
        const newHover = tile ? { row: tile.row, col: tile.col } : null;

        // Only update if different
        if (!this.isSameParcel(this.currentHover, newHover)) {
            this.currentHover = newHover;
            this.updateAdjacentParcels();
            this.updateTooltip();
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
     */
    updateTooltip() {
        if (!this.currentHover) {
            // Clear tooltip
            if (window.TooltipSystem?.hideTooltip) {
                window.TooltipSystem.hideTooltip();
            }
            return;
        }

        const { row, col } = this.currentHover;
        const parcel = this.game.grid?.[row]?.[col];

        // Build tooltip content
        const content = this.buildTooltipContent(parcel, row, col);

        // Show tooltip using V2 system
        if (window.TooltipSystem?.showTooltip) {
            window.TooltipSystem.showTooltip(content, {
                x: this.game.lastMouseEvent?.clientX || 0,
                y: this.game.lastMouseEvent?.clientY || 0
            });
        }
    }

    /**
     * Build rich tooltip content for parcel
     */
    buildTooltipContent(parcel, row, col) {
        const lines = [];

        // Location
        lines.push(`<strong>Parcel ${String.fromCharCode(65 + col)}${row + 1}</strong>`);

        // Owner
        if (parcel?.owner) {
            lines.push(`Owner: Player ${parcel.owner}`);
        } else {
            lines.push(`<em>Unowned</em>`);
        }

        // Building
        if (parcel?.building) {
            lines.push(`Building: ${parcel.building}`);
            if (parcel._isUnderConstruction) {
                lines.push(`<em>Under Construction</em>`);
            }
        } else {
            lines.push(`<em>Empty lot</em>`);
        }

        // Economic data if available
        if (parcel?.rent) {
            lines.push(`Rent: $${parcel.rent}/month`);
        }

        return lines.join('<br>');
    }

    /**
     * Render hover effects during tile rendering
     */
    renderEffects(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {
        // Debug: Log first 10 calls to verify integration
        this.renderCallCount++;
        if (this.renderCallCount <= 10) {
            console.log(`🎨 ParcelHoverV2: renderEffects called #${this.renderCallCount} for tile ${row},${col}`);
        }

        const key = `${row},${col}`;
        const isHovered = this.currentHover &&
                         this.currentHover.row === row && this.currentHover.col === col;
        const isAdjacent = this.adjacentParcels.has(key);

        if (!isHovered && !isAdjacent) return;

        ctx.save();

        if (isHovered) {
            // Bright hover effect
            ctx.fillStyle = this.hexToRgba(this._playerColor, this.hoverOpacity);
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.fill();

            // Border
            ctx.strokeStyle = this._playerColor;
            ctx.lineWidth = 3;
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.stroke();
        } else if (isAdjacent) {
            // Subtle adjacent effect
            ctx.fillStyle = this.hexToRgba(this._playerColor, this.adjacentOpacity);
            this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Get building tint for connected parcels
     */
    getBuildingTint(row, col) {
        const key = `${row},${col}`;
        const isHovered = this.currentHover &&
                         this.currentHover.row === row && this.currentHover.col === col;
        const isAdjacent = this.adjacentParcels.has(key);

        if (isHovered || isAdjacent) {
            return 'yellow'; // Player color variant
        }

        return null;
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