#!/usr/bin/env node

/**
 * Fix: this.DEBUG is undefined errors
 * Add safety checks and ensure DEBUG is always defined
 */

const fs = require('fs');

const filePath = './server-economic-engine-v2.js';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Fixing DEBUG undefined errors...\n');

// Add helper method to ensure DEBUG exists
const debugHelper = `
    /**
     * Ensure DEBUG object exists (safety check)
     */
    ensureDebug() {
        if (!this.DEBUG) {
            const isDevelopment = process.env.NODE_ENV !== 'production';
            this.DEBUG = {
                MASTER: isDevelopment,
                PERFORMANCE: isDevelopment,
                CARENS: isDevelopment,
                REVENUE: isDevelopment,
                BROADCASTS: isDevelopment,
                CACHE: isDevelopment,
                TIMING: true
            };
        }
        return this.DEBUG;
    }
`;

// Insert after cache helper methods
content = content.replace(
    /(logCacheStats\(\) \{[\s\S]*?\})/,
    `$1${debugHelper}`
);

// Replace all this.DEBUG with this.ensureDebug()
content = content.replace(/this\.DEBUG\.([A-Z]+)/g, 'this.ensureDebug().$1');

console.log('✓ Added DEBUG safety checks');
console.log('✓ Replaced all this.DEBUG with this.ensureDebug()');
console.log('\nWriting changes...');

fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Fixed! DEBUG should now always be defined.\n');
