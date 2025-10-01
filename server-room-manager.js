/**
 * Game Room Manager - Board Game Table Management
 *
 * Manages isolated game rooms where players gather to play together.
 * Each room is like a separate board game table with its own state.
 */

const ServerEconomicEngine = require('./server-economic-engine-v2');
// GameState removed - using v2 server-authoritative economic engine
const CityNameGenerator = require('./city-name-generator');

// Simple server-side governance system for treasury operations
class ServerGovernanceSystem {
    constructor() {
        this.governance = {
            taxRate: 0.50, // Default 50% LVT rate (0-1 range)
            treasury: 0
        };
    }

    addFunds(amount, description) {
        this.governance.treasury += amount;
        console.log(`🏛️ Treasury: +$${amount.toFixed(2)} from ${description} (Total: $${this.governance.treasury.toFixed(2)})`);
    }

    getTreasury() {
        return this.governance.treasury;
    }

    setTaxRate(rate) {
        this.governance.taxRate = Math.max(0, Math.min(1, rate)); // Clamp 0-1
        console.log(`🏛️ Tax rate set to ${(this.governance.taxRate * 100).toFixed(1)}%`);
    }

    startGameplay() {
        // Called when game starts - could adjust voting points or settings for gameplay
        console.log(`🏛️ Governance system ready for gameplay`);
    }
}

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

        // Each room has its own v2 economic engine with server-authoritative state
        this.economicEngine = new ServerEconomicEngine();

        // Create and connect governance system for treasury operations
        this.governanceSystem = new ServerGovernanceSystem();
        this.economicEngine.governanceSystem = this.governanceSystem;

        console.log(`🏛️ Governance system connected to economic engine`);

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
    addPlayer(playerId, playerData, ws, roomManager = null) {
        console.log(`🚨 FRESH DEBUG: Room.addPlayer() called for ${playerId} - if you see this, the function is working!`);

        if (this.players.size >= this.maxPlayers) {
            throw new Error('Room is full');
        }

        // Board game model: No late joining allowed once game starts
        // Players can only reconnect if they were already in the game
        if (this.state !== 'WAITING' && !this.players.has(playerId)) {
            throw new Error('Game already in progress - no late joining allowed');
        }

        // Set host if first player
        if (this.players.size === 0) {
            this.host = playerId;
        }

        // Generate unique city name for this player
        const cityName = roomManager?.cityNameGenerator ?
            roomManager.cityNameGenerator.generateCityName() :
            `${playerData.name || 'Player'} City`;
        console.log(`🏙️ FRESH: City name generation for ${playerId}: ${cityName} (roomManager: ${roomManager ? 'YES' : 'NO'})`);

        // Add player with default data including server-generated city name
        this.players.set(playerId, {
            id: playerId,
            name: playerData.name || `Player ${this.players.size + 1}`,
            color: playerData.color || this.getNextColor(),
            cityName: cityName, // Server-generated city name
            ready: false,
            connected: true,
            balance: 6000, // Starting balance
            governance: {
                votingPoints: 4, // Pre-game voting points for LVT setup
                votes: {}
            },
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

            // Initialize economic engine players with room player data (including governance points)
            this.economicEngine.initializePlayersFromRoom(this.players);

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

                // CRITICAL FIX: Sync governance system's updated voting points to economic engine player data
                const gameplayVotingPoints = this.economicEngine.governanceSystem.governance.votingPoints || 2; // Default to 2 if undefined
                console.log(`🏛️ SYNC: Updating all players to ${gameplayVotingPoints} gameplay voting points (governance system had: ${this.economicEngine.governanceSystem.governance.votingPoints})`);

                // Update all players in the economic engine with the correct gameplay voting points
                this.economicEngine.gameState.players.forEach((playerState, playerId) => {
                    if (playerState.governance) {
                        playerState.governance.votingPoints = gameplayVotingPoints;
                        console.log(`🏛️ SYNC: Player ${playerId} updated from pre-game to ${gameplayVotingPoints} gameplay points`);
                    }
                });
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
     * Check victory conditions
     * Called periodically to see if any player has won
     */
    checkVictoryConditions() {
        if (this.state !== 'IN_PROGRESS') return;

        // Check if it's Sept 1st (end of year) - game ends after 365 days
        const currentDay = Math.floor(this.economicEngine.gameState.gameTime);
        if (currentDay >= 365) {
            // Year-end victory - highest Commonwealth Score wins
            const scores = this.economicEngine.calculateCommonwealthScores();
            if (scores.length > 0) {
                const winner = scores[0];
                this.endGame(winner.playerId, `Year-End Victory (CW Score: ${winner.score.toFixed(1)})`);
                return;
            }
        }

        // Early Victory: Commonwealth Score of 25+ with 15% LVT contribution ratio
        const EARLY_VICTORY_SCORE = 25.0;
        const MIN_LVT_RATIO = 0.15;
        const MIN_WEALTH = 50000; // Prevent gaming with low wealth

        const scores = this.economicEngine.calculateCommonwealthScores();

        for (const playerScore of scores) {
            // Check early victory conditions
            if (playerScore.score >= EARLY_VICTORY_SCORE &&
                playerScore.lvtRatio >= MIN_LVT_RATIO &&
                playerScore.wealth >= MIN_WEALTH) {

                this.endGame(
                    playerScore.playerId,
                    `Civic Victory (CW Score: ${playerScore.score.toFixed(1)}, LVT Contribution: ${(playerScore.lvtRatio * 100).toFixed(1)}%)`
                );
                return;
            }
        }

        // Store current scores for broadcasting
        this.lastCommonwealthScores = scores;

        // Broadcast updated scores every 30 seconds during gameplay
        if (Date.now() % 30000 < 5000) {
            this.broadcastCommonwealthScores();
        }
    }

    /**
     * Broadcast Commonwealth Scores to all players
     */
    broadcastCommonwealthScores() {
        if (!this.lastCommonwealthScores) return;

        this.broadcast({
            type: 'COMMONWEALTH_UPDATE',
            scores: this.lastCommonwealthScores.map(s => ({
                playerId: s.playerId,
                playerName: this.players.get(s.playerId)?.name || 'Player',
                wealth: s.wealth,
                lvtRatio: s.lvtRatio,
                score: s.score,
                rank: s.rank
            }))
        });
    }

    /**
     * End the game with a winner
     */
    endGame(winnerId, victoryType) {
        this.state = 'COMPLETED';

        const winnerData = this.players.get(winnerId);
        console.log(`🏆 Game ended! Winner: ${winnerId} - ${victoryType}`);

        // Broadcast victory
        this.broadcast({
            type: 'GAME_OVER',
            winner: {
                playerId: winnerId,
                playerName: winnerData?.name || 'Player',
                color: winnerData?.color
            },
            victoryType: victoryType,
            finalStats: this.getGameStats(),
            timestamp: Date.now()
        });

        // Schedule room cleanup after 30 seconds
        setTimeout(() => {
            // Remove all players
            for (const playerId of this.players.keys()) {
                this.removePlayer(playerId);
            }
            console.log(`🗑️ Game room ${this.id} cleaned up after victory`);
        }, 30000);
    }

    /**
     * Get final game statistics
     */
    getGameStats() {
        const stats = [];
        for (const [playerId, playerData] of this.players) {
            const playerState = this.economicEngine?.players?.get(playerId);
            stats.push({
                playerId: playerId,
                playerName: playerData.name,
                population: playerState?.stats?.population || 0,
                balance: playerState?.balance || 0,
                buildings: playerState?.buildings?.length || 0
            });
        }
        return stats.sort((a, b) => b.population - a.population);
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
        this.cityNameGenerator = new CityNameGenerator();

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
        console.log(`🚀 DEBUG: joinRoom called - roomId: ${roomId}, playerId: ${playerId}, playerData:`, playerData);

        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Leave current room if in one
        this.leaveCurrentRoom(playerId);

        console.log(`🚀 DEBUG: About to call room.addPlayer with roomManager: ${this ? 'YES' : 'NO'}`);

        // Add to new room
        const player = room.addPlayer(playerId, playerData, ws, this);
        this.playerRooms.set(playerId, roomId);

        console.log(`🚀 DEBUG: room.addPlayer returned player:`, player);

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
        console.log(`🚀 DEBUG: findTableWithPreferences called - playerId: ${playerId}, playerData:`, playerData, 'preferences:', preferences);

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
                player.disconnectedAt = Date.now();

                // Broadcast disconnect
                room.broadcast({
                    type: 'PLAYER_DISCONNECTED',
                    playerId: playerId
                });

                // Set up 5-minute timeout for auto-removal
                // Clear any existing timeout first
                if (player.reconnectTimeout) {
                    clearTimeout(player.reconnectTimeout);
                }

                player.reconnectTimeout = setTimeout(() => {
                    // Check if still disconnected after 5 minutes
                    const currentRoom = this.getPlayerRoom(playerId);
                    const currentPlayer = currentRoom?.players.get(playerId);

                    if (currentPlayer && !currentPlayer.connected) {
                        console.log(`⏰ Auto-removing player ${playerId} after 5 minutes of disconnection`);

                        // Remove player permanently
                        currentRoom.removePlayer(playerId);
                        this.playerRooms.delete(playerId);

                        // Broadcast auto-removal
                        currentRoom.broadcast({
                            type: 'PLAYER_AUTO_REMOVED',
                            playerId: playerId,
                            message: `Player ${playerId} was removed after 5 minutes of inactivity`,
                            players: Array.from(currentRoom.players.values())
                        });

                        // Check if room should be deleted
                        if (currentRoom.players.size === 0) {
                            this.rooms.delete(this.playerRooms.get(playerId));
                            console.log(`🗑️ Deleted empty room after auto-removal`);
                        }
                    }
                }, 5 * 60 * 1000); // 5 minutes
            }
        }
    }

    /**
     * Handle player permanently quitting the game
     * Unlike disconnect, this is a permanent departure - player cannot rejoin
     */
    quitGame(playerId) {
        const currentRoomId = this.playerRooms.get(playerId);
        if (!currentRoomId) return;

        const room = this.rooms.get(currentRoomId);
        if (!room) return;

        // Remove player permanently
        room.removePlayer(playerId);

        // Broadcast that player quit (not just disconnected)
        room.broadcast({
            type: 'PLAYER_QUIT',
            playerId: playerId,
            message: `Player ${playerId} has permanently left the game`,
            players: Array.from(room.players.values())
        });

        // Clean up player room mapping
        this.playerRooms.delete(playerId);

        // Check if room should be deleted
        if (room.players.size === 0) {
            this.rooms.delete(currentRoomId);
            console.log(`🗑️ Deleted empty room ${currentRoomId} after last player quit`);
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

                // Clear any pending auto-removal timeout
                if (player.reconnectTimeout) {
                    clearTimeout(player.reconnectTimeout);
                    player.reconnectTimeout = null;
                    console.log(`🔄 Cancelled auto-removal for reconnected player ${playerId}`);
                }

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

    /**
     * Find room by player ID (for Simple V2 Governance API)
     */
    findRoomByPlayerId(playerId) {
        const roomId = this.playerRooms.get(playerId);
        return roomId ? this.rooms.get(roomId) : null;
    }

    /**
     * Get all rooms (for Simple V2 Governance API)
     */
    getAllRooms() {
        return Array.from(this.rooms.values());
    }
}

module.exports = RoomManager;