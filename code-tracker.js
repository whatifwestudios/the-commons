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
        if (!obj || typeof obj[funcName] !== 'function') return false;

        // Skip built-in/native functions to avoid breaking them
        const skipFunctions = [
            'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
            'constructor', 'toLocaleString', '__defineGetter__', '__defineSetter__',
            '__lookupGetter__', '__lookupSetter__', '__proto__'
        ];

        if (skipFunctions.includes(funcName)) return false;

        // Skip if it's a native function (check if it has native code in toString)
        try {
            const funcStr = obj[funcName].toString();
            if (funcStr.includes('[native code]') || funcStr.length < 50) {
                return false;
            }
        } catch (e) {
            return false;
        }

        // Skip if function is already instrumented
        if (obj[funcName]._codeTrackerInstrumented) return false;

        try {
            const originalFunc = obj[funcName];
            const tracker = this;

            obj[funcName] = function(...args) {
                const key = `${fileName}:${funcName}`;
                tracker.usedFunctions.add(key);
                tracker.usedFiles.add(fileName);
                tracker.functionCalls.set(key, (tracker.functionCalls.get(key) || 0) + 1);
                return originalFunc.apply(this, args);
            };

            // Mark as instrumented
            obj[funcName]._codeTrackerInstrumented = true;
            return true;
        } catch (e) {
            console.warn(`Failed to instrument ${fileName}:${funcName}:`, e);
            return false;
        }
    }

    // Instrument all functions in an object
    instrumentObject(obj, fileName = 'unknown') {
        if (!obj || typeof obj !== 'object') return 0;

        let instrumentedCount = 0;
        const allProps = Object.getOwnPropertyNames(obj);

        for (const prop of allProps) {
            try {
                if (typeof obj[prop] === 'function' && !prop.startsWith('_') && prop !== 'constructor') {
                    if (this.instrumentFunction(obj, prop, fileName)) {
                        instrumentedCount++;
                    }
                }
            } catch (e) {
                // Skip properties that can't be accessed
            }
        }

        // Also check prototype methods for classes
        if (obj.constructor && obj.constructor.prototype) {
            const protoProps = Object.getOwnPropertyNames(obj.constructor.prototype);
            for (const prop of protoProps) {
                try {
                    if (typeof obj[prop] === 'function' && !prop.startsWith('_') && prop !== 'constructor') {
                        if (this.instrumentFunction(obj, prop, fileName)) {
                            instrumentedCount++;
                        }
                    }
                } catch (e) {
                    // Skip properties that can't be accessed
                }
            }
        }

        console.log(`   Instrumented ${instrumentedCount} functions in ${fileName}`);
        return instrumentedCount;
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

    // Analyze static JavaScript functions in loaded scripts
    async analyzeStaticFunctions() {
        const functionDefinitions = new Set();
        const scripts = document.querySelectorAll('script[src]');

        console.log('🔍 Analyzing static JavaScript functions...');

        for (const script of scripts) {
            if (script.src && !script.src.includes('code-tracker.js')) {
                try {
                    const response = await fetch(script.src);
                    const code = await response.text();

                    // Find function definitions using regex
                    const funcRegex = /(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|async\s+function|\([^)]*\)\s*=>)|([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:function|async\s+function))/g;

                    let match;
                    while ((match = funcRegex.exec(code)) !== null) {
                        const funcName = match[1] || match[2] || match[3];
                        if (funcName && funcName.length < 50) {
                            functionDefinitions.add(`${script.src.split('/').pop()}:${funcName}`);
                        }
                    }

                    // Find class methods
                    const methodRegex = /(?:class\s+[a-zA-Z_$][a-zA-Z0-9_$]*[\s\S]*?){([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
                    while ((match = methodRegex.exec(code)) !== null) {
                        const methodName = match[1];
                        if (methodName && methodName !== 'constructor' && methodName.length < 50) {
                            functionDefinitions.add(`${script.src.split('/').pop()}:${methodName}`);
                        }
                    }
                } catch (e) {
                    console.warn(`Could not analyze ${script.src}:`, e);
                }
            }
        }

        this.allDefinedFunctions = Array.from(functionDefinitions);
        console.log(`📊 Found ${this.allDefinedFunctions.length} function definitions`);

        return this.allDefinedFunctions;
    }

    // Get comprehensive report including unused functions
    async getComprehensiveReport() {
        const basicReport = this.getUsageReport();

        if (!this.allDefinedFunctions) {
            await this.analyzeStaticFunctions();
        }

        const usedFunctionSet = new Set(basicReport.usedFunctions);
        const unusedFunctions = this.allDefinedFunctions.filter(func => !usedFunctionSet.has(func));

        return {
            ...basicReport,
            allDefinedFunctions: this.allDefinedFunctions,
            unusedFunctions: unusedFunctions,
            totalFunctionsDefined: this.allDefinedFunctions.length,
            totalFunctionsUsed: basicReport.usedFunctions.length,
            functionUsageRate: Math.round((basicReport.usedFunctions.length / this.allDefinedFunctions.length) * 100) / 100
        };
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
        <button onclick="window.codeTracker.analyzeStaticFunctions()" style="margin: 2px;">Analyze JS</button>
        <button onclick="window.codeTracker.getComprehensiveReport().then(r => console.log('📋 Comprehensive Report:', r))" style="margin: 2px;">Full Report</button>
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

    // Try to instrument all major game objects and functions after a short delay
    setTimeout(() => {
        console.log('🎯 Starting comprehensive JavaScript instrumentation...');

        // Debug: Log what's actually available on window
        const availableObjects = [];
        for (const prop in window) {
            if (typeof window[prop] === 'object' && window[prop] !== null &&
                typeof window[prop].constructor === 'function' &&
                window[prop].constructor.name !== 'Object' &&
                !prop.startsWith('_') && prop.length < 30) {
                availableObjects.push(prop);
            }
        }
        console.log('🔍 Available objects on window:', availableObjects);

        // Core game objects
        const objsToInstrument = [
            ['game', 'game.js'],
            ['economicEngine', 'economic-engine.js'],
            ['renderSystem', 'rendering-system.js'],
            ['buildingSystem', 'building-system.js'],
            ['transportSystem', 'transportation.js']
        ];

        let instrumentedObjects = 0;
        objsToInstrument.forEach(([objName, fileName]) => {
            if (window[objName]) {
                console.log(`✅ Instrumenting ${objName}`);
                const funcCount = Object.getOwnPropertyNames(window[objName]).filter(prop =>
                    typeof window[objName][prop] === 'function').length;
                console.log(`   Found ${funcCount} functions in ${objName}`);
                window.codeTracker.instrumentObject(window[objName], fileName);
                instrumentedObjects++;
            } else {
                console.log(`❌ ${objName} not found on window`);
            }
        });

        // System managers
        if (window.uiManager) window.codeTracker.instrumentObject(window.uiManager, 'ui-manager.js');
        if (window.actionManager) window.codeTracker.instrumentObject(window.actionManager, 'action-manager.js');
        if (window.cashManager) window.codeTracker.instrumentObject(window.cashManager, 'cash-manager.js');
        if (window.governanceSystem) window.codeTracker.instrumentObject(window.governanceSystem, 'governance-system.js');
        if (window.auctionSystem) window.codeTracker.instrumentObject(window.auctionSystem, 'auction-system.js');
        if (window.gameState) window.codeTracker.instrumentObject(window.gameState, 'game-state.js');

        // Tooltip and UI systems
        if (window.tooltipManager) window.codeTracker.instrumentObject(window.tooltipManager, 'tooltip-manager.js');
        if (window.contextMenuSystem) window.codeTracker.instrumentObject(window.contextMenuSystem, 'context-menu-system.js');
        if (window.parcelSelectorManager) window.codeTracker.instrumentObject(window.parcelSelectorManager, 'parcel-selector-manager.js');

        // Transport and mobility
        if (window.mobilityLayer) window.codeTracker.instrumentObject(window.mobilityLayer, 'mobility-layer.js');
        if (window.transportCapacity) window.codeTracker.instrumentObject(window.transportCapacity, 'transport-capacity.js');

        // Economic systems
        if (window.economicPerformance) window.codeTracker.instrumentObject(window.economicPerformance, 'economic-performance.js');
        if (window.clientEconomicAPI) window.codeTracker.instrumentObject(window.clientEconomicAPI, 'client-economic-api.js');

        // Building systems
        if (window.buildingVisualFeedback) window.codeTracker.instrumentObject(window.buildingVisualFeedback, 'building-visual-feedback.js');

        // Auth and marketplace
        if (window.authManager) window.codeTracker.instrumentObject(window.authManager, 'auth-manager.js');
        if (window.actionMarketplace) window.codeTracker.instrumentObject(window.actionMarketplace, 'action-marketplace.js');

        // Global utility functions - scan window object for functions (be very selective)
        const instrumentedGlobals = [];
        const globalSkipList = [
            'alert', 'confirm', 'prompt', 'console', 'setTimeout', 'setInterval', 'requestAnimationFrame',
            'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Function',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'eval', 'encodeURIComponent', 'decodeURIComponent',
            'btoa', 'atob', 'fetch', 'XMLHttpRequest', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
            'JSON', 'Math', 'Intl', 'Symbol', 'Proxy', 'Reflect', 'Generator', 'GeneratorFunction',
            'AsyncFunction', 'AsyncGenerator', 'AsyncGeneratorFunction', 'Atomics', 'SharedArrayBuffer',
            'escape', 'unescape', 'addEventListener', 'removeEventListener', 'dispatchEvent',
            'queueMicrotask', 'structuredClone', 'reportError', 'close', 'stop', 'focus', 'blur',
            'open', 'print', 'postMessage', 'getComputedStyle', 'getSelection', 'matchMedia',
            'moveBy', 'moveTo', 'resizeBy', 'resizeTo', 'scroll', 'scrollBy', 'scrollTo'
        ];

        for (const prop in window) {
            if (typeof window[prop] === 'function' &&
                !prop.startsWith('_') &&
                !globalSkipList.includes(prop) &&
                !prop.includes('webkit') &&
                !prop.includes('moz') &&
                !prop.includes('HTML') &&
                !prop.includes('SVG') &&
                !prop.includes('Audio') &&
                !prop.includes('Video') &&
                prop.length < 50 && prop.length > 3) { // Reasonable length for game functions
                try {
                    if (window.codeTracker.instrumentFunction(window, prop, 'global')) {
                        instrumentedGlobals.push(prop);
                    }
                } catch (e) {
                    // Skip functions that can't be instrumented
                }
            }
        }

        console.log(`✅ Instrumented ${instrumentedGlobals.length} global functions:`, instrumentedGlobals.slice(0, 10));
        console.log(`📊 Total objects instrumented: ${instrumentedObjects}`);

        // Try again with a longer delay in case objects initialize later
        setTimeout(() => {
            console.log('🔄 Second instrumentation pass...');

            objsToInstrument.forEach(([objName, fileName]) => {
                if (window[objName] && !window[objName]._codeTrackerInstrumented) {
                    console.log(`✅ Late instrumenting ${objName}`);
                    const count = window.codeTracker.instrumentObject(window[objName], fileName);
                    window[objName]._codeTrackerInstrumented = true;
                }
            });

            // Also try to find objects by scanning all window properties again
            const builtInObjects = ['Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp',
                                  'Error', 'Function', 'Math', 'JSON', 'console', 'navigator',
                                  'location', 'history', 'screen', 'document', 'performance'];

            for (const prop in window) {
                const obj = window[prop];
                if (obj && typeof obj === 'object' &&
                    obj.constructor &&
                    obj.constructor.name &&
                    !obj.constructor.name.includes('HTML') &&
                    !builtInObjects.includes(prop) &&
                    !obj._codeTrackerInstrumented &&
                    !prop.startsWith('_') &&
                    prop.length < 30) {

                    const funcCount = Object.getOwnPropertyNames(obj).filter(p => {
                        try {
                            return typeof obj[p] === 'function' &&
                                   !obj[p].toString().includes('[native code]');
                        } catch (e) {
                            return false;
                        }
                    }).length;

                    if (funcCount > 2) { // Only instrument objects with several functions
                        console.log(`🔍 Found object ${prop} with ${funcCount} functions`);
                        window.codeTracker.instrumentObject(obj, `${prop}.js`);
                        obj._codeTrackerInstrumented = true;
                    }
                }
            }
        }, 5000);

        // Add test function to verify tracking works
        window.testTrackingFunction = function() {
            console.log('Test function called!');
            return 'tracking works';
        };

        window.codeTracker.instrumentFunction(window, 'testTrackingFunction', 'test.js');

        // Call it immediately to test
        window.testTrackingFunction();

        console.log('Code & CSS tracking initialized! Look for controls in top-right corner.');
        console.log('Play the game normally, then click "Log Usage" to see what code/CSS is actually used.');
        console.log('📋 Quick test - call window.testTrackingFunction() and check if it appears in usage stats');
    }, 2000);
});