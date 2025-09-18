/**
 * Tooltip Renderer - Clean, consistent HTML generation for tooltips
 * Takes structured data and produces clean, performant HTML
 */

class TooltipRenderer {
    
    /**
     * Render building tooltip with new clean format
     * Format: Name, owned by [Player Name] -> Building/Land Values -> Performance -> Adds up to -> Needs
     */
    renderBuildingTooltip(data) {
        let html = '';
        
        // Building name and owner on same line
        html += `<strong>${data.name}</strong>, owned by ${data.owner.name}<br><br>`;
        
        // Building value and land value
        if (data.buildingValue !== undefined || data.landValue !== undefined) {
            if (data.buildingValue !== undefined) {
                html += `Building Value: $${data.buildingValue.toLocaleString()}<br>`;
            }
            if (data.landValue !== undefined) {
                html += `Land Value: $${data.landValue.toLocaleString()}<br><br>`;
            }
        }
        
        // Performance: XX%
        if (data.performance.isUnderConstruction) {
            html += `<strong>Performance:</strong> Under Construction (${data.performance.progressPercent}%)<br><br>`;
        } else {
            html += `<strong>Performance:</strong> ${data.performance.performancePercent}%<br><br>`;
        }
        
        // Adds up to: (only show if has production)
        if (data.production.length > 0) {
            html += `<strong>Adds up to:</strong><br>`;
            data.production.forEach(item => {
                html += `• ${item.emoji} ${item.amount} ${item.type}<br>`;
            });
            html += `<br>`;
        }
        
        // Needs: (only show if has needs)
        if (data.needs.length > 0) {
            html += `<strong>Needs:</strong><br>`;
            data.needs.forEach(item => {
                html += `• ${item.emoji} ${item.amount} ${item.type}<br>`;
            });
        }
        
        return html;
    }

    /**
     * Render empty parcel tooltip (for future expansion)
     */
    renderEmptyParcelTooltip(data) {
        // TODO: Implement clean empty parcel tooltip
        return '';
    }

    /**
     * Render error tooltip
     */
    renderErrorTooltip(error) {
        return `<strong>Error:</strong> ${error}`;
    }
}

// Export for use in main game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TooltipRenderer;
} else {
    window.TooltipRenderer = TooltipRenderer;
}