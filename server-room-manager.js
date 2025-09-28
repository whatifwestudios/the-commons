/**
 * Game Room Manager - Board Game Table Management
 *
 * Manages isolated game rooms where players gather to play together.
 * Each room is like a separate board game table with its own state.
 */

const ServerEconomicEngine = require('./server-economic-engine-v2');
const GameState = require('./game-state');
const GovernanceSystem = require('./governance-system');

class GameRoom {
    constructor(id, options = {}) {
        this.id = id;
        this.createdAt = Date.now();
        this.state = 'WAITING'; // WAITING -> STARTING -> IN_PROGRESS -> COMPLETED

        // Room settings
        this.maxPlayers = options.maxPlayers || 6;
        this.minPlayers = options.minPlayers || 1;
        this.roomName = options.roomName || `Room ${id}`;
        this.isPublic = options.isPublic !== false;

        // Players in this room
        this.players = new Map(); // playerId -> playerData
        this.host = null; // First player becomes host

        // Each room has its own economic engine and game state
        this.economicEngine = new ServerEconomicEngine();
        this.gameState = new GameState();

        // CRITICAL FIX: Create and connect governance system for treasury/LVT management
        this.governanceSystem = new GovernanceSystem(null); // No client game object on server
        this.economicEngine.setGovernanceSystem(this.governanceSystem);
        console.log(`🏛️ Room ${this.id}: Governance system connected to economic engine`);

        // CRITICAL: Connect economic engine broadcast to room broadcast
        // This enables building completions to reach the right players
        this.economicEngine.broadcastFunction = (message) => {
            this.broadcast(message);
            console.log(`📡 Room ${this.id}: Economic engine broadcasted to ${this.connections.size} players`);
        };

        // WebSocket connections for this room
        this.connections = new Map(); // playerId -> ws

        // Beer hall ready-check state
        this.readyCheckTriggered = false;

        console.log(`🎲 Created game room: ${this.id} - "${this.roomName}"`);
    }

    /**
     * Add player to room
     */
    addPlayer(playerId, playerData, ws) {
        if (this.players.size >= this.maxPlayers) {
            throw new Error('Room is full');
        }

        // Allow joining in progress for multiplayer testing
        // if (this.state !== 'WAITING' && !this.players.has(playerId)) {
        //     throw new Error('Game already in progress');
        // }

        // Set host if first player
        if (this.players.size === 0) {
            this.host = playerId;
        }

        // Add player with default data
        this.players.set(playerId, {
            id: playerId,
            name: playerData.name || `Player ${this.players.size + 1}`,
            color: playerData.color || this.getNextColor(),
            ready: false,
            connected: true,
            balance: 6000, // Starting balance
            ...playerData
        });

        // Store WebSocket connection
        if (ws) {
            this.connections.set(playerId, ws);
        }

        console.log(`👤 Player ${playerId} joined room ${this.id}`);

        // Check if we should auto-start
        this.checkAutoStart();

        return this.players.get(playerId);
    }

    /**
     * Remove player from room
     */
    removePlayer(playerId) {
        this.players.delete(playerId);
        this.connections.delete(playerId);

        // Assign new host if needed
        if (this.host === playerId && this.players.size > 0) {
            this.host = this.players.keys().next().value;
        }

        console.log(`👤 Player ${playerId} left room ${this.id}`);

        // Delete room if empty
        if (this.players.size === 0) {
            return true; // Signal to delete room
        }

        return false;
    }

    /**
     * Mark player as ready
     */
    setPlayerReady(playerId, ready = true) {
        const player = this.players.get(playerId);
        if (player) {
            player.ready = ready;
            this.checkAutoStart();
        }
    }

    /**
     * Check if room should start or trigger ready-check
     */
    checkAutoStart() {
        if (this.state !== 'WAITING') return;

        const allReady = Array.from(this.players.values()).every(p => p.ready);
        const hasMinPlayers = this.players.size >= this.minPlayers;
        const isSoloTable = this.maxPlayers === 1; // Solo tables have max 1 player

        if (hasMinPlayers && !this.readyCheckTriggered) {
            if (isSoloTable) {
                // Solo tables: Auto-start immediately without ready check modal
                console.log(`🎮 Solo table ${this.id} auto-starting for single player`);
                this.startGame();
                return;
            } else {
                // Multiplayer tables: Trigger ready-check modal when minimum players reached
                this.readyCheckTriggered = true;
                this.broadcast({
                    type: 'READY_CHECK_STARTED',
                    message: `Table is ready! ${this.players.size} players at the table.`,
                    tableInfo: {
                        name: this.roomName,
                        players: Array.from(this.players.values()),
                        minPlayers: this.minPlayers,
                        maxPlayers: this.maxPlayers
                    }
                });
                console.log(`🍻 Ready check started for table ${this.id} with ${this.players.size} players`);
            }
        }

        if (allReady && hasMinPlayers && !isSoloTable) {
            this.startGame();
        }
    }

