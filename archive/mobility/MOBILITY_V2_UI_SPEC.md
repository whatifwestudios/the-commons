# Mobility Layer v2 - UI Implementation Specification

## Based on Recording Analysis + Code Pattern Extraction
*Generated from Recording.mp4 walkthrough and MOBILITY_CODE_ANALYSIS.md*

---

## 🎛️ **Core UI Architecture**

### **Canvas Overlay Modal (Top-Left)**
- **Position**: Fixed top-left canvas overlay
- **Structure**: Three-tab system with content panels
- **Behavior**: Tab content hide/reveal pattern
- **Integration**: Direct canvas interaction for segment placement

---

## 📋 **Tab System Implementation**

### **Tab 1: ROADS**
```
Roads Tab Content:
├── Infrastructure Type Selection
│   ├── Local Road ($20 base)
│   ├── Arterial Road ($60 base)
│   └── Highway ($200 base)
├── Upgrade Options (conditional)
│   ├── Sidewalks (+$10)
│   └── Bike Lanes (+$10)
└── Upgrade Compatibility Rules
    ├── Local: Both upgrades allowed
    ├── Arterial: One upgrade only (not both)
    └── Highway: No upgrades allowed
```

**Cost Calculation Logic:**
- **New Construction**: Base cost + upgrade costs
- **Upgrade Existing**: Only upgrade cost ($10)
- **Replace Infrastructure**: Removal cost (original total) + new total cost

**Example Cost Scenarios:**
```javascript
// New local road with bike lane: $20 + $10 = $30
// Add bike lane to existing local: $10
// Add sidewalk to existing local: $5
// Local with both upgrades: $20 + $5 + $10 = $35
// Replace local+bike ($30) with highway: $30 (removal) + $200 = $230
// Replace arterial+sidewalk ($55) with local+both ($35): $55 (removal) + $35 = $90
```

### **Tab 2: ADD STOPS**
```
Add Stops Tab Content:
├── Stop Type Selection
│   ├── Bus Stop (emoji indicator on segment)
│   └── Subway Station (emoji indicator on segment)
├── Placement Rules
│   └── Must be placed on existing built road segments
└── Visual Indicators
    └── Small emoji markers on segments with stops
```

### **Tab 3: CONNECT**
```
Connect Tab Content:
├── Connection Type Selection
│   ├── Bus Route (connects bus stops only)
│   └── Subway Line (connects subway stations only)
├── Multi-Stop Selection
│   └── Select 2 or more stops of same type
└── Triggers → Road Configuration Sidebar Panel
```

---

## 🎯 **Road Configuration Sidebar Panel**

### **Triggered By**: Connect tab selections
### **Purpose**: Transit service configuration and economics

```
Road Configuration Panel:
├── Service Level Settings
│   ├── Frequency controls
│   ├── Operating hours
│   └── Vehicle capacity
├── Economic Settings
│   ├── Ticket price controls
│   └── Operating cost display
├── Performance Metrics
│   ├── Net profit/loss calculation
│   ├── Ridership projections
│   └── CARENS impact indicators
└── Motivation Note
    └── "Some players run transit at a loss for positive CARENS impacts"
```

---

## 🖱️ **Canvas Interaction Pattern**

### **Road Segment Indicator**
- **Visual**: Highlights exact placement location
- **Cost Display**: Small price tag showing net construction cost
- **Immediate Feedback**: Updates cost based on current modal selections
- **Click Behavior**: Instant construction (no animation)
- **Payment**: Cost immediately subtracted from player cash balance

### **Segment Highlighting Logic**
```javascript
// From code analysis - segment interaction patterns
onSegmentHover(segment) {
    // Highlight exact placement area
    highlightSegment(segment);

    // Calculate and display cost
    const cost = calculateSegmentCost(segment, selectedInfrastructure, selectedUpgrades);
    showCostIndicator(segment, cost);
}

onSegmentClick(segment) {
    // Validate player can afford
    if (player.cash >= cost) {
        // Instant construction
        buildInfrastructure(segment, selectedConfig);
        player.cash -= cost;

        // No animation - segment immediately appears built
        renderBuiltSegment(segment);
    }
}
```

---

## 💰 **Cost Calculation System**

### **Infrastructure Base Costs**
```javascript
const INFRASTRUCTURE_COSTS = {
    local_road: 20,
    arterial_road: 50,
    highway: 200,
    sidewalk_upgrade: 5,
    bike_lane_upgrade: 10,
    bus_stop: 15,          // estimated from analysis
    subway_station: 50     // estimated from analysis
};
```

