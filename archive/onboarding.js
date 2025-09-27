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
     */
    async initialize(gameStartCallback) {
        this.onGameStart = gameStartCallback;
        this.playerId = `player_${Math.random().toString(36).substr(2, 9)}`;

        // Find DOM elements
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.beerHallLobby = document.getElementById('beer-hall-lobby');
        this.playerNameInput = document.getElementById('player-name');
        this.colorSelector = document.getElementById('color-selector');
        this.findTableBtn = document.getElementById('find-table-btn');
        this.readyCheckModal = document.getElementById('ready-check-modal');
        this.gameIntroModal = document.getElementById('game-intro-cinematic');
        this.regenerateButton = document.getElementById('regenerate-colors-btn');

        if (!this.validateElements()) {
            throw new Error('Required beer hall elements not found in DOM');
        }

        // Set up event listeners
        this.setupEventListeners();

        // Initialize color selection
        await this.populateColors();

        // Initialize WebSocket connection
        this.initializeWebSocket();

        // Show beer hall lobby
        this.showBeerHallLobby();

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

        // Regenerate colors button
        this.regenerateButton.addEventListener('click', () => this.regenerateColors());

        // Space bar shortcut for development
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.welcomeScreen && this.welcomeScreen.style.display !== 'none') {
                e.preventDefault();
                this.handleStartGame();
            }
        });
    }

    showWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
            this.welcomeScreen.classList.add('visible');
        }
    }

    async populateColors() {
        const colors = this.generateColors(10); // Show 10 colors (2 rows of 5)
        this.updateColorOptions(colors);
        this.setupColorSelectionHandlers();
    }

    generateColors(count = 15) {
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

    updateColorOptions(colors) {
        this.colorSelector.innerHTML = '';
        colors.forEach((color, index) => {
            const colorOption = document.createElement('div');
            colorOption.className = 'color-option';
            colorOption.style.backgroundColor = color;
            colorOption.dataset.color = color;

            if (index === 0) {
                colorOption.classList.add('selected');
                this.selectedColor = color;
            }

            this.colorSelector.appendChild(colorOption);
        });
    }

    setupColorSelectionHandlers() {
        const colorOptions = this.colorSelector.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove selection from all options
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                // Select clicked option
                option.classList.add('selected');
                this.selectedColor = option.dataset.color;
            });
        });
    }

    async regenerateColors() {
        // Add animation
        this.regenerateButton.classList.add('spinning');
        this.regenerateButton.disabled = true;

        // Animate color change
        const existingOptions = this.colorSelector.querySelectorAll('.color-option');
        existingOptions.forEach(option => option.classList.add('changing'));

        // Update colors after animation
        setTimeout(() => {
            this.populateColors();
        }, 300);

        // Remove animation
        setTimeout(() => {
            const newOptions = this.colorSelector.querySelectorAll('.color-option');
            newOptions.forEach(option => option.classList.remove('changing'));
            this.regenerateButton.classList.remove('spinning');
            this.regenerateButton.disabled = false;
        }, 600);
    }

    handleStartGame() {
        // Validate input
        const name = this.playerNameInput.value.trim() || 'Player';
        const color = this.selectedColor || this.availableColors[0];

        // Generate player ID
        const playerId = this.generatePlayerId();

        // Create standardized PlayerConfig
        const playerConfig = {
            name: name,
            color: color,
            mode: 'solo',
            id: playerId,
            timestamp: Date.now()
        };

        console.log('🎮 Onboarding complete:', playerConfig);

        // Hide welcome screen with animation
        this.hideWelcomeScreen(() => {
            // Call completion callback with player configuration
            if (this.onComplete) {
                this.onComplete(playerConfig);
            }
        });
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }

    hideWelcomeScreen(callback) {
        if (!this.welcomeScreen) return;

        // Add fade-out animation
        this.welcomeScreen.classList.add('fade-out');

        // Complete after animation
        setTimeout(() => {
            this.welcomeScreen.style.display = 'none';
            this.welcomeScreen.classList.remove('visible', 'fade-out');

            if (callback) {
                callback();
            }
        }, 500);
    }

    /**
     * Update taken colors from server
     */
    updateTakenColors(takenColorsArray) {
        this.takenColors = new Set(takenColorsArray);
        // Refresh colors to hide taken ones
        this.populateColors();
    }

    /**
     * Add a color to the taken colors set
     */
    addTakenColor(color) {
        this.takenColors.add(color);
        this.populateColors();
    }

    /**
     * Remove a color from the taken colors set
     */
    removeTakenColor(color) {
        this.takenColors.delete(color);
        this.populateColors();
    }

    /**
     * Handle size selection for multiplayer preferences
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
            // Solo mode - skip lobby and start game directly
            this.handleStartGame();
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
        } else {
            // Fallback - treat as single number
            minPlayers = parseInt(sizeData);
            maxPlayers = minPlayers;
        }

        this.playerPreferences = {
            minPlayers: minPlayers,
            maxPlayers: maxPlayers
        };

        console.log('🎯 Size preferences updated:', this.playerPreferences);
    }

    /**
     * Handle find table action
     */
    handleFindTable() {
        console.log('🔍 Finding table with preferences:', this.playerPreferences);
        // Implementation for multiplayer table finding would go here
    }

    /**
     * Handle ready up action
     */
    handleReadyUp() {
        console.log('✅ Player ready');
        // Implementation for ready check would go here
    }

    /**
     * Handle leave table action
     */
    handleLeaveTable() {
        console.log('❌ Leaving table');
        // Implementation for leaving table would go here
    }

    /**
     * Get current player configuration (for testing/debugging)
     */
    getCurrentConfig() {
        if (!this.isInitialized) {
            throw new Error('Onboarding system not initialized');
        }

        return {
            name: this.playerNameInput.value.trim() || 'Player',
            color: this.selectedColor || this.availableColors[0],
            mode: 'solo',
            id: this.generatePlayerId(),
            timestamp: Date.now()
        };
    }
}

// Export for use in other modules
window.OnboardingSystem = OnboardingSystem;