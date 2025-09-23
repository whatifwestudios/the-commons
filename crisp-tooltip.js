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

        // Add CSS for 3D flip animations
        this.addFlipAnimationCSS();

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
                       transform 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                       visibility 0.2s,
                       width 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                       height 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            min-width: 200px;
            max-width: 250px;
            transform: scale(0.95) perspective(1000px);
            will-change: opacity, transform, width, height;
            transform-style: preserve-3d;
            backface-visibility: hidden;
        `;
        document.body.appendChild(this.element);

        // Set up canvas event listeners
        this.setupEventListeners();
    }

    addFlipAnimationCSS() {
        // Only add styles once
        if (document.getElementById('tooltip-flip-styles')) return;

        const style = document.createElement('style');
        style.id = 'tooltip-flip-styles';
        style.textContent = `
            .tooltip-content-fade {
                transition: opacity 0.3s ease-out;
            }

            .context-menu-content-fade {
                transition: opacity 0.3s ease-in;
            }

            .morphing-container {
                transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                           height 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                           left 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                           top 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .parcel-coordinate-anchor {
                position: absolute;
                top: 12px;
                right: 16px;
                font-size: 12px;
                font-weight: 600;
                color: #4a9eff;
                letter-spacing: 0.5px;
                z-index: 10001;
                transition: none !important;
            }

            .menu-button-feedback {
                animation: menuButtonFeedback 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }

            @keyframes menuButtonFeedback {
                0% {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
                50% {
                    transform: scale(0.95) translateY(2px);
                    opacity: 0.8;
                }
                100% {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
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

        // Set flag to prevent legacy click handlers
        this.game.preventLegacyContextMenu = true;

        // Use exact header position for pixel-perfect alignment
        const tooltipX = this.headerPosition ? this.headerPosition.x : (this.finalPosition ? this.finalPosition.x : mouseX + 20);
        const tooltipY = this.headerPosition ? this.headerPosition.y : (this.finalPosition ? this.finalPosition.y : mouseY + 20);

        // Simple fade out tooltip
        this.element.style.transition = 'opacity 0.15s ease-out';
        this.element.style.opacity = '0';

        setTimeout(() => {
            this.hide();

            if (this.game.contextMenuSystem) {
                // Show context menu at the tooltip's exact final position
                this.game.contextMenuSystem.show(row, col, tooltipX, tooltipY);
            }

            // Clear flag after a small delay to allow our positioning to complete
            setTimeout(() => {
                this.game.preventLegacyContextMenu = false;
            }, 50);
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

            // Performance info (get from server-side calculation)
            if (this.game.economicAPI && !isUnderConstruction) {
                this.game.economicAPI.getBuildingPerformance(row, col).then(performanceInfo => {
                    if (performanceInfo && performanceInfo.success && performanceInfo.building) {
                        const performance = performanceInfo.building;
                        const performancePercent = Math.round(performance.finalPerformance * 100);
                        const decayPercent = Math.round((parcel.decay || 0) * 100);

                        // Find performance section and update
                        const tooltip = document.querySelector('.crisp-tooltip');
                        if (tooltip && !tooltip.querySelector('[style*="Performance:"]')) {
                            const performanceHtml = `
                                <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                                    <div style="color: #2196F3; font-weight: 600; margin-bottom: 8px; font-size: 12px; display: flex; align-items: center;">
                                        <span style="color: #2196F3; margin-right: 6px;">📊</span>Performance: ${performancePercent}%
                                    </div>
                                    ${decayPercent > 20 ? `<div style="color: #FF5722; font-size: 11px; margin-top: 4px;">⚠️ ${decayPercent}% decay - needs maintenance</div>` : ''}
                                </div>
                            `;

                            // Insert after construction section
                            const constructionDiv = tooltip.querySelector('[style*="Construction Progress"]')?.parentElement;
                            if (constructionDiv) {
                                constructionDiv.insertAdjacentHTML('afterend', performanceHtml);
                            } else {
                                // Insert at beginning if no construction section
                                const firstResourceDiv = tooltip.querySelector('[style*="padding: 12px 16px"]');
                                if (firstResourceDiv) {
                                    firstResourceDiv.insertAdjacentHTML('beforebegin', performanceHtml);
                                }
                            }
                        }
                    }
                }).catch(err => {
                    // Silently fail for missing buildings - this is normal for empty parcels
                    if (!err.message?.includes('Building not found')) {
                        console.log('Performance data error:', err);
                    }
                });
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
                                <span style="color: #4CAF50; margin-right: 6px;">⚡</span>Produces
                            </div>
                            <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${provides.join(', ')}</div>
                        </div>
                    `;
                }

                // Enhanced connectivity and supply analysis using economic engine data
                const buildingKey = `${row},${col}`;
                const efficiencyData = this.game.buildingEfficiencies?.get(buildingKey);

                if (efficiencyData && efficiencyData.needs) {
                    const connectivityIssues = [];
                    const supplyShortages = [];
                    const satisfiedNeeds = [];

                    Object.keys(efficiencyData.needs).forEach(resource => {
                        const need = efficiencyData.needs[resource];
                        if (need.satisfaction < 1.0) {
                            if (need.connectivityIssue) {
                                connectivityIssues.push(`🚫 ${resource} (no road access)`);
                            } else if (need.supplyShortage) {
                                supplyShortages.push(`📉 ${resource} (insufficient supply)`);
                            }
                        } else if (need.satisfaction >= 1.0) {
                            satisfiedNeeds.push(resource);
                        }
                    });

                    // Show connectivity issues first (most critical)
                    if (connectivityIssues.length > 0) {
                        html += `
                            <div style="padding: 12px 16px; border-bottom: 1px solid #1a1a1a;">
                                <div style="color: #F44336; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                    <span style="color: #F44336; margin-right: 6px;">🛣️</span>Needs Road Connection
                                </div>
                                <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${connectivityIssues.join(', ')}</div>
                                <div style="color: #888; font-size: 10px; margin-top: 4px; font-style: italic;">Build roads to connect this building to suppliers</div>
                            </div>
                        `;
                    }

                    // Show supply shortages second
                    if (supplyShortages.length > 0) {
                        html += `
                            <div style="padding: 12px 16px;">
                                <div style="color: #FF9800; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                    <span style="color: #FF9800; margin-right: 6px;">⚠️</span>Resources needed
                                </div>
                                <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${supplyShortages.join(', ')}</div>
                                <div style="color: #888; font-size: 10px; margin-top: 4px; font-style: italic;">Build more suppliers in the area</div>
                            </div>
                        `;
                    }

                    // Show positive status if all needs are met
                    if (connectivityIssues.length === 0 && supplyShortages.length === 0 && satisfiedNeeds.length > 0) {
                        html += `
                            <div style="padding: 12px 16px;">
                                <div style="color: #4CAF50; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                    <span style="color: #4CAF50; margin-right: 6px;">✅</span>Operating Optimally
                                </div>
                                <div style="color: #888; font-size: 11px; font-style: italic;">All resource needs met via road network</div>
                            </div>
                        `;
                    }
                } else {
                    // Fallback to basic unmet needs display if no efficiency data
                    if (unmetNeeds.length > 0) {
                        html += `
                            <div style="padding: 12px 16px;">
                                <div style="color: #FF9800; font-weight: 600; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center;">
                                    <span style="color: #FF9800; margin-right: 6px;">⚠️</span>Resources needed
                                </div>
                                <div style="color: #cccccc; font-size: 11px; line-height: 1.5;">${unmetNeeds.join(', ')}</div>
                            </div>
                        `;
                    }
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

        // Store final position for context menu transitions
        this.finalPosition = { x, y };

        // Store header position for perfect alignment
        requestAnimationFrame(() => {
            const header = this.element.querySelector('[style*="padding: 12px 16px"][style*="background: #0a0a0a"]');
            if (header) {
                const headerRect = header.getBoundingClientRect();
                this.headerPosition = { x: headerRect.left, y: headerRect.top };
            }
        });

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

    setupMenuButtonFeedback(contextMenu) {
        // Add click feedback to all context menu buttons
        const buttons = contextMenu.querySelectorAll('.context-btn');
        buttons.forEach(button => {
            const originalClickHandler = button.onclick;
            button.onclick = (e) => {
                // Add feedback animation
                button.classList.add('menu-button-feedback');

                // Remove animation class after completion
                setTimeout(() => {
                    button.classList.remove('menu-button-feedback');
                }, 200);

                // Execute original click handler with slight delay for visual feedback
                if (originalClickHandler) {
                    setTimeout(() => {
                        originalClickHandler.call(button, e);
                    }, 100);
                }
            };
        });
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