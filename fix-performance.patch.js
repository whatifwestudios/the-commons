// Patch script to fix building performance for buildings under construction
const fs = require('fs');

const file = './server-economic-engine-v2.js';
let content = fs.readFileSync(file, 'utf8');

// Find and replace the performance multiplier initialization
const oldPattern = `        // Calculate efficiency percentage and financial data for tooltip display
        let efficiency = 0;
        let netIncome = 0;
        let revenue = 0;
        let maintenance = 0;
        let performanceMultiplier = 1.0;`;

const newPattern = `        // Calculate efficiency percentage and financial data for tooltip display
        let efficiency = 0;
        let netIncome = 0;
        let revenue = 0;
        let maintenance = 0;
        let performanceMultiplier = building.underConstruction ? 0.0 : 1.0; // 0 during construction`;

content = content.replace(oldPattern, newPattern);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ Patched server-economic-engine-v2.js - fixed performance multiplier for buildings under construction');
