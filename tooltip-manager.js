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

        const parcel = this.game.grid[row][col];
        if (!parcel?.building) return null;

        const building = this.game.buildingManager.getBuildingById(parcel.building);
        if (!building) return null;

        // Collect all data needed for tooltip
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

            // Performance data
            performance: this.getPerformanceData(row, col, parcel, building),

            // Cashflow data
            cashflow: this.getCashflowData(row, col, parcel, building),

            // Production data ("Adds up to")
            production: this.getProductionData(building),

            // Needs data (only unsatisfied needs)
            needs: this.getNeedsData(building, row, col)
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
        if (window.PlayerUtils?.isCurrentPlayer(parcel.owner, this.game)) {
            return {
                name: this.game.playerSettings?.name || 'You',
                isCurrentPlayer: true
            };
        } else if (parcel.owner && parcel.owner !== 'unclaimed') {
            return {
                name: window.PlayerUtils?.getPlayerDisplayName(parcel.owner, this.game) || parcel.owner,
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
    getPerformanceData(row, col, parcel, building) {
        const isUnderConstruction = parcel._isUnderConstruction ||
            (parcel.constructionStartDay !== null && parcel.constructionDays > 0 &&
             (this.game.currentDay - parcel.constructionStartDay) < parcel.constructionDays);

        if (isUnderConstruction) {
            // Calculate live construction progress
            let progressPercent = 0;

            if (parcel._constructionStartTime && parcel._constructionDays) {
                const elapsedMs = Date.now() - parcel._constructionStartTime;
                const totalConstructionMs = parcel._constructionDays * this.game.dayDuration;
                progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalConstructionMs) * 100)));
            } else if (parcel._constructionProgress !== undefined) {
                progressPercent = Math.round(parcel._constructionProgress * 100);
            }

            return {
                isUnderConstruction: true,
                progressPercent: progressPercent
            };
        }

        // Use new performance engine for accurate calculations
        let performancePercent = 0;

        if (this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
            const parcelId = `${row}-${col}`;
            const serverEfficiency = this.game.buildingEfficiencies?.[parcelId];
            if (serverEfficiency) {
                performancePercent = serverEfficiency.efficiency;
            }
        } else if (this.game.economicAPI) {
            // Use server-side economic API for authoritative performance data
            // For now, use non-blocking client fallback until we implement async tooltips
            if (this.game.performanceEngine) {
                const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
                if (performanceInfo) {
                    performancePercent = Math.round(performanceInfo.performance * 100);
                }
            }

            // Async server call for future updates (non-blocking)
            this.game.economicAPI.getBuildingPerformance(row, col).then(performanceInfo => {
                if (performanceInfo) {
                    // TODO: Update tooltip if still visible
                    console.log(`Server performance for ${row},${col}: ${Math.round(performanceInfo.performance * 100)}%`);
                }
            }).catch(error => {
                console.error('Failed to get building performance from server:', error);
            });
        } else if (this.game.performanceEngine) {
            // Fallback: Use local performance engine
            const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
            if (performanceInfo) {
                performancePercent = Math.round(performanceInfo.performance * 100);
            }
        } else if (this.game.buildingSystem) {
            // Fallback to old system
            performancePercent = this.game.buildingSystem.getBuildingEfficiency(row, col);
        }

        return {
            isUnderConstruction: false,
            performancePercent: performancePercent
        };
    }

    /**
     * Get cashflow data for the building
     */
    getCashflowData(row, col, parcel, building) {
        // Use server-side economic API if available
        if (this.game.economicAPI) {
            // For now, use local fallback and make non-blocking server call
            let result = undefined;
            if (this.game.performanceEngine) {
                const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
                if (performanceInfo) {
                    result = performanceInfo.actualRevenue;
                }
            }

            // Non-blocking server call for future updates
            this.game.economicAPI.getBuildingPerformance(row, col).then(performanceInfo => {
                if (performanceInfo) {
                    console.log(`Server cashflow for ${row},${col}: $${performanceInfo.actualRevenue}`);
                }
            }).catch(error => {
                console.error('Failed to get building cashflow from server:', error);
            });

            if (result !== undefined) return result;
        } else if (this.game.performanceEngine) {
            // Fallback: Use local performance engine
            const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
            if (performanceInfo) {
                return performanceInfo.actualRevenue;
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
                type: 'Housing'
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
        } else if (this.game.economicAPI) {
            // Use server-side economic API for authoritative need calculation
            // For now, use local fallback and make non-blocking server call
            if (this.game.performanceEngine) {
                const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);
                if (performanceInfo && performanceInfo.needs) {
                    performanceInfo.needs.forEach(need => {
                        // Only show unsatisfied needs (less than 100% satisfaction)
                        if (need.satisfaction < 1.0) {
                            let emoji = '❓';
                            switch(need.type) {
                                case 'workers': emoji = '👷'; break;
                                case 'jobs': emoji = '💼'; break;
                                case 'energy': emoji = '⚡'; break;
                                case 'food': emoji = '🌾'; break;
                            }

                            // Calculate how much is needed to reach 100% satisfaction
                            const shortfall = need.required * (1.0 - need.satisfaction);
                            needs.push({
                                type: need.type,
                                emoji: emoji,
                                needed: Math.ceil(shortfall),
                                satisfaction: need.satisfaction
                            });
                        }
                    });
                }
            }

            // Non-blocking server call for future updates
            this.game.economicAPI.getBuildingPerformance(row, col).then(performanceInfo => {
                if (performanceInfo && performanceInfo.needs) {
                    console.log(`Server needs for ${row},${col}:`, performanceInfo.needs.length);
                }
            }).catch(error => {
                console.error('Failed to get building needs from server:', error);
            });
        } else if (this.game.performanceEngine) {
            // Fallback: Use local performance engine for need calculation
            const performanceInfo = this.game.performanceEngine.calculateBuildingPerformance(row, col);

            if (performanceInfo && performanceInfo.needs) {
                performanceInfo.needs.forEach(need => {
                    // Only show unsatisfied needs (less than 100% satisfaction)
                    if (need.satisfaction < 1.0) {
                        let emoji = '❓';
                        switch(need.type) {
                            case 'workers': emoji = '👷'; break;
                            case 'jobs': emoji = '💼'; break;
                            case 'energy': emoji = '⚡'; break;
                            case 'food': emoji = '🌾'; break;
                        }

                        // Calculate how much is needed to reach 100% satisfaction
                        const deficit = need.required * (1 - need.satisfaction);
                        needs.push({
                            emoji: emoji,
                            amount: Math.ceil(deficit),
                            type: need.type
                        });
                    }
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

        // Building name and owner with location in top right
        html += `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">`;
        html += `<div>`;
        html += `<strong style="color: #4CAF50; font-size: 16px;">${data.name}</strong><br>`;
        html += `<span style="color: #888;">Owned by ${data.owner.name}</span>`;
        html += `</div>`;
        if (data.location) {
            html += `<div style="color: #666; font-size: 12px; font-weight: bold;">${data.location}</div>`;
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
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #FFA726;">🚧 Status:</span> <span style="color: #FF9800;">Under Construction (${data.performance.progressPercent}%)</span>`;
            html += `</div>`;
        } else {
            const perfColor = window.ColorUtils?.getPerformanceColor(data.performance.performancePercent) || '#4CAF50';
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #E0E0E0;">⚡ Performance:</span> <strong style="color: ${perfColor};">${data.performance.performancePercent}%</strong>`;
            html += `</div>`;
        }

        // Cashflow information
        if (data.cashflow !== undefined) {
            const cashflowColor = window.ColorUtils?.getCashflowColor(data.cashflow) || '#4CAF50';
            const cashflowPrefix = data.cashflow >= 0 ? '+' : '';
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #E0E0E0;">💰 Daily Cashflow:</span> <strong style="color: ${cashflowColor};">${cashflowPrefix}$${data.cashflow.toLocaleString()}</strong>`;
            html += `</div>`;
        }

        // Production (only show if has production)
        if (data.production && data.production.length > 0) {
            html += `<div style="margin-bottom: 8px;">`;
            html += `<strong style="color: #66BB6A;">Produces:</strong><br>`;
            data.production.forEach(item => {
                html += `<span style="margin-left: 8px; color: #A5D6A7;">${item.emoji} ${item.amount} ${item.type}</span><br>`;
            });
            html += `</div>`;
        }

        // Needs (only show if has needs)
        if (data.needs && data.needs.length > 0) {
            html += `<div style="margin-bottom: 4px;">`;
            html += `<strong style="color: #FFB74D;">Requires:</strong><br>`;
            data.needs.forEach(item => {
                html += `<span style="margin-left: 8px; color: #FFCC02;">${item.emoji} ${item.amount} ${item.type}</span><br>`;
            });
            html += `</div>`;
        }

        return html;
    }

    /**
     * Render empty parcel tooltip
     */
    renderEmptyParcelTooltip(data) {
        if (!data || !data.isEmpty) return '';

        let html = '';

        html += `<div style="margin-bottom: 8px;">`;
        html += `<strong style="color: #90A4AE; font-size: 16px;">Empty Parcel</strong><br>`;
        html += `<span style="color: #666;">Location: ${data.location}</span>`;
        html += `</div>`;

        if (data.owner) {
            html += `<div style="margin-bottom: 8px;">`;
            html += `<span style="color: #888;">Owned by ${data.owner.name}</span>`;
            html += `</div>`;
        }

        if (data.landValue !== undefined) {
            html += `<div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; margin-bottom: 8px;">`;
            html += `<span style="color: #64B5F6;">🏞️ Land Value:</span> <strong>$${data.landValue.toLocaleString()}</strong>`;
            html += `</div>`;
        }

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
        
        // Set timer to show tooltip after delay
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
            const transitionDuration = animationSpeed === 'fast' ? '0.075s' : '0.15s';
            this.tooltipElement.style.transition = `opacity ${transitionDuration} ease, visibility ${transitionDuration} ease`;
            
            // Show tooltip with smooth animation
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.visibility = 'visible';
            this.isVisible = true;
            this.lastContent = content;
            this.lastPosition = { x, y };
            this.metrics.showCount++;
            
        }, delay);
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
                
                // Prefer left positioning when near sidebar (rightmost 350px)
                if (x > viewportWidth - 350) {
                    if (pos.name.includes('left')) score += 15;
                } else {
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
                        delay: 0,
                        maxWidth: 320,
                        priority: 2,
                        html: true,
                        animationSpeed: 'fast'
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
                if (tooltipText) {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left - 20;
                    const y = rect.top + rect.height / 2;

                    this.show(tooltipText, x, y, {
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

            // Show status with appropriate styling
            const status = data.status || (data.ratio >= 0 ? 'Balanced' : 'Shortage');
            let statusColor;
            if (status === 'Surplus') {
                statusColor = '#22c55e'; // Green
            } else if (status === 'Balanced') {
                statusColor = '#22c55e'; // Green
            } else if (status === 'Minor Shortage') {
                statusColor = '#fb923c'; // Orange
            } else if (status === 'Shortage') {
                statusColor = '#f87171'; // Light red
            } else if (status === 'Critical Shortage') {
                statusColor = '#dc2626'; // Dark red
            } else {
                statusColor = '#666'; // Gray fallback
            }

            content += `<span style="color: ${statusColor}">● ${status}</span>`;

            return content;
        } else if (data.type === 'net-score') {
            let content = `<strong>${data.domain}</strong><br><em>Net Score</em><br><br>`;
            content += `<strong>Score:</strong> ${data.score >= 0 ? '+' : ''}${data.score.toFixed(0)}<br>`;
            content += `<strong>Buildings:</strong> ${data.buildingCount}<br><br>`;

            if (Object.keys(data.impactDetails).length > 0) {
                content += `<strong>Building Breakdown:</strong><br>`;
                Object.entries(data.impactDetails)
                    .sort(([,a], [,b]) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact))
                    .slice(0, 4)
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