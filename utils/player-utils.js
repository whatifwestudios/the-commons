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
        const playerNames = {
            'player': 'You',
            'competitor1': 'Blue Corp',
            'competitor2': 'Orange Inc',
            'competitor3': 'Purple Ltd',
            'competitor4': 'Red Industries',
            'competitor5': 'Gray Holdings',
            'competitor6': 'Brown Enterprises'
        };

        // If it's the current player, always show "You"
        if (this.isCurrentPlayer(playerId)) {
            return 'You';
        }

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