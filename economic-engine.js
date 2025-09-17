/**
 * Economic Engine for The Commons
 * Handles all economic calculations, supply/demand, cashflow, and market dynamics
 */

class EconomicEngine {
    constructor(game) {
        this.game = game;
        
        // Economic state
        this.marketState = {
            supply: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            demand: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            balance: { energy: 0, food: 0, housing: 0, jobs: 0, workers: 0, residents: 0 },
            multipliers: { energy: 1.0, food: 1.0, housing: 1.0, jobs: 1.0, workers: 1.0, residents: 1.0 }
        };
        
        // Player economic state
        this.playerEconomy = {
            dailyCashflow: 0,
            buildingRevenue: 0,
            buildingMaintenance: 0,
            landValueTax: 0,
            lastUpdate: 0
        };
        
        // Market elasticity settings
        this.elasticity = {
            energy: 0.2,    // Inelastic - essential utility
            food: 0.4,      // Semi-elastic - necessary but some flexibility
            housing: 0.6,   // Elastic - people can adjust housing choices
            jobs: 0.8       // Very elastic - flexible employment market
        };
        
        // Economic cache
        this.cache = {
            supplyDemand: new Map(),
            cashflowBreakdown: null,
            lastCacheUpdate: 0
        };
    }
    
    /**
     * Initialize the economic engine
     */
    initialize() {
        this.updateSupplyDemandBalance();
        this.calculatePlayerCashflow();
    }
    
    /**
     * Process daily economic activities
     */
    processDailyEconomics() {
        // Update supply/demand
        this.updateSupplyDemandBalance();
        
        // Calculate and apply cashflow
        const cashflow = this.calculatePlayerCashflow();
        this.game.playerCash += cashflow.net;
        
        // Update market multipliers
        this.updateMarketMultipliers();
        
        // Age buildings and decay
        if (this.game.buildingSystem) {
            this.game.buildingSystem.ageBuildings(1);
        }
        
        // Update road maintenance costs
        this.updateRoadMaintenance();
        
        return cashflow;
    }
    
    /**
     * Calculate comprehensive supply and demand balance
     */
    updateSupplyDemandBalance() {
        // Reset balances
        Object.keys(this.marketState.supply).forEach(key => {
            this.marketState.supply[key] = 0;
            this.marketState.demand[key] = 0;
            this.marketState.balance[key] = 0;
        });
        
        if (!this.game.grid) return;
        
        // Iterate through all parcels
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel || !parcel.building) continue;
                
                const building = this.game.buildingManager?.getBuildingById(parcel.building);
                if (!building) continue;
                
                // Supply calculations
                if (building.resources?.energySupply > 0) {
                    this.marketState.supply.energy += building.resources.energySupply;
                }
                if (building.resources?.foodProduction > 0) {
                    this.marketState.supply.food += building.resources.foodProduction;
                }
                if (building.population?.bedroomsAdded > 0) {
                    this.marketState.supply.housing += building.population.bedroomsAdded;
                    this.marketState.supply.residents += (parcel.population || 0);
                }
                if (building.population?.jobsCreated > 0) {
                    this.marketState.supply.jobs += building.population.jobsCreated;
                }
                
