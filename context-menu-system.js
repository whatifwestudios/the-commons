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

        // Set the selected tile and calculate reach
        this.selectedTile = { row, col };
        this.selectedParcel = { row, col };
        this.game.selectedTile = { row, col };
        this.game.selectedParcel = { row, col };
        // V2: Reach visualization removed - server handles connectivity calculations
        this.game.scheduleRender();

        // Update the selected tile display
        const coord = this.game.getParcelCoordinate(row, col);
        if (this.game.domCache.selectedTile) {
            this.game.domCache.selectedTile.textContent = coord;
        }

        const parcel = this.game.grid[row][col];
        const price = this.game.getParcelPrice(row, col);

        const coordEl = this.contextMenu.querySelector('.context-coord');
        if (coordEl) coordEl.textContent = coord;

        const statusEl = this.contextMenu.querySelector('.context-status');
        const contentEl = this.contextMenu.querySelector('.context-content');

        if (!statusEl || !contentEl) {
            console.error('Context menu elements not found');
            return;
        }

        // Clear previous content
        contentEl.innerHTML = '';
        statusEl.className = 'context-status';

        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            // Unowned parcel (includes City-owned)
            this.createUnownedParcelMenu(statusEl, contentEl, row, col, price);
        } else if (this.game.isCurrentPlayer(parcel.owner)) {
            // Player-owned parcel
            this.createPlayerOwnedParcelMenu(statusEl, contentEl, row, col, parcel);
        } else {
            // Competitor-owned parcel
            this.createCompetitorOwnedParcelMenu(statusEl, contentEl, row, col, parcel);
        }

        // Show the menu first
        this.contextMenu.classList.add('visible');

        // Then position it to avoid any layout shifts
        this.positionMenu(mouseX, mouseY);
    }

    /**
     * Show context menu with transition from tooltip
     */
    showWithTransition(row, col, mouseX, mouseY, tooltipBounds) {
        // First, set up the menu content like normal
        this.show(row, col, mouseX, mouseY);

        // Apply initial tooltip-matching styling and position
        if (tooltipBounds) {
            // Start with tooltip-like appearance
            this.contextMenu.style.transform = 'scale(0.9)';
            this.contextMenu.style.opacity = '0';

            // Smooth transition to menu
            setTimeout(() => {
                this.contextMenu.style.transition = 'opacity 200ms ease-in, transform 200ms ease-in';
                this.contextMenu.style.opacity = '1';
                this.contextMenu.style.transform = 'scale(1)';
            }, 10);
        }
    }

    /**
     * Hide context menu
     */
    hide() {
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.classList.remove('visible');
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
        if (this.game.domCache.selectedTile) {
            this.game.domCache.selectedTile.textContent = '--';
        }
        this.game.updateParcelIllumination(null);
        this.game.scheduleRender();
    }

    /**
     * Create menu for unowned parcel
     */
    createUnownedParcelMenu(statusEl, contentEl, row, col, price) {
        statusEl.textContent = 'UNOWNED';
        statusEl.classList.add('unowned');

        const buyBtn = document.createElement('button');
        buyBtn.className = 'context-btn primary';
        buyBtn.textContent = `BUY PARCEL - $${price}`;
        buyBtn.onclick = () => this.game.buildingSystem.purchaseParcel(row, col);
        contentEl.appendChild(buyBtn);
    }

    /**
     * Create menu for player-owned parcel
     */
    createPlayerOwnedParcelMenu(statusEl, contentEl, row, col, parcel) {
        // Use unified player ownership formatter from tooltip system
        const currentPlayerId = this.game.currentPlayerId || window.PlayerUtils?.getCurrentPlayerId() || this.game.playerId;
        const ownershipHtml = this.game.tooltipSystemV2.formatPlayerOwnership(currentPlayerId);
        if (ownershipHtml) {
            statusEl.innerHTML = ownershipHtml;
        } else {
            statusEl.innerHTML = 'OWNED BY YOU';
        }
        statusEl.classList.add('owned');


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
    createCompetitorOwnedParcelMenu(statusEl, contentEl, row, col, parcel) {
        let ownerName = parcel.owner.toUpperCase();

        // Check for competitor names
        if (this.game.competitorNames[parcel.owner]) {
            ownerName = this.game.competitorNames[parcel.owner].toUpperCase();
        }

        // Use unified player ownership formatter from tooltip system
        const ownershipHtml = this.game.tooltipSystemV2.formatPlayerOwnership(parcel.owner);
        if (ownershipHtml) {
            statusEl.innerHTML = ownershipHtml;
        } else {
            statusEl.textContent = `OWNED BY ${ownerName}`;
        }
        statusEl.classList.add('competitor');

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
            const availableFunds = this.game.governanceSystem ?
                this.game.governanceSystem.getCategoryFunding(category) : 0;

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
                `<span style="font-size: 10px; color: ${indicatorColor};">$${availableFunds.toLocaleString()}</span>` :
                '';

            categoryBtn.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${fundingDisplay}
                        <span style="font-size: 12px; opacity: 0.7;">→</span>
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
                const categoryFunding = this.game.governanceSystem ?
                    this.game.governanceSystem.getCategoryFunding(fundingInfo.category) : 0;
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
                            <div style="text-align: right; font-size: 11px;">
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

        // Disable if player can't afford demolition fee - use server-authoritative balance
        const currentBalance = (this.game.economicClient && typeof this.game.economicClient.serverBalance === 'number')
            ? this.game.economicClient.serverBalance
            : this.game.playerCash;

        if (currentBalance < demolitionFee) {
            destroyBtn.disabled = true;
            destroyBtn.classList.add('disabled');
        }

        actionsSection.appendChild(destroyBtn);

        // Add Data Insights button
        const dataInsightsBtn = document.createElement('button');
        dataInsightsBtn.className = 'context-btn secondary';
        dataInsightsBtn.textContent = '📊 DATA INSIGHTS';
        dataInsightsBtn.onclick = () => this.showDataInsights(row, col, parcel);
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

            // Disable if player can't afford - use server-authoritative balance
            const currentBalance = (this.game.economicClient && typeof this.game.economicClient.serverBalance === 'number')
                ? this.game.economicClient.serverBalance
                : this.game.playerCash;

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
     * Show building information panel
     */
    showBuildingInfo(buildingName) {
        try {
            const buildingData = this.game.getBuildingDataByName(buildingName);
            if (!buildingData) return;

            const panel = document.getElementById('building-info-panel');
            if (!panel) {
                console.error('Building info panel not found');
                return;
            }

            // Update panel content
            const titleEl = document.getElementById('building-info-title');
            if (titleEl) {
                titleEl.textContent = buildingData.name;
            }

            // Add building description
            this.game.updateBuildingDescription(buildingData.name);

            // Update supply/demand displays (includes cost and time)
            this.game.updateSupplyDemandDisplay(buildingData);

            // Update requirements display
            this.game.updateBuildingRequirements(buildingData);

            // Set building image
            const img = document.getElementById('building-info-img');
            if (img) {
                if (buildingData.image) {
                    img.src = buildingData.image;
                    img.style.display = 'block';
                } else {
                    img.style.display = 'none';
                }
            }

            // Update soft metric impacts (livability)
            this.game.updateBuildingImpacts(buildingData.impacts);

            // Add Investment Score
            this.game.updateInvestmentScore(buildingData);

            // Show panel
            panel.classList.add('visible');
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
     * Show Data Insights overlay for a building
     */
    showDataInsights(row, col, parcel) {
        // Hide context menu first
        this.hide();

        // Create Data Insights overlay
        this.createDataInsightsOverlay(row, col, parcel);
    }

    /**
     * Create comprehensive Data Insights overlay
     */
    createDataInsightsOverlay(row, col, parcel) {
        // Remove any existing overlay
        const existingOverlay = document.getElementById('data-insights-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'data-insights-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // Create panel
        const panel = document.createElement('div');
        panel.style.cssText = `
            background: #2a2a2a;
            border: 2px solid #4a9eff;
            border-radius: 15px;
            padding: 30px;
            min-width: 800px;
            max-width: 1000px;
            max-height: 80vh;
            overflow-y: auto;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Use grid as single source of truth for parcel data
        const gridParcel = this.game.grid[row][col];
        if (!gridParcel) {
            console.error(`No parcel data found at grid position ${row},${col}`);
            return;
        }

        // Get building data using the grid parcel data
        const buildingData = gridParcel.building ? this.game.getBuildingDataByName(gridParcel.building) : null;
        const coord = this.game.getParcelCoordinate(row, col);

        // Create content
        panel.innerHTML = this.generateDataInsightsContent(row, col, gridParcel, buildingData, coord);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Enable attenuation visualization on game canvas
        this.game.showAttenuationVisualization = true;
        this.game.attenuationCenter = { row, col };
        this.game.scheduleRender();

        // Close on escape or click outside
        const closeOverlay = () => {
            overlay.remove();
            this.game.showAttenuationVisualization = false;
            this.game.scheduleRender();
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeOverlay();
        });

        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                closeOverlay();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }

    /**
     * Generate comprehensive data insights content
     */
    generateDataInsightsContent(row, col, parcel, buildingData, coord) {
        let html = '';

        // Handle missing building data
        if (!buildingData) {
            return `
                <div style="text-align: center; padding: 40px;">
                    <h2 style="color: #ff6b6b;">❌ No Building Data</h2>
                    <p style="color: #aaa;">Building data not available for this location.</p>
                </div>
            `;
        }

        // Header
        html += `
            <div style="text-align: center; margin-bottom: 25px;">
                <h2 style="margin: 0; color: #4a9eff; font-size: 28px;">
                    📊 Data Insights
                </h2>
                <p style="margin: 10px 0 0 0; color: #aaa; font-size: 16px;">
                    ${buildingData.name} at ${coord}
                </p>
            </div>
        `;

        // Building Vitals Impact Section
        html += `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #4CAF50; margin-bottom: 15px;">🏗️ Building Impact on City Vitals</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        `;

        // JEEFHH Impacts
        if (buildingData.resources) {
            html += `<div style="background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 8px;">`;
            html += `<h4 style="color: #4CAF50; margin-bottom: 10px;">JEEFHH Resources</h4>`;

            const jeefhhImpacts = [
                { key: 'jobsProvided', label: 'Jobs', emoji: '💼', type: 'supply' },
                { key: 'jobsRequired', label: 'Jobs', emoji: '👥', type: 'demand' },
                { key: 'energyProvided', label: 'Energy', emoji: '⚡', type: 'supply' },
                { key: 'energyRequired', label: 'Energy', emoji: '⚡', type: 'demand' },
                { key: 'educationProvided', label: 'Education', emoji: '🎓', type: 'supply' },
                { key: 'educationRequired', label: 'Education', emoji: '🎓', type: 'demand' },
                { key: 'foodProvided', label: 'Food', emoji: '🍞', type: 'supply' },
                { key: 'foodRequired', label: 'Food', emoji: '🍞', type: 'demand' },
                { key: 'housingProvided', label: 'Housing', emoji: '🏠', type: 'supply' },
                { key: 'housingRequired', label: 'Housing', emoji: '🏠', type: 'demand' },
                { key: 'healthcareProvided', label: 'Healthcare', emoji: '🏥', type: 'supply' },
                { key: 'healthcareRequired', label: 'Healthcare', emoji: '🏥', type: 'demand' }
            ];

            jeefhhImpacts.forEach(impact => {
                const value = buildingData.resources[impact.key];
                if (value && value > 0) {
                    const color = impact.type === 'supply' ? '#4CAF50' : '#FF9800';
                    const prefix = impact.type === 'supply' ? '+' : '-';
                    html += `<div style="margin-bottom: 5px; color: ${color};">
                        ${impact.emoji} ${prefix}${value} ${impact.label} (${impact.type})
                    </div>`;
                }
            });

            html += `</div>`;
        }

        // CARENS Impacts
        if (buildingData.livability) {
            html += `<div style="background: rgba(156, 39, 176, 0.1); padding: 15px; border-radius: 8px;">`;
            html += `<h4 style="color: #9C27B0; margin-bottom: 10px;">CARENS Livability</h4>`;

            const carensImpacts = [
                { key: 'culture', emoji: '🎨' },
                { key: 'affordability', emoji: '💰' },
                { key: 'resilience', emoji: '🛡️' },
                { key: 'environment', emoji: '🌿' },
                { key: 'noise', emoji: '🔊' },
                { key: 'safety', emoji: '🚨' }
            ];

            carensImpacts.forEach(impact => {
                const livabilityData = buildingData.livability[impact.key];
                if (livabilityData && typeof livabilityData.impact === 'number') {
                    const value = livabilityData.impact;
                    const attenuation = livabilityData.attenuation || 1;
                    const color = value > 0 ? '#4CAF50' : '#F44336';
                    const prefix = value > 0 ? '+' : '';
                    html += `<div style="margin-bottom: 8px; color: ${color};">
                        ${impact.emoji} ${prefix}${value} ${impact.key}
                        <div style="font-size: 12px; color: #aaa; margin-left: 20px;">
                            Attenuation: ${attenuation} tiles
                        </div>
                    </div>`;
                }
            });

            html += `</div>`;
        }

        html += `</div></div>`;

        // Performance and Economics Section
        html += `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #2196F3; margin-bottom: 15px;">💼 Performance & Economics</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        `;

        // Performance metrics
        html += `<div style="background: rgba(33, 150, 243, 0.1); padding: 15px; border-radius: 8px;">`;
        html += `<h4 style="color: #2196F3; margin-bottom: 10px;">Performance</h4>`;

        if (buildingData.economics) {
            html += `<div style="margin-bottom: 5px;">💰 Max Revenue: $${buildingData.economics.maxRevenue}/day</div>`;
            html += `<div style="margin-bottom: 5px;">🏗️ Build Cost: $${buildingData.economics.buildCost}</div>`;
            html += `<div style="margin-bottom: 5px;">⏱️ Construction: ${buildingData.economics.constructionDays} days</div>`;
        }

        html += `</div>`;

        // Land value impact
        html += `<div style="background: rgba(255, 193, 7, 0.1); padding: 15px; border-radius: 8px;">`;
        html += `<h4 style="color: #FFC107; margin-bottom: 10px;">Land Value Impact</h4>`;
        html += `<div style="margin-bottom: 5px;">🏞️ Current Land Value: Calculating...</div>`;
        html += `<div style="margin-bottom: 5px;">📈 Value Multiplier: Active CARENS impacts</div>`;
        html += `<div style="margin-bottom: 5px;">🎯 Proximity Effects: See green overlay</div>`;
        html += `</div>`;

        html += `</div></div>`;

        // Instructions
        html += `
            <div style="background: rgba(74, 158, 255, 0.1); padding: 20px; border-radius: 8px; text-align: center;">
                <h4 style="color: #4a9eff; margin-bottom: 10px;">🎮 Attenuation Visualization Active</h4>
                <p style="margin: 0; color: #ccc;">
                    The game canvas now shows the <strong style="color: #4CAF50;">green attenuation overlay</strong>
                    displaying this building's influence radius with 6-step gradient fade.
                </p>
                <p style="margin: 10px 0 0 0; color: #aaa; font-size: 14px;">
                    Press <kbd style="background: #444; padding: 2px 6px; border-radius: 3px;">ESC</kbd> or click outside to close
                </p>
            </div>
        `;

        return html;
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
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextMenuSystem;
}