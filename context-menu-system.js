/**
 * Context Menu System for The Commons
 * Handles all context menu functionality and parcel interactions
 */

class ContextMenuSystem {
    constructor(game) {
        this.game = game;
        this.contextMenu = document.getElementById('context-menu');
        this.selectedTile = null;
        this.selectedParcel = null;
        this.currentSubmenu = null;
        this.submenuTimer = null;
        this.isMenuOpen = false; // Track menu state

        // Track event listeners for cleanup
        this.eventListeners = [];
    }

    /**
     * Show context menu for a specific parcel
     */
    show(row, col, mouseX, mouseY) {
        // Early return if context menu element doesn't exist or doesn't have querySelector
        if (!this.contextMenu || typeof this.contextMenu.querySelector !== 'function') {
            console.error('❌ Context menu element not found or invalid');
            return;
        }

        // Setup menu content using shared method
        this.setupMenuContent(row, col);

        // Hide tooltip when showing menu
        if (this.game.tooltipSystemV2) {
            this.game.tooltipSystemV2.hide();
        }

        // Show and position menu
        this.contextMenu.classList.add('visible');
        this.isMenuOpen = true;
        this.positionMenu(mouseX, mouseY);
    }

    /**
     * Show context menu with transition from tooltip
     */
    showWithTransition(row, col, mouseX, mouseY, tooltipBounds) {
        // Set up the menu content but don't position it yet
        this.setupMenuContent(row, col);

        // Position at tooltip location if bounds provided, otherwise use mouse position
        if (tooltipBounds) {
            // Position exactly where tooltip was for seamless transition
            this.contextMenu.style.left = `${tooltipBounds.left}px`;
            this.contextMenu.style.top = `${tooltipBounds.top}px`;
        } else {
            // Fallback to mouse position
            this.positionMenu(mouseX, mouseY);
        }

        // Show menu and apply smooth transition
        this.contextMenu.classList.add('visible');
        this.isMenuOpen = true;

        // Apply smooth appearance transition
        this.contextMenu.style.transform = 'scale(0.95)';
        this.contextMenu.style.opacity = '0.8';

        // Animate to full appearance
        setTimeout(() => {
            this.contextMenu.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';
            this.contextMenu.style.opacity = '1';
            this.contextMenu.style.transform = 'scale(1)';
        }, 10);
    }

