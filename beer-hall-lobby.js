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
            '#E17055', '#00CEC9', '#FDCB6E', '#E84393', '#FF6348',
            '#FF3838', '#FF9500', '#FFD93D', '#6BCF7F', '#4D96FF',
            '#9775FA', '#FF8CC8', '#20E3B2', '#FFB8B8', '#C3FDB8'
        ];

        // Player state
        this.selectedColor = null;
        this.playerName = '';
        this.playerPreferences = { minPlayers: 4, maxPlayers: 8 };
        this.playerId = null;
        // Governance integration - use main system instead of parallel state

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

        // Connection manager reference for lobby communications
        this.connectionManager = null;
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

        // Initialize connection through ConnectionManager
        this.initializeConnection();

        // Show beer hall lobby
        this.showBeerHallLobby();

        // Check if SOLO mode is already selected and handle it
        this.checkInitialSizeSelection();

        this.isInitialized = true;
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
                // Apply initial selection styling
                colorDiv.style.transform = 'scale(1.1)';
                colorDiv.style.boxShadow = `0 0 12px ${color}80, 0 0 4px ${color}CC`;
                // Sync UI colors with the initially selected color
                setTimeout(() => this.syncUIColors(color), 50);
            }

            colorDiv.addEventListener('click', () => this.selectColor(color));
            this.colorSelector.appendChild(colorDiv);
        });
    }

    /**
     * Select a color
     */
    selectColor(color) {
        // Remove previous selection and styling
        document.querySelectorAll('.color-option').forEach(el => {
            el.classList.remove('selected');
            // Reset any dynamic styling
            el.style.transform = '';
            el.style.boxShadow = '';
        });

        // Add selection to clicked color with dynamic styling
        const selectedElement = document.querySelector(`[data-color="${color}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
            // Apply 10% bigger size and glow using the actual color
            selectedElement.style.transform = 'scale(1.1)';
            selectedElement.style.boxShadow = `0 0 12px ${color}80, 0 0 4px ${color}CC`;
        }

        this.selectedColor = color;

        // Sync header and game size colors with selected color
        this.syncUIColors(color);

        // Broadcast color change to other players in multiplayer
        if (window.gameEconomicClient) {
            window.gameEconomicClient.updatePlayerInfo();
        }

        // Don't animate on click - only on regeneration
    }

    /**
     * Sync header and game size selected colors with player color
     */
    syncUIColors(color) {
        // Update "The Commons" header text color - target beer lobby specifically
        const beerLobby = document.getElementById('beer-hall-lobby');
        if (beerLobby) {
            const headerTitle = beerLobby.querySelector('h1');
            if (headerTitle) {
                // Setting Commons title color
                // Remove inline style first, then apply new color with important
                headerTitle.removeAttribute('style');
                headerTitle.style.cssText = `font-size: 28px; color: ${color} !important; margin: 0 0 8px 0; font-weight: 600;`;
            } else {
                console.warn('⚠️ No h1 found in beer lobby');
            }
        } else {
            console.warn('⚠️ Beer lobby element not found');
        }

        // Update active size button with colored border, white text, no background change
        const activeSizeBtn = document.querySelector('.size-btn.active');
        if (activeSizeBtn) {
            activeSizeBtn.style.borderColor = color;
            activeSizeBtn.style.color = 'white';
            activeSizeBtn.style.boxShadow = `0 0 10px ${color}40`;
            // Ensure background doesn't change
            activeSizeBtn.style.backgroundColor = 'transparent';
        }

        // Update find table button
        const findTableBtn = document.getElementById('find-table-btn');
        if (findTableBtn) {
            findTableBtn.style.backgroundColor = color;
        }
    }

    /**
     * Add subtle bouncy wave animation with smooth color transitions
     */
    animateColorWave() {
        const colorOptions = document.querySelectorAll('.color-option');

        // Add wave animation with random duration variations and color transitions
        colorOptions.forEach((option, index) => {
            option.style.animation = 'none';
            option.offsetHeight; // Trigger reflow

            // Random variation: ±4% of base duration (0.3s base)
            const baseDuration = 0.3;
            const variation = (Math.random() - 0.5) * 0.08; // ±4%
            const duration = baseDuration + (baseDuration * variation);

            // Add transition for smooth color change
            option.style.transition = 'background-color 0.15s ease-out';

            // Calculate exact midpoint of the bounce animation for this element
            // Animation starts after index * 0.05s delay
            const animationDelay = index * 0.05;
            const animationMidpoint = animationDelay + (duration / 2);

            // Change color at the exact midpoint of the bounce (50% keyframe)
            setTimeout(() => {
                option.style.backgroundColor = option.dataset.color;
            }, animationMidpoint * 1000); // Convert to milliseconds

            option.style.animation = `colorWave ${duration}s ease-out ${animationDelay}s`;
        });

        // Create the subtle wave keyframes if they don't exist
        if (!document.getElementById('color-wave-styles')) {
            const style = document.createElement('style');
            style.id = 'color-wave-styles';
            style.textContent = `
                @keyframes colorWave {
                    0% { transform: scale(1) translateY(0); }
                    50% { transform: scale(1.08) translateY(-2px); }
                    100% { transform: scale(1) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Regenerate color options
     */
    regenerateColors() {
        this.populateColors();

        // Apply wave animation to new colors
        setTimeout(() => this.animateColorWave(), 100);
    }

    /**
     * Handle table size selection
     */
    handleSizeSelection(e) {
        // Remove active from all buttons and reset their styles
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.boxShadow = '';
            btn.style.backgroundColor = '';
        });

        // Add active to clicked button
        e.target.classList.add('active');

        // Sync colors with the newly active button
        if (this.selectedColor) {
            this.syncUIColors(this.selectedColor);
        }

        // Parse preferences
        const sizeData = e.target.dataset.size;

        // Check if it's solo mode (data-size="1")
        if (sizeData === '1') {
            // Solo mode - player will start game by clicking "Enter the Commons"
            // Solo mode selected - player controls when to start
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

        // Table preference set
    }

    /**
     * Start solo game directly, bypassing lobby
     */
    async startSoloGame() {
        // Validate input
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        this.playerName = playerName; // Store for WebSocket identification

        if (!this.selectedColor) {
            alert('Please select a color!');
            return;
        }

        // Creating isolated solo table

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
                    playerColor: this.selectedColor,
                    preferences: {
                        minPlayers: 1,
                        maxPlayers: 1  // Solo table: exactly 1 player
                    }
                })
            });

            const result = await response.json();

            if (result.success) {
                // Solo table created successfully

                // Create player config for solo mode
                const playerConfig = {
                    name: playerName,
                    color: this.selectedColor,
                    mode: 'solo',
                    id: this.playerId,
                    tableId: result.table.id,
                    timestamp: Date.now()
                    // Governance preferences now handled by main governance system
                };

                // Starting solo game

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

        // Remove blur classes from body
        document.body.classList.remove('beer-hall-active', 'ready-check-active');
    }

    /**
     * Check if solo mode is already selected on initialization
     */
    checkInitialSizeSelection() {
        const activeButton = document.querySelector('.size-btn.active');
        if (activeButton && activeButton.dataset.size === '1') {
            // SOLO mode detected - showing welcome screen
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
        document.body.classList.add('beer-hall-active');
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

        // Always require server connection
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
            // Handle solo mode through server
            // Solo mode detected - starting solo game
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
                // Governance preferences now handled by main governance system
            };

            // Entering The Commons

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
            // Joining multiplayer table in background

            const response = await fetch('/api/beer-hall/find-table', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerId: this.playerId,
                    playerName: this.playerName,
                    playerColor: this.selectedColor,
                    preferences: this.playerPreferences
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentTable = result.table;
                // Joined table in background

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
     * Initialize connection through ConnectionManager
     */
    async initializeConnection() {
        this.connectionManager = window.connectionManager;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect to the same server that served the page
        const host = window.location.host; // Uses current port automatically
        const wsUrl = `${protocol}//${host}/ws`;

        try {
            // Connect to server via ConnectionManager
            await this.connectionManager.connect(wsUrl);
            console.log('✅ Beer Hall connected via ConnectionManager');

            // Subscribe to lobby-specific messages
            this.setupLobbySubscriptions();

        } catch (error) {
            console.error('🔌 Failed to initialize connection:', error);
        }
    }

    /**
     * Set up message subscriptions for lobby functionality
     */
    setupLobbySubscriptions() {
        // Subscribe to lobby-specific messages
        this.connectionManager.subscribe('CONNECTED', (message) => {
            this.playerId = message.playerId;
            console.log('🍺 Beer Hall received player ID:', this.playerId);
        });

        this.connectionManager.subscribe('TABLE_FOUND', (message) => {
            this.handleTableFound(message);
        });

        this.connectionManager.subscribe('PLAYER_JOINED', (message) => {
            this.handlePlayerJoined(message);
        });

        this.connectionManager.subscribe('PLAYER_LEFT', (message) => {
            this.handlePlayerLeft(message);
        });

        this.connectionManager.subscribe('PLAYER_DISCONNECTED', (message) => {
            this.handlePlayerLeft(message);
        });

        this.connectionManager.subscribe('READY_UPDATE', (message) => {
            this.handleReadyUpdate(message);
        });

        this.connectionManager.subscribe('READY_CHECK_STARTED', (message) => {
            this.showReadyCheck(message);
        });

        this.connectionManager.subscribe('GAME_STARTING', (message) => {
            this.handleGameStarting(message);
        });

        this.connectionManager.subscribe('COUNTDOWN_UPDATE', (message) => {
            this.handleCountdownUpdate(message);
        });

        this.connectionManager.subscribe('START_GAME', (message) => {
            this.handleGameStart(message);
        });

        this.connectionManager.subscribe('GAME_STARTED', (message) => {
            this.startGameCinematic(message);
        });

        this.connectionManager.subscribe('PLAYER_READY', (message) => {
            this.updatePlayerReadyStatus(message);
        });

        this.connectionManager.subscribe('CHAT_MESSAGE', (message) => {
            this.handleChatMessage(message);
        });

        this.connectionManager.subscribe('TABLE_STATUS', (message) => {
            this.handleTableStatus(message);
        });

        // Connection events
        this.connectionManager.on('connected', () => {
            console.log('🍺 Beer Hall: Connection established');
        });

        this.connectionManager.on('disconnected', () => {
            console.warn('🍺 Beer Hall: Connection lost');
        });

        this.connectionManager.on('reconnecting', (data) => {
            console.log(`🍺 Beer Hall: Reconnecting (attempt ${data.attempt})`);
        });
    }



    /**
     * Show ready check modal
     */
    showReadyCheck(update) {
        // Table ready check started

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
        document.body.classList.add('ready-check-active');
    }

    /**
     * Handle ready up button
     */
    handleReadyUp() {
        if (this.connectionManager && this.connectionManager.isConnected) {
            this.connectionManager.send({
                type: 'READY',
                playerId: this.playerId,
                ready: true
            });

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

        if (this.connectionManager) {
            this.connectionManager.disconnect();
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
     * Handle game starting message
     */
    handleGameStarting(message) {
        console.log('🎮 Game is starting with countdown:', message.countdown);
        this.addSystemMessage(`Game starting in ${message.countdown} seconds!`);

        // Show countdown overlay if we have a chat overlay
        this.showCountdownOverlay(message.countdown);
    }

    /**
     * Handle countdown update message
     */
    handleCountdownUpdate(message) {
        console.log(`⏰ Client received countdown update: ${message.countdown}`);
        this.updateCountdownDisplay(message.countdown);
        this.addSystemMessage(`Starting in ${message.countdown}...`);

        // Hide countdown when it reaches 0
        if (message.countdown === 0) {
            console.log('⏰ Countdown reached 0, hiding overlay');
            this.hideCountdownOverlay();
        }
    }

    /**
     * Start game cinematic
     */
    startGameCinematic(update) {
        if (window.DEBUG_MODE) {
            console.log('✅ Starting game cinematic!');
        }

        // Hide countdown overlay
        this.hideCountdownOverlay();

        // Hide ready check modal
        this.readyCheckModal.style.display = 'none';

        // Show cinematic
        this.gameIntroModal.style.display = 'flex';

        // V2: Extract city name for current player from GAME_STARTED message
        console.log('🏙️ CLIENT DEBUG: GAME_STARTED message received:', JSON.stringify(update, null, 2));
        const players = update.eventData?.players || update.players || [];
        console.log('🏙️ CLIENT DEBUG: players array:', players);
        console.log('🏙️ CLIENT DEBUG: current playerId:', this.playerId);
        const currentPlayer = players.find(p => p.id === this.playerId);
        console.log('🏙️ CLIENT DEBUG: found currentPlayer:', currentPlayer);

        if (currentPlayer && currentPlayer.cityName) {
            console.log('🏙️ CLIENT DEBUG: City name found:', currentPlayer.cityName);
            // Store city name for UI display
            localStorage.setItem('playerCityName', currentPlayer.cityName);
            // Update UI immediately if game exists
            if (window.game && window.game.updateCityNameFromServer) {
                window.game.updateCityNameFromServer(currentPlayer.cityName);
            }
        } else {
            console.warn('⚠️ City name not found in GAME_STARTED message');
            console.warn('⚠️ currentPlayer:', currentPlayer);
            console.warn('⚠️ playerId:', this.playerId);
            console.warn('⚠️ players:', players);
        }

        // Populate players in cinematic
        const playersContainer = document.getElementById('cinematic-players');
        playersContainer.innerHTML = '';

        players.forEach((player, index) => {
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

            // Update waiting text based on player preferences
            this.updateWaitingText();

            // Set up chat functionality
            this.setupChatHandlers();

            // Add initial player to chat
            this.addPlayerToChat(this.playerName, this.selectedColor);

            // Multiplayer chat overlay shown
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
                if (!startGameBtn.disabled) {
                    this.handleStartGame();
                }
            });
        }

        // Setup emoji buttons
        this.setupEmojiButtons();

        // Setup governance panel
        this.setupGovernancePanel();

        // Setup tab switching
        this.setupTabSwitching();

        // Governance integration now uses main GovernanceSystem directly
    }

    /**
     * Setup emoji quick buttons
     */
    setupEmojiButtons() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;

        // Create emoji button container if it doesn't exist
        let emojiContainer = document.getElementById('emoji-buttons');
        if (!emojiContainer) {
            emojiContainer = document.createElement('div');
            emojiContainer.id = 'emoji-buttons';
            emojiContainer.className = 'emoji-buttons';

            const emojis = [
                { emoji: '👋', label: 'Wave' },
                { emoji: '👍', label: 'Thumbs up' },
                { emoji: '❤️', label: 'Heart' },
                { emoji: '🏢', label: 'Building' },
                { emoji: '🚀', label: 'Rocket' },
                { emoji: '💰', label: 'Money' },
                { emoji: '🔥', label: 'Fire' },
                { emoji: '🎯', label: 'Target' }
            ];

            emojis.forEach(({ emoji }) => {
                const btn = document.createElement('button');
                btn.className = 'emoji-btn';
                btn.textContent = emoji;
                btn.addEventListener('click', () => {
                    this.sendChatMessage(emoji);
                });
                emojiContainer.appendChild(btn);
            });

            // Insert before chat input area
            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) {
                inputArea.parentNode.insertBefore(emojiContainer, inputArea);
            }
        }
    }

    /**
     * Send chat message
     */
    sendChatMessage(message) {
        // Send to all players (including self) via WebSocket
        if (this.connectionManager && this.connectionManager.isConnected) {
            this.connectionManager.send({
                type: 'CHAT_MESSAGE',
                playerId: this.playerId,
                playerName: this.playerName,
                message: message,
                color: this.selectedColor
            });
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

        messageDiv.innerHTML = `
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

        messageDiv.innerHTML = `
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
        const startGameBtn = document.getElementById('start-game-btn');

        if (currentPlayersSpan) currentPlayersSpan.textContent = current;
        if (maxPlayersSpan) maxPlayersSpan.textContent = max;

        // Enable/disable start game button based on threshold
        const minPlayers = this.playerPreferences.minPlayers || 2;
        if (startGameBtn) {
            if (current >= minPlayers) {
                startGameBtn.disabled = false;
                startGameBtn.textContent = '🚀 Start Game Now';
            } else {
                startGameBtn.disabled = true;
                startGameBtn.textContent = `⏳ Need ${minPlayers - current} more player${minPlayers - current > 1 ? 's' : ''}`;
            }
        }
    }

    /**
     * Update waiting text based on player preferences
     */
    updateWaitingText() {
        const waitingStatus = document.querySelector('.waiting-status');
        const maxPlayersSpan = document.getElementById('max-players');

        if (!waitingStatus || !this.playerPreferences) return;

        const min = this.playerPreferences.minPlayers;
        const max = this.playerPreferences.maxPlayers;

        let waitingText = '';
        let displayMax = max;

        if (min === 1 && max === 1) {
            waitingText = 'Solo mode';
            displayMax = 1;
        } else if (min === 2 && max === 12) {
            waitingText = 'Waiting for 2 or more total players';
            displayMax = '2+';
        } else if (min === 6 && max === 12) {
            waitingText = 'Waiting for 6 or more total players';
            displayMax = '6+';
        } else if (min === 12 && max === 12) {
            waitingText = 'Waiting for exactly 12 players';
            displayMax = 12;
        } else {
            waitingText = `Waiting for ${min}-${max} players`;
            displayMax = max;
        }

        waitingStatus.textContent = waitingText;
        if (maxPlayersSpan) maxPlayersSpan.textContent = displayMax;
    }

    /**
     * Handle start game button
     */
    handleStartGame() {
        // Send start game signal to server
        if (this.connectionManager && this.connectionManager.isConnected) {
            this.connectionManager.send({
                type: 'START_GAME',
                playerId: this.playerId
            });
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

    // syncGovernanceFromServer method removed - now using main governance system

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

                // Don't create a new game - just transition the existing one
                // The game was already started with proper server synchronization
                console.log('🎮 Countdown complete - transitioning to synchronized game');

                // Request chat history before transitioning to in-game
                console.log('💬 Requesting chat history for in-game transition');
                this.requestChatHistory();

                // Hide multiplayer chat overlay if active
                this.hideMultiplayerChat();

                // Remove blur from game container
                const gameContainer = document.getElementById('game-container');
                if (gameContainer) {
                    gameContainer.classList.remove('game-blurred');
                }

                // Hide any remaining lobby elements
                document.body.classList.remove('beer-hall-active', 'ready-check-active');
            }
        }, 1000);
    }

    /**
     * Setup tab switching between chat and governance
     */
    setupTabSwitching() {
        const tabs = document.querySelectorAll('.chat-tab');
        const governanceOverlay = document.getElementById('governance-overlay');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Remove active from all tabs
                tabs.forEach(t => t.classList.remove('active'));

                // Add active to clicked tab
                tab.classList.add('active');

                // Show/hide governance overlay based on tab selection
                if (targetTab === 'governance') {
                    if (governanceOverlay) {
                        governanceOverlay.style.display = 'block';
                    }
                } else {
                    if (governanceOverlay) {
                        governanceOverlay.style.display = 'none';
                    }
                }
            });
        });
    }

    /**
     * Setup governance priorities panel using main governance system
     */
    setupGovernancePanel() {
        this.renderGovernanceCategories();
        this.setupGovernanceHandlers();
    }

    /**
     * Render governance categories using static category list
     */
    renderGovernanceCategories() {
        const container = document.getElementById('governance-categories');
        if (!container) return;

        container.innerHTML = '';

        // Pre-game LVT setup only - get current rate
        const governanceSystem = window.game?.governanceSystem;
        const currentRate = governanceSystem?.governance?.taxRate || 0.50;
        const ratePercent = (currentRate * 100).toFixed(0);

        // Create enhanced LVT voting interface
        const lvtVotingDiv = document.createElement('div');
        lvtVotingDiv.className = 'lvt-voting-interface';
        lvtVotingDiv.innerHTML = `
            <div class="lvt-main-display">
                <div class="lvt-title">
                    <span class="lvt-icon">🏛️</span>
                    <h4>Land Value Tax Rate</h4>
                    <span class="lvt-subtitle">The Heart of Your City's Economics</span>
                </div>
                <div class="lvt-current-rate">
                    <span class="rate-value">${ratePercent}%</span>
                    <span class="rate-label">Current Rate</span>
                </div>
            </div>

            <div class="lvt-voting-section">
                <div class="voting-controls">
                    <button class="lvt-vote-btn decrease" data-action="decrease" data-category="lvt">
                        <span class="vote-symbol">−</span>
                        <span class="vote-text">Lower Rate</span>
                    </button>

                    <div class="voting-status">
                        <div class="my-votes">
                            <span class="vote-count" data-category="lvt">0</span>
                            <span class="vote-label">Your Votes</span>
                        </div>
                        <div class="points-remaining">
                            <span class="points-count">${governanceSystem?.governance?.votingPoints || 4}</span>
                            <span class="points-label">Points Left</span>
                        </div>
                    </div>

                    <button class="lvt-vote-btn increase" data-action="increase" data-category="lvt">
                        <span class="vote-symbol">+</span>
                        <span class="vote-text">Raise Rate</span>
                    </button>
                </div>

            </div>
        `;
        container.appendChild(lvtVotingDiv);

        this.updatePointsDisplay();
    }

    /**
     * Setup governance event handlers
     */
    setupGovernanceHandlers() {
        // Point allocation buttons (legacy and new LVT buttons)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('point-btn') || e.target.classList.contains('lvt-vote-btn') || e.target.closest('.lvt-vote-btn')) {
                const button = e.target.closest('.point-btn, .lvt-vote-btn') || e.target;
                const action = button.dataset.action;
                const category = button.dataset.category;
                this.handlePointAllocation(category, action);
            }
        });

        // Reset button
        const resetBtn = document.getElementById('reset-governance');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetGovernancePoints();
            });
        }

        // Save button
        const saveBtn = document.getElementById('save-governance');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveGovernancePreferences();
            });
        }
    }

    /**
     * Handle point allocation using main governance system
     */
    async handlePointAllocation(category, action) {
        // Get main governance system
        const governanceSystem = window.game?.governanceSystem;
        if (!governanceSystem) {
            console.error('🏛️ Governance system not available');
            return;
        }

        try {
            let result = false;

            if (category === 'lvt') {
                // Check if game has started to determine which LVT voting system to use
                if (governanceSystem.governance.gameStarted) {
                    // Use server-side governance system for in-game LVT voting
                    if (action === 'increase') {
                        result = await governanceSystem.increaseLVTRate();
                    } else if (action === 'decrease') {
                        result = await governanceSystem.decreaseLVTRate();
                    }
                } else {
                    // Handle pre-game LVT voting locally with undo functionality
                if (!this.playerLVTVotes) this.playerLVTVotes = 0; // Track net votes: +1 for increase, -1 for decrease

                if (action === 'increase') {
                    if (governanceSystem.governance.votingPoints > 0) {
                        // Add increase vote
                        governanceSystem.governance.votingPoints -= 1;
                        this.playerLVTVotes += 1;
                        governanceSystem.governance.taxRate = Math.min(1.0, governanceSystem.governance.taxRate + 0.01);
                        result = true;
                    } else if (this.playerLVTVotes < 0) {
                        // Undo a decrease vote (refund point)
                        governanceSystem.governance.votingPoints += 1;
                        this.playerLVTVotes += 1;
                        governanceSystem.governance.taxRate = Math.min(1.0, governanceSystem.governance.taxRate + 0.01);
                        result = true;
                    } else {
                        result = false;
                    }
                } else if (action === 'decrease') {
                    if (governanceSystem.governance.votingPoints > 0) {
                        // Add decrease vote
                        governanceSystem.governance.votingPoints -= 1;
                        this.playerLVTVotes -= 1;
                        governanceSystem.governance.taxRate = Math.max(0.0, governanceSystem.governance.taxRate - 0.01);
                        result = true;
                    } else if (this.playerLVTVotes > 0) {
                        // Undo an increase vote (refund point)
                        governanceSystem.governance.votingPoints += 1;
                        this.playerLVTVotes -= 1;
                        governanceSystem.governance.taxRate = Math.max(0.0, governanceSystem.governance.taxRate - 0.01);
                        result = true;
                    } else {
                        result = false;
                    }
                }

                if (result) {
                    // Pre-game LVT vote processed
                }
                }
            } else {
                // Handle regular category voting
                if (action === 'increase') {
                    result = await governanceSystem.addCategoryVote(category);
                } else if (action === 'decrease') {
                    result = await governanceSystem.removeCategoryVote(category);
                }
            }

            if (result) {
                // Update display after successful vote
                this.updatePointsDisplay();

                // Send chat message about the change
                const categoryName = this.getCategoryDisplayName(category);
                const actionText = action === 'increase' ? 'increased' : 'decreased';
                this.sendChatMessage(`${actionText} ${categoryName} priority`);
            }
        } catch (error) {
            console.error('🏛️ Error handling point allocation:', error);
        }
    }

    /**
     * Get display name for category
     */
    getCategoryDisplayName(category) {
        const categoryNames = {
            education: 'Education',
            healthcare: 'Healthcare',
            infrastructure: 'Infrastructure',
            housing: 'Housing',
            culture: 'Culture',
            recreation: 'Recreation',
            commercial: 'Commercial',
            civic: 'Civic Services',
            emergency: 'Emergency',
            ubi: 'UBI',
            lvt: 'Land Value Tax'
        };
        return categoryNames[category] || category;
    }

    /**
     * Update points display using main governance system
     */
    updatePointsDisplay() {
        const governanceSystem = window.game?.governanceSystem;
        if (!governanceSystem) {
            return;
        }

        // Update available points from main system
        const availablePointsSpan = document.getElementById('available-points');
        if (availablePointsSpan) {
            availablePointsSpan.textContent = governanceSystem.governance.votingPoints;
        }

        // Update points-count in new interface
        const pointsCountSpan = document.querySelector('.points-count');
        if (pointsCountSpan) {
            pointsCountSpan.textContent = governanceSystem.governance.votingPoints;
        }

        // Update LVT vote count and rate
        const lvtVotes = governanceSystem.governance.playerVotes?.player?.lvtVotes || 0;
        const currentRate = governanceSystem?.governance?.taxRate || 0.50;
        const ratePercent = (currentRate * 100).toFixed(0);

        // Update vote count display
        const voteCountSpan = document.querySelector('.vote-count[data-category="lvt"]');
        if (voteCountSpan) {
            voteCountSpan.textContent = Math.abs(lvtVotes);
        }

        // Update current rate display
        const rateValueSpan = document.querySelector('.rate-value');
        if (rateValueSpan) {
            rateValueSpan.textContent = `${ratePercent}%`;
        }

        // Update legacy points display if it exists
        const pointsDisplay = document.querySelector(`[data-category="lvt"].points-display`);
        if (pointsDisplay) {
            pointsDisplay.textContent = Math.abs(lvtVotes);
        }

        // Update button states
        const increaseBtn = document.querySelector(`[data-category="lvt"][data-action="increase"]`);
        const decreaseBtn = document.querySelector(`[data-category="lvt"][data-action="decrease"]`);

        if (increaseBtn) increaseBtn.disabled = governanceSystem.governance.votingPoints === 0;
        if (decreaseBtn) decreaseBtn.disabled = governanceSystem.governance.votingPoints === 0;

    }

    /**
     * Update player votes display to show who has voted and in what direction
     */
    updatePlayerVotesDisplay() {
        const displayContainer = document.getElementById('player-votes-display');
        if (!displayContainer) return;

        const governanceSystem = window.game?.governanceSystem;
        if (!governanceSystem) return;

        const playerVotes = governanceSystem.governance.playerVotes || {};
        const players = Object.keys(playerVotes);

        if (players.length === 0) {
            displayContainer.innerHTML = '<div class="no-votes">No players have voted yet</div>';
            return;
        }

        displayContainer.innerHTML = `
            <div class="player-votes-header">
                <h5>Player Voting Status</h5>
            </div>
            <div class="player-votes-grid">
                ${players.map(playerId => {
                    const playerData = playerVotes[playerId];
                    const lvtVotes = playerData.lvtVotes || 0;
                    const direction = lvtVotes > 0 ? 'increase' : lvtVotes < 0 ? 'decrease' : 'neutral';
                    const votes = Math.abs(lvtVotes);
                    const arrow = direction === 'increase' ? '↗️' : direction === 'decrease' ? '↘️' : '⚪';

                    return `
                        <div class="player-vote-item ${direction}">
                            <span class="player-name">${playerId === 'player' ? 'You' : `Player ${playerId.slice(-4)}`}</span>
                            <span class="vote-direction">${arrow}</span>
                            <span class="vote-amount">${votes > 0 ? votes : '—'}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * Get category mapping for display
     */
    getCategoryMap() {
        return {
            education: 'Education',
            healthcare: 'Healthcare',
            infrastructure: 'Infrastructure',
            housing: 'Housing',
            culture: 'Culture',
            recreation: 'Recreation',
            commercial: 'Commercial',
            civic: 'Civic Services',
            emergency: 'Emergency',
            ubi: 'UBI',
            lvt: 'Land Value Tax'
        };
    }

    /**
     * Reset governance points using main governance system
     */
    async resetGovernancePoints() {
        const governanceSystem = window.game?.governanceSystem;
        if (!governanceSystem) {
            console.error('🏛️ Governance system not available');
            return;
        }

        try {
            // Reset all player votes to zero using the main governance system
            const playerVotes = governanceSystem.governance.playerVotes?.player?.categories || {};

            // Remove all category votes
            for (const [category, points] of Object.entries(playerVotes)) {
                for (let i = 0; i < points; i++) {
                    await governanceSystem.removeCategoryVote(category);
                }
            }

            // Reset LVT to default 50% and restore all voting points
            governanceSystem.governance.taxRate = 0.50; // Reset to 50%
            governanceSystem.governance.votingPoints = 4; // Restore all 4 pre-game points
            this.playerLVTVotes = 0; // Clear vote tracking

            this.updatePointsDisplay();
            this.addChatMessage('System', 'Reset governance priorities to default', '#888');
        } catch (error) {
            console.error('🏛️ Error resetting governance points:', error);
        }
    }

    /**
     * Save governance preferences (now redundant - votes are saved automatically)
     */
    saveGovernancePreferences() {
        const governanceSystem = window.game?.governanceSystem;
        if (!governanceSystem) {
            console.error('🏛️ Governance system not available');
            return;
        }

        // Simply close the governance modal and return to chat
        // All governance votes are automatically saved to server in real-time
        // Returning to chat - all votes automatically synchronized
        governanceSystem.closeGovernanceModal();
    }

    // broadcastGovernanceChange method removed - now using main governance system directly

    /**
     * Show countdown overlay for game start
     */
    showCountdownOverlay(initialCount) {
        // Create countdown overlay if it doesn't exist
        let countdownOverlay = document.getElementById('countdown-overlay');
        if (!countdownOverlay) {
            countdownOverlay = document.createElement('div');
            countdownOverlay.id = 'countdown-overlay';
            countdownOverlay.className = 'countdown-overlay';
            countdownOverlay.innerHTML = `
                <div class="countdown-container">
                    <div class="countdown-text">Game Starting</div>
                    <div class="countdown-number">${initialCount}</div>
                    <div class="countdown-subtitle">Get ready!</div>
                </div>
            `;
            document.body.appendChild(countdownOverlay);

            // Add styles if they don't exist
            if (!document.getElementById('countdown-styles')) {
                const style = document.createElement('style');
                style.id = 'countdown-styles';
                style.textContent = `
                    .countdown-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.8);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10000;
                        font-family: 'Arial', sans-serif;
                    }
                    .countdown-container {
                        text-align: center;
                        color: white;
                    }
                    .countdown-text {
                        font-size: 2rem;
                        font-weight: bold;
                        margin-bottom: 20px;
                        opacity: 0.9;
                    }
                    .countdown-number {
                        font-size: 6rem;
                        font-weight: bold;
                        color: #10AC84;
                        animation: pulse 1s ease-in-out infinite;
                        text-shadow: 0 0 20px rgba(16, 172, 132, 0.5);
                    }
                    .countdown-subtitle {
                        font-size: 1.2rem;
                        margin-top: 20px;
                        opacity: 0.8;
                    }
                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                        100% { transform: scale(1); }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        countdownOverlay.style.display = 'flex';
    }

    /**
     * Update countdown display
     */
    updateCountdownDisplay(count) {
        const countdownNumber = document.querySelector('.countdown-number');
        if (countdownNumber) {
            countdownNumber.textContent = count;
        }
    }

    /**
     * Hide countdown overlay
     */
    hideCountdownOverlay() {
        const countdownOverlay = document.getElementById('countdown-overlay');
        if (countdownOverlay) {
            countdownOverlay.style.display = 'none';
        }
    }

    /**
     * Request chat history from server for in-game transition
     */
    requestChatHistory() {
        if (this.connectionManager) {
            this.connectionManager.send({
                type: 'REQUEST_CHAT_HISTORY',
                playerId: this.playerId,
                timestamp: Date.now()
            });

            // Subscribe to chat history response
            this.connectionManager.subscribe('CHAT_HISTORY', (message) => {
                this.populateInGameChatHistory(message.messages);
            });
        }
    }

    /**
     * Populate in-game chat with pre-game chat history
     */
    populateInGameChatHistory(messages) {
        const inGameChatContainer = document.getElementById('in-game-chat-messages');
        if (!inGameChatContainer || !messages || messages.length === 0) {
            console.log('💬 No chat history to populate or in-game chat not found');
            return;
        }

        console.log(`💬 Populating in-game chat with ${messages.length} historical messages`);

        // Clear existing messages
        inGameChatContainer.innerHTML = '';

        // Add each historical message
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message';

            messageElement.innerHTML = `
                <span class="chat-player" style="color: ${message.color}">${message.playerName}:</span>
                <span class="chat-text">${message.message}</span>
            `;

            inGameChatContainer.appendChild(messageElement);
        });

        // Scroll to bottom
        inGameChatContainer.scrollTop = inGameChatContainer.scrollHeight;
    }

    /**
     * Setup global reference for beer hall lobby access
     */
    setupGlobalReference() {
        // Store reference for global access
        window.beerHallLobby = this;
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BeerHallLobby;
} else {
    window.BeerHallLobby = BeerHallLobby;
}