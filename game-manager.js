/**
 * Game Manager - Centralized game instance management
 *
 * Prevents global state pollution by providing a controlled
 * interface for managing game instances in multiplayer environments.
 */

class GameManager {
    constructor() {
        // Map of game instances by room ID
        this.games = new Map();

        // Current active game (for single player or focused multiplayer room)
        this.activeGame = null;

        // Utility functions that were previously global
        this.utilities = {
            showModal: this.showModal.bind(this),
            closeModal: this.closeModal.bind(this),
            setupGovernanceButton: this.setupGovernanceButton.bind(this),
            buildingPositionControls: null,
            resetCash: null
        };
    }

    /**
     * Create a new game instance for a room
     */
    createGame(roomId, canvas, options = {}) {
        if (this.games.has(roomId)) {
            console.warn(`Game already exists for room ${roomId}`);
            return this.games.get(roomId);
        }

        // Import IsometricGrid class
        const IsometricGrid = window.IsometricGrid || require('./game.js').IsometricGrid;

        const game = new IsometricGrid(canvas, options.gridSize || 12);
        game.roomId = roomId;

        // Store game instance
        this.games.set(roomId, game);

        // Set as active if it's the first game
        if (!this.activeGame) {
            this.setActiveGame(roomId);
        }

        return game;
    }

    /**
     * Get game instance by room ID
     */
    getGame(roomId) {
        return this.games.get(roomId);
    }

    /**
     * Set the active game (for UI focus)
     */
    setActiveGame(roomId) {
        const game = this.games.get(roomId);
        if (game) {
            this.activeGame = game;

            // Update utility function contexts
            if (game.economicClient) {
                this.utilities.resetCash = () => {
                    console.log('♻️ CASH RESET REQUESTED');
                    if (game.economicClient) {
                        game.economicClient.resetPlayerCash();
                    }
                };
            }

            // Update building position controls if they exist
            if (game.buildingPositionControls) {
                this.utilities.buildingPositionControls = game.buildingPositionControls;
            }

            return true;
        }
        return false;
    }

    /**
     * Destroy a game instance (when leaving a room)
     */
    destroyGame(roomId) {
        const game = this.games.get(roomId);
        if (game) {
            // Clean up event listeners
            if (game.renderingSystem && game.renderingSystem.destroy) {
                game.renderingSystem.destroy();
            }

            // Clean up WebSocket connections
            if (game.economicClient && game.economicClient.disconnect) {
                game.economicClient.disconnect();
            }

            // Remove from map
            this.games.delete(roomId);

            // Update active game if necessary
            if (this.activeGame === game) {
                this.activeGame = this.games.values().next().value || null;
            }

            console.log(`🗑️ Game instance for room ${roomId} destroyed`);
            return true;
        }
        return false;
    }

    /**
     * Get the active game instance
     */
    getActiveGame() {
        return this.activeGame;
    }

    /**
     * Clean up all game instances
     */
    destroyAll() {
        for (const [roomId, game] of this.games) {
            this.destroyGame(roomId);
        }
        this.activeGame = null;
    }

    /**
     * Modal management (previously global)
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('visible');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('visible');
        }
    }

    /**
     * Setup governance button (previously global)
     */
    setupGovernanceButton() {
        const governanceBtn = document.getElementById('governance-btn');
        if (governanceBtn) {
            governanceBtn.onclick = () => {
                // Use global openGovernanceModal from governance-v3.js
                if (typeof openGovernanceModal === 'function') {
                    openGovernanceModal();
                }
            };
        }
    }

    /**
     * Get stats for all games
     */
    getStats() {
        const stats = {
            totalGames: this.games.size,
            activeRoomId: this.activeGame ? this.activeGame.roomId : null,
            rooms: []
        };

        for (const [roomId, game] of this.games) {
            stats.rooms.push({
                roomId,
                players: game.players ? game.players.size : 1,
                gameTime: game.economicClient ? game.economicClient.gameTime : 0,
                isActive: game === this.activeGame
            });
        }

        return stats;
    }
}

// Create singleton instance
const gameManager = new GameManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = gameManager;
}

// Make available in browser (controlled exposure)
if (typeof window !== 'undefined') {
    // Instead of polluting window with functions, expose only the manager
    window.gameManager = gameManager;

    // Provide compatibility layer for legacy code
    window.showModal = gameManager.utilities.showModal;
    window.closeModal = gameManager.utilities.closeModal;
    window.setupGovernanceButton = gameManager.utilities.setupGovernanceButton;

    // Legacy game access (for migration period)
    Object.defineProperty(window, 'game', {
        get: function() {
            return gameManager.getActiveGame();
        },
        set: function(value) {
            console.warn('Direct window.game assignment is deprecated. Use gameManager.createGame()');
        }
    });
}