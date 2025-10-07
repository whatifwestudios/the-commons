/**
 * VictoryScreen - Displays victory modal when game ends
 * Subscribes to GAME_VICTORY messages from server and shows:
 * - Winner announcement with player color
 * - Final scoreboard (all players)
 * - Fun stats (population, wealth, buildings, etc.)
 */

class VictoryScreen {
    constructor() {
        this.modal = null;
        this.unsubscribe = null;

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    initialize() {
        this.modal = document.getElementById('victory-modal');

        // Subscribe to GAME_VICTORY messages
        this.unsubscribe = window.connectionManager.subscribe('GAME_VICTORY', (message) => {
            this.showVictory(message);
        });

        console.log('🏆 Victory Screen initialized');
    }

    /**
     * Show victory modal with all game-end data
     */
    showVictory(victoryData) {
        console.log('🏆 GAME VICTORY:', victoryData);

        // Update victory title and subtitle
        const title = document.getElementById('victory-title');
        const subtitle = document.getElementById('victory-subtitle');

        if (victoryData.victoryType === 'EARLY_CIVIC_VICTORY') {
            title.textContent = '🏛️ Civic Victory!';
            subtitle.textContent = `Achieved on day ${victoryData.finalDay}`;
        } else {
            title.textContent = '👑 Year-End Victory!';
            subtitle.textContent = 'September 1st - Game Complete';
        }

        // Update winner announcement
        const winnerColor = document.getElementById('winner-color');
        const winnerName = document.getElementById('winner-name');
        const victoryMessage = document.getElementById('victory-message');

        winnerColor.style.backgroundColor = victoryData.winner.playerColor;
        winnerName.textContent = victoryData.winner.playerName;

        // Get winner's score details
        const winnerScore = victoryData.scores.find(s => s.playerId === victoryData.winner.playerId);
        if (winnerScore) {
            victoryMessage.innerHTML = `
                <strong>Total Score: ${winnerScore.score.toFixed(1)}</strong><br>
                Wealth Score: ${winnerScore.wealthScore.toFixed(1)} • Civic Score: ${winnerScore.civicScore.toFixed(1)}
            `;
        }

        // Update final scoreboard
        this.updateScoreboard(victoryData.scores);

        // Update fun stats
        this.updateFunStats(victoryData.funStats);

        // Show the modal
        this.modal.classList.add('active');

        // Play a victory sound if available (optional)
        // this.playVictorySound();
    }

    /**
     * Update the final scoreboard with all players
     */
    updateScoreboard(scores) {
        const rowsContainer = document.getElementById('victory-scoreboard-rows');
        if (!rowsContainer) return;

        rowsContainer.innerHTML = '';

        scores.forEach((playerScore, index) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';

            // Highlight winner with gold
            if (index === 0) {
                row.style.background = 'rgba(255, 215, 0, 0.1)';
                row.style.borderLeft = '3px solid #FFD700';
            }

            const rankSuffix = ['st', 'nd', 'rd'][index] || 'th';

            const wealthScore = playerScore.wealthScore?.toFixed(1) || '0.0';
            const civicScore = playerScore.civicScore?.toFixed(1) || '0.0';
            const totalScore = playerScore.score?.toFixed(1) || '0.0';

            row.innerHTML = `
                <div class="lb-rank">${index + 1}${rankSuffix}</div>
                <div class="lb-player">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${playerScore.playerColor}; margin-right: 8px;"></span>
                    ${playerScore.playerName || 'Player'}
                </div>
                <div class="lb-wealth">${wealthScore}</div>
                <div class="lb-civic">${civicScore}</div>
                <div class="lb-score">${totalScore}</div>
            `;

            rowsContainer.appendChild(row);
        });
    }

    /**
     * Update fun stats section
     */
    updateFunStats(stats) {
        if (!stats) return;

        // Population
        const populationEl = document.getElementById('stat-population');
        if (populationEl) populationEl.textContent = stats.totalPopulation?.toLocaleString() || '0';

        // Total Wealth
        const wealthEl = document.getElementById('stat-wealth');
        if (wealthEl) wealthEl.textContent = `$${stats.totalWealth?.toLocaleString() || '0'}`;

        // Total Buildings
        const buildingsEl = document.getElementById('stat-buildings');
        if (buildingsEl) buildingsEl.textContent = stats.totalBuildings?.toLocaleString() || '0';

        // LVT Collected
        const lvtEl = document.getElementById('stat-lvt');
        if (lvtEl) lvtEl.textContent = `$${Math.round(stats.totalLVTRaised)?.toLocaleString() || '0'}`;

        // Public Spending
        const spendingEl = document.getElementById('stat-public-spending');
        if (spendingEl) spendingEl.textContent = `$${Math.round(stats.totalPublicSpending)?.toLocaleString() || '0'}`;

        // Final LVT Rate
        const lvtRateEl = document.getElementById('stat-lvt-rate');
        if (lvtRateEl) lvtRateEl.textContent = `${(stats.finalLVTRate * 100).toFixed(1)}%`;
    }

    /**
     * Hide victory modal
     */
    hide() {
        if (this.modal) {
            this.modal.classList.remove('active');
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

// Create global instance
window.victoryScreen = new VictoryScreen();

// Export for modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VictoryScreen;
}