    /**
     * Start the game
     */
    startGame() {
        if (this.state !== 'WAITING') return;

        this.state = 'STARTING';

        // 3 second countdown
        setTimeout(() => {
            this.state = 'IN_PROGRESS';

            // 🍺 BEER HALL FRESH START: Reset everything for new game
            this.economicEngine.resetGameState();

            // Set fresh starting conditions: September 2nd, $6k per player
            this.economicEngine.gameState.gameTime = 1.0; // Day 1 (Sept 2)

            // Initialize player balances if not exists
            if (!this.economicEngine.gameState.playerBalances) {
                this.economicEngine.gameState.playerBalances = new Map();
            }

            // Give each player $6,000 starting money
            this.players.forEach((player, playerId) => {
                this.economicEngine.gameState.playerBalances.set(playerId, 6000);
                console.log(`💰 Player ${playerId} starts with $6,000`);
            });

            // Start game timer from Day 1
            this.economicEngine.updateGameTime();

            console.log(`🍺 Beer Hall table ${this.id} started! ${this.players.size} players, Day 1, fresh board`);

            // Lock in pre-game governance settings and reset for gameplay
            if (this.economicEngine.governanceSystem) {
                this.economicEngine.governanceSystem.startGameplay();
            }

            // Broadcast complete initial game state (includes player balances)
            this.economicEngine.broadcastGameState('GAME_STARTED', {
                roomId: this.id,
                players: Array.from(this.players.values())
            });
        }, 3000);

        // Broadcast countdown
        this.broadcast({
            type: 'GAME_STARTING',
            countdown: 3,
            roomId: this.id
        });
    }

    /**
     * Broadcast message to all players in room
     */
    broadcast(message, excludePlayerId = null) {
        const messageStr = JSON.stringify(message);

        this.connections.forEach((ws, playerId) => {
            if (playerId !== excludePlayerId && ws.readyState === 1) {
                ws.send(messageStr);
            }
        });
    }

    /**
     * Get next available color
     */
    getNextColor() {
        const colors = [
            '#FF6B6B', // Red
            '#4ECDC4', // Teal
            '#45B7D1', // Blue
            '#96CEB4', // Green
            '#FFEAA7', // Yellow
            '#DDA0DD', // Plum
        ];

        const usedColors = new Set(
            Array.from(this.players.values()).map(p => p.color)
        );

        return colors.find(c => !usedColors.has(c)) || colors[0];
    }

    /**
     * Get room info for lobby display
     */
    getInfo() {
        return {
            id: this.id,
            name: this.roomName,
            state: this.state,
            players: this.players.size,
            maxPlayers: this.maxPlayers,
            host: this.host,
            isPublic: this.isPublic,
            createdAt: this.createdAt
        };
    }

