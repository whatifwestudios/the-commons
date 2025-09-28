/**
 * Isometric Angle Adjuster
 *
 * Keyboard shortcuts:
 * - Ctrl + I: Toggle angle adjuster (I for Isometric)
 * - Arrow keys: Adjust width/height ratio (↑↓ height, ←→ width)
 * - Shift + arrows: Fine adjustment (0.5px)
 * - Alt + arrows: Coarse adjustment (2px)
 * - Enter: Copy current ratio to clipboard
 * - Escape: Close adjuster
 */

class IsometricAngleAdjuster {
    constructor(game) {
        this.game = game;
        this.active = false;

        // Current tile dimensions - start with system defaults
        this.baseTileWidth = 64;
        this.baseTileHeight = 32;

        // Initialize with current values
        this.initializeFromSystem();

        this.setupUI();
        this.setupKeyboard();
    }

    initializeFromSystem() {
        if (this.game.renderingSystem) {
            this.baseTileWidth = this.game.renderingSystem.tileWidth || 64;
            this.baseTileHeight = this.game.renderingSystem.tileHeight || 32;
        }
    }

    setupUI() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'isometric-angle-adjuster';
        this.overlay.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            z-index: 1000;
            display: none;
            min-width: 350px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        this.overlay.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: bold; color: #FF6B6B;">
                ◊ Isometric Angle Adjuster
            </div>
            <div style="margin-bottom: 10px;">
                <strong>Tile Width:</strong> <span id="tile-width-value">${this.baseTileWidth}</span>px<br>
                <strong>Tile Height:</strong> <span id="tile-height-value">${this.baseTileHeight}</span>px<br>
                <strong>Aspect Ratio:</strong> <span id="aspect-ratio-value">${(this.baseTileWidth / this.baseTileHeight).toFixed(2)}</span>:1<br>
                <strong>Viewing Angle:</strong> <span id="viewing-angle-value">${this.calculateViewingAngle()}°</span>
            </div>
            <div style="margin-bottom: 15px; font-size: 12px; color: #ccc;">
                <strong>Controls (Ctrl+I to toggle):</strong><br>
                ↑↓ Height adjustment | ←→ Width adjustment<br>
                +Shift: Fine (0.5px) | +Alt: Coarse (2px)<br>
                Enter: Copy ratio | Esc: Close<br>
                <em>Standard isometric: 64×32 (2:1) = 30°</em>
            </div>
            <div style="background: #222; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                <div style="color: #FF6B6B; margin-bottom: 5px;">Current settings:</div>
                <code id="current-settings" style="color: #fff; font-size: 12px;"></code>
            </div>
            <button onclick="isometricAngleAdjuster.copySettings()" style="
                background: #FF6B6B;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 10px;
            ">📋 Copy Settings</button>
            <button onclick="isometricAngleAdjuster.resetToStandard()" style="
                background: #4ECDC4;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 10px;
            ">⚡ Reset Standard</button>
            <button onclick="isometricAngleAdjuster.toggle()" style="
                background: #f44336;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            ">❌ Close</button>
        `;

        document.body.appendChild(this.overlay);
        this.updateDisplay();
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+I to toggle (I for Isometric)
            if (e.ctrlKey && e.key === 'i') {
                e.preventDefault();
                this.toggle();
                return;
            }

            // Only handle other keys when active
            if (!this.active) return;

            // Determine step size based on modifiers
            let step = 1;
            if (e.shiftKey) step = 0.5; // Fine adjustment
            if (e.altKey) step = 2; // Coarse adjustment

            let updated = false;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.baseTileHeight += step;
                    updated = true;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.baseTileHeight = Math.max(16, this.baseTileHeight - step);
                    updated = true;
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.baseTileWidth = Math.max(32, this.baseTileWidth - step);
                    updated = true;
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.baseTileWidth += step;
                    updated = true;
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.copySettings();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.toggle();
                    break;
            }

            if (updated) {
                this.updateDisplay();
                this.applyToSystem();
                this.triggerRerender();
            }
        });
    }

    calculateViewingAngle() {
        // Calculate the isometric viewing angle based on width/height ratio
        // Standard isometric is 30°, achieved with 2:1 ratio
        const ratio = this.baseTileWidth / this.baseTileHeight;
        const angle = Math.atan(0.5 / (ratio / 2)) * (180 / Math.PI);
        return angle.toFixed(1);
    }

    toggle() {
        this.active = !this.active;
        this.overlay.style.display = this.active ? 'block' : 'none';

        if (this.active) {
            this.initializeFromSystem(); // Sync with current system values
            this.updateDisplay();
            console.log('◊ Isometric Angle Adjuster activated! Use arrow keys to adjust diamond shape.');
        } else {
            console.log('◊ Isometric Angle Adjuster deactivated.');
        }
    }

    updateDisplay() {
        document.getElementById('tile-width-value').textContent = this.baseTileWidth.toFixed(1);
        document.getElementById('tile-height-value').textContent = this.baseTileHeight.toFixed(1);
        document.getElementById('aspect-ratio-value').textContent = (this.baseTileWidth / this.baseTileHeight).toFixed(2);
        document.getElementById('viewing-angle-value').textContent = this.calculateViewingAngle();

        const settings = `this.tileWidth = ${this.baseTileWidth.toFixed(1)};
this.tileHeight = ${this.baseTileHeight.toFixed(1)};
// Aspect ratio: ${(this.baseTileWidth / this.baseTileHeight).toFixed(2)}:1
// Viewing angle: ${this.calculateViewingAngle()}°`;