### **Upgrade Compatibility Matrix**
```javascript
const UPGRADE_RULES = {
    local_road: {
        sidewalks: true,
        bike_lanes: true,
        both_upgrades: true
    },
    arterial_road: {
        sidewalks: true,
        bike_lanes: true,
        both_upgrades: false  // One or the other, not both
    },
    highway: {
        sidewalks: false,
        bike_lanes: false,
        both_upgrades: false
    }
};
```

### **Cost Display Logic**
- **New Construction**: Show total cost (base + upgrades)
- **Upgrades Only**: Show just upgrade cost
- **Replacement**: Show total cost including removal penalty
- **Real-time Updates**: Cost indicator updates as modal selections change

---

## 🎨 **Visual Design Patterns**
*From extracted CSS analysis*

### **Modal Styling** (from .road-controls, .road-select)
```css
.mobility-modal {
    background: #1a1a2e;
    border: 1px solid #333;
    position: fixed;
    top: 20px;
    left: 20px;
    /* Canvas overlay positioning */
}

.mobility-tab {
    background: #1a1a1a;
    border: 1px solid #333333;
    color: #ffffff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
}

.mobility-tab:focus {
    outline: none;
    border-color: #0066cc;
}
```

### **Cost Indicator Styling**
```css
.segment-cost-indicator {
    /* Small price tag overlay on segments */
    position: absolute;
    background: rgba(0,0,0,0.8);
    color: #ffffff;
    padding: 2px 4px;
    font-size: 10px;
    border-radius: 3px;
    pointer-events: none;
}
```

### **Segment Highlighting**
```css
.segment-highlight {
    /* Highlight exact construction area */
    outline: 2px solid #0066cc;
    background: rgba(0, 102, 204, 0.2);
}
```

---

## 🔄 **State Management Pattern**

### **Modal State**
```javascript
class MobilityModalState {
    activeTab: 'roads' | 'stops' | 'connect'
    selectedInfrastructure: InfrastructureType
    selectedUpgrades: UpgradeType[]
    hoveredSegment: SegmentId | null

    // Real-time cost calculation
    getCurrentCost(segment): number {
        return this.calculateCost(segment, this.selectedInfrastructure, this.selectedUpgrades);
    }
}
```

### **Canvas Integration**
```javascript
// From transportation.js analysis - proven event patterns
canvas.addEventListener('mousemove', (e) => {
    const segment = getSegmentAtPosition(e.x, e.y);
    if (segment) {
        mobilityModal.updateHoveredSegment(segment);
        showCostIndicator(segment, mobilityModal.getCurrentCost(segment));
    }
});

canvas.addEventListener('click', (e) => {
    const segment = getSegmentAtPosition(e.x, e.y);
    if (segment && mobilityModal.isOpen()) {
        mobilityModal.constructInfrastructure(segment);
    }
});
```

---

## 🚀 **Implementation Priority**

### **Phase 1: Core Modal System**
1. ✅ Three-tab modal with hide/show content
2. ✅ Infrastructure type selection with cost calculation
3. ✅ Upgrade compatibility rules and UI feedback
4. ✅ Canvas segment highlighting and cost indicators

### **Phase 2: Transit Systems**
1. ✅ Add Stops functionality with emoji indicators
2. ✅ Connect tab with multi-stop selection
3. ✅ Road Configuration sidebar panel
4. ✅ Service level and pricing controls

### **Phase 3: Advanced Economics**
1. ✅ Net profit/loss calculations for transit
2. ✅ CARENS impact integration
3. ✅ Performance metrics and projections

---

## ✨ **Key Success Criteria**

### **Visual Consistency**
- ✅ Modal feels identical to current system
- ✅ Same cost calculation and display patterns
- ✅ Identical segment highlighting and interaction

### **Functional Parity**
- ✅ All infrastructure types and upgrades
- ✅ Upgrade compatibility rules enforced
- ✅ Transit stop placement and routing
- ✅ Economic integration with cash balance

### **Performance**
- ✅ Real-time cost updates without lag
- ✅ Smooth segment highlighting
- ✅ Instant construction feedback

---

*This specification captures the proven UI patterns from Recording.mp4 combined with extracted code patterns for pixel-perfect Mobility v2 implementation.*