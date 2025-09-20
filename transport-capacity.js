/**
 * Transport Network Capacity Modeling
 * Tracks and manages capacity constraints on the transport network
 */

class TransportCapacitySystem {
    constructor(game) {
        this.game = game;

        // Capacity factors by road type and enhancements
        this.capacityFactors = {
            roadType: {
                street: 100,    // Base capacity units per edge
                avenue: 200,    // 2x street capacity
                highway: 500    // 5x street capacity
            },
            enhancements: {
                sidewalk: 1.2,  // +20% capacity for pedestrians
                bikeLane: 1.3,  // +30% capacity for bikes
                busLane: 1.5,   // +50% capacity for buses
                transitStop: 2.0 // +100% capacity at transit stops
            }
        };

        // Track current usage on each road segment
        this.segmentUsage = new Map(); // Key: "row1,col1->row2,col2", Value: usage data

        // Track flow patterns for commute simulation
        this.flowPatterns = new Map(); // Key: origin->destination, Value: flow volume
    }

    /**
     * Calculate total capacity of a road segment including enhancements
     */
    getSegmentCapacity(row, col, edge) {
        const roadKey = `${row},${col},${edge}`;
        const road = this.game.transportationSystem?.roads.get(roadKey);

        if (!road) return 0;

        // Base capacity from road type
        let capacity = this.capacityFactors.roadType[road.type] || 100;

        // Apply enhancement multipliers
        if (road.hasSidewalk) capacity *= this.capacityFactors.enhancements.sidewalk;
        if (road.hasBikeLane) capacity *= this.capacityFactors.enhancements.bikeLane;
        if (road.hasBusLane) capacity *= this.capacityFactors.enhancements.busLane;

        // Check for nearby transit stops
        if (this.hasNearbyTransitStop(row, col)) {
            capacity *= this.capacityFactors.enhancements.transitStop;
        }

        return Math.floor(capacity);
    }

