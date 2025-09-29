#!/usr/bin/env node

/**
 * Multiplayer V2 Architecture Linting Script
 *
 * Checks for:
 * - V2 server-authoritative patterns
 * - Proper WebSocket usage
 * - Event listener cleanup
 * - Player ID parameterization
 * - State management best practices
 * - Room isolation
 */

const fs = require('fs');
const path = require('path');

class MultiplayerV2Linter {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.suggestions = [];
        this.goodPatterns = [];
        this.jsFiles = [];

        // V2 Architecture patterns
        this.v2Patterns = {
            // Good V2 patterns
            serverAuth: /economicClient\.|server\./g,
            websocket: /ws\.|WebSocket|socket\./g,
            roomAware: /roomId|room\.|currentRoom/g,
            playerParam: /playerId|playerData|currentPlayerId/g,
            eventCleanup: /eventManager|cleanup\(\)|destroy\(\)|removeEventListener/g,
            stateSync: /broadcastGameState|handleServerUpdate|onUpdate/g,

            // Bad patterns for V2
            clientOnlyState: /this\.playerCash\s*=|this\._playerCash\s*=/g,
            directDOMManip: /document\.getElementById.*\.innerHTML\s*=/g,
            globalState: /window\.\w+\s*=|global\.\w+\s*=/g,
            hardcodedPlayer: /'player'|"player"/g,
            syncIssue: /setTimeout.*\d{4,}/g, // Long timeouts that might desync

            // Legacy V1 patterns (should be removed)
            v1Economic: /GameState|game-state|cash-manager/g,
            v1Patterns: /clientEconomicEngine|localState/g,

            // Event listener patterns
            addEventListener: /addEventListener\s*\(/g,
            removeEventListener: /removeEventListener\s*\(/g,
            eventManager: /eventManager\.|EventCleanupManager/g
        };

        // Files critical for V2 architecture
        this.v2CriticalFiles = [
            'server-economic-engine-v2.js',
            'economic-client-v2.js',
            'server-room-manager.js',
            'server.js'
        ];

        // Known V2 compliant patterns
        this.v2CompliantPatterns = {
            'economicClient.constructBuilding': 'Server-authoritative building',
            'economicClient.purchaseParcel': 'Server-authoritative purchase',
            'broadcastGameState': 'Proper state synchronization',
            'handleServerUpdate': 'Client state sync from server',
            'room.broadcast': 'Room-isolated messaging'
        };
    }

    /**
     * Scan directory for JavaScript files (excluding archive)
     */
    scanDirectory(dir = '.') {
        const files = fs.readdirSync(dir);

        files.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory() &&
                !file.startsWith('.') &&
                file !== 'node_modules' &&
                file !== 'archive' &&
                file !== 'build' &&
                file !== 'dist') {
                this.scanDirectory(fullPath);
            } else if (file.endsWith('.js') &&
                      !file.includes('test') &&
                      !file.includes('spec') &&
                      !file.includes('.min.')) {
                this.jsFiles.push(fullPath);
            }
        });
    }

    /**
     * Check if file is V2 compliant
     */
    checkV2Compliance(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const lines = content.split('\n');

        // Check for good V2 patterns
        let hasServerAuth = this.v2Patterns.serverAuth.test(content);
        let hasWebSocket = this.v2Patterns.websocket.test(content);
        let hasRoomAwareness = this.v2Patterns.roomAware.test(content);
        let hasPlayerParam = this.v2Patterns.playerParam.test(content);
        let hasEventCleanup = this.v2Patterns.eventCleanup.test(content);
        let hasStateSync = this.v2Patterns.stateSync.test(content);

        // Critical files must have certain patterns
        if (this.v2CriticalFiles.includes(fileName)) {
            if (!hasServerAuth && !hasWebSocket) {
                this.warnings.push(`${fileName} - Critical V2 file missing server patterns`);
            }
            if (!hasRoomAwareness && fileName.includes('room')) {
                this.errors.push(`${fileName} - Room manager not properly room-aware`);
            }
        }

        // Check for legacy V1 patterns (skip comments and documentation)
        if (this.v2Patterns.v1Economic.test(content)) {
            lines.forEach((line, index) => {
                if (this.v2Patterns.v1Economic.test(line) &&
                    !line.includes('//') &&
                    !line.includes('/*') &&
                    !line.includes('*') &&
                    !line.includes('removed') &&
                    !line.includes('legacy') &&
                    !line.includes('REMOVED') &&
                    !line.includes('CLEANED') &&
                    !line.includes('old') &&
                    !line.includes('OLD') &&
                    !fileName.includes('lint')) {
                    this.warnings.push(`${filePath}:${index + 1} - Legacy V1 economic pattern detected`);
                }
            });
        }

        // Return compliance score
        let score = 0;
        if (hasServerAuth) score += 2;
        if (hasWebSocket) score += 2;
        if (hasRoomAwareness) score += 1;
        if (hasPlayerParam) score += 1;
        if (hasEventCleanup) score += 2;
        if (hasStateSync) score += 2;

        return { score, max: 10, fileName };
    }

    /**
     * Lint a single file for V2 patterns
     */
    lintFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const fileName = path.basename(filePath);

            // Track event listeners for cleanup verification
            const eventListeners = new Map();
            const eventCleanups = new Set();

            lines.forEach((line, index) => {
                const lineNum = index + 1;

                // Check for client-only state modifications
                if (this.v2Patterns.clientOnlyState.test(line) &&
                    !line.includes('//') &&
                    !line.includes('server') &&
                    !line.includes('economicClient')) {
                    this.warnings.push(`${filePath}:${lineNum} - Client-side state modification (should use server)`);
                }

                // Check for direct DOM manipulation in game logic
                if (this.v2Patterns.directDOMManip.test(line) &&
                    !fileName.includes('ui') &&
                    !fileName.includes('manager')) {
                    this.warnings.push(`${filePath}:${lineNum} - Direct DOM manipulation in game logic (use UI manager)`);
                }

                // Check for global state assignments
                if (this.v2Patterns.globalState.test(line) &&
                    !line.includes('//') &&
                    !line.includes('module.exports') &&
                    !line.includes('window.EventCleanupManager') &&
                    !line.includes('window.gameManager') &&
                    !line.includes('window.CoordinateUtils') &&
                    !line.includes('window.ColorUtils') &&
                    !line.includes('window.PlayerUtils') &&
                    !line.includes('window.CSVConverter') &&
                    !line.includes('window.BeerHallLobby') &&
                    !line.includes('window.beerHallLobby') &&
                    !line.includes('window.buildingData')) {
                    this.warnings.push(`${filePath}:${lineNum} - Global state assignment (breaks multiplayer isolation)`);
                }

                // Check for hardcoded 'player' (with better filtering)
                if (this.v2Patterns.hardcodedPlayer.test(line) &&
                    !line.includes('//') &&
                    !line.includes('playerId') &&
                    !line.includes('defaultPlayer') &&
                    !line.includes('Player') && // Class names
                    !line.includes('PLAYER') && // Constants
                    !line.includes('player-') && // CSS classes
                    !line.includes('multiplayer') &&
                    !line.includes('singleplayer') &&
                    !line.includes('Legacy') &&
                    !line.includes('legacy') &&
                    !fileName.includes('lint')) { // Skip linter files

                    // Check if it's actually a problem
                    if (line.includes("= 'player'") ||
                        line.includes('== "player"') ||
                        line.includes("=== 'player'")) {
                        this.errors.push(`${filePath}:${lineNum} - Hardcoded 'player' ID (must be parameterized)`);
                    }
                }

                // Track event listeners
                const addMatch = line.match(/addEventListener\s*\(\s*['"`](\w+)['"`]/);
                if (addMatch) {
                    const eventType = addMatch[1];
                    if (!eventListeners.has(eventType)) {
                        eventListeners.set(eventType, []);
                    }
                    eventListeners.get(eventType).push(lineNum);
                }

                // Track event cleanups
                const removeMatch = line.match(/removeEventListener\s*\(\s*['"`](\w+)['"`]/);
                if (removeMatch) {
                    eventCleanups.add(removeMatch[1]);
                }

                // Check for EventCleanupManager usage (good!)
                if (line.includes('eventManager') || line.includes('EventCleanupManager')) {
                    this.goodPatterns.push(`${filePath}:${lineNum} - Using EventCleanupManager ✓`);
                }

                // Check for long timeouts that might cause desync
                const timeoutMatch = line.match(/setTimeout.*?(\d{4,})/);
                if (timeoutMatch && parseInt(timeoutMatch[1]) > 5000) {
                    this.warnings.push(`${filePath}:${lineNum} - Long timeout (${timeoutMatch[1]}ms) may cause multiplayer desync`);
                }

                // Check for proper room isolation
                if (line.includes('broadcast') &&
                    !line.includes('room') &&
                    !line.includes('this.broadcast') && // Class method broadcasts
                    !line.includes('// Timer updates now handled only via server broadcasts') &&
                    !line.includes('broadcastGameState') &&
                    !line.match(/\/\*.*broadcast.*\*\//) && // Comments
                    !line.includes('//')) {
                    this.suggestions.push(`${filePath}:${lineNum} - Broadcast should be room-scoped`);
                }

                // Check for V2 compliant patterns
                for (const [pattern, description] of Object.entries(this.v2CompliantPatterns)) {
                    if (line.includes(pattern)) {
                        this.goodPatterns.push(`${filePath}:${lineNum} - ${description} ✓`);
                    }
                }
            });

            // Check for unmatched event listeners
            eventListeners.forEach((lines, eventType) => {
                if (!eventCleanups.has(eventType) &&
                    !content.includes('eventManager') &&
                    !content.includes('EventCleanupManager')) {
                    this.warnings.push(`${filePath}:${lines[0]} - addEventListener('${eventType}') without cleanup`);
                }
            });

            // Get V2 compliance score
            const compliance = this.checkV2Compliance(filePath);
            if (compliance.score < 3 && !fileName.includes('utils') && !fileName.includes('lint')) {
                this.suggestions.push(`${fileName} - Low V2 compliance score: ${compliance.score}/${compliance.max}`);
            }

        } catch (error) {
            this.errors.push(`Failed to read ${filePath}: ${error.message}`);
        }
    }

    /**
     * Check WebSocket patterns
     */
    checkWebSocketPatterns(filePath, content) {
        const fileName = path.basename(filePath);

        // Files that should have WebSocket
        const shouldHaveWS = ['economic-client-v2.js', 'server.js', 'beer-hall-lobby.js'];

        if (shouldHaveWS.includes(fileName)) {
            if (!content.includes('WebSocket') && !content.includes('ws')) {
                this.errors.push(`${fileName} - Missing WebSocket implementation`);
            }

            // Check for proper connection handling
            if (content.includes('WebSocket') && !content.includes('close')) {
                this.warnings.push(`${fileName} - WebSocket without close handling`);
            }
        }
    }

    /**
     * Run the linter
     */
    run() {
        console.log('🔍 Running V2 Architecture Multiplayer Linter...\n');

        this.scanDirectory();
        console.log(`📁 Found ${this.jsFiles.length} JavaScript files\n`);

        this.jsFiles.forEach(file => {
            this.lintFile(file);

            // Additional WebSocket checks
            const content = fs.readFileSync(file, 'utf8');
            this.checkWebSocketPatterns(file, content);
        });

        this.printResults();
    }

    /**
     * Print linting results with V2 focus
     */
    printResults() {
        console.log('📋 V2 MULTIPLAYER ARCHITECTURE LINT RESULTS');
        console.log('=' .repeat(60));

        if (this.errors.length > 0) {
            console.log('\n❌ CRITICAL ERRORS:');
            console.log('These must be fixed for proper multiplayer functionality:\n');
            this.errors.forEach(error => console.log(`  ${error}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            console.log('These may cause issues in multiplayer:\n');
            // Group warnings by type
            const grouped = this.groupWarnings();
            for (const [type, warnings] of Object.entries(grouped)) {
                console.log(`\n  ${type}:`);
                warnings.slice(0, 5).forEach(w => console.log(`    ${w}`));
                if (warnings.length > 5) {
                    console.log(`    ... and ${warnings.length - 5} more`);
                }
            }
        }

        if (this.suggestions.length > 0) {
            console.log('\n💡 SUGGESTIONS:');
            console.log('Improvements for better V2 compliance:\n');
            this.suggestions.slice(0, 10).forEach(suggestion => console.log(`  ${suggestion}`));
            if (this.suggestions.length > 10) {
                console.log(`  ... and ${this.suggestions.length - 10} more suggestions`);
            }
        }

        if (this.goodPatterns.length > 0 && this.errors.length === 0) {
            console.log('\n✅ GOOD V2 PATTERNS FOUND:');
            this.goodPatterns.slice(0, 5).forEach(pattern => console.log(`  ${pattern}`));
            if (this.goodPatterns.length > 5) {
                console.log(`  ... and ${this.goodPatterns.length - 5} more good patterns`);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`  ❌ ${this.errors.length} critical errors`);
        console.log(`  ⚠️  ${this.warnings.length} warnings`);
        console.log(`  💡 ${this.suggestions.length} suggestions`);
        console.log(`  ✅ ${this.goodPatterns.length} good V2 patterns\n`);

        // V2 Architecture health score
        const healthScore = this.calculateHealthScore();
        console.log(`🏆 V2 Architecture Health Score: ${healthScore}/100`);

        if (healthScore >= 80) {
            console.log('   Excellent! Your code follows V2 multiplayer best practices.');
        } else if (healthScore >= 60) {
            console.log('   Good, but there\'s room for improvement in multiplayer patterns.');
        } else {
            console.log('   ⚠️  Significant V2 compliance issues detected. Review the warnings above.');
        }

        // Exit with error code if there are critical errors
        if (this.errors.length > 0) {
            process.exit(1);
        }
    }

    /**
     * Group warnings by type for better readability
     */
    groupWarnings() {
        const groups = {
            'Event Listener Issues': [],
            'State Management Issues': [],
            'Player ID Issues': [],
            'DOM Manipulation Issues': [],
            'Other Issues': []
        };

        this.warnings.forEach(warning => {
            if (warning.includes('addEventListener') || warning.includes('removeEventListener')) {
                groups['Event Listener Issues'].push(warning);
            } else if (warning.includes('state') || warning.includes('global')) {
                groups['State Management Issues'].push(warning);
            } else if (warning.includes('player')) {
                groups['Player ID Issues'].push(warning);
            } else if (warning.includes('DOM')) {
                groups['DOM Manipulation Issues'].push(warning);
            } else {
                groups['Other Issues'].push(warning);
            }
        });

        // Remove empty groups
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) delete groups[key];
        });

        return groups;
    }

    /**
     * Calculate overall V2 architecture health score
     */
    calculateHealthScore() {
        const totalIssues = this.errors.length + this.warnings.length;
        const goodPatternBonus = Math.min(this.goodPatterns.length * 2, 20);

        let score = 100;
        score -= this.errors.length * 10;
        score -= this.warnings.length * 2;
        score -= this.suggestions.length * 0.5;
        score += goodPatternBonus;

        return Math.max(0, Math.min(100, Math.round(score)));
    }
}

// Run the linter if called directly
if (require.main === module) {
    const linter = new MultiplayerV2Linter();
    linter.run();
}

module.exports = MultiplayerV2Linter;