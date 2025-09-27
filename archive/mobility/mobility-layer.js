// Mobility Layer - Isometric transportation system that feels familiar

class MobilityLayer {
    constructor(game) {
        this.game = game;
        this.roads = new Map(); // key: "row1,col1-row2,col2", value: road data
        this.hoveredEdge = null;
        this.selectedRoadType = 'local';
        this.animationTime = 0;
        
        // Visual parameters - keep parcels recognizable but create space
        this.parcelShrinkFactor = 0.6; // Shrink parcels to 60% to create road corridors
        
        // Intersection grid - positioned between parcels
        this.intersections = new Map(); // key: "row,col", value: intersection data
        this.intersectionsBuilt = false;
        
        // Parcel hover tracking
        this.hoveredParcel = null;
        
        // Modal interface state
        this.currentMode = 'roads'; // 'roads', 'transit-stops', 'transit-connect'
        this.hoveredButton = null; // For hover effects
        
        // Transit infrastructure
        this.transitStops = new Map(); // key: "row,col", value: stop data  
        this.transitRoutes = new Map(); // key: routeId, value: route data
        this.selectedTransitStops = []; // For route creation
        this.transitMode = null; // 'bus' or 'subway'
        this.isCreatingRoute = false;
        this.isPlacingTransitStop = false;
        this.routeCreationState = 'select_stops'; // 'select_stops', 'configure_route'
        this.pendingRoute = null;
        
        // Transit service levels
        this.serviceLevels = {
            rush_hour: {
                label: 'Rush Hour Only',
                cost: 1, // $1/day
                multiplier: 0.6, // Lower capacity
                description: '6AM-9AM, 5PM-7PM'
            },
            daytime: {
                label: 'Daytime Service', 
                cost: 3, // $3/day
                multiplier: 1.0, // Full capacity
                description: '6AM-10PM'
            },
            all_day: {
                label: '24-Hour Service',
                cost: 5, // $5/day
                multiplier: 1.2, // Higher capacity
                description: 'Around the clock'
            }
        };

        // Road types with visual properties
        this.roadTypes = {
            local: {
                color: '#8A8A8A',  // 15% lighter gray for better visibility
                width: 0.5,
                cost: 20,
                maintenance: 1,  // $1/day maintenance
                capacity: 100,  // Low capacity - neighborhood traffic
                peopleCapacity: 100,  // Can handle local residents
                goodsEfficiency: 0.4, // 40% efficiency for goods over distance
                label: 'Local',
                description: 'Neighborhood streets'
            },
            arterial: {
                color: '#4a4a4a',  // Dark gray but not black
                width: 0.5,
                cost: 50,
                maintenance: 2,  // $2/day maintenance
                capacity: 300,  // Medium capacity
                peopleCapacity: 300,  // Can handle moderate traffic
                goodsEfficiency: 0.6, // 60% efficiency for goods
                label: 'Arterial',
                description: 'Main thoroughfares'
            },
            highway: {
                color: '#333333',  // Dark gray (will add speckles in drawing)
                width: 0.5,
                cost: 200,
                maintenance: 5,  // $5/day maintenance
                capacity: 1000,  // High vehicle capacity
                peopleCapacity: 1000, // Limited by car-based transport (vs future transit)
                goodsEfficiency: 0.8, // 80% efficiency - trucks travel well on highways
                label: 'Highway',
                description: 'Long-distance transport'
            }
        };
        
        // Additional infrastructure options
        this.infrastructureOptions = {
            sidewalks: {
                active: false,
                cost: 5,
                maintenance: 0,  // No maintenance for sidewalks
                label: 'Sidewalks',
                color: '#ffffff',  // White
                activeColor: 'rgba(255, 255, 255, 0.3)'  // White highlight
            },
            bikeLanes: {
                active: false,
                cost: 10,
                maintenance: 0,  // No maintenance for bike lanes
                label: 'Bike Lanes',
                color: '#00a500',  // Reduced green (35% darker)
                activeColor: 'rgba(0, 165, 0, 0.3)'  // Reduced green highlight
            }
        };
    }
    
    buildIntersectionGrid() {
        // Create intersection points between parcels
        // For a grid of parcels, we need (gridSize + 1) intersection points in each direction
        for (let row = 0; row <= this.game.gridSize; row++) {
            for (let col = 0; col <= this.game.gridSize; col++) {
                const key = `${row},${col}`;
                
                // Calculate intersection position (between parcel centers)
                const pos = this.getIntersectionPosition(row, col);
                
                this.intersections.set(key, {
                    row, col,
                    x: pos.x,
                    y: pos.y,
                    connected: [] // Array of connected intersection keys
                });
                
            }
        }
    }
    
    getIntersectionPosition(row, col) {
        // Use the game's isometric conversion but offset by 0.5 to position between parcels
        const iso = this.game.toIsometric(col - 0.5, row - 0.5);
        return {
            x: iso.x,
            y: iso.y
        };
    }
    
    getParcelCenter(row, col) {
        // Get the visual center of a parcel (same as main game)
        return this.game.toIsometric(col, row);
    }
    
    render(ctx) {
        // Build intersections on first render when game is fully initialized
        if (!this.intersectionsBuilt) {
            this.buildIntersectionGrid();
            this.intersectionsBuilt = true;
        }
        
        // Save context state
        ctx.save();

        // Keep smooth rendering for game world elements
        ctx.imageSmoothingEnabled = true;

        // Update animation
        this.animationTime += 0.016;
        
        // Clear canvas with a more subdued background (40% reduction from sage green)
        ctx.fillStyle = '#1a201d'; // Darker sage green for better contrast
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Apply the same camera transform as the main game
        ctx.translate(this.game.panOffset.x, this.game.panOffset.y);
        ctx.scale(this.game.zoomScale, this.game.zoomScale);
        
        // Draw the familiar isometric grid but with modifications
        this.drawMobilityGrid(ctx);

        // Draw shrunken isometric parcels (same diamond shape, just smaller)
        this.drawShrunkenParcels(ctx);

        // Draw roads AFTER parcels so they show their full length
        this.drawRoads(ctx);

        // Draw illumination effect if a stop was just placed
        if (this.illuminatedSegment) {
            this.drawIlluminatedSegment(ctx);
        }

        // Apply special corner treatment to road segments instead of separate elements

        // Draw mode-specific hover effects on top
        if (this.currentMode === 'roads') {
            // Draw edge hover effect for road building
            if (this.hoveredEdge) {
                this.drawHoveredEdge(ctx);
            }
        } else if ((this.currentMode === 'transit-stops' || this.currentMode === 'transit-connect') && this.isPlacingTransitStop) {
            // Draw special transit hover effects (lifted road segment)
            if (this.hoveredEdge) {
                this.drawTransitRoadHover(ctx);
            }
        }
        
        // Draw transit system while transform is still active
        if (this.currentMode === 'transit-stops' || this.currentMode === 'transit-connect') {
            this.drawTransitSystem(ctx);
        }
        
        // Global lighting removed for clean, flat appearance
        
        // Restore context and draw UI overlay
        ctx.restore();
        this.drawUIOverlay(ctx);
    }
    
    drawMobilityGrid(ctx) {
        // Draw unimproved streets as subtle background areas only where no roads exist
        // These are drawn BEFORE parcels but NEVER over built roads

        ctx.fillStyle = '#808080'; // Toned down gray for balanced contrast

        this.intersections.forEach(intersection => {
            const { row, col } = intersection;

            // Check segments to adjacent intersections
            const neighbors = [
                { row: row - 1, col },     // North
                { row: row + 1, col },     // South
                { row, col: col - 1 },     // West
                { row, col: col + 1 }      // East
            ];

            neighbors.forEach(neighbor => {
                if (neighbor.row >= 0 && neighbor.row <= this.game.gridSize &&
                    neighbor.col >= 0 && neighbor.col <= this.game.gridSize) {

                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    const neighborIntersection = this.intersections.get(neighborKey);

                    if (neighborIntersection) {
                        // Check if this segment has a road built
                        const edgeKey = this.getEdgeKey(row, col, neighbor.row, neighbor.col);
                        const hasRoad = this.roads.has(edgeKey);

                        // Only draw gray fill for unimproved (roadless) segments
                        // This creates subtle background indication of potential road routes
                        if (!hasRoad) {
                            this.drawUnimprovedStreetSubtle(ctx, intersection, neighborIntersection);
                        }
                    }
                }
            });
        });
    }

    // Draw unimproved street as lighter, more prominent background indication
    drawUnimprovedStreetSubtle(ctx, fromIntersection, toIntersection) {
        // Calculate street width using the SAME logic as actual roads to ensure perfect coverage
        const roadType = this.roadTypes.local;
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        // Use slightly narrower width than actual roads to ensure roads completely cover gray areas
        const streetWidth = availableSpace * Math.max(roadType.width, 0.85); // 0.85 instead of 0.9 for guaranteed coverage

        // Calculate the street shape using the same logic as roads
        const streetShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, streetWidth);

