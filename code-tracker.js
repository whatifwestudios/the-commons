// Code Usage Tracker - Instrument functions and track CSS usage during gameplay
class CodeTracker {
    constructor() {
        this.usedFunctions = new Set();
        this.usedFiles = new Set();
        this.functionCalls = new Map(); // function name -> call count
        this.usedCSSRules = new Set();
        this.usedCSSSelectors = new Set();
        this.cssUsageStats = new Map(); // selector -> usage count
        this.startTime = Date.now();
        this.cssObserver = null;
    }

    // Instrument a function to track its usage
    instrumentFunction(obj, funcName, fileName = 'unknown') {
        if (!obj || typeof obj[funcName] !== 'function') return;

        const originalFunc = obj[funcName];
        const tracker = this;

        obj[funcName] = function(...args) {
            const key = `${fileName}:${funcName}`;
            tracker.usedFunctions.add(key);
            tracker.usedFiles.add(fileName);
            tracker.functionCalls.set(key, (tracker.functionCalls.get(key) || 0) + 1);
            return originalFunc.apply(this, args);
        };
    }

    // Instrument all functions in an object
    instrumentObject(obj, fileName = 'unknown') {
        if (!obj || typeof obj !== 'object') return;

        for (const prop in obj) {
            if (typeof obj[prop] === 'function') {
                this.instrumentFunction(obj, prop, fileName);
            }
        }
    }

    // Instrument global functions
    instrumentGlobals() {
        // Track common game functions that might be in global scope
        const globalFunctions = [
            'initGame', 'updateGame', 'renderGame', 'handleClick', 'handleMouseMove',
            'processAuction', 'updateEconomics', 'renderBuildings', 'handleResize'
        ];

        globalFunctions.forEach(funcName => {
            if (typeof window[funcName] === 'function') {
                this.instrumentFunction(window, funcName, 'global');
            }
        });
    }

