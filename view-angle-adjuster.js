/**
 * View Angle Adjuster Tool
 * Allows dynamic adjustment of the board's viewing angle from top-down to isometric
 * Hotkey: Ctrl+V to activate
 */

class ViewAngleAdjuster {
    constructor() {
        this.isActive = false;
        this.currentAngle = 0; // 0 = top-down, higher values = more isometric
        this.init();
    }

    init() {
        // Add keyboard listener for Ctrl+V
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                this.toggle();
            }
        });

        console.log('📐 View Angle Adjuster loaded! Press Ctrl+V to adjust viewing angle.');
    }

    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    activate() {
        this.isActive = true;
        this.createUI();
        this.applyCurrentAngle();
        console.log('📐 View Angle Adjuster activated');
    }

    deactivate() {
        this.isActive = false;
        this.removeUI();
        console.log('📐 View Angle Adjuster deactivated');
    }

    createUI() {
        // Remove existing UI if present
        this.removeUI();

        // Create container
        const container = document.createElement('div');
        container.id = 'view-angle-adjuster';
        container.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            min-width: 280px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        container.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <span style="font-size: 18px; margin-right: 10px;">📐</span>
                <strong>View Angle Adjuster</strong>
                <button id="close-angle-adjuster" style="
                    background: #ff4444;
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 25px;
                    height: 25px;
                    margin-left: auto;
                    cursor: pointer;
                    font-size: 12px;
                ">×</button>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px;">
                    View Angle: <span id="angle-value">${this.currentAngle}°</span>
                </label>
                <input type="range" id="angle-slider"
                       min="0" max="60" value="${this.currentAngle}" step="1"
                       style="width: 100%; margin-bottom: 10px;">
                <div style="font-size: 12px; color: #ccc;">
                    0° = Top-down view, 60° = Isometric view
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                <button id="reset-angle" style="
                    background: #666;
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 5px;
                    cursor: pointer;
                ">Reset (0°)</button>
                <button id="isometric-angle" style="
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 8px;
                    border-radius: 5px;
                    cursor: pointer;
                ">Isometric (30°)</button>
            </div>

            <div style="font-size: 12px; color: #ccc;">
                Hotkey: Ctrl+V to toggle
            </div>
        `;

        document.body.appendChild(container);

        // Add event listeners
        const slider = document.getElementById('angle-slider');
        const valueDisplay = document.getElementById('angle-value');
        const closeBtn = document.getElementById('close-angle-adjuster');
        const resetBtn = document.getElementById('reset-angle');
        const isoBtn = document.getElementById('isometric-angle');

        slider.addEventListener('input', (e) => {
            this.currentAngle = parseInt(e.target.value);
            valueDisplay.textContent = `${this.currentAngle}°`;
            this.applyCurrentAngle();
        });

        closeBtn.addEventListener('click', () => {
            this.deactivate();
        });

        resetBtn.addEventListener('click', () => {
            this.currentAngle = 0;
            slider.value = 0;
            valueDisplay.textContent = '0°';
            this.applyCurrentAngle();
        });

        isoBtn.addEventListener('click', () => {
            this.currentAngle = 30;
            slider.value = 30;
            valueDisplay.textContent = '30°';
            this.applyCurrentAngle();
        });
    }

    removeUI() {
        const existing = document.getElementById('view-angle-adjuster');
        if (existing) {
            existing.remove();
        }
    }

    applyCurrentAngle() {
        // Target the specific game canvas
        const gameCanvas = document.getElementById('gameCanvas');

        if (gameCanvas) {
            // Apply CSS transform to create perspective effect
            const perspective = 1200; // Fixed perspective distance
            const rotateX = this.currentAngle; // Rotation around X-axis
            const scale = 1 + (rotateX * 0.005); // Subtle scaling compensation

            gameCanvas.style.transformStyle = 'preserve-3d';
            gameCanvas.style.transform = `
                perspective(${perspective}px)
                rotateX(${rotateX}deg)
                scale(${scale})
            `;

            // Adjust transform origin for better visual effect
            gameCanvas.style.transformOrigin = 'center center';

            console.log(`📐 Applied view angle to gameCanvas: ${this.currentAngle}° (rotateX: ${rotateX}deg, scale: ${scale})`);
        } else {
            console.warn('📐 Could not find #gameCanvas element');

            // Fallback: try any canvas
            const canvas = document.querySelector('canvas');
            if (canvas) {
                const perspective = 1200;
                const rotateX = this.currentAngle;
                const scale = 1 + (rotateX * 0.005);

                canvas.style.transformStyle = 'preserve-3d';
                canvas.style.transform = `
                    perspective(${perspective}px)
                    rotateX(${rotateX}deg)
                    scale(${scale})
                `;
                canvas.style.transformOrigin = 'center center';

                console.log(`📐 Applied view angle to fallback canvas: ${this.currentAngle}°`);
            } else {
                console.warn('📐 No canvas elements found!');
            }
        }
    }

    // Public method to set angle programmatically
    setAngle(angle) {
        this.currentAngle = Math.max(0, Math.min(60, angle));
        this.applyCurrentAngle();

        // Update UI if active
        if (this.isActive) {
            const slider = document.getElementById('angle-slider');
            const valueDisplay = document.getElementById('angle-value');
            if (slider) slider.value = this.currentAngle;
            if (valueDisplay) valueDisplay.textContent = `${this.currentAngle}°`;
        }
    }

    // Get current angle
    getAngle() {
        return this.currentAngle;
    }
}

// Initialize the view angle adjuster
const viewAngleAdjuster = new ViewAngleAdjuster();

// Make it globally accessible
window.viewAngleAdjuster = viewAngleAdjuster;