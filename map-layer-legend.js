/**
 * Map Layer Legend System
 * Displays context-appropriate legends for different map layers
 */
class MapLayerLegend {
    constructor(game) {
        this.game = game;
        this.legendElement = document.getElementById('layer-legend');
        this.legendTitle = document.getElementById('legend-title');
        this.legendContent = document.getElementById('legend-content');
    }

    /**
     * Update legend based on current layer
     */
    updateLegend(layerName) {
        if (!this.legendElement) return;

        // Clear player selection when leaving ownership layer
        if (layerName !== 'ownership' && this.game.selectedPlayerId) {
            this.game.selectedPlayerId = null;
            this.game.scheduleRender();
        }

        // Hide legend on normal view
        if (layerName === 'normal') {
            this.legendElement.style.display = 'none';
            return;
        }

        // Show legend and update content based on layer
        this.legendElement.style.display = 'block';

        switch (layerName) {
            case 'ownership':
                this.renderOwnershipLegend();
                break;
            case 'landvalue':
                this.renderLandValueLegend();
                break;
            default:
                this.legendElement.style.display = 'none';
        }
    }

    /**
     * Render ownership layer legend - Net Revenue Gradient
     */
    renderOwnershipLegend() {
        this.legendTitle.textContent = 'Net Revenue Map';

        const html = `
            <div class="legend-gradient">
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #E74C3C, #666666, #4A90E2);"></div>
                <div class="legend-gradient-labels">
                    <div class="legend-gradient-label">
                        <span>Losing Money</span>
                        <span style="color: #E74C3C;">●</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>Break Even</span>
                        <span style="color: #666666;">●</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>Profitable</span>
                        <span style="color: #4A90E2;">●</span>
                    </div>
                </div>
            </div>
            <div class="legend-note">
                Buildings colored by net cashflow (revenue - costs)
            </div>
        `;

        this.legendContent.innerHTML = html;
    }

    /**
     * Render land value heatmap legend
     */
    renderLandValueLegend() {
        this.legendTitle.textContent = 'Land Value Heatmap';

        const minMax = this.calculateLandValueRange();

        const html = `
            <div class="legend-gradient">
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #0000FF, #00FFFF, #00FF00, #FFFF00, #FF8800, #FF0000);"></div>
                <div class="legend-gradient-labels">
                    <div class="legend-gradient-label">
                        <span>Low</span>
                        <span>$${this.formatPrice(minMax.min)}</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>High</span>
                        <span>$${this.formatPrice(minMax.max)}</span>
                    </div>
                </div>
            </div>
            <div class="legend-note">Shows last paid price for parcels</div>
        `;

        this.legendContent.innerHTML = html;
    }

    /**
     * Render civic impact legend
     */
    renderCivicLegend() {
        this.legendTitle.textContent = 'Civic Impact Map';

        const html = `
            <div class="legend-gradient">
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #E74C3C, #666666, #2ECC71);"></div>
                <div class="legend-gradient-labels">
                    <div class="legend-gradient-label">
                        <span>Negative</span>
                        <span>-5</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>Neutral</span>
                        <span>0</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>Positive</span>
                        <span>+5</span>
                    </div>
                </div>
            </div>
            <div class="legend-note">Building contribution to common good</div>
        `;

        this.legendContent.innerHTML = html;
    }

    /**
     * Render needs map legend
     */
    renderNeedsLegend() {
        this.legendTitle.textContent = 'Needs Map';

        const html = `
            <div class="legend-gradient">
                <div class="legend-gradient-bar" style="background: linear-gradient(to right, #2ECC71, #F1C40F, #E67E22, #E74C3C);"></div>
                <div class="legend-gradient-labels">
                    <div class="legend-gradient-label">
                        <span>Satisfied</span>
                        <span>0%</span>
                    </div>
                    <div class="legend-gradient-label">
                        <span>Critical</span>
                        <span>100%</span>
                    </div>
                </div>
            </div>
            <div class="legend-note">Building neediness from JEEFHH system</div>
        `;

        this.legendContent.innerHTML = html;
    }

    /**
     * Get players sorted by civic score (descending)
     */
    getPlayersSortedByScore() {
        const players = [];

        // Get players from economic client
        const gameState = this.game.economicClient?.gameState;
        if (!gameState?.players) return players;

        const playersData = gameState.players instanceof Map
            ? Array.from(gameState.players.values())
            : Object.values(gameState.players);

        playersData.forEach(player => {
            players.push({
                id: player.id || player.playerId,
                name: player.name || 'Unknown',
                color: player.color || '#888',
                score: player.civicScore || player.score || 0
            });
        });

        // Sort by score descending
        players.sort((a, b) => b.score - a.score);

        return players;
    }

    /**
     * Calculate min/max land values for heatmap
     */
    calculateLandValueRange() {
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        for (let r = 0; r < this.game.gridSize; r++) {
            for (let c = 0; c < this.game.gridSize; c++) {
                const p = this.game.grid[r][c];
                if (!p) continue;

                let parcelPrice = 0;
                if (!p.owner || p.owner === 'City' || p.owner === 'unclaimed') {
                    parcelPrice = this.game.economicClient?.getParcelPrice?.(r, c) || 0;
                } else {
                    parcelPrice = p.pricePaid || p.price || 0;
                }

                if (parcelPrice > 0) {
                    minPrice = Math.min(minPrice, parcelPrice);
                    maxPrice = Math.max(maxPrice, parcelPrice);
                }
            }
        }

        return {
            min: minPrice === Infinity ? 0 : minPrice,
            max: maxPrice === -Infinity ? 0 : maxPrice
        };
    }

    /**
     * Format price for display
     */
    formatPrice(price) {
        if (price >= 1000000) {
            return (price / 1000000).toFixed(1) + 'M';
        } else if (price >= 1000) {
            return (price / 1000).toFixed(1) + 'K';
        }
        return price.toString();
    }

    /**
     * Highlight parcels owned by selected player (toggle)
     */
    focusOnPlayerParcels(playerId) {
        // Toggle selection - if already selected, deselect
        if (this.game.selectedPlayerId === playerId) {
            this.game.selectedPlayerId = null;
        } else {
            this.game.selectedPlayerId = playerId;
        }

        // Update legend UI to show selected state
        this.legendContent.querySelectorAll('.legend-player-item').forEach(item => {
            if (item.getAttribute('data-player-id') === this.game.selectedPlayerId) {
                item.style.background = 'rgba(232, 212, 160, 0.2)';
            } else {
                item.style.background = '';
            }
        });

        // Trigger re-render with new selection
        this.game.scheduleRender();

        // Show notification
        const player = this.getPlayersSortedByScore().find(p => p.id === playerId);
        if (player && this.game.selectedPlayerId) {
            this.game.showNotification(`Highlighting ${player.name}'s parcels`, 'success');
        } else {
            this.game.showNotification('Cleared player selection', 'info');
        }
    }
}