    /**
     * Get full room state for new player sync
     */
    getFullState() {
        // Get all buildings from economic engine
        const buildings = [];
        this.economicEngine.gameState.buildings.forEach((building, locationKey) => {
            buildings.push({
                ...building,
                locationKey
            });
        });

        return {
            roomId: this.id,
            roomName: this.roomName,
            state: this.state,
            players: Array.from(this.players.values()),
            buildings: buildings,
            gameTime: this.economicEngine.gameState.gameTime,
            jeefhh: this.economicEngine.gameState.jeefhh,
            carens: this.economicEngine.gameState.carens
        };
    }
}

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> GameRoom
        this.playerRooms = new Map(); // playerId -> roomId
        this.nextRoomNumber = 1;

        console.log('🎯 Room Manager initialized');
    }

    /**
     * Create a new room
     */
    createRoom(options = {}) {
        const roomId = options.roomId || `room-${this.nextRoomNumber++}`;
        const room = new GameRoom(roomId, options);

        this.rooms.set(roomId, room);

        return room;
    }

    /**
     * Join a room
     */
    joinRoom(roomId, playerId, playerData, ws) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Leave current room if in one
        this.leaveCurrentRoom(playerId);

        // Add to new room
        const player = room.addPlayer(playerId, playerData, ws);
        this.playerRooms.set(playerId, roomId);

        // Broadcast player joined
        room.broadcast({
            type: 'PLAYER_JOINED',
            player: player,
            players: Array.from(room.players.values())
        }, playerId);

        return room;
    }

    /**
     * Leave current room
     */
    leaveCurrentRoom(playerId) {
        const currentRoomId = this.playerRooms.get(playerId);
        if (currentRoomId) {
            const room = this.rooms.get(currentRoomId);
            if (room) {
                const shouldDelete = room.removePlayer(playerId);

                // Broadcast player left
                room.broadcast({
                    type: 'PLAYER_LEFT',
                    playerId: playerId,
                    players: Array.from(room.players.values())
                });

                // Delete room if empty
                if (shouldDelete) {
                    this.rooms.delete(currentRoomId);
                    console.log(`🗑️ Deleted empty room ${currentRoomId}`);
                }
            }

            this.playerRooms.delete(playerId);
        }
    }

    /**
     * Quick join - find or create a room
     */
    quickJoin(playerId, playerData, ws) {
        // Find a public room that's waiting for players
        for (const room of this.rooms.values()) {
            if (room.isPublic &&
                room.state === 'WAITING' &&
                room.players.size < room.maxPlayers) {
                return this.joinRoom(room.id, playerId, playerData, ws);
            }
        }

        // No suitable room found, create one
        const newRoom = this.createRoom({
            roomName: `Game ${this.nextRoomNumber}`,
            isPublic: true
        });

        return this.joinRoom(newRoom.id, playerId, playerData, ws);
    }

    /**
     * Beer Hall Table Finder - Find or create table based on player preferences
     */
    findTableWithPreferences(playerId, playerData, ws, preferences = {}) {
        const minPlayers = preferences.minPlayers || 3;
        const maxPlayers = Math.min(preferences.maxPlayers || 12, 12); // Cap at 12
        const isSoloMode = minPlayers === 1 && maxPlayers === 1;

        if (isSoloMode) {
            console.log(`🎮 Player ${playerId} requesting solo table (1 player only)`);
        } else {
            console.log(`🍺 Player ${playerId} looking for multiplayer table: ${minPlayers}-${maxPlayers} players`);
        }

        // Leave current table if in one
        this.leaveCurrentRoom(playerId);

        // Solo mode: Always create a new isolated table (no sharing)
        if (isSoloMode) {
            console.log(`🎮 Creating new solo table for ${playerId}`);
        } else {
            // Multiplayer: Try to find existing suitable table first
            for (const room of this.rooms.values()) {
                if (room.isPublic &&
                    room.state === 'WAITING' &&
                    room.id.startsWith('table-') && // V2: Only beer hall tables
                    room.maxPlayers >= minPlayers &&
                    room.maxPlayers <= maxPlayers &&
                    room.players.size < room.maxPlayers) {

                    console.log(`🎯 Found suitable beer hall table: ${room.id} (${room.players.size}/${room.maxPlayers})`);
                    return this.joinRoom(room.id, playerId, playerData, ws);
                }
            }
        }

        // Create new table optimized for preferences
        let tableSize, roomName;
        if (isSoloMode) {
            tableSize = 1;
            roomName = `Solo Table ${this.nextRoomNumber}`;
            console.log(`🆕 Creating isolated solo table for ${playerId}: solo-${this.nextRoomNumber}`);
        } else {
            tableSize = Math.max(minPlayers, Math.min(maxPlayers, 6)); // Default to 6 if within range
            roomName = `Table ${this.nextRoomNumber}`;
            console.log(`🆕 Creating multiplayer table for ${playerId}: table-${this.nextRoomNumber} (${minPlayers}-${tableSize} players)`);
        }

        const newRoom = this.createRoom({
            roomId: isSoloMode ? `solo-${this.nextRoomNumber}` : `table-${this.nextRoomNumber}`,
            roomName: roomName,
            minPlayers: minPlayers,
            maxPlayers: tableSize,
            isPublic: !isSoloMode // Solo tables are private
        });

        return this.joinRoom(newRoom.id, playerId, playerData, ws);
    }

    /**
     * Get player's current room
     */
    getPlayerRoom(playerId) {
        const roomId = this.playerRooms.get(playerId);
        return roomId ? this.rooms.get(roomId) : null;
    }

    /**
     * Get list of public rooms for lobby
     */
    getPublicRooms() {
        const publicRooms = [];

        this.rooms.forEach(room => {
            if (room.isPublic) {
                publicRooms.push(room.getInfo());
            }
        });

        return publicRooms;
    }

    /**
     * Handle player disconnect
     */
    handleDisconnect(playerId) {
        const room = this.getPlayerRoom(playerId);
        if (room) {
            const player = room.players.get(playerId);
            if (player) {
                player.connected = false;

                // Broadcast disconnect
                room.broadcast({
                    type: 'PLAYER_DISCONNECTED',
                    playerId: playerId
                });

                // TODO: Add reconnection timeout before removing player
            }
        }
    }

    /**
     * Handle player reconnect
     */
    handleReconnect(playerId, ws) {
        const room = this.getPlayerRoom(playerId);
        if (room) {
            const player = room.players.get(playerId);
            if (player) {
                player.connected = true;
                room.connections.set(playerId, ws);

                // Send full room state to reconnected player
                ws.send(JSON.stringify({
                    type: 'RECONNECTED',
                    state: room.getFullState()
                }));

                // Broadcast reconnect
                room.broadcast({
                    type: 'PLAYER_RECONNECTED',
                    playerId: playerId
                }, playerId);
            }
        }
    }
}

module.exports = RoomManager;