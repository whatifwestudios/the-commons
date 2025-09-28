/**
 * TooltipSystemV2 - Unified Tooltip Management
 * Replaces all existing tooltip systems with a single, elegant solution
 * Features smooth tooltip-to-context-menu transitions and smart positioning
 */

class TooltipSystemV2 {
    constructor(game) {
        this.game = game;
        this.element = null;
        this.currentType = null; // 'parcel', 'sidebar', 'dcf', 'simple'
        this.currentData = null;
        this.isTransitioning = false;
        this.isVisible = false;

        // Only hide timer for smooth transitions
        this.hideTimer = null;

        // CARENS hint messages for natural language tooltips
        this.carensHints = {
            culture: [
                "The people here are bored",
                "This area lacks cultural enrichment",
                "Residents yearn for arts and entertainment"
            ],
            affordability: [
                "Housing costs are straining families here",
                "This area is becoming unaffordable",
                "People are struggling with living expenses"
            ],
            resilience: [
                "This community feels vulnerable",
                "Residents worry about economic shocks",
                "The area lacks economic stability"
            ],
            environment: [
                "The air quality here concerns residents",
                "This area needs more green spaces",
                "Environmental conditions are declining"
            ],
            noise: [
                "The people here are tired of the noise",
                "Residents complain about sound pollution",
                "This area is too loud for comfort"
            ],
            safety: [
                "People don't feel safe here",
                "This area needs better security",
                "Residents are concerned about crime"
            ]
        };

        this.createTooltipElement();
        this.setupEventListeners();

        console.log('🎯 TooltipSystemV2 initialized');
    }

    createTooltipElement() {
        // Remove any existing tooltip
        const existing = document.getElementById('unified-tooltip-v2');
        if (existing) existing.remove();

        this.element = document.createElement('div');
        this.element.id = 'unified-tooltip-v2';
        this.element.className = 'tooltip-v2 hidden';

        // CSS styled to match crisp tooltip - sharp corners, professional
        this.element.style.cssText = `
            position: fixed;
            background: #111111;
            border: 1px solid #2a2a2a;
            border-radius: 4px;
            padding: 12px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 12px;
            line-height: 1.4;
            color: white;
            z-index: 10000;
            min-width: 200px;
            max-width: 250px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transform: scale(0.95) perspective(1000px);
            transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                       transform 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                       visibility 0.2s;
            will-change: opacity, transform;
            transform-style: preserve-3d;
            backface-visibility: hidden;
        `;

        document.body.appendChild(this.element);
    }

    // ==================== MAIN SHOW METHOD ====================

    show(type, data, x, y) {
        clearTimeout(this.hideTimer);

        this.currentType = type;
        this.currentData = data;

        // INSTANT RESPONSE - No debouncing for gaming experience
        switch(type) {
            case 'parcel':
                this.showParcelTooltip(data, x, y);
                break;
            case 'sidebar':
                this.showSidebarTooltip(data, x, y);
                break;
            case 'dcf':
                this.showDCFTooltip(data, x, y);
                break;
            case 'simple':
                this.showSimpleTooltip(data, x, y);
                break;
        }
    }

    // ==================== PARCEL TOOLTIPS ====================

    showParcelTooltip(data, x, y) {
        const { row, col } = data;
        const tooltipData = this.getParcelTooltipData(row, col);

        if (!tooltipData) {
            this.hide();
            return;
        }

        this.element.innerHTML = this.renderParcelTooltip(tooltipData);
        this.element.className = 'tooltip-v2 parcel-tooltip';

        // Store coordinates for context menu transition
        this.element.dataset.row = row;
        this.element.dataset.col = col;

        // Store exact position for context menu transition
        this.lastPosition = { x, y, row, col };
        this.lastTooltipBounds = null; // Will be set after positioning

        this.positionAndShow(x, y);
    }

