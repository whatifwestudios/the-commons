/**
 * The Commons Game Server
 * Multi-user server with authentication and isolated user experiences
 */

// Add global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
    logger.error('❌ UNCAUGHT EXCEPTION:', err);
    logger.error('Stack:', err.stack);
    // Don't exit in production, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
    // Don't exit in production, just log the error
});

// ====================================================================
// DEVELOPMENT ENVIRONMENT CONFIGURATION
// ====================================================================

const NODE_ENV = process.env.NODE_ENV || 'production';
const DEBUG = process.env.DEBUG === 'true' || NODE_ENV === 'development';
const GAME_MODE = process.env.GAME_MODE || 'multiplayer'; // 'solo' or 'multiplayer'
const PORT = process.env.PORT || 3000;

const Logger = require('./logger');
const logger = new Logger('server');

// Development mode indicators
if (NODE_ENV === 'development') {
    logger.info('🔧 DEVELOPMENT MODE ACTIVE');
    logger.info(`🎮 Game Mode: ${GAME_MODE.toUpperCase()}`);
    logger.info(`🚪 Port: ${PORT}`);
}

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

// Simple pass-through middleware (replaces noAuth)
const noAuth = (req, res, next) => {
    next();
};

// Initialize room manager with v2 economic engine
const roomManager = new RoomManager();

// Multiplayer server with room-based game management


// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for building data


app.use(express.static('.'));







// Multiplayer server - all economic engines are room-specific

// Create HTTP server for WebSocket upgrade
const server = http.createServer(app);

// WebSocket server for real-time multiplayer communication
const wss = new WebSocket.Server({ server, path: '/ws' });

// WebSocket connection management
const connectedClients = new Set();

wss.on('connection', (ws, req) => {
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


    ws.on('pong', () => {
        ws.lastPong = Date.now();
        ws.isAlive = true; // Mark connection as alive when pong received
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(ws, data);
        } catch (error) {
            logger.error('Invalid WebSocket message:', error);
        }
    });

    ws.on('close', (code, reason) => {
        const reasonText = reason ? reason.toString() : 'No reason provided';
        const duration = Date.now() - ws.connectionTime;
        const isGraceful = ws.gracefulDisconnect || code === 1000 || code === 1001;

        if (isGraceful) {
        } else {

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
            }

            // For unexpected disconnections, log more details
            if (code === 1006) {
            }
        }

        connectedClients.delete(ws);
        roomManager.handleDisconnect(playerId);
    });

    ws.on('error', (error) => {
        logger.error(`🔌 WebSocket error for ${playerId}:`, error);
        logger.error(`🔍 Error code: ${error.code}, Message: ${error.message}`);
        logger.error(`🔍 Error stack:`, error.stack);
        connectedClients.delete(ws);
    });
});

// Send standardized error to WebSocket client
function sendError(ws, message, type = 'ERROR') {
    ws.send(JSON.stringify({
        type: type,
        error: message,
        timestamp: Date.now()
    }));
}

// Handle WebSocket messages
async function handleWebSocketMessage(ws, data) {
    const playerId = ws.playerId;
    const room = roomManager.getPlayerRoom(playerId);

    switch (data.type) {
        case 'IDENTIFY_PLAYER':
            // 🔧 FIX: Allow client to identify itself with existing player ID and metadata
            if (data.playerId) {
        //             name: data.playerName,
        //             color: data.playerColor
        //         });

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

            }
            break;

        case 'READY':
            if (!room) {
                sendError(ws, 'Player not in a room');
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
                sendError(ws, 'Player not in a room');
                return;
            }

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
                logger.error('Player not in a room for REQUEST_LEADERBOARD:', playerId);
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
                sendError(ws, 'Player not in a room');
                return;
            }

            const chatMessage = {
                type: 'CHAT_MESSAGE',
                playerId: playerId,
                playerName: data.playerName || 'Player',
                message: data.message,
                color: data.color,
                timestamp: Date.now()
            };

            // Store message in room chat history
            room.addChatMessage(chatMessage);

            // Broadcast to all players
            room.broadcast(chatMessage);
            break;

        case 'START_GAME':
            if (!room) {
                sendError(ws, 'Player not in a room');
                return;
            }

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
                sendError(ws, 'Player not in a room');
                return;
            }
            // Send fresh room state to requesting client
            const roomState = room.getFullState();
            ws.send(JSON.stringify({
                type: 'ROOM_STATE_SYNC',
                roomState: roomState,
                timestamp: Date.now()
            }));
            break;

        case 'chat_message':
            // Handle chat messages and broadcast to other players in the room
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

                // No global trigger needed - room handles its own updates

                // Economic engine handles broadcasting automatically
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
                // Add playerId to transaction before processing
                data.transaction.playerId = playerId;
                const result = await room.economicEngine.processTransaction(data.transaction);

                // No global trigger needed - room handles its own updates

                // Send response back via WebSocket
                ws.send(JSON.stringify({
                    type: 'TRANSACTION_RESPONSE',
                    transactionId: data.transaction.id,
                    result: result
                }));

            } catch (error) {
                logger.error('❌ Transaction processing failed:', error);
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
            ws.lastPong = Date.now(); // Client is alive if it's sending PINGs
            ws.isAlive = true;
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
            ws.isAlive = true; // Mark connection as alive when pong received
            break;

        case 'REQUEST_GAME_STATE_SYNC':
            // Handle request for full game state synchronization
            if (room && room.economicEngine) {
                // Force a complete state broadcast to this client
                room.economicEngine.broadcastGameState('SYNC_REQUESTED', {
                    playerId: data.playerId,
                    connectionId: data.connectionId
                });
            }
            break;

        case 'REQUEST_CHAT_HISTORY':
            // Send chat history to client when transitioning to in-game
            if (room) {
                const chatHistory = room.getChatHistory();
                ws.send(JSON.stringify({
                    type: 'CHAT_HISTORY',
                    messages: chatHistory,
                    timestamp: Date.now()
                }));
            }
            break;

        case 'GRACEFUL_DISCONNECT':
            // Handle graceful disconnection (page unload, etc.)
            // Mark this as an expected disconnection - don't log as error
            ws.gracefulDisconnect = true;
            break;

        default:
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
    }
}

