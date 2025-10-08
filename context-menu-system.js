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
        // Copy header from tooltip to preserve exact layout, then update content
        if (this.game.tooltipSystemV2?.element) {
            const tooltipHeader = this.game.tooltipSystemV2.element.querySelector('.unified-header');
            if (tooltipHeader) {
                // Clone the header to preserve it exactly
                const headerClone = tooltipHeader.cloneNode(true);

                // Ensure cloned header is immediately visible at full opacity
                headerClone.style.opacity = '1';

                // Set up menu structure with cloned header
                this.contextMenu.innerHTML = '';
                this.contextMenu.appendChild(headerClone);

                // Add empty content container
                const contentDiv = document.createElement('div');
                contentDiv.className = 'context-content';
                this.contextMenu.appendChild(contentDiv);

                // Now populate the content (not the header)
                this.setupMenuContentOnly(row, col);
            } else {
                // Fallback to normal setup if tooltip header not found
                this.setupMenuContent(row, col);
            }
        } else {
            // Fallback to normal setup
            this.setupMenuContent(row, col);
        }

        // Show menu first (invisible) to get actual dimensions
        this.contextMenu.style.visibility = 'hidden';
        this.contextMenu.classList.add('visible');
        this.isMenuOpen = true;

        // Wait for DOM to render, then position with actual dimensions
        requestAnimationFrame(() => {
            // Position at tooltip location with edge detection
            if (tooltipBounds) {
                // Get ACTUAL rendered dimensions
                const menuWidth = this.contextMenu.offsetWidth;
                const menuHeight = this.contextMenu.offsetHeight;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let x = tooltipBounds.left;
                let y = tooltipBounds.top;

                // Flip left if overflowing right edge
                if (x + menuWidth > viewportWidth) {
                    x = Math.max(10, viewportWidth - menuWidth - 10);
                }

                // Flip up if overflowing bottom edge
                if (y + menuHeight > viewportHeight) {
                    y = Math.max(10, viewportHeight - menuHeight - 10);
                }

                // Ensure menu doesn't go off top or left edges
                x = Math.max(10, x);
                y = Math.max(10, y);

                this.contextMenu.style.left = `${x}px`;
                this.contextMenu.style.top = `${y}px`;
            } else {
                // Fallback to mouse position
                this.positionMenu(mouseX, mouseY);
            }

            // Now make visible and apply transition
            this.contextMenu.style.visibility = 'visible';

            // Apply smooth appearance transition
            this.contextMenu.style.transform = 'scale(0.95)';
            this.contextMenu.style.opacity = '0.8';

            // Animate to full appearance
            setTimeout(() => {
                this.contextMenu.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';
                this.contextMenu.style.opacity = '1';
                this.contextMenu.style.transform = 'scale(1)';
            }, 10);
        });
    }

    /**
     * Setup menu content only (without header) - used for transitions to preserve header
     */
    setupMenuContentOnly(row, col) {
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
        // Use server-authoritative price
        const price = this.game.economicClient?.getParcelPrice(row, col) || 150;

        // Get the existing content element (should already exist from cloned structure)
        const contentEl = this.contextMenu.querySelector('.context-content');
        if (!contentEl) {
            console.error('Context menu content element not found');
            return;
        }

        // Populate content based on parcel state
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            this.createUnownedParcelMenu(contentEl, row, col, price);
        } else if (this.game.isCurrentPlayer(parcel.owner)) {
            this.createPlayerOwnedParcelMenu(contentEl, row, col, parcel);
        } else {
            this.createCompetitorOwnedParcelMenu(contentEl, row, col, parcel);
        }
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
        // Use server-authoritative price
        const price = this.game.economicClient?.getParcelPrice(row, col) || 150;

        // Use unified header utilities for consistent header
        const headerHtml = window.ParcelHeaderUtils.createStandardHeader(this.game, coord, { parcel });

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

        // Debug logging for ownership detection
        console.log(`[CONTEXT MENU] Parcel at [${row},${col}]:`, {
            owner: parcel.owner,
            hasBuilding: !!parcel.building,
            buildingId: parcel.building?.id,
            isCurrentPlayer: this.game.isCurrentPlayer(parcel.owner),
            currentPlayerId: this.game.economicClient?.playerId
        });

        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            // Unowned parcel (includes City-owned)
            console.log('[CONTEXT MENU] Creating unowned parcel menu');
            this.createUnownedParcelMenu(contentEl, row, col, price);
        } else if (this.game.isCurrentPlayer(parcel.owner)) {
            // Player-owned parcel
            console.log('[CONTEXT MENU] Creating player-owned parcel menu');
            this.createPlayerOwnedParcelMenu(contentEl, row, col, parcel);
        } else {
            // Competitor-owned parcel
            console.log('[CONTEXT MENU] Creating competitor-owned parcel menu');
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
        const parcel = this.game.grid[row][col];

        // Check for ANY pending offers - show offer resolution UI and block buying
        if (this.game.landExchange && this.game.landExchange.hasPendingOffersAsOwner()) {
            const offers = this.game.landExchange.getOffersAsOwner();
            const blockHeader = document.createElement('div');
            blockHeader.style.cssText = 'padding: 12px; background: rgba(255, 165, 0, 0.1); border: 1px solid #ffa500; border-radius: 4px; margin-bottom: 12px;';
            blockHeader.innerHTML = `
                <div style="font-size: 12px; font-weight: 600; color: #ffa500; margin-bottom: 4px;">🔒 BUYING BLOCKED</div>
                <div style="font-size: 10px; color: #ccc;">Resolve ${offers.length} pending offer${offers.length > 1 ? 's' : ''} below to unblock</div>
            `;
            contentEl.appendChild(blockHeader);

            // Show pending offers with Accept/Match buttons
            offers.forEach(offer => {
                const offerDiv = document.createElement('div');
                offerDiv.style.cssText = 'background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px; padding: 10px; margin-bottom: 8px;';

                const amountToPay = offer.offerAmount - (offer.parcelLastPaid || 0);

                offerDiv.innerHTML = `
                    <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 8px;">$${offer.offerAmount.toLocaleString()}</div>
                    <div style="display: flex; gap: 6px;">
                        <button class="context-btn" style="flex: 1; font-size: 10px; padding: 6px; background: #4CAF50; color: #000;" onclick="game.landExchange.respondToOffer(${offer.id}, 'accept'); game.contextMenuSystem.hide();">
                            ACCEPT
                        </button>
                        <button class="context-btn" style="flex: 1; font-size: 10px; padding: 6px; background: #ffa500; color: #000;" onclick="game.landExchange.respondToOffer(${offer.id}, 'match'); game.contextMenuSystem.hide();">
                            MATCH (1⚡)
                        </button>
                    </div>
                    <div style="font-size: 9px; color: #888; margin-top: 6px;">Match pays $${amountToPay.toLocaleString()} to treasury + 1 action</div>
                `;
                contentEl.appendChild(offerDiv);
            });

            // Early return - no buy button when offers pending (global block in effect)
            return;
        }

        // No pending offers - show normal buy button
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
        // Check for pending offers on THIS parcel specifically
        if (this.game.landExchange) {
            const offers = this.game.landExchange.getOffersForParcel(row, col);

            if (offers.length > 0) {
                // Show pending offers on THIS parcel - player MUST respond
                this.createPendingOffersMenu(contentEl, row, col, offers);
                return;
            }

            // Check for ANY pending offers ANYWHERE (global block)
            if (this.game.landExchange.hasPendingOffersAsOwner()) {
                const blockHeader = document.createElement('div');
                blockHeader.style.cssText = 'padding: 12px; background: rgba(255, 165, 0, 0.1); border: 1px solid #ffa500; border-radius: 4px; text-align: center;';
                blockHeader.innerHTML = `
                    <div style="font-size: 12px; font-weight: 600; color: #ffa500; margin-bottom: 4px;">🔒 BUILDING BLOCKED</div>
                    <div style="font-size: 10px; color: #ccc;">You have pending offers on other parcels</div>
                    <div style="font-size: 10px; color: #888; margin-top: 4px;">Check LAND EXCHANGE sidebar</div>
                `;
                contentEl.appendChild(blockHeader);
                return;
            }
        }

        if (!parcel.building) {
            // Empty parcel - show building categories
            this.createEmptyParcelMenu(contentEl, row, col);
        } else {
            // Built parcel - show destroy, upgrade, and amenity options
            this.createBuiltParcelMenu(contentEl, row, col, parcel);
        }
    }

    /**
     * Create menu showing pending offers (blocks all other actions)
     */
    createPendingOffersMenu(contentEl, row, col, offers) {
        // Header showing blockage
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px; background: rgba(255, 165, 0, 0.1); border: 1px solid #ffa500; border-radius: 4px; margin-bottom: 12px;';
        header.innerHTML = `
            <div style="font-size: 12px; font-weight: 600; color: #ffa500; margin-bottom: 4px;">🔒 PENDING OFFERS</div>
            <div style="font-size: 10px; color: #ccc;">Respond to offers before building/buying</div>
        `;
        contentEl.appendChild(header);

        // Show each offer with respond buttons
        offers.forEach(offer => {
            const offerDiv = document.createElement('div');
            offerDiv.style.cssText = 'background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 4px; padding: 10px; margin-bottom: 8px;';

            const amountToPay = offer.offerAmount - (offer.parcelLastPaid || 0);

            offerDiv.innerHTML = `
                <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 8px;">$${offer.offerAmount.toLocaleString()}</div>
                <div style="display: flex; gap: 6px;">
                    <button class="context-btn" style="flex: 1; font-size: 10px; padding: 6px; background: #4CAF50; color: #000;" onclick="game.landExchange.respondToOffer(${offer.id}, 'accept'); game.contextMenuSystem.hide();">
                        ACCEPT
                    </button>
                    <button class="context-btn" style="flex: 1; font-size: 10px; padding: 6px; background: #ffa500; color: #000;" onclick="game.landExchange.respondToOffer(${offer.id}, 'match'); game.contextMenuSystem.hide();">
                        MATCH (1⚡)
                    </button>
                </div>
                <div style="font-size: 9px; color: #888; margin-top: 6px;">Match pays $${amountToPay.toLocaleString()} to treasury + 1 action</div>
            `;
            contentEl.appendChild(offerDiv);
        });
    }

    /**
     * Create menu for competitor-owned parcel
     */
    createCompetitorOwnedParcelMenu(contentEl, row, col, parcel) {
        console.log('[CONTEXT MENU] createCompetitorOwnedParcelMenu called:', {
            hasBuilding: !!parcel.building,
            buildingId: parcel.building?.id,
            isMultiplayer: this.game.isMultiplayer,
            contentEl: contentEl
        });

        // All players can view Data Insights and initiate Auctions on competitor parcels
        // Auctions are only available in multiplayer mode

        if (parcel.building) {
            console.log('[CONTEXT MENU] Adding Data Insights button for built competitor parcel');
            // Add Data Insights button for built parcels
            const dataInsightsBtn = document.createElement('button');
            dataInsightsBtn.className = 'context-btn secondary';
            dataInsightsBtn.textContent = '📊 DATA INSIGHTS';
            dataInsightsBtn.onclick = () => {
                this.game.createDataInsightsOverlay(row, col, parcel);
            };
            contentEl.appendChild(dataInsightsBtn);
            console.log('[CONTEXT MENU] Data Insights button added to DOM');
        }

        // Land Exchange: Make Offer button (multiplayer only)
        if (this.game.isMultiplayer && this.game.landExchange) {
            const offerBtn = document.createElement('button');
            offerBtn.className = 'context-btn';
            offerBtn.textContent = '💰 MAKE OFFER';
            offerBtn.onclick = () => {
                this.hide();
                this.game.landExchange.showMakeOfferModal(row, col);
            };
            contentEl.appendChild(offerBtn);
        }
    }

    /**
     * Position context menu at coordinates with edge detection
     */
    positionMenu(mouseX, mouseY) {
        if (!this.contextMenu || !this.contextMenu.classList) return;

        // Get menu dimensions (use offsetWidth/Height if visible, otherwise estimate)
        const menuWidth = this.contextMenu.offsetWidth || 280;
        const menuHeight = this.contextMenu.offsetHeight || 400;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = mouseX;
        let y = mouseY;

        // Add small offset so menu doesn't overlap cursor
        const offsetX = 10;
        const offsetY = 10;

        // Flip left if overflowing right edge
        if (x + menuWidth + offsetX > viewportWidth) {
            x = mouseX - menuWidth - offsetX;
        } else {
            x = mouseX + offsetX;
        }

        // Flip up if overflowing bottom edge
        if (y + menuHeight + offsetY > viewportHeight) {
            y = mouseY - menuHeight - offsetY;
        } else {
            y = mouseY + offsetY;
        }

        // Ensure menu doesn't go off top or left edges
        x = Math.max(10, x);
        y = Math.max(10, y);

        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
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

            // Show gold "$" icon when funds are available
            const fundingDisplay = availableFunds > 0 ?
                `<span class="funding-icon" style="color: #FFD700; font-size: 18px; font-weight: bold;">$</span>` :
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

                // Determine price color - use gold when public funding available
                const displayColor = publicFunding > 0 ? '#FFD700' : '#ccc';

                buildingBtn.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span>${building.name}</span>
                        <span style="color: ${displayColor}; font-weight: 600;">$${playerCost.toLocaleString()}</span>
                    </div>
                `;

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

        // Calculate and show demolition fee (25% of current building value)
        const buildingId = parcel.building?.type || parcel.building?.id || parcel.building;
        const building = this.game.buildingManager?.getBuildingById(buildingId);
        const currentValue = building ? this.calculateCurrentBuildingValue(parcel, building, row, col) : 0;
        const demolitionFee = Math.round(currentValue * 0.25);

        destroyBtn.textContent = `DESTROY BUILDING - $${demolitionFee}`;
        destroyBtn.onclick = () => this.game.buildingSystem.demolishBuilding(row, col);

        // V2 Server-authoritative ONLY - no fallbacks
        const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
        if (currentBalance === null) {
            destroyBtn.textContent = 'Loading...';
            destroyBtn.disabled = true;
        } else if (currentBalance < demolitionFee) {
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

        // Repair Building section (always show cost to restore to 100%)
        const repairSection = document.createElement('div');
        repairSection.className = 'context-section';

        const repairBtn = document.createElement('button');
        repairBtn.className = 'context-btn';

        // Calculate repair cost based on condition to restore to 100%
        // Reuse buildingId from line 513
        const buildingData = this.game.buildingManager?.getBuildingById(buildingId);

        // Show loading state while fetching repair cost
        repairBtn.textContent = 'Repair to 100% - Loading...';
        repairBtn.disabled = true;

        // Fetch repair cost asynchronously
        this.calculateRepairCostAsync(parcel, buildingData, row, col).then(repairCost => {
            repairBtn.textContent = `Repair to 100% - $${repairCost.toLocaleString()}`;

            if (repairCost > 0) {
                repairBtn.onclick = () => this.game.buildingSystem.repairBuilding(row, col);
                repairBtn.disabled = false;

                // V2 Server-authoritative ONLY - no fallbacks
                const currentBalance = this.game.economicClient?.getCurrentPlayerBalance();
                if (currentBalance === null) {
                    repairBtn.textContent = 'Repair to 100% - Loading...';
                    repairBtn.disabled = true;
                } else if (currentBalance < repairCost) {
                    repairBtn.disabled = true;
                    repairBtn.classList.add('disabled');
                }
            } else {
                // Cost is $0, building at 100%
                repairBtn.disabled = true;
                repairBtn.classList.add('disabled');
            }
        });

        repairSection.appendChild(repairBtn);
        contentEl.appendChild(repairSection);
    }

    /**
     * Calculate repair cost asynchronously - handles server fetch
     */
    async calculateRepairCostAsync(parcel, building, row, col) {
        // Try server data first
        if (this.game.economicClient && row !== null && col !== null) {
            try {
                const serverRepairCost = await this.game.economicClient.getBuildingRepairCost(row, col);
                if (serverRepairCost !== undefined && serverRepairCost !== null) {
                    return serverRepairCost;
                }
            } catch (error) {
                console.warn('Failed to fetch repair cost from server:', error);
            }
        }

        // Fallback to client calculation
        return this.calculateRepairCost(parcel, building, row, col);
    }

    /**
     * Calculate repair cost - delegates to building system (sync fallback)
     */
    calculateRepairCost(parcel, building, row, col) {
        return this.game.buildingSystem.calculateRepairCost(parcel, building, row, col);
    }

    /**
     * Calculate current building value - delegates to building system
     */
    calculateCurrentBuildingValue(parcel, building, row, col) {
        return this.game.buildingSystem.calculateCurrentBuildingValue(parcel, building, row, col);
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
     * Show submenu with smart positioning (left/right based on available space)
     */
    showSubmenu(submenu) {
        // Clear any existing timer
        this.cancelSubmenuHide();

        // Hide current submenu if different from the one being shown
        if (this.currentSubmenu && this.currentSubmenu !== submenu) {
            this.hideSubmenu(this.currentSubmenu);
        }

        // Detect if submenu should open to the left
        const menuRect = this.contextMenu.getBoundingClientRect();
        const submenuWidth = 240; // matches CSS width
        const viewportWidth = window.innerWidth;
        const sidebarWidth = 300; // approximate sidebar width

        // Check if opening to the right would collide with sidebar or viewport edge
        const wouldHitSidebar = (menuRect.right + submenuWidth + 8) > (viewportWidth - sidebarWidth);
        const wouldHitEdge = (menuRect.right + submenuWidth + 8) > viewportWidth;

        if (wouldHitSidebar || wouldHitEdge) {
            // Open to the left
            submenu.classList.add('open-left');

            // Update arrow direction for the parent category button
            const categoryBtn = submenu.parentElement.querySelector('.category-btn');
            if (categoryBtn) {
                const arrow = categoryBtn.querySelector('.category-arrow');
                if (arrow) {
                    arrow.textContent = '←';
                }
            }
        } else {
            // Open to the right (default)
            submenu.classList.remove('open-left');

            // Ensure arrow points right
            const categoryBtn = submenu.parentElement.querySelector('.category-btn');
            if (categoryBtn) {
                const arrow = categoryBtn.querySelector('.category-arrow');
                if (arrow) {
                    arrow.textContent = '→';
                }
            }
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