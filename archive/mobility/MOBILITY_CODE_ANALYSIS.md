# Mobility System Code Analysis Report

Generated: 2025-09-25T11:47:17.900Z

## 🎨 CSS Style Patterns

### .road-select - style.css
```css
.road-select {
    background: #1a1a1a;
    
    border: 1px solid #333333;
    
    color: #ffffff;
    
    padding: 4px 8px;
    
    border-radius: 4px;
    
    font-size: 11px;
    
    min-width: 80px;
    
}
```

### .road-select:focus - style.css
```css
.road-select:focus {
    outline: none;
    
    border-color: #0066cc;
    
}
```

### .road-controls - style.css
```css
.road-controls {
    background: #1a1a2e;
    
    border: 1px solid #333;
    
    margin-bottom: 10px;
    
}
```

### .road-controls .section-header - style.css
```css
.road-controls .section-header {
    background: linear-gradient(135deg, #2d1b69 0%, #1a1a2e 100%);
    
    color: #fff;
    
    padding: 8px 12px;
    
    font-weight: bold;
    
    font-size: 11px;
    
    border-bottom: 1px solid #333;
    
}
```

### .road-controls-content - style.css
```css
.road-controls-content {
    padding: 10px;
    
}
```

### .road-design-section - style.css
```css
.road-design-section {
    padding: 12px 16px;
    
    border-bottom: 1px solid #1a1a1a;
    
}
```

### .road-design-section:last-of-type - style.css
```css
.road-design-section:last-of-type {
    border-bottom: none;
    
}
```

### .road-design-section label - style.css
```css
.road-design-section label {
    display: block;
    
    color: #cccccc;
    
    font-size: 12px;
    
    font-weight: 600;
    
    margin-bottom: 6px;
    
}
```

### .road-design-section select - style.css
```css
.road-design-section select {
    width: 100%;
    
    padding: 8px;
    
    background: #1a1a1a;
    
    border: 1px solid #2a2a2a;
    
    border-radius: 4px;
    
    color: #ffffff;
    
    font-size: 12px;
    
    margin-bottom: 8px;
    
}
```

### .road-design-section select:focus - style.css
```css
.road-design-section select:focus {
    outline: none;
    
    border-color: #42B96E;
    
}
```

### .road-design-actions - style.css
```css
.road-design-actions {
    padding: 12px 16px;
    
    background: #0a0a0a;
    
    border-top: 1px solid #2a2a2a;
    
}
```

### .road-design-actions button - style.css
```css
.road-design-actions button {
    width: 100%;
    
    padding: 10px 16px;
    
    border: none;
    
    background: #2a2a2a;
    
    color: #cccccc;
    
    border-radius: 4px;
    
    cursor: pointer;
    
    font-size: 12px;
    
    margin-bottom: 8px;
    
    transition: background-color 0.2s;
    
}
```

### .road-design-actions button:last-child - style.css
```css
.road-design-actions button:last-child {
    margin-bottom: 0;
    
}
```

### .road-design-actions button:hover - style.css
```css
.road-design-actions button:hover {
    background: #3a3a3a;
    
    color: #ffffff;
    
}
```

### .road-design-actions button:first-of-type - style.css
```css
.road-design-actions button:first-of-type {
    background: #42B96E;
    
    color: #ffffff;
    
}
```

### .road-design-actions button:first-of-type:hover - style.css
```css
.road-design-actions button:first-of-type:hover {
    background: #369654;
    
}
```

### .road-config - style.css
```css
.road-config {
    display: flex;
    
    flex-direction: column;
    
    align-items: stretch;
    
    gap: 8px;
    
    width: 100%;
    
}
```

### .road-select - style.css
```css
.road-select {
    background: #2a2a2a;
    
    border: 1px solid #444444;
    
    color: #ffffff;
    
    padding: 8px 12px;
    
    border-radius: 4px;
    
    font-size: 12px;
    
    width: 100%;
    
    max-width: 200px;
    
    min-width: 0;
    
}
```

### .transport-modes - style.css
```css
.transport-modes {
    display: flex;
    
    gap: 8px;
    
}
```

### .transport-mode-btn - style.css
```css
.transport-mode-btn {
    background: #1a1a1a;
    
    border: 1px solid #333333;
    
    color: #888888;
    
    padding: 6px 12px;
    
    border-radius: 4px;
    
    font-size: 12px;
    
    cursor: pointer;
    
    transition: all 0.2s;
    
}
```

### .transport-mode-btn:hover - style.css
```css
.transport-mode-btn:hover {
    border-color: #444444;
    
    color: #cccccc;
    
}
```

### .transport-mode-btn.active - style.css
```css
.transport-mode-btn.active {
    background: #0066cc;
    
    border-color: #0066cc;
    
    color: #ffffff;
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 20px;
    
}
```

### .modal-footer - style.css
```css
.modal-footer {
    display: flex;
    
    align-items: center;
    
    justify-content: space-between;
    
    padding: 20px;
    
    border-top: 1px solid #2a2a2a;
    
}
```

### .modal - style.css
```css
.modal {
    display: flex;
    
    position: fixed;
    
    top: 0;
    
    left: 0;
    
    width: 100%;
    
    height: 100%;
    
    background: rgba(0, 0, 0, 0.8);
    
    z-index: 10000;
    
    align-items: center;
    
    justify-content: center;
    
    opacity: 0;
    
    visibility: hidden;
    
    transition: opacity 0.14s ease, visibility 0.14s ease;
    
}
```

### .modal.visible - style.css
```css
.modal.visible {
    opacity: 1;
    
    visibility: visible;
    
}
```

### .modal-content - style.css
```css
.modal-content {
    background: #0a0a0a;
    
    border: 1px solid #2a2a2a;
    
    border-radius: 8px;
    
    max-width: 90%;
    
    max-height: 90%;
    
    overflow-y: auto;
    
    position: relative;
    
    margin: 50px auto;
    
    transform: scale(0.95);
    
    transition: transform 0.14s ease;
    
}
```

### .modal.visible .modal-content - style.css
```css
.modal.visible .modal-content {
    transform: scale(1);
    
}
```

### .modal-header - style.css
```css
.modal-header {
    padding: 20px;
    
    border-bottom: 1px solid #2a2a2a;
    
    display: flex;
    
    justify-content: space-between;
    
    align-items: center;
    
}
```

### .modal-header h2 - style.css
```css
.modal-header h2 {
    color: #ececec;
    
    margin: 0;
    
}
```

### .modal-close - style.css
```css
.modal-close {
    background: none;
    
    border: none;
    
    color: #888;
    
    font-size: 24px;
    
    cursor: pointer;
    
    padding: 0;
    
    width: 30px;
    
    height: 30px;
    
}
```

### .modal-close:hover - style.css
```css
.modal-close:hover {
    color: #ececec;
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 20px;
    
}
```

### .modal-header h2 - style.css
```css
.modal-header h2 {
    font-size: 20px;
    
    color: #ececec;
    
}
```

### .modal-footer - style.css
```css
.modal-footer {
    display: flex;
    
    justify-content: space-between;
    
    align-items: center;
    
    padding: 20px;
    
    border-top: 1px solid #2a2a2a;
    
    background: #111111;
    
}
```

### .modal.visible .action-marketplace - style.css
```css
.modal.visible .action-marketplace {
    transform: scale(1) translateY(0);
    
}
```

### .modal-header - style.css
```css
.modal-header {
    background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
    
    border-bottom: 1px solid #2a2a2a;
    
    padding: 20px 24px;
    
    display: flex;
    
    justify-content: space-between;
    
    align-items: center;
    
}
```

### .modal-header h2 - style.css
```css
.modal-header h2 {
    margin: 0;
    
    font-size: 20px;
    
    font-weight: 600;
    
    color: #ffffff;
    
    letter-spacing: 0.3px;
    
}
```

### .modal-body - style.css
```css
.modal-body {
    position: relative;
    
    min-height: 400px;
    
}
```

### .modal-content - style.css
```css
.modal-content {
    background: linear-gradient(145deg, #111111, #0a0a0a);
    
    border: 1px solid #2a2a2a;
    
    border-radius: 16px;
    
    width: 90vw;
    
    max-width: 1200px;
    
    min-width: 900px;
    
    max-height: 85%;
    
    overflow: hidden;
    
    box-shadow: 
        0 25px 50px rgba(0, 0, 0, 0.6),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    
    transform: scale(0.9) translateY(30px);
    
    transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    
    position: relative;
    
    overflow-y: clip;
    
}
```

### .modal-content - style.css
```css
.modal-content {
    transform: scale(1) translateY(0);
    
}
```

### .modal-header - style.css
```css
.modal-header {
    display: flex;
    
    justify-content: space-between;
    
    align-items: center;
    
    padding: 20px 24px;
    
    border-bottom: 1px solid #2a2a2a;
    
    background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
    
}
```

### .modal-header h3 - style.css
```css
.modal-header h3 {
    color: #ffffff;
    
    margin: 0;
    
    font-size: 14px;
    
    font-weight: 300;
    
    text-transform: uppercase;
    
    letter-spacing: 1px;
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 0;
    
    overflow-y: auto;
    
    max-height: calc(85vh - 100px);
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 0px !important;
    
}
```

### .modal-content - style.css
```css
.modal-content {
    background: linear-gradient(145deg, #111111, #0a0a0a);
    
    border: 1px solid #2a2a2a;
    
    border-radius: 16px;
    
    width: 75vw;
    
    max-width: 1200px;
    
    min-width: 900px;
    
    max-height: 85%;
    
    overflow: hidden;
    
    box-shadow: 
        0 25px 50px rgba(0, 0, 0, 0.6),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    
    transform: scale(0.9) translateY(30px);
    
    transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    
    position: relative;
    
    overflow-y: clip;
    
}
```

### .modal-content - style.css
```css
.modal-content {
    transform: scale(1) translateY(0);
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 0;
    
}
```

