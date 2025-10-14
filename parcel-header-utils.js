/**
 * Parcel Header Utilities
 * Shared utilities for creating standardized parcel headers across tooltip and context menu systems
 * Extracted from tooltip-system.js for better code organization
 */

class ParcelHeaderUtils {
    /**
     * Create ownership badge for parcel header
     * UNIFIED: Identical presentation for tooltip and context menu
     */
    static createOwnershipBadge(game, parcel) {
        const owner = parcel?.owner;

        // City/unclaimed parcels - medium gray badge
        if (!owner || owner === 'City' || owner === 'unclaimed') {
            return `<span class="ownership-badge city">CITY</span>`;
        }

        // Player-owned parcels - show just player name in player color
        const isCurrentPlayer = game.isCurrentPlayer(owner);
        const playerColor = this.getPlayerColor(game, owner);
        const contrastColor = this.getContrastingColor(playerColor);
        const playerName = isCurrentPlayer ? 'YOU' : this.getPlayerName(game, owner).toUpperCase();

        return `<span class="ownership-badge player" style="background: ${playerColor}; color: ${contrastColor};">${playerName}</span>`;
    }

    /**
     * Create standardized parcel header with coordinate and ownership
     * UNIFIED: Identical for both tooltip and context menu
     * Format: [Parcel ID]........................[Owner Badge]
     */
    static createStandardHeader(game, coord, data) {
        const parcel = data.parcel || data;
        const ownershipBadge = this.createOwnershipBadge(game, parcel);

        return `
            <div class="unified-header">
                <span class="header-coord">${coord}</span>
                ${ownershipBadge}
            </div>
        `;
    }

    /**
     * Get player color from game state
     */
    static getPlayerColor(game, playerId) {
        // Use global PlayerUtils if available
        if (window.PlayerUtils) {
            return window.PlayerUtils.getPlayerColor(playerId);
        }

        // Fallback: Try to get from economicClient game state
        if (game?.economicClient?.gameState?.players) {
            let player = null;
            if (game.economicClient.gameState.players instanceof Map) {
                player = game.economicClient.gameState.players.get(playerId);
            } else {
                player = game.economicClient.gameState.players[playerId];
            }
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
        // Use global PlayerUtils if available
        if (window.PlayerUtils) {
            return window.PlayerUtils.getPlayerName(playerId);
        }

        // Fallback: Try to get from economicClient game state
        if (game?.economicClient?.gameState?.players) {
            let player = null;
            if (game.economicClient.gameState.players instanceof Map) {
                player = game.economicClient.gameState.players.get(playerId);
            } else {
                player = game.economicClient.gameState.players[playerId];
            }
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