    /**
     * Check if a parcel has a nearby transit stop
     */
    hasNearbyTransitStop(row, col) {
        // Check 3x3 area around the parcel for transit stops
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const checkRow = row + dr;
                const checkCol = col + dc;

                if (checkRow >= 0 && checkRow < this.game.gridSize &&
                    checkCol >= 0 && checkCol < this.game.gridSize) {
                    const parcel = this.game.grid[checkRow][checkCol];
                    if (parcel?.building) {
                        const building = this.game.buildingManager?.getBuildingById(parcel.building);
                        if (building?.category === 'transportation' &&
                            (building.name?.includes('Bus Stop') || building.name?.includes('Subway'))) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * Calculate usage on a path between two points
     */
    calculatePathUsage(fromRow, fromCol, toRow, toCol, volume = 1) {
        const pathKey = `${fromRow},${fromCol}->${toRow},${toCol}`;

        // Simple pathfinding - for now just use Manhattan distance
        // In future, use actual pathfinding through road network
        const segments = this.getPathSegments(fromRow, fromCol, toRow, toCol);

        segments.forEach(segment => {
            const currentUsage = this.segmentUsage.get(segment.key) || {
                volume: 0,
                trips: 0
            };

            currentUsage.volume += volume;
            currentUsage.trips += 1;

            this.segmentUsage.set(segment.key, currentUsage);
        });

        // Track flow pattern
        const currentFlow = this.flowPatterns.get(pathKey) || 0;
        this.flowPatterns.set(pathKey, currentFlow + volume);
    }

    /**
     * Get path segments between two points (simplified for now)
     */
    getPathSegments(fromRow, fromCol, toRow, toCol) {
        const segments = [];

        // Horizontal movement
        if (fromCol !== toCol) {
            const direction = fromCol < toCol ? 1 : -1;
            for (let col = fromCol; col !== toCol; col += direction) {
                segments.push({
                    key: `${fromRow},${col}->horizontal`,
                    row: fromRow,
                    col: col,
                    edge: 'horizontal'
                });
            }
        }

        // Vertical movement
        if (fromRow !== toRow) {
            const direction = fromRow < toRow ? 1 : -1;
            for (let row = fromRow; row !== toRow; row += direction) {
                segments.push({
                    key: `${row},${toCol}->vertical`,
                    row: row,
                    col: toCol,
                    edge: 'vertical'
                });
            }
        }

        return segments;
    }

    /**
     * Calculate congestion factor for a segment (0-1, where 1 is no congestion)
     */
    getSegmentCongestion(row, col, edge) {
        const capacity = this.getSegmentCapacity(row, col, edge);
        if (capacity === 0) return 0; // No road = no movement

        const segmentKey = `${row},${col}->horizontal`;
        const usage = this.segmentUsage.get(segmentKey) || { volume: 0 };

        // Calculate congestion based on volume/capacity ratio
        const utilizationRatio = usage.volume / capacity;

        if (utilizationRatio <= 0.5) {
            return 1.0; // Free flow
        } else if (utilizationRatio <= 0.8) {
            return 0.9; // Light congestion
        } else if (utilizationRatio <= 1.0) {
            return 0.7; // Moderate congestion
        } else if (utilizationRatio <= 1.5) {
            return 0.5; // Heavy congestion
        } else {
            return 0.3; // Severe congestion
        }
    }

    /**
     * Reset usage tracking (call at start of each simulation cycle)
     */
    resetUsage() {
        this.segmentUsage.clear();
        this.flowPatterns.clear();
    }

    /**
     * Get capacity-adjusted efficiency for resource transport
     */
    getTransportEfficiency(fromRow, fromCol, toRow, toCol) {
        const segments = this.getPathSegments(fromRow, fromCol, toRow, toCol);

        if (segments.length === 0) return 1.0; // Adjacent parcels

        let totalEfficiency = 1.0;

        // Apply congestion penalty for each segment
        segments.forEach(segment => {
            const congestion = this.getSegmentCongestion(segment.row, segment.col, segment.edge);
            totalEfficiency *= congestion;
        });

        // Apply distance penalty
        const distance = Math.abs(toRow - fromRow) + Math.abs(toCol - fromCol);
        const distancePenalty = Math.max(0.5, 1.0 - distance * 0.05);

        return totalEfficiency * distancePenalty;
    }

    /**
     * Simulate commute patterns (1% population sample)
     */
    simulateCommutes() {

        const population = this.game.calculatePopulation();
        const sampleSize = Math.max(1, Math.floor(population * 0.01));

        // Reset previous usage
        this.resetUsage();

        // Collect all residential and destination buildings
        const residences = [];
        const workplaces = [];
        const commerces = [];
        const recreations = [];

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel?.building) continue;

                // Skip buildings under construction
                if (parcel._isUnderConstruction) continue;

                const building = this.game.buildingManager?.getBuildingById(parcel.building);
                if (!building) continue;

                const category = this.game.buildingCategories?.normalize(building.category);

                if (category === 'housing') {
                    residences.push({ row, col, building });
                } else if (category === 'commercial' || category === 'education') {
                    workplaces.push({ row, col, building });
                } else if (category === 'retail' || building.name?.includes('Market')) {
                    commerces.push({ row, col, building });
                } else if (category === 'culture' || category === 'recreation') {
                    recreations.push({ row, col, building });
                }
            }
        }

        // Simulate sample commutes with weighted destinations
        for (let i = 0; i < sampleSize; i++) {
            if (residences.length === 0) break;

            const home = residences[Math.floor(Math.random() * residences.length)];

            // 60% work trips
            if (Math.random() < 0.6 && workplaces.length > 0) {
                const work = workplaces[Math.floor(Math.random() * workplaces.length)];
                this.calculatePathUsage(home.row, home.col, work.row, work.col);
            }
            // 30% commerce trips
            else if (Math.random() < 0.9 && commerces.length > 0) {
                const shop = commerces[Math.floor(Math.random() * commerces.length)];
                this.calculatePathUsage(home.row, home.col, shop.row, shop.col);
            }
            // 10% recreation trips
            else if (recreations.length > 0) {
                const rec = recreations[Math.floor(Math.random() * recreations.length)];
                this.calculatePathUsage(home.row, home.col, rec.row, rec.col);
            }
        }

        // Calculate average congestion
        let totalCongestion = 0;
        let segmentCount = 0;

        this.segmentUsage.forEach((usage, key) => {
            const [coords, edge] = key.split('->');
            const [row, col] = coords.split(',').map(Number);
            const congestion = this.getSegmentCongestion(row, col, edge || 'horizontal');
            totalCongestion += congestion;
            segmentCount++;
        });

        const avgCongestion = segmentCount > 0 ? totalCongestion / segmentCount : 1.0;
        const congestionLevel = avgCongestion > 0.9 ? 'Free Flow' :
                                avgCongestion > 0.7 ? 'Light' :
                                avgCongestion > 0.5 ? 'Moderate' :
                                avgCongestion > 0.3 ? 'Heavy' : 'Severe';


        return {
            sampleSize,
            avgCongestion,
            congestionLevel,
            segmentsUsed: this.segmentUsage.size,
            totalTrips: sampleSize
        };
    }

    /**
     * Get transport network statistics
     */
    getNetworkStats() {
        let totalCapacity = 0;
        let totalUsage = 0;
        let roadCount = 0;

        // Calculate total capacity
        if (this.game.transportationSystem?.roads) {
            this.game.transportationSystem.roads.forEach((road, key) => {
                const [row, col, edge] = key.split(',');
                const capacity = this.getSegmentCapacity(parseInt(row), parseInt(col), edge);
                totalCapacity += capacity;
                roadCount++;
            });
        }

        // Calculate total usage
        this.segmentUsage.forEach(usage => {
            totalUsage += usage.volume;
        });

        const utilizationRate = totalCapacity > 0 ? (totalUsage / totalCapacity) : 0;

        return {
            totalCapacity,
            totalUsage,
            utilizationRate,
            roadCount,
            flowPatterns: this.flowPatterns.size
        };
    }
}

// Export for use in main game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransportCapacitySystem;
} else {
    window.TransportCapacitySystem = TransportCapacitySystem;
}