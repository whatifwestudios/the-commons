/**
 * The Commons Game Server
 * Multi-user server with authentication and isolated user experiences
 */

// Add global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
    console.error('Stack:', err.stack);
    // Don't exit in production, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    // Don't exit in production, just log the error
});

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

    // Connection health tracking
    ws.connectionTime = Date.now();
    ws.lastPing = Date.now();
    ws.lastPong = Date.now();
    ws.isAlive = true;

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

    ws.on('close', (code, reason) => {
        const reasonText = reason ? reason.toString() : 'No reason provided';
        const duration = Date.now() - ws.connectionTime;
        const isGraceful = ws.gracefulDisconnect || code === 1000 || code === 1001;

        if (isGraceful) {
            console.log(`🚪 Player ${playerId} disconnected gracefully - Code: ${code}, Duration: ${duration}ms`);
        } else {
            console.log(`❌ Player ${playerId} UNEXPECTED disconnect - Code: ${code}, Reason: ${reasonText}`);
            console.log(`🕐 Connection duration: ${duration}ms`);

            // Log common close codes for debugging
            const closeReasons = {
                1000: 'Normal closure',
                1001: 'Going away (page refresh/navigation)',
                1002: 'Protocol error',
                1003: 'Unsupported data type',
                1005: 'No status code (abnormal)',
                1006: 'Abnormal closure (no close frame)',
                1007: 'Invalid frame payload data',
                1008: 'Policy violation',
                1009: 'Message too big',
                1010: 'Missing extension',
                1011: 'Internal server error',
                1012: 'Service restart',
                1013: 'Try again later',
                1014: 'Bad gateway',
                1015: 'TLS handshake failure'
            };

            if (closeReasons[code]) {
                console.log(`🔍 Close code meaning: ${closeReasons[code]}`);
            }

            // For unexpected disconnections, log more details
            if (code === 1006) {
                console.log(`🚨 Code 1006 detected - possible causes:`);
                console.log(`   - Browser tab backgrounded/killed`);
                console.log(`   - Network connection lost`);
                console.log(`   - Server overload`);
                console.log(`   - Client-side JavaScript error`);
            }
        }

        connectedClients.delete(ws);
        roomManager.handleDisconnect(playerId);
    });

    ws.on('error', (error) => {
        console.error(`🔌 WebSocket error for ${playerId}:`, error);
        console.error(`🔍 Error code: ${error.code}, Message: ${error.message}`);
        console.error(`🔍 Error stack:`, error.stack);
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

        case 'QUIT_GAME':
            // Permanent quit - player cannot rejoin this game
            if (!room) {
                console.error('Player not in a room for QUIT_GAME:', playerId);
                return;
            }
            console.log(`🚪 Player ${playerId} permanently quit the game`);

            // Remove player permanently from room
            roomManager.quitGame(playerId);

            // Send confirmation to player
            ws.send(JSON.stringify({
                type: 'QUIT_CONFIRMED',
                message: 'You have left the game'
            }));

            // Close the websocket
            ws.close();
            break;

        case 'REQUEST_LEADERBOARD':
            // Send current Commonwealth scores to player
            if (!room) {
                console.error('Player not in a room for REQUEST_LEADERBOARD:', playerId);
                return;
            }

            const scores = room.economicEngine.calculateCommonwealthScores();
            const currentPlayerScore = scores.find(s => s.playerId === playerId);

            ws.send(JSON.stringify({
                type: 'LEADERBOARD_UPDATE',
                scores: scores.map(s => ({
                    playerId: s.playerId,
                    playerName: room.players.get(s.playerId)?.name || 'Player',
                    wealth: s.wealth,
                    lvtRatio: s.lvtRatio,
                    score: s.score,
                    rank: s.rank
                })),
                currentPlayer: currentPlayerScore
            }));
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

                // Trigger game loop for governance actions
                if (result && result.success) {
                    global.triggerGameLoop(`governance_${data.voteType}`);
                }

                // 🚫 BANDAID ELIMINATED! Economic engine auto-broadcasts on success
                // Pure flow: action → calculated impact → server broadcast → player reaction
                // No manual broadcast needed!
            }
            break;

        case 'ECONOMIC_TRANSACTION':
            // Handle economic transactions via WebSocket
            if (!room) {
                ws.send(JSON.stringify({
                    type: 'TRANSACTION_RESPONSE',
                    transactionId: data.transaction?.id,
                    result: {
                        success: false,
                        error: 'Player not in any room'
                    }
                }));
                return;
            }

            try {
                console.log('📥 Room-aware transaction received via WebSocket:', data.transaction.type, 'for room:', room.id);
                const result = await room.economicEngine.processTransaction(data.transaction);

                // Trigger game loop for economic actions
                if (result.success) {
                    global.triggerGameLoop(`websocket_${data.transaction.type}`);
                }

                // Send response back via WebSocket
                ws.send(JSON.stringify({
                    type: 'TRANSACTION_RESPONSE',
                    transactionId: data.transaction.id,
                    result: result
                }));

            } catch (error) {
                console.error('❌ Transaction processing failed:', error);
                ws.send(JSON.stringify({
                    type: 'TRANSACTION_RESPONSE',
                    transactionId: data.transaction?.id,
                    result: {
                        success: false,
                        error: error.message,
                        timestamp: Date.now()
                    }
                }));
            }
            break;

        case 'PING':
            // Respond to client heartbeat ping
            ws.lastPing = Date.now();
            ws.send(JSON.stringify({
                type: 'PONG',
                connectionId: data.connectionId,
                timestamp: Date.now(),
                serverTime: Date.now()
            }));
            break;

        case 'PONG':
            // Handle client pong response (if server initiates ping)
            ws.lastPong = Date.now();
            break;

        case 'REQUEST_GAME_STATE_SYNC':
            // Handle request for full game state synchronization
            console.log(`🔄 Game state sync requested by ${data.playerId}`);
            if (room && room.economicEngine) {
                // Force a complete state broadcast to this client
                room.economicEngine.broadcastGameState('SYNC_REQUESTED', {
                    playerId: data.playerId,
                    connectionId: data.connectionId
                });
            }
            break;

        case 'GRACEFUL_DISCONNECT':
            // Handle graceful disconnection (page unload, etc.)
            console.log(`🚪 Graceful disconnect from ${data.playerId}: ${data.reason}`);
            // Mark this as an expected disconnection - don't log as error
            ws.gracefulDisconnect = true;
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

// Smart game loop system - runs on demand with throttling
let lastGameLoopRun = 0;
const GAME_LOOP_MIN_INTERVAL = 250; // 0.25 seconds minimum
const GAME_DAY_MS = 3600000 / 365; // ~9.86 seconds per game day

function runGameLoop(triggeredBy = 'timer') {
    const now = Date.now();

    // Throttle: don't run more often than every 0.25s
    if (now - lastGameLoopRun < GAME_LOOP_MIN_INTERVAL) {
        return;
    }

    lastGameLoopRun = now;

    try {
        console.log(`🎮 Game loop triggered by: ${triggeredBy}`);

        // Update each room's game timer
        roomManager.rooms.forEach(room => {
            try {
                if (room.state === 'IN_PROGRESS') {
                    room.economicEngine.updateGameTime();

                    // Check victory conditions (less frequently)
                    if (now % 10000 < GAME_LOOP_MIN_INTERVAL) {
                        room.checkVictoryConditions();
                    }
                }
            } catch (roomError) {
                console.error(`❌ Room ${room.id} processing error:`, roomError);
                // Continue with other rooms instead of crashing
            }
        });
    } catch (globalError) {
        console.error('❌ Game loop error:', globalError);
        // Don't exit, keep the server running
    }
}

// Natural progression: run every game day (~9.86 seconds)
setInterval(() => runGameLoop('daily_progression'), GAME_DAY_MS);

// Make runGameLoop available globally for economic action triggers
global.triggerGameLoop = (reason) => runGameLoop(reason);
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

// ❌ REMOVED: V2 Transaction API - Now handled via WebSocket only
// All economic transactions should use WebSocket 'ECONOMIC_TRANSACTION' message type

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

// ❌ REMOVED: Player state API endpoints - Now handled via WebSocket only
// Player balance, color, and other state is provided in game state broadcasts
// Player actions should use WebSocket message types

// ❌ REMOVED: Get all players endpoint - Now handled via WebSocket only
// Player data is provided in game state broadcasts to each room


// =============================================================================
// ROOM-AWARE ECONOMIC API ENDPOINTS
// Routes economic requests to the correct room's economic engine
// =============================================================================

// WebSocket-only economic system: Read operations removed
// Economic data is now provided via WebSocket broadcasts only
// Only transaction processing remains as HTTP POST for command execution

// LEGACY ENDPOINT REMOVED: Cashflow data now provided via WebSocket-only communication
// All economic data is now synchronized via server-authoritative WebSocket broadcasts

// ❌ REMOVED: Economics transaction API - Now handled via WebSocket only
// All economic transactions should use WebSocket 'ECONOMIC_TRANSACTION' message type

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

// ❌ REMOVED: Governance API endpoints - Now handled via WebSocket only
// Governance state is provided in the regular game state broadcasts
// Governance votes should use WebSocket 'GOVERNANCE_VOTE' message type


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

    // Start connection health monitoring
    startConnectionHealthMonitoring();
});

