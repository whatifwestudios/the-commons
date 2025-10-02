# CARENS Global Effects Cache Design

## Problem
Buildings can have effects at multiple scales:
- **Local**: 1-5 tiles (parks, small shops)
- **District**: 5-15 tiles (schools, clinics)
- **City-wide**: Entire board (airports, universities, stadiums)
- **Network-based**: Variable based on connectivity (transit stations)

Calculating global effects for every building on every change is prohibitively expensive.

## Solution: Multi-Tier Effect System

### 1. Effect Classification

```javascript
class BuildingEffectProfile {
    constructor(buildingType) {
        // Define effect ranges and intensities
        this.effects = this.loadEffectProfile(buildingType);
    }

    loadEffectProfile(buildingType) {
        const profiles = {
            'airport': {
                noise: { range: 'global', intensity: -0.3, decay: 'none' },
                culture: { range: 'global', intensity: 0.2, decay: 'none' },
                environment: { range: 'district', intensity: -0.2, decay: 'linear', maxDistance: 10 }
            },
            'university': {
                culture: { range: 'global', intensity: 0.4, decay: 'none' },
                education: { range: 'district', intensity: 0.8, decay: 'exponential', maxDistance: 15 }
            },
            'park': {
                environment: { range: 'local', intensity: 0.5, decay: 'exponential', maxDistance: 5 },
                noise: { range: 'local', intensity: 0.2, decay: 'linear', maxDistance: 3 }
            },
            'factory': {
                noise: { range: 'district', intensity: -0.4, decay: 'linear', maxDistance: 8 },
                environment: { range: 'district', intensity: -0.5, decay: 'exponential', maxDistance: 10 },
                safety: { range: 'local', intensity: -0.2, decay: 'linear', maxDistance: 3 }
            },
            'stadium': {
                culture: { range: 'global', intensity: 0.3, decay: 'none' },
                noise: { range: 'district', intensity: -0.4, decay: 'linear', maxDistance: 12,
                         periodic: true, schedule: 'events' } // Only during events
            }
        };
        return profiles[buildingType] || { /* default minimal effects */ };
    }
}
```

### 2. Hierarchical Cache Structure

```javascript
class CAERNSCache {
    constructor() {
        // Global effects (affect all parcels equally)
        this.globalEffects = {
            culture: 0,
            affordability: 0,
            resilience: 0,
            environment: 0,
            noise: 0,
            safety: 0,
            contributors: new Map(), // buildingId -> contribution
            lastUpdate: 0,
            version: 0
        };

        // District effects (spatial but wide-ranging)
        this.districtEffects = new Map(); // parcelKey -> accumulated district effects

        // Local effects (traditional proximity-based)
        this.localEffects = new Map(); // parcelKey -> accumulated local effects

        // Combined cache (final CARENS values)
        this.combinedCAERNS = new Map(); // parcelKey -> final CARENS score

        // Dependency tracking
        this.dependencies = {
            global: new Set(),      // Buildings with global effects
            district: new Map(),    // parcelKey -> Set(affecting buildings)
            local: new Map()        // parcelKey -> Set(affecting buildings)
        };
    }
}
```

### 3. Incremental Update Strategy

```javascript
class CAERNSCalculator {
    onBuildingAdded(building, location) {
        const profile = new BuildingEffectProfile(building.type);
        const updates = { global: false, district: [], local: [] };

        for (const [metric, effect] of Object.entries(profile.effects)) {
            switch (effect.range) {
                case 'global':
                    this.updateGlobalEffect(building.id, metric, effect.intensity);
                    updates.global = true;
                    break;

                case 'district':
                    const districtParcels = this.getDistrictParcels(location, effect.maxDistance);
                    this.updateDistrictEffects(building.id, districtParcels, metric, effect);
                    updates.district.push(...districtParcels);
                    break;

                case 'local':
                    const localParcels = this.getLocalParcels(location, effect.maxDistance);
                    this.updateLocalEffects(building.id, localParcels, metric, effect);
                    updates.local.push(...localParcels);
                    break;
            }
        }

        return this.recalculateAffectedParcels(updates);
    }

    updateGlobalEffect(buildingId, metric, intensity) {
        // O(1) update for global effects
        const oldContribution = this.cache.globalEffects.contributors.get(buildingId)?.[metric] || 0;
        this.cache.globalEffects[metric] += (intensity - oldContribution);

        // Track contributor
        if (!this.cache.globalEffects.contributors.has(buildingId)) {
            this.cache.globalEffects.contributors.set(buildingId, {});
        }
        this.cache.globalEffects.contributors.get(buildingId)[metric] = intensity;

        // Mark all parcels as needing update (but calculation is O(1) per parcel)
        this.cache.globalEffects.version++;
    }

    recalculateAffectedParcels(updates) {
        const toRecalculate = new Set();

        if (updates.global) {
            // Global change affects all, but calculation is cheap
            // We just increment version and lazily update on read
            this.cache.globalEffects.lastUpdate = Date.now();
        }

        // Only recalculate actually affected parcels
        updates.district.forEach(key => toRecalculate.add(key));
        updates.local.forEach(key => toRecalculate.add(key));

        // Batch recalculation
        return Array.from(toRecalculate);
    }
}
```

### 4. Lazy Evaluation for Global Effects

