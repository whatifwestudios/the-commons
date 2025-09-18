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
            
            // Value info
            buildingValue: this.getBuildingValue(row, col, parcel, building),
            landValue: this.getLandValue(row, col, parcel),
            
            // Performance data
            performance: this.getPerformanceData(row, col, parcel, building),
            
            // Production data ("Adds up to")
            production: this.getProductionData(building),
            
            // Needs data (only unsatisfied needs)
            needs: this.getNeedsData(building, row, col),
            
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
     * Get performance data as percentage - uses server data in multiplayer
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
                // Calculate real-time progress within the current day
                const daysPassed = this.game.gameDate.day - parcel.constructionStartDay;
                
                // Add real-time progress within current day (simulating time passing)
                // User requested: divide by 3600/365 for real-time feel
                // This makes real seconds count as game time progression
                const currentTime = Date.now();
                const sessionStart = this.game.sessionStartTime || currentTime;
                const secondsSinceStart = (currentTime - sessionStart) / 1000;
                const simulatedDaysFromTime = secondsSinceStart / (3600 / 365); // Convert real seconds to game days
                const realTimeDays = daysPassed + simulatedDaysFromTime;
                
                const progress = Math.max(0, Math.min(1.0, realTimeDays / parcel.constructionDays));
                progressPercent = Math.round(progress * 100);
            }
            
            return {
                isUnderConstruction: true,
                progressPercent: progressPercent
            };
        }

        // Use server-calculated efficiency in multiplayer, local calculation in solo mode
        let performancePercent = 100;
        
        if (this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
            // Use server-calculated building efficiency
            const parcelId = `${row}-${col}`;
            const serverEfficiency = this.game.buildingEfficiencies?.[parcelId];
            if (serverEfficiency) {
                performancePercent = serverEfficiency.efficiency;
            }
        } else {
            // Solo mode: calculate locally
            const efficiencyInfo = this.game.economicEngine.calculateBuildingEfficiencyPercentage(row, col);
            performancePercent = efficiencyInfo ? Math.round(efficiencyInfo.percentage) : 100;
        }
        
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
        
        // Housing production (bedrooms/housing capacity)
        if (building.population?.bedroomsAdded > 0) {
            production.push({
                emoji: '🏠',
                amount: building.population.bedroomsAdded,
                type: 'Housing'
            });
        }
        
        // Food production  
        if (building.resources?.foodProduction > 0) {
            production.push({
                emoji: '🌾',
                amount: building.resources.foodProduction,
                type: 'Food'
            });
        }
        
        // Energy production (negative energyDemand means energy producer)
        if (building.resources?.energyDemand < 0) {
            production.push({
                emoji: '⚡',
                amount: Math.abs(building.resources.energyDemand),
                type: 'Energy'
            });
        }
        
        // Job production
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
     * Get needs data - only show UNSATISFIED needs, uses server data in multiplayer
     */
    getNeedsData(building, row, col) {
        const needs = [];
        
        if (this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
            // Use server-calculated building efficiency data
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
                        amount: Math.ceil(need.deficit), // Show how much is missing
                        type: need.type,
                        satisfaction: Math.round(need.satisfaction * 100) // For debugging
                    });
                });
            }
        } else {
            // Solo mode: calculate locally
            const efficiencyInfo = this.game.economicEngine.calculateBuildingEfficiencyPercentage(row, col);
            
            if (efficiencyInfo && efficiencyInfo.unsatisfiedNeeds) {
                efficiencyInfo.unsatisfiedNeeds.forEach(need => {
                    let emoji = '❓';
                    switch(need.name) {
                        case 'Workers': emoji = '👷'; break;
                        case 'Energy': emoji = '⚡'; break;
                        case 'Food': emoji = '🌾'; break;
                    }
                    
                    needs.push({
                        emoji: emoji,
                        amount: Math.ceil(need.deficit), // Show how much is missing
                        type: need.name,
                        satisfaction: Math.round(need.satisfaction * 100) // For debugging
                    });
                });
            }
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
     * Get building value
     */
    getBuildingValue(row, col, parcel, building) {
        try {
            // Try to get building value from economics or building data
            if (building.economics?.baseValue) {
                return building.economics.baseValue;
            }
            
            // Try to get from game's building value calculation
            if (this.game.getBuildingValue) {
                return this.game.getBuildingValue(row, col);
            }
            
            // Fallback: estimate from building cost
            if (building.cost) {
                return building.cost;
            }
            
            return undefined;
        } catch (error) {
            console.warn('Could not get building value:', error);
            return undefined;
        }
    }

    /**
     * Get land value
     */
    getLandValue(row, col, parcel) {
        try {
            // Try to get from parcel land value data
            if (parcel.landValue?.calculatedValue) {
                return parcel.landValue.calculatedValue;
            }
            
            // Try to get from game's land value calculation
            if (this.game.getParcelPrice) {
                return this.game.getParcelPrice(row, col);
            }
            
            return undefined;
        } catch (error) {
            console.warn('Could not get land value:', error);
            return undefined;
        }
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