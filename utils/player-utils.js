/**
 * Player utilities for The Commons
 */

window.PlayerUtils = {
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

        return playerNames[playerId] || 'Unknown Player';
    },

    /**
     * Check if player is current player
     */
    isCurrentPlayer(playerId) {
        return playerId === 'player';
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