### .modal-header - style.css
```css
.modal-header {
    display: flex;
    
    align-items: center;
    
    justify-content: space-between;
    
    padding: 14px 20px;
    
    border-bottom: 1px solid rgba(42, 42, 42, 0.4);
    
    background: linear-gradient(135deg, rgba(26, 26, 26, 0.7), rgba(20, 20, 20, 0.8));
    
    backdrop-filter: blur(8px);
    
    position: sticky;
    
    top: 0;
    
    z-index: 10;
    
}
```

### .modal-header h3 - style.css
```css
.modal-header h3 {
    margin: 0;
    
    font-size: 14px;
    
    font-weight: 500;
    
    color: #ffffff;
    
    background: linear-gradient(135deg, #ffffff, #cccccc);
    
    background-clip: text;
    
    -webkit-background-clip: text;
    
    -webkit-text-fill-color: transparent;
    
    text-transform: uppercase;
    
    letter-spacing: 0.5px;
    
}
```

### .modal-header - style.css
```css
.modal-header {
    background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
    
    border-bottom: 1px solid #2a2a2a;
    
    padding: 20px 24px;
    
    display: flex;
    
    justify-content: space-between;
    
    align-items: center;
    
    border-radius: 16px 16px 0 0;
    
}
```

### .modal-header h2 - style.css
```css
.modal-header h2 {
    margin: 0;
    
    font-size: 20px;
    
    font-weight: 600;
    
    color: #ffffff;
    
    letter-spacing: 0.3px;
    
}
```

### .modal-body - style.css
```css
.modal-body {
    padding: 24px;
    
}
```

### .tab-btn - style.css
```css
.tab-btn {
    padding: 12px 24px;
    
    background: transparent;
    
    color: #888;
    
    border: none;
    
    border-radius: 8px;
    
    cursor: pointer;
    
    font-size: 13px;
    
    font-weight: 500;
    
    letter-spacing: 0.3px;
    
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    
    position: relative;
    
    overflow: hidden;
    
}
```

### .tab-btn:hover - style.css
```css
.tab-btn:hover {
    color: #aaa;
    
    background: rgba(255, 255, 255, 0.05);
    
}
```

### .tab-btn.active - style.css
```css
.tab-btn.active {
    color: #42B96E;
    
    background: rgba(66, 185, 110, 0.15);
    
    box-shadow: 0 2px 8px rgba(66, 185, 110, 0.2);
    
}
```

### .tab-btn.active::before - style.css
```css
.tab-btn.active::before {
    content: '';
    
    position: absolute;
    
    inset: 0;
    
    background: linear-gradient(135deg, rgba(66, 185, 110, 0.1) 0%, rgba(66, 185, 110, 0.05) 100%);
    
    opacity: 1;
    
    transition: opacity 0.3s ease;
    
}
```

### .tab-content - style.css
```css
.tab-content {
    opacity: 0;
    
    transform: translateY(10px);
    
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    
    pointer-events: none;
    
    min-height: 400px;
    
    position: absolute;
    
    width: 100%;
    
    top: 0;
    
    left: 0;
    
}
```

### .tab-content.active - style.css
```css
.tab-content.active {
    opacity: 1;
    
    transform: translateY(0);
    
    pointer-events: auto;
    
    position: relative;
    
}
```

### .tab-btn - style.css
```css
.tab-btn {
    padding: 12px 24px;
    
    background: transparent;
    
    color: #888;
    
    border: none;
    
    border-radius: 8px;
    
    cursor: pointer;
    
    font-size: 13px;
    
    font-weight: 500;
    
    letter-spacing: 0.3px;
    
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    
    position: relative;
    
    overflow: hidden;
    
}
```

### .tab-btn:hover - style.css
```css
.tab-btn:hover {
    color: #ff9500;
    
    background: rgba(255, 149, 0, 0.1);
    
}
```

### .tab-btn.active - style.css
```css
.tab-btn.active {
    background: linear-gradient(135deg, #ff9500, #ffb84d);
    
    color: white;
    
    box-shadow: 0 4px 12px rgba(255, 149, 0, 0.3);
    
}
```

### .tab-btn.active::before - style.css
```css
.tab-btn.active::before {
    content: '';
    
    position: absolute;
    
    inset: 0;
    
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
    
}
```

### .tab-content - style.css
```css
.tab-content {
    display: none;
    
    animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    
}
```

### .tab-content.active - style.css
```css
.tab-content.active {
    display: block;
    
}
```

### .cost-summary - style.css
```css
.cost-summary {
    display: flex;
    
    align-items: center;
    
    gap: 8px;
    
}
```

### .cost-label - style.css
```css
.cost-label {
    color: #888888;
    
    font-size: 12px;
    
}
```

### .cost-value - style.css
```css
.cost-value {
    color: #ffffff;
    
    font-size: 14px;
    
    font-weight: 600;
    
    font-family: 'SF Mono', Monaco, monospace;
    
}
```

### .cost-display - style.css
```css
.cost-display {
    background: #1a1a1a;
    
    padding: 8px 12px;
    
    border-radius: 4px;
    
    color: #42B96E;
    
    font-weight: 600;
    
    font-size: 14px;
    
    text-align: center;
    
    margin-bottom: 12px;
    
}
```

### .mobility - style.css
```css
.mobility {
    color: #06b6d4;
    
}
```

## ⚙️ JavaScript Functions

### updateRoadAdjustment() - game.js
```javascript
function updateRoadAdjustment(property, value, displayElement, suffix = '') {         game.roadAdjustments[property] = parseFloat(value);         displayElement.textContent = value + suffix;         game.scheduleRender();     }      // Road angle control     if (roadAngle) {         roadAngle.addEve...
```

### showModal() - game.js
```javascript
showModal = function(modalId) {         const modal = document.getElementById(modalId);         if (modal) {             modal.classList.add('visible');         }     };          window.closeModal = function(modalId) {         const modal = document.getElementById(modalId);         if (modal) {...
```

### closeModal() - game.js
```javascript
closeModal = function(modalId) {         const modal = document.getElementById(modalId);         if (modal) {             modal.classList.remove('visible');         }     };               // CSV refresh button functionality     const refreshCsvBtn = document.getElementById('refresh-csv-btn');     if...
```

### TransportationSystem() - game.js
```javascript
TransportationSystem(this);          // Transport capacity system removed - was 75% dead code          // Mobility Layer - New visualization system         this.mobilityLayer = new MobilityLayer(this);                  // Parcel selector fade system         this.hoverStartTime = null; // When curren...
```

### MobilityLayer() - game.js
```javascript
MobilityLayer(this);                  // Parcel selector fade system         this.hoverStartTime = null; // When current hover began         this.selectorOpacity = 1.0; // Current opacity of white diamond selector         this.completionAnimations = new Map(); // Map of "row,col" -> animation data...
```

### updateModal() - game.js
```javascript
updateModal();             } else {                 this.showNotification('Failed to reset server state', 'error');             }         } catch (error) {             console.error('Reset server state error:', error);             this.showNotification('Error resetting server state', 'error');...
```

### costs() - game.js
```javascript
costs (no actions required, only money)         this.infrastructureCosts = {             roadway: {                 local: 50,      // $50 per block                 arterial: 200,  // $200 per block                   highway: 500    // $500 per block             },             sidewalks: 25,      //...
```

### calculateRoadMaintenance() - game.js
```javascript
calculateRoadMaintenance() {         // TODO: Move to server-side calculation         console.log('⚠️ calculateRoadMaintenance() - placeholder for server migration');         return 0;     }          updatePlayerParcelsAndAging() {         this.economicCache.playerParcels.clear();                  f...
```

### calculateRoadMaintenance() - game.js
```javascript
calculateRoadMaintenance() - placeholder for server migration');         return 0;     }          updatePlayerParcelsAndAging() {         this.economicCache.playerParcels.clear();                  for (let row = 0; row < this.gridSize; row++) {             for (let col = 0; col < this.gridSize; col+...
```

### checkRoadConnectivity() - game.js
```javascript
checkRoadConnectivity(row, col) {         // Check all 8 adjacent cells for roads         const directions = [             [-1, -1], [-1, 0], [-1, 1],             [0, -1],           [0, 1],             [1, -1],  [1, 0],  [1, 1]         ];                  for (const [dr, dc] of directions) {...
```

### calculateBuildingCostWithFunding() - game.js
```javascript
calculateBuildingCostWithFunding(building, fullCost) {         // Delegate to building system for proper modularity         return this.buildingSystem.calculateBuildingCostWithFunding(building, fullCost);     }      calculateCurrentCashflow() {         console.log('🔍 calculateCurrentCashflow called...
```

### calculateBuildingCostWithFunding() - game.js
```javascript
calculateBuildingCostWithFunding(building, fullCost);     }      calculateCurrentCashflow() {         console.log('🔍 calculateCurrentCashflow called:', {             cache: this.cache?.cashflowBreakdown,             dailyCashflowTotals: this.dailyCashflowTotals         });          // Trigger async...
```

### showLeaderboardModal() - game.js
```javascript
showLeaderboardModal() {         const playerNetWorth = this.calculatePlayerNetWorth();         const playerName = this.playerSettings?.name || 'You';                  // Simulated leaderboard data - in real multiplayer this would come from server         const leaderboardData = [             { name...
```

### showModal() - game.js
```javascript
showModal('leaderboard-modal');     }          // Show player stats modal     showPlayerStatsModal() {         const stats = this.generatePlayerStats();         const statsContent = document.getElementById('player-stats-content');                  if (statsContent) {             statsContent.innerHT...
```

