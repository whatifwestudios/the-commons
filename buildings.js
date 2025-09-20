// Building Management System for The Commons
// This file manages all building data - both default and custom

class BuildingManager {
    constructor() {
        this.STORAGE_KEY = 'theCommons_buildings';
        
        // ALWAYS force load from CSV for now to ensure correct buildings
        this.buildings = {}; // Start with empty buildings
        this.initializeBuildingsFromMasterCSV();
        
        // Old loading logic disabled for now
        // this.buildings = this.loadBuildings();
        // if (this.shouldLoadFromCSV()) {
        //     console.log('Loading buildings from master CSV...');
        //     this.initializeBuildingsFromMasterCSV();
        // }
    }

    // Initialize with default buildings if no saved data exists
    loadBuildings() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load buildings:', e);
            }
        }
        
        // Return default buildings if no saved data
        return this.getDefaultBuildings();
    }

    // Get the default building set (now empty, will be populated from CSV)
    getDefaultBuildings() {
        return {}; // Will be populated from master CSV
    }
    
    // Check if buildings are empty
    isBuildingsEmpty() {
        const keys = Object.keys(this.buildings);
        if (keys.length === 0) return true;
        return keys.every(category => !this.buildings[category] || this.buildings[category].length === 0);
    }
    
    // Check if we should load from CSV (empty buildings OR not the expected CSV buildings)
    shouldLoadFromCSV() {
        if (this.isBuildingsEmpty()) {
            return true;
        }
        
        // Check if we have the expected CSV buildings
        const expectedBuildings = ['cottage', 'farmers_market', 'high_school', 'schoolhouse', 'cornerstore'];
        const allBuildings = this.getAllBuildings();
        const currentBuildingIds = allBuildings.map(b => b.id);
        
        // If we don't have all expected buildings, reload from CSV
        const hasAllExpected = expectedBuildings.every(id => currentBuildingIds.includes(id));
        
        if (!hasAllExpected) {
            console.log('Missing expected CSV buildings. Current:', currentBuildingIds, 'Expected:', expectedBuildings);
            return true;
        }
        
        // If we have extra buildings beyond the expected ones, reload from CSV
        const hasOnlyExpected = currentBuildingIds.every(id => expectedBuildings.includes(id));
        if (!hasOnlyExpected) {
            console.log('Found unexpected buildings. Reloading from CSV.');
            return true;
        }
        
        return false;
    }

    // Initialize all buildings from master CSV automatically
    async initializeBuildingsFromMasterCSV() {
        try {
            const buildingData = await this.loadBuildingsFromMasterCSV();
            if (buildingData) {
                const totalBuildings = Object.values(buildingData).reduce((sum, cat) => sum + cat.length, 0);
                
                // Refresh the game UI after loading
                if (window.game && window.game.populateBuildingCategories) {
                    window.game.populateBuildingCategories();
                }
                
                return true;
            }
        } catch (error) {
            console.error('Failed to initialize buildings from master CSV:', error);
        }
        return false;
    }

    // Backup method with original defaults (for reference)
    getOriginalDefaultBuildings() {
        return {
            education: [
                { 
                    id: 'elementary_school', 
                    name: 'Elementary School', 
                    cost: 50000,
                    category: 'education',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 50000, constructionDays: 14, maxRevenue: 0, maintenanceCost: 7 },
                    population: { jobsCreated: 25, bedroomsAdded: 0, populationRequired: 100 },
                    resources: { energyDemand: 500, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        EDUCATION: 8, JOBS: 3, CULTURE: 2, AFFORDABILITY: -1,
                        ENERGY: -2, FOOD: 0, HOUSING: 0, MOBILITY: 0,
                        HEALTH: 1, SAFETY: 1, ENVIRONMENT: 0, NOISE: -1, RESILIENCE: 2
                    }
                },
                { 
                    id: 'high_school', 
                    name: 'High School', 
                    cost: 80000,
                    category: 'education',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 80000, constructionDays: 21, maxRevenue: 0, maintenanceCost: 11 },
                    population: { jobsCreated: 50, bedroomsAdded: 0, populationRequired: 500 },
                    resources: { energyDemand: 800, foodProduction: 0 },
                    prerequisites: ['elementary_school'],
                    domainImpacts: {
                        EDUCATION: 10, JOBS: 5, CULTURE: 3, AFFORDABILITY: -2,
                        ENERGY: -3, FOOD: 0, HOUSING: 0, MOBILITY: 0,
                        HEALTH: 1, SAFETY: 2, ENVIRONMENT: 0, NOISE: -2, RESILIENCE: 3
                    }
                },
                { 
                    id: 'university', 
                    name: 'University', 
                    cost: 200000,
                    category: 'education',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 200000, constructionDays: 60, maxRevenue: 137, maintenanceCost: 27 },
                    population: { jobsCreated: 200, bedroomsAdded: 0, populationRequired: 2000 },
                    resources: { energyDemand: 2000, foodProduction: 0 },
                    prerequisites: ['high_school'],
                    domainImpacts: {
                        EDUCATION: 15, JOBS: 10, CULTURE: 8, AFFORDABILITY: -3,
                        ENERGY: -5, FOOD: 0, HOUSING: 0, MOBILITY: 2,
                        HEALTH: 2, SAFETY: 1, ENVIRONMENT: 1, NOISE: -3, RESILIENCE: 5
                    }
                },
                { 
                    id: 'library', 
                    name: 'Public Library', 
                    cost: 25000,
                    category: 'education',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 25000, constructionDays: 10, maxRevenue: 0, maintenanceCost: 3 },
                    population: { jobsCreated: 8, bedroomsAdded: 0, populationRequired: 50 },
                    resources: { energyDemand: 200, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        EDUCATION: 5, JOBS: 1, CULTURE: 6, AFFORDABILITY: 0,
                        ENERGY: -1, FOOD: 0, HOUSING: 0, MOBILITY: 0,
                        HEALTH: 0, SAFETY: 1, ENVIRONMENT: 0, NOISE: 0, RESILIENCE: 2
                    }
                }
            ],
            healthcare: [
                { 
                    id: 'clinic', 
                    name: 'Health Clinic', 
                    cost: 30000,
                    category: 'healthcare',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 30000, constructionDays: 14, maxRevenue: 14, maintenanceCost: 5 },
                    population: { jobsCreated: 15, bedroomsAdded: 0, populationRequired: 100 },
                    resources: { energyDemand: 400, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 8, JOBS: 2, SAFETY: 2, AFFORDABILITY: 1,
                        ENERGY: -2, FOOD: 0, HOUSING: 0, MOBILITY: 0,
                        EDUCATION: 0, CULTURE: 0, ENVIRONMENT: 0, NOISE: -1, RESILIENCE: 3
                    }
                },
                { 
                    id: 'hospital', 
                    name: 'Hospital', 
                    cost: 150000,
                    category: 'healthcare',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 150000, constructionDays: 45, maxRevenue: 55, maintenanceCost: 22 },
                    population: { jobsCreated: 100, bedroomsAdded: 0, populationRequired: 1000 },
                    resources: { energyDemand: 1500, foodProduction: 0 },
                    prerequisites: ['clinic'],
                    domainImpacts: {
                        HEALTH: 15, JOBS: 8, SAFETY: 3, AFFORDABILITY: -2,
                        ENERGY: -5, FOOD: 0, HOUSING: 0, MOBILITY: 1,
                        EDUCATION: 2, CULTURE: 0, ENVIRONMENT: -1, NOISE: -3, RESILIENCE: 5
                    }
                },
                { 
                    id: 'pharmacy', 
                    name: 'Pharmacy', 
                    cost: 15000,
                    category: 'healthcare',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 15000, constructionDays: 7, maxRevenue: 22, maintenanceCost: 2 },
                    population: { jobsCreated: 4, bedroomsAdded: 0, populationRequired: 50 },
                    resources: { energyDemand: 100, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 4, JOBS: 1, SAFETY: 0, AFFORDABILITY: 2,
                        ENERGY: -1, FOOD: 0, HOUSING: 0, MOBILITY: 0,
                        EDUCATION: 0, CULTURE: 0, ENVIRONMENT: 0, NOISE: 0, RESILIENCE: 1
                    }
                }
            ],
            infrastructure: [
                { 
                    id: 'power_plant', 
                    name: 'Power Plant', 
                    cost: 100000,
                    category: 'infrastructure',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 100000, constructionDays: 30, maxRevenue: 82, maintenanceCost: 14 },
                    population: { jobsCreated: 30, bedroomsAdded: 0, populationRequired: 0 },
                    resources: { energyDemand: -5000, foodProduction: 0 }, // Negative = produces energy
                    prerequisites: [],
                    domainImpacts: {
                        ENERGY: 15, JOBS: 4, RESILIENCE: 8, AFFORDABILITY: 3,
                        ENVIRONMENT: -8, NOISE: -5, HEALTH: -3, SAFETY: -2,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0, CULTURE: 0
                    }
                },
                { 
                    id: 'water_treatment', 
                    name: 'Water Treatment', 
                    cost: 75000,
                    category: 'infrastructure',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 75000, constructionDays: 21, maxRevenue: 0, maintenanceCost: 8 },
                    population: { jobsCreated: 20, bedroomsAdded: 0, populationRequired: 0 },
                    resources: { energyDemand: 800, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 10, RESILIENCE: 10, ENVIRONMENT: 5, SAFETY: 3,
                        ENERGY: -3, NOISE: -2, AFFORDABILITY: -2, JOBS: 3,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0, CULTURE: 0
                    }
                },
                { 
                    id: 'waste_management', 
                    name: 'Waste Management', 
                    cost: 40000,
                    category: 'infrastructure',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 40000, constructionDays: 14, maxRevenue: 14, maintenanceCost: 5 },
                    population: { jobsCreated: 15, bedroomsAdded: 0, populationRequired: 0 },
                    resources: { energyDemand: 500, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 6, ENVIRONMENT: 8, RESILIENCE: 4, SAFETY: 2,
                        NOISE: -3, ENERGY: -2, AFFORDABILITY: -1, JOBS: 2,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0, CULTURE: 0
                    }
                }
            ],
            housing: [
                { 
                    id: 'apartment_building', 
                    name: 'Apartment Building', 
                    cost: 60000,
                    category: 'housing',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 60000, constructionDays: 30, maxRevenue: 41, maintenanceCost: 5 },
                    population: { jobsCreated: 2, bedroomsAdded: 24, populationRequired: 0 },
                    resources: { energyDemand: 1200, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HOUSING: 10, AFFORDABILITY: 5, MOBILITY: 1, JOBS: 1,
                        ENERGY: -4, NOISE: -2, ENVIRONMENT: -2, SAFETY: -1,
                        FOOD: 0, HEALTH: 0, EDUCATION: 0, CULTURE: 0, RESILIENCE: 2
                    }
                },
                { 
                    id: 'single_family', 
                    name: 'Single Family Home', 
                    cost: 25000,
                    category: 'housing',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 25000, constructionDays: 14, maxRevenue: 14, maintenanceCost: 1 },
                    population: { jobsCreated: 0, bedroomsAdded: 3, populationRequired: 0 },
                    resources: { energyDemand: 300, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HOUSING: 3, AFFORDABILITY: 2, ENVIRONMENT: 1, SAFETY: 2,
                        ENERGY: -2, NOISE: 0, MOBILITY: -1, JOBS: 0,
                        FOOD: 0, HEALTH: 1, EDUCATION: 0, CULTURE: 0, RESILIENCE: 1
                    }
                },
                { 
                    id: 'townhouse', 
                    name: 'Townhouse', 
                    cost: 35000,
                    category: 'housing',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 35000, constructionDays: 18, maxRevenue: 19, maintenanceCost: 2 },
                    population: { jobsCreated: 0, bedroomsAdded: 6, populationRequired: 0 },
                    resources: { energyDemand: 500, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HOUSING: 5, AFFORDABILITY: 4, ENVIRONMENT: 0, SAFETY: 1,
                        ENERGY: -2, NOISE: -1, MOBILITY: 0, JOBS: 0,
                        FOOD: 0, HEALTH: 0, EDUCATION: 0, CULTURE: 0, RESILIENCE: 1
                    }
                }
            ],
            culture: [
                { 
                    id: 'art_gallery', 
                    name: 'Art Gallery', 
                    cost: 40000,
                    category: 'culture',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 40000, constructionDays: 14, maxRevenue: 22, maintenanceCost: 4 },
                    population: { jobsCreated: 8, bedroomsAdded: 0, populationRequired: 200 },
                    resources: { energyDemand: 300, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        CULTURE: 10, EDUCATION: 3, JOBS: 2, AFFORDABILITY: 0,
                        ENERGY: -1, NOISE: 0, ENVIRONMENT: 0, SAFETY: 1,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, HEALTH: 1, RESILIENCE: 2
                    }
                },
                { 
                    id: 'theater', 
                    name: 'Theater', 
                    cost: 80000,
                    category: 'culture',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 80000, constructionDays: 30, maxRevenue: 41, maintenanceCost: 8 },
                    population: { jobsCreated: 20, bedroomsAdded: 0, populationRequired: 500 },
                    resources: { energyDemand: 600, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        CULTURE: 12, EDUCATION: 2, JOBS: 3, AFFORDABILITY: -1,
                        ENERGY: -2, NOISE: -3, ENVIRONMENT: 0, SAFETY: 0,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, HEALTH: 1, RESILIENCE: 3
                    }
                },
                { 
                    id: 'museum', 
                    name: 'Museum', 
                    cost: 60000,
                    category: 'culture',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 60000, constructionDays: 21, maxRevenue: 27, maintenanceCost: 7 },
                    population: { jobsCreated: 15, bedroomsAdded: 0, populationRequired: 300 },
                    resources: { energyDemand: 400, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        CULTURE: 11, EDUCATION: 5, JOBS: 2, AFFORDABILITY: 0,
                        ENERGY: -2, NOISE: 0, ENVIRONMENT: 0, SAFETY: 1,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, HEALTH: 0, RESILIENCE: 3
                    }
                }
            ],
            recreation: [
                { 
                    id: 'park', 
                    name: 'Public Park', 
                    cost: 20000,
                    category: 'recreation',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 20000, constructionDays: 10, maxRevenue: 0, maintenanceCost: 1 },
                    population: { jobsCreated: 3, bedroomsAdded: 0, populationRequired: 0 },
                    resources: { energyDemand: 50, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        ENVIRONMENT: 8, HEALTH: 5, CULTURE: 3, SAFETY: 2,
                        NOISE: 2, AFFORDABILITY: 0, RESILIENCE: 3, JOBS: 1,
                        ENERGY: 0, FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0
                    }
                },
                { 
                    id: 'gym', 
                    name: 'Fitness Center', 
                    cost: 30000,
                    category: 'recreation',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 30000, constructionDays: 14, maxRevenue: 27, maintenanceCost: 4 },
                    population: { jobsCreated: 10, bedroomsAdded: 0, populationRequired: 200 },
                    resources: { energyDemand: 400, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 8, CULTURE: 2, JOBS: 2, AFFORDABILITY: -1,
                        ENERGY: -2, NOISE: -1, ENVIRONMENT: 0, SAFETY: 1,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0, RESILIENCE: 2
                    }
                },
                { 
                    id: 'sports_complex', 
                    name: 'Sports Complex', 
                    cost: 100000,
                    category: 'recreation',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 100000, constructionDays: 30, maxRevenue: 55, maintenanceCost: 11 },
                    population: { jobsCreated: 30, bedroomsAdded: 0, populationRequired: 1000 },
                    resources: { energyDemand: 1000, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        HEALTH: 10, CULTURE: 5, JOBS: 5, AFFORDABILITY: -2,
                        ENERGY: -3, NOISE: -4, ENVIRONMENT: -1, SAFETY: 2,
                        FOOD: 0, HOUSING: 0, MOBILITY: 1, EDUCATION: 1, RESILIENCE: 4
                    }
                }
            ],
            commercial: [
                { 
                    id: 'grocery_store', 
                    name: 'Grocery Store', 
                    cost: 40000,
                    category: 'commercial',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 40000, constructionDays: 14, maxRevenue: 68, maintenanceCost: 5 },
                    population: { jobsCreated: 20, bedroomsAdded: 0, populationRequired: 200 },
                    resources: { energyDemand: 600, foodProduction: 100 },
                    prerequisites: [],
                    domainImpacts: {
                        FOOD: 10, JOBS: 3, AFFORDABILITY: 3, MOBILITY: 1,
                        ENERGY: -2, NOISE: -1, ENVIRONMENT: -1, SAFETY: 0,
                        HOUSING: 0, HEALTH: 2, EDUCATION: 0, CULTURE: 0, RESILIENCE: 3
                    }
                },
                { 
                    id: 'shopping_mall', 
                    name: 'Shopping Mall', 
                    cost: 120000,
                    category: 'commercial',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 120000, constructionDays: 45, maxRevenue: 137, maintenanceCost: 16 },
                    population: { jobsCreated: 100, bedroomsAdded: 0, populationRequired: 1000 },
                    resources: { energyDemand: 2000, foodProduction: 50 },
                    prerequisites: [],
                    domainImpacts: {
                        JOBS: 10, CULTURE: 3, AFFORDABILITY: 2, MOBILITY: -2,
                        ENERGY: -5, NOISE: -4, ENVIRONMENT: -3, SAFETY: -1,
                        FOOD: 5, HOUSING: 0, HEALTH: 0, EDUCATION: 0, RESILIENCE: 2
                    }
                },
                { 
                    id: 'restaurant', 
                    name: 'Restaurant', 
                    cost: 25000,
                    category: 'commercial',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 25000, constructionDays: 10, maxRevenue: 41, maintenanceCost: 4 },
                    population: { jobsCreated: 12, bedroomsAdded: 0, populationRequired: 100 },
                    resources: { energyDemand: 300, foodProduction: 30 },
                    prerequisites: [],
                    domainImpacts: {
                        FOOD: 5, CULTURE: 4, JOBS: 2, AFFORDABILITY: 1,
                        ENERGY: -1, NOISE: -2, ENVIRONMENT: -1, SAFETY: 0,
                        HOUSING: 0, HEALTH: 0, EDUCATION: 0, MOBILITY: 0, RESILIENCE: 1
                    }
                }
            ],
            civic: [
                { 
                    id: 'city_hall', 
                    name: 'City Hall', 
                    cost: 80000,
                    category: 'civic',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 80000, constructionDays: 30, maxRevenue: 0, maintenanceCost: 8 },
                    population: { jobsCreated: 50, bedroomsAdded: 0, populationRequired: 0 },
                    resources: { energyDemand: 800, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        RESILIENCE: 10, AFFORDABILITY: 5, SAFETY: 3, EDUCATION: 2,
                        ENERGY: -3, NOISE: -1, JOBS: 5, CULTURE: 2,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, HEALTH: 0, ENVIRONMENT: 0
                    }
                },
                { 
                    id: 'police_station', 
                    name: 'Police Station', 
                    cost: 50000,
                    category: 'civic',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 50000, constructionDays: 21, maxRevenue: 0, maintenanceCost: 7 },
                    population: { jobsCreated: 30, bedroomsAdded: 0, populationRequired: 200 },
                    resources: { energyDemand: 500, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        SAFETY: 12, RESILIENCE: 5, JOBS: 3, AFFORDABILITY: -2,
                        ENERGY: -2, NOISE: -2, CULTURE: -1, ENVIRONMENT: 0,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, HEALTH: 1, EDUCATION: 0
                    }
                },
                { 
                    id: 'fire_station', 
                    name: 'Fire Station', 
                    cost: 45000,
                    category: 'civic',
                    isDefault: true,
                    canDelete: true,
                    economics: { buildCost: 45000, constructionDays: 18, maxRevenue: 0, maintenanceCost: 5 },
                    population: { jobsCreated: 25, bedroomsAdded: 0, populationRequired: 150 },
                    resources: { energyDemand: 400, foodProduction: 0 },
                    prerequisites: [],
                    domainImpacts: {
                        SAFETY: 10, RESILIENCE: 8, HEALTH: 3, JOBS: 3,
                        ENERGY: -2, NOISE: -3, AFFORDABILITY: -1, ENVIRONMENT: 0,
                        FOOD: 0, HOUSING: 0, MOBILITY: 0, EDUCATION: 0, CULTURE: 0
                    }
                }
            ]
        };
    }

    // Save buildings to localStorage
    saveBuildings() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.buildings));
    }

    // Get all buildings as a flat array
    getAllBuildings() {
        const allBuildings = [];
        Object.values(this.buildings).forEach(categoryBuildings => {
            allBuildings.push(...categoryBuildings);
        });
        return allBuildings;
    }

    // Get buildings by category
    getBuildingsByCategory(category) {
        return this.buildings[category] || [];
    }

    // Get a specific building by ID
    getBuildingById(buildingId) {
        return this.getAllBuildings().find(b => b.id === buildingId);
    }

    // Add or update a building
    saveBuilding(buildingData) {
        const category = buildingData.category;
        
        if (!this.buildings[category]) {
            this.buildings[category] = [];
        }

        // Check if building already exists
        const existingIndex = this.buildings[category].findIndex(b => b.id === buildingData.id);
        
        if (existingIndex !== -1) {
            // Update existing building
            this.buildings[category][existingIndex] = {
                ...this.buildings[category][existingIndex],
                ...buildingData,
                isDefault: false, // Edited buildings become custom
                modifiedAt: Date.now()
            };
        } else {
            // Add new building
            this.buildings[category].push({
                ...buildingData,
                isDefault: false,
                createdAt: Date.now()
            });
        }
        
        this.saveBuildings();
        return buildingData;
    }

    // Delete a building
    deleteBuilding(buildingId) {
        for (const category in this.buildings) {
            const index = this.buildings[category].findIndex(b => b.id === buildingId);
            if (index !== -1) {
                const deleted = this.buildings[category].splice(index, 1)[0];
                this.saveBuildings();
                return deleted;
            }
        }
        return null;
    }

    // Reset to default buildings
    resetToDefaults() {
        if (confirm('This will delete all custom buildings and reset to defaults. Are you sure?')) {
            this.buildings = this.getDefaultBuildings();
            this.saveBuildings();
            return true;
        }
        return false;
    }

    // Export buildings to JSON
    exportBuildings() {
        return JSON.stringify(this.buildings, null, 2);
    }

    // Import buildings from JSON
    importBuildings(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.buildings = imported;
            this.saveBuildings();
            return true;
        } catch (e) {
            console.error('Failed to import buildings:', e);
            return false;
        }
    }

    // Get building categories
    getCategories() {
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
    
    // Load building image with fallback support and optimization
    async loadBuildingImage(buildingId, targetSize = 96) {
        const graphics = this.getBuildingGraphics(buildingId);
        
        return new Promise((resolve) => {
            const img = new Image();
            
            img.onload = () => {
                // If image is too large, resize it
                if (img.naturalWidth > targetSize * 2 || img.naturalHeight > targetSize * 2) {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');
                    
                    // Calculate scaling to fit within target size
                    const scale = Math.min(targetSize / img.naturalWidth, targetSize / img.naturalHeight);
                    const scaledWidth = img.naturalWidth * scale;
                    const scaledHeight = img.naturalHeight * scale;
                    
                    // Center the image
                    const x = (targetSize - scaledWidth) / 2;
                    const y = (targetSize - scaledHeight) / 2;
                    
                    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                    
                    resolve({ 
                        img: canvas, 
                        success: true, 
                        path: graphics.path,
                        resized: true,
                        originalSize: `${img.naturalWidth}x${img.naturalHeight}`
                    });
                } else {
                    resolve({ img, success: true, path: graphics.path, resized: false });
                }
            };
            
            img.onerror = () => {
                // Try fallback
                const fallbackImg = new Image();
                fallbackImg.onload = () => resolve({ 
                    img: fallbackImg, 
                    success: false, 
                    path: graphics.fallbackPath,
                    resized: false
                });
                fallbackImg.onerror = () => {
                    // Create a simple colored rectangle as final fallback
                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');
                    
                    // Simple building-like shape
                    ctx.fillStyle = '#666';
                    ctx.fillRect(16, 24, 32, 24);
                    ctx.fillStyle = '#888';
                    ctx.fillRect(16, 16, 32, 8);
                    ctx.fillStyle = '#444';
                    ctx.fillRect(28, 36, 8, 12);
                    
                    resolve({ 
                        img: canvas, 
                        success: false, 
                        path: 'generated',
                        resized: false
                    });
                };
                fallbackImg.src = graphics.fallbackPath;
            };
            
            img.src = graphics.path;
        });
    }
    
    // Check if an image file is too large (over 500KB)
    async checkImageSize(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const size = parseInt(response.headers.get('content-length') || '0');
            return {
                size: size,
                isLarge: size > 500 * 1024, // 500KB threshold
                sizeText: size > 1024 * 1024 ? `${(size/1024/1024).toFixed(1)}MB` : `${(size/1024).toFixed(0)}KB`
            };
        } catch (e) {
            return { size: 0, isLarge: false, sizeText: 'unknown' };
        }
    }

    // Get building category by ID
    getBuildingCategory(buildingId) {
        for (const [category, buildings] of Object.entries(this.buildings)) {
            if (buildings.some(b => b.id === buildingId)) {
                return category;
            }
        }
        return null;
    }

    // Parse master CSV data and convert to building format
    async loadBuildingsFromMasterCSV() {
        try {
            const response = await fetch('./buildings_all - core_buildings_master.csv');
            const csvText = await response.text();
            const buildingData = this.parseMasterCSV(csvText);
            
            // Replace all buildings with CSV data
            this.buildings = buildingData;
            this.saveBuildings();
            
            const totalBuildings = Object.values(buildingData).reduce((sum, cat) => sum + cat.length, 0);
            return buildingData;
        } catch (error) {
            console.error('Failed to load master CSV:', error);
            return null;
        }
    }
    
    // Legacy method for backwards compatibility
    async loadHousingFromCSV() {
        const allBuildings = await this.loadBuildingsFromMasterCSV();
        return allBuildings ? allBuildings.housing : null;
    }

    parseMasterCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const buildingsByCategory = {};
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            
            headers.forEach((header, index) => {
                const value = values[index]?.trim() || '';
                row[header] = value;
            });
            
            // Skip empty rows
            if (!row.Name || !row.Category) continue;
            
            const category = row.Category.toLowerCase();
            if (!buildingsByCategory[category]) {
                buildingsByCategory[category] = [];
            }
            
            const building = this.convertCSVRowToBuilding(row);
            buildingsByCategory[category].push(building);
        }
        
        return buildingsByCategory;
    }
    
    // Legacy parsing method for old housing.csv format
    parseHousingCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const buildings = [];
        const amenities = new Map(); // Store amenities by parent building
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            
            headers.forEach((header, index) => {
                const value = values[index]?.trim() || '';
                row[header] = value;
            });
            
            if (row.Type === 'Building') {
                const building = this.convertCSVRowToBuilding(row);
                buildings.push(building);
            } else if (row.Type === 'Amenity') {
                // Store amenities to be added to their parent buildings later
                const parentBuilding = row.ParentBuilding;
                if (!amenities.has(parentBuilding)) {
                    amenities.set(parentBuilding, []);
                }
                amenities.get(parentBuilding).push(this.convertCSVRowToAmenity(row));
            }
        }
        
        // Add amenities to their parent buildings
        buildings.forEach(building => {
            const buildingAmenities = amenities.get(building.name);
            if (buildingAmenities) {
                building.amenities = buildingAmenities;
            }
        });
        
        return buildings;
    }
    
    convertCSVRowToBuilding(row) {
        // Generate ID from name
        const id = row.Name.toLowerCase().replace(/\s+/g, '_');
        
        // Parse prerequisites
        const prerequisites = row.PrereqBuildings ? 
            row.PrereqBuildings.split(',').map(p => p.trim().toLowerCase().replace(/\s+/g, '_')).filter(p => p) : 
            [];
        
        // Get graphics file path - prefer SVG for better scaling
        const category = row.Category.toLowerCase();
        let graphicsFile = row.GraphicsFile;
        
        
        if (!graphicsFile) {
            // Default to PNG first (since most assets are PNG), then SVG fallback  
            graphicsFile = `${id}.png`;
        }
        const graphicsPath = `assets/buildings/${category}/${graphicsFile}`;
        
        // Debug logging for graphics path
        if (Math.random() < 0.2) { // Log 20% of buildings
        }
        
        return {
            id: id,
            name: row.Name,
            category: category,
            // Direct property for rendering system
            graphicsFile: graphicsPath,
            graphics: {
                filename: graphicsFile,
                path: graphicsPath,
                fallbackPath: `assets/buildings/default.svg` // Fallback for missing graphics
            },
            // Also add images property for compatibility with rendering system
            images: {
                built: graphicsPath
            },
            isDefault: true,
            canDelete: true,
            economics: {
                buildCost: parseInt(row.CostToBuild) || 0,
                constructionDays: parseInt(row.ConstructionDays) || 0,
                maxRevenue: parseInt(row.MaxRevenuePerDay) || 0,
                maintenanceCost: parseInt(row.MaintenancePerDay) || 0,
                decayRate: parseFloat(row.DecayRatePercent) || 0
            },
            // Add construction object for backwards compatibility
            construction: {
                days: parseInt(row.ConstructionDays) || 0
            },
            population: {
                jobsCreated: parseInt(row.JobsCreated) || 0,
                bedroomsAdded: parseInt(row.BedroomsAdded) || 0,
                populationRequired: parseInt(row.PopulationReq) || 0
            },
            resources: {
                energyDemand: parseInt(row.EnergyDemandPerDay) || 0,
                foodProduction: parseInt(row.FoodProductionPerDay) || 0
            },
            prerequisites: prerequisites,
            requiredLandValue: parseInt(row.PrereqLandValue) || 0,
            domainImpacts: {
                HEALTH: parseInt(row.HealthImpact) || 0,
                CULTURE: parseInt(row.CultureImpact) || 0,
                AFFORDABILITY: parseInt(row.AffordabilityImpact) || 0,
                RESILIENCE: parseInt(row.ResilienceImpact) || 0,
                MOBILITY: parseInt(row.MobilityImpact) || 0,
                EDUCATION: parseInt(row.EducationImpact) || 0,
                SAFETY: parseInt(row.SafetyImpact) || 0,
                ENVIRONMENT: parseInt(row.EnvironmentImpact) || 0,
                NOISE: parseInt(row.NoiseImpact) || 0,
                ENERGY: -Math.abs(parseInt(row.EnergyDemandPerDay) || 0) / 100,
                FOOD: parseInt(row.FoodProductionPerDay) || 0,
                HOUSING: parseInt(row.BedroomsAdded) || 0,
                JOBS: parseInt(row.JobsCreated) || 0
            }
        };
    }
    
    convertCSVRowToBuildingLegacy(row) {
        return {
            id: row.Name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: row.Name,
            cost: parseInt(row.Cost) || 0,
            category: 'housing',
            tier: row.Tier || 'Basic',
            demographic: row.PrimaryDemographic || 'All',
            isDefault: true,
            canDelete: true,
            economics: {
                buildCost: parseInt(row.Cost) || 0,
                constructionDays: parseInt(row.ConstructionDays) || 1,
                maxRevenue: parseInt(row.MaxRevenuePerDay) || 0,
                maintenanceCost: parseInt(row.MinMaintenancePerDay) || 0,
                decayRate: parseFloat(row.DecayRatePercent) || 0
            },
            population: {
                jobsCreated: parseInt(row.JobsCreated) || 0,
                bedroomsAdded: parseInt(row.BedroomsAdded) || 0,
                populationRequired: parseInt(row.PrereqPopulation) || 0
            },
            resources: {
                energyDemand: parseInt(row.EnergyDemandPerDay) || 0,
                foodProduction: parseFloat(row.FoodProductionPerDay) || 0
            },
            prerequisites: row.PrereqBuildings ? row.PrereqBuildings.split(';').map(p => p.trim()).filter(p => p) : [],
            landValueMin: parseInt(row.PrereqLandValueMin) || 0,
            domainImpacts: {
                HEALTH: parseInt(row.HealthImpact) || 0,
                CULTURE: parseInt(row.CultureImpact) || 0,
                AFFORDABILITY: parseInt(row.AffordabilityImpact) || 0,
                RESILIENCE: parseInt(row.ResilienceImpact) || 0,
                MOBILITY: parseInt(row.MobilityImpact) || 0,
                EDUCATION: parseInt(row.EducationImpact) || 0,
                SAFETY: parseInt(row.SafetyImpact) || 0,
                ENVIRONMENT: parseInt(row.EnvironmentImpact) || 0,
                NOISE: parseInt(row.NoiseImpact) || 0,
                ENERGY: -Math.abs(parseInt(row.EnergyDemandPerDay) || 0) / 100,
                FOOD: parseFloat(row.FoodProductionPerDay) || 0,
                HOUSING: parseInt(row.BedroomsAdded) || 0,
                JOBS: parseInt(row.JobsCreated) || 0
            },
            amenities: []
        };
    }
    
    convertCSVRowToAmenity(row) {
        return {
            id: row.Name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: row.Name,
            cost: parseInt(row.Cost) || 0,
            economics: {
                buildCost: parseInt(row.Cost) || 0,
                constructionDays: parseInt(row.ConstructionDays) || 1,
                maxRevenue: parseInt(row.MaxRevenuePerDay) || 0,
                maintenanceCost: parseInt(row.MinMaintenancePerDay) || 0,
                decayRate: parseFloat(row.DecayRatePercent) || 0
            },
            population: {
                jobsCreated: parseInt(row.JobsCreated) || 0,
                bedroomsAdded: parseInt(row.BedroomsAdded) || 0
            },
            resources: {
                energyDemand: parseInt(row.EnergyDemandPerDay) || 0,
                foodProduction: parseFloat(row.FoodProductionPerDay) || 0
            },
            prerequisites: row.PrereqBuildings ? row.PrereqBuildings.split(';').map(p => p.trim()).filter(p => p) : [],
            domainImpacts: {
                HEALTH: parseInt(row.HealthImpact) || 0,
                CULTURE: parseInt(row.CultureImpact) || 0,
                AFFORDABILITY: parseInt(row.AffordabilityImpact) || 0,
                RESILIENCE: parseInt(row.ResilienceImpact) || 0,
                MOBILITY: parseInt(row.MobilityImpact) || 0,
                EDUCATION: parseInt(row.EducationImpact) || 0,
                SAFETY: parseInt(row.SafetyImpact) || 0,
                ENVIRONMENT: parseInt(row.EnvironmentImpact) || 0,
                NOISE: parseInt(row.NoiseImpact) || 0,
                ENERGY: -Math.abs(parseInt(row.EnergyDemandPerDay) || 0) / 100,
                FOOD: parseFloat(row.FoodProductionPerDay) || 0,
                HOUSING: parseInt(row.BedroomsAdded) || 0,
                JOBS: parseInt(row.JobsCreated) || 0
            }
        };
    }

    // Clear all existing buildings and reset to defaults
    clearAllBuildings() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.buildings = this.getDefaultBuildings();
        console.log('All buildings cleared, reset to defaults');
    }
    
    // Clear only housing buildings
    clearHousingBuildings() {
        this.buildings.housing = [];
        this.saveBuildings();
        console.log('Housing buildings cleared');
    }
}

