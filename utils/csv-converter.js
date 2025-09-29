/**
 * CSV to JavaScript Building Data Converter
 * Converts CSV building data to JavaScript object format
 */

class CSVConverter {
    constructor() {
        this.buildingCategories = {};
    }

    /**
     * Convert CSV text to JSON format
     * @param {string} csvText - Raw CSV text content
     * @returns {Object} JSON object with building data
     */
    convertCSVToJSON(csvText) {
        try {
            // Parse CSV into rows
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }

            // Parse header
            const headers = this.parseCSVRow(lines[0]);

            // Parse data rows
            const buildings = [];
            for (let i = 1; i < lines.length; i++) {
                const row = this.parseCSVRow(lines[i]);
                if (row.length === headers.length) {
                    const building = this.createBuildingFromRow(headers, row);
                    if (building) {
                        buildings.push(building);
                    }
                }
            }

            // Group buildings by category
            this.buildingCategories = this.groupBuildingsByCategory(buildings);

            // Return as JSON object
            return this.buildingCategories;

        } catch (error) {
            console.error('CSV conversion error:', error);
            throw new Error(`Failed to convert CSV: ${error.message}`);
        }
    }

    /**
     * Parse a CSV row, handling quoted values
     * @param {string} row - CSV row text
     * @returns {Array} Array of cell values
     */
    parseCSVRow(row) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const char = row[i];

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

    /**
     * Create a building object from CSV row data
     * @param {Array} headers - Column headers
     * @param {Array} row - Row data
     * @returns {Object} Building object
     */
    createBuildingFromRow(headers, row) {
        const building = {
            id: '',
            name: '',
            category: '',
            description: '',
            resources: {
                jobsProvided: 0,
                jobsRequired: 0,
                energyProvided: 0,
                energyRequired: 0,
                educationProvided: 0,
                educationRequired: 0,
                foodProvided: 0,
                foodRequired: 0,
                housingProvided: 0,
                housingRequired: 0,
                healthcareProvided: 0,
                healthcareRequired: 0
            },
            economics: {
                buildCost: 0,
                constructionDays: 1,
                maxRevenue: 0
            },
            livability: {},
            isDefault: true,
            graphicFile: null  // Track graphic file from CSV
        };

        // Map CSV columns to building properties
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim().replace(/_/g, '');
            const value = row[i]?.trim() || '';

            // Basic properties
            if (header === 'id' || header === 'buildingid') {
                building.id = value;
            } else if (header === 'name' || header === 'buildingname') {
                building.name = value;
            } else if (header === 'category') {
                building.category = value.toLowerCase();
            } else if (header === 'description') {
                building.description = value;
            } else if (header === 'graphicfile' || header === 'graphicsfile') {
                building.graphicFile = value;  // Store the graphic file name
            }
            // Economic properties
            else if (header === 'build_cost' || header === 'buildcost') {
                building.economics.buildCost = parseInt(value) || 0;
            } else if (header === 'construction_days' || header === 'constructiondays') {
                building.economics.constructionDays = parseInt(value) || 1;
            } else if (header === 'max_revenue' || header === 'maxrevenue') {
                building.economics.maxRevenue = parseInt(value) || 0;
            }
            // Resource properties
            else if (header.includes('jobs') && header.includes('provided')) {
                building.resources.jobsProvided = parseInt(value) || 0;
            } else if (header.includes('jobs') && header.includes('required')) {
                building.resources.jobsRequired = parseInt(value) || 0;
            } else if (header.includes('energy') && header.includes('provided')) {
                building.resources.energyProvided = parseInt(value) || 0;
            } else if (header.includes('energy') && header.includes('required')) {
                building.resources.energyRequired = parseInt(value) || 0;
            } else if (header.includes('education') && header.includes('provided')) {
                building.resources.educationProvided = parseInt(value) || 0;
            } else if (header.includes('education') && header.includes('required')) {
                building.resources.educationRequired = parseInt(value) || 0;
            } else if (header.includes('food') && header.includes('provided')) {
                building.resources.foodProvided = parseInt(value) || 0;
            } else if (header.includes('food') && header.includes('required')) {
                building.resources.foodRequired = parseInt(value) || 0;
            } else if (header.includes('housing') && header.includes('provided')) {
                building.resources.housingProvided = parseInt(value) || 0;
            } else if (header.includes('housing') && header.includes('required')) {
                building.resources.housingRequired = parseInt(value) || 0;
            } else if (header.includes('healthcare') && header.includes('provided')) {
                building.resources.healthcareProvided = parseInt(value) || 0;
            } else if (header.includes('healthcare') && header.includes('required')) {
                building.resources.healthcareRequired = parseInt(value) || 0;
            }
        }

        // Validate required fields
        if (!building.id || !building.name || !building.category) {
            console.warn('Skipping building with missing required fields:', building);
            return null;
        }

        // Use graphic file from CSV if provided, otherwise auto-generate
        let imagePath;
        if (building.graphicFile) {
            // Use the provided graphic file name
            const filename = building.graphicFile.replace(/\.(png|svg|jpg|jpeg)$/i, '');
            imagePath = `assets/buildings/${building.category}/${filename}.png`;
        } else {
            // Auto-generate based on ID and category
            imagePath = `assets/buildings/${building.category}/${building.id}.png`;
        }

        // Set up all the image-related fields
        building.graphicsFile = imagePath;
        building.graphics = {
            filename: imagePath.split('/').pop(),
            path: imagePath,
            fallbackPath: "assets/buildings/default.svg"
        };
        building.images = {
            built: imagePath
        };

        // Clean up temporary field
        delete building.graphicFile;

        return building;
    }

    /**
     * Group buildings by category
     * @param {Array} buildings - Array of building objects
     * @returns {Object} Buildings grouped by category
     */
    groupBuildingsByCategory(buildings) {
        const categories = {};

        buildings.forEach(building => {
            const category = building.category;
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(building);
        });

        return categories;
    }

    /**
     * Generate JavaScript module content
     * @param {Object} buildingCategories - Buildings grouped by category
     * @returns {string} JavaScript module content
     */
    generateJavaScriptModule(buildingCategories) {
        const js = `/**
 * Generated Building Data Module
 * Auto-generated from CSV upload on ${new Date().toISOString()}
 */

const buildingData = ${JSON.stringify(buildingCategories, null, 2)};

// Export for use in the game
if (typeof module !== 'undefined' && module.exports) {
    module.exports = buildingData;
}

// Controlled exposure in browser
if (typeof window !== 'undefined') {
    window.buildingData = buildingData;
}
`;

        return js;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSVConverter;
}

// Controlled exposure in browser
if (typeof window !== 'undefined') {
    window.CSVConverter = CSVConverter;
}