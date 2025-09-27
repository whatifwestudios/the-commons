/**
 * Mobility Layer v2 - Clean Implementation
 * Based on MOBILITY_V2_DESIGN.md and MOBILITY_V2_UI_SPEC.md
 */

class MobilityLayerV2 {
    constructor(game) {
        this.game = game;

        // Core infrastructure costs (corrected)
        this.INFRASTRUCTURE_COSTS = {
            local_road: 20,
            arterial_road: 50,
            highway: 200,
            sidewalk_upgrade: 5,
            bike_lane_upgrade: 10,
            bus_stop: 15,
            subway_station: 50
        };

        // Upgrade compatibility rules
        this.UPGRADE_RULES = {
            local_road: {
                sidewalks: true,
                bike_lanes: true,
                both_upgrades: true
            },
            arterial_road: {
                sidewalks: true,
                bike_lanes: true,
                both_upgrades: false  // One or the other, not both
            },
            highway: {
                sidewalks: false,
                bike_lanes: false,
                both_upgrades: false
            }
        };

        // Infrastructure network state - Sub-parcel based system
        this.subParcelRoads = new Map(); // "row,col" -> SubParcelRoad (24x24 grid)
        this.transitStops = new Map();  // "row,col" -> TransitStop
        this.transitLines = [];         // Array of TransitLine objects

        // Sub-parcel grid constants (24x24 underlying 12x12 visible grid)
        this.VISIBLE_GRID_SIZE = 12;
        this.SUB_PARCEL_GRID_SIZE = 24;
        this.SUB_PARCELS_PER_PARCEL = 2; // 2x2 sub-parcels per visible parcel

        // UI state
        this.isActive = false;
        this.modal = null;
        // Visual design constants - parcels shrink in mobility mode to reveal sub-parcels
        this.parcelShrinkFactor = 0.6; // Shrink parcels to reveal underlying road sub-parcels

        // Intersection grid - positioned between parcels like v1
        this.intersections = new Map(); // key: "row,col", value: intersection data
        this.intersectionsBuilt = false;

        // Canvas dimensions tracking for resize handling
        this.lastCanvasWidth = 0;
        this.lastCanvasHeight = 0;

        this.modalState = {
            activeTab: 'roads',
            selectedInfrastructure: 'local_road',
            selectedUpgrades: [],
            hoveredSegment: null
        };

        this.initializeUI();
        this.setupEventHandlers();
    }

    // =====================================
    // SUB-PARCEL COORDINATE SYSTEM
    // =====================================

    /**
     * Convert visible parcel coordinates (0-11) to sub-parcel coordinates (0-23)
     * Each visible parcel maps to a 2x2 grid of sub-parcels
     */
    visibleToSubParcel(visibleRow, visibleCol) {
        return {
            minRow: visibleRow * this.SUB_PARCELS_PER_PARCEL,
            maxRow: visibleRow * this.SUB_PARCELS_PER_PARCEL + 1,
            minCol: visibleCol * this.SUB_PARCELS_PER_PARCEL,
            maxCol: visibleCol * this.SUB_PARCELS_PER_PARCEL + 1
        };
    }

    /**
     * Convert sub-parcel coordinates (0-23) to visible parcel coordinates (0-11)
     */
    subParcelToVisible(subRow, subCol) {
        return {
            row: Math.floor(subRow / this.SUB_PARCELS_PER_PARCEL),
            col: Math.floor(subCol / this.SUB_PARCELS_PER_PARCEL)
        };
    }

    /**
     * Get the 4 sub-parcels around a visible parcel (for roads)
     * Returns the road sub-parcels: top, right, bottom, left
     */
    getParcelRoadSubParcels(visibleRow, visibleCol) {
        const baseSubRow = visibleRow * this.SUB_PARCELS_PER_PARCEL;
        const baseSubCol = visibleCol * this.SUB_PARCELS_PER_PARCEL;

        return {
            top: { row: baseSubRow - 1, col: baseSubCol }, // Shared with parcel above
            right: { row: baseSubRow, col: baseSubCol + 2 }, // Shared with parcel right
            bottom: { row: baseSubRow + 2, col: baseSubCol }, // Shared with parcel below
            left: { row: baseSubRow, col: baseSubCol - 1 } // Shared with parcel left
        };
    }

    /**
     * Check if sub-parcel coordinates are valid road locations
     */
    isValidRoadSubParcel(subRow, subCol) {
        // Roads exist in the spaces between parcels
        // Valid if it's on parcel boundary lines
        const rowOnBoundary = subRow % this.SUB_PARCELS_PER_PARCEL === 0 || (subRow + 1) % this.SUB_PARCELS_PER_PARCEL === 0;
        const colOnBoundary = subCol % this.SUB_PARCELS_PER_PARCEL === 0 || (subCol + 1) % this.SUB_PARCELS_PER_PARCEL === 0;

        return rowOnBoundary || colOnBoundary;
    }

    /**
     * Convert screen coordinates to sub-parcel coordinates using isometric transformation
     */
    screenToSubParcel(screenX, screenY) {
        // Account for camera transformations
        const adjustedX = screenX - this.game.panOffset.x;
        const adjustedY = screenY - this.game.panOffset.y;
        const scaledX = adjustedX / this.game.zoomScale;
        const scaledY = adjustedY / this.game.zoomScale;

        // Use the rendering system's inverse isometric transformation
        // Scale to sub-parcel grid (2x2 sub-parcels per visible parcel)
        const gridCoords = this.game.renderingSystem.fromIsometric(scaledX, scaledY);

        if (!gridCoords) return null;

        // Convert from visible grid to sub-parcel grid coordinates
        const subCol = Math.floor(gridCoords.col * this.SUB_PARCELS_PER_PARCEL);
        const subRow = Math.floor(gridCoords.row * this.SUB_PARCELS_PER_PARCEL);

        // Validate bounds
        if (subRow < 0 || subRow >= this.SUB_PARCEL_GRID_SIZE || subCol < 0 || subCol >= this.SUB_PARCEL_GRID_SIZE) {
            return null;
        }

        return { row: subRow, col: subCol };
    }

    /**
     * Draw the sub-parcel grid background - simplified, no dots
     */
    drawSubParcelGrid(ctx) {
        // For now, just draw the background - roads will show when built
        // No need to show grid dots that confuse the user
        return;
    }

    /**
     * Initialize the mobility modal UI
     */
    initializeUI() {
        // Create modal container
        this.modal = this.createModalElement();
        document.body.appendChild(this.modal);

        // Initially hidden
        this.modal.style.display = 'none';
    }

    /**
     * Create the mobility modal DOM element
     */
    createModalElement() {
        const modal = document.createElement('div');
        modal.className = 'mobility-modal';
        modal.innerHTML = `
            <div class="mobility-header">
                <h3>Mobility Infrastructure</h3>
                <button class="mobility-close">&times;</button>
            </div>

            <div class="mobility-tabs">
                <button class="mobility-tab active" data-tab="roads">ROADS</button>
                <button class="mobility-tab" data-tab="stops">ADD STOPS</button>
                <button class="mobility-tab" data-tab="connect">CONNECT</button>
            </div>

            <div class="mobility-content">
                ${this.createRoadsTabContent()}
                ${this.createStopsTabContent()}
                ${this.createConnectTabContent()}
            </div>
        `;

        // Apply styling based on extracted CSS patterns
        this.applyModalStyling(modal);

        return modal;
    }

