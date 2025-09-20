/**
 * Transportation System for The Commons
 * Handles roads, routes, and transportation infrastructure
 */

class TransportationSystem {
    constructor(game) {
        this.game = game;
        
        // Road network
        this.roads = new Map(); // Key: "row,col,edge" Value: road object
        this.routes = []; // Public transit routes
        
        // Road types and their properties
        this.roadTypes = {
            street: {
                name: 'Street',
                cost: 50,
                maintenance: 1,
                capacity: 100,
                speed: 30
            },
            avenue: {
                name: 'Avenue', 
                cost: 100,
                maintenance: 2,
                capacity: 200,
                speed: 40
            },
            highway: {
                name: 'Highway',
                cost: 200,
                maintenance: 5,
                capacity: 500,
                speed: 60
            }
        };
        
        // Transportation modes
        this.modes = {
            walking: { speed: 3, capacity: 1 },
            bike: { speed: 10, capacity: 1 },
            car: { speed: 30, capacity: 4 },
            bus: { speed: 20, capacity: 40 },
            rail: { speed: 40, capacity: 200 }
        };
        
        // Initialize edge roads storage
        this.edgeRoads = {
            horizontal: {}, // Key: "row,col" 
            vertical: {},   // Key: "row,col"
            intersections: {} // Key: "row,col"
        };
    }
    
    /**
     * Add a road segment to the network
     */
    addRoad(row, col, edge, type = 'street') {
        const key = `${row},${col},${edge}`;
        
        if (this.roads.has(key)) {
            console.log('Road already exists at', key);
            return false;
        }
        
        const roadType = this.roadTypes[type] || this.roadTypes.street;
        
        const road = {
            row,
            col,
            edge,
            type,
            ...roadType,
            built: Date.now(),
            condition: 1.0,
            traffic: 0
        };
        
        this.roads.set(key, road);
        
        // Update edge roads for quick lookup
        if (edge === 'horizontal') {
            this.edgeRoads.horizontal[`${row},${col}`] = road;
        } else if (edge === 'vertical') {
            this.edgeRoads.vertical[`${row},${col}`] = road;
        }
        
        return true;
    }
    
    /**
     * Remove a road segment
     */
    removeRoad(row, col, edge) {
        const key = `${row},${col},${edge}`;
        
        if (!this.roads.has(key)) {
            return false;
        }
        
        this.roads.delete(key);
        
        // Remove from edge roads
        if (edge === 'horizontal') {
            delete this.edgeRoads.horizontal[`${row},${col}`];
        } else if (edge === 'vertical') {
            delete this.edgeRoads.vertical[`${row},${col}`];
        }
        
        return true;
    }
    
    /**
     * Check if a road exists at a specific edge
     */
    hasRoad(row, col, edge) {
        const key = `${row},${col},${edge}`;
        return this.roads.has(key);
    }
    
    /**
     * Get road at specific edge
     */
    getRoad(row, col, edge) {
        const key = `${row},${col},${edge}`;
        return this.roads.get(key);
    }
    
    /**
     * Check if a parcel has road access
     */
    hasRoadAccess(row, col) {
        // Check all four edges
        const edges = [
            { r: row, c: col, e: 'horizontal' },     // Top
            { r: row + 1, c: col, e: 'horizontal' }, // Bottom
            { r: row, c: col, e: 'vertical' },       // Left
            { r: row, c: col + 1, e: 'vertical' }    // Right
        ];
        
        return edges.some(({ r, c, e }) => this.hasRoad(r, c, e));
    }
    
    /**
     * Get all roads adjacent to a parcel
     */
    getAdjacentRoads(row, col) {
        const roads = [];
        
        // Check all four edges
        const edges = [
            { r: row, c: col, e: 'horizontal', side: 'top' },
            { r: row + 1, c: col, e: 'horizontal', side: 'bottom' },
            { r: row, c: col, e: 'vertical', side: 'left' },
            { r: row, c: col + 1, e: 'vertical', side: 'right' }
        ];
        
        edges.forEach(({ r, c, e, side }) => {
            const road = this.getRoad(r, c, e);
            if (road) {
                roads.push({ ...road, side });
            }
        });
        
        return roads;
    }
    
    /**
     * Calculate connectivity score for a parcel
     */
    calculateConnectivity(row, col) {
        const adjacentRoads = this.getAdjacentRoads(row, col);
        
        if (adjacentRoads.length === 0) return 0;
        
        // Base connectivity from number of roads
        let connectivity = adjacentRoads.length * 25;
        
        // Bonus for road quality
        adjacentRoads.forEach(road => {
            if (road.type === 'avenue') connectivity += 10;
            if (road.type === 'highway') connectivity += 20;
        });
        
        return Math.min(connectivity, 100);
    }
    
