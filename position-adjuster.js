/**
 * In-Game Building Position Adjuster
 *
 * Keyboard shortcuts:
 * - Ctrl + B: Toggle position adjuster (B for Building)
 * - Arrow keys: Adjust Y offset (↑↓) and X offset (←→)
 * - Shift + arrows: Fine adjustment (1px)
 * - Alt + arrows: Coarse adjustment (10px)
 * - Enter: Copy current code to clipboard
 * - Escape: Close adjuster
 */

class PositionAdjuster {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.yOffset = 9; // Current base value from your adjustment
        this.xOffset = 0;
        this.stepSize = 5; // Default step size

        // Initialize rendering system with current values
        this.applyToRendering();

        this.setupUI();
        this.setupKeyboard();
    }

    setupUI() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'position-adjuster';
        this.overlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 14px;
            z-index: 1000;
            display: none;
            min-width: 300px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        this.overlay.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: bold; color: #4CAF50;">
                🏠 Building Position Adjuster
            </div>
            <div style="margin-bottom: 10px;">
                <strong>Y Offset:</strong> <span id="y-offset-value">${this.yOffset}</span>px<br>
                <strong>X Offset:</strong> <span id="x-offset-value">${this.xOffset}</span>px
            </div>
            <div style="margin-bottom: 15px; font-size: 12px; color: #ccc;">
                <strong>Controls (Ctrl+B to toggle):</strong><br>
                ↑↓ Y adjustment | ←→ X adjustment<br>
                +Shift: Fine (1px) | +Alt: Coarse (10px)<br>
                Enter: Copy code | Esc: Close
            </div>
            <div style="background: #222; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                <div style="color: #4CAF50; margin-bottom: 5px;">Current code:</div>
                <code id="current-code" style="color: #fff; font-size: 12px;"></code>
            </div>
            <button onclick="positionAdjuster.copyCode()" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 10px;
            ">📋 Copy Code</button>
            <button onclick="positionAdjuster.toggle()" style="
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
            // Ctrl+B to toggle (B for Building)
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.toggle();
                return;
            }

            // Only handle other keys when active
            if (!this.active) return;

            // Determine step size based on modifiers
            let step = this.stepSize;
            if (e.shiftKey) step = 1; // Fine adjustment
            if (e.altKey) step = 10; // Coarse adjustment

            let updated = false;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.yOffset -= step;
                    updated = true;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.yOffset += step;
                    updated = true;
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.xOffset -= step;
                    updated = true;
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.xOffset += step;
                    updated = true;
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.copyCode();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.toggle();
                    break;
            }

            if (updated) {
                this.updateDisplay();
                this.applyToRendering();
                this.triggerRerender(); // Trigger re-render
            }
        });
    }

    toggle() {
        this.active = !this.active;
        this.overlay.style.display = this.active ? 'block' : 'none';

        if (this.active) {
            console.log('🏠 Position Adjuster activated! Use arrow keys to adjust building position.');
        } else {
            console.log('🏠 Position Adjuster deactivated.');
        }
    }

    updateDisplay() {
        document.getElementById('y-offset-value').textContent = this.yOffset;
        document.getElementById('x-offset-value').textContent = this.xOffset;

        const code = `const iso = this.toIsometric(col, row);
const buildingY = iso.y + ${this.yOffset};
const buildingX = iso.x${this.xOffset !== 0 ? ` + ${this.xOffset}` : ''};`;

        document.getElementById('current-code').textContent = code;
    }

    applyToRendering() {
        // Directly modify the rendering system's building position calculation
        if (window.game && window.game.renderingSystem) {
            // Store offsets in the rendering system for real-time use
            window.game.renderingSystem.buildingXOffset = this.xOffset;
            window.game.renderingSystem.buildingYOffset = this.yOffset;
        }
    }

    triggerRerender() {
        // Try multiple ways to trigger a re-render
        if (window.game) {
            if (window.game.render) {
                window.game.render();
            } else if (window.game.renderingSystem && window.game.renderingSystem.render) {
                window.game.renderingSystem.render();
            } else if (window.game.requestAnimationFrame) {
                window.requestAnimationFrame(() => {
                    if (window.game.render) window.game.render();
                });
            }
        }
    }

    copyCode() {
        const code = document.getElementById('current-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            // Show feedback
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            btn.style.background = '#4CAF50';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#4CAF50';
            }, 2000);

            console.log('📋 Position code copied to clipboard!');
            console.log(code);
        }).catch(err => {
            console.error('Failed to copy code:', err);
            alert('Code copied to console - check browser console!');
            console.log('Position code:', code);
        });
    }

    // Method to be called from game initialization
    static init(game) {
        if (!window.positionAdjuster) {
            window.positionAdjuster = new PositionAdjuster(game);
            console.log('🏠 Position Adjuster loaded! Press Ctrl+B to activate.');
        }
    }
}

// Auto-initialize if game is available
if (typeof window !== 'undefined') {
    if (window.game) {
        PositionAdjuster.init(window.game);
    } else {
        // Wait for game to load
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                if (window.game) {
                    PositionAdjuster.init(window.game);
                }
            }, 1000);
        });
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PositionAdjuster;
}