    /**
     * Create Roads tab content
     */
    createRoadsTabContent() {
        return `
            <div class="mobility-tab-content active" data-tab="roads">
                <div class="infrastructure-selection">
                    <h4>Infrastructure Type</h4>
                    <div class="infrastructure-options">
                        <label>
                            <input type="radio" name="infrastructure" value="local_road" checked>
                            Local Road ($${this.INFRASTRUCTURE_COSTS.local_road})
                        </label>
                        <label>
                            <input type="radio" name="infrastructure" value="arterial_road">
                            Arterial Road ($${this.INFRASTRUCTURE_COSTS.arterial_road})
                        </label>
                        <label>
                            <input type="radio" name="infrastructure" value="highway">
                            Highway ($${this.INFRASTRUCTURE_COSTS.highway})
                        </label>
                    </div>
                </div>

                <div class="upgrade-selection">
                    <h4>Upgrades</h4>
                    <div class="upgrade-options">
                        <!-- Dynamic upgrade options will be inserted here -->
                    </div>
                    <div class="upgrade-compatibility-note"></div>
                </div>

                <div class="cost-summary">
                    <div class="total-cost">Total Cost: $<span id="mobility-total-cost">20</span></div>
                </div>
            </div>
        `;
    }

    /**
     * Generate upgrade options HTML based on infrastructure type
     */
    generateUpgradeOptions(infrastructureType) {
        if (infrastructureType === 'highway') {
            return '<p class="no-upgrades">Highways cannot have upgrades.</p>';
        }

        const useRadios = infrastructureType === 'arterial_road';
        const inputType = useRadios ? 'radio' : 'checkbox';
        const inputName = useRadios ? 'arterial_upgrade' : 'upgrade';

        let html = '';

        // Add "None" option for arterial roads (radios)
        if (useRadios) {
            html += `
                <label>
                    <input type="radio" name="${inputName}" value="none" checked>
                    None
                </label>
            `;
        }

        html += `
            <label>
                <input type="${inputType}" name="${inputName}" value="sidewalks">
                Sidewalks (+$${this.INFRASTRUCTURE_COSTS.sidewalk_upgrade})
            </label>
            <label>
                <input type="${inputType}" name="${inputName}" value="bike_lanes">
                Bike Lanes (+$${this.INFRASTRUCTURE_COSTS.bike_lane_upgrade})
            </label>
        `;

        return html;
    }

    /**
     * Update upgrade options when infrastructure type changes
     */
    updateUpgradeOptions(infrastructureType) {
        const upgradeOptionsContainer = this.modal.querySelector('.upgrade-options');
        upgradeOptionsContainer.innerHTML = this.generateUpgradeOptions(infrastructureType);

        // Update compatibility note
        const note = this.modal.querySelector('.upgrade-compatibility-note');
        if (infrastructureType === 'arterial_road') {
            note.textContent = 'Arterial roads can have sidewalks OR bike lanes, but not both.';
        } else if (infrastructureType === 'highway') {
            note.textContent = 'Highways cannot have upgrades.';
        } else {
            note.textContent = 'Local roads can have both upgrades.';
        }

        // Re-attach event handlers for the new inputs
        this.attachUpgradeEventHandlers();
    }

