/**
 * Unified Tooltip Management System
 * Provides consistent, performant tooltips across the entire application
 * Consolidates data collection, rendering, and management into a single system
 */

class TooltipDataCollector {
    constructor(game) {
        this.game = game;
        this.cache = new Map();
        this.cacheTimeout = 1000; // 1 second cache
    }

    /**
     * Get building tooltip data with the new clean format
     */
    getBuildingTooltipData(row, col) {
        const cacheKey = `building-${row}-${col}`;
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        // Use grid as single source of truth for parcel data
        const parcel = this.game.grid[row][col];

        if (!parcel?.building) return null;

        const building = this.game.getBuildingDataByName(parcel.building);
        if (!building) return null;

        // Get construction state from parcel if available
        const isUnderConstruction = parcel._isUnderConstruction || false;
        const constructionProgress = parcel._constructionProgress || 1.0;
        const daysRemaining = parcel._constructionTimeRemaining || 0;

        // Calculate JEEFHH production and needs
        const production = {};
        const needs = {};

        if (building.resources) {
            // Production (what the building provides)
            if (building.resources.jobsProvided > 0) production.jobs = building.resources.jobsProvided;
            if (building.resources.energyProvided > 0) production.energy = building.resources.energyProvided;
            if (building.resources.educationProvided > 0) production.education = building.resources.educationProvided;
            if (building.resources.foodProvided > 0) production.food = building.resources.foodProvided;
            if (building.resources.housingProvided > 0) production.housing = building.resources.housingProvided;
            if (building.resources.healthcareProvided > 0) production.healthcare = building.resources.healthcareProvided;

            // Needs (what the building requires)
            if (building.resources.jobsRequired > 0) needs.jobs = building.resources.jobsRequired;
            if (building.resources.energyRequired > 0) needs.energy = building.resources.energyRequired;
            if (building.resources.educationRequired > 0) needs.education = building.resources.educationRequired;
            if (building.resources.foodRequired > 0) needs.food = building.resources.foodRequired;
            if (building.resources.housingRequired > 0) needs.housing = building.resources.housingRequired;
            if (building.resources.healthcareRequired > 0) needs.healthcare = building.resources.healthcareRequired;
        }

        // Calculate performance score (simple version for now)
        let performancePercent = 100;
        if (!isUnderConstruction && Object.keys(needs).length > 0) {
            // Simple performance calculation based on whether needs are met
            performancePercent = 80; // Default to 80% if has needs
        }

        // Transform into tooltip data format
        const data = {
            // Basic info
            name: building.name,
            category: building.category,
            location: this.game.getParcelCoordinate(row, col),

            // Owner info
            owner: this.getOwnerInfo(parcel),

            // Value info
            buildingValue: this.getBuildingValue(row, col, parcel, building),
            landValue: this.getLandValue(row, col, parcel),

            // Construction info
            construction: {
                isComplete: !isUnderConstruction,
                progress: constructionProgress,
                progressPercent: Math.round(constructionProgress * 100),
                timeRemaining: daysRemaining
            },

            // Performance info
            performance: {
                isUnderConstruction: isUnderConstruction,
                progressPercent: isUnderConstruction ? Math.round(constructionProgress * 100) : performancePercent,
                performancePercent: performancePercent,
                needs: needs
            },

            // Production and needs
            production: production,
            needs: needs,
            cashflow: building.economics?.maxRevenue || 0
        };

        this.setCachedData(cacheKey, data);
        return data;
    }

    /**
     * Get empty parcel tooltip data
     */
    getEmptyParcelTooltipData(row, col) {
        const cacheKey = `empty-${row}-${col}`;
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const parcel = this.game.grid[row][col];
        if (!parcel || parcel.building) return null;

        const data = {
            isEmpty: true,
            location: `${row}, ${col}`,
            owner: this.getOwnerInfo(parcel),
            landValue: this.getLandValue(row, col, parcel)
        };

        this.setCachedData(cacheKey, data);
        return data;
    }

