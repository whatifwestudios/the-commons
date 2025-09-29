/**
 * Color utilities for The Commons
 */

const ColorUtils = {
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

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColorUtils;
}

// Controlled exposure in browser for backward compatibility
if (typeof window !== 'undefined') {
    window.ColorUtils = ColorUtils;
}