    // CSS Usage Tracking Methods
    startCSSTracking() {
        // Track computed styles of visible elements
        const trackElementStyles = (element) => {
            if (!element.getBoundingClientRect || element.offsetParent === null) return;

            const computedStyle = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            // Only track visible elements
            if (rect.width > 0 && rect.height > 0) {
                // Track classes being used
                if (element.className && typeof element.className === 'string') {
                    element.className.split(' ').forEach(className => {
                        if (className.trim()) {
                            const selector = `.${className.trim()}`;
                            this.usedCSSSelectors.add(selector);
                            this.cssUsageStats.set(selector, (this.cssUsageStats.get(selector) || 0) + 1);
                        }
                    });
                }

                // Track ID being used
                if (element.id) {
                    const selector = `#${element.id}`;
                    this.usedCSSSelectors.add(selector);
                    this.cssUsageStats.set(selector, (this.cssUsageStats.get(selector) || 0) + 1);
                }

                // Track tag selector
                const tagSelector = element.tagName.toLowerCase();
                this.usedCSSSelectors.add(tagSelector);
                this.cssUsageStats.set(tagSelector, (this.cssUsageStats.get(tagSelector) || 0) + 1);
            }
        };

        // Initial scan of all elements
        const scanAllElements = () => {
            document.querySelectorAll('*').forEach(trackElementStyles);
        };

        // Set up mutation observer for dynamically added elements
        this.cssObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        trackElementStyles(node);
                        node.querySelectorAll && node.querySelectorAll('*').forEach(trackElementStyles);
                    }
                });
            });
        });

        this.cssObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'style']
        });

        // Initial scan
        scanAllElements();

        // Periodic re-scan to catch style changes
        setInterval(scanAllElements, 10000); // Every 10 seconds
    }

    // Analyze actual CSS rules from stylesheets
    analyzeCSSRules() {
        try {
            for (const stylesheet of document.styleSheets) {
                try {
                    const rules = stylesheet.cssRules || stylesheet.rules;
                    for (const rule of rules) {
                        if (rule.type === CSSRule.STYLE_RULE) {
                            this.usedCSSRules.add(rule.selectorText);
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheets may not be accessible
                    console.warn('Could not access stylesheet rules:', e);
                }
            }
        } catch (e) {
            console.warn('Error analyzing CSS rules:', e);
        }
    }

    // Get usage report
    getUsageReport() {
        const elapsed = Date.now() - this.startTime;
        return {
            sessionDuration: elapsed,
            usedFiles: Array.from(this.usedFiles),
            usedFunctions: Array.from(this.usedFunctions),
            functionCallCounts: Object.fromEntries(this.functionCalls),
            totalFunctionsCalled: this.usedFunctions.size,
            totalFiles: this.usedFiles.size,
            usedCSSSelectors: Array.from(this.usedCSSSelectors),
            cssUsageStats: Object.fromEntries(this.cssUsageStats),
            totalCSSSelectorsUsed: this.usedCSSSelectors.size,
            allCSSRules: Array.from(this.usedCSSRules)
        };
    }

    // Log current usage to console
    logUsage() {
        const report = this.getUsageReport();
        console.log('=== Code & CSS Usage Report ===');
        console.log(`Session Duration: ${Math.round(report.sessionDuration / 1000)}s`);
        console.log(`Files Used: ${report.totalFiles}`);
        console.log(`Functions Called: ${report.totalFunctionsCalled}`);
        console.log(`CSS Selectors Used: ${report.totalCSSSelectorsUsed}`);

        console.log('\nMost Called Functions:');
        const sortedFunctions = Object.entries(report.functionCallCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);
        sortedFunctions.forEach(([func, count]) => {
            console.log(`  ${func}: ${count} calls`);
        });

        console.log('\nMost Used CSS Selectors:');
        const sortedCSS = Object.entries(report.cssUsageStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 15);
        sortedCSS.forEach(([selector, count]) => {
            console.log(`  ${selector}: ${count} times`);
        });

        return report;
    }

    // Export usage data as JSON
    exportUsage() {
        const report = this.getUsageReport();
        const blob = new Blob([JSON.stringify(report, null, 2)],
            { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `code-usage-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }
}

// Global tracker instance
window.codeTracker = new CodeTracker();

// Add tracking controls to the page
function addTrackingControls() {
    const controls = document.createElement('div');
    controls.id = 'tracking-controls';
    controls.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        z-index: 9999;
        font-family: monospace;
        font-size: 12px;
    `;

    controls.innerHTML = `
        <div>Code Usage Tracker</div>
        <button onclick="window.codeTracker.logUsage()" style="margin: 2px;">Log Usage</button>
        <button onclick="window.codeTracker.exportUsage()" style="margin: 2px;">Export Data</button>
        <div id="live-stats" style="margin-top: 5px; font-size: 10px;"></div>
    `;

    document.body.appendChild(controls);

    // Update live stats every 5 seconds
    setInterval(() => {
        const stats = document.getElementById('live-stats');
        if (stats) {
            const report = window.codeTracker.getUsageReport();
            stats.innerHTML = `Files: ${report.totalFiles} | Functions: ${report.totalFunctionsCalled}`;
        }
    }, 5000);
}

// Auto-instrument when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    addTrackingControls();
    window.codeTracker.instrumentGlobals();

    // Start CSS tracking
    window.codeTracker.startCSSTracking();
    window.codeTracker.analyzeCSSRules();

    // Try to instrument major game objects after a short delay
    setTimeout(() => {
        if (window.game) window.codeTracker.instrumentObject(window.game, 'game.js');
        if (window.economicEngine) window.codeTracker.instrumentObject(window.economicEngine, 'economic-engine.js');
        if (window.renderSystem) window.codeTracker.instrumentObject(window.renderSystem, 'rendering-system.js');
        if (window.buildingSystem) window.codeTracker.instrumentObject(window.buildingSystem, 'building-system.js');
        if (window.transportSystem) window.codeTracker.instrumentObject(window.transportSystem, 'transportation.js');

        console.log('Code & CSS tracking initialized! Look for controls in top-right corner.');
        console.log('Play the game normally, then click "Log Usage" to see what code/CSS is actually used.');
    }, 2000);
});