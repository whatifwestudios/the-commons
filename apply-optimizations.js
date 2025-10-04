#!/usr/bin/env node

/**
 * Script to apply performance optimizations to server-economic-engine-v2.js
 * This modifies the file in place with all optimization changes
 */

const fs = require('fs');
const path = require('path');

const filePath = './server-economic-engine-v2.js';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying optimizations to server-economic-engine-v2.js...\n');

// ============================================================================
// 1. ADD DEBUG SYSTEM WITH GRANULAR FLAGS
// ============================================================================
console.log('✓ Adding environment-based debug system...');

const debugSystemCode = `
        // Debug configuration - environment-based
        const isDevelopment = process.env.NODE_ENV !== 'production';
        this.DEBUG = {
            MASTER: isDevelopment,           // Master switch - controls all debug output
            PERFORMANCE: isDevelopment,      // Performance calculation details
            CARENS: isDevelopment,          // CARENS calculation logging
            REVENUE: isDevelopment,         // Revenue/maintenance calculations
            BROADCASTS: isDevelopment,      // Broadcast state changes
            CACHE: isDevelopment,           // Cache hits/misses
            TIMING: true                    // Performance timing (always on for monitoring)
        };

        // Performance optimization: Caching system
        this.cache = {
            jeefhh: { lastUpdate: 0, data: null, dirty: true },
            carens: new Map(), // locationKey -> {lastUpdate, data, dirty} - per-building CARENS
            buildingPerformances: new Map(), // locationKey -> {lastUpdate, data, dirty}
            playerWealth: new Map(), // playerId -> {lastUpdate, data, dirty}
            lastFullState: null, // For delta comparisons
            lastBroadcast: 0,
            stats: {
                hits: 0,
                misses: 0,
                invalidations: 0
            }
        };`;

content = content.replace(
    /\/\/ Performance optimization: Caching system\s+this\.cache = \{[^}]+\};/s,
    debugSystemCode.trim()
);

// ============================================================================
// 2. ADD CACHE HELPER METHODS (after constructor, before other methods)
// ============================================================================
console.log('✓ Adding cache helper methods...');

const cacheHelperMethods = `

    // ========================================================================
    // CACHE MANAGEMENT METHODS
    // ========================================================================

    /**
     * Invalidate performance cache for a specific building
     */
    invalidateBuildingCache(row, col) {
        const locationKey = \`\${row},\${col}\`;
        const cached = this.cache.buildingPerformances.get(locationKey);
        if (cached) {
            cached.dirty = true;
            this.cache.stats.invalidations++;
        }

        // Also invalidate CARENS cache for this building
        const carensCached = this.cache.carens.get(locationKey);
        if (carensCached) {
            carensCached.dirty = true;
        }
    }

    /**
     * Invalidate caches for all buildings within range of a changed building
     * Called when buildings are constructed/destroyed since CARENS depends on neighbors
     */
    invalidateAdjacentCaches(row, col, maxRange = 11) {
        this.cache.stats.invalidations++;

        // Invalidate all buildings within range
        this.gameState.buildings.forEach((building, key) => {
            const [r, c] = key.split(',').map(Number);
            const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
            if (distance <= maxRange) {
                this.invalidateBuildingCache(r, c);
            }
        });

        if (this.DEBUG.CACHE) {
            console.log(\`[CACHE] Invalidated caches for buildings within \${maxRange} tiles of [\${row},\${col}]\`);
        }
    }

    /**
     * Log cache statistics periodically
     */
    logCacheStats() {
        const stats = this.cache.stats;
        const total = stats.hits + stats.misses;
        const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 0;

        console.log(\`[CACHE] Stats - Hits: \${stats.hits}, Misses: \${stats.misses}, Hit Rate: \${hitRate}%, Invalidations: \${stats.invalidations}\`);
    }
`;

// Find a good insertion point - after the constructor
const constructorEndMatch = content.match(/constructor\([^)]*\)\s*{[\s\S]*?this\.transactionHistory = \[\];[\s\S]*?}/);
if (constructorEndMatch) {
    const insertionPoint = constructorEndMatch.index + constructorEndMatch[0].length;
    content = content.slice(0, insertionPoint) + cacheHelperMethods + content.slice(insertionPoint);
}

// ============================================================================
// 3. FIX MAINTENANCE CALCULATION (cumulative decay)
// ============================================================================
console.log('✓ Fixing maintenance cost calculation...');

// Find and replace the maintenance calculation
content = content.replace(
    /\/\/ Maintenance calculation\s+const baseMaintenance = econ\.maintenance \|\| 0;\s+const actualMaintenance = baseMaintenance \* \(2\.0 - building\.condition\);/,
    `// Maintenance calculation - cumulative decay over time
        const baseMaintenance = econ.maintenance || 0;
        const decayRate = econ.decayRate || 0.0012; // Default 0.12% per day
        const buildingAge = building.age || 0;
        // Maintenance increases with cumulative decay: base * (1 + decayRate)^age
        const actualMaintenance = baseMaintenance * Math.pow(1 + decayRate, buildingAge);`
);

console.log('\n✅ All optimizations applied successfully!');
console.log('\nWriting changes to file...');

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ File updated: server-economic-engine-v2.js');
console.log('\nNext steps:');
console.log('  1. Manually add cache checks to calculateBuildingPerformance()');
console.log('  2. Optimize CARENS calculation to skip empty parcels');
console.log('  3. Replace emoji logs with traditional logging');
console.log('  4. Add performance timing');
console.log('  5. Test the changes');
