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
            case 'civic':
                return this.getCivicImpactColor(parcel, row, col);
            case 'needs':
                return this.getNeedsColor(parcel, row, col);
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

        // Blue → Cyan → Green → Yellow → Orange → Red gradient
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

    /**
     * CIVIC IMPACT LAYER
     * Red (negative civic) → Gray (neutral) → Green (positive civic)
     */
    getCivicImpactColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a';

        // Only show colors for parcels with buildings
        if (!parcel.building) return '#2a2a2a';

        // Get building civic score from server state
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);
        const civicScore = serverState?.civic || 0;

        // Debug logging (only log once per building type)
        const debugKey = `civic-${parcel.building.type || parcel.building.id}`;
        if (!this.debugLogged.has(debugKey)) {
            console.log(`🔍 Civic Impact [${row},${col}]:`, {
                buildingType: parcel.building.type || parcel.building.id,
                hasEconomicClient: !!this.game.economicClient,
                hasBuildingState: !!serverState,
                civicScore: civicScore,
                serverState: serverState
            });
            this.debugLogged.add(debugKey);
        }

        // Normalize civic score from -5 to +5 range to 0-1
        // -5 = 0.0 (red), 0 = 0.5 (gray), +5 = 1.0 (green)
        const normalizedValue = (civicScore + 5) / 10;
        const clampedValue = Math.max(0, Math.min(1, normalizedValue));

        // Red → Gray → Green gradient
        return this.getCivicGradientColor(clampedValue);
    }

    /**
     * NEEDS LAYER
     * Green (satisfied) → Yellow → Orange → Red (critical needs)
     * Based on CARENS system satisfaction levels
     */
    getNeedsColor(parcel, row, col) {
        if (!parcel) return '#2a2a2a';

        // Only show colors for parcels with buildings
        if (!parcel.building) return '#2a2a2a';

        // Get building needs from CARENS system via server state
        const serverState = this.game.economicClient?.getBuildingState?.(row, col);

        // Debug logging (only log once per building type)
        const debugKey = `needs-${parcel.building.type || parcel.building.id}`;
        if (!this.debugLogged.has(debugKey)) {
            console.log(`🔍 Needs Map [${row},${col}]:`, {
                buildingType: parcel.building.type || parcel.building.id,
                hasEconomicClient: !!this.game.economicClient,
                hasBuildingState: !!serverState,
                needs: serverState?.needs,
                serverState: serverState
            });
            this.debugLogged.add(debugKey);
        }

        // Calculate overall neediness (0 = all satisfied, 1 = critical needs)
        // CARENS provides satisfaction levels: 0 = no need met, 1 = fully met
        let totalNeediness = 0;
        let needCount = 0;

        if (serverState?.needs) {
            // Average the inverse of satisfaction (1 - satisfaction = neediness)
            const needs = serverState.needs;
            const needTypes = ['food', 'water', 'energy', 'health', 'education'];

            needTypes.forEach(type => {
                if (needs[type] !== undefined) {
                    const satisfaction = needs[type];
                    const neediness = 1 - satisfaction;
                    totalNeediness += neediness;
                    needCount++;
                }
            });
        }

        if (needCount === 0) return '#2a2a2a'; // No needs data

        const avgNeediness = totalNeediness / needCount;

        // Green → Yellow → Orange → Red gradient
        return this.getNeedsGradientColor(avgNeediness);
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

    /**
     * Generate civic gradient color (red → gray → green)
     */
    getCivicGradientColor(value) {
        // value: 0.0 = red (negative), 0.5 = gray (neutral), 1.0 = green (positive)
        if (value < 0.5) {
            // Red → Gray
            const t = value / 0.5;
            return this.interpolateColor('#E74C3C', '#666666', t);
        } else {
            // Gray → Green
            const t = (value - 0.5) / 0.5;
            return this.interpolateColor('#666666', '#2ECC71', t);
        }
    }

    /**
     * Generate needs gradient color (green → yellow → orange → red)
     */
    getNeedsGradientColor(neediness) {
        // neediness: 0.0 = green (satisfied), 1.0 = red (critical)
        if (neediness < 0.33) {
            // Green → Yellow
            const t = neediness / 0.33;
            return this.interpolateColor('#2ECC71', '#F1C40F', t);
        } else if (neediness < 0.66) {
            // Yellow → Orange
            const t = (neediness - 0.33) / 0.33;
            return this.interpolateColor('#F1C40F', '#E67E22', t);
        } else {
            // Orange → Red
            const t = (neediness - 0.66) / 0.34;
            return this.interpolateColor('#E67E22', '#E74C3C', t);
        }
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