### showPlayerStatsModal() - game.js
```javascript
showPlayerStatsModal() {         const stats = this.generatePlayerStats();         const statsContent = document.getElementById('player-stats-content');                  if (statsContent) {             statsContent.innerHTML = Object.entries(stats).map(([category, data]) => `                 <div cl...
```

### showModal() - game.js
```javascript
showModal('player-stats-modal');     }          // Show save game modal     showSaveGameModal() {         // Generate default save name         const date = new Date();         const defaultName = `${this.playerSettings?.name || 'Player'} - ${date.toLocaleDateString()}`;         document.getElementB...
```

### showSaveGameModal() - game.js
```javascript
showSaveGameModal() {         // Generate default save name         const date = new Date();         const defaultName = `${this.playerSettings?.name || 'Player'} - ${date.toLocaleDateString()}`;         document.getElementById('save-name').value = defaultName;                  // Update save detail...
```

### showModal() - game.js
```javascript
showModal('save-game-modal');     }      async resetGame() {         console.log('🔄 Resetting game...');          try {             // Clear ALL game-related localStorage data to prevent restored state             const keys = Object.keys(localStorage);             keys.forEach(key => {...
```

### closeModal() - game.js
```javascript
closeModal('save-game-modal');                      } catch (error) {             alert('Failed to save game. Save data may be too large.');             console.error('Save failed:', error);         }     }          // Calculate player's total net worth (cash + asset value)     calculatePlayerNetWor...
```

### showGovernanceModal() - game.js
```javascript
showGovernanceModal();                 };             }         }                  // Legacy: Update population in sidebar - target the CITIZENS row specifically (if it still exists)         const metricRows = document.querySelectorAll('.metric-row');         metricRows.forEach(row => {...
```

### showMobilityTooltip() - game.js
```javascript
showMobilityTooltip(row, col, mouseX, mouseY) {         // Don't show tooltip if context menu is open         if (this.contextMenu && this.contextMenu.classList && this.contextMenu.classList.contains('visible')) {             return;         }                  if (!this.simpleTooltip) {...
```

### getMobilitySupplyType() - game.js
```javascript
getMobilitySupplyType(building.category);                 content += `🚛 Supply: ${supplyType}<br>`;                                  // Connectivity info                 try {                     const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                     const conn...
```

### getNearbyRoads() - game.js
```javascript
getNearbyRoads(row, col);                     if (nearbyRoads.length > 0) {                         content += `🔗 Adjacent Roads: ${nearbyRoads.length}<br>`;                     }                 } catch (e) {                     // Skip if error                 }                                  /...
```

### handleMobilityTooltips() - game.js
```javascript
handleMobilityTooltips(tile, mouseEvent) {         // Clear any existing tooltip timer         if (this.mobilityTooltipTimer) {             clearTimeout(this.mobilityTooltipTimer);             this.mobilityTooltipTimer = null;         }                  // Always hide tooltip immediately when mouse...
```

### showMobilityTooltip() - game.js
```javascript
showMobilityTooltip(tile.row, tile.col, mouseEvent.clientX, mouseEvent.clientY);                 }             }, 500); // 500ms delay                      } else {             this.selectedTile = null;             if (this.domCache.selectedTile) {                 this.domCache.selectedTile.textCont...
```

### getMobilitySupplyType() - game.js
```javascript
getMobilitySupplyType(category) {         const supplyTypes = {             'housing': 'Housing',             'commercial': 'Food/Goods',             'utilities': 'Energy',             'office': 'Jobs/Workers',             'education': 'Jobs/Workers',             'civic': 'Jobs/Workers',...
```

### buildTransportNetwork() - game.js
```javascript
buildTransportNetwork();                  // Check all parcels to see if they're reachable         for (let r = 0; r < this.gridSize; r++) {             for (let c = 0; c < this.gridSize; c++) {                 if (r === row && c === col) continue;                                  const distance = t...
```

### showGovernanceModal() - game.js
```javascript
showGovernanceModal() {         // Delegate to governance system         this.governanceSystem.openGovernanceModal();     }          hideGovernanceModal() {         // Delegate to governance system         this.governanceSystem.closeGovernanceModal();     }          showActionMarketplace() {...
```

### openGovernanceModal() - game.js
```javascript
openGovernanceModal();     }          hideGovernanceModal() {         // Delegate to governance system         this.governanceSystem.closeGovernanceModal();     }          showActionMarketplace() {         // Delegate to action marketplace         if (this.actionMarketplace) {             this.actio...
```

### hideGovernanceModal() - game.js
```javascript
hideGovernanceModal() {         // Delegate to governance system         this.governanceSystem.closeGovernanceModal();     }          showActionMarketplace() {         // Delegate to action marketplace         if (this.actionMarketplace) {             this.actionMarketplace.openMarketplace();...
```

### closeGovernanceModal() - game.js
```javascript
closeGovernanceModal();     }          showActionMarketplace() {         // Delegate to action marketplace         if (this.actionMarketplace) {             this.actionMarketplace.openMarketplace();         }     }          closeActionMarketplace() {         // Delegate to action marketplace...
```

### updateGovernanceModal() - game.js
```javascript
updateGovernanceModal();     }      updateGovernanceModal() {         // Delegate to governance system for modal updates         if (this.governanceSystem) {             this.governanceSystem.updateGovernanceModal();         }     }           getUnallocatedPoints() {         // Legacy method - now d...
```

### updateGovernanceModal() - game.js
```javascript
updateGovernanceModal() {         // Delegate to governance system for modal updates         if (this.governanceSystem) {             this.governanceSystem.updateGovernanceModal();         }     }           getUnallocatedPoints() {         // Legacy method - now delegated to governance system...
```

### updateGovernanceModal() - game.js
```javascript
updateGovernanceModal();         }     }           getUnallocatedPoints() {         // Legacy method - now delegated to governance system         if (this.governanceSystem) {             return this.governanceSystem.governance.votingPoints;         }         return 0;     }          calculateBudgetA...
```

### updateGovernanceModal() - game.js
```javascript
updateGovernanceModal(); // Update UI         }     }          highlightGovernanceButton() {         const governanceBtn = document.getElementById('governance-btn');         if (governanceBtn) {             // Remove any existing animation class first             governanceBtn.classList.remove('gove...
```

### calculateRepairCost() - game.js
```javascript
calculateRepairCost(parcel, building) {         // Delegate to building system for proper modularity         return this.buildingSystem.calculateRepairCost(parcel, building);     }          calculateCurrentBuildingValue(parcel, building) {         // Delegate to building system for proper modularity...
```

### calculateRepairCost() - game.js
```javascript
calculateRepairCost(parcel, building);     }          calculateCurrentBuildingValue(parcel, building) {         // Delegate to building system for proper modularity         return this.buildingSystem.calculateCurrentBuildingValue(parcel, building);     }          // Moved to BuildingSystem.repairBui...
```

### getBuildingCost() - game.js
```javascript
getBuildingCost(buildingId);         const discountedCost = this.governanceSystem ?             this.governanceSystem.getBuildingCostWithFunding(building) :             baseBuildingCost;          const playerCostRequired = discountedCost;                  if (this.playerCash < playerCostRequired) {...
```

### getBuildingCostWithFunding() - game.js
```javascript
getBuildingCostWithFunding(building) :             baseBuildingCost;          const playerCostRequired = discountedCost;                  if (this.playerCash < playerCostRequired) {             reasons.push(`Insufficient funds: need $${playerCostRequired.toLocaleString()} (have $${Math.floor(this.pl...
```

### getBuildingDataByName() - game.js
```javascript
getBuildingDataByName(buildingName);         if (!buildingData) return;          const panel = document.getElementById('building-info-panel');                  // Update panel content         document.getElementById('building-info-title').textContent = buildingData.name;                  // Building...
```

### getBuildingDataByName() - game.js
```javascript
getBuildingDataByName(buildingName) {         const building = this.buildingManager.getAllBuildings().find(b =>             b.name === buildingName || b.id === buildingName         );                  if (building) {             // Separate supply/demand from soft metrics             // Legacy domai...
```

### calculateBuildingCostWithFunding() - game.js
```javascript
calculateBuildingCostWithFunding(building, buildingData.cost);         const playerCost = fundingInfo.playerCost;         const publicFunding = fundingInfo.publicFunding;         const availableFunds = fundingInfo.availableFunds;                  // Show player cost and public funding indicator...
```

### cost() - game.js
```javascript
cost (could be $0) with public funding indicator             costRow.innerHTML = `                 <span class="jeefhh-label">COST</span>                 <div style="display: flex; align-items: center; gap: 6px; margin-left: auto;">                     <span class="info-value">$${playerCost.toLocale...
```

### buildTransportNetwork() - game.js
```javascript
buildTransportNetwork() {         return this.transportationSystem.buildTransportNetwork();     }          // NEW: Calculate how much population can access a building through transport     calculateAccessiblePopulation(row, col) {         let totalAccessible = 0;         const transportNetwork = thi...
```

### buildTransportNetwork() - game.js
```javascript
buildTransportNetwork();     }          // NEW: Calculate how much population can access a building through transport     calculateAccessiblePopulation(row, col) {         let totalAccessible = 0;         const transportNetwork = this.buildTransportNetwork();                  // Check all parcels in...
```

### buildTransportNetwork() - game.js
```javascript
buildTransportNetwork();                  // Check all parcels in the grid         for (let r = 0; r < this.gridSize; r++) {             for (let c = 0; c < this.gridSize; c++) {                 const parcel = this.grid[r][c];                                  // Look for residential buildings...
```

### hasRoadConnection() - game.js
```javascript
hasRoadConnection(row1, col1, row2, col2, roads) {         // Enhanced BFS to find connection and track the best road type in the path         if (row1 === row2 && col1 === col2) return { connected: true, bestRoadType: 'highway' };                  const visited = new Set();         const queue = [{...
```

### hasRoadConnection() - game.js
```javascript
hasRoadConnection(row1, col1, row2, col2, transportNetwork.roads);             if (roadConnection.connected) {                 // Roads provide significant distance reduction for farther parcels                 const roadDistance = Math.max(1, Math.floor(manhattanDistance * 0.5));                 re...
```

### mobility() - game.js
```javascript
mobility (can be reopened manually)             if (!vitalitySection.classList.contains('collapsed')) {                 this.closeSidebarSection(vitalitySection);             }                          // Remove players panel completely (not just hide)             if (playersSection) {...
```

### getBuildingDataByName() - game.js
```javascript
getBuildingDataByName(parcel.building);                     if (buildingData && buildingData.livability) {                         // Add impacts from each CARENS domain                         Object.keys(carensScores).forEach(domain => {                             const livabilityData = buildingD...
```

### buildInfrastructure() - game.js
```javascript
buildInfrastructure(edgeType, row, col, infrastructureType, value, playerId = 'player') {         // Only allow infrastructure building in mobility layer         if (this.currentLayer !== 'mobility') {             this.showNotification('Switch to Mobility View to build infrastructure', 'error');...
```

### getInfrastructureCost() - game.js
```javascript
getInfrastructureCost(infrastructureType, value);         if (this.playerData.cash < cost) {             this.showNotification(`Not enough cash! Need $${cost}`, 'error');             return false;         }          // Get the edge parcel         let edgeParcel;         if (edgeType === 'horizontal'...
```

### addInfrastructureToParcel() - game.js
```javascript
addInfrastructureToParcel(edgeParcel, infrastructureType, value, cost, playerId);                  if (success) {             // Deduct cost from player             this.playerData.cash -= cost;             this.updatePlayerDisplay();             // Visual confirmation via UI update - notification r...
```

### getInfrastructureCost() - game.js
```javascript
getInfrastructureCost(infrastructureType, value) {         const costs = this.infrastructureCosts;                  switch (infrastructureType) {             case 'roadway':                 return costs.roadway[value] || 0;             case 'sidewalks':                 return costs.sidewalks;...
```

### addInfrastructureToParcel() - game.js
```javascript
addInfrastructureToParcel(edgeParcel, infrastructureType, value, cost, playerId) {         const infra = edgeParcel.infrastructure;          switch (infrastructureType) {             case 'roadway':                 if (infra.roadway) {                     this.showNotification('Road already exists h...
```

### getMobilityLayerColor() - game.js
```javascript
getMobilityLayerColor(row, col);             case 'normal':             default:                 // Original logic for normal view                 if (parcel.building) {                     return '#2a2a2a'; // Standard ground color                 }                                  // Base parcel c...
```

### getMobilityLayerColor() - game.js
```javascript
getMobilityLayerColor(row, col) {         const parcel = this.grid[row][col];                  // Show ownership with clear colors for better visibility         if (!parcel.owner) {             return '#1a1a1a'; // Dark gray for unowned         } else if (this.isCurrentPlayer(parcel.owner)) {...
```

### getRoadConnectedParcels() - game.js
```javascript
getRoadConnectedParcels(row, col);                  // Add road-connected parcels that aren't already in basic radius         roadConnectedParcels.forEach(parcelKey => {             if (!influencedTiles.has(parcelKey)) {                 influencedTiles.add(`${parcelKey}:extended`);             }...
```

### roads() - game.js
```javascript
roads (simplified)     getRoadConnectedParcels(startRow, startCol) {         const connectedParcels = new Set();         const transportNetwork = this.buildTransportNetwork();                  // If no roads exist, return empty set         if (!transportNetwork.roads || transportNetwork.roads.size =...
```

### getRoadConnectedParcels() - game.js
```javascript
getRoadConnectedParcels(startRow, startCol) {         const connectedParcels = new Set();         const transportNetwork = this.buildTransportNetwork();                  // If no roads exist, return empty set         if (!transportNetwork.roads || transportNetwork.roads.size === 0) {             ret...
```

### buildTransportNetwork() - game.js
```javascript
buildTransportNetwork();                  // If no roads exist, return empty set         if (!transportNetwork.roads || transportNetwork.roads.size === 0) {             return connectedParcels;         }                  // Use BFS to find all connected parcels via roads         const visited = new...
```

### hasDirectRoadConnection() - game.js
```javascript
hasDirectRoadConnection(currentRow, currentCol, r, c, transportNetwork.roads)) {                         visited.add(targetKey);                         queue.push(targetKey);                         connectedParcels.add(targetKey);                     }                 }             }         }...
```

### hasDirectRoadConnection() - game.js
```javascript
hasDirectRoadConnection(row1, col1, row2, col2, roads) {         const key1 = `${row1},${col1}`;         const key2 = `${row2},${col2}`;                  // Check if either parcel connects to the other         const connections1 = roads.get(key1) || [];         const connections2 = roads.get(key2) |...
```

### addMobilityEffects() - game.js
```javascript
addMobilityEffects();             } else if (this.parcelSelector) {                 // Clear mobility effects when no edge is hovered                 this.parcelSelector.clearProximityEffects();             }              if (needsRender) {                 this.scheduleRender();             }...
```

### handleMobilityTooltips() - game.js
```javascript
handleMobilityTooltips(tile, mockEvent);             return; // Early return to prevent normal tooltip logic         }                  if (tile) {             this.selectedTile = tile;             const coord = this.getParcelCoordinate(tile.row, tile.col);             if (this.domCache.selectedTile...
```

### removeRoadFromSelectedEdges() - game.js
```javascript
removeRoadFromSelectedEdges();                     }                     break;             }         });     }          // Update the real-time market dashboard     updateMarketDashboard() {         if (!document.getElementById('market-dashboard-modal') ||              document.getElementById('mark...
```

### openGovernanceModal() - game.js
```javascript
openGovernanceModal();                 } else {                     console.error('Governance system not initialized');                 }             });         }     };          // Market Dashboard button     const openMarketDashboardBtn = document.getElementById('open-market-dashboard');     if (...
```

### showLeaderboardModal() - game.js
```javascript
showLeaderboardModal();             }             // Close player menu             const playerMenu = document.getElementById('player-menu');             if (playerMenu) {                 playerMenu.classList.remove('active');             }         });     }      const showPlayerStatsBtn = document....
```

### showPlayerStatsModal() - game.js
```javascript
showPlayerStatsModal();             }             // Close player menu             const playerMenu = document.getElementById('player-menu');             if (playerMenu) {                 playerMenu.classList.remove('active');             }         });     }      const saveGameBtn = document.getElem...
```

### showSaveGameModal() - game.js
```javascript
showSaveGameModal();             }             // Close player menu             const playerMenu = document.getElementById('player-menu');             if (playerMenu) {                 playerMenu.classList.remove('active');             }         });     }      // Reset game button     const resetGam...
```

### updateRoadAdjustment() - game.js
```javascript
updateRoadAdjustment(property, value, displayElement, suffix = '') {         game.roadAdjustments[property] = parseFloat(value);         displayElement.textContent = value + suffix;         game.scheduleRender();     }      // Road angle control     if (roadAngle) {         roadAngle.addEventListene...
```

### updateRoadAdjustment() - game.js
```javascript
updateRoadAdjustment('angle', e.target.value, roadAngleValue, '°');         });     }      // Road width multiplier control     if (roadWidthMultiplier) {         roadWidthMultiplier.addEventListener('input', (e) => {             updateRoadAdjustment('widthMultiplier', e.target.value, roadWidthValue...
```

### updateRoadAdjustment() - game.js
```javascript
updateRoadAdjustment('widthMultiplier', e.target.value, roadWidthValue, 'x');         });     }      // Road X offset control     if (roadOffsetX) {         roadOffsetX.addEventListener('input', (e) => {             updateRoadAdjustment('offsetX', e.target.value, roadOffsetXValue, 'px');         });...
```

### updateRoadAdjustment() - game.js
```javascript
updateRoadAdjustment('offsetX', e.target.value, roadOffsetXValue, 'px');         });     }      // Road Y offset control     if (roadOffsetY) {         roadOffsetY.addEventListener('input', (e) => {             updateRoadAdjustment('offsetY', e.target.value, roadOffsetYValue, 'px');         });...
```

### updateRoadAdjustment() - game.js
```javascript
updateRoadAdjustment('offsetY', e.target.value, roadOffsetYValue, 'px');         });     }      // Reset button     if (resetRoadBtn) {         resetRoadBtn.addEventListener('click', () => {         // Reset all road adjustment values to defaults         game.roadAdjustments = {             angle: 0...
```

### addRoad() - transportation.js
```javascript
addRoad(row, col, edge, type = 'street') {         const key = `${row},${col},${edge}`;                  if (this.roads.has(key)) {             console.log('Road already exists at', key);             return false;         }                  const roadType = this.roadTypes[type] || this.roadTypes.str...
```

### removeRoad() - transportation.js
```javascript
removeRoad(row, col, edge) {         const key = `${row},${col},${edge}`;                  if (!this.roads.has(key)) {             return false;         }                  this.roads.delete(key);                  // Remove from edge roads         if (edge === 'horizontal') {             delete this....
```

### hasRoad() - transportation.js
```javascript
hasRoad(row, col, edge) {         // Check mobility layer roads first (primary source of truth)         if (this.game.mobilityLayer && this.game.mobilityLayer.roads) {             // Convert edge-based query to intersection-based road lookup             const intersections = this.getEdgeIntersection...
```

### getRoad() - transportation.js
```javascript
getRoad(row, col, edge) {         // Try mobility layer first         if (this.game.mobilityLayer && this.game.mobilityLayer.roads) {             const intersections = this.getEdgeIntersections(row, col, edge);             if (intersections) {                 const { from, to } = intersections;...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(row, col) {         // Check all four edges         const edges = [             { r: row, c: col, e: 'horizontal' },     // Top             { r: row + 1, c: col, e: 'horizontal' }, // Bottom             { r: row, c: col, e: 'vertical' },       // Left             { r: row, c: col + 1,...
```

### hasRoad() - transportation.js
```javascript
hasRoad(r, c, e));     }      /**      * Calculate accessibility score based on road connectivity quality      */     calculateAccessibilityScore(row, col) {         let accessibilityScore = 0;         let roadCount = 0;         let connectedNeighbors = 0;          // Check all four edges for roads...
```

### hasRoad() - transportation.js
```javascript
hasRoad(r, c, e)) {                 roadCount++;                 accessibilityScore += 25; // Base 25 points per road             }         });          // Bonus for connected neighbors (better network effect)         const neighbors = [             [row - 1, col], [row + 1, col], // North, South...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(nRow, nCol)) {                 connectedNeighbors++;             }         });          // Network effect bonus (0-25 points)         accessibilityScore += (connectedNeighbors / 4) * 25;          // Distance to road network center bonus         const networkCenter = this.findNetworkCen...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(row, col)) {                     totalX += col;                     totalY += row;                     roadCount++;                 }             }         }          if (roadCount === 0) return null;          return {             row: Math.round(totalY / roadCount),             col: M...
```

### getAdjacentRoads() - transportation.js
```javascript
getAdjacentRoads(row, col) {         const roads = [];                  // Check all four edges         const edges = [             { r: row, c: col, e: 'horizontal', side: 'top' },             { r: row + 1, c: col, e: 'horizontal', side: 'bottom' },             { r: row, c: col, e: 'vertical', side...
```

### getRoad() - transportation.js
```javascript
getRoad(r, c, e);             if (road) {                 roads.push({ ...road, side });             }         });                  return roads;     }          /**      * Calculate connectivity score for a parcel      */     calculateConnectivity(row, col) {         const adjacentRoads = this.getAd...
```

### getAdjacentRoads() - transportation.js
```javascript
getAdjacentRoads(row, col);                  if (adjacentRoads.length === 0) return 0;                  // Base connectivity from number of roads         let connectivity = adjacentRoads.length * 25;                  // Bonus for road quality         adjacentRoads.forEach(road => {             if (r...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(startRow, startCol);         const endAccess = this.hasRoadAccess(endRow, endCol);          if (!startAccess || !endAccess) {             return null; // No path possible         }          // Use built network for pathfinding         const network = this.buildTransportNetwork();...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(endRow, endCol);          if (!startAccess || !endAccess) {             return null; // No path possible         }          // Use built network for pathfinding         const network = this.buildTransportNetwork();         if (!network || network.roads.size === 0) {             // Fall...
```

### buildTransportNetwork() - transportation.js
```javascript
buildTransportNetwork();         if (!network || network.roads.size === 0) {             // Fallback to distance if no network available             const distance = Math.abs(endRow - startRow) + Math.abs(endCol - startCol);             return {                 distance,                 travelTime:...
```

### getRoadEfficiency() - transportation.js
```javascript
getRoadEfficiency(connection.roadType);                 const adjustedDistance = edgeDistance / roadEfficiency;                  const tentativeDistance = distances.get(current) + adjustedDistance;                  if (tentativeDistance < distances.get(neighborKey)) {                     distances.s...
```

### getTransportEfficiency() - transportation.js
```javascript
getTransportEfficiency(transportMode, resourceType, roadType = null) {         // For road-based transport         if (roadType && this.roadTypes[roadType]) {             const baseEfficiency = this.roadTypes[roadType].efficiency[resourceType] || 0.5;              // Check for additional infrastruct...
```

### infrastructure() - transportation.js
```javascript
infrastructure (sidewalks, bike lanes)             let infrastructureBonus = 0;             if (this.game.mobilityLayer) {                 const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;                  // Sidewalks boost people movement efficiency                 if (r...
```

### transport() - transportation.js
```javascript
transport (bus, subway)         if (this.transitModes[transportMode]) {             return this.transitModes[transportMode].efficiency[resourceType] || 0.0;         }          return 0.5; // Default fallback     }      /**      * Get legacy road efficiency for backward compatibility      */     getR...
```

### getRoadEfficiency() - transportation.js
```javascript
getRoadEfficiency(roadType, resourceType = 'goods') {         return this.getTransportEfficiency(null, resourceType, roadType);     }      /**      * Calculate health and environmental impacts of transport infrastructure      */     calculateTransportImpacts(row, col) {         if (!this.game.mobili...
```

### getTransportEfficiency() - transportation.js
```javascript
getTransportEfficiency(null, resourceType, roadType);     }      /**      * Calculate health and environmental impacts of transport infrastructure      */     calculateTransportImpacts(row, col) {         if (!this.game.mobilityLayer) {             return { health: 0, environment: 0, walkability: 0...
```

### calculateTransportImpacts() - transportation.js
```javascript
calculateTransportImpacts(row, col) {         if (!this.game.mobilityLayer) {             return { health: 0, environment: 0, walkability: 0 };         }          let totalNoise = 0;         let totalPollution = 0;         let totalWalkability = 0;         let totalHealth = 0;         let roadCount...
```

### getAdjacentRoads() - transportation.js
```javascript
getAdjacentRoads(row, col);         for (const road of adjacentRoads) {             const roadData = this.roadTypes[road.type] || this.roadTypes.local;             totalNoise += roadData.noise;             totalPollution += roadData.pollution;             totalWalkability += roadData.walkability;...
```

### calculateMaintenanceCost() - transportation.js
```javascript
calculateMaintenanceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Maintenance increases with age and decreases with condition             const ageFactor = 1 + (Date.now() - road.built) / (365 * 24 * 60 * 60 * 1000);             const conditionFacto...
```

### updateRoadConditions() - transportation.js
```javascript
updateRoadConditions(deltaTime) {         this.roads.forEach(road => {             // Roads decay over time and with traffic             const decayRate = 0.001 * deltaTime;             const trafficDecay = road.traffic * 0.0001 * deltaTime;             road.condition = Math.max(0, road.condition -...
```

### repairRoad() - transportation.js
```javascript
repairRoad(row, col, edge) {         const road = this.getRoad(row, col, edge);         if (road) {             road.condition = 1.0;             return true;         }         return false;     }          /**      * Create a public transit route      */     createRoute(name, stops, mode = 'bus') {...
```

### getRoad() - transportation.js
```javascript
getRoad(row, col, edge);         if (road) {             road.condition = 1.0;             return true;         }         return false;     }          /**      * Create a public transit route      */     createRoute(name, stops, mode = 'bus') {         const route = {             id: `route_${Date.n...
```

### hasRoadAccess() - transportation.js
```javascript
hasRoadAccess(row, col)) {                     connectedParcels++;                 }             }         }                  return totalParcels > 0 ? (connectedParcels / totalParcels) * 100 : 0;     }          /**      * Get statistics for display      */     getStatistics() {         return {...
```

### calculateMaintenanceCost() - transportation.js
```javascript
calculateMaintenanceCost(),             networkEfficiency: this.calculateNetworkEfficiency(),             roadsByType: {                 street: Array.from(this.roads.values()).filter(r => r.type === 'street').length,                 avenue: Array.from(this.roads.values()).filter(r => r.type === 'av...
```

### drawRoads() - transportation.js
```javascript
drawRoads(ctx) {         // This would contain road drawing logic         // Currently handled by the mobility layer     }          /**      * Build transport network using mobility layer roads      * @returns {Object} Transport network with nodes, connections, and roads      */     buildTransportNe...
```

### buildTransportNetwork() - transportation.js
```javascript
buildTransportNetwork() {         // Build transport network using mobility layer roads         if (!this.game.mobilityLayer) {             // Fallback for when mobility layer is not available             console.warn('Transportation: Mobility layer not available, roads will not connect properly');...
```

### calculateRoadResourceAccessibility() - transportation.js
```javascript
calculateRoadResourceAccessibility(fromRow, fromCol, resourceType, maxDistance);         accessible.push(...roadAccessible);          // Get resources accessible via transit routes (for people only)         if (resourceType === 'workers' || resourceType === 'jobs') {             const transitAccessi...
```

### calculateRoadResourceAccessibility() - transportation.js
```javascript
calculateRoadResourceAccessibility(fromRow, fromCol, resourceType, maxDistance = 10) {         const network = this.buildTransportNetwork();         if (!network || network.roads.size === 0) {             return [];         }          const accessible = [];         const fromKey = `${fromRow},${from...
```

### buildTransportNetwork() - transportation.js
```javascript
buildTransportNetwork();         if (!network || network.roads.size === 0) {             return [];         }          const accessible = [];         const fromKey = `${fromRow},${fromCol}`;          // Check if starting position has road access         if (!network.roads.has(fromKey)) {...
```

### getTransportEfficiency() - transportation.js
```javascript
getTransportEfficiency(null, resourceType, roadType);                     const newPathEfficiency = pathEfficiency * stepEfficiency;                      queue.push({                         key: neighborKey,                         distance: distance + 1,                         pathEfficiency: new...
```

### getTransportEfficiency() - transportation.js
```javascript
getTransportEfficiency(transitMode, 'people');                         const serviceLevelMultiplier = this.getServiceLevelMultiplier(serviceLevel);                         const walkingPenalty = this.calculateWalkingDistance(fromRow, fromCol, stop.row, stop.col) * 0.1;                         const...
```

## 🎯 Event Handling Patterns

### Event: resize - game.js
```javascript
this.currentTool = btn.dataset.tool;             });         });                  window.addEventListener('resize', () => {             this.renderingSystem.setupCanvas();             this.scheduleRender();         });                  // Keyboard shortcuts for mobility layer         docu
```

### Event: keydown - game.js
```javascript
uleRender();         });                  // Keyboard shortcuts for mobility layer         document.addEventListener('keydown', (e) => {             // Handle land value mode toggle (T key when in landvalue layer)             if (e.key === 't' || e.key === 'T') {                 if (this.currentLaye
```

### Event: click - game.js
```javascript
mentById('open-market-dashboard');     if (openMarketDashboardBtn) {         openMarketDashboardBtn.addEventListener('click', () => {             const modal = document.getElementById('market-dashboard-modal');             if (modal) {                 modal.style.display = 'block';                 g
```

### Event: click - game.js
```javascript
dal = document.getElementById('route-modal');          if (createRouteBtn) {         createRouteBtn.addEventListener('click', () => {             const ticketPrice = parseFloat(document.getElementById('ticket-price').value) || 2.50;             const serviceLevel = document.querySelector('input[name
```

### Event: click - game.js
```javascript
}             }         });     }          if (cancelRouteBtn) {         cancelRouteBtn.addEventListener('click', () => {             // Reset route creation state             if (window.game.mobilityLayer) {                 window.game.mobilityLayer.isCreatingRoute = false;
```

### Event: click - game.js
```javascript
SaveBtn = document.getElementById('confirm-save');     if (confirmSaveBtn) {         confirmSaveBtn.addEventListener('click', () => {             if (window.game) {                 window.game.saveGame();             }         });     }          // Global modal functions with smooth animations     w
```

### Event: input - game.js
```javascript
game.scheduleRender();     }      // Road angle control     if (roadAngle) {         roadAngle.addEventListener('input', (e) => {             updateRoadAdjustment('angle', e.target.value, roadAngleValue, '°');         });     }      // Road width multiplier control     if (roadWidthMultiplier)
```

### Event: input - game.js
```javascript
}      // Road width multiplier control     if (roadWidthMultiplier) {         roadWidthMultiplier.addEventListener('input', (e) => {             updateRoadAdjustment('widthMultiplier', e.target.value, roadWidthValue, 'x');         });     }      // Road X offset control     if (roadOffsetX) {
```

### Event: input - game.js
```javascript
e, 'x');         });     }      // Road X offset control     if (roadOffsetX) {         roadOffsetX.addEventListener('input', (e) => {             updateRoadAdjustment('offsetX', e.target.value, roadOffsetXValue, 'px');         });     }      // Road Y offset control     if (roadOffsetY) {         r
```

### Event: input - game.js
```javascript
, 'px');         });     }      // Road Y offset control     if (roadOffsetY) {         roadOffsetY.addEventListener('input', (e) => {             updateRoadAdjustment('offsetY', e.target.value, roadOffsetYValue, 'px');         });     }      // Reset button     if (resetRoadBtn) {         resetRoad
```

### Event: click - game.js
```javascript
tYValue, 'px');         });     }      // Reset button     if (resetRoadBtn) {         resetRoadBtn.addEventListener('click', () => {         // Reset all road adjustment values to defaults         game.roadAdjustments = {             angle: 0,             widthMultiplier: 1.0,             offsetX:
```

### Event: new - game.js
```javascript
tooltipManager = new TooltipManager(this);          // Initialize context menu system         this.contextMenuSystem = new ContextMenuSystem(this);          // Mobility tooltip timer         this.mobilityTooltipTimer = null;                  // Performance optimizations         this.isRenderSchedule
```

### Event: new - game.js
```javascript
es         this.accessibilityCache = new Map(); // Cache accessibility scores         this.dirtyRegions = new Set(); // Track regions that need recalculation         this.selectedStreetEdges = new Set(); // Track selected street edges for mobility layer         this.lastCacheUpdate = 0; // Track whe
```

### Event: new - game.js
```javascript
nfluenced by hover                  // Transportation System - Clean slate         this.transportationSystem = new TransportationSystem(this);          // Transport capacity system removed - was 75% dead code          // Mobility Layer - New visualization system         this.mobilityLayer = new Mobi
```

### Event: stop_sign - game.js
```javascript
walks = ['north', 'south'];             this.edgeParcels.intersections[0][0].infrastructure.trafficControl = 'stop_sign';         }     }      populateBuildingCategories() {         // Delegate to building system         this.buildingSystem.populateBuildingCategories();     }      startGameTime() {
```

### Event: [ - game.js
```javascript
ckRoadConnectivity(row, col) {         // Check all 8 adjacent cells for roads         const directions = [             [-1, -1], [-1, 0], [-1, 1],             [0, -1],           [0, 1],             [1, -1],  [1, 0],  [1, 1]         ];                  for (const [dr, dc] of directions) {
```

### Event: () - game.js
```javascript
treasuryRow.style.border = '1px solid rgba(255, 215, 0, 0.3)';                 treasuryRow.onclick = () => {                     // Open governance modal/section                     this.showGovernanceModal();                 };             }         }                  // Legacy: Update pop
```

### Event: this.mobilityLayer.getParcelConnectivity(row, - game.js
```javascript
// Connectivity info                 try {                     const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                     const connectStatus = connectivity.connected ? '✅ Connected' : '❌ Isolated';                     content += `🛣️ R
```

### Event: connectivity.connected - game.js
```javascript
const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                     const connectStatus = connectivity.connected ? '✅ Connected' : '❌ Isolated';                     content += `🛣️ Road Access: ${connectStatus}<br>`;                                          if (connectivity.
```

### Event: this.mobilityLayer.getParcelConnectivity(row, - game.js
```javascript
// Add connectivity info for empty parcels             try {                 const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                 const connectStatus = connectivity.connected ? '✅ Connected to road network' : '❌ No road access';                 con
```

### Event: connectivity.connected - game.js
```javascript
const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                 const connectStatus = connectivity.connected ? '✅ Connected to road network' : '❌ No road access';                 content += `🛣️ ${connectStatus}`;             } catch (e) {                 content += `🛣️
```

### Event: coord - game.js
```javascript
col);             if (this.domCache.selectedTile) {                 this.domCache.selectedTile.textContent = coord;             }                          // Set timer to show tooltip after mouse stops for 500ms             this.mobilityTooltipTimer = setTimeout(() => {                 // Double-che
```

### Event: roads.get(current.key) - game.js
```javascript
y);                          // Check all road connections from current position             const connections = roads.get(current.key) || [];             connections.forEach(conn => {                 const connKey = `${conn.row},${conn.col}`;                 if (!visited.has(connKey)) {
```

### Event: > - game.js
```javascript
tion             const connections = roads.get(current.key) || [];             connections.forEach(conn => {                 const connKey = `${conn.row},${conn.col}`;                 if (!visited.has(connKey)) {                     // Track the worst road type in the path (bottleneck principle)
```

### Event: ${conn.row},${conn.col} - game.js
```javascript
ns = roads.get(current.key) || [];             connections.forEach(conn => {                 const connKey = `${conn.row},${conn.col}`;                 if (!visited.has(connKey)) {                     // Track the worst road type in the path (bottleneck principle)                     const connRoadL
```

### Event: roadHierarchy[conn.roadType] - game.js
```javascript
// Track the worst road type in the path (bottleneck principle)                     const connRoadLevel = roadHierarchy[conn.roadType] || 1;                     const currentWorstLevel = roadHierarchy[current.worstRoadType] || 1;                     const newWorstLevel = Math.min(connRoadLe
```

### Event: this.hasRoadConnection(row1, - game.js
```javascript
ad connection path (basic pathfinding)         if (transportNetwork.roads) {             const roadConnection = this.hasRoadConnection(row1, col1, row2, col2, transportNetwork.roads);             if (roadConnection.connected) {                 // Roads provide significant distance reduction for fart
```

### Event: transportNetwork.connections.get(key1) - game.js
```javascript
nt2) {             const key1 = `${nearestToPoint1.row},${nearestToPoint1.col}`;             const connections = transportNetwork.connections.get(key1) || [];                          const connected = connections.some(conn =>                  conn.row === nearestToPoint2.row && conn.col === nearest
```

### Event: connections.some(conn - game.js
```javascript
const connections = transportNetwork.connections.get(key1) || [];                          const connected = connections.some(conn =>                  conn.row === nearestToPoint2.row && conn.col === nearestToPoint2.col             );                          if (connected) {                 // Ef
```

### Event: this.getRoadConnectedParcels(row, - game.js
```javascript
// Get all parcels connected via roads using a simpler approach         const roadConnectedParcels = this.getRoadConnectedParcels(row, col);                  // Add road-connected parcels that aren't already in basic radius         roadConnectedParcels.forEach(parcelKey => {
```

### Event: new - game.js
```javascript
is position via roads (simplified)     getRoadConnectedParcels(startRow, startCol) {         const connectedParcels = new Set();         const transportNetwork = this.buildTransportNetwork();                  // If no roads exist, return empty set         if (!transportNetwork.roads || transportNetw
```

### Event: roads.get(key1) - game.js
```javascript
`${row2},${col2}`;                  // Check if either parcel connects to the other         const connections1 = roads.get(key1) || [];         const connections2 = roads.get(key2) || [];                  return connections1.some(conn => conn.row === row2 && conn.col === col2) ||                con
```

### Event: roads.get(key2) - game.js
```javascript
her parcel connects to the other         const connections1 = roads.get(key1) || [];         const connections2 = roads.get(key2) || [];                  return connections1.some(conn => conn.row === row2 && conn.col === col2) ||                connections2.some(conn => conn.row === row1 && conn.col
```

### Event: > - game.js
```javascript
[];         const connections2 = roads.get(key2) || [];                  return connections1.some(conn => conn.row === row2 && conn.col === col2) ||                connections2.some(conn => conn.row === row1 && conn.col === col1);     }           // Draw green attenuation visualization for Data Ins
```

### Event: { - game.js
```javascript
(window.game.mobilityLayer && window.game.mobilityLayer.pendingRoute) {                 const routeConfig = {                     ticketPrice: ticketPrice,                     serviceLevel: serviceLevel                 };                                  // Create the route                 window.ga
```

### Event: value - game.js
```javascript
fix = '') {         game.roadAdjustments[property] = parseFloat(value);         displayElement.textContent = value + suffix;         game.scheduleRender();     }      // Road angle control     if (roadAngle) {         roadAngle.addEventListener('input', (e) => {             updateRoadAdjustment('ang
```

### Event: 0° - game.js
```javascript
};          // Update UI controls         roadAngle.value = 0;         roadAngleValue.textContent = '0°';         roadWidthMultiplier.value = 1.0;         roadWidthValue.textContent = '1.0x';         roadOffsetX.value = 0;         roadOffsetXValue.textContent = '0px';         roadOffsetY.va
```

### Event: 1.0x - game.js
```javascript
AngleValue.textContent = '0°';         roadWidthMultiplier.value = 1.0;         roadWidthValue.textContent = '1.0x';         roadOffsetX.value = 0;         roadOffsetXValue.textContent = '0px';         roadOffsetY.value = 0;         roadOffsetYValue.textContent = '0px';          game.scheduleRender(
```

### Event: 0px - game.js
```javascript
roadWidthValue.textContent = '1.0x';         roadOffsetX.value = 0;         roadOffsetXValue.textContent = '0px';         roadOffsetY.value = 0;         roadOffsetYValue.textContent = '0px';          game.scheduleRender();         });     }  // REMOVED - Economic balance controls are now only in d
```

### Event: 0px - game.js
```javascript
roadOffsetXValue.textContent = '0px';         roadOffsetY.value = 0;         roadOffsetYValue.textContent = '0px';          game.scheduleRender();         });     }  // REMOVED - Economic balance controls are now only in dev tools  // REMOVED - Part of sidebar economic balance controls  // Export I
```

### Event: this.getEdgeIntersections(row, - transportation.js
```javascript
// Convert edge-based query to intersection-based road lookup             const intersections = this.getEdgeIntersections(row, col, edge);             if (intersections) {                 const { from, to } = intersections;                 const edgeKey = `${from}-${to}`;                 c
```

### Event: this.getEdgeIntersections(row, - transportation.js
```javascript
if (this.game.mobilityLayer && this.game.mobilityLayer.roads) {             const intersections = this.getEdgeIntersections(row, col, edge);             if (intersections) {                 const { from, to } = intersections;                 const edgeKey = `${from}-${to}`;                 c
```

### Event: 0 - transportation.js
```javascript
bilityScore(row, col) {         let accessibilityScore = 0;         let roadCount = 0;         let connectedNeighbors = 0;          // Check all four edges for roads         const edges = [             { r: row, c: col, e: 'horizontal' },     // Top             { r: row + 1, c: col, e: 'horizontal'
```

### Event: adjacentRoads.length - transportation.js
```javascript
ads.length === 0) return 0;                  // Base connectivity from number of roads         let connectivity = adjacentRoads.length * 25;                  // Bonus for road quality         adjacentRoads.forEach(road => {             if (road.type === 'avenue') connectivity += 10;             if (
```

### Event: network.roads.get(current) - transportation.js
```javascript
previous, distances.get(endKey));             }              // Check neighbors             const connections = network.roads.get(current) || [];             for (const connection of connections) {                 const neighborKey = `${connection.row},${connection.col}`;                 if (!unvis
```

### Event: 0 - transportation.js
```javascript
// Check for additional infrastructure (sidewalks, bike lanes)             let infrastructureBonus = 0;             if (this.game.mobilityLayer) {                 const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;                  // Sidewalks boost people movement ef
```

### Event: this.game.mobilityLayer.infrastructureOptions - transportation.js
```javascript
uctureBonus = 0;             if (this.game.mobilityLayer) {                 const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;                  // Sidewalks boost people movement efficiency                 if (resourceType === 'people' && infrastructureOptions.sidewalks?.ac
```

### Event: this.game.mobilityLayer.infrastructureOptions - transportation.js
```javascript
}          // Check for pedestrian infrastructure benefits         const infrastructureOptions = this.game.mobilityLayer.infrastructureOptions;         if (infrastructureOptions.sidewalks?.active) {             totalHealth += 0.3;             totalWalkability += 0.3;         }         if (i
```

### Event: 2 - transportation.js
```javascript
const ageFactor = 1 + (Date.now() - road.built) / (365 * 24 * 60 * 60 * 1000);             const conditionFactor = 2 - road.condition;             totalCost += road.maintenance * ageFactor * conditionFactor;         });                  return totalCost;     }          /**      * Update road condi
```

### Event: Math.max(0, - transportation.js
```javascript
* deltaTime;             const trafficDecay = road.traffic * 0.0001 * deltaTime;             road.condition = Math.max(0, road.condition - decayRate - trafficDecay);         });     }          /**      * Repair a road      */     repairRoad(row, col, edge) {         const road = this.getRoad(row, c
```

### Event: 1.0 - transportation.js
```javascript
l, edge) {         const road = this.getRoad(row, col, edge);         if (road) {             road.condition = 1.0;             return true;         }         return false;     }          /**      * Create a public transit route      */     createRoute(name, stops, mode = 'bus') {         const rout
```

### Event: > - transportation.js
```javascript
omParcel);                          // Avoid duplicates                         if (!existing.some(conn => conn.row === row && conn.col === col)) {                             existing.push({ row, col, roadType: road.type });                         }                     }                 });
```

### Event: > - transportation.js
```javascript
toParcel);                          // Avoid duplicates                         if (!existing.some(conn => conn.row === row && conn.col === col)) {                             existing.push({ row, col, roadType: road.type });                         }                     }                 });
```

### Event: network.roads.get(key) - transportation.js
```javascript
}              // Add neighbors to queue with resource-specific efficiency             const connections = network.roads.get(key) || [];             for (const connection of connections) {                 const neighborKey = `${connection.row},${connection.col}`;                 if (!visited.h
```

## 💰 Cost Calculation Patterns

### game.js
```javascript
section                     }                 };             }         }          // Infrastructure costs (no actions required, only money)         this.infrastructureCosts = {             roadway: {                 local: 50,      // $50 per block                 arterial: 200,  // $200 per block                   highway: 500    // $500 per block             },             sidewalks: 25,      // $25 per block             bikelanes: 75,      // $75 per block             busStop: 100,       // $100 per stop             subwayEntrance: 1000, // $1000 per entrance             trafficControl: {                 stop_sign: 50,      // $50 per sign                 traffic_light: 500,  // $500 per light                 roundabout: 2000    // $2000 per roundabout             }         };          // Test: Add some infrastructure for demonstration         if (this.edgeParcels.horizonta
```

### game.js
```javascript
duleRender();             return true;         }          return false;     }      getInfrastructureCost(infrastructureType, value) {         const costs = this.infrastructureCosts;                  switch (infrastructureType) {             case 'roadway':                 return
```

### game.js
```javascript
;                  switch (infrastructureType) {             case 'roadway':                 return costs.roadway[value] || 0;             case 'sidewalks':                 return costs.sidewalks;             case 'bikelanes':                 return costs.bikelanes;             case 'busStop':                 return costs.busStop;             case 'subwayEntrance':                 return costs.subwayEntrance;             case 'trafficControl':                 return costs.trafficControl[value] || 0;             default:                 return 0;         }     }      addInfrastructureToParcel(edgeParcel, infrastructureType, value, cost, playerId) {         const infra = edgeParcel.infrastructure;          switch (infrastructureType) {             case 'roadway':                 if (infra.roadw
```

### game.js
```javascript
;             content += `<strong>Empty Parcel</strong> (${coord})<br>`;             content += `💰 Price: $${price}<br>`;                          // Add connectivity info for empty parcels             try {                 const connectivity = this.mobilityLayer.getParcelConnectivity(row, col);                 const connectStatus = connectivity.connected ? '✅ Connected to road network' : '❌
```

### game.js
```javascript
tageThreshold: 0.8,             oversupplyThreshold: 2.0,             baseRevenue: 1.0,             maintenance: 1.0         };         return defaults[propertyName] || 1.0;     }      // Setup road adjustment controls     const roadAngle = document.getElementById('road-angle');     const roadAngleValue = document.getElementById('road-angle-value');     const roadWidthMultipl
```

### transportation.js
```javascript
this.roadTypes = {             local: {                 name: 'Local Street',                 cost: 50,                 maintenance: 1,                 capacity: 100,                 speed: 30,                 // Resource-specific efficiency                 efficiency: {                     people: 0.5,  // Poor for people movement (car-dependent)                     goods: 0.4,   // Poor for goods (small vehicles)                     energy: 0.6,  // Good for local energy distribution (underground/overhead lines)                     food: 0.4     // Poor for food distribution                 },                 // Health and environmental impacts                 noise: 0.3,      // Low noise                 pollution: 0.4,  // Moderate pollution                 walkability: 0.7 // Good for walking             },             arterial: {                 name: 'Arterial Road',                 cost: 100,                 maintenance: 2,                 capacity: 200,                 speed: 40,                 efficiency: {                     people: 0.6,                     goods: 0.6,                     energy: 0.7,  // Good for energy transmission (utility corridors)                     food: 0.6                 },                 noise: 0.6,                 pollution: 0.7,                 walkability: 0.4             },             highway: {                 name: 'Highway',                 cost: 200,                 maintenance: 5,                 capacity: 500,                 speed: 60,                 efficiency: {                     people: 0.4,  // Poor for people (car-only)                     goods: 0.9,   // Excellent for goods transport                     energy: 0.9,  // Excellent for energy transmission (power lines along highways)                     food: 0.8     // Good for food distribution                 },                 noise: 0.9,      // High noise                 pollution: 0.9,  // High pollution                 walkability: 0.0 // No pedestrian access             }         };          // Transit mode efficiencies for people movement         this.transitModes = {             bus: {                 name: 'Bus',                 capacity: 40,                 speed: 25,                 efficiency: {                     people: 0.8,  // Good for people                     goods: 0.0,   // No goods transport                     energy: 0.0,                     food: 0.0                 },                 noise: 0.4,                 pollution: 0.6,                 accessibility: 0.9 // High accessibility             },             subway: {                 name: 'Subway/Rail',                 capacity: 200,                 speed: 40,                 efficiency: {                     people: 1.0,  // Excellent for people                     goods: 0.0,   // No goods transport                     energy: 0.0,                     food: 0.0                 },                 noise: 0.1,      // Very low noise                 pollution: 0.2,  // Very low pollution                 accessibility: 0.8 // Good accessibility (station-dependent)             },             walking: {                 name: 'Walking/Sidewalks',                 capacity: 50,                 speed: 5,                 efficiency: {                     people: 0.3,  // Limited range but healthy                     goods: 0.0,                     energy: 0.0,                     food: 0.0                 },                 noise: 0.0,      // No noise                 pollution: 0.0,  // No pollution                 accessibility: 1.0, // Perfect accessibility                 health: 1.0      // Health benefits             },             cycling: {                 name: 'Cycling/Bike Lanes',                 capacity: 30,                 speed: 15,                 efficiency: {                     people: 0.6,  // Good for medium distances                     goods: 0.1,   // Very limited goods                     energy: 0.0,                     food: 0.0                 },                 noise: 0.0,                 pollution: 0.0,                 accessibility: 0.8,                 health: 0.9             }         };                  // Transportation modes         this.modes = {             walking: { speed: 3, c
```

### transportation.js
```javascript
rawPollution: totalPollution         };     }          /**      * Calculate maintenance cost for all roads      */     calculateMaintenanceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Maintenance increases with age and de
```

### transportation.js
```javascript
65 * 24 * 60 * 60 * 1000);             const conditionFactor = 2 - road.condition;             totalCost += road.maintenance * ageFactor * conditionFactor;         });                  return totalCost;     }          /**      * Update road conditions (c
```

### transportation.js
```javascript
talCost += road.maintenance * ageFactor * conditionFactor;         });                  return totalCost;     }          /**      * Update road conditions (called periodically)      */     updateRoadConditions(deltaTime) {         this.roads.forEach(road => {             // Roads decay over time and with traffic             const decayRate = 0.001 * deltaTime;             const trafficDecay = road.traffic * 0.0001 * deltaTime;             road.condition = M
```

### transportation.js
```javascript
totalRoads: this.roads.size,             totalRoutes: this.routes.length,             maintenanceCost: this.calculateMaintenanceCost(),             networkEfficiency: this.calculateNetworkEfficiency(),             roadsByType: {                 street: Array.from(this.roads.values()).filter(r => r.type === 'street').length,                 avenue: Array.from(this.roads.values()).filter(r => r.type === 'avenue').length,                 highway: Array.from(this.roads.values()).filter(r => r.type === 'highway').length             }         };     }          /**      * Draw roads on the canvas      */     drawRoads(ctx) {         // This wo
```

### transportation.js
```javascript
local: {                 name: 'Local Street',                 cost: 50,                 maintenance: 1,                 capacity: 100,                 speed: 30,                 // Resource-specific efficiency                 efficiency: {                     people: 0.5,  // Poor for people movement (car-dependent)                     goods: 0.4,   // Poor for goods (small vehicles)                     energy: 0.6,  // Good for local energy distribution (underground/overhead lines)                     food: 0.4     // Poor for food distribution                 },                 // Health and environmental impacts                 noise: 0.3,      // Low noise                 pollution: 0.4,  // Moderate pollution                 walkability: 0.7 // Good for walking             },             arterial: {                 name: 'Arterial Road',                 cost: 100,                 maintenance: 2,                 capacity: 200,                 speed: 40,                 efficiency: {                     people: 0.6,                     goods: 0.6,                     energy: 0.7,  // Good for energy transmission (utility corridors)                     food: 0.6                 },                 noise: 0.6,                 pollution: 0.7,                 walkability: 0.4             },             highway: {                 name: 'Highway',                 cost: 200,                 maintenance: 5,                 capacity: 500,                 speed: 60,                 efficiency: {                     people: 0.4,  // Poor for people (car-only)                     goods: 0.9,   // Excellent for goods transport                     energy: 0.9,  // Excellent for energy transmission (power lines along highways)                     food: 0.8     // Good for food distribution                 },                 noise: 0.9,      // High noise                 pollution: 0.9,  // High pollution                 walkability: 0.0 // No pedestrian access             }         };          // Transit mode efficiencies for people movement         this.transitModes = {             bus: {                 name: 'Bus',                 capacity: 40,                 speed: 25,                 efficiency: {                     people: 0.8,  // Good for people                     goods: 0.0,   // No goods transport                     energy: 0.0,                     food: 0.0                 },                 noise: 0.4,                 pollution: 0.6,                 accessibility: 0.9 // High accessibility             },             subway: {                 name: 'Subway/Rail',                 capacity: 200,                 speed: 40,                 efficiency: {                     people: 1.0,  // Excellent for people                     goods: 0.0,   // No goods transport                     energy: 0.0,                     food: 0.0                 },                 noise: 0.1,      // Very low noise                 pollution: 0.2,  // Very low pollution                 accessibility: 0.8 // Good accessibility (station-dependent)             },             walking: {                 name: 'Walking/Sidewalks',                 capacity: 50,                 speed: 5,                 efficiency: {                     people: 0.3,  // Limited range but healthy                     goods: 0.0,                     energy: 0.0,                     food: 0.0                 },                 noise: 0.0,      // No noise                 pollution: 0.0,  // No pollution                 accessibility: 1.0, // Perfect accessibility                 health: 1.0      // Health benefits             },             cycling: {                 name: 'Cycling/Bike Lanes',                 capacity: 30,                 speed: 15,                 efficiency: {                     people: 0.6,  // Good for medium distances                     goods: 0.1,   // Very limited goods                     energy: 0.0,                     food: 0.0                 },                 noise: 0.0,                 pollution: 0.0,                 accessibility: 0.8,                 health: 0.9             }         };                  // Transportation modes         this.modes = {             walking: { speed: 3, c
```

### transportation.js
```javascript
totalNoise,             rawPollution: totalPollution         };     }          /**      * Calculate maintenance cost for all roads      */     calculateMaintenanceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Maintenance increases with age and de
```

### transportation.js
```javascript
nceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Maintenance increases with age and decreases with condition             const ageFactor = 1 + (Date.now() - road.built) / (365 * 24 * 60 * 60 * 1000);             const conditionFactor = 2 - road.condition;             totalCost += road.maintenance
```

### transportation.js
```javascript
* 60 * 1000);             const conditionFactor = 2 - road.condition;             totalCost += road.maintenance * ageFactor * conditionFactor;         });                  return totalCost;     }          /**      * Update road conditions (called periodically)      */     updateRoadConditions(deltaTime) {         this.roads.forEach(road => {             // Roads decay over time and with traffic             const decayRate = 0.001 * deltaTime;             const trafficDecay = road.traffic * 0.0001 * deltaTime;             road.condition = M
```

### transportation.js
```javascript
{             totalRoads: this.roads.size,             totalRoutes: this.routes.length,             maintenanceCost: this.calculateMaintenanceCost(),             networkEfficiency: this.calculateNetworkEfficiency(),             roadsByType: {                 street: Array.from(this.roads.values()).filter(r => r.type === 'street').length,                 avenue: Array.from(this.roads.values()).filter(r => r.type === 'avenue').length,                 highway: Array.from(this.roads.values()).filter(r => r.type === 'highway').length             }         };     }          /**      * Draw roads on the canvas      */     drawRoads(ctx) {         // This wo
```

### transportation.js
```javascript
rawNoise: totalNoise,             rawPollution: totalPollution         };     }          /**      * Calculate maintenance cost for all roads      */     calculateMaintenanceCost() {         let totalCost = 0;
```

### transportation.js
```javascript
Pollution         };     }          /**      * Calculate maintenance cost for all roads      */     calculateMaintenanceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Mainten
```

### transportation.js
```javascript
Pollution         };     }          /**      * Calculate maintenance cost for all roads      */     calculateMaintenanceCost() {         let totalCost = 0;                  this.roads.forEach(road => {             // Mainten
```

## 🎨 Canvas Interaction Patterns

### ctx, type);
    }
    
    hasTransitStop(row, col, type) {
        // Check if this parcel has a bus stop or subway entrance
        // This checks the roads around the parcel for amenities
        const sides = ['north', 'east', 'south', 'west'];
        
        for (const side of sides) {
            const roadCoords = this.getParcelSideCoordinates( - game.js
```javascript
ting routes list         this.updateSubwayRoutesList();     }          drawTopDownMap(ctx, type) {         return this.renderingSystem.drawTopDownMap(ctx, type);     }          hasTransitStop(row, col, type) {         // Check if this parcel has a bus stop or subway entrance         // This checks the roads around the parcel for amenities         const sides = ['north', 'east', 'south', 'west'];                  for (const side of sides) {             const roadCoords = this.getParcelSideCoordinates(row, col, side);             if (!roadCoords) cont
```

### canvas
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
            console.warn( - transportation.js
```javascript
ighway: Array.from(this.roads.values()).filter(r => r.type === 'highway').length             }         };     }          /**      * Draw roads on the canvas      */     drawRoads(ctx) {         // This would contain road drawing logic         // Currently handled by the mobility layer     }          /**      * Build transport network using mobility layer roads      * @returns {Object} Transport network with nodes, connections, and roads      */     buildTransportNetwork() {         // Build transport network using mobility layer roads         if (!this.game.mobilityLayer) {             // Fallback for when mobility layer is not available             console.warn('Transportation: Mobility layer not available, roa
```

### ctx) {
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
            console.warn( - transportation.js
```javascript
.values()).filter(r => r.type === 'highway').length             }         };     }          /**      * Draw roads on the canvas      */     drawRoads(ctx) {         // This would contain road drawing logic         // Currently handled by the mobility layer     }          /**      * Build transport network using mobility layer roads      * @returns {Object} Transport network with nodes, connections, and roads      */     buildTransportNetwork() {         // Build transport network using mobility layer roads         if (!this.game.mobilityLayer) {             // Fallback for when mobility layer is not available             console.warn('Transportation: Mobility layer not available, roa
```

