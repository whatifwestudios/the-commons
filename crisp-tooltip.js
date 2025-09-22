/**
 * Crisp Tooltip System
 * Sharp corners, professional styling matching context menu design
 */

class CrispTooltip {
    constructor(game) {
        this.game = game;
        this.element = null;
        this.currentCell = null;
        this.hideTimer = null;
        this.init();
    }

    init() {
        // Remove any existing tooltip
        const existing = document.getElementById('crisp-tooltip');
        if (existing) existing.remove();

        // Create crisp tooltip element matching context menu design
        this.element = document.createElement('div');
        this.element.id = 'crisp-tooltip';
        this.element.style.cssText = `
            position: fixed;
            background: #111111;
            border: 1px solid #2a2a2a;
            border-radius: 4px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 13px;
            line-height: 1.4;
            pointer-events: none;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                       transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                       visibility 0.2s;
            min-width: 200px;
            max-width: 250px;
            transform: scale(0.95);
            will-change: opacity, transform;
        `;
        document.body.appendChild(this.element);

        // Set up canvas event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });

        canvas.addEventListener('mouseleave', () => {
            this.hide();
        });

        canvas.addEventListener('click', (e) => {
            this.handleClick(e);
        });
    }

    handleMouseMove(e) {
        // Don't show tooltip if context menu is open
        if (this.game.contextMenu && this.game.contextMenu.classList &&
            this.game.contextMenu.classList.contains('visible')) {
            this.hide();
            return;
        }

        // Get screen coordinates from mouse position
        const rect = e.target.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Use the same coordinate conversion as the context menu system
        const worldCoords = this.game.screenToWorldCoords(screenX, screenY);
        const tile = this.game.fromIsometric(worldCoords.x, worldCoords.y);

        // Check if we got a valid tile
        if (!tile || tile.row < 0 || tile.row >= this.game.gridSize ||
            tile.col < 0 || tile.col >= this.game.gridSize) {
            this.hide();
            return;
        }

        // Check if we're still on the same cell
        const cellKey = `${tile.row},${tile.col}`;
        if (this.currentCell === cellKey) return;

        this.currentCell = cellKey;
        this.show(tile.row, tile.col, e.clientX, e.clientY);
    }

    handleClick(e) {
        // If tooltip is visible and we're clicking in the same area, transform to context menu
        if (this.element && this.element.style.opacity === '1' && this.currentCell) {
            // Get screen coordinates from mouse position
            const rect = e.target.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;

            // Use the same coordinate conversion as the tooltip system
            const worldCoords = this.game.screenToWorldCoords(screenX, screenY);
            const tile = this.game.fromIsometric(worldCoords.x, worldCoords.y);

            if (tile && `${tile.row},${tile.col}` === this.currentCell) {
                // Hide tooltip with dramatic transform
                this.transformToContextMenu(e.clientX, e.clientY, tile.row, tile.col);

                // Prevent the default canvas click handler
                e.stopPropagation();
                return;
            }
        }
    }

    transformToContextMenu(mouseX, mouseY, row, col) {
        if (!this.element) return;

        // Simple fade out
        this.element.style.opacity = '0';

        setTimeout(() => {
            this.hide();

            // Trigger context menu
            if (this.game.handleCanvasRightClick) {
                const canvas = document.getElementById('gameCanvas');
                const syntheticEvent = new MouseEvent('contextmenu', {
                    clientX: mouseX,
                    clientY: mouseY,
                    button: 2,
                    buttons: 2,
                    bubbles: true,
                    cancelable: true
                });

                this.game.handleCanvasRightClick(syntheticEvent);
            }
        }, 150);
    }