        if (streetShape) {
            ctx.save();

            // Lighter, more solid gray for better contrast with dark green background and black roads
            ctx.fillStyle = '#a0a0a0'; // Solid light gray - good contrast with both background and roads
            ctx.beginPath();
            ctx.moveTo(streetShape.p1.x, streetShape.p1.y);
            ctx.lineTo(streetShape.p2.x, streetShape.p2.y);
            ctx.lineTo(streetShape.p3.x, streetShape.p3.y);
            ctx.lineTo(streetShape.p4.x, streetShape.p4.y);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    // Draw an unimproved street as a subtle gray area (with corner treatment)
    drawUnimprovedStreet(ctx, fromIntersection, toIntersection) {
        // Calculate street width using the SAME logic as actual roads to ensure perfect coverage
        const roadType = this.roadTypes.local;
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        // Use slightly narrower width than actual roads to ensure roads completely cover gray areas
        const streetWidth = availableSpace * Math.max(roadType.width, 0.85); // 0.85 instead of 0.9 for guaranteed coverage

        // Calculate the street shape using the same logic as roads
        const streetShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, streetWidth);

        if (streetShape) {
            ctx.save();

            // All unbuilt segments use the same styling (no special corner treatment for unbuilt)
            ctx.fillStyle = '#808080'; // Consistent gray for all unbuilt segments
            ctx.beginPath();
            ctx.moveTo(streetShape.p1.x, streetShape.p1.y);
            ctx.lineTo(streetShape.p2.x, streetShape.p2.y);
            ctx.lineTo(streetShape.p3.x, streetShape.p3.y);
            ctx.lineTo(streetShape.p4.x, streetShape.p4.y);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    }
    
    drawShrunkenParcels(ctx) {
        // Draw the same isometric parcels but smaller
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel) continue;
                
                const iso = this.game.toIsometric(col, row);
                
                // Draw shrunken diamond (same shape as main game, just smaller)
                this.drawShrunkenDiamond(ctx, iso.x, iso.y, parcel, row, col);
            }
        }
    }
    
    isParcelAffectedByEdge(parcelRow, parcelCol, edgeKey) {
        // Determine which parcels are adjacent to a road edge including intersection endpoints
        const [from, to] = edgeKey.split('-');
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);
        
        // Check if parcel is adjacent to either endpoint intersection
        const isAtFromIntersection = this.isParcelAdjacentToIntersection(parcelRow, parcelCol, fromRow, fromCol);
        const isAtToIntersection = this.isParcelAdjacentToIntersection(parcelRow, parcelCol, toRow, toCol);
        
        if (isAtFromIntersection || isAtToIntersection) {
            return true;
        }
        
        // Calculate edge direction for middle segment
        const isHorizontal = fromRow === toRow;
        const isVertical = fromCol === toCol;
        
        if (isHorizontal) {
            // Horizontal edge affects parcels above and below along the length
            const edgeRow = fromRow;
            const minCol = Math.min(fromCol, toCol);
            const maxCol = Math.max(fromCol, toCol);
            
            // Check if parcel is in the column range and adjacent to the edge
            if (parcelCol > minCol && parcelCol < maxCol) {
                return (parcelRow === edgeRow - 1 || parcelRow === edgeRow);
            }
        } else if (isVertical) {
            // Vertical edge affects parcels left and right along the length  
            const edgeCol = fromCol;
            const minRow = Math.min(fromRow, toRow);
            const maxRow = Math.max(fromRow, toRow);
            
            // Check if parcel is in the row range and adjacent to the edge
            if (parcelRow > minRow && parcelRow < maxRow) {
                return (parcelCol === edgeCol - 1 || parcelCol === edgeCol);
            }
        }
        
        return false;
    }
    
    isParcelAdjacentToIntersection(parcelRow, parcelCol, intersectionRow, intersectionCol) {
        // An intersection at (row, col) affects the 4 parcels around it
        // Intersection (r,c) connects parcels at:
        // - (r-1, c-1) top-left
        // - (r-1, c) top-right
        // - (r, c-1) bottom-left
        // - (r, c) bottom-right

        return (parcelRow === intersectionRow - 1 && parcelCol === intersectionCol - 1) ||  // top-left
               (parcelRow === intersectionRow - 1 && parcelCol === intersectionCol) ||      // top-right
               (parcelRow === intersectionRow && parcelCol === intersectionCol - 1) ||      // bottom-left
               (parcelRow === intersectionRow && parcelCol === intersectionCol);            // bottom-right
    }

    // Check if a parcel is within transit stop catchment area
    getTransitCatchmentAt(parcelRow, parcelCol) {
        // Only show catchment areas during transit stop placement or route creation
        if (!this.isPlacingTransitStop && !this.isCreatingRoute) {
            return null;
        }

        for (const [stopKey, stop] of this.transitStops) {
            // Only show catchment for stops of the current transit mode
            if (this.transitMode && stop.type !== this.transitMode) {
                continue;
            }

            // Get the road segment position for this stop
            const [from, ] = stop.roadSegment.split('-');
            const [stopRow, stopCol] = from.split(',').map(Number);

            // Calculate Manhattan distance
            const distance = Math.abs(parcelRow - stopRow) + Math.abs(parcelCol - stopCol);

            // Check catchment radius: 1 parcel for bus, 2 parcels for subway
            const maxDistance = stop.type === 'bus' ? 1 : 2;

            if (distance <= maxDistance) {
                return { type: stop.type, stop, distance };
            }
        }

        // Also check for hovered transit stop during placement
        if (this.isPlacingTransitStop && this.hoveredEdge) {
            const [from, ] = this.hoveredEdge.split('-');
            const [stopRow, stopCol] = from.split(',').map(Number);

            const distance = Math.abs(parcelRow - stopRow) + Math.abs(parcelCol - stopCol);
            const maxDistance = this.transitMode === 'bus' ? 1 : 2;

            if (distance <= maxDistance) {
                return { type: this.transitMode, distance };
            }
        }

        return null;
    }
    
    drawShrunkenDiamond(ctx, x, y, parcel, row, col) {
        const shrunkWidth = this.game.tileWidth * this.parcelShrinkFactor;
        const shrunkHeight = this.game.tileHeight * this.parcelShrinkFactor;

        ctx.save();
        ctx.translate(x, y); // Draw at road level - flat

        // Draw as clean isometric diamond (square viewed at angle) - no individual rounding
        const halfW = shrunkWidth / 2;
        const halfH = shrunkHeight / 2;

        // Draw perfect diamond shape (4 straight edges to 4 points) - NO corner cutting or rounding
        ctx.beginPath();
        ctx.moveTo(0, -halfH);           // North point
        ctx.lineTo(halfW, 0);            // East point
        ctx.lineTo(0, halfH);            // South point
        ctx.lineTo(-halfW, 0);           // West point
        ctx.closePath();                 // Back to North point
        
        // Determine base color for the parcel
        let baseColor;
        if (parcel.building) {
            const building = this.game.buildingManager.getBuildingById(parcel.building);
            if (building) {
                const categorization = this.categorizeBuildingFunction(building);
                baseColor = this.getMobilityViewColor(categorization.backgroundColor);
            } else {
                baseColor = this.getMobilityViewColor('#4a4a4a');
            }
        } else if (parcel.owner) {
            // Owned but unbuilt parcels - muted green
            baseColor = 'rgba(45, 55, 45, 0.8)';
        } else {
            // Unowned parcels - pleasing blue-gray for nice contrast
            baseColor = '#556B7D'; // Muted blue-gray for pleasant contrast with gray roads
        }

        // Fill as a single flat diamond (functional level)
        ctx.fillStyle = baseColor;
        ctx.fill();
        
        // Mobility effects now handled by ParcelSelectorManager
        const isAffected = false;

        // Check if this parcel is in a transit stop catchment area
        const transitCatchment = this.getTransitCatchmentAt(row, col);

        // Draw clean border for diamond top face
        ctx.lineWidth = 1;
        let strokeStyle = 'rgba(0, 0, 0, 0.15)'; // Default

        if (isAffected) {
            strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Road hover (white)
        } else if (transitCatchment) {
            // Transit catchment areas: green for bus, blue for subway
            strokeStyle = transitCatchment.type === 'bus'
                ? 'rgba(102, 187, 106, 0.8)'  // Green for bus
                : 'rgba(66, 165, 245, 0.8)';  // Blue for subway
            ctx.lineWidth = 2; // Make transit catchment borders more prominent
        }

        ctx.strokeStyle = strokeStyle;

        // Draw simple flat diamond border
        ctx.beginPath();
        ctx.moveTo(0, -halfH);           // North point
        ctx.lineTo(halfW, 0);            // East point
        ctx.lineTo(0, halfH);            // South point
        ctx.lineTo(-halfW, 0);           // West point
        ctx.closePath();
        ctx.stroke();
        
        // Draw building icon if present
        if (parcel.building) {
            const building = this.game.buildingManager.getBuildingById(parcel.building);
            if (building) {
                const categorization = this.categorizeBuildingFunction(building);
                
                // Set text color for icon (no background rectangle needed since parcel is colored)
                ctx.fillStyle = categorization.textColor;
                ctx.font = '12px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(categorization.icon, 0, 0);
            }
        }
        
        ctx.restore();
    }



    // Helper method to darken a color by a given factor
    darkenColor(color, factor) {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            const darkR = Math.floor(r * (1 - factor));
            const darkG = Math.floor(g * (1 - factor));
            const darkB = Math.floor(b * (1 - factor));
            return `rgb(${darkR}, ${darkG}, ${darkB})`;
        } else if (color.startsWith('rgba')) {
            // Extract rgba values
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                const a = match[4] ? parseFloat(match[4]) : 1;
                const darkR = Math.floor(r * (1 - factor));
                const darkG = Math.floor(g * (1 - factor));
                const darkB = Math.floor(b * (1 - factor));
                return `rgba(${darkR}, ${darkG}, ${darkB}, ${a})`;
            }
        }
        return color; // Fallback
    }

    // Legacy drawInlineRouteConfig function removed - route configuration now handled by sidebar panel
    
    // Convert regular colors to muted mobility view colors
    getMobilityViewColor(originalColor) {
        // Parse color and desaturate/darken it
        if (originalColor.startsWith('#')) {
            const r = parseInt(originalColor.slice(1, 3), 16);
            const g = parseInt(originalColor.slice(3, 5), 16);
            const b = parseInt(originalColor.slice(5, 7), 16);
            
            // Desaturate and darken
            const avg = (r + g + b) / 3;
            const desatR = Math.round(r * 0.3 + avg * 0.7) * 0.6;
            const desatG = Math.round(g * 0.3 + avg * 0.7) * 0.6;
            const desatB = Math.round(b * 0.3 + avg * 0.7) * 0.6;
            
            return `rgba(${desatR}, ${desatG}, ${desatB}, 0.8)`;
        } else if (originalColor.includes('rgb')) {
            // Already in rgba format, just reduce opacity and darken
            return originalColor.replace('rgb', 'rgba').replace(')', ', 0.7)').replace(/\d+/g, (match) => Math.round(parseInt(match) * 0.6));
        }
        
        // Fallback
        return 'rgba(60, 60, 60, 0.8)';
    }
    
    // Add enhanced global lighting effect to create depth distinction
    drawGlobalLighting(ctx) {
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        // Create enhanced gradient from top-left (lighter) to bottom-right (darker)
        // This simulates sunlight coming from the northwest with warm ambient lighting
        const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
        gradient.addColorStop(0, 'rgba(255, 248, 220, 0.08)');    // Warm highlight at top (4x stronger)
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.04)');  // Bright transition
        gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');           // Neutral in middle
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.06)');          // Reduced shadow at bottom

        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();

        // Add subtle ambient lighting overlay for additional brightness
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();
    }
    
    getBuildingColor(building) {
        // Color code by supply type for mobility view
        const category = building.category;
        
        if (category === 'housing') {
            return 'rgba(59, 130, 246, 0.6)'; // Blue - housing supply
        } else if (category === 'commercial') {
            return 'rgba(251, 191, 36, 0.6)'; // Yellow - food/goods supply
        } else if (category === 'industrial') {
            return 'rgba(245, 101, 101, 0.6)'; // Red - industrial/mixed supply
        } else if (category === 'utilities') {
            return 'rgba(34, 197, 94, 0.6)'; // Green - energy supply
        } else if (category === 'office' || category === 'education' || category === 'civic') {
            return 'rgba(168, 85, 247, 0.6)'; // Purple - job/worker supply
        } else if (category === 'mixed') {
            return 'rgba(156, 163, 175, 0.6)'; // Gray - mixed use
        } else if (category === 'recreation' || category === 'emergency') {
            return 'rgba(99, 179, 237, 0.6)'; // Light blue - community services
        } else {
            return 'rgba(156, 163, 175, 0.6)'; // Gray - other
        }
    }

    categorizeBuildingFunction(building) {
        // Smart building categorization based on function
        const hasHousing = building.population && building.population.bedroomsAdded > 0;
        const providesEnergy = building.resources && building.resources.energyDemand < 0; // Negative energy demand = production
        const providesFood = building.resources && building.resources.foodProduction > 0;
        const requiresWorkers = building.population && building.population.jobsCreated > 0;
        const providesGoods = building.category === 'commercial' || building.category === 'office';
        const providesServices = building.category === 'education' || building.category === 'civic' || 
                                building.category === 'recreation' || building.category === 'emergency';
        
        // Determine primary function and color
        if (hasHousing) {
            // Blue - Housing supply (regardless of other classifications)
            return {
                backgroundColor: '#2196F3', // Blue
                textColor: '#ffffff',
                icon: 'H'
            };
        } else if (providesEnergy) {
            // Green - Energy production
            return {
                backgroundColor: '#4CAF50', // Green
                textColor: '#ffffff', 
                icon: 'E'
            };
        } else if ((providesFood || providesGoods || providesServices) && requiresWorkers) {
            // Orange - Both provides services/goods AND creates jobs
            return {
                backgroundColor: '#FF9800', // Orange
                textColor: '#ffffff',
                icon: 'M' // Mixed function
            };
        } else if (providesFood || providesGoods || providesServices) {
            // Yellow - Provides food, goods, or consumer services
            return {
                backgroundColor: '#FFC107', // Yellow
                textColor: '#000000', // Black text on yellow
                icon: providesFood ? 'F' : (providesGoods ? 'G' : 'S')
            };
        } else if (requiresWorkers) {
            // Red - Requires workers
            return {
                backgroundColor: '#F44336', // Red
                textColor: '#ffffff',
                icon: 'W'
            };
        } else {
            // Default fallback - gray
            return {
                backgroundColor: '#757575', // Gray
                textColor: '#ffffff',
                icon: building.category ? building.category.charAt(0).toUpperCase() : 'B'
            };
        }
    }
    
    drawRoads(ctx) {
        // Draw roads in the isometric spaces between parcels
        this.roads.forEach((road, edgeKey) => {
            const [from, to] = edgeKey.split('-');
            const [fromRow, fromCol] = from.split(',').map(Number);
            const [toRow, toCol] = to.split(',').map(Number);

            this.drawRoad(ctx, fromRow, fromCol, toRow, toCol, road);
        });
    }

    drawIntersections(ctx) {
        // Draw small circular intersections at points where roads meet
        this.intersections.forEach((intersection, key) => {
            const connectedRoads = this.getConnectedRoads(intersection.row, intersection.col);

            // Only draw intersection if there are roads connected
            if (connectedRoads.length > 0) {
                ctx.save();

                // Draw a small circular intersection
                const radius = Math.max(3, this.game.tileWidth * 0.08);

                // Use a darker road color for intersections
                ctx.fillStyle = connectedRoads.length > 1 ? '#4a4a4a' : '#555555';
                ctx.beginPath();
                ctx.arc(intersection.x, intersection.y, radius, 0, Math.PI * 2);
                ctx.fill();

                // Add a subtle border for multi-road intersections
                if (connectedRoads.length > 1) {
                    ctx.strokeStyle = '#666666';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.restore();
            }
        });
    }

    getConnectedRoads(intersectionRow, intersectionCol) {
        const connectedRoads = [];

        // Check all possible edges from this intersection
        const neighbors = [
            { row: intersectionRow - 1, col: intersectionCol },     // North
            { row: intersectionRow + 1, col: intersectionCol },     // South
            { row: intersectionRow, col: intersectionCol - 1 },     // West
            { row: intersectionRow, col: intersectionCol + 1 }      // East
        ];

        neighbors.forEach(neighbor => {
            if (neighbor.row >= 0 && neighbor.row <= this.game.gridSize &&
                neighbor.col >= 0 && neighbor.col <= this.game.gridSize) {

                const edgeKey = this.getEdgeKey(intersectionRow, intersectionCol, neighbor.row, neighbor.col);
                if (this.roads.has(edgeKey)) {
                    connectedRoads.push(edgeKey);
                }
            }
        });

        return connectedRoads;
    }
    
    drawRoad(ctx, fromRow, fromCol, toRow, toCol, road) {
        // Use intersection positions
        const fromIntersection = this.intersections.get(`${fromRow},${fromCol}`);
        const toIntersection = this.intersections.get(`${toRow},${toCol}`);

        if (!fromIntersection || !toIntersection) return;

        const fromIso = { x: fromIntersection.x, y: fromIntersection.y };
        const toIso = { x: toIntersection.x, y: toIntersection.y };

        // Create a stable seed for this road segment based on its coordinates
        const roadSeed = `${fromRow}-${fromCol}-${toRow}-${toCol}`;

        // Draw road segment
        this.drawIsometricRoadSegment(ctx, fromIso, toIso, road, roadSeed);
    }
    
    drawIsometricRoadSegment(ctx, from, to, road, roadSeed) {
        const roadType = this.roadTypes[road.type];
        
        // Calculate road width based on available space between shrunken parcels
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        // Ensure built roads fully cover unimproved streets (85%) and extend into intersections
        let roadWidth = availableSpace * Math.max(roadType.width, 1.0); // Full coverage
        
        // Adjust for infrastructure
        if (road.hasSidewalks) roadWidth *= 1.1;
        if (road.hasBikeLanes) roadWidth *= 1.15;
        
        // Create isometric parallelogram that matches parcel perspective
        const roadShape = this.calculateIsometricRoadShape(from, to, roadWidth);
        
        // Draw main road surface as filled parallelogram with stable seed (no shadows)
        this.drawRoadSurface(ctx, roadShape, roadType, roadSeed);

        // Add road-specific centerline details with stable seed
        this.addRoadCenterlineDetails(ctx, roadShape, road, roadSeed);
        
        // Add infrastructure overlays
        if (road.hasBikeLanes) {
            this.drawIsometricBikeLanes(ctx, roadShape);
        }
        if (road.hasSidewalks) {
            // Pass road information to determine intersection type
            const fromKey = `${Math.round(from.x)},${Math.round(from.y)}`;
            const toKey = `${Math.round(to.x)},${Math.round(to.y)}`;
            this.drawIsometricSidewalks(ctx, roadShape, fromKey, toKey, roadSeed);
        }
    }
    
    calculateIsometricRoadShape(from, to, width) {
        // Calculate road shape that aligns with the isometric grid's inherent angles
        // Roads must "lay flat" following the grid's natural perspective

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return null;
        
        // Determine if this is a horizontal or vertical grid connection
        // In isometric view: NE/SW has positive dx*dy, NW/SE has negative dx*dy
        const isHorizontalGrid = (dx * dy) > 0;
        
        // Use proper isometric perpendiculars for equal visual width
        let perpX, perpY;
        
        if (isHorizontalGrid) {
            // For horizontal grid lines (NE/SW) - WORKING CORRECTLY
            perpX = -0.866; 
            perpY = 0.5;    
        } else {
            // For vertical grid lines (NW/SE) - use GRID-ALIGNED direction like horizontal
            // Horizontal uses (-cos(30°), sin(30°)) = (-0.866, 0.5) and aligns perfectly
            // Vertical should use the mirror grid direction: (cos(30°), sin(30°))
            perpX = 0.866;  // cos(30°) - grid-aligned direction
            perpY = 0.5;    // sin(30°) - grid-aligned direction
        }
        
        // Calculate the four corners using grid-aligned perpendiculars
        const halfWidth = width / 2;

        return {
            // Parallelogram corners extending exactly to intersection gridlines
            p1: { x: from.x + perpX * halfWidth, y: from.y + perpY * halfWidth },
            p2: { x: from.x - perpX * halfWidth, y: from.y - perpY * halfWidth },
            p3: { x: to.x - perpX * halfWidth, y: to.y - perpY * halfWidth },
            p4: { x: to.x + perpX * halfWidth, y: to.y + perpY * halfWidth },
            // Helper data
            from, to, width, length,
            direction: { x: dx / length, y: dy / length },
            perpendicular: { x: perpX, y: perpY },
            isHorizontalGrid
        };
    }
    
    drawRoadShadow(ctx, shape) {
        if (!shape) return;
        
        // Offset shadow slightly
        const shadowOffset = 2;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.moveTo(shape.p1.x + shadowOffset, shape.p1.y + shadowOffset);
        ctx.lineTo(shape.p2.x + shadowOffset, shape.p2.y + shadowOffset);
        ctx.lineTo(shape.p3.x + shadowOffset, shape.p3.y + shadowOffset);
        ctx.lineTo(shape.p4.x + shadowOffset, shape.p4.y + shadowOffset);
        ctx.closePath();
        ctx.fill();
    }
    
    drawRoadSurface(ctx, shape, roadType, roadSeed) {
        if (!shape) return;
        
        // Use seeded random for consistent texture
        const rng = this.createSeededRandom(roadSeed);
        
        // Draw main road surface as filled parallelogram - fully opaque for clear visibility
        ctx.save();
        ctx.globalAlpha = 1.0; // Full opacity for built roads
        ctx.fillStyle = roadType.color;
        
        // Create path with hand-drawn edge roughness
        ctx.beginPath();
        this.drawRoughEdge(ctx, shape.p1, shape.p2, 0.8, rng);
        this.drawRoughEdge(ctx, shape.p2, shape.p3, 0.8, rng);
        this.drawRoughEdge(ctx, shape.p3, shape.p4, 0.8, rng);
        this.drawRoughEdge(ctx, shape.p4, shape.p1, 0.8, rng);
        ctx.closePath();
        ctx.fill();
        
        // Add road texture/noise with stable seed
        this.addRoadTexture(ctx, shape, roadType, rng);

        ctx.restore();

        // Add subtle worn border with hand-drawn style (no lighting)
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 2, 5, 2]);
        ctx.stroke();
        ctx.restore();
    }
    
    drawRoughEdge(ctx, from, to, roughness, rng) {
        const segments = 8; // More segments for hand-drawn feel
        const dx = (to.x - from.x) / segments;
        const dy = (to.y - from.y) / segments;
        
        if (ctx.beginPath) {
            ctx.moveTo(from.x, from.y);
        } else {
            ctx.lineTo(from.x, from.y);
        }
        
        for (let i = 1; i < segments; i++) {
            // Use seeded random for consistent roughness
            const wobble = (rng() - 0.5) * roughness;
            const perpWobble = (rng() - 0.5) * roughness * 0.5;
            const x = from.x + dx * i + wobble - dy * perpWobble / 10;
            const y = from.y + dy * i + wobble + dx * perpWobble / 10;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(to.x, to.y);
    }
    
    addRoadTexture(ctx, shape, roadType, rng) {
        // Add subtle texture with seeded random patches and wear
        ctx.save();
        ctx.globalAlpha = 0.04;
        
        // Create clipping region for road shape
        ctx.beginPath();
        ctx.moveTo(shape.p1.x, shape.p1.y);
        ctx.lineTo(shape.p2.x, shape.p2.y);
        ctx.lineTo(shape.p3.x, shape.p3.y);
        ctx.lineTo(shape.p4.x, shape.p4.y);
        ctx.closePath();
        ctx.clip();
        
        // Add consistent wear patches using seeded random
        for (let i = 0; i < 12; i++) {
            const centerX = shape.p1.x + rng() * (shape.p3.x - shape.p1.x);
            const centerY = shape.p1.y + rng() * (shape.p3.y - shape.p1.y);
            const radius = 3 + rng() * 12;
            
            ctx.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(80,80,80,0.2)';
            ctx.beginPath();
            // Irregular circle for hand-drawn feel
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                const r = radius + (rng() - 0.5) * 3;
                const x = centerX + Math.cos(a) * r;
                const y = centerY + Math.sin(a) * r;
                if (a === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        }
        
        // Add hand-drawn tire tracks
        if (roadType.type !== 'local') {
            ctx.globalAlpha = 0.03;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 6;
            ctx.setLineDash([8, 4, 3, 4]);
            const centerLine = {
                from: { x: (shape.p1.x + shape.p2.x) / 2, y: (shape.p1.y + shape.p2.y) / 2 },
                to: { x: (shape.p3.x + shape.p4.x) / 2, y: (shape.p3.y + shape.p4.y) / 2 }
            };
            
            // Wavy tire tracks
            ctx.beginPath();
            const segments = 10;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const baseX = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * t;
                const baseY = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * t;
                const wobble = Math.sin(i * 0.5) * 0.5;
                
                if (i === 0) ctx.moveTo(baseX - 4 + wobble, baseY);
                else ctx.lineTo(baseX - 4 + wobble, baseY);
            }
            ctx.stroke();
            
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const baseX = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * t;
                const baseY = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * t;
                const wobble = Math.sin(i * 0.5 + 1) * 0.5;
                
                if (i === 0) ctx.moveTo(baseX + 4 + wobble, baseY);
                else ctx.lineTo(baseX + 4 + wobble, baseY);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        ctx.restore();
    }
    
    addRoadLighting(ctx, shape, rng) {
        ctx.save();
        
        // Create clipping region for road shape
        ctx.beginPath();
        ctx.moveTo(shape.p1.x, shape.p1.y);
        ctx.lineTo(shape.p2.x, shape.p2.y);
        ctx.lineTo(shape.p3.x, shape.p3.y);
        ctx.lineTo(shape.p4.x, shape.p4.y);
        ctx.closePath();
        ctx.clip();
        
        // Global light source position (top-left of entire canvas)
        const globalLightX = -200;
        const globalLightY = -200;
        
        // Calculate center of this road segment
        const centerX = (shape.p1.x + shape.p2.x + shape.p3.x + shape.p4.x) / 4;
        const centerY = (shape.p1.y + shape.p2.y + shape.p3.y + shape.p4.y) / 4;
        
        // Distance from global light source affects lighting intensity
        const distanceFromLight = Math.sqrt(
            Math.pow(centerX - globalLightX, 2) + Math.pow(centerY - globalLightY, 2)
        );
        
        // Normalize distance for lighting calculation (adjust these values to taste)
        const maxDistance = 1000; // Maximum expected distance
        const lightIntensity = Math.max(0.1, 1 - (distanceFromLight / maxDistance));
        
        // Global highlight gradient
        const gradientHighlight = ctx.createLinearGradient(
            globalLightX, globalLightY,  // From global light source
            centerX + 100, centerY + 100  // Away from light
        );
        gradientHighlight.addColorStop(0, `rgba(255, 255, 255, ${0.06 * lightIntensity})`);
        gradientHighlight.addColorStop(0.3, `rgba(255, 255, 255, ${0.03 * lightIntensity})`);
        gradientHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradientHighlight;
        ctx.fillRect(
            Math.min(shape.p1.x, shape.p2.x, shape.p3.x, shape.p4.x) - 20,
            Math.min(shape.p1.y, shape.p2.y, shape.p3.y, shape.p4.y) - 20,
            Math.abs(shape.p3.x - shape.p1.x) + 40,
            Math.abs(shape.p3.y - shape.p1.y) + 40
        );
        
        // Global shadow gradient (opposite direction)
        const gradientShadow = ctx.createLinearGradient(
            centerX - 50, centerY - 50,  // From opposite of light
            centerX + 100, centerY + 100  // Toward shadow
        );
        gradientShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradientShadow.addColorStop(0.5, `rgba(0, 0, 0, ${0.02 * lightIntensity})`);
        gradientShadow.addColorStop(1, `rgba(0, 0, 0, ${0.04 * lightIntensity})`);
        
        ctx.fillStyle = gradientShadow;
        ctx.fillRect(
            Math.min(shape.p1.x, shape.p2.x, shape.p3.x, shape.p4.x) - 20,
            Math.min(shape.p1.y, shape.p2.y, shape.p3.y, shape.p4.y) - 20,
            Math.abs(shape.p3.x - shape.p1.x) + 40,
            Math.abs(shape.p3.y - shape.p1.y) + 40
        );
        
        // Edge lighting based on global light direction
        const lightAngle = Math.atan2(centerY - globalLightY, centerX - globalLightX);
        
        // Highlight edges facing the light
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 * lightIntensity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(shape.p1.x, shape.p1.y);
        ctx.lineTo(shape.p2.x, shape.p2.y);
        ctx.stroke();
        
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.02 * lightIntensity})`;
        ctx.beginPath();
        ctx.moveTo(shape.p1.x, shape.p1.y);
        ctx.lineTo(shape.p4.x, shape.p4.y);
        ctx.stroke();
        
        // Shadow edges away from light
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.06 * lightIntensity})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(shape.p3.x, shape.p3.y);
        ctx.lineTo(shape.p4.x, shape.p4.y);
        ctx.stroke();
        
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.04 * lightIntensity})`;
        ctx.beginPath();
        ctx.moveTo(shape.p2.x, shape.p2.y);
        ctx.lineTo(shape.p3.x, shape.p3.y);
        ctx.stroke();
        
        ctx.restore();
    }
    
    createSeededRandom(seed) {
        // Simple seeded random number generator
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash = hash & hash;
        }
        let currentSeed = Math.abs(hash);
        
        return function() {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        };
    }
    
    addRoadCenterlineDetails(ctx, shape, road, roadSeed) {
        if (!shape) return;
        
        const centerLine = {
            from: { x: (shape.p1.x + shape.p2.x) / 2, y: (shape.p1.y + shape.p2.y) / 2 },
            to: { x: (shape.p3.x + shape.p4.x) / 2, y: (shape.p3.y + shape.p4.y) / 2 }
        };
        
        const rng = this.createSeededRandom(roadSeed);
        
        if (road.type === 'local') {
            // Add subtle worn centerline like arterial but without dotting
            this.drawLocalCenterline(ctx, centerLine, rng);
        } else if (road.type === 'arterial') {
            // Dotted white centerline
            this.drawDottedCenterline(ctx, centerLine, rng);
        } else if (road.type === 'highway') {
            // Double yellow centerline
            this.drawDoubleYellowCenterline(ctx, centerLine, shape, rng);
        }
    }
    
    drawLocalCenterline(ctx, centerLine, rng) {
        // Draw subtle solid centerline like arterial roads but without dots
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Very faint white line
        ctx.lineWidth = 0.8;
        
        // Add slight hand-drawn wobble to the centerline
        const segments = 15;
        const totalLength = Math.sqrt(
            Math.pow(centerLine.to.x - centerLine.from.x, 2) + 
            Math.pow(centerLine.to.y - centerLine.from.y, 2)
        );
        
        ctx.beginPath();
        ctx.moveTo(centerLine.from.x, centerLine.from.y);
        
        // Create slightly wavy line with minimal wobble
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const baseX = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * t;
            const baseY = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * t;
            
            // Add very subtle wobble (±0.3 pixels)
            const wobble = (rng() - 0.5) * 0.6;
            const perpAngle = Math.atan2(centerLine.to.y - centerLine.from.y, centerLine.to.x - centerLine.from.x) + Math.PI/2;
            
            const wobbleX = baseX + Math.cos(perpAngle) * wobble;
            const wobbleY = baseY + Math.sin(perpAngle) * wobble;
            
            ctx.lineTo(wobbleX, wobbleY);
        }
        
        ctx.lineTo(centerLine.to.x, centerLine.to.y);
        ctx.stroke();
        ctx.restore();
    }
    
    drawDottedCenterline(ctx, centerLine, rng) {
        // Draw worn/faded white dotted line with slight wobble
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // More faded
        ctx.lineWidth = 1.5;
        
        // Custom dashed line with varying opacity for worn effect
        const dashLength = 6;
        const gapLength = 6;
        const totalLength = Math.sqrt(
            Math.pow(centerLine.to.x - centerLine.from.x, 2) + 
            Math.pow(centerLine.to.y - centerLine.from.y, 2)
        );
        const dx = (centerLine.to.x - centerLine.from.x) / totalLength;
        const dy = (centerLine.to.y - centerLine.from.y) / totalLength;
        
        let currentPos = 0;
        while (currentPos < totalLength) {
            const startX = centerLine.from.x + dx * currentPos;
            const startY = centerLine.from.y + dy * currentPos;
            const endPos = Math.min(currentPos + dashLength, totalLength);
            const endX = centerLine.from.x + dx * endPos;
            const endY = centerLine.from.y + dy * endPos;
            
            // Vary opacity for each dash (worn effect)
            ctx.globalAlpha = 0.4 + rng() * 0.3;
            ctx.beginPath();
            // Add slight wobble
            ctx.moveTo(startX + (rng() - 0.5) * 0.3, startY + (rng() - 0.5) * 0.3);
            ctx.lineTo(endX + (rng() - 0.5) * 0.3, endY + (rng() - 0.5) * 0.3);
            ctx.stroke();
            
            currentPos += dashLength + gapLength;
        }
        ctx.restore();
    }
    
    drawDoubleYellowCenterline(ctx, centerLine, shape, rng) {
        const perpX = shape.perpendicular.x * 1.5;
        const perpY = shape.perpendicular.y * 1.5;
        
        ctx.save();
        // Faded yellow with varying opacity
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.7)'; // Slightly orange-yellow, faded
        ctx.lineWidth = 1.3; // Slightly thinner for worn look
        
        // Add slight wobble to lines
        const wobble = 0.2;
        
        // First yellow line with breaks for worn effect
        ctx.globalAlpha = 0.6 + rng() * 0.2;
        ctx.beginPath();
        const segments = 10;
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const nextT = (i + 1) / segments;
            
            if (rng() > 0.015) { // 98.5% chance of drawing segment (even less splotchy)
                const x1 = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * t;
                const y1 = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * t;
                const x2 = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * nextT;
                const y2 = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * nextT;
                
                ctx.moveTo(x1 + perpX + (rng() - 0.5) * wobble, y1 + perpY + (rng() - 0.5) * wobble);
                ctx.lineTo(x2 + perpX + (rng() - 0.5) * wobble, y2 + perpY + (rng() - 0.5) * wobble);
            }
        }
        ctx.stroke();
        
        // Second yellow line
        ctx.globalAlpha = 0.6 + rng() * 0.2;
        ctx.beginPath();
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const nextT = (i + 1) / segments;
            
            if (rng() > 0.015) { // 98.5% chance of drawing segment (less splotchy)
                const x1 = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * t;
                const y1 = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * t;
                const x2 = centerLine.from.x + (centerLine.to.x - centerLine.from.x) * nextT;
                const y2 = centerLine.from.y + (centerLine.to.y - centerLine.from.y) * nextT;
                
                ctx.moveTo(x1 - perpX + (rng() - 0.5) * wobble, y1 - perpY + (rng() - 0.5) * wobble);
                ctx.lineTo(x2 - perpX + (rng() - 0.5) * wobble, y2 - perpY + (rng() - 0.5) * wobble);
            }
        }
        ctx.stroke();
        ctx.restore();
    }
    
    drawIsometricSidewalks(ctx, shape, fromKey, toKey, roadSeed) {
        if (!shape) return;
        
        // Count connected roads at each intersection to determine crosswalk placement
        const fromConnections = this.countConnectionsAtIntersection(fromKey);
        const toConnections = this.countConnectionsAtIntersection(toKey);
        
        // Draw sidewalks as thinner parallelograms on the edges
        const sidewalkWidth = 3;
        const trimPercent = 0.12; // Trim 12% from each end for crosswalks
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = sidewalkWidth;
        ctx.lineCap = 'butt';
        
        // Calculate trimmed sidewalk endpoints
        const leftTrimStart = {
            x: shape.p1.x + (shape.p4.x - shape.p1.x) * trimPercent,
            y: shape.p1.y + (shape.p4.y - shape.p1.y) * trimPercent
        };
        const leftTrimEnd = {
            x: shape.p1.x + (shape.p4.x - shape.p1.x) * (1 - trimPercent),
            y: shape.p1.y + (shape.p4.y - shape.p1.y) * (1 - trimPercent)
        };
        const rightTrimStart = {
            x: shape.p2.x + (shape.p3.x - shape.p2.x) * trimPercent,
            y: shape.p2.y + (shape.p3.y - shape.p2.y) * trimPercent
        };
        const rightTrimEnd = {
            x: shape.p2.x + (shape.p3.x - shape.p2.x) * (1 - trimPercent),
            y: shape.p2.y + (shape.p3.y - shape.p2.y) * (1 - trimPercent)
        };
        
        // Left sidewalk (trimmed) - clean appearance
        ctx.save();
        ctx.strokeStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.moveTo(leftTrimStart.x, leftTrimStart.y);
        ctx.lineTo(leftTrimEnd.x, leftTrimEnd.y);
        ctx.stroke();
        
        ctx.restore();

        // Right sidewalk (trimmed) - clean appearance
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = sidewalkWidth;
        ctx.lineCap = 'butt';
        ctx.setLineDash([3, 2]);
        
        // Base sidewalk - darker (further from light)
        ctx.strokeStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(rightTrimStart.x, rightTrimStart.y);
        ctx.lineTo(rightTrimEnd.x, rightTrimEnd.y);
        ctx.stroke();
        
        // No shadows - clean flat appearance
        ctx.restore();
        
        // Draw crosswalks at both ends when sidewalks are present
        // More visible crosswalks at busier intersections
        this.drawZebraCrosswalk(ctx, shape, 'start', roadSeed, fromConnections);
        this.drawZebraCrosswalk(ctx, shape, 'end', roadSeed, toConnections);
    }
    
    drawZebraCrosswalk(ctx, shape, position, roadSeed, connectionCount = 2) {
        // Always draw crosswalks when sidewalks are present
        const zebraWidth = 1.5; // Narrower stripes
        const numStripes = 6; // More stripes for better visibility
        const crosswalkInset = 8; // More inset for narrower crosswalks
        
        ctx.save();
        
        // Choose the crosswalk position based on which end of the road
        const isStart = position === 'start';
        
        // Calculate crosswalk position along the road (near the end but on the segment)
        const alongRoadOffset = isStart ? 0.05 : 0.95; // 5% from start or 5% from end
        
        // Get the four corners of the crosswalk area
        const leftEdgeStart = {
            x: shape.p1.x + (shape.p4.x - shape.p1.x) * alongRoadOffset,
            y: shape.p1.y + (shape.p4.y - shape.p1.y) * alongRoadOffset
        };
        const rightEdgeStart = {
            x: shape.p2.x + (shape.p3.x - shape.p2.x) * alongRoadOffset,
            y: shape.p2.y + (shape.p3.y - shape.p2.y) * alongRoadOffset
        };
        
        const crosswalkLength = 0.06; // Narrower crosswalk along the road
        const leftEdgeEnd = {
            x: shape.p1.x + (shape.p4.x - shape.p1.x) * (alongRoadOffset + (isStart ? crosswalkLength : -crosswalkLength)),
            y: shape.p1.y + (shape.p4.y - shape.p1.y) * (alongRoadOffset + (isStart ? crosswalkLength : -crosswalkLength))
        };
        const rightEdgeEnd = {
            x: shape.p2.x + (shape.p3.x - shape.p2.x) * (alongRoadOffset + (isStart ? crosswalkLength : -crosswalkLength)),
            y: shape.p2.y + (shape.p3.y - shape.p2.y) * (alongRoadOffset + (isStart ? crosswalkLength : -crosswalkLength))
        };
        
        // Calculate inset for crosswalk (don't go all the way to edges)
        const insetVector = {
            x: (rightEdgeStart.x - leftEdgeStart.x) * (crosswalkInset / 100),
            y: (rightEdgeStart.y - leftEdgeStart.y) * (crosswalkInset / 100)
        };
        
        // Draw zebra stripes with worn/faded effect
        for (let i = 0; i < numStripes; i++) {
            const stripeProgress = i / (numStripes - 1);
            
            // Interpolate stripe position along crosswalk length
            const stripeLeft = {
                x: leftEdgeStart.x + (leftEdgeEnd.x - leftEdgeStart.x) * stripeProgress,
                y: leftEdgeStart.y + (leftEdgeEnd.y - leftEdgeStart.y) * stripeProgress
            };
            const stripeRight = {
                x: rightEdgeStart.x + (rightEdgeEnd.x - rightEdgeStart.x) * stripeProgress,
                y: rightEdgeStart.y + (rightEdgeEnd.y - rightEdgeStart.y) * stripeProgress
            };
            
            // Apply inset
            stripeLeft.x += insetVector.x;
            stripeLeft.y += insetVector.y;
            stripeRight.x -= insetVector.x;
            stripeRight.y -= insetVector.y;
            
            // Use seeded random for consistent worn effect
            const rng = this.createSeededRandom(roadSeed + '-crosswalk-' + i);
            
            // Draw with more visible stripes
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.7 + rng() * 0.2) + ')';  // More opaque
            ctx.lineWidth = zebraWidth;
            ctx.lineCap = 'square';
            
            // Draw stripe with potential breaks for worn look
            const segments = 3;
            for (let j = 0; j < segments; j++) {
                if (rng() > 0.1) { // 90% chance to draw segment (more visible)
                    const segStart = j / segments;
                    const segEnd = (j + 1) / segments;
                    
                    ctx.beginPath();
                    ctx.moveTo(
                        stripeLeft.x + (stripeRight.x - stripeLeft.x) * segStart,
                        stripeLeft.y + (stripeRight.y - stripeLeft.y) * segStart
                    );
                    ctx.lineTo(
                        stripeLeft.x + (stripeRight.x - stripeLeft.x) * segEnd,
                        stripeLeft.y + (stripeRight.y - stripeLeft.y) * segEnd
                    );
                    ctx.stroke();
                }
            }
        }
        
        ctx.restore();
    }
    
    countConnectionsAtIntersection(intersectionKey) {
        // Count how many roads connect at this intersection
        let connections = 0;
        this.roads.forEach((road, edgeKey) => {
            const [from, to] = edgeKey.split('-');
            // Check if this road connects to the intersection
            const fromNormalized = this.normalizeIntersectionKey(from);
            const toNormalized = this.normalizeIntersectionKey(to);
            const targetNormalized = this.normalizeIntersectionKey(intersectionKey);
            
            if (fromNormalized === targetNormalized || toNormalized === targetNormalized) {
                connections++;
            }
        });
        return connections;
    }
    
    normalizeIntersectionKey(key) {
        // Normalize intersection keys to handle slight coordinate variations
        const parts = key.split(',');
        if (parts.length !== 2) return key;
        
        const x = Math.round(parseFloat(parts[0]));
        const y = Math.round(parseFloat(parts[1]));
        return `${x},${y}`;
    }
    
    drawIsometricBikeLanes(ctx, shape) {
        if (!shape) return;
        
        // Calculate bike lane positions (inset from edges)
        const inset = 0.2; // 20% inset from edges
        const p1_bl = {
            x: shape.p1.x + (shape.p2.x - shape.p1.x) * inset,
            y: shape.p1.y + (shape.p2.y - shape.p1.y) * inset
        };
        const p4_bl = {
            x: shape.p4.x + (shape.p3.x - shape.p4.x) * inset,
            y: shape.p4.y + (shape.p3.y - shape.p4.y) * inset
        };
        const p2_bl = {
            x: shape.p2.x + (shape.p1.x - shape.p2.x) * inset,
            y: shape.p2.y + (shape.p1.y - shape.p2.y) * inset
        };
        const p3_bl = {
            x: shape.p3.x + (shape.p4.x - shape.p3.x) * inset,
            y: shape.p3.y + (shape.p4.y - shape.p3.y) * inset
        };
        
        ctx.strokeStyle = '#00a500';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        
        // Left bike lane
        ctx.beginPath();
        ctx.moveTo(p1_bl.x, p1_bl.y);
        ctx.lineTo(p4_bl.x, p4_bl.y);
        ctx.stroke();
        
        // Right bike lane
        ctx.beginPath();
        ctx.moveTo(p2_bl.x, p2_bl.y);
        ctx.lineTo(p3_bl.x, p3_bl.y);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
    
    
    drawHoveredEdge(ctx) {
        const [from, to] = this.hoveredEdge.split('-');
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);
        
        // Use intersection positions
        const fromIntersection = this.intersections.get(`${fromRow},${fromCol}`);
        const toIntersection = this.intersections.get(`${toRow},${toCol}`);
        
        if (!fromIntersection || !toIntersection) return;
        
        // Check if road already exists
        const hasRoad = this.roads.has(this.hoveredEdge);
        const roadType = this.roadTypes[this.selectedRoadType];
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        let roadWidth = availableSpace * Math.max(roadType.width, 1.0); // Match main road rendering
        
        // Adjust width based on selected infrastructure options
        if (this.infrastructureOptions.sidewalks.active) roadWidth += 4;
        if (this.infrastructureOptions.bikeLanes.active) roadWidth += 6;
        
        // Calculate proper isometric road shape (same as built roads)
        const roadShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, roadWidth);
        
        ctx.save();
        
        if (hasRoad) {
            // Show orange overlay for existing roads
            ctx.fillStyle = 'rgba(255, 150, 0, 0.4)';
        } else {
            // Show preview using road type color with transparency
            const color = roadType.color;
            if (color.startsWith('#')) {
                // Convert hex to rgba
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
            } else if (color.includes('rgb')) {
                // Convert rgb to rgba
                ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.4)');
            } else {
                // Fallback for other color formats
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            }
        }
        
        // Draw the isometric road shape
        ctx.beginPath();
        ctx.moveTo(roadShape.p1.x, roadShape.p1.y);
        ctx.lineTo(roadShape.p2.x, roadShape.p2.y);
        ctx.lineTo(roadShape.p3.x, roadShape.p3.y);
        ctx.lineTo(roadShape.p4.x, roadShape.p4.y);
        ctx.closePath();
        ctx.fill();
        
        // Add subtle border
        ctx.strokeStyle = hasRoad ? 'rgba(255, 150, 0, 0.8)' : 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw cost display in center of road segment
        const centerX = (fromIntersection.x + toIntersection.x) / 2;
        const centerY = (fromIntersection.y + toIntersection.y) / 2;
        const totalCost = this.calculateSegmentCost();

        // Determine display text based on road status
        let displayText, backgroundColor, textColor;
        if (hasRoad) {
            const existingRoad = this.roads.get(this.hoveredEdge);

            // Check if this would be an upgrade by comparing configurations
            const isSameType = existingRoad.type === this.selectedRoadType;
            const hasNewSidewalks = this.infrastructureOptions.sidewalks.active;
            const hasNewBikeLanes = this.infrastructureOptions.bikeLanes.active;
            const exactMatch = existingRoad.hasSidewalks === hasNewSidewalks &&
                             existingRoad.hasBikeLanes === hasNewBikeLanes;

            if (isSameType && exactMatch) {
                displayText = 'BUILT';
                backgroundColor = 'rgba(100, 100, 100, 0.9)'; // Gray for already built
                textColor = '#ffffff';
            } else {
                // Calculate upgrade/replacement cost
                if (isSameType && !exactMatch) {
                    // Infrastructure upgrade
                    let upgradeCost = 0;
                    if (!existingRoad.hasSidewalks && hasNewSidewalks) upgradeCost += this.infrastructureOptions.sidewalks.cost;
                    if (!existingRoad.hasBikeLanes && hasNewBikeLanes) upgradeCost += this.infrastructureOptions.bikeLanes.cost;
                    displayText = upgradeCost > 0 ? `$${upgradeCost}` : 'BUILT';
                    backgroundColor = upgradeCost > 0 ? 'rgba(255, 150, 0, 0.9)' : 'rgba(100, 100, 100, 0.9)';
                } else {
                    // Road type replacement
                    const destructionCost = this.calculateDestructionCost(existingRoad);
                    const replacementCost = destructionCost + totalCost;
                    displayText = `$${replacementCost}`;
                    backgroundColor = 'rgba(200, 60, 60, 0.9)'; // Red for replacement
                }
                textColor = '#ffffff';
            }
        } else {
            displayText = `$${totalCost}`;
            backgroundColor = 'rgba(0, 120, 0, 0.9)'; // Green for new construction
            textColor = '#ffffff';
        }

        // Draw cost label with clean styling
        ctx.font = '14px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Measure text for background sizing
        const textMetrics = ctx.measureText(displayText);
        const textWidth = textMetrics.width;
        const padding = 8;
        const labelWidth = textWidth + padding * 2;
        const labelHeight = 20;

        // Draw background rectangle (slightly above road center)
        const labelY = centerY - 25; // Raised above the road segment
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(centerX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight);

        // Draw subtle border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight);

        // Draw cost text
        ctx.fillStyle = textColor;
        ctx.fillText(displayText, centerX, labelY);

        ctx.restore();
        
        // No tooltip - clean visual feedback only
    }

    drawIlluminatedSegment(ctx) {
        const [from, to] = this.illuminatedSegment.split('-');
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);
        
        const fromIntersection = this.intersections.get(`${fromRow},${fromCol}`);
        const toIntersection = this.intersections.get(`${toRow},${toCol}`);
        
        if (!fromIntersection || !toIntersection) return;
        
        const road = this.roads.get(this.illuminatedSegment);
        if (!road) return;
        
        const roadType = this.roadTypes[road.type];
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        let roadWidth = availableSpace * Math.max(roadType.width, 1.0);
        
        if (road.infrastructure?.sidewalks) roadWidth += 4;
        if (road.infrastructure?.bikeLanes) roadWidth += 6;
        
        const roadShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, roadWidth);
        
        // Calculate fade based on time elapsed
        const elapsed = Date.now() - this.illuminationStartTime;
        const fadeProgress = Math.min(elapsed / 500, 1); // Fade over 500ms
        const opacity = 1 - fadeProgress;
        
        ctx.save();
        
        // Use different colors for different stop types
        let color;
        if (this.illuminatedStopType === 'bus') {
            color = `rgba(255, 220, 0, ${opacity * 0.6})`; // Yellow for buses
        } else {
            color = `rgba(0, 150, 255, ${opacity * 0.6})`; // Blue for subways
        }
        
        // Draw bright flash overlay
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(roadShape.p1.x, roadShape.p1.y);
        ctx.lineTo(roadShape.p2.x, roadShape.p2.y);
        ctx.lineTo(roadShape.p3.x, roadShape.p3.y);
        ctx.lineTo(roadShape.p4.x, roadShape.p4.y);
        ctx.closePath();
        ctx.fill();
        
        // Add bright border
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.restore();
    }

    drawTransitRoadHover(ctx) {
        const [from, to] = this.hoveredEdge.split('-');
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);
        
        // Use intersection positions
        const fromIntersection = this.intersections.get(`${fromRow},${fromCol}`);
        const toIntersection = this.intersections.get(`${toRow},${toCol}`);
        
        if (!fromIntersection || !toIntersection) return;
        
        // Check if road exists
        const existingRoad = this.roads.get(this.hoveredEdge);
        if (!existingRoad) return; // Only hover on existing roads for transit placement
        
        // Calculate road width
        const roadType = this.roadTypes[existingRoad.type];
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        let roadWidth = availableSpace * Math.max(roadType.width, 1.0);
        
        // Apply infrastructure options from existing road
        if (existingRoad.infrastructure?.sidewalks) roadWidth += 4;
        if (existingRoad.infrastructure?.bikeLanes) roadWidth += 6;
        
        // Calculate isometric road shape at same level as road indicators
        const roadShape = this.calculateIsometricRoadShape(fromIntersection, toIntersection, roadWidth);
        
        ctx.save();

        // Draw the road with transit-ready highlight (no shadows)
        const emoji = this.transitMode === 'bus' ? '🚌' : '🚇';
        const hoverColor = this.transitMode === 'bus' ? '#66BB6A' : '#42A5F5';
        ctx.fillStyle = hoverColor + '80'; // Semi-transparent
        
        ctx.beginPath();
        ctx.moveTo(roadShape.p1.x, roadShape.p1.y);
        ctx.lineTo(roadShape.p2.x, roadShape.p2.y);
        ctx.lineTo(roadShape.p3.x, roadShape.p3.y);
        ctx.lineTo(roadShape.p4.x, roadShape.p4.y);
        ctx.closePath();
        ctx.fill();
        
        // Add bright border
        ctx.strokeStyle = hoverColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add emoji in center of road segment using ground-level intersection midpoint
        // This matches the actual stop placement position
        const centerX = (fromIntersection.x + toIntersection.x) / 2;
        const centerY = (fromIntersection.y + toIntersection.y) / 2;
        
        ctx.font = '16px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, centerX, centerY);

        // Draw cost indicator for transit stop placement
        const cost = this.transitMode === 'bus' ? 50 : 200;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(centerX - 15, centerY + 18, 30, 14);

        ctx.fillStyle = 'white';
        ctx.font = '10px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`$${cost}`, centerX, centerY + 25);

        ctx.restore();
    }
    
    drawCostTooltip(ctx, x, y, roadType, isUpgrade) {
        const totalCost = this.calculateSegmentCost();
        const text = isUpgrade ? 'Already built' : `$${totalCost}`;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(x - 30, y - 12, 60, 24);
        
        ctx.fillStyle = isUpgrade ? 'rgba(255, 255, 255, 0.5)' : 'white';
        ctx.font = '12px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }
    
    drawUIOverlay(ctx) {
        // Mode selector at the top
        this.drawModeSelector(ctx);
        
        // Show mode-specific controls
        if (this.currentMode === 'roads') {
            this.drawRoadControls(ctx);
        } else if (this.currentMode === 'transit-stops') {
            this.drawTransitStopsControls(ctx);
        } else if (this.currentMode === 'transit-connect') {
            this.drawTransitConnectControls(ctx);
        }
        
        // Draw supply legend in bottom right (always visible)
        this.drawSupplyLegend(ctx);
        
        // Update sidebar transportation metrics
        this.updateSidebarMetrics();
    }

    drawModeSelector(ctx) {
        const startX = 20;
        const tabsY = 20; // Top left of grid space
        const tabWidth = 90;
        const tabHeight = 40;
        const tabRadius = 8;
        
        // Clear previous mode buttons
        this.modeButtons = [];
        
        ctx.save();
        
        // Draw tab background bar (connects the tabs) - matching terminal aesthetic
        const totalWidth = tabWidth * 3; // Now we have 3 tabs
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, startX, tabsY + 15, totalWidth, tabHeight - 15, 6);
        ctx.fill();
        
        // Roads tab
        const roadsActive = this.currentMode === 'roads';
        const roadsHovered = this.hoveredButton === 'roads';
        this.drawTab(ctx, startX, tabsY, tabWidth, tabHeight, tabRadius, 'ROADS', '🛣️', roadsActive, roadsHovered, () => this.setMode('roads'));
        
        // Add Stops tab
        const stopsActive = this.currentMode === 'transit-stops';
        const stopsHovered = this.hoveredButton === 'add stops';
        this.drawTab(ctx, startX + tabWidth, tabsY, tabWidth, tabHeight, tabRadius, 'ADD STOPS', '🚏', stopsActive, stopsHovered, () => this.setMode('transit-stops'));
        
        // Connect tab
        const connectActive = this.currentMode === 'transit-connect';
        const connectHovered = this.hoveredButton === 'connect';
        this.drawTab(ctx, startX + 2 * tabWidth, tabsY, tabWidth, tabHeight, tabRadius, 'CONNECT', '🔗', connectActive, connectHovered, () => this.setMode('transit-connect'));
        
        ctx.restore();
    }

    drawTab(ctx, x, y, width, height, radius, label, emoji, isActive, isHovered, onClick) {
        // Store onClick handler for click detection with generous hit area
        if (!this.modeButtons) this.modeButtons = [];
        this.modeButtons.push({ 
            x: x - 5, // Extend hit area 
            y: y - 5, 
            width: width + 10, 
            height: height + 10, 
            onClick, 
            id: label.toLowerCase() 
        });

        ctx.save();
        
        if (isActive) {
            // Active tab - clean terminal aesthetic
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.drawTabShape(ctx, x, y, width, height, radius, true);
            ctx.fill();
            
            // Active tab border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            this.drawTabShape(ctx, x, y, width, height, radius, true);
            ctx.stroke();
            
            // White text for active tab
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        } else if (isHovered) {
            // Hovered tab - subtle highlight matching terminal style
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.drawTabShape(ctx, x, y, width, height, radius, false);
            ctx.fill();
            
            // Subtle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            this.drawTabShape(ctx, x, y, width, height, radius, false);
            ctx.stroke();
            
            // White text for hovered tab
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        } else {
            // Inactive tab - terminal dark background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            this.drawTabShape(ctx, x, y, width, height, radius, false);
            ctx.fill();
            
            // Subtle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            this.drawTabShape(ctx, x, y, width, height, radius, false);
            ctx.stroke();
            
            // Dimmed text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        }

        // Tab content
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw emoji
        ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.fillText(emoji, x + width/2, y + height/2 - 5);
        
        // Draw label
        ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.fillText(label, x + width/2, y + height/2 + 10);
        
        ctx.restore();
    }

    drawTabShape(ctx, x, y, width, height, radius, isActive) {
        ctx.beginPath();
        // Top left corner
        ctx.moveTo(x + radius, y);
        // Top right corner
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        
        if (isActive) {
            // Active tabs connect to the bottom (no bottom border)
            ctx.lineTo(x + width, y + height);
            ctx.lineTo(x, y + height);
        } else {
            // Inactive tabs have rounded bottom corners
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        }
        
        // Back to top left
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    drawRoadControls(ctx) {
        // Enhanced road type selector with better styling
        const startX = 20;
        const roadRowY = 80; // Below tabs at top left
        const optionsRowY = 125; // Below road type buttons
        const buttonWidth = 110;
        const buttonHeight = 38;
        const buttonSpacing = 8;
        const borderRadius = 6;
        
        // First row: Road types with improved styling
        Object.entries(this.roadTypes).forEach(([type, config], index) => {
            const x = startX + index * (buttonWidth + buttonSpacing);
            
            // Draw rounded button background
            ctx.save();

            // Keep coordinates clean but don't force pixel alignment
            const alignedX = x;
            const alignedY = roadRowY;
            const alignedWidth = buttonWidth;
            const alignedHeight = buttonHeight;

            if (this.selectedRoadType === type) {
                // Selected button - solid background with crisp gradient
                const gradient = ctx.createLinearGradient(alignedX, alignedY, alignedX, alignedY + alignedHeight);
                gradient.addColorStop(0, config.color + 'DD');
                gradient.addColorStop(1, config.color + 'AA');
                ctx.fillStyle = gradient;
                this.drawRoundedRect(ctx, alignedX, alignedY, alignedWidth, alignedHeight, borderRadius);
                ctx.fill();

                // Sharp selected border
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                this.drawRoundedRect(ctx, alignedX, alignedY, alignedWidth, alignedHeight, borderRadius);
                ctx.stroke();
            } else {
                // Unselected button - clean solid background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                this.drawRoundedRect(ctx, alignedX, alignedY, alignedWidth, alignedHeight, borderRadius);
                ctx.fill();

                // Crisp subtle border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                this.drawRoundedRect(ctx, alignedX, alignedY, alignedWidth, alignedHeight, borderRadius);
                ctx.stroke();
            }
            ctx.restore();
            
            // Draw text with sharp, crisp typography
            ctx.save();
            ctx.imageSmoothingEnabled = false;

            // Main label - pixel-aligned for sharpness
            ctx.fillStyle = this.selectedRoadType === type ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const labelX = Math.floor(x + buttonWidth/2);
            const labelY = Math.floor(roadRowY + buttonHeight/2 - 6);
            ctx.fillText(config.label, labelX, labelY);

            // Cost text - slightly smaller and dimmer
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
            ctx.fillStyle = this.selectedRoadType === type ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.5)';

            const costX = Math.floor(x + buttonWidth/2);
            const costY = Math.floor(roadRowY + buttonHeight/2 + 8);
            ctx.fillText(`$${config.cost}`, costX, costY);

            ctx.restore();
        });
        
        // Second row: Enhanced infrastructure options
        Object.entries(this.infrastructureOptions).forEach(([type, config], index) => {
            const x = startX + index * (buttonWidth + buttonSpacing);
            const allowed = this.getAllowedInfrastructure(this.selectedRoadType);
            const isAllowed = allowed[type];
            const validation = this.validateInfrastructureSelection(this.selectedRoadType);
            
            // Check if this option conflicts with current selection
            const wouldConflict = this.selectedRoadType === 'arterial' && 
                                  !config.active && 
                                  ((type === 'sidewalks' && this.infrastructureOptions.bikeLanes.active) ||
                                   (type === 'bikeLanes' && this.infrastructureOptions.sidewalks.active));
            
            // Draw rounded button background with enhanced styling
            ctx.save();
            if (!isAllowed) {
                // Disabled appearance
                ctx.fillStyle = 'rgba(60, 60, 60, 0.4)';
                this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
                ctx.lineWidth = 1;
            } else if (wouldConflict) {
                // Conflicting appearance
                ctx.fillStyle = 'rgba(120, 60, 60, 0.6)';
                this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                ctx.strokeStyle = 'rgba(200, 100, 100, 0.7)';
                ctx.lineWidth = 2;
            } else if (config.active) {
                // Active infrastructure - gradient background
                console.log(`Drawing active button for ${type}`);
                const gradient = ctx.createLinearGradient(x, optionsRowY, x, optionsRowY + buttonHeight);
                gradient.addColorStop(0, config.color + '50');
                gradient.addColorStop(1, config.color + '30');
                ctx.fillStyle = gradient;
                this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                
                // Active border (no glow)
                ctx.strokeStyle = config.color;
                ctx.lineWidth = 2;
            } else {
                // Inactive but available
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1;
            }
            
            this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
            ctx.stroke();
            ctx.restore();
            
            // Enhanced checkbox indicator
            const checkboxSize = 14;
            const checkboxX = x + 8;
            const checkboxY = optionsRowY + buttonHeight/2 - checkboxSize/2;
            
            if (config.active) {
                // Active checkbox - filled background
                if (type === 'sidewalks') {
                    // Use a darker background for sidewalks so white checkmark is visible
                    ctx.fillStyle = '#666666';
                } else {
                    // Use the config color for other options
                    ctx.fillStyle = config.color;
                }
                this.drawRoundedRect(ctx, checkboxX, checkboxY, checkboxSize, checkboxSize, 2);
                ctx.fill();
                
                // Checkmark symbol - always white
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.lineCap = 'butt';
                ctx.beginPath();
                ctx.moveTo(checkboxX + 3, checkboxY + checkboxSize/2);
                ctx.lineTo(checkboxX + checkboxSize/2, checkboxY + checkboxSize - 4);
                ctx.lineTo(checkboxX + checkboxSize - 3, checkboxY + 3);
                ctx.stroke();
            } else {
                // Inactive checkbox
                ctx.strokeStyle = isAllowed ? 'rgba(255, 255, 255, 0.4)' : 'rgba(100, 100, 100, 0.3)';
                ctx.lineWidth = 1;
                this.drawRoundedRect(ctx, checkboxX, checkboxY, checkboxSize, checkboxSize, 2);
                ctx.stroke();
            }
            
            // Enhanced text styling
            const textX = x + buttonWidth/2 + 8;
            ctx.fillStyle = isAllowed ? (config.active ? '#ffffff' : 'rgba(255, 255, 255, 0.9)') : 'rgba(150, 150, 150, 0.7)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.label, textX, optionsRowY + buttonHeight/2 - 6);
            
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.fillStyle = isAllowed ? 'rgba(255, 255, 255, 0.7)' : 'rgba(150, 150, 150, 0.5)';
            ctx.fillText(`+$${config.cost}`, textX, optionsRowY + buttonHeight/2 + 8);
        });
        
        // Show total cost in new bottom row
        const totalCostRowY = 170; // New bottom row position
        const totalCost = this.calculateSegmentCost();
        
        // Draw background for cost display
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.drawRoundedRect(ctx, startX, totalCostRowY, buttonWidth * 2 + buttonSpacing, buttonHeight - 8, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, startX, totalCostRowY, buttonWidth * 2 + buttonSpacing, buttonHeight - 8, 6);
        ctx.stroke();
        ctx.restore();
        
        // Display total cost text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Total per segment: $${totalCost}`, startX + (buttonWidth + buttonSpacing/2), totalCostRowY + (buttonHeight - 8)/2);
    }

    // Mode switching
    setMode(mode) {
        console.log(`Switching to mode: ${mode}`);
        
        // Cancel any active transit actions when switching away from transit modes
        if (!mode.startsWith('transit')) {
            this.cancelTransitAction(false);
        }
        
        // Reset all selections when switching modes
        console.log('Resetting selections...');
        this.hoveredEdge = null;
        this.hoveredButton = null;
        this.selectedRoadType = 'local';
        this.hoveredParcel = null;
        
        // Reset infrastructure options to unselected
        if (this.infrastructureOptions) {
            console.log('Resetting infrastructure options...');
            Object.keys(this.infrastructureOptions).forEach(key => {
                console.log(`Setting ${key}.active = false`);
                this.infrastructureOptions[key].active = false;
            });
        }
        
        // Reset ALL transit-specific state when switching modes
        // Each mode should start completely fresh
        this.isPlacingTransitStop = false;
        this.transitMode = null;
        this.isCreatingRoute = false;
        this.selectedTransitStops = [];
        this.pendingRoute = null;

        // Hide route config sidebar when switching modes
        this.hideRouteConfigSidebar();
        
        console.log('Reset all transit state - modes should start fresh');
        
        // Clear any hover states
        document.body.style.cursor = 'auto';
        
        this.currentMode = mode;
        const displayName = mode.replace('-', ' ').toUpperCase();
        
        console.log(`Mode set to: ${this.currentMode}, infrastructure reset complete`);
        console.log('Current infrastructure state:', {
            sidewalks: this.infrastructureOptions.sidewalks.active,
            bikeLanes: this.infrastructureOptions.bikeLanes.active
        });
        
        // Force multiple redraws to update UI button states
        this.game.scheduleRender();
        setTimeout(() => this.game.scheduleRender(), 50);
        setTimeout(() => this.game.scheduleRender(), 100);
        
        // If entering connect mode, show instructions for route creation
        if (mode === 'transit-connect') {
            this.game.showNotification('Click Bus Route or Subway Route to start connecting stops', 'info');
        }
    }

    drawTransitStopsControls(ctx) {
        const transitY = 80; // Below tabs at top left  
        const startX = 20;
        const buttonWidth = 110; // Match road controls
        const buttonHeight = 38; // Match road controls
        const buttonSpacing = 8;
        
        // Clear previous transit buttons
        this.transitButtons = [];
        
        // Bus stop button - happier green
        ctx.save();
        const busButtonX = startX;
        this.drawTransitButton(ctx, busButtonX, transitY, buttonWidth, buttonHeight, 
            'Bus Stop', '#66BB6A', () => this.startTransitStopPlacement('bus'));

        // Subway entrance button - cheery blue
        const subwayButtonX = startX + buttonWidth + buttonSpacing;
        this.drawTransitButton(ctx, subwayButtonX, transitY, buttonWidth, buttonHeight,
            'Subway', '#42A5F5', () => this.startTransitStopPlacement('subway'));

        // Show current action status for stops mode
        if (this.isPlacingTransitStop) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            const emoji = this.transitMode === 'bus' ? '🚌' : '🚇';
            ctx.fillText(`${emoji} Placing ${this.transitMode} stop - Click on a road segment`, 
                startX + 2 * (buttonWidth + buttonSpacing) + 20, transitY + buttonHeight/2);
        }

        // Transit stats
        const statsX = ctx.canvas.width - 300;
        if (this.transitStops.size > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`Stops: ${this.transitStops.size}`, statsX, transitY + 10);
        }

        ctx.restore();
    }

    drawTransitConnectControls(ctx) {
        const transitY = 80; // Below tabs at top left
        const startX = 20;
        const buttonWidth = 110; // Match road controls
        const buttonHeight = 38; // Match road controls
        const buttonSpacing = 8;
        
        // Clear previous transit buttons
        this.transitButtons = [];
        
        ctx.save();
        
        // Route creation buttons
        const busRouteX = startX;
        this.drawTransitButton(ctx, busRouteX, transitY, buttonWidth, buttonHeight,
            'Bus Route', '#66BB6A', () => this.startRouteCreation('bus'));

        const subwayRouteX = startX + buttonWidth + buttonSpacing;
        this.drawTransitButton(ctx, subwayRouteX, transitY, buttonWidth, buttonHeight,
            'Subway Route', '#42A5F5', () => this.startRouteCreation('subway'));

        // Show route creation status at top left
        if (this.isCreatingRoute && this.routeCreationState !== 'configure_route') {
            // Show selection status at top left
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.fillText(`🔧 Creating ${this.transitMode} route - Selected: ${this.selectedTransitStops.length} stops`, 
                startX + 2 * (buttonWidth + buttonSpacing) + 20, transitY + buttonHeight/2);
        }
        
        // Route configuration now handled by sidebar panel - no canvas UI needed

        // Transit stats for routes
        const statsX = ctx.canvas.width - 300;
        if (this.transitRoutes.size > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`Routes: ${this.transitRoutes.size}`, statsX, transitY + 10);
        }

        ctx.restore();
    }

    drawTransitButton(ctx, x, y, width, height, label, color, onClick, isActive = false) {
        // Store onClick handler for click detection
        if (!this.transitButtons) this.transitButtons = [];
        this.transitButtons.push({ x, y, width, height, onClick });

        // Determine button state
        const isPlacingThisType = this.isPlacingTransitStop && 
            ((label.includes('Bus') && this.transitMode === 'bus') || 
             (label.includes('Subway') && this.transitMode === 'subway'));
        const isCreatingThisRoute = this.isCreatingRoute && 
            ((label.includes('Bus') && this.transitMode === 'bus') || 
             (label.includes('Subway') && this.transitMode === 'subway'));
        
        const buttonActive = isPlacingThisType || isCreatingThisRoute;

        ctx.save();
        
        if (buttonActive) {
            // Active state - terminal aesthetic with glow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.drawRoundedRect(ctx, x, y, width, height, 6);
            ctx.fill();
            
            // Glow effect matching terminal style
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            this.drawRoundedRect(ctx, x, y, width, height, 6);
            ctx.stroke();
            
            // White text on active buttons
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        } else {
            // Inactive state - terminal dark background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.drawRoundedRect(ctx, x, y, width, height, 6);
            ctx.fill();

            // Subtle border matching terminal style
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            this.drawRoundedRect(ctx, x, y, width, height, 6);
            ctx.stroke();
            
            // White text on inactive buttons  
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '13px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        }

        // Button text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + width/2, y + height/2);
        
        ctx.restore();
    }
    
    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
    
    drawSupplyLegend(ctx) {
        const legendX = ctx.canvas.width - 180;
        const legendY = ctx.canvas.height - 120;
        const legendWidth = 160;
        const legendHeight = 116; // Increased for 5 items
        
        // Legend background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
        
        // Legend border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
        
        // Legend title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '12px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Supply Types', legendX + 10, legendY + 18);
        
        // Legend items - matching new building categorization
        const legendItems = [
            { label: 'Housing', color: '#2196F3' },
            { label: 'Energy Producers', color: '#4CAF50' },
            { label: 'Services/Goods', color: '#FFC107' },
            { label: 'Mixed Function', color: '#FF9800' },
            { label: 'Job Creators', color: '#F44336' }
        ];
        
        legendItems.forEach((item, index) => {
            const itemY = legendY + 35 + index * 16;
            
            // Color swatch
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX + 10, itemY - 8, 12, 12);
            
            // Color swatch border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(legendX + 10, itemY - 8, 12, 12);
            
            // Label text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '10px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(item.label, legendX + 28, itemY);
        });
    }
    
    calculateSegmentCost() {
        let cost = this.roadTypes[this.selectedRoadType].cost;
        
        // Apply infrastructure restrictions by road type
        const allowedInfrastructure = this.getAllowedInfrastructure(this.selectedRoadType);
        
        if (this.infrastructureOptions.sidewalks.active && allowedInfrastructure.sidewalks) {
            cost += this.infrastructureOptions.sidewalks.cost;
        }
        if (this.infrastructureOptions.bikeLanes.active && allowedInfrastructure.bikeLanes) {
            cost += this.infrastructureOptions.bikeLanes.cost;
        }
        
        return cost;
    }
    
    getAllowedInfrastructure(roadType) {
        switch (roadType) {
            case 'local':
                return { sidewalks: true, bikeLanes: true }; // Can have both
            case 'arterial':
                return { sidewalks: true, bikeLanes: true }; // Can have either, but restrictions apply
            case 'highway':
                return { sidewalks: false, bikeLanes: false }; // No infrastructure
            default:
                return { sidewalks: false, bikeLanes: false };
        }
    }
    
    validateInfrastructureSelection(roadType) {
        const allowed = this.getAllowedInfrastructure(roadType);
        const hasSidewalks = this.infrastructureOptions.sidewalks.active;
        const hasBikeLanes = this.infrastructureOptions.bikeLanes.active;
        
        // Highway restrictions
        if (roadType === 'highway') {
            if (hasSidewalks || hasBikeLanes) {
                return {
                    valid: false,
                    message: 'Highways cannot have sidewalks or bike lanes'
                };
            }
        }
        
        // Arterial restrictions - can have one or the other, but not both
        if (roadType === 'arterial') {
            if (hasSidewalks && hasBikeLanes) {
                return {
                    valid: false,
                    message: 'Arterial roads can have sidewalks OR bike lanes, not both'
                };
            }
        }
        
        // Local roads can have both
        return { valid: true };
    }
    
    handleMouseMove(worldX, worldY) {
        let needsRedraw = false;
        
        // Check for tab hover effects
        const screenCoords = this.game.worldToScreenCoords(worldX, worldY);
        const previousHovered = this.hoveredButton;
        this.hoveredButton = null;
        
        if (this.modeButtons) {
            const tabsY = 20; // Top left position
            for (const button of this.modeButtons) {
                if (screenCoords.x >= button.x && screenCoords.x <= button.x + button.width &&
                    screenCoords.y >= tabsY && screenCoords.y <= tabsY + button.height) {
                    this.hoveredButton = button.id;
                    break;
                }
            }
        }
        
        if (previousHovered !== this.hoveredButton) {
            needsRedraw = true;
        }
        
        // First check for parcel hover (for visual feedback only)
        const hoveredParcel = this.findHoveredParcel(worldX, worldY);
        if (this.hoveredParcel !== hoveredParcel) {
            this.hoveredParcel = hoveredParcel;
            
            // Note: Tooltip handling is done by delayed tooltip system in game.js
            // to prevent interference with edge detection for road building
            needsRedraw = true;
        }
        
        // Then check for edge hover (for road building)
        let closestEdge = null;
        let closestDistance = Math.max(this.game.tileWidth * 0.6, 30); // Increased detection threshold with minimum
        
        // Check all possible edges between adjacent intersections
        this.intersections.forEach(intersection => {
            const { row, col } = intersection;
            
            // Check edges to adjacent intersections
            const neighbors = [
                { row: row - 1, col },     // North
                { row: row + 1, col },     // South
                { row, col: col - 1 },     // West
                { row, col: col + 1 }      // East
            ];
            
            neighbors.forEach(neighbor => {
                if (neighbor.row >= 0 && neighbor.row <= this.game.gridSize &&
                    neighbor.col >= 0 && neighbor.col <= this.game.gridSize) {
                    
                    const neighborKey = `${neighbor.row},${neighbor.col}`;
                    const neighborIntersection = this.intersections.get(neighborKey);
                    
                    // Only allow edges that don't extend beyond the parcel grid
                    const edgeKey = this.getEdgeKey(row, col, neighbor.row, neighbor.col);
                    if (neighborIntersection && this.isValidRoadEdge(edgeKey)) {
                        // Calculate distance from mouse to edge midpoint
                        const midX = (intersection.x + neighborIntersection.x) / 2;
                        const midY = (intersection.y + neighborIntersection.y) / 2;
                        const dist = Math.sqrt(Math.pow(worldX - midX, 2) + Math.pow(worldY - midY, 2));
                        
                        if (dist < closestDistance) {
                            closestDistance = dist;
                            closestEdge = edgeKey;
                        }
                    }
                }
            });
        });
        
        if (this.hoveredEdge !== closestEdge) {
            this.hoveredEdge = closestEdge;
            needsRedraw = true;
        }
        
        return needsRedraw;
    }
    
    isValidRoadEdge(edgeKey) {
        // Check if a road edge connects intersections that have adjacent parcels
        // This prevents roads from extending beyond the actual parcel grid
        const [from, to] = edgeKey.split('-');
        const [fromRow, fromCol] = from.split(',').map(Number);
        const [toRow, toCol] = to.split(',').map(Number);
        
        // An edge is valid if both endpoints have at least one adjacent parcel within bounds
        const fromHasParcel = this.intersectionHasAdjacentParcel(fromRow, fromCol);
        const toHasParcel = this.intersectionHasAdjacentParcel(toRow, toCol);
        
        return fromHasParcel && toHasParcel;
    }
    
    intersectionHasAdjacentParcel(intersectionRow, intersectionCol) {
        // Check if intersection has any adjacent parcels within the grid
        const adjacentParcels = [
            { row: intersectionRow - 1, col: intersectionCol - 1 }, // top-left
            { row: intersectionRow - 1, col: intersectionCol },     // top-right
            { row: intersectionRow, col: intersectionCol - 1 },     // bottom-left
            { row: intersectionRow, col: intersectionCol }          // bottom-right
        ];
        
        return adjacentParcels.some(parcel => 
            parcel.row >= 0 && parcel.row < this.game.gridSize &&
            parcel.col >= 0 && parcel.col < this.game.gridSize
        );
    }
    
    findHoveredParcel(worldX, worldY) {
        // Check if mouse is over any parcel
        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (!parcel) continue;
                
                const pos = this.getParcelCenter(row, col);
                const shrunkWidth = this.game.tileWidth * this.parcelShrinkFactor;
                const shrunkHeight = this.game.tileHeight * this.parcelShrinkFactor;
                
                // Check if mouse is within the shrunken diamond shape
                if (this.isPointInDiamond(worldX, worldY, pos.x, pos.y, shrunkWidth, shrunkHeight)) {
                    return { row, col, building: parcel.building, owner: parcel.owner, parcel };
                }
            }
        }
        return null;
    }
    
    isPointInDiamond(px, py, cx, cy, width, height) {
        // Check if point is inside diamond (hexagon) shape
        const dx = Math.abs(px - cx);
        const dy = Math.abs(py - cy);
        
        // Simple diamond/rhombus collision detection
        return (dx / (width / 2) + dy / (height / 2)) <= 1;
    }
    
    showParcelTooltip(parcelData) {
        // Use the game's existing tooltip system
        if (this.game.showTooltip) {
            // Get building stats from the game
            const { row, col, building, owner } = parcelData;
            
            // Create tooltip content similar to main game
            let tooltipContent = '';
            
            if (building) {
                tooltipContent += `<strong>${building.name}</strong><br>`;
                tooltipContent += `Category: ${building.category}<br>`;
                tooltipContent += `Owner: ${owner || 'City'}<br>`;
                
                // Add building stats if available
                if (building.capacity) tooltipContent += `Capacity: ${building.capacity}<br>`;
                if (building.efficiency) tooltipContent += `Efficiency: ${Math.round(building.efficiency * 100)}%<br>`;
                
                // Add needs/requirements
                if (building.requirements) {
                    tooltipContent += `<br><strong>Needs:</strong><br>`;
                    Object.entries(building.requirements).forEach(([key, value]) => {
                        if (value > 0) {
                            tooltipContent += `${key}: ${value}<br>`;
                        }
                    });
                }
            }
            
            // Use unified tooltip manager instead of legacy DOM cache
            if (this.game.tooltipManager) {
                this.game.tooltipManager.show(tooltipContent, 100, 100, {
                    html: true,
                    delay: 0
                });
            }
        }
    }
    
    hideParcelTooltip() {
        // Use unified tooltip manager
        if (this.game.tooltipManager) {
            this.game.tooltipManager.hide();
        }
    }
    
    
    handleClick(worldX, worldY, screenX, screenY) {
        // Check if clicking on UI buttons using screen coordinates
        const roadRowY = 80; // Top left position
        const optionsRowY = 125; // Below road type buttons
        const buttonWidth = 100;
        const buttonHeight = 35;
        const startX = 20;
        
        // Use screen coordinates for UI click detection
        const mouseX = screenX;
        const mouseY = screenY;
        
        // Check road type selection
        let uiClicked = false;
        Object.keys(this.roadTypes).forEach((type, index) => {
            const x = startX + index * (buttonWidth + 10);
            if (mouseX >= x && mouseX <= x + buttonWidth && 
                mouseY >= roadRowY && mouseY <= roadRowY + buttonHeight) {
                const previousRoadType = this.selectedRoadType;
                this.selectedRoadType = type;
                
                // Auto-uncheck infrastructure when switching to highway
                if (type === 'highway') {
                    this.infrastructureOptions.sidewalks.active = false;
                    this.infrastructureOptions.bikeLanes.active = false;
                }
                
                uiClicked = true;
            }
        });
        
        // Check infrastructure options with restrictions
        Object.keys(this.infrastructureOptions).forEach((type, index) => {
            const x = startX + index * (buttonWidth + 10);
            if (mouseX >= x && mouseX <= x + buttonWidth && 
                mouseY >= optionsRowY && mouseY <= optionsRowY + buttonHeight) {
                
                const allowed = this.getAllowedInfrastructure(this.selectedRoadType);
                const isAllowed = allowed[type];
                
                if (!isAllowed) {
                    // Infrastructure not allowed for this road type
                    uiClicked = true;
                    return;
                }
                
                // Handle arterial road infrastructure switching
                if (this.selectedRoadType === 'arterial') {
                    if (type === 'sidewalks' && this.infrastructureOptions.bikeLanes.active) {
                        // Switch from bike lanes to sidewalks
                        this.infrastructureOptions.bikeLanes.active = false;
                        this.infrastructureOptions.sidewalks.active = true;
                    } else if (type === 'bikeLanes' && this.infrastructureOptions.sidewalks.active) {
                        // Switch from sidewalks to bike lanes
                        this.infrastructureOptions.sidewalks.active = false;
                        this.infrastructureOptions.bikeLanes.active = true;
                    } else {
                        // Toggle the selected option normally
                        this.infrastructureOptions[type].active = !this.infrastructureOptions[type].active;
                    }
                } else {
                    // For non-arterial roads, toggle normally
                    this.infrastructureOptions[type].active = !this.infrastructureOptions[type].active;
                }
                uiClicked = true;
            }
        });
        
        // If clicked on UI, don't process road placement
        if (uiClicked) return true;
        
        // Handle road placement
        if (!this.hoveredEdge) return false;
        
        // Validate infrastructure selection
        const validation = this.validateInfrastructureSelection(this.selectedRoadType);
        if (!validation.valid) {
            this.game.showNotification(validation.message, 'error');
            return true;
        }
        
        // Calculate total cost
        const totalCost = this.calculateSegmentCost();
        
        // Use multiplayer system for road building
        if (this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
            // Create action data
            const actionData = {
                type: 'BUILD_ROAD',
                roadKey: this.hoveredEdge,
                roadType: this.selectedRoadType,
                hasSidewalks: this.infrastructureOptions.sidewalks.active,
                hasBikeLanes: this.infrastructureOptions.bikeLanes.active,
                cost: totalCost,
                isUpgrade: this.roads.has(this.hoveredEdge),
                existingRoad: this.roads.get(this.hoveredEdge) || null
            };
            
            // OPTIMISTIC UPDATE: Add road immediately for instant visual feedback
            const roadData = {
                type: this.selectedRoadType,
                hasSidewalks: this.infrastructureOptions.sidewalks.active,
                hasBikeLanes: this.infrastructureOptions.bikeLanes.active,
                cost: totalCost,
                isUpgrade: this.roads.has(this.hoveredEdge),
                existingRoad: this.roads.get(this.hoveredEdge) || null,
                timestamp: Date.now(),
                optimistic: true // Mark as optimistic until server confirms
            };
            
            // Store current state for rollback
            const previousRoadData = this.roads.get(this.hoveredEdge) || null;
            
            // Add road to local map immediately
            this.roads.set(this.hoveredEdge, roadData);
            
            // Send action and handle response
            this.game.multiplayerManager.broadcastAction(actionData).then(result => {
                if (!result.success) {
                    // Rollback on failure
                    if (previousRoadData) {
                        this.roads.set(this.hoveredEdge, previousRoadData);
                    } else {
                        this.roads.delete(this.hoveredEdge);
                    }
                    this.game.scheduleRender?.();
                }
            }).catch(error => {
                console.error('Road building failed:', error);
                // Rollback on error
                if (previousRoadData) {
                    this.roads.set(this.hoveredEdge, previousRoadData);
                } else {
                    this.roads.delete(this.hoveredEdge);
                }
                this.game.scheduleRender?.();
            });
        } else {
            // Fallback to local road building for offline mode
            // Check if road already exists
            if (this.roads.has(this.hoveredEdge)) {
                const existingRoad = this.roads.get(this.hoveredEdge);
                const upgradeResult = this.handleRoadUpgradeOrReplacement(existingRoad, totalCost);
                
                if (upgradeResult.success) {
                    // Use CashManager for transaction safety
                    if (this.game.cashManager) {
                        this.game.cashManager.spend(upgradeResult.cost, 'Road upgrade');
                    } else {
                        this.game.playerCash -= upgradeResult.cost;
                    }
                    this.roads.set(this.hoveredEdge, {
                        type: this.selectedRoadType,
                        hasSidewalks: this.infrastructureOptions.sidewalks.active,
                        hasBikeLanes: this.infrastructureOptions.bikeLanes.active,
                        builtTime: Date.now()
                    });
                    this.game.showNotification(upgradeResult.message, 'success');
                } else {
                    this.game.showNotification(upgradeResult.message, 'error');
                }
            } else {
                // Build new road with selected options
                const currentCash = this.game.cashManager ? this.game.cashManager.getBalance() : this.game.playerCash;
                if (currentCash >= totalCost) {
                    // Use CashManager for transaction safety
                    if (this.game.cashManager) {
                        this.game.cashManager.spend(totalCost, 'Road construction');
                    } else {
                        this.game.playerCash -= totalCost;
                    }
                    this.roads.set(this.hoveredEdge, {
                        type: this.selectedRoadType,
                        hasSidewalks: this.infrastructureOptions.sidewalks.active,
                        hasBikeLanes: this.infrastructureOptions.bikeLanes.active,
                        builtTime: Date.now()
                    });
                    
                    
                    this.game.showNotification(`Built road segment ($${totalCost})`, 'success');
                } else {
                    this.game.showNotification(`Insufficient funds: need $${totalCost}, have $${currentCash}`, 'error');
                    // Add red blink visual feedback
                    if (this.game.showInsufficientFundsFeedback) {
                        this.game.showInsufficientFundsFeedback();
                    }
                }
            }
        }
        
        return true; // Needs redraw
    }
    
    handleRoadUpgradeOrReplacement(existingRoad, newRoadCost) {
        const isSameType = existingRoad.type === this.selectedRoadType;
        const hasNewSidewalks = this.infrastructureOptions.sidewalks.active;
        const hasNewBikeLanes = this.infrastructureOptions.bikeLanes.active;
        
        // Validate infrastructure restrictions for the current road type
        const validation = this.validateInfrastructureSelection(this.selectedRoadType);
        if (!validation.valid) {
            return {
                success: false,
                message: validation.message
            };
        }
        
        // Check if this is just adding infrastructure to same road type
        if (isSameType) {
            const allowed = this.getAllowedInfrastructure(this.selectedRoadType);
            const canAddSidewalks = !existingRoad.hasSidewalks && hasNewSidewalks && allowed.sidewalks;
            const canAddBikeLanes = !existingRoad.hasBikeLanes && hasNewBikeLanes && allowed.bikeLanes;
            
            if (canAddSidewalks || canAddBikeLanes) {
                // Calculate cost for just the new infrastructure
                let upgradeCost = 0;
                if (canAddSidewalks) upgradeCost += this.infrastructureOptions.sidewalks.cost;
                if (canAddBikeLanes) upgradeCost += this.infrastructureOptions.bikeLanes.cost;
                
                const currentCash = this.game.cashManager ? this.game.cashManager.getBalance() : this.game.playerCash;
                if (currentCash >= upgradeCost) {
                    const addedItems = [];
                    if (canAddSidewalks) addedItems.push('sidewalks');
                    if (canAddBikeLanes) addedItems.push('bike lanes');
                    
                    return {
                        success: true,
                        cost: upgradeCost,
                        message: `Added ${addedItems.join(' and ')} ($${upgradeCost})`
                    };
                } else {
                    return {
                        success: false,
                        message: `Insufficient funds for upgrade: need $${upgradeCost}, have $${currentCash}`
                    };
                }
            } else {
                // Same road type, same infrastructure - allow rebuild (no cost)
                const exactMatch = existingRoad.hasSidewalks === hasNewSidewalks && 
                                 existingRoad.hasBikeLanes === hasNewBikeLanes;
                
                if (exactMatch) {
                    return {
                        success: false,
                        message: 'Road already exists with identical configuration'
                    };
                } else {
                    // Different infrastructure combination - treat as replacement
                    const destructionCost = this.calculateDestructionCost(existingRoad);
                    const totalCost = destructionCost + newRoadCost;
                    
                    if (this.game.playerCash >= totalCost) {
                        return {
                            success: true,
                            cost: totalCost,
                            message: `Rebuilt ${existingRoad.type} with different infrastructure ($${destructionCost} destruction + $${newRoadCost} construction = $${totalCost})`
                        };
                    } else {
                        return {
                            success: false,
                            message: `Insufficient funds for rebuild: need $${totalCost}, have $${this.game.playerCash}`
                        };
                    }
                }
            }
        } else {
            // Different road type - calculate destruction cost + new road cost
            const destructionCost = this.calculateDestructionCost(existingRoad);
            const totalCost = destructionCost + newRoadCost;
            
            if (this.game.playerCash >= totalCost) {
                return {
                    success: true,
                    cost: totalCost,
                    message: `Replaced ${existingRoad.type} with ${this.selectedRoadType} ($${destructionCost} destruction + $${newRoadCost} construction = $${totalCost})`
                };
            } else {
                return {
                    success: false,
                    message: `Insufficient funds for replacement: need $${totalCost} (destruction $${destructionCost} + construction $${newRoadCost}), have $${this.game.playerCash}`
                };
            }
        }
    }
    
    calculateDestructionCost(road) {
        let cost = this.roadTypes[road.type].cost;
        if (road.hasSidewalks) cost += this.infrastructureOptions.sidewalks.cost;
        if (road.hasBikeLanes) cost += this.infrastructureOptions.bikeLanes.cost;
        return cost;
    }
    
    calculateTransportationMetrics() {
        // Cache expensive calculations to avoid recalculating every frame
        if (!this.metricsCache || this.metricsLastUpdate !== this.roads.size) {
            const modeShare = this.calculateModeShare();
            
            this.metricsCache = {
                networkConnectivity: this.calculateNetworkConnectivity(),
                avgCommuteTime: this.calculateAverageCommuteTime(),
                modeShare: modeShare,
                throughput: this.calculateNetworkThroughput(),
                accessibilityScore: this.calculateAccessibilityScore(),
                infrastructureCoverage: this.calculateInfrastructureCoverage(),
                // New impact metrics
                affordabilityScore: this.calculateAffordabilityScore(modeShare),
                healthScore: this.calculateHealthScore(modeShare),
                environmentalScore: this.calculateEnvironmentalScore(modeShare),
                parcelConnectivity: this.calculateParcelConnectivity()
            };
            this.metricsLastUpdate = this.roads.size;
        }
        
        return this.metricsCache;
    }
    
    calculateAffordabilityScore(modeShare) {
        // Higher bike/walk rates = lower transportation costs = better affordability
        const carDependency = modeShare.car / 100;
        const activeModes = (modeShare.bike + modeShare.walk) / 100;
        
        // Base affordability (0-100, higher is better)
        let affordability = 50; // Baseline
        
        // Active transportation reduces costs
        affordability += activeModes * 30; // Up to +30 for 100% active modes
        
        // Car dependency increases costs
        affordability -= carDependency * 20; // Up to -20 for 100% car dependency
        
        // Road maintenance costs affect affordability
        const maintenanceCost = Array.from(this.roads.values())
            .reduce((sum, road) => sum + this.roadTypes[road.type].maintenance, 0);
        affordability -= Math.min(maintenanceCost / 10, 20); // Cap impact at -20
        
        return Math.max(0, Math.min(100, Math.round(affordability)));
    }
    
    calculateHealthScore(modeShare) {
        // More walking/biking = better health outcomes
        const activeModes = (modeShare.bike + modeShare.walk) / 100;
        const carDependency = modeShare.car / 100;
        
        let health = 30; // Base health score
        
        // Active transportation improves health
        health += activeModes * 50; // Up to +50 for 100% active modes
        
        // Car dependency reduces health (sedentary lifestyle)
        health -= carDependency * 15; // Up to -15 for 100% car dependency
        
        // Infrastructure quality affects safety and health
        const infrastructureQuality = this.calculateInfrastructureCoverage();
        const avgCoverage = (infrastructureQuality.sidewalks + infrastructureQuality.bikeLanes) / 2;
        health += (avgCoverage / 100) * 20; // Up to +20 for 100% coverage
        
        return Math.max(0, Math.min(100, Math.round(health)));
    }
    
    calculateEnvironmentalScore(modeShare) {
        // Less car usage = better environmental impact
        const carDependency = modeShare.car / 100;
        const activeModes = (modeShare.bike + modeShare.walk) / 100;
        
        let environmental = 40; // Base environmental score
        
        // Active transportation is environmentally friendly
        environmental += activeModes * 40; // Up to +40 for 100% active modes
        
        // Car dependency hurts environment
        environmental -= carDependency * 30; // Up to -30 for 100% car dependency
        
        // Highway infrastructure has higher environmental cost
        const highways = Array.from(this.roads.values()).filter(road => road.type === 'highway').length;
        const totalRoads = this.roads.size || 1;
        environmental -= (highways / totalRoads) * 15; // Up to -15 for all highways
        
        return Math.max(0, Math.min(100, Math.round(environmental)));
    }
    
    calculateParcelConnectivity() {
        // Efficient connectivity check using intersection-based connection
        const connectedParcels = new Set();
        const roadIntersections = new Set();
        
        // Build set of all intersections that have roads
        for (const [edgeKey] of this.roads) {
            const [fromKey, toKey] = edgeKey.split('-');
            roadIntersections.add(fromKey);
            roadIntersections.add(toKey);
        }
        
        // Check which parcels have connected intersections (at their corners)
        for (let row = 0; row < this.game.gridHeight; row++) {
            for (let col = 0; col < this.game.gridWidth; col++) {
                const parcel = this.game.parcels[row][col];
                if (parcel && parcel.building) {
                    // Check if any of the parcel's corner intersections have roads
                    const corners = [
                        `${row},${col}`,         // Top-left
                        `${row},${col + 1}`,     // Top-right  
                        `${row + 1},${col}`,     // Bottom-left
                        `${row + 1},${col + 1}`  // Bottom-right
                    ];
                    
                    if (corners.some(corner => roadIntersections.has(corner))) {
                        connectedParcels.add(`${row},${col}`);
                    }
                }
            }
        }
        
        // Calculate total parcels with buildings
        let totalParcels = 0;
        for (let row = 0; row < this.game.gridHeight; row++) {
            for (let col = 0; col < this.game.gridWidth; col++) {
                const parcel = this.game.parcels[row][col];
                if (parcel && parcel.building) {
                    totalParcels++;
                }
            }
        }
        
        return totalParcels > 0 ? Math.round((connectedParcels.size / totalParcels) * 100) : 0;
    }
    
    calculateNetworkConnectivity() {
        if (this.roads.size === 0) return 0;
        
        // Build adjacency graph from roads
        const graph = new Map();
        const intersections = new Set();
        
        for (const [edgeKey, road] of this.roads) {
            const [fromKey, toKey] = edgeKey.split('-');
            intersections.add(fromKey);
            intersections.add(toKey);
            
            if (!graph.has(fromKey)) graph.set(fromKey, new Set());
            if (!graph.has(toKey)) graph.set(toKey, new Set());
            
            graph.get(fromKey).add(toKey);
            graph.get(toKey).add(fromKey);
        }
        
        // Calculate connectivity as percentage of possible connections
        const totalIntersections = intersections.size;
        const actualConnections = this.roads.size;
        const maxPossibleConnections = (totalIntersections * (totalIntersections - 1)) / 2;
        
        return maxPossibleConnections > 0 ? Math.round((actualConnections / maxPossibleConnections) * 100) : 0;
    }
    
    calculateAverageCommuteTime() {
        // Find residential and job parcels
        const residentialParcels = [];
        const jobParcels = [];
        
        for (let row = 0; row < this.game.gridHeight; row++) {
            for (let col = 0; col < this.game.gridWidth; col++) {
                const parcel = this.game.parcels[row][col];
                if (parcel && parcel.building) {
                    const building = this.game.buildings[parcel.building];
                    if (building && building.supply) {
                        if (building.supply.includes('housing')) {
                            residentialParcels.push({row, col});
                        }
                        if (building.supply.includes('jobs')) {
                            jobParcels.push({row, col});
                        }
                    }
                }
            }
        }
        
        if (residentialParcels.length === 0 || jobParcels.length === 0) return 0;
        
        let totalCommuteTime = 0;
        let commuteCount = 0;
        
        // Sample commute times (limit to avoid performance issues)
        const maxSamples = 20;
        const resSample = residentialParcels.slice(0, Math.min(maxSamples, residentialParcels.length));
        const jobSample = jobParcels.slice(0, Math.min(maxSamples, jobParcels.length));
        
        for (const res of resSample) {
            for (const job of jobSample) {
                const commuteTime = this.calculateCommuteTime(res, job);
                if (commuteTime > 0) {
                    totalCommuteTime += commuteTime;
                    commuteCount++;
                }
            }
        }
        
        return commuteCount > 0 ? Math.round(totalCommuteTime / commuteCount) : 0;
    }
    
    calculateCommuteTime(from, to) {
        // Simple Manhattan distance with road type modifiers
        const distance = Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
        
        // Base time (minutes per grid unit)
        let timePerUnit = 5; // 5 minutes base walking time
        
        // Check for roads along the path (simplified - just check if roads exist)
        const hasRoads = this.roads.size > 0;
        const hasHighways = Array.from(this.roads.values()).some(road => road.type === 'highway');
        const hasArterials = Array.from(this.roads.values()).some(road => road.type === 'arterial');
        
        if (hasHighways) timePerUnit = 1; // Fast highway travel
        else if (hasArterials) timePerUnit = 2; // Medium arterial travel  
        else if (hasRoads) timePerUnit = 3; // Local road travel
        // else walking: 5 minutes
        
        return Math.round(distance * timePerUnit);
    }
    
    calculateModeShare() {
        const totalRoads = this.roads.size;
        if (totalRoads === 0) return {walk: 100, bike: 0, car: 0};
        
        let bikeInfrastructure = 0;
        let walkInfrastructure = 0;
        let carInfrastructure = 0;
        
        for (const road of this.roads.values()) {
            if (road.hasBikeLanes) bikeInfrastructure++;
            if (road.hasSidewalks) walkInfrastructure++;
            carInfrastructure++; // All roads support cars
        }
        
        // Calculate mode preferences based on infrastructure availability
        const bikeShare = Math.round((bikeInfrastructure / totalRoads) * 30); // Max 30% bike
        const walkShare = Math.round((walkInfrastructure / totalRoads) * 20); // Max 20% walk  
        const carShare = 100 - bikeShare - walkShare;
        
        return {
            walk: Math.max(walkShare, 10), // Minimum 10% walking
            bike: bikeShare,
            car: Math.max(carShare, 0)
        };
    }
    
    calculateNetworkThroughput() {
        let totalCapacity = 0;
        
        for (const road of this.roads.values()) {
            let capacity = this.roadTypes[road.type].capacity;
            if (road.hasBikeLanes) capacity *= 1.2; // Bike lanes add capacity
            totalCapacity += capacity;
        }
        
        return totalCapacity;
    }
    
    calculateAccessibilityScore() {
        // Score based on how well different parcel types are connected
        const parcelTypes = new Set();
        
        for (let row = 0; row < this.game.gridHeight; row++) {
            for (let col = 0; col < this.game.gridWidth; col++) {
                const parcel = this.game.parcels[row][col];
                if (parcel && parcel.building) {
                    const building = this.game.buildings[parcel.building];
                    if (building && building.supply) {
                        building.supply.forEach(s => parcelTypes.add(s));
                    }
                }
            }
        }
        
        // Higher score for more connected diverse parcels
        const diversity = parcelTypes.size;
        const connectivity = this.calculateNetworkConnectivity();
        
        return Math.round((diversity * 10) + (connectivity * 0.5));
    }
    
    calculateInfrastructureCoverage() {
        const totalRoads = this.roads.size;
        if (totalRoads === 0) return {sidewalks: 0, bikeLanes: 0};
        
        let sidewalkCount = 0;
        let bikeLaneCount = 0;
        
        for (const road of this.roads.values()) {
            if (road.hasSidewalks) sidewalkCount++;
            if (road.hasBikeLanes) bikeLaneCount++;
        }
        
        return {
            sidewalks: Math.round((sidewalkCount / totalRoads) * 100),
            bikeLanes: Math.round((bikeLaneCount / totalRoads) * 100)
        };
    }
    
    updateSidebarMetrics() {
        const metrics = this.calculateTransportationMetrics();
        
        // Update sidebar metrics elements
        const networkConnectivity = document.getElementById('network-connectivity');
        const avgCommuteTime = document.getElementById('avg-commute-time');
        const mobilityAffordability = document.getElementById('mobility-affordability');
        const mobilityHealth = document.getElementById('mobility-health');
        const mobilityEnvironment = document.getElementById('mobility-environment');
        const totalRoads = document.getElementById('total-roads');
        
        if (networkConnectivity) {
            networkConnectivity.textContent = `${metrics.networkConnectivity}%`;
        }
        
        if (avgCommuteTime) {
            avgCommuteTime.textContent = metrics.avgCommuteTime > 0 ? 
                `${metrics.avgCommuteTime} min` : 'No data';
        }
        
        if (mobilityAffordability) {
            mobilityAffordability.textContent = metrics.affordabilityScore;
            // Add color coding
            mobilityAffordability.style.color = 
                metrics.affordabilityScore >= 70 ? '#4ade80' : 
                metrics.affordabilityScore >= 40 ? '#fbbf24' : '#f87171';
        }
        
        if (mobilityHealth) {
            mobilityHealth.textContent = metrics.healthScore;
            mobilityHealth.style.color = 
                metrics.healthScore >= 70 ? '#4ade80' : 
                metrics.healthScore >= 40 ? '#fbbf24' : '#f87171';
        }
        
        if (mobilityEnvironment) {
            mobilityEnvironment.textContent = metrics.environmentalScore;
            mobilityEnvironment.style.color = 
                metrics.environmentalScore >= 70 ? '#4ade80' : 
                metrics.environmentalScore >= 40 ? '#fbbf24' : '#f87171';
        }
        
        if (totalRoads) {
            totalRoads.textContent = this.roads.size;
        }
    }
    
    handleKeyPress(key) {
        // Delete key removes road
        if (key === 'Delete' && this.hoveredEdge && this.roads.has(this.hoveredEdge)) {
            this.roads.delete(this.hoveredEdge);
            this.game.showNotification('Road removed', 'info');
            return true;
        }
        
        return false;
    }
    
    getEdgeKey(row1, col1, row2, col2) {
        // Ensure consistent edge keys regardless of direction
        if (row1 > row2 || (row1 === row2 && col1 > col2)) {
            return `${row2},${col2}-${row1},${col1}`;
        }
        return `${row1},${col1}-${row2},${col2}`;
    }
    
    // API for game integration
    getNetworkData() {
        const network = {
            roads: Array.from(this.roads.entries()).map(([key, road]) => {
                const [from, to] = key.split('-');
                const [fromRow, fromCol] = from.split(',').map(Number);
                const [toRow, toCol] = to.split(',').map(Number);
                
                return {
                    from: {row: fromRow, col: fromCol},
                    to: {row: toRow, col: toCol},
                    type: road.type,
                    capacity: this.roadTypes[road.type].capacity
                };
            }),
            totalMaintenance: this.calculateMaintenanceCost()
        };
        
        return network;
    }
    
    calculateMaintenanceCost() {
        let total = 0;
        this.roads.forEach(road => {
            total += this.roadTypes[road.type].maintenance;
        });
        return total;
    }
    
    getParcelConnectivity(row, col) {
        // Check if parcel is connected to the road network
        const adjacentIntersections = this.getAdjacentIntersections(row, col);
        
        let connected = false;
        let networkDistance = null;
        
        // Check if any adjacent intersections have roads
        for (const intersection of adjacentIntersections) {
            if (intersection.connected && intersection.connected.length > 0) {
                connected = true;
                // Simple distance calculation (could be enhanced)
                networkDistance = intersection.connected.length;
                break;
            }
        }
        
        return {
            connected,
            networkDistance
        };
    }
    
    getNearbyRoads(row, col) {
        // Get roads adjacent to this parcel
        const nearbyRoads = [];
        const adjacentIntersections = this.getAdjacentIntersections(row, col);
        
        // Check roads connected to adjacent intersections
        for (const intersection of adjacentIntersections) {
            const intersectionKey = `${intersection.row},${intersection.col}`;
            
            // Look for roads that connect to this intersection
            this.roads.forEach((road, edgeKey) => {
                const [from, to] = edgeKey.split('-');
                if (from === intersectionKey || to === intersectionKey) {
                    nearbyRoads.push({
                        type: road.type,
                        cost: this.roadTypes[road.type].cost,
                        capacity: this.roadTypes[road.type].capacity
                    });
                }
            });
        }
        
        return nearbyRoads;
    }
    
    getAdjacentIntersections(row, col) {
        // Get the 4 intersections around a parcel
        const intersections = [];
        
        // Parcel (row,col) is surrounded by intersections at:
        // (row, col), (row, col+1), (row+1, col), (row+1, col+1)
        const intersectionCoords = [
            {row: row, col: col},
            {row: row, col: col + 1},
            {row: row + 1, col: col},
            {row: row + 1, col: col + 1}
        ];
        
        intersectionCoords.forEach(coord => {
            const key = `${coord.row},${coord.col}`;
            const intersection = this.intersections.get(key);
            if (intersection) {
                intersections.push({
                    ...intersection,
                    row: coord.row,
                    col: coord.col
                });
            }
        });
        
        return intersections;
    }

    // Get the proper position for a transit stop on a road segment
    getTransitStopPosition(stop) {
        const startIntersection = this.intersections.get(`${stop.startRow},${stop.startCol}`);
        const endIntersection = this.intersections.get(`${stop.endRow},${stop.endCol}`);
        
        if (!startIntersection || !endIntersection) {
            return null;
        }
        
        // Use the same road width calculation as preview to ensure consistency
        const road = this.roads.get(stop.roadSegment);
        if (!road) return null;
        
        const roadType = this.roadTypes[road.type] || this.roadTypes.local;
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        let roadWidth = availableSpace * Math.max(roadType.width, 1.0);
        
        // Apply infrastructure options using same logic as preview
        if (road.infrastructure?.sidewalks) roadWidth += 4;
        if (road.infrastructure?.bikeLanes) roadWidth += 6;
        
        // Calculate the road shape to get the actual road center
        const roadShape = this.calculateIsometricRoadShape(startIntersection, endIntersection, roadWidth);
        
        if (roadShape) {
            // Return the exact center using the midpoint between intersection centers
            // This ensures the stop is centered on the road segment grid line
            return {
                x: (startIntersection.x + endIntersection.x) / 2,
                y: (startIntersection.y + endIntersection.y) / 2
            };
        }
        
        // Fallback to simple midpoint if road shape calculation fails
        return {
            x: (startIntersection.x + endIntersection.x) / 2,
            y: (startIntersection.y + endIntersection.y) / 2
        };
    }

    // =================== TRANSIT SYSTEM METHODS ===================

    // Place a transit stop on a road segment
    placeTransitStop(roadSegmentKey, type) {
        // roadSegmentKey format: "row1,col1-row2,col2"
        
        // Normalize the road segment key to ensure consistency
        const [start, end] = roadSegmentKey.split('-');
        const [row1, col1] = start.split(',').map(Number);
        const [row2, col2] = end.split(',').map(Number);
        const normalizedKey = this.getEdgeKey(row1, col1, row2, col2);
        
        // Check if there's already ANY stop here (bus OR subway)
        const existingStop = this.transitStops.get(normalizedKey);
        if (existingStop) {
            const existingType = existingStop.type === 'bus' ? 'Bus stop' : 'Subway entrance';
            return {
                success: false,
                message: `${existingType} already exists on this road segment. Each segment can have only one stop.`
            };
        }

        // Check if this road segment exists (check both original and normalized keys)
        if (!this.roads.has(roadSegmentKey) && !this.roads.has(normalizedKey)) {
            return {
                success: false,
                message: 'No road found at this location'
            };
        }

        const stopCost = type === 'bus' ? 50 : 200; // Bus stops cheaper than subway entrances
        
        if (this.game.playerCash < stopCost) {
            return {
                success: false,
                message: `Insufficient funds: need $${stopCost}, have $${this.game.playerCash}`
            };
        }

        // Create the transit stop using normalized coordinates
        const stop = {
            id: Date.now() + Math.random(), // Unique ID
            type: type, // 'bus' or 'subway'
            roadSegment: normalizedKey,
            startRow: row1, startCol: col1,
            endRow: row2, endCol: col2,
            name: `${type === 'bus' ? 'Bus Stop' : 'Subway Station'} ${this.transitStops.size + 1}`,
            builtTime: Date.now(),
            maintenance: type === 'bus' ? 1 : 3, // Daily maintenance cost
            lastMaintenance: Date.now(),
            condition: 1.0, // 1.0 = perfect, 0.0 = broken
            routes: [], // Route IDs that use this stop
            emoji: type === 'bus' ? '🚌' : '🚇'
        };

        this.transitStops.set(normalizedKey, stop);
        this.game.playerCash -= stopCost;
        
        // Add illumination effect for the placed stop
        this.illuminatedSegment = normalizedKey;
        this.illuminatedStopType = type;
        this.illuminationStartTime = Date.now();
        setTimeout(() => {
            this.illuminatedSegment = null;
            this.illuminatedStopType = null;
        }, 500); // Flash for 500ms
        
        this.game.showNotification(`Built ${stop.name} ($${stopCost})`, 'success');
        return { success: true, stop: stop };
    }

    // Check if there's a road at the given intersection
    hasRoadAtIntersection(row, col) {
        // Check all adjacent road segments
        const adjacentSegments = [
            `${row},${col}-${row},${col+1}`,
            `${row},${col}-${row+1},${col}`,
            `${row-1},${col}-${row},${col}`,
            `${row},${col-1}-${row},${col}`
        ];

        return adjacentSegments.some(segment => this.roads.has(segment));
    }

    // Start creating a new transit route
    startRouteCreation(type) {
        // If already creating this type of route, cancel the action
        if (this.isCreatingRoute && this.transitMode === type) {
            this.cancelTransitAction(true);
            return;
        }
        
        // Cancel any other active transit actions
        this.cancelTransitAction(false);
        
        this.transitMode = type;
        this.isCreatingRoute = true;
        this.routeCreationState = 'select_stops';
        this.selectedTransitStops = [];
        
        // Show helpful instructions
        const stopType = type === 'bus' ? 'bus stops' : 'subway stations';
        this.game.showNotification(`Click on ${stopType} to connect them into a route (need at least 2)`, 'info');
    }

    // Handle clicking on transit stops during route creation
    selectTransitStop(stopKey) {
        const stop = this.transitStops.get(stopKey);
        if (!stop || stop.type !== this.transitMode) {
            return false;
        }

        if (this.selectedTransitStops.includes(stopKey)) {
            // Deselect if already selected
            this.selectedTransitStops = this.selectedTransitStops.filter(s => s !== stopKey);
            this.game.showNotification(`⭕ Removed stop (${this.selectedTransitStops.length} selected)`, 'info');
        } else {
            this.selectedTransitStops.push(stopKey);
            this.game.showNotification(`✅ Added stop (${this.selectedTransitStops.length} selected)`, 'info');
        }

        if (this.selectedTransitStops.length >= 2) {
            this.routeCreationState = 'configure_route';
            this.showRouteConfigurationDialog();
        }

        return true;
    }

    // Show route configuration dialog
    showRouteConfigurationDialog() {
        console.log('showRouteConfigurationDialog called');
        this.pendingRoute = {
            type: this.transitMode,
            stops: [...this.selectedTransitStops],
            name: `${this.transitMode === 'bus' ? 'Bus' : 'Subway'} Route ${this.transitRoutes.size + 1}`,
            serviceLevel: 'daytime',
            price: 2.50,
            id: Date.now() + Math.random()
        };

        console.log('Pending route:', this.pendingRoute);

        // Show sidebar route configuration panel
        console.log('Showing sidebar route configuration');
        this.routeCreationState = 'configure_route';

        // Show route config panel in sidebar
        this.showRouteConfigSidebar();
    }

    showRouteConfigSidebar() {
        // Auto-close other sidebar panels except mobility
        this.autoClosePanelsForRouteConfig();

        // Keep mobility panel open
        this.ensureMobilityPanelOpen();

        // Show and open route config panel by default
        const routeConfigPanel = document.getElementById('route-config-sidebar');
        if (routeConfigPanel) {
            routeConfigPanel.style.display = 'block';
            routeConfigPanel.classList.remove('collapsed');

            // Populate the form with current route data
            this.populateRouteConfigForm();

            // Setup event listeners for sidebar form
            this.setupRouteConfigEventListeners();
        }
    }

    autoClosePanelsForRouteConfig() {
        // Get all sidebar sections except mobility and route-config
        const sidebarSections = document.querySelectorAll('.sidebar-section:not(.route-config-panel)');
        sidebarSections.forEach(section => {
            const header = section.querySelector('.section-header');
            if (header) {
                const target = header.getAttribute('data-target');
                // Don't close mobility panel
                if (target !== 'mobility-panel') {
                    section.classList.add('collapsed');
                    // CSS handles the circle icon appearance via classes
                }
            }
        });
    }

    ensureMobilityPanelOpen() {
        const mobilitySection = document.querySelector('.sidebar-section .section-header[data-target="mobility-panel"]')?.parentElement;
        if (mobilitySection) {
            mobilitySection.classList.remove('collapsed');
            // CSS handles the circle icon appearance via classes
        }
    }

    populateRouteConfigForm() {
        if (!this.pendingRoute) return;

        // Populate form fields with pending route data
        const routeNameInput = document.getElementById('sidebar-route-name');
        const ticketPriceInput = document.getElementById('sidebar-ticket-price');
        const serviceLevelSelect = document.getElementById('sidebar-service-level');
        const routeStopsCount = document.getElementById('sidebar-route-stops-count');
        const routeType = document.getElementById('sidebar-route-type');

        if (routeNameInput) routeNameInput.value = this.pendingRoute.name;
        if (ticketPriceInput) ticketPriceInput.value = this.pendingRoute.price;
        if (serviceLevelSelect) serviceLevelSelect.value = this.pendingRoute.serviceLevel || 'daytime';
        if (routeStopsCount) routeStopsCount.textContent = this.pendingRoute.stops.length;
        if (routeType) routeType.textContent = this.pendingRoute.type === 'bus' ? 'Bus' : 'Subway';

        // Update revenue projections
        this.updateRouteRevenueProjctions();
    }

    calculateEnhancedRouteEconomics(route) {
        // Service level costs per parcel distance (as specified)
        const serviceLevelCosts = {
            rush_hour: 1,   // $1 per parcel distance
            daytime: 2,     // $2 per parcel distance
            all_day: 3      // $3 per parcel distance
        };

        const serviceLevel = route.serviceLevel || 'daytime';
        const costPerParcelDistance = serviceLevelCosts[serviceLevel];

        // Calculate route distance and maintenance
        const routeDistance = this.calculateRouteDistance(route);
        const stopCount = route.stops.length;
        const dailyMaintenance = routeDistance * costPerParcelDistance;

        // Enhanced ridership calculation
        const ridership = this.calculateEnhancedRidership(route);

        // Revenue calculation
        const dailyRevenue = ridership * route.price;

        // Calculate cost per ride for subsidy analysis
        const costPerRide = dailyMaintenance / Math.max(ridership, 1);

        return {
            ridership: ridership,
            revenue: dailyRevenue,
            maintenance: dailyMaintenance,
            costPerRide: costPerRide,
            distance: routeDistance,
            serviceLevel: serviceLevel
        };
    }

    calculateEnhancedRidership(route) {
        let baseRidership = 0;

        // Distance-based ridership (longer routes = more potential riders)
        const routeDistance = this.calculateRouteDistance(route);
        baseRidership += routeDistance * 10; // 10 riders per distance unit

        // Population density at stops
        route.stops.forEach(stopKey => {
            const stop = this.transitStops.get(stopKey);
            if (stop) {
                const { row, col } = stop;

                // Check surrounding area for population density
                const radius = 3;
                let localPopulation = 0;

                for (let r = Math.max(0, row - radius); r <= Math.min(this.game.gridSize - 1, row + radius); r++) {
                    for (let c = Math.max(0, col - radius); c <= Math.min(this.game.gridSize - 1, col + radius); c++) {
                        const parcel = this.game.grid[r][c];
                        if (parcel.building) {
                            const building = this.game.buildingManager.getBuildingById(parcel.building);
                            if (building) {
                                localPopulation += building.housingCapacity || 0;
                            }
                        }
                    }
                }

                baseRidership += localPopulation * 0.1; // 10% of local population uses transit daily
            }
        });

        // Accessibility bonus (connects residential to commercial/jobs)
        const accessibilityBonus = this.calculateAccessibilityBonus(route);
        baseRidership *= (1 + accessibilityBonus);

        // Price elasticity (higher price = fewer riders)
        const priceElasticity = Math.max(0.1, 1 - ((route.price - 1.00) / 5.00)); // Range from 10% to 100%
        baseRidership *= priceElasticity;

        // Service level multiplier
        const serviceLevelMultipliers = {
            rush_hour: 0.7,  // Lower ridership but cheaper to operate
            daytime: 1.0,    // Standard ridership
            all_day: 1.3     // Higher ridership but more expensive
        };

        const serviceMultiplier = serviceLevelMultipliers[route.serviceLevel || 'daytime'];
        baseRidership *= serviceMultiplier;

        return Math.max(1, Math.round(baseRidership));
    }

    calculateAccessibilityBonus(route) {
        let residentialStops = 0;
        let commercialStops = 0;
        let jobStops = 0;

        route.stops.forEach(stopKey => {
            const stop = this.transitStops.get(stopKey);
            if (stop) {
                const { row, col } = stop;
                const radius = 2;

                for (let r = Math.max(0, row - radius); r <= Math.min(this.game.gridSize - 1, row + radius); r++) {
                    for (let c = Math.max(0, col - radius); c <= Math.min(this.game.gridSize - 1, col + radius); c++) {
                        const parcel = this.game.grid[r][c];
                        if (parcel.building) {
                            const building = this.game.buildingManager.getBuildingById(parcel.building);
                            if (building) {
                                const category = building.category?.toLowerCase();
                                if (category === 'housing') residentialStops++;
                                else if (category === 'commercial') commercialStops++;
                                else if (category === 'jobs') jobStops++;
                            }
                        }
                    }
                }
            }
        });

        // Bonus for connecting different types of areas
        let accessibilityBonus = 0;
        if (residentialStops > 0 && commercialStops > 0) accessibilityBonus += 0.2;
        if (residentialStops > 0 && jobStops > 0) accessibilityBonus += 0.3;
        if (commercialStops > 0 && jobStops > 0) accessibilityBonus += 0.15;

        return Math.min(0.5, accessibilityBonus); // Max 50% bonus
    }

    calculateSubsidyBenefits(ticketPrice, costPerRide) {
        if (ticketPrice >= costPerRide) return; // No subsidy

        const subsidyPercentage = ((costPerRide - ticketPrice) / costPerRide) * 100;
        const vitalityBonus = Math.min(10, subsidyPercentage / 10); // Max 10% boost, formula: subsidy% / 10

        if (vitalityBonus > 0) {
            console.log(`🚌 Transit Subsidy: ${subsidyPercentage.toFixed(1)}% → ${vitalityBonus.toFixed(1)}% vitality boost`);

            // Apply vitality bonuses to mobility, health, environment, affordability, and resilience
            this.applyTransitSubsidyBonuses(vitalityBonus);
        }
    }

    applyTransitSubsidyBonuses(bonusPercentage) {
        // Apply subsidized transit bonuses to affected CARENS domains
        // MOBILITY splits into ENVIRONMENT (reduced emissions) and SAFETY (pedestrian safety)
        // HEALTH becomes HEALTHCARE (JEEFHH resource, not CARENS livability metric)
        const affectedVitalities = ['ENVIRONMENT', 'SAFETY', 'HEALTHCARE', 'AFFORDABILITY', 'RESILIENCE'];

        // Calculate the actual bonus amount based on population and route coverage
        const baseBonusAmount = bonusPercentage * 2; // Scale bonus for meaningful impact

        affectedVitalities.forEach(vitality => {
            if (this.game.vitalitySupply && this.game.vitalitySupply[vitality] !== undefined) {
                this.game.vitalitySupply[vitality] += baseBonusAmount;
                console.log(`🌟 ${vitality}: +${baseBonusAmount.toFixed(1)} from subsidized transit (${bonusPercentage.toFixed(1)}% subsidy)`);
            }
        });

        // Mark vitality calculations as needing update
        if (this.game.vitalityCache) {
            this.game.vitalityCache.dirty = true;
        }
    }

    updateRouteRevenueProjctions() {
        if (!this.pendingRoute) return;

        // Show loading indicators
        this.showLoadingIndicators();

        // Calculate enhanced route economics
        setTimeout(() => {
            try {
                const economics = this.calculateEnhancedRouteEconomics(this.pendingRoute);

                // Update all projections with proper fallback handling
                this.updateProjectionDisplay('sidebar-daily-ridership', economics.ridership, '', 'riders');
                this.updateProjectionDisplay('sidebar-daily-revenue', economics.revenue, '$', '');
                this.updateProjectionDisplay('sidebar-daily-maintenance', economics.maintenance, '-$', '');

                // Calculate and display net with color coding
                const net = economics.revenue - economics.maintenance;
                this.updateNetDisplay(net);

                // Calculate and apply subsidized transit benefits if applicable
                this.calculateSubsidyBenefits(this.pendingRoute.price, economics.costPerRide);

            } catch (error) {
                console.error('Error calculating route projections:', error);
                this.showProjectionError();
            } finally {
                this.hideLoadingIndicators();
            }
        }, 100); // Small delay to show loading state
    }

    showLoadingIndicators() {
        const projections = ['sidebar-daily-ridership', 'sidebar-daily-revenue', 'sidebar-daily-maintenance', 'sidebar-daily-net'];
        projections.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const loader = el.querySelector('.loading-indicator');
                const data = el.querySelector('.proj-data');
                if (loader) loader.style.display = 'inline-block';
                if (data) data.style.display = 'none';
            }
        });
    }

    hideLoadingIndicators() {
        const projections = ['sidebar-daily-ridership', 'sidebar-daily-revenue', 'sidebar-daily-maintenance', 'sidebar-daily-net'];
        projections.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const loader = el.querySelector('.loading-indicator');
                const data = el.querySelector('.proj-data');
                if (loader) loader.style.display = 'none';
                if (data) data.style.display = 'inline-block';
            }
        });
    }

    updateProjectionDisplay(elementId, value, prefix = '', suffix = '') {
        const el = document.getElementById(elementId);
        if (!el) return;

        const dataEl = el.querySelector('.proj-data');
        if (!dataEl) return;

        if (value === null || value === undefined || isNaN(value)) {
            dataEl.textContent = '-';
        } else {
            dataEl.textContent = `${prefix}${Math.round(value)}${suffix}`;
        }
    }

    updateNetDisplay(netValue) {
        const el = document.getElementById('sidebar-daily-net');
        if (!el) return;

        const dataEl = el.querySelector('.proj-data');
        if (!dataEl) return;

        // Remove existing classes
        el.classList.remove('positive', 'negative');

        if (netValue === null || netValue === undefined || isNaN(netValue)) {
            dataEl.textContent = '-';
        } else {
            const rounded = Math.round(netValue);
            if (rounded >= 0) {
                dataEl.textContent = `+$${rounded}`;
                el.classList.add('positive');
            } else {
                dataEl.textContent = `-$${Math.abs(rounded)}`;
                el.classList.add('negative');
            }
        }
    }

    showProjectionError() {
        const projections = ['sidebar-daily-ridership', 'sidebar-daily-revenue', 'sidebar-daily-maintenance', 'sidebar-daily-net'];
        projections.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const dataEl = el.querySelector('.proj-data');
                if (dataEl) dataEl.textContent = '-';
            }
        });
    }

    setupRouteConfigEventListeners() {
        // Create route button
        const createBtn = document.getElementById('sidebar-create-route');
        const cancelBtn = document.getElementById('sidebar-cancel-route');
        const optimalPricingBtn = document.getElementById('sidebar-optimal-pricing');
        const ticketPriceInput = document.getElementById('sidebar-ticket-price');
        const routeNameInput = document.getElementById('sidebar-route-name');

        // Remove existing listeners
        if (createBtn) {
            createBtn.replaceWith(createBtn.cloneNode(true));
            document.getElementById('sidebar-create-route').addEventListener('click', () => this.createRouteFromSidebar());
        }

        if (cancelBtn) {
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            document.getElementById('sidebar-cancel-route').addEventListener('click', () => this.cancelRouteCreation());
        }

        if (optimalPricingBtn) {
            optimalPricingBtn.replaceWith(optimalPricingBtn.cloneNode(true));
            document.getElementById('sidebar-optimal-pricing').addEventListener('click', () => this.suggestOptimalPricing());
        }

        if (ticketPriceInput) {
            ticketPriceInput.addEventListener('input', () => {
                if (this.pendingRoute) {
                    this.pendingRoute.price = parseFloat(ticketPriceInput.value) || 2.50;
                    this.updateRouteRevenueProjctions();
                }
            });
        }

        if (routeNameInput) {
            routeNameInput.addEventListener('input', () => {
                if (this.pendingRoute) {
                    this.pendingRoute.name = routeNameInput.value;
                }
            });
        }

        // Service level selector
        const serviceLevelSelect = document.getElementById('sidebar-service-level');
        if (serviceLevelSelect) {
            serviceLevelSelect.addEventListener('change', () => {
                if (this.pendingRoute) {
                    this.pendingRoute.serviceLevel = serviceLevelSelect.value;
                    this.updateRouteRevenueProjctions();
                }
            });
        }
    }

    createRouteFromSidebar() {
        if (!this.pendingRoute) return;

        // Create the route using existing logic
        this.createRoute(this.pendingRoute);

        // Hide route config sidebar
        this.hideRouteConfigSidebar();
    }

    cancelRouteCreation() {
        // Reset route creation state
        this.isCreatingRoute = false;
        this.routeCreationState = 'select_stops';
        this.selectedTransitStops = [];
        this.pendingRoute = null;

        // Hide route config sidebar
        this.hideRouteConfigSidebar();

        // Clear any route visualization
        this.clearRouteVisualization();
    }

    hideRouteConfigSidebar() {
        const routeConfigPanel = document.getElementById('route-config-sidebar');
        if (routeConfigPanel) {
            routeConfigPanel.style.display = 'none';
        }
    }

    suggestOptimalPricing() {
        if (!this.pendingRoute) return;

        // Simple optimal pricing logic - find price that maximizes revenue
        let bestPrice = 2.50;
        let bestRevenue = 0;

        for (let price = 1.00; price <= 8.00; price += 0.25) {
            this.pendingRoute.price = price;
            const revenue = this.calculateRouteRevenue(this.pendingRoute);
            if (revenue > bestRevenue) {
                bestRevenue = revenue;
                bestPrice = price;
            }
        }

        this.pendingRoute.price = bestPrice;

        // Update form
        const ticketPriceInput = document.getElementById('sidebar-ticket-price');
        if (ticketPriceInput) ticketPriceInput.value = bestPrice;

        this.updateRouteRevenueProjctions();
    }

    clearRouteVisualization() {
        // Clear any pending route visualization on the canvas
        // This would redraw the mobility layer without the pending route
        if (this.game && this.game.needsRedraw) {
            this.game.needsRedraw();
        }
    }

    // Modal functions removed - now using inline UI

    // Calculate expected revenue for a route
    calculateRouteRevenue(route) {
        const baseRidership = this.estimateRouteRidership(route);
        const serviceLevel = this.serviceLevels[route.serviceLevel];
        const adjustedRidership = baseRidership * serviceLevel.multiplier;

        const dailyRevenue = adjustedRidership * route.price;

        // Calculate maintenance cost based on route distance (not stop count)
        const segmentDistance = this.calculateRouteDistance(route);
        const dailyCost = serviceLevel.cost * segmentDistance;

        const dailyProfit = dailyRevenue - dailyCost;
        
        // Calculate maintenance costs
        const maintenanceCost = route.stops.reduce((total, stopKey) => {
            const stop = this.transitStops.get(stopKey);
            return total + (stop ? stop.maintenance : 0);
        }, 0);

        route.projectedRevenue = {
            ridership: Math.round(adjustedRidership),
            dailyRevenue: Math.round(dailyRevenue),
            dailyCost: Math.round(dailyCost + maintenanceCost),
            dailyProfit: Math.round(dailyProfit - maintenanceCost),
            maintenanceCost: Math.round(maintenanceCost)
        };

        return route.projectedRevenue;
    }

    // Calculate route distance in segment units for maintenance cost calculation
    calculateRouteDistance(route) {
        if (!route || !route.stops || route.stops.length < 2) return 0;

        let totalDistance = 0;
        for (let i = 0; i < route.stops.length - 1; i++) {
            const fromStop = this.transitStops.get(route.stops[i]);
            const toStop = this.transitStops.get(route.stops[i + 1]);

            if (fromStop && toStop) {
                // Get road segment positions for distance calculation
                const fromSegment = fromStop.roadSegment;
                const toSegment = toStop.roadSegment;

                // Parse segment coordinates
                const [fromStr, ] = fromSegment.split('-');
                const [fromRow, fromCol] = fromStr.split(',').map(Number);
                const [toStr, ] = toSegment.split('-');
                const [toRow, toCol] = toStr.split(',').map(Number);

                // Calculate Manhattan distance (simpler for grid-based system)
                const segmentDistance = Math.abs(toRow - fromRow) + Math.abs(toCol - fromCol);
                totalDistance += segmentDistance;
            }
        }

        return Math.max(1, totalDistance); // Minimum 1 segment for single-segment routes
    }

    // Calculate optimal pricing for inline UI
    calculateOptimalPrice() {
        const bestPrice = this.suggestOptimalPricing();
        this.pendingRoute.price = bestPrice;
        this.game.showNotification(`Optimal price set: $${bestPrice.toFixed(2)}`, 'success');
    }

    // Finalize route creation from inline UI
    finalizeRouteCreation() {
        this.createRoute(this.pendingRoute);
        this.game.showNotification(`Created ${this.pendingRoute.name}`, 'success');
    }

    // Cancel route creation from inline UI
    cancelRouteCreation() {
        this.isCreatingRoute = false;
        this.selectedTransitStops = [];
        this.pendingRoute = null;
        this.transitMode = null;
        this.routeCreationState = null;

        // Hide route config sidebar
        this.hideRouteConfigSidebar();

        this.game.showNotification('Route creation cancelled', 'info');
    }

    // Calculate optimal pricing using ridership demand curve
    suggestOptimalPricing() {
        const baseRidership = this.estimateRouteRidership(this.pendingRoute);
        const serviceLevel = this.serviceLevels[this.pendingRoute.serviceLevel];
        
        // Test different price points to find optimal profit
        let bestPrice = 2.50;
        let bestProfit = 0;
        const results = [];
        
        for (let price = 0.50; price <= 8.00; price += 0.25) {
            // Ridership demand curve: higher prices reduce ridership
            // Base demand with price elasticity
            const priceElasticity = this.transitMode === 'bus' ? 0.8 : 0.6; // Buses more price sensitive
            const demandMultiplier = Math.pow(2.50 / price, priceElasticity);
            
            // Apply comfort and convenience factors
            const convenienceBonus = this.transitMode === 'subway' ? 1.2 : 1.0; // Subways more convenient
            const adjustedRidership = baseRidership * demandMultiplier * convenienceBonus * serviceLevel.multiplier;
            
            const dailyRevenue = adjustedRidership * price;

            // Use segment distance for service level costs
            const segmentDistance = this.calculateRouteDistance(this.pendingRoute);
            const dailyCost = serviceLevel.cost * segmentDistance;

            const maintenanceCost = this.pendingRoute.stops.reduce((total, stopKey) => {
                const stop = this.transitStops.get(stopKey);
                return total + (stop ? stop.maintenance : 0);
            }, 0);

            const dailyProfit = dailyRevenue - dailyCost - maintenanceCost;
            
            results.push({ price, ridership: Math.round(adjustedRidership), profit: Math.round(dailyProfit) });
            
            if (dailyProfit > bestProfit) {
                bestProfit = dailyProfit;
                bestPrice = price;
            }
        }
        
        // Return the best price for inline UI
        return bestPrice;
    }

    // Modal-related functions removed - now using inline UI

    // Estimate ridership based on nearby population and buildings
    estimateRouteRidership(route) {
        let totalRidership = 0;
        const catchmentRadius = 3; // 3-tile radius around each stop

        route.stops.forEach(stopKey => {
            const [row, col] = stopKey.split(',').map(Number);
            let stopRidership = 0;

            // Check all parcels within catchment radius
            for (let r = row - catchmentRadius; r <= row + catchmentRadius; r++) {
                for (let c = col - catchmentRadius; c <= col + catchmentRadius; c++) {
                    if (r >= 0 && r < this.game.gridSize && c >= 0 && c < this.game.gridSize) {
                        const parcel = this.game.grid[r][c];
                        if (parcel.building) {
                            // Different building types generate different ridership
                            const building = this.game.buildingManager.getBuildingById(parcel.building);
                            if (building) {
                                if (building.category === 'housing') {
                                    stopRidership += building.population * 0.3; // 30% of residents use transit
                                } else if (building.category === 'commercial') {
                                    stopRidership += building.jobs * 0.5; // 50% of workers use transit
                                } else {
                                    stopRidership += (building.population || 0) * 0.2 + (building.jobs || 0) * 0.3;
                                }
                            }
                        }
                    }
                }
            }

            totalRidership += stopRidership;
        });

        return Math.max(totalRidership * 0.1, 10); // Minimum 10 riders per day
    }

    // Create the route after configuration
    createRoute(routeConfig) {
        const route = {
            ...this.pendingRoute,
            ...routeConfig,
            id: Date.now() + Math.random(),
            builtTime: Date.now(),
            isActive: true,
            totalRevenue: 0,
            totalRiders: 0
        };

        // Calculate costs and revenue
        this.calculateRouteRevenue(route);

        this.transitRoutes.set(route.id, route);

        // Add this route to each stop
        route.stops.forEach(stopKey => {
            const stop = this.transitStops.get(stopKey);
            if (stop) {
                stop.routes.push(route.id);
            }
        });

        // Reset creation state
        this.isCreatingRoute = false;
        this.selectedTransitStops = [];
        this.pendingRoute = null;
        this.transitMode = null;

        // Hide route config sidebar
        this.hideRouteConfigSidebar();

        this.game.showNotification(`Created ${route.name}`, 'success');
        return route;
    }

    // Update transit system daily (maintenance, decay, revenue)
    updateTransitSystem() {
        const now = Date.now();
        let totalRevenue = 0;
        let totalCosts = 0;

        // Update routes
        this.transitRoutes.forEach(route => {
            if (route.isActive) {
                const revenue = route.projectedRevenue;
                totalRevenue += revenue.dailyRevenue;
                totalCosts += revenue.dailyCost;
                
                route.totalRevenue += revenue.dailyRevenue;
                route.totalRiders += revenue.ridership;
            }
        });

        // Update stop conditions (decay over time)
        this.transitStops.forEach(stop => {
            const daysSinceLastMaintenance = (now - stop.lastMaintenance) / (1000 * 60 * 60 * 24);
            
            // Decay rate: lose 1% condition per week without maintenance
            const decayRate = 0.01 / 7; // 1% per week
            stop.condition = Math.max(0, stop.condition - (decayRate * daysSinceLastMaintenance));
            
            // Apply maintenance costs
            totalCosts += stop.maintenance;
        });

        // Apply revenue and costs to player
        this.game.playerCash += Math.round(totalRevenue - totalCosts);

        // Store transit financial data for cashflow modal (don't show notifications)
        if (totalRevenue > 0 || totalCosts > 0) {
            const net = Math.round(totalRevenue - totalCosts);
            
            // Store in game for cashflow breakdown display
            this.game.transitFinancials = {
                dailyRevenue: Math.round(totalRevenue),
                dailyCosts: Math.round(totalCosts),
                dailyProfit: net,
                activeRoutes: Array.from(this.transitRoutes.values()).filter(r => r.isActive).length,
                totalStops: this.transitStops.size
            };
        }
    }

    // Draw transit infrastructure
    drawTransitSystem(ctx) {
        // Draw transit stops
        this.transitStops.forEach((stop, stopKey) => {
            // Get the proper road segment center using the same calculation as road drawing
            const stopPosition = this.getTransitStopPosition(stop);
            if (stopPosition) {
                this.drawTransitStop(ctx, stop, stopPosition);
            }
        });

        // Draw route lines
        this.transitRoutes.forEach(route => {
            if (route.isActive) {
                this.drawTransitRoute(ctx, route);
            }
        });

        // Draw selection highlights during route creation
        if (this.isCreatingRoute) {
            this.drawRouteCreationUI(ctx);
        }
    }

    // Draw individual transit stop
    drawTransitStop(ctx, stop, position) {
        ctx.save();
        
        // Add extra visual feedback during route creation
        const isHighlighted = this.isCreatingRoute && stop.type === this.transitMode;
        const isSelected = this.selectedTransitStops.includes(stop.roadSegment);
        
        // Draw emoji icon "on the ground"
        ctx.font = '20px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Show condition with opacity
        ctx.globalAlpha = Math.max(0.3, stop.condition);
        
        // Add a subtle background circle for better visibility
        const bgColor = stop.type === 'bus' ? '#66BB6A' : '#42A5F5';
        let circleSize = 12;
        
        if (isHighlighted) {
            // Make clickable stops more prominent during route creation
            ctx.fillStyle = bgColor + '80'; // More opaque background
            circleSize = 14;
        } else {
            ctx.fillStyle = bgColor + '40'; // Semi-transparent background
        }
        
        ctx.beginPath();
        ctx.arc(position.x, position.y, circleSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Add selection border
        if (isSelected) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(position.x, position.y, circleSize + 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Draw the emoji
        ctx.globalAlpha = Math.max(0.6, stop.condition);
        ctx.fillStyle = '#000000'; // Dark color for emoji visibility
        ctx.fillText(stop.emoji, position.x, position.y);

        // Draw cost indicator (like road cost indicators)
        ctx.globalAlpha = 1.0;
        const cost = stop.type === 'bus' ? 50 : 200;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(position.x - 15, position.y + 18, 30, 14);

        ctx.fillStyle = 'white';
        ctx.font = '10px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`$${cost}`, position.x, position.y + 25);

        // Draw stop name if selected
        if (isSelected) {
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffff00';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.font = '12px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
            ctx.strokeText(stop.name, position.x, position.y - 25);
            ctx.fillText(stop.name, position.x, position.y - 25);
        }

        ctx.restore();
    }

    // Draw transit route
    drawTransitRoute(ctx, route) {
        if (route.stops.length < 2) return;

        const color = route.type === 'bus' ? '#66BB6A' : '#42A5F5';
        
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.7;

        ctx.beginPath();
        for (let i = 0; i < route.stops.length; i++) {
            const stopKey = route.stops[i];
            const stop = this.transitStops.get(stopKey);
            
            if (stop) {
                // Use the same positioning method as stop drawing
                const stopPosition = this.getTransitStopPosition(stop);
                
                if (stopPosition) {
                    if (i === 0) {
                        ctx.moveTo(stopPosition.x, stopPosition.y);
                    } else {
                        ctx.lineTo(stopPosition.x, stopPosition.y);
                    }
                }
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    // Draw route creation UI
    drawRouteCreationUI(ctx) {
        // Highlight available stops
        this.transitStops.forEach((stop, stopKey) => {
            if (stop.type === this.transitMode) {
                // Use the same positioning method as stop drawing
                const stopPosition = this.getTransitStopPosition(stop);
                
                if (stopPosition) {
                    const isSelected = this.selectedTransitStops.includes(stopKey);
                    
                    ctx.save();
                    
                    if (isSelected) {
                        // Selected stops - solid green circle
                        ctx.strokeStyle = '#66BB6A';
                        ctx.fillStyle = 'rgba(102, 187, 106, 0.3)';
                        ctx.lineWidth = 4;
                        ctx.setLineDash([]);
                    } else {
                        // Available but unselected stops - dashed orange circle
                        ctx.strokeStyle = '#FFA726';
                        ctx.lineWidth = 3;
                        ctx.setLineDash([4, 4]);
                    }
                    
                    const size = 18;
                    ctx.beginPath();
                    ctx.arc(stopPosition.x, stopPosition.y, size, 0, Math.PI * 2);
                    
                    if (isSelected) {
                        ctx.fill();
                    }
                    ctx.stroke();
                    
                    // Add selection indicator
                    if (isSelected) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = '12px SF Mono, Monaco, Inconsolata, Roboto Mono, Source Code Pro, monospace';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('✓', stopPosition.x, stopPosition.y);
                    }
                    
                    ctx.restore();
                }
            }
        });

        // Draw connections between selected stops
        if (this.selectedTransitStops.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            
            ctx.beginPath();
            for (let i = 0; i < this.selectedTransitStops.length; i++) {
                const stopKey = this.selectedTransitStops[i];
                const stop = this.transitStops.get(stopKey);
                
                if (stop) {
                    // Use the same positioning method as stop drawing
                    const stopPosition = this.getTransitStopPosition(stop);
                    
                    if (stopPosition) {
                        if (i === 0) {
                            ctx.moveTo(stopPosition.x, stopPosition.y);
                        } else {
                            ctx.lineTo(stopPosition.x, stopPosition.y);
                        }
                    }
                }
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    // =================== TRANSIT UI INTERACTION METHODS ===================

    startTransitStopPlacement(type) {
        // If already placing this type, cancel the action
        if (this.isPlacingTransitStop && this.transitMode === type) {
            this.cancelTransitAction(true);
            return;
        }
        
        // Cancel any other active transit actions
        this.cancelTransitAction(false);
        
        this.transitMode = type;
        this.isPlacingTransitStop = true;
        
        // Set cursor to relevant emoji
        const emoji = type === 'bus' ? '🚌' : '🚇';
        document.body.style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text y='20' font-size='20'>${emoji}</text></svg>") 16 16, auto`;
        
        // Remove notification toast as per user request
    }

    cancelTransitAction(showNotification = false) {
        this.isPlacingTransitStop = false;
        this.isCreatingRoute = false;
        this.selectedTransitStops = [];
        this.transitMode = null;
        
        // Reset cursor
        document.body.style.cursor = 'auto';
        this.pendingRoute = null;
        
        if (showNotification) {
            this.game.showNotification('Transit action cancelled', 'info');
        }
    }

    // Enhanced click handler to support modal interface
    handleClickEnhanced(worldX, worldY, screenX, screenY) {
        // Check mode button clicks first
        if (this.modeButtons) {
            const tabsY = 20; // Top left position
            for (const button of this.modeButtons) {
                if (screenX >= button.x && screenX <= button.x + button.width &&
                    screenY >= tabsY && screenY <= tabsY + button.height) {
                    button.onClick();
                    return true;
                }
            }
        }

        // Only process mode-specific interactions
        if (this.currentMode === 'transit-stops' || this.currentMode === 'transit-connect') {
            return this.handleTransitClick(worldX, worldY, screenX, screenY);
        } else if (this.currentMode === 'roads') {
            return this.handleRoadClick(worldX, worldY, screenX, screenY);
        }

        return false;
    }

    // Handle clicks in transit mode
    handleTransitClick(worldX, worldY, screenX, screenY) {
        // Check transit button clicks
        if (this.transitButtons) {
            const transitY = 80; // Top left position
            for (const button of this.transitButtons) {
                if (screenX >= button.x && screenX <= button.x + button.width &&
                    screenY >= transitY && screenY <= transitY + button.height) {
                    button.onClick();
                    return true;
                }
            }
            // Clear transit buttons for next frame
            this.transitButtons = [];
        }

        // Handle transit stop placement
        if (this.isPlacingTransitStop) {
            const roadSegment = this.getRoadSegmentAt(worldX, worldY);
            if (roadSegment) {
                const result = this.placeTransitStop(roadSegment.key, this.transitMode);
                if (result.success) {
                    // Keep placement mode active so user can place more stops
                    // User must click the button again or switch modes to cancel
                } else {
                    this.game.showNotification(result.message, 'error');
                    // Add red blink visual feedback for insufficient funds
                    if (result.message.includes('Insufficient funds') && this.game.showInsufficientFundsFeedback) {
                        this.game.showInsufficientFundsFeedback();
                    }
                }
                return true;
            } else {
                // No road segment found - show helpful message and don't fall through to road building
                this.game.showNotification('Click on a road segment to place transit stop', 'info');
                return true;
            }
        }

        // Handle route configuration controls clicks
        if (this.isCreatingRoute && this.routeCreationState === 'configure_route' && this.pendingRoute) {
            // Check service level button clicks
            if (this.serviceLevelButtons) {
                for (const button of this.serviceLevelButtons) {
                    if (screenX >= button.x && screenX <= button.x + button.width &&
                        screenY >= button.y && screenY <= button.y + button.height) {
                        this.pendingRoute.serviceLevel = button.key;
                        return true;
                    }
                }
                // Clear service level buttons for next frame
                this.serviceLevelButtons = [];
            }

            // Check fare adjustment button clicks
            if (this.fareButtons) {
                for (const button of this.fareButtons) {
                    if (screenX >= button.x && screenX <= button.x + button.width &&
                        screenY >= button.y && screenY <= button.y + button.height) {
                        if (button.action === 'increase') {
                            this.pendingRoute.price = Math.min(10.0, this.pendingRoute.price + 0.25);
                        } else if (button.action === 'decrease') {
                            this.pendingRoute.price = Math.max(0.25, this.pendingRoute.price - 0.25);
                        }
                        return true;
                    }
                }
                // Clear fare buttons for next frame
                this.fareButtons = [];
            }
        }

        // Handle transit stop selection during route creation
        if (this.isCreatingRoute) {
            // Check if clicking near any existing transit stop of the correct type
            const clickedStop = this.getTransitStopAt(worldX, worldY);
            if (clickedStop && clickedStop.type === this.transitMode) {
                if (this.selectTransitStop(clickedStop.roadSegment)) {
                    return true;
                }
            }
            // Always consume clicks during route creation
            return true;
        }

        // In transit mode, no other clicks should trigger road building
        return true;
    }

    // Handle clicks in roads mode
    handleRoadClick(worldX, worldY, screenX, screenY) {
        // Delegate to the original road click handler
        return this.handleClick(worldX, worldY, screenX, screenY);
    }


    // Get intersection at world coordinates
    getIntersectionAt(worldX, worldY) {
        const tolerance = Math.max(this.game.tileWidth * 0.4, 20); // Smaller tolerance for precise intersection clicks
        
        for (const [key, intersection] of this.intersections) {
            const distance = Math.sqrt(
                Math.pow(intersection.x - worldX, 2) + 
                Math.pow(intersection.y - worldY, 2)
            );
            
            if (distance <= tolerance) {
                const [row, col] = key.split(',').map(Number);
                return { row, col, ...intersection };
            }
        }
        
        return null;
    }

    // Get road segment at world coordinates
    getRoadSegmentAt(worldX, worldY) {
        const tolerance = Math.max(this.game.tileWidth * 0.6, 30); // Use same detection threshold as edge hover
        let closestSegment = null;
        let closestDistance = tolerance;
        
        for (const [key, road] of this.roads) {
            // Parse the road segment key to get intersection coordinates
            const [start, end] = key.split('-');
            const [row1, col1] = start.split(',').map(Number);
            const [row2, col2] = end.split(',').map(Number);
            
            // Get intersection positions
            const startIntersection = this.intersections.get(`${row1},${col1}`);
            const endIntersection = this.intersections.get(`${row2},${col2}`);
            
            if (startIntersection && endIntersection) {
                // Calculate distance from point to line segment
                const distance = this.distanceToLineSegment(
                    worldX, worldY,
                    startIntersection.x, startIntersection.y,
                    endIntersection.x, endIntersection.y
                );
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSegment = { key, road, startIntersection, endIntersection };
                }
            }
        }
        
        return closestSegment;
    }

    // Calculate distance from point to line segment
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    }

    // Get transit stop at world coordinates (for clicking)
    getTransitStopAt(worldX, worldY) {
        const tolerance = Math.max(this.game.tileWidth * 0.5, 25); // Consistent tolerance for transit stops
        
        for (const [stopKey, stop] of this.transitStops) {
            const stopPosition = this.getTransitStopPosition(stop);
            if (stopPosition) {
                const distance = Math.sqrt(
                    Math.pow(stopPosition.x - worldX, 2) + 
                    Math.pow(stopPosition.y - worldY, 2)
                );
                
                if (distance <= tolerance) {
                    return stop;
                }
            }
        }
        
        return null;
    }

    // Old popup-based route configuration - REMOVED
    // Now using inline UI in drawTransitConnectControls
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobilityLayer;
} else if (typeof window !== 'undefined') {
    window.MobilityLayer = MobilityLayer;
}