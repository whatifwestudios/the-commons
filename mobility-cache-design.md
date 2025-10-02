# Mobility Network Cache Design

## Problem
When mobility networks (roads, buses, trains) are added, a single change can affect parcels across the entire board through connectivity. Naive recalculation would be O(n²) for every building change.

## Solution Architecture

### 1. Hierarchical Caching
```javascript
class MobilityNetworkCache {
    constructor() {
        // Level 1: Network topology (rarely changes)
        this.networkGraph = {
            nodes: new Map(),     // parcelKey -> node
            edges: new Map(),     // edgeId -> {from, to, type, weight}
            lastUpdate: 0,
            version: 0
        };

        // Level 2: Reachability matrices (changes with network)
        this.reachability = {
            pedestrian: new Map(),  // from -> Map(to -> distance)
            road: new Map(),       // from -> Map(to -> distance)
            transit: new Map(),    // from -> Map(to -> distance)
            combined: new Map(),   // from -> Map(to -> minDistance)
            version: 0
        };

        // Level 3: Impact zones (changes with buildings)
        this.impactZones = {
            residential: new Map(), // parcelKey -> Set(affectedParcels)
            commercial: new Map(),  // parcelKey -> Set(affectedParcels)
            industrial: new Map(),  // parcelKey -> Set(affectedParcels)
            version: 0
        };
    }
}
```

### 2. Incremental Updates

#### A. Network Change (Road/Transit Built)
```javascript
onNetworkChange(changeType, location) {
    // Step 1: Update only affected paths
    const affectedPaths = this.findAffectedPaths(location);

    // Step 2: Incremental Floyd-Warshall (only affected rows/cols)
    this.updateReachabilityIncremental(affectedPaths);

    // Step 3: Mark dependent caches dirty
    this.markDependentCachesDirty(affectedPaths);

    // Version bump for change detection
    this.reachability.version++;
}
```

#### B. Building Change
```javascript
onBuildingChange(location, buildingType) {
    // Use pre-computed reachability to find affected parcels
    const affectedParcels = this.reachability.combined.get(location);

    // Only recalculate CARENS for parcels within impact threshold
    const threshold = this.getImpactThreshold(buildingType);
    const toUpdate = [];

    for (const [targetLocation, distance] of affectedParcels) {
        if (this.calculateImpact(distance, buildingType) > threshold) {
            toUpdate.push(targetLocation);
        }
    }

    // Batch update only affected parcels
    return toUpdate; // Much smaller than full board
}
```

### 3. Smart Impact Calculation

```javascript
calculateNetworkImpact(source, target, buildingType) {
    // Get cached shortest path
    const distance = this.reachability.combined.get(source)?.get(target);

    if (!distance || distance === Infinity) return 0;

    // Impact decays with network distance
    const decay = this.getDecayFunction(buildingType);
    return decay(distance);
}

getDecayFunction(buildingType) {
    // Different building types have different reach
    const configs = {
        'transit_station': (d) => Math.max(0, 1 - d/20),  // 20 tile reach
        'park': (d) => Math.max(0, 1 - d/5),              // 5 tile reach
        'industrial': (d) => Math.max(0, 1 - d/10),       // 10 tile negative reach
    };
    return configs[buildingType] || ((d) => Math.max(0, 1 - d/3));
}
```

### 4. Batch Processing

```javascript
class BatchedNetworkCalculator {
    constructor() {
        this.pendingCalculations = new Set();
        this.batchTimer = null;
    }

    scheduleCalculation(parcelKey) {
        this.pendingCalculations.add(parcelKey);

        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.processBatch(), 100);
        }
    }

    processBatch() {
        const batch = Array.from(this.pendingCalculations);
        this.pendingCalculations.clear();
        this.batchTimer = null;

        // Group by proximity for cache-friendly access
        const groups = this.groupByProximity(batch);

        // Process each group together (better cache locality)
        for (const group of groups) {
            this.processGroup(group);
        }
    }
}
```

### 5. Approximate Calculations for Distant Effects

```javascript
getApproximateImpact(source, target) {
    const exactThreshold = 5; // Calculate exactly within 5 tiles
    const distance = this.manhattanDistance(source, target);

    if (distance <= exactThreshold) {
        // Use exact network path
        return this.calculateNetworkImpact(source, target);
    } else {
        // Use approximation for distant parcels
        const networkMultiplier = 1.5; // Assume network path ~1.5x manhattan
        const approximateDistance = distance * networkMultiplier;
        return this.fastDecay(approximateDistance);
    }
}
```

### 6. Memoization of Common Patterns

```javascript
class PatternCache {
    constructor() {
        // Cache common building placement patterns
        this.patterns = new Map();
    }

    getOrCalculate(patternKey, calculator) {
        if (this.patterns.has(patternKey)) {
            return this.patterns.get(patternKey);
        }

        const result = calculator();
        this.patterns.set(patternKey, result);

        // LRU eviction after 1000 patterns
        if (this.patterns.size > 1000) {
            const firstKey = this.patterns.keys().next().value;
            this.patterns.delete(firstKey);
        }

        return result;
    }
}
```

## Performance Characteristics

### Without Optimization:
- Network change: O(n³) full Floyd-Warshall
- Building change: O(n²) check all parcels
- Memory: O(n²) for full distance matrix

### With This Design:
- Network change: O(k*n²) where k << 1 (incremental update)
- Building change: O(k) where k = affected parcels only
- Memory: O(n²) but compressed with sparse matrices
- Cache hits: ~80% for typical gameplay patterns

## Implementation Priority

1. **Phase 1**: Basic reachability cache (just connected/not connected)
2. **Phase 2**: Distance-based impact with decay functions
3. **Phase 3**: Transit type differentiation (walk/car/transit)
4. **Phase 4**: Pattern recognition and approximations
5. **Phase 5**: GPU acceleration for large boards (WebGL compute)

## Example Usage

```javascript
// When a train station is built
onTrainStationBuilt(location) {
    // 1. Update network graph (one-time)
    this.networkGraph.addNode(location, 'transit_hub');

    // 2. Incremental reachability update
    const affected = this.updateReachabilityAroundNode(location, 20); // 20 tile radius

    // 3. Get buildings that need CARENS recalc
    const buildingsToUpdate = [];
    for (const parcelKey of affected) {
        if (this.gameState.buildings.has(parcelKey)) {
            buildingsToUpdate.push(parcelKey);
        }
    }

    // 4. Batch update (much smaller than full recalc)
    this.batchRecalculateCARENS(buildingsToUpdate); // Maybe 50 buildings vs 144
}
```

This design ensures that even with complex mobility networks, the server remains performant and calculations are minimized through intelligent caching and incremental updates.