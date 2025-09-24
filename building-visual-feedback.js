/**
 * Building Visual Feedback System
 *
 * Provides real-time visual indicators for building performance,
 * efficiency, and resource deficits
 */

class BuildingVisualFeedback {
    constructor(game) {
        this.game = game;

        // Performance color schemes
        this.performanceColors = {
            optimal: {
                primary: '#00ff00',
                glow: 'rgba(0, 255, 0, 0.4)',
                pulse: 'rgba(0, 255, 0, 0.6)'
            },
            good: {
                primary: '#90ee90',
                glow: 'rgba(144, 238, 144, 0.3)',
                pulse: 'rgba(144, 238, 144, 0.5)'
            },
            poor: {
                primary: '#ffff00',
                glow: 'rgba(255, 255, 0, 0.3)',
                pulse: 'rgba(255, 255, 0, 0.5)'
            },
            critical: {
                primary: '#ff4444',
                glow: 'rgba(255, 68, 68, 0.4)',
                pulse: 'rgba(255, 68, 68, 0.6)'
            }
        };

        // Warning icons for deficits
        this.deficitIcons = {
            energy: '⚡',
            food: '🍎',
            workers: '👷',
            jobs: '💼',
            maintenance: '🔧'
        };

        // Animation state
        this.animations = new Map();
        this.pulsePhase = 0;

        // Visual overlay canvas
        this.overlayCanvas = null;
        this.overlayCtx = null;

        this.initializeOverlay();
    }

    /**
     * Initialize the visual overlay canvas
     */
    initializeOverlay() {
        // Create overlay canvas if it doesn't exist
        if (!document.getElementById('building-feedback-overlay')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'building-feedback-overlay';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '10';

            const gameCanvas = document.getElementById('gameCanvas');
            if (gameCanvas) {
                canvas.width = gameCanvas.width;
                canvas.height = gameCanvas.height;
                gameCanvas.parentElement.appendChild(canvas);
            }

            this.overlayCanvas = canvas;
            this.overlayCtx = canvas.getContext('2d');
        }
    }

    /**
     * Update visual feedback for all buildings
     */
    update(deltaTime) {
        if (!this.overlayCtx) return;

        // Clear overlay
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Update pulse animation phase
        this.pulsePhase += deltaTime * 0.002;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase -= Math.PI * 2;
        }

        // Render building performance indicators
        this.renderBuildingPerformance();

        // Render deficit warnings
        this.renderDeficitWarnings();

