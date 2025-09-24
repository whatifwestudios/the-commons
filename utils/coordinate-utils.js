/**
 * Coordinate utilities for The Commons
 */

window.CoordinateUtils = {
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
    fromIsometric(x, y, tileWidth = 64, tileHeight = 32, offsetX = 0, offsetY = 0, gridSize = 14) {
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
    }
};