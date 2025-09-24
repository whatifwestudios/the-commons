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

        const content = {
            title: `${building.name}`,
            subtitle: this.getPerformanceSubtitle(performance),
            sections: []
        };

        // Performance Overview Section
        content.sections.push({
            title: "Performance",
            items: [
                {
                    label: "Efficiency",
                    value: `${Math.round(performance.efficiency * 100)}%`,
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

        // Resource Status Section - Show what this building needs/provides
        const resourceItems = this.generateResourceItems(building, performance);
        if (resourceItems.length > 0) {
            content.sections.push({
                title: "Resources Needed",
                items: resourceItems
            });
        }

        // Building Details Section
        const age = parcel.buildingAge || 0;
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
     * Generate tooltip for buildings under construction
     */
    generateConstructionTooltip(row, col, parcel, building) {
        const startTime = parcel._constructionStartTime || Date.now();
        const timeRemaining = parcel._constructionTimeRemaining || 0;
        const totalBuildTime = building.buildTime || 5000; // Default 5 seconds if not defined
        const elapsedTime = Date.now() - startTime;
        const progress = Math.min(Math.max(elapsedTime / totalBuildTime, 0), 1);

        return {
            title: `🚧 ${building.name}`,
            subtitle: "Under Construction",
            sections: [
                {
                    title: "Construction Progress",
                    items: [
                        {
                            label: "Progress",
                            value: `${Math.round(progress * 100)}%`,
                            color: '#ffa500'
                        },
                        {
                            label: "Time Remaining",
                            value: timeRemaining > 0 ? `${Math.ceil(timeRemaining / 1000)}s` : "Almost complete",
                            color: '#888888'
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
            performance = await this.game.economicAPI.getBuildingPerformance(row, col);
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
        const efficiency = Math.round(performance.efficiency * 100);
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