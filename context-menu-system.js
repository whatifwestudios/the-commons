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
        this.game.parcelReach = this.game.calculateParcelReach(row, col);
        this.game.scheduleRender(); // Redraw to show reach visualization
        this.game.hoveredTile = { row, col };
        this.game.updateParcelIllumination(this.game.hoveredTile);

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

        if (!parcel.owner) {
            // Unowned parcel
            this.createUnownedParcelMenu(statusEl, contentEl, row, col, price);
        } else if (this.game.isCurrentPlayer(parcel.owner)) {
            // Player-owned parcel
            this.createPlayerOwnedParcelMenu(statusEl, contentEl, row, col, parcel);
        } else {
            // Competitor-owned parcel
            this.createCompetitorOwnedParcelMenu(statusEl, contentEl, row, col, parcel);
        }

        // Position the context menu
        this.positionMenu(mouseX, mouseY);

        // Show the menu
        this.contextMenu.classList.add('visible');
    }

    /**
     * Hide context menu
     */
    hide() {
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.classList.remove('visible');
        }

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
        const playerName = (this.game.playerSettings && this.game.playerSettings.name) || 'PLAYER';
        statusEl.textContent = `OWNED BY ${playerName.toUpperCase()}`;
        statusEl.classList.add('owned');


        if (!parcel.building) {
            // Empty parcel - show auction and building categories
            this.createEmptyParcelMenu(contentEl, row, col);
        } else {
            // Built parcel - show auction, destroy, upgrade, and amenity options
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

        statusEl.textContent = `OWNED BY ${ownerName}`;
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

        const auctionBtn = document.createElement('button');
        auctionBtn.className = 'context-btn primary';
        auctionBtn.textContent = 'START AUCTION';
        auctionBtn.onclick = async () => await this.game.startAuction(row, col);
        contentEl.appendChild(auctionBtn);
    }

    /**
     * Position context menu at coordinates
     */
    positionMenu(mouseX, mouseY) {
        // Position the context menu to match tooltip position exactly
        if (this.contextMenu && this.contextMenu.classList) {
            this.contextMenu.style.left = `${mouseX + 30}px`;
            this.contextMenu.style.top = `${mouseY - 80}px`;
        }
    }

    /**
     * Create empty parcel menu
     */
    createEmptyParcelMenu(contentEl, row, col) {
        // Start Auction section
        const auctionSection = document.createElement('div');
        auctionSection.className = 'context-section';

        const auctionBtn = document.createElement('button');
        auctionBtn.className = 'context-btn primary';

        // Get market value for display
        const parcel = this.game.grid[row][col];
        const landValue = parcel.landValue?.calculatedValue || this.game.getParcelPrice(row, col);

        auctionBtn.innerHTML = `START AUCTION<br><small>Mkt: $${landValue.toLocaleString()}</small>`;
        auctionBtn.onclick = async () => await this.game.startAuction(row, col);
        auctionSection.appendChild(auctionBtn);
        contentEl.appendChild(auctionSection);

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
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="width: 6px; height: 6px; border-radius: 50%; background: ${indicatorColor};"></div>
                        <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${fundingDisplay}
                        <span class="arrow">▶</span>
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

        const auctionBtn = document.createElement('button');
        auctionBtn.className = 'context-btn primary';
        auctionBtn.textContent = 'START AUCTION';
        auctionBtn.onclick = async () => await this.game.startAuction(row, col);
        actionsSection.appendChild(auctionBtn);

        const destroyBtn = document.createElement('button');
        destroyBtn.className = 'context-btn';

        // Calculate and show demolition fee
        const building = this.game.buildingManager.getBuildingById(parcel.building);
        const currentValue = this.calculateCurrentBuildingValue(parcel, building);
        const demolitionFee = Math.round(currentValue * 0.1);

        destroyBtn.textContent = `DESTROY BUILDING - $${demolitionFee}`;
        destroyBtn.onclick = () => this.game.buildingSystem.demolishBuilding(row, col);

        // Disable if player can't afford demolition fee
        if (this.game.playerCash < demolitionFee) {
            destroyBtn.disabled = true;
            destroyBtn.classList.add('disabled');
        }

        actionsSection.appendChild(destroyBtn);

        contentEl.appendChild(actionsSection);

        // Data insights functionality moved to separate system

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

            // Disable if player can't afford
            if (this.game.playerCash < repairCost) {
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
            btn.addEventListener('mouseenter', (e) => {
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
            });

            btn.addEventListener('mouseleave', () => {
                this.hideBuildingInfo();
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
            this.game.updateBuildingRequirements(buildingData.name);

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
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextMenuSystem;
}