    /**
     * Get clean owner information
     */
    getOwnerInfo(parcel) {
        if (this.game.isCurrentPlayer(parcel.owner)) {
            return {
                name: this.game.playerSettings?.name || 'You',
                isCurrentPlayer: true
            };
        } else if (parcel.owner && parcel.owner !== 'unclaimed') {
            return {
                name: parcel.owner,
                isCurrentPlayer: false
            };
        } else {
            return {
                name: 'City',
                isCurrentPlayer: false
            };
        }
    }

    /**
     * Get performance data as percentage
     */
    // REMOVED: getPerformanceData() - Now using unified getBuildingState() from buildings.js

    /**
     * Get cashflow data for the building
     */
    getCashflowData(row, col, parcel, building) {
        // Use v2 economic client for performance data
        if (this.game.economicClient && building && !building.underConstruction) {
            // Get cached performance data from v2 system
            const locationKey = `${row},${col}`;
            const performanceData = this.game.cache?.performanceData?.[locationKey];
            if (performanceData?.summary?.netIncome !== undefined) {
                return performanceData.summary.netIncome;
            }
        }

        // Fallback to old building system for backwards compatibility
        if (this.game.buildingSystem) {
            const economics = this.game.buildingSystem.calculateBuildingEconomics(parcel, row, col);
            return economics.netIncome;
        }

        return undefined;
    }

    /**
     * Get production data ("Adds up to" section)
     */
    getProductionData(building) {
        const production = [];

        if (building.population?.bedroomsAdded > 0) {
            production.push({
                emoji: '🏠',
                amount: building.population.bedroomsAdded,
                type: 'Bedrooms'
            });
        }

        if (building.resources?.foodProduction > 0) {
            production.push({
                emoji: '🌾',
                amount: building.resources.foodProduction,
                type: 'Food'
            });
        }

        if (building.resources?.energyDemand < 0) {
            production.push({
                emoji: '⚡',
                amount: Math.abs(building.resources.energyDemand),
                type: 'Energy'
            });
        }

        if (building.population?.jobsCreated > 0) {
            production.push({
                emoji: '💼',
                amount: building.population.jobsCreated,
                type: 'Jobs'
            });
        }

        return production;
    }

    /**
     * Get needs data - only show UNSATISFIED needs
     */
    getNeedsData(building, row, col) {
        const needs = [];

        if (this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
            const parcelId = `${row}-${col}`;
            const serverEfficiency = this.game.buildingEfficiencies?.[parcelId];

            if (serverEfficiency && serverEfficiency.unsatisfiedNeeds) {
                serverEfficiency.unsatisfiedNeeds.forEach(need => {
                    let emoji = '❓';
                    switch(need.type) {
                        case 'Workers': emoji = '👷'; break;
                        case 'Energy': emoji = '⚡'; break;
                        case 'Food': emoji = '🌾'; break;
                    }

                    needs.push({
                        emoji: emoji,
                        amount: Math.ceil(need.deficit),
                        type: need.type
                    });
                });
            }
        }

        return needs;
    }

    getBuildingValue(row, col, parcel, building) {
        try {
            // Calculate current building value accounting for decay
            const baseCost = building.economics?.buildCost || building.cost || 0;
            if (baseCost === 0) return undefined;

            // Apply decay reduction to building value
            const decayFactor = 1 - (parcel.decay || 0);
            const currentValue = Math.round(baseCost * decayFactor);

            return currentValue;
        } catch (error) {
            return undefined;
        }
    }

