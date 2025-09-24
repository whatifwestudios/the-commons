/**
 * CSV Uploader with Keyboard Shortcut
 * Press Ctrl+Shift+U to upload new CSV building data
 */

class CSVUploader {
    constructor() {
        // Disable CSV uploader in production for security
        this.isProductionEnvironment = this.detectProductionEnvironment();
        if (this.isProductionEnvironment) {
            console.log('🚫 CSV uploader disabled in production environment');
            return; // Don't initialize uploader in production
        }

        this.isVisible = false;
        this.setupKeyboardShortcut();
        this.createUploadUI();
        this.converter = new CSVConverter();
    }

    /**
     * Detect if running in production environment
     */
    detectProductionEnvironment() {
        // Check for common production environment indicators
        return (
            // Railway, Vercel, Heroku production domains
            location.hostname.includes('.railway.app') ||
            location.hostname.includes('.vercel.app') ||
            location.hostname.includes('.herokuapp.com') ||
            // GitHub Pages
            location.hostname.includes('.github.io') ||
            // Custom production domains (not localhost)
            (!location.hostname.includes('localhost') &&
             !location.hostname.includes('127.0.0.1') &&
             !location.hostname.includes('192.168.'))
        );
    }

    /**
     * Setup keyboard shortcut (Ctrl+Shift+U)
     */
    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+U (or Cmd+Shift+U on Mac)
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'u') {
                e.preventDefault();
                this.toggleUploader();
            }
        });

        // CSV Uploader ready - silently initialized
    }

    /**
     * Create the upload UI overlay
     */
    createUploadUI() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'csv-uploader-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: none;
            justify-content: center;
            align-items: center;
        `;

        // Create upload modal
        this.modal = document.createElement('div');
        this.modal.style.cssText = `
            background: #2a2a2a;
            border: 2px solid #4a9eff;
            border-radius: 15px;
            padding: 30px;
            min-width: 500px;
            max-width: 600px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        this.modal.innerHTML = `
            <div style="text-align: center; margin-bottom: 25px;">
                <h2 style="margin: 0; color: #4a9eff; font-size: 24px;">
                    🏗️ Upload Building Data CSV
                </h2>
                <p style="margin: 10px 0 0 0; color: #aaa; font-size: 14px;">
                    Upload a CSV file to update building definitions
                </p>
            </div>

            <div id="drop-zone" style="
                border: 3px dashed #4a9eff;
                border-radius: 10px;
                padding: 40px;
                text-align: center;
                margin-bottom: 20px;
                cursor: pointer;
                transition: all 0.3s ease;
                background: rgba(74, 158, 255, 0.1);
            ">
                <div style="font-size: 48px; margin-bottom: 15px;">📁</div>
                <p style="margin: 0; font-size: 18px; color: #4a9eff;">
                    Drop CSV file here or click to browse
                </p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #aaa;">
                    Supports: .csv files
                </p>
            </div>

            <input type="file" id="csv-file-input" accept=".csv" style="display: none;">

            <div id="upload-status" style="
                margin: 20px 0;
                padding: 15px;
                border-radius: 8px;
                display: none;
            "></div>

            <div style="display: flex; gap: 15px; justify-content: center; margin-top: 20px;">
                <button id="cancel-btn" style="
                    background: #666;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: background 0.2s;
                ">Cancel</button>

                <button id="preview-btn" style="
                    background: #4a9eff;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: background 0.2s;
                    display: none;
                ">Apply Changes</button>
            </div>

            <div style="margin-top: 20px; font-size: 12px; color: #888; text-align: center;">
                <p>Press <kbd style="background: #444; padding: 2px 6px; border-radius: 3px;">Ctrl+Shift+U</kbd> or <kbd style="background: #444; padding: 2px 6px; border-radius: 3px;">Esc</kbd> to close</p>
            </div>
        `;

        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);

        this.setupEventListeners();
    }

    /**
     * Setup event listeners for the upload UI
     */
    setupEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('csv-file-input');
        const cancelBtn = document.getElementById('cancel-btn');
        const previewBtn = document.getElementById('preview-btn');

        // File drop handling
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#00ff88';
            dropZone.style.background = 'rgba(0, 255, 136, 0.1)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '#4a9eff';
            dropZone.style.background = 'rgba(74, 158, 255, 0.1)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleFile(files[0]);
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
        });

        // Button handlers
        cancelBtn.addEventListener('click', () => this.hide());
        previewBtn.addEventListener('click', () => this.applyChanges());

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });
    }

    /**
     * Handle uploaded file
     */
    async handleFile(file) {
        const statusDiv = document.getElementById('upload-status');
        const previewBtn = document.getElementById('preview-btn');

        if (!file.name.toLowerCase().endsWith('.csv')) {
            this.showStatus('❌ Please select a CSV file', 'error');
            return;
        }

        this.showStatus('📖 Reading CSV file...', 'info');

        try {
            const csvText = await this.readFileAsText(file);
            this.currentCSVData = csvText;

            // Validate and convert to JSON
            const jsonData = this.converter.convertCSVToJSON(csvText);
            this.currentJSONData = jsonData;

            // Show preview
            const buildingCount = Object.values(this.converter.buildingCategories)
                .reduce((sum, cat) => sum + cat.length, 0);
            const categories = Object.keys(this.converter.buildingCategories);

            this.showStatus(`✅ Ready to apply: ${buildingCount} buildings in ${categories.length} categories<br>
                <small>Categories: ${categories.join(', ')}</small>`, 'success');

            previewBtn.style.display = 'inline-block';

        } catch (error) {
            this.showStatus(`❌ Error processing CSV: ${error.message}`, 'error');
            console.error('CSV processing error:', error);
        }
    }

    /**
     * Read file as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Apply the converted changes
     */
    async applyChanges() {
        if (!this.currentJSONData) return;

        this.showStatus('🔄 Saving building data to project...', 'info');

        try {
            // Save JSON to server
            const response = await fetch('/api/buildings/save-json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buildingData: this.currentJSONData
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to save building data');
            }

            // Update the building manager with new data
            await this.updateBuildingManager();

            this.showStatus('✅ Building data saved to buildings-data.json!<br><small>Changes will be committed on next git push.<br>Reload page to see new buildings.</small>', 'success');

            // Auto-close after success
            setTimeout(() => {
                this.hide();
                if (window.game && window.game.populateBuildingCategories) {
                    window.game.populateBuildingCategories();
                }
            }, 3000);

        } catch (error) {
            this.showStatus(`❌ Failed to save changes: ${error.message}`, 'error');
            console.error('Save changes error:', error);
        }
    }


    /**
     * Update building manager with new data
     */
    async updateBuildingManager() {
        if (window.buildingManager && this.converter.buildingCategories) {
            // Update the building manager's buildings
            window.buildingManager.buildings = this.converter.buildingCategories;
            window.buildingManager.saveBuildings();

            console.log('🏗️  Building manager updated with new data');
        }
    }

    /**
     * Show status message
     */
    showStatus(message, type) {
        const statusDiv = document.getElementById('upload-status');
        const colors = {
            info: { bg: 'rgba(74, 158, 255, 0.2)', border: '#4a9eff' },
            success: { bg: 'rgba(0, 255, 136, 0.2)', border: '#00ff88' },
            error: { bg: 'rgba(255, 68, 68, 0.2)', border: '#ff4444' }
        };

        const color = colors[type] || colors.info;
        statusDiv.style.background = color.bg;
        statusDiv.style.border = `1px solid ${color.border}`;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = message;
    }

    /**
     * Toggle uploader visibility
     */
    toggleUploader() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Show uploader (with password protection)
     */
    show() {
        // Password protection
        const password = prompt('🔒 Enter password to access building data uploader:');
        if (password !== 'gameon') {
            alert('❌ Incorrect password. Access denied.');
            return;
        }

        this.overlay.style.display = 'flex';
        this.isVisible = true;

        // Reset state
        document.getElementById('csv-file-input').value = '';
        document.getElementById('upload-status').style.display = 'none';
        document.getElementById('preview-btn').style.display = 'none';
        this.currentCSVData = null;
        this.currentJSONData = null;
    }

    /**
     * Hide uploader
     */
    hide() {
        this.overlay.style.display = 'none';
        this.isVisible = false;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.csvUploader = new CSVUploader();
    });
} else {
    window.csvUploader = new CSVUploader();
}