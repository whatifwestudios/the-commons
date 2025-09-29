/**
 * The Commons Game Server
 * Multi-user server with authentication and isolated user experiences
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const ServerEconomicEngine = require('./server-economic-engine-v2');
// GameState removed - using v2 server-authoritative economic engine
const RoomManager = require('./server-room-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple pass-through middleware (replaces noAuth)
const noAuth = (req, res, next) => {
    next();
};

// Initialize room manager with v2 economic engine
const roomManager = new RoomManager();

// Clean multiplayer-only server - no legacy default rooms


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for building data


app.use(express.static('.'));



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

// Get or initialize player balance - FRESH START for board game experience
const getPlayerBalance = (userId) => {
    // Every session starts with $6,000 - no persistence needed
    if (!playerBalances.has(userId)) {
        playerBalances.set(userId, 6000); // Fresh start for new player
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

// Backward compatibility for solo play - REMOVED to prevent shared state
// playerBalances.set('player', 6000); // DISABLED: Each session gets unique ID instead

// Clean multiplayer server - all economic engines are room-specific

// Create HTTP server for WebSocket upgrade
const server = http.createServer(app);

// WebSocket server for real-time multiplayer communication
const wss = new WebSocket.Server({ server, path: '/ws' });

// WebSocket connection management
const connectedClients = new Set();

wss.on('connection', (ws, req) => {
    console.log('🔌 Client connected to WebSocket');
    connectedClients.add(ws);

    // Generate unique player ID for this session
    const playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
    ws.playerId = playerId;

    // Send welcome with assigned player ID
    ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to The Commons multiplayer server',
        playerId: playerId
    }));

    console.log(`🔌 Player ${playerId} connected, awaiting room assignment`);

    // Beer hall system will handle room assignment - no auto-assignment needed
    // Players will be assigned when they click "Enter the Commons" with their preferences

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(ws, data);
        } catch (error) {
            console.error('Invalid WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Player ${playerId} disconnected`);
        connectedClients.delete(ws);
        roomManager.handleDisconnect(playerId);
    });

    ws.on('error', (error) => {
        console.error('🔌 WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
    const playerId = ws.playerId;
    const room = roomManager.getPlayerRoom(playerId);

    switch (data.type) {
        case 'IDENTIFY_PLAYER':
            // 🔧 FIX: Allow client to identify itself with existing player ID and metadata
            if (data.playerId) {
                console.log(`🔄 Client requesting to use existing player ID: ${data.playerId} (was: ${ws.playerId})`);
                console.log(`👤 Player metadata:`, {
                    name: data.playerName,
                    color: data.playerColor
                });

                ws.playerId = data.playerId;

                // DON'T create player here - let room.addPlayer() handle player creation with cityName
                // Only update metadata if player already exists in economic engine
                if (room?.economicEngine) {
                    if (data.playerName || data.playerColor) {
                        room.economicEngine.updatePlayerMetadata(data.playerId, data.playerName, data.playerColor);
                    }
                }

                // Send confirmation with the assigned player ID
                ws.send(JSON.stringify({
                    type: 'PLAYER_IDENTIFIED',
                    playerId: data.playerId,
                    message: `Successfully identified as ${data.playerId}`
                }));

                console.log(`✅ WebSocket connection reassigned to player: ${data.playerId} with metadata`);
            }
            break;

        case 'READY':
            if (!room) {
                console.error('Player not in a room for READY:', playerId);
                return;
            }
            room.setPlayerReady(playerId, data.ready);
            room.broadcast({
                type: 'PLAYER_READY',
                playerId: playerId,
                ready: data.ready
            });
            break;

        case 'CHAT':
        case 'CHAT_MESSAGE':
            if (!room) {
                console.error('Player not in a room for CHAT:', playerId);
                return;
            }
            console.log(`💬 Chat message from ${data.playerName || playerId}: ${data.message}`);
            room.broadcast({
                type: 'CHAT_MESSAGE',
                playerId: playerId,
                playerName: data.playerName || 'Player',
                message: data.message,
                color: data.color,
                timestamp: Date.now()
            });
            break;

        case 'START_GAME':
            if (!room) {
                console.error('Player not in a room for START_GAME:', playerId);
                return;
            }
            console.log(`🚀 Player ${playerId} requested to start game`);

            // Check if minimum players are met
            if (room.players.size >= room.minPlayers) {
                room.broadcast({
                    type: 'START_GAME',
                    playerId: playerId,
                    players: Array.from(room.players.values()),
                    timestamp: Date.now()
                });

                // Start game after broadcast
                setTimeout(() => {
                    room.startGame();
                }, 1000);
            } else {
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    message: `Need at least ${room.minPlayers} players to start`
                }));
            }
            break;

        case 'REQUEST_ROOM_STATE':
            if (!room) {
                console.error('Player not in a room for REQUEST_ROOM_STATE:', playerId);
                return;
            }
            // Send fresh room state to requesting client
            console.log(`📡 Sending fresh room state to player ${playerId}`);
            const roomState = room.getFullState();
            ws.send(JSON.stringify({
                type: 'ROOM_STATE_SYNC',
                roomState: roomState,
                timestamp: Date.now()
            }));
            break;

        case 'chat_message':
            // Handle chat messages and broadcast to other players in the room
            console.log('💬 Chat message from', data.playerName + ':', data.message);
            if (room) {
                // Broadcast to all players in the room except the sender
                room.players.forEach(player => {
                    if (player.id !== playerId) {
                        const playerWs = Array.from(connectedClients).find(client => client.playerId === player.id);
                        if (playerWs && playerWs.readyState === 1) { // WebSocket.OPEN
                            playerWs.send(JSON.stringify({
                                type: 'chat_message',
                                playerId: data.playerId,
                                playerName: data.playerName,
                                playerColor: data.playerColor,
                                message: data.message,
                                timestamp: data.timestamp
                            }));
                        }
                    }
                });
            }
            break;


        case 'GOVERNANCE_VOTE':
            // Handle governance allocation changes
            if (room && room.economicEngine) {
                const result = room.economicEngine.handleGovernanceVote(
                    data.playerId,
                    data.voteType,
                    data
                );

                if (result.success) {
                    // Broadcast updated governance state to all players in room
                    room.economicEngine.broadcastGameStateUpdate('GOVERNANCE_UPDATE');
                }
            }
            break;

        default:
            console.log('Unknown WebSocket message type:', data.type);
    }
}

// Global broadcast function for economic updates
function broadcastToAllClients(update) {
    const message = JSON.stringify(update);
    let sentCount = 0;

    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sentCount++;
        } else {
            connectedClients.delete(client);
        }
    });

    if (sentCount > 0) {
        console.log(`📡 Broadcasted ${update.type} to ${sentCount} clients`);
    }
}

// Clean multiplayer - room broadcast functions are set per room in RoomManager

// Start economic engine timer for all rooms
setInterval(() => {
    // Update each room's game timer
    roomManager.rooms.forEach(room => {
        if (room.state === 'IN_PROGRESS') {
            room.economicEngine.updateGameTime();
        }
    });
}, 1000); // Update every second
console.log('🏭 Server-side Economic Engine initialized');

// ====================================================================
// 🍺 V2 MULTIPLAYER API - Clean room-based system
// ====================================================================

// V2 Beer Hall API - Table finder with preferences
app.post('/api/beer-hall/find-table', (req, res) => {
    try {
        const { playerId, playerName, playerColor, preferences } = req.body;

        if (!playerId) {
            return res.status(400).json({ error: 'playerId required' });
        }

        const playerData = {
            name: playerName || `Player ${Math.floor(Math.random() * 1000)}`,
            color: playerColor || '#4CAF50'
        };

        // Find player's WebSocket connection (simplified for now)
        let playerWs = null;
        for (const ws of connectedClients) {
            if (ws.playerId === playerId) {
                playerWs = ws;
                break;
            }
        }

        const room = roomManager.findTableWithPreferences(playerId, playerData, playerWs, preferences);

        // Check if WebSocket connection was found and linked properly
        if (!playerWs) {
            console.warn(`⚠️ No WebSocket found for player ${playerId}. Chat may not work.`);
        } else {
            console.log(`✅ WebSocket linked for ${playerId} to room ${room.id}`);
        }

        res.json({
            success: true,
            table: room.getInfo(),
            message: `Found table: ${room.roomName} (${room.players.size}/${room.maxPlayers})`
        });

    } catch (error) {
        console.error('❌ Beer hall table finder error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get beer hall lobby status (list of tables)
app.get('/api/beer-hall/lobby', (req, res) => {
    try {
        const tables = roomManager.getPublicRooms();
        res.json({
            success: true,
            tables: tables,
            totalPlayers: Array.from(connectedClients).length
        });
    } catch (error) {
        console.error('❌ Beer hall lobby error:', error);
        res.status(500).json({ error: error.message });
    }
});

// V2 Transaction API - Room-specific economic transactions
app.post('/api/v2/transaction', (req, res) => {
    try {
        const { playerId, type, amount, description } = req.body;

        if (!playerId) {
            return res.status(400).json({ error: 'playerId required' });
        }

        // Find player's room
        const room = roomManager.getPlayerRoom(playerId);
        if (!room) {
            return res.status(404).json({ error: 'Player not in any room' });
        }

        // Process transaction through room's economic engine
        const result = room.economicEngine.processTransaction({
            type,
            playerId,
            amount,
            description,
            timestamp: Date.now()
        });

        if (result.success) {
            // Broadcast transaction to room members
            room.broadcast({
                type: 'TRANSACTION_UPDATE',
                playerId: playerId,
                transaction: result,
                timestamp: Date.now()
            });

            res.json({
                success: true,
                result: result,
                roomId: room.id
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        console.error('❌ V2 Transaction error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: 'multi-user',
        timestamp: new Date().toISOString()
    });
});




// Save building data JSON endpoint (development only)
app.post('/api/buildings/save-json', (req, res) => {
    // Disable CSV uploads in production for security
    if (process.env.NODE_ENV === 'production') {
        console.log('🚫 CSV upload disabled in production environment');
        return res.status(403).json({
            success: false,
            error: 'File uploads are disabled in production for security reasons',
            message: 'This feature is only available in development mode'
        });
    }

    try {
        console.log('💾 Saving building data JSON from CSV upload (development mode)');
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
// REMOVED: Legacy /api/cash/transaction endpoint - replaced by v2 economic system

// Player balance endpoint
app.post('/api/player/balance', noAuth, (req, res) => {
    try {
        const { playerId } = req.body;

        // Ensure we have a valid playerId for balance lookup - no fallback to shared 'player'
        if (!playerId) {
            return res.status(400).json({
                success: false,
                error: 'playerId is required for balance lookup',
                message: 'Each user session must provide a unique playerId'
            });
        }

        const actualUserId = playerId;

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

// Update player color endpoint - V2: Handled by room-based WebSocket system
app.post('/api/player/color', noAuth, (req, res) => {
    try {
        const { playerId, color } = req.body;
        const actualPlayerId = playerId || 'player';

        if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid color format'
            });
        }

        // V2: Color management is handled by room system via WebSocket
        // Return success for compatibility but actual updates happen via room WebSocket
        const result = {
            success: true,
            assignedColor: color, // V2: Accept provided color, room validates
            playerId: actualPlayerId,
            message: 'V2: Color managed by room system'
        };

        console.log(`🎨 V2: Player ${actualPlayerId} color update request for ${color} (handled by room system)`);

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




// Get player info endpoint
app.get('/api/player/:playerId', noAuth, (req, res) => {
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

// Get all players endpoint - V2: Room-based player data
app.get('/api/players', noAuth, (req, res) => {
    try {
        // V2: Players are managed by individual rooms
        const allPlayers = {};

        // Aggregate players from all rooms
        roomManager.rooms.forEach((room, roomId) => {
            room.players.forEach((playerData, playerId) => {
                allPlayers[playerId] = {
                    id: playerId,
                    name: playerData.name || 'Player',
                    color: playerData.color || '#10AC84',
                    cash: playerData.balance || 6000,
                    actions: 20, // V2: Actions handled by room economic engine
                    votingPoints: playerData.governance?.votingPoints || 0,
                    roomId: roomId,
                    cityName: playerData.cityName // V2: Include server-generated city name
                };
            });
        });

        res.json({
            success: true,
            players: allPlayers
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


// =============================================================================
// ROOM-AWARE ECONOMIC API ENDPOINTS
// Routes economic requests to the correct room's economic engine
// =============================================================================

// WebSocket-only economic system: Read operations removed
// Economic data is now provided via WebSocket broadcasts only
// Only transaction processing remains as HTTP POST for command execution

// LEGACY ENDPOINT REMOVED: Cashflow data now provided via WebSocket-only communication
// All economic data is now synchronized via server-authoritative WebSocket broadcasts

// Process economic transaction (room-aware)
app.post('/api/economics/transaction', async (req, res) => {
    try {
        const playerId = req.body.playerId;
        const room = roomManager.getPlayerRoom(playerId);

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Player not in any room'
            });
        }

        console.log('📥 Room-aware transaction received:', req.body.type, 'for room:', room.id);
        const result = await room.economicEngine.processTransaction(req.body);

        res.json(result);

    } catch (error) {
        console.error('❌ Transaction processing failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: Date.now()
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

// =============================================================================
// CLEAN GOVERNANCE API - Simple and working
// =============================================================================

// Get governance state for a player
app.get('/api/governance/state', (req, res) => {
    const playerId = req.query.playerId;

    if (!playerId) {
        return res.status(400).json({ success: false, error: 'playerId required' });
    }

    try {
        const room = roomManager.findRoomByPlayerId(playerId);

        if (!room) {
            // Player not in room - return default state
            return res.json({
                success: true,
                votingPoints: 0,
                allocations: {}
            });
        }

        // Get player data from economic engine
        const playerData = room.economicEngine.getPlayerData(playerId);

        if (!playerData) {
            // Player exists in room but no data - return default
            return res.json({
                success: true,
                votingPoints: 0,
                allocations: {}
            });
        }

        // Get actual governance data
        const governance = playerData.governance || { votingPoints: 0, votes: {} };

        res.json({
            success: true,
            votingPoints: governance.votingPoints || 0,
            allocations: governance.votes || {}
        });

    } catch (error) {
        console.error('❌ Governance state error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Submit governance vote
app.post('/api/governance/vote', async (req, res) => {
    const { playerId, category, amount } = req.body;

    if (!playerId || !category || amount === undefined) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    try {
        const room = roomManager.findRoomByPlayerId(playerId);

        if (!room) {
            return res.status(404).json({ success: false, error: 'Player not found' });
        }

        // Submit vote through economic engine
        const result = await room.economicEngine.processTransaction({
            type: 'budget_vote',
            playerId: playerId,
            category: category,
            amount: amount,
            timestamp: Date.now()
        });

        if (result.success) {
            res.json({ success: true, result: result });
        } else {
            res.status(400).json({ success: false, error: result.error || 'Vote failed' });
        }

    } catch (error) {
        console.error('❌ Governance vote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server with WebSocket support
server.listen(PORT, () => {
    console.log(`🎮 Multiplayer Game Server running on port ${PORT}`);
    console.log(`📍 Game available at: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket available at: ws://localhost:${PORT}/ws`);
    console.log(`🏠 Mode: Real-time multiplayer`);
});