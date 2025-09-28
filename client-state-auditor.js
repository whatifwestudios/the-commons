/**
 * Client State Mutation Auditor
 *
 * Intercepts and reports all client-side state changes to identify
 * legacy dual-authority code that needs server-authoritative conversion.
 *
 * Can operate in two modes:
 * - AUDIT: Reports mutations but allows them (compatibility mode)
 * - BLOCK: Reports and prevents mutations (server-authoritative mode)
 */

class ClientStateAuditor {
    constructor(mode = 'AUDIT') {
        this.mode = mode; // 'AUDIT' or 'BLOCK'
        this.mutations = [];
        this.blockedMutations = [];
        this.interceptedObjects = new Set();

        console.log(`🔍 Client State Auditor initialized in ${mode} mode`);

        // Start intercepting immediately
        this.startIntercepting();
    }

    /**
     * Start intercepting state mutations on key game objects
     */
    startIntercepting() {
        // Intercept when game instance is created
        this.interceptGameCreation();

        // Intercept existing objects if they exist
        if (window.game) {
            this.interceptGameObject(window.game);
        }
    }

    /**
     * Intercept game object creation
     */
    interceptGameCreation() {
        // Hook into window.game assignment
        let gameInstance = null;
        const auditor = this; // Capture reference for use in setter
        Object.defineProperty(window, 'game', {
            get() {
                return gameInstance;
            },
            set(value) {
                console.log('🎮 Game instance created - starting state interception');
                gameInstance = value;
                if (value) {
                    auditor.interceptGameObject(value);
                }
            },
            configurable: true
        });
    }

    /**
     * Intercept mutations on the main game object
     */
    interceptGameObject(game) {
        if (this.interceptedObjects.has(game)) return;
        this.interceptedObjects.add(game);

        // Intercept grid mutations
        if (game.grid) {
            this.interceptGrid(game.grid, 'game.grid');
        }

        // Intercept cash mutations
        this.interceptProperty(game, '_playerCash', 'game._playerCash');
        this.interceptProperty(game, 'playerCash', 'game.playerCash');

        // Intercept governance system if it exists
        if (game.governanceSystem) {
            this.interceptGovernanceSystem(game.governanceSystem);
        }

        // Monitor for new properties being added
        this.interceptNewProperties(game, 'game');
    }

    /**
     * Intercept grid array mutations
     */
    interceptGrid(grid, path) {
        if (!Array.isArray(grid)) return;

        grid.forEach((row, rowIndex) => {
            if (Array.isArray(row)) {
                row.forEach((parcel, colIndex) => {
                    if (parcel && typeof parcel === 'object') {
                        this.interceptParcel(parcel, `${path}[${rowIndex}][${colIndex}]`);
                    }
                });
            }
        });
    }

    /**
     * Intercept individual parcel mutations
     */
    interceptParcel(parcel, path) {
        // Key properties that should be server-authoritative
        const criticalProperties = [
            'owner', 'building', 'buildingAge', 'decay', 'population',
            '_isUnderConstruction', '_constructionStartTime', '_constructionDays',
            '_constructionProgress', 'constructionStartDay', 'constructionDays',
            'amenities', 'landValue'
        ];

        criticalProperties.forEach(prop => {
            this.interceptProperty(parcel, prop, `${path}.${prop}`);
        });
    }

    /**
     * Intercept governance system mutations
     */
    interceptGovernanceSystem(governance) {
        if (governance.governance) {
            this.interceptProperty(governance.governance, 'treasuryBalance', 'governance.treasuryBalance');
            this.interceptProperty(governance.governance, 'totalBudget', 'governance.totalBudget');
        }
    }

    /**
     * Intercept property mutations using getters/setters
     */
    interceptProperty(obj, prop, path) {
        if (!obj || typeof obj !== 'object') return;

        // Skip if property is already intercepted or non-configurable
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (descriptor && (!descriptor.configurable || descriptor.get)) {
            console.log(`⚠️ Skipping ${path} - already intercepted or non-configurable`);
            return;
        }

        let currentValue = obj[prop];
        const auditor = this; // Capture reference for use in setter

        Object.defineProperty(obj, prop, {
            get() {
                return currentValue;
            },
            set(newValue) {
                // Whitelist: Allow UI properties that don't affect server-authoritative state
                const uiProperties = ['hoveredTile', 'selectedTile', 'activeTooltip', 'mouseX', 'mouseY', 'isHovering', 'dragState', 'contextMenu'];
                const isUIProperty = uiProperties.includes(prop);

                if (isUIProperty) {
                    // Allow UI properties without blocking or logging
                    currentValue = newValue;
                    return;
                }

                const mutation = {
                    timestamp: Date.now(),
                    path: path,
                    property: prop,
                    oldValue: currentValue,
                    newValue: newValue,
                    stack: auditor.getCallStack(),
                    blocked: auditor.mode === 'BLOCK'
                };

                auditor.logMutation(mutation);

                if (auditor.mode === 'BLOCK') {
                    auditor.blockedMutations.push(mutation);
                    console.warn(`🚫 BLOCKED STATE MUTATION: ${path} = ${newValue}`);
                    // Don't update the value in BLOCK mode
                    return;
                }

                // Allow mutation in AUDIT mode
                currentValue = newValue;
                auditor.mutations.push(mutation);
            },
            configurable: true,
            enumerable: true
        });
    }

