/**
 * 🍺 The Commons Beer Hall Lobby System
 *
 * Isolated multiplayer matchmaking system that handles:
 * - Player setup (name, color)
 * - Table preferences (3-12 players)
 * - Beer hall table finding
 * - Ready check modal
 * - Cinematic game intro
 *
 * Zero dependencies on game logic - completely isolated system.
 */

class BeerHallLobby {
    constructor() {
        this.availableColors = [
            '#10AC84', '#EE5A6F', '#F8B500', '#6C5CE7', '#74B9FF',
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#FF7675', '#00B894', '#0984E3', '#A29BFE', '#FD79A8',
            '#E17055', '#00CEC9', '#6C5CE7', '#FDCB6E', '#E84393',
            '#2D3436', '#636E72', '#B2BEC3', '#DDD3D3', '#FF6348'
        ];

        // Player state
        this.selectedColor = null;
        this.playerName = '';
        this.playerPreferences = { minPlayers: 4, maxPlayers: 8 };
        this.playerId = null;

        // Current table state
        this.currentTable = null;
        this.isReady = false;
        this.takenColors = new Set(); // Track colors taken by other waiting players

        // DOM elements
        this.welcomeScreen = null;
        this.beerHallLobby = null;
        this.playerNameInput = null;
        this.colorSelector = null;
        this.findTableBtn = null;
        this.readyCheckModal = null;
        this.gameIntroModal = null;

        // State
        this.isInitialized = false;
        this.onGameStart = null;

        // WebSocket for real-time communication (isolated from main game)
        this.ws = null;
    }

