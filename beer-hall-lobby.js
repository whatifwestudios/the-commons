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
                console.log('🎨 Setting Commons title color to:', color);
                // Remove inline style first, then apply new color with important
                headerTitle.removeAttribute('style');
                headerTitle.style.cssText = `font-size: 28px; color: ${color} !important; margin: 0 0 8px 0; font-weight: 600;`;
            } else {
                console.warn('🎨 No h1 found in beer lobby');
            }
        } else {
            console.warn('🎨 Beer lobby element not found');
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
                    playerColor: this.selectedColor,
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
                    // Governance preferences now handled by main governance system
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
                // Governance preferences now handled by main governance system
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
                    playerColor: this.selectedColor,
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

            case 'GAME_STATE':
                // Forward GAME_STATE messages to Economic Client
                console.log('📡 Beer Hall: Forwarding GAME_STATE to Economic Client');
                if (window.game && window.game.economicClient) {
                    window.game.economicClient.handleWebSocketUpdate(update);
                }
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

            // Update waiting text based on player preferences
            this.updateWaitingText();

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

                // Prepare player config for game
                const playerConfig = {
                    id: this.playerId,
                    name: this.playerName,
                    color: this.selectedColor,
                    tableData: gameData,
                    isMultiplayer: true
                    // Governance preferences now handled by main governance system
                };

                // Start the game!
                if (this.onGameStart) {
                    this.onGameStart(playerConfig);
                }
            }
        }, 1000);
    }

    /**
     * Setup tab switching between chat and governance
     */
    setupTabSwitching() {
        const tabs = document.querySelectorAll('.chat-tab');
        const contents = document.querySelectorAll('.chat-tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Remove active from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                // Add active to clicked tab and corresponding content
                tab.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-content`);
                if (targetContent) {
                    targetContent.classList.add('active');
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

        // Pre-game LVT setup only
        const categories = {
            lvt: { name: 'Land Value Tax Rate', icon: '📊' }
        };

        Object.entries(categories).forEach(([key, category]) => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'governance-category';
            categoryDiv.innerHTML = `
                <div class="category-info">
                    <span class="category-icon">${category.icon}</span>
                    <span class="category-name">${category.name}</span>
                </div>
                <div class="category-controls">
                    <button class="point-btn" data-action="decrease" data-category="${key}">-</button>
                    <span class="points-display" data-category="${key}">0</span>
                    <button class="point-btn" data-action="increase" data-category="${key}">+</button>
                </div>
            `;
            container.appendChild(categoryDiv);
        });

        this.updatePointsDisplay();
    }

    /**
     * Setup governance event handlers
     */
    setupGovernanceHandlers() {
        // Point allocation buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('point-btn')) {
                const action = e.target.dataset.action;
                const category = e.target.dataset.category;
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
                // Handle LVT voting with proper methods
                if (action === 'increase') {
                    result = await governanceSystem.increaseLVTRate();
                } else if (action === 'decrease') {
                    result = await governanceSystem.decreaseLVTRate();
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

        // Update category points and button states from main system
        const playerVotes = governanceSystem.governance.playerVotes?.player?.categories || {};

        // Only show LVT for pre-game setup
        const categoriesToShow = { lvt: 'Land Value Tax' };

        Object.keys(categoriesToShow).forEach(key => {
            const pointsDisplay = document.querySelector(`[data-category="${key}"].points-display`);
            const increaseBtn = document.querySelector(`[data-category="${key}"][data-action="increase"]`);
            const decreaseBtn = document.querySelector(`[data-category="${key}"][data-action="decrease"]`);

            const currentPoints = key === 'lvt' ?
                Math.abs(governanceSystem.governance.playerVotes?.player?.lvtVotes || 0) :
                (playerVotes[key] || 0);

            if (pointsDisplay) pointsDisplay.textContent = currentPoints;
            if (increaseBtn) increaseBtn.disabled = governanceSystem.governance.votingPoints === 0;
            if (decreaseBtn) decreaseBtn.disabled = currentPoints === 0;
        });
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

            // Reset LVT votes
            const lvtVotes = Math.abs(governanceSystem.governance.playerVotes?.player?.lvtVotes || 0);
            for (let i = 0; i < lvtVotes; i++) {
                await governanceSystem.decreaseLVTRate();
            }

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

        // Governance votes are now automatically saved to server via the main system
        const totalVotes = Object.values(governanceSystem.governance.playerVotes?.player?.categories || {})
            .reduce((sum, votes) => sum + votes, 0);

        const lvtVotes = Math.abs(governanceSystem.governance.playerVotes?.player?.lvtVotes || 0);
        const totalAllocated = totalVotes + lvtVotes;

        const currentLVTRate = (governanceSystem.governance.taxRate * 100).toFixed(1);
        this.addChatMessage('System', `LVT rate set to ${currentLVTRate}% (${totalAllocated} points used)`, '#888');
        console.log('🏛️ LVT rate preferences are automatically synchronized');
    }

    // broadcastGovernanceChange method removed - now using main governance system directly

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