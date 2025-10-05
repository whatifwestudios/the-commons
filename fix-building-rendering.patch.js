// Patch script to fix building rendering issues
const fs = require('fs');

const file = './rendering-system-v2.js';
let content = fs.readFileSync(file, 'utf8');

// Find and replace the building ID extraction logic
const oldPattern = `        // Get building graphics from building manager
        const buildingId = parcel.building;
        const building = this.game.buildingManager?.getBuildingById(buildingId);

        if (!building) {
            if (window.DEBUG_MODE) console.log(\`⚠️ No building data found for \${buildingId} at [\${row},\${col}]\`);
            return;
        }

        let imagePath = building.graphicsFile || building.images?.built;`;

const newPattern = `        // Handle both cases: parcel.building as string (legacy) or object (synced from server)
        const buildingId = typeof parcel.building === 'string'
            ? parcel.building
            : (parcel.building.id || parcel.building.type);

        const building = this.game.buildingManager?.getBuildingById(buildingId);

        if (!building) {
            if (window.DEBUG_MODE) console.log(\`⚠️ No building data found for \${buildingId} at [\${row},\${col}]\`);
            return;
        }

        // For synced buildings, graphics may come from server data in parcel
        const parcelBuilding = typeof parcel.building === 'object' ? parcel.building : null;
        let imagePath = parcelBuilding?.graphicsFile || building.graphicsFile || building.images?.built;`;

content = content.replace(oldPattern, newPattern);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ Patched rendering-system-v2.js');
