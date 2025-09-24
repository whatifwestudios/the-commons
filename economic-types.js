/**
 * Unified Economic Data Types
 *
 * Single source of truth for all economic data structures
 * Used across client, server, and multiplayer systems
 */

/**
 * Building Performance Data
 * Represents the real-time performance metrics of a building
 */
class BuildingPerformance {
    constructor(data = {}) {
        this.buildingId = data.buildingId || null;
        this.buildingType = data.buildingType || null;
        this.coordinates = data.coordinates || null;
        this.owner = data.owner || null;

        // Performance metrics (0-1 scale)
        this.efficiency = data.efficiency || 1.0;
        this.energyEfficiency = data.energyEfficiency || 1.0;
        this.laborEfficiency = data.laborEfficiency || 1.0;
        this.resourceEfficiency = data.resourceEfficiency || 1.0;

        // Supply/demand fulfillment
        this.energySupply = data.energySupply || 0;
        this.energyDemand = data.energyDemand || 0;
        this.laborSupply = data.laborSupply || 0;
        this.laborDemand = data.laborDemand || 0;
        this.foodSupply = data.foodSupply || 0;
        this.foodDemand = data.foodDemand || 0;

        // Economic outputs
        this.revenue = data.revenue || 0;
        this.maintenance = data.maintenance || 0;
        this.landValueTax = data.landValueTax || 0;
        this.netIncome = data.netIncome || 0;

        // Building condition
        this.age = data.age || 0;
        this.decay = data.decay || 0;
        this.condition = data.condition || 1.0;

        // Detailed breakdown for tooltips
        this.deficits = data.deficits || [];
        this.surpluses = data.surpluses || [];
        this.warnings = data.warnings || [];
    }

    /**
     * Calculate overall efficiency from component efficiencies
     */
    calculateOverallEfficiency() {
        const efficiencies = [
            this.energyEfficiency,
            this.laborEfficiency,
            this.resourceEfficiency
        ];

        // Multiplicative efficiency model
        this.efficiency = efficiencies.reduce((acc, eff) => acc * eff, 1.0);
        return this.efficiency;
    }

    /**
     * Get performance status for visual feedback
     * @returns {string} 'optimal', 'good', 'poor', 'critical'
     */
    getPerformanceStatus() {
        if (this.efficiency >= 0.9) return 'optimal';
        if (this.efficiency >= 0.7) return 'good';
        if (this.efficiency >= 0.4) return 'poor';
        return 'critical';
    }
}

/**
 * Player Cashflow Data
 * Comprehensive cashflow breakdown for a player
 */
class PlayerCashflow {
    constructor(data = {}) {
        this.playerId = data.playerId || null;
        this.timestamp = data.timestamp || Date.now();

        // Revenue streams
        this.buildingRevenue = data.buildingRevenue || 0;
        this.taxRevenue = data.taxRevenue || 0;
        this.otherRevenue = data.otherRevenue || 0;
        this.totalRevenue = data.totalRevenue || 0;

        // Expense streams
        this.buildingMaintenance = data.buildingMaintenance || 0;
        this.roadMaintenance = data.roadMaintenance || 0;
        this.landValueTax = data.landValueTax || 0;
        this.otherExpenses = data.otherExpenses || 0;
        this.totalExpenses = data.totalExpenses || 0;

        // Net result
        this.netCashflow = data.netCashflow || 0;

        // Detailed breakdown by building
        this.buildingBreakdown = data.buildingBreakdown || [];

        // Multipliers applied
        this.appliedMultipliers = data.appliedMultipliers || {};
    }

    /**
     * Recalculate totals from components
     */
    recalculate() {
        this.totalRevenue = this.buildingRevenue + this.taxRevenue + this.otherRevenue;
        this.totalExpenses = this.buildingMaintenance + this.roadMaintenance +
                            this.landValueTax + this.otherExpenses;
        this.netCashflow = this.totalRevenue - this.totalExpenses;
        return this.netCashflow;
    }
}

/**
 * Economic Transaction
 * Represents any economic transaction in the game
 */
class EconomicTransaction {
    constructor(data = {}) {
        this.id = data.id || this.generateId();
        this.type = data.type || 'unknown'; // 'purchase', 'sale', 'maintenance', 'tax', 'revenue'
        this.playerId = data.playerId || null;
        this.amount = data.amount || 0;
        this.description = data.description || '';
        this.timestamp = data.timestamp || Date.now();
        this.source = data.source || null; // What generated this transaction
        this.metadata = data.metadata || {};
    }

    generateId() {
        return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Market State
 * Current supply/demand state for the entire market
 */
class MarketState {
    constructor(data = {}) {
        this.timestamp = data.timestamp || Date.now();

        // Resource markets
        this.energy = {
            supply: data.energy?.supply || 0,
            demand: data.energy?.demand || 0,
            multiplier: data.energy?.multiplier || 1.0,
            efficiency: data.energy?.efficiency || 1.0
        };

        this.food = {
            supply: data.food?.supply || 0,
            demand: data.food?.demand || 0,
            multiplier: data.food?.multiplier || 1.0,
            efficiency: data.food?.efficiency || 1.0
        };

        this.housing = {
            supply: data.housing?.supply || 0,
            demand: data.housing?.demand || 0,
            multiplier: data.housing?.multiplier || 1.0,
            efficiency: data.housing?.efficiency || 1.0
        };

        this.jobs = {
            supply: data.jobs?.supply || 0,
            demand: data.jobs?.demand || 0,
            multiplier: data.jobs?.multiplier || 1.0,
            efficiency: data.jobs?.efficiency || 1.0
        };

        // Aggregate metrics
        this.totalSupply = data.totalSupply || 0;
        this.totalDemand = data.totalDemand || 0;
        this.marketBalance = data.marketBalance || 0;
    }

    /**
     * Calculate market efficiency for a resource
     */
    calculateResourceEfficiency(resourceType) {
        const resource = this[resourceType];
        if (!resource) return 1.0;

        if (resource.demand === 0) return 1.0;
        return Math.min(1.0, resource.supply / resource.demand);
    }

    /**
     * Get all resource deficits
     */
    getDeficits() {
        const deficits = [];
        ['energy', 'food', 'housing', 'jobs'].forEach(type => {
            const resource = this[type];
            if (resource.demand > resource.supply) {
                deficits.push({
                    type,
                    shortage: resource.demand - resource.supply,
                    efficiency: this.calculateResourceEfficiency(type)
                });
            }
        });
        return deficits;
    }
}

/**
 * Export for CommonJS (Node.js) and ES6 modules
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BuildingPerformance,
        PlayerCashflow,
        EconomicTransaction,
        MarketState
    };
} else {
    window.EconomicTypes = {
        BuildingPerformance,
        PlayerCashflow,
        EconomicTransaction,
        MarketState
    };
}