    getLandValue(row, col, parcel) {
        try {
            if (parcel.landValue?.calculatedValue) {
                return parcel.landValue.calculatedValue;
            }
            if (this.game.getParcelPrice) {
                return this.game.getParcelPrice(row, col);
            }
            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }
}

class TooltipRenderer {
    /**
     * Render building tooltip with enhanced presentation
     */
    renderBuildingTooltip(data) {
        let html = '';

        // Header with building name and parcel coordinates in top right
        html += `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">`;
        html += `<div>`;
        html += `<strong style="color: #4CAF50; font-size: 16px;">${data.name}</strong><br>`;
        html += `<span style="color: #888; font-size: 13px;">Owned by ${data.owner.name}</span>`;
        html += `</div>`;
        if (data.location) {
            html += `<div style="color: #4a9eff; font-size: 14px; font-weight: bold; background: rgba(74, 158, 255, 0.1); padding: 4px 8px; border-radius: 4px;">${data.location}</div>`;
        }
        html += `</div>`;

        // Building value and land value
        if (data.buildingValue !== undefined || data.landValue !== undefined) {
            html += `<div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px;">`;
            if (data.buildingValue !== undefined) {
                html += `<span style="color: #81C784;">🏗️ Building Value:</span> <strong>$${data.buildingValue.toLocaleString()}</strong><br>`;
            }
            if (data.landValue !== undefined) {
                html += `<span style="color: #64B5F6;">🏞️ Land Value:</span> <strong>$${data.landValue.toLocaleString()}</strong>`;
            }
            html += `</div>`;
        }

        // Performance with color coding
        if (data.performance.isUnderConstruction) {
            html += `<div style="margin-bottom: 12px;">`;
            html += `<div style="margin-bottom: 6px;">`;
            html += `<span style="color: #FFA726;">🚧 Status:</span> <span style="color: #FF9800;">Under Construction</span>`;
            html += `</div>`;

            // Progress bar (like month progress)
            html += `<div style="background: #333; border-radius: 4px; overflow: hidden; margin-bottom: 4px;">`;
            html += `<div style="background: linear-gradient(90deg, #FF9800, #FFC107); height: 12px; width: ${data.performance.progressPercent}%; transition: width 0.3s ease;"></div>`;
            html += `</div>`;

            // Progress text and time remaining
            html += `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #ccc;">`;
            html += `<span>${data.performance.progressPercent}% complete</span>`;
            if (data.performance.timeRemaining) {
                html += `<span>⏱️ ${data.performance.timeRemaining}</span>`;
            }
            html += `</div>`;
            html += `</div>`;
        } else {
            // Simple performance color calculation
            const perfPercent = data.performance.performancePercent;
            const perfColor = perfPercent >= 75 ? '#4CAF50' :
                             perfPercent >= 50 ? '#FFC107' :
                             perfPercent >= 25 ? '#FF9800' : '#F44336';
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #E0E0E0;">⚡ Performance:</span> <strong style="color: ${perfColor};">${data.performance.performancePercent}%</strong>`;
            html += `</div>`;
        }

        // Detailed needs information (for non-construction buildings)
        const needsObj = data.performance.needs || data.needs;
        if (!data.performance.isUnderConstruction && needsObj && Object.keys(needsObj).length > 0) {
            html += `<div style="margin-bottom: 10px;">`;
            html += `<div style="color: #E0E0E0; margin-bottom: 4px;"><strong>🎯 Resource Needs:</strong></div>`;

            Object.entries(needsObj).forEach(([type, amount]) => {
                const need = { type, required: amount };
                const needTypeEmoji = {
                    'workers': '👥',
                    'jobs': '💼',
                    'energy': '⚡',
                    'food': '🍞',
                    'education': '🎓',
                    'healthcare': '🏥'
                }[need.type] || '📦';

                const needTypeName = {
                    'workers': 'Workers',
                    'jobs': 'Jobs',
                    'energy': 'Energy',
                    'food': 'Food',
                    'education': 'Education',
                    'healthcare': 'Healthcare'
                }[type] || type;

                // Simple display for now
                html += `<div style="margin-left: 8px; margin-bottom: 2px; font-size: 12px;">`;
                html += `<span style="color: #FFC107;">${needTypeEmoji} ${needTypeName}:</span> `;
                html += `<span style="color: #FF9800;">${amount} required</span>`;
                html += `</div>`;
            });
            html += `</div>`;
        }

        // Cashflow information
        if (data.cashflow !== undefined) {
            // Simple cashflow color calculation
            const cashflowColor = data.cashflow >= 0 ? '#4CAF50' : '#F44336';
            const cashflowPrefix = data.cashflow >= 0 ? '+' : '';
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #E0E0E0;">💰 Daily Cashflow:</span> <strong style="color: ${cashflowColor};">${cashflowPrefix}$${data.cashflow.toLocaleString()}</strong>`;
            html += `</div>`;
        }

        // Production and Needs Section (what the user specifically requested)
        if (!data.performance.isUnderConstruction) {
            // What the building provides (production)
            if (data.production && Object.keys(data.production).length > 0) {
                html += `<div style="margin-bottom: 10px; background: rgba(76, 175, 80, 0.1); padding: 8px; border-radius: 4px;">`;
                html += `<div style="color: #4CAF50; margin-bottom: 4px; font-weight: bold;">🏭 Provides:</div>`;

                Object.entries(data.production).forEach(([type, amount]) => {
                    const emoji = {
                        'jobs': '💼',
                        'energy': '⚡',
                        'education': '🎓',
                        'food': '🍞',
                        'housing': '🏠',
                        'healthcare': '🏥'
                    }[type] || '📦';

                    html += `<span style="margin-left: 8px; color: #81C784;">${emoji} ${amount} ${type}</span><br>`;
                });
                html += `</div>`;
            }

            // What the building needs (top 2 needs only)
            if (data.needs && Object.keys(data.needs).length > 0) {
                html += `<div style="margin-bottom: 10px; background: rgba(255, 152, 0, 0.1); padding: 8px; border-radius: 4px;">`;
                html += `<div style="color: #FF9800; margin-bottom: 4px; font-weight: bold;">⚠️ Needs (Top 2):</div>`;

                // Sort needs by amount (highest first) and take top 2
                const needsEntries = Object.entries(data.needs)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 2);

                needsEntries.forEach(([type, amount]) => {
                    const emoji = {
                        'jobs': '👥',
                        'energy': '⚡',
                        'education': '🎓',
                        'food': '🍞',
                        'housing': '🏠',
                        'healthcare': '🏥'
                    }[type] || '📦';

                    html += `<span style="margin-left: 8px; color: #FFB74D;">${emoji} ${amount} ${type}</span><br>`;
                });
                html += `</div>`;
            }
        }