// Create and export the building manager instance
window.buildingManager = new BuildingManager();

// Global functions for testing and administration
window.loadBuildingsFromMasterCSV = async function() {
    const result = await window.buildingManager.loadBuildingsFromMasterCSV();
    if (result) {
        const totalBuildings = Object.values(result).reduce((sum, cat) => sum + cat.length, 0);
        // Refresh the game UI
        if (window.game && window.game.populateBuildingCategories) {
            window.game.populateBuildingCategories();
        }
        return result;
    } else {
        console.error('❌ Failed to load buildings from master CSV');
        return null;
    }
};

// Legacy function for backwards compatibility
window.loadHousingFromCSV = window.loadBuildingsFromMasterCSV;

window.clearHousing = function() {
    console.log('🧹 Clearing existing housing...');
    window.buildingManager.clearHousingBuildings();
    if (window.game && window.game.populateBuildingCategories) {
        window.game.populateBuildingCategories();
    }
};

window.resetBuildings = function() {
    window.buildingManager.clearAllBuildings();
    // Force reload from CSV
    setTimeout(async () => {
        await window.loadBuildingsFromMasterCSV();
    }, 100);
};

window.forceReloadCSV = async function() {
    localStorage.removeItem('theCommons_buildings');
    window.buildingManager.buildings = window.buildingManager.getDefaultBuildings();
    const result = await window.buildingManager.loadBuildingsFromMasterCSV();
    if (window.game && window.game.populateBuildingCategories) {
        window.game.populateBuildingCategories();
    }
    const totalBuildings = result ? Object.values(result).reduce((sum, cat) => sum + cat.length, 0) : 0;
    return result;
};

// Force refresh buildings from CSV (clears cache and reloads)
window.refreshBuildingsFromCSV = async function() {
    await window.buildingManager.clearAllBuildings();
    window.buildingManager.buildings = {};
    const result = await window.buildingManager.initializeBuildingsFromMasterCSV();
    return result;
};

// Experimental: Load CSV housing automatically on page load for testing
// To enable: uncomment the line below
// window.addEventListener('load', () => setTimeout(loadHousingFromCSV, 1000));