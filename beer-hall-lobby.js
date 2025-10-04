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
        // Create logger for development mode
        this.logger = {
            debug: (...args) => {},  // Disabled by default
            info: console.log,
            warn: console.warn,
            error: console.error
        };

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
        this.playerPreferences = { minPlayers: 2, maxPlayers: 12 }; // Default to "Small 2+ players"
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

        if (!this.validateElements()) {
            throw new Error('Required beer hall elements not found in DOM');
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initialize color selection
        await this.populateColors();

        // Initialize connection through ConnectionManager
        this.initializeConnection();

        // Ensure ready check modal is hidden on initialization
        if (this.readyCheckModal) {
            this.readyCheckModal.style.display = 'none';
        }

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
               this.readyCheckModal;
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
        // Always show the beer hall lobby first - no auto-starting
        // The user must see the lobby and click "Enter The Commons" to proceed
        this.welcomeScreen.style.display = 'flex';

        const activeButton = document.querySelector('.size-btn.active');
        if (activeButton) {
            // Set the correct player preferences and count for the active button
            const sizeData = activeButton.dataset.size;

            // Parse the size data and set preferences (same logic as handleSizeSelection)
            let minPlayers, maxPlayers;
            if (sizeData === '1') {
                minPlayers = 1;
                maxPlayers = 1;
            } else if (sizeData.includes('+')) {
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

            // Set the player preferences
            this.playerPreferences = {
                minPlayers: minPlayers,
                maxPlayers: maxPlayers
            };

            this.logger.debug(`🎮 Initial size selection: ${sizeData}, preferences:`, this.playerPreferences);

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

        // Subscribe to lobby-specific messages first
        this.setupLobbySubscriptions();

        // Only connect if not already connected
        if (!this.connectionManager.isConnected) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host; // Uses current port automatically
            const wsUrl = `${protocol}//${host}/ws`;

            try {
                await this.connectionManager.connect(wsUrl);
                this.logger.debug('✅ Beer Hall established new connection via ConnectionManager');
            } catch (error) {
                console.error('🔌 Failed to initialize connection:', error);
            }
        } else {
            this.logger.debug('✅ Beer Hall using existing ConnectionManager connection');
        }
    }

    /**
     * Set up message subscriptions for lobby functionality
     */
    setupLobbySubscriptions() {
        // Subscribe to lobby-specific messages
        this.connectionManager.subscribe('CONNECTED', (message) => {
            this.playerId = message.playerId;
            this.logger.debug('🍺 Beer Hall received player ID:', this.playerId);
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

        this.connectionManager.subscribe('GAME_STATE', (message) => {
            if (message.eventType === 'GAME_STARTED') {
                this.handleGameStarted(message);
            }
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
            this.logger.debug('🍺 Beer Hall: Connection established');
        });

        this.connectionManager.on('disconnected', () => {
            console.warn('🍺 Beer Hall: Connection lost');
        });

        this.connectionManager.on('reconnecting', (data) => {
            this.logger.debug(`🍺 Beer Hall: Reconnecting (attempt ${data.attempt})`);
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
        this.logger.debug('🎮 Game is starting with countdown:', message.countdown);
        this.addSystemMessage(`Game starting in ${message.countdown} seconds!`);

        // Show countdown overlay if we have a chat overlay
        this.showCountdownOverlay(message.countdown);
    }

    /**
     * Handle countdown update message
     */
    handleCountdownUpdate(message) {
        this.logger.debug(`⏰ Client received countdown update: ${message.countdown}`);
        this.updateCountdownDisplay(message.countdown);
        this.addSystemMessage(`Starting in ${message.countdown}...`);

        // Hide countdown when it reaches 0
        if (message.countdown === 0) {
            this.logger.debug('⏰ Countdown reached 0, hiding overlay');
            this.hideCountdownOverlay();
        }
    }

    /**
     * Handle game started message
     */
    handleGameStarted(update) {
        if (window.DEBUG_MODE) {
            this.logger.debug('✅ Game started!');
        }

        // Hide countdown overlay
        this.hideCountdownOverlay();

        // Hide ready check modal
        this.readyCheckModal.style.display = 'none';

        // V2: Extract city name for current player from GAME_STARTED message
        this.logger.debug('🏙️ CLIENT DEBUG: GAME_STARTED message received:', JSON.stringify(update, null, 2));
        const players = update.eventData?.players || update.players || [];
        this.logger.debug('🏙️ CLIENT DEBUG: players array:', players);
        this.logger.debug('🏙️ CLIENT DEBUG: current playerId:', this.playerId);
        const currentPlayer = players.find(p => p.id === this.playerId);
        this.logger.debug('🏙️ CLIENT DEBUG: found currentPlayer:', currentPlayer);

        // CRITICAL FIX: Ensure the game is properly started for multiplayer
        if (window.game) {
            this.logger.debug('🎮 MULTIPLAYER FIX: Starting game systems for synchronized multiplayer');
            // For multiplayer, we need to start the game time and rendering systems
            // that normally get started by startGame() but are skipped in multiplayer mode
            if (window.game.startGameTime && typeof window.game.startGameTime === 'function') {
                window.game.startGameTime();
            }
            if (window.game.scheduleRender && typeof window.game.scheduleRender === 'function') {
                window.game.scheduleRender();
            }
            this.logger.debug('🎮 MULTIPLAYER FIX: Game systems initialized successfully');
        } else {
            console.error('❌ MULTIPLAYER ERROR: window.game not found when GAME_STARTED received');
        }

        if (currentPlayer && currentPlayer.cityName) {
            this.logger.debug('🏙️ CLIENT DEBUG: City name found:', currentPlayer.cityName);
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

        // Start countdown
        this.startCountdown(update);
    }

    /**
     * Show multiplayer chat overlay
     */
    showMultiplayerChat() {
        const chatOverlay = document.getElementById('multiplayer-chat-overlay');
        const gameInterface = document.getElementById('game-interface');

        this.logger.debug('🎮 showMultiplayerChat called');
        this.logger.debug('🎮 chatOverlay:', !!chatOverlay);
        this.logger.debug('🎮 gameInterface:', !!gameInterface);

        if (chatOverlay && gameInterface) {
            // Add blur effect to game interface (includes top-bar, game-container, and sidebar)
            gameInterface.classList.add('game-blurred');

            // Remove hidden-element class and show chat overlay
            chatOverlay.classList.remove('hidden-element');
            chatOverlay.style.display = 'flex';

            this.logger.debug('🎮 Chat overlay shown, display style:', chatOverlay.style.display);
            this.logger.debug('🎮 Chat overlay classes:', chatOverlay.className);

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
        const gameInterface = document.getElementById('game-interface');

        if (chatOverlay && gameInterface) {
            chatOverlay.style.display = 'none';
            chatOverlay.classList.add('hidden-element');
            gameInterface.classList.remove('game-blurred');
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

        // Fallback: if server doesn't respond within 3 seconds, proceed anyway
        // This handles cases where server multiplayer isn't fully configured
        setTimeout(() => {
            // Check if we're still waiting (chat modal still visible)
            const chatOverlay = document.getElementById('multiplayer-chat-overlay');
            if (chatOverlay && chatOverlay.style.display === 'flex') {
                this.logger.debug('🎮 Server timeout - proceeding to game without server response');
                this.addSystemMessage('Game starting now!');

                // Proceed to game after brief delay
                setTimeout(() => {
                    this.hideMultiplayerChat();
                    this.proceedToGame();
                }, 500);
            }
        }, 3000);
    }

    /**
     * Proceed directly to game without countdown
     */
    proceedToGame() {
        this.logger.debug('🎮 Proceeding directly to game');

        // Hide welcome screen
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }

        // Remove blur from game interface
        const gameInterface = document.getElementById('game-interface');
        if (gameInterface) {
            gameInterface.classList.remove('game-blurred');
        }

        // Hide any remaining lobby elements
        document.body.classList.remove('beer-hall-active', 'ready-check-active');
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
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            this.logger.debug(`🎮 Countdown: ${countdown}`);
            countdown--;

            if (countdown < 0) {
                clearInterval(countdownInterval);

                // Hide welcome screen
                this.welcomeScreen.style.display = 'none';

                // Don't create a new game - just transition the existing one
                // The game was already started with proper server synchronization
                this.logger.debug('🎮 Countdown complete - transitioning to synchronized game');

                // Request chat history before transitioning to in-game
                this.logger.debug('💬 Requesting chat history for in-game transition');
                this.requestChatHistory();

                // Hide multiplayer chat overlay if active
                this.hideMultiplayerChat();

                // Remove blur from game interface
                const gameInterface = document.getElementById('game-interface');
                if (gameInterface) {
                    gameInterface.classList.remove('game-blurred');
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
     * Show countdown overlay for game start
     */
    showCountdownOverlay(initialCount) {
        // Create countdown overlay if it doesn't exist
        let countdownOverlay = document.getElementById('countdown-overlay');
        if (!countdownOverlay) {
            countdownOverlay = document.createElement('div');
            countdownOverlay.id = 'countdown-overlay';
            countdownOverlay.className = 'countdown-overlay';

            // Get all players for display
            const players = this.getPlayersForCountdown();
            const playerBadgesHTML = this.createPlayerBadgesHTML(players);

            countdownOverlay.innerHTML = `
                <div class="countdown-container">
                    <h1 class="countdown-welcome">Welcome to The Commons</h1>
                    <div class="countdown-underline"></div>
                    <div class="player-badges-grid">
                        ${playerBadgesHTML}
                    </div>
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
                        background: #000000;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 10000;
                        font-family: 'Arial', sans-serif;
                        opacity: 1;
                        transition: opacity 0.5s ease-out;
                    }
                    .countdown-overlay.fade-out {
                        opacity: 0;
                    }
                    .countdown-container {
                        text-align: center;
                        color: white;
                        max-width: 800px;
                        padding: 40px;
                    }
                    .countdown-welcome {
                        font-size: 3rem;
                        font-weight: 600;
                        margin: 0 0 30px 0;
                        color: #ffffff;
                        letter-spacing: 1px;
                    }
                    .countdown-underline {
                        width: 50%;
                        height: 2px;
                        background: #ffffff;
                        margin: 0 auto 50px auto;
                        animation: subtle-pulse 2s ease-in-out infinite;
                    }
                    .player-badges-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                        gap: 16px;
                        max-width: 760px;
                        margin: 0 auto;
                        justify-items: center;
                    }
                    .player-badge {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 500;
                        color: #ffffff;
                        min-width: 160px;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    }
                    @keyframes subtle-pulse {
                        0% { opacity: 0.9; }
                        50% { opacity: 1; }
                        100% { opacity: 0.9; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        countdownOverlay.style.display = 'flex';
        countdownOverlay.classList.remove('fade-out');

        // Track when overlay was shown
        this.countdownStartTime = Date.now();
        this.isServerReady = false;

        // Check periodically if we should hide the overlay
        const checkInterval = setInterval(() => {
            const minTimeElapsed = Date.now() - this.countdownStartTime >= 2500;
            if (this.isServerReady && minTimeElapsed) {
                clearInterval(checkInterval);
                this.hideCountdownOverlay();
            }
        }, 100);
    }

    /**
     * Get players for countdown display
     */
    getPlayersForCountdown() {
        const players = [];

        // Add current player
        if (this.playerName && this.selectedColor) {
            players.push({
                name: this.playerName,
                color: this.selectedColor
            });
        }

        // Get other players from chat list if available
        const chatPlayers = document.querySelectorAll('.chat-player');
        chatPlayers.forEach(playerEl => {
            const name = playerEl.querySelector('.chat-player-name')?.textContent;
            const colorEl = playerEl.querySelector('.chat-player-color');
            const color = colorEl?.style.backgroundColor;

            if (name && color && name !== this.playerName) {
                players.push({ name, color });
            }
        });

        return players;
    }

    /**
     * Create player badges HTML for countdown
     */
    createPlayerBadgesHTML(players) {
        if (!players || players.length === 0) {
            return '';
        }

        return players.map(player => `
            <div class="player-badge" style="background-color: ${player.color};">
                ${player.name}
            </div>
        `).join('');
    }

    /**
     * Update countdown display (no longer used with new design)
     */
    updateCountdownDisplay(count) {
        // New design doesn't show countdown number
        // Mark server as ready when countdown reaches 0
        if (count === 0) {
            this.markServerReady();
        }
    }

    /**
     * Mark server as ready and hide overlay if minimum time has elapsed
     */
    markServerReady() {
        this.isServerReady = true;
        this.tryHideCountdownOverlay();
    }

    /**
     * Try to hide countdown overlay if both conditions are met
     */
    tryHideCountdownOverlay() {
        const minTimeElapsed = Date.now() - (this.countdownStartTime || 0) >= 2500; // 2.5 seconds

        if (this.isServerReady && minTimeElapsed) {
            this.hideCountdownOverlay();
        } else if (this.isServerReady && !minTimeElapsed) {
            // Server ready but min time not elapsed - wait for remaining time
            const remainingTime = 2500 - (Date.now() - this.countdownStartTime);
            setTimeout(() => this.hideCountdownOverlay(), remainingTime);
        }
    }

    /**
     * Hide countdown overlay with fade out
     */
    hideCountdownOverlay() {
        const countdownOverlay = document.getElementById('countdown-overlay');
        if (countdownOverlay) {
            countdownOverlay.classList.add('fade-out');
            setTimeout(() => {
                countdownOverlay.style.display = 'none';
            }, 500); // Match transition duration
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
            this.logger.debug('💬 No chat history to populate or in-game chat not found');
            return;
        }

        this.logger.debug(`💬 Populating in-game chat with ${messages.length} historical messages`);

        // Clear existing messages
        inGameChatContainer.innerHTML = '';

        // Add each historical message with consistent formatting
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            // Use same class as regular in-game messages
            messageElement.className = 'chat-message-small';

            // Add special class to distinguish pre-game messages if needed
            messageElement.classList.add('pregame-message');

            // Use consistent span classes with in-game chat
            messageElement.innerHTML = `
                <span class="chat-player-small" style="color: ${message.color}">${message.playerName}:</span>
                <span class="chat-text-small">${message.message}</span>
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