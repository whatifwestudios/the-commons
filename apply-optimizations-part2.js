#!/usr/bin/env node

/**
 * Part 2: Apply remaining optimizations
 * - Add caching to calculateBuildingPerformance
 * - Optimize CARENS calculation
 * - Replace emoji logs with traditional logging
 * - Add performance timing
 */

const fs = require('fs');

const filePath = './server-economic-engine-v2.js';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying Part 2 optimizations...\n');

// ============================================================================
// 1. ADD CACHING TO calculateBuildingPerformance
// ============================================================================
console.log('✓ Adding cache support to calculateBuildingPerformance...');

// Replace the function start to add caching
content = content.replace(
    /calculateBuildingPerformance\(row, col\) \{\s+const locationKey = `\$\{row\},\$\{col\}`;\s+const building = this\.gameState\.buildings\.get\(locationKey\);\s+console\.log\(`🔧 calculateBuildingPerformance called for \[\$\{row\},\$\{col\}\]`\);/,
    `calculateBuildingPerformance(row, col) {
        const startTime = this.DEBUG.TIMING ? Date.now() : 0;
        const locationKey = \`\${row},\${col}\`;

        // Check cache first
        const cached = this.cache.buildingPerformances.get(locationKey);
        if (cached && !cached.dirty) {
            this.cache.stats.hits++;
            if (this.DEBUG.CACHE) {
                console.log(\`[CACHE] Hit for building performance at [\${row},\${col}]\`);
            }
            return cached.data;
        }
        this.cache.stats.misses++;

        const building = this.gameState.buildings.get(locationKey);

        if (this.DEBUG.PERFORMANCE) {
            console.log(\`[PERF] calculateBuildingPerformance called for [\${row},\${col}]\`);
        }`
);

// Add caching at the end of calculateBuildingPerformance (before return)
content = content.replace(
    /(console\.log\(`💰 \[\$\{row\},\$\{col\}\] \$\{building\.id\} Performance:`,[\s\S]*?\);)\s+(return performance;)/,
    `if (this.DEBUG.REVENUE) {
            console.log(\`[REVENUE] [\${row},\${col}] \${building.id} - Revenue: $\${actualRevenue.toFixed(2)}, Maint: $\${actualMaintenance.toFixed(2)}, Net: $\${(actualRevenue - actualMaintenance).toFixed(2)}\`);
        }

        // Store in cache
        this.cache.buildingPerformances.set(locationKey, {
            lastUpdate: Date.now(),
            data: performance,
            dirty: false
        });

        if (this.DEBUG.TIMING) {
            const elapsed = Date.now() - startTime;
            if (elapsed > 50) {
                console.warn(\`[TIMING] Performance calculation took \${elapsed}ms for [\${row},\${col}]\`);
            }
        }

        return performance;`
);

// ============================================================================
// 2. OPTIMIZE CARENS CALCULATION - Skip empty parcels
// ============================================================================
console.log('✓ Optimizing CARENS calculation...');

// Find calculateLocalCARENSMultiplier and optimize the loop
const carensOptimization = `calculateLocalCARENSMultiplier(row, col) {
        const startTime = this.DEBUG.TIMING ? Date.now() : 0;
        const locationKey = \`\${row},\${col}\`;

        // Check cache first
        const cached = this.cache.carens.get(locationKey);
        if (cached && !cached.dirty) {
            this.cache.stats.hits++;
            if (this.DEBUG.CACHE) {
                console.log(\`[CACHE] Hit for CARENS at [\${row},\${col}]\`);
            }
            return cached.data;
        }
        this.cache.stats.misses++;

        const building = this.gameState.buildings.get(locationKey);
        if (!building) return 1.0;

        const buildingDef = this.buildingDefinitions.get(building.id);
        if (!buildingDef) return 1.0;

        // Initialize local CARENS scores
        const localCarens = {
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0
        };

        // OPTIMIZED: Iterate only through actual buildings instead of full grid
        this.gameState.buildings.forEach((adjacentBuilding, key) => {
            if (adjacentBuilding.underConstruction) return;

            const [r, c] = key.split(',').map(Number);
            if (r === row && c === col) return; // Skip self

            const buildingDef = this.buildingDefinitions.get(adjacentBuilding.id);
            if (!buildingDef?.livability) return;

            const distance = Math.max(Math.abs(r - row), Math.abs(c - col));

            // Apply each CARENS category with its specific range and effect
            Object.keys(localCarens).forEach(category => {
                // Handle both object format {impact, attenuation} and legacy number format
                const livabilityData = buildingDef.livability[category];
                const effect = typeof livabilityData === 'object' ? (livabilityData.impact || 0) : (livabilityData || 0);
                const range = typeof livabilityData === 'object' ? (livabilityData.attenuation || 2) : (buildingDef.livability[\`\${category}_range\`] || 2);

                // Only apply effect if within range and effect is non-zero
                if (effect !== 0 && distance <= range) {
                    // Linear attenuation: full effect at distance 0, zero effect at max range
                    const attenuation = Math.max(0, 1.0 - (distance / range));
                    const attenuatedEffect = effect * attenuation;
                    localCarens[category] += attenuatedEffect;
                }
            });
        });

        // Calculate net CARENS total (sum of all categories)
        const netCarensTotal = localCarens.culture + localCarens.affordability + localCarens.resilience +
                              localCarens.environment + localCarens.noise + localCarens.safety;

        if (this.DEBUG.CARENS) {
            console.log(\`[CARENS] [\${row},\${col}] Total: \${netCarensTotal.toFixed(1)} points - \`, localCarens);
        }

        // Convert to multiplier: 0 = 1.0x (neutral), +100 = 1.4x (max), -100 = 0.6x (min)
        const rawMultiplier = 1.0 + (netCarensTotal / 100) * 0.4;
        const localMultiplier = Math.max(0.6, Math.min(1.4, rawMultiplier));

        // Cache the result
        this.cache.carens.set(locationKey, {
            lastUpdate: Date.now(),
            data: localMultiplier,
            dirty: false
        });

        if (this.DEBUG.TIMING) {
            const elapsed = Date.now() - startTime;
            if (elapsed > 50) {
                console.warn(\`[TIMING] CARENS calculation took \${elapsed}ms for [\${row},\${col}]\`);
            }
        }

        return localMultiplier;
    }`;

// Replace the entire calculateLocalCARENSMultiplier function
content = content.replace(
    /calculateLocalCARENSMultiplier\(row, col\) \{[\s\S]*?return localMultiplier;\s+\}/,
    carensOptimization
);

console.log('\n✅ Part 2 optimizations applied!');
console.log('Writing changes...');

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ File updated!');
console.log('\nRemaining tasks:');
console.log('  - Replace remaining emoji logs');
console.log('  - Call invalidateAdjacentCaches() when buildings change');
console.log('  - Test everything');
