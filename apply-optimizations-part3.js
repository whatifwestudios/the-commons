#!/usr/bin/env node

/**
 * Part 3: Final optimizations
 * - Add cache invalidation calls
 * - Replace emoji logs throughout
 * - Add daily economic cycle logging
 */

const fs = require('fs');

const filePath = './server-economic-engine-v2.js';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying Part 3 optimizations...\n');

// ============================================================================
// 1. ADD CACHE INVALIDATION TO processBuildComplete
// ============================================================================
console.log('✓ Adding cache invalidation to processBuildComplete...');

content = content.replace(
    /(\/\/ Mark construction complete\s+building\.underConstruction = false;\s+building\.constructionCompleteTime = Date\.now\(\);)/,
    `$1

        // Invalidate caches for this building and all neighbors (CARENS depends on adjacency)
        this.invalidateAdjacentCaches(row, col);`
);

// ============================================================================
// 2. ADD CACHE INVALIDATION TO processDestroyBuilding
// ============================================================================
console.log('✓ Adding cache invalidation to processDestroyBuilding...');

content = content.replace(
    /(\/\/ Remove from buildings map\s+this\.gameState\.buildings\.delete\(locationKey\);)/,
    `// Invalidate caches before destroying (CARENS of neighbors will change)
        this.invalidateAdjacentCaches(row, col);

        $1`
);

// ============================================================================
// 3. ADD CACHE INVALIDATION TO processBuildStart
// ============================================================================
console.log('✓ Adding cache invalidation to processBuildStart...');

content = content.replace(
    /(\/\/ Store in game state\s+this\.gameState\.buildings\.set\(locationKey, building\);)/,
    `$1

        // Note: No cache invalidation needed here since building is under construction
        // Cache invalidation happens when construction completes`
);

// ============================================================================
// 4. ADD LOGGING TO DAILY ECONOMIC CYCLE
// ============================================================================
console.log('✓ Adding strategic logging to daily cycle...');

content = content.replace(
    /(processDailyEconomicCycle\(\) \{)/,
    `$1
        const cycleStart = Date.now();
        console.log(\`[DAILY] Economic cycle started - Day \${Math.floor(this.gameState.gameTime)}\`);`
);

content = content.replace(
    /(\/\/ Broadcast state changes[\s\S]*?this\.broadcastGameState\(\{ type: 'DAILY_UPDATE', source: 'timer' \}\);)/,
    `$&

        const cycleTime = Date.now() - cycleStart;
        console.log(\`[DAILY] Economic cycle completed in \${cycleTime}ms - \${this.gameState.buildings.size} buildings processed\`);

        // Log cache stats periodically (every 10 days)
        if (Math.floor(this.gameState.gameTime) % 10 === 0) {
            this.logCacheStats();
        }`
);

// ============================================================================
// 5. REPLACE EMOJI LOGS WITH TRADITIONAL LOGGING
// ============================================================================
console.log('✓ Replacing emoji logs with traditional logging...');

const emojiReplacements = [
    { emoji: '🔧', prefix: '[PERF]', field: 'PERFORMANCE' },
    { emoji: '📚', prefix: '[DATA]', field: 'PERFORMANCE' },
    { emoji: '💵', prefix: '[REVENUE]', field: 'REVENUE' },
    { emoji: '📍', prefix: '[ADJACENCY]', field: 'PERFORMANCE' },
    { emoji: '🔍', prefix: '[SUPPLY]', field: 'PERFORMANCE' },
    { emoji: '✅', prefix: '[INFO]', field: 'PERFORMANCE' },
    { emoji: '🎨', prefix: '[CARENS]', field: 'CARENS' },
    { emoji: '📊', prefix: '[CARENS]', field: 'CARENS' },
    { emoji: '💰', prefix: '[REVENUE]', field: 'REVENUE' },
    { emoji: '🏢', prefix: '[BROADCAST]', field: 'BROADCASTS' },
    { emoji: '📡', prefix: '[BROADCAST]', field: 'BROADCASTS' },
    { emoji: '📥', prefix: '[CLIENT]', field: 'BROADCASTS' },
    { emoji: '❌', prefix: '[ERROR]', field: 'MASTER' },
    { emoji: '⚠️', prefix: '[WARN]', field: 'MASTER' },
    { emoji: '🚧', prefix: '[INFO]', field: 'PERFORMANCE' },
    { emoji: '🏗️', prefix: '[INFO]', field: 'BROADCASTS' },
    { emoji: '🎁', prefix: '[INFO]', field: 'BROADCASTS' },
    { emoji: '💡', prefix: '[INFO]', field: 'PERFORMANCE' }
];

// Simple approach: Just replace the emojis and wrap later manually
emojiReplacements.forEach(({ emoji, prefix }) => {
    // Replace the emoji with the prefix in console.log statements
    const emojiRegex = new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&'), 'g');
    content = content.replace(emojiRegex, prefix);
});

// ============================================================================
// 6. ADD BROADCAST SIZE LOGGING
// ============================================================================
console.log('✓ Adding broadcast size logging...');

content = content.replace(
    /(broadcastBuildingStates\(\) \{[\s\S]*?this\.broadcastFunction\(\{[\s\S]*?type: 'BUILDING_STATES',[\s\S]*?buildings: buildingStates,[\s\S]*?timestamp: Date\.now\(\)[\s\S]*?\}\);)/,
    `$1

        if (this.DEBUG.BROADCASTS) {
            const sizeKB = (JSON.stringify({ type: 'BUILDING_STATES', buildings: buildingStates }).length / 1024).toFixed(2);
            console.log(\`[BROADCAST] Sent BUILDING_STATES - \${buildingStates.length} buildings, \${sizeKB}KB\`);
        }`
);

console.log('\n✅ All optimizations complete!');
console.log('Writing changes...');

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Optimization complete!\n');
console.log('Summary of changes:');
console.log('  ✓ Environment-based debug system');
console.log('  ✓ Cache system activated');
console.log('  ✓ CARENS optimized (skip empty parcels)');
console.log('  ✓ Maintenance calculation fixed (cumulative decay)');
console.log('  ✓ Cache invalidation added to building lifecycle');
console.log('  ✓ Emoji logs replaced with traditional logging');
console.log('  ✓ Performance timing added');
console.log('  ✓ Strategic logs for monitoring');
console.log('\nReady to test!');
