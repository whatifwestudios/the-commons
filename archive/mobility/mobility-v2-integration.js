/**
 * Mobility v2 Integration Interface
 * Clean integration layer for mobility-layer-v2.js to replace ALL legacy mobility code
 *
 * SUCCESS CRITERIA: After this works, we can delete:
 * - transportation.js (1,248 lines)
 * - All mobility code from game.js
 * - mobility-layer.js (if it exists)
 */

class MobilityV2Integration {
    constructor(game) {
        this.game = game;
        this.mobilityLayer = null;
        this.isLegacyDisabled = false;
    }

    /**
     * Initialize Mobility v2 system - COMPLETELY INDEPENDENT
     */
    async initialize() {
        console.log('🚀 Initializing Mobility Layer v2 (independent system)');

        try {
            // Create clean mobility layer instance
            this.mobilityLayer = new MobilityLayerV2(this.game);

            // Add to map layer switcher (integrate with existing UI)
            this.addToMapLayerSwitcher();

            // Setup keyboard shortcuts (if needed)
            this.setupKeyboardShortcuts();

            // Register with rendering system for infrastructure visualization
            this.registerWithRenderingSystem();

            // Register with economic engine for impact calculations
            this.registerWithEconomicEngine();

            // Setup server sync for multiplayer
            this.setupMultiplayerSync();

            console.log('✅ Mobility Layer v2 initialized successfully');
            console.log('🎯 Ready to replace legacy transportation.js system');

            return true;
        } catch (error) {
            console.error('❌ Mobility v2 initialization failed:', error);
            return false;
        }
    }

    /**
     * Integrate with existing layer system (city name hover menu)
     */
    addToMapLayerSwitcher() {
        // Find existing mobility layer button
        const existingMobilityBtn = document.getElementById('layer-mobility');

        if (existingMobilityBtn) {
            console.log('📍 Found existing mobility layer button - integrating with Mobility v2');

            // Override the existing layer switching to use our v2 system
            existingMobilityBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Activate mobility v2
                this.toggleMobilityLayer();

                // Update UI state
                this.updateLayerButtonStates(existingMobilityBtn);

                // Close dropdown
                const cityMenu = document.getElementById('city-menu');
                if (cityMenu) {
                    cityMenu.style.display = 'none';
                }

                // Bypass legacy panel transitions by calling our own
                this.handleMobilityV2PanelTransitions();
            });

            // Also intercept the legacy system calls to prevent conflicts
            this.interceptLegacyLayerSwitching();

