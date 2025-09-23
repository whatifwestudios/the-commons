/**
 * Client-Side Economic API Helper
 * Manages communication with server-side economic engine
 */

class ClientEconomicAPI {
    constructor() {
        this.baseUrl = ''; // Relative URLs for same-origin requests
        this.cache = new Map();
        this.pendingRequests = new Map();
    }

    /**
     * FINE-GRAINED: Get individual building performance
     * Used for tooltips and UI updates with caching
     */
    async getBuildingPerformance(row, col) {
        const cacheKey = `building:${row},${col}`;

        // Check cache first (5 second TTL)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) {
                return cached.data;
            }
        }

        // Check if request is already pending
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        try {
            const requestPromise = fetch(`${this.baseUrl}/api/economics/building/${row}/${col}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        // Cache the result
                        this.cache.set(cacheKey, {
                            data: data.building,
                            timestamp: Date.now()
                        });
                        return data.building;
                    } else {
                        throw new Error(data.error || 'Failed to get building performance');
                    }
                });

            // Store pending request
            this.pendingRequests.set(cacheKey, requestPromise);

            const result = await requestPromise;
            this.pendingRequests.delete(cacheKey);
            return result;

        } catch (error) {
            this.pendingRequests.delete(cacheKey);
            console.error('Failed to get building performance:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Get city statistics
     * Used for UI dashboards and summaries
     */
    async getCityStatistics() {
        const cacheKey = 'city:stats';

        // Check cache (3 second TTL for city stats)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 3000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/city-stats`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.cityStats,
                    timestamp: Date.now()
                });
                return data.cityStats;
            } else {
                throw new Error(data.error || 'Failed to get city statistics');
            }
        } catch (error) {
            console.error('Failed to get city statistics:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Get supply/demand balance
     * Used for economic overview displays
     */
    async getSupplyDemand() {
        const cacheKey = 'city:supply-demand';

        // Check cache (3 second TTL)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 3000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/supply-demand`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.supplyDemand,
                    timestamp: Date.now()
                });
                return data.supplyDemand;
            } else {
                throw new Error(data.error || 'Failed to get supply/demand data');
            }
        } catch (error) {
            console.error('Failed to get supply/demand data:', error);
            return null;
        }
    }

    /**
     * COARSE-GRAINED: Calculate full city economics
     * Called on major changes
     */
    async calculateCityEconomics(gameState) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/calculate-city`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gameState)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Clear relevant cache after city-wide recalculation
                this.clearCache(['city:', 'building:']);
                return data;
            } else {
                throw new Error(data.error || 'Failed to calculate city economics');
            }
        } catch (error) {
            console.error('Failed to calculate city economics:', error);
            return null;
        }
    }

    /**
     * COARSE-GRAINED: Handle building placement
     * Optimized for building placement with focused updates
     */
    async handleBuildingPlacement(gameState, buildingData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/building-placed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameState, buildingData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Clear cache for affected areas
                this.clearBuildingCache(buildingData.row, buildingData.col);
                this.clearCache(['city:']); // City stats will change
                return data;
            } else {
                throw new Error(data.error || 'Failed to handle building placement');
            }
        } catch (error) {
            console.error('Failed to handle building placement:', error);
            return null;
        }
    }

    /**
     * COARSE-GRAINED: Handle building removal
     */
    async handleBuildingRemoval(gameState, buildingData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/building-removed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameState, buildingData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Clear cache
                this.clearBuildingCache(buildingData.row, buildingData.col);
                this.clearCache(['city:']);
                return data;
            } else {
                throw new Error(data.error || 'Failed to handle building removal');
            }
        } catch (error) {
            console.error('Failed to handle building removal:', error);
            return null;
        }
    }

    /**
     * Handle policy changes
     */
    async handlePolicyChange(gameState, policyData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/policy-change`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameState, policyData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Policy changes affect all buildings
                this.clearCache();
                return data;
            } else {
                throw new Error(data.error || 'Failed to handle policy change');
            }
        } catch (error) {
            console.error('Failed to handle policy change:', error);
            return null;
        }
    }

    /**
     * Handle transport network updates
     */
    async handleTransportUpdate(gameState, transportData) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/transport-update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameState, transportData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Transport changes can affect many buildings
                this.clearCache(['building:']);
                return data;
            } else {
                throw new Error(data.error || 'Failed to handle transport update');
            }
        } catch (error) {
            console.error('Failed to handle transport update:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Calculate player cashflow breakdown
     * Server-authoritative cashflow calculation
     */
    async getPlayerCashflow(gameState, playerId = 'player') {
        const cacheKey = `cashflow:${playerId}`;

        // Check cache (5 second TTL for cashflow)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/player-cashflow`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameState: this.prepareGameState(gameState),
                    playerId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.cashflow,
                    timestamp: Date.now()
                });
                return data.cashflow;
            } else {
                throw new Error(data.error || 'Failed to get player cashflow');
            }
        } catch (error) {
            console.error('Failed to get player cashflow:', error);
            return null;
        }
    }

    /**
     * Clear cache entries matching prefixes
     */
    clearCache(prefixes = []) {
        if (prefixes.length === 0) {
            this.cache.clear();
            return;
        }

        for (const [key] of this.cache) {
            for (const prefix of prefixes) {
                if (key.startsWith(prefix)) {
                    this.cache.delete(key);
                    break;
                }
            }
        }
    }

    /**
     * Clear building cache in affected area
     */
    clearBuildingCache(centerRow, centerCol, radius = 5) {
        // Clear cache for buildings that might be affected by the change
        for (const [key] of this.cache) {
            if (key.startsWith('building:')) {
                const coords = key.replace('building:', '').split(',');
                const row = parseInt(coords[0]);
                const col = parseInt(coords[1]);

                const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);
                if (distance <= radius) {
                    this.cache.delete(key);
                }
            }
        }
    }

    /**
     * OPTIMIZED: Batch multiple building performance requests
     * Uses new server batch endpoint for better performance
     */
    async getBuildingPerformanceBatch(coordinates) {
        try {
            const response = await fetch(`${this.baseUrl}/api/economics/buildings-batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ coordinates })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Cache results individually
                data.results.forEach(result => {
                    if (result.success && result.building) {
                        const cacheKey = `building:${result.row},${result.col}`;
                        this.cache.set(cacheKey, {
                            data: result.building,
                            timestamp: Date.now()
                        });
                    }
                });

                return data.results.map(result => ({
                    row: result.row,
                    col: result.col,
                    performance: result.success ? result.building : null
                }));
            } else {
                throw new Error(data.error || 'Failed to get batch building performance');
            }
        } catch (error) {
            console.error('Failed to get building performance batch (server), falling back to individual requests:', error);

            // Fallback to individual requests
            const requests = coordinates.map(({ row, col }) =>
                this.getBuildingPerformance(row, col).then(performance => ({
                    row, col, performance
                }))
            );

            try {
                return await Promise.all(requests);
            } catch (fallbackError) {
                console.error('Failed to get building performance batch (fallback):', fallbackError);
                return coordinates.map(({ row, col }) => ({ row, col, performance: null }));
            }
        }
    }

    /**
     * OPTIMIZED: Get all city data in a single batch request
     * Combines city stats, supply/demand, and economics in one call
     */
    async getCityDataBatch(gameState) {
        const cacheKey = 'city:data-batch';

        // Check cache (3 second TTL for batch city data)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 3000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/city-data-batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameState: this.prepareGameState(gameState)
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.cityData,
                    timestamp: Date.now()
                });

                // Also cache individual components
                if (data.cityData.statistics) {
                    this.cache.set('city:stats', {
                        data: data.cityData.statistics,
                        timestamp: Date.now()
                    });
                }
                if (data.cityData.supplyDemand) {
                    this.cache.set('city:supply-demand', {
                        data: data.cityData.supplyDemand,
                        timestamp: Date.now()
                    });
                }

                return data.cityData;
            } else {
                throw new Error(data.error || 'Failed to get batch city data');
            }
        } catch (error) {
            console.error('Failed to get city data batch:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Calculate demographics
     * Server-authoritative demographics calculation
     */
    async getDemographics(totalPopulation) {
        const cacheKey = `demographics:${totalPopulation}`;

        // Check cache (10 second TTL for demographics - they don't change often)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 10000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/demographics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ totalPopulation })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.demographics,
                    timestamp: Date.now()
                });
                return data.demographics;
            } else {
                throw new Error(data.error || 'Failed to get demographics');
            }
        } catch (error) {
            console.error('Failed to get demographics:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Calculate land value for a specific parcel
     * Server-authoritative land value calculation with accessibility, vitality, and population factors
     */
    async getLandValue(gameState, row, col) {
        const cacheKey = `landvalue:${row},${col}`;

        // Check cache (10 second TTL for land values)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 10000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/land-value`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameState: this.prepareGameState(gameState),
                    row,
                    col
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });
                return data;
            } else {
                throw new Error(data.error || 'Failed to calculate land value');
            }
        } catch (error) {
            console.error('Failed to calculate land value:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Calculate accessibility scores for a specific parcel
     * Server-authoritative accessibility calculation considering all nearby amenities
     */
    async getAccessibilityScores(gameState, row, col) {
        const cacheKey = `accessibility:${row},${col}`;

        // Check cache (5 second TTL for accessibility scores)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 5000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/accessibility-scores`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameState: this.prepareGameState(gameState),
                    row,
                    col
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.cache.set(cacheKey, {
                    data: data.accessibilityScores,
                    timestamp: Date.now()
                });
                return data.accessibilityScores;
            } else {
                throw new Error(data.error || 'Failed to calculate accessibility scores');
            }
        } catch (error) {
            console.error('Failed to calculate accessibility scores:', error);
            return null;
        }
    }

    /**
     * FINE-GRAINED: Get building performance for a specific building
     * Server-authoritative building performance including needs satisfaction
     */
    async getBuildingPerformance(row, col) {
        const cacheKey = `building:${row},${col}`;

        // Check cache (3 second TTL for building performance)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 3000) {
                return cached.data;
            }
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/economics/building/${row}/${col}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                // Cache the result
                this.cache.set(cacheKey, {
                    timestamp: Date.now(),
                    data: data
                });
                return data;
            } else {
                throw new Error(data.error || 'Failed to get building performance');
            }
        } catch (error) {
            console.error('Failed to get building performance:', error);
            return null;
        }
    }

    /**
     * Prepare game state for server transmission
     * Converts client game state to server-compatible format
     */
    prepareGameState(game) {
        const gameState = {
            grid: {},
            buildings: {}
        };

        // Convert grid to server format
        for (let row = 0; row < game.gridSize; row++) {
            for (let col = 0; col < game.gridSize; col++) {
                if (game.grid[row] && game.grid[row][col]) {
                    const parcel = game.grid[row][col];
                    const gridKey = `${row},${col}`;

                    gameState.grid[gridKey] = {
                        building: parcel.building,
                        owner: parcel.owner,
                        buildingAge: parcel.buildingAge,
                        decay: parcel.decay,
                        population: parcel.population,
                        _isUnderConstruction: parcel._isUnderConstruction
                    };
                }
            }
        }

        // Convert buildings data structure
        if (game.buildingManager?.buildings) {
            // buildings is an object with categories like { housing: [...], energy: [...] }
            Object.values(game.buildingManager.buildings).forEach(categoryBuildings => {
                if (Array.isArray(categoryBuildings)) {
                    categoryBuildings.forEach(building => {
                        if (building.id) {
                            gameState.buildings[building.id] = building;
                        }
                    });
                }
            });
        }

        return gameState;
    }

    /**
     * Reset player balance to starting amount
     */
    async resetPlayerBalance() {
        try {
            const response = await fetch(`${this.baseUrl}/api/player/reset-balance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('💰 Player balance reset:', data);
            return data;
        } catch (error) {
            console.error('Failed to reset player balance:', error);
            return null;
        }
    }
}

// Export for use in game
if (typeof window !== 'undefined') {
    window.ClientEconomicAPI = ClientEconomicAPI;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClientEconomicAPI;
}