    /**
     * Attach event handlers to upgrade inputs
     */
    attachUpgradeEventHandlers() {
        const upgradeInputs = this.modal.querySelectorAll('input[name="upgrade"], input[name="arterial_upgrade"]');
        upgradeInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.updateSelectedUpgrades();
                this.updateCostDisplay();
            });
        });
    }

    /**
     * Update the selected upgrades array based on current inputs
     */
    updateSelectedUpgrades() {
        this.modalState.selectedUpgrades = [];
        const upgradeInputs = this.modal.querySelectorAll('input[name="upgrade"]:checked, input[name="arterial_upgrade"]:checked');
        upgradeInputs.forEach(input => {
            if (input.value !== 'none') {
                this.modalState.selectedUpgrades.push(input.value);
            }
        });
    }

    /**
     * Create Add Stops tab content
     */
    createStopsTabContent() {
        return `
            <div class="mobility-tab-content" data-tab="stops" style="display: none;">
                <div class="stop-selection">
                    <h4>Transit Stop Type</h4>
                    <div class="stop-options">
                        <label>
                            <input type="radio" name="stop-type" value="bus_stop" checked>
                            Bus Stop 🚌 ($${this.INFRASTRUCTURE_COSTS.bus_stop})
                        </label>
                        <label>
                            <input type="radio" name="stop-type" value="subway_station">
                            Subway Station 🚇 ($${this.INFRASTRUCTURE_COSTS.subway_station})
                        </label>
                    </div>
                    <div class="stop-instructions">
                        <p>Click on built road segments to place stops</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create Connect tab content
     */
    createConnectTabContent() {
        return `
            <div class="mobility-tab-content" data-tab="connect" style="display: none;">
                <div class="connection-selection">
                    <h4>Route Type</h4>
                    <div class="route-options">
                        <label>
                            <input type="radio" name="route-type" value="bus_route" checked>
                            Bus Route (connects bus stops)
                        </label>
                        <label>
                            <input type="radio" name="route-type" value="subway_line">
                            Subway Line (connects subway stations)
                        </label>
                    </div>
                    <div class="connection-instructions">
                        <p>Select 2 or more stops of the same type to create a route</p>
                        <p>Opens Road Configuration sidebar for service settings</p>
                    </div>
                </div>

                <div class="selected-stops">
                    <h4>Selected Stops</h4>
                    <div id="selected-stops-list">
                        <p>No stops selected</p>
                    </div>
                    <button id="create-route" disabled>Create Route</button>
                </div>
            </div>
        `;
    }

    /**
     * Apply modal styling based on extracted CSS patterns
     */
    applyModalStyling(modal) {
        // Base modal styles from code analysis
        Object.assign(modal.style, {
            position: 'fixed',
            top: '20px',
            left: '20px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '16px',
            color: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            zIndex: '1000',
            minWidth: '300px',
            maxWidth: '400px'
        });

        // Add additional CSS rules via style element
        if (!document.getElementById('mobility-v2-styles')) {
            this.addMobilityStyles();
        }
    }

    /**
     * Add comprehensive mobility styles to document
     */
    addMobilityStyles() {
        const styles = document.createElement('style');
        styles.id = 'mobility-v2-styles';
        styles.textContent = `
            /* Mobility Modal Styles */
            .mobility-modal {
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            }

            .mobility-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid #333;
            }

            .mobility-header h3 {
                margin: 0;
                font-size: 14px;
                color: #ffffff;
            }

            .mobility-close {
                background: none;
                border: none;
                color: #888;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .mobility-close:hover {
                color: #ffffff;
            }

            /* Tab System */
            .mobility-tabs {
                display: flex;
                margin-bottom: 12px;
                gap: 2px;
            }

            .mobility-tab {
                background: #1a1a1a;
                border: 1px solid #333333;
                color: #ffffff;
                padding: 6px 12px;
                font-size: 11px;
                cursor: pointer;
                border-radius: 4px 4px 0 0;
                transition: background 0.2s;
            }

            .mobility-tab:hover {
                background: #2a2a3a;
            }

            .mobility-tab.active {
                background: #0066cc;
                border-color: #0066cc;
            }

            /* Tab Content */
            .mobility-tab-content h4 {
                margin: 0 0 8px 0;
                font-size: 12px;
                color: #cccccc;
            }

            .infrastructure-options,
            .upgrade-options,
            .stop-options,
            .route-options {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 12px;
            }

            .infrastructure-options label,
            .upgrade-options label,
            .stop-options label,
            .route-options label {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.2s;
            }

            .infrastructure-options label:hover,
            .upgrade-options label:hover,
            .stop-options label:hover,
            .route-options label:hover {
                background: rgba(255,255,255,0.1);
            }

            /* Cost Summary */
            .cost-summary {
                margin-top: 12px;
                padding-top: 8px;
                border-top: 1px solid #333;
            }

            .total-cost {
                font-weight: bold;
                font-size: 14px;
                color: #00ff88;
                text-align: center;
            }

            /* Upgrade compatibility note */
            .upgrade-compatibility-note {
                font-size: 10px;
                color: #888;
                margin-top: 4px;
                min-height: 12px;
            }

            /* Instructions */
            .stop-instructions p,
            .connection-instructions p {
                margin: 4px 0;
                font-size: 10px;
                color: #888;
                font-style: italic;
            }

            /* Selected stops */
            .selected-stops {
                margin-top: 12px;
                padding-top: 8px;
                border-top: 1px solid #333;
            }

            #selected-stops-list {
                background: #0f0f1a;
                border: 1px solid #333;
                padding: 8px;
                margin: 8px 0;
                min-height: 60px;
                border-radius: 4px;
                font-size: 10px;
            }

            #create-route {
                width: 100%;
                background: #0066cc;
                border: none;
                color: white;
                padding: 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
            }

            #create-route:disabled {
                background: #333;
                cursor: not-allowed;
            }

            /* Segment cost indicator styles */
            .segment-cost-indicator {
                position: absolute;
                background: rgba(0,0,0,0.9);
                color: #00ff88;
                padding: 2px 6px;
                font-size: 10px;
                border-radius: 3px;
                pointer-events: none;
                font-weight: bold;
                border: 1px solid #00ff88;
                white-space: nowrap;
            }

            .segment-highlight {
                outline: 2px solid #0066cc;
                background: rgba(0, 102, 204, 0.2);
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Setup event handlers for modal interactions
     */
    setupEventHandlers() {
        // Wait for modal to be created
        if (!this.modal) return;

        // Tab switching
        const tabs = this.modal.querySelectorAll('.mobility-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Close modal
        const closeBtn = this.modal.querySelector('.mobility-close');
        closeBtn.addEventListener('click', () => {
            this.hide();
        });

        // Infrastructure selection
        const infraInputs = this.modal.querySelectorAll('input[name="infrastructure"]');
        infraInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.modalState.selectedInfrastructure = e.target.value;
                this.updateUpgradeOptions(e.target.value);
                this.updateCostDisplay();
            });
        });

        // Initialize upgrade options for the default selection
        this.updateUpgradeOptions(this.modalState.selectedInfrastructure);

        // Canvas interaction handlers
        this.setupCanvasHandlers();
    }

    /**
     * Setup canvas event handlers for segment interaction
     */
    setupCanvasHandlers() {
        const canvas = this.game.canvas;

        // Mouse move for segment highlighting
        canvas.addEventListener('mousemove', (e) => {
            if (!this.isActive) return;

            // For sub-parcel system, we don't need complex hover detection
            // Let the game's normal hover detection work for parcels
            // Sub-parcel hover can be added later if needed
        });

        // Click for construction
        canvas.addEventListener('click', (e) => {
            if (!this.isActive) return;

            // Convert screen coordinates to sub-parcel coordinates
            const subParcelCoords = this.screenToSubParcel(e.offsetX, e.offsetY);

            console.log('🔧 DIAGNOSTIC: Canvas click in mobility mode', {
                isActive: this.isActive,
                clickCoords: { x: e.offsetX, y: e.offsetY },
                subParcelCoords: subParcelCoords
            });

            if (!subParcelCoords) {
                console.log('Click outside valid sub-parcel area');
                return;
            }

            // Check if it's a valid road location
            if (!this.isValidRoadSubParcel(subParcelCoords.row, subParcelCoords.col)) {
                console.log('Invalid road location - not on parcel boundary');
                return;
            }

            console.log('🔧 DIAGNOSTIC: Calling constructInfrastructure...');
            this.constructInfrastructure(subParcelCoords);
        });
    }

    /**
     * Switch active tab and update UI
     */
    switchTab(tabName) {
        // Update modal state
        this.modalState.activeTab = tabName;

        // Update tab buttons
        const tabs = this.modal.querySelectorAll('.mobility-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content visibility
        const contents = this.modal.querySelectorAll('.mobility-tab-content');
        contents.forEach(content => {
            const isActive = content.dataset.tab === tabName;
            content.style.display = isActive ? 'block' : 'none';
            content.classList.toggle('active', isActive);
        });
    }



    /**
     * Update cost display based on current selections
     */
    updateCostDisplay() {
        const baseCost = this.INFRASTRUCTURE_COSTS[this.modalState.selectedInfrastructure];
        let upgradeCost = 0;

        this.modalState.selectedUpgrades.forEach(upgrade => {
            if (upgrade === 'sidewalks') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.sidewalk_upgrade;
            } else if (upgrade === 'bike_lanes') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.bike_lane_upgrade;
            }
        });

        const totalCost = baseCost + upgradeCost;

        const costElement = this.modal.querySelector('#mobility-total-cost');
        if (costElement) {
            costElement.textContent = totalCost;
        }
    }

    /**
     * Update hovered segment and visual indicators
     */
    updateHoveredSegment(segment) {
        // Clear previous highlight
        if (this.modalState.hoveredSegment) {
            this.clearSegmentHighlight(this.modalState.hoveredSegment);
        }

        this.modalState.hoveredSegment = segment;

        if (segment) {
            console.log('🎯 Hovering over segment:', segment.key, 'type:', segment.type);
            this.highlightSegment(segment);
            this.showCostIndicator(segment);
        } else if (this.modalState.hoveredSegment === null) {
            // Only log when transitioning from segment to no segment
            console.log('🎯 No segment hovered');
        }
    }

    /**
     * Highlight a road segment (triggers re-render)
     */
    highlightSegment(segment) {
        // The visual highlighting is handled by renderSegmentInteraction()
        // Just trigger a re-render to show the highlight
        this.requestRender();
    }

    /**
     * Clear segment highlight (triggers re-render)
     */
    clearSegmentHighlight(segment) {
        // The visual clearing is handled by renderSegmentInteraction()
        // Just trigger a re-render to clear the highlight
        this.requestRender();
    }

    /**
     * Show cost indicator for segment (triggers re-render)
     */
    showCostIndicator(segment) {
        // The cost indicator is rendered by renderSegmentInteraction()
        // Just trigger a re-render to show the cost
        this.requestRender();
    }

    /**
     * Calculate cost for building on a specific segment
     */
    calculateSegmentCost(segment) {
        // Check if segment already has infrastructure
        const existing = this.roadSegments.get(segment);

        if (!existing) {
            // New construction - base + upgrades
            return this.getCurrentSelectionCost();
        } else {
            // Upgrade or replacement
            if (this.isUpgrade(existing)) {
                return this.getUpgradeCost(existing);
            } else {
                // Replacement - removal cost + new cost
                const removalCost = this.getInfrastructureValue(existing);
                const newCost = this.getCurrentSelectionCost();
                return removalCost + newCost;
            }
        }
    }

    /**
     * Get current selection total cost
     */
    getCurrentSelectionCost() {
        const baseCost = this.INFRASTRUCTURE_COSTS[this.modalState.selectedInfrastructure];
        let upgradeCost = 0;

        this.modalState.selectedUpgrades.forEach(upgrade => {
            if (upgrade === 'sidewalks') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.sidewalk_upgrade;
            } else if (upgrade === 'bike_lanes') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.bike_lane_upgrade;
            }
        });

        return baseCost + upgradeCost;
    }

    /**
     * Check if current selection is an upgrade to existing infrastructure
     */
    isUpgrade(existingSegment) {
        // If same base type and only adding upgrades, it's an upgrade
        return existingSegment.type === this.modalState.selectedInfrastructure &&
               this.modalState.selectedUpgrades.length > 0;
    }

    /**
     * Get upgrade cost for existing segment
     */
    getUpgradeCost(existingSegment) {
        let cost = 0;

        this.modalState.selectedUpgrades.forEach(upgrade => {
            if (!existingSegment.upgrades.includes(upgrade)) {
                if (upgrade === 'sidewalks') {
                    cost += this.INFRASTRUCTURE_COSTS.sidewalk_upgrade;
                } else if (upgrade === 'bike_lanes') {
                    cost += this.INFRASTRUCTURE_COSTS.bike_lane_upgrade;
                }
            }
        });

        return cost;
    }

    /**
     * Get total value of existing infrastructure (for replacement cost)
     */
    getInfrastructureValue(segment) {
        let value = this.INFRASTRUCTURE_COSTS[segment.type];

        segment.upgrades.forEach(upgrade => {
            if (upgrade === 'sidewalks') {
                value += this.INFRASTRUCTURE_COSTS.sidewalk_upgrade;
            } else if (upgrade === 'bike_lanes') {
                value += this.INFRASTRUCTURE_COSTS.bike_lane_upgrade;
            }
        });

        return value;
    }

    /**
     * Request render update from rendering system
     */
    requestRender() {
        if (this.game.renderingSystem) {
            this.game.renderingSystem.scheduleRender();
        }
    }

    /**
     * Show mobility layer and modal
     */
    show() {
        this.isActive = true;
        this.modal.style.display = 'block';

        // Set current layer for tooltip system integration
        this.game.currentLayer = 'mobility';

        // Reset to roads tab
        this.switchTab('roads');
        this.updateUpgradeOptions(this.modalState.selectedInfrastructure);
        this.updateCostDisplay();

        console.log('Mobility Layer v2 activated');
    }

    /**
     * Hide mobility layer and modal
     */
    hide() {
        this.isActive = false;
        this.modal.style.display = 'none';

        // Note: currentLayer management is handled by MobilityV2Integration

        // Clear any segment highlights
        if (this.modalState.hoveredSegment) {
            this.clearSegmentHighlight(this.modalState.hoveredSegment);
            this.modalState.hoveredSegment = null;
        }

        console.log('Mobility Layer v2 deactivated');
    }

    /**
     * Toggle mobility layer visibility
     */
    toggle() {
        if (this.isActive) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Get current infrastructure data for economic engine
     */
    getInfrastructureData() {
        return {
            roadSegments: Array.from(this.roadSegments.entries()).map(([id, data]) => ({
                id,
                ...data
            })),
            transitStops: Array.from(this.transitStops.entries()).map(([id, data]) => ({
                id,
                ...data
            })),
            transitLines: [...this.transitLines]
        };
    }

    /**
     * Update infrastructure from server (for multiplayer sync)
     */
    updateFromServer(infrastructureData) {
        // Clear current data
        this.roadSegments.clear();
        this.transitStops.clear();
        this.transitLines.length = 0;

        // Update with server data
        infrastructureData.roadSegments?.forEach(segment => {
            this.roadSegments.set(segment.id, segment);
        });

        infrastructureData.transitStops?.forEach(stop => {
            this.transitStops.set(stop.id, stop);
        });

        this.transitLines.push(...(infrastructureData.transitLines || []));

        // Request render update
        this.requestRender();
    }

    // ===========================================
    // LEGACY COMPATIBILITY METHODS
    // These methods maintain compatibility with existing game.js code
    // ===========================================

    /**
     * Handle mouse move events - like mobility v1 integration with game.js
     */
    handleMouseMove(worldX, worldY) {
        if (!this.isActive) return false;

        let needsRedraw = false;

        // Find closest edge using mobility v1's approach
        let closestEdge = null;
        let closestDistance = Math.max(this.game.renderingSystem.tileWidth * 0.6, 30);

        // Check all possible edges between adjacent intersections
        this.intersections.forEach(intersection => {
            const { row, col } = intersection;

            // Check edges to adjacent intersections (like mobility v1)
            const neighbors = [
                { row: row - 1, col },     // North
                { row: row + 1, col },     // South
                { row, col: col - 1 },     // West
                { row, col: col + 1 }      // East
            ];

            neighbors.forEach(neighbor => {
                if (neighbor.row >= 0 && neighbor.row <= this.game.gridSize &&
                    neighbor.col >= 0 && neighbor.col <= this.game.gridSize) {

                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    const neighborIntersection = this.intersections.get(neighborKey);

                    if (neighborIntersection) {
                        // Calculate distance from mouse to edge MIDPOINT (like mobility v1)
                        const midX = (intersection.x + neighborIntersection.x) / 2;
                        const midY = (intersection.y + neighborIntersection.y) / 2;
                        const dist = Math.sqrt(Math.pow(worldX - midX, 2) + Math.pow(worldY - midY, 2));

                        if (dist < closestDistance) {
                            closestDistance = dist;
                            closestEdge = {
                                from: intersection,
                                to: neighborIntersection,
                                type: 'road_segment',
                                key: this.getSegmentKey(row, col, neighbor.row, neighbor.col)
                            };
                        }
                    }
                }
            });
        });

        if (this.modalState.hoveredSegment !== closestEdge) {
            this.updateHoveredSegment(closestEdge);
            needsRedraw = true;
        }

        return needsRedraw;
    }

    /**
     * Construct infrastructure at the specified sub-parcel
     */
    constructInfrastructure(subParcelCoords) {
        console.log('🔧 DIAGNOSTIC: v2 constructInfrastructure called', {
            subParcelCoords: subParcelCoords,
            isActive: this.isActive
        });

        if (!subParcelCoords || typeof subParcelCoords.row === 'undefined' || typeof subParcelCoords.col === 'undefined') {
            console.log('Invalid sub-parcel coordinates');
            return false;
        }

        // Validate this is a valid road location
        if (!this.isValidRoadSubParcel(subParcelCoords.row, subParcelCoords.col)) {
            console.log('Invalid road location - not on parcel boundary');
            return false;
        }

        // Get current selection from modal state
        const infrastructureType = this.modalState.selectedInfrastructure;
        const upgrades = this.modalState.selectedUpgrades || [];

        const subParcelKey = `${subParcelCoords.row},${subParcelCoords.col}`;

        console.log('🔧 DIAGNOSTIC: Building road', {
            type: infrastructureType,
            upgrades: upgrades,
            subParcelKey: subParcelKey
        });

        // Calculate total cost
        const baseCost = this.INFRASTRUCTURE_COSTS[infrastructureType] || 20;
        let totalCost = baseCost;

        // Add upgrade costs
        upgrades.forEach(upgrade => {
            if (this.INFRASTRUCTURE_COSTS[upgrade]) {
                totalCost += this.INFRASTRUCTURE_COSTS[upgrade];
            }
        });

        // Check if player can afford it
        if (this.game.cashManager && !this.game.cashManager.canAfford(totalCost)) {
            console.log(`Cannot afford $${totalCost} for ${infrastructureType}`);
            return false;
        }

        // Deduct cost from cash
        if (this.game.cashManager) {
            this.game.cashManager.spend(totalCost, 'Road construction');
        }

        // Create road data
        const roadData = {
            type: infrastructureType,
            upgrades: upgrades,
            cost: totalCost,
            timestamp: Date.now(),
            row: subParcelCoords.row,
            col: subParcelCoords.col
        };

        // Store in sub-parcel roads Map
        this.subParcelRoads.set(subParcelKey, roadData);

        // Trigger re-render
        this.requestRender();

        console.log(`Built ${infrastructureType} at sub-parcel ${subParcelKey} for $${totalCost}`);
        console.log(`Roads in system: ${this.subParcelRoads.size}`);
        return true;
    }

    /**
     * Legacy compatibility: Handle enhanced click events
     */
    handleClickEnhanced(e) {
        if (!this.isActive || !this.modalState.hoveredSegment) return;

        return this.constructInfrastructure(this.modalState.hoveredSegment);
    }

    /**
     * Main render method called by RenderingSystem when currentLayer === 'mobility'
     * This completely replaces the normal scene rendering
     */
    render(ctx) {
        if (!this.isActive || !ctx) return;

        const renderingSystem = this.game.renderingSystem;
        if (!renderingSystem) return;

        // Diagnostic logging for every render call
        if (!this._hasLoggedRender) {
            console.log('🔧 DIAGNOSTIC: MobilityLayerV2.render() called');
            console.log('🔧 DIAGNOSTIC: isActive =', this.isActive);
            console.log('🔧 DIAGNOSTIC: ctx available =', !!ctx);
            console.log('🔧 DIAGNOSTIC: renderingSystem available =', !!renderingSystem);
            this._hasLoggedRender = true;
        }

        // Handle window resize if canvas size changed
        this.handleCanvasSizeChange(ctx);

        // Clear entire canvas with dark background exactly like mobility v1
        ctx.fillStyle = '#1a201d'; // Same dark sage green as mobility v1
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Apply camera transformations
        ctx.save();
        ctx.translate(this.game.panOffset.x, this.game.panOffset.y);
        ctx.scale(this.game.zoomScale, this.game.zoomScale);

        // Draw sub-parcel grid background
        this.drawSubParcelGrid(ctx);

        // Render all visible parcels in shrunken form (60% size, centered)
        for (let row = 0; row < this.VISIBLE_GRID_SIZE; row++) {
            for (let col = 0; col < this.VISIBLE_GRID_SIZE; col++) {
                this.renderShrunkParcel(ctx, renderingSystem, row, col);
            }
        }

        // Render existing road segments
        this.renderRoadSegments(ctx);

        // TODO: Add sub-parcel hover indicators if needed

        ctx.restore();

        // Log occasionally for debugging
        if (Date.now() - (this._lastRenderLog || 0) > 2000) {
            console.log('🎨 MobilityLayerV2 complete scene rendering active');
            console.log('🔧 Sub-parcel roads count:', this.subParcelRoads.size);
            console.log('🔧 DIAGNOSTIC: subParcelRoads Map contents:', Array.from(this.subParcelRoads.entries()));
            console.log('🔧 Sub-parcel calculation:', {
                visibleGridSize: this.VISIBLE_GRID_SIZE,
                subParcelGridSize: this.SUB_PARCEL_GRID_SIZE,
                subParcelTileWidth: this.game.canvas.width / this.SUB_PARCEL_GRID_SIZE
            });
            this._lastRenderLog = Date.now();
        }
    }

    /**
     * Handle canvas size changes and maintain grid alignment
     */
    handleCanvasSizeChange(ctx) {
        // Check if canvas size changed
        const currentWidth = ctx.canvas.width;
        const currentHeight = ctx.canvas.height;

        if (this.lastCanvasWidth !== currentWidth || this.lastCanvasHeight !== currentHeight) {
            console.log(`🔄 Mobility Layer: Canvas resized from ${this.lastCanvasWidth}x${this.lastCanvasHeight} to ${currentWidth}x${currentHeight}`);

            // Update stored canvas dimensions
            this.lastCanvasWidth = currentWidth;
            this.lastCanvasHeight = currentHeight;

            // Clear cached intersections to rebuild with new dimensions
            this.intersections.clear();
            this.intersectionsBuilt = false;

            // Rebuild intersections for new canvas size
            this.buildIntersections();

            console.log('✅ Mobility Layer: Grid alignment maintained after resize');
        }
    }

    /**
     * Draw mobility grid background like mobility v1
     */
    drawMobilityGrid(ctx, renderingSystem) {
        // Draw unimproved streets as gray background areas where no roads exist
        // Following mobility v1's exact approach
        ctx.fillStyle = '#808080'; // Same toned down gray as mobility v1

        this.intersections.forEach(intersection => {
            const { row, col } = intersection;

            // Check segments to adjacent intersections (like mobility v1)
            const neighbors = [
                { row: row - 1, col },     // North
                { row: row + 1, col },     // South
                { row, col: col - 1 },     // West
                { row, col: col + 1 }      // East
            ];

            neighbors.forEach(neighbor => {
                if (neighbor.row >= 0 && neighbor.row <= this.game.gridSize &&
                    neighbor.col >= 0 && neighbor.col <= this.game.gridSize) {

                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    const neighborIntersection = this.intersections.get(neighborKey);

                    if (neighborIntersection) {
                        // Check if this segment has a road built
                        const segmentKey = this.getSegmentKey(row, col, neighbor.row, neighbor.col);
                        const hasRoad = this.roadSegments.has(segmentKey);

                        // Only draw gray fill for unimproved (roadless) segments
                        if (!hasRoad) {
                            this.drawUnimprovedSegment(ctx, intersection, neighborIntersection);
                        }
                    }
                }
            });
        });
    }

    /**
     * Draw gray background for unimproved road segment
     */
    drawUnimprovedSegment(ctx, fromIntersection, toIntersection) {
        const tileWidth = this.game.renderingSystem.tileWidth;
        const shrunkParcelWidth = tileWidth * this.parcelShrinkFactor;
        const roadWidth = tileWidth - shrunkParcelWidth; // Exact corridor space = road width

        ctx.save();
        ctx.strokeStyle = '#808080'; // Same gray as mobility v1
        ctx.lineWidth = roadWidth;
        ctx.lineCap = 'butt'; // Squared ends like the indicator

        ctx.beginPath();
        ctx.moveTo(fromIntersection.x, fromIntersection.y);
        ctx.lineTo(toIntersection.x, toIntersection.y);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Render all built road segments
     */
    renderRoadSegments(ctx) {
        console.log('🔧 DIAGNOSTIC: renderRoadSegments called, count =', this.subParcelRoads.size);

        if (this.subParcelRoads.size === 0) return;

        const renderingSystem = this.game.renderingSystem;
        if (!renderingSystem) return;

        // Calculate the size of each sub-parcel in the isometric view
        const subParcelTileWidth = renderingSystem.tileWidth / this.SUB_PARCELS_PER_PARCEL;
        const subParcelTileHeight = renderingSystem.tileHeight / this.SUB_PARCELS_PER_PARCEL;

        // Iterate through all built sub-parcel roads
        this.subParcelRoads.forEach((roadData, subParcelKey) => {
            console.log('🔧 DIAGNOSTIC: Rendering sub-parcel road', {
                key: subParcelKey,
                data: roadData
            });

            const subRow = roadData.row;
            const subCol = roadData.col;

            // Convert sub-parcel coordinates to isometric position
            const subParcelGridX = subCol / this.SUB_PARCELS_PER_PARCEL;
            const subParcelGridY = subRow / this.SUB_PARCELS_PER_PARCEL;
            const iso = renderingSystem.toIsometric(subParcelGridX, subParcelGridY);

            ctx.save();

            // Set fill color based on road type
            const roadColors = {
                local_road: '#606060',    // Dark gray for local roads
                arterial_road: '#505050', // Darker gray for arterial
                highway: '#404040'        // Darkest gray for highways
            };
            ctx.fillStyle = roadColors[roadData.type] || '#606060';

            // Draw the sub-parcel road as an isometric diamond/parallelogram
            // that fits in the space vacated by shrunken parcels
            const corridorWidth = renderingSystem.tileWidth * (1 - this.parcelShrinkFactor);

            // Calculate the four corners of the isometric sub-parcel
            const halfWidth = corridorWidth / 2;
            const halfHeight = corridorWidth / 4; // Isometric height ratio

            ctx.beginPath();
            ctx.moveTo(iso.x, iso.y - halfHeight); // Top
            ctx.lineTo(iso.x + halfWidth, iso.y);  // Right
            ctx.lineTo(iso.x, iso.y + halfHeight); // Bottom
            ctx.lineTo(iso.x - halfWidth, iso.y);  // Left
            ctx.closePath();
            ctx.fill();

            // Add upgrade visual indicators
            if (roadData.upgrades?.includes('sidewalk_upgrade')) {
                ctx.strokeStyle = '#888888'; // Lighter gray for sidewalks
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            if (roadData.upgrades?.includes('bike_lane_upgrade')) {
                ctx.fillStyle = '#88aa44'; // Green for bike lanes
                ctx.beginPath();
                ctx.moveTo(iso.x, iso.y - halfHeight/2);
                ctx.lineTo(iso.x + halfWidth/2, iso.y);
                ctx.lineTo(iso.x, iso.y + halfHeight/2);
                ctx.lineTo(iso.x - halfWidth/2, iso.y);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        });
    }


    /**
     * Get segment key for road storage (like mobility v1's getEdgeKey)
     */
    getSegmentKey(row1, col1, row2, col2) {
        // Ensure consistent ordering like mobility v1
        if (row1 > row2 || (row1 === row2 && col1 > col2)) {
            return `${row2},${col2}-${row1},${col1}`;
        }
        return `${row1},${col1}-${row2},${col2}`;
    }

    /**
     * Build intersection system like mobility v1
     * Intersections are positioned at grid corners between parcels
     */
    buildIntersections() {
        if (this.intersectionsBuilt) return;

        this.intersections.clear();
        const renderingSystem = this.game.renderingSystem;

        // Build intersections at grid corners where parcel edges meet
        // These should align with the visual gridlines between parcels
        for (let row = 0; row <= this.game.gridSize; row++) {
            for (let col = 0; col <= this.game.gridSize; col++) {
                const key = `${row},${col}`;

                // Calculate intersection position at parcel corner, not center
                // Offset by half-tile to position at parcel boundaries
                const baseIso = renderingSystem.toIsometric(col - 0.5, row - 0.5);

                this.intersections.set(key, {
                    row: row,
                    col: col,
                    x: baseIso.x,
                    y: baseIso.y - renderingSystem.tileHeight / 2,
                    key: key
                });
            }
        }

        this.intersectionsBuilt = true;
        console.log(`🔗 Built ${this.intersections.size} intersections for Mobility v2`);
    }

    /**
     * Get road segment at mouse position (like mobility v1)
     */
    getSegmentAtPosition(x, y) {
        if (!this.intersectionsBuilt) {
            this.buildIntersections();
        }

        // Convert screen coordinates to world coordinates
        const worldX = (x - this.game.panOffset.x) / this.game.zoomScale;
        const worldY = (y - this.game.panOffset.y) / this.game.zoomScale;

        // Check all possible road segments between adjacent intersections
        // Use the exact corridor space between shrunken parcels for mathematically precise selection
        const tileWidth = this.game.renderingSystem.tileWidth;
        const shrunkParcelWidth = tileWidth * this.parcelShrinkFactor;
        const corridorSpace = tileWidth - shrunkParcelWidth; // Exact space between parcels = road width
        const tolerance = Math.max(corridorSpace, 30);

        for (const [key, intersection] of this.intersections.entries()) {
            const { row, col } = intersection;

            // Check horizontal segment (to the right)
            if (col < this.game.gridSize) {
                const rightKey = `${row},${col + 1}`;
                const rightIntersection = this.intersections.get(rightKey);
                if (rightIntersection) {
                    const distance = this.distanceToLineSegment(
                        worldX, worldY,
                        intersection.x, intersection.y,
                        rightIntersection.x, rightIntersection.y
                    );

                    if (distance < tolerance) {
                        return {
                            from: intersection,
                            to: rightIntersection,
                            type: 'horizontal',
                            key: `${key}-${rightKey}`
                        };
                    }
                }
            }

            // Check vertical segment (downward)
            if (row < this.game.gridSize) {
                const downKey = `${row + 1},${col}`;
                const downIntersection = this.intersections.get(downKey);
                if (downIntersection) {
                    const distance = this.distanceToLineSegment(
                        worldX, worldY,
                        intersection.x, intersection.y,
                        downIntersection.x, downIntersection.y
                    );

                    if (distance < tolerance) {
                        return {
                            from: intersection,
                            to: downIntersection,
                            type: 'vertical',
                            key: `${key}-${downKey}`
                        };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Calculate distance from point to line segment
     */
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));

        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    /**
     * Render existing road segments
     */
    renderRoadSegments(ctx) {
        // Render built road segments from our infrastructure map
        if (!this.infrastructure || this.infrastructure.size === 0) {
            // No roads built yet
            return;
        }

        for (const [segmentKey, segments] of this.infrastructure.entries()) {
            if (segments && segments.length > 0) {
                // Each segment has type, edge, upgrades
                const segment = segments[0]; // Take first segment for this key

                // Parse segment key to get row,col coordinates
                const coords = segmentKey.split(',').map(Number);
                if (coords.length >= 2) {
                    const [row, col] = coords;

                    // Get isometric position for this parcel
                    const iso = this.game.renderingSystem.toIsometric(col, row);

                    // Render road segment based on its type and edge
                    this.renderSingleRoadSegment(ctx, iso.x, iso.y - this.game.renderingSystem.tileHeight / 2, segment);
                }
            }
        }
    }

    /**
     * Render a single road segment with proper styling
     */
    renderSingleRoadSegment(ctx, x, y, segment) {
        if (!segment || !segment.type) return;

        ctx.save();
        ctx.translate(x, y);

        // Basic road rendering for now
        const availableSpace = this.game.renderingSystem.tileWidth * (1 - this.parcelShrinkFactor);
        const roadWidth = availableSpace * 0.6;

        // Get road color based on type
        let roadColor = '#666666'; // Default gray
        if (segment.type === 'local_road') roadColor = '#666666';
        else if (segment.type === 'arterial_road') roadColor = '#888888';
        else if (segment.type === 'highway') roadColor = '#aaaaaa';

        // Draw road segment
        ctx.strokeStyle = roadColor;
        ctx.lineWidth = roadWidth;
        ctx.lineCap = 'round';

        // Draw based on edge direction
        ctx.beginPath();
        const halfTile = this.game.renderingSystem.tileWidth / 2;
        const quarterTile = this.game.renderingSystem.tileHeight / 4;

        if (segment.edge === 'north') {
            ctx.moveTo(0, -quarterTile);
            ctx.lineTo(0, 0);
        } else if (segment.edge === 'south') {
            ctx.moveTo(0, 0);
            ctx.lineTo(0, quarterTile);
        } else if (segment.edge === 'east') {
            ctx.moveTo(0, 0);
            ctx.lineTo(halfTile, 0);
        } else if (segment.edge === 'west') {
            ctx.moveTo(-halfTile, 0);
            ctx.lineTo(0, 0);
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Calculate isometric road shape - exact copy from mobility v1
     */
    calculateIsometricRoadShape(from, to, width) {
        // Calculate road shape that aligns with the isometric grid's inherent angles
        // Roads must "lay flat" following the grid's natural perspective

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return null;

        // Determine if this is a horizontal or vertical grid connection
        // In isometric view: NE/SW has positive dx*dy, NW/SE has negative dx*dy
        const isHorizontalGrid = (dx * dy) > 0;

        // Use proper isometric perpendiculars for equal visual width
        let perpX, perpY;

        if (isHorizontalGrid) {
            // For horizontal grid lines (NE/SW) - WORKING CORRECTLY
            perpX = -0.866;
            perpY = 0.5;
        } else {
            // For vertical grid lines (NW/SE) - use GRID-ALIGNED direction like horizontal
            // Horizontal uses (-cos(30°), sin(30°)) = (-0.866, 0.5) and aligns perfectly
            // Vertical should use the mirror grid direction: (cos(30°), sin(30°))
            perpX = 0.866;  // cos(30°) - grid-aligned direction
            perpY = 0.5;    // sin(30°) - grid-aligned direction
        }

        // Calculate the four corners using grid-aligned perpendiculars
        const halfWidth = width / 2;

        return {
            // Parallelogram corners extending exactly to intersection gridlines
            p1: { x: from.x + perpX * halfWidth, y: from.y + perpY * halfWidth },
            p2: { x: from.x - perpX * halfWidth, y: from.y - perpY * halfWidth },
            p3: { x: to.x - perpX * halfWidth, y: to.y - perpY * halfWidth },
            p4: { x: to.x + perpX * halfWidth, y: to.y + perpY * halfWidth },
            // Helper data
            from, to, width, length,
            direction: { x: dx / length, y: dy / length },
            perpendicular: { x: perpX, y: perpY },
            isHorizontalGrid
        };
    }

    /**
     * Render segment interaction indicators (hover effects)
     */
    renderSegmentInteraction(ctx) {
        if (!this.modalState.hoveredSegment) return;

        const segment = this.modalState.hoveredSegment;

        // Get intersection positions using the same logic as mobility v1
        const fromIntersection = this.intersections.get(`${segment.from.row},${segment.from.col}`);
        const toIntersection = this.intersections.get(`${segment.to.row},${segment.to.col}`);

        if (!fromIntersection || !toIntersection) return;

        // Calculate road width mathematically: the exact space between shrunken parcel edges
        const tileWidth = this.game.renderingSystem.tileWidth;
        const shrunkParcelWidth = tileWidth * this.parcelShrinkFactor; // 60% of tile
        const corridorSpace = tileWidth - shrunkParcelWidth; // 40% of tile = corridor width
        let roadWidth = corridorSpace; // Exactly fill the corridor between parcels

        // Adjust width for selected infrastructure (same as v1)
        if (this.modalState.selectedUpgrades.includes('sidewalk_upgrade')) roadWidth += 4;
        if (this.modalState.selectedUpgrades.includes('bike_lane_upgrade')) roadWidth += 6;

        // Calculate exact isometric road shape using v1's method
        const roadShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, roadWidth);

        if (!roadShape) return;

        ctx.save();

        // Check if road already exists
        const hasRoad = this.roadSegments.has(segment.key);

        if (hasRoad) {
            // Orange overlay for existing roads (like v1)
            ctx.fillStyle = 'rgba(255, 150, 0, 0.4)';
            ctx.strokeStyle = 'rgba(255, 150, 0, 0.8)';
        } else {
            // Blue preview for new roads (like v1)
            ctx.fillStyle = 'rgba(100, 150, 255, 0.4)';
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)';
        }

        ctx.lineWidth = 1;

        // Draw the exact isometric road shape (parallelogram from intersection to intersection)
        ctx.beginPath();
        ctx.moveTo(roadShape.p1.x, roadShape.p1.y);
        ctx.lineTo(roadShape.p2.x, roadShape.p2.y);
        ctx.lineTo(roadShape.p3.x, roadShape.p3.y);
        ctx.lineTo(roadShape.p4.x, roadShape.p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Draw cost indicator in center like v1
        const centerX = (fromIntersection.x + toIntersection.x) / 2;
        const centerY = (fromIntersection.y + toIntersection.y) / 2;
        const cost = this.getCurrentSelectionCost();
        this.drawCostIndicator(ctx, centerX + 20, centerY - 20, cost);
    }

    /**
     * Draw cost indicator like mobility v1
     */
    drawCostIndicator(ctx, x, y, cost) {
        ctx.save();

        // Background box (smaller and location aware like v1)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - 15, y - 8, 30, 16);

        // White text, smaller font like v1
        ctx.fillStyle = 'white';
        ctx.font = '10px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`$${cost}`, x, y);

        ctx.restore();
    }

    /**
     * Calculate the cost for the currently selected segment and upgrades
     */
    calculateSegmentCost() {
        const baseCost = this.INFRASTRUCTURE_COSTS[this.modalState.selectedInfrastructure];
        let upgradeCost = 0;

        this.modalState.selectedUpgrades.forEach(upgrade => {
            if (upgrade === 'sidewalks') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.sidewalk_upgrade;
            } else if (upgrade === 'bike_lanes') {
                upgradeCost += this.INFRASTRUCTURE_COSTS.bike_lane_upgrade;
            }
        });

        return baseCost + upgradeCost;
    }

    /**
     * Render a single shrunken parcel (called from main render loop)
     */
    renderShrunkParcel(ctx, renderingSystem, row, col) {
        const parcel = this.game.grid[row][col];

        // Get isometric position using the rendering system's method
        const iso = renderingSystem.toIsometric(col, row);
        const adjustedY = iso.y - renderingSystem.tileHeight / 2;

        ctx.save();
        ctx.translate(iso.x, adjustedY);

        // Calculate shrunken dimensions (60% of original)
        const shrunkWidth = renderingSystem.tileWidth * this.parcelShrinkFactor;
        const shrunkHeight = renderingSystem.tileHeight * this.parcelShrinkFactor;

        // Draw shrunken parcel shape
        this.drawShrunkParcelShape(ctx, parcel, shrunkWidth, shrunkHeight);

        // Draw building if present (also shrunken)
        if (parcel && parcel.building) {
            // Use rendering system's building drawing method but scaled down
            const shrinkFactor = this.parcelShrinkFactor;
            ctx.save();
            ctx.scale(shrinkFactor, shrinkFactor);

            // Call the rendering system's building drawing method if available
            if (typeof renderingSystem.drawBuilding === 'function') {
                renderingSystem.drawBuilding(parcel.building, 0, -shrunkHeight / (4 * shrinkFactor), row, col, parcel);
            }
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Draw the shrunken parcel shape (diamond)
     */
    drawShrunkParcelShape(ctx, parcel, width, height) {
        const halfW = width / 2;
        const halfH = height / 2;

        // Get appropriate parcel color
        let fillColor = this.getParcelColor(parcel);

        ctx.save();

        // Draw perfect diamond shape (4 straight edges to 4 points)
        ctx.beginPath();
        ctx.moveTo(0, -halfH);        // Top
        ctx.lineTo(halfW, 0);         // Right
        ctx.lineTo(0, halfH);         // Bottom
        ctx.lineTo(-halfW, 0);        // Left
        ctx.closePath();

        // Fill with appropriate color
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Subtle border for definition
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Get appropriate color for parcel in mobility view
     */
    getParcelColor(parcel) {
        // Default to dark gray
        if (!parcel) return 'rgba(60, 60, 60, 0.8)';

        // Color based on building if present
        if (parcel.building && this.game.buildingManager) {
            const building = this.game.buildingManager.getBuildingById(parcel.building);
            if (building) {
                return this.getBuildingColor(building);
            }
        }

        // Color based on terrain type
        if (parcel.terrain) {
            const terrainColors = {
                grass: 'rgba(34, 139, 34, 0.6)',      // Dark green
                water: 'rgba(25, 25, 112, 0.8)',      // Dark blue
                forest: 'rgba(0, 100, 0, 0.7)',       // Very dark green
                mountain: 'rgba(105, 105, 105, 0.8)'  // Dark gray
            };
            if (terrainColors[parcel.terrain]) {
                return terrainColors[parcel.terrain];
            }
        }

        // Color based on ownership
        if (parcel.owner) {
            return 'rgba(100, 100, 150, 0.6)'; // Slightly blue for owned
        }

        return 'rgba(60, 60, 60, 0.8)'; // Default dark gray
    }

    /**
     * Get building-based color (dimmed for mobility view)
     */
    getBuildingColor(building) {
        if (!building.name) return 'rgba(60, 60, 60, 0.8)';

        const name = building.name.toLowerCase();

        // Residential buildings - blue
        if (name.includes('house') || name.includes('apartment') || name.includes('residential')) {
            return 'rgba(59, 130, 246, 0.6)';
        }

        // Commercial buildings - yellow
        if (name.includes('shop') || name.includes('store') || name.includes('market') || name.includes('commercial')) {
            return 'rgba(251, 191, 36, 0.6)';
        }

        // Industrial buildings - red
        if (name.includes('factory') || name.includes('warehouse') || name.includes('industrial')) {
            return 'rgba(245, 101, 101, 0.6)';
        }

        // Office buildings - purple
        if (name.includes('office') || name.includes('tower')) {
            return 'rgba(168, 85, 247, 0.6)';
        }

        // Public services - light blue
        if (name.includes('school') || name.includes('hospital') || name.includes('library') ||
            name.includes('fire') || name.includes('police')) {
            return 'rgba(99, 179, 237, 0.6)';
        }

        // Utilities - green
        if (name.includes('power') || name.includes('water') || name.includes('utilities')) {
            return 'rgba(34, 197, 94, 0.6)';
        }

        // Default for unknown building types
        return 'rgba(156, 163, 175, 0.6)'; // Gray
    }

    /**
     * Legacy compatibility: Get roads collection
     */
    get roads() {
        // Return a Map-like object that legacy code expects
        return this.roadSegments;
    }

    /**
     * Legacy compatibility: Reset method
     */
    reset() {
        this.roadSegments.clear();
        this.transitStops.clear();
        this.transitLines.length = 0;

        if (this.isActive) {
            this.hide();
        }
    }

    /**
     * Legacy compatibility: Clear roads
     */
    clearRoads() {
        this.roadSegments.clear();
        this.requestRender();
    }

    /**
     * Legacy compatibility: Clear transit stops
     */
    clearTransitStops() {
        this.transitStops.clear();
        this.requestRender();
    }

    /**
     * Legacy compatibility: Clear transit routes
     */
    clearTransitRoutes() {
        this.transitLines.length = 0;
        this.requestRender();
    }
}

// Export for integration with game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobilityLayerV2;
}