    getParcelTooltipData(row, col) {
        try {
            const parcel = this.game.grid[row][col];
            if (!parcel) return null;

            const building = parcel.building ? this.game.getBuildingDataByName(parcel.building.type || parcel.building.id || parcel.building) : null;
            const coord = this.game.getParcelCoordinate(row, col);

            const data = {
                row,
                col,
                coord,
                hasBuilding: !!parcel.building,
                parcel,
                building
            };

            if (!parcel.building) {
                // Empty parcel
                data.price = this.game.getParcelPrice(row, col);
                // Server-authoritative ownership: treat "City" and "unclaimed" as unowned for player interaction
                data.isOwned = !!(parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed');
                data.owner = parcel.owner;
            } else {
                // Building data - fix [object Object] issue with debug
                console.log('🔍 Building debug:', {
                    parcelBuilding: parcel.building,
                    buildingObject: building,
                    buildingName: building?.name,
                    buildingId: building?.id,
                    buildingType: typeof building
                });

                let buildingName = parcel.building; // fallback to building ID
                if (building) {
                    // More thorough name extraction
                    if (typeof building.name === 'string' && building.name.length > 0) {
                        buildingName = building.name;
                    } else if (typeof building.id === 'string' && building.id.length > 0) {
                        buildingName = building.id;
                    } else if (typeof building === 'object' && building.constructor?.name) {
                        buildingName = building.constructor.name;
                    } else {
                        // Last resort: use parcel.building ID and clean it up
                        buildingName = parcel.building.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    }
                }
                data.buildingName = buildingName;
                data.isUnderConstruction = parcel._isUnderConstruction || false;
                data.constructionProgress = parcel._constructionProgress || 1.0;

                // Get performance data from server or cache
                data.needs = this.getBuildingNeeds(row, col);
                data.carens = this.getBuildingCarens(row, col);
                data.performance = this.getBuildingPerformance(row, col);
                data.netRevenue = this.getBuildingRevenue(row, col);
                data.condition = parcel.condition || 100;
            }

            return data;
        } catch (error) {
            console.warn('Error getting parcel tooltip data:', error);
            return null;
        }
    }

    renderParcelTooltip(data) {
        const statusClass = this.getParcelStatusClass(data);
        const statusText = this.getParcelStatusText(data);

        return `
            <div class="tooltip-header">
                <div class="tooltip-coord">${data.coord}</div>
                <div class="tooltip-status ${statusClass}">${statusText}</div>
            </div>
            <div class="tooltip-content">
                ${data.hasBuilding ?
                    this.renderBuildingTooltipContent(data) :
                    this.renderEmptyParcelTooltipContent(data)
                }
            </div>
        `;
    }

    renderBuildingTooltipContent(data) {
        if (data.isUnderConstruction) {
            return `
                ${this.renderBuildingHeader(data)}
                ${this.renderConstructionStatus(data)}
            `;
        }

        return `
            ${this.renderBuildingHeader(data)}
            ${this.renderCompactPerformance(data)}
            ${this.renderCompactResources(data)}
        `;
    }

    renderEmptyParcelTooltipContent(data) {
        if (data.isOwned) {
            const isPlayerOwned = this.game.isCurrentPlayer(data.owner);
            const currentId = window.PlayerUtils?.getCurrentPlayerId();
            console.log('🔍 OWNERSHIP CHECK: parcel.owner:', data.owner, 'getCurrentPlayerId():', currentId, 'isCurrentPlayer:', isPlayerOwned);

            // Handle different ownership types
            let ownerText;
            if (isPlayerOwned) {
                ownerText = 'You own this parcel';
            } else if (data.owner === 'City' || data.owner === 'unclaimed') {
                ownerText = 'Available for purchase';
            } else {
                ownerText = 'Owned by competitor';
            }
            return `
                <div class="empty-parcel owned">
                    <div class="ownership-status">${ownerText}</div>
                    ${this.game.isCurrentPlayer(data.owner) ?
                        '<div class="action-hint">Click to build something here</div>' :
                        (data.owner === 'City' || data.owner === 'unclaimed') ?
                        '<div class="action-hint">Click to purchase from City</div>' : ''
                    }
                </div>
            `;
        } else {
            return `
                <div class="empty-parcel unowned">
                    <div class="action-hint">Click to open menu</div>
                </div>
            `;
        }
    }

    renderBuildingHeader(data) {
        const playerDisplay = this.getPlayerDisplayInfo(data);

        return `
            <div class="building-header">
                <div class="building-name">${data.buildingName}</div>
                ${playerDisplay ? `<div class="player-badge" style="background-color: ${playerDisplay.color}; color: ${playerDisplay.textColor};">${playerDisplay.name}</div>` : ''}
            </div>
        `;
    }

    /**
     * Get player display info with color and auto-contrast text
     */
    getPlayerDisplayInfo(data) {
        if (!data.owner) return null;

        // Get player data from game state
        const playerData = this.game?.gameState?.players?.[data.owner];
        if (!playerData) return null;

        const playerColor = playerData.color || '#4A90E2';
        const playerName = playerData.name || `Player ${data.owner.slice(-4)}`;

        return {
            name: playerName,
            color: playerColor,
            textColor: this.getContrastTextColor(playerColor)
        };
    }

    /**
     * Calculate contrasting text color for background
     */
    getContrastTextColor(backgroundColor) {
        // Remove # if present
        const hex = backgroundColor.replace('#', '');

        // Convert hex to RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return white for dark backgrounds, black for light backgrounds
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    /**
     * Get performance-based color from optimal blue to red
     * @param {number} value - Performance value (0-100)
     * @return {string} - Hex color code
     */
    getPerformanceColor(value) {
        // Optimal blue at 100%, descending to red at 0%
        const optimalBlue = { r: 74, g: 144, b: 226 }; // #4A90E2
        const red = { r: 244, g: 67, b: 54 }; // #f44336

        // Normalize value to 0-1 range
        const normalized = Math.max(0, Math.min(1, value / 100));

        // Interpolate between red (0) and blue (1)
        const r = Math.round(red.r + (optimalBlue.r - red.r) * normalized);
        const g = Math.round(red.g + (optimalBlue.g - red.g) * normalized);
        const b = Math.round(red.b + (optimalBlue.b - red.b) * normalized);

        return `rgb(${r}, ${g}, ${b})`;
    }

    renderConstructionStatus(data) {
        if (!data.isUnderConstruction) return '';

        const progress = Math.round(data.constructionProgress * 100);
        const timeRemaining = this.calculateTimeRemaining(data);

        return `
            <div class="construction-status">
                <div class="construction-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${progress}% Complete</span>
                </div>
                ${timeRemaining ? `<div class="time-remaining">${timeRemaining} remaining</div>` : ''}
            </div>
        `;
    }

    renderOwnerInfo(data) {
        // Get the actual player name from beer hall lobby or game state
        let ownerName = 'Unknown Player';
        let playerColor = '#4CAF50';

        // Check if this is the current player
        if (this.game.isCurrentPlayer(data.parcel.owner)) {
            // Get name from beer hall lobby
            if (window.beerHallLobby?.playerName) {
                ownerName = window.beerHallLobby.playerName;
            }
            // Get color from beer hall lobby
            if (window.beerHallLobby?.selectedColor) {
                playerColor = window.beerHallLobby.selectedColor;
            }
        } else {
            // For other players, try to get from game state
            ownerName = this.getPlayerName(data.parcel.owner);
            playerColor = this.getPlayerColor(data.parcel.owner);
        }

        const contrastColor = this.getContrastingColor(playerColor);

        return `
            <div class="owner-info">
                <span style="color: #aaa; font-weight: 300;">Owned by </span>
                <span class="owner-badge" style="background: ${playerColor}; color: ${contrastColor}; padding: 2px 6px; border-radius: 3px; font-weight: 500;">${ownerName}</span>
            </div>
        `;
    }

    renderCompactPerformance(data) {
        // Get enhanced performance data from server with JEEFHH/CARENS
        const performance = this.getEnhancedBuildingPerformance(data.row, data.col);

        const efficiency = performance.efficiency || data.condition || 90;
        const efficiencyPercent = Math.round(efficiency);
        const condition = performance.condition || data.condition || 100;
        const netRevenue = Math.round(performance.netIncome || data.netRevenue) || 0;

        // Use performance-based blue-to-red color system
        const efficiencyColor = this.getPerformanceColor(efficiency);
        const conditionColor = this.getPerformanceColor(condition);

        // Net revenue uses a different scale - positive revenue gets full blue, negative gets red
        const revenuePerformance = netRevenue >= 0 ? 100 : 0;
        const revenueColor = this.getPerformanceColor(revenuePerformance);

        return `
            <div class="compact-performance">
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300;">Performance: </span>
                    <span style="color: ${efficiencyColor}; font-weight: 400;">${efficiencyPercent}%</span>
                </div>
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300;">Net Revenue: </span>
                    <span style="color: ${revenueColor}; font-weight: 400;">
                        ${netRevenue >= 0 ? '+' : ''}$${netRevenue}/day
                    </span>
                </div>
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300;">Condition: </span>
                    <span style="color: ${conditionColor}; font-weight: 400;">${Math.round(condition)}%</span>
                </div>
            </div>
        `;
    }

    renderCompactResources(data) {
        const buildingData = data.building; // Use pre-fetched building data
        if (!buildingData) return '';

        const resources = buildingData.resources;
        const performance = data.performance || {};
        const needsSatisfaction = this.getBuildingNeedsSatisfaction(data.row, data.col);

        // Get production data
        const production = this.getBuildingProduction(resources);

        // Get top 2 needs for performance improvement
        const topNeeds = this.getTopBuildingNeeds(resources, needsSatisfaction);

        // Check if all JEEFHH needs are satisfied for CARENS display
        const allJeefhhSatisfied = this.areAllJeefhhNeedsSatisfied(topNeeds);

        let html = '';

        // Show production
        if (production.length > 0) {
            html += `
                <div class="tooltip-section production-section">
                    <div class="section-header">🏭 Produces</div>
                    <div class="production-list">
                        ${production.map(item => `
                            <div class="production-item">${item.amount} ${item.resource}</div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Show top needs for performance improvement
        if (topNeeds.length > 0 && !allJeefhhSatisfied) {
            html += `
                <div class="tooltip-section needs-section">
                    <div class="section-header">⚡ Needs</div>
                    <div class="needs-list">
                        ${topNeeds.slice(0, 2).map(need => `
                            <div class="need-item">
                                <span class="need-resource">${need.resource}</span>
                                <span class="need-satisfaction ${this.getNeedSatisfactionClass(need.satisfaction)}">
                                    ${Math.ceil(need.amount || 1)} units
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Show CARENS impacts when JEEFHH needs are satisfied
        if (allJeefhhSatisfied && buildingData.livability) {
            html += this.renderCarensImpacts(buildingData.livability);
        }

        return html;
    }

    /**
     * Get building production from resources data
     */
    getBuildingProduction(resources) {
        if (!resources) return [];

        const production = [];
        const resourceTypes = [
            { key: 'jobsProvided', name: 'jobs' },
            { key: 'energyProvided', name: 'energy' },
            { key: 'educationProvided', name: 'education' },
            { key: 'foodProvided', name: 'food' },
            { key: 'housingProvided', name: 'housing' },
            { key: 'healthcareProvided', name: 'healthcare' }
        ];

        resourceTypes.forEach(type => {
            const amount = resources[type.key];
            if (amount && amount > 0) {
                production.push({ resource: type.name, amount });
            }
        });

        return production;
    }

    /**
     * Get top building needs sorted by satisfaction level
     */
    getTopBuildingNeeds(resources, needsSatisfaction) {
        if (!resources) return [];

        const needs = [];
        const needTypes = [
            { key: 'energyRequired', name: 'energy' },
            { key: 'jobsRequired', name: 'workers' },
            { key: 'foodRequired', name: 'food' },
            { key: 'educationRequired', name: 'education' },
            { key: 'housingRequired', name: 'housing' },
            { key: 'healthcareRequired', name: 'healthcare' }
        ];

        needTypes.forEach(type => {
            const amount = resources[type.key];
            if (amount && amount > 0) {
                const satisfaction = needsSatisfaction[type.name] || 0;
                needs.push({
                    resource: type.name,
                    amount,
                    satisfaction
                });
            }
        });

        // Sort by satisfaction level (lowest first)
        return needs.sort((a, b) => a.satisfaction - b.satisfaction);
    }

    /**
     * Check if all JEEFHH needs are satisfied
     */
    areAllJeefhhNeedsSatisfied(needs) {
        const jeefhhResources = ['energy', 'workers', 'food', 'education', 'housing', 'healthcare'];
        const jeefhhNeeds = needs.filter(need => jeefhhResources.includes(need.resource));

        if (jeefhhNeeds.length === 0) return true; // No JEEFHH needs

        return jeefhhNeeds.every(need => need.satisfaction >= 0.8); // 80% threshold
    }

    /**
     * Get building needs satisfaction data
     */
    getBuildingNeedsSatisfaction(row, col) {
        // This would get actual satisfaction data from the economic engine
        // For now, return mock data based on current game state
        try {
            if (this.game.economicClient) {
                const jeefhh = this.game.economicClient.getJEEFHHStatus();

                return {
                    energy: Math.min(1.0, jeefhh.energy?.multiplier || 1.0),
                    workers: Math.min(1.0, jeefhh.jobs?.multiplier || 1.0),
                    food: Math.min(1.0, jeefhh.food?.multiplier || 1.0),
                    education: Math.min(1.0, jeefhh.education?.multiplier || 1.0),
                    housing: Math.min(1.0, jeefhh.housing?.multiplier || 1.0),
                    healthcare: Math.min(1.0, jeefhh.healthcare?.multiplier || 1.0)
                };
            }
        } catch (error) {
            console.warn('Error getting needs satisfaction:', error);
        }

        // Fallback
        return {
            energy: 0.8,
            workers: 0.8,
            food: 0.8,
            education: 0.8,
            housing: 0.8,
            healthcare: 0.8
        };
    }

    /**
     * Get CSS class for need satisfaction level
     */
    getNeedSatisfactionClass(satisfaction) {
        if (satisfaction >= 0.8) return 'satisfied';
        if (satisfaction >= 0.6) return 'moderate';
        return 'unsatisfied';
    }

    /**
     * Render CARENS impacts when JEEFHH needs are satisfied
     */
    renderCarensImpacts(livability) {
        const impacts = [];
        const carensTypes = [
            { key: 'culture', name: 'Culture', emoji: '🎭' },
            { key: 'affordability', name: 'Affordability', emoji: '💰' },
            { key: 'resilience', name: 'Resilience', emoji: '🛡️' },
            { key: 'environment', name: 'Environment', emoji: '🌿' },
            { key: 'noise', name: 'Noise', emoji: '🔊' },
            { key: 'safety', name: 'Safety', emoji: '🚨' }
        ];

        carensTypes.forEach(type => {
            const value = livability[type.key];
            if (value && Math.abs(value) >= 2) { // Only show meaningful impacts
                impacts.push({
                    name: type.name,
                    emoji: type.emoji,
                    value: value,
                    isPositive: value > 0
                });
            }
        });

        if (impacts.length === 0) return '';

        return `
            <div class="tooltip-section carens-section">
                <div class="section-header">🏛️ CARENS Impact</div>
                <div class="carens-list">
                    ${impacts.map(impact => `
                        <div class="carens-item">
                            <span class="carens-emoji">${impact.emoji}</span>
                            <span class="carens-name">${impact.name}</span>
                            <span class="carens-value ${impact.isPositive ? 'positive' : 'negative'}">
                                ${impact.isPositive ? '+' : ''}${impact.value}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderBuildingValues(data) {
        if (data.isUnderConstruction) return '';

        const buildingData = this.game.getBuildingDataByName(data.parcel.building);
        const buildingValue = buildingData?.cost || 0;
        const landValue = this.game.getParcelPrice(data.row, data.col);

        return `
            <div class="building-values">
                <div class="value-header">Property Values</div>
                <div class="value-row">
                    <span class="value-label">Building Value:</span>
                    <span class="value-amount">$${buildingValue.toLocaleString()}</span>
                </div>
                <div class="value-row">
                    <span class="value-label">Land Value:</span>
                    <span class="value-amount">$${landValue.toLocaleString()}</span>
                </div>
            </div>
        `;
    }

    renderPerformanceMetrics(data) {
        if (data.isUnderConstruction) return '';

        // Get performance data from server
        const performance = data.performance || {};
        const efficiency = performance.efficiency || data.condition || 90;
        const efficiencyPercent = Math.round(efficiency);

        const efficiencyColor = efficiency >= 80 ? '#4CAF50' : efficiency >= 60 ? '#FF9800' : '#f44336';

        return `
            <div class="performance-section">
                <div class="performance-header">Performance Metrics</div>
                <div class="metric-row">
                    <span class="metric-label">Operating Efficiency:</span>
                    <span class="metric-value" style="color: ${efficiencyColor};">${efficiencyPercent}%</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Net Revenue:</span>
                    <span class="metric-value ${data.netRevenue >= 0 ? 'positive' : 'negative'}">
                        ${data.netRevenue >= 0 ? '+' : ''}$${Math.round(data.netRevenue)}/day
                    </span>
                </div>
                ${performance.residents ? `
                    <div class="metric-row">
                        <span class="metric-label">Residents:</span>
                        <span class="metric-value">${performance.residents}</span>
                    </div>
                ` : ''}
                ${performance.workers ? `
                    <div class="metric-row">
                        <span class="metric-label">Workers:</span>
                        <span class="metric-value">${performance.workers}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderBuildingResources(data) {
        if (data.isUnderConstruction) return '';

        const buildingData = this.game.getBuildingDataByName(data.parcel.building);
        if (!buildingData || !buildingData.resources) return '';

        const resources = buildingData.resources;
        const provides = [];
        const needs = [];

        // What this building provides
        if (resources.jobsProvided > 0) provides.push(`${resources.jobsProvided} jobs`);
        if (resources.energyProvided > 0) provides.push(`${resources.energyProvided} energy`);
        if (resources.educationProvided > 0) provides.push(`${resources.educationProvided} education`);
        if (resources.foodProvided > 0) provides.push(`${resources.foodProvided} food`);
        if (resources.housingProvided > 0) provides.push(`${resources.housingProvided} housing`);
        if (resources.healthcareProvided > 0) provides.push(`${resources.healthcareProvided} healthcare`);

        // What this building needs
        if (resources.jobsRequired > 0) needs.push(`${resources.jobsRequired} jobs`);
        if (resources.energyRequired > 0) needs.push(`${resources.energyRequired} energy`);
        if (resources.educationRequired > 0) needs.push(`${resources.educationRequired} education`);
        if (resources.foodRequired > 0) needs.push(`${resources.foodRequired} food`);
        if (resources.housingRequired > 0) needs.push(`${resources.housingRequired} housing`);
        if (resources.healthcareRequired > 0) needs.push(`${resources.healthcareRequired} healthcare`);

        // Check connectivity and supply status
        const connectivityStatus = this.analyzeConnectivity(data.row, data.col, buildingData);

        let html = '';

        if (provides.length > 0) {
            html += `
                <div class="resource-section provides">
                    <div class="resource-header">
                        <span style="color: #4CAF50; margin-right: 6px;">⚡</span>Provides
                    </div>
                    <div class="resource-list">${provides.join(', ')}</div>
                </div>
            `;
        }

        if (needs.length > 0) {
            html += `
                <div class="resource-section needs">
                    <div class="resource-header">
                        <span style="color: #FF9800; margin-right: 6px;">🔋</span>Requires
                    </div>
                    <div class="resource-list">${needs.join(', ')}</div>
                    ${connectivityStatus}
                </div>
            `;
        }

        return html;
    }

    renderConditionAndDecay(data) {
        if (data.isUnderConstruction) return '';

        const condition = data.condition || 100;
        const conditionColor = condition >= 80 ? '#4CAF50' : condition >= 60 ? '#FF9800' : '#f44336';

        // Get decay rate from building data
        const buildingData = this.game.getBuildingDataByName(data.parcel.building);
        const decayRate = buildingData?.decayRate || 0.5; // Default 0.5% per day

        const dailyDecay = decayRate;
        const daysUntilMaintenance = Math.ceil((condition - 60) / dailyDecay); // Maintenance needed at 60%

        return `
            <div class="condition-section">
                <div class="condition-header">Building Condition</div>
                <div class="metric-row">
                    <span class="metric-label">Current Condition:</span>
                    <span class="metric-value" style="color: ${conditionColor};">${Math.round(condition)}%</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Daily Decay:</span>
                    <span class="metric-value" style="color: #999;">-${dailyDecay}%/day</span>
                </div>
                ${condition < 80 ? `
                    <div class="maintenance-warning">
                        <span style="color: ${condition < 60 ? '#f44336' : '#FF9800'};">
                            ${condition < 60 ? '⚠️ Urgent maintenance needed!' :
                              `🔧 Maintenance in ~${daysUntilMaintenance} days`}
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    areJeefhhNeedsSatisfied(needs) {
        if (!needs) return false;

        const jeefhhNeeds = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];

        return jeefhhNeeds.every(need => {
            const satisfaction = needs[need];
            return !satisfaction || satisfaction >= 0.8; // 80% threshold
        });
    }

    renderJeefhhNeeds(needs) {
        if (!needs) return '';

        const jeefhhNeeds = ['jobs', 'energy', 'education', 'food', 'housing', 'healthcare'];

        const unsatisfiedNeeds = jeefhhNeeds
            .filter(need => needs[need] && needs[need] < 0.8)
            .sort((a, b) => needs[a] - needs[b])
            .slice(0, 2); // Top 2 worst needs

        if (unsatisfiedNeeds.length === 0) {
            return '<div class="needs-transition">✓ Basic needs satisfied - Focusing on quality of life</div>';
        }

        return `
            <div class="jeefhh-needs">
                <div class="needs-header">Essential Needs:</div>
                <div class="needs-list">
                    ${unsatisfiedNeeds.map(need => {
                        const satisfaction = Math.round(needs[need] * 100);
                        const criticality = satisfaction < 60 ? 'critical' : 'warning';
                        return `
                            <div class="need-item ${criticality}">
                                <span class="need-name">${need.toUpperCase()}</span>
                                <span class="need-value">${satisfaction}%</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    renderCarensOpportunities(carens) {
        if (!carens) return '';

        const carensAspects = ['culture', 'affordability', 'resilience', 'environment', 'noise', 'safety'];

        const improvements = carensAspects
            .filter(aspect => carens[aspect] && carens[aspect] < 0.7)
            .sort((a, b) => carens[a] - carens[b])[0];

        if (!improvements) {
            return '<div class="carens-excellent">🌟 Excellent quality of life here!</div>';
        }

        const worstAspect = improvements;
        const score = Math.round(carens[worstAspect] * 100);
        const hints = this.carensHints[worstAspect];
        const randomHint = hints[Math.floor(Math.random() * hints.length)];

        return `
            <div class="carens-opportunity">
                <div class="opportunity-header">Quality of Life:</div>
                <div class="carens-hint">💭 ${randomHint}</div>
                <div class="carens-metric">
                    <span class="metric-label">${worstAspect}:</span>
                    <span class="metric-value">${score}%</span>
                </div>
            </div>
        `;
    }

    // ==================== SIDEBAR TOOLTIPS ====================

    showSidebarTooltip(data, x, y) {
        const { metric, value, description } = data;
        const supplyDemandData = this.getSupplyDemandData(metric);
        const vitalColor = this.getVitalColor(metric);
        const topBuildings = this.getTopContributingBuildings(metric);

        this.element.innerHTML = `
            <div class="sidebar-tooltip">
                <div class="metric-header">
                    <div class="metric-name" style="color: ${vitalColor}">${metric ? metric.toUpperCase() : 'UNKNOWN'}</div>
                    <div class="metric-value">${supplyDemandData ? `${supplyDemandData.supply}/${supplyDemandData.demand}` : Math.round(value * 100) + '%'}</div>
                </div>
                ${topBuildings.length > 0 ? `
                    <div class="top-contributors">
                        <div class="contributors-header">Top Contributors:</div>
                        ${topBuildings.map(building => `
                            <div class="contributor-line">
                                <span class="building-name">${building.name}</span>
                                <span class="contribution-value">+${building.contribution}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="metric-description">${description}</div>
            </div>
        `;

        this.element.className = 'tooltip-v2 sidebar-tooltip';
        this.positionAndShow(x, y);
    }

    // ==================== DCF TOOLTIPS ====================

    showDCFTooltip(data, x, y) {
        const { category, breakdown } = data;

        this.element.innerHTML = `
            <div class="dcf-tooltip">
                <div class="dcf-header">${category}</div>
                <div class="dcf-breakdown">
                    ${Object.entries(breakdown).map(([source, amount]) =>
                        `<div class="dcf-line">
                            <span class="dcf-source">${source}</span>
                            <span class="dcf-amount ${amount >= 0 ? 'positive' : 'negative'}">
                                ${amount >= 0 ? '+' : ''}$${amount.toLocaleString()}
                            </span>
                        </div>`
                    ).join('')}
                </div>
            </div>
        `;

        this.element.className = 'tooltip-v2 dcf-tooltip';
        this.positionAndShow(x, y);
    }

    // ==================== SIMPLE TOOLTIPS ====================

    showSimpleTooltip(data, x, y) {
        this.element.innerHTML = `<div class="simple-tooltip">${data.text}</div>`;
        this.element.className = 'tooltip-v2 simple-tooltip';
        this.positionAndShow(x, y);
    }

    // ==================== POSITIONING & VISIBILITY ====================

    positionAndShow(x, y) {
        // Position first (while hidden)
        this.positionTooltip(x, y);

        // Store final bounds for context menu transition
        setTimeout(() => {
            if (this.element && this.isVisible) {
                this.lastTooltipBounds = this.element.getBoundingClientRect();
            }
        }, 0);

        // Then show immediately - crisp and responsive
        this.element.style.visibility = 'visible';
        this.element.style.opacity = '1';
        this.element.style.transform = 'scale(1) perspective(1000px)';
        this.isVisible = true;
    }

    positionTooltip(x, y) {
        // Get tooltip dimensions
        this.element.style.opacity = '0';
        this.element.style.visibility = 'visible';
        const rect = this.element.getBoundingClientRect();
        this.element.style.visibility = '';

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 15;

        let left = x + margin;
        let top = y - rect.height - margin;

        // Avoid right edge
        if (left + rect.width > viewportWidth - margin) {
            left = x - rect.width - margin;
        }

        // Avoid top edge
        if (top < margin) {
            top = y + margin;
        }

        // Avoid bottom edge
        if (top + rect.height > viewportHeight - margin) {
            top = viewportHeight - rect.height - margin;
        }

        // Avoid left edge
        if (left < margin) {
            left = margin;
        }

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    }

    hide() {
        if (!this.isVisible) return;

        // Immediate hide for responsive gaming experience
        this.element.style.opacity = '0';
        this.element.style.visibility = 'hidden';
        this.element.style.transform = 'scale(0.95) perspective(1000px)';
        this.isVisible = false;

        this.currentType = null;
        this.currentData = null;
    }

    // ==================== TRANSITION TO CONTEXT MENU ====================

    transitionToContextMenu(row, col, mouseX, mouseY) {
        if (this.currentType !== 'parcel' || this.isTransitioning) return;

        this.isTransitioning = true;

        // Use exact tooltip position for perfect alignment
        const useTooltipPosition = this.lastTooltipBounds && this.lastPosition;
        const menuX = useTooltipPosition ? this.lastTooltipBounds.left : mouseX;
        const menuY = useTooltipPosition ? this.lastTooltipBounds.top : mouseY;

        // Fade out tooltip with scale
        this.element.style.opacity = '0';
        this.element.style.transform = 'scale(0.9)';
        this.element.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';

        setTimeout(() => {
            this.hide();

            // Show context menu at exact tooltip position for perfect displacement
            if (this.game.contextMenuSystem) {
                this.game.contextMenuSystem.showWithTransition(row, col, menuX, menuY, this.lastTooltipBounds);
            }

            this.isTransitioning = false;
        }, 150);
    }

    // ==================== EVENT LISTENERS ====================

    setupEventListeners() {
        // Canvas events (parcel tooltips) - Higher priority than legacy systems
        if (this.game.canvas) {
            this.game.canvas.addEventListener('mousemove', this.handleCanvasHover.bind(this), { capture: true });
            this.game.canvas.addEventListener('click', this.handleCanvasClick.bind(this), { capture: true });
            this.game.canvas.addEventListener('mouseleave', () => this.hide(), { capture: true });
        }

        // Event delegation for all other tooltip types
        document.addEventListener('mouseenter', this.handleElementHover.bind(this), true);
        document.addEventListener('mouseleave', this.handleElementLeave.bind(this), true);
    }

    handleCanvasHover(e) {
        // Allow other systems (like ParcelHoverV2) to also process mouse events
        // Only prevent default browser behavior, don't stop propagation

        if (this.isTransitioning) return;

        // Don't show tooltip if context menu is open (match crisp tooltip behavior)
        if (this.game.contextMenuSystem?.contextMenu?.classList?.contains('visible')) {
            this.hide();
            return;
        }

        // Get screen coordinates from mouse position (match crisp tooltip method)
        const rect = e.target.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Use the same coordinate conversion as legacy system (two-step process)
        const worldCoords = this.game.screenToWorldCoords(screenX, screenY);
        const coords = this.game.renderingSystem?.fromIsometric(worldCoords.x, worldCoords.y);
        if (coords) {
            this.show('parcel', coords, e.clientX, e.clientY);
        } else {
            this.hide();
        }
    }

    handleCanvasClick(e) {
        if (this.currentType === 'parcel' && this.currentData) {
            const { row, col } = this.currentData;
            this.transitionToContextMenu(row, col, e.clientX, e.clientY);
        }
    }

    handleElementHover(e) {
        // Sidebar metric tooltips
        if (e.target && e.target.matches && e.target.matches('.metric-tooltip[data-tooltip]')) {
            const metric = e.target.dataset.metric;
            const description = e.target.dataset.tooltip;
            const value = this.getSidebarMetricValue(metric);

            this.show('sidebar', { metric, value, description }, e.clientX, e.clientY);
            return;
        }

        // DCF tooltips
        if (e.target && e.target.matches && e.target.matches('[data-tooltip-data]')) {
            try {
                const data = JSON.parse(e.target.dataset.tooltipData);
                this.show('dcf', data, e.clientX, e.clientY);
            } catch (error) {
                console.warn('Invalid DCF tooltip data:', error);
            }
            return;
        }

        // Simple tooltips (title attributes)
        if (e.target && e.target.title && e.target.matches && !e.target.matches('.metric-tooltip')) {
            const text = e.target.title;
            e.target.title = ''; // Remove title to prevent browser tooltip
            e.target.dataset.originalTitle = text; // Store for restoration

            this.show('simple', { text }, e.clientX, e.clientY);
            return;
        }
    }

    handleElementLeave(e) {
        // Restore title attribute if we removed it
        if (e.target && e.target.dataset && e.target.dataset.originalTitle) {
            e.target.title = e.target.dataset.originalTitle;
            delete e.target.dataset.originalTitle;
        }

        this.hide();
    }

    // ==================== HELPER METHODS ====================

    getParcelStatusClass(data) {
        if (!data.hasBuilding) {
            return data.isOwned ? 'owned' : 'unowned';
        }

        if (data.isUnderConstruction) {
            return 'construction';
        }

        return 'built';
    }

    getParcelStatusText(data) {
        if (!data.hasBuilding) {
            if (data.isOwned) {
                if (this.game.isCurrentPlayer(data.owner)) {
                    const playerColor = this.getPlayerColor(data.owner);
                    const contrastColor = this.getContrastingColor(playerColor);
                    return `<span style="color: ${contrastColor}">OWNED BY YOU</span>`;
                } else if (data.owner === 'City' || data.owner === 'unclaimed') {
                    return `AVAILABLE FOR $${data.price.toLocaleString()}`;
                } else {
                    return 'COMPETITOR OWNED';
                }
            }
            return `AVAILABLE FOR $${data.price.toLocaleString()}`;
        }

        if (data.isUnderConstruction) {
            return 'UNDER CONSTRUCTION';
        }

        // Show player name with contrasting color for buildings
        const ownerName = this.getPlayerName(data.parcel.owner);
        const playerColor = this.getPlayerColor(data.parcel.owner);
        const contrastColor = this.getContrastingColor(playerColor);

        return `<span style="color: ${contrastColor}">${ownerName.toUpperCase()}</span>`;
    }

    calculateTimeRemaining(data) {
        // Simplified time calculation - implement based on your construction system
        if (!data.isUnderConstruction) return null;

        // Get building definition to calculate actual remaining time
        const buildingData = this.game.buildingDefinitions?.[data.building.id];
        if (!buildingData) return 'Calculating...';

        const totalConstructionTime = buildingData.constructionTime || 7; // Default 7 days
        const remaining = 1 - data.constructionProgress;
        const remainingDays = remaining * totalConstructionTime;

        // Convert to seconds for more precise display
        const gameSpeed = this.game.gameSpeed || 1; // 1 second = 1 day by default
        const secondsRemaining = Math.ceil(remainingDays / gameSpeed);

        if (secondsRemaining <= 0) return 'Almost ready';
        if (secondsRemaining < 60) return `${secondsRemaining}s`;
        if (secondsRemaining < 3600) return `${Math.ceil(secondsRemaining / 60)}m`;
        return `${Math.ceil(secondsRemaining / 3600)}h`;
    }

    getBuildingNeeds(row, col) {
        // Get from server state or cache
        const key = `${row},${col}`;

        // Try to get from economic client or building efficiencies
        if (this.game.buildingEfficiencies?.has(key)) {
            const efficiency = this.game.buildingEfficiencies.get(key);
            if (efficiency.needs) {
                return efficiency.needs;
            }
        }

        // Try to get from tooltip manager's data collector
        if (this.game.tooltipManager?.dataCollector) {
            const tooltipData = this.game.tooltipManager.dataCollector.getBuildingTooltipData(row, col);
            if (tooltipData?.needs) {
                return tooltipData.needs;
            }
        }

        // Return null if no data available
        return null;
    }

    getBuildingCarens(row, col) {
        // Mock CARENS data - implement with real data
        return {
            culture: 0.4,
            affordability: 0.7,
            resilience: 0.6,
            environment: 0.5,
            noise: 0.8,
            safety: 0.7
        };
    }

    getBuildingPerformance(row, col) {
        const key = `${row},${col}`;

        // Try to get from building efficiencies
        if (this.game.buildingEfficiencies?.has(key)) {
            const efficiency = this.game.buildingEfficiencies.get(key);
            if (efficiency.overallEfficiency !== undefined) {
                return Math.round(efficiency.overallEfficiency * 100);
            }
        }

        // Fallback to condition or default
        const parcel = this.game.grid[row][col];
        return parcel?.condition || 90;
    }

    getBuildingRevenue(row, col) {
        // Try to get from economic client or daily cashflow
        if (this.game.economicClient?.getDailyRevenue) {
            const revenue = this.game.economicClient.getDailyRevenue(row, col);
            if (revenue !== undefined) return revenue;
        }

        // Try to get from tooltip manager
        if (this.game.tooltipManager?.dataCollector) {
            const tooltipData = this.game.tooltipManager.dataCollector.getBuildingTooltipData(row, col);
            if (tooltipData?.netRevenue !== undefined) {
                return tooltipData.netRevenue;
            }
        }

        // Fallback to basic calculation
        const parcel = this.game.grid[row][col];
        if (parcel?.building) {
            const building = this.game.getBuildingDataByName(parcel.building);
            return building?.economics?.maxRevenue || 0;
        }

        return 0;
    }

    getSidebarMetricValue(metric) {
        // Get current metric value from game state
        if (this.game.governanceSystem?.governance) {
            const governance = this.game.governanceSystem.governance;

            // JEEFHH metrics
            switch(metric) {
                case 'jobs':
                    return governance.jeefhh?.jobs?.satisfaction || 0;
                case 'energy':
                    return governance.jeefhh?.energy?.satisfaction || 0;
                case 'education':
                    return governance.jeefhh?.education?.satisfaction || 0;
                case 'food':
                    return governance.jeefhh?.food?.satisfaction || 0;
                case 'housing':
                    return governance.jeefhh?.housing?.satisfaction || 0;
                case 'healthcare':
                    return governance.jeefhh?.healthcare?.satisfaction || 0;

                // CARENS metrics
                case 'culture':
                    return governance.carens?.culture?.score || 0;
                case 'affordability':
                    return governance.carens?.affordability?.score || 0;
                case 'resilience':
                    return governance.carens?.resilience?.score || 0;
                case 'environment':
                    return governance.carens?.environment?.score || 0;
                case 'noise':
                    return governance.carens?.noise?.score || 0;
                case 'safety':
                    return governance.carens?.safety?.score || 0;
            }
        }

        // Fallback to UI manager values if available
        if (this.game.uiManager?.getMetricValue) {
            return this.game.uiManager.getMetricValue(metric);
        }

        return 0.5; // Default 50%
    }

    getSupplyDemandData(metric) {
        // Get supply/demand data from economic client
        if (!this.game.economicClient?.jeefhh) return null;

        const economicData = this.game.economicClient.jeefhh[metric];
        if (!economicData) return null;

        const supply = Math.round(economicData.supply || 0);
        const demand = Math.round(economicData.demand || 0);

        // Calculate utilization percentage
        let utilizationPercent = 0;
        if (supply > 0) {
            utilizationPercent = Math.round((demand / supply) * 100);
        } else if (demand > 0) {
            utilizationPercent = 100; // 100% demand with no supply
        }

        return {
            supply: supply.toLocaleString(),
            demand: demand.toLocaleString(),
            utilization: `${demand.toLocaleString()}/${supply.toLocaleString()} (${utilizationPercent}%)`
        };
    }

    getVitalColor(metric) {
        // Using actual colors from the sidebar CSS
        const colors = {
            // JEEFHH metrics
            'jobs': '#ec4899',        // Pink for jobs
            'energy': '#f59e0b',      // Orange for energy
            'education': '#8b5cf6',   // Purple for education
            'food': '#84cc16',        // Lime for food
            'housing': '#06b6d4',     // Cyan for housing
            'healthcare': '#ef4444',  // Red for healthcare

            // CARENS metrics
            'culture': '#a855f7',     // Purple for culture
            'affordability': '#f97316', // Orange for affordability
            'resilience': '#14b8a6',  // Teal for resilience
            'environment': '#22c55e', // Green for environment
            'noise': '#6b7280',       // Gray for noise
            'safety': '#ef4444'       // Red for safety
        };
        return colors[metric?.toLowerCase()] || '#e0e0e0';
    }

    getTopContributingBuildings(metric) {
        try {
            // Get actual buildings from the game state
            if (!this.game?.grid) return [];

            const buildings = [];

            // Scan the grid for built buildings
            for (let row = 0; row < this.game.gridSize; row++) {
                for (let col = 0; col < this.game.gridSize; col++) {
                    const parcel = this.game.grid[row][col];
                    if (parcel?.building && !parcel._isUnderConstruction) {
                        // Get building data
                        const buildingData = this.game.getBuildingDataByName?.(parcel.building);
                        if (buildingData) {
                            // Calculate contribution for this metric
                            const contribution = this.calculateBuildingContribution(buildingData, metric);
                            if (contribution > 0) {
                                buildings.push({
                                    name: buildingData.name || parcel.building,
                                    contribution: contribution.toString(),
                                    location: `${String.fromCharCode(65 + col)}${row + 1}`
                                });
                            }
                        }
                    }
                }
            }

            // Sort by contribution and return top 5
            return buildings
                .sort((a, b) => parseInt(b.contribution) - parseInt(a.contribution))
                .slice(0, 5);
        } catch (error) {
            console.warn('Error getting building contributions:', error);
            return [];
        }
    }

    calculateBuildingContribution(buildingData, metric) {
        // Extract relevant values from building data based on metric
        if (!buildingData || !buildingData.jeefhh && !buildingData.carens) return 0;

        const metricLower = metric?.toLowerCase();

        // Check JEEFHH metrics
        if (buildingData.jeefhh && buildingData.jeefhh[metricLower]) {
            return Math.abs(buildingData.jeefhh[metricLower]);
        }

        // Check CARENS metrics
        if (buildingData.carens && buildingData.carens[metricLower]) {
            return Math.abs(buildingData.carens[metricLower]);
        }

        return 0;
    }

    analyzeConnectivity(row, col, buildingData) {
        // Get efficiency data from the game
        const key = `${row},${col}`;
        const efficiencyData = this.game.buildingEfficiencies?.get(key);

        if (!efficiencyData || !efficiencyData.needs) {
            return '<div class="connectivity-status">🔍 Analyzing connectivity...</div>';
        }

        const issues = [];
        const satisfied = [];

        Object.keys(efficiencyData.needs).forEach(resource => {
            const need = efficiencyData.needs[resource];
            if (need.satisfaction < 0.8) {
                if (need.connectivityIssue) {
                    issues.push(`🚫 ${resource} (no road access)`);
                } else if (need.supplyShortage) {
                    issues.push(`📉 ${resource} (insufficient supply)`);
                }
            } else {
                satisfied.push(resource);
            }
        });

        if (issues.length > 0) {
            return `
                <div class="connectivity-issues">
                    <div class="issue-header">Resource Issues:</div>
                    <div class="issue-list">${issues.join(', ')}</div>
                    <div class="issue-hint">Build roads and suppliers to improve performance</div>
                </div>
            `;
        } else if (satisfied.length > 0) {
            return `
                <div class="connectivity-good">
                    <span style="color: #4CAF50;">✅ All needs satisfied via road network</span>
                </div>
            `;
        }

        return '';
    }

    getEnhancedBuildingPerformance(row, col) {
        // Try to get from server-side building data first
        if (this.game.economicClient?.gameState?.buildings) {
            const buildings = this.game.economicClient.gameState.buildings;
            const building = buildings.find(b => b.location && b.location[0] === row && b.location[1] === col);

            if (building && building.performance) {
                return {
                    efficiency: building.performance.efficiency || building.condition || 90,
                    condition: building.condition || 100,
                    netIncome: building.performance.netIncome || 0,
                    residents: building.performance.residents || 0,
                    workers: building.performance.workers || 0,
                    jeefhhMultiplier: building.performance.jeefhhMultiplier || 1.0,
                    carensMultiplier: building.performance.carensMultiplier || 1.0
                };
            }
        }

        // Fallback to basic performance calculation
        const key = `${row},${col}`;
        const efficiencyData = this.game.buildingEfficiencies?.get(key);

        if (efficiencyData) {
            return {
                efficiency: efficiencyData.overallEfficiency * 100 || 90,
                condition: efficiencyData.condition || 100,
                netIncome: efficiencyData.netRevenue || 0,
                residents: efficiencyData.residents || 0,
                workers: efficiencyData.workers || 0,
                jeefhhMultiplier: efficiencyData.jeefhhMultiplier || 1.0,
                carensMultiplier: efficiencyData.carensMultiplier || 1.0
            };
        }

        // Default fallback
        return {
            efficiency: 90,
            condition: 100,
            netIncome: 0,
            residents: 0,
            workers: 0,
            jeefhhMultiplier: 1.0,
            carensMultiplier: 1.0
        };
    }

    // ==================== PLAYER COLOR HELPERS ====================

    getPlayerName(playerId) {
        // For current player, always use beer hall lobby name first
        if (this.game.isCurrentPlayer(playerId)) {
            if (window.beerHallLobby?.playerName) {
                return window.beerHallLobby.playerName;
            }
        }

        // Get player name from game state for other players
        if (this.game?.economicClient?.gameState?.players) {
            const players = this.game.economicClient.gameState.players;
            if (players && players[playerId] && players[playerId].name) {
                return players[playerId].name;
            }
        }

        // Fallback to player ID
        return playerId || 'Unknown Player';
    }

    getPlayerColor(playerId) {
        // Get player color from game state
        if (this.game?.economicClient?.gameState?.players) {
            const player = this.game.economicClient.gameState.players[playerId];
            if (player && player.color) {
                return player.color;
            }
        }

        // Try to get from beer hall lobby for current player
        if (window.beerHallLobby?.selectedColor && this.game.isCurrentPlayer(playerId)) {
            return window.beerHallLobby.selectedColor;
        }

        // Fallback color
        return '#4CAF50';
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

// Auto-attach CSS styles
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        .tooltip-v2 {
            font-family: 'SF Mono', Monaco, 'Roboto Mono', monospace !important;
        }

        .tooltip-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid #333;
        }

        .tooltip-coord {
            font-weight: 300;
            color: white;
        }

        .tooltip-status {
            font-size: 9px;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 3px;
            background: #333;
        }

        .tooltip-status.unowned { background: #666; color: #ccc; }
        .tooltip-status.owned { background: #2196F3; color: #fff; }
        .tooltip-status.construction { background: #FF9800; color: #fff; }
        .tooltip-status.built { background: #4CAF50; color: #fff; }

        .building-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }

        .building-name {
            font-weight: bold;
            color: #e0e0e0;
        }

        .player-badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }

        .construction-status {
            margin: 8px 0;
        }

        .construction-progress {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .progress-bar {
            flex: 1;
            height: 4px;
            background: #333;
            border-radius: 2px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: #4CAF50;
            transition: width 0.3s ease;
        }

        .progress-text {
            font-size: 9px;
            color: #4CAF50;
        }

        .time-remaining {
            font-size: 9px;
            color: #999;
        }

        .performance-metrics {
            margin: 8px 0;
        }

        .metric-row {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
        }

        .metric-label {
            color: #ccc;
        }

        .metric-value {
            font-weight: bold;
        }

        .metric-value.positive { color: #4CAF50; }
        .metric-value.negative { color: #f44336; }

        .jeefhh-needs {
            margin-top: 8px;
        }

        .needs-header {
            font-size: 9px;
            text-transform: uppercase;
            color: #999;
            margin-bottom: 4px;
        }

        .needs-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .need-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2px 4px;
            border-radius: 3px;
        }

        .need-item.warning {
            background: rgba(255, 152, 0, 0.2);
            border-left: 2px solid #FF9800;
        }

        .need-item.critical {
            background: rgba(244, 67, 54, 0.2);
            border-left: 2px solid #f44336;
        }

        .need-name {
            font-size: 9px;
            color: #ccc;
        }

        .need-value {
            font-size: 9px;
            font-weight: bold;
        }

        .carens-opportunity {
            margin-top: 8px;
        }

        .opportunity-header {
            font-size: 9px;
            text-transform: uppercase;
            color: #999;
            margin-bottom: 4px;
        }

        .carens-hint {
            font-style: italic;
            color: #4CAF50;
            margin-bottom: 4px;
            font-size: 10px;
        }

        .carens-metric {
            display: flex;
            justify-content: space-between;
        }

        .carens-excellent {
            color: #4CAF50;
            text-align: center;
            font-weight: bold;
            margin: 8px 0;
        }

        .needs-transition {
            color: #4CAF50;
            text-align: center;
            margin: 8px 0;
            font-size: 10px;
        }

        .empty-parcel {
            text-align: center;
            padding: 8px 0;
        }

        .parcel-price {
            font-weight: bold;
            color: #4CAF50;
            margin-bottom: 4px;
        }

        .action-hint {
            font-size: 9px;
            color: #999;
        }

        .ownership-status {
            font-weight: bold;
            margin-bottom: 4px;
        }

        .sidebar-tooltip .metric-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }

        .sidebar-tooltip .metric-name {
            font-weight: bold;
            color: #4CAF50;
        }

        .sidebar-tooltip .metric-value {
            font-weight: bold;
            color: #e0e0e0;
        }

        .sidebar-tooltip .metric-description {
            font-size: 10px;
            color: #ccc;
            line-height: 1.3;
        }

        .top-contributors {
            margin: 8px 0;
            padding-top: 6px;
            border-top: 1px solid #333;
        }

        .contributors-header {
            font-size: 10px;
            color: #aaa;
            margin-bottom: 4px;
            font-weight: bold;
        }

        .contributor-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 9px;
            margin-bottom: 2px;
        }

        .building-name {
            color: #ccc;
        }

        .contribution-value {
            color: #4CAF50;
            font-weight: bold;
        }

        .dcf-tooltip .dcf-header {
            font-weight: bold;
            color: #4CAF50;
            margin-bottom: 6px;
        }

        .dcf-breakdown {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .dcf-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .dcf-source {
            color: #ccc;
            font-size: 10px;
        }

        .dcf-amount {
            font-weight: bold;
            font-size: 10px;
        }

        .dcf-amount.positive { color: #4CAF50; }
        .dcf-amount.negative { color: #f44336; }

        .simple-tooltip {
            font-size: 10px;
            color: #e0e0e0;
            max-width: 200px;
        }

        /* Compact building tooltip styles */
        .owner-info {
            font-size: 10px;
            margin-bottom: 6px;
            padding-bottom: 4px;
            border-bottom: 1px solid #333;
        }

        .compact-performance {
            margin: 6px 0;
            padding: 4px 0;
            border-bottom: 1px solid #1a1a1a;
        }

        .perf-line {
            font-size: 11px;
            margin: 3px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .compact-resources {
            font-size: 11px;
            margin: 4px 0;
            line-height: 1.3;
        }

        /* Enhanced building tooltip sections */
        .tooltip-section {
            margin: 8px 0;
            padding: 6px 0;
            border-top: 1px solid #333;
        }

        .tooltip-section:first-child {
            border-top: none;
            margin-top: 0;
        }

        .section-header {
            font-size: 10px;
            font-weight: 600;
            color: #4A90E2;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .production-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .production-item {
            background: rgba(76, 175, 80, 0.1);
            color: #4CAF50;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 500;
            text-align: left;
        }

        .needs-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .need-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
        }

        .need-resource {
            color: #ccc;
            text-transform: capitalize;
        }

        .need-satisfaction {
            font-weight: 600;
            padding: 1px 4px;
            border-radius: 2px;
            font-size: 9px;
        }

        .need-satisfaction.satisfied {
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
        }

        .need-satisfaction.moderate {
            background: rgba(255, 152, 0, 0.2);
            color: #FF9800;
        }

        .need-satisfaction.unsatisfied {
            background: rgba(244, 67, 54, 0.2);
            color: #f44336;
        }

        .carens-list {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .carens-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 10px;
        }

        .carens-emoji {
            font-size: 12px;
            width: 16px;
            text-align: center;
        }

        .carens-name {
            flex: 1;
            color: #ccc;
        }

        .carens-value {
            font-weight: 600;
            font-size: 10px;
        }

        .carens-value.positive {
            color: #4CAF50;
        }

        .carens-value.negative {
            color: #f44336;
        }
    `;

    document.head.appendChild(style);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TooltipSystemV2;
}