    /**
     * Setup menu content without positioning (helper for showWithTransition)
     */
    setupMenuContent(row, col) {
        // Set the selected tile and calculate reach
        this.selectedTile = { row, col };
        this.selectedParcel = { row, col };
        this.game.selectedTile = { row, col };
        this.game.selectedParcel = { row, col };
        this.game.scheduleRender();

        // Update the selected tile display
        const coord = this.game.getParcelCoordinate(row, col);
        const selectedTileElement = this.game.uiManager.get('selectedTile');
        if (selectedTileElement) {
            selectedTileElement.textContent = coord;
        }

        const parcel = this.game.grid[row][col];
        // 🚫 GHOST BUSTED! Use server price
        const price = this.game.economicClient?.getParcelPrice(row, col) || 150;

        // Use tooltip system's standardized header creation
        const headerHtml = this.game.tooltipSystemV2.createStandardHeader(coord, parcel, false, true);

        // Update the entire context menu to match tooltip structure
        this.contextMenu.innerHTML = `
            ${headerHtml}
            <div class="context-content">
                <!-- Content will be populated based on parcel state -->
            </div>
        `;

        // Get the newly created content element
        const contentEl = this.contextMenu.querySelector('.context-content');
        if (!contentEl) {
            console.error('Context menu content element not found after rebuild');
            return;
        }

        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            // Unowned parcel (includes City-owned)
            this.createUnownedParcelMenu(contentEl, row, col, price);
        } else if (this.game.isCurrentPlayer(parcel.owner)) {
            // Player-owned parcel
            this.createPlayerOwnedParcelMenu(contentEl, row, col, parcel);
        } else {
            // Competitor-owned parcel
            this.createCompetitorOwnedParcelMenu(contentEl, row, col, parcel);
        }
    }

    /**
     * Hide context menu
     */
    hide() {
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.classList.remove('visible');
            this.isMenuOpen = false;
        }

        // Hide building info panel when context menu closes
        this.hideBuildingInfo();

        // Clean up event listeners to prevent memory leaks
        this.cleanupEventListeners();

        // Clear selection and reach visualization when context menu closes
        this.selectedTile = null;
        this.game.selectedTile = null;
        this.game.hoveredTile = null;
        this.selectedParcel = null;
        this.game.selectedParcel = null;
        this.game.parcelReach = null;
        this.game.scheduleRender(); // Redraw to remove reach visualization
        const selectedTileElement = this.game.uiManager.get('selectedTile');
        if (selectedTileElement) {
            selectedTileElement.textContent = '--';
        }
        this.game.updateParcelIllumination(null);
        this.game.scheduleRender();
    }

    /**
     * Create menu for unowned parcel
     */
    createUnownedParcelMenu(contentEl, row, col, price) {

        const buyBtn = document.createElement('button');
        buyBtn.className = 'context-btn primary';
        buyBtn.textContent = `BUY PARCEL - $${price}`;
        buyBtn.onclick = () => {
            // Prevent rapid-fire clicks
            if (buyBtn.disabled) return;
            buyBtn.disabled = true;
            buyBtn.textContent = 'PURCHASING...';

            this.game.buildingSystem.purchaseParcel(row, col).finally(() => {
                buyBtn.disabled = false;
                buyBtn.textContent = `BUY PARCEL - $${price}`;
            });
        };
        contentEl.appendChild(buyBtn);
    }

    /**
     * Create menu for player-owned parcel
     */
    createPlayerOwnedParcelMenu(contentEl, row, col, parcel) {


        if (!parcel.building) {
            // Empty parcel - show building categories
            this.createEmptyParcelMenu(contentEl, row, col);
        } else {
            // Built parcel - show destroy, upgrade, and amenity options
            this.createBuiltParcelMenu(contentEl, row, col, parcel);
        }
    }

    /**
     * Create menu for competitor-owned parcel
     */
    createCompetitorOwnedParcelMenu(contentEl, row, col, parcel) {

        // Show what building they have if any
        if (parcel.building) {
            const buildingInfo = document.createElement('div');
            buildingInfo.className = 'building-info';
            buildingInfo.style.marginBottom = '10px';
            buildingInfo.style.fontSize = '12px';
            buildingInfo.style.color = '#ccc';
            buildingInfo.textContent = `Building: ${parcel.building}`;
            contentEl.appendChild(buildingInfo);
        }

    }

    /**
     * Position context menu at coordinates
     */
    positionMenu(mouseX, mouseY) {
        // Position the context menu exactly at provided coordinates
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.style.left = `${mouseX}px`;
            this.contextMenu.style.top = `${mouseY}px`;
        }
    }

    /**
     * Create empty parcel menu
     */
    createEmptyParcelMenu(contentEl, row, col) {

        // Build Menu section
        const buildSection = document.createElement('div');
        buildSection.className = 'context-section';

        const buildTitle = document.createElement('div');
        buildTitle.className = 'build-menu-title';
        buildTitle.textContent = 'BUILD MENU';
        buildSection.appendChild(buildTitle);

        // Create category buttons with submenus
        this.game.buildingManager.getCategories().forEach(category => {
            const categoryContainer = document.createElement('div');
            categoryContainer.className = 'category-container';
            categoryContainer.style.position = 'relative';

            const categoryBtn = document.createElement('button');
            categoryBtn.className = 'category-btn';
            // Get category funding from economic client game state
            const availableFunds = this.getCategoryFunding(category);

            // Determine funding status for this category
            const buildings = this.game.buildingManager.getBuildingsByCategory(category);
            let fundingStatus = 'none'; // none, partial, full

            if (availableFunds > 0 && buildings.length > 0) {
                const cheapestBuilding = Math.min(...buildings.map(b => b.economics?.buildCost || b.cost || 0));
                const mostExpensiveBuilding = Math.max(...buildings.map(b => b.economics?.buildCost || b.cost || 0));

                if (availableFunds >= mostExpensiveBuilding) {
                    fundingStatus = 'full'; // Can fund most expensive building
                } else if (availableFunds >= cheapestBuilding) {
                    fundingStatus = 'partial'; // Can fund some buildings
                }
            }

            // Set indicator color based on funding status
            let indicatorColor = '#666'; // Default gray
            if (fundingStatus === 'full') {
                indicatorColor = '#2196F3'; // Blue for full funding
            } else if (fundingStatus === 'partial') {
                indicatorColor = '#FFA726'; // Yellow/orange for partial funding
            }

            // Only show funding amount if there are funds available
            const fundingDisplay = availableFunds > 0 ?
                `<span class="funding-amount" style="color: ${indicatorColor};">$${availableFunds.toLocaleString()}</span>` :
                '';

            categoryBtn.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${fundingDisplay}
                        <span class="category-arrow">→</span>
                    </div>
                </div>
            `;

            const submenu = document.createElement('div');
            submenu.className = 'building-submenu';

            // Add all buildings for this category
            this.game.buildingManager.getBuildingsByCategory(category).forEach(building => {
                const buildingBtn = document.createElement('button');

                // Check building requirements
                const requirements = this.game.checkBuildingRequirements(building.id, row, col);

                // Set button class based on buildability
                if (requirements.canBuild) {
                    buildingBtn.className = 'building-btn';
                } else {
                    buildingBtn.className = 'building-btn disabled';
                    buildingBtn.style.opacity = '0.6';
                    buildingBtn.style.borderLeft = '3px solid #ff6b6b';
                    buildingBtn.disabled = true; // Actually disable the button
                }

                const fullCost = building.economics?.buildCost || building.cost || 0;
                const fundingInfo = this.game.calculateBuildingCostWithFunding(building, fullCost);
                const playerCost = fundingInfo.playerCost;
                const publicFunding = fundingInfo.publicFunding;

                // Get budget information for this category
                const categoryFunding = this.getCategoryFunding(fundingInfo.category);
                const budgetAvailable = categoryFunding >= publicFunding;

                // Determine price color based on funding status with gradients
                let priceColor = '#ccc'; // Default white/gray
                if (playerCost === 0) {
                    priceColor = '#2196F3'; // Blue for $0 (fully funded)
                } else if (publicFunding > 0) {
                    // Calculate discount percentage for gradient effect
                    const discountPercent = publicFunding / fullCost;

                    if (discountPercent >= 0.75) {
                        // High discount (75%+) - more blue
                        priceColor = '#42A5F5'; // Light blue
                    } else if (discountPercent >= 0.5) {
                        // Medium discount (50-74%) - blue-orange mix
                        priceColor = '#66BB6A'; // Green-blue
                    } else if (discountPercent >= 0.25) {
                        // Low discount (25-49%) - orange
                        priceColor = '#FFA726'; // Orange
                    } else {
                        // Very low discount (1-24%) - yellow-orange
                        priceColor = '#FFCC02'; // Yellow
                    }
                }

                if (publicFunding > 0) {
                    const budgetStatus = budgetAvailable ? '✓' : '⚠️';
                    const budgetColor = budgetAvailable ? '#4CAF50' : '#FF9800';

                    buildingBtn.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${building.name}</span>
                            <div class="building-price-info" style="text-align: right;">
                                <div style="color: ${budgetColor};">${budgetStatus} Budget: $${categoryFunding.toLocaleString()}</div>
                                <div style="color: #4CAF50;">Public: $${publicFunding.toLocaleString()}</div>
                                <div style="color: ${priceColor}; font-weight: 600;">You pay: $${playerCost.toLocaleString()}</div>
                            </div>
                        </div>
                    `;
                } else {
                    buildingBtn.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>${building.name}</span>
                            <span style="color: ${priceColor}; font-weight: 600;">$${playerCost.toLocaleString()}</span>
                        </div>
                    `;
                }

                buildingBtn.onclick = async () => await this.game.buildingSystem.constructBuilding(row, col, building.id);
                submenu.appendChild(buildingBtn);
            });

            // Add hover handlers for building info display
            this.addBuildingHoverHandlers(submenu);

            // Add category hover management
            this.setupCategoryHover(categoryBtn, submenu);

            categoryContainer.appendChild(categoryBtn);
            categoryContainer.appendChild(submenu);
            buildSection.appendChild(categoryContainer);
        });

        contentEl.appendChild(buildSection);
    }

    /**
     * Create built parcel menu
     */
    createBuiltParcelMenu(contentEl, row, col, parcel) {
        // Main actions section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'context-section';


        const destroyBtn = document.createElement('button');
        destroyBtn.className = 'context-btn';

        // Calculate and show demolition fee
        const building = this.game.buildingManager.getBuildingById(parcel.building);
        const currentValue = this.calculateCurrentBuildingValue(parcel, building);
        const demolitionFee = Math.round(currentValue * 0.1);

        destroyBtn.textContent = `DESTROY BUILDING - $${demolitionFee}`;
        destroyBtn.onclick = () => this.game.buildingSystem.demolishBuilding(row, col);

        // V2 Server-authoritative ONLY - no fallbacks
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance() || 0;

        if (currentBalance < demolitionFee) {
            destroyBtn.disabled = true;
            destroyBtn.classList.add('disabled');
        }

        actionsSection.appendChild(destroyBtn);

        // Add Data Insights button
        const dataInsightsBtn = document.createElement('button');
        dataInsightsBtn.className = 'context-btn secondary';
        dataInsightsBtn.textContent = '📊 DATA INSIGHTS';
        dataInsightsBtn.onclick = () => {
            this.game.createDataInsightsOverlay(row, col, parcel);
        };
        actionsSection.appendChild(dataInsightsBtn);

        contentEl.appendChild(actionsSection);

        // Upgrade section
        const upgradeSection = document.createElement('div');
        upgradeSection.className = 'context-section';

        const upgradeTitle = document.createElement('div');
        upgradeTitle.className = 'build-menu-title';
        upgradeTitle.textContent = 'UPGRADES';
        upgradeSection.appendChild(upgradeTitle);

        // Get potential upgrades for current building
        const upgrades = this.game.getPotentialUpgrades(parcel.building);
        if (upgrades.length > 0) {
            upgrades.forEach(upgrade => {
                const upgradeBtn = document.createElement('button');
                upgradeBtn.className = 'context-btn';
                const upgradeCost = upgrade.economics?.buildCost || upgrade.cost || 0;

                // Calculate public funding for upgrades
                const upgradeCategory = upgrade.category;
                const fundingInfo = this.game.calculateBuildingCostWithFunding({category: upgradeCategory}, upgradeCost);
                const playerCost = fundingInfo.playerCost;
                const publicFunding = fundingInfo.publicFunding;

                upgradeBtn.textContent = `→ ${upgrade.name} - $${playerCost.toLocaleString()}`;
                upgradeBtn.onclick = () => this.game.buildingSystem.upgradeBuilding(row, col, upgrade.id);
                upgradeSection.appendChild(upgradeBtn);
            });
        } else {
            const noUpgrades = document.createElement('div');
            noUpgrades.textContent = 'No upgrades available';
            noUpgrades.style.color = '#666666';
            noUpgrades.style.fontSize = '9px';
            noUpgrades.style.padding = '4px 8px';
            upgradeSection.appendChild(noUpgrades);
        }

        contentEl.appendChild(upgradeSection);

        // Repair Building section
        const repairSection = document.createElement('div');
        repairSection.className = 'context-section';

        const repairBtn = document.createElement('button');
        repairBtn.className = 'context-btn';

        // Calculate repair cost based on building age/decay
        const buildingData = this.game.buildingManager.getBuildingById(parcel.building);
        const repairCost = this.calculateRepairCost(parcel, buildingData);

        if (repairCost > 0) {
            repairBtn.textContent = `Repair Building - $${repairCost}`;
            repairBtn.onclick = () => this.game.buildingSystem.repairBuilding(row, col);

            // V2 Server-authoritative ONLY - no fallbacks
            const currentBalance = this.game.economicClient?.getCurrentPlayerBalance() || 0;

            if (currentBalance < repairCost) {
                repairBtn.disabled = true;
                repairBtn.classList.add('disabled');
            }
        } else {
            repairBtn.textContent = 'Building in Good Condition';
            repairBtn.disabled = true;
            repairBtn.classList.add('disabled');
        }

        repairSection.appendChild(repairBtn);
        contentEl.appendChild(repairSection);
    }

    /**
     * Calculate repair cost - delegates to building system
     */
    calculateRepairCost(parcel, building) {
        return this.game.buildingSystem.calculateRepairCost(parcel, building);
    }

    /**
     * Calculate current building value - delegates to building system
     */
    calculateCurrentBuildingValue(parcel, building) {
        return this.game.buildingSystem.calculateCurrentBuildingValue(parcel, building);
    }

    /**
     * Add building hover handlers for submenu
     */
    addBuildingHoverHandlers(submenu) {
        const buildingButtons = submenu.querySelectorAll('.building-btn');
        buildingButtons.forEach(btn => {
            const mouseEnterHandler = (e) => {
                // Extract building name from the button structure
                let buildingName = '';

                // Try to find the building name in the button structure
                const spans = btn.querySelectorAll('span');
                if (spans.length > 0) {
                    // Get the first span which should contain the building name
                    buildingName = spans[0].textContent.trim();
                } else {
                    // Fallback: try to extract from textContent
                    buildingName = btn.textContent.split(' - ')[0].trim();
                }

                if (buildingName) {
                    this.showBuildingInfo(buildingName);
                }
            };

            const mouseLeaveHandler = () => {
                this.hideBuildingInfo();
            };

            btn.addEventListener('mouseenter', mouseEnterHandler);
            btn.addEventListener('mouseleave', mouseLeaveHandler);

            // Track listeners for cleanup
            this.eventListeners.push({
                element: btn,
                event: 'mouseenter',
                handler: mouseEnterHandler
            });
            this.eventListeners.push({
                element: btn,
                event: 'mouseleave',
                handler: mouseLeaveHandler
            });
        });
    }

    /**
     * Show building information panel using existing game method
     */
    showBuildingInfo(buildingName) {
        try {
            // Use the existing working method from game.js (expects buildingName, not buildingData)
            this.game.showBuildingInfo(buildingName);
        } catch (error) {
            console.error('Error showing building info:', error);
        }
    }

    /**
     * Hide building information panel
     */
    hideBuildingInfo() {
        try {
            const panel = document.getElementById('building-info-panel');
            if (panel) {
                panel.classList.remove('visible');
            }
        } catch (error) {
            console.error('Error hiding building info:', error);
        }
    }

    /**
     * Setup category hover management
     */
    setupCategoryHover(categoryBtn, submenu) {
        // Category button hover enter
        categoryBtn.addEventListener('mouseenter', () => {
            this.showSubmenu(submenu);
        });

        // Category button hover leave
        categoryBtn.addEventListener('mouseleave', () => {
            this.scheduleSubmenuHide(submenu);
        });

        // Submenu hover enter (cancel hide timer)
        submenu.addEventListener('mouseenter', () => {
            this.cancelSubmenuHide();
        });

        // Submenu hover leave
        submenu.addEventListener('mouseleave', () => {
            this.scheduleSubmenuHide(submenu);
        });
    }

    /**
     * Show submenu
     */
    showSubmenu(submenu) {
        // Clear any existing timer
        this.cancelSubmenuHide();

        // Hide current submenu if different from the one being shown
        if (this.currentSubmenu && this.currentSubmenu !== submenu) {
            this.hideSubmenu(this.currentSubmenu);
        }

        // Show the new submenu
        submenu.classList.add('show');
        this.currentSubmenu = submenu;
    }

    /**
     * Hide submenu
     */
    hideSubmenu(submenu) {
        submenu.classList.remove('show');
        if (this.currentSubmenu === submenu) {
            this.currentSubmenu = null;
        }
    }

    /**
     * Schedule submenu hide with delay
     */
    scheduleSubmenuHide(submenu) {
        this.cancelSubmenuHide();
        this.submenuTimer = setTimeout(() => {
            this.hideSubmenu(submenu);
        }, 200); // 200ms delay
    }

    /**
     * Cancel scheduled submenu hide
     */
    cancelSubmenuHide() {
        if (this.submenuTimer) {
            clearTimeout(this.submenuTimer);
            this.submenuTimer = null;
        }
    }

    /**
     * Clean up all event listeners to prevent memory leaks
     */
    cleanupEventListeners() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            if (element && element.removeEventListener) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners = [];
    }

    getContrastingColor(backgroundColor) {
        // Convert hex to RGB
        const hex = backgroundColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return white for dark colors, dark for light colors
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    /**
     * Get available funding for a category from server game state
     */
    getCategoryFunding(category) {
        // Delegate to building system for consistency
        return this.game.buildingSystem.getCategoryFunding(category);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextMenuSystem;
}