```javascript
getCAERNSForParcel(parcelKey) {
    const cached = this.cache.combinedCAERNS.get(parcelKey);

    // Check if global effects have changed
    if (cached && cached.globalVersion === this.cache.globalEffects.version) {
        return cached.value; // No recalculation needed
    }

    // Recalculate combining all three tiers
    const global = this.cache.globalEffects; // O(1) - already computed
    const district = this.cache.districtEffects.get(parcelKey) || {}; // O(1) lookup
    const local = this.cache.localEffects.get(parcelKey) || {}; // O(1) lookup

    const combined = this.combineEffects(global, district, local);

    // Cache with version tracking
    this.cache.combinedCAERNS.set(parcelKey, {
        value: combined,
        globalVersion: this.cache.globalEffects.version,
        timestamp: Date.now()
    });

    return combined;
}
```

### 5. Optimization for Different Effect Types

```javascript
class EffectPropagation {
    static calculateEffect(distance, effect) {
        // Skip calculation if outside range
        if (effect.range === 'global') return effect.intensity;
        if (distance > effect.maxDistance) return 0;

        // Apply decay function
        switch (effect.decay) {
            case 'none':
                return effect.intensity;
            case 'linear':
                return effect.intensity * (1 - distance / effect.maxDistance);
            case 'exponential':
                return effect.intensity * Math.exp(-distance / (effect.maxDistance / 3));
            case 'inverse_square':
                return effect.intensity / (1 + distance * distance);
            default:
                return 0;
        }
    }

    static shouldRecalculate(building, change) {
        // Smart decision on whether recalculation is needed
        const profile = BuildingEffectProfile.get(building.type);

        // Periodic effects (like stadium events) might not need immediate recalc
        if (profile.periodic && !this.isEventTime()) {
            return false;
        }

        // Threshold-based: ignore tiny changes
        if (Math.abs(change) < 0.01) {
            return false;
        }

        return true;
    }
}
```

### 6. Network-Aware Propagation

```javascript
class NetworkAwareCAERNS {
    calculateNetworkEffect(source, metric, baseIntensity) {
        // Use cached network topology
        const reachable = this.mobilityCache.getReachableParcels(source);
        const effects = new Map();

        for (const [target, networkDistance] of reachable) {
            // Network effects decay differently than spatial
            const intensity = this.calculateNetworkDecay(
                baseIntensity,
                networkDistance,
                metric
            );

            if (Math.abs(intensity) > 0.01) {
                effects.set(target, intensity);
            }
        }

        return effects;
    }

    calculateNetworkDecay(baseIntensity, networkDistance, metric) {
        // Different metrics decay differently over networks
        const decayRates = {
            culture: 0.9,      // Culture spreads well through networks
            noise: 0.3,        // Noise doesn't travel through networks
            affordability: 0.7, // Economic effects spread moderately
            safety: 0.5        // Safety concerns spread somewhat
        };

        const rate = decayRates[metric] || 0.5;
        return baseIntensity * Math.pow(rate, networkDistance);
    }
}
```

### 7. Performance Monitoring

```javascript
class CAERNSPerformanceMonitor {
    constructor() {
        this.stats = {
            globalUpdates: 0,
            districtUpdates: 0,
            localUpdates: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageUpdateTime: 0,
            peakUpdateTime: 0
        };
    }

    measureUpdate(fn, type) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        this.stats[`${type}Updates`]++;
        this.updateAverageTime(duration);

        if (duration > this.stats.peakUpdateTime) {
            this.stats.peakUpdateTime = duration;
            console.warn(`Peak CARENS update time: ${duration}ms for ${type}`);
        }

        return result;
    }

    getCacheEfficiency() {
        const total = this.stats.cacheHits + this.stats.cacheMisses;
        return total > 0 ? this.stats.cacheHits / total : 0;
    }
}
```

## Usage Example

```javascript
// When an airport is built
onAirportBuilt(location) {
    const effects = {
        noise: { range: 'global', intensity: -0.3 },
        culture: { range: 'global', intensity: 0.2 },
        environment: { range: 'district', intensity: -0.2, maxDistance: 10 }
    };

    // Global effects update (O(1))
    this.updateGlobalEffect('airport_1', 'noise', -0.3);
    this.updateGlobalEffect('airport_1', 'culture', 0.2);

    // District effects update (O(k) where k = parcels within 10 tiles)
    const nearbyParcels = this.getDistrictParcels(location, 10);
    this.updateDistrictEffects('airport_1', nearbyParcels, 'environment', -0.2);

    // Only recalculate affected parcels, not entire board
    const toUpdate = nearbyParcels; // Maybe 50-100 parcels

    // Global effect is applied lazily when parcels are queried
    this.batchRecalculate(toUpdate);
}

// When querying a parcel's CARENS (lazy evaluation)
getParcelCAERNS(parcelKey) {
    // Check cache version
    if (this.needsUpdate(parcelKey)) {
        // Combine global (O(1)), district (O(1)), and local (O(1)) effects
        const carens = this.combineAllEffects(parcelKey);
        this.cache.set(parcelKey, carens);
        return carens;
    }
    return this.cache.get(parcelKey);
}
```

## Performance Characteristics

### Without Optimization:
- Airport built: O(n²) - Check every parcel against every other
- Stadium built: O(n²) - Recalculate all parcels
- Any change: O(n) minimum for global effects

### With This Design:
- Global effect: O(1) update, lazy O(1) per parcel on read
- District effect: O(k) where k = affected parcels only
- Cache hit rate: ~90% for unchanged parcels
- Memory: O(n) for caches, not O(n²)

## Benefits

1. **Scalability**: Global effects don't cause O(n) recalculations
2. **Accuracy**: Each building can have realistic multi-scale effects
3. **Performance**: Lazy evaluation and caching minimize computation
4. **Flexibility**: Easy to add new effect types and ranges
5. **Network-Ready**: Integrates with mobility network when added

This design ensures that even buildings with global effects (airports, universities) don't cause performance degradation, while maintaining accurate CARENS calculations across the entire city.