// Clean multiplayer - room broadcast functions are set per room in RoomManager

// REMOVED: Global game loop replaced by per-room isolated clocks
// Each room now manages its own timer independently

// ====================================================================
// 🍺 V2 MULTIPLAYER API - Clean room-based system
// ====================================================================

// V2 Beer Hall API - Table finder with preferences
app.post('/api/beer-hall/find-table', (req, res) => {
    try {
        const { playerId, playerName, playerColor, preferences } = req.body;

        logger.debug(`🔍 ROOM ASSIGNMENT DEBUG: Player ${playerId} requesting table with preferences:`, preferences);

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
        return res.status(403).json({
            success: false,
            error: 'File uploads are disabled in production for security reasons',
            message: 'This feature is only available in development mode'
        });
    }

    try {
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




// =============================================================================
// ROOM-AWARE ECONOMIC API ENDPOINTS
// Routes economic requests to the correct room's economic engine
// =============================================================================

// Building repair cost endpoint
app.post('/api/building-repair-cost', (req, res) => {
    try {
        const { roomId, row, col } = req.body;

        if (!roomId || row === undefined || col === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: roomId, row, col'
            });
        }

        const room = roomManager.getRoom(roomId);
        if (!room || !room.economicEngine) {
            return res.status(404).json({
                success: false,
                error: 'Room not found or not initialized'
            });
        }

        const repairCost = room.economicEngine.getBuildingRepairCost(row, col);

        res.json({
            success: true,
            repairCost: repairCost
        });
    } catch (error) {
        logger.error('❌ Building repair cost API error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Building value endpoint
app.post('/api/building-value', (req, res) => {
    try {
        const { roomId, row, col } = req.body;

        if (!roomId || row === undefined || col === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: roomId, row, col'
            });
        }

        const room = roomManager.getRoom(roomId);
        if (!room || !room.economicEngine) {
            return res.status(404).json({
                success: false,
                error: 'Room not found or not initialized'
            });
        }

        const value = room.economicEngine.getBuildingValue(row, col);

        res.json({
            success: true,
            value: value
        });
    } catch (error) {
        logger.error('❌ Building value API error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// City population endpoint
app.post('/api/city-population', (req, res) => {
    try {
        const { roomId } = req.body;

        if (!roomId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: roomId'
            });
        }

        const room = roomManager.getRoom(roomId);
        if (!room || !room.economicEngine) {
            return res.status(404).json({
                success: false,
                error: 'Room not found or not initialized'
            });
        }

        const population = room.economicEngine.getCityPopulation();

        res.json({
            success: true,
            population: population
        });
    } catch (error) {
        logger.error('❌ City population API error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});



// =============================================================================

// Leaderboard endpoint
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = soloGameData.leaderboard.slice(0, limit);

    res.json({
        success: true,
        leaderboard: leaderboard,
        timestamp: new Date().toISOString()
    });
});

// Development status endpoint
app.get('/api/dev-status', (req, res) => {
    res.json({
        isDevelopment: process.env.NODE_ENV === 'development',
        debug: process.env.DEBUG === 'true',
        gameMode: process.env.GAME_MODE || 'normal',
        port: process.env.PORT || 3000
    });
});



// Serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server with WebSocket support
server.listen(PORT, () => {

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
    const HEALTH_CHECK_INTERVAL = 60000; // 60 seconds (longer interval, let client handle heartbeat)
    const STALE_CONNECTION_TIMEOUT = 120000; // 2 minutes


    setInterval(() => {
        const now = Date.now();
        let healthyConnections = 0;
        let staleConnections = 0;

        connectedClients.forEach(ws => {
            // Check if connection is stale based on last activity
            const timeSinceLastActivity = now - (ws.lastPong || ws.connectionTime);

            if (timeSinceLastActivity > STALE_CONNECTION_TIMEOUT) {
                staleConnections++;
                connectedClients.delete(ws);
                if (ws.playerId) {
                    roomManager.handleDisconnect(ws.playerId);
                }
                ws.terminate();
            } else {
                healthyConnections++;
            }
        });

        if (staleConnections > 0) {
            logger.debug(`💓 Connection cleanup: ${staleConnections} stale connections removed, ${healthyConnections} active`);
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