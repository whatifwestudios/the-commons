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

    }

    /**
     * Format CARENS value consistently across all UI (-100 to +100 scale)
     */
    formatCarensValue(points, showEmoji = true) {
        if (typeof points !== 'number') return showEmoji ? '🔄 --' : '--';

        const clampedPoints = Math.max(-100, Math.min(100, Math.round(points)));
        const sign = clampedPoints > 0 ? '+' : '';
        const emoji = showEmoji ? this.getCarensEmoji(clampedPoints) : '';

        return `${emoji}${sign}${clampedPoints}`;
    }

    /**
     * Get appropriate emoji for CARENS value
     */
    getCarensEmoji(points) {
        if (points >= 50) return '🌟';      // Excellent (50-100)
        if (points >= 20) return '✅';      // Good (20-49)
        if (points >= -20) return '🔶';    // Neutral (-20-19)
        if (points >= -50) return '⚠️';     // Poor (-50 to -21)
        return '❌';                        // Very Poor (-100 to -51)
    }

    /**
     * Get CARENS category display color class
     */
    getCarensColorClass(points) {
        if (points >= 20) return 'carens-positive';
        if (points >= -20) return 'carens-neutral';
        return 'carens-negative';
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

    /**
     * OPTIMIZATION: Unified method to get server building data
     * Eliminates duplicate code paths for accessing economic client
     */
    getServerBuildingData(row, col) {
        if (!this.game.economicClient?.buildings) return null;
        const locationKey = `${row},${col}`;
        return this.game.economicClient.buildings.get(locationKey);
    }

    getParcelTooltipData(row, col) {
        try {
            const parcel = this.game.grid[row][col];
            if (!parcel) return null;

            // OPTIMIZATION: Fetch building data once and pass through all methods
            const building = parcel.building ? this.game.getBuildingDataByName(parcel.building.type || parcel.building.id || parcel.building) : null;
            const coord = this.game.getParcelCoordinate(row, col);

            const data = {
                row,
                col,
                coord,
                hasBuilding: !!parcel.building,
                parcel,
                building, // Cached building definition - pass this to all methods
                buildingDef: building // Alias for clarity in methods
            };

            if (!parcel.building) {
                // Empty parcel
                // Use server-authoritative price
                data.price = this.game.economicClient?.getParcelPrice(row, col) || 'Loading...';
                // Server-authoritative ownership: treat "City" and "unclaimed" as unowned for player interaction
                data.isOwned = !!(parcel.owner && parcel.owner !== 'City' && parcel.owner !== 'unclaimed');
                data.owner = parcel.owner;
            } else {
                // Building data - fix [object Object] issue with debug

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

                // OPTIMIZATION: Use unified server data access method
                const serverBuilding = this.getServerBuildingData(row, col);
                if (serverBuilding) {
                    // Use server data as authoritative source
                    data.isUnderConstruction = serverBuilding.isUnderConstruction || false;
                    data.constructionProgress = serverBuilding.constructionProgress || 1.0;
                    data.condition = (serverBuilding.condition || 1.0) * 100; // Convert 0-1 to 0-100%
                } else {
                    // Fallback to parcel data - check both parcel and building states
                    // Be conservative: if either indicates construction, treat as under construction
                    const parcelUnderConstruction = parcel._isUnderConstruction || false;
                    const buildingUnderConstruction = parcel.building?.underConstruction || false;
                    data.isUnderConstruction = parcelUnderConstruction || buildingUnderConstruction;
                    data.constructionProgress = parcel._constructionProgress || 1.0;
                    data.condition = parcel.condition || 100;
                }

                data.constructionStartTime = parcel._constructionStartTime;
                data.constructionDays = parcel._constructionDays;

                // Store building definition for rendering
                data.building = building;

                // Get performance data from server or cache
                data.needs = this.getBuildingNeeds(row, col, building);
                data.carens = this.getBuildingCarens(row, col);
                data.performance = this.getBuildingPerformance(row, col);
                data.netRevenue = this.getBuildingRevenue(row, col);
                // condition already set above from server data
            }

            return data;
        } catch (error) {
            console.warn('Error getting parcel tooltip data:', error);
            return null;
        }
    }

    renderParcelTooltip(data) {
        const header = window.ParcelHeaderUtils.createStandardHeader(this.game, data.coord, data, true, false);

        return `
            ${header}
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
            return `
                <div class="empty-parcel owned">
                    ${isPlayerOwned ?
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
        const ownershipHtml = this.formatPlayerOwnership(data.owner);

        return `
            <div class="building-header">
                <div class="building-name">${data.buildingName}</div>
                ${ownershipHtml ? `<div class="player-badge">${ownershipHtml}</div>` : ''}
            </div>
        `;
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

        return `
            <div class="construction-status">
                <div class="construction-message">🏗️ Under Construction</div>
            </div>
        `;
    }

    renderOwnerInfo(data) {
        // Use unified player ownership formatter
        const ownershipHtml = this.formatPlayerOwnership(data.parcel.owner);
        if (ownershipHtml) {
            return `<div class="owner-info">${ownershipHtml}</div>`;
        }
        return '';
    }

    renderCompactPerformance(data) {
        // Get enhanced performance data from server with JEEFHH/CARENS
        const performance = data.performance || this.getBuildingPerformance(data.row, data.col);

        // Use server-synced data if available
        const serverBuilding = this.game.economicClient?.buildings?.get(`${data.row},${data.col}`);

        const efficiency = serverBuilding?.efficiency || performance.efficiency || 0;
        const efficiencyPercent = Math.round(efficiency);
        const condition = data.condition || performance.condition || 100; // Already set from server data
        const netRevenue = Math.round(serverBuilding?.netIncome || performance.netRevenue || 0);

        // Use performance-based blue-to-red color system
        const efficiencyColor = this.getPerformanceColor(efficiency);
        const conditionColor = this.getPerformanceColor(condition);

        // Net revenue color based on range: -50 to +50 (red to blue scale)
        const revenuePerformance = Math.max(0, Math.min(100, ((netRevenue + 50) / 100) * 100));
        const revenueColor = this.getPerformanceColor(revenuePerformance);

        return `
            <div class="compact-performance">
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300; font-size: 12px;">Performance: </span>
                    <span style="color: ${efficiencyColor}; font-weight: 400; font-size: 12px;">${efficiencyPercent}%</span>
                </div>
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300; font-size: 12px;">Net Revenue: </span>
                    <span style="color: ${revenueColor}; font-weight: 400; font-size: 12px;">
                        ${netRevenue >= 0 ? '+' : ''}$${netRevenue}/day
                    </span>
                </div>
                <div class="perf-line">
                    <span style="color: #ccc; font-weight: 300; font-size: 12px;">Condition: </span>
                    <span style="color: ${conditionColor}; font-weight: 400; font-size: 12px;">${Math.round(condition)}%</span>
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
                    <div class="section-label">Produces</div>
                    <div class="resource-list">
                        ${production.map(item => `
                            <div class="resource-item">${this.getResourceEmoji(item.resource)} ${item.amount} ${item.resource}</div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Show building needs or status based on JEEFHH satisfaction
        if (data.needs && data.needs.length > 0) {
            // Show ALL unmet JEEFHH needs
            html += `
                <div class="tooltip-section needs-section">
                    <div class="section-label">Needed</div>
                    <div class="resource-list">
                        ${data.needs.map(need => `
                            <div class="resource-item">${this.getResourceEmoji(need.resource)} ${need.amount} ${need.resource.toLowerCase()}</div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            // All JEEFHH needs are met - show confirmation
            html += `
                <div class="tooltip-section needs-section">
                    <div class="section-label">✅ All core needs met</div>
                </div>
            `;

            // Now show CARENS boost opportunities if available
            const carensBoosts = this.getCarensBoostOpportunities(data.row, data.col);
            if (carensBoosts !== null) {
                html += this.renderCarensBoostOpportunities(carensBoosts);

                // If peak performance achieved (no CARENS boosts needed), suggest repair
                if (carensBoosts.length === 0) {
                    const condition = performance.condition || 100;
                    if (condition < 100) {
                        html += `
                            <div class="tooltip-section repair-section">
                                <div class="section-label">🔧 Consider repairing to maintain peak performance</div>
                            </div>
                        `;
                    }
                }
            }
        }

        return html;
    }

    /**
     * Get emoji for resource type
     */
    getResourceEmoji(resource) {
        const emojiMap = {
            'energy': '⚡',
            'jobs': '💼',
            'education': '🎓',
            'food': '🍎',
            'housing': '🏠',
            'healthcare': '❤️',
            'workers': '💼'  // alias for jobs
        };
        return emojiMap[resource.toLowerCase()] || '';
    }

    /**
     * Convert CARENS category to natural language boost suggestion
     */
    getCarensBoostSuggestion(category) {
        const suggestions = {
            'culture': 'More cultural spaces',
            'affordability': 'More affordability nearby',
            'resilience': 'Increased economic resilience',
            'environment': 'Better environmental impacts',
            'noise': 'Quiet spaces nearby',
            'safety': 'Increased safety'
        };
        return suggestions[category.toLowerCase()] || category;
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
     * Extract livability value from building definition (handles both number and object formats)
     */
    extractLivabilityValue(livabilityData) {
        if (typeof livabilityData === 'number') {
            // Convert decimal values (e.g., 0.02, 0.20) to points scale (-100 to +100)
            // Decimal values are multiplied by 100 to get points
            return Math.round(livabilityData * 100);
        } else if (typeof livabilityData === 'object' && livabilityData !== null) {
            // Handle object format with effect property
            const effectValue = livabilityData.effect || 0;
            return Math.round(effectValue * 100);
        }
        return 0;
    }

    /**
     * Render CARENS boost opportunities (top 2 negative impacts only, shown when JEEFHH needs are satisfied)
     */
    renderCarensBoostOpportunities(carensBoosts) {
        if (!carensBoosts || carensBoosts.length === 0) {
            // Peak performance achieved - all CARENS are neutral or positive
            return `
                <div class="tooltip-section boost-section">
                    <div class="section-label">✅ Peak performance achieved</div>
                </div>
            `;
        }

        const emojiMap = {
            'culture': '🎭',
            'affordability': '💰',
            'resilience': '🛡️',
            'environment': '🌿',
            'noise': '🔊',
            'safety': '🚨'
        };

        return `
            <div class="tooltip-section boost-section">
                <div class="section-label">Boost with</div>
                <div class="resource-list">
                    ${carensBoosts.map(boost => `
                        <div class="resource-item">${emojiMap[boost.key] || ''} ${boost.label}</div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderBuildingValues(data) {
        if (data.isUnderConstruction) return '';

        // Use cached building data instead of re-fetching
        const buildingValue = data.buildingDef?.cost || 0;
        // Use server-authoritative price
        const landValue = this.game.economicClient?.getParcelPrice(data.row, data.col) || 'Loading...';

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

        // Use cached building data instead of re-fetching
        if (!data.buildingDef || !data.buildingDef.resources) return '';

        const resources = data.buildingDef.resources;
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

        // Use cached building data instead of re-fetching
        const decayRate = data.buildingDef?.decayRate || 0.5; // Default 0.5% per day

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
                    <div class="metric-value">${supplyDemandData ? `${supplyDemandData.demand}/${supplyDemandData.supply}` : Math.round(value)}</div>
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
        // Get tooltip dimensions WITHOUT causing visible flash
        // Strategy: Keep element positioned far off-screen during measurement
        // The browser won't paint elements at -9999px even if visibility changes
        this.element.style.position = 'fixed';
        this.element.style.left = '-9999px';
        this.element.style.top = '-9999px';
        this.element.style.opacity = '0';
        this.element.style.visibility = 'hidden';

        // Measure dimensions (triggers layout but no paint due to off-screen position)
        const rect = this.element.getBoundingClientRect();

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

        // Temporarily disable transitions to prevent flash during repositioning
        const originalTransition = this.element.style.transition;
        this.element.style.transition = 'none';

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;

        // Force reflow to apply position immediately before re-enabling transitions
        this.element.offsetHeight;

        // Re-enable transitions for smooth show/hide
        this.element.style.transition = originalTransition;
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

        // Ensure tooltip transform is reset for accurate bounds measurement
        this.element.style.transform = 'scale(1) perspective(1000px)';

        // Force a reflow to ensure transform is applied before measuring bounds
        this.element.offsetHeight;

        // Get the tooltip's exact position for seamless transition
        const tooltipBounds = this.element.getBoundingClientRect();
        const menuX = tooltipBounds.left;
        const menuY = tooltipBounds.top;

        // Create a more elegant transition effect
        // Keep the header in place while the content slides
        const tooltipContent = this.element.querySelector('.tooltip-content');
        if (tooltipContent) {
            // Slide out tooltip content
            tooltipContent.style.transition = 'opacity 100ms ease-out, transform 100ms ease-out';
            tooltipContent.style.opacity = '0';
            tooltipContent.style.transform = 'translateY(-10px)';
        }

        // Small delay for visual continuity
        setTimeout(() => {
            this.hide();

            // Show context menu with transition from tooltip position
            if (this.game.contextMenuSystem) {
                // Use showWithTransition for smooth alignment
                if (this.game.contextMenuSystem.showWithTransition) {
                    this.game.contextMenuSystem.showWithTransition(row, col, menuX, menuY, tooltipBounds);
                } else {
                    // Fallback to regular show method
                    this.game.contextMenuSystem.show(row, col, menuX, menuY);
                }
            }

            this.isTransitioning = false;
        }, 100);
    }

    // ==================== EVENT LISTENERS ====================

    setupEventListeners() {
        // PARCEL TOOLTIPS: Handled by ParcelHoverV2 to avoid duplicate mouse tracking
        // ParcelHoverV2 calls this.show('parcel', ...) directly

        // Only handle click for context menu transition
        if (this.game.canvas) {
            this.game.canvas.addEventListener('click', this.handleCanvasClick.bind(this), { capture: true });
        }

        // Event delegation for all other tooltip types (sidebar, DCF, simple)
        document.addEventListener('mouseenter', this.handleElementHover.bind(this), true);
        document.addEventListener('mouseleave', this.handleElementLeave.bind(this), true);
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
                // Use unified formatter for player ownership
                const ownershipHtml = this.formatPlayerOwnership(data.owner);
                if (ownershipHtml) {
                    return ownershipHtml;
                }
                // City/unclaimed parcels
                return `AVAILABLE FOR $${data.price.toLocaleString()}`;
            }
            return `AVAILABLE FOR $${data.price.toLocaleString()}`;
        }

        if (data.isUnderConstruction) {
            return 'UNDER CONSTRUCTION';
        }

        // Use unified formatter for building ownership
        const ownershipHtml = this.formatPlayerOwnership(data.parcel.owner);
        if (ownershipHtml) {
            return ownershipHtml;
        }

        return 'CITY PROPERTY';
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateTimeRemaining(data) {
        // Get construction data from server
        const serverBuilding = this.game.economicClient?.buildings?.get(`${data.row},${data.col}`);
        if (!serverBuilding || !serverBuilding.isUnderConstruction) {
            return null;
        }

        const constructionStartTime = serverBuilding.constructionStartTime;
        const constructionDays = serverBuilding.constructionDays || data.constructionDays || 1;

        if (!constructionStartTime) {
            return null;
        }

        // Game day is ~9.86 seconds (3600000ms/year ÷ 365 days)
        const GAME_DAY_MS = 3600000 / 365; // ~9863ms

        // Calculate total construction time
        const totalConstructionMs = constructionDays * GAME_DAY_MS;

        // Calculate time elapsed since construction started
        const now = Date.now();
        const elapsed = now - constructionStartTime;

        // Calculate time remaining
        const remaining = Math.max(0, totalConstructionMs - elapsed);

        // Convert to seconds and round up
        const remainingSeconds = Math.ceil(remaining / 1000);

        if (remainingSeconds === 0) {
            return 'Completing...';
        }

        // Format as "Xs" or "Xm Ys" if over 60 seconds
        if (remainingSeconds < 60) {
            return `${remainingSeconds}s`;
        } else {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            return `${minutes}m ${seconds}s`;
        }
    }

    getBuildingNeeds(row, col, buildingData = null) {
        let buildingDef = buildingData;

        // If no building data passed, try to get it from grid
        if (!buildingDef) {
            const building = this.game.grid?.[row]?.[col];
            if (!building || building.type === 'grass') {
                return null;
            }
            buildingDef = this.game.buildingManager?.getBuildingById(building.type);
        }

        if (!buildingDef?.resources) {
            return null;
        }

        // Get resource satisfaction data from server
        const performanceData = this.getBuildingPerformance(row, col);
        const resourceSatisfaction = performanceData?.resourceSatisfaction;


        const needs = [];
        const resources = buildingDef.resources;

        // Only show unmet needs (satisfaction < 100%)
        const satisfactionThreshold = 1.0;

        // Check all JEEFHH resources
        const jeefhhResources = [
            { key: 'energy', label: 'Energy', required: resources.energyRequired },
            { key: 'jobs', label: 'Jobs', fromSatisfaction: true },
            { key: 'food', label: 'Food', fromSatisfaction: true },
            { key: 'education', label: 'Education', fromSatisfaction: true },
            { key: 'healthcare', label: 'Healthcare', fromSatisfaction: true }
        ];

        for (const resource of jeefhhResources) {
            const sat = resourceSatisfaction?.[resource.key]?.satisfaction;
            if (sat === undefined || sat >= satisfactionThreshold) continue;

            const supplied = resourceSatisfaction?.[resource.key]?.supplied || 0;
            const required = resourceSatisfaction?.[resource.key]?.required ||
                            (resource.fromSatisfaction ? 0 : resource.required);

            if (required > 0) {
                const unmet = Math.max(0, required - supplied);
                needs.push({
                    resource: resource.label,
                    amount: Math.ceil(unmet), // Round up to nearest whole number
                    supplied: Math.round(supplied * 10) / 10,
                    required: Math.round(required * 10) / 10,
                    satisfaction: sat
                });
            }
        }

        return needs;
    }

    getCarensBoostOpportunities(row, col) {
        // Get CARENS scores from server performance data
        const performanceData = this.getBuildingPerformance(row, col);
        const carensScores = performanceData?.resourceSatisfaction?.carensScores ||
                            performanceData?.carensScores;

        if (!carensScores) {
            return null;
        }

        // Collect negative impacts only
        const negativeImpacts = [];
        const carensTypes = [
            { key: 'culture', label: 'Nearby cultural experiences lacking' },
            { key: 'affordability', label: 'Affordability pressures high' },
            { key: 'resilience', label: 'Economic stability needed' },
            { key: 'environment', label: 'Environmental quality poor' },
            { key: 'noise', label: 'Noise pollution present' },
            { key: 'safety', label: 'Safety concerns present' }
        ];

        carensTypes.forEach(type => {
            const value = carensScores[type.key] || 0;
            if (value < 0) {
                negativeImpacts.push({
                    key: type.key,
                    label: type.label,
                    value: value
                });
            }
        });

        if (negativeImpacts.length === 0) {
            // All CARENS are neutral or positive - peak performance
            return [];
        }

        // Sort by most negative first and take top 2
        negativeImpacts.sort((a, b) => a.value - b.value);
        return negativeImpacts.slice(0, 2);
    }

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    getBuildingCarens(row, col) {
        // CLIENT-SIDE CALCULATION DISABLED - RETURN GHOST PLACEHOLDER
        // Mock CARENS data was replaced with server-authoritative data
        return {
            culture: 'Loading...',
            affordability: 'Loading...',
            resilience: 'Loading...',
            environment: 'Loading...',
            noise: 'Loading...',
            safety: 'Loading...'
        };
    }

    getBuildingPerformance(row, col) {
        // OPTIMIZATION: Use unified server data access method
        const building = this.getServerBuildingData(row, col);
        if (building) {
            // Server sends performance data directly on building object
            const efficiency = building.efficiency || 0;
            const netRevenue = building.netIncome || 0;
            const condition = (building.condition || 1.0) * 100;

            // Include resource satisfaction data from server
            const resourceSatisfaction = building.performance?.resourceSatisfaction;


            return {
                efficiency: Math.max(0, Math.round(efficiency)),
                netRevenue: netRevenue,
                condition: condition,
                resourceSatisfaction: resourceSatisfaction
            };
        }

        // Fallback for older data
        const key = `${row},${col}`;
        if (this.game.buildingEfficiencies?.has(key)) {
            const efficiency = this.game.buildingEfficiencies.get(key);
            if (efficiency.overallEfficiency !== undefined) {
                return {
                    efficiency: Math.round(efficiency.overallEfficiency * 100),
                    netRevenue: efficiency.netRevenue || 0,
                    condition: efficiency.condition || 100,
                    resourceSatisfaction: null // No detailed satisfaction data in fallback
                };
            }
        }

        // Final fallback
        return {
            efficiency: 90,
            netRevenue: 0,
            condition: 100,
            resourceSatisfaction: null
        };
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
        // Get current metric value from economic client (server-authoritative)
        if (this.game.economicClient) {
            const economicClient = this.game.economicClient;

            // JEEFHH metrics
            switch(metric) {
                case 'jobs':
                    return economicClient.jeefhh?.jobs?.multiplier || 0;
                case 'energy':
                    return economicClient.jeefhh?.energy?.multiplier || 0;
                case 'education':
                    return economicClient.jeefhh?.education?.multiplier || 0;
                case 'food':
                    return economicClient.jeefhh?.food?.multiplier || 0;
                case 'housing':
                    return economicClient.jeefhh?.housing?.multiplier || 0;
                case 'healthcare':
                    return economicClient.jeefhh?.healthcare?.multiplier || 0;

                // CARENS metrics - convert from 0-1 normalized to -100 to +100 display range
                case 'culture':
                    if (economicClient.carens?.points?.culture !== undefined) {
                        return economicClient.carens.points.culture; // Already in -100 to +100 range
                    }
                    return 0; // Default to 0 instead of 50%
                case 'affordability':
                    if (economicClient.carens?.points?.affordability !== undefined) {
                        return economicClient.carens.points.affordability;
                    }
                    return 0;
                case 'resilience':
                    if (economicClient.carens?.points?.resilience !== undefined) {
                        return economicClient.carens.points.resilience;
                    }
                    return 0;
                case 'environment':
                    if (economicClient.carens?.points?.environment !== undefined) {
                        return economicClient.carens.points.environment;
                    }
                    return 0;
                case 'noise':
                    if (economicClient.carens?.points?.noise !== undefined) {
                        return economicClient.carens.points.noise;
                    }
                    return 0;
                case 'safety':
                    if (economicClient.carens?.points?.safety !== undefined) {
                        return economicClient.carens.points.safety;
                    }
                    return 0;
            }
        }

        // Fallback to UI manager values if available
        if (this.game.uiManager?.getMetricValue) {
            return this.game.uiManager.getMetricValue(metric);
        }

        return 0; // Default 0 for CARENS (-100 to +100 scale starts at 0)
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

    // 🚫 CLIENT CALCULATION - DISABLED! BUSTED!
    calculateBuildingContribution(buildingData, metric) {
        // Use server data only
        return 'Loading...';
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
        // Delegate to rendering system for consistent player name handling
        if (this.game?.renderingSystem) {
            return this.game.renderingSystem.getPlayerName(playerId);
        }

        // Fallback if no rendering system available
        return playerId || 'Unknown Player';
    }

    getPlayerColor(playerId) {
        // Delegate to rendering system for consistent player color handling
        if (this.game?.renderingSystem) {
            return this.game.renderingSystem.getPlayerColor(playerId);
        }

        // Fallback color if no rendering system available
        return '#4CAF50';
    }

    /**
     * ✨ UNIFIED PLAYER OWNERSHIP FORMATTER ✨
     * Single source of truth for all player ownership displays
     * Always uses Beer Hall lobby color with accessible contrast
     */
    /**
     * Create standardized ownership badge (used in both tooltip and context menu)
     */
    createOwnershipBadge(parcel, isHovering = false) {
        const owner = parcel?.owner;

        // City/unclaimed parcels show dark gray badge when not hovering/clicking
        if (!owner || owner === 'City' || owner === 'unclaimed') {
            if (!isHovering) {
                return `<span class="ownership-badge city">CITY</span>`;
            }
            // When hovering/clicking, show as available for purchase
            return null;
        }

        const isCurrentPlayer = this.game.isCurrentPlayer(owner);
        const playerName = isCurrentPlayer ? 'YOU' : this.getPlayerName(owner).toUpperCase();

        if (isHovering) {
            // When hovering/clicking, use player color with contrast
            const playerColor = this.getPlayerColor(owner);
            const contrastColor = this.getContrastingColor(playerColor);
            const displayText = isCurrentPlayer ? 'Owned by you' : `Owned by ${this.getPlayerName(owner)}`;

            return `<span class="ownership-badge player" style="background: ${playerColor}; color: ${contrastColor};">${displayText}</span>`;
        } else {
            // Default state: use player color with contrast for non-hovering state
            const playerColor = this.getPlayerColor(owner);
            const contrastColor = this.getContrastingColor(playerColor);
            return `<span class="ownership-badge player" style="background: ${playerColor}; color: ${contrastColor};">${playerName}</span>`;
        }
    }

    /**
     * Create standardized header for both tooltip and context menu
     */
    createStandardHeader(coord, parcel, isHovering = false, isContextMenu = false) {
        const ownershipBadge = this.createOwnershipBadge(parcel, isHovering);
        const headerClass = isContextMenu ? 'context-menu-header' : 'tooltip-header';
        const coordClass = isContextMenu ? 'context-coord' : 'tooltip-coord';
        const statusClass = isContextMenu ? 'context-status' : 'tooltip-status';

        if (ownershipBadge) {
            return `
                <div class="${headerClass}">
                    <div class="${coordClass}">${coord}</div>
                    <div class="${statusClass}">${ownershipBadge}</div>
                </div>
            `;
        } else {
            // Show purchase price if available for purchase
            // Use server-authoritative price
            const price = this.game.economicClient?.getParcelPrice(parcel.row, parcel.col) || 'Loading...';
            const priceText = price ? `$${price.toLocaleString()}` : 'AVAILABLE';
            return `
                <div class="${headerClass}">
                    <div class="${coordClass}">${coord}</div>
                    <div class="${statusClass}">
                        <span class="ownership-badge city">${priceText}</span>
                    </div>
                </div>
            `;
        }
    }

    formatPlayerOwnership(playerId) {
        if (!playerId || playerId === 'City' || playerId === 'unclaimed') {
            return null; // Not owned by a player
        }

        const isCurrentPlayer = this.game.isCurrentPlayer(playerId);
        const playerName = isCurrentPlayer ? 'YOU' : this.getPlayerName(playerId).toUpperCase();

        // Get player color - use actual player color, not gray
        const playerColor = this.getPlayerColor(playerId);
        const contrastColor = this.getContrastingColor(playerColor);

        return `<span style="background: ${playerColor}; color: ${contrastColor}; padding: 2px 6px; border-radius: 3px; font-weight: 600;">${playerName}</span>`;
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

// OPTIMIZATION: CSS styles moved to tooltip-styles.css for better organization
// Global ParcelHeaderUtils moved to parcel-header-utils.js for modularity

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TooltipSystemV2;
}
