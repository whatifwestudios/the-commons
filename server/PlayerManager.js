class PlayerManager {
  constructor() {
    this.players = new Map(); // playerId -> { socketId, roomId, lastActivity }
    this.sockets = new Map(); // socketId -> playerId
  }

  addPlayer(playerId, socketId, roomId) {
    this.players.set(playerId, {
      socketId,
      roomId,
      lastActivity: Date.now()
    });
    this.sockets.set(socketId, playerId);
  }

  removePlayer(playerId) {
    const playerData = this.players.get(playerId);
    if (playerData) {
      this.sockets.delete(playerData.socketId);
      this.players.delete(playerId);
      return true;
    }
    return false;
  }

  updateSocket(playerId, newSocketId) {
    const playerData = this.players.get(playerId);
    if (playerData) {
      // Remove old socket mapping
      this.sockets.delete(playerData.socketId);
      
      // Add new socket mapping
      playerData.socketId = newSocketId;
      playerData.lastActivity = Date.now();
      this.sockets.set(newSocketId, playerId);
      
      return true;
    }
    return false;
  }

  getPlayerBySocketId(socketId) {
    const playerId = this.sockets.get(socketId);
    if (playerId) {
      return this.players.get(playerId);
    }
    return null;
  }

  getPlayerById(playerId) {
    return this.players.get(playerId);
  }

  getPlayerCount() {
    return this.players.size;
  }

  updateActivity(playerId) {
    const playerData = this.players.get(playerId);
    if (playerData) {
      playerData.lastActivity = Date.now();
    }
  }

  getInactivePlayers(timeoutMs = 300000) { // 5 minutes default
    const cutoff = Date.now() - timeoutMs;
    const inactivePlayers = [];
    
    this.players.forEach((playerData, playerId) => {
      if (playerData.lastActivity < cutoff) {
        inactivePlayers.push({
          playerId,
          ...playerData
        });
      }
    });
    
    return inactivePlayers;
  }

  cleanupInactivePlayers(timeoutMs = 300000) {
    const inactivePlayers = this.getInactivePlayers(timeoutMs);
    
    inactivePlayers.forEach(({ playerId }) => {
      this.removePlayer(playerId);
    });
    
    return inactivePlayers.length;
  }

  getPlayersInRoom(roomId) {
    const playersInRoom = [];
    
    this.players.forEach((playerData, playerId) => {
      if (playerData.roomId === roomId) {
        playersInRoom.push({
          playerId,
          ...playerData
        });
      }
    });
    
    return playersInRoom;
  }

  getRoomStats() {
    const roomStats = new Map();
    
    this.players.forEach((playerData) => {
      const { roomId } = playerData;
      if (roomStats.has(roomId)) {
        roomStats.set(roomId, roomStats.get(roomId) + 1);
      } else {
        roomStats.set(roomId, 1);
      }
    });
    
    return Array.from(roomStats.entries()).map(([roomId, playerCount]) => ({
      roomId,
      playerCount
    }));
  }

  getAllPlayers() {
    const allPlayers = [];
    
    this.players.forEach((playerData, playerId) => {
      allPlayers.push({
        playerId,
        ...playerData
      });
    });
    
    return allPlayers;
  }
}

module.exports = PlayerManager;