    /**
     * Find path between two parcels using roads
     */
    findPath(startRow, startCol, endRow, endCol) {
        // Simplified pathfinding - just check if both have road access
        // Full implementation would use A* or Dijkstra's algorithm
        
        const startAccess = this.hasRoadAccess(startRow, startCol);
        const endAccess = this.hasRoadAccess(endRow, endCol);
        
        if (!startAccess || !endAccess) {
            return null; // No path possible
        }
        
        // Calculate Manhattan distance as simple path length
        const distance = Math.abs(endRow - startRow) + Math.abs(endCol - startCol);
        
        return {
            distance,
            travelTime: distance * 2, // Simple time estimate
            connected: true
        };
    }
    
    /**
     * Calculate maintenance cost for all roads
     */
    calculateMaintenanceCost() {
        let totalCost = 0;
        
        this.roads.forEach(road => {
            // Maintenance increases with age and decreases with condition
            const ageFactor = 1 + (Date.now() - road.built) / (365 * 24 * 60 * 60 * 1000);
            const conditionFactor = 2 - road.condition;
            totalCost += road.maintenance * ageFactor * conditionFactor;
        });
        
        return totalCost;
    }
    
    /**
     * Update road conditions (called periodically)
     */
    updateRoadConditions(deltaTime) {
        this.roads.forEach(road => {
            // Roads decay over time and with traffic
            const decayRate = 0.001 * deltaTime;
            const trafficDecay = road.traffic * 0.0001 * deltaTime;
            road.condition = Math.max(0, road.condition - decayRate - trafficDecay);
        });
    }
    
    /**
     * Repair a road
     */
    repairRoad(row, col, edge) {
        const road = this.getRoad(row, col, edge);
        if (road) {
            road.condition = 1.0;
            return true;
        }
        return false;
    }
    
    /**
     * Create a public transit route
     */
    createRoute(name, stops, mode = 'bus') {
        const route = {
            id: `route_${Date.now()}`,
            name,
            stops, // Array of {row, col} objects
            mode,
            frequency: 10, // Minutes between vehicles
            ridership: 0,
            revenue: 0,
            cost: this.modes[mode].capacity * 10
        };
        
        this.routes.push(route);
        return route;
    }
    
    /**
     * Remove a route
     */
    removeRoute(routeId) {
        const index = this.routes.findIndex(r => r.id === routeId);
        if (index !== -1) {
            this.routes.splice(index, 1);
            return true;
        }
        return false;
    }
    
