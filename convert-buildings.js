#!/usr/bin/env node

/**
 * Convert building-template-v2.csv to buildings-data.json
 */

const fs = require('fs');
const path = require('path');

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',');
    const buildings = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const building = {};

        headers.forEach((header, index) => {
            building[header.trim()] = values[index] ? values[index].trim() : '';
        });

        buildings.push(building);
    }

    return buildings;
}

function convertBuilding(csvRow) {
    return {
        id: csvRow.id,
        name: csvRow.name,
        category: csvRow.category,
        description: csvRow.description,
        resources: {
            jobsProvided: parseInt(csvRow.resources_jobsProvided) || 0,
            jobsRequired: parseInt(csvRow.resources_jobsRequired) || 0,
            energyProvided: parseInt(csvRow.resources_energyProvided) || 0,
            energyRequired: parseInt(csvRow.resources_energyRequired) || 0,
            educationProvided: parseInt(csvRow.resources_educationProvided) || 0,
            educationRequired: parseInt(csvRow.resources_educationRequired) || 0,
            foodProvided: parseInt(csvRow.resources_foodProvided) || 0,
            foodRequired: parseInt(csvRow.resources_foodRequired) || 0,
            housingProvided: parseInt(csvRow.resources_housingProvided) || 0,
            housingRequired: parseInt(csvRow.resources_housingRequired) || 0,
            healthcareProvided: parseInt(csvRow.resources_healthcareProvided) || 0,
            healthcareRequired: parseInt(csvRow.resources_healthcareRequired) || 0
        },
        economics: {
            buildCost: parseInt(csvRow.economics_buildCost) || 0,
            constructionDays: parseInt(csvRow.economics_constructionDays) || 1,
            maxRevenue: parseInt(csvRow.economics_maxRevenue) || 0,
            maintenanceCost: parseInt(csvRow.economics_maintenanceCost) || 0,
            decayRatePercent: parseFloat(csvRow.economics_decayRatePercent) || 0
        },
        livability: {
            culture: parseInt(csvRow.livability_culture) || 0,
            culture_range: parseInt(csvRow.livability_culture_range) || 0,
            affordability: parseInt(csvRow.livability_affordability) || 0,
            affordability_range: parseInt(csvRow.livability_affordability_range) || 0,
            resilience: parseInt(csvRow.livability_resilience) || 0,
            resilience_range: parseInt(csvRow.livability_resilience_range) || 0,
            environment: parseInt(csvRow.livability_environment) || 0,
            environment_range: parseInt(csvRow.livability_environment_range) || 0,
            noise: parseInt(csvRow.livability_noise) || 0,
            noise_range: parseInt(csvRow.livability_noise_range) || 0,
            safety: parseInt(csvRow.livability_safety) || 0,
            safety_range: parseInt(csvRow.livability_safety_range) || 0
        },
        isDefault: true,
        graphicsFile: csvRow.graphicsFile,
        graphics: {
            filename: path.basename(csvRow.graphicsFile),
            path: csvRow.graphicsFile,
            fallbackPath: "assets/buildings/default.svg"
        },
        images: {
            built: csvRow.graphicsFile
        }
    };
}

function main() {
    try {
        // Read CSV
        const csvPath = './buildings_all - building-template-v2.csv';
        const csvText = fs.readFileSync(csvPath, 'utf8');

        // Parse CSV
        const csvData = parseCSV(csvText);
        console.log(`Parsed ${csvData.length} buildings from CSV`);

        // Convert to JSON structure
        const buildingsByCategory = {};

        csvData.forEach(csvRow => {
            const building = convertBuilding(csvRow);
            const category = building.category;

            if (!buildingsByCategory[category]) {
                buildingsByCategory[category] = [];
            }

            buildingsByCategory[category].push(building);
        });

        // Write JSON
        const outputPath = './buildings-data.json';
        fs.writeFileSync(outputPath, JSON.stringify(buildingsByCategory, null, 2));

        console.log(`✅ Successfully converted ${csvData.length} buildings to ${outputPath}`);
        console.log(`📂 Categories: ${Object.keys(buildingsByCategory).join(', ')}`);

        // Show sample of converted data
        const firstCategory = Object.keys(buildingsByCategory)[0];
        const firstBuilding = buildingsByCategory[firstCategory][0];
        console.log(`\n📄 Sample building (${firstBuilding.name}):`);
        console.log(`   Cost: $${firstBuilding.economics.buildCost}`);
        console.log(`   Construction: ${firstBuilding.economics.constructionDays} days`);
        console.log(`   Graphics: ${firstBuilding.graphics.path}`);

    } catch (error) {
        console.error('❌ Error converting buildings:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}