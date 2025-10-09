/**
 * Building Performance Cache System
 *
 * Optimizes building performance calculations by:
 * 1. Precomputing decay tables for deterministic age/condition calculations
 * 2. Caching performance results and invalidating only when necessary
 * 3. Tracking which buildings need recalculation
 */

class BuildingPerformanceCache {
    constructor() {
        // Precomputed decay tables by decay rate
        // Map<decayRate, Array<{condition, maintenanceMultiplier}>>
        this.decayTables = new Map();

        // Global invalidation flag (affects ALL buildings)
        this.allBuildingsStale = false;

        // Individual building invalidation (for repairs only)
        this.staleBuildingSet = new Set();

        // Statistics
        this.stats = {
            tablesGenerated: 0,
            cacheHits: 0,
            cacheMisses: 0,
            invalidations: {
                global: 0,
                individual: 0
            }
        };
    }

    /**
     * Get decay factors for a building at specific age
     * Uses precomputed tables for O(1) lookup instead of Math.pow()
     */
    getDecayFactors(buildingDef, age) {
        // Get decay rate from building definition (convert from % to decimal)
        const decayRatePercent = buildingDef?.economics?.decayRate || 0.05;
        const decayRate = decayRatePercent / 100; // 0.05% -> 0.0005

        // Get or create decay table for this rate
        const table = this.getDecayTable(decayRate);

        // Clamp age to table bounds
        const clampedAge = Math.min(Math.max(0, age), table.length - 1);

        return table[clampedAge];
    }

    /**
     * Get decay table for specific decay rate (lazy generation)
     */
    getDecayTable(decayRate) {
        if (!this.decayTables.has(decayRate)) {
            this.generateDecayTable(decayRate, 500); // Precompute up to 500 days
        }
        return this.decayTables.get(decayRate);
    }

    /**
     * Generate decay table for a specific decay rate
     * Precomputes condition and maintenance multiplier for each day
     */
    generateDecayTable(decayRate, maxDays) {
        const table = new Array(maxDays + 1);

        for (let day = 0; day <= maxDays; day++) {
            // Condition decreases linearly with decay rate
            const condition = Math.max(0.1, 1.0 - (day * decayRate));

            // Maintenance increases exponentially with age
            const maintenanceMultiplier = Math.pow(1 + decayRate, day);

            table[day] = {
                condition,
                maintenanceMultiplier
            };
        }

        this.decayTables.set(decayRate, table);
        this.stats.tablesGenerated++;

        return table;
    }

    /**
     * Mark ALL buildings as needing recalculation
     * Called when: daily aging, building added/removed, global economy shift
     */
    markAllBuildingsStale(reason) {
        this.allBuildingsStale = true;
        this.staleBuildingSet.clear(); // Individual tracking no longer needed
        this.stats.invalidations.global++;
    }

    /**
     * Mark ONE building as needing recalculation
     * Called when: building repaired (only affects that building)
     */
    markBuildingStale(locationKey, reason) {
        if (this.allBuildingsStale) {
            return; // Already globally stale, no need to track individually
        }

        this.staleBuildingSet.add(locationKey);
        this.stats.invalidations.individual++;
    }

    /**
     * Check if a building needs recalculation
     */
    isBuildingStale(locationKey) {
        return this.allBuildingsStale || this.staleBuildingSet.has(locationKey);
    }

    /**
     * Clear all stale flags (call after batch recalculation)
     */
    clearStaleFlags() {
        this.allBuildingsStale = false;
        this.staleBuildingSet.clear();
    }

    /**
     * Remove a building from tracking (when destroyed)
     */
    removeBuildingFromCache(locationKey) {
        this.staleBuildingSet.delete(locationKey);
    }

    /**
     * Get cache statistics for debugging
     */
    getStats() {
        const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
            ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1)
            : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            decayTableCount: this.decayTables.size,
            currentlyStale: this.allBuildingsStale ? 'ALL' : this.staleBuildingSet.size
        };
    }

    /**
     * Log cache statistics
     */
    logStats() {
        const stats = this.getStats();
        console.log('[CACHE STATS]', {
            'Decay Tables Generated': stats.tablesGenerated,
            'Cache Hit Rate': stats.hitRate,
            'Total Hits': stats.cacheHits,
            'Total Misses': stats.cacheMisses,
            'Global Invalidations': stats.invalidations.global,
            'Individual Invalidations': stats.invalidations.individual,
            'Currently Stale': stats.currentlyStale
        });
    }
}

module.exports = BuildingPerformanceCache;
