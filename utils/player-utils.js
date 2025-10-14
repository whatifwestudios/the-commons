/**
 * Player utilities for The Commons
 */

const PlayerUtils = {
    /**
     * Get current player ID - UNIFIED SYSTEM (server-authoritative)
     * Priority: 1) game.currentPlayerId (server-assigned) 2) session 3) localStorage
     */
    getCurrentPlayerId() {
        // PRIORITY 1: Try to get from session/auth if available
        if (window.currentUser && window.currentUser.id) {
            return window.currentUser.id;
        }

        // PRIORITY 2: Use server-assigned player ID from game instance (for fresh sessions)
        if (window.game && window.game.currentPlayerId) {
            return window.game.currentPlayerId;
        }

        // PRIORITY 3: Generate or retrieve anonymous session ID for guests (fallback only)
        if (!localStorage.getItem('anonymousPlayerId')) {
            const anonymousId = 'guest_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('anonymousPlayerId', anonymousId);
        }

        return localStorage.getItem('anonymousPlayerId');
    },

    /**
     * Get player display name
     */
    getPlayerName(playerId) {
        // If it's the current player, always show "You"
        if (this.isCurrentPlayer(playerId)) {
            return 'You';
        }

        // Try to get player name from game state (server-authoritative)
        if (window.game?.economicClient?.gameState?.players) {
            let player = null;

            // Handle both Map and Object structures for compatibility
            if (window.game.economicClient.gameState.players instanceof Map) {
                player = window.game.economicClient.gameState.players.get(playerId);
            } else {
                player = window.game.economicClient.gameState.players[playerId];
            }

            if (player && player.name) {
                return player.name;
            }
        }

        // Fallback for legacy/static player IDs
        const playerNames = {
            'player': 'You',
            'competitor1': 'Blue Corp',
            'competitor2': 'Orange Inc',
            'competitor3': 'Purple Ltd',
            'competitor4': 'Red Industries',
            'competitor5': 'Gray Holdings',
            'competitor6': 'Brown Enterprises'
        };

        // Handle anonymous guest players
        if (playerId && playerId.startsWith('guest_')) {
            return 'Guest Player';
        }

        // Handle server-assigned dynamic player IDs (e.g., "player_5yxmn3g1o")
        if (playerId && playerId.startsWith('player_')) {
            // Extract the unique part of the ID for a friendlier name
            const uniquePart = playerId.substring(7); // Remove "player_" prefix
            return `Player ${uniquePart.substring(0, 4).toUpperCase()}`;
        }

        return playerNames[playerId] || 'Unknown Player';
    },

    /**
     * Check if player is current player (now supports dynamic player IDs)
     */
    isCurrentPlayer(playerId) {
        return playerId === this.getCurrentPlayerId();
    },

    /**
     * Get player color
     */
    getPlayerColor(playerId) {
        // Try to get player color from game state (server-authoritative)
        if (window.game?.economicClient?.gameState?.players) {
            let player = null;

            // Handle both Map and Object structures for compatibility
            if (window.game.economicClient.gameState.players instanceof Map) {
                player = window.game.economicClient.gameState.players.get(playerId);
            } else {
                player = window.game.economicClient.gameState.players[playerId];
            }

            if (player && player.color) {
                return player.color;
            }
        }

        // Fallback colors for legacy/static player IDs
        const playerColors = {
            'player': '#4CAF50',
            'competitor1': '#2196F3',
            'competitor2': '#FF9800',
            'competitor3': '#9C27B0',
            'competitor4': '#F44336',
            'competitor5': '#757575',
            'competitor6': '#795548'
        };

        return playerColors[playerId] || '#888888';
    },

    /**
     * Get player emoji/icon
     */
    getPlayerIcon(playerId) {
        const playerIcons = {
            'player': '🏠',
            'competitor1': '🏢',
            'competitor2': '🏭',
            'competitor3': '🏬',
            'competitor4': '🏛️',
            'competitor5': '🏰',
            'competitor6': '🗼'
        };

        return playerIcons[playerId] || '🏘️';
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayerUtils;
}

// Controlled exposure in browser for backward compatibility
if (typeof window !== 'undefined') {
    window.PlayerUtils = PlayerUtils;
}