        document.getElementById('current-settings').textContent = settings;
    }

    applyToSystem() {
        // Apply to rendering system
        if (this.game.renderingSystem) {
            this.game.renderingSystem.tileWidth = this.baseTileWidth;
            this.game.renderingSystem.tileHeight = this.baseTileHeight;

            // Also update game object for backwards compatibility
            this.game.tileWidth = this.baseTileWidth;
            this.game.tileHeight = this.baseTileHeight;
        }
    }

    triggerRerender() {
        // Try multiple ways to trigger a re-render
        if (this.game) {
            if (this.game.render) {
                this.game.render();
            } else if (this.game.renderingSystem && this.game.renderingSystem.render) {
                this.game.renderingSystem.render();
            }
        }
    }

    resetToStandard() {
        this.baseTileWidth = 64;
        this.baseTileHeight = 32;
        this.updateDisplay();
        this.applyToSystem();
        this.triggerRerender();
        console.log('◊ Reset to standard isometric (64×32, 2:1 ratio, 30° angle)');
    }

    copySettings() {
        const settings = document.getElementById('current-settings').textContent;
        navigator.clipboard.writeText(settings).then(() => {
            // Show feedback
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            btn.style.background = '#4CAF50';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#FF6B6B';
            }, 2000);

            console.log('📋 Isometric settings copied to clipboard!');
            console.log(settings);
        }).catch(err => {
            console.error('Failed to copy settings:', err);
            alert('Settings copied to console - check browser console!');
            console.log('Isometric settings:', settings);
        });
    }

    // Method to be called from game initialization
    static init(game) {
        if (!window.isometricAngleAdjuster) {
            window.isometricAngleAdjuster = new IsometricAngleAdjuster(game);
            console.log('◊ Isometric Angle Adjuster loaded! Press Ctrl+I to adjust diamond shape.');
        }
    }
}

// Auto-initialize if game is available
if (typeof window !== 'undefined') {
    if (window.game) {
        IsometricAngleAdjuster.init(window.game);
    } else {
        // Wait for game to load
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (window.game) {
                    IsometricAngleAdjuster.init(window.game);
                }
            }, 1000);
        });
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IsometricAngleAdjuster;
}