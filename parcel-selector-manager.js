/**
 * ParcelSelectorManager - Unified parcel selection system
 *
 * Handles all parcel selection states with multiplayer coordination:
 * - Hover state (local only, immediate feedback)
 * - Active selection (network synced, player-colored)
 * - No preview state (removed as requested)
 */
class ParcelSelectorManager {
    constructor(game) {
        this.game = game;

        // Selection states
        this.hoveredParcel = null; // { row, col } - local only
        this.activeSelections = new Map(); // playerId -> { row, col } - network synced
        // Removed previewParcels as preview functionality was removed

        // Visual configuration
        this.hoverBorderWidth = 2.5;
        this.selectionBorderWidth = 4;
        // Removed preview functionality as requested

        // Animation system
        this.clickAnimations = new Map(); // Map of parcel keys to animation states
        this.lastAnimationFrame = 0;

        // Colors - hover color will be set to player color dynamically
        this.hoverColor = null; // Will be set to player color dynamically
        // Removed preview colors as preview functionality was removed

        // Player colors (will be fetched from server)
        this.playerColors = new Map();

        // Proximity effects
        this.proximityEffects = new Map(); // "row,col" -> { type: 'adjacent|connected', intensity: 0-1 }

        this.initializePlayerColors();
    }

    /**
     * Initialize player colors from server data
     */
    async initializePlayerColors() {
        try {
            // Fetch current player colors from server
            const response = await fetch('/api/players');
            if (response.ok) {
                const players = await response.json();
                console.log('🎨 Server returned players data:', players);

                // Handle different response formats
                if (Array.isArray(players)) {
                    players.forEach(player => {
                        this.playerColors.set(player.id, player.color || '#10AC84');
                    });
                    console.log('🎨 Loaded player colors from array:', this.playerColors);
                } else {
                    console.warn('🎨 Players data is not an array, using fallback colors');
                    this.setDefaultPlayerColors();
                }
            } else {
                console.warn('🎨 Failed to fetch players, status:', response.status);
                this.setDefaultPlayerColors();
            }
        } catch (error) {
            console.warn('Failed to fetch player colors:', error);
            // Fallback colors
            this.setDefaultPlayerColors();
        }

        // Always ensure we have at least player 1 color set
        if (!this.playerColors.has(1)) {
            this.setDefaultPlayerColors();
        }

        // Ensure 'player' ID has a color mapping for single-player mode
        // Always update 'player' color to match current game.playerSettings
        if (this.game.playerSettings && this.game.playerSettings.color) {
            this.playerColors.set('player', this.game.playerSettings.color);
            console.log(`🎨 Set player color from game.playerSettings: ${this.game.playerSettings.color}`);
        } else if (!this.playerColors.has('player')) {
            // Fallback to player 1's color only if no player color exists
            this.playerColors.set('player', this.playerColors.get(1) || '#10AC84');
            console.log(`🎨 Set player color from fallback: ${this.playerColors.get('player')}`);
        }
        console.log('🎨 Final player colors:', this.playerColors);
    }

    /**
     * Update player color (call this when game.playerSettings changes)
     */
    updatePlayerColor() {
        if (this.game.playerSettings && this.game.playerSettings.color) {
            this.playerColors.set('player', this.game.playerSettings.color);
            console.log(`🎨 Updated player color to: ${this.game.playerSettings.color}`);
        }
    }

    /**
     * Set default player colors as fallback
     */
    setDefaultPlayerColors() {
        const defaultColors = [
            '#10AC84', '#3498DB', '#E74C3C', '#F39C12',
            '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
            '#2ECC71', '#E91E63', '#FF5722', '#795548'
        ];

        for (let i = 1; i <= 12; i++) {
            this.playerColors.set(i, defaultColors[(i - 1) % defaultColors.length]);
        }
    }

    /**
     * Update hover state (local only, no network sync)
     */
    setHoveredParcel(row, col) {
        const newHovered = row !== null && col !== null ? { row, col } : null;

        // Only update if different
        if (!this.isSameParcel(this.hoveredParcel, newHovered)) {
            this.hoveredParcel = newHovered;

            // Check for auto-deselect when cursor moves away from selected parcel
            this.checkAutoDeselect(newHovered);

            // Update proximity effects for hovered parcel
            if (newHovered) {
                const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';
                this.updateProximityEffects(newHovered.row, newHovered.col, currentPlayerId);
            } else {
                this.clearProximityEffects();
            }

            this.game.scheduleRender();
        }
    }