                // Demand calculations
                if (building.resources?.energyDemand > 0) {
                    this.marketState.demand.energy += building.resources.energyDemand;
                }
                if (building.population?.bedroomsAdded > 0) {
                    // Residents need food
                    const residents = parcel.population || 0;
                    this.marketState.demand.food += residents * 0.5; // 0.5 food per resident
                    this.marketState.demand.jobs += residents * 0.6; // 60% employment rate
                }
                if (building.population?.jobsCreated > 0) {
                    // Jobs need workers
                    this.marketState.demand.workers += building.population.jobsCreated;
                }
            }
        }
        
        // Calculate balances
        Object.keys(this.marketState.supply).forEach(key => {
            this.marketState.balance[key] = this.marketState.supply[key] - this.marketState.demand[key];
        });
        
        this.cache.lastCacheUpdate = Date.now();
    }
    
    /**
     * Update market multipliers based on supply/demand
     */
    updateMarketMultipliers() {
        Object.keys(this.marketState.supply).forEach(resource => {
            const supply = this.marketState.supply[resource];
            const demand = Math.max(1, this.marketState.demand[resource]); // Avoid division by zero
            const supplyRatio = supply / demand;
            const elasticity = this.elasticity[resource] || 0.5;
            
            // Calculate smooth multiplier using the new system
            this.marketState.multipliers[resource] = this.calculateSmoothMultiplier(supplyRatio, elasticity);
        });
        
        // Update state management system if available
        if (this.game.gameState) {
            Object.entries(this.marketState.multipliers).forEach(([resource, value]) => {
                this.game.gameState.dispatch({
                    type: 'UPDATE_MULTIPLIER',
                    resource,
                    value
                });
            });
        }
    }
    
    /**
     * Calculate smooth price multiplier (from previous optimization)
     */
    calculateSmoothMultiplier(supplyRatio, elasticity) {
        if (supplyRatio >= 1.0) {
            // Oversupply: prices drop (0.5x to 1x)
            const excess = Math.min(supplyRatio - 1.0, 2.0);
            return Math.max(0.5, 1.0 - (excess * elasticity * 0.5));
        } else {
            // Undersupply: prices rise (1x to 2.5x)
            const shortage = Math.min(1.0 - supplyRatio, 0.8);
            return Math.min(2.5, 1.0 + (shortage * elasticity * 1.5));
        }
    }
    
    /**
     * Calculate player's daily cashflow
     */
    calculatePlayerCashflow() {
        let totalRevenue = 0;
        let totalMaintenance = 0;
        let totalLVT = 0;
        const breakdown = [];
        
        // Calculate building economics for current player's buildings
        const currentPlayerId = this.game.multiplayerManager?.playerId || 'player';
        const playerBuildings = this.game.buildingSystem?.getBuildingsByOwner(currentPlayerId) || [];
        
        playerBuildings.forEach(({ row, col, parcel }) => {
            const economics = this.game.buildingSystem.calculateBuildingEconomics(parcel, row, col);
            
            totalRevenue += economics.revenue;
            totalMaintenance += economics.maintenance;
            totalLVT += economics.lvt;
            
            breakdown.push({
                coordinates: this.game.getParcelCoordinate(row, col),
                buildingName: economics.buildingName,
                buildingAge: parcel.buildingAge || 0,
                decay: parcel.decay || 0,
                landValue: parcel.landValue?.paidPrice || 0,
                revenue: economics.revenue,
                maintenance: economics.maintenance,
                lvt: economics.lvt,
                netCashflow: economics.netIncome
            });
        });
        
        // Calculate road maintenance
        const roadMaintenance = this.calculateRoadMaintenance();
        totalMaintenance += roadMaintenance;
        
        const netCashflow = totalRevenue - totalMaintenance - totalLVT;
        
        // Update player economy state
        this.playerEconomy = {
            dailyCashflow: netCashflow,
            buildingRevenue: totalRevenue,
            buildingMaintenance: totalMaintenance,
            landValueTax: totalLVT,
            roadMaintenance: roadMaintenance,
            lastUpdate: Date.now()
        };
        
        // Cache breakdown for display
        this.cache.cashflowBreakdown = {
            totalRevenue,
            totalMaintenance,
            totalLVT,
            roadMaintenance,
            netCashflow,
            breakdown
        };
        
        return this.cache.cashflowBreakdown;
    }
    
    /**
     * Calculate road maintenance costs
     */
    calculateRoadMaintenance() {
        if (!this.game.transportationSystem) return 0;
        return this.game.transportationSystem.calculateMaintenanceCost();
    }
    
    /**
     * Update road maintenance (called daily)
     */
    updateRoadMaintenance() {
        if (!this.game.transportationSystem) return;
        this.game.transportationSystem.updateRoadConditions(1);
    }
    
    /**
     * Calculate total player wealth (cash + assets)
     */
    calculateTotalWealth() {
        let assetValue = 0;
        
        // Building asset values (depreciated)
        const playerBuildings = this.game.buildingSystem?.getBuildingsByOwner('player') || [];
        
        playerBuildings.forEach(({ row, col, parcel }) => {
            if (parcel.building) {
                const building = this.game.buildingManager?.getBuildingById(parcel.building);
                if (building) {
                    const age = parcel.buildingAge || 0;
                    const condition = 1 - (parcel.decay || 0);
                    const depreciation = Math.max(0.2, 1 - (age * 0.01)); // Min 20% value retained
                    
                    assetValue += (building.cost || 0) * condition * depreciation;
                }
            }
            
            // Add land value
            if (parcel.landValue?.paidPrice) {
                assetValue += parcel.landValue.paidPrice;
            }
        });
        
        return this.game.playerCash + assetValue;
    }
    
    /**
     * Get local supply/demand for a specific resource around a location
     */
    getLocalSupplyDemand(resource, centerRow, centerCol, radius = 3) {
        let localSupply = 0;
        let localDemand = 0;
        
        const startRow = Math.max(0, centerRow - radius);
        const endRow = Math.min(this.game.gridSize - 1, centerRow + radius);
        const startCol = Math.max(0, centerCol - radius);
        const endCol = Math.min(this.game.gridSize - 1, centerCol + radius);
        
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel || !parcel.building) continue;
                
                const building = this.game.buildingManager?.getBuildingById(parcel.building);
                if (!building) continue;
                
                // Distance weighting (closer = more impact)
                const distance = Math.sqrt((row - centerRow) ** 2 + (col - centerCol) ** 2);
                const weight = Math.max(0.1, 1 - (distance / radius));
                
                // Supply
                switch(resource) {
                    case 'energy':
                        if (building.resources?.energySupply > 0) {
                            localSupply += building.resources.energySupply * weight;
                        }
                        break;
                    case 'food':
                        if (building.resources?.foodProduction > 0) {
                            localSupply += building.resources.foodProduction * weight;
                        }
                        break;
                    case 'housing':
                        if (building.population?.bedroomsAdded > 0) {
                            localSupply += building.population.bedroomsAdded * weight;
                        }
                        break;
                    case 'jobs':
                        if (building.population?.jobsCreated > 0) {
                            localSupply += building.population.jobsCreated * weight;
                        }
                        break;
                    case 'workers':
                        if (parcel.population > 0) {
                            localSupply += parcel.population * 0.6 * weight; // 60% work
                        }
                        break;
                }
                
                // Demand
                switch(resource) {
                    case 'energy':
                        if (building.resources?.energyDemand > 0) {
                            localDemand += building.resources.energyDemand * weight;
                        }
                        break;
                    case 'food':
                        if (parcel.population > 0) {
                            localDemand += parcel.population * 0.5 * weight;
                        }
                        break;
                    case 'jobs':
                        if (parcel.population > 0) {
                            localDemand += parcel.population * 0.6 * weight;
                        }
                        break;
                    case 'workers':
                        if (building.population?.jobsCreated > 0) {
                            localDemand += building.population.jobsCreated * weight;
                        }
                        break;
                }
            }
        }
        
        return {
            supply: localSupply,
            demand: Math.max(0.1, localDemand), // Minimum to avoid division by zero
            balance: localSupply - localDemand,
            ratio: localSupply / Math.max(0.1, localDemand)
        };
    }
    
    /**
     * Calculate demographics breakdown
     */
    calculateDemographics(totalPopulation) {
        // Age distribution based on typical demographics
        const children = Math.round(totalPopulation * 0.22); // 22% children
        const adults = Math.round(totalPopulation * 0.65);   // 65% adults
        const seniors = totalPopulation - children - adults; // Remaining are seniors
        
        return {
            children: Math.max(0, children),
            adults: Math.max(0, adults),
            seniors: Math.max(0, seniors),
            total: totalPopulation
        };
    }
    
    /**
     * Get economic statistics for display
     */
    getEconomicStats() {
        return {
            playerEconomy: this.playerEconomy,
            marketState: this.marketState,
            totalWealth: this.calculateTotalWealth(),
            cashflowBreakdown: this.cache.cashflowBreakdown
        };
    }
    
    /**
     * Get market dashboard data for the dev tool
     */
    getMarketDashboardData() {
        return {
            supply: this.marketState.supply,
            demand: this.marketState.demand,
            balance: this.marketState.balance,
            multipliers: this.marketState.multipliers,
            elasticity: this.elasticity,
            playerCashflow: this.playerEconomy.dailyCashflow
        };
    }
    
    /**
     * Update market dashboard display
     */
    updateMarketDashboard() {
        const dashboardData = this.getMarketDashboardData();
        
        // Update energy stats
        this.updateMarketStat('energy', dashboardData);
        this.updateMarketStat('food', dashboardData);
        this.updateMarketStat('housing', dashboardData);
        this.updateMarketStat('jobs', dashboardData);
        
        // Update multiplier displays
        Object.entries(dashboardData.multipliers).forEach(([resource, multiplier]) => {
            const multiplierEl = document.getElementById(`${resource}-multiplier`);
            if (multiplierEl) {
                multiplierEl.textContent = `${multiplier.toFixed(2)}x`;
                
                // Color code multipliers
                let color = '#42B96E'; // Green for normal
                if (multiplier < 0.8) color = '#f44336'; // Red for low
                else if (multiplier > 1.2) color = '#ff9800'; // Orange for high
                
                multiplierEl.style.color = color;
            }
        });
        
        // Update cashflow
        const cashflowEl = document.getElementById('dashboard-cashflow');
        if (cashflowEl) {
            const cashflow = dashboardData.playerCashflow;
            cashflowEl.textContent = `${cashflow >= 0 ? '+' : ''}$${cashflow.toFixed(2)}/day`;
            cashflowEl.style.color = cashflow >= 0 ? '#42B96E' : '#f44336';
        }
    }
    
    /**
     * Update a single market stat in the dashboard
     */
    updateMarketStat(resource, data) {
        const supply = data.supply[resource] || 0;
        const demand = data.demand[resource] || 0;
        const balance = data.balance[resource] || 0;
        
        // Update supply
        const supplyEl = document.getElementById(`${resource}-supply`);
        if (supplyEl) supplyEl.textContent = supply.toFixed(1);
        
        // Update demand
        const demandEl = document.getElementById(`${resource}-demand`);
        if (demandEl) demandEl.textContent = demand.toFixed(1);
        
        // Update balance with color coding
        const balanceEl = document.getElementById(`${resource}-balance`);
        if (balanceEl) {
            balanceEl.textContent = `${balance >= 0 ? '+' : ''}${balance.toFixed(1)}`;
            balanceEl.style.color = balance >= 0 ? '#42B96E' : '#f44336';
        }
    }
    
    /**
     * Reset economic state
     */
    reset() {
        Object.keys(this.marketState.supply).forEach(key => {
            this.marketState.supply[key] = 0;
            this.marketState.demand[key] = 0;
            this.marketState.balance[key] = 0;
            this.marketState.multipliers[key] = 1.0;
        });
        
        this.playerEconomy = {
            dailyCashflow: 0,
            buildingRevenue: 0,
            buildingMaintenance: 0,
            landValueTax: 0,
            lastUpdate: 0
        };
        
        this.cache.supplyDemand.clear();
        this.cache.cashflowBreakdown = null;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EconomicEngine;
}