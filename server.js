/**
 * Solo Game Server for The Commons
 * Minimal server for solo gameplay with basic API endpoints
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const ServerEconomicEngine = require('./server-economic-engine');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Simple in-memory data store for solo game
let soloGameData = {
    leaderboard: [
        { name: "Sample City 1", wealth: 1250000, population: 850 },
        { name: "Sample City 2", wealth: 980000, population: 720 },
        { name: "Sample City 3", wealth: 750000, population: 600 }
    ]
};

// Initialize server-side economic engine
const economicEngine = new ServerEconomicEngine();
console.log('🏭 Server-side Economic Engine initialized');

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: 'solo',
        timestamp: new Date().toISOString()
    });
});

// Reset game state endpoint
app.post('/api/reset', (req, res) => {
    console.log('🔄 Solo game reset requested');
    res.json({
        success: true,
        message: 'Solo game reset - state managed client-side',
        timestamp: new Date().toISOString()
    });
});

// Backup reset endpoint
app.post('/reset', (req, res) => {
    console.log('🔄 Solo game reset requested (backup endpoint)');
    res.json({
        success: true,
        message: 'Solo game reset - state managed client-side',
        timestamp: new Date().toISOString()
    });
});

// =============================================================================
// ECONOMIC ENGINE API ENDPOINTS
// =============================================================================

// COARSE-GRAINED: Full city economic recalculation
app.post('/api/economics/calculate-city', (req, res) => {
    try {
        console.log('🏙️ City economics calculation requested');
        const gameState = req.body;

        const result = economicEngine.calculateCityEconomics(gameState);
        res.json(result);
    } catch (error) {
        console.error('❌ City economics calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate city economics',
            message: error.message
        });
    }
});

// COARSE-GRAINED: Building placement
app.post('/api/economics/building-placed', (req, res) => {
    try {
        console.log('🏗️ Building placement calculation requested');
        const { gameState, buildingData } = req.body;

        const result = economicEngine.handleBuildingPlacement(gameState, buildingData);
        res.json(result);
    } catch (error) {
        console.error('❌ Building placement calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate building placement effects',
            message: error.message
        });
    }
});

// COARSE-GRAINED: Building removal
app.post('/api/economics/building-removed', (req, res) => {
    try {
        console.log('🗑️ Building removal calculation requested');
        const { gameState, buildingData } = req.body;

        // Reuse the city calculation for now - can optimize later
        const result = economicEngine.calculateCityEconomics(gameState);
        res.json(result);
    } catch (error) {
        console.error('❌ Building removal calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate building removal effects',
            message: error.message
        });
    }
});

// FINE-GRAINED: Individual building performance
app.get('/api/economics/building/:row/:col', (req, res) => {
    try {
        const row = parseInt(req.params.row);
        const col = parseInt(req.params.col);

        console.log(`🏢 Building performance requested for ${row},${col}`);

        const result = economicEngine.getBuildingPerformance(row, col);
        res.json(result);
    } catch (error) {
        console.error('❌ Building performance calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get building performance',
            message: error.message
        });
    }
});

// FINE-GRAINED: City statistics
app.get('/api/economics/city-stats', (req, res) => {
    try {
        console.log('📊 City statistics requested');

        const result = economicEngine.getCityStatistics();
        res.json(result);
    } catch (error) {
        console.error('❌ City statistics calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get city statistics',
            message: error.message
        });
    }
});

// FINE-GRAINED: Supply and demand
app.get('/api/economics/supply-demand', (req, res) => {
    try {
        console.log('⚖️ Supply/demand data requested');

        const result = economicEngine.getSupplyDemand();
        res.json(result);
    } catch (error) {
        console.error('❌ Supply/demand calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get supply/demand data',
            message: error.message
        });
    }
});

// Policy and governance integration
app.post('/api/economics/policy-change', (req, res) => {
    try {
        console.log('🏛️ Policy change calculation requested');
        const { gameState, policyData } = req.body;

        // Recalculate city economics after policy change
        const result = economicEngine.calculateCityEconomics(gameState);
        res.json(result);
    } catch (error) {
        console.error('❌ Policy change calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate policy change effects',
            message: error.message
        });
    }
});

// Transport integration
app.post('/api/economics/transport-update', (req, res) => {
    try {
        console.log('🚌 Transport update calculation requested');
        const { gameState, transportData } = req.body;

        // Recalculate affected building performances
        const result = economicEngine.calculateCityEconomics(gameState);
        res.json(result);
    } catch (error) {
        console.error('❌ Transport update calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate transport update effects',
            message: error.message
        });
    }
});

// FINE-GRAINED: Player cashflow calculation
app.post('/api/economics/player-cashflow', (req, res) => {
    try {
        console.log('💰 Player cashflow calculation requested');
        const { gameState, playerId } = req.body;

        const result = economicEngine.calculatePlayerCashflow(gameState, playerId || 'player');
        res.json(result);
    } catch (error) {
        console.error('❌ Player cashflow calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate player cashflow',
            message: error.message
        });
    }
});

// BATCH: Multiple building performance calculations
app.post('/api/economics/buildings-batch', (req, res) => {
    try {
        console.log('🏢 Batch building performance calculation requested');
        const { coordinates } = req.body;

        if (!Array.isArray(coordinates)) {
            return res.status(400).json({
                success: false,
                error: 'Coordinates must be an array'
            });
        }

        const results = coordinates.map(({ row, col }) => {
            try {
                const buildingResult = economicEngine.getBuildingPerformance(row, col);
                return {
                    row,
                    col,
                    success: true,
                    building: buildingResult.building || null
                };
            } catch (error) {
                return {
                    row,
                    col,
                    success: false,
                    error: error.message
                };
            }
        });

        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('❌ Batch building performance calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate batch building performance',
            message: error.message
        });
    }
});

// BATCH: Multiple city statistics (comprehensive city data)
app.post('/api/economics/city-data-batch', (req, res) => {
    try {
        console.log('🏙️ Batch city data calculation requested');
        const { gameState } = req.body;

        // Calculate all city-wide metrics in one go
        const cityStats = economicEngine.getCityStatistics();
        const supplyDemand = economicEngine.getSupplyDemand();
        const cityEconomics = economicEngine.calculateCityEconomics(gameState);

        res.json({
            success: true,
            cityData: {
                statistics: cityStats.cityStats || null,
                supplyDemand: supplyDemand.supplyDemand || null,
                economics: cityEconomics.success ? cityEconomics : null
            }
        });
    } catch (error) {
        console.error('❌ Batch city data calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate batch city data',
            message: error.message
        });
    }
});

// FINE-GRAINED: Demographics calculation
app.post('/api/economics/demographics', (req, res) => {
    try {
        console.log('👥 Demographics calculation requested');
        const { totalPopulation } = req.body;

        if (typeof totalPopulation !== 'number' || totalPopulation < 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid total population provided'
            });
        }

        const result = economicEngine.calculateDemographics(totalPopulation);
        res.json(result);
    } catch (error) {
        console.error('❌ Demographics calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate demographics',
            message: error.message
        });
    }
});

// FINE-GRAINED: Land value calculation
app.post('/api/economics/land-value', (req, res) => {
    try {
        console.log('🏞️ Land value calculation requested');
        const { gameState, row, col } = req.body;

        if (!gameState || typeof row !== 'number' || typeof col !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Invalid gameState or coordinates provided'
            });
        }

        const result = economicEngine.calculateLandValue(gameState, row, col);
        res.json(result);
    } catch (error) {
        console.error('❌ Land value calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate land value',
            message: error.message
        });
    }
});

// FINE-GRAINED: Accessibility scores calculation
app.post('/api/economics/accessibility-scores', (req, res) => {
    try {
        console.log('🚶 Accessibility scores calculation requested');
        const { gameState, row, col } = req.body;

        if (!gameState || typeof row !== 'number' || typeof col !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Invalid gameState or coordinates provided'
            });
        }

        const accessibilityScores = economicEngine.calculateAccessibilityScores(gameState, row, col);
        res.json({
            success: true,
            accessibilityScores: accessibilityScores
        });
    } catch (error) {
        console.error('❌ Accessibility scores calculation failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate accessibility scores',
            message: error.message
        });
    }
});

// =============================================================================

// Leaderboard endpoint
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = soloGameData.leaderboard.slice(0, limit);

    console.log(`📊 Leaderboard requested (limit: ${limit})`);
    res.json({
        success: true,
        leaderboard: leaderboard,
        timestamp: new Date().toISOString()
    });
});

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🎮 Solo Game Server running on port ${PORT}`);
    console.log(`📍 Game available at: http://localhost:${PORT}`);
    console.log(`🏠 Mode: Solo gameplay only`);
});