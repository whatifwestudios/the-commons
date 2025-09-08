const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const GameRoom = require('./GameRoom');
const PlayerManager = require('./PlayerManager');
const GlobalLeaderboard = require('./GlobalLeaderboard');
const AuthService = require('./AuthService');
const { rateLimiter } = require('./middleware/rateLimiter');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:8000",
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:8000",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Game state
const gameRooms = new Map();
const playerManager = new PlayerManager();
const globalLeaderboard = new GlobalLeaderboard();
const authService = new AuthService();

// Utility functions
function findAvailableRoom() {
  // Find a room with < 12 players
  for (const [roomId, room] of gameRooms) {
    if (room.playerCount < 12 && !room.gameStarted) {
      return room;
    }
  }
  
  // Create new room if none available
  const roomId = uuidv4();
  const room = new GameRoom(roomId, io, 4, globalLeaderboard);
  gameRooms.set(roomId, room);
  return room;
}

function cleanupEmptyRooms() {
  for (const [roomId, room] of gameRooms) {
    if (room.playerCount === 0) {
      room.destroy();
      gameRooms.delete(roomId);
      console.log(`🗑️ Cleaned up empty room: ${roomId}`);
    }
  }
}

// Socket connection handling
io.use(rateLimiter);

io.on('connection', (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);
  
  let currentRoom = null;
  let playerId = null;

  // Join game
  socket.on('joinGame', async (playerData) => {
    try {
      // Check authentication from cookie
      const cookies = socket.handshake.headers.cookie;
      let authenticatedUser = null;
      
      if (cookies) {
        const cookieObj = {};
        cookies.split(';').forEach(cookie => {
          const [name, value] = cookie.trim().split('=');
          cookieObj[name] = value;
        });
        
        if (cookieObj.sessionId) {
          authenticatedUser = authService.validateSession(cookieObj.sessionId);
        }
      }

      // Validate player data
      if (!playerData.name || playerData.name.length > 20) {
        socket.emit('error', { message: 'Invalid player name' });
        return;
      }

      // Find or create room
      currentRoom = findAvailableRoom();
      
      // Use authenticated user ID if available, otherwise generate new one
      playerId = authenticatedUser ? authenticatedUser.userId : uuidv4();
      
      // Create player
      const player = {
        id: playerId,
        socketId: socket.id,
        name: playerData.name.substring(0, 20),
        color: playerData.color || '#52C77E',
        emoji: playerData.emoji || '🏠',
        wealth: 10000, // Starting wealth
        cash: 10000,
        properties: [],
        buildings: [],
        votingPoints: 2,
        joinedAt: Date.now()
      };

      // Add player to room (with global leaderboard for starting cash)
      const success = currentRoom.addPlayer(socket, player, globalLeaderboard);
      
      if (success) {
        // Register game with global leaderboard
        if (!globalLeaderboard.activeGames.has(currentRoom.id)) {
          globalLeaderboard.registerGame(currentRoom.id, {
            playerCount: currentRoom.playerCount,
            players: Array.from(currentRoom.players.values())
          });
        }
        socket.join(currentRoom.id);
        playerManager.addPlayer(playerId, socket.id, currentRoom.id);
        
        // Send initial game state to player
        socket.emit('gameJoined', {
          roomId: currentRoom.id,
          playerId: playerId,
          gameState: currentRoom.getGameState(),
          playerData: player
        });

        // Notify room of new player
        currentRoom.broadcast('playerJoined', {
          player: {
            id: player.id,
            name: player.name,
            color: player.color,
            emoji: player.emoji
          },
          playerCount: currentRoom.playerCount
        }, socket);

        console.log(`👤 Player ${player.name} joined room ${currentRoom.id} (${currentRoom.playerCount}/12)`);
        
        // Start game if room is full
        if (currentRoom.playerCount >= 12 && !currentRoom.gameStarted) {
          currentRoom.startGame();
        }
      } else {
        socket.emit('error', { message: 'Failed to join room' });
      }
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Server error' });
    }
  });

  // Player action
  socket.on('playerAction', (action) => {
    if (!currentRoom || !playerId) {
      socket.emit('error', { message: 'Not in a game room' });
      return;
    }

    // Rate limiting
    if (!socket.rateLimiter.consume(socket.id)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    try {
      const result = currentRoom.handlePlayerAction(playerId, action);
      
      if (result.success) {
        // Broadcast action to all players in room
        currentRoom.broadcast('gameUpdate', {
          playerId: playerId,
          action: action,
          result: result.data,
          timestamp: Date.now()
        });
      } else {
        socket.emit('actionFailed', {
          action: action,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error handling player action:', error);
      socket.emit('error', { message: 'Action failed' });
    }
  });

  // Governance vote
  socket.on('submitVote', (voteData) => {
    if (!currentRoom || !playerId) return;

    try {
      const result = currentRoom.handleVote(playerId, voteData);
      
      if (result.success) {
        socket.emit('voteSubmitted', result.data);
        
        // If voting is complete, broadcast results
        if (result.votingComplete) {
          currentRoom.broadcast('votingComplete', result.votingResults);
        }
      } else {
        socket.emit('voteError', { error: result.error });
      }
    } catch (error) {
      console.error('Error handling vote:', error);
      socket.emit('error', { message: 'Vote failed' });
    }
  });

  // Chat message
  socket.on('chatMessage', (messageData) => {
    if (!currentRoom || !playerId) return;

    // Rate limiting for chat
    if (!socket.chatLimiter || !socket.chatLimiter.consume(socket.id)) {
      return;
    }

    const player = currentRoom.getPlayer(playerId);
    if (!player) return;

    const message = {
      id: uuidv4(),
      playerId: playerId,
      playerName: player.name,
      playerColor: player.color,
      content: messageData.content.substring(0, 200),
      timestamp: Date.now(),
      type: messageData.type || 'public' // 'public' or 'private'
    };

    if (message.type === 'private' && messageData.targetPlayerId) {
      // Send private message
      const targetSocket = currentRoom.getPlayerSocket(messageData.targetPlayerId);
      if (targetSocket) {
        socket.emit('chatMessage', message);
        targetSocket.emit('chatMessage', message);
      }
    } else {
      // Broadcast public message
      currentRoom.broadcast('chatMessage', message);
    }
  });

  // Disconnect handling
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Player disconnected: ${socket.id} (${reason})`);
    
    if (currentRoom && playerId) {
      currentRoom.removePlayer(playerId);
      playerManager.removePlayer(playerId);
      
      // Notify room
      currentRoom.broadcast('playerLeft', {
        playerId: playerId,
        playerCount: currentRoom.playerCount
      });

      console.log(`👤 Player ${playerId} left room ${currentRoom.id} (${currentRoom.playerCount}/12)`);
    }

    // Cleanup empty rooms periodically
    setTimeout(cleanupEmptyRooms, 5000);
  });

  // Handle reconnection
  socket.on('reconnect', (reconnectData) => {
    const { playerId: oldPlayerId, roomId } = reconnectData;
    
    const room = gameRooms.get(roomId);
    if (room && room.hasPlayer(oldPlayerId)) {
      // Update socket for existing player
      room.updatePlayerSocket(oldPlayerId, socket);
      playerManager.updateSocket(oldPlayerId, socket.id);
      
      currentRoom = room;
      playerId = oldPlayerId;
      
      socket.join(roomId);
      socket.emit('reconnected', {
        gameState: room.getGameState(),
        playerData: room.getPlayer(oldPlayerId)
      });
      
      console.log(`🔄 Player ${oldPlayerId} reconnected to room ${roomId}`);
    } else {
      socket.emit('reconnectFailed', { message: 'Game session not found' });
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rooms: gameRooms.size,
    players: playerManager.getPlayerCount()
  });
});

// Room stats endpoint
app.get('/stats', (req, res) => {
  const roomStats = Array.from(gameRooms.values()).map(room => ({
    id: room.id,
    playerCount: room.playerCount,
    gameStarted: room.gameStarted,
    gameTime: room.gameTime,
    createdAt: room.createdAt
  }));

  res.json({
    rooms: roomStats,
    totalPlayers: playerManager.getPlayerCount(),
    global: globalLeaderboard.getGlobalStats()
  });
});

// Global leaderboards
app.get('/leaderboard/cities', (req, res) => {
  const stats = globalLeaderboard.getGlobalStats();
  res.json({
    topCities: stats.topCities,
    totalCities: stats.totalCities
  });
});

app.get('/leaderboard/players', (req, res) => {
  const topPlayers = globalLeaderboard.getTopPlayers();
  res.json({
    topPlayers,
    totalPlayers: globalLeaderboard.playerProfiles.size
  });
});

// Authentication endpoints
app.post('/auth/login', async (req, res) => {
  try {
    const { email, playerName } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const result = await authService.sendMagicLink(email, playerName);
    res.json(result);
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/auth/verify', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const result = await authService.verifyMagicLink(token);
    
    // Set session cookie
    res.cookie('sessionId', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'strict'
    });

    // In production, redirect to game
    if (process.env.NODE_ENV === 'production') {
      res.redirect('/?authenticated=true');
    } else {
      res.json(result);
    }
    
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      res.redirect('/?error=auth_failed');
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

app.post('/auth/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    authService.logout(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.json({ success: true, message: 'Logged out' });
});

app.get('/auth/me', (req, res) => {
  const sessionId = req.cookies.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = authService.validateSession(sessionId);
  
  if (!user) {
    res.clearCookie('sessionId');
    return res.status(401).json({ error: 'Invalid session' });
  }

  // Get player profile with game stats
  const profile = globalLeaderboard.getPlayerProfile(user.userId, user.name);
  
  res.json({
    user,
    gameProfile: profile.getStats(),
    recentGames: profile.gameHistory.slice(-5).reverse()
  });
});

// Player profile endpoint
app.get('/profile/:playerId', (req, res) => {
  const { playerId } = req.params;
  const profile = globalLeaderboard.playerProfiles.get(playerId);
  
  if (profile) {
    res.json({
      profile: profile.getStats(),
      recentGames: profile.gameHistory.slice(-10).reverse()
    });
  } else {
    res.json({
      profile: null,
      message: 'Player not found'
    });
  }
});

// Cleanup intervals
setInterval(cleanupEmptyRooms, 60000); // Every minute
setInterval(() => {
  authService.cleanup();
}, 5 * 60 * 1000); // Clean up auth every 5 minutes

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 The Commons server running on port ${PORT}`);
  console.log(`🌍 Client URL: ${process.env.CLIENT_URL || 'http://localhost:8000'}`);
});