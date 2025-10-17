const fs = require('fs');
const path = require('path');

// Proper CSV parser that handles quoted fields with commas
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function convertCSVToJSON() {
    const csvPath = path.join(__dirname, 'buildings_all.csv');
    const jsonPath = path.join(__dirname, 'buildings-data.json');

    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    // Parse header
    const headers = parseCSVLine(lines[0]);

    const buildingsByCategory = {};
    const categoryCounts = {};

    // Parse each building row
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);

        if (values.length < headers.length - 1) continue; // Skip incomplete rows

        const building = {};
        headers.forEach((header, index) => {
            if (header && values[index] !== undefined) {
                building[header] = values[index];
            }
        });

        // Convert to proper format
        const buildingData = {
            id: building.id,
            name: building.name,
            category: building.category,
            description: building.description || '',
            graphicsFile: building.graphicsFile || '',
            isDefault: building.isDefault === 'TRUE',
            civicScore: parseFloat(building.civicScore) || 0,
            economics: {
                buildCost: parseInt(building.buildCost) || 0,
                constructionDays: parseInt(building.constructionDays) || 0,
                maxRevenue: parseInt(building.maxRevenue) || 0,
                maintenanceCost: parseInt(building.maintenanceCost) || 0,
                decayRate: parseFloat(building.decayRate) || 0
            },
            resources: {
                jobsProvided: parseInt(building.jobsProvided) || 0,
                energyProvided: parseInt(building.energyProvided) || 0,
                energyRequired: parseInt(building.energyRequired) || 0,
                educationProvided: parseInt(building.educationProvided) || 0,
                foodProvided: parseInt(building.foodProvided) || 0,
                housingProvided: parseInt(building.housingProvided) || 0,
                healthcareProvided: parseInt(building.healthcareProvided) || 0
            },
            livability: {
                culture: {
                    impact: parseInt(building.culture_impact) || 0,
                    attenuation: parseInt(building.culture_attenuation) || 0
                },
                affordability: {
                    impact: parseInt(building.affordability_impact) || 0,
                    attenuation: parseInt(building.affordability_attenuation) || 0
                },
                resilience: {
                    impact: parseInt(building.resilience_impact) || 0,
                    attenuation: parseInt(building.resilience_attenuation) || 0
                },
                environment: {
                    impact: parseInt(building.environment_impact) || 0,
                    attenuation: parseInt(building.environment_attenuation) || 0
                },
                noise: {
                    impact: parseInt(building.noise_impact) || 0,
                    attenuation: parseInt(building.noise_attenuation) || 0
                },
                safety: {
                    impact: parseInt(building.safety_impact) || 0,
                    attenuation: parseInt(building.safety_attenuation) || 0
                }
            },
            graphics: {
                default: building.graphicsFile || ''
            },
            images: {
                thumbnail: building.graphicsFile || '',
                icon: building.graphicsFile || ''
            }
        };

        // Group by category
        const category = buildingData.category;
        if (!buildingsByCategory[category]) {
            buildingsByCategory[category] = [];
        }
        buildingsByCategory[category].push(buildingData);

        // Track category counts
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }

    // Write JSON file with grouped format
    fs.writeFileSync(jsonPath, JSON.stringify(buildingsByCategory, null, 2), 'utf8');

    // Calculate total buildings
    const totalBuildings = Object.values(buildingsByCategory).reduce((sum, arr) => sum + arr.length, 0);

    console.log(`✅ Successfully created buildings-data.json`);
    console.log(`📊 Total buildings: ${totalBuildings}`);
    console.log(`📁 Categories breakdown:`);
    Object.entries(categoryCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([cat, count]) => {
            console.log(`   ${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${count}`);
        });
}

// Run conversion
convertCSVToJSON();
