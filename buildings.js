// Building Management System for The Commons
// Browser-compatible version with CSV template loader

class BuildingManager {
    constructor() {
        this.STORAGE_KEY = 'theCommons_buildings';
        this.buildings = null;
        this.initialized = false;

        // Population-based JEEFHH requirements by age group
        this.POPULATION_REQUIREMENTS = {
            food: {
                children: 3,   // Food per day
                adults: 8,
                seniors: 6
            },
            jobs: {
                children: 0,   // Children don't work
                adults: 1,     // 1 job per adult
                seniors: 0     // Seniors are retired
            },
            education: {
                children: 1,   // 1 education slot per child
                adults: 0.1,   // Occasional adult education
                seniors: 0     // No education for seniors
            },
            healthcare: {
                children: 0.5, // Children need less healthcare
                adults: 1,     // Regular healthcare
                seniors: 2     // Seniors need more healthcare
            },
            housing: {
                children: 0.5, // Children share bedrooms
                adults: 1,     // One bedroom per adult
                seniors: 1     // One bedroom per senior
            }
        };

        this.initializeAsync();
    }

    async initializeAsync() {
        try {

            // Load JSON data
            const response = await fetch('buildings-data.json');
            this.buildings = await response.json();

            // Preload all building images for smooth rendering
            await this.preloadBuildingImages();

            this.initialized = true;

            // Notify other systems that buildings are ready
            if (window.game && window.game.populateBuildingCategories) {
                window.game.populateBuildingCategories();
            }

        } catch (error) {
            console.warn('⚠️ Failed to load JSON, using fallback buildings:', error);
            this.buildings = this.createFallbackBuildings();
            this.initialized = true;
        }
    }

    /**
     * Preload all building images for smooth rendering
     */
    async preloadBuildingImages() {

        // Initialize shared image cache for rendering system
        if (!window.buildingImageCache) {
            window.buildingImageCache = new Map();
        }

        const imagePromises = [];
        const imagePaths = new Set();

        // Collect all unique image paths from building definitions
        Object.values(this.buildings).forEach(category => {
            if (Array.isArray(category)) {
                category.forEach(building => {
                    // Get image path from graphics data
                    const imagePath = building.graphicsFile || building.images?.built;
                    if (imagePath && !imagePaths.has(imagePath)) {
                        imagePaths.add(imagePath);

                        // Create promise for each image
                        const imagePromise = new Promise((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                window.buildingImageCache.set(imagePath, img);
                                resolve(img);
                            };
                            img.onerror = () => {
                                console.warn(`❌ Failed to preload: ${imagePath}`);
                                resolve(null); // Resolve with null instead of rejecting
                            };
                            img.src = imagePath;
                        });

                        imagePromises.push(imagePromise);
                    }
                });
            }
        });