// =============================================================================
// 🚀 CONNECTION HEALTH MONITORING SYSTEM
// =============================================================================

/**
 * Monitor WebSocket connections and clean up stale ones
 */
function startConnectionHealthMonitoring() {
    const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    const STALE_CONNECTION_TIMEOUT = 60000; // 60 seconds

    console.log('💓 Starting connection health monitoring');

    setInterval(() => {
        const now = Date.now();
        let healthyConnections = 0;
        let staleConnections = 0;

        connectedClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                // Check if connection is stale (no ping in timeout period)
                const timeSinceLastPing = now - (ws.lastPing || ws.connectionTime);

                if (timeSinceLastPing > STALE_CONNECTION_TIMEOUT) {
                    console.log(`🔥 Terminating stale connection for player ${ws.playerId} (${timeSinceLastPing}ms since last ping)`);
                    ws.terminate();
                    staleConnections++;
                } else {
                    healthyConnections++;
                }
            } else {
                // Remove dead connections
                connectedClients.delete(ws);
                staleConnections++;
            }
        });

        if (healthyConnections > 0 || staleConnections > 0) {
            console.log(`💓 Connection health: ${healthyConnections} healthy, ${staleConnections} cleaned up`);
        }

    }, HEALTH_CHECK_INTERVAL);
}

/**
 * Get connection statistics
 */
function getConnectionStats() {
    const now = Date.now();
    const stats = {
        total: connectedClients.size,
        healthy: 0,
        stale: 0,
        connections: []
    };

    connectedClients.forEach(ws => {
        const connectionAge = now - ws.connectionTime;
        const timeSinceLastPing = now - (ws.lastPing || ws.connectionTime);

        const connInfo = {
            playerId: ws.playerId,
            state: ws.readyState,
            age: connectionAge,
            lastPing: timeSinceLastPing,
            room: roomManager.getPlayerRoom(ws.playerId)?.id || 'none'
        };

        if (ws.readyState === WebSocket.OPEN && timeSinceLastPing < 60000) {
            stats.healthy++;
        } else {
            stats.stale++;
        }

        stats.connections.push(connInfo);
    });

    return stats;
}