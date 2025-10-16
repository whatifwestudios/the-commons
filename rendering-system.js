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

        // Visual config (hover state managed by ParcelHoverV2)
        this.tileWidth = 100.0;
        this.tileHeight = 50.0;  // Standard 30° isometric (2:1 ratio)

        // Building completion animation system (event-driven, not loop-based)
        this.animatingBuildings = new Map(); // key: "row,col" -> {startTime, duration}
        this.animationQueue = []; // Queue of {row, col} waiting to animate
        this.isPlayingAnimation = false; // Only one animation at a time
        this.COMPLETION_ANIMATION_DURATION = 1500; // 1.5 seconds

        // Dirty region tracking for partial redraws
        this.dirtyParcels = new Set(); // Set of "row,col" strings that need redrawing
        this.forceFullRedraw = false; // Flag to force complete canvas redraw
        this.DIRTY_THRESHOLD = 0.3; // If >30% of parcels are dirty, do full redraw

        // Performance
        this.renderScheduled = false;
        this.animationFrameId = null;

        // Performance monitoring
        this.renderCount = 0;
        this.renderStartTime = Date.now();
        this.lastRenderTime = 0;
        this.renderTimes = [];

        // Event cleanup manager for memory leak prevention
        if (typeof window !== 'undefined' && window.EventCleanupManager) {
            this.eventManager = new window.EventCleanupManager();
        } else if (typeof require !== 'undefined') {
            const EventCleanupManager = require('./event-cleanup-manager');
            this.eventManager = new EventCleanupManager();
        } else {
            // Fallback: basic event tracking for browser environments without EventCleanupManager
            this.eventManager = {
                listeners: [],
                addEventListener: function(element, event, handler, options) {
                    element.addEventListener(event, handler, options);
                    this.listeners.push({ element, event, handler, options });
                },
                cleanup: function() {
                    this.listeners.forEach(({ element, event, handler, options }) => {
                        element.removeEventListener(event, handler, options);
                    });
                    this.listeners = [];
                }
            };
        }

        this.init();
    }

    /**
     * Initialize V2 system - replace all legacy handlers
     */
    init() {
        this.cleanupLegacyHandlers();
        // Mouse handling delegated to ParcelHoverV2 - no duplicate handlers

        // Mark everything dirty for first render
        this.markAllDirty();

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

    }


    /**
     * Clean up all event listeners (for multiplayer room changes)
     */
    destroy() {
        if (this.eventManager) {
            this.eventManager.cleanup();
        }
    }


    /**
     * Complete V2 rendering pipeline with dirty region tracking
     */
    render() {
        if (!this.renderScheduled) return;
        this.renderScheduled = false;

        const renderStart = performance.now();

        // Determine if we should do a full or partial redraw
        const totalParcels = this.game.gridSize * this.game.gridSize;
        const dirtyCount = this.dirtyParcels.size;
        const dirtyRatio = dirtyCount / totalParcels;

        // TEMPORARY: Always do full redraw until we implement proper dirty region rendering
        // Partial redraws with clearRect don't work well with isometric overlap
        const shouldDoFullRedraw = true; // TODO: Implement proper dirty region tracking with Z-order awareness

        if (shouldDoFullRedraw) {
            // Full redraw: clear entire canvas and render everything
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.save();
            this.renderGrid();
            this.renderPowerLines(); // Draw power lines on energy layer
            this.renderStreetEdgeHover(); // Show hover effect on street edges
            this.renderBuildings();
            this.renderHoverEffects();
            this.renderEnergyLegend(); // Show energy grid legend on energy layer
            this.ctx.restore();
        } else {
            // Partial redraw: only redraw dirty parcels
            // NOTE: We still need to clear and redraw affected regions
            // This is a simplified approach - a full implementation would track Z-order
            this.ctx.save();
            this.renderDirtyParcels();
            this.ctx.restore();
        }

        // Clear dirty regions after rendering
        this.clearDirtyRegions();

        // NOTE: Construction animation removed - buildings are static at 70% dim until completion
        // Completion animation is event-driven (16 keyframes over 1.5s), not a continuous loop

        // Performance monitoring
        const renderEnd = performance.now();
        const renderDuration = renderEnd - renderStart;
        this.renderCount++;
        this.lastRenderTime = renderDuration;
        this.renderTimes.push(renderDuration);

        // Keep only last 100 render times
        if (this.renderTimes.length > 100) {
            this.renderTimes.shift();
        }

        // Log performance stats every 5 seconds
        const elapsed = Date.now() - this.renderStartTime;
        if (elapsed > 5000) {
            const avgRenderTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
            const maxRenderTime = Math.max(...this.renderTimes);
            const fps = this.renderCount / (elapsed / 1000);
            console.log(`[PERF] Renders: ${this.renderCount} | FPS: ${fps.toFixed(1)} | Avg: ${avgRenderTime.toFixed(2)}ms | Max: ${maxRenderTime.toFixed(2)}ms`);

            // Reset counters
            this.renderCount = 0;
            this.renderStartTime = Date.now();
            this.renderTimes = [];
        }
    }

    /**
     * Render only dirty parcels (partial redraw optimization)
     */
    renderDirtyParcels() {
        // Convert dirty parcel set to sorted array for Z-order rendering
        const dirtyTiles = [];
        for (const key of this.dirtyParcels) {
            const [row, col] = key.split(',').map(Number);
            const iso = this.toIsometric(col, row);
            dirtyTiles.push({ col, row, zIndex: iso.zIndex || (row + col) });
        }

        // Sort by Z-index for correct isometric overlap (back to front)
        dirtyTiles.sort((a, b) => a.zIndex - b.zIndex);

        // Clear and redraw each dirty tile
        for (const tile of dirtyTiles) {
            // Clear the region around this parcel (approximate bounding box)
            const iso = this.toIsometric(tile.col, tile.row);
            const clearWidth = this.tileWidth * 1.5;  // Extra space for buildings
            const clearHeight = this.tileHeight * 4;  // Extra space for tall buildings
            this.ctx.clearRect(
                iso.x - clearWidth / 2,
                iso.y - clearHeight + this.tileHeight / 2,
                clearWidth,
                clearHeight
            );

            // Render tile, building, and effects for this parcel
            this.renderTile(tile.col, tile.row);
            this.renderBuilding(tile.row, tile.col);

            // Render hover effects if this parcel is involved in hover
            const key = `${tile.row},${tile.col}`;
            if (this.game.parcelHover) {
                const isHovered = this.game.parcelHover.currentHover &&
                                this.game.parcelHover.currentHover.row === tile.row &&
                                this.game.parcelHover.currentHover.col === tile.col;
                const isAdjacent = this.game.parcelHover.adjacentParcels.has(key);

                if (isHovered || isAdjacent) {
                    this.game.parcelHover.renderEffects(tile.row, tile.col, this.ctx, iso.x, iso.y,
                        this.tileWidth, this.tileHeight);
                }
            }
        }
    }

    /**
     * Render the isometric grid (full redraw)
     */
    renderGrid() {
        // Direct grid access for efficient rendering
        if (!this.game.grid || !this.game.gridSize) {
            return; // No grid data available
        }

        // Build tile list with Z-index for proper isometric rendering
        const tiles = [];
        window.GridUtils.forEachPosition(this.game.gridSize, (row, col) => {
            const iso = this.toIsometric(col, row);
            tiles.push({ col, row, zIndex: iso.zIndex || (row + col) });
        });

        // Sort by Z-index for correct overlap (back to front)
        tiles.sort((a, b) => a.zIndex - b.zIndex);

        // Render tiles in correct order
        for (const tile of tiles) {
            this.renderTile(tile.col, tile.row);
        }
    }

    /**
     * Render power lines on street edges
     * Only visible on energy layer
     */
    renderPowerLines() {
        const currentLayer = this.game.currentLayer || 'normal';
        if (currentLayer !== 'energy') return;

        const energyGrid = this.game.economicClient?.energyGrid;
        if (!energyGrid || !energyGrid.lines || energyGrid.lines.size === 0) return;

        this.ctx.save();

        // Draw each power line on street edges
        for (const [edgeId, lineData] of energyGrid.lines) {
            const edge = this.parseEdgeId(edgeId);
            if (!edge) continue;

            // Calculate actual edge points on the diamond, not centers
            const edgePoints = this.getEdgePoints(edge);
            if (!edgePoints) continue;

            // Electric green power line on the street (30% darker)
            this.ctx.strokeStyle = '#00B22D';
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = '#00B22D';
            this.ctx.shadowBlur = 5;

            this.ctx.beginPath();
            this.ctx.moveTo(edgePoints.x1, edgePoints.y1);
            this.ctx.lineTo(edgePoints.x2, edgePoints.y2);
            this.ctx.stroke();
        }

        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }

    /**
     * Get actual screen coordinates for an edge between two parcels
     * Returns the points where the edge exists on the diamond shape
     */
    getEdgePoints(edge) {
        const iso1 = this.toIsometric(edge.col1, edge.row1);
        const iso2 = this.toIsometric(edge.col2, edge.row2);

        const halfWidth = this.tileWidth / 2;
        const halfHeight = this.tileHeight / 2;

        // Horizontal edge: connects [row,col] and [row,col+1]
        // This is the RIGHT edge of parcel1 / LEFT edge of parcel2
        if (edge.type === 'h') {
            // Right point of first diamond = Left point of second diamond
            return {
                x1: iso1.x + halfWidth,  // Right point of first parcel
                y1: iso1.y,
                x2: iso2.x - halfWidth,  // Left point of second parcel (same as x1,y1 actually!)
                y2: iso2.y
            };
        }
        // Vertical edge: connects [row,col] and [row+1,col]
        // This is the BOTTOM edge of parcel1 / TOP edge of parcel2
        else if (edge.type === 'v') {
            // Bottom point of first diamond = Top point of second diamond
            return {
                x1: iso1.x,              // Bottom point of first parcel
                y1: iso1.y + halfHeight,
                x2: iso2.x,              // Top point of second parcel (same as x1,y1 actually!)
                y2: iso2.y - halfHeight
            };
        }

        return null;
    }

    /**
     * Parse edge ID into coordinates
     * Returns {row1, col1, row2, col2} or null
     */
    parseEdgeId(edgeId) {
        const parts = edgeId.split('_');
        if (parts.length !== 3) return null;

        const type = parts[0];
        const row = parseInt(parts[1]);
        const col = parseInt(parts[2]);

        if (type === 'h') {
            // Horizontal: connects [row,col] and [row,col+1]
            return { type: 'h', row1: row, col1: col, row2: row, col2: col + 1 };
        } else if (type === 'v') {
            // Vertical: connects [row,col] and [row+1,col]
            return { type: 'v', row1: row, col1: col, row2: row + 1, col2: col };
        }

        return null;
    }

    /**
     * Render street edge hover effect
     * Shows glowing edge + preview bolts on affected parcels
     */
    renderStreetEdgeHover() {
        const currentLayer = this.game.currentLayer || 'normal';
        if (currentLayer !== 'energy') return;

        // Only show if hovering over an edge
        if (!this.game.hoveredStreetEdge) return;

        const edge = this.game.hoveredStreetEdge;
        this.ctx.save();

        // Calculate actual edge points on the diamond, not centers
        const edgePoints = this.getEdgePoints(edge);
        if (!edgePoints) {
            this.ctx.restore();
            return;
        }

        // Draw glowing street edge
        this.ctx.strokeStyle = '#FFD700'; // Gold glow for hover
        this.ctx.lineWidth = 6;
        this.ctx.shadowColor = '#FFD700';
        this.ctx.shadowBlur = 15;

        this.ctx.beginPath();
        this.ctx.moveTo(edgePoints.x1, edgePoints.y1);
        this.ctx.lineTo(edgePoints.x2, edgePoints.y2);
        this.ctx.stroke();

        this.ctx.shadowBlur = 0;

        // Only show preview bolts if building this line would connect parcels to a generator
        // Check if either parcel is already powered (has path to generator)
        const parcel1Powered = this.isParcelPowered(edge.row1, edge.col1);
        const parcel2Powered = this.isParcelPowered(edge.row2, edge.col2);

        // Only show bolts if at least one end is powered (or is a generator itself)
        // This means building the line would extend power to the other parcel
        if (parcel1Powered || parcel2Powered) {
            // Draw preview bolts on the 2 parcels along this street
            this.ctx.font = `${Math.floor(this.tileHeight * 0.28)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.globalAlpha = 0.5; // Semi-transparent

            // Draw bolt on first parcel
            const isoParcel1 = this.toIsometric(edge.col1, edge.row1);
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeText('⚡', isoParcel1.x, isoParcel1.y);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.fillText('⚡', isoParcel1.x, isoParcel1.y);

            // Draw bolt on second parcel
            const isoParcel2 = this.toIsometric(edge.col2, edge.row2);
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeText('⚡', isoParcel2.x, isoParcel2.y);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.fillText('⚡', isoParcel2.x, isoParcel2.y);

            this.ctx.globalAlpha = 1.0;
        }
        this.ctx.restore();
    }

    /**
     * Render energy grid legend (bottom-left corner)
     * Only visible on energy layer
     */
    renderEnergyLegend() {
        const currentLayer = this.game.currentLayer || 'normal';
        if (currentLayer !== 'energy') return;

        this.ctx.save();

        // Position in bottom-left corner with padding
        const padding = 20;
        const boxWidth = 280;  // Larger box
        const boxHeight = 170;  // Taller box
        const x = padding;
        const y = this.canvas.height - boxHeight - padding;

        // Darker, more professional background
        this.ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
        this.ctx.fillRect(x, y, boxWidth, boxHeight);

        // Subtle border
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, boxWidth, boxHeight);

        // Title with monospace font
        this.ctx.fillStyle = '#CCC';
        this.ctx.font = '600 15px \'SF Mono\', Monaco, Inconsolata, \'Roboto Mono\', \'Source Code Pro\', monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText('ENERGY GRID', x + 15, y + 12);

        // Grid layout for legend items with more spacing
        const startY = y + 45;
        const rowHeight = 38;  // More gap between rows
        const iconX = x + 28;
        const textX = x + 65;

        // Helper function to draw a legend row
        const drawLegendRow = (rowIndex, icon, iconColor, label) => {
            const rowY = startY + (rowIndex * rowHeight);

            // Draw icon
            if (icon === 'line') {
                // Power line
                this.ctx.strokeStyle = '#00B22D';
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(iconX - 10, rowY);
                this.ctx.lineTo(iconX + 10, rowY);
                this.ctx.stroke();
            } else {
                // Bolt icon
                this.ctx.font = icon;
                this.ctx.fillStyle = iconColor;
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1.5;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.strokeText('⚡', iconX, rowY);
                this.ctx.fillText('⚡', iconX, rowY);
            }

            // Draw label with monospace font
            this.ctx.fillStyle = '#DDD';
            this.ctx.font = '14px \'SF Mono\', Monaco, Inconsolata, \'Roboto Mono\', \'Source Code Pro\', monospace';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, textX, rowY);
        };

        // Draw all three legend items in grid
        drawLegendRow(0, 'line', null, 'Power Line ($40)');
        drawLegendRow(1, '24px \'SF Mono\', Monaco, monospace', '#FFD700', 'Power Source');
        drawLegendRow(2, '16px \'SF Mono\', Monaco, monospace', '#FFD700', 'Powered Parcel');

        this.ctx.restore();
    }

    /**
     * Render a single tile
     */
    renderTile(col, row) {
        // Get parcel data from grid
        const parcel = this.game.grid[row][col];
        if (!parcel) return;

        // Convert to isometric coordinates
        const iso = this.toIsometric(col, row);

        this.ctx.save();

        // Apply player selection dimming/highlighting on ownership layer
        const currentLayer = this.game.currentLayer || 'normal';
        if (currentLayer === 'ownership' && this.game.selectedPlayerId) {
            const isSelected = parcel.owner === this.game.selectedPlayerId;
            if (!isSelected && parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed') {
                // Dim non-selected player parcels
                this.ctx.globalAlpha = 0.3;
            }
        }

        // Get tile color based on ownership and state
        const tileColor = this.getTileColor(parcel, row, col);

        // In energy layer mode, shrink parcels to emphasize gridlines
        const tileWidthScale = currentLayer === 'energy' ? 0.7 : 1.0;
        const tileHeightScale = currentLayer === 'energy' ? 0.7 : 1.0;
        const scaledWidth = this.tileWidth * tileWidthScale;
        const scaledHeight = this.tileHeight * tileHeightScale;

        // Draw tile using diamond method
        this.ctx.fillStyle = tileColor;
        this.drawDiamond(iso.x, iso.y, scaledWidth, scaledHeight);
        this.ctx.fill();

        // Draw glow for selected player parcels
        if (currentLayer === 'ownership' && this.game.selectedPlayerId) {
            const isSelected = parcel.owner === this.game.selectedPlayerId;
            if (isSelected) {
                // Draw subtle glow around selected parcels
                const playerColor = this.getPlayerColor(parcel.owner);
                this.ctx.strokeStyle = playerColor;
                this.ctx.lineWidth = 3;
                this.ctx.shadowColor = playerColor;
                this.ctx.shadowBlur = 10;
                this.drawDiamond(iso.x, iso.y, this.tileWidth, this.tileHeight);
                this.ctx.stroke();
                this.ctx.shadowBlur = 0; // Reset shadow
            }
        }

        // Reset alpha
        this.ctx.globalAlpha = 1.0;

        // Draw parcel borders (enlarged in energy mode)
        const borderWidth = currentLayer === 'energy' ? this.tileWidth : this.tileWidth;
        const borderHeight = currentLayer === 'energy' ? this.tileHeight : this.tileHeight;
        this.drawParcelBorders(row, col, borderWidth, borderHeight);

        // Add hover effects using ParcelHoverV2
        if (this.game.parcelHover) {
            this.game.parcelHover.renderEffects(row, col, this.ctx, iso.x, iso.y,
                this.tileWidth, this.tileHeight);
        }

        // Add layer-specific overlays (text, etc.)
        this.renderLayerOverlay(parcel, row, col, iso);

        this.ctx.restore();
    }

    /**
     * Render layer-specific overlays (text, icons, etc.)
     */
    renderLayerOverlay(parcel, row, col, iso) {
        const currentLayer = this.game.currentLayer || 'normal';

        if (currentLayer === 'ownership') {
            this.renderOwnershipOverlay(parcel, row, col, iso);
        } else if (currentLayer === 'energy') {
            this.renderEnergyLayerOverlay(parcel, row, col, iso);
        } else if (currentLayer === 'normal') {
            this.renderNormalLayerOverlay(parcel, row, col, iso);
        }
    }

    /**
     * Render ownership layer overlay
     * Shows color-coded revenue text on owned buildings
     */
    renderOwnershipOverlay(parcel, row, col, iso) {
        // Only show revenue for owned parcels with buildings
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            return;
        }

        if (!parcel.building) return; // Only show for buildings

        // Get cashflow data from server state
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);
        const cashflow = serverState?.netCashflow || serverState?.cashflow || 0;

        // Format text with + sign for positive values
        const text = cashflow > 0 ? `+$${Math.round(cashflow)}` : cashflow < 0 ? `-$${Math.abs(Math.round(cashflow))}` : '$0';

        // Color code: Green (positive), Red (negative), White (zero)
        const textColor = cashflow > 0 ? '#00FF00' : cashflow < 0 ? '#FF4444' : '#FFFFFF';

        // Draw text in center of parcel
        this.ctx.save();
        this.ctx.font = `bold ${Math.floor(this.tileHeight * 0.5)}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Strong black outline for maximum legibility
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(text, iso.x, iso.y);

        // Fill with color-coded text
        this.ctx.fillStyle = textColor;
        this.ctx.fillText(text, iso.x, iso.y);

        this.ctx.restore();
    }

    /**
     * Render energy layer overlay
     * Shows energy source indicators (generators) and powered parcels
     */
    renderEnergyLayerOverlay(parcel, row, col, iso) {
        const hasPower = this.isParcelPowered(row, col);

        // Check if this is a generator by looking at economic client buildings Map (more reliable)
        const locationKey = `${row},${col}`;
        const building = this.game.economicClient?.buildings?.get(locationKey);
        // Building uses 'buildingId' or 'id' field
        const buildingId = building?.buildingId || building?.id || building?.type;
        const buildingDef = buildingId ? this.game.buildingDefinitions?.[buildingId] : null;
        const energyProvided = buildingDef?.resources?.energyProvided || 0;
        const isUnderConstruction = building?.isUnderConstruction || building?.underConstruction;
        const isGenerator = energyProvided > 0 && !isUnderConstruction;

        // Show bolts on all powered parcels
        if (hasPower) {
            this.ctx.save();

            if (isGenerator) {
                // Generators get large gold bolts (20% larger)
                this.ctx.font = `${Math.floor(this.tileHeight * 1.01)}px Arial`;
                this.ctx.fillStyle = '#FFD700'; // Gold for generators
            } else {
                // Powered parcels get smaller bolts (20% larger than before)
                this.ctx.font = `${Math.floor(this.tileHeight * 0.25)}px Arial`;
                this.ctx.fillStyle = '#FFD700'; // Gold color same as generators
            }

            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Black stroke for visibility
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.strokeText('⚡', iso.x, iso.y);

            this.ctx.fillText('⚡', iso.x, iso.y);

            this.ctx.restore();
        }
    }

    /**
     * Render normal layer overlay
     * Shows power symbols on all powered parcels
     */
    renderNormalLayerOverlay(parcel, row, col, iso) {
        if (!parcel) return;

        // Check if this parcel has power (connected to grid via generators)
        const hasPower = this.isParcelPowered(row, col);

        if (hasPower) {
            this.ctx.save();
            this.ctx.font = `${Math.floor(this.tileHeight * 0.14)}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Small power symbol on all powered parcels
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeText('⚡', iso.x, iso.y);

            this.ctx.fillStyle = '#FFD700'; // Gold color
            this.ctx.fillText('⚡', iso.x, iso.y);

            this.ctx.restore();
        }
    }

    /**
     * Check if a parcel has power (connected to a generator via power lines)
     * Uses BFS to trace connections from generators through power line network
     */
    isParcelPowered(row, col) {
        const energyGrid = this.game.economicClient?.energyGrid;
        if (!energyGrid || !energyGrid.lines || energyGrid.lines.size === 0) {
            return false;
        }

        // Cache the powered parcels calculation (expensive BFS)
        if (!this._poweredParcelsCache || this._poweredParcelsCacheTime !== energyGrid.lines.size) {
            this._poweredParcelsCache = this.calculatePoweredParcels();
            this._poweredParcelsCacheTime = energyGrid.lines.size;
        }

        const key = `${row},${col}`;
        return this._poweredParcelsCache.has(key);
    }

    /**
     * Calculate all parcels that have power (connected to generators)
     * Returns a Set of "row,col" strings
     */
    calculatePoweredParcels() {
        const poweredParcels = new Set();
        const energyGrid = this.game.economicClient?.energyGrid;

        if (!energyGrid || !energyGrid.lines) {
            return poweredParcels;
        }

        // Find all generators (buildings that produce energy)
        // Use the buildings Map which is more reliably populated
        const generators = [];
        const buildings = this.game.economicClient?.buildings;

        if (!buildings || buildings.size === 0) {
            return poweredParcels;
        }

        // Iterate through all buildings from the server
        for (const [locationKey, building] of buildings) {
            const [row, col] = locationKey.split(',').map(Number);
            // Building uses 'buildingId' or 'id' field
            const buildingId = building.buildingId || building.id || building.type;
            const buildingDef = this.game.buildingDefinitions?.[buildingId];
            const energyProvided = buildingDef?.resources?.energyProvided || 0;

            const isUnderConstruction = building.isUnderConstruction || building.underConstruction;

            // Only count buildings that have completed construction
            if (energyProvided > 0 && !isUnderConstruction) {
                generators.push({ row, col });
            }
        }

        // NEW LOGIC: Power flows along the power lines themselves
        // Any parcel adjacent to a powered line segment is powered
        // If ANY of the four gridlines forming a parcel have a powerline connected to a source, the parcel gets power

        // Step 1: Mark all generator parcels as powered (they always have power)
        for (const generator of generators) {
            poweredParcels.add(`${generator.row},${generator.col}`);
        }

        // Step 2: Find all power line segments connected to generators via edge-based BFS
        const poweredEdges = new Set();

        for (const generator of generators) {
            // Start by finding all edges touching this generator parcel
            const edgeQueue = [];
            const visitedEdges = new Set();

            // Add all 4 edges around the generator to the queue
            const generatorEdges = [
                `h_${generator.row}_${generator.col}`,
                `h_${generator.row}_${generator.col - 1}`,
                `v_${generator.row}_${generator.col}`,
                `v_${generator.row - 1}_${generator.col}`
            ];

            for (const edgeId of generatorEdges) {
                if (energyGrid.lines.has(edgeId) && !visitedEdges.has(edgeId)) {
                    edgeQueue.push(edgeId);
                    visitedEdges.add(edgeId);
                    poweredEdges.add(edgeId);
                }
            }

            // BFS through connected edges
            while (edgeQueue.length > 0) {
                const currentEdge = edgeQueue.shift();

                // Find the two parcels this edge connects
                let row1, col1, row2, col2;
                if (currentEdge.startsWith('h_')) {
                    const parts = currentEdge.substring(2).split('_');
                    row1 = parseInt(parts[0]);
                    col1 = parseInt(parts[1]);
                    row2 = row1;
                    col2 = col1 + 1;
                } else { // v_
                    const parts = currentEdge.substring(2).split('_');
                    row1 = parseInt(parts[0]);
                    col1 = parseInt(parts[1]);
                    row2 = row1 + 1;
                    col2 = col1;
                }

                // Find all edges touching these two parcels
                const adjacentEdges = [
                    // Parcel 1's edges
                    `h_${row1}_${col1}`, `h_${row1}_${col1 - 1}`,
                    `v_${row1}_${col1}`, `v_${row1 - 1}_${col1}`,
                    // Parcel 2's edges
                    `h_${row2}_${col2}`, `h_${row2}_${col2 - 1}`,
                    `v_${row2}_${col2}`, `v_${row2 - 1}_${col2}`
                ];

                // IMPORTANT: Also check for edges that form visual continuity in isometric view
                // For a visual diagonal line, adjacent edges of the same type should be connected
                if (currentEdge.startsWith('v_')) {
                    // For vertical edge v_row_col, also check v_row_(col±1) as they form a visual line
                    adjacentEdges.push(`v_${row1}_${col1 - 1}`, `v_${row1}_${col1 + 1}`);
                } else {
                    // For horizontal edge h_row_col, also check h_(row±1)_col as they form a visual line
                    adjacentEdges.push(`h_${row1 - 1}_${col1}`, `h_${row1 + 1}_${col1}`);
                }

                for (const adjacentEdge of adjacentEdges) {
                    if (energyGrid.lines.has(adjacentEdge) && !visitedEdges.has(adjacentEdge)) {
                        edgeQueue.push(adjacentEdge);
                        visitedEdges.add(adjacentEdge);
                        poweredEdges.add(adjacentEdge);
                    }
                }
            }
        }

        // Step 3: Add all parcels adjacent to powered edges
        // IMPORTANT: In isometric view, a visual line between two parcels appears to pass through
        // other parcels. We need to power ALL parcels that the visual line intersects!
        //
        // For each edge, we power:
        // 1. The two endpoint parcels (grid-connected)
        // 2. The two "cross" parcels that the visual line passes through in isometric view
        for (const edgeId of poweredEdges) {
            if (edgeId.startsWith('h_')) {
                // Horizontal edge: connects [row,col] and [row,col+1]
                // In isometric view, this visual line also passes through [row-1,col] and [row+1,col+1]
                const parts = edgeId.substring(2).split('_');
                const row = parseInt(parts[0]);
                const col = parseInt(parts[1]);

                // Endpoint parcels (grid-connected)
                poweredParcels.add(`${row},${col}`);
                poweredParcels.add(`${row},${col + 1}`);

                // Cross parcels (visually intersected in isometric view)
                if (row > 0) poweredParcels.add(`${row - 1},${col + 1}`);
                if (row < this.game.gridSize - 1) poweredParcels.add(`${row + 1},${col}`);

            } else { // v_
                // Vertical edge: connects [row,col] and [row+1,col]
                // In isometric view, this visual line also passes through [row,col-1] and [row+1,col+1]
                const parts = edgeId.substring(2).split('_');
                const row = parseInt(parts[0]);
                const col = parseInt(parts[1]);

                // Endpoint parcels (grid-connected)
                poweredParcels.add(`${row},${col}`);
                poweredParcels.add(`${row + 1},${col}`);

                // Cross parcels (visually intersected in isometric view)
                if (col > 0) poweredParcels.add(`${row + 1},${col - 1}`);
                if (col < this.game.gridSize - 1) poweredParcels.add(`${row},${col + 1}`);
            }
        }

        return poweredParcels;
    }

    /**
     * Convert grid coordinates to isometric screen coordinates
     */
    toIsometric(col, row) {
        return window.CoordinateUtils.toIsometricWithGameOffsets(
            this.game, col, row, this.tileWidth, this.tileHeight
        );
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
     * Get tile color based on parcel state (delegates to map layer system)
     */
    getTileColor(parcel, row, col) {
        // Calculate normal color as fallback
        const normalColor = this.getNormalColor(parcel, row, col);

        // Delegate to map layer system for layer-specific rendering
        if (this.game.mapLayers) {
            return this.game.mapLayers.getTileColor(parcel, row, col, normalColor);
        }

        // Fallback if map layers not initialized
        return normalColor;
    }

    /**
     * Normal layer: standard ownership-based coloring
     */
    getNormalColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a'; // Unowned - charcoal gray

        // Under construction
        if (parcel._isUnderConstruction) {
            return '#8B4513'; // Brown for construction
        }

        // If there's a building on this parcel, show neutral color
        // Buildings should visually replace the parcel, not stack on top of colored parcels
        if (parcel.building) {
            return '#333333'; // Neutral dark gray for built parcels
        }

        // Based on owner - only show player colors for EMPTY owned parcels
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
        // First, try to get color from synchronized multiplayer game state
        if (this.game?.economicClient?.gameState?.players) {
            let player = null;

            // Handle both Map and Object structures for compatibility
            if (this.game.economicClient.gameState.players instanceof Map) {
                player = this.game.economicClient.gameState.players.get(playerId);
            } else {
                player = this.game.economicClient.gameState.players[playerId];
            }

            if (player && player.color) {
                if (window.DEBUG_MODE) console.log(`🎨 Found synced color for ${playerId} (${player.name}): ${player.color}`);
                return player.color;
            }
        }

        // Second, check if this is the current player (use local settings as fallback)
        if (playerId === 'player' ||
            playerId === 1 ||
            playerId === this.game.currentPlayerId) {
            const localColor = this.game.playerSettings?.color || '#10AC84';
            return localColor;
        }

        // Check Beer Hall lobby data as a fallback for colors
        if (window.beerHallLobby && window.beerHallLobby.players) {
            const roomPlayer = window.beerHallLobby.players.find(p => p.id === playerId);
            if (roomPlayer && roomPlayer.color) {
                return roomPlayer.color;
            }
        }

        // Fallback to default colors for unknown players
        const colors = [
            '#10AC84', '#3498DB', '#E74C3C', '#F39C12',
            '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
            '#2ECC71', '#E91E63', '#FF5722', '#795548'
        ];

        // Handle numeric player IDs for competitors
        if (typeof playerId === 'number') {
            const fallbackColor = colors[(playerId - 1) % colors.length];
            if (window.DEBUG_MODE) console.warn(`🎨 No synced color for player ${playerId}, using fallback: ${fallbackColor}`);
            return fallbackColor;
        }

        // For unknown player IDs, return default but log a warning
        if (window.DEBUG_MODE) console.warn('🎨 Unknown player ID in getPlayerColor:', playerId, 'using default color');
        return '#10AC84'; // Default green
    }

    /**
     * Get player name (for consistent name display)
     */
    getPlayerName(playerId) {
        // First, try to get name from synchronized multiplayer game state
        if (this.game?.economicClient?.gameState?.players) {
            let player = null;

            // Handle both Map and Object structures for compatibility
            if (this.game.economicClient.gameState.players instanceof Map) {
                player = this.game.economicClient.gameState.players.get(playerId);
            } else {
                player = this.game.economicClient.gameState.players[playerId];
            }

            // Debug logging to trace the issue
            console.log(`🔍 getPlayerName(${playerId}):`, {
                hasGameState: !!this.game?.economicClient?.gameState,
                hasPlayers: !!this.game?.economicClient?.gameState?.players,
                isMap: this.game?.economicClient?.gameState?.players instanceof Map,
                availablePlayerIds: Object.keys(this.game?.economicClient?.gameState?.players || {}),
                foundPlayer: !!player,
                playerName: player?.name
            });

            if (player && player.name) {
                return player.name;
            }
        }

        // Second, check if this is the current player (use local settings as fallback)
        if (playerId === 'player' ||
            playerId === 1 ||
            playerId === this.game.currentPlayerId) {
            return this.game.playerSettings?.name || 'You';
        }

        // Check Beer Hall lobby data as a fallback
        if (window.beerHallLobby && window.beerHallLobby.players) {
            const roomPlayer = window.beerHallLobby.players.find(p => p.id === playerId);
            if (roomPlayer && roomPlayer.name) {
                return roomPlayer.name;
            }
        }

        // Fallback to friendlier default names
        if (typeof playerId === 'string' && playerId.startsWith('player_')) {
            return `Player ${playerId.slice(-4)}`;
        }

        return `Player ${playerId}`;
    }

    /**
     * Render buildings on tiles
     */
    renderBuildings() {
        if (!this.game.grid) return;

        window.GridUtils.forEachPosition(this.game.gridSize, (row, col) => {
            this.renderBuilding(row, col);
        });
    }

    /**
     * Render building on a tile
     */
    renderBuilding(row, col) {
        const parcel = this.game.grid[row]?.[col];
        if (!parcel?.building) return;

        // Hide buildings on non-normal layers
        const currentLayer = this.game.currentLayer || 'normal';
        if (currentLayer !== 'normal') return;

        const iso = this.toIsometric(col, row);

        // Calculate true diamond bottom point for proper building placement
        const diamondBottomY = iso.y + (this.tileHeight / 2);

        // Apply dynamic offsets from position adjuster (if active)
        const dynamicXOffset = this.buildingXOffset || 0;
        const dynamicYOffset = this.buildingYOffset || 0;

        const buildingY = diamondBottomY + dynamicYOffset;
        const buildingX = iso.x + dynamicXOffset;

        // Simple building representation
        this.ctx.save();

        // Handle both cases: parcel.building as string (legacy) or object (synced from server)
        const buildingId = typeof parcel.building === 'string'
            ? parcel.building
            : (parcel.building.id || parcel.building.type);

        const building = this.game.buildingManager?.getBuildingById(buildingId);

        if (!building) {
            if (window.DEBUG_MODE) console.log(`⚠️ No building data found for ${buildingId} at [${row},${col}]`);
            return;
        }

        // For synced buildings, graphics may come from server data in parcel
        const parcelBuilding = typeof parcel.building === 'object' ? parcel.building : null;
        let imagePath = parcelBuilding?.graphicsFile || building.graphicsFile || building.images?.built;

        if (imagePath) {
            // Try to load and draw building image
            // Pass the diamond center coordinates - drawImageAtPosition will calculate the bottom
            this.drawBuildingImage(imagePath, iso.x, iso.y, row, col);
        } else {
            // Fallback: draw simple rectangle if no graphics found
            if (window.DEBUG_MODE) console.log(`⚠️ No graphics found for building: ${building.id || building.type}`);

            // Calculate visual effects for fallback as well
            const constructionDimming = this.calculateConstructionDimming(row, col);
            const performanceSaturation = this.calculatePerformanceSaturation(row, col);
            const conditionSepia = this.calculateConditionSepia(row, col);

            // Build combined filter string for fallback rectangle
            let filterParts = [];

            // Apply construction dimming
            if (constructionDimming > 0) {
                const brightness = Math.round((1.0 - constructionDimming) * 100);
                filterParts.push(`brightness(${brightness}%)`);
            }

            // Apply sepia filter for building condition
            if (conditionSepia > 0) {
                filterParts.push(`sepia(${Math.round(conditionSepia * 100)}%)`);
            }

            // Apply performance-based saturation
            if (performanceSaturation < 1.0) {
                filterParts.push(`saturate(${Math.round(performanceSaturation * 100)}%)`);
            }

            // Apply combined filter if we have any effects
            if (filterParts.length > 0) {
                this.ctx.filter = filterParts.join(' ');
            }

            // Standard shadow color for all buildings
            this.ctx.fillStyle = '#666';

            const buildingWidth = this.tileWidth * 0.8;
            const buildingHeight = this.tileHeight * 1.5;

            // Calculate diamond bottom for consistent positioning
            const diamondBottomY = iso.y + (this.tileHeight / 2);
            const buildingTopY = diamondBottomY - buildingHeight;

            this.ctx.fillRect(
                iso.x - buildingWidth / 2,
                buildingTopY + (this.buildingYOffset || 0),
                buildingWidth,
                buildingHeight
            );

            // Building border
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(
                iso.x - buildingWidth / 2,
                buildingTopY + (this.buildingYOffset || 0),
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
        if (window.DEBUG_MODE) console.warn(`⚠️ Building image not preloaded: ${imagePath}`);
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

        // Calculate visual effects for placeholder as well
        const constructionDimming = this.calculateConstructionDimming(row, col);
        const performanceSaturation = this.calculatePerformanceSaturation(row, col);
        const conditionSepia = this.calculateConditionSepia(row, col);

        this.ctx.save();

        // Build combined filter string for placeholder
        let filterParts = [];

        // Apply construction dimming
        if (constructionDimming > 0) {
            const brightness = Math.round((1.0 - constructionDimming) * 100);
            filterParts.push(`brightness(${brightness}%)`);
        }

        // Apply sepia filter for building condition
        if (conditionSepia > 0) {
            filterParts.push(`sepia(${Math.round(conditionSepia * 100)}%)`);
        }

        // Apply performance-based saturation
        if (performanceSaturation < 1.0) {
            filterParts.push(`saturate(${Math.round(performanceSaturation * 100)}%)`);
        }

        // Apply combined filter if we have any effects
        if (filterParts.length > 0) {
            this.ctx.filter = filterParts.join(' ');
        }

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

        this.ctx.restore();
    }

    /**
     * Calculate deterministic construction progress (0.0 to 1.0)
     */
    calculateConstructionProgress(row, col) {
        const parcel = this.game.grid[row]?.[col];
        if (!parcel?.building) return 1.0;

        // Get building state from server data (via economic client)
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);

        // Check client-side construction tracking first (for UX)
        const locationKey = `${row},${col}`;
        if (!this.clientConstructionTimes) {
            this.clientConstructionTimes = new Map();
        }

        // If we have a client-side construction timer, use it
        if (this.clientConstructionTimes.has(locationKey)) {
            const startTime = this.clientConstructionTimes.get(locationKey);
            const buildingId = parcel.building;
            const buildingDef = this.game.buildingManager?.getBuildingById(buildingId);
            const constructionDays = buildingDef?.economics?.constructionDays || 1;
            const gameTimeMs = this.game.GAME_DAY_MS || 10000;

            const elapsed = Date.now() - startTime;
            const required = constructionDays * gameTimeMs;
            const progress = Math.min(1.0, elapsed / required);

            // Remove from tracking once complete
            if (progress >= 1.0) {
                this.clientConstructionTimes.delete(locationKey);
            }

            return progress;
        }

        // Start client-side tracking if server says it's under construction
        if (serverState && serverState.isUnderConstruction) {
            this.clientConstructionTimes.set(locationKey, Date.now());
            return 0.0; // Just started
        }

        // If server explicitly says it's not under construction, it's complete
        if (serverState && !serverState.isUnderConstruction) {
            return 1.0; // Complete
        }

        // If server provides construction progress, use it
        if (serverState && serverState.constructionProgress !== undefined) {
            return serverState.constructionProgress;
        }

        // Check local parcel data for construction state
        if (parcel.underConstruction === false) {
            return 1.0; // Complete according to local data
        }

        // Get building definition for construction days
        const buildingId = parcel.building;
        const buildingDef = this.game.buildingManager?.getBuildingById(buildingId);
        if (!buildingDef) return 1.0;

        const constructionDays = buildingDef.economics?.constructionDays || 1;
        const gameTimeMs = this.game.GAME_DAY_MS || 10000; // ~9.86 seconds per day

        // Fallback: use local construction timing
        let constructionStartTime = parcel.constructionStartTime;

        // If no start time in parcel, check if we have server state with start time
        if (!constructionStartTime && serverState?.constructionStartTime) {
            constructionStartTime = serverState.constructionStartTime;
        }

        if (constructionStartTime) {
            const elapsed = Date.now() - constructionStartTime;
            const required = constructionDays * gameTimeMs;
            return Math.min(1.0, elapsed / required);
        }

        // If building exists but no construction data, assume it's completed
        return 1.0;
    }

    /**
     * Start client-side construction tracking for a building (called when construction is approved)
     */
    startConstructionTracking(row, col) {
        const locationKey = `${row},${col}`;
        if (!this.clientConstructionTimes) {
            this.clientConstructionTimes = new Map();
        }
        this.clientConstructionTimes.set(locationKey, Date.now());
        console.log(`🏗️ Started client-side construction tracking for [${row},${col}]`);
    }

    /**
     * Calculate construction dimming (static 70% dimming for buildings under construction)
     */
    calculateConstructionDimming(row, col) {
        const progress = this.calculateConstructionProgress(row, col);
        if (progress >= 1.0) return 0.0; // No dimming when complete

        // Buildings under construction are dimmed by 70% (30% brightness) - static, no pulsing
        return 0.7;
    }

    /**
     * Calculate performance-based saturation (10% to 100% based on server data)
     * Low performance = more B&W (desaturated), High performance = full color
     * Buildings under construction are also desaturated
     */
    calculatePerformanceSaturation(row, col) {
        // Check if building is under construction
        const progress = this.calculateConstructionProgress(row, col);
        if (progress < 1.0) {
            // Buildings under construction are heavily desaturated (20% saturation)
            return 0.2;
        }

        // Get building state from server for completed buildings
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);
        if (!serverState) return 1.0; // Default full saturation

        const performance = serverState.performance || 0.0;
        // Map 0.0-1.0 performance to 10%-100% saturation
        // Low performance (0.0) = 10% saturation (mostly B&W)
        // High performance (1.0) = 100% saturation (full color)
        return 0.1 + (performance * 0.9);
    }

    /**
     * Calculate condition-based sepia filter (0% to 70% based on condition)
     */
    calculateConditionSepia(row, col) {
        // Get building state from server
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);
        if (!serverState) return 0.0; // No sepia filter

        const condition = serverState.condition || 1.0;
        // Map 1.0-0.0 condition to 0%-70% sepia (lower condition = more sepia)
        const sepiaStrength = (1.0 - condition) * 0.7;
        return Math.max(0.0, Math.min(0.7, sepiaStrength));
    }

    /**
     * Draw the loaded image at the building position
     */
    drawImageAtPosition(img, x, y, row, col) {
        // Check for hover effects from ParcelHoverV2 (bob animation removed)
        const bobOffset = this.game.parcelHover?.getBuildingBobOffset(row, col) || 0;

        // PRECISE ALIGNMENT: Building width slightly smaller than diamond parcel width
        // Left/right edges align with diamond left/right points, reduced by 4px
        const buildingWidth = this.tileWidth - 4; // 4px smaller than parcel width

        // Height maintains aspect ratio, unbounded vertically for tall cities
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const buildingHeight = buildingWidth / aspectRatio;

        // x,y from toIsometric is the center of the diamond
        // Diamond bottom is center + half tile height
        const diamondCenterY = y;
        const diamondBottomY = diamondCenterY + (this.tileHeight / 2);

        // Position building so its bottom edge sits on the diamond bottom
        // drawImage needs top-left corner, so subtract full building height
        const buildingX = x;
        const buildingTopY = diamondBottomY - buildingHeight;

        // Get completion animation effects (if animating)
        const animEffects = this.getBuildingAnimationEffects(row, col);

        // Apply dynamic offsets from position adjuster (if active), bob animation, and completion animation
        const finalX = buildingX - (buildingWidth / 2) + (this.buildingXOffset || 0);  // Center horizontally
        const finalY = buildingTopY + (this.buildingYOffset || 0) + bobOffset + animEffects.yOffset; // Add bob + animation offset

        // Calculate visual effects
        const constructionDimming = this.calculateConstructionDimming(row, col);
        const performanceSaturation = this.calculatePerformanceSaturation(row, col);
        const conditionSepia = this.calculateConditionSepia(row, col);

        // DEBUG: Log visual effects
        // if ((window.DEBUG_MODE || true) && (constructionDimming > 0 || performanceSaturation < 1.0 || conditionSepia > 0)) {
        //     console.log(`🎨 Visual effects for [${row},${col}]:`, {
        //         constructionDimming,
        //         performanceSaturation,
        //         conditionSepia
        //     });
        // }

        // Save canvas state for effects
        this.ctx.save();

        // Build combined filter string to apply all effects at once
        let filterParts = [];

        // Check if we're currently animating this building
        const locationKey = `${row},${col}`;
        const isAnimating = this.animatingBuildings.has(locationKey);

        // During animation: use animation effects exclusively (no performance coloring)
        // After animation: use performance coloring
        if (isAnimating) {
            // Animation phase: dim → bright → bright (no performance coloring)
            const brightness = Math.round(animEffects.brightness * 100);
            filterParts.push(`brightness(${brightness}%)`);

            const saturation = Math.round(animEffects.saturation * 100);
            filterParts.push(`saturate(${saturation}%)`);
        } else {
            // Normal rendering: apply construction dimming and performance coloring
            if (constructionDimming > 0) {
                const brightness = Math.round((1.0 - constructionDimming) * 100);
                filterParts.push(`brightness(${brightness}%)`);
            }

            if (performanceSaturation < 1.0) {
                filterParts.push(`saturate(${Math.round(performanceSaturation * 100)}%)`);
            }
        }

        // Apply sepia filter for building condition (always apply, not affected by animation)
        if (conditionSepia > 0) {
            filterParts.push(`sepia(${Math.round(conditionSepia * 100)}%)`);
        }

        // Apply combined filter if we have any effects
        if (filterParts.length > 0) {
            this.ctx.filter = filterParts.join(' ');
        }

        // Draw building with effects applied
        this.ctx.drawImage(
            img,
            finalX,                      // Left edge (already centered in finalX calculation)
            finalY,                      // Top edge (building bottom sits on diamond bottom)
            buildingWidth,               // Exactly match parcel width
            buildingHeight               // Maintain aspect ratio
        );

        // Restore canvas state (removes all effects)
        this.ctx.restore();
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

        // Calculate optimal tile dimensions for the grid - maximize canvas usage
        // Leave small margins to prevent edge clipping
        const marginX = 20; // Small horizontal margin
        const marginY = 20; // Small vertical margin
        const availableWidth = this.canvas.width - (2 * marginX);
        const availableHeight = this.canvas.height - (2 * marginY);

        // CORRECT ISOMETRIC GRID CALCULATION
        // For a gridSize x gridSize grid (indices 0 to gridSize-1):
        // - Grid spans (gridSize-1) * tileWidth horizontally
        // - Grid spans (gridSize-1) * tileHeight vertically
        const gridSpan = this.game.gridSize - 1;

        // Calculate maximum tile size that fits in available space
        // For isometric view: tileHeight = tileWidth / 2 (2:1 ratio for 30° standard isometric)
        const maxTileWidthFromWidth = availableWidth / gridSpan;
        const maxTileWidthFromHeight = (availableHeight / gridSpan) * 2; // height constraint converted to width

        // Choose the limiting dimension to ensure grid fits in both directions
        const optimalTileWidth = Math.min(maxTileWidthFromWidth, maxTileWidthFromHeight);

        // Set tile dimensions with proper 2:1 isometric ratio, reduced by 20% for better canvas utilization
        this.tileWidth = Math.max(optimalTileWidth * 0.8, 20); // Minimum tile size for readability, 20% smaller
        this.tileHeight = this.tileWidth / 2;  // MUST be exactly /2 for standard 30° isometric

        // CORRECT CENTERING CALCULATION
        // Isometric grid bounds (before offset):
        // minX = -gridSpan * tileWidth/2, maxX = gridSpan * tileWidth/2
        // minY = 0, maxY = gridSpan * tileHeight

        // Center the grid properly, shifted left by 2%:
        this.game.offsetX = (this.canvas.width / 2) - (this.canvas.width * 0.02);  // Centers the diamond horizontally, shifted left by 2%
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
        const currentLayer = this.game.currentLayer || 'normal';

        // Different border styles based on state
        if (currentLayer === 'energy') {
            // Energy mode: prominent gray gridlines (6px wide)
            this.ctx.strokeStyle = '#666666';
            this.ctx.lineWidth = 6;
        } else if (parcel && parcel.owner) {
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
        return window.CoordinateUtils.fromIsometricWithGameOffsets(
            this.game, screenX, screenY, this.tileWidth, this.tileHeight
        );
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

    /**
     * Mark a single parcel as dirty (needs redraw)
     */
    markParcelDirty(row, col) {
        const key = `${row},${col}`;
        this.dirtyParcels.add(key);
    }

    /**
     * Mark a parcel and its neighbors as dirty (for isometric overlap)
     */
    markParcelAndNeighborsDirty(row, col) {
        this.markParcelDirty(row, col);

        // Mark neighbors that might overlap due to isometric rendering
        // In isometric view, a parcel can overlap with parcels above/left/right/below
        const neighbors = [
            [row - 1, col],     // Above
            [row + 1, col],     // Below
            [row, col - 1],     // Left
            [row, col + 1],     // Right
            [row - 1, col - 1], // Top-left diagonal
            [row - 1, col + 1], // Top-right diagonal
            [row + 1, col - 1], // Bottom-left diagonal
            [row + 1, col + 1]  // Bottom-right diagonal
        ];

        for (const [nRow, nCol] of neighbors) {
            if (nRow >= 0 && nRow < this.game.gridSize && nCol >= 0 && nCol < this.game.gridSize) {
                this.markParcelDirty(nRow, nCol);
            }
        }
    }

    /**
     * Clear all dirty parcels and mark entire canvas for redraw
     */
    markAllDirty() {
        this.forceFullRedraw = true;
        this.dirtyParcels.clear();
    }

    /**
     * Clear dirty regions after rendering
     */
    clearDirtyRegions() {
        this.dirtyParcels.clear();
        this.forceFullRedraw = false;
    }

    /**
     * Queue a building for completion animation
     * Buildings animate one at a time in quick succession
     */
    queueBuildingCompleteAnimation(row, col) {
        const locationKey = `${row},${col}`;

        // Prevent duplicate animations for the same building
        if (this.animatingBuildings.has(locationKey)) {
            return;
        }

        // Check if already in queue
        const alreadyQueued = this.animationQueue.some(item => item.row === row && item.col === col);
        if (alreadyQueued) {
            return;
        }

        // Add to queue
        this.animationQueue.push({ row, col });

        // Start processing queue if not already playing
        if (!this.isPlayingAnimation) {
            this.processAnimationQueue();
        }
    }

    /**
     * Process animation queue (one at a time)
     */
    processAnimationQueue() {
        // If nothing in queue, we're done
        if (this.animationQueue.length === 0) {
            this.isPlayingAnimation = false;
            return;
        }

        // Mark as playing
        this.isPlayingAnimation = true;

        // Get next animation from queue
        const { row, col } = this.animationQueue.shift();

        // Play this animation
        this.playBuildingCompleteAnimation(row, col);

        // Queue next animation (with small delay between animations)
        setTimeout(() => {
            this.processAnimationQueue();
        }, this.COMPLETION_ANIMATION_DURATION + 200); // 200ms gap between animations
    }

    /**
     * Play building completion animation (event-driven, not loop-based)
     * Schedules 16 renders over 1.5 seconds at key animation points
     */
    playBuildingCompleteAnimation(row, col) {
        const startTime = Date.now();
        const duration = this.COMPLETION_ANIMATION_DURATION;

        // Mark this building as animating
        const locationKey = `${row},${col}`;
        this.animatingBuildings.set(locationKey, { startTime, duration });

        // Schedule renders at key animation points (eased timing)
        // 20 keyframes for smoother animation (extra frames added to descent for smoothness)
        const keyframeTimes = [
            0,      // Frame 1: Start state (immediate)
            30,     // Frame 2: Early rise
            60,     // Frame 3: Rising
            100,    // Frame 4: Rising fast
            150,    // Frame 5: Approaching peak
            210,    // Frame 6: At peak
            280,    // Frame 7: Holding peak
            360,    // Frame 8: Still holding
            450,    // Frame 9: Begin descent
            560,    // Frame 10: Descending
            650,    // Frame 11: Mid descent (NEW)
            740,    // Frame 12: Continuing descent (NEW)
            830,    // Frame 13: Settling
            920,    // Frame 14: Almost settled (NEW)
            1010,   // Frame 15: Nearly complete (NEW)
            1150,   // Frame 16: Final approach
            1250,   // Frame 17: Very close (NEW)
            1350,   // Frame 18: Last adjustment (NEW)
            1450,   // Frame 19: Final settling (NEW)
            1500    // Frame 20: Final rest state
        ];

        keyframeTimes.forEach(ms => {
            setTimeout(() => {
                // Only render if animation still active
                if (this.animatingBuildings.has(locationKey)) {
                    // Mark this parcel and neighbors as dirty for animation frame
                    this.markParcelAndNeighborsDirty(row, col);
                    this.scheduleRender();
                }
            }, ms);
        });

        // Clean up after animation completes
        setTimeout(() => {
            this.animatingBuildings.delete(locationKey);
            this.scheduleRender(); // Final render to ensure clean state
        }, duration + 10); // Small buffer to ensure last frame renders
    }

    /**
     * Calculate animation effects for a building (called during render)
     * Returns visual effects to apply during completion animation
     */
    getBuildingAnimationEffects(row, col) {
        const locationKey = `${row},${col}`;
        const animation = this.animatingBuildings.get(locationKey);

        // No animation - return normal state
        if (!animation) {
            return { yOffset: 0, opacity: 1, brightness: 1, saturation: 1 };
        }

        // Calculate animation progress (0.0 to 1.0)
        const elapsed = Date.now() - animation.startTime;
        const progress = Math.min(1.0, elapsed / animation.duration);

        // Animation curve: Quick pop up, gentle settle down
        let yOffset, opacity, brightness, saturation;

        if (progress < 0.2) {
            // 0-20% (0-300ms): QUICK POP UP
            const t = progress / 0.2; // 0 to 1
            const eased = this.easeOutQuad(t); // Smooth acceleration
            yOffset = -20 * eased; // Rise to -20px
            opacity = 0.3 + (0.7 * eased); // 30% to 100%
            brightness = 0.3 + (0.7 * eased); // Dim to bright
            saturation = 0.2 + (0.8 * eased); // Gray to color

        } else if (progress < 0.5) {
            // 20-50% (300-750ms): HOLD AT PEAK
            yOffset = -20; // Stay elevated
            opacity = 1;
            brightness = 1;
            saturation = 1;

        } else {
            // 50-100% (750-1500ms): GENTLE SETTLE DOWN
            const t = (progress - 0.5) / 0.5; // 0 to 1
            const eased = this.easeInOutQuad(t); // Smooth deceleration
            yOffset = -20 * (1 - eased); // Drop from -20px to 0
            opacity = 1;
            brightness = 1;
            saturation = 1;
        }

        return { yOffset, opacity, brightness, saturation };
    }

    /**
     * Easing function: ease out quad (decelerating curve)
     */
    easeOutQuad(t) {
        return t * (2 - t);
    }

    /**
     * Easing function: ease in-out quad (smooth acceleration and deceleration)
     */
    easeInOutQuad(t) {
        return t < 0.5
            ? 2 * t * t
            : -1 + (4 - 2 * t) * t;
    }
}