        return html;
    }

    /**
     * Render empty parcel tooltip
     */
    renderEmptyParcelTooltip(data) {
        if (!data || !data.isEmpty) return '';

        let html = '';

        // Header with parcel name and coordinate
        html += `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">`;
        html += `<div>`;
        html += `<strong style="color: #90A4AE; font-size: 16px;">Empty Parcel</strong><br>`;
        html += `<span style="color: #888; font-size: 12px;">Owned by ${data.owner ? data.owner.name : 'City'}</span>`;
        html += `</div>`;
        html += `<div style="background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 12px; margin-left: 8px;">`;
        html += `${data.location}`;
        html += `</div>`;
        html += `</div>`;

        // Values section
        if (data.landValue !== undefined) {
            html += `<div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px;">`;
            html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
            html += `<span style="color: #64B5F6;">🏞️ Land Value</span>`;
            html += `<strong style="color: #fff;">$${data.landValue.toLocaleString()}</strong>`;
            html += `</div>`;
            html += `</div>`;
        }

        // Status section
        html += `<div style="margin-bottom: 4px;">`;
        html += `<span style="color: #81C784;">🏗️ Available for construction</span>`;
        html += `</div>`;

        return html;
    }

    /**
     * Render error tooltip
     */
    renderErrorTooltip(error) {
        return `<strong>Error:</strong> ${error}`;
    }
}

class TooltipManager {
    constructor(game) {

        this.game = game;
        this.currentTooltip = null;
        this.tooltipElement = null;
        this.hideTimer = null;
        this.showTimer = null;
        this.isVisible = false;
        this.lastContent = null;
        this.lastPosition = { x: 0, y: 0 };
        this.contentCache = new Map();
        this.priority = 0;
        this.isDestroyed = false;

        // Initialize components
        this.dataCollector = new TooltipDataCollector(game);
        this.renderer = new TooltipRenderer();

        // Performance tracking
        this.metrics = {
            showCount: 0,
            cacheHits: 0,
            positionCalculations: 0
        };

        this.createTooltipElement();
        this.setupGlobalEventListeners();
        this.setupGameTooltips();
    }
    