    /**
     * Initialize the beer hall lobby system
     * @param {Function} gameStartCallback - Called when ready to start game with PlayerConfig and table data
     * @param {String} existingPlayerId - Optional existing player ID to use instead of generating new one
     */
    async initialize(gameStartCallback, existingPlayerId = null) {
        this.onGameStart = gameStartCallback;
        // V2: Player ID will be set by WebSocket CONNECTED message - don't generate here
        this.playerId = existingPlayerId || null;

        // Find DOM elements
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.beerHallLobby = document.getElementById('beer-hall-lobby');
        this.playerNameInput = document.getElementById('player-name');
        this.colorSelector = document.getElementById('color-selector');
        this.findTableBtn = document.getElementById('find-table-btn');
        this.readyCheckModal = document.getElementById('ready-check-modal');
        this.gameIntroModal = document.getElementById('game-intro-cinematic');

        if (!this.validateElements()) {
            throw new Error('Required beer hall elements not found in DOM');
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initialize color selection
        await this.populateColors();

        // Initialize WebSocket connection early to get playerId
        this.initializeWebSocket();

        // Show beer hall lobby
        this.showBeerHallLobby();

        // Check if SOLO mode is already selected and handle it
        this.checkInitialSizeSelection();

        this.isInitialized = true;
        console.log('🍺 Beer Hall Lobby initialized');
    }

    validateElements() {
        return this.welcomeScreen &&
               this.beerHallLobby &&
               this.playerNameInput &&
               this.colorSelector &&
               this.findTableBtn &&
               this.readyCheckModal &&
               this.gameIntroModal;
    }

    setupEventListeners() {
        // Find table button
        this.findTableBtn.addEventListener('click', () => this.handleFindTable());

        // Table size preferences
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleSizeSelection(e));
        });

        // Ready check actions
        document.getElementById('ready-btn').addEventListener('click', () => this.handleReadyUp());
        document.getElementById('leave-table-btn').addEventListener('click', () => this.handleLeaveTable());

        // Color regeneration
        document.getElementById('regenerate-colors-btn').addEventListener('click', () => this.regenerateColors());

        // Enter key support for name input
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleFindTable();
            }
        });
    }

    /**
     * Generate random colors from available pool, excluding taken colors
     */
    generateColors(count = 5) {
        // Filter out colors taken by other waiting players
        const availableColors = this.availableColors.filter(color => !this.takenColors.has(color));

        // Use Fisher-Yates shuffle for proper randomization
        const shuffled = [...availableColors];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, Math.min(count, availableColors.length));
    }

    /**
     * Populate color selection
     */
    async populateColors() {
        this.colorSelector.innerHTML = '';

        // Generate 5 random colors from the 30 available
        const colors = this.generateColors(5);

        colors.forEach((color, index) => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-option';
            colorDiv.style.backgroundColor = color;
            colorDiv.dataset.color = color;

            if (index === 0 && !this.selectedColor) {
                colorDiv.classList.add('selected');
                this.selectedColor = color;
            }

            colorDiv.addEventListener('click', () => this.selectColor(color));
            this.colorSelector.appendChild(colorDiv);
        });
    }

    /**
     * Select a color
     */
    selectColor(color) {
        // Remove previous selection
        document.querySelectorAll('.color-option').forEach(el => {
            el.classList.remove('selected');
        });

        // Add selection to clicked color
        document.querySelector(`[data-color="${color}"]`).classList.add('selected');
        this.selectedColor = color;
    }

    /**
     * Regenerate color options
     */
    regenerateColors() {
        this.populateColors();
    }

    /**
     * Handle table size selection
     */
    handleSizeSelection(e) {
        // Remove active from all buttons
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active to clicked button
        e.target.classList.add('active');

        // Parse preferences
        const sizeData = e.target.dataset.size;

        // Check if it's solo mode (data-size="1")
        if (sizeData === '1') {
            // Solo mode - player will start game by clicking "Enter the Commons"
            console.log('🎮 Solo mode selected - player controls when to start', sizeData);
            // No automatic start - player decides when to begin
            return;
        }

        // For other modes, parse the range format "2+" etc.
        let minPlayers, maxPlayers;
        if (sizeData.includes('+')) {
            minPlayers = parseInt(sizeData.replace('+', ''));
            maxPlayers = 12; // Default max for "6+" and "2+"
        } else if (sizeData === '12') {
            minPlayers = 12;
            maxPlayers = 12;
        } else if (sizeData.includes('-')) {
            // Handle range format like "3-6"
            const [min, max] = sizeData.split('-').map(n => parseInt(n));
            minPlayers = min;
            maxPlayers = max;
        } else {
            // Fallback - treat as single number
            minPlayers = parseInt(sizeData);
            maxPlayers = minPlayers;
        }

        this.playerPreferences = {
            minPlayers: minPlayers,
            maxPlayers: maxPlayers
        };

        // Update the player count display
        this.updatePlayerCount(1, maxPlayers);

        console.log('🎯 Table preference:', this.playerPreferences);
    }

    /**
     * Start solo game directly, bypassing lobby
     */
    async startSoloGame() {
        // Validate input
        const playerName = document.getElementById('player-name').value.trim() || 'Player';

        if (!this.selectedColor) {
            alert('Please select a color!');
            return;
        }

        console.log('🎮 Creating isolated solo table...');

        try {
            // Create isolated solo table via beer hall API
            const response = await fetch('/api/beer-hall/find-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerId: this.playerId,
                    playerName: playerName,
                    preferences: {
                        minPlayers: 1,
                        maxPlayers: 1  // Solo table: exactly 1 player
                    }
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('🎮 Solo table created:', result.table.id);

                // Create player config for solo mode
                const playerConfig = {
                    name: playerName,
                    color: this.selectedColor,
                    mode: 'solo',
                    id: this.playerId,
                    tableId: result.table.id,
                    timestamp: Date.now()
                };

                console.log('🎮 Starting solo game with config:', playerConfig);

                // Hide all lobby screens and start game
                this.hideAllLobbyScreens();

                // Call the game start callback
                if (this.onGameStart) {
                    this.onGameStart(playerConfig, { tableId: result.table.id, players: 1 });
                }
            } else {
                console.error('❌ Failed to create solo table:', result.error);
                alert('Failed to create solo game: ' + result.error);
            }

        } catch (error) {
            console.error('❌ Solo table creation failed:', error);
            alert('Failed to create solo game: ' + error.message);
        }
    }

    /**
     * Hide welcome screen
     */
    hideWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }
    }

    /**
     * Hide all lobby and chat screens for solo mode
     */
    hideAllLobbyScreens() {
        // Hide welcome screen
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }

        // Hide beer hall lobby
        if (this.beerHallLobby) {
            this.beerHallLobby.style.display = 'none';
        }

        // Hide multiplayer chat overlay
        const chatOverlay = document.getElementById('multiplayer-chat-overlay');
        if (chatOverlay) {
            chatOverlay.style.display = 'none';
        }

        // Hide any ready check modal
        if (this.readyCheckModal) {
            this.readyCheckModal.style.display = 'none';
        }
    }

    /**
     * Check if solo mode is already selected on initialization
     */
    checkInitialSizeSelection() {
        const activeButton = document.querySelector('.size-btn.active');
        if (activeButton && activeButton.dataset.size === '1') {
            console.log('🎮 SOLO mode detected on initialization - showing welcome screen (player controls when to start)');
            // Show welcome screen - player will start game by clicking "Enter the Commons"
            this.welcomeScreen.style.display = 'flex';
        } else if (activeButton) {
            // Set the correct player count for the active button
            const sizeData = activeButton.dataset.size;
            let maxPlayers = 6; // Default
            if (sizeData === '2+') maxPlayers = 12;
            else if (sizeData === '6+') maxPlayers = 12;
            else if (sizeData === '12') maxPlayers = 12;

            this.updatePlayerCount(1, maxPlayers);
        }
    }

    /**
     * Show beer hall lobby
     */
    showBeerHallLobby() {
        this.welcomeScreen.style.display = 'flex';
        this.beerHallLobby.style.display = 'flex';
    }

    /**
     * Handle enter the commons button
     */
    async handleFindTable() {
        this.playerName = this.playerNameInput.value.trim() || 'Player';

        if (!this.selectedColor) {
            alert('Please select a color!');
            return;
        }

        if (!this.playerId) {
            alert('Connecting to server... Please wait a moment and try again.');
            this.findTableBtn.textContent = '🚀 Enter The Commons';
            this.findTableBtn.disabled = false;
            return;
        }

        // Check if solo mode is selected
        const activeButton = document.querySelector('.size-btn.active');
        const isSoloMode = activeButton && activeButton.dataset.size === '1';

        if (isSoloMode) {
            // Handle solo mode
            console.log('🎮 Solo mode detected in handleFindTable - starting solo game');
            this.startSoloGame();
            return;
        }

        // Continue with multiplayer logic
        this.findTableBtn.textContent = '🚀 Entering...';
        this.findTableBtn.disabled = true;

        try {
            // Prepare player config for immediate game start
            const playerConfig = {
                id: this.playerId,
                name: this.playerName,
                color: this.selectedColor,
                preferences: this.playerPreferences,
                isMultiplayer: true,
                waitingForPlayers: true
            };

            console.log('🎮 Entering The Commons:', playerConfig);

            // Hide welcome screen immediately and start game
            this.welcomeScreen.style.display = 'none';

            // Start the game with multiplayer waiting state
            if (this.onGameStart) {
                this.onGameStart(playerConfig);
            }

            // Show chat overlay for multiplayer waiting
            this.showMultiplayerChat();

            // Initialize background multiplayer connection
            this.initializeMultiplayerConnection();

        } catch (error) {
            console.error('❌ Failed to enter the commons:', error);
            alert('Failed to enter the game: ' + error.message);
            this.findTableBtn.textContent = '🚀 Enter The Commons';
            this.findTableBtn.disabled = false;
            this.welcomeScreen.style.display = 'flex';
        }
    }

    /**
     * Initialize background multiplayer connection
     */
    initializeMultiplayerConnection() {
        // Join table in background without waiting
        this.joinTableInBackground();

        // WebSocket already initialized during lobby setup
    }

    /**
     * Join table in background
     */
    async joinTableInBackground() {
        try {
            console.log('🔄 Joining multiplayer table in background...');

            const response = await fetch('/api/beer-hall/find-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerId: this.playerId,
                    playerName: this.playerName,
                    preferences: this.playerPreferences
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentTable = result.table;
                console.log('🍻 Joined table in background:', this.currentTable);

                // Notify game about multiplayer connection
                if (window.game && window.game.handleMultiplayerJoined) {
                    window.game.handleMultiplayerJoined(this.currentTable);
                }
            } else {
                console.warn('⚠️ Failed to join table:', result.error);
                // Continue in solo mode if multiplayer fails
            }

        } catch (error) {
            console.warn('⚠️ Multiplayer connection failed, continuing in solo mode:', error);
            // Game should continue in solo mode
        }
    }

    /**
     * Initialize WebSocket connection
     */
    initializeWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return; // Already connected
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        console.log('🔌 Connecting to beer hall WebSocket...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('🔌 Beer Hall WebSocket connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const update = JSON.parse(event.data);
                    this.handleWebSocketUpdate(update);
                } catch (error) {
                    console.error('🔌 Failed to parse WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 Beer Hall WebSocket disconnected');
            };

            this.ws.onerror = (error) => {
                console.error('🔌 Beer Hall WebSocket error:', error);
            };

        } catch (error) {
            console.error('🔌 Failed to initialize WebSocket:', error);
        }
    }

    /**
     * Handle WebSocket updates
     */
    handleWebSocketUpdate(update) {
        console.log('📡 Beer Hall update:', update.type);

        switch (update.type) {
            case 'CONNECTED':
                console.log('🔗 Setting player ID from WebSocket:', update.playerId);
                this.playerId = update.playerId;
                break;

            case 'READY_CHECK_STARTED':
                this.showReadyCheck(update);
                break;

            case 'PLAYER_READY':
                this.updatePlayerReadyStatus(update);
                break;

            case 'GAME_STARTED':
                this.startGameCinematic(update);
                break;

            case 'PLAYER_JOINED':
                console.log('📡 Beer Hall: PLAYER_JOINED received:', update);
                this.handlePlayerJoined(update);
                break;

            case 'PLAYER_LEFT':
                this.handlePlayerLeft(update);
                break;

            case 'CHAT_MESSAGE':
                this.handleChatMessage(update);
                break;

            case 'START_GAME':
                this.handleGameStart(update);
                break;

            case 'ERROR':
                this.addSystemMessage(`❌ ${update.message}`);
                console.warn('⚠️ Server error:', update.message);
                break;

            default:
                console.log('📡 Unknown beer hall update:', update.type);
        }
    }

    /**
     * Show ready check modal
     */
    showReadyCheck(update) {
        console.log('🍻 Table ready check started!');

        const tableInfo = update.tableInfo;

        // Populate table info
        document.getElementById('table-info').innerHTML = `
            <strong>${tableInfo.name}</strong><br>
            ${tableInfo.players.length}/${tableInfo.maxPlayers} players at the table
        `;

        // Populate players list
        const playersContainer = document.getElementById('players-at-table');
        playersContainer.innerHTML = '';

        tableInfo.players.forEach(player => {
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.innerHTML = `
                <div class="player-name">${player.name}</div>
                <div class="player-color" style="background-color: ${player.color}"></div>
            `;
            playersContainer.appendChild(playerCard);
        });

        // Show modal
        this.readyCheckModal.style.display = 'flex';
    }

    /**
     * Handle ready up button
     */
    handleReadyUp() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'READY',
                playerId: this.playerId,
                ready: true
            }));

            this.isReady = true;
            document.getElementById('ready-btn').textContent = '✅ Ready!';
            document.getElementById('ready-btn').disabled = true;
            document.getElementById('ready-status').textContent = 'You are ready! Waiting for other players...';
        }
    }

    /**
     * Handle leave table button
     */
    handleLeaveTable() {
        this.readyCheckModal.style.display = 'none';
        this.findTableBtn.textContent = '🎯 Find My Table';
        this.findTableBtn.disabled = false;
        this.currentTable = null;
        this.isReady = false;

        if (this.ws) {
            this.ws.close();
        }
    }

    /**
     * Update player ready status
     */
    updatePlayerReadyStatus(update) {
        const playerCards = document.querySelectorAll('.player-card');
        // Update ready status visualization
        // This would be enhanced based on server data
    }

    /**
     * Update table status
     */
    updateTableStatus(update) {
        if (this.currentTable && update.players) {
            const statusContainer = document.getElementById('lobby-status');
            statusContainer.innerHTML = `
                <div class="status-text">🍻 At ${this.currentTable.name}</div>
                <div class="table-entry">
                    <div class="table-name">${this.currentTable.name}</div>
                    <div class="table-players">${update.players.length}/${this.currentTable.maxPlayers} players</div>
                </div>
            `;
        }
    }

    /**
     * Start game cinematic
     */
    startGameCinematic(update) {
        console.log('🎮 Starting game cinematic!');

        // Hide ready check modal
        this.readyCheckModal.style.display = 'none';

        // Show cinematic
        this.gameIntroModal.style.display = 'flex';

        // Populate players in cinematic
        const playersContainer = document.getElementById('cinematic-players');
        playersContainer.innerHTML = '';

        update.players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'cinematic-player';
            playerDiv.style.animationDelay = `${index * 0.1}s`;
            playerDiv.innerHTML = `
                <div class="cinematic-player-name">${player.name}</div>
                <div class="cinematic-player-color" style="background-color: ${player.color}"></div>
            `;
            playersContainer.appendChild(playerDiv);
        });

        // Start countdown
        this.startCountdown(update);
    }

    /**
     * Show multiplayer chat overlay
     */
    showMultiplayerChat() {
        const chatOverlay = document.getElementById('multiplayer-chat-overlay');
        const gameContainer = document.getElementById('game-container');

        if (chatOverlay && gameContainer) {
            // Add blur effect to game
            gameContainer.classList.add('game-blurred');

            // Show chat overlay
            chatOverlay.style.display = 'flex';

            // Set up chat functionality
            this.setupChatHandlers();

            // Add initial player to chat
            this.addPlayerToChat(this.playerName, this.selectedColor);

            console.log('💬 Multiplayer chat overlay shown');
        }
    }

    /**
     * Hide multiplayer chat overlay
     */
    hideMultiplayerChat() {
        const chatOverlay = document.getElementById('multiplayer-chat-overlay');
        const gameContainer = document.getElementById('game-container');

        if (chatOverlay && gameContainer) {
            chatOverlay.style.display = 'none';
            gameContainer.classList.remove('game-blurred');
        }
    }

    /**
     * Setup chat event handlers
     */
    setupChatHandlers() {
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const startGameBtn = document.getElementById('start-game-btn');

        // Chat input handlers
        if (chatInput && chatSend) {
            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (message) {
                    this.sendChatMessage(message);
                    chatInput.value = '';
                }
            };

            chatSend.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }

        // Start game button
        if (startGameBtn) {
            startGameBtn.addEventListener('click', () => {
                this.handleStartGame();
            });
        }
    }

    /**
     * Send chat message
     */
    sendChatMessage(message) {
        // Send to all players (including self) via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'CHAT_MESSAGE',
                playerId: this.playerId,
                playerName: this.playerName,
                message: message,
                color: this.selectedColor
            }));
        }
    }

    /**
     * Add chat message to the chat area
     */
    addChatMessage(playerName, message, color = null) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'player-message';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <span class="message-time">${time}</span>
            <span class="message-player" style="${color ? `color: ${color}` : ''}">${playerName}:</span>
            <span class="message-text">${message}</span>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Add system message to chat
     */
    addSystemMessage(message) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <span class="message-time">${time}</span>
            <span class="message-text">${message}</span>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Add player to chat player list
     */
    addPlayerToChat(playerName, color) {
        const playerList = document.getElementById('chat-player-list');
        if (!playerList) return;

        const playerDiv = document.createElement('div');
        playerDiv.className = 'chat-player';
        playerDiv.dataset.playerId = this.playerId;

        playerDiv.innerHTML = `
            <div class="chat-player-color" style="background-color: ${color}"></div>
            <div class="chat-player-name">${playerName}</div>
        `;

        playerList.appendChild(playerDiv);
    }

    /**
     * Update player count in chat
     */
    updatePlayerCount(current, max) {
        const currentPlayersSpan = document.getElementById('current-players');
        const maxPlayersSpan = document.getElementById('max-players');
        const chatActions = document.getElementById('chat-actions');

        if (currentPlayersSpan) currentPlayersSpan.textContent = current;
        if (maxPlayersSpan) maxPlayersSpan.textContent = max;

        // Show start game button when minimum players reached (2 for testing)
        if (chatActions && current >= 2) {
            chatActions.style.display = 'block';
        }
    }

    /**
     * Handle start game button
     */
    handleStartGame() {
        // Send start game signal to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'START_GAME',
                playerId: this.playerId
            }));
        }

        this.addSystemMessage('Starting game...');
    }

    /**
     * Handle player joined event
     */
    handlePlayerJoined(update) {
        if (update.player && update.players) {
            this.addSystemMessage(`${update.player.name} joined the game`);
            this.updatePlayerCount(update.players.length, this.currentTable?.maxPlayers || 6);

            // Add player to chat list
            this.addPlayerToChat(update.player.name, update.player.color);
        }
    }

    /**
     * Handle player left event
     */
    handlePlayerLeft(update) {
        if (update.playerId && update.players) {
            this.addSystemMessage('A player left the game');
            this.updatePlayerCount(update.players.length, this.currentTable?.maxPlayers || 6);

            // Remove player from chat list
            const playerDiv = document.querySelector(`[data-player-id="${update.playerId}"]`);
            if (playerDiv) {
                playerDiv.remove();
            }
        }
    }

    /**
     * Handle chat message from other players
     */
    handleChatMessage(update) {
        // Add all messages from server broadcast (including our own)
        this.addChatMessage(update.playerName, update.message, update.color);
    }

    /**
     * Handle game start event
     */
    handleGameStart(update) {
        this.addSystemMessage('Game is starting! Get ready...');

        // Hide chat and start the countdown
        setTimeout(() => {
            this.hideMultiplayerChat();
            this.startCountdown(update);
        }, 1000);
    }

    /**
     * Start countdown and transition to game
     */
    startCountdown(gameData) {
        let countdown = 3;
        const countdownElement = document.getElementById('countdown');

        const countdownInterval = setInterval(() => {
            countdownElement.textContent = countdown;
            countdown--;

            if (countdown < 0) {
                clearInterval(countdownInterval);

                // Hide welcome screen and cinematic
                this.welcomeScreen.style.display = 'none';
                this.gameIntroModal.style.display = 'none';

                // Prepare player config for game
                const playerConfig = {
                    id: this.playerId,
                    name: this.playerName,
                    color: this.selectedColor,
                    tableData: gameData,
                    isMultiplayer: true
                };

                // Start the game!
                if (this.onGameStart) {
                    this.onGameStart(playerConfig);
                }
            }
        }, 1000);
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BeerHallLobby;
} else {
    window.BeerHallLobby = BeerHallLobby;
}