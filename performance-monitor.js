/**
 * Performance Monitor for The Commons
 * Tracks FPS, compute time, memory usage, and identifies performance bottlenecks
 */

class PerformanceMonitor {
    constructor() {
        // FPS tracking
        this.fps = {
            current: 60,
            mean: 60,
            min: 60,
            max: 60,
            samples: [],
            sampleSize: 60  // 1 second of samples at 60fps
        };
        
        // Frame time tracking (in milliseconds)
        this.frameTime = {
            current: 16.67,
            mean: 16.67,
            min: 16.67,
            max: 16.67,
            samples: [],
            lastFrameTime: performance.now()
        };
        
        // Function timing
        this.timings = new Map();  // Track how long each function takes
        this.hotspots = [];        // Functions taking > 1ms
        
        // Memory tracking
        this.memory = {
            used: 0,
            limit: 0,
            percent: 0
        };
        
        // Render stats
        this.renderStats = {
            drawCalls: 0,
            tilesRendered: 0,
            buildingsRendered: 0,
            uiUpdates: 0,
            lastRenderTime: 0
        };
        
        // Game stats
        this.gameStats = {
            totalBuildings: 0,
            activeRoutes: 0,
            populationCount: 0,
            economicCalculations: 0,
            pathfindingCalls: 0
        };
        
        // Performance events
        this.events = [];  // Lag spikes, freezes, etc.
        this.isPaused = false;
        
        // Display element
        this.displayElement = null;
        this.displayMode = 'off';  // minimal, detailed, off - defaults to off, controlled via devtools
        
        // Start monitoring
        this.startTime = performance.now();
        this.frameCount = 0;
    }
    
