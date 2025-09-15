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
        
        // Road types with visual properties
        this.roadTypes = {
            local: {
                color: '#777777',  // Darker gray, closer to arterial
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
        
        // Update animation
        this.animationTime += 0.016;
        
        // Clear canvas with a slightly darker background
        ctx.fillStyle = '#0a0f0a';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        // Apply the same camera transform as the main game
        ctx.translate(this.game.panOffset.x, this.game.panOffset.y);
        ctx.scale(this.game.zoomScale, this.game.zoomScale);
        
        // Draw the familiar isometric grid but with modifications
        this.drawMobilityGrid(ctx);
        
        // Draw roads in the spaces between parcels
        this.drawRoads(ctx);
        
        // Draw shrunken isometric parcels (same diamond shape, just smaller)
        this.drawShrunkenParcels(ctx);
        
        // Draw edge hover effect
        if (this.hoveredEdge) {
            this.drawHoveredEdge(ctx);
        }
        
        // Restore context and draw UI
        ctx.restore();
        this.drawUIOverlay(ctx);
    }
    
    drawMobilityGrid(ctx) {
        // Intersection dots hidden for clean appearance
        
        // Draw potential road segments between adjacent intersections
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        
        this.intersections.forEach(intersection => {
            const { row, col } = intersection;
            
            // Draw lines to adjacent intersections
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
                        ctx.beginPath();
                        ctx.moveTo(intersection.x, intersection.y);
                        ctx.lineTo(neighborIntersection.x, neighborIntersection.y);
                        ctx.stroke();
                    }
                }
            });
        });
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
    
    drawShrunkenDiamond(ctx, x, y, parcel, row, col) {
        const shrunkWidth = this.game.tileWidth * this.parcelShrinkFactor;
        const shrunkHeight = this.game.tileHeight * this.parcelShrinkFactor;
        
        ctx.save();
        ctx.translate(x, y);
        
        // Draw the diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -shrunkHeight / 2);  // top
        ctx.lineTo(shrunkWidth / 2, 0);    // right
        ctx.lineTo(0, shrunkHeight / 2);   // bottom
        ctx.lineTo(-shrunkWidth / 2, 0);   // left
        ctx.closePath();
        
        // Color based on building/ownership (similar to main game)
        if (parcel.building) {
            ctx.fillStyle = this.getBuildingColor(parcel.building);
        } else if (parcel.owner) {
            ctx.fillStyle = 'rgba(30, 40, 30, 0.9)';
        } else {
            ctx.fillStyle = 'rgba(20, 30, 20, 0.9)';
        }
        ctx.fill();
        
        // Check if this parcel is affected by hovered edge
        const isAffected = this.hoveredEdge && this.isParcelAffectedByEdge(row, col, this.hoveredEdge);
        
        // Border styling
        if (isAffected) {
            // Very subtle border for affected parcels
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
        } else {
            // Subtle border for normal parcels
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
        }
        ctx.stroke();
        
        // Draw building icon if present
        if (parcel.building) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const icons = {
                housing: 'H',
                commercial: 'C',
                industrial: 'I',
                office: 'O',
                education: 'E',
                utilities: 'U',
                civic: 'G',
                recreation: 'R',
                emergency: 'M',
                mixed: 'X'
            };
            
            ctx.fillText(icons[parcel.building.category] || 'B', 0, 0);
        }
        
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
    
    drawRoads(ctx) {
        // Draw roads in the isometric spaces between parcels
        this.roads.forEach((road, edgeKey) => {
            const [from, to] = edgeKey.split('-');
            const [fromRow, fromCol] = from.split(',').map(Number);
            const [toRow, toCol] = to.split(',').map(Number);
            
            this.drawRoad(ctx, fromRow, fromCol, toRow, toCol, road);
        });
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
        
        // Draw road as an isometric parallelogram that matches parcel perspective
        this.drawIsometricRoadSegment(ctx, fromIso, toIso, road, roadSeed);
    }
    
    drawIsometricRoadSegment(ctx, from, to, road, roadSeed) {
        const roadType = this.roadTypes[road.type];
        
        // Calculate road width based on available space between shrunken parcels
        const availableSpace = this.game.tileWidth * (1 - this.parcelShrinkFactor);
        let roadWidth = availableSpace * roadType.width;
        
        // Adjust for infrastructure
        if (road.hasSidewalks) roadWidth *= 1.1;
        if (road.hasBikeLanes) roadWidth *= 1.15;
        
        // Create isometric parallelogram that matches parcel perspective
        const roadShape = this.calculateIsometricRoadShape(from, to, roadWidth);
        
        // Draw road shadow
        this.drawRoadShadow(ctx, roadShape);
        
        // Draw main road surface as filled parallelogram with stable seed
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
        
        // Segments extend exactly to grid intersection points - no trimming
        // This ensures roads meet precisely along gridlines to form continuous paths
        
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
        
        // Draw main road surface as filled parallelogram with opacity
        ctx.save();
        ctx.globalAlpha = 0.85;
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
        
        // Add lighting effects (top-left light source)
        this.addRoadLighting(ctx, shape, rng);
        
        // Add subtle worn border with hand-drawn style
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
        ctx.lineCap = 'round';
        
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
        
        // Left sidewalk (trimmed) with lighting
        ctx.save();
        // Base sidewalk - lighter (closer to light source)
        ctx.strokeStyle = '#f0f0f0';
        ctx.beginPath();
        ctx.moveTo(leftTrimStart.x, leftTrimStart.y);
        ctx.lineTo(leftTrimEnd.x, leftTrimEnd.y);
        ctx.stroke();
        
        // Add highlight on top edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftTrimStart.x - 1, leftTrimStart.y - 0.5);
        ctx.lineTo(leftTrimEnd.x - 1, leftTrimEnd.y - 0.5);
        ctx.stroke();
        ctx.restore();
        
        // Right sidewalk (trimmed) with lighting
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = sidewalkWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([3, 2]);
        
        // Base sidewalk - darker (further from light)
        ctx.strokeStyle = '#e0e0e0';
        ctx.beginPath();
        ctx.moveTo(rightTrimStart.x, rightTrimStart.y);
        ctx.lineTo(rightTrimEnd.x, rightTrimEnd.y);
        ctx.stroke();
        
        // Add shadow on bottom edge
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rightTrimStart.x + 1, rightTrimStart.y + 0.5);
        ctx.lineTo(rightTrimEnd.x + 1, rightTrimEnd.y + 0.5);
        ctx.stroke();
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
        
        const fromIso = { x: fromIntersection.x, y: fromIntersection.y };
        const toIso = { x: toIntersection.x, y: toIntersection.y };
        
        // Check if road already exists
        const hasRoad = this.roads.has(this.hoveredEdge);
        const roadType = this.roadTypes[this.selectedRoadType];
        let roadWidth = this.game.tileWidth * roadType.width * (1 - this.parcelShrinkFactor);
        
        // Adjust width based on selected infrastructure options
        if (this.infrastructureOptions.sidewalks.active) roadWidth += 4;
        if (this.infrastructureOptions.bikeLanes.active) roadWidth += 6;
        
        if (hasRoad) {
            // Show orange for existing roads
            ctx.strokeStyle = 'rgba(255, 150, 0, 0.6)';
            ctx.shadowColor = 'orange';
        } else {
            // Show preview of what would be built using road type color
            ctx.strokeStyle = roadType.color + '80'; // Add transparency
            ctx.shadowColor = roadType.color;
        }
        
        ctx.lineWidth = roadWidth + 8;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 12;
        
        ctx.beginPath();
        ctx.moveTo(fromIso.x, fromIso.y);
        ctx.lineTo(toIso.x, toIso.y);
        ctx.stroke();
        
        // Draw preview of infrastructure options if selected
        if (!hasRoad) {
            ctx.shadowBlur = 0;
            
            // Preview sidewalks
            if (this.infrastructureOptions.sidewalks.active) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 2;
                const offset = roadWidth / 2 - 1;
                const angle = Math.atan2(toIso.y - fromIso.y, toIso.x - fromIso.x);
                const perpX = Math.sin(angle) * offset;
                const perpY = -Math.cos(angle) * offset;
                
                // Draw both sidewalk previews
                ctx.beginPath();
                ctx.moveTo(fromIso.x + perpX, fromIso.y + perpY);
                ctx.lineTo(toIso.x + perpX, toIso.y + perpY);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(fromIso.x - perpX, fromIso.y - perpY);
                ctx.lineTo(toIso.x - perpX, toIso.y - perpY);
                ctx.stroke();
            }
            
            // Preview bike lanes
            if (this.infrastructureOptions.bikeLanes.active) {
                ctx.strokeStyle = 'rgba(0, 165, 0, 0.6)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                const offset = roadWidth / 2 - 6;
                const angle = Math.atan2(toIso.y - fromIso.y, toIso.x - fromIso.x);
                const perpX = Math.sin(angle) * offset;
                const perpY = -Math.cos(angle) * offset;
                
                // Draw both bike lane previews
                ctx.beginPath();
                ctx.moveTo(fromIso.x + perpX, fromIso.y + perpY);
                ctx.lineTo(toIso.x + perpX, toIso.y + perpY);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(fromIso.x - perpX, fromIso.y - perpY);
                ctx.lineTo(toIso.x - perpX, toIso.y - perpY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        
        ctx.shadowBlur = 0;
        
        // No tooltip - clean visual feedback only
    }
    
    drawCostTooltip(ctx, x, y, roadType, isUpgrade) {
        const totalCost = this.calculateSegmentCost();
        const text = isUpgrade ? 'Already built' : `$${totalCost}`;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(x - 30, y - 12, 60, 24);
        
        ctx.fillStyle = isUpgrade ? 'rgba(255, 255, 255, 0.5)' : 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }
    
    drawUIOverlay(ctx) {
        // Enhanced road type selector with better styling
        const startX = 20;
        const roadRowY = ctx.canvas.height - 120;
        const optionsRowY = ctx.canvas.height - 75;
        const buttonWidth = 110;
        const buttonHeight = 38;
        const buttonSpacing = 8;
        const borderRadius = 6;
        
        // First row: Road types with improved styling
        Object.entries(this.roadTypes).forEach(([type, config], index) => {
            const x = startX + index * (buttonWidth + buttonSpacing);
            
            // Draw rounded button background
            ctx.save();
            if (this.selectedRoadType === type) {
                // Selected button - gradient background
                const gradient = ctx.createLinearGradient(x, roadRowY, x, roadRowY + buttonHeight);
                gradient.addColorStop(0, config.color + 'DD');
                gradient.addColorStop(1, config.color + 'AA');
                ctx.fillStyle = gradient;
                this.drawRoundedRect(ctx, x, roadRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                
                // Selected border with glow effect
                ctx.shadowColor = config.color;
                ctx.shadowBlur = 8;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                this.drawRoundedRect(ctx, x, roadRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.stroke();
            } else {
                // Unselected button - subtle styling
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.drawRoundedRect(ctx, x, roadRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                this.drawRoundedRect(ctx, x, roadRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.stroke();
            }
            ctx.restore();
            
            // Draw text with better typography
            ctx.fillStyle = this.selectedRoadType === type ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.label, x + buttonWidth/2, roadRowY + buttonHeight/2 - 6);
            
            ctx.font = '11px Arial';
            ctx.fillStyle = this.selectedRoadType === type ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(`$${config.cost}`, x + buttonWidth/2, roadRowY + buttonHeight/2 + 8);
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
                const gradient = ctx.createLinearGradient(x, optionsRowY, x, optionsRowY + buttonHeight);
                gradient.addColorStop(0, config.color + '50');
                gradient.addColorStop(1, config.color + '30');
                ctx.fillStyle = gradient;
                this.drawRoundedRect(ctx, x, optionsRowY, buttonWidth, buttonHeight, borderRadius);
                ctx.fill();
                
                // Active border with subtle glow
                ctx.shadowColor = config.color;
                ctx.shadowBlur = 4;
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
                ctx.lineCap = 'round';
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
            ctx.font = config.active ? 'bold 12px Arial' : '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.label, textX, optionsRowY + buttonHeight/2 - 6);
            
            ctx.font = '11px Arial';
            ctx.fillStyle = isAllowed ? 'rgba(255, 255, 255, 0.7)' : 'rgba(150, 150, 150, 0.5)';
            ctx.fillText(`+$${config.cost}`, textX, optionsRowY + buttonHeight/2 + 8);
        });
        
        // Show total cost
        const totalCost = this.calculateSegmentCost();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Total per segment: $${totalCost}`, startX + 350, roadRowY + buttonHeight/2);
        
        // Draw supply legend in bottom right
        this.drawSupplyLegend(ctx);
        
        // Update sidebar transportation metrics
        this.updateSidebarMetrics();
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
        const legendHeight = 100;
        
        // Legend background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
        
        // Legend border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
        
        // Legend title
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Supply Types', legendX + 10, legendY + 18);
        
        // Legend items
        const legendItems = [
            { label: 'Housing Supply', color: 'rgba(59, 130, 246, 0.8)' },
            { label: 'Food/Goods Supply', color: 'rgba(251, 191, 36, 0.8)' },
            { label: 'Energy Supply', color: 'rgba(34, 197, 94, 0.8)' },
            { label: 'Job/Worker Supply', color: 'rgba(168, 85, 247, 0.8)' }
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
            ctx.font = '10px Arial';
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
        let closestDistance = this.game.tileWidth * 0.4; // Detection threshold
        
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
                    const edgeKey = this.getIntersectionEdgeKey(row, col, neighbor.row, neighbor.col);
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
            
            // Position tooltip at mouse (approximate)
            this.game.tooltip = tooltipContent;
            if (this.game.domCache && this.game.domCache.tooltip) {
                this.game.domCache.tooltip.innerHTML = tooltipContent;
                this.game.domCache.tooltip.style.display = 'block';
            }
        }
    }
    
    hideParcelTooltip() {
        // Hide the tooltip
        if (this.game.domCache && this.game.domCache.tooltip) {
            this.game.domCache.tooltip.style.display = 'none';
        }
        if (this.game.hideTooltip) {
            this.game.hideTooltip();
        }
    }
    
    getIntersectionEdgeKey(row1, col1, row2, col2) {
        // Ensure consistent edge keys regardless of direction
        if (row1 > row2 || (row1 === row2 && col1 > col2)) {
            return `${row2},${col2}-${row1},${col1}`;
        }
        return `${row1},${col1}-${row2},${col2}`;
    }
    
    handleClick(worldX, worldY, screenX, screenY) {
        // Check if clicking on UI buttons using screen coordinates
        const roadRowY = this.game.ctx.canvas.height - 110;
        const optionsRowY = this.game.ctx.canvas.height - 60;
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
                    // Show notification for disabled infrastructure
                    const roadTypeName = this.selectedRoadType.charAt(0).toUpperCase() + this.selectedRoadType.slice(1);
                    this.game.showNotification(`${roadTypeName} roads cannot have ${type}`, 'error');
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
        
        // Check if road already exists
        if (this.roads.has(this.hoveredEdge)) {
            const existingRoad = this.roads.get(this.hoveredEdge);
            const upgradeResult = this.handleRoadUpgradeOrReplacement(existingRoad, totalCost);
            
            if (upgradeResult.success) {
                this.game.playerCash -= upgradeResult.cost;
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
            if (this.game.playerCash >= totalCost) {
                this.game.playerCash -= totalCost;
                this.roads.set(this.hoveredEdge, {
                    type: this.selectedRoadType,
                    hasSidewalks: this.infrastructureOptions.sidewalks.active,
                    hasBikeLanes: this.infrastructureOptions.bikeLanes.active,
                    builtTime: Date.now()
                });
                this.game.showNotification(`Built road segment ($${totalCost})`, 'success');
            } else {
                this.game.showNotification(`Insufficient funds: need $${totalCost}, have $${this.game.playerCash}`, 'error');
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
                
                if (this.game.playerCash >= upgradeCost) {
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
                        message: `Insufficient funds for upgrade: need $${upgradeCost}, have $${this.game.playerCash}`
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
}

// Export for use in game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MobilityLayer;
}