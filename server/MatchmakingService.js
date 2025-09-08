const { v4: uuidv4 } = require('uuid');

class MatchmakingService {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = new Map(); // playerId -> { socket, playerData, minPlayers, joinTime }
    this.waitingRooms = new Map(); // minPlayers -> Set of playerIds
    this.soloGames = new Map(); // playerId -> solo game state
    
    // Initialize waiting rooms for different player counts
    [4, 6, 8, 10, 12].forEach(count => {
      this.waitingRooms.set(count, new Set());
    });
    
    // Check for matches periodically
    this.matchCheckInterval = setInterval(() => {
      this.checkForMatches();
    }, 5000); // Every 5 seconds
  }

  addToMatchmaking(socket, playerData, minPlayers = 4) {
    const playerId = playerData.id;
    
    // Validate minimum players
    if (![4, 6, 8, 10, 12].includes(minPlayers)) {
      minPlayers = 4; // Default to 4 if invalid
    }
    
    // Add to waiting players
    this.waitingPlayers.set(playerId, {
      socket,
      playerData,
      minPlayers,
      joinTime: Date.now()
    });
    
    // Add to appropriate waiting room and all lower ones
    // (player willing to play with 8 is also willing to play with 10 or 12)
    for (let count = minPlayers; count <= 12; count += 2) {
      if (this.waitingRooms.has(count)) {
        this.waitingRooms.get(count).add(playerId);
      }
    }
    
    // Start solo game while waiting
    this.startSoloGame(playerId, socket);
    
    // Join waiting room for chat
    socket.join('waiting-room');
    
    // Update waiting room status
    this.broadcastWaitingRoomStatus();
    
    console.log(`👤 Player ${playerData.name} joined matchmaking (min: ${minPlayers} players)`);
    
    // Immediately check for matches
    this.checkForMatches();
  }

  removeFromMatchmaking(playerId) {
    const player = this.waitingPlayers.get(playerId);
    if (!player) return;
    
    // Remove from all waiting rooms
    this.waitingRooms.forEach(playerSet => {
      playerSet.delete(playerId);
    });
    
    // End solo game
    if (this.soloGames.has(playerId)) {
      this.soloGames.delete(playerId);
    }
    
    // Remove from waiting players
    this.waitingPlayers.delete(playerId);
    
    // Leave waiting room
    if (player.socket) {
      player.socket.leave('waiting-room');
    }
    
    // Update waiting room status
    this.broadcastWaitingRoomStatus();
    
    console.log(`👤 Player removed from matchmaking: ${playerId}`);
  }

  checkForMatches() {
    // Check each player count threshold from highest to lowest
    // (prefer fuller games)
    for (let targetCount = 12; targetCount >= 4; targetCount -= 2) {
      const waitingForThisCount = this.waitingRooms.get(targetCount);
      
      if (waitingForThisCount && waitingForThisCount.size >= targetCount) {
        // We have enough players for this game size
        const selectedPlayers = this.selectPlayersForGame(waitingForThisCount, targetCount);
        
        if (selectedPlayers.length === targetCount) {
          this.createMatchedGame(selectedPlayers);
        }
      }
    }
  }

  selectPlayersForGame(eligiblePlayerIds, targetCount) {
    const selected = [];
    const playerArray = Array.from(eligiblePlayerIds);
    
    // Sort by wait time (longest waiting first)
    playerArray.sort((a, b) => {
      const playerA = this.waitingPlayers.get(a);
      const playerB = this.waitingPlayers.get(b);
      return (playerA?.joinTime || 0) - (playerB?.joinTime || 0);
    });
    
    // Select players who are still waiting
    for (const playerId of playerArray) {
      if (selected.length >= targetCount) break;
      
      const player = this.waitingPlayers.get(playerId);
      if (player && player.socket && player.socket.connected) {
        selected.push(playerId);
      }
    }
    
    return selected.length === targetCount ? selected : [];
  }

  createMatchedGame(playerIds) {
    const roomId = uuidv4();
    const GameRoom = require('./GameRoom');
    const room = new GameRoom(roomId, this.io, playerIds.length);
    
    console.log(`🎮 Creating matched game ${roomId} with ${playerIds.length} players`);
    
    const players = [];
    
    // Move all matched players to the game
    for (const playerId of playerIds) {
      const player = this.waitingPlayers.get(playerId);
      if (player) {
        players.push(player);
        
        // Remove from matchmaking
        this.removeFromMatchmaking(playerId);
        
        // Save solo game progress if desired (future feature)
        const soloProgress = this.soloGames.get(playerId);
        if (soloProgress) {
          player.socket.emit('soloGameSaved', { 
            message: 'Your solo game progress has been saved' 
          });
        }
      }
    }
    
    // Notify all players they've been matched
    players.forEach(({ socket, playerData }) => {
      socket.emit('matchFound', {
        roomId,
        playerCount: players.length,
        message: `Match found! Starting ${players.length}-player game...`
      });
    });
    
    // Give players a moment to see the notification
    setTimeout(() => {
      // Add all players to the game room
      players.forEach(({ socket, playerData }) => {
        room.addPlayer(socket, playerData);
        socket.join(roomId);
        
        socket.emit('gameJoined', {
          roomId,
          playerId: playerData.id,
          gameState: room.getGameState()
        });
      });
      
      // Start the game
      room.startGame();
    }, 2000);
    
    return room;
  }

  startSoloGame(playerId, socket) {
    // Create a simplified solo game state for practice
    const soloGame = {
      playerId,
      grid: this.initializeSoloGrid(),
      cash: 5000,
      properties: [],
      buildings: [],
      startTime: Date.now()
    };
    
    this.soloGames.set(playerId, soloGame);
    
    socket.emit('soloGameStarted', {
      message: 'Practice in solo mode while waiting for other players',
      gameState: soloGame,
      waitingStatus: this.getWaitingStatus()
    });
  }

  initializeSoloGrid() {
    // Simplified 14x14 grid for solo play
    const grid = [];
    const size = 14;
    
    for (let row = 0; row < size; row++) {
      grid[row] = [];
      for (let col = 0; col < size; col++) {
        const centerRow = size / 2;
        const centerCol = size / 2;
        const distanceFromCenter = Math.sqrt(
          Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
        );
        
        const baseValue = Math.round(5000 - (distanceFromCenter / 10) * 4000);
        
        grid[row][col] = {
          type: 'grass',
          owner: null,
          building: null,
          landValue: Math.max(1000, baseValue)
        };
      }
    }
    
    return grid;
  }

  handleSoloAction(playerId, action) {
    const soloGame = this.soloGames.get(playerId);
    if (!soloGame) return { success: false, error: 'No solo game found' };
    
    // Simple solo game logic
    switch (action.type) {
      case 'buyParcel':
        const { row, col, price } = action.data;
        const parcel = soloGame.grid[row][col];
        
        if (parcel.owner) {
          return { success: false, error: 'Already owned' };
        }
        
        if (soloGame.cash < price) {
          return { success: false, error: 'Insufficient funds' };
        }
        
        parcel.owner = playerId;
        soloGame.cash -= price;
        soloGame.properties.push({ row, col, price });
        
        return { 
          success: true, 
          data: { 
            cash: soloGame.cash,
            properties: soloGame.properties.length 
          }
        };
      
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  getWaitingStatus() {
    const status = {};
    
    this.waitingRooms.forEach((playerSet, minPlayers) => {
      status[`waiting_${minPlayers}`] = playerSet.size;
    });
    
    return {
      totalWaiting: this.waitingPlayers.size,
      byMinPlayers: status,
      avgWaitTime: this.calculateAverageWaitTime()
    };
  }

  calculateAverageWaitTime() {
    if (this.waitingPlayers.size === 0) return 0;
    
    const now = Date.now();
    let totalWaitTime = 0;
    
    this.waitingPlayers.forEach(player => {
      totalWaitTime += (now - player.joinTime);
    });
    
    return Math.round(totalWaitTime / this.waitingPlayers.size / 1000); // in seconds
  }

  broadcastWaitingRoomStatus() {
    const status = this.getWaitingStatus();
    
    // Broadcast to all waiting players
    this.io.to('waiting-room').emit('waitingRoomUpdate', {
      ...status,
      message: this.getWaitingMessage(status)
    });
  }

  getWaitingMessage(status) {
    const messages = [];
    
    // Check each threshold
    [4, 6, 8, 10, 12].forEach(count => {
      const waiting = status.byMinPlayers[`waiting_${count}`];
      const needed = count - waiting;
      
      if (needed > 0 && needed <= 2) {
        messages.push(`${needed} more player${needed > 1 ? 's' : ''} needed for ${count}-player game`);
      }
    });
    
    if (messages.length > 0) {
      return messages[0]; // Return the closest to starting
    }
    
    return `${status.totalWaiting} player${status.totalWaiting !== 1 ? 's' : ''} waiting`;
  }

  // Chat functionality for waiting room
  handleWaitingRoomChat(socket, playerId, message) {
    const player = this.waitingPlayers.get(playerId);
    if (!player) return;
    
    const chatMessage = {
      id: uuidv4(),
      playerId,
      playerName: player.playerData.name,
      playerColor: player.playerData.color,
      content: message.substring(0, 200),
      timestamp: Date.now(),
      type: 'waiting-room'
    };
    
    this.io.to('waiting-room').emit('waitingRoomChat', chatMessage);
  }

  destroy() {
    if (this.matchCheckInterval) {
      clearInterval(this.matchCheckInterval);
    }
  }
}

module.exports = MatchmakingService;