/**
 * Color utilities for The Commons
 */

window.ColorUtils = {
    /**
     * Get border color for a player's parcel
     */
    getPlayerBorderColor(owner, game) {
        if (!owner || !game) return '#333';

        // Player colors
        const playerColors = {
            'player': '#4CAF50',
            'competitor1': '#2196F3',
            'competitor2': '#FF9800',
            'competitor3': '#9C27B0',
            'competitor4': '#F44336',
            'competitor5': '#607D8B',
            'competitor6': '#795548'
        };

        return playerColors[owner] || '#666';
    },

    /**
     * Get color for building category
     */
    getBuildingColor(category) {
        const categoryColors = {
            'education': '#4CAF50',
            'healthcare': '#2196F3',
            'infrastructure': '#FF9800',
            'housing': '#9C27B0',
            'culture': '#E91E63',
            'recreation': '#4CAF50',
            'commercial': '#FF5722',
            'civic': '#607D8B',
            'emergency': '#F44336',
            'utilities': '#795548'
        };

        return categoryColors[category] || '#666';
    }
};