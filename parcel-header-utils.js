/**
 * Parcel Header Utilities
 * Shared utilities for creating standardized parcel headers across tooltip and context menu systems
 * Extracted from tooltip-system.js for better code organization
 */

class ParcelHeaderUtils {
    /**
     * Create ownership badge for parcel header
     */
    static createOwnershipBadge(game, parcel, isHovering = false) {
        const owner = parcel?.owner;

        // City/unclaimed parcels show dark gray badge when not hovering/clicking
        if (!owner || owner === 'City' || owner === 'unclaimed') {
            if (!isHovering) {
                return `<span class="ownership-badge city">CITY</span>`;
            }
            // When hovering/clicking, show as available for purchase
            return null;
        }

        const isCurrentPlayer = game.isCurrentPlayer(owner);

        if (isHovering) {
            // When hovering/clicking, use owner's actual color with contrast
            const playerColor = this.getPlayerColor(game, owner);
            const contrastColor = this.getContrastingColor(playerColor);
            const displayText = isCurrentPlayer ? 'Owned by you' : `Owned by ${this.getPlayerName(game, owner)}`;

            return `<span class="ownership-badge player" style="background: ${playerColor}; color: ${contrastColor};">${displayText}</span>`;
        } else {
            // Default state: use owner's actual color for non-hovering state too
            const playerColor = this.getPlayerColor(game, owner);
            const contrastColor = this.getContrastingColor(playerColor);
            const playerName = isCurrentPlayer ? 'YOU' : this.getPlayerName(game, owner).toUpperCase();
            return `<span class="ownership-badge player" style="background: ${playerColor}; color: ${contrastColor};">${playerName}</span>`;
        }
    }

    /**
     * Create standardized parcel header with coordinate and ownership
     */
    static createStandardHeader(game, coord, data, isHovering = false, includeOwnership = true) {
        let ownershipHtml = '';

        if (includeOwnership && data.parcel) {
            const ownershipBadge = this.createOwnershipBadge(game, data.parcel, isHovering);
            if (ownershipBadge) {
                ownershipHtml = ownershipBadge;
            }
        }

        return `
            <div class="tooltip-header">
                <span class="tooltip-coord">${coord}</span>
                ${ownershipHtml}
            </div>
        `;
    }

    /**
     * Get player color from game state
     */
    static getPlayerColor(game, playerId) {
        // Try to get from connected players first
        if (game.connectedPlayers) {
            const player = game.connectedPlayers.find(p => p.id === playerId);
            if (player?.color) return player.color;
        }

        // Fallback to player settings if it's current player
        if (game.isCurrentPlayer(playerId)) {
            return game.playerSettings?.color || '#10AC84';
        }

        // Last resort: default color
        return '#10AC84';
    }

    /**
     * Get player name from game state
     */
    static getPlayerName(game, playerId) {
        // Try to get from connected players first
        if (game.connectedPlayers) {
            const player = game.connectedPlayers.find(p => p.id === playerId);
            if (player?.name) return player.name;
        }

        // Fallback to player settings if it's current player
        if (game.isCurrentPlayer(playerId)) {
            return game.playerSettings?.name || 'You';
        }

        // Last resort: show player ID
        return playerId || 'Unknown';
    }

    /**
     * Calculate contrasting color for text on colored background
     */
    static getContrastingColor(hexColor) {
        // Remove # if present
        const hex = hexColor.replace('#', '');

        // Convert to RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);

        // Calculate luminance (perceived brightness)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return black or white based on luminance
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }
}

// Make globally available for compatibility
if (typeof window !== 'undefined') {
    window.ParcelHeaderUtils = ParcelHeaderUtils;
}