    createTooltipElement() {
        // Remove any existing unified tooltip
        const existing = document.getElementById('unified-tooltip');
        if (existing) existing.remove();
        
        // Create single tooltip element
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.id = 'unified-tooltip';
        this.tooltipElement.className = 'unified-tooltip';
        this.tooltipElement.style.cssText = `
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            padding: 8px 12px;
            color: #ffffff;
            font-size: 12px;
            line-height: 1.4;
            white-space: normal;
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 300px;
            pointer-events: none;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.15s ease, visibility 0.15s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        `;
        document.body.appendChild(this.tooltipElement);
    }
    
    show(content, x, y, options = {}) {
        if (this.isDestroyed || !content) return;
        
        const { 
            delay = 250, // 2x faster (was 500ms)
            html = false, 
            maxWidth = 300,
            className = '',
            priority = 0,
            cacheKey = null,
            animationSpeed = 'normal'
        } = options;
        
        // Priority system - don't override higher priority tooltips
        if (this.isVisible && priority < this.priority) {
            return;
        }
        
        // Performance optimization: Skip if content and position haven't changed significantly
        const positionChanged = Math.abs(x - this.lastPosition.x) > 5 || Math.abs(y - this.lastPosition.y) > 5;
        if (this.isVisible && content === this.lastContent && !positionChanged) {
            return;
        }
        
        this.hide(); // Hide any existing tooltip first
        this.priority = priority;
        
        // Clear any existing timers
        this.clearTimers();
        
        // Cache content for performance
        let processedContent = content;
        if (cacheKey && this.contentCache.has(cacheKey)) {
            processedContent = this.contentCache.get(cacheKey);
            this.metrics.cacheHits++;
        } else if (cacheKey) {
            this.contentCache.set(cacheKey, content);
            // Limit cache size to prevent memory leaks
            if (this.contentCache.size > 100) {
                const firstKey = this.contentCache.keys().next().value;
                this.contentCache.delete(firstKey);
            }
        }
        
        // Set timer to show tooltip after delay (ensure non-negative)
        const actualDelay = Math.max(0, delay);
        this.showTimer = setTimeout(() => {
            if (this.isDestroyed) return;
            
            if (html) {
                this.tooltipElement.innerHTML = processedContent;
            } else {
                this.tooltipElement.textContent = processedContent;
            }
            
            this.tooltipElement.style.maxWidth = maxWidth + 'px';
            this.tooltipElement.className = `unified-tooltip ${className}`;
            
            // Position tooltip with intelligent positioning
            this.position(x, y);
            
            // Set animation speed
            const transitionDuration = animationSpeed === 'ultra-fast' ? '0.056s' :
                                     animationSpeed === 'fast' ? '0.075s' : '0.15s';
            this.tooltipElement.style.transition = `opacity ${transitionDuration} ease, visibility ${transitionDuration} ease`;
            
            // Show tooltip with smooth animation
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.visibility = 'visible';
            this.isVisible = true;
            this.lastContent = content;
            this.lastPosition = { x, y };
            this.metrics.showCount++;
            
        }, actualDelay);
    }
    
    showImmediate(content, x, y, options = {}) {
        this.show(content, x, y, { ...options, delay: 0 });
    }
    