        // Render decay indicators
        this.renderDecayIndicators();
    }

    /**
     * Render performance-based visual effects for buildings
     */
    renderBuildingPerformance() {
        const ctx = this.overlayCtx;
        const grid = this.game.grid;

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                const parcel = grid[row][col];

                if (!parcel.building || parcel._isUnderConstruction) continue;

                // Get building performance from economic engine
                const performance = this.getBuildingPerformance(row, col);
                if (!performance) continue;

                const status = this.getPerformanceStatus(performance.efficiency);
                const colors = this.performanceColors[status];

                // Get screen coordinates
                const screenPos = this.game.renderingSystem?.getScreenCoordinates(row, col);
                if (!screenPos) continue;

                // Draw performance glow
                this.drawPerformanceGlow(ctx, screenPos, colors, performance.efficiency);

                // Draw pulse effect for poor/critical performance
                if (status === 'poor' || status === 'critical') {
                    this.drawPulseEffect(ctx, screenPos, colors);
                }
            }
        }
    }

    /**
     * Get building performance data
     */
    getBuildingPerformance(row, col) {
        // Try to get from economic API cache
        if (this.game.economicAPI) {
            const cached = this.game.economicAPI.getCachedBuildingPerformance(row, col);
            if (cached) return cached;
        }

        // Fallback to calculating locally
        const parcel = this.game.grid[row][col];
        if (!parcel.building) return null;

        const building = this.game.buildingSystem?.calculateBuildingEconomics(parcel, row, col);
        if (!building) return null;

        return {
            efficiency: building.efficiency || 1.0,
            energyEfficiency: building.energyMultiplier || 1.0,
            laborEfficiency: building.laborMultiplier || 1.0,
            deficits: building.deficits || []
        };
    }

    /**
     * Get performance status based on efficiency
     */
    getPerformanceStatus(efficiency) {
        if (efficiency >= 0.9) return 'optimal';
        if (efficiency >= 0.7) return 'good';
        if (efficiency >= 0.4) return 'poor';
        return 'critical';
    }

    /**
     * Draw performance glow effect
     */
    drawPerformanceGlow(ctx, position, colors, efficiency) {
        const { x, y } = position;
        const baseRadius = 30;
        const glowRadius = baseRadius * (0.8 + efficiency * 0.4);

        // Create radial gradient
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
        gradient.addColorStop(0, colors.glow);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.save();
        ctx.globalAlpha = 0.3 + (efficiency * 0.2);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draw pulse effect for warnings
     */
    drawPulseEffect(ctx, position, colors) {
        const { x, y } = position;
        const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.2;
        const radius = 25 * pulseScale;

        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(this.pulsePhase) * 0.2;
        ctx.strokeStyle = colors.pulse;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Render deficit warning icons
     */
    renderDeficitWarnings() {
        const ctx = this.overlayCtx;
        const grid = this.game.grid;

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                const parcel = grid[row][col];

                if (!parcel.building || parcel._isUnderConstruction) continue;

                const performance = this.getBuildingPerformance(row, col);
                if (!performance || !performance.deficits || performance.deficits.length === 0) continue;

                const screenPos = this.game.renderingSystem?.getScreenCoordinates(row, col);
                if (!screenPos) continue;

                this.drawDeficitIcons(ctx, screenPos, performance.deficits);
            }
        }
    }

    /**
     * Draw deficit warning icons
     */
    drawDeficitIcons(ctx, position, deficits) {
        const { x, y } = position;
        const iconSize = 16;
        const iconSpacing = 20;
        const startX = x - (deficits.length * iconSpacing) / 2;
        const iconY = y - 40;

        ctx.save();
        ctx.font = `${iconSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        deficits.forEach((deficit, index) => {
            const iconX = startX + (index * iconSpacing) + iconSpacing / 2;

            // Draw background circle
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconSize / 2 + 2, 0, Math.PI * 2);
            ctx.fill();

            // Draw icon
            const icon = this.deficitIcons[deficit.type] || '❗';
            ctx.fillStyle = 'white';
            ctx.fillText(icon, iconX, iconY);

            // Pulse animation for critical deficits
            if (deficit.severity === 'critical') {
                ctx.globalAlpha = 0.3 + Math.sin(this.pulsePhase * 2) * 0.3;
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(iconX, iconY, iconSize / 2 + 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });

        ctx.restore();
    }

    /**
     * Render decay/maintenance indicators
     */
    renderDecayIndicators() {
        const ctx = this.overlayCtx;
        const grid = this.game.grid;

        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[row].length; col++) {
                const parcel = grid[row][col];

                if (!parcel.building || parcel._isUnderConstruction) continue;
                if (!parcel.decay || parcel.decay < 0.1) continue;

                const screenPos = this.game.renderingSystem?.getScreenCoordinates(row, col);
                if (!screenPos) continue;

                this.drawDecayIndicator(ctx, screenPos, parcel.decay);
            }
        }
    }

    /**
     * Draw decay/maintenance indicator
     */
    drawDecayIndicator(ctx, position, decay) {
        const { x, y } = position;
        const maxCracks = 5;
        const numCracks = Math.floor(decay * maxCracks);

        ctx.save();
        ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)';
        ctx.lineWidth = 1 + decay * 2;

        // Draw crack lines
        for (let i = 0; i < numCracks; i++) {
            const angle = (Math.PI * 2 * i) / maxCracks;
            const length = 10 + decay * 20;

            ctx.beginPath();
            ctx.moveTo(x, y);

            // Zigzag crack pattern
            const segments = 3;
            for (let j = 1; j <= segments; j++) {
                const segLength = (length * j) / segments;
                const offsetX = Math.cos(angle) * segLength + (Math.random() - 0.5) * 5;
                const offsetY = Math.sin(angle) * segLength + (Math.random() - 0.5) * 5;
                ctx.lineTo(x + offsetX, y + offsetY);
            }

            ctx.stroke();
        }

        // Draw maintenance warning if decay is high
        if (decay > 0.5) {
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255, 140, 0, 0.9)';
            ctx.fillText('🔧', x, y + 30);
        }

        ctx.restore();
    }

    /**
     * Highlight building with special effect
     */
    highlightBuilding(row, col, effect = 'success') {
        const effectConfig = {
            success: { color: '#00ff00', duration: 1000 },
            error: { color: '#ff0000', duration: 500 },
            warning: { color: '#ffff00', duration: 750 }
        };

        const config = effectConfig[effect] || effectConfig.success;

        this.animations.set(`${row},${col}`, {
            type: 'highlight',
            color: config.color,
            duration: config.duration,
            startTime: Date.now()
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.overlayCanvas) {
            this.overlayCanvas.remove();
            this.overlayCanvas = null;
            this.overlayCtx = null;
        }
        this.animations.clear();
    }
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BuildingVisualFeedback;
} else {
    window.BuildingVisualFeedback = BuildingVisualFeedback;
}