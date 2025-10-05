/**
 * Game Room Manager - Board Game Table Management
 *
 * Manages isolated game rooms where players gather to play together.
 * Each room is like a separate board game table with its own state.
 */

const ServerEconomicEngine = require('./server-economic-engine-v2');
// GameState removed - using v2 server-authoritative economic engine
const CityNameGenerator = require('./city-name-generator');
const Logger = require('./logger');
const logger = new Logger('room-manager');

// Simple server-side governance system for LVT collection (treasury only)
// NOTE: Budget tracking has been moved to ServerEconomicEngine.gameState.budgets
class ServerGovernanceSystem {
    constructor() {
        this.governance = {
            taxRate: 0.50, // Default 50% LVT rate (0-1 range)
            treasury: 0  // Accumulates LVT/fees, cleared monthly when allocated to budgets
        };
    }

    addFunds(amount, description) {
        this.governance.treasury += amount;
        // console.log(`🏛️ Treasury: +$${amount.toFixed(2)} from ${description} (Total: $${this.governance.treasury.toFixed(2)})`);
    }

    getTreasury() {
        return this.governance.treasury;
    }

    setTaxRate(rate) {
        this.governance.taxRate = Math.max(0, Math.min(1, rate)); // Clamp 0-1
        // console.log(`🏛️ Tax rate set to ${(this.governance.taxRate * 100).toFixed(1)}%`);
    }

    startGameplay() {
        // Called when game starts - could adjust voting points or settings for gameplay
        // console.log(`🏛️ Governance system ready for gameplay`);
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

        // Per-room isolated clock system
        this.gameTimer = null;
        this.gameStartTime = null;
        this.emptyRoomTimer = null;
        this.GAME_DAY_MS = 3600000 / 365; // ~9.86 seconds per game day

        // Chat history storage (last 100 messages)
        this.chatHistory = [];
        this.maxChatHistory = 100;

        // Shared city name for all players in this room
        this.cityName = null;

        // Each room has its own v2 economic engine with server-authoritative state
        // Pass room reference to the engine so it can check for Solo Mode
        this.economicEngine = new ServerEconomicEngine(this);

        // Create and connect governance system for treasury operations
        this.governanceSystem = new ServerGovernanceSystem();
        this.economicEngine.governanceSystem = this.governanceSystem;

        // console.log(`🏛️ Governance system connected to economic engine`);

        // CRITICAL: Connect economic engine broadcast to room broadcast
        // This enables building completions to reach the right players
        this.economicEngine.broadcastFunction = (message) => {
            this.broadcast(message);
        // console.log(`📡 Room ${this.id}: Economic engine broadcasted to ${this.connections.size} players`);
        };

        // WebSocket connections for this room
        this.connections = new Map(); // playerId -> ws

        // Beer hall ready-check state
        this.readyCheckTriggered = false;

        // console.log(`🎲 Created game room: ${this.id} - "${this.roomName}"`);
    }

