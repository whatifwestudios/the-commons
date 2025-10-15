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
     * Show net revenue gradient: Red (max negative) → Gray (zero) → Blue (max positive)
     * Helps identify hostile takeover targets
     */
    getOwnershipColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a';

        // Unowned parcels - charcoal gray
        if (!parcel.owner || parcel.owner === 'City' || parcel.owner === 'unclaimed') {
            return '#2a2a2a';
        }

        // Owned parcels without buildings - show in dim owner color
        if (!parcel.building) {
            const playerColor = this.game.renderingSystem.getPlayerColor(parcel.owner);
            // Make it darker/dimmer to distinguish from buildings
            const rgb = this.hexToRgb(playerColor);
            const dimmed = this.rgbToHex(
                Math.floor(rgb.r * 0.3),
                Math.floor(rgb.g * 0.3),
                Math.floor(rgb.b * 0.3)
            );
            return dimmed;
        }

        // Owned parcels WITH buildings - show net revenue gradient
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);
        const netRevenue = serverState?.netCashflow || serverState?.cashflow || 0;

        // Calculate revenue range for dynamic scaling
        const range = this.calculateRevenueRange();

        // Debug logging (only once)
        if (!this.debugLogged.has('ownership-revenue')) {
            console.log(`🔍 Ownership Layer - Revenue Gradient:`, {
                parcel: `[${row},${col}]`,
                owner: parcel.owner,
                building: parcel.building,
                netRevenue: netRevenue,
                range: range,
                hasServerState: !!serverState,
                serverStateKeys: serverState ? Object.keys(serverState) : []
            });
            this.debugLogged.add('ownership-revenue');
        }

        // If no range data, show neutral gray
        if (range.max === 0 && range.min === 0) {
            return '#666666'; // Neutral gray for zero revenue
        }

        // Normalize revenue to -1 to +1 range
        let normalizedValue = 0;
        if (netRevenue < 0) {
            // Negative revenue: -1 (most negative) to 0
            normalizedValue = range.min < 0 ? netRevenue / Math.abs(range.min) : 0;
        } else if (netRevenue > 0) {
            // Positive revenue: 0 to +1 (most positive)
            normalizedValue = range.max > 0 ? netRevenue / range.max : 0;
        }

        // Generate gradient color: Red (negative) → Gray (zero) → Blue (positive)
        return this.getRevenueGradientColor(normalizedValue);
    }

    /**
     * Calculate min/max net revenue across all owned parcels with buildings
     */
    calculateRevenueRange() {
        let minRevenue = 0;
        let maxRevenue = 0;

        for (let r = 0; r < this.game.gridSize; r++) {
            for (let c = 0; c < this.game.gridSize; c++) {
                const p = this.game.grid[r][c];
                if (!p || !p.building || !p.owner || p.owner === 'City' || p.owner === 'unclaimed') {
                    continue;
                }

                const serverState = this.game.economicClient?.getBuildingState?.(r, c);
                const netRevenue = serverState?.netCashflow || serverState?.cashflow || 0;

                if (netRevenue < minRevenue) minRevenue = netRevenue;
                if (netRevenue > maxRevenue) maxRevenue = netRevenue;
            }
        }

        return { min: minRevenue, max: maxRevenue };
    }

    /**
     * Generate revenue gradient color
     * @param {number} value - Normalized value from -1 (most negative) to +1 (most positive)
     */
    getRevenueGradientColor(value) {
        if (value < 0) {
            // Negative: Gray (#666666) → Red (#E74C3C)
            const t = Math.abs(value); // 0 to 1
            return this.interpolateColor('#666666', '#E74C3C', t);
        } else if (value > 0) {
            // Positive: Gray (#666666) → Blue (#4A90E2)
            return this.interpolateColor('#666666', '#4A90E2', value);
        } else {
            // Zero revenue
            return '#666666';
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