    /**
     * Monitor for new properties being added to objects
     */
    interceptNewProperties(obj, path) {
        const originalProps = new Set(Object.keys(obj));

        // Check periodically for new properties
        setInterval(() => {
            const currentProps = Object.keys(obj);
            const newProps = currentProps.filter(prop => !originalProps.has(prop));

            newProps.forEach(prop => {
                console.log(`🆕 New property detected: ${path}.${prop}`);
                this.interceptProperty(obj, prop, `${path}.${prop}`);
                originalProps.add(prop);
            });
        }, 1000);
    }

    /**
     * Get call stack for mutation source tracking
     */
    getCallStack() {
        const stack = new Error().stack;
        const lines = stack.split('\n').slice(3, 8); // Skip Error constructor lines
        return lines.map(line => line.trim()).join(' → ');
    }

    /**
     * Log mutation with detailed information
     */
    logMutation(mutation) {
        const emoji = mutation.blocked ? '🚫' : '📝';
        const action = mutation.blocked ? 'BLOCKED' : 'DETECTED';

        console.log(`${emoji} ${action} STATE MUTATION:`, {
            path: mutation.path,
            change: `${mutation.oldValue} → ${mutation.newValue}`,
            source: mutation.stack.split(' → ')[0]
        });
    }

    /**
     * Generate comprehensive audit report
     */
    generateReport() {
        const report = {
            summary: {
                totalMutations: this.mutations.length,
                blockedMutations: this.blockedMutations.length,
                mode: this.mode,
                generatedAt: new Date().toISOString()
            },
            mutationsByPath: {},
            mutationsBySource: {},
            legacyCodeLocations: new Set(),
            removalCandidates: []
        };

        // Analyze all mutations
        [...this.mutations, ...this.blockedMutations].forEach(mutation => {
            // Group by path
            if (!report.mutationsByPath[mutation.path]) {
                report.mutationsByPath[mutation.path] = [];
            }
            report.mutationsByPath[mutation.path].push(mutation);

            // Group by source
            const source = mutation.stack.split(' → ')[0];
            if (!report.mutationsBySource[source]) {
                report.mutationsBySource[source] = [];
            }
            report.mutationsBySource[source].push(mutation);

            // Extract file/function for legacy code identification
            const fileMatch = source.match(/at (\w+).*\((.*\.js):/);
            if (fileMatch) {
                report.legacyCodeLocations.add(`${fileMatch[2]}:${fileMatch[1]}`);
            }
        });

        // Convert Set to Array for JSON serialization
        report.legacyCodeLocations = Array.from(report.legacyCodeLocations);

        // Generate removal recommendations
        Object.entries(report.mutationsByPath).forEach(([path, mutations]) => {
            report.removalCandidates.push({
                path: path,
                mutationCount: mutations.length,
                recommendation: this.generateRemovalRecommendation(path, mutations)
            });
        });

        return report;
    }

    /**
     * Generate specific removal recommendations for each mutation path
     */
    generateRemovalRecommendation(path, mutations) {
        const propertyType = path.split('.').pop();

        if (path.includes('grid[') && (propertyType === 'owner' || propertyType === 'building')) {
            return 'CRITICAL: Convert to server-authoritative parcel updates via WebSocket';
        }

        if (path.includes('treasuryBalance') || path.includes('totalBudget')) {
            return 'CRITICAL: Remove client-side treasury manipulation, use server state only';
        }

        if (path.includes('_playerCash') || path.includes('playerCash')) {
            return 'CRITICAL: Remove client-side balance updates, receive via WebSocket only';
        }

        if (propertyType.includes('construction')) {
            return 'HIGH: Remove client-side construction state, use server timing only';
        }

        return 'MEDIUM: Review for server-authoritative conversion';
    }

    /**
     * Export audit report for analysis
     */
    exportReport() {
        const report = this.generateReport();

        console.log('📊 CLIENT STATE AUDIT REPORT:', report.summary);
        console.log('🎯 Legacy code locations to review:', report.legacyCodeLocations);
        console.log('🗑️ Top removal candidates:',
            report.removalCandidates
                .sort((a, b) => b.mutationCount - a.mutationCount)
                .slice(0, 10)
        );

        // Also save to localStorage for persistence
        localStorage.setItem('clientStateAuditReport', JSON.stringify(report, null, 2));

        return report;
    }

    /**
     * Switch between AUDIT and BLOCK modes
     */
    setMode(mode) {
        if (mode !== 'AUDIT' && mode !== 'BLOCK') {
            throw new Error('Mode must be "AUDIT" or "BLOCK"');
        }

        this.mode = mode;
        console.log(`🔄 Client State Auditor switched to ${mode} mode`);
    }

    /**
     * Clear audit history
     */
    reset() {
        this.mutations = [];
        this.blockedMutations = [];
        console.log('🧹 Client State Auditor reset');
    }
}

// Auto-initialize the auditor
if (typeof window !== 'undefined') {
    // Start in BLOCK mode by default for server-authoritative testing
    window.clientStateAuditor = new ClientStateAuditor('BLOCK');

    // Expose control functions globally
    window.enableServerAuthoritative = () => window.clientStateAuditor.setMode('BLOCK');
    window.enableClientMutations = () => window.clientStateAuditor.setMode('AUDIT');
    window.generateStateAudit = () => window.clientStateAuditor.exportReport();
    window.resetStateAudit = () => window.clientStateAuditor.reset();

    console.log('🔍 Client State Auditor ready! Use these functions:');
    console.log('  - enableServerAuthoritative() // Block client mutations');
    console.log('  - enableClientMutations() // Allow client mutations (audit only)');
    console.log('  - generateStateAudit() // Generate removal roadmap');
    console.log('  - resetStateAudit() // Clear audit history');
}