    /**
     * Add player to room
     */
    addPlayer(playerId, playerData, ws, roomManager = null) {
        // console.log(`🚨 FRESH DEBUG: Room.addPlayer() called for ${playerId} - if you see this, the function is working!`);

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

        // Generate shared city name for room (only once when first player joins)
        if (!this.cityName) {
            this.cityName = roomManager?.cityNameGenerator ?
                roomManager.cityNameGenerator.generateCityName() :
                `${playerData.name || 'Player'} City`;
        // console.log(`🏙️ SHARED: Generated city name for room ${this.id}: ${this.cityName} (roomManager: ${roomManager ? 'YES' : 'NO'})`);
        }

        // Add player with default data including shared city name
        this.players.set(playerId, {
            id: playerId,
            name: playerData.name || `Player ${this.players.size + 1}`,
            color: playerData.color || this.getNextColor(),
            cityName: this.cityName, // Shared city name for all players
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

        // console.log(`👤 Player ${playerId} joined room ${this.id}`);

        // Cancel empty room cleanup since player joined
        this.cancelEmptyRoomCleanup();

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

        // Remove from economic engine
        if (this.economicEngine && typeof this.economicEngine.removePlayer === 'function') {
            this.economicEngine.removePlayer(playerId);
        }

        // Assign new host if needed
        if (this.host === playerId && this.players.size > 0) {
            this.host = this.players.keys().next().value;
        }

        // console.log(`👤 Player ${playerId} left room ${this.id}`);

        // Start empty room monitoring if room is now empty
        if (this.players.size === 0) {
            this.startEmptyRoomMonitoring();
            return true; // Signal to delete room (but now with 30s delay)
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
        // console.log(`🎮 Solo table ${this.id} auto-starting for single player`);
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
                        players: this.getCleanPlayerData(),
                        minPlayers: this.minPlayers,
                        maxPlayers: this.maxPlayers
                    }
                });
        // console.log(`🍻 Ready check started for table ${this.id} with ${this.players.size} players`);
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
        if (this.state !== 'WAITING') {
        // console.log(`⚠️ Cannot start game - room is in state: ${this.state}`);
            return;
        }

        // console.log(`🎮 Starting game for room ${this.id} - transitioning from WAITING to STARTING`);
        this.state = 'STARTING';

        // Broadcast game starting with countdown
        // console.log('🎯 Broadcasting GAME_STARTING with 3 second countdown');
        this.broadcast({
            type: 'GAME_STARTING',
            countdown: 3,
            players: this.getCleanPlayerData()
        });

        // 3 second countdown with client updates
        let countdown = 3;
        const countdownInterval = setInterval(() => {
            countdown--;
        // console.log(`⏰ Countdown: ${countdown}`);
            if (countdown >= 0) {
                this.broadcast({
                    type: 'COUNTDOWN_UPDATE',
                    countdown: countdown
                });
            }
            if (countdown <= 0) {
                clearInterval(countdownInterval);
        // console.log('⏰ Countdown complete - game will start');
            }
        }, 1000);

        setTimeout(() => {
        // console.log('🚀 3 second timeout complete - starting game');
            this.state = 'IN_PROGRESS';

            // 🍺 BEER HALL FRESH START: Reset everything for new game (only if not already started)
            if (!this.economicEngine.gameState.gameStarted) {
        // console.log('🎲 Resetting game state for fresh start');
                this.economicEngine.resetGameState();
            } else {
        // console.log('⚠️ Game already started - skipping reset to preserve game progress');
            }

            // Initialize economic engine players with room player data (including governance points)
            this.economicEngine.initializePlayersFromRoom(this.players);

            // Set fresh starting conditions only for new games
            if (!this.economicEngine.gameState.gameStarted) {
        // console.log('🎲 Setting fresh starting conditions: September 2nd, $6k per player');

                // Set fresh starting conditions: September 2nd, $6k per player
                this.economicEngine.gameState.gameTime = 1.0; // Day 1 (Sept 2)

                // CRITICAL FIX: Adjust gameStartTime so updateGameTime() calculates correctly
                // We want to start on day 1, so set gameStartTime to "1 day ago"
                const GAME_DAY_MS = 3600000 / 365; // Same constant as in economic engine
                this.economicEngine.gameState.gameStartTime = Date.now() - (1 * GAME_DAY_MS);
            } else {
        // console.log('⚠️ Game already in progress - preserving current game time and conditions');
            }

            // Initialize player balances if not exists
            if (!this.economicEngine.gameState.playerBalances) {
                this.economicEngine.gameState.playerBalances = new Map();
            }

            // Give each player $6,000 starting money
            this.players.forEach((player, playerId) => {
                this.economicEngine.gameState.playerBalances.set(playerId, 6000);
        // console.log(`💰 Player ${playerId} starts with $6,000`);
            });

            // Start game timer from Day 1
            this.economicEngine.updateGameTime();

        // console.log(`🍺 Beer Hall table ${this.id} started! ${this.players.size} players, Day 1, fresh board`);

            // Lock in pre-game governance settings and reset for gameplay
            if (this.economicEngine.governanceSystem) {
                this.economicEngine.governanceSystem.startGameplay();

                // CRITICAL FIX: Sync governance system's updated voting points to economic engine player data
                const gameplayVotingPoints = this.economicEngine.governanceSystem.governance.votingPoints || 2; // Default to 2 if undefined
        // console.log(`🏛️ SYNC: Updating all players to ${gameplayVotingPoints} gameplay voting points (governance system had: ${this.economicEngine.governanceSystem.governance.votingPoints})`);

                // Update all players in the economic engine with the correct gameplay voting points
                this.economicEngine.gameState.players.forEach((playerState, playerId) => {
                    if (playerState.governance) {
                        playerState.governance.votingPoints = gameplayVotingPoints;
        // console.log(`🏛️ SYNC: Player ${playerId} updated from pre-game to ${gameplayVotingPoints} gameplay points`);
                    }
                });
            }

            // Broadcast complete initial game state (includes player balances)
            this.economicEngine.broadcastGameState('GAME_STARTED', {
                roomId: this.id,
                players: this.getCleanPlayerData()
            });

            // Broadcast initial Commonwealth scores
            this.economicEngine.broadcastCommonwealthScores();

            // Start the isolated room clock
            this.startGameClock();
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
        // console.log(`🏆 Game ended! Winner: ${winnerId} - ${victoryType}`);

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
        // console.log(`🗑️ Game room ${this.id} cleaned up after victory`);
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
     * Sanitize player data for broadcasting (removes circular references)
     */
    getCleanPlayerData() {
        return Array.from(this.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            cityName: p.cityName,
            ready: p.ready,
            connected: p.connected,
            balance: p.balance
        }));
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
     * Store chat message in room history
     */
    addChatMessage(message) {
        this.chatHistory.push({
            ...message,
            timestamp: Date.now()
        });

        // Keep only the most recent messages
        if (this.chatHistory.length > this.maxChatHistory) {
            this.chatHistory = this.chatHistory.slice(-this.maxChatHistory);
        }
    }

    /**
     * Get chat history for new players joining
     */
    getChatHistory() {
        return this.chatHistory;
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
            players: this.getCleanPlayerData(),
            buildings: buildings,
            gameTime: this.economicEngine.gameState.gameTime,
            jeefhh: this.economicEngine.gameState.jeefhh,
            carens: this.economicEngine.gameState.carens
        };
    }

    /**
     * START PER-ROOM ISOLATED CLOCK SYSTEM
     */

    /**
     * Start the isolated game clock for this room
     */
    startGameClock() {
        if (this.gameTimer) {
        // console.log(`🕒 Room ${this.id}: Clock already running`);
            return;
        }

        this.gameStartTime = Date.now();
        this.economicEngine.gameState.gameStartTime = this.gameStartTime;

        // console.log(`🕒 Room ${this.id}: Starting isolated game clock`);

        // Run clock every GAME_DAY_MS (~9.86 seconds)
        this.gameTimer = setInterval(() => {
            this.updateRoomGameTime();
        }, this.GAME_DAY_MS);

        // Start empty room monitoring when game starts
        this.startEmptyRoomMonitoring();
    }

    /**
     * Update game time for this room only
     */
    updateRoomGameTime() {
        if (this.state !== 'IN_PROGRESS') {
            return;
        }

        // Calculate elapsed real time since game started
        const now = Date.now();
        const elapsedMs = now - this.gameStartTime;
        const elapsedGameDays = elapsedMs / this.GAME_DAY_MS;

        // Server-authoritative time: 1 + elapsed days
        const targetGameTime = 1 + elapsedGameDays;

        // Catch up if we're behind (drift compensation)
        this.economicEngine.gameState.gameTime = targetGameTime;

        // Process daily events, building completion, etc.
        this.economicEngine.updateGameTime();

        // Process expired parcel auctions
        this.economicEngine.processExpiredParcelAuctions();

        // Check victory conditions
        this.checkVictoryConditions();

        // Broadcast updated game state to room players
        this.economicEngine.broadcastGameState('DAILY_PROGRESSION');

        // Broadcast building state updates for rendering
        this.economicEngine.broadcastBuildingStates();
    }

    /**
     * Stop the game clock
     */
    stopGameClock() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        // console.log(`🕒 Room ${this.id}: Game clock stopped`);
        }
    }

    /**
     * Monitor for empty room and cleanup after 30 seconds
     */
    startEmptyRoomMonitoring() {
        // Clear any existing timer
        if (this.emptyRoomTimer) {
            clearTimeout(this.emptyRoomTimer);
            this.emptyRoomTimer = null;
        }

        // Check if room is empty
        if (this.players.size === 0) {
        // console.log(`⏰ Room ${this.id}: Empty room detected, starting 30s cleanup timer`);
            this.emptyRoomTimer = setTimeout(() => {
                this.cleanupEmptyRoom();
            }, 30000); // 30 seconds
        }
    }

    /**
     * Clean up empty room and remove from manager
     */
    cleanupEmptyRoom() {
        if (this.players.size === 0) {
        // console.log(`🧹 Room ${this.id}: Cleaning up empty room after 30s`);
            this.stopGameClock();

            // Notify room manager to remove this room
            if (this.roomManager) {
                this.roomManager.removeRoom(this.id);
            }
        } else {
        // console.log(`🔄 Room ${this.id}: Players rejoined, canceling cleanup`);
        }
    }

    /**
     * Cancel empty room cleanup (players rejoined)
     */
    cancelEmptyRoomCleanup() {
        if (this.emptyRoomTimer) {
            clearTimeout(this.emptyRoomTimer);
            this.emptyRoomTimer = null;
        // console.log(`✅ Room ${this.id}: Cleanup canceled - players present`);
        }
    }
}

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> GameRoom
        this.playerRooms = new Map(); // playerId -> roomId
        this.nextRoomNumber = 1; // Keep for display names only
        this.cityNameGenerator = new CityNameGenerator();

        // console.log('🎯 Room Manager initialized');
    }

    /**
     * Generate a truly unique room ID that will never collide across server restarts
     */
    generateUniqueRoomId(prefix = 'table') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 8);
        return `${prefix}-${timestamp}-${random}`;
    }

    /**
     * Create a new room
     */
    createRoom(options = {}) {
        const roomId = options.roomId || this.generateUniqueRoomId('room');
        const room = new GameRoom(roomId, options);

        // Give room reference to manager for cleanup
        room.roomManager = this;

        this.rooms.set(roomId, room);

        return room;
    }

    /**
     * Join a room
     */
    joinRoom(roomId, playerId, playerData, ws) {
        // console.log(`🚀 DEBUG: joinRoom called - roomId: ${roomId}, playerId: ${playerId}, playerData:`, playerData);

        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        // Leave current room if in one
        this.leaveCurrentRoom(playerId);

        // console.log(`🚀 DEBUG: About to call room.addPlayer with roomManager: ${this ? 'YES' : 'NO'}`);

        // Add to new room
        const player = room.addPlayer(playerId, playerData, ws, this);
        this.playerRooms.set(playerId, roomId);

        // console.log(`🚀 DEBUG: room.addPlayer returned player:`, player);

        // Broadcast player joined
        room.broadcast({
            type: 'PLAYER_JOINED',
            player: player,
            players: room.getCleanPlayerData()
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
                    players: room.getCleanPlayerData()
                });

                // Delete room if empty
                if (shouldDelete) {
                    this.rooms.delete(currentRoomId);
        // console.log(`🗑️ Deleted empty room ${currentRoomId}`);
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
        console.log(`🚀 ROOM MATCHING: Player ${playerId} looking for table, preferences:`, preferences);

        const minPlayers = preferences.minPlayers || 2;
        const maxPlayers = Math.min(preferences.maxPlayers || 12, 12); // Cap at 12
        const isSoloMode = minPlayers === 1 && maxPlayers === 1;

        console.log(`🎯 Mode: ${isSoloMode ? 'SOLO (isolated sandbox)' : `MULTIPLAYER (${minPlayers}-${maxPlayers} players)`}`);

        // Leave current table if in one
        this.leaveCurrentRoom(playerId);

        // SOLO MODE: Always create isolated private table (no auctions, no action limits, learning mode)
        if (isSoloMode) {
            console.log(`🎮 Creating isolated solo sandbox for ${playerId}`);
            const uniqueRoomId = this.generateUniqueRoomId('solo');
            const newRoom = this.createRoom({
                roomId: uniqueRoomId,
                roomName: `Solo Sandbox ${this.nextRoomNumber}`,
                minPlayers: 1,
                maxPlayers: 1,
                isPublic: false // Private - no joining
            });
            console.log(`✨ Created solo sandbox: ${newRoom.id}`);
            return this.joinRoom(newRoom.id, playerId, playerData, ws);
        }

        // MULTIPLAYER MODE: Find compatible table
        // Rule: Player can join room if player.minPlayers <= room.minPlayers
        // (2+ player can join 2+, 6+, or 12 rooms; 6+ can only join 6+ or 12; 12 can only join 12)
        console.log(`🔍 Searching ${this.rooms.size} rooms for compatible table`);

        for (const room of this.rooms.values()) {
            if (room.isPublic &&
                room.state === 'WAITING' &&
                room.players.size < room.maxPlayers &&
                minPlayers <= room.minPlayers) { // Player's min must be <= room's min

                console.log(`✅ MATCH: Joining table ${room.id} (${room.players.size + 1}/${room.maxPlayers} players, room wants ${room.minPlayers}+, player wants ${minPlayers}+)`);
                return this.joinRoom(room.id, playerId, playerData, ws);
            }
        }

        // No compatible room - create new one
        console.log(`🆕 No compatible room found. Creating new table (${minPlayers}-${maxPlayers} players)`);
        const uniqueRoomId = this.generateUniqueRoomId('table');
        const newRoom = this.createRoom({
            roomId: uniqueRoomId,
            roomName: `Table ${this.nextRoomNumber}`,
            minPlayers: minPlayers,
            maxPlayers: maxPlayers,
            isPublic: true
        });

        console.log(`✨ Created table ${newRoom.id}`);
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
        // console.log(`⏰ Auto-removing player ${playerId} after 5 minutes of disconnection`);

                        // Remove player permanently
                        currentRoom.removePlayer(playerId);
                        this.playerRooms.delete(playerId);

                        // Broadcast auto-removal
                        currentRoom.broadcast({
                            type: 'PLAYER_AUTO_REMOVED',
                            playerId: playerId,
                            message: `Player ${playerId} was removed after 5 minutes of inactivity`,
                            players: currentRoom.getCleanPlayerData()
                        });

                        // Check if room should be deleted
                        if (currentRoom.players.size === 0) {
                            this.rooms.delete(this.playerRooms.get(playerId));
        // console.log(`🗑️ Deleted empty room after auto-removal`);
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
            players: room.getCleanPlayerData()
        });

        // Clean up player room mapping
        this.playerRooms.delete(playerId);

        // Check if room should be deleted
        if (room.players.size === 0) {
            this.rooms.delete(currentRoomId);
        // console.log(`🗑️ Deleted empty room ${currentRoomId} after last player quit`);
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
        // console.log(`🔄 Cancelled auto-removal for reconnected player ${playerId}`);
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

    /**
     * Remove room (called by empty room cleanup)
     */
    removeRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            // Clean up all player mappings for this room
            for (const [playerId, mappedRoomId] of this.playerRooms.entries()) {
                if (mappedRoomId === roomId) {
                    this.playerRooms.delete(playerId);
                }
            }

            // Stop the room's clock if running
            room.stopGameClock();

            // Remove the room
            this.rooms.delete(roomId);
        // console.log(`🗑️ Room ${roomId} removed from manager`);
            return true;
        }
        return false;
    }
}

module.exports = RoomManager;