            console.log('✅ Integrated Mobility v2 with existing layer system');
        } else {
            console.warn('⚠️ Existing mobility layer button not found - creating fallback');
            this.createFallbackUI();
        }
    }

    /**
     * Update layer button states
     */
    updateLayerButtonStates(activatedBtn) {
        // Remove active from all layer buttons
        const allLayerBtns = document.querySelectorAll('.layer-option');
        allLayerBtns.forEach(btn => btn.classList.remove('active'));

        // Add active to the clicked button
        if (this.mobilityLayer.isActive) {
            activatedBtn.classList.add('active');
        } else {
            // If mobility is deactivated, go back to normal view
            const normalBtn = document.getElementById('layer-normal');
            if (normalBtn) {
                normalBtn.classList.add('active');
            }
        }
    }

    /**
     * Create fallback UI if layer switcher not found
     */
    createFallbackUI() {
        const fallbackButton = document.createElement('button');
        fallbackButton.textContent = 'MOBILITY LAYER';
        fallbackButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #0066cc;
            color: white;
            border: none;
            padding: 10px;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1001;
            font-size: 12px;
        `;

        fallbackButton.addEventListener('click', () => {
            this.toggleMobilityLayer();
        });

        document.body.appendChild(fallbackButton);
        console.log('🔧 Created fallback Mobility Layer button');
    }

    /**
     * Setup keyboard shortcuts for mobility layer
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 'M' key to toggle mobility layer
            if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey) {
                // Only if not typing in an input
                if (document.activeElement.tagName !== 'INPUT' &&
                    document.activeElement.tagName !== 'TEXTAREA') {
                    this.toggleMobilityLayer();
                }
            }

            // 'ESC' key to close mobility layer
            if (e.key === 'Escape' && this.mobilityLayer.isActive) {
                this.mobilityLayer.hide();
            }
        });

        console.log('⌨️ Mobility keyboard shortcuts registered (M to toggle, ESC to close)');
    }

    /**
     * Register with rendering system for infrastructure visualization
     */
    registerWithRenderingSystem() {
        if (this.game.renderingSystem) {
            // Add mobility layer to rendering pipeline
            const originalRender = this.game.renderingSystem.render.bind(this.game.renderingSystem);

            this.game.renderingSystem.render = () => {
                // Call original render first
                originalRender();

                // Then render mobility infrastructure if active
                if (this.mobilityLayer.isActive) {
                    this.renderMobilityInfrastructure();
                }
            };

            console.log('🎨 Registered with rendering system');
        } else {
            console.warn('⚠️ Rendering system not found - mobility visualization may not work');
        }
    }

    /**
     * Register with economic engine for JEEFHH/CARENS calculations
     */
    registerWithEconomicEngine() {
        if (this.game.economicEngine) {
            // Override economic engine to use mobility v2 data
            const originalCalculate = this.game.economicEngine.calculateResourceFlow?.bind(this.game.economicEngine);

            if (originalCalculate) {
                this.game.economicEngine.calculateResourceFlow = () => {
                    // Use mobility v2 infrastructure data
                    const mobilityData = this.mobilityLayer.getInfrastructureData();

                    // Process through economic engine
                    return this.calculateMobilityEconomicImpacts(mobilityData);
                };
            }

            console.log('💰 Registered with economic engine');
        } else {
            console.warn('⚠️ Economic engine not found - mobility economic impacts may not calculate');
        }
    }

    /**
     * Setup multiplayer synchronization
     */
    setupMultiplayerSync() {
        if (this.game.websocket || this.game.serverSync) {
            // Listen for mobility updates from server
            const eventSource = this.game.websocket || this.game.serverSync;

            eventSource.addEventListener?.('mobility-update', (event) => {
                const infrastructureData = JSON.parse(event.data);
                this.mobilityLayer.updateFromServer(infrastructureData);
            });

            // Send mobility updates to server
            this.mobilityLayer.onInfrastructureChange = (changeData) => {
                this.sendToServer('mobility-change', changeData);
            };

            console.log('🌐 Multiplayer sync registered');
        } else {
            console.warn('⚠️ Multiplayer system not found - mobility changes will be local only');
        }
    }

    /**
     * Toggle mobility layer visibility
     */
    toggleMobilityLayer() {
        if (!this.mobilityLayer) {
            console.error('❌ Mobility layer not initialized');
            return;
        }

        this.mobilityLayer.toggle();

        // Replace the game's mobility layer with ours when active
        if (this.mobilityLayer.isActive) {
            // Set the current layer to mobility so RenderingSystem calls our render() method
            this.originalCurrentLayer = this.game.currentLayer;
            this.game.currentLayer = 'mobility';

            // Replace game's mobilityLayer with our v2 instance
            this.originalMobilityLayer = this.game.mobilityLayer;
            this.game.mobilityLayer = this.mobilityLayer;

            // Comprehensive logging for diagnosis
            console.log('🔧 DIAGNOSTIC: Mobility V2 Integration Active');
            console.log('🔧 DIAGNOSTIC: game.currentLayer =', this.game.currentLayer);
            console.log('🔧 DIAGNOSTIC: game.mobilityLayer type =', this.game.mobilityLayer.constructor.name);
            console.log('🔧 DIAGNOSTIC: mobilityLayer.isActive =', this.game.mobilityLayer.isActive);
            console.log('🔧 DIAGNOSTIC: mobilityLayer has render method =', typeof this.game.mobilityLayer.render === 'function');

            // Disable parcel selector for mobility view
            this.disableParcelSelector();

            // Force a render to show the changes
            if (this.game.renderingSystem && this.game.renderingSystem.render) {
                this.game.renderingSystem.render();
            }

            console.log('🔄 Replaced legacy mobilityLayer with v2');
            console.log('✅ Mobility v2 activated: parcels will be 60% size with road corridors');
            console.log('📊 Debug: currentLayer =', this.game.currentLayer);
        } else {
            // Restore current layer - default to 'normal'
            this.game.currentLayer = this.originalCurrentLayer || 'normal';
            console.log('🔄 Restored currentLayer to:', this.game.currentLayer);

            // Restore original mobility layer when inactive
            if (this.originalMobilityLayer) {
                this.game.mobilityLayer = this.originalMobilityLayer;
                console.log('🔄 Restored legacy mobilityLayer');
            } else {
                // Clear mobility layer reference
                this.game.mobilityLayer = null;
                console.log('🔄 Cleared mobilityLayer reference');
            }

            // Re-enable parcel selector
            this.enableParcelSelector();

            // Clear original references
            this.originalCurrentLayer = undefined;
            this.originalMobilityLayer = undefined;

            // Force a render to show the changes
            if (this.game.renderingSystem && this.game.renderingSystem.render) {
                this.game.renderingSystem.render();
            }

            console.log('✅ Mobility v2 deactivated: restored normal rendering');
        }

        // Disable legacy transportation if mobility v2 is active
        if (this.mobilityLayer.isActive && !this.isLegacyDisabled) {
            this.disableLegacyMobility();
        }
    }

    /**
     * Disable legacy mobility/transportation systems when mobility v2 is active
     */
    disableLegacyMobility() {
        console.log('🚫 Disabling legacy mobility systems...');

        // Disable transportation.js if it exists
        if (this.game.transportationSystem) {
            console.log('   - Disabled transportation.js system');
            // Don't destroy it, just stop it from interfering
            this.game.transportationSystem._disabled = true;
        }

        // Replace game.js mobility functions
        if (this.game.buildTransportNetwork) {
            console.log('   - Replaced game.js transport functions');
            this.game.buildTransportNetwork = () => {
                console.log('🚛 Using Mobility v2 transport network');
                return this.buildTransportNetworkV2();
            };
        }

        // Disable any mobility-layer.js if it exists
        if (this.game.mobilityLayer && this.game.mobilityLayer !== this.mobilityLayer) {
            console.log('   - Disabled legacy mobility-layer.js');
            this.game.mobilityLayer._disabled = true;
        }

        this.isLegacyDisabled = true;
        console.log('✅ Legacy mobility systems disabled - Mobility v2 has full control');
    }

    /**
     * Build transport network in v2 format compatible with legacy code
     * @returns {Object} Transport network with nodes, connections, and roads
     */
    buildTransportNetworkV2() {
        const network = {
            nodes: [],
            connections: new Map(),
            roads: new Map()
        };

        if (!this.mobilityLayer) {
            console.warn('MobilityV2: No mobility layer available for transport network');
            return network;
        }

        // Convert mobility v2 infrastructure to legacy format
        const infrastructure = this.mobilityLayer.infrastructure;
        if (!infrastructure || infrastructure.size === 0) {
            console.log('MobilityV2: No infrastructure built yet');
            return network;
        }

        // Build roads map in the format legacy code expects
        for (const [key, segments] of infrastructure.entries()) {
            if (segments && segments.length > 0) {
                // Extract row,col from key
                const [row, col] = key.split(',').map(Number);
                const parcelKey = `${row},${col}`;

                // Convert segments to road connections format
                const connections = [];
                for (const segment of segments) {
                    if (segment.type && segment.edge) {
                        connections.push({
                            edge: segment.edge,
                            roadType: segment.type,
                            upgrades: segment.upgrades || []
                        });
                    }
                }

                if (connections.length > 0) {
                    network.roads.set(parcelKey, connections);
                    network.nodes.push({ row, col, key: parcelKey });
                }
            }
        }

        // Build connections map for pathfinding
        for (const [parcelKey, roadConnections] of network.roads.entries()) {
            const connections = [];
            const [row, col] = parcelKey.split(',').map(Number);

            // For each road connection from this parcel, find connected parcels
            for (const connection of roadConnections) {
                let targetRow = row;
                let targetCol = col;

                // Calculate adjacent parcel based on edge
                switch (connection.edge) {
                    case 'north': targetRow = row - 1; break;
                    case 'south': targetRow = row + 1; break;
                    case 'east': targetCol = col + 1; break;
                    case 'west': targetCol = col - 1; break;
                }

                // Check if target parcel is within bounds and has roads
                if (targetRow >= 0 && targetRow < (this.game.gridSize || 50) &&
                    targetCol >= 0 && targetCol < (this.game.gridSize || 50)) {

                    const targetKey = `${targetRow},${targetCol}`;
                    if (network.roads.has(targetKey)) {
                        connections.push({
                            to: targetKey,
                            roadType: connection.roadType,
                            upgrades: connection.upgrades
                        });
                    }
                }
            }

            if (connections.length > 0) {
                network.connections.set(parcelKey, connections);
            }
        }

        console.log(`MobilityV2: Built transport network with ${network.roads.size} road parcels and ${network.connections.size} connections`);
        return network;
    }


    /**
     * Render shrunken parcel (60% size, centered) like mobility v1
     */
    renderShrunkParcel(row, col) {
        const parcel = this.game.grid[row][col];
        const renderingSystem = this.game.renderingSystem;
        const ctx = renderingSystem.ctx;

        // Get isometric position
        const iso = renderingSystem.gridToIso(row, col);
        const adjustedY = iso.y - renderingSystem.tileHeight / 2;

        ctx.save();
        ctx.translate(iso.x, adjustedY);

        // Calculate shrunken dimensions (60% of original)
        const shrunkWidth = renderingSystem.tileWidth * this.mobilityLayer.parcelShrinkFactor;
        const shrunkHeight = renderingSystem.tileHeight * this.mobilityLayer.parcelShrinkFactor;

        // Draw shrunken parcel centered in original position
        this.drawShrunkParcelShape(ctx, parcel, shrunkWidth, shrunkHeight);

        // Draw building if present (also shrunken)
        if (parcel && parcel.building) {
            const shrinkFactor = this.mobilityLayer.parcelShrinkFactor;
            renderingSystem.drawBuilding(parcel.building, 0, -shrunkHeight / 4, row, col, parcel, shrinkFactor);
        }

        ctx.restore();
    }

    /**
     * Draw the actual shrunken parcel shape (diamond)
     */
    drawShrunkParcelShape(ctx, parcel, width, height) {
        const halfW = width / 2;
        const halfH = height / 2;

        // Get dimmed parcel color
        let fillColor = this.getDimmedParcelColor(parcel);

        ctx.save();

        // Draw perfect diamond shape (4 straight edges to 4 points)
        ctx.beginPath();
        ctx.moveTo(0, -halfH);        // Top
        ctx.lineTo(halfW, 0);         // Right
        ctx.lineTo(0, halfH);         // Bottom
        ctx.lineTo(-halfW, 0);        // Left
        ctx.closePath();

        // Fill with dimmed color
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Subtle border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Get dimmed parcel color for mobility view (like v1)
     */
    getDimmedParcelColor(parcel) {
        // Default to dark gray
        let baseColor = 'rgba(60, 60, 60, 0.8)';

        if (!parcel) return baseColor;

        // Get building-based color if present
        if (parcel.building) {
            const building = this.game.buildingManager?.getBuildingById(parcel.building);
            if (building) {
                // Categorize building and return dimmed color
                const category = this.categorizeBuildingFunction(building);
                baseColor = this.getBuildingCategoryColor(category);
            }
        } else if (parcel.terrain) {
            // Terrain-based coloring
            baseColor = this.getTerrainColor(parcel.terrain);
        }

        return baseColor;
    }

    /**
     * Categorize building function (simplified from v1)
     */
    categorizeBuildingFunction(building) {
        if (!building.name) return 'other';

        const name = building.name.toLowerCase();
        if (name.includes('house') || name.includes('apartment')) return 'residential';
        if (name.includes('shop') || name.includes('market')) return 'commercial';
        if (name.includes('factory') || name.includes('warehouse')) return 'industrial';
        if (name.includes('office')) return 'office';
        if (name.includes('school') || name.includes('library')) return 'education';
        if (name.includes('hospital') || name.includes('fire')) return 'emergency';
        if (name.includes('park') || name.includes('recreation')) return 'recreation';

        return 'other';
    }

    /**
     * Get building category color (dimmed for mobility view)
     */
    getBuildingCategoryColor(category) {
        const colors = {
            residential: 'rgba(59, 130, 246, 0.6)',     // Blue
            commercial: 'rgba(251, 191, 36, 0.6)',      // Yellow
            industrial: 'rgba(245, 101, 101, 0.6)',     // Red
            office: 'rgba(168, 85, 247, 0.6)',          // Purple
            education: 'rgba(168, 85, 247, 0.6)',       // Purple
            emergency: 'rgba(99, 179, 237, 0.6)',       // Light blue
            recreation: 'rgba(99, 179, 237, 0.6)',      // Light blue
            utilities: 'rgba(34, 197, 94, 0.6)',        // Green
            other: 'rgba(156, 163, 175, 0.6)'           // Gray
        };
        return colors[category] || colors.other;
    }

    /**
     * Get terrain color (dimmed)
     */
    getTerrainColor(terrain) {
        // Simple terrain colors - could be enhanced
        const colors = {
            grass: 'rgba(34, 197, 94, 0.4)',     // Green
            water: 'rgba(59, 130, 246, 0.4)',    // Blue
            forest: 'rgba(22, 163, 74, 0.4)',    // Dark green
            mountain: 'rgba(120, 113, 108, 0.4)' // Brown-gray
        };
        return colors[terrain] || 'rgba(60, 60, 60, 0.4)';
    }

    /**
     * Disable parcel selector in mobility view
     */
    disableParcelSelector() {
        if (this.game.parcelSelector) {
            this.originalParcelSelectorActive = this.game.parcelSelector.isActive;
            this.game.parcelSelector.isActive = false;
            console.log('📋 Parcel selector disabled for mobility view');
        }
    }

    /**
     * Re-enable parcel selector
     */
    enableParcelSelector() {
        if (this.game.parcelSelector && this.originalParcelSelectorActive !== undefined) {
            this.game.parcelSelector.isActive = this.originalParcelSelectorActive;
            console.log('📋 Parcel selector re-enabled');
        }
    }

    /**
     * Re-enable legacy systems (for fallback if needed)
     */
    enableLegacyMobility() {
        console.log('🔄 Re-enabling legacy mobility systems...');

        if (this.game.transportationSystem) {
            this.game.transportationSystem._disabled = false;
        }

        if (this.game.mobilityLayer && this.game.mobilityLayer !== this.mobilityLayer) {
            this.game.mobilityLayer._disabled = false;
        }

        this.isLegacyDisabled = false;
        console.log('✅ Legacy mobility systems re-enabled');
    }

    /**
     * Render mobility infrastructure on canvas
     */
    renderMobilityInfrastructure() {
        // The mobility layer v2 handles its own rendering in the main render() method
        // This integration method is disabled to prevent duplicate rendering
        return;
    }

    /**
     * Render a road segment on canvas
     */
    renderRoadSegment(ctx, segmentId, segment) {
        // Parse the segment key format "row1,col1-row2,col2"
        if (typeof segmentId !== 'string') {
            console.error('Invalid segmentId type:', typeof segmentId, segmentId);
            return;
        }

        const parts = segmentId.split('-');
        if (parts.length !== 2) {
            console.error('Invalid segmentId format:', segmentId);
            return;
        }

        const [from, to] = parts;
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);

        // Get intersection positions from mobility layer
        const fromIntersection = this.mobilityLayer.intersections.get(`${fromRow},${fromCol}`);
        const toIntersection = this.mobilityLayer.intersections.get(`${toRow},${toCol}`);

        if (!fromIntersection || !toIntersection) {
            // Intersections not built yet, skip rendering
            return;
        }

        // Basic road visualization
        ctx.strokeStyle = this.getRoadColor(segment.type);
        ctx.lineWidth = this.getRoadWidth(segment.type);

        // Draw road segment between intersections
        ctx.beginPath();
        ctx.moveTo(fromIntersection.x, fromIntersection.y);
        ctx.lineTo(toIntersection.x, toIntersection.y);
        ctx.stroke();

        // Render upgrades
        if (segment.upgrades && segment.upgrades.includes('sidewalks')) {
            this.renderSidewalks(ctx, fromIntersection, toIntersection);
        }
        if (segment.upgrades && segment.upgrades.includes('bike_lanes')) {
            this.renderBikeLanes(ctx, fromIntersection, toIntersection);
        }
    }

    /**
     * Get road color based on type
     */
    getRoadColor(type) {
        const colors = {
            local_road: '#666666',
            arterial_road: '#888888',
            highway: '#aaaaaa'
        };
        return colors[type] || '#666666';
    }

    /**
     * Get road width based on type
     */
    getRoadWidth(type) {
        const widths = {
            local_road: 2,
            arterial_road: 4,
            highway: 6
        };
        return widths[type] || 2;
    }

    /**
     * Render sidewalks upgrade
     */
    renderSidewalks(ctx, x, y, edge) {
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        // TODO: Draw sidewalk lines parallel to road
    }

    /**
     * Render bike lanes upgrade
     */
    renderBikeLanes(ctx, x, y, edge) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        // TODO: Draw bike lane markings
    }

    /**
     * Render transit stop
     */
    renderTransitStop(ctx, stopId, stop) {
        // TODO: Render emoji-style transit stop indicators
        const [row, col] = stopId.split(',');
        const x = parseInt(col) * (this.game.tileWidth || 40);
        const y = parseInt(row) * (this.game.tileHeight || 20);

        ctx.font = '16px Arial';
        ctx.fillText(stop.type === 'bus_stop' ? '🚌' : '🚇', x, y);
    }

    /**
     * Render transit line connections
     */
    renderTransitLine(ctx, line) {
        // TODO: Draw lines connecting transit stops
        ctx.strokeStyle = line.type === 'bus_route' ? '#ff6600' : '#0066ff';
        ctx.lineWidth = 2;
        // Draw connections between stops
    }

    /**
     * Calculate economic impacts from mobility infrastructure
     */
    calculateMobilityEconomicImpacts(mobilityData) {
        // TODO: Implement JEEFHH/CARENS calculations based on infrastructure

        const impacts = {
            resourceFlow: {
                people: 0,
                energy: 0,
                food: 0
            },
            carensImpacts: {
                culture: 0,
                affordability: 0,
                resilience: 0,
                environment: 0,
                noise: 0,
                safety: 0
            },
            costs: {
                construction: 0,
                maintenance: 0
            }
        };

        // Calculate based on road segments
        mobilityData.roadSegments.forEach(segment => {
            // Resource flow efficiency
            if (segment.type === 'highway') {
                impacts.resourceFlow.food += 0.9; // Excellent for goods transport
                impacts.resourceFlow.energy += 0.9;
                impacts.carensImpacts.noise += 0.7; // High noise
                impacts.carensImpacts.environment -= 0.6; // Environmental impact
            } else if (segment.type === 'local_road') {
                impacts.resourceFlow.people += 0.5;
                impacts.carensImpacts.noise += 0.3; // Low noise
                if (segment.upgrades.includes('sidewalks')) {
                    impacts.carensImpacts.safety += 0.3;
                }
                if (segment.upgrades.includes('bike_lanes')) {
                    impacts.carensImpacts.environment += 0.2;
                    impacts.carensImpacts.culture += 0.1;
                }
            }

            // Maintenance costs
            impacts.costs.maintenance += this.mobilityLayer.INFRASTRUCTURE_COSTS[segment.type] * 0.1;
        });

        // Calculate based on transit systems
        mobilityData.transitStops.forEach(stop => {
            if (stop.type === 'bus_stop') {
                impacts.resourceFlow.people += 0.8;
                impacts.carensImpacts.affordability += 0.2;
                impacts.carensImpacts.noise += 0.4;
            } else if (stop.type === 'subway_station') {
                impacts.resourceFlow.people += 1.0;
                impacts.carensImpacts.noise += 0.1;
                impacts.carensImpacts.environment += 0.3;
            }
        });

        return impacts;
    }

    /**
     * Send data to server for multiplayer sync
     */
    sendToServer(eventType, data) {
        if (this.game.websocket) {
            this.game.websocket.send(JSON.stringify({
                type: eventType,
                data: data
            }));
        } else if (this.game.serverSync) {
            this.game.serverSync.send(eventType, data);
        }
    }

    /**
     * Get status of mobility v2 system
     */
    getStatus() {
        return {
            initialized: !!this.mobilityLayer,
            active: this.mobilityLayer?.isActive || false,
            legacyDisabled: this.isLegacyDisabled,
            infrastructureCount: {
                roadSegments: this.mobilityLayer?.roadSegments.size || 0,
                transitStops: this.mobilityLayer?.transitStops.size || 0,
                transitLines: this.mobilityLayer?.transitLines.length || 0
            }
        };
    }

    /**
     * Completely replace legacy mobility systems
     * WARNING: This will disable transportation.js, game.js mobility, etc.
     */
    async replaceLegacySystems() {
        console.log('🔄 REPLACING ALL LEGACY MOBILITY SYSTEMS WITH MOBILITY V2');
        console.log('⚠️ This will disable transportation.js and mobility code in game.js');

        // Initialize mobility v2
        const success = await this.initialize();
        if (!success) {
            console.error('❌ Cannot replace legacy - Mobility v2 initialization failed');
            return false;
        }

        // Force disable all legacy systems
        this.disableLegacyMobility();

        // Show mobility layer by default
        this.mobilityLayer.show();

        console.log('✅ LEGACY REPLACEMENT COMPLETE');
        console.log('🎯 Ready to delete transportation.js, mobility code from game.js');
        console.log('📊 Mobility v2 Status:', this.getStatus());

        return true;
    }

    /**
     * Handle panel transitions specifically for Mobility v2
     */
    handleMobilityV2PanelTransitions() {
        // For Mobility v2, we don't need complex panel management
        // Our modal is self-contained
        console.log('🎛️ Mobility v2 panel transitions handled (modal-based system)');
    }

    /**
     * Intercept legacy layer switching to prevent conflicts
     */
    interceptLegacyLayerSwitching() {
        // Store reference to original switchToLayer if it exists
        if (this.game.switchToLayer && !this.game._originalSwitchToLayer) {
            this.game._originalSwitchToLayer = this.game.switchToLayer;

            // Override switchToLayer for mobility cases
            this.game.switchToLayer = (layerName) => {
                if (layerName === 'mobility' && this.mobilityLayer) {
                    // Handle mobility v2 switching - turning on
                    console.log('🔄 Intercepted mobility layer switch - using Mobility v2');

                    if (!this.mobilityLayer.isActive) {
                        this.toggleMobilityLayer();
                    }

                    // Skip legacy panel transitions that cause errors
                    return;
                }

                // Handle switching away from mobility
                if (this.mobilityLayer && this.mobilityLayer.isActive) {
                    console.log('🔄 Switching away from mobility to', layerName);
                    // Use the toggle method which properly restores original layer
                    this.toggleMobilityLayer();
                }

                // Use original method for other layers
                if (this.game._originalSwitchToLayer) {
                    return this.game._originalSwitchToLayer.call(this.game, layerName);
                }
            };

            console.log('🔧 Intercepted legacy layer switching for Mobility v2');
        }
    }

    /**
     * Restore legacy layer switching
     */
    restoreLegacyLayerSwitching() {
        if (this.game._originalSwitchToLayer) {
            this.game.switchToLayer = this.game._originalSwitchToLayer;
            delete this.game._originalSwitchToLayer;
            console.log('🔄 Restored legacy layer switching');
        }
    }
}

// Export for integration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobilityV2Integration;
}