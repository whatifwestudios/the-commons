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
        this.tileHeight = 50.0;  // Standard 30° isometric (2:1 ratio)

        // Performance
        this.renderScheduled = false;

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
     * Single, clean mouse handling system with proper cleanup
     */
    setupCleanMouseHandling() {
        // Main mouse handler - routes all interactions
        this.eventManager.addEventListener(this.canvas, 'mousemove', (e) => {
            const coords = this.getCleanCoordinates(e);
            this.handleHover(coords);
            this.handlePanning(e, coords);
        });

        this.eventManager.addEventListener(this.canvas, 'mousedown', (e) => {
            const coords = this.getCleanCoordinates(e);
            this.handleMouseDown(e, coords);
        });

        this.eventManager.addEventListener(this.canvas, 'mouseup', (e) => {
            this.handleMouseUp(e);
        });

        this.eventManager.addEventListener(this.canvas, 'mouseleave', () => {
            this.clearHover();
            this.endPanning();
        });

        this.eventManager.addEventListener(this.canvas, 'contextmenu', (e) => {
            e.preventDefault(); // Clean context menu handling
        });
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
     * Clean coordinate conversion - single source of truth
     */
    getCleanCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Convert to world coordinates
        const worldCoords = {
            x: screenX,
            y: screenY
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
            const ownerName = this.getPlayerName(parcel.owner);
            lines.push(`🏠 Owner: ${ownerName}`);
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
     * Handle panning (disabled)
     */
    handlePanning(e, coords) {
        // Panning functionality removed
    }

    /**
     * Handle mouse down events
     */
    handleMouseDown(e, coords) {
        // Panning functionality removed
    }

    /**
     * Handle mouse up events
     */
    handleMouseUp(e) {
        this.endPanning();
    }

    /**
     * End panning state (disabled)
     */
    endPanning() {
        // Panning functionality removed
        this.canvas.style.cursor = 'default';
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

        // Apply transformations with defensive checks
        this.ctx.save();
        // Pan and zoom functionality removed - use default scale/translation
        // this.ctx.translate(0, 0);
        // this.ctx.scale(1, 1);

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
        window.GridUtils.forEachPosition(this.game.gridSize, (row, col) => {
            // Use V1's toIsometric method for consistency
            const iso = this.game.renderingSystem.toIsometric(col, row);
            tiles.push({ col, row, zIndex: iso.zIndex || (row + col) });
        });

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

            const tint = this.getBuildingTint(row, col);
            if (tint === 'yellow') {
                this.ctx.fillStyle = this.hexToRgba(this.playerColor, 0.7);
            } else {
                this.ctx.fillStyle = '#666';
            }

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
     * Calculate construction dimming (60% to 0% as progress goes from 0 to 1)
     */
    calculateConstructionDimming(row, col) {
        const progress = this.calculateConstructionProgress(row, col);
        if (progress >= 1.0) return 0.0; // No dimming when complete

        // Start at 60% dimming (0.6), decrease to 0% as progress reaches 1.0
        // This will make brightness go from 40% to 100% (more visible)
        return 0.6 * (1.0 - progress);
    }

    /**
     * Calculate performance-based saturation (10% to 100% based on server data)
     * Low performance = more B&W (desaturated), High performance = full color
     */
    calculatePerformanceSaturation(row, col) {
        // Get building state from server
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

        // Apply dynamic offsets from position adjuster (if active)
        const finalX = buildingX - (buildingWidth / 2) + (this.buildingXOffset || 0);  // Center horizontally
        const finalY = buildingTopY + (this.buildingYOffset || 0);

        // Calculate visual effects
        const constructionDimming = this.calculateConstructionDimming(row, col);
        const performanceSaturation = this.calculatePerformanceSaturation(row, col);
        const conditionSepia = this.calculateConditionSepia(row, col);

        // DEBUG: Log visual effects
        if ((window.DEBUG_MODE || true) && (constructionDimming > 0 || performanceSaturation < 1.0 || conditionSepia > 0)) {
            console.log(`🎨 Visual effects for [${row},${col}]:`, {
                constructionDimming,
                performanceSaturation,
                conditionSepia
            });
        }

        // Save canvas state for effects
        this.ctx.save();

        // Build combined filter string to apply all effects at once
        let filterParts = [];

        // Apply construction dimming (makes building darker during construction)
        if (constructionDimming > 0) {
            const brightness = Math.round((1.0 - constructionDimming) * 100); // 40% to 100% brightness
            filterParts.push(`brightness(${brightness}%)`);
        }

        // Apply sepia filter for building condition
        if (conditionSepia > 0) {
            filterParts.push(`sepia(${Math.round(conditionSepia * 100)}%)`);
        }

        // Apply performance-based saturation (desaturation for poor performance)
        if (performanceSaturation < 1.0) {
            filterParts.push(`saturate(${Math.round(performanceSaturation * 100)}%)`);
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

        // Apply building tint if this parcel is connected (after main image)
        const tint = this.getBuildingTint(row, col);
        if (tint === 'yellow') {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = this.hexToRgba(this.playerColor, 0.8);
            this.ctx.fillRect(
                finalX,
                finalY,
                buildingWidth,
                buildingHeight
            );
            this.ctx.restore();
        }
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
}