    /**
     * Calculate transportation efficiency for the entire network
     */
    calculateNetworkEfficiency() {
        let totalParcels = 0;
        let connectedParcels = 0;
        
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                totalParcels++;
                if (this.hasRoadAccess(row, col)) {
                    connectedParcels++;
                }
            }
        }
        
        return totalParcels > 0 ? (connectedParcels / totalParcels) * 100 : 0;
    }
    
    /**
     * Get statistics for display
     */
    getStatistics() {
        return {
            totalRoads: this.roads.size,
            totalRoutes: this.routes.length,
            maintenanceCost: this.calculateMaintenanceCost(),
            networkEfficiency: this.calculateNetworkEfficiency(),
            roadsByType: {
                street: Array.from(this.roads.values()).filter(r => r.type === 'street').length,
                avenue: Array.from(this.roads.values()).filter(r => r.type === 'avenue').length,
                highway: Array.from(this.roads.values()).filter(r => r.type === 'highway').length
            }
        };
    }
    
    /**
     * Draw roads on the canvas
     */
    drawRoads(ctx) {
        // This would contain road drawing logic
        // Currently handled by the mobility layer
    }
    
    /**
     * Build transport network using mobility layer roads
     * @returns {Object} Transport network with nodes, connections, and roads
     */
    buildTransportNetwork() {
        // Build transport network using mobility layer roads
        if (!this.game.mobilityLayer) {
            // Fallback for when mobility layer is not available
            return {
                nodes: [],
                connections: new Map()
            };
        }

        const network = {
            nodes: [],
            connections: new Map(),
            roads: new Map() // Parcel-based road connections for hasRoadConnection method
        };

        // Get all intersections from mobility layer as network nodes
        this.game.mobilityLayer.intersections.forEach((intersection, key) => {
            network.nodes.push({
                id: key,
                row: intersection.row,
                col: intersection.col,
                x: intersection.x,
                y: intersection.y
            });
        });

        // Build parcel-based road connectivity map using a different approach
        // Create a map of which parcels are connected to which intersections

        // First, map parcels to their adjacent intersections
        const parcelToIntersections = new Map();

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcelKey = `${row},${col}`;
                const adjacentIntersections = [];

                // A parcel at (r,c) is adjacent to intersections at:
                // (r,c), (r,c+1), (r+1,c), (r+1,c+1)
                const intersectionPositions = [
                    { iRow: row, iCol: col },           // top-left
                    { iRow: row, iCol: col + 1 },       // top-right
                    { iRow: row + 1, iCol: col },       // bottom-left
                    { iRow: row + 1, iCol: col + 1 }    // bottom-right
                ];

                intersectionPositions.forEach(pos => {
                    if (pos.iRow >= 0 && pos.iRow <= this.game.gridSize &&
                        pos.iCol >= 0 && pos.iCol <= this.game.gridSize) {
                        adjacentIntersections.push(`${pos.iRow},${pos.iCol}`);
                    }
                });

                parcelToIntersections.set(parcelKey, adjacentIntersections);
            }
        }

        // Now, for each road segment, connect all parcels that share connected intersections
        this.game.mobilityLayer.roads.forEach((road, edgeKey) => {
            const [fromIntersection, toIntersection] = edgeKey.split('-');

            // Find all parcels adjacent to these intersections
            const fromParcels = [];
            const toParcels = [];

            parcelToIntersections.forEach((intersections, parcelKey) => {
                if (intersections.includes(fromIntersection)) {
                    fromParcels.push(parcelKey);
                }
                if (intersections.includes(toIntersection)) {
                    toParcels.push(parcelKey);
                }
            });

            // Connect all parcels at the 'from' end to all parcels at the 'to' end
            fromParcels.forEach(fromParcel => {
                if (!network.roads.has(fromParcel)) {
                    network.roads.set(fromParcel, []);
                }

                toParcels.forEach(toParcel => {
                    if (fromParcel !== toParcel) {
                        const [row, col] = toParcel.split(',').map(Number);
                        const existing = network.roads.get(fromParcel);

                        // Avoid duplicates
                        if (!existing.some(conn => conn.row === row && conn.col === col)) {
                            existing.push({ row, col, roadType: road.type });
                        }
                    }
                });
            });

            // Also connect toParcels back to fromParcels (bidirectional)
            toParcels.forEach(toParcel => {
                if (!network.roads.has(toParcel)) {
                    network.roads.set(toParcel, []);
                }

                fromParcels.forEach(fromParcel => {
                    if (toParcel !== fromParcel) {
                        const [row, col] = fromParcel.split(',').map(Number);
                        const existing = network.roads.get(toParcel);

                        // Avoid duplicates
                        if (!existing.some(conn => conn.row === row && conn.col === col)) {
                            existing.push({ row, col, roadType: road.type });
                        }
                    }
                });
            });
        });

        if (network.roads.size > 0) {
            const sample = Array.from(network.roads.entries()).slice(0, 3);
            sample.forEach(([key, connections]) => {
            });
        }

        // Get all roads from mobility layer as intersection-based network connections
        this.game.mobilityLayer.roads.forEach((road, edgeKey) => {
            const [from, to] = edgeKey.split('-');
            const fromNode = network.nodes.find(n => n.id === from);
            const toNode = network.nodes.find(n => n.id === to);

            if (fromNode && toNode) {
                // Calculate road distance and capacity
                const distance = Math.sqrt(
                    Math.pow(toNode.x - fromNode.x, 2) +
                    Math.pow(toNode.y - fromNode.y, 2)
                );

                // Road capacity affects transport efficiency
                const roadType = this.game.mobilityLayer.roadTypes[road.type];
                const capacity = roadType ? roadType.capacity : 100;

                // Store bidirectional connections
                if (!network.connections.has(from)) {
                    network.connections.set(from, []);
                }
                if (!network.connections.has(to)) {
                    network.connections.set(to, []);
                }

                network.connections.get(from).push({
                    to: to,
                    distance: distance,
                    capacity: capacity,
                    roadType: road.type
                });

                network.connections.get(to).push({
                    to: from,
                    distance: distance,
                    capacity: capacity,
                    roadType: road.type
                });
            }
        });

        return network;
    }

    /**
     * Clear all transportation infrastructure
     */
    clear() {
        this.roads.clear();
        this.routes = [];
        this.edgeRoads = {
            horizontal: {},
            vertical: {},
            intersections: {}
        };
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransportationSystem;
}