        // Wait for all images to load (or fail)
        const results = await Promise.all(imagePromises);
        const successCount = results.filter(img => img !== null).length;
        const totalCount = imagePromises.length;

    }

    parseCSV(csvData) {
        const lines = csvData.trim().split('\n');
        const headers = this.parseCSVLine(lines[0]);
        const buildings = [];

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;

            const values = this.parseCSVLine(lines[i]);
            const building = this.buildingFromCSVRow(headers, values);

            if (building) {
                buildings.push(building);
            }
        }

        return buildings;
    }

    parseCSVLine(line) {
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

    buildingFromCSVRow(headers, values) {
        const row = {};

        // Map CSV values to object
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const value = values[i] || '';
            row[header] = value;
        }

        if (!row.id || !row.name) {
            console.warn('Skipping building row - missing id or name:', row);
            return null;
        }

        // Convert CSV row to building format
        return {
            id: row.id,
            name: row.name,
            category: row.category || 'misc',
            description: row.description || '',

            graphics: {
                filename: row.graphic_file || 'default.png',
                path: `assets/buildings/${row.category}/${row.graphic_file}` || 'assets/buildings/default.svg',
                fallbackPath: 'assets/buildings/default.svg'
            },

            images: {
                built: `assets/buildings/${row.category}/${row.graphic_file}` || 'assets/buildings/default.svg'
            },

            isDefault: this.parseBoolean(row.is_default, true),
            canDelete: this.parseBoolean(row.can_delete, true),

            economics: {
                buildCost: this.parseInt(row.build_cost, 0),
                constructionDays: this.parseInt(row.construction_days, 1),
                maxRevenue: this.parseInt(row.max_revenue, 0),
                maintenanceCost: this.parseInt(row.maintenance_cost, 0),
                decayRate: this.parseFloat(row.decay_rate, 0.05)
            },

            // JEEFHH Resources (supply/demand)
            resources: {
                jobsProvided: this.parseInt(row.jobs_provided, 0),
                jobsRequired: this.parseInt(row.jobs_required, 0),
                energyProvided: this.parseInt(row.energy_provided, 0),
                energyRequired: this.parseInt(row.energy_required, 0),
                educationProvided: this.parseInt(row.education_provided, 0),
                educationSubtype: row.education_subtype || null,
                educationRequired: this.parseInt(row.education_required, 0),
                foodProvided: this.parseInt(row.food_provided, 0),
                foodRequired: this.parseInt(row.food_required, 0),
                housingProvided: this.parseInt(row.housing_provided, 0),
                housingRequired: this.parseInt(row.housing_required, 0),
                healthcareProvided: this.parseInt(row.healthcare_provided, 0),
                healthcareSubtype: row.healthcare_subtype || null,
                healthcareRequired: this.parseInt(row.healthcare_required, 0)
            },

            // CARENS Livability Effects (distance-based multipliers)
            livability: {
                safety: {
                    impact: this.parseInt(row.safety_impact, 0),
                    attenuation: this.parseInt(row.safety_attenuation, 2)
                },
                culture: {
                    impact: this.parseInt(row.culture_impact, 0),
                    attenuation: this.parseInt(row.culture_attenuation, 2)
                },
                affordability: {
                    impact: this.parseInt(row.affordability_impact, 0),
                    attenuation: this.parseInt(row.affordability_attenuation, 2)
                },
                resilience: {
                    impact: this.parseInt(row.resilience_impact, 0),
                    attenuation: this.parseInt(row.resilience_attenuation, 2)
                },
                environment: {
                    impact: this.parseInt(row.environment_impact, 0),
                    attenuation: this.parseInt(row.environment_attenuation, 2)
                },
                noise: {
                    impact: this.parseInt(row.noise_impact, 0),
                    attenuation: this.parseInt(row.noise_attenuation, 2)
                }
            },

            // Build prerequisites
            prerequisites: {
                requiredLandValue: this.parseInt(row.required_land_value, 0),
                requiredPopulation: this.parseInt(row.required_population, 0)
            },

            notes: row.notes || ''
        };
    }

    organizeBuildingsByCategory(buildings) {
        const categories = {};

        buildings.forEach(building => {
            if (!categories[building.category]) {
                categories[building.category] = [];
            }
            categories[building.category].push(building);
        });

        return categories;
    }

    createFallbackBuildings() {
        return {
            housing: [
                {
                    id: 'cottage',
                    name: 'Cottage',
                    category: 'housing',
                    resources: {
                        jobsProvided: 0,
                        jobsRequired: 0,
                        energyProvided: 0,
                        energyRequired: 5,
                        educationProvided: 0,
                        educationRequired: 0,
                        foodProvided: 0,
                        foodRequired: 4,
                        housingProvided: 2,
                        housingRequired: 0,
                        healthcareProvided: 0,
                        healthcareRequired: 0
                    },
                    economics: { buildCost: 250, constructionDays: 1 },
                    isDefault: true
                }
            ]
        };
    }

    parseInt(value, defaultValue = 0) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    parseFloat(value, defaultValue = 0.0) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    parseBoolean(value, defaultValue = false) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            return lower === 'true' || lower === 'yes' || lower === '1';
        }
        return defaultValue;
    }

    // Wait for initialization to complete
    async waitForInitialization() {
        while (!this.initialized) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Load custom buildings from localStorage and merge with defaults
    loadCustomBuildings() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const customBuildings = JSON.parse(saved);
                // Merge custom buildings with default data
                Object.keys(customBuildings).forEach(category => {
                    if (!this.buildings[category]) {
                        this.buildings[category] = [];
                    }
                    // Add custom buildings that aren't defaults
                    customBuildings[category].forEach(building => {
                        if (!building.isDefault) {
                            const existing = this.buildings[category].find(b => b.id === building.id);
                            if (!existing) {
                                this.buildings[category].push(building);
                            }
                        }
                    });
                });
            } catch (e) {
                console.error('Failed to load custom buildings:', e);
            }
        }
    }

    // Get all buildings as a flat array
    getAllBuildings() {
        if (!this.buildings) return [];
        return Object.values(this.buildings).flat();
    }

    // Get buildings by category
    getBuildingsByCategory(category) {
        if (!this.buildings) return [];
        return this.buildings[category] || [];
    }

    // Get a specific building by ID
    getBuildingById(buildingId) {
        const allBuildings = this.getAllBuildings();
        return allBuildings.find(b => b.id === buildingId) || null;
    }

    // Get a specific building by name
    getBuildingByName(buildingName) {
        const allBuildings = this.getAllBuildings();
        return allBuildings.find(b => b.name === buildingName) || null;
    }

    // Get building categories
    getCategories() {
        if (!this.buildings) return [];
        return Object.keys(this.buildings);
    }

    // Check if a building exists
    buildingExists(buildingId) {
        return this.getAllBuildings().some(b => b.id === buildingId);
    }

    // Get building cost (for backwards compatibility)
    getBuildingCost(buildingId) {
        const building = this.getBuildingById(buildingId);
        return building ? (building.economics?.buildCost || building.cost) : 0;
    }

    // Get building name
    getBuildingName(buildingId) {
        const building = this.getBuildingById(buildingId);
        return building ? building.name : 'Unknown Building';
    }

    // Get building graphics path with fallback
    getBuildingGraphics(buildingId) {
        const building = this.getBuildingById(buildingId);
        if (!building || !building.graphics) {
            return {
                path: 'assets/buildings/default.svg',
                fallbackPath: 'assets/buildings/default.svg'
            };
        }
        return building.graphics;
    }

    // Save custom buildings to localStorage (only non-default buildings)
    saveBuildings() {
        const customBuildings = {};
        Object.keys(this.buildings).forEach(category => {
            const customInCategory = this.buildings[category].filter(b => !b.isDefault);
            if (customInCategory.length > 0) {
                customBuildings[category] = customInCategory;
            }
        });
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(customBuildings));
    }

    // Get building state for a specific tile (for construction tracking)
    getBuildingState(row, col) {
        // This would typically be tracked in the game state
        // For now, return null to indicate building is complete
        return null;
    }
}

// Create and export the building manager instance
const buildingManager = new BuildingManager();
window.buildingManager = buildingManager;