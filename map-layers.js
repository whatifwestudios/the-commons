/**
 * Map Layer System
 * Handles all layer-specific coloring and rendering logic
 * Separated from rendering-system.js for cleaner organization and extensibility
 */
class MapLayerSystem {
    constructor(game) {
        this.game = game;
        this.debugLogged = new Set(); // Track what we've logged to avoid spam
    }

    /**
     * Get tile color based on current layer
     * Main entry point called by rendering system
     */
    getTileColor(parcel, row, col, normalColor) {
        const currentLayer = this.game.currentLayer || 'normal';

        switch (currentLayer) {
            case 'ownership':
                return this.getOwnershipColor(parcel, row, col);
            case 'landvalue':
                return this.getLandValueColor(parcel, row, col);
            case 'normal':
            default:
                return normalColor; // Use the normal color provided by rendering system
        }
    }

    /**
     * OWNERSHIP LAYER
     * Show all parcels in owner colors (including built parcels)
     */
    getOwnershipColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a';

        // Show owner color for ALL parcels (empty or built)
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            return '#2a2a2a'; // Unowned - charcoal gray
        } else {
            return this.game.renderingSystem.getPlayerColor(parcel.owner);
        }
    }

    /**
     * LAND VALUE HEATMAP LAYER
     * Blue (cheap) → Red (expensive) based on price
     * Shows city pricing for unowned parcels, purchase price for owned parcels
     */
    getLandValueColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a';

        let price = 0;

        // Get price for this parcel
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            // Unowned parcels: use city pricing (from economicClient)
            price = this.game.economicClient?.getParcelPrice?.(row, col) || 0;

            // Debug logging (only log once)
            if (!this.debugLogged.has('landvalue-unowned')) {
                console.log(`🔍 Land Value - Unowned Parcel [${row},${col}]:`, {
                    hasEconomicClient: !!this.game.economicClient,
                    hasGetParcelPrice: !!this.game.economicClient?.getParcelPrice,
                    cityPrice: price,
                    parcel: parcel
                });
                this.debugLogged.add('landvalue-unowned');
            }
        } else {
            // Owned parcels: use price paid, fallback to current city price
            price = parcel.pricePaid || parcel.price || this.game.economicClient?.getParcelPrice?.(row, col) || 0;

            // Debug logging (only log once)
            if (!this.debugLogged.has('landvalue-owned')) {
                console.log(`🔍 Land Value - Owned Parcel [${row},${col}]:`, {
                    owner: parcel.owner,
                    pricePaid: parcel.pricePaid,
                    price: parcel.price,
                    cityPrice: this.game.economicClient?.getParcelPrice?.(row, col),
                    finalPrice: price,
                    allParcelProps: Object.keys(parcel)
                });
                this.debugLogged.add('landvalue-owned');
            }
        }

        if (price === 0) return '#2a2a2a'; // No price data

        // Calculate min/max prices across ALL parcels (owned and unowned) for dynamic scaling
        const range = this.calculateLandValueRange();

        // Debug log the range (only once)
        if (!this.debugLogged.has('landvalue-range')) {
            console.log(`🔍 Land Value Range:`, range);
            this.debugLogged.add('landvalue-range');
        }

        // Avoid division by zero
        if (range.max === range.min) return '#4CAF50'; // All same price - neutral green

        // Normalize price to 0-1 range
        const normalizedValue = (price - range.min) / (range.max - range.min);

        // Blue → Red gradient
        return this.getHeatmapColor(normalizedValue);
    }

    /**
     * Calculate min/max land values across entire grid
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
                    // Owned parcels: use price paid, fallback to current city price
                    parcelPrice = p.pricePaid || p.price || this.game.economicClient?.getParcelPrice?.(r, c) || 0;
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

    // ============================================================
    // GRADIENT COLOR GENERATORS
    // ============================================================

    /**
     * Generate heatmap color (simple blue → red gradient)
     */
    getHeatmapColor(value) {
        // value: 0.0 = blue (cheap), 1.0 = red (expensive)
        // Simple direct blue to red interpolation for subtle, professional look
        return this.interpolateColor('#4A90E2', '#E74C3C', value);
    }

    // ============================================================
    // COLOR UTILITIES
    // ============================================================

    /**
     * Interpolate between two hex colors
     */
    interpolateColor(color1, color2, t) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);

        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        return this.rgbToHex(r, g, b);
    }

    /**
     * Convert hex color to RGB object
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    /**
     * Convert RGB to hex color
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Clear debug log cache (useful when switching layers)
     */
    clearDebugCache() {
        this.debugLogged.clear();
    }
}
