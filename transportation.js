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
        
        // Enhanced road types with resource-specific efficiency modeling
        this.roadTypes = {
            local: {
                name: 'Local Street',
                cost: 50,
                maintenance: 1,
                capacity: 100,
                speed: 30,
                // Resource-specific efficiency
                efficiency: {
                    people: 0.5,  // Poor for people movement (car-dependent)
                    goods: 0.4,   // Poor for goods (small vehicles)
                    energy: 0.6,  // Good for local energy distribution (underground/overhead lines)
                    food: 0.4     // Poor for food distribution
                },
                // Health and environmental impacts
                noise: 0.3,      // Low noise
                pollution: 0.4,  // Moderate pollution
                walkability: 0.7 // Good for walking
            },
            arterial: {
                name: 'Arterial Road',
                cost: 100,
                maintenance: 2,
                capacity: 200,
                speed: 40,
                efficiency: {
                    people: 0.6,
                    goods: 0.6,
                    energy: 0.7,  // Good for energy transmission (utility corridors)
                    food: 0.6
                },
                noise: 0.6,
                pollution: 0.7,
                walkability: 0.4
            },
            highway: {
                name: 'Highway',
                cost: 200,
                maintenance: 5,
                capacity: 500,
                speed: 60,
                efficiency: {
                    people: 0.4,  // Poor for people (car-only)
                    goods: 0.9,   // Excellent for goods transport
                    energy: 0.9,  // Excellent for energy transmission (power lines along highways)
                    food: 0.8     // Good for food distribution
                },
                noise: 0.9,      // High noise
                pollution: 0.9,  // High pollution
                walkability: 0.0 // No pedestrian access
            }
        };

        // Transit mode efficiencies for people movement
        this.transitModes = {
            bus: {
                name: 'Bus',
                capacity: 40,
                speed: 25,
                efficiency: {
                    people: 0.8,  // Good for people
                    goods: 0.0,   // No goods transport
                    energy: 0.0,
                    food: 0.0
                },
                noise: 0.4,
                pollution: 0.6,
                accessibility: 0.9 // High accessibility
            },
            subway: {
                name: 'Subway/Rail',
                capacity: 200,
                speed: 40,
                efficiency: {
                    people: 1.0,  // Excellent for people
                    goods: 0.0,   // No goods transport
                    energy: 0.0,
                    food: 0.0
                },
                noise: 0.1,      // Very low noise
                pollution: 0.2,  // Very low pollution
                accessibility: 0.8 // Good accessibility (station-dependent)
            },
            walking: {
                name: 'Walking/Sidewalks',
                capacity: 50,
                speed: 5,
                efficiency: {
                    people: 0.3,  // Limited range but healthy
                    goods: 0.0,
                    energy: 0.0,
                    food: 0.0
                },
                noise: 0.0,      // No noise
                pollution: 0.0,  // No pollution
                accessibility: 1.0, // Perfect accessibility
                health: 1.0      // Health benefits
            },
            cycling: {
                name: 'Cycling/Bike Lanes',
                capacity: 30,
                speed: 15,
                efficiency: {
                    people: 0.6,  // Good for medium distances
                    goods: 0.1,   // Very limited goods
                    energy: 0.0,
                    food: 0.0
                },
                noise: 0.0,
                pollution: 0.0,
                accessibility: 0.8,
                health: 0.9
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

        // Invalidate building caches when road connectivity changes
        if (this.game.buildingSystem && this.game.buildingSystem.invalidateBuildingCaches) {
            this.game.buildingSystem.invalidateBuildingCaches(row, col, 3);
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
        // Check mobility layer roads first (primary source of truth)
        if (this.game.mobilityLayer && this.game.mobilityLayer.roads) {
            // Convert edge-based query to intersection-based road lookup
            const intersections = this.getEdgeIntersections(row, col, edge);
            if (intersections) {
                const { from, to } = intersections;
                const edgeKey = `${from}-${to}`;
                const reverseKey = `${to}-${from}`;
                return this.game.mobilityLayer.roads.has(edgeKey) || this.game.mobilityLayer.roads.has(reverseKey);
            }
        }

        // Fallback to legacy transportation system roads
        const key = `${row},${col},${edge}`;
        return this.roads.has(key);
    }
    
    /**
     * Convert edge-based coordinates to intersection-based coordinates
     */
    getEdgeIntersections(row, col, edge) {
        if (edge === 'horizontal') {
            // Horizontal edge between (row-1, col) and (row, col) intersections
            return {
                from: `${row},${col}`,
                to: `${row},${col + 1}`
            };
        } else if (edge === 'vertical') {
            // Vertical edge between (row, col-1) and (row, col) intersections
            return {
                from: `${row},${col}`,
                to: `${row + 1},${col}`
            };
        }
        return null;
    }

    /**
     * Get road at specific edge
     */
    getRoad(row, col, edge) {
        // Try mobility layer first
        if (this.game.mobilityLayer && this.game.mobilityLayer.roads) {
            const intersections = this.getEdgeIntersections(row, col, edge);
            if (intersections) {
                const { from, to } = intersections;
                const edgeKey = `${from}-${to}`;
                const reverseKey = `${to}-${from}`;
                return this.game.mobilityLayer.roads.get(edgeKey) || this.game.mobilityLayer.roads.get(reverseKey);
            }
        }

        // Fallback to legacy
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
     * Calculate accessibility score based on road connectivity quality
     */
    calculateAccessibilityScore(row, col) {
        let accessibilityScore = 0;
        let roadCount = 0;
        let connectedNeighbors = 0;

        // Check all four edges for roads
        const edges = [
            { r: row, c: col, e: 'horizontal' },     // Top
            { r: row + 1, c: col, e: 'horizontal' }, // Bottom
            { r: row, c: col, e: 'vertical' },       // Left
            { r: row, c: col + 1, e: 'vertical' }    // Right
        ];

        // Count direct road connections
        edges.forEach(({ r, c, e }) => {
            if (this.hasRoad(r, c, e)) {
                roadCount++;
                accessibilityScore += 25; // Base 25 points per road
            }
        });

        // Bonus for connected neighbors (better network effect)
        const neighbors = [
            [row - 1, col], [row + 1, col], // North, South
            [row, col - 1], [row, col + 1]  // West, East
        ];

        neighbors.forEach(([nRow, nCol]) => {
            if (nRow >= 0 && nRow < this.game.gridSize &&
                nCol >= 0 && nCol < this.game.gridSize &&
                this.hasRoadAccess(nRow, nCol)) {
                connectedNeighbors++;
            }
        });

        // Network effect bonus (0-25 points)
        accessibilityScore += (connectedNeighbors / 4) * 25;

        // Distance to road network center bonus
        const networkCenter = this.findNetworkCenter();
        if (networkCenter) {
            const distance = Math.abs(row - networkCenter.row) + Math.abs(col - networkCenter.col);
            const maxDistance = this.game.gridSize;
            const proximityBonus = Math.max(0, (maxDistance - distance) / maxDistance * 15);
            accessibilityScore += proximityBonus;
        }

        return Math.min(100, accessibilityScore);
    }

    /**
     * Find the center of the road network for proximity calculations
     */
    findNetworkCenter() {
        let totalX = 0, totalY = 0, roadCount = 0;

        // Find centroid of all road segments
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                if (this.hasRoadAccess(row, col)) {
                    totalX += col;
                    totalY += row;
                    roadCount++;
                }
            }
        }

        if (roadCount === 0) return null;

        return {
            row: Math.round(totalY / roadCount),
            col: Math.round(totalX / roadCount)
        };
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
     * Find path between two parcels using roads with proper network pathfinding
     */
    findPath(startRow, startCol, endRow, endCol) {
        // Check if both parcels have road access
        const startAccess = this.hasRoadAccess(startRow, startCol);
        const endAccess = this.hasRoadAccess(endRow, endCol);

        if (!startAccess || !endAccess) {
            return null; // No path possible
        }

        // Use built network for pathfinding
        const network = this.buildTransportNetwork();
        if (!network || network.roads.size === 0) {
            // Fallback to distance if no network available
            const distance = Math.abs(endRow - startRow) + Math.abs(endCol - startCol);
            return {
                distance,
                travelTime: distance * 2,
                connected: true,
                efficiency: 0.5 // Lower efficiency without proper network
            };
        }

        return this.findNetworkPath(startRow, startCol, endRow, endCol, network);
    }

    /**
     * Enhanced pathfinding using road network
     */
    findNetworkPath(startRow, startCol, endRow, endCol, network) {
        const startKey = `${startRow},${startCol}`;
        const endKey = `${endRow},${endCol}`;

        // If same parcel, no travel needed
        if (startKey === endKey) {
            return {
                distance: 0,
                travelTime: 0,
                connected: true,
                efficiency: 1.0,
                path: [{ row: startRow, col: startCol }]
            };
        }

        // Use Dijkstra's algorithm for shortest path
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();

        // Initialize distances
        for (const [parcelKey] of network.roads) {
            distances.set(parcelKey, Infinity);
            unvisited.add(parcelKey);
        }

        // Start position has distance 0
        if (distances.has(startKey)) {
            distances.set(startKey, 0);
        } else {
            // Start is not connected to road network
            return null;
        }

        while (unvisited.size > 0) {
            // Find unvisited node with smallest distance
            let current = null;
            let minDistance = Infinity;

            for (const node of unvisited) {
                const dist = distances.get(node);
                if (dist < minDistance) {
                    minDistance = dist;
                    current = node;
                }
            }

            if (!current || minDistance === Infinity) {
                break; // No more reachable nodes
            }

            unvisited.delete(current);

            // Found destination
            if (current === endKey) {
                return this.reconstructPath(startKey, endKey, previous, distances.get(endKey));
            }

            // Check neighbors
            const connections = network.roads.get(current) || [];
            for (const connection of connections) {
                const neighborKey = `${connection.row},${connection.col}`;
                if (!unvisited.has(neighborKey)) continue;

                // Calculate distance (Manhattan distance with road type modifier)
                const currentPos = current.split(',').map(Number);
                const neighborPos = [connection.row, connection.col];
                const edgeDistance = Math.abs(currentPos[0] - neighborPos[0]) +
                                   Math.abs(currentPos[1] - neighborPos[1]);

                // Road type affects travel efficiency
                const roadEfficiency = this.getRoadEfficiency(connection.roadType);
                const adjustedDistance = edgeDistance / roadEfficiency;

                const tentativeDistance = distances.get(current) + adjustedDistance;

                if (tentativeDistance < distances.get(neighborKey)) {
                    distances.set(neighborKey, tentativeDistance);
                    previous.set(neighborKey, current);
                }
            }
        }

        // No path found
        return null;
    }

    /**
     * Reconstruct path from pathfinding results
     */
    reconstructPath(startKey, endKey, previous, totalDistance) {
        const path = [];
        let current = endKey;

        while (current) {
            const [row, col] = current.split(',').map(Number);
            path.unshift({ row, col });
            current = previous.get(current);
        }

        // Calculate efficiency based on path length vs direct distance
        const [startRow, startCol] = startKey.split(',').map(Number);
        const [endRow, endCol] = endKey.split(',').map(Number);
        const directDistance = Math.abs(endRow - startRow) + Math.abs(endCol - startCol);
        const efficiency = directDistance > 0 ? Math.min(1.0, directDistance / totalDistance) : 1.0;

        return {
            distance: totalDistance,
            travelTime: totalDistance * 1.5, // Time factor
            connected: true,
            efficiency: efficiency,
            path: path
        };
    }

    /**
     * Get resource-specific transport efficiency
     */
    getTransportEfficiency(transportMode, resourceType, roadType = null) {
        // For road-based transport
        if (roadType && this.roadTypes[roadType]) {
            const baseEfficiency = this.roadTypes[roadType].efficiency[resourceType] || 0.5;

            // Check for additional infrastructure (sidewalks, bike lanes)
            let infrastructureBonus = 0;
            if (this.game.mobilityLayer) {
                const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;

                // Sidewalks boost people movement efficiency
                if (resourceType === 'people' && infrastructureOptions.sidewalks?.active) {
                    infrastructureBonus += 0.2;
                }

                // Bike lanes boost people movement and provide health benefits
                if (resourceType === 'people' && infrastructureOptions.bikeLanes?.active) {
                    infrastructureBonus += 0.3;
                }
            }

            return Math.min(1.0, baseEfficiency + infrastructureBonus);
        }

        // For transit-based transport (bus, subway)
        if (this.transitModes[transportMode]) {
            return this.transitModes[transportMode].efficiency[resourceType] || 0.0;
        }

        return 0.5; // Default fallback
    }

    /**
     * Get legacy road efficiency for backward compatibility
     */
    getRoadEfficiency(roadType, resourceType = 'goods') {
        return this.getTransportEfficiency(null, resourceType, roadType);
    }

    /**
     * Calculate health and environmental impacts of transport infrastructure
     */
    calculateTransportImpacts(row, col) {
        if (!this.game.mobilityLayer) {
            return { health: 0, environment: 0, walkability: 0 };
        }

        let totalNoise = 0;
        let totalPollution = 0;
        let totalWalkability = 0;
        let totalHealth = 0;
        let roadCount = 0;

        // Check adjacent roads for impacts
        const adjacentRoads = this.getAdjacentRoads(row, col);
        for (const road of adjacentRoads) {
            const roadData = this.roadTypes[road.type] || this.roadTypes.local;
            totalNoise += roadData.noise;
            totalPollution += roadData.pollution;
            totalWalkability += roadData.walkability;
            roadCount++;
        }

        // Check for pedestrian infrastructure benefits
        const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;
        if (infrastructureOptions.sidewalks?.active) {
            totalHealth += 0.3;
            totalWalkability += 0.3;
        }
        if (infrastructureOptions.bikeLanes?.active) {
            totalHealth += 0.4;
            totalWalkability += 0.2;
        }

        // Average impacts if multiple roads
        if (roadCount > 0) {
            totalNoise /= roadCount;
            totalPollution /= roadCount;
            totalWalkability /= roadCount;
        }

        // Convert to beneficial scores (lower noise/pollution = higher score)
        const environmentScore = Math.max(0, 1 - (totalNoise + totalPollution) / 2);
        const healthScore = Math.max(0, totalHealth + (1 - totalNoise));
        const walkabilityScore = Math.min(1, totalWalkability);

        return {
            health: healthScore,
            environment: environmentScore,
            walkability: walkabilityScore,
            rawNoise: totalNoise,
            rawPollution: totalPollution
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
            console.warn('Transportation: Mobility layer not available, roads will not connect properly');
            return {
                nodes: [],
                connections: new Map(),
                roads: new Map()
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
                    // Intersections exist at grid boundaries, so they go from 0 to gridSize (inclusive)
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
     * Calculate resource accessibility through road network with transit integration
     */
    calculateResourceAccessibility(fromRow, fromCol, resourceType, maxDistance = 10) {
        const accessible = [];

        // Get resources accessible via road network
        const roadAccessible = this.calculateRoadResourceAccessibility(fromRow, fromCol, resourceType, maxDistance);
        accessible.push(...roadAccessible);

        // Get resources accessible via transit routes (for people only)
        if (resourceType === 'workers' || resourceType === 'jobs') {
            const transitAccessible = this.calculateTransitResourceAccessibility(fromRow, fromCol, resourceType, maxDistance);
            accessible.push(...transitAccessible);
        }

        // Remove duplicates and return best access method for each location
        const uniqueAccessible = new Map();
        for (const resource of accessible) {
            const key = `${resource.row},${resource.col}`;
            const existing = uniqueAccessible.get(key);
            if (!existing || resource.efficiency > existing.efficiency) {
                uniqueAccessible.set(key, resource);
            }
        }

        return Array.from(uniqueAccessible.values());
    }

    /**
     * Calculate resource accessibility through road network only
     */
    calculateRoadResourceAccessibility(fromRow, fromCol, resourceType, maxDistance = 10) {
        const network = this.buildTransportNetwork();
        if (!network || network.roads.size === 0) {
            return [];
        }

        const accessible = [];
        const fromKey = `${fromRow},${fromCol}`;

        // Check if starting position has road access
        if (!network.roads.has(fromKey)) {
            return [];
        }

        // Find all parcels within network distance
        const visited = new Set();
        const queue = [{ key: fromKey, distance: 0, pathEfficiency: 1.0, transportMode: 'road' }];

        while (queue.length > 0) {
            const { key, distance, pathEfficiency, transportMode } = queue.shift();

            if (visited.has(key) || distance > maxDistance) {
                continue;
            }

            visited.add(key);
            const [row, col] = key.split(',').map(Number);

            // Check if this parcel provides the requested resource
            const parcel = this.game.grid[row] && this.game.grid[row][col];
            if (parcel && parcel.building) {
                const building = this.game.buildingManager?.getBuildingById(parcel.building);
                if (building && this.providesResource(building, resourceType)) {
                    accessible.push({
                        row, col,
                        distance: distance,
                        efficiency: pathEfficiency,
                        building: building,
                        supply: this.getResourceSupply(building, resourceType),
                        transportMode: transportMode,
                        resourceType: resourceType
                    });
                }
            }

            // Add neighbors to queue with resource-specific efficiency
            const connections = network.roads.get(key) || [];
            for (const connection of connections) {
                const neighborKey = `${connection.row},${connection.col}`;
                if (!visited.has(neighborKey)) {
                    // Calculate resource-specific transport efficiency
                    const roadType = connection.roadType || 'local';
                    const stepEfficiency = this.getTransportEfficiency(null, resourceType, roadType);
                    const newPathEfficiency = pathEfficiency * stepEfficiency;

                    queue.push({
                        key: neighborKey,
                        distance: distance + 1,
                        pathEfficiency: newPathEfficiency,
                        transportMode: 'road'
                    });
                }
            }
        }

        return accessible;
    }

    /**
     * Calculate resource accessibility through transit routes (people only)
     */
    calculateTransitResourceAccessibility(fromRow, fromCol, resourceType, maxDistance = 10) {
        if (!this.game.mobilityLayer || !this.game.mobilityLayer.transitRoutes) {
            return [];
        }

        const accessible = [];
        const transitRoutes = this.game.mobilityLayer.transitRoutes;

        // Find nearest transit stops
        const nearbyStops = this.findNearbyTransitStops(fromRow, fromCol, 3); // Within 3 blocks

        for (const stop of nearbyStops) {
            // Find routes serving this stop
            const servingRoutes = this.getRoutesServingStop(stop);

            for (const route of servingRoutes) {
                // Get all other stops on this route
                const routeStops = route.stops || [];
                const transitMode = route.mode || 'bus';
                const serviceLevel = route.serviceLevel || 'daytime';

                for (const destinationStop of routeStops) {
                    if (destinationStop.row === stop.row && destinationStop.col === stop.col) {
                        continue; // Skip same stop
                    }

                    // Find resources near destination stop
                    const stopResources = this.findResourcesNearLocation(
                        destinationStop.row, destinationStop.col, resourceType, 2
                    );

                    for (const resource of stopResources) {
                        // Calculate transit efficiency
                        const transitEfficiency = this.getTransportEfficiency(transitMode, 'people');
                        const serviceLevelMultiplier = this.getServiceLevelMultiplier(serviceLevel);
                        const walkingPenalty = this.calculateWalkingDistance(fromRow, fromCol, stop.row, stop.col) * 0.1;
                        const finalEfficiency = transitEfficiency * serviceLevelMultiplier * (1 - walkingPenalty);

                        accessible.push({
                            row: resource.row,
                            col: resource.col,
                            distance: stop.distance + resource.distance,
                            efficiency: finalEfficiency,
                            building: resource.building,
                            supply: resource.supply,
                            transportMode: transitMode,
                            resourceType: resourceType,
                            transitRoute: route.id
                        });
                    }
                }
            }
        }

        return accessible;
    }

    /**
     * Find nearby transit stops within walking distance
     */
    findNearbyTransitStops(fromRow, fromCol, maxWalkingDistance = 3) {
        if (!this.game.mobilityLayer || !this.game.mobilityLayer.transitStops) {
            return [];
        }

        const stops = [];
        for (const [stopKey, stopData] of this.game.mobilityLayer.transitStops) {
            const distance = Math.abs(stopData.row - fromRow) + Math.abs(stopData.col - fromCol);
            if (distance <= maxWalkingDistance) {
                stops.push({
                    ...stopData,
                    distance: distance
                });
            }
        }

        return stops.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Get transit routes serving a specific stop
     */
    getRoutesServingStop(stop) {
        if (!this.game.mobilityLayer || !this.game.mobilityLayer.transitRoutes) {
            return [];
        }

        const routes = [];
        for (const [routeId, routeData] of this.game.mobilityLayer.transitRoutes) {
            const routeStops = routeData.stops || [];
            const servesStop = routeStops.some(routeStop =>
                routeStop.row === stop.row && routeStop.col === stop.col
            );
            if (servesStop) {
                routes.push({ ...routeData, id: routeId });
            }
        }

        return routes;
    }

    /**
     * Find resources near a specific location
     */
    findResourcesNearLocation(centerRow, centerCol, resourceType, radius = 2) {
        const resources = [];

        for (let row = centerRow - radius; row <= centerRow + radius; row++) {
            for (let col = centerCol - radius; col <= centerCol + radius; col++) {
                if (row < 0 || row >= this.game.gridSize || col < 0 || col >= this.game.gridSize) {
                    continue;
                }

                const parcel = this.game.grid[row][col];
                if (parcel && parcel.building) {
                    const building = this.game.buildingManager?.getBuildingById(parcel.building);
                    if (building && this.providesResource(building, resourceType)) {
                        const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
                        resources.push({
                            row, col,
                            distance: distance,
                            building: building,
                            supply: this.getResourceSupply(building, resourceType)
                        });
                    }
                }
            }
        }

        return resources;
    }

    /**
     * Get service level multiplier for transit efficiency
     */
    getServiceLevelMultiplier(serviceLevel) {
        const multipliers = {
            'rush_hour': 0.6,
            'daytime': 1.0,
            'all_day': 1.2
        };
        return multipliers[serviceLevel] || 1.0;
    }

    /**
     * Calculate walking distance between two points
     */
    calculateWalkingDistance(row1, col1, row2, col2) {
        return Math.abs(row1 - row2) + Math.abs(col1 - col2);
    }

    /**
     * Check if building provides a specific resource
     */
    providesResource(building, resourceType) {
        if (!building || !building.resources) return false;

        switch (resourceType) {
            case 'energy':
                return building.resources.energySupply > 0;
            case 'food':
                return building.resources.foodProduction > 0;
            case 'jobs':
                return building.population?.jobsCreated > 0;
            case 'workers':
                return building.population?.bedroomsAdded > 0;
            default:
                return false;
        }
    }

    /**
     * Get resource supply amount from building
     */
    getResourceSupply(building, resourceType) {
        if (!building || !building.resources) return 0;

        switch (resourceType) {
            case 'energy':
                return building.resources.energySupply || 0;
            case 'food':
                return building.resources.foodProduction || 0;
            case 'jobs':
                return building.population?.jobsCreated || 0;
            case 'workers':
                return building.population?.bedroomsAdded || 0;
            default:
                return 0;
        }
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