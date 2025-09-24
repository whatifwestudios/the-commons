/**
 * The Commons Game Server
 * Multi-user server with authentication and isolated user experiences
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const ServerEconomicEngine = require('./server-economic-engine');
const AuthService = require('./auth-service');
const GameState = require('./game-state');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize authentication service
const authService = new AuthService();

// Initialize game state
const gameState = new GameState();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for building data
app.use(cookieParser());
app.use(express.static('.'));

// Authentication middleware
const authenticateUser = (req, res, next) => {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = authService.verifySession(token);
    if (!result.success) {
        return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    req.user = result.user;
    next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
    const token = req.cookies.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (token) {
        const result = authService.verifySession(token);
        if (result.success) {
            req.user = result.user;
        }
    }

    // Always continue, with or without authentication
    next();
};

// Simple in-memory data store for solo game
let soloGameData = {
    leaderboard: [
        { name: "Sample City 1", wealth: 1250000, population: 850 },
        { name: "Sample City 2", wealth: 980000, population: 720 },
        { name: "Sample City 3", wealth: 750000, population: 600 }
    ]
};

// Per-player game state (server-authoritative for concurrent solo players)
let playerGameStates = new Map(); // userId -> gameState
let playerBalances = new Map(); // userId -> balance

// Get or initialize player balance
const getPlayerBalance = (userId) => {
    if (!playerBalances.has(userId)) {
        playerBalances.set(userId, 6000); // Default starting balance
    }
    return playerBalances.get(userId);
};

// Get or initialize player game state (creates empty grid and default state)
const getPlayerGameState = (userId) => {
    if (!playerGameStates.has(userId)) {
        // Initialize with empty game state
        const defaultGameState = {
            grid: {}, // Empty grid - will be populated as player builds
            currentDay: 1,
            currentMonth: 'SEPT',
            playerCash: 6000,
            playerActions: 20,
            // Add other default state properties as needed
        };
        playerGameStates.set(userId, defaultGameState);
        console.log(`🏠 Initialized game state for player: ${userId}`);
    }
    return playerGameStates.get(userId);
};

// Backward compatibility for solo play
playerBalances.set('player', 6000);

// Initialize server-side economic engine
const economicEngine = new ServerEconomicEngine();
console.log('🏭 Server-side Economic Engine initialized');

// Health check endpoint
app.get('/health', (req, res) => {
    const stats = authService.getUserStats();
    res.json({
        status: 'healthy',
        mode: 'multi-user',
        users: stats.totalUsers,
        timestamp: new Date().toISOString()
    });
});

// =============================================================================
// AUTHENTICATION ENDPOINTS
// =============================================================================

// Send magic link
app.post('/api/auth/magic-link', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Valid email address required'
            });
        }

        console.log(`🔐 Magic link requested for: ${email}`);
        const result = await authService.sendMagicLink(email, `${req.protocol}://${req.get('host')}`);

        res.json(result);
    } catch (error) {
        console.error('❌ Magic link request failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send magic link'
        });
    }
});

// Verify magic link and create session
app.get('/auth/verify', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.redirect('/?error=invalid-link');
        }

        const result = await authService.verifyMagicToken(token);

        if (!result.success) {
            return res.redirect(`/?error=${encodeURIComponent(result.error)}`);
        }

        // Set session cookie
        res.cookie('sessionToken', result.sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            sameSite: 'strict'
        });

        // Redirect to game
        res.redirect('/?auth=success');

    } catch (error) {
        console.error('❌ Magic link verification failed:', error);
        res.redirect('/?error=verification-failed');
    }
});

// Get current user info
app.get('/api/auth/me', authenticateUser, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('sessionToken');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Reset game state endpoint
app.post('/api/reset', (req, res) => {
    console.log('🔄 Solo game reset requested');

    // Reset server-side player balance to initial amount
    playerBalances.set('player', 6000);
    console.log('✅ Player balance reset to $6,000');

    res.json({
        success: true,
        message: 'Solo game reset - server state reset',
        newBalance: 6000,
        timestamp: new Date().toISOString()
    });
});

// Save building data JSON endpoint
app.post('/api/buildings/save-json', (req, res) => {
    try {
        console.log('💾 Saving building data JSON from CSV upload');
        const { buildingData } = req.body;

        if (!buildingData) {
            return res.status(400).json({
                success: false,
                error: 'No building data provided'
            });
        }

        // Write to buildings-data.json
        const filePath = path.join(__dirname, 'buildings-data.json');
        fs.writeFileSync(filePath, JSON.stringify(buildingData, null, 2));

        console.log('✅ Building data saved to buildings-data.json');
        res.json({
            success: true,
            message: 'Building data saved successfully',
            path: 'buildings-data.json'
        });
    } catch (error) {
        console.error('❌ Failed to save building data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save building data',
            message: error.message
        });
    }
});

// Cash transaction endpoint
app.post('/api/cash/transaction', optionalAuth, (req, res) => {
    try {
        const { id, type, amount, reason, context, playerId } = req.body;

        console.log(`💰 Cash transaction: ${type} $${amount} for ${playerId} - ${reason}`);

        // Validate input
        if (!type || !amount || !playerId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required transaction fields'
            });
        }

        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }

        // Determine actual user ID for balance lookup
        const actualUserId = req.user ? req.user.id : (playerId || 'player');

        // Get current balance using helper function
        let currentBalance = getPlayerBalance(actualUserId);

        // Validate transaction type and apply changes
        let newBalance;
        switch (type) {
            case 'spend':
                if (currentBalance < amount) {
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient funds: need $${amount.toLocaleString()}, have $${currentBalance.toLocaleString()}`
                    });
                }
                newBalance = currentBalance - amount;
                break;

            case 'earn':
                newBalance = currentBalance + amount;
                break;

            case 'daily_cashflow':
                newBalance = currentBalance + amount; // amount can be negative for net losses
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: `Unknown transaction type: ${type}`
                });
        }

        // Apply the transaction
        playerBalances.set(actualUserId, newBalance);

        console.log(`✅ Transaction successful: ${actualUserId} balance ${currentBalance} → ${newBalance}`);

        res.json({
            success: true,
            transactionId: id,
            newBalance: newBalance,
            previousBalance: currentBalance,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('❌ Cash transaction failed:', error);
        res.status(500).json({
            success: false,
            error: 'Transaction failed',
            message: error.message
        });
    }
});

// Player balance endpoint
app.post('/api/player/balance', optionalAuth, (req, res) => {
    try {
        const { playerId } = req.body;

        // Determine actual user ID for balance lookup
        const actualUserId = req.user ? req.user.id : (playerId || 'player');

        const balance = getPlayerBalance(actualUserId);

        res.json({
            success: true,
            balance: balance,
            playerId: actualUserId,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('❌ Balance lookup failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get balance',
            message: error.message
        });
    }
});

// Reset player balance endpoint
app.post('/api/player/reset-balance', async (req, res) => {
    try {
        console.log('🔄 Player balance reset requested');

        // Reset player balance to starting amount
        const startingBalance = 6000;

        // For now, just return success - in multiplayer this would update database
        res.json({
            success: true,
            message: 'Player balance reset successfully',
            newBalance: startingBalance,
            timestamp: new Date().toISOString()
        });

        console.log('✅ Player balance reset to', startingBalance);
    } catch (error) {
        console.error('❌ Balance reset failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset balance',
            message: error.message
        });
    }
});

// Update player color endpoint
app.post('/api/player/color', optionalAuth, (req, res) => {
    try {
        const { playerId, color } = req.body;
        const actualPlayerId = req.user ? req.user.id : (playerId || 'player');

        if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid color format'
            });
        }

        // Use actual GameState instance for color management
        const result = {
            success: true,
            assignedColor: gameState.updatePlayerColor(actualPlayerId, color),
            playerId: actualPlayerId
        };

        console.log(`🎨 Player ${actualPlayerId} color updated to ${result.assignedColor}`);

        res.json(result);
    } catch (error) {
        console.error('❌ Player color update failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update player color',
            message: error.message
        });
    }
});

// Get current authenticated user info
app.get('/api/auth/me', optionalAuth, (req, res) => {
    try {
        if (req.user && req.user.id) {
            res.json({
                success: true,
                user: {
                    id: req.user.id,
                    username: req.user.username,
                    authenticated: true
                }
            });
        } else {
            res.json({
                success: true,
                user: null,
                authenticated: false
            });
        }
    } catch (error) {
        console.error('❌ Get current user failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get current user',
            message: error.message
        });
    }
});

// Get player info endpoint
app.get('/api/player/:playerId', optionalAuth, (req, res) => {
    try {
        const playerId = req.params.playerId || 'player';

        // TODO: Use actual GameState instance in multiplayer
        // For now, return default player data
        const playerData = {
            id: playerId,
            name: 'Player',
            color: '#10AC84',
            cash: 6000,
            actions: 20,
            votingPoints: 0
        };

        res.json({
            success: true,
            player: playerData
        });
    } catch (error) {
        console.error('❌ Get player info failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get player info',
            message: error.message
        });
    }
});

// Get all players endpoint (for multiplayer)
app.get('/api/players', optionalAuth, (req, res) => {
    try {
        // Use actual GameState instance for player data
        const players = {};

        // Convert GameState players to API format
        for (const [playerId, playerData] of Object.entries(gameState.state.players)) {
            players[playerId] = {
                id: playerId,
                name: playerData.name || 'Player',
                color: playerData.color || '#10AC84',
                cash: playerData.cash || 6000,
                actions: playerData.actions || 20,
                votingPoints: playerData.votingPoints || 0
            };
        }

        res.json({
            success: true,
            players: players
        });
    } catch (error) {
        console.error('❌ Get players failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get players',
            message: error.message
        });
    }
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
        console.log('🔍 [DEBUG] GameState grid keys:', Object.keys(gameState.grid || {}));
        console.log('🔍 [DEBUG] GameState buildings keys:', Object.keys(gameState.buildings || {}));
        if (Object.keys(gameState.grid || {}).length > 0) {
            const firstGridKey = Object.keys(gameState.grid)[0];
            console.log('🔍 [DEBUG] Sample grid entry:', firstGridKey, gameState.grid[firstGridKey]);
        }

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

// FINE-GRAINED: Player cashflow calculation (now with session-based player isolation)
app.post('/api/economics/player-cashflow', optionalAuth, (req, res) => {
    try {
        console.log('💰 Player cashflow calculation requested');

        // Determine player ID from session or fallback to legacy 'player'
        let playerId = 'player'; // Default for backward compatibility
        if (req.user && req.user.id) {
            playerId = req.user.id;
            console.log(`👤 Using authenticated player: ${playerId}`);
        }

        // Get or merge player-specific game state
        let gameState = req.body.gameState;
        if (req.user && req.user.id) {
            const serverPlayerState = getPlayerGameState(req.user.id);
            // Merge client state with server state (client state takes precedence for current session)
            gameState = { ...serverPlayerState, ...gameState };
        }

        const result = economicEngine.calculatePlayerCashflow(gameState, playerId);
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