# Performance Optimization Roadmap

## Status: Design Complete, Implementation Deferred

This document captures the performance optimization strategies designed for The Commons game, particularly for handling complex network effects and global building impacts. These designs are ready for implementation once core game functionality is complete.

## 1. Mobility Network Optimization (mobility-cache-design.md)

### Problem
When mobility networks are added, a single change can affect parcels across the entire board through connectivity, potentially creating O(n²) calculations.

### Solution Highlights
- **Hierarchical Caching**: Three-level cache structure (topology, reachability, impact zones)
- **Incremental Updates**: Only recalculate affected paths using incremental Floyd-Warshall
- **Batch Processing**: Group calculations for better cache locality
- **Approximations**: Use Manhattan distance * 1.5 for distant parcels
- **Pattern Memoization**: Cache common building placement patterns

### Performance Gains
- Network change: O(n³) → O(k*n²) where k << 1
- Building change: O(n²) → O(k) where k = affected parcels only
- Expected cache hit rate: ~80% for typical gameplay

## 2. Global CARENS Effects (carens-global-cache-design.md)

### Problem
Some buildings (airports, universities, stadiums) have city-wide effects, requiring updates to all parcels on every change.

### Solution Highlights
- **Three-Tier Effect System**:
  - Global: O(1) update, affects all parcels equally
  - District: Spatial but wide-ranging (5-15 tiles)
  - Local: Traditional proximity-based (1-5 tiles)
- **Lazy Evaluation**: Global effects applied only when parcels are queried
- **Version Tracking**: Detect when recalculation is needed
- **Smart Invalidation**: Only recalculate actually affected parcels

### Performance Gains
- Global effect update: O(n) → O(1) with lazy evaluation
- District effect: Only O(k) where k = affected parcels
- Cache efficiency: ~90% hit rate for unchanged parcels

## 3. Current Server Optimizations (Implemented)

### Already in Production
- **Multi-tier caching** for JEEFHH and CARENS calculations
- **Smart cache invalidation** based on change types
- **Delta state updates** instead of full broadcasts
- **Dependency tracking** for affected parcels
- **TTL-based cache expiry** (5 seconds for rapid changes, 30 seconds for stable state)

## Implementation Priority

### Phase 1: Core Game Completion (Current)
- Stabilize existing features
- Fix remaining UI/UX issues
- Complete multiplayer experience

### Phase 2: Basic Performance (Next)
- Implement basic reachability cache
- Add simple distance-based effects
- Monitor performance metrics

### Phase 3: Advanced Optimization (Future)
- Deploy full mobility network cache
- Implement global effects system
- Add pattern recognition
- Consider GPU acceleration for large boards

## Monitoring Metrics

When implementing these optimizations, track:
- Cache hit/miss rates
- Average calculation time per operation
- Peak memory usage
- Network bandwidth reduction
- Frame rate stability

## Notes

These optimizations are designed to work together:
- Mobility cache provides reachability data to CARENS calculator
- Global effects system uses mobility distances for network-based decay
- Both systems share dependency tracking infrastructure

The designs are modular and can be implemented incrementally without breaking existing functionality.