    show(row, col, mouseX, mouseY) {
        clearTimeout(this.hideTimer);

        // Get parcel data
        const parcel = this.game.grid[row][col];
        if (!parcel) {
            this.hide();
            return;
        }


        // Generate tooltip content
        const content = this.generateContent(row, col, parcel);
        if (!content) {
            this.hide();
            return;
        }

        // Update tooltip content
        this.element.innerHTML = content;

        // Position and show with animation
        this.position(mouseX, mouseY);

        // Use a small delay to ensure positioning is complete
        requestAnimationFrame(() => {
            this.element.style.opacity = '1';
            this.element.style.visibility = 'visible';
            this.element.style.transform = 'scale(1)';
        });
    }

    generateContent(row, col, parcel) {
        // Get coordinate in A-1 format
        const coord = this.game.getParcelCoordinate(row, col);

        let html = '';

        if (parcel.building) {
            // Building tooltip
            const buildingData = this.game.getBuildingDataByName(parcel.building);

            if (!buildingData) return null;

            const owner = parcel.owner ? 'Player' : 'City';
            const landValue = this.game.getParcelPrice(row, col);
            const buildingValue = buildingData.cost || 0;

            // Header with coordinate in top right
            html += `
                <div style="padding: 12px 16px; border-bottom: 1px solid #2a2a2a; background: #0a0a0a; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px;">${buildingData.name}</div>
                        <div style="font-size: 11px; color: #888888;">Owned by ${owner}</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #4a9eff; letter-spacing: 0.5px;">
                        ${coord}
                    </div>
                </div>
            `;

            // Values section
            html += `
                <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: #cccccc; font-size: 12px;">Building Value</span>
                        <span style="color: #ffffff; font-weight: 600;">$${buildingValue.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #cccccc; font-size: 12px;">Land Value</span>
                        <span style="color: #ffffff; font-weight: 600;">$${landValue.toLocaleString()}</span>
                    </div>
                </div>
            `;

            // Construction progress if building is under construction
            const isUnderConstruction = parcel._isUnderConstruction;
            const constructionProgress = parcel._constructionProgress;
            if (isUnderConstruction && constructionProgress < 1.0) {
                const progressPercent = Math.round(constructionProgress * 100);
                html += `
                    <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                        <div style="color: #FFC107; font-weight: 600; margin-bottom: 8px; font-size: 12px;">Construction Progress</div>
                        <div style="background: #333; border-radius: 6px; height: 8px; overflow: hidden; margin-bottom: 4px;">
                            <div style="background: linear-gradient(90deg, #4CAF50, #8BC34A); height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
                        </div>
                        <div style="color: #cccccc; font-size: 11px; text-align: center;">${progressPercent}% Complete</div>
                    </div>
                `;
            }

            // Building resource info
            if (buildingData.resources) {
                const provides = [];
                const needs = [];
                const connectedSupplies = this.checkConnectedSupplies(row, col, buildingData.resources);


                // Collect what building provides
                if (buildingData.resources.jobsProvided > 0) provides.push(`${buildingData.resources.jobsProvided} jobs`);
                if (buildingData.resources.energyProvided > 0) provides.push(`${buildingData.resources.energyProvided} energy`);
                if (buildingData.resources.educationProvided > 0) provides.push(`${buildingData.resources.educationProvided} education`);
                if (buildingData.resources.foodProvided > 0) provides.push(`${buildingData.resources.foodProvided} food`);
                if (buildingData.resources.housingProvided > 0) provides.push(`${buildingData.resources.housingProvided} housing`);
                if (buildingData.resources.healthcareProvided > 0) provides.push(`${buildingData.resources.healthcareProvided} healthcare`);

                // Collect unmet needs only (buildings lacking something for max performance)
                const unmetNeeds = [];
                let allNeedsMet = true;

                if (buildingData.resources.jobsRequired > 0) {
                    if (connectedSupplies.jobs < buildingData.resources.jobsRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.jobsRequired} jobs`);
                        allNeedsMet = false;
                    }
                }
                if (buildingData.resources.energyRequired > 0) {
                    if (connectedSupplies.energy < buildingData.resources.energyRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.energyRequired} energy`);
                        allNeedsMet = false;
                    }
                }
                if (buildingData.resources.educationRequired > 0) {
                    if (connectedSupplies.education < buildingData.resources.educationRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.educationRequired} education`);
                        allNeedsMet = false;
                    }
                }
                if (buildingData.resources.foodRequired > 0) {
                    if (connectedSupplies.food < buildingData.resources.foodRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.foodRequired} food`);
                        allNeedsMet = false;
                    }
                }
                if (buildingData.resources.housingRequired > 0) {
                    if (connectedSupplies.housing < buildingData.resources.housingRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.housingRequired} housing`);
                        allNeedsMet = false;
                    }
                }
                if (buildingData.resources.healthcareRequired > 0) {
                    if (connectedSupplies.healthcare < buildingData.resources.healthcareRequired) {
                        unmetNeeds.push(`❌ ${buildingData.resources.healthcareRequired} healthcare`);
                        allNeedsMet = false;
                    }
                }

                if (provides.length > 0) {
                    html += `
                        <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                            <div style="color: #4CAF50; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                <span style="color: #4CAF50; margin-right: 6px;">⚡</span>Supplies
                            </div>
                            <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${provides.join(', ')}</div>
                        </div>
                    `;
                }

                // Show unmet needs if any, or subtle indicator if all needs are met
                if (unmetNeeds.length > 0) {
                    html += `
                        <div style="padding: 12px 16px;">
                            <div style="color: #FF9800; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                <span style="color: #FF9800; margin-right: 6px;">⚠️</span>Needs Attention
                            </div>
                            <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${unmetNeeds.join(', ')}</div>
                        </div>
                    `;
                } else if (allNeedsMet && (
                    buildingData.resources.jobsRequired > 0 ||
                    buildingData.resources.energyRequired > 0 ||
                    buildingData.resources.educationRequired > 0 ||
                    buildingData.resources.foodRequired > 0 ||
                    buildingData.resources.housingRequired > 0 ||
                    buildingData.resources.healthcareRequired > 0
                )) {
                    html += `
                        <div style="padding: 12px 16px;">
                            <div style="color: #4CAF50; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                <span style="color: #4CAF50; margin-right: 6px;">✅</span>Operating Optimally
                            </div>
                            <div style="color: #888; font-size: 11px; font-style: italic;">All resource needs met</div>
                        </div>
                    `;
                }
            }

            // Building efficiency or status
            if (parcel.efficiency !== undefined) {
                const efficiency = parcel.efficiency;
                const efficiencyColor = efficiency >= 80 ? '#4CAF50' : efficiency >= 60 ? '#FF9800' : '#F44336';
                html += `
                    <div style="padding: 12px 16px;">
                        <div style="color: ${efficiencyColor}; font-weight: 600; margin-bottom: 4px; font-size: 12px;">
                            Operating Efficiency: ${Math.round(efficiency)}%
                        </div>
                        <div style="color: #888; font-size: 10px;">
                            ${efficiency >= 80 ? 'Optimal performance' : efficiency >= 60 ? 'Moderate performance' : 'Needs attention'}
                        </div>
                    </div>
                `;
            }
        } else {
            // Empty parcel tooltip
            const owner = parcel.owner ? 'Player' : 'City';
            const landValue = this.game.getParcelPrice(row, col);

            // Header with coordinate in top right
            html += `
                <div style="padding: 12px 16px; border-bottom: 1px solid #2a2a2a; background: #0a0a0a; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 2px;">Empty Parcel</div>
                        <div style="font-size: 11px; color: #888888;">Owned by ${owner}</div>
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #4CAF50; letter-spacing: 0.5px;">
                        ${coord}
                    </div>
                </div>
            `;

            // Land value section
            html += `
                <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #cccccc; font-size: 12px;">Land Value</span>
                        <span style="color: #ffffff; font-weight: 600;">$${landValue.toLocaleString()}</span>
                    </div>
                </div>
            `;

            // Available for construction
            html += `
                <div style="padding: 12px 16px;">
                    <div style="color: #4CAF50; font-size: 11px;">Available for construction</div>
                </div>
            `;
        }

        return html;
    }

    position(mouseX, mouseY) {
        if (!this.element) return;

        // Get tooltip dimensions
        this.element.style.visibility = 'hidden';
        this.element.style.opacity = '1';
        const rect = this.element.getBoundingClientRect();

        const offset = 20;
        const padding = 10;

        // Default positioning (bottom-right of cursor)
        let x = mouseX + offset;
        let y = mouseY + offset;
        let placement = 'bottom-right';

        // Check if tooltip would go off right edge
        if (x + rect.width + padding > window.innerWidth) {
            x = mouseX - rect.width - offset;
            placement = placement.replace('right', 'left');
        }

        // Check if tooltip would go off bottom edge
        if (y + rect.height + padding > window.innerHeight) {
            y = mouseY - rect.height - offset;
            placement = placement.replace('bottom', 'top');
        }

        // Check if tooltip would go off left edge (fallback)
        if (x < padding) {
            x = padding;
        }

        // Check if tooltip would go off top edge (fallback)
        if (y < padding) {
            y = padding;
        }

        // Final bounds check - ensure tooltip fits on screen
        if (x + rect.width > window.innerWidth - padding) {
            x = window.innerWidth - rect.width - padding;
        }
        if (y + rect.height > window.innerHeight - padding) {
            y = window.innerHeight - rect.height - padding;
        }

        // Add a subtle entrance animation based on placement
        this.element.style.transformOrigin = this.getTransformOrigin(placement);
        this.element.style.transform = 'scale(0.95)';

        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        this.element.style.visibility = 'visible';

        // Animate to full scale
        requestAnimationFrame(() => {
            this.element.style.transform = 'scale(1)';
        });
    }

    getTransformOrigin(placement) {
        // Set transform origin based on tooltip placement for natural scaling
        switch (placement) {
            case 'bottom-right': return 'top left';
            case 'bottom-left': return 'top right';
            case 'top-right': return 'bottom left';
            case 'top-left': return 'bottom right';
            default: return 'center';
        }
    }

    hide() {
        if (this.element) {
            // Animate out with scale and opacity
            this.element.style.opacity = '0';
            this.element.style.transform = 'scale(0.95)';

            // Hide after transition completes
            this.hideTimer = setTimeout(() => {
                if (this.element) {
                    this.element.style.visibility = 'hidden';
                }
            }, 200);
        }
        this.currentCell = null;
    }

    checkConnectedSupplies(row, col, buildingNeeds) {
        const supplies = {
            jobs: 0,
            energy: 0,
            education: 0,
            food: 0,
            housing: 0,
            healthcare: 0
        };

        // Check the 8 adjacent parcels (including diagonals)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip the current parcel

                const adjRow = row + dr;
                const adjCol = col + dc;

                // Check bounds
                if (adjRow >= 0 && adjRow < this.game.gridSize &&
                    adjCol >= 0 && adjCol < this.game.gridSize) {

                    const adjParcel = this.game.grid[adjRow][adjCol];
                    if (adjParcel && adjParcel.building) {
                        const adjBuildingData = this.game.getBuildingDataByName(adjParcel.building);
                        if (adjBuildingData && adjBuildingData.resources) {
                            supplies.jobs += adjBuildingData.resources.jobsProvided || 0;
                            supplies.energy += adjBuildingData.resources.energyProvided || 0;
                            supplies.education += adjBuildingData.resources.educationProvided || 0;
                            supplies.food += adjBuildingData.resources.foodProvided || 0;
                            supplies.housing += adjBuildingData.resources.housingProvided || 0;
                            supplies.healthcare += adjBuildingData.resources.healthcareProvided || 0;
                        }
                    }
                }
            }
        }

        // TODO: Add road connectivity check here if roads are implemented
        // This would involve checking if there's a path via roads to resource providers

        return supplies;
    }

    destroy() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        clearTimeout(this.hideTimer);
    }
}

// Export for use
window.CrispTooltip = CrispTooltip;