    position(x, y) {
        if (!this.tooltipElement) return;
        
        this.metrics.positionCalculations++;
        
        // Force layout calculation if needed
        if (this.tooltipElement.offsetWidth === 0) {
            this.tooltipElement.style.visibility = 'hidden';
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.display = 'block';
        }
        
        const rect = this.tooltipElement.getBoundingClientRect();
        const tooltipWidth = rect.width || 200;
        const tooltipHeight = rect.height || 50;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 15;
        const offset = 12;
        
        // Intelligent positioning algorithm
        const positions = [
            { x: x + offset, y: y - tooltipHeight - offset, name: 'top-right' },
            { x: x - tooltipWidth - offset, y: y - tooltipHeight - offset, name: 'top-left' },
            { x: x + offset, y: y + offset, name: 'bottom-right' },
            { x: x - tooltipWidth - offset, y: y + offset, name: 'bottom-left' },
            { x: x - tooltipWidth / 2, y: y - tooltipHeight - offset, name: 'top-center' },
            { x: x - tooltipWidth / 2, y: y + offset, name: 'bottom-center' }
        ];
        
        // Find the best position that fits in viewport
        let bestPosition = positions[0];
        let bestScore = -1;
        
        for (const pos of positions) {
            let score = 0;
            
            // Check if position fits in viewport
            const fitsHorizontally = pos.x >= margin && pos.x + tooltipWidth <= viewportWidth - margin;
            const fitsVertically = pos.y >= margin && pos.y + tooltipHeight <= viewportHeight - margin;
            
            if (fitsHorizontally && fitsVertically) {
                score = 100; // Perfect fit
                
                // Bonus for preferred positions (top positions preferred)
                if (pos.name.includes('top')) score += 10;
                
                // Enhanced sidebar awareness - detect sidebar and prefer positioning away from it
                const sidebarWidth = 350;
                const isNearSidebar = x > viewportWidth - sidebarWidth - 50; // 50px buffer

                if (isNearSidebar) {
                    // Strongly prefer left positioning when near sidebar
                    if (pos.name.includes('left')) score += 25;
                    // Penalize right positioning that would overlap sidebar
                    if (pos.name.includes('right') && pos.x + tooltipWidth > viewportWidth - sidebarWidth) {
                        score -= 50; // Heavy penalty for sidebar overlap
                    }
                } else {
                    // Default preference for right positioning when not near sidebar
                    if (pos.name.includes('right')) score += 5;
                }
                
                // Distance from edges (closer to center is better)
                const edgeDistanceX = Math.min(pos.x - margin, viewportWidth - margin - (pos.x + tooltipWidth));
                const edgeDistanceY = Math.min(pos.y - margin, viewportHeight - margin - (pos.y + tooltipHeight));
                score += Math.min(edgeDistanceX, edgeDistanceY) * 0.1;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestPosition = pos;
                }
            }
        }
        
        // Fallback: force fit in viewport if no perfect position found
        let finalX = bestPosition.x;
        let finalY = bestPosition.y;
        
        if (bestScore < 0) {
            finalX = Math.max(margin, Math.min(x - tooltipWidth / 2, viewportWidth - tooltipWidth - margin));
            finalY = Math.max(margin, Math.min(y - tooltipHeight - offset, viewportHeight - tooltipHeight - margin));
        }
        
        this.tooltipElement.style.left = finalX + 'px';
        this.tooltipElement.style.top = finalY + 'px';
        