    /**
     * Set active selection for a player (will be network synced)
     */
    setActiveSelection(playerId, row, col) {
        const newSelection = row !== null && col !== null ? { row, col } : null;
        const currentSelection = this.activeSelections.get(playerId);

        // Only update if different
        if (!this.isSameParcel(currentSelection, newSelection)) {
            if (newSelection) {
                // Enforce single selection: clear all other selections for this player
                this.activeSelections.set(playerId, newSelection);
                // Start click animation for this parcel
                this.startClickAnimation(row, col);

                // Clear proximity effects when selecting - only show the clicked parcel
                this.clearProximityEffects();

                // Notify server of selection (for multiplayer coordination)
                this.notifyServerSelection(playerId, row, col);
            } else {
                this.activeSelections.delete(playerId);
                // Notify server of deselection
                this.notifyServerSelection(playerId, null, null);
            }

            this.game.scheduleRender();
        }
    }

    /**
     * Get active selection for a player
     */
    getActiveSelection(playerId) {
        return this.activeSelections.get(playerId) || null;
    }

    /**
     * Check if a parcel is selected by any player
     */
    isParcelSelected(row, col) {
        for (const selection of this.activeSelections.values()) {
            if (selection.row === row && selection.col === col) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the player ID who has selected a parcel (if any)
     */
    getParcelSelector(row, col) {
        for (const [playerId, selection] of this.activeSelections.entries()) {
            if (selection.row === row && selection.col === col) {
                return playerId;
            }
        }
        return null;
    }

    /**
     * Update proximity effects for selected parcel with enhanced functionality
     */
    updateProximityEffects(row, col, playerId = 1) {
        this.clearProximityEffects();

        // Get player color for effects
        const playerColor = this.playerColors.get(playerId) || '#10AC84';
        const adjacentColor = this.hexToRgba(playerColor, 0.2); // 20% for connected parcels
        const connectedColor = this.hexToRgba(playerColor, 0.2); // 20% for road-connected parcels

        // Calculate adjacent parcels (player color effect)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip center

                const adjRow = row + dr;
                const adjCol = col + dc;

                if (adjRow >= 0 && adjRow < this.game.gridSize && adjCol >= 0 && adjCol < this.game.gridSize) {
                    const key = `${adjRow},${adjCol}`;
                    this.proximityEffects.set(key, {
                        type: 'adjacent',
                        intensity: 0.2,
                        color: adjacentColor,
                        buildingTint: this.getVariantFromColor(playerColor)
                    });
                }
            }
        }

        // Calculate road-connected parcels using enhanced transportation system
        if (this.game.transportationSystem) {
            // Get all parcels accessible through road network (simplified for visual connectivity)
            const connectedParcels = this.getVisualNetworkConnectedParcels(row, col, 8); // Max 8 distance for visual clarity
            console.log(`🛣️ [NETWORK] Found ${connectedParcels.length} road-connected parcels`);

            for (const parcel of connectedParcels) {
                const parcelKey = `${parcel.row},${parcel.col}`;
                if (!this.proximityEffects.has(parcelKey)) {
                    // Determine if it's directly adjacent vs network connected
                    const isAdjacent = this.isAdjacent(row, col, parcel.row, parcel.col);
                    const effectType = isAdjacent ? 'adjacent' : 'connected';

                    // Distance-based intensity (closer = stronger effect, but more subtle)
                    const intensity = isAdjacent ? 0.3 : Math.max(0.1, 0.25 - (parcel.distance / 8) * 0.15);

                    this.proximityEffects.set(parcelKey, {
                        type: effectType,
                        intensity: intensity,
                        color: isAdjacent ? adjacentColor : connectedColor,
                        buildingTint: this.getVariantFromColor(playerColor),
                        distance: parcel.distance,
                        roadConnected: true
                    });
                    console.log(`🛣️ [NETWORK] Added ${effectType} effect for ${parcelKey}, distance: ${parcel.distance}`);
                }
            }
        }

        // Fallback to legacy system if new system isn't available
        else if (this.game.hoverInfluenceRadius) {
            console.log(`🛣️ [LEGACY] Using legacy hoverInfluenceRadius with ${this.game.hoverInfluenceRadius.size} parcels`);
            for (const parcelKey of this.game.hoverInfluenceRadius) {
                if (!this.proximityEffects.has(parcelKey)) {
                    const isExtended = parcelKey.includes(':extended');
                    this.proximityEffects.set(parcelKey, {
                        type: isExtended ? 'connected' : 'adjacent',
                        intensity: 0.2,
                        color: isExtended ? connectedColor : adjacentColor,
                        buildingTint: this.getVariantFromColor(playerColor)
                    });
                }
            }
        } else {
            console.log(`🛣️ [ROADS] No network connectivity system found`);
        }

        // Add mobility layer effects for road building
        if (this.game.mobilityLayer && this.game.mobilityLayer.hoveredEdge) {
            this.addMobilityEffects();
        }
    }

