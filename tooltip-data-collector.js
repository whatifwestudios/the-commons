/**
 * Tooltip Data Collector - Clean, reliable data collection for tooltips
 * Separates data gathering from presentation for better performance and maintainability
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
            
            // Owner info
            owner: this.getOwnerInfo(parcel),
            
            // Performance data
            performance: this.getPerformanceData(row, col, parcel, building),
            
            // Production data ("Adds up to")
            production: this.getProductionData(building),
            
            // Needs data
            needs: this.getNeedsData(building),
            
            // Construction status
            construction: this.getConstructionData(parcel)
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
            let ownerName = parcel.owner;
            
            // Get multiplayer player name if available
            if (this.game.multiplayerManager && this.game.multiplayerManager.players.has(parcel.owner)) {
                const player = this.game.multiplayerManager.players.get(parcel.owner);
                ownerName = player.name || ownerName;
            } else if (this.game.competitorNames && this.game.competitorNames[parcel.owner]) {
                ownerName = this.game.competitorNames[parcel.owner];
            }
            
            return {
                name: ownerName,
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
        // Check if under construction
        const isUnderConstruction = parcel._isUnderConstruction || 
            (parcel.constructionStartDay !== null && parcel.constructionDays > 0 &&
             (this.game.gameDate.day - parcel.constructionStartDay) < parcel.constructionDays);
        
        if (isUnderConstruction) {
            let progressPercent = 0;
            if (parcel._constructionProgress !== undefined) {
                progressPercent = Math.round(parcel._constructionProgress * 100);
            } else if (parcel.constructionStartDay !== null && parcel.constructionDays > 0) {
                const daysPassed = this.game.gameDate.day - parcel.constructionStartDay;
                const progress = Math.max(0, Math.min(1.0, daysPassed / parcel.constructionDays));
                progressPercent = Math.round(progress * 100);
            }
            
            return {
                isUnderConstruction: true,
                progressPercent: progressPercent
            };
        }

        // Get efficiency percentage for completed buildings
        const efficiencyInfo = this.game.economicEngine.calculateBuildingEfficiencyPercentage(row, col);
        const performancePercent = efficiencyInfo ? Math.round(efficiencyInfo.percentage) : 100;
        
        return {
            isUnderConstruction: false,
            performancePercent: performancePercent
        };
    }

    /**
     * Get production data ("Adds up to" section)
     */
    getProductionData(building) {
        const production = [];
        
        if (building.population?.residentsHoused > 0) {
            production.push({
                emoji: '🏠',
                amount: building.population.residentsHoused,
                type: 'Residents'
            });
        }
        
        if (building.resources?.foodProduction > 0) {
            production.push({
                emoji: '🌾',
                amount: building.resources.foodProduction,
                type: 'Food'
            });
        }
        
        if (building.resources?.energyProduction > 0) {
            production.push({
                emoji: '⚡',
                amount: building.resources.energyProduction,
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
     * Get needs data
     */
    getNeedsData(building) {
        const needs = [];
        
        if (building.population?.workersNeeded > 0) {
            needs.push({
                emoji: '👷',
                amount: building.population.workersNeeded,
                type: 'Workers'
            });
        }
        
        if (building.resources?.foodDemand > 0) {
            needs.push({
                emoji: '🌾',
                amount: building.resources.foodDemand,
                type: 'Food'
            });
        }
        
        if (building.resources?.energyDemand > 0) {
            needs.push({
                emoji: '⚡',
                amount: building.resources.energyDemand,
                type: 'Energy'
            });
        }
        
        return needs;
    }

    /**
     * Get construction status data
     */
    getConstructionData(parcel) {
        const isUnderConstruction = parcel._isUnderConstruction || 
            (parcel.constructionStartDay !== null && parcel.constructionDays > 0);
            
        return {
            isUnderConstruction: isUnderConstruction,
            constructionStartDay: parcel.constructionStartDay,
            constructionDays: parcel.constructionDays,
            constructionProgress: parcel._constructionProgress
        };
    }

    /**
     * Cache management
     */
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

// Export for use in main game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TooltipDataCollector;
} else {
    window.TooltipDataCollector = TooltipDataCollector;
}