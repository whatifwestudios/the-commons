/**
 * Coordinate utilities for The Commons
 */

const CoordinateUtils = {
    /**
     * Convert grid coordinates to isometric screen coordinates
     * Note: Takes col, row order to match rendering system expectations
     */
    toIsometric(col, row, tileWidth = 64, tileHeight = 32, offsetX = 0, offsetY = 0) {
        const isoX = (col - row) * (tileWidth / 2);
        const isoY = (col + row) * (tileHeight / 2);
        return {
            x: isoX + offsetX,
            y: isoY + offsetY
        };
    },

    /**
     * Convert isometric screen coordinates to grid coordinates
     */
    fromIsometric(x, y, tileWidth = 64, tileHeight = 32, offsetX = 0, offsetY = 0, gridSize = 12) {
        // Remove offsets first
        const adjustedX = x - offsetX;
        const adjustedY = y - offsetY;

        const col = (adjustedX / (tileWidth / 2) + adjustedY / (tileHeight / 2)) / 2;
        const row = (adjustedY / (tileHeight / 2) - adjustedX / (tileWidth / 2)) / 2;

        // Round to nearest integers
        const roundedRow = Math.round(row);
        const roundedCol = Math.round(col);

        // Return null if coordinates are outside grid bounds
        if (roundedRow < 0 || roundedRow >= gridSize || roundedCol < 0 || roundedCol >= gridSize) {
            return null;
        }

        return { row: roundedRow, col: roundedCol };
    },

    /**
     * Helper method for rendering system - gets default offsets from game state
     */
    toIsometricWithGameOffsets(game, col, row, tileWidth = 64, tileHeight = 32) {
        const offsetX = game.offsetX || (game.renderingSystem?.canvas?.width / 2) || 0;
        const offsetY = game.offsetY || (game.renderingSystem?.canvas?.height / 2 - 200) || 0;
        return this.toIsometric(col, row, tileWidth, tileHeight, offsetX, offsetY);
    },

    /**
     * Helper method for rendering system - gets default offsets from game state
     */
    fromIsometricWithGameOffsets(game, x, y, tileWidth = 64, tileHeight = 32) {
        const offsetX = game.offsetX || 0;
        const offsetY = game.offsetY || 0;
        return this.fromIsometric(x, y, tileWidth, tileHeight, offsetX, offsetY, game.gridSize);
    }
};

/**
 * Grid iteration utilities to eliminate duplicate loops
 */
const GridUtils = {
    /**
     * Iterate over all grid positions
     * @param {number} gridSize - Size of the grid
     * @param {Function} callback - Function to call for each position (row, col)
     */
    forEachPosition(gridSize, callback) {
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                callback(row, col);
            }
        }
    },

    /**
     * Iterate over all parcels in a grid
     * @param {Array} grid - 2D grid array
     * @param {Function} callback - Function to call for each parcel (parcel, row, col)
     */
    forEachParcel(grid, callback) {
        if (!grid || !grid.length) return;
        for (let row = 0; row < grid.length; row++) {
            if (!grid[row]) continue;
            for (let col = 0; col < grid[row].length; col++) {
                const parcel = grid[row][col];
                if (parcel) {
                    callback(parcel, row, col);
                }
            }
        }
    },

    /**
     * Iterate over positions in a radius around a center point
     * @param {number} centerRow - Center row position
     * @param {number} centerCol - Center col position
     * @param {number} radius - Radius to search
     * @param {number} gridSize - Size of the grid for bounds checking
     * @param {Function} callback - Function to call for each position (row, col, distance)
     */
    forEachInRadius(centerRow, centerCol, radius, gridSize, callback) {
        for (let r = centerRow - radius; r <= centerRow + radius; r++) {
            for (let c = centerCol - radius; c <= centerCol + radius; c++) {
                if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
                    const distance = Math.sqrt((r - centerRow) ** 2 + (c - centerCol) ** 2);
                    if (distance <= radius) {
                        callback(r, c, distance);
                    }
                }
            }
        }
    },

    /**
     * Find all parcels matching a condition
     * @param {Array} grid - 2D grid array
     * @param {Function} predicate - Function to test each parcel (parcel, row, col) => boolean
     * @returns {Array} Array of {parcel, row, col} objects that match
     */
    findParcels(grid, predicate) {
        const results = [];
        this.forEachParcel(grid, (parcel, row, col) => {
            if (predicate(parcel, row, col)) {
                results.push({ parcel, row, col });
            }
        });
        return results;
    },

    /**
     * Count parcels matching a condition
     * @param {Array} grid - 2D grid array
     * @param {Function} predicate - Function to test each parcel (parcel, row, col) => boolean
     * @returns {number} Count of matching parcels
     */
    countParcels(grid, predicate) {
        let count = 0;
        this.forEachParcel(grid, (parcel, row, col) => {
            if (predicate(parcel, row, col)) {
                count++;
            }
        });
        return count;
    },

    /**
     * Get all adjacent positions (8-directional)
     * @param {number} row - Center row
     * @param {number} col - Center col
     * @param {number} gridSize - Size of the grid for bounds checking
     * @returns {Array} Array of {row, col} positions
     */
    getAdjacentPositions(row, col, gridSize) {
        const positions = [];
        const offsets = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1],           [0, 1],
            [1, -1],  [1, 0],  [1, 1]
        ];

        for (const [dRow, dCol] of offsets) {
            const newRow = row + dRow;
            const newCol = col + dCol;
            if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
                positions.push({ row: newRow, col: newCol });
            }
        }
        return positions;
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CoordinateUtils, GridUtils };
}

// Controlled exposure in browser for backward compatibility
if (typeof window !== 'undefined') {
    window.CoordinateUtils = CoordinateUtils;
    window.GridUtils = GridUtils;
}