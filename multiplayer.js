// Real-time multiplayer client for The Commons
class MultiplayerClient {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
    this.playerData = null;
    
    // State management
    this.localActions = [];
    this.serverState = null;
    this.lastSyncTime = 0;
    
    // UI elements
    this.setupUI();
    
    // Connection management
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  setupUI() {
    // Add multiplayer UI elements to the page
    this.createMultiplayerUI();
    this.createChatUI();
    this.createLeaderboardUI();
    this.createGameTimerUI();
  }

  createMultiplayerUI() {
    const multiplayerPanel = document.createElement('div');
    multiplayerPanel.className = 'sidebar-section collapsible';
    multiplayerPanel.innerHTML = `
      <div class="section-header" id="multiplayer-header">
        <span>MULTIPLAYER</span>
        <span class="collapse-icon">▼</span>
      </div>
      <div class="section-content" id="multiplayer-content">
        <div class="connection-status" id="connection-status">
          <span class="status-dot offline"></span>
          <span class="status-text">Connecting...</span>
        </div>
        <div class="room-info">
          <div class="room-id">Room: <span id="room-id">-</span></div>
          <div class="players-count">Players: <span id="players-count">0</span>/12</div>
        </div>
        <div class="game-timer-section">
          <div class="timer-label">Game Time</div>
          <div class="timer-value" id="game-timer">--:--</div>
        </div>
      </div>
    `;
    
    // Add to sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.appendChild(multiplayerPanel);
      this.setupCollapsible(multiplayerPanel);
    }
  }

  createChatUI() {
    const chatPanel = document.createElement('div');
    chatPanel.className = 'sidebar-section collapsible';
    chatPanel.innerHTML = `
      <div class="section-header" id="chat-header">
        <span>CITY CHAT</span>
        <span class="collapse-icon">▼</span>
      </div>
      <div class="section-content" id="chat-content">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input">
          <input type="text" id="chat-input" placeholder="Type a message..." maxlength="200">
          <button id="send-chat">Send</button>
        </div>
      </div>
    `;

    // Add to sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.appendChild(chatPanel);
      this.setupCollapsible(chatPanel);
    }
    this.setupChatEvents();
  }

  createLeaderboardUI() {
    const leaderboardPanel = document.createElement('div');
    leaderboardPanel.className = 'sidebar-section collapsible';
    leaderboardPanel.innerHTML = `
      <div class="section-header" id="leaderboard-header">
        <span>WEALTH LEADERBOARD</span>
        <span class="collapse-icon">▼</span>
      </div>
      <div class="section-content" id="leaderboard-content">
        <!-- Leaderboard entries will be populated here -->
      </div>
    `;

    // Add to sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.appendChild(leaderboardPanel);
      this.setupCollapsible(leaderboardPanel);
    }
  }

  createGameTimerUI() {
    // Add game timer to top bar if not already present
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) {
      const topBar = document.getElementById('top-bar');
      const timerSection = document.createElement('div');
      timerSection.className = 'top-bar-section';
      timerSection.innerHTML = `
        <div class="top-bar-info">
          <div class="info-item">
            <span class="info-label">GAME:</span>
            <span class="info-value timer-value" id="game-timer">--:--</span>
          </div>
        </div>
      `;
      topBar.appendChild(timerSection);
    }
  }

  setupCollapsible(panel) {
    const header = panel.querySelector('.section-header');
    if (header) {
      header.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
      });
    }
  }

  setupChatEvents() {
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-chat');

    // Send message on Enter or button click
    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message && this.connected) {
        this.socket.emit('chatMessage', {
          content: message,
          type: 'public'
        });
        chatInput.value = '';
      }
    };

    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    sendButton.addEventListener('click', sendMessage);
  }

  // Connection management
  async connect(serverUrl) {
    // Use provided URL or get from config
    if (!serverUrl) {
      serverUrl = window.CONFIG?.SERVER_URL || 'http://localhost:3000';
    }
    
    console.log('🔌 Attempting to connect to multiplayer server:', serverUrl);
    console.log('🌍 Current hostname:', window.location.hostname);
    console.log('📊 Config:', window.CONFIG);
    
    try {
      // Load Socket.IO client library
      if (!window.io) {
        console.log('📦 Loading Socket.IO client library...');
        await this.loadSocketIO();
      }

      console.log('🚀 Creating Socket.IO connection...');
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      console.log('📡 Socket.IO instance created:', this.socket);
      this.setupSocketEvents();
      
    } catch (error) {
      console.error('Failed to connect to server:', error);
      this.updateConnectionStatus('error', 'Connection failed');
    }
  }

  async loadSocketIO() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  setupSocketEvents() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('🔌 Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.updateConnectionStatus('online', 'Connected');
      
      // Join game immediately after connection
      this.joinGame();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
      this.connected = false;
      this.updateConnectionStatus('offline', 'Disconnected');
      
      // Attempt reconnection
      if (reason !== 'io client disconnect') {
        this.attemptReconnection();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.updateConnectionStatus('error', 'Connection error');
      this.attemptReconnection();
    });

    // Game events
    this.socket.on('gameJoined', (data) => {
      console.log('🎮 Joined game:', data);
      this.playerId = data.playerId;
      this.roomId = data.roomId;
      this.playerData = data.playerData;
      
      // Update UI
      document.getElementById('room-id').textContent = data.roomId.substring(0, 8);
      
      // Initialize game state
      this.syncGameState(data.gameState);
    });

    this.socket.on('playerJoined', (data) => {
      console.log('👤 Player joined:', data.player.name);
      this.updatePlayersCount(data.playerCount);
      this.addChatMessage(`${data.player.name} joined the city`, 'system');
    });

    this.socket.on('playerLeft', (data) => {
      console.log('👤 Player left');
      this.updatePlayersCount(data.playerCount);
    });

    this.socket.on('gameStarted', (data) => {
      console.log('🎮 Game started!');
      this.addChatMessage(data.message, 'system');
      this.syncGameState(data.gameState);
      this.startGameTimer(data.gameState.gameTime);
    });

    this.socket.on('gameUpdate', (data) => {
      console.log('🔄 Game update:', data.action.type);
      this.handleGameUpdate(data);
    });

    this.socket.on('marketUpdate', (data) => {
      console.log('📈 Market update:', data.market.conditions);
      this.handleMarketUpdate(data);
    });

    this.socket.on('revenueCollection', (data) => {
      console.log('💰 Revenue collected');
      this.updateLeaderboard(data.leaderboard);
    });

    this.socket.on('randomEvent', (event) => {
      console.log('⚡ Random event:', event.title);
      this.handleRandomEvent(event);
    });

    this.socket.on('gameEnded', (results) => {
      console.log('🏁 Game ended!');
      this.handleGameEnd(results);
    });

    // Chat events
    this.socket.on('chatMessage', (message) => {
      this.addChatMessage(message.content, 'player', message.playerName, message.playerColor);
    });

    // Error events
    this.socket.on('error', (error) => {
      console.error('Server error:', error);
      this.addChatMessage(`Error: ${error.message}`, 'error');
    });

    this.socket.on('actionFailed', (data) => {
      console.warn('Action failed:', data.error);
      this.addChatMessage(`Action failed: ${data.error}`, 'error');
      
      // Rollback optimistic update
      this.rollbackAction(data.action);
    });
  }

  joinGame() {
    if (!this.game.playerSettings) {
      console.error('Player settings not configured');
      return;
    }

    this.socket.emit('joinGame', {
      name: this.game.playerSettings.name,
      color: this.game.playerSettings.color,
      emoji: this.game.playerSettings.emoji
    });
  }

  // Game state synchronization
  syncGameState(serverGameState) {
    this.serverState = serverGameState;
    this.lastSyncTime = Date.now();
    
    // Update local game state
    if (this.game) {
      // Sync grid ownership and buildings
      this.syncGrid(serverGameState.grid);
      
      // Sync player data
      this.syncPlayers(serverGameState.players);
      
      // Sync vitality data from server
      this.syncVitality(serverGameState.vitality);
      
      // Sync governance
      this.syncGovernance(serverGameState.governance);
      
      // Re-render game
      this.game.render();
    }
  }

  syncGrid(serverGrid) {
    if (!this.game.grid || !serverGrid) return;
    
    for (let row = 0; row < serverGrid.length; row++) {
      for (let col = 0; col < serverGrid[row].length; col++) {
        const serverParcel = serverGrid[row][col];
        const localParcel = this.game.grid[row][col];
        
        if (localParcel && serverParcel) {
          // Sync ownership
          localParcel.owner = serverParcel.owner;
          
          // Sync buildings
          localParcel.building = serverParcel.building;
          localParcel.buildingAge = serverParcel.buildingAge;
          
          // Sync land values
          if (serverParcel.landValue) {
            localParcel.landValue = { ...serverParcel.landValue };
          }
        }
      }
    }
  }

  syncPlayers(serverPlayers) {
    // Update player list in UI
    this.updatePlayersCount(serverPlayers.length);
    this.updateLeaderboard(serverPlayers);
  }

  syncVitality(serverVitality) {
    if (!serverVitality || !this.game) return;
    
    // Update vitality data from server
    if (serverVitality.supply) {
      this.game.vitalitySupply = { ...serverVitality.supply };
    }
    if (serverVitality.demand) {
      this.game.vitalityDemand = { ...serverVitality.demand };
    }
    if (serverVitality.scores) {
      this.game.vitality = { ...this.game.vitality, ...serverVitality.scores };
    }
    
    // Update vitality display without recalculating
    if (this.game.updateVitalityDisplay) {
      this.game.updateVitalityDisplay();
    }
  }

  syncGovernance(serverGovernance) {
    if (this.game.governance) {
      Object.assign(this.game.governance, serverGovernance);
      
      // Update governance UI if open
      if (document.getElementById('governance-modal').classList.contains('visible')) {
        this.game.updateGovernanceUI();
      }
    }
  }

  // Action handling with optimistic updates
  sendAction(action) {
    if (!this.connected) {
      console.warn('Not connected to server');
      return;
    }

    // Apply optimistic update locally
    const localResult = this.applyLocalAction(action);
    
    if (localResult.success) {
      // Store action for potential rollback
      this.localActions.push({
        action,
        timestamp: Date.now(),
        localResult
      });

      // Send to server
      this.socket.emit('playerAction', action);
      
      // Re-render immediately
      this.game.render();
    }

    return localResult;
  }

  applyLocalAction(action) {
    // Apply the action locally for immediate feedback
    switch (action.type) {
      case 'buyParcel':
        return this.localBuyParcel(action.data);
      case 'buildStructure':
        return this.localBuildStructure(action.data);
      case 'sellProperty':
        return this.localSellProperty(action.data);
      default:
        return { success: false, error: 'Unknown action type' };
    }
  }

  localBuyParcel({ row, col, bidAmount }) {
    const parcel = this.game.grid[row][col];
    
    if (!parcel || (parcel.owner && parcel.owner !== 'unclaimed')) {
      return { success: false, error: 'Invalid parcel or already owned' };
    }

    if (this.playerData.cash < bidAmount) {
      return { success: false, error: 'Insufficient funds' };
    }

    // Apply changes locally
    parcel.owner = this.playerId;
    this.playerData.cash -= bidAmount;
    this.game.playerCash = this.playerData.cash;
    
    return { success: true };
  }

  localBuildStructure({ row, col, buildingId }) {
    const parcel = this.game.grid[row][col];
    
    if (!parcel || parcel.owner !== this.playerId || parcel.building) {
      return { success: false, error: 'Cannot build here' };
    }

    const buildingCost = this.game.getBuildingCost ? this.game.getBuildingCost(buildingId) : 5000;
    
    if (this.playerData.cash < buildingCost) {
      return { success: false, error: 'Insufficient funds' };
    }

    // Apply changes locally
    parcel.building = buildingId;
    this.playerData.cash -= buildingCost;
    this.game.playerCash = this.playerData.cash;
    
    return { success: true };
  }

  handleGameUpdate(update) {
    // Remove matching local action (server confirmed)
    this.localActions = this.localActions.filter(
      local => !this.actionsMatch(local.action, update.action)
    );

    // Apply server update (in case of conflicts)
    this.applyServerUpdate(update);
    
    // Re-render
    this.game.render();
  }

  actionsMatch(localAction, serverAction) {
    return localAction.type === serverAction.type &&
           JSON.stringify(localAction.data) === JSON.stringify(serverAction.data);
  }

  applyServerUpdate(update) {
    const { action, result, playerId } = update;
    
    // Apply the authoritative server result
    switch (action.type) {
      case 'buyParcel':
        if (result.parcel) {
          const parcel = this.game.grid[result.parcel.row][result.parcel.col];
          if (parcel) {
            parcel.owner = result.parcel.owner;
            if (result.parcel.landValue) {
              parcel.landValue.currentValue = result.parcel.landValue.currentValue;
              parcel.landValue.paidPrice = result.parcel.landValue.paidPrice;
              parcel.landValue.lastAuctionDay = result.parcel.landValue.lastAuctionDay;
            }
          }
        }
        
        // Update player cash if this is our action
        if (playerId === this.playerId && result.player) {
          this.playerData.cash = result.player.cash;
          this.game.playerCash = result.player.cash;
          this.game.updatePlayerStats();
          this.game.updateVitalityDisplay();
        }
        break;
      
      case 'buildStructure':
        if (result.parcel) {
          const parcel = this.game.grid[result.parcel.row][result.parcel.col];
          if (parcel) {
            parcel.building = result.parcel.building;
            parcel.buildingAge = result.parcel.buildingAge || 0;
          }
        }
        
        // Update player cash if this is our action
        if (playerId === this.playerId && result.player) {
          this.playerData.cash = result.player.cash;
          this.game.playerCash = result.player.cash;
          this.game.updatePlayerStats();
          this.game.updateVitalityDisplay();
        }
        break;
    }
    
    // Always recalculate land values and vitality for any changes
    if (this.game.updateAllLandValues) {
      this.game.updateAllLandValues();
    }
    if (this.game.updateVitalityDisplay) {
      this.game.updateVitalityDisplay();
    }
    if (this.game.updateDemographicsDisplay) {
      this.game.updateDemographicsDisplay();
    }
    if (this.game.calculateCurrentCashflow) {
      this.game.calculateCurrentCashflow();
    }
  }

  rollbackAction(failedAction) {
    // Find and remove the failed local action
    const actionIndex = this.localActions.findIndex(
      local => this.actionsMatch(local.action, failedAction)
    );

    if (actionIndex !== -1) {
      const localAction = this.localActions[actionIndex];
      this.localActions.splice(actionIndex, 1);

      // Rollback the changes
      this.revertLocalAction(localAction.action);
      
      // Re-render
      this.game.render();
    }
  }

  revertLocalAction(action) {
    // Revert local changes
    switch (action.type) {
      case 'buyParcel':
        const parcel = this.game.grid[action.data.row][action.data.col];
        if (parcel && parcel.owner === this.playerId) {
          parcel.owner = null;
          this.playerData.cash += action.data.bidAmount;
        }
        break;
      
      case 'buildStructure':
        const buildingParcel = this.game.grid[action.data.row][action.data.col];
        if (buildingParcel && buildingParcel.building === action.data.buildingId) {
          buildingParcel.building = null;
          this.playerData.cash += 5000; // Should match building cost
        }
        break;
    }
  }

  // Event handlers
  handleMarketUpdate(data) {
    // Update local market conditions
    if (this.game.market) {
      Object.assign(this.game.market, data.market);
    }

    // Show notification
    this.addChatMessage(`Market update: ${data.market.conditions}`, 'system');
  }

  handleRandomEvent(event) {
    // Show event notification
    this.showEventNotification(event);
    this.addChatMessage(`📢 ${event.title}: ${event.description}`, 'event');
  }

  showEventNotification(event) {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.className = 'event-notification';
    notification.innerHTML = `
      <div class="event-header">
        <h4>⚡ ${event.title}</h4>
      </div>
      <div class="event-description">
        ${event.description}
      </div>
    `;

    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 500);
    }, 5000);
  }

  handleGameEnd(results) {
    // Show final results
    this.showGameResults(results);
  }

  showGameResults(results) {
    const modal = document.createElement('div');
    modal.className = 'game-results-modal';
    modal.innerHTML = `
      <div class="results-content">
        <h2>🏁 Game Over!</h2>
        <div class="final-leaderboard">
          <h3>Final Rankings</h3>
          <ol>
            ${results.leaderboard.map(player => `
              <li>
                <span class="player-info">
                  ${player.emoji} ${player.name}
                </span>
                <span class="player-wealth">$${player.wealth.toLocaleString()}</span>
              </li>
            `).join('')}
          </ol>
        </div>
        <div class="city-stats">
          <h3>City Performance</h3>
          <p>City Score: ${results.cityScore.totalScore}</p>
          <p>Ranking Bonus: ${((results.cityRankingMultiplier - 1) * 100).toFixed(0)}%</p>
        </div>
        <button class="play-again-btn" onclick="location.reload()">Play Again</button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // UI Updates
  updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      const dot = statusEl.querySelector('.status-dot');
      const text = statusEl.querySelector('.status-text');
      
      dot.className = `status-dot ${status}`;
      text.textContent = message;
    }
  }

  updatePlayersCount(count) {
    const countEl = document.getElementById('players-count');
    if (countEl) {
      countEl.textContent = count;
    }
  }

  updateLeaderboard(players) {
    const leaderboardContent = document.getElementById('leaderboard-content');
    if (!leaderboardContent || !players) return;
    
    // Store player information for use in other parts of the game
    this.lastKnownPlayers = players;

    leaderboardContent.innerHTML = players.map((player, index) => `
      <div class="leaderboard-entry ${player.id === this.playerId ? 'self' : ''}">
        <span class="rank">${index + 1}</span>
        <span class="player-name" style="color: ${player.color}">
          ${player.emoji} ${player.name}
        </span>
        <span class="player-wealth">$${player.wealth ? player.wealth.toLocaleString() : '0'}</span>
      </div>
    `).join('');
  }

  startGameTimer(gameTime) {
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;

    const updateTimer = () => {
      const remaining = gameTime.totalDuration - gameTime.elapsed;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      
      if (remaining > 0) {
        setTimeout(updateTimer, 1000);
      }
    };

    updateTimer();
  }

  addChatMessage(content, type = 'system', playerName = '', playerColor = '#ffffff') {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${type}`;
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let messageHTML = '';
    if (type === 'player') {
      messageHTML = `
        <span class="message-time">${timestamp}</span>
        <span class="message-player" style="color: ${playerColor}">${playerName}:</span>
        <span class="message-content">${content}</span>
      `;
    } else {
      messageHTML = `
        <span class="message-time">${timestamp}</span>
        <span class="message-content">${content}</span>
      `;
    }

    messageEl.innerHTML = messageHTML;
    messagesEl.appendChild(messageEl);

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Remove old messages (keep last 50)
    const messages = messagesEl.children;
    while (messages.length > 50) {
      messagesEl.removeChild(messages[0]);
    }
  }

  // Reconnection logic
  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.updateConnectionStatus('error', 'Connection failed');
      return;
    }

    this.reconnectAttempts++;
    this.updateConnectionStatus('reconnecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (this.socket) {
        this.socket.connect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  // Cleanup
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
    this.playerData = null;
  }
}

// Export for use in the main game
window.MultiplayerClient = MultiplayerClient;