        // Reset visibility styles
        this.tooltipElement.style.visibility = 'visible';
        this.tooltipElement.style.display = '';
    }
    
    hide() {
        this.clearTimers();
        
        if (this.tooltipElement && this.isVisible) {
            this.tooltipElement.style.opacity = '0';
            this.tooltipElement.style.visibility = 'hidden';
            this.isVisible = false;
            this.priority = 0;
            this.lastContent = null;
        }
    }
    
    clearTimers() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }
    
    setupGlobalEventListeners() {
        // Global event listeners for better UX
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
        
        // Hide tooltip when scrolling
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.hide();
            }
        }, { passive: true });
        
        // Hide tooltip on window resize
        window.addEventListener('resize', () => {
            if (this.isVisible) {
                this.hide();
            }
        });
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.contentCache.size,
            cacheHitRate: this.metrics.showCount > 0 ? (this.metrics.cacheHits / this.metrics.showCount * 100).toFixed(1) + '%' : '0%'
        };
    }
    
    clearCache() {
        this.contentCache.clear();
        this.metrics.cacheHits = 0;
    }
    
    /**
     * Show building tooltip for a parcel
     */
    showBuildingTooltip(row, col, x, y, options = {}) {
        const data = this.dataCollector.getBuildingTooltipData(row, col);
        if (!data) return;

        const content = this.renderer.renderBuildingTooltip(data);
        this.show(content, x, y, {
            ...options,
            html: true,
            maxWidth: 350,
            priority: 2,
            cacheKey: `building-${row}-${col}`
        });
    }

    /**
     * Show empty parcel tooltip
     */
    showEmptyParcelTooltip(row, col, x, y, options = {}) {
        const data = this.dataCollector.getEmptyParcelTooltipData(row, col);
        if (!data) return;

        const content = this.renderer.renderEmptyParcelTooltip(data);
        this.show(content, x, y, {
            ...options,
            html: true,
            maxWidth: 300,
            priority: 1,
            cacheKey: `empty-${row}-${col}`
        });
    }

    /**
     * Setup tooltips for game canvas and UI elements
     */
    setupGameTooltips() {
        // Setup vitality bar tooltips
        this.setupVitalityTooltips();

        // Setup metric tooltips
        this.setupMetricTooltips();

        // Setup governance tooltips
        this.setupGovernanceTooltips();
    }

    /**
     * Setup vitality bar tooltips
     */
    setupVitalityTooltips() {
        document.querySelectorAll('.vitality-row[data-vitality]').forEach(row => {
            row.addEventListener('mouseenter', (e) => {
                const tooltipData = row.getAttribute('data-tooltip-data');
                if (tooltipData) {
                    const content = this.generateVitalityTooltipContent(tooltipData);
                    const rect = row.getBoundingClientRect();
                    const x = rect.left - 20;
                    const y = rect.top + rect.height / 2;

                    this.show(content, x, y, {
                        delay: -50, // Show twice as fast (negative delay = instant)
                        maxWidth: 320,
                        priority: 2,
                        html: true,
                        animationSpeed: 'ultra-fast'
                    });
                }
            });

            row.addEventListener('mouseleave', () => {
                this.hide();
            });
        });
    }

    /**
     * Setup metric tooltips for sidebar elements
     */
    setupMetricTooltips() {
        document.querySelectorAll('.metric-tooltip').forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                const tooltipText = element.getAttribute('data-tooltip');
                const metricType = element.getAttribute('data-metric');

                if (tooltipText) {
                    // Get enhanced tooltip with sum values
                    const enhancedTooltip = this.generateMetricTooltipWithSums(tooltipText, metricType);

                    const rect = element.getBoundingClientRect();
                    const x = rect.left - 20;
                    const y = rect.top + rect.height / 2;

                    this.show(enhancedTooltip, x, y, {
                        delay: 200,
                        maxWidth: 300,
                        priority: 1,
                        html: true
                    });
                }
            });

            element.addEventListener('mouseleave', () => {
                this.hide();
            });
        });
    }

    /**
     * Generate enhanced metric tooltip with sum values
     */
    generateMetricTooltipWithSums(baseTooltip, metricType) {
        if (!window.game) return baseTooltip;

        let enhancedTooltip = baseTooltip;

        // Add sum values for JEEFHH metrics
        const jeefhhMetrics = ['housing', 'food', 'energy', 'jobs', 'education', 'healthcare'];
        if (jeefhhMetrics.includes(metricType)) {
            const supply = window.game.vitalitySupply?.[metricType.toUpperCase()] || 0;
            const demand = window.game.vitalityDemand?.[metricType.toUpperCase()] || 0;

            enhancedTooltip += `<br/><br/><strong>Current Values:</strong><br/>`;
            enhancedTooltip += `Supply: ${supply.toFixed(1)}<br/>`;
            enhancedTooltip += `Demand: ${demand.toFixed(1)}<br/>`;
            enhancedTooltip += `Balance: ${(supply - demand).toFixed(1)}`;
        }

        // Add sum values for CARENS metrics
        const carensMetrics = ['safety', 'environment', 'culture', 'affordability', 'noise', 'resilience'];
        if (carensMetrics.includes(metricType)) {
            // Calculate city-wide CARENS average for this metric type
            let totalScore = 0;
            let validCells = 0;

            for (let row = 0; row < window.game.gridSize; row++) {
                for (let col = 0; col < window.game.gridSize; col++) {
                    const parcel = window.game.grid[row][col];
                    if (parcel && parcel.building) {
                        // Only count completed buildings
                        const isUnderConstruction = parcel._constructionProgress < 1.0;
                        if (!isUnderConstruction) {
                            const score = window.game.smartTooltipSystem?.calculateCARENSScore(row, col, metricType);
                            if (score !== undefined) {
                                totalScore += score;
                                validCells++;
                            }
                        }
                    }
                }
            }

            const averageScore = validCells > 0 ? (totalScore / validCells) : 0;
            enhancedTooltip += `<br/><br/><strong>City Average:</strong><br/>`;
            enhancedTooltip += `${averageScore.toFixed(1)} (Range: -100 to +100)<br/>`;
            enhancedTooltip += `Evaluated across ${validCells} completed buildings`;
        }

        return enhancedTooltip;
    }

    /**
     * Setup governance tooltips for budget categories
     */
    setupGovernanceTooltips() {
        document.querySelectorAll('.budget-category[data-tooltip]').forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                const tooltipText = element.getAttribute('data-tooltip');
                if (tooltipText) {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top;

                    this.show(tooltipText, x, y, {
                        delay: 150,
                        maxWidth: 280,
                        priority: 1,
                        html: true
                    });
                }
            });

            element.addEventListener('mouseleave', () => {
                this.hide();
            });
        });
    }

    /**
     * Generate tooltip content for vitality bars
     */
    generateVitalityTooltipContent(tooltipData) {
        const data = JSON.parse(tooltipData);

        if (data.type === 'supply-demand') {
            let content = `<strong>${data.domain}</strong><br><em>Supply & Demand</em><br><br>`;
            content += `<strong>Supply:</strong> ${data.supply.toFixed(1)}<br>`;
            content += `<strong>Demand:</strong> ${data.demand.toFixed(1)}<br>`;
            content += `<strong>Balance:</strong> ${data.balance >= 0 ? '+' : ''}${data.balance.toFixed(1)}<br>`;
            content += `<strong>Ratio:</strong> ${data.ratio.toFixed(0)}%<br><br>`;

            if (data.ratio > 0) {
                content += `<span style="color: #4CAF50">✓ Surplus available</span>`;
            } else if (data.ratio < -50) {
                content += `<span style="color: #f44336">⚠ Critical shortage</span>`;
            } else if (data.ratio < 0) {
                content += `<span style="color: #ff9800">⚠ Shortage detected</span>`;
            } else {
                content += `<span style="color: #666">— Balanced</span>`;
            }

            return content;
        } else if (data.type === 'net-score') {
            let content = `<strong>${data.domain}</strong><br><em>Net Score</em><br><br>`;
            content += `<strong>Score:</strong> ${data.score >= 0 ? '+' : ''}${data.score.toFixed(0)}<br>`;
            content += `<strong>Buildings:</strong> ${data.buildingCount}<br><br>`;

            if (Object.keys(data.impactDetails).length > 0) {
                content += `<strong>Building Breakdown:</strong><br>`;
                Object.entries(data.impactDetails)
                    .sort(([,a], [,b]) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact))
                    .slice(0, 5)
                    .forEach(([name, details]) => {
                        const impact = details.totalImpact >= 0 ? '+' : '';
                        const color = details.totalImpact >= 0 ? '#4CAF50' : '#f44336';
                        content += `• <span style="color: ${color}">${name} (×${details.count}): ${impact}${details.totalImpact.toFixed(1)}</span><br>`;
                    });

                if (Object.keys(data.impactDetails).length > 4) {
                    content += `• <em>... and ${Object.keys(data.impactDetails).length - 4} others</em><br>`;
                }
            } else {
                content += `<em>No buildings affecting this metric</em>`;
            }

            return content;
        }

        return 'No data available';
    }

    /**
     * Refresh tooltip setup after DOM changes
     */
    refreshTooltips() {
        this.setupGameTooltips();
    }

    destroy() {
        this.isDestroyed = true;
        this.hide();
        this.clearTimers();
        this.clearCache();

        if (this.dataCollector) {
            this.dataCollector.clearCache();
        }

        if (this.tooltipElement) {
            this.tooltipElement.remove();
            this.tooltipElement = null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TooltipManager,
        TooltipDataCollector,
        TooltipRenderer
    };
} else {
    window.TooltipManager = TooltipManager;
    window.TooltipDataCollector = TooltipDataCollector;
    window.TooltipRenderer = TooltipRenderer;
}