#!/usr/bin/env node

/**
 * Multiplayer-focused linting script for The Commons
 * Checks for common multiplayer-related code issues and best practices
 */

const fs = require('fs');
const path = require('path');

class MultiplayerLinter {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.jsFiles = [];

        // Patterns to check for multiplayer compliance
        this.patterns = {
            // Anti-patterns that break multiplayer
            singletonState: /window\.\w+\s*=|global\.\w+\s*=/g,
            directPlayerRef: /playerCash\s*=|this\.playerCash\s*=/g,
            hardcodedPlayerId: /'player'|"player"/g,

            // Good patterns for multiplayer
            playerIdParam: /playerId/g,
            stateManagement: /gameState\.|state\./g,
            eventListeners: /addEventListener|removeEventListener/g
        };
    }

    /**
     * Scan directory for JavaScript files
     */
    scanDirectory(dir = '.') {
        const files = fs.readdirSync(dir);

        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules' && file !== 'archive') {
                this.scanDirectory(fullPath);
            } else if (file.endsWith('.js') && !file.includes('test') && !file.includes('spec')) {
                this.jsFiles.push(fullPath);
            }
        });
    }

    /**
     * Lint a single file
     */
    lintFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                const lineNum = index + 1;

                // Check for singleton state (bad for multiplayer)
                if (this.patterns.singletonState.test(line)) {
                    this.warnings.push(`${filePath}:${lineNum} - Global state assignment detected (potential multiplayer issue)`);
                }

                // Check for direct player cash manipulation
                if (this.patterns.directPlayerRef.test(line) && !line.includes('//')) {
                    this.warnings.push(`${filePath}:${lineNum} - Direct player state modification (should use GameState)`);
                }

                // Check for hardcoded 'player' references (ignore legitimate cases)
                if (this.patterns.hardcodedPlayerId.test(line) &&
                    !line.includes('//') &&
                    !line.includes('console.') &&
                    !line.includes('defaultPlayerId') &&
                    !line.includes('playerId') &&
                    !line.includes('"placeholder"') &&
                    !line.includes('patterns')) {
                    this.warnings.push(`${filePath}:${lineNum} - Hardcoded 'player' ID (should be parameterized for multiplayer)`);
                }

                // Check for event listener cleanup
                if (line.includes('addEventListener') && !this.hasCorrespondingRemoveListener(content, line)) {
                    this.warnings.push(`${filePath}:${lineNum} - addEventListener without corresponding removeEventListener`);
                }

                // Check for NaN handling
                if (line.includes('isNaN') || line.includes('NaN')) {
                    this.warnings.push(`${filePath}:${lineNum} - NaN handling detected (review for robustness)`);
                }
            });

        } catch (error) {
            this.errors.push(`Failed to read ${filePath}: ${error.message}`);
        }
    }

    /**
     * Check if content has corresponding removeEventListener
     */
    hasCorrespondingRemoveListener(content, addListenerLine) {
        // Simple heuristic - look for removeEventListener in the same file
        const eventType = addListenerLine.match(/addEventListener\s*\(\s*['"`](\w+)['"`]/);
        if (eventType) {
            const removePattern = new RegExp(`removeEventListener\\s*\\(\\s*['"\`]${eventType[1]}['"\`]`);
            return removePattern.test(content);
        }
        return content.includes('removeEventListener');
    }

    /**
     * Run the linter
     */
    run() {
        console.log('🔍 Running multiplayer-focused lint checks...\n');

        this.scanDirectory();
        console.log(`📁 Found ${this.jsFiles.length} JavaScript files\n`);

        this.jsFiles.forEach(file => {
            this.lintFile(file);
        });

        this.printResults();
    }

    /**
     * Print linting results
     */
    printResults() {
        console.log('📋 MULTIPLAYER LINT RESULTS');
        console.log('=' .repeat(50));

        if (this.errors.length > 0) {
            console.log('\n❌ ERRORS:');
            this.errors.forEach(error => console.log(`  ${error}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.warnings.forEach(warning => console.log(`  ${warning}`));
        }

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('\n✅ No multiplayer-related issues found!');
        }

        console.log(`\n📊 Summary: ${this.errors.length} errors, ${this.warnings.length} warnings`);

        // Exit with error code if there are errors
        if (this.errors.length > 0) {
            process.exit(1);
        }
    }
}

// Run the linter if called directly
if (require.main === module) {
    const linter = new MultiplayerLinter();
    linter.run();
}

module.exports = MultiplayerLinter;