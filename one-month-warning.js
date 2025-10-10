/**
 * OneMonthWarning - Displays warning modal on Aug 1 (Day 335)
 * Shows current leaderboard and reminds players of imminent year-end
 */

class OneMonthWarning {
    constructor() {
        this.modal = null;
        this.unsubscribe = null;
        this.shown = false; // Only show once per game

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        // Subscribe to ONE_MONTH_WARNING messages
        this.unsubscribe = window.connectionManager.subscribe('ONE_MONTH_WARNING', (message) => {
            if (!this.shown) {
                this.showWarning(message);
                this.shown = true;
            }
        });

        console.log('⏰ One Month Warning initialized');
    }

    /**
     * Show warning modal with current standings
     */
    showWarning(warningData) {
        console.log('⏰ ONE MONTH WARNING:', warningData);

        // Create modal dynamically
        this.createModal();

        // Update content
        this.updateStandings(warningData.scores);

        // Show modal
        this.modal.classList.add('visible');

        // Auto-close after 10 seconds
        setTimeout(() => {
            this.closeModal();
        }, 10000);
    }

    /**
     * Create the warning modal HTML
     */
    createModal() {
        // Check if modal already exists
        let modal = document.getElementById('one-month-warning-modal');
        if (modal) {
            this.modal = modal;
            return;
        }

        // Create modal element
        modal = document.createElement('div');
        modal.id = 'one-month-warning-modal';
        modal.className = 'modal warning-modal';
        modal.innerHTML = `
            <div class="modal-content warning-content">
                <div class="modal-header warning-header">
                    <h2>⏰ ONE MONTH REMAINING</h2>
                    <button class="modal-close" id="warning-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="warning-message">The year ends on <strong>September 1st</strong>.</p>
                    <p class="warning-submessage">Push for the lead or defend your position!</p>

                    <div class="warning-standings">
                        <h3>Current Standings:</h3>
                        <div class="standings-table" id="warning-standings-table">
                            <!-- Dynamic content -->
                        </div>
                    </div>

                    <div class="warning-tips">
                        <p><strong>Final Sprint Strategy:</strong></p>
                        <ul>
                            <li>Build civic buildings to boost your civic score</li>
                            <li>Increase revenue to grow your wealth score</li>
                            <li>Balance both for the highest total score</li>
                        </ul>
                    </div>

                    <button class="warning-continue-btn" id="warning-continue">CONTINUE PLAYING</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.modal = modal;

        // Add event listeners
        const closeBtn = document.getElementById('warning-close');
        const continueBtn = document.getElementById('warning-continue');

        if (closeBtn) {
            closeBtn.onclick = () => this.closeModal();
        }

        if (continueBtn) {
            continueBtn.onclick = () => this.closeModal();
        }

        // Close on outside click
        modal.onclick = (event) => {
            if (event.target === modal) {
                this.closeModal();
            }
        };

        // Add styles
        this.addStyles();
    }

    /**
     * Update standings table with current scores
     */
    updateStandings(scores) {
        const table = document.getElementById('warning-standings-table');
        if (!table) return;

        table.innerHTML = '';

        scores.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = 'standing-row';

            const rankSuffix = ['st', 'nd', 'rd'][index] || 'th';

            row.innerHTML = `
                <div class="standing-rank">${index + 1}${rankSuffix}</div>
                <div class="standing-player">
                    <span class="player-color-dot" style="background-color: ${player.playerColor}"></span>
                    <span class="player-name">${player.playerName}</span>
                </div>
                <div class="standing-score">${player.score.toFixed(1)}</div>
            `;

            table.appendChild(row);
        });
    }

    /**
     * Close the warning modal
     */
    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('visible');
        }
    }

    /**
     * Add CSS styles for the warning modal
     */
    addStyles() {
        if (document.getElementById('one-month-warning-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'one-month-warning-styles';
        styles.textContent = `
            .warning-modal {
                z-index: 10000;
            }

            .warning-content {
                max-width: 600px;
                background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
                border: 3px solid #ff9800;
                box-shadow: 0 0 30px rgba(255, 152, 0, 0.5);
            }

            .warning-header {
                background: linear-gradient(90deg, #ff9800, #ff6b00);
                color: white;
                padding: 20px;
                text-align: center;
                position: relative;
            }

            .warning-header h2 {
                margin: 0;
                font-size: 28px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            }

            .warning-message {
                font-size: 18px;
                text-align: center;
                margin: 20px 0;
                color: #ffffff;
            }

            .warning-submessage {
                font-size: 14px;
                text-align: center;
                margin: 10px 0 30px 0;
                color: #cccccc;
            }

            .warning-standings {
                margin: 30px 0;
            }

            .warning-standings h3 {
                color: #ff9800;
                margin-bottom: 15px;
                font-size: 18px;
                text-align: center;
            }

            .standings-table {
                background: rgba(0,0,0,0.3);
                border-radius: 8px;
                padding: 15px;
            }

            .standing-row {
                display: flex;
                align-items: center;
                padding: 10px;
                margin: 5px 0;
                background: rgba(255,255,255,0.05);
                border-radius: 5px;
            }

            .standing-rank {
                width: 50px;
                font-size: 18px;
                font-weight: bold;
                color: #ff9800;
            }

            .standing-player {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .player-color-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                display: inline-block;
            }

            .player-name {
                color: #ffffff;
                font-weight: bold;
            }

            .standing-score {
                font-size: 20px;
                font-weight: bold;
                color: #4CAF50;
                min-width: 80px;
                text-align: right;
            }

            .warning-tips {
                background: rgba(76, 175, 80, 0.1);
                border-left: 4px solid #4CAF50;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
            }

            .warning-tips p {
                margin: 0 0 10px 0;
                color: #4CAF50;
                font-weight: bold;
            }

            .warning-tips ul {
                margin: 10px 0 0 20px;
                color: #cccccc;
            }

            .warning-tips li {
                margin: 5px 0;
            }

            .warning-continue-btn {
                width: 100%;
                padding: 15px;
                font-size: 18px;
                font-weight: bold;
                background: linear-gradient(90deg, #4CAF50, #45a049);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.2s;
                margin-top: 20px;
            }

            .warning-continue-btn:hover {
                transform: scale(1.05);
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Cleanup when screen is destroyed
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        if (this.modal) {
            this.modal.remove();
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.oneMonthWarning = new OneMonthWarning();
}