    /**
     * Add mobility layer effects for road building hover
     */
    addMobilityEffects() {
        if (!this.game.mobilityLayer || !this.game.mobilityLayer.hoveredEdge) return;

        const edge = this.game.mobilityLayer.hoveredEdge;

        // Get affected parcels for this edge
        for (let row = 0; row < this.game.gridHeight; row++) {
            for (let col = 0; col < this.game.gridWidth; col++) {
                if (this.game.mobilityLayer.isParcelAffectedByEdge(row, col, edge)) {
                    const key = `${row},${col}`;
                    this.proximityEffects.set(key, {
                        type: 'mobility',
                        intensity: 0.8,
                        color: 'rgba(255, 255, 255, 0.8)', // White for road building
                        buildingTint: 'white'
                    });
                }
            }
        }
    }

    /**
     * Clear all proximity effects
     */
    clearProximityEffects() {
        this.proximityEffects.clear();
    }


    /**
     * Render all selection states for a specific parcel
     */
    renderParcelSelection(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {
        // 1. Render proximity effects first (behind everything)
        this.renderProximityEffect(row, col, ctx, isoX, isoY, tileWidth, tileHeight);


        // 2. Render hover state (only if not actively selected)
        if (!this.isParcelSelected(row, col)) {
            this.renderHoverState(row, col, ctx, isoX, isoY, tileWidth, tileHeight);
        }

        // 3. Render active selection (top priority)
        this.renderActiveSelection(row, col, ctx, isoX, isoY, tileWidth, tileHeight);
    }

    /**
     * Render proximity effects (yellow/blue/white rings)
     */
    renderProximityEffect(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {
        const key = `${row},${col}`;
        const effect = this.proximityEffects.get(key);

        if (!effect) return;

        ctx.save();

        // Use the color from the effect object for consistency
        // If no color is set, use current player color as fallback
        if (effect.color) {
            ctx.strokeStyle = effect.color;
        } else {
            const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';
            const playerColor = this.playerColors.get(currentPlayerId) || '#10AC84';
            const fallbackColor = this.hexToRgba(playerColor, effect.intensity);
            ctx.strokeStyle = fallbackColor;
        }

        // Different line widths for different effect types
        switch (effect.type) {
            case 'adjacent':
                ctx.lineWidth = 1.5;
                break;
            case 'connected':
                ctx.lineWidth = 2;
                break;
            case 'mobility':
                ctx.lineWidth = 2.5;
                ctx.setLineDash([4, 2]); // Dashed for mobility effects
                break;
            default:
                ctx.lineWidth = 1.5;
        }

        this.game.renderingSystem.drawDiamond(isoX, isoY, tileWidth, tileHeight);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Get building tint for a parcel based on proximity effects
     */
    getBuildingTint(row, col) {
        const key = `${row},${col}`;
        const effect = this.proximityEffects.get(key);
        return effect?.buildingTint || null;
    }

    /**
     * Check if a parcel has any proximity effects
     */
    hasProximityEffect(row, col) {
        const key = `${row},${col}`;
        return this.proximityEffects.has(key);
    }

    /**
     * Handle click on a parcel (for selection)
     */
    handleParcelClick(row, col, playerId = 1) {
        // Don't allow selecting during certain game modes
        if (this.game.currentLayer === 'mobility' || this.game.isBuilding) {
            return false;
        }

        // Check if this parcel is valid for selection
        if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
            return false;
        }

        // Get current player ID for proper multiplayer support
        const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';

        // Only allow players to control their own selections
        if (playerId !== currentPlayerId) {
            return false;
        }

        // Toggle selection: if already selected by this player, deselect
        const currentSelection = this.getActiveSelection(currentPlayerId);
        if (currentSelection && currentSelection.row === row && currentSelection.col === col) {
            this.setActiveSelection(currentPlayerId, null, null);
            return true;
        }

        // Immediate client-side selection (optimistic update)
        // This provides instant feedback without waiting for server validation
        this.setActiveSelection(currentPlayerId, row, col);

        // Additional client-side validation could go here
        // (e.g., check if parcel is owned, buildable, etc.)

        return true;
    }

    /**
     * Render hover state with differentiated fill for center vs connected parcels
     */
    renderHoverState(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {
        if (!this.hoveredParcel) {
            return;
        }

        const isHoveredCenter = this.hoveredParcel.row === row && this.hoveredParcel.col === col;
        const key = `${row},${col}`;
        const hasProximityEffect = this.proximityEffects.has(key);

        // Only render if this is the hovered center or has proximity effect
        if (!isHoveredCenter && !hasProximityEffect) {
            return;
        }

        ctx.save();

        // Use current player's color for hover
        const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';
        const playerColor = this.playerColors.get(currentPlayerId) || '#10AC84';

        // Lift selector 1px above grid plane
        const liftedY = isoY - 1;

        // Determine fill alpha based on whether this is center or connected
        let fillAlpha;
        if (isHoveredCenter) {
            fillAlpha = 0.4; // 40% for center parcel
        } else {
            fillAlpha = 0.2; // 20% for connected parcels
        }

        // Fill with appropriate translucent color
        ctx.fillStyle = this.hexToRgba(playerColor, fillAlpha);
        this.game.renderingSystem.drawDiamond(isoX, liftedY, tileWidth, tileHeight);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = this.hoverBorderWidth;
        this.game.renderingSystem.drawDiamond(isoX, liftedY, tileWidth, tileHeight);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Render active selection
     */
    renderActiveSelection(row, col, ctx, isoX, isoY, tileWidth, tileHeight) {
        const selectorPlayerId = this.getParcelSelector(row, col);
        if (!selectorPlayerId) return;

        const playerColor = this.playerColors.get(selectorPlayerId) || '#10AC84';

        ctx.save();

        // Get animation offset for bounce effect
        const animationOffset = this.getAnimationOffset(row, col);

        // Lift selector 3px above grid plane + animation offset
        const liftedY = isoY - 3 + animationOffset.yOffset;

        // Fill with 40% translucent color
        ctx.fillStyle = this.hexToRgba(playerColor, 0.4);
        this.game.renderingSystem.drawDiamond(isoX, liftedY, tileWidth, tileHeight);
        ctx.fill();

        // Draw border with thicker line for clicked parcels
        ctx.strokeStyle = playerColor;
        ctx.lineWidth = this.selectionBorderWidth; // Use 4px border as specified
        this.game.renderingSystem.drawDiamond(isoX, liftedY, tileWidth, tileHeight);
        ctx.stroke();

        ctx.restore();
    }


    /**
     * Check if current player's selection should be auto-deselected
     */
    checkAutoDeselect(hoveredParcel) {
        const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';
        const currentSelection = this.activeSelections.get(currentPlayerId);

        if (currentSelection) {
            // Check if cursor has moved away from selected parcel
            const isHoveringSelected = hoveredParcel &&
                hoveredParcel.row === currentSelection.row &&
                hoveredParcel.col === currentSelection.col;

            if (!isHoveringSelected) {
                // Check if cursor has moved to an adjacent parcel (allow some tolerance)
                const isNearSelected = hoveredParcel && this.isAdjacent(
                    hoveredParcel.row, hoveredParcel.col,
                    currentSelection.row, currentSelection.col
                );

                // If cursor is not on selected parcel and not adjacent, deselect
                if (!isNearSelected) {
                    this.setActiveSelection(currentPlayerId, null, null);
                }
            }
        }
    }

    /**
     * Get all parcels connected to a location through the road network (visual indicator version)
     */
    getVisualNetworkConnectedParcels(fromRow, fromCol, maxDistance = 8) {
        if (!this.game.transportationSystem) {
            return [];
        }

        // Check if starting position has road access
        if (!this.game.transportationSystem.hasRoadAccess(fromRow, fromCol)) {
            return [];
        }

        const connectedParcels = [];
        const network = this.game.transportationSystem.buildTransportNetwork();

        if (!network || network.roads.size === 0) {
            return [];
        }

        // Use breadth-first search to find all reachable parcels
        const visited = new Set();
        const queue = [{ row: fromRow, col: fromCol, distance: 0 }];
        const fromKey = `${fromRow},${fromCol}`;
        visited.add(fromKey);

        while (queue.length > 0) {
            const current = queue.shift();

            // Skip if beyond max distance
            if (current.distance > maxDistance) {
                continue;
            }

            // Add all parcels (not just those with buildings) to show full connectivity
            if (current.distance > 0) {
                connectedParcels.push({
                    row: current.row,
                    col: current.col,
                    distance: current.distance
                });
            }

            // Explore neighbors through road network
            const currentKey = `${current.row},${current.col}`;
            const connections = network.roads.get(currentKey) || [];

            for (const connection of connections) {
                const neighborKey = `${connection.row},${connection.col}`;

                if (!visited.has(neighborKey)) {
                    visited.add(neighborKey);

                    queue.push({
                        row: connection.row,
                        col: connection.col,
                        distance: current.distance + 1
                    });
                }
            }
        }

        return connectedParcels;
    }

    /**
     * Get all parcels connected to a location through the road network (full resource version)
     */
    getNetworkConnectedParcels(fromRow, fromCol, maxDistance = 10) {
        if (!this.game.transportationSystem) {
            return [];
        }

        // Check if starting position has road access
        if (!this.game.transportationSystem.hasRoadAccess(fromRow, fromCol)) {
            return [];
        }

        const connectedParcels = [];
        const network = this.game.transportationSystem.buildTransportNetwork();

        if (!network || network.roads.size === 0) {
            return [];
        }

        // Use breadth-first search to find all reachable parcels
        const visited = new Set();
        const queue = [{ row: fromRow, col: fromCol, distance: 0, efficiency: 1.0 }];
        const fromKey = `${fromRow},${fromCol}`;
        visited.add(fromKey);

        while (queue.length > 0) {
            const current = queue.shift();

            // Skip if beyond max distance
            if (current.distance > maxDistance) {
                continue;
            }

            // Add this parcel if it's not the starting position and has interesting content
            if (current.distance > 0) {
                const parcel = this.game.grid[current.row] && this.game.grid[current.row][current.col];
                if (parcel && (parcel.building || parcel.terrain)) {
                    connectedParcels.push({
                        row: current.row,
                        col: current.col,
                        distance: current.distance,
                        efficiency: current.efficiency
                    });
                }
            }

            // Explore neighbors through road network
            const currentKey = `${current.row},${current.col}`;
            const connections = network.roads.get(currentKey) || [];

            for (const connection of connections) {
                const neighborKey = `${connection.row},${connection.col}`;

                if (!visited.has(neighborKey)) {
                    visited.add(neighborKey);

                    // Calculate distance and efficiency for next step
                    const stepDistance = 1; // Each network step is 1 unit
                    const roadEfficiency = this.game.transportationSystem.getRoadEfficiency(connection.roadType || 'local');
                    const newDistance = current.distance + stepDistance;
                    const newEfficiency = current.efficiency * roadEfficiency;

                    queue.push({
                        row: connection.row,
                        col: connection.col,
                        distance: newDistance,
                        efficiency: newEfficiency
                    });
                }
            }
        }

        return connectedParcels;
    }

    /**
     * Check if two parcels are adjacent (including diagonally)
     */
    isAdjacent(row1, col1, row2, col2) {
        const rowDiff = Math.abs(row1 - row2);
        const colDiff = Math.abs(col1 - col2);
        return rowDiff <= 1 && colDiff <= 1 && !(rowDiff === 0 && colDiff === 0);
    }

    /**
     * Notify server of selection changes for multiplayer coordination
     */
    notifyServerSelection(playerId, row, col) {
        // For now, just store locally and prepare for server sync
        // This will be enhanced when server-side coordination is implemented
        if (this.game.multiplayerManager) {
            // Future: Send selection update to server
            console.log(`🎯 Player ${playerId} selection:`, row !== null ? `${row},${col}` : 'deselected');
        }
    }

    /**
     * Handle selection updates from other players (from server)
     */
    handleRemoteSelection(playerId, row, col) {
        if (playerId !== (this.game.multiplayerManager?.playerId || 'player')) {
            // Update remote player selection without triggering local effects
            if (row !== null && col !== null) {
                this.activeSelections.set(playerId, { row, col });
            } else {
                this.activeSelections.delete(playerId);
            }
            this.game.scheduleRender();
        }
    }

    /**
     * Start click animation for a parcel with repeating bounce
     */
    startClickAnimation(row, col) {
        const key = `${row},${col}`;
        this.clickAnimations.set(key, {
            startTime: Date.now(),
            bounceHeight: 3, // 3px bounce
            bounceInterval: 2000, // 2 second cycle for repeating bounce
            row: row,
            col: col,
            isRepeating: true
        });

        // Schedule animation updates
        this.animationLoop();
    }

    /**
     * Animation loop for smooth bounce effects
     */
    animationLoop() {
        const now = Date.now();
        let hasActiveAnimations = false;

        // Update all active animations
        for (const [key, animation] of this.clickAnimations) {
            // For repeating animations, check if parcel is still selected
            if (animation.isRepeating) {
                const [row, col] = key.split(',').map(Number);
                if (this.isParcelSelected(row, col)) {
                    hasActiveAnimations = true;
                } else {
                    // Parcel no longer selected, remove animation
                    this.clickAnimations.delete(key);
                }
            } else {
                // Non-repeating animation (legacy support)
                const elapsed = now - animation.startTime;
                if (elapsed >= animation.duration) {
                    this.clickAnimations.delete(key);
                } else {
                    hasActiveAnimations = true;
                }
            }
        }

        if (hasActiveAnimations) {
            this.game.scheduleRender();
            // Continue animation loop
            requestAnimationFrame(() => this.animationLoop());
        }
    }

    /**
     * Get animation offset for a parcel with repeating bounce support
     */
    getAnimationOffset(row, col) {
        const key = `${row},${col}`;
        const animation = this.clickAnimations.get(key);

        if (!animation) {
            return { yOffset: 0, scale: 1 };
        }

        const elapsed = Date.now() - animation.startTime;

        let bounce;
        if (animation.isRepeating) {
            // Repeating bounce animation
            const cycleProgress = (elapsed % animation.bounceInterval) / animation.bounceInterval;

            // Create a smooth sine wave bounce that repeats
            // Use sine wave to create gentle up-down motion
            bounce = -animation.bounceHeight * Math.abs(Math.sin(cycleProgress * Math.PI * 2));
        } else {
            // Legacy single bounce animation
            const progress = Math.min(elapsed / animation.duration, 1);

            if (progress < 0.5) {
                const t = progress * 2;
                bounce = -animation.bounceHeight * (1 - (1 - t) * (1 - t));
            } else {
                const t = (progress - 0.5) * 2;
                bounce = -animation.bounceHeight * 0.2 * (1 - t);
            }
        }

        return {
            yOffset: bounce,
            scale: 1
        };
    }

    /**
     * Utility: Convert hex color to rgba with alpha
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Map player hex color to building variant name
     */
    getVariantFromColor(hexColor) {
        // Convert hex to RGB for analysis
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // Calculate which color channel is dominant
        const max = Math.max(r, g, b);

        // If it's more yellow/orange (high red and green, low blue)
        if (r >= 150 && g >= 150 && b < 100) {
            return 'yellow';
        }
        // If it's more blue (high blue, low red and green)
        else if (b >= 150 && r < 100 && g < 100) {
            return 'blue';
        }
        // Default based on which channel is highest
        else if (g >= r && g >= b) {
            return 'yellow'; // Green-ish colors map to yellow variant
        }
        else if (b >= r && b >= g) {
            return 'blue';
        }
        else {
            return 'yellow'; // Red-ish colors map to yellow variant
        }
    }

    /**
     * Utility: Check if two parcels are the same
     */
    isSameParcel(parcel1, parcel2) {
        if (!parcel1 && !parcel2) return true;
        if (!parcel1 || !parcel2) return false;
        return parcel1.row === parcel2.row && parcel1.col === parcel2.col;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.hoveredParcel = null;
        this.activeSelections.clear();
                this.proximityEffects.clear();
        this.playerColors.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ParcelSelectorManager;
}