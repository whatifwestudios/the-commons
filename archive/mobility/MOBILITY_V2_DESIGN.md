# Mobility Layer v2 - Design Document

## Vision Statement
A clean, dedicated map layer that handles all transportation infrastructure through a proven UI pattern while delegating calculations to established economic and rendering systems.

## Core Principles

### 🎯 **Clean Architecture**
- **Single Responsibility**: Mobility layer handles infrastructure placement and network topology only
- **Delegation Pattern**: Economic impacts → Economic Engine, Visual rendering → Rendering System
- **Event-Driven Communication**: Loose coupling with other game systems

### 🎮 **Proven UX Pattern**
- **Preserve Current UI**: Three-tab modal (ROADS, ADD STOPS, CONNECT) with infrastructure selection
- **Same Visual Paradigm**: Shrunken parcels create negative space for road networks
- **Maintained Interaction Model**: Select design → place on segments → pay cost → stamp infrastructure

---

## System Architecture

### **Map Layer Integration**
```
Game Map Layers:
├── Base Layer (buildings/parcels)
├── Zoning Layer (residential/commercial/etc)
├── Mobility Layer v2 ← NEW
└── Other overlays...
```

**Layer Properties:**
- **Toggle**: Switchable via existing map layer switcher UI
- **Rendering**: Dedicated rendering pipeline within RenderingSystem
- **Grid Alignment**: Same isometric grid, shrunken parcels for road placement
- **Tooltips**: Building type info on hover delay for parcel identification

### **Core Components**

#### **1. Infrastructure Manager**
```javascript
class MobilityInfrastructure {
    // Road network: intersection-to-intersection segments
    roadSegments: Map<"row,col,edge", RoadSegment>

    // Transit systems: stops and connections
    transitStops: Map<"row,col", TransitStop>
    transitLines: Array<TransitLine>

    // Network topology for pathfinding
    networkGraph: Graph
}
```

#### **2. Resource Flow Engine**
```javascript
class MobilityFlow {
    // Calculate flow efficiency for JEEFHH resources
    calculateResourceFlow(from: Building, to: Building, resource: ResourceType): FlowMetrics

    // Per-building connections (each road segment touches 6 buildings)
    buildingConnectivity: Map<Building, ConnectionMetrics>
}
```

#### **3. Player Ownership System**
```javascript
class MobilityOwnership {
    // Track ownership and maintenance obligations
    segmentOwnership: Map<SegmentId, PlayerId>

    // Calculate replacement permissions based on adjacent land value
    canReplace(segment: SegmentId, player: PlayerId): boolean
}
```

#### **4. UI Controller**
```javascript
class MobilityUI {
    // Three-tab modal system (preserved from current design)
    roadTab: RoadDesigner      // Local/Arterial/Highway + upgrades
    stopsTab: TransitDesigner  // Bus stops, rail stations
    connectTab: RouteDesigner  // Transit line connections

    // Cost calculation and segment stamping
    showSegmentCosts(selectedDesign: InfrastructureType): void
    stampInfrastructure(segment: SegmentId, design: InfrastructureType): void
}
```

---

## Multiplayer Economics

### **Construction Rules**
- **Open Construction**: Any player can build any road/transit
- **Maintenance Obligation**: Last player to build/upgrade pays maintenance
- **Replacement Hierarchy**: Players with higher adjacent land value can replace infrastructure
- **Destruction Cost**: Must pay full construction cost (including upgrades) to replace

### **Transit Monetization**
- **Open Transit Building**: Anyone can construct transit lines
- **Stop Control**: Player with highest adjacent land value controls transit stops
- **Revenue Sharing**: Transit operators collect fares, stop controllers collect station fees

### **Resource Flow Types**
```javascript
const FLOW_TYPES = {
    PEOPLE: {
        optimal: ['transit', 'sidewalks'],
        secondary: ['local_roads'],
        poor: ['highways']
    },
    ENERGY: {
        optimal: ['highways', 'arterials'],
        secondary: ['local_roads'],
        poor: ['transit']
    },
    FOOD: { // Proxy for consumer goods
        optimal: ['highways'],
        secondary: ['arterials', 'local_roads'],
        poor: ['transit', 'walking']
    }
}
```

---

## System Integration

### **Economic Engine Interface**
```javascript
// Mobility provides data, Economic Engine calculates impacts
interface MobilityEconomicData {
    resourceFlow: FlowMetrics[]           // People/energy/food efficiency
    maintenanceCosts: CostBreakdown[]     // Infrastructure upkeep
    carensImpacts: EnvironmentalData[]    // Noise, pollution, walkability
    connectivityScores: ConnectivityMap   // Building-to-building connections
}

// Economic Engine consumes this data for JEEFHH/CARENS calculations
economicEngine.updateMobilityImpacts(mobilityData);
```

### **Rendering System Interface**
```javascript
// Mobility provides infrastructure state, Rendering handles visualization
interface MobilityRenderData {
    roadSegments: VisualRoadSegment[]     // Roads with markings, colors
    transitInfra: VisualTransitStop[]     // Stations, bus stops
    transitLines: VisualTransitLine[]     // Route connections
    costIndicators: CostDisplay[]         // Price overlays during construction
}

renderingSystem.updateMobilityLayer(renderData);
```

### **Server Synchronization**
- **Server Authority**: All infrastructure changes validated server-side
- **Real-time Sync**: Infrastructure updates broadcast to all players immediately
- **State Persistence**: Mobility networks included in full game state sync

---

## Performance Specifications

### **Scale Targets**
- **Grid**: 144 parcels (12x12)
- **Buildings**: Hundreds at full build-out
- **Population**: 3K-20K typical, 100K maximum residents
- **Resource Flows**: Per-building granularity (not animated)

### **Network Efficiency**
- **Pathfinding**: Pre-computed routes, updated on infrastructure changes
- **Flow Calculations**: Statistical modeling, not real-time simulation
- **Rendering**: Cached infrastructure sprites, minimal per-frame updates

---

## Implementation Strategy

### **Phase 1: Core Infrastructure**
1. **MobilityLayer** class with map layer integration
2. **Basic road placement** using existing three-tab UI pattern
3. **Economic Engine integration** for cost calculation
4. **Server sync** for multiplayer infrastructure changes

### **Phase 2: Transit Systems**
1. **Transit stop placement** and ownership rules
2. **Route connection system**
3. **Player monetization** mechanisms

### **Phase 3: Advanced Features**
1. **Resource flow optimization** algorithms
2. **CARENS environmental impact** calculation
3. **Performance optimization** for large cities

### **Phase 4: Migration Strategy**
1. **Feature parity testing** against current transportation system
2. **Parallel operation** period with both systems available
3. **Legacy system retirement** once Mobility v2 proven stable

---

## Success Metrics

### **Technical Success**
- ✅ Clean separation of concerns (infrastructure vs economics vs rendering)
- ✅ Zero performance regression vs current system
- ✅ 100% multiplayer reliability for infrastructure changes

### **User Experience Success**
- ✅ Familiar UI patterns preserved (three-tab modal)
- ✅ Intuitive infrastructure placement and cost feedback
- ✅ Clear ownership rules and replacement permissions

### **Game Design Success**
- ✅ Meaningful economic impact from mobility choices
- ✅ Balanced multiplayer competition for infrastructure control
- ✅ Scalable resource flow modeling for city growth

---

*This design document will evolve through implementation but provides architectural alignment for multi-session development.*