    /**
     * Initialize performance display
     */
    initDisplay() {
        // Remove existing display if present
        const existing = document.getElementById('performance-monitor');
        if (existing) existing.remove();
        
        // Create display element
        this.displayElement = document.createElement('div');
        this.displayElement.id = 'performance-monitor';
        this.displayElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #0f0;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border: 1px solid #0f0;
            border-radius: 4px;
            z-index: 10001;
            min-width: 200px;
            user-select: none;
            cursor: move;
        `;
        
        // Make draggable
        this.makeDraggable(this.displayElement);
        
        // Add double-click handler to cycle display modes
        this.displayElement.addEventListener('dblclick', () => {
            const modes = ['minimal', 'detailed', 'off'];
            const currentIndex = modes.indexOf(this.displayMode);
            this.displayMode = modes[(currentIndex + 1) % modes.length];
            this.updateDisplay();
        });
        
        document.body.appendChild(this.displayElement);
        this.updateDisplay();
    }
    
    /**
     * Start frame measurement
     */
    startFrame() {
        this.frameStartTime = performance.now();
        this.renderStats.drawCalls = 0;
        this.renderStats.tilesRendered = 0;
        this.renderStats.buildingsRendered = 0;
        this.renderStats.uiUpdates = 0;
    }
    
    /**
     * End frame measurement and calculate FPS
     */
    endFrame() {
        const now = performance.now();
        const frameTime = now - this.frameStartTime;
        const deltaTime = now - this.frameTime.lastFrameTime;
        
        // Update frame time stats
        this.frameTime.current = frameTime;
        this.frameTime.samples.push(frameTime);
        if (this.frameTime.samples.length > this.fps.sampleSize) {
            this.frameTime.samples.shift();
        }
        
        // Calculate FPS
        if (deltaTime > 0) {
            this.fps.current = Math.round(1000 / deltaTime);
            this.fps.samples.push(this.fps.current);
            
            if (this.fps.samples.length > this.fps.sampleSize) {
                this.fps.samples.shift();
            }
            
            // Update min/max/mean
            this.fps.min = Math.min(...this.fps.samples);
            this.fps.max = Math.max(...this.fps.samples);
            this.fps.mean = Math.round(
                this.fps.samples.reduce((a, b) => a + b, 0) / this.fps.samples.length
            );
            
            // Calculate frame time stats
            this.frameTime.min = Math.min(...this.frameTime.samples);
            this.frameTime.max = Math.max(...this.frameTime.samples);
            this.frameTime.mean = this.frameTime.samples.reduce((a, b) => a + b, 0) / this.frameTime.samples.length;
        }
        
        // Detect performance issues
        if (frameTime > 33) {  // Less than 30 FPS
            this.recordEvent('lag_spike', {
                frameTime,
                fps: this.fps.current,
                timestamp: now
            });
        }
        
        if (frameTime > 100) {  // Freeze frame
            this.recordEvent('freeze', {
                frameTime,
                timestamp: now
            });
        }
        
        this.frameTime.lastFrameTime = now;
        this.frameCount++;
        
        // Update display every 10 frames
        if (this.frameCount % 10 === 0) {
            this.updateDisplay();
            this.updateMemory();
        }
        
        // Clean up old timing data every second
        if (this.frameCount % 60 === 0) {
            this.cleanupTimings();
        }
    }
    
    /**
     * Measure function execution time
     */
    measureFunction(name, fn) {
        return (...args) => {
            const start = performance.now();
            const result = fn(...args);
            const duration = performance.now() - start;
            
            // Track timing
            if (!this.timings.has(name)) {
                this.timings.set(name, {
                    count: 0,
                    total: 0,
                    mean: 0,
                    max: 0,
                    lastCall: 0
                });
            }
            
            const timing = this.timings.get(name);
            timing.count++;
            timing.total += duration;
            timing.mean = timing.total / timing.count;
            timing.max = Math.max(timing.max, duration);
            timing.lastCall = duration;
            
            // Track hotspots (functions taking > 1ms)
            if (duration > 1) {
                this.hotspots.push({ name, duration, timestamp: performance.now() });
                // Keep only last 100 hotspots
                if (this.hotspots.length > 100) {
                    this.hotspots.shift();
                }
            }
            
            return result;
        };
    }
    
    /**
     * Start timing a code block
     */
    startTiming(label) {
        const id = `${label}_${Date.now()}`;
        this.timings.set(id, { start: performance.now(), label });
        return id;
    }
    
    /**
     * End timing a code block
     */
    endTiming(id) {
        const timing = this.timings.get(id);
        if (timing) {
            const duration = performance.now() - timing.start;
            this.timings.delete(id);
            
            // Track in function timings
            if (!this.timings.has(timing.label)) {
                this.timings.set(timing.label, {
                    count: 0,
                    total: 0,
                    mean: 0,
                    max: 0,
                    lastCall: 0
                });
            }
            
            const stats = this.timings.get(timing.label);
            stats.count++;
            stats.total += duration;
            stats.mean = stats.total / stats.count;
            stats.max = Math.max(stats.max, duration);
            stats.lastCall = duration;
            
            return duration;
        }
        return 0;
    }
    
    /**
     * Track render statistics
     */
    recordDraw(type) {
        this.renderStats.drawCalls++;
        
        switch(type) {
            case 'tile':
                this.renderStats.tilesRendered++;
                break;
            case 'building':
                this.renderStats.buildingsRendered++;
                break;
            case 'ui':
                this.renderStats.uiUpdates++;
                break;
        }
    }
    
    /**
     * Update game statistics
     */
    updateGameStats(stats) {
        Object.assign(this.gameStats, stats);
    }
    
    /**
     * Update memory usage
     */
    updateMemory() {
        if (performance.memory) {
            this.memory.used = Math.round(performance.memory.usedJSHeapSize / 1048576);  // MB
            this.memory.limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);  // MB
            this.memory.percent = Math.round((this.memory.used / this.memory.limit) * 100);
        }
    }
    
    /**
     * Record performance event
     */
    recordEvent(type, data) {
        this.events.push({
            type,
            data,
            timestamp: performance.now()
        });
        
        // Keep only last 100 events
        if (this.events.length > 100) {
            this.events.shift();
        }
    }
    
    /**
     * Clean up old timing data
     */
    cleanupTimings() {
        // Remove timings that haven't been called recently
        const cutoff = performance.now() - 5000;  // 5 seconds
        
        for (const [key, timing] of this.timings) {
            if (timing.lastCall && timing.lastCall < cutoff) {
                this.timings.delete(key);
            }
        }
    }
    
    /**
     * Update performance display
     */
    updateDisplay() {
        if (!this.displayElement) return;
        
        if (this.displayMode === 'off') {
            this.displayElement.style.display = 'none';
            return;
        }
        
        this.displayElement.style.display = 'block';
        
        if (this.displayMode === 'minimal') {
            this.displayElement.innerHTML = `
                <div style="color: ${this.getFPSColor()}">FPS: ${this.fps.current}</div>
                <div>Frame: ${this.frameTime.current.toFixed(1)}ms</div>
                <div>Draws: ${this.renderStats.drawCalls}</div>
            `;
        } else if (this.displayMode === 'detailed') {
            // Find top 3 slowest functions
            const slowFunctions = Array.from(this.timings.entries())
                .filter(([key, val]) => val.mean !== undefined)
                .sort((a, b) => b[1].mean - a[1].mean)
                .slice(0, 3);
            
            this.displayElement.innerHTML = `
                <div style="font-weight: bold; color: #0f0; margin-bottom: 5px;">PERFORMANCE MONITOR</div>
                
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                
                <div style="color: ${this.getFPSColor()}">FPS: ${this.fps.current} (${this.fps.min}-${this.fps.max})</div>
                <div>Avg: ${this.fps.mean} fps</div>
                
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                
                <div>Frame Time:</div>
                <div style="padding-left: 10px;">
                    <div>Current: ${this.frameTime.current.toFixed(2)}ms</div>
                    <div>Average: ${this.frameTime.mean.toFixed(2)}ms</div>
                    <div>Max: ${this.frameTime.max.toFixed(2)}ms</div>
                </div>
                
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                
                <div>Render Stats:</div>
                <div style="padding-left: 10px;">
                    <div>Draws: ${this.renderStats.drawCalls}</div>
                    <div>Tiles: ${this.renderStats.tilesRendered}</div>
                    <div>Buildings: ${this.renderStats.buildingsRendered}</div>
                    <div>UI Updates: ${this.renderStats.uiUpdates}</div>
                </div>
                
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                
                <div>Game Stats:</div>
                <div style="padding-left: 10px;">
                    <div>Buildings: ${this.gameStats.totalBuildings}</div>
                    <div>Population: ${this.gameStats.populationCount}</div>
                    <div>Routes: ${this.gameStats.activeRoutes}</div>
                </div>
                
                ${performance.memory ? `
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                <div>Memory: ${this.memory.used}MB / ${this.memory.limit}MB (${this.memory.percent}%)</div>
                ` : ''}
                
                ${slowFunctions.length > 0 ? `
                <div style="border-bottom: 1px solid #0f0; margin: 5px 0;"></div>
                <div>Hotspots:</div>
                <div style="padding-left: 10px; font-size: 11px;">
                    ${slowFunctions.map(([name, timing]) => 
                        `<div>${name}: ${timing.mean.toFixed(2)}ms</div>`
                    ).join('')}
                </div>
                ` : ''}
                
                <div style="border-top: 1px solid #0f0; margin-top: 5px; padding-top: 5px; font-size: 10px; color: #666;">
                    Click to change view
                </div>
            `;
        }
    }
    
    /**
     * Get color based on FPS
     */
    getFPSColor() {
        if (this.fps.current >= 55) return '#0f0';      // Green: Good
        if (this.fps.current >= 45) return '#ff0';      // Yellow: OK
        if (this.fps.current >= 30) return '#f90';      // Orange: Poor
        return '#f00';                                   // Red: Bad
    }
    
    /**
     * Get performance report
     */
    getReport() {
        const topFunctions = Array.from(this.timings.entries())
            .filter(([key, val]) => val.mean !== undefined)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 10);
        
        return {
            fps: {
                current: this.fps.current,
                mean: this.fps.mean,
                min: this.fps.min,
                max: this.fps.max
            },
            frameTime: {
                mean: this.frameTime.mean,
                max: this.frameTime.max
            },
            memory: this.memory,
            renderStats: this.renderStats,
            gameStats: this.gameStats,
            topFunctions: topFunctions.map(([name, timing]) => ({
                name,
                totalTime: timing.total,
                meanTime: timing.mean,
                maxTime: timing.max,
                callCount: timing.count
            })),
            events: this.events.slice(-10),  // Last 10 events
            uptime: (performance.now() - this.startTime) / 1000  // Seconds
        };
    }
    
    /**
     * Export performance data for analysis
     */
    exportData() {
        return {
            timestamp: Date.now(),
            report: this.getReport(),
            fpsSamples: this.fps.samples,
            frameTimeSamples: this.frameTime.samples,
            hotspots: this.hotspots
        };
    }
    
    /**
     * Reset all statistics
     */
    reset() {
        this.fps.samples = [];
        this.frameTime.samples = [];
        this.timings.clear();
        this.hotspots = [];
        this.events = [];
        this.frameCount = 0;
        this.startTime = performance.now();
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        this.isPaused = !this.isPaused;
    }
    
    /**
     * Make an element draggable
     */
    makeDraggable(element) {
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        element.addEventListener('mousedown', (e) => {
            // Don't start drag on double-click
            if (e.detail === 2) return;
            
            isDragging = true;
            dragOffset.x = e.clientX - element.offsetLeft;
            dragOffset.y = e.clientY - element.offsetTop;
            element.style.zIndex = '10002'; // Bring to front while dragging
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            // Keep within viewport bounds
            const maxX = window.innerWidth - element.offsetWidth;
            const maxY = window.innerHeight - element.offsetHeight;
            
            element.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
            element.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
            element.style.right = 'auto'; // Remove right positioning
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10001'; // Return to normal z-index
            }
        });
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceMonitor;
}