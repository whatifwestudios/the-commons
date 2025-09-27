/**
 * Smart Contextual Tooltip System
 *
 * Provides intelligent, context-aware tooltips with real-time
 * building performance, needs, and economic data
 */

class SmartTooltipSystem {
    constructor(game) {
        this.game = game;
        this.currentTooltip = null;
        this.lastUpdateTime = 0;
        this.updateInterval = 500; // Update every 500ms for real-time feel

        // Cache for performance data
        this.performanceCache = new Map();
        this.cacheTimeout = 2000; // 2 second cache

        // Tooltip content generators
        this.contentGenerators = {
            building: this.generateBuildingTooltip.bind(this),
            road: this.generateRoadTooltip.bind(this),
            empty: this.generateEmptyParcelTooltip.bind(this)
        };
    }

    /**
     * Generate intelligent tooltip for buildings
     */
    async generateBuildingTooltip(row, col, parcel) {
        const building = this.game.buildingManager?.getBuildingById(parcel.building);
        if (!building) return null;

        // Handle buildings under construction
        if (parcel._isUnderConstruction) {
            return this.generateConstructionTooltip(row, col, parcel, building);
        }

        // Get real-time performance data
        const performance = await this.getBuildingPerformance(row, col);
        const economics = await this.getBuildingEconomics(row, col);

        // Get owner name
        const ownerName = parcel.owner ? this.getPlayerName(parcel.owner) : 'Unowned';

        // Determine if critical condition for red header
        const efficiency = isNaN(performance.efficiency) ? 0 : performance.efficiency;
        const isCritical = efficiency < 0.4; // Less than 40% is critical

        const content = {
            title: `${building.name}`,
            subtitle: ownerName,
            sections: [],
            headerColor: isCritical ? '#ff4444' : null // Red header for critical
        };

        // Performance Overview Section
        content.sections.push({
            title: "Performance",
            items: [
                {
                    label: "Efficiency",
                    value: `${isNaN(performance.efficiency) ? 0 : Math.round(performance.efficiency * 100)}%`,
                    color: this.getEfficiencyColor(performance.efficiency),
                    trend: this.getEfficiencyTrend(row, col)
                },
                {
                    label: "Daily Income",
                    value: `$${(economics.netCashflow || 0).toFixed(0)}`,
                    color: (economics.netCashflow || 0) >= 0 ? '#00ff00' : '#ff4444'
                }
            ]
        });

        // Needs & Deficits Section
        if (performance.deficits && performance.deficits.length > 0) {
            content.sections.push({
                title: "⚠️ Current Issues",
                items: performance.deficits.map(deficit => ({
                    label: this.getDeficitLabel(deficit.type),
                    value: this.getDeficitDescription(deficit),
                    color: this.getDeficitColor(deficit.severity),
                    action: this.getDeficitAction(deficit.type)
                }))
            });
        }

        // Building Supplies Section - Show what this building provides
        const suppliesItems = this.generateBuildingSuppliesItems(building);
        if (suppliesItems.length > 0) {
            content.sections.push({
                title: "🏭 Provides",
                items: suppliesItems
            });
        }

        // JEEFHH Resource Analysis Section - Show what building needs
        const jeefhhItems = await this.generateJEEFHHResourceItems(row, col, building);
        if (jeefhhItems.length > 0) {
            content.sections.push({
                title: "⚠️ Needs",
                items: jeefhhItems
            });
        } else {
            // Only show CARENS quality of life items if JEEFHH needs are met
            const carensItems = await this.generateCARENSQualityItems(row, col, building);
            if (carensItems.length > 0) {
                content.sections.push({
                    title: "✨ Quality of Life",
                    items: carensItems
                });
            }
        }

        // Resource Status Section - Show what this building needs/provides
        const resourceItems = this.generateResourceItems(building, performance);
        if (resourceItems.length > 0) {
            content.sections.push({
                title: "Resources Needed",
                items: resourceItems
            });
        }

        // Building Details Section
        const age = Math.floor(parcel.buildingAge || 0);
        const decay = parcel.decay || 0;
        content.sections.push({
            title: "Building Details",
            items: [
                {
                    label: "Age",
                    value: `${age} days`,
                    color: age > 100 ? '#ffaa00' : '#cccccc'
                },
                {
                    label: "Condition",
                    value: `${Math.round((1 - decay) * 100)}%`,
                    color: this.getConditionColor(decay)
                },
                {
                    label: "Revenue",
                    value: `$${(economics.revenue || 0).toFixed(0)}/day`,
                    color: '#87ceeb'
                },
                {
                    label: "Maintenance",
                    value: `$${(economics.maintenance || 0).toFixed(0)}/day`,
                    color: '#ffa500'
                }
            ]
        });


        return content;
    }

    /**
     * Format real-time countdown in minutes and seconds
     */
    formatRealTimeCountdown(timeRemainingMs) {
        if (timeRemainingMs <= 0) return "Complete";

        const totalSeconds = Math.ceil(timeRemainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Format how long construction has been running
     */
    formatConstructionStartTime(elapsedMs, gameDayMs) {
        const daysElapsed = elapsedMs / gameDayMs;

        if (daysElapsed >= 1) {
            const days = Math.floor(daysElapsed);
            const hours = Math.floor((daysElapsed - days) * 24);
            if (days === 1 && hours === 0) return "1 day ago";
            if (days > 1 && hours === 0) return `${days} days ago`;
            if (days === 1) return `1 day, ${hours}h ago`;
            return `${days} days, ${hours}h ago`;
        } else {
            const hoursElapsed = daysElapsed * 24;
            if (hoursElapsed >= 1) {
                const hours = Math.floor(hoursElapsed);
                const minutes = Math.floor((hoursElapsed - hours) * 60);
                if (minutes === 0) return `${hours}h ago`;
                return `${hours}h ${minutes}m ago`;
            } else {
                const minutesElapsed = hoursElapsed * 60;
                if (minutesElapsed >= 1) {
                    return `${Math.ceil(minutesElapsed)}m ago`;
                } else {
                    return "Just started";
                }
            }
        }
    }

    /**
     * Get construction phase name based on progress
     */
    getConstructionPhase(progress) {
        if (progress < 0.25) return "Foundation";
        if (progress < 0.5) return "Framing";
        if (progress < 0.75) return "Build-out";
        if (progress < 0.95) return "Finishing";
        return "Final Inspection";
    }

    /**
     * Get detailed construction phase description
     */
    getConstructionPhaseDescription(progress) {
        if (progress < 0.25) return "🏗️ Excavation and foundation work";
        if (progress < 0.5) return "🔨 Structural framing and utilities";
        if (progress < 0.75) return "🏠 Interior and exterior construction";
        if (progress < 0.95) return "✨ Final details and systems testing";
        return "🔍 Quality inspection and approval";
    }

    /**
     * Generate tooltip for buildings under construction
     */
    generateConstructionTooltip(row, col, parcel, building) {
        const now = Date.now();
        const GAME_DAY_MS = 9860; // 1 day = 9.86 seconds (1 year = 1 hour = 3600s, so 1 day = 3600/365 = 9.86s)

        const startTime = parcel._constructionStartTime || now;
        const constructionDays = parcel._constructionDays || 3;
        const totalBuildTime = constructionDays * GAME_DAY_MS;
        const elapsedTime = now - startTime;
        const progress = Math.min(Math.max(elapsedTime / totalBuildTime, 0), 1);
        const timeRemaining = Math.max(0, totalBuildTime - elapsedTime);

        // Determine construction phase
        const phase = this.getConstructionPhase(progress);
        const progressColor = progress < 0.3 ? '#ff6b6b' : progress < 0.7 ? '#ffa500' : '#4ecdc4';

        return {
            title: `🚧 ${building.name}`,
            subtitle: `${Math.round(progress * 100)}% Complete`,
            sections: [
                {
                    title: "Construction",
                    items: [
                        {
                            label: "Time Remaining",
                            value: this.formatRealTimeCountdown(timeRemaining),
                            color: '#ffa500'
                        }
                    ]
                },
                {
                    title: "Building Details",
                    items: [
                        {
                            label: "Type",
                            value: building.category || "Building",
                            color: '#ffffff'
                        },
                        {
                            label: "Cost",
                            value: `$${building.cost || 0}`,
                            color: '#00ff00'
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Generate tooltip for empty parcels
     */
    async generateEmptyParcelTooltip(row, col, parcel) {
        const landValue = parcel.landValue?.currentValue || 0;
        const accessibility = this.calculateAccessibility(row, col);
        const suitability = await this.calculateBuildingSuitability(row, col);

        return {
            title: "Empty Parcel",
            subtitle: `Land Value: $${landValue.toFixed(0)}`,
            sections: [
            ]
        };
    }

    /**
     * Generate tooltip for roads
     */
    generateRoadTooltip(row, col, parcel) {
        const capacity = this.getTransportCapacity(row, col);
        const usage = this.getTransportUsage(row, col);
        const condition = parcel.roadCondition || 1.0;

        return {
            title: "Road",
            subtitle: `Condition: ${Math.round(condition * 100)}%`,
            sections: [
                {
                    title: "Traffic Analysis",
                    items: [
                        {
                            label: "Capacity",
                            value: `${capacity} units/day`,
                            color: '#87ceeb'
                        },
                        {
                            label: "Current Usage",
                            value: `${usage} units/day`,
                            color: usage > capacity * 0.8 ? '#ff4444' : '#90ee90'
                        },
                        {
                            label: "Congestion",
                            value: `${Math.round((usage / capacity) * 100)}%`,
                            color: this.getCongestionColor(usage / capacity)
                        }
                    ]
                },
                {
                    title: "Maintenance",
                    items: [
                        {
                            label: "Daily Cost",
                            value: `$${this.getRoadMaintenanceCost(condition).toFixed(2)}`,
                            color: '#ffa500'
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Get building performance with caching
     */
    async getBuildingPerformance(row, col) {
        const cacheKey = `${row},${col}`;
        const cached = this.performanceCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        // Get from economic API or calculate locally
        let performance;
        if (this.game.economicAPI) {
            // Pass current gameState for server synchronization
            const gameState = this.game.economicAPI.prepareGameState(this.game);
            performance = await this.game.economicAPI.getBuildingPerformance(row, col, gameState);
        }

        if (!performance) {
            // Fallback to local calculation
            const parcel = this.game.grid[row][col];
            const economics = this.game.buildingSystem?.calculateBuildingEconomics(parcel, row, col);

            performance = {
                efficiency: economics?.efficiency || 1.0,
                energySupply: economics?.energySupply || 0,
                energyDemand: economics?.energyDemand || 0,
                laborSupply: economics?.laborSupply || 0,
                laborDemand: economics?.laborDemand || 0,
                deficits: economics?.deficits || []
            };
        }

        // Cache the result
        this.performanceCache.set(cacheKey, {
            data: performance,
            timestamp: Date.now()
        });

        return performance;
    }

    /**
     * Get building economics data
     */
    async getBuildingEconomics(row, col) {
        const parcel = this.game.grid[row][col];
        return this.game.buildingSystem?.calculateBuildingEconomics(parcel, row, col) || {
            revenue: 0,
            maintenance: 0,
            netCashflow: 0
        };
    }

    /**
     * Generate smart recommendations based on building state
     */
    generateRecommendations(performance, economics, parcel) {
        const recommendations = [];

        // Low efficiency recommendations
        if (performance.efficiency < 0.7) {
            if (performance.energySupply < performance.energyDemand) {
                recommendations.push({
                    title: "Power Shortage",
                    description: "Build more power plants or connect to energy grid",
                    action: "build_energy"
                });
            }

            if (performance.laborSupply < performance.laborDemand) {
                recommendations.push({
                    title: "Worker Shortage",
                    description: "Build housing or improve transportation",
                    action: "build_housing"
                });
            }
        }

        // High decay recommendations
        const decay = parcel.decay || 0;
        if (decay > 0.3) {
            recommendations.push({
                title: "Maintenance Needed",
                description: "Building condition is declining. Consider renovation.",
                action: "renovate"
            });
        }

        // Economic recommendations
        if (economics.netCashflow < 0) {
            recommendations.push({
                title: "Losing Money",
                description: "Consider improving efficiency or changing building type",
                action: "optimize"
            });
        }

        return recommendations;
    }

    /**
     * Calculate building suitability for empty parcels
     */
    async calculateBuildingSuitability(row, col) {
        const parcel = this.game.grid[row][col];
        const accessibility = this.calculateAccessibility(row, col);
        const landValue = parcel.landValue?.currentValue || 0;

        // Simple suitability calculation
        const buildings = [
            { id: 'cottage', name: 'Cottage', score: Math.min(95, 60 + accessibility * 30) },
            { id: 'shop', name: 'Shop', score: Math.min(95, 40 + accessibility * 40 + (landValue / 1000) * 10) },
            { id: 'office', name: 'Office', score: Math.min(95, 30 + accessibility * 50 + (landValue / 2000) * 15) },
            { id: 'factory', name: 'Factory', score: Math.min(95, 70 + (accessibility * 20)) }
        ];

        return buildings.sort((a, b) => b.score - a.score);
    }

    /**
     * Calculate parcel accessibility
     */
    calculateAccessibility(row, col) {
        // Simple distance-based accessibility
        const center = Math.floor(this.game.gridSize / 2);
        const distance = Math.sqrt((row - center) ** 2 + (col - center) ** 2);
        const maxDistance = this.game.gridSize * 0.7;

        return Math.max(0, 1 - (distance / maxDistance));
    }

    /**
     * Helper methods for colors and formatting
     */
    getEfficiencyColor(efficiency) {
        if (efficiency >= 0.9) return '#00ff00';
        if (efficiency >= 0.7) return '#90ee90';
        if (efficiency >= 0.4) return '#ffff00';
        return '#ff4444';
    }

    getDeficitColor(severity) {
        switch(severity) {
            case 'critical': return '#ff0000';
            case 'high': return '#ff4444';
            case 'medium': return '#ffaa00';
            default: return '#ffff00';
        }
    }

    getConditionColor(decay) {
        const condition = 1 - decay;
        if (condition >= 0.8) return '#00ff00';
        if (condition >= 0.6) return '#90ee90';
        if (condition >= 0.4) return '#ffaa00';
        return '#ff4444';
    }

    getDeficitLabel(type) {
        const labels = {
            energy: '⚡ Energy Shortage',
            workers: '👷 Worker Shortage',
            food: '🍎 Food Shortage',
            jobs: '💼 Job Shortage'
        };
        return labels[type] || `${type} Shortage`;
    }

    getDeficitDescription(deficit) {
        return `Missing ${deficit.amount} units`;
    }

    getPerformanceSubtitle(performance) {
        const efficiency = isNaN(performance.efficiency) ? 0 : Math.round(performance.efficiency * 100);
        if (efficiency >= 90) return `🟢 Optimal (${efficiency}%)`;
        if (efficiency >= 70) return `🟡 Good (${efficiency}%)`;
        if (efficiency >= 40) return `🟠 Poor (${efficiency}%)`;
        return `🔴 Critical (${efficiency}%)`;
    }

    /**
     * Integration with existing tooltip system
     */
    async generateSmartContent(row, col) {
        const parcel = this.game.grid[row][col];

        if (parcel.building) {
            return await this.generateBuildingTooltip(row, col, parcel);
        } else if (parcel.terrain === 'road') {
            return this.generateRoadTooltip(row, col, parcel);
        } else {
            return await this.generateEmptyParcelTooltip(row, col, parcel);
        }
    }

    /**
     * Get efficiency trend (placeholder for future implementation)
     */
    getEfficiencyTrend(row, col) {
        return '↔'; // Neutral trend for now
    }

    /**
     * Get transport capacity for road
     */
    getTransportCapacity(row, col) {
        return 100; // Basic road capacity
    }

    /**
     * Get current transport usage for road
     */
    getTransportUsage(row, col) {
        return Math.floor(Math.random() * 80); // Placeholder usage calculation
    }

    /**
     * Get road maintenance cost based on condition
     */
    getRoadMaintenanceCost(condition) {
        const baseCost = 5;
        return baseCost * (2 - condition); // Higher cost for worse condition
    }

    /**
     * Get accessibility color based on score
     */
    getAccessibilityColor(accessibility) {
        if (accessibility >= 0.8) return '#00ff00';
        if (accessibility >= 0.6) return '#90ee90';
        if (accessibility >= 0.4) return '#ffff00';
        return '#ff4444';
    }

    /**
     * Get suitability color based on score
     */
    getSuitabilityColor(score) {
        if (score >= 80) return '#00ff00';
        if (score >= 60) return '#90ee90';
        if (score >= 40) return '#ffff00';
        return '#ff4444';
    }

    /**
     * Get congestion color based on usage ratio
     */
    getCongestionColor(ratio) {
        if (ratio <= 0.5) return '#00ff00';
        if (ratio <= 0.7) return '#90ee90';
        if (ratio <= 0.9) return '#ffff00';
        return '#ff4444';
    }

    /**
     * Get transport description for location
     */
    getTransportDescription(row, col) {
        const accessibility = this.calculateAccessibility(row, col);
        if (accessibility >= 0.8) return 'Excellent connectivity';
        if (accessibility >= 0.6) return 'Good connectivity';
        if (accessibility >= 0.4) return 'Fair connectivity';
        return 'Poor connectivity';
    }

    /**
     * Generate resource items based on building type and supply/demand logic
     */
    generateResourceItems(building, performance) {
        const items = [];

        // Always show energy if building consumes it
        if (performance.energyDemand > 0) {
            const energyBalance = (performance.energySupply || 0) - performance.energyDemand;
            items.push({
                label: "Energy",
                value: energyBalance >= 0 ? "✓ Satisfied" : `Need ${Math.abs(energyBalance)} units`,
                color: energyBalance >= 0 ? '#90ee90' : '#ff4444'
            });
        }

        // Handle worker/resident and job supply/demand based on building category
        const buildingType = this.getBuildingType(building);

        if (buildingType === 'residential') {
            // Residential buildings (cottages, apartments): Supply workers, demand jobs
            // Show job need for residents
            const jobDemand = performance.jobDemand || performance.laborDemand || 0;
            const jobSupply = performance.jobSupply || performance.laborSupply || 0;

            if (jobDemand > 0) {
                const jobBalance = jobSupply - jobDemand;
                items.push({
                    label: "Jobs for Residents",
                    value: jobBalance >= 0 ? "✓ Employed" : `Need ${Math.abs(jobBalance)} jobs`,
                    color: jobBalance >= 0 ? '#90ee90' : '#ff4444'
                });
            }
        } else if (buildingType === 'commercial' || buildingType === 'industrial') {
            // Commercial/Industrial buildings: Supply jobs, demand workers
            const workerDemand = performance.laborDemand || 0;
            const workerSupply = performance.laborSupply || 0;

            if (workerDemand > 0) {
                const workerBalance = workerSupply - workerDemand;
                items.push({
                    label: "Workers/Residents",
                    value: workerBalance >= 0 ? "✓ Fully Staffed" : `Need ${Math.abs(workerBalance)} workers`,
                    color: workerBalance >= 0 ? '#90ee90' : '#ff4444'
                });
            }
        } else {
            // For other building types (civic, utilities), show generic worker needs
            const workerDemand = performance.laborDemand || 0;
            const workerSupply = performance.laborSupply || 0;

            if (workerDemand > 0) {
                const workerBalance = workerSupply - workerDemand;
                items.push({
                    label: "Staff Needed",
                    value: workerBalance >= 0 ? "✓ Fully Staffed" : `Need ${Math.abs(workerBalance)} staff`,
                    color: workerBalance >= 0 ? '#90ee90' : '#ff4444'
                });
            }
        }

        // Show food demand if applicable
        if (performance.foodDemand > 0) {
            const foodBalance = (performance.foodSupply || 0) - performance.foodDemand;
            items.push({
                label: "Food",
                value: foodBalance >= 0 ? "✓ Well Fed" : `Need ${Math.abs(foodBalance)} units`,
                color: foodBalance >= 0 ? '#90ee90' : '#ff4444'
            });
        }

        return items;
    }

    /**
     * Generate building supplies section showing what this building provides
     */
    generateBuildingSuppliesItems(building) {
        if (!building || !building.resources) return [];

        const supplies = [];
        const resourcePriority = ['housing', 'food', 'energy', 'jobs', 'education', 'healthcare'];

        resourcePriority.forEach(resourceType => {
            const provided = building.resources[resourceType + 'Provided'] || 0;
            if (provided > 0) {
                supplies.push({
                    label: this.getBuildingSupplyLabel(building, resourceType),
                    value: `${provided}`,
                    color: '#4CAF50' // Green for supplies
                });
            }
        });

        return supplies;
    }

    /**
     * Get building-specific supply labels that reflect what the building actually provides
     */
    getBuildingSupplyLabel(building, resourceType) {
        const buildingId = building.id || building.type;

        switch (buildingId) {
            case 'farmers_market':
                if (resourceType === 'jobs') return 'Jobs for workers';
                if (resourceType === 'food') return 'Fresh food';
                break;

            case 'apartment_complex':
                if (resourceType === 'housing') return 'Housing for residents';
                if (resourceType === 'jobs') return 'Property management job';
                break;

            case 'cottage':
                if (resourceType === 'housing') return 'Family housing';
                break;

            case 'solar_farm':
                if (resourceType === 'energy') return 'Clean electricity';
                if (resourceType === 'jobs') return 'Maintenance jobs';
                break;

            case 'elementary_school':
                if (resourceType === 'education') return 'Primary education';
                if (resourceType === 'jobs') return 'Teaching jobs';
                break;

            case 'library':
                if (resourceType === 'education') return 'Educational resources';
                if (resourceType === 'jobs') return 'Library jobs';
                if (resourceType === 'healthcare') return 'Wellness programs';
                break;

            case 'brewery':
                if (resourceType === 'jobs') return 'Manufacturing jobs';
                if (resourceType === 'food') return 'Beverages & food';
                if (resourceType === 'education') return 'Trade skills training';
                break;
        }

        // Default label
        return `${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
    }

    /**
     * Generate JEEFHH resource analysis based on adjacent cells
     */
    async generateJEEFHHResourceItems(row, col, building) {
        if (!building) return [];

        // Priority order: Housing, Food, Energy, Jobs, Education, Healthcare
        const resourcePriority = ['housing', 'food', 'energy', 'jobs', 'education', 'healthcare'];
        const needs = [];

        resourcePriority.forEach(resourceType => {
            const score = this.game.buildingSystem.getAdjacentResourceScore(resourceType, row, col);
            const required = building.resources?.[resourceType + 'Required'] || 0;
            const provided = building.resources?.[resourceType + 'Provided'] || 0;

            // Only show needs for resources this building actually requires
            if (required > 0) {
                const deficit = Math.max(0, required - score);
                if (deficit > 0) {
                    // Customize messaging based on building function and resource type
                    const needLabel = this.getBuildingSpecificNeedLabel(building, resourceType, deficit);

                    needs.push({
                        label: needLabel,
                        value: `${deficit}`,
                        color: deficit > required * 0.5 ? '#ff6b6b' : '#ffa500'
                    });
                }
            }
        });

        // Return only top 2 most pressing needs
        return needs.slice(0, 2);
    }

    /**
     * Get building-specific need labels that reflect the building's actual function
     */
    getBuildingSpecificNeedLabel(building, resourceType, deficit) {
        const buildingId = building.id || building.type;

        // Customize based on building type and what it actually does
        switch (buildingId) {
            case 'farmers_market':
                if (resourceType === 'jobs') return 'Workers needed'; // Market needs workers to operate
                if (resourceType === 'energy') return 'Power needed'; // Market needs energy to operate
                break;

            case 'apartment_complex':
            case 'cottage':
                if (resourceType === 'energy') return 'Power needed'; // Residents need power
                if (resourceType === 'jobs') return 'Manager needed'; // Building needs management
                break;

            case 'solar_farm':
                if (resourceType === 'jobs') return 'Workers needed'; // Solar farm needs maintenance workers
                break;

            case 'elementary_school':
            case 'library':
                if (resourceType === 'jobs') return 'Staff needed'; // Schools need teachers/staff
                if (resourceType === 'energy') return 'Power needed'; // Schools need power to operate
                break;

            case 'brewery':
                if (resourceType === 'jobs') return 'Workers needed'; // Brewery needs production workers
                if (resourceType === 'energy') return 'Power needed'; // Brewery needs power for production
                break;
        }

        // Default labels for other cases
        return `${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)} needed`;
    }

    /**
     * Get resident-focused descriptive message for missing resource
     */
    getResourceHint(resourceType, lastCheck) {
        const emptyCount = lastCheck.missingResources.filter(r => r.reason === 'empty').length;

        switch(resourceType) {
            case 'jobs':
                return emptyCount > 0 ? 'Residents here are struggling to find work' : 'Workers are commuting too far for jobs';
            case 'energy':
                return emptyCount > 0 ? 'Power outages are disrupting daily life' : 'The energy supply is unreliable';
            case 'education':
                return emptyCount > 0 ? 'Children here lack access to schools' : 'Educational opportunities are limited';
            case 'food':
                return emptyCount > 0 ? 'Residents are going hungry' : 'Fresh food is hard to find nearby';
            case 'housing':
                return emptyCount > 0 ? 'Workers need places to live' : 'Housing shortage is affecting productivity';
            case 'healthcare':
                return emptyCount > 0 ? 'Residents here are getting sick without care' : 'Medical help is too far away';
            default:
                return 'Quality of life could be improved';
        }
    }

    /**
     * Get resource icon for display
     */
    getResourceIcon(resourceType) {
        const icons = {
            jobs: '💼',
            energy: '⚡',
            education: '🎓',
            food: '🍎',
            housing: '🏠',
            healthcare: '🏥'
        };
        return icons[resourceType] || '📋';
    }

    /**
     * Get human-readable resource name
     */
    getResourceDisplayName(resourceType) {
        const names = {
            jobs: 'Jobs',
            energy: 'Energy',
            education: 'Education',
            food: 'Food',
            housing: 'Housing',
            healthcare: 'Healthcare'
        };
        return names[resourceType] || resourceType;
    }

    /**
     * Get color based on resource score
     */
    getResourceScoreColor(score) {
        if (score >= 75) return '#90ee90';  // Light green
        if (score >= 50) return '#ffd700';  // Gold
        if (score >= 25) return '#ffa500';  // Orange
        return '#ff4444';                   // Red
    }

    /**
     * Get player display name
     */
    getPlayerName(playerId) {
        // Use game's method if available
        if (this.game.getPlayerName) {
            return this.game.getPlayerName(playerId);
        }
        // Fallback to basic display
        if (playerId === this.game.playerId) {
            return 'You';
        }
        return playerId || 'Unknown';
    }

    /**
     * Generate CARENS quality of life items (only shown when JEEFHH needs are met)
     */
    async generateCARENSQualityItems(row, col, building) {
        const items = [];

        // CARENS Priority Order: Safety, Environment, Culture, Affordability, Noise, Resilience
        const carensPriority = ['safety', 'environment', 'culture', 'affordability', 'noise', 'resilience'];

        carensPriority.forEach(qualityType => {
            const score = this.calculateCARENSScore(row, col, qualityType);
            const threshold = 60; // Below this threshold shows as a concern

            if (score < threshold) {
                const deficit = threshold - score;
                items.push({
                    label: `${qualityType.charAt(0).toUpperCase()}${qualityType.slice(1)} needed`,
                    value: `${Math.round(deficit)}%`,
                    color: score < 40 ? '#ff6b6b' : '#ffa500'
                });
            }
        });

        // Return only top 2 quality concerns
        return items.slice(0, 2);
    }

    /**
     * Calculate CARENS quality score for a specific aspect based on adjacent completed buildings
     * CARENS scores range from -100 to +100 with 0 as neutral baseline
     */
    calculateCARENSScore(row, col, qualityType) {
        const baseScore = 0; // Neutral baseline
        let totalImpact = 0;
        let buildingCount = 0;

        // Check all 8 adjacent cells (same pattern as JEEFHH system)
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (const [dRow, dCol] of directions) {
            const adjRow = row + dRow;
            const adjCol = col + dCol;

            // Skip if out of bounds
            if (adjRow < 0 || adjRow >= this.game.gridSize ||
                adjCol < 0 || adjCol >= this.game.gridSize) {
                continue;
            }

            const parcel = this.game.grid[adjRow][adjCol];
            if (!parcel || !parcel.building) continue;

            // Only consider completed buildings (OOO rule)
            const isUnderConstruction = parcel._constructionProgress < 1.0;
            if (isUnderConstruction) continue;

            const building = this.game.buildingManager?.getBuildingById(parcel.building);
            if (!building) continue;

            buildingCount++;
            const impact = this.getCARENSImpact(building, qualityType);
            totalImpact += impact;
        }

        // Calculate final score: sum of all impacts, scaled appropriately
        let finalScore = baseScore + totalImpact;

        // Clamp to -100 to +100 range
        return Math.max(-100, Math.min(100, finalScore));
    }

    /**
     * Get CARENS impact for a specific building and quality type
     */
    getCARENSImpact(building, qualityType) {
        const buildingId = building.id?.toLowerCase() || '';
        const category = building.category?.toLowerCase() || '';

        switch (qualityType) {
            case 'safety':
                // Civic buildings improve safety, industrial buildings reduce it
                if (category === 'civic') return 3;
                if (buildingId === 'library') return 2;
                if (category === 'industrial') return -2;
                if (buildingId === 'brewery') return -1;
                return 0;

            case 'environment':
                // Green energy improves environment, industrial reduces it
                if (buildingId === 'solar_farm') return 4;
                if (buildingId === 'park') return 3;
                if (category === 'industrial') return -3;
                if (buildingId === 'brewery') return -2;
                return 0;

            case 'culture':
                // Education and civic buildings improve culture
                if (buildingId === 'library') return 4;
                if (category === 'education') return 3;
                if (buildingId === 'public_pool') return 2;
                if (category === 'civic') return 1;
                return 0;

            case 'affordability':
                // Housing efficiency affects affordability
                if (buildingId === 'cottage') return 2; // More affordable housing
                if (buildingId === 'apartment_complex') return 1; // Dense housing
                if (category === 'commercial') return 1; // Local commerce
                return 0;

            case 'noise':
                // Industrial and commercial create noise, civic reduces it
                if (category === 'industrial') return -3;
                if (buildingId === 'brewery') return -2;
                if (category === 'commercial') return -1;
                if (buildingId === 'park') return 2;
                if (buildingId === 'library') return 1;
                return 0;

            case 'resilience':
                // Energy and essential services improve resilience
                if (buildingId === 'solar_farm') return 3;
                if (category === 'energy') return 2;
                if (category === 'education') return 2;
                if (buildingId === 'library') return 1;
                return 0;

            default:
                return 0;
        }
    }

    /**
     * Determine building type from building object
     */
    getBuildingType(building) {
        const buildingId = building.id?.toLowerCase() || '';
        const buildingName = building.name?.toLowerCase() || '';

        // Residential buildings
        if (buildingId.includes('cottage') || buildingId.includes('house') ||
            buildingId.includes('apartment') || buildingId.includes('residential') ||
            buildingName.includes('cottage') || buildingName.includes('house')) {
            return 'residential';
        }

        // Commercial buildings
        if (buildingId.includes('shop') || buildingId.includes('store') ||
            buildingId.includes('office') || buildingId.includes('commercial') ||
            buildingName.includes('shop') || buildingName.includes('office')) {
            return 'commercial';
        }

        // Industrial buildings
        if (buildingId.includes('factory') || buildingId.includes('warehouse') ||
            buildingId.includes('industrial') || buildingId.includes('mill') ||
            buildingName.includes('factory') || buildingName.includes('mill')) {
            return 'industrial';
        }

        // Default to civic/utility for everything else
        return 'civic';
    }

    /**
     * Clear performance cache
     */
    clearCache() {
        this.performanceCache.clear();
    }

    /**
     * Clear cache for buildings in affected area
     */
    clearCacheArea(centerRow, centerCol, radius = 3) {
        for (const [key] of this.performanceCache) {
            const coords = key.split(',');
            const row = parseInt(coords[0]);
            const col = parseInt(coords[1]);

            const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
            if (distance <= radius) {
                this.performanceCache.delete(key);
            }
        }
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartTooltipSystem;
} else {
    window.SmartTooltipSystem = SmartTooltipSystem;
}