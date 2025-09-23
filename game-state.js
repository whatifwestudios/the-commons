/**
 * State Management System for The Commons
 * Provides centralized state management with performance optimizations
 * and multiplayer-ready architecture
 */

class GameState {
    constructor(game = null) {
        this.game = game;
        // Centralized game state
        this.state = {
            // Player state (multiplayer-ready structure)
            players: {
                'player': {
                    cash: 6000,
                    actions: 20,
                    votingPoints: 0,
                    ownedParcels: [],
                    emoji: '🏠',
                    name: 'Player',
                    color: '#10AC84',
                    settings: {}
                }
            },
            
            // World state
            world: {
                grid: null, // Will be initialized with game grid
                currentMonth: 'SEPT',
                currentDay: 2,
                gameSpeed: 1,
                isPaused: false
            },
            
            // Market state
            market: {
                supply: {
                    energy: 0,
                    food: 0,
                    housing: 0,
                    jobs: 0
                },
                demand: {
                    energy: 0,
                    food: 0,
                    housing: 0,
                    jobs: 0
                },
                multipliers: {
                    energy: 1.0,
                    food: 1.0,
                    housing: 1.0,
                    jobs: 1.0
                }
            },
            
            // Action marketplace
            actionMarket: {
                listings: [],
                nextListingId: 1,
                priceHistory: []
            },
            
            // Governance state
            governance: {
                totalBudget: 0,
                allocations: {},
                unallocatedFunds: 0,
                taxRate: 0.15
            },
            
            // UI state
            ui: {
                selectedTool: 'grass',
                currentLayer: 'buildings',
                selectedParcel: null,
                activeModal: null
            }
        };
        
        // Performance optimizations
        this.subscribers = new Map();
        this.changeLog = [];
        this.batchedUpdates = [];
        this.updateTimer = null;
        
        // Cache for computed values
        this.cache = {
            totalPopulation: { value: 0, dirty: true },
            totalBuildings: { value: 0, dirty: true },
            dailyCashflow: { value: 0, dirty: true },
            supplyDemandBalance: { value: null, dirty: true }
        };
        
        // State history for undo/redo and debugging
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
    }
    
    /**
     * Initialize state with game data
     */
    initialize(gameData) {
        if (gameData.grid) {
            this.state.world.grid = gameData.grid;
        }
        if (gameData.player) {
            this.state.players['player'] = { 
                ...this.state.players['player'], 
                ...gameData.player 
            };
        }
        this.invalidateCache();
    }
    
    /**
     * Dispatch an action to modify state
     * All state changes MUST go through this method
     */
    dispatch(action) {
        // Forward auction actions to multiplayer manager if available
        if (action.type.startsWith('START_AUCTION') || action.type.startsWith('PLACE_BID') || action.type.startsWith('END_AUCTION')) {
            if (this.game && this.game.multiplayerManager && this.game.multiplayerManager.isConnected) {
                // Forward to server for multiplayer sync
                this.game.multiplayerManager.broadcastAction(action);
                return;
            }
        }
        
        // Batch updates for performance
        if (this.updateTimer) {
            this.batchedUpdates.push(action);
            return;
        }
        
        // Process action immediately
        const oldState = this.cloneState(this.state);
        const newState = this.reducer(this.state, action);
        
        if (newState === this.state) {
            return; // No change
        }
        
        // Validate state change
        if (!this.validateState(newState)) {
            console.error('Invalid state transition:', action);
            return;
        }
        
        // Track what changed for smart updates
        const changes = this.diffState(oldState, newState);
        
        // Update state
        this.state = newState;
        
        // Add to history for undo/redo
        this.addToHistory(action, oldState);
        
        // Invalidate affected caches
        this.invalidateAffectedCache(changes);
        
        // Notify subscribers with specific changes
        this.notifySubscribers(action, changes);
        
        // Log for debugging/replay
        this.changeLog.push({ action, timestamp: Date.now(), changes });
        
        // Start batch timer for subsequent updates
        this.startBatchTimer();
    }
    
    /**
     * Main reducer function - handles all state transitions
     */
    reducer(state, action) {
        const newState = this.cloneState(state);
        
        switch (action.type) {
            // Player actions
            case 'UPDATE_CASH':
                newState.players[action.playerId].cash += action.amount;
                break;
                
            case 'SPEND_ACTIONS':
                newState.players[action.playerId].actions -= action.amount;
                break;
                
            case 'BUILD_BUILDING':
                const { playerId, row, col, buildingType, cost } = action;
                newState.world.grid[row][col].building = buildingType;
                newState.world.grid[row][col].owner = playerId;
                newState.players[playerId].cash -= cost;
                newState.players[playerId].actions -= 1;
                newState.players[playerId].ownedParcels.push({ row, col });
                break;
                
            case 'DEMOLISH_BUILDING':
                newState.world.grid[action.row][action.col].building = null;
                newState.world.grid[action.row][action.col].owner = null;
                break;
                
            // Market actions
            case 'UPDATE_SUPPLY':
                newState.market.supply[action.resource] = action.value;
                break;
                
            case 'UPDATE_DEMAND':
                newState.market.demand[action.resource] = action.value;
                break;
                
            case 'UPDATE_MULTIPLIER':
                newState.market.multipliers[action.resource] = action.value;
                break;
                
            // Time actions
            case 'ADVANCE_TIME':
                newState.world.currentDay = action.day;
                newState.world.currentMonth = action.month;
                break;
                
            case 'SET_GAME_SPEED':
                newState.world.gameSpeed = action.speed;
                break;
                
            case 'TOGGLE_PAUSE':
                newState.world.isPaused = !newState.world.isPaused;
                break;
                
            // UI actions
            case 'SELECT_TOOL':
                newState.ui.selectedTool = action.tool;
                break;
                
            case 'SWITCH_LAYER':
                newState.ui.currentLayer = action.layer;
                break;
                
            case 'SELECT_PARCEL':
                newState.ui.selectedParcel = action.parcel;
                break;
                
            case 'OPEN_MODAL':
                newState.ui.activeModal = action.modalId;
                break;
                
            case 'CLOSE_MODAL':
                newState.ui.activeModal = null;
                break;
                
            // Governance actions
            case 'UPDATE_BUDGET':
                newState.governance.totalBudget = action.amount;
                break;
                
            case 'ALLOCATE_FUNDS':
                newState.governance.allocations[action.category] = action.amount;
                newState.governance.unallocatedFunds = 
                    newState.governance.totalBudget - 
                    Object.values(newState.governance.allocations).reduce((a, b) => a + b, 0);
                break;
                
            case 'AWARD_VOTING_POINTS':
                if (!newState.governance) newState.governance = {};
                newState.governance.votingPoints = (newState.governance.votingPoints || 0) + (action.points || 0);
                break;
                
            case 'SPEND_VOTING_POINTS':
                if (!newState.governance) newState.governance = {};
                newState.governance.votingPoints = Math.max(0, (newState.governance.votingPoints || 0) - (action.amount || 0));
                break;
                
            // Batch multiple actions
            case 'BATCH':
                return action.actions.reduce(this.reducer.bind(this), state);
                
            default:
                console.warn('Unknown action type:', action.type);
                return state;
        }
        
        return newState;
    }
    
    /**
     * Subscribe to state changes
     * Can subscribe to specific paths for performance
     */
    subscribe(callback, paths = null) {
        const id = Symbol('subscriber');
        this.subscribers.set(id, { callback, paths });
        return () => this.subscribers.delete(id);
    }
    
    /**
     * Notify subscribers of state changes
     * Only notifies subscribers interested in changed paths
     */
    notifySubscribers(action, changes) {
        this.subscribers.forEach(({ callback, paths }) => {
            // If no specific paths, always notify
            if (!paths) {
                callback(action, changes, this.state);
                return;
            }
            
            // Check if any subscribed path changed
            const shouldNotify = paths.some(path => 
                this.pathChanged(path, changes)
            );
            
            if (shouldNotify) {
                callback(action, changes, this.state);
            }
        });
    }
    
    /**
     * Get computed value with caching
     */
    getComputed(key, computeFn) {
        if (!this.cache[key].dirty) {
            return this.cache[key].value;
        }
        
        const value = computeFn(this.state);
        this.cache[key] = { value, dirty: false };
        return value;
    }
    
    /**
     * Get total population (cached)
     */
    getTotalPopulation() {
        return this.getComputed('totalPopulation', (state) => {
            let total = 0;
            if (!state.world.grid) return 0;
            
            for (let row = 0; row < state.world.grid.length; row++) {
                for (let col = 0; col < state.world.grid[0].length; col++) {
                    const parcel = state.world.grid[row][col];
                    if (parcel && parcel.population) {
                        total += parcel.population;
                    }
                }
            }
            return total;
        });
    }
    
    /**
     * Get total buildings count (cached)
     */
    getTotalBuildings() {
        return this.getComputed('totalBuildings', (state) => {
            let count = 0;
            if (!state.world.grid) return 0;
            
            for (let row = 0; row < state.world.grid.length; row++) {
                for (let col = 0; col < state.world.grid[0].length; col++) {
                    if (state.world.grid[row][col].building) {
                        count++;
                    }
                }
            }
            return count;
        });
    }
    
    /**
     * Batch multiple updates for performance
     */
    batchDispatch(actions) {
        this.dispatch({ type: 'BATCH', actions });
    }
    
    /**
     * Start batch timer for collecting rapid updates
     */
    startBatchTimer() {
        this.updateTimer = setTimeout(() => {
            if (this.batchedUpdates.length > 0) {
                const actions = this.batchedUpdates;
                this.batchedUpdates = [];
                this.batchDispatch(actions);
            }
            this.updateTimer = null;
        }, 16); // ~60fps
    }
    
    /**
     * Invalidate cache entries affected by changes
     */
    invalidateAffectedCache(changes) {
        if (changes.world?.grid) {
            this.cache.totalPopulation.dirty = true;
            this.cache.totalBuildings.dirty = true;
            this.cache.dailyCashflow.dirty = true;
        }
        if (changes.market) {
            this.cache.supplyDemandBalance.dirty = true;
        }
        if (changes.players) {
            this.cache.dailyCashflow.dirty = true;
        }
    }
    
    /**
     * Invalidate all cache entries
     */
    invalidateCache() {
        Object.keys(this.cache).forEach(key => {
            this.cache[key].dirty = true;
        });
    }
    
    /**
     * Validate state integrity
     */
    validateState(state) {
        // Check and fix NaN values with automatic correction
        if (isNaN(state.players['player'].cash)) {
            console.warn('Player cash is NaN, resetting to 6000');
            state.players['player'].cash = 6000;
        }

        // Ensure cash is a finite number
        if (!isFinite(state.players['player'].cash)) {
            console.warn('Player cash is not finite, resetting to 6000');
            state.players['player'].cash = 6000;
        }

        // Check for negative actions
        if (state.players['player'].actions < 0) {
            console.warn('Player actions cannot be negative, resetting to 0');
            state.players['player'].actions = 0;
        }

        // Check for NaN in actions
        if (isNaN(state.players['player'].actions)) {
            console.warn('Player actions is NaN, resetting to 20');
            state.players['player'].actions = 20;
        }

        // Validate voting points
        if (isNaN(state.players['player'].votingPoints)) {
            console.warn('Player voting points is NaN, resetting to 0');
            state.players['player'].votingPoints = 0;
        }

        return true;
    }
    
    /**
     * Clone state for immutability
     */
    cloneState(state) {
        // Deep clone for nested objects
        return JSON.parse(JSON.stringify(state));
    }
    
    /**
     * Diff two states to find changes
     */
    diffState(oldState, newState) {
        const changes = {};
        
        const diff = (old, new_, path = '') => {
            if (old === new_) return;
            
            if (typeof old !== 'object' || typeof new_ !== 'object') {
                this.setPath(changes, path, new_);
                return;
            }
            
            for (const key in new_) {
                const newPath = path ? `${path}.${key}` : key;
                if (old[key] !== new_[key]) {
                    diff(old[key], new_[key], newPath);
                }
            }
        };
        
        diff(oldState, newState);
        return changes;
    }
    
    /**
     * Check if a path changed in the changes object
     */
    pathChanged(path, changes) {
        const parts = path.split('.');
        let current = changes;
        
        for (const part of parts) {
            if (current[part] !== undefined) {
                return true;
            }
            current = current[part];
            if (!current) return false;
        }
        
        return false;
    }
    
    /**
     * Set a value at a path in an object
     */
    setPath(obj, path, value) {
        const parts = path.split('.');
        let current = obj;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        
        current[parts[parts.length - 1]] = value;
    }
    
    /**
     * Add action to history for undo/redo
     */
    addToHistory(action, oldState) {
        // Remove any history after current index (for redo)
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new entry
        this.history.push({ action, state: oldState, timestamp: Date.now() });
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }
    
    /**
     * Undo last action
     */
    undo() {
        if (this.historyIndex >= 0) {
            const { state } = this.history[this.historyIndex];
            this.state = this.cloneState(state);
            this.historyIndex--;
            this.invalidateCache();
            this.notifySubscribers({ type: 'UNDO' }, {});
        }
    }
    
    /**
     * Redo action
     */
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const { action } = this.history[this.historyIndex + 1];
            this.dispatch(action);
        }
    }
    
    /**
     * Get current state (read-only)
     */
    getState() {
        // Return a frozen copy to prevent direct mutations
        return Object.freeze(this.cloneState(this.state));
    }
    
    /**
     * Export state for saving
     */
    exportState() {
        return {
            state: this.state,
            timestamp: Date.now(),
            version: '1.0.0'
        };
    }
    
    /**
     * Import saved state
     */
    importState(savedState) {
        if (!savedState || !savedState.state) {
            console.error('Invalid saved state');
            return false;
        }
        
        this.state = this.cloneState(savedState.state);
        this.invalidateCache();
        this.notifySubscribers({ type: 'IMPORT' }, {});
        return true;
    }
    
    /**
     * Update player color with conflict resolution
     */
    updatePlayerColor(playerId, requestedColor) {
        const action = {
            type: 'UPDATE_PLAYER_COLOR',
            payload: { playerId, requestedColor }
        };

        // Check for color conflicts
        const conflictingPlayer = this.findPlayerByColor(requestedColor);
        if (conflictingPlayer && conflictingPlayer !== playerId) {
            // Color conflict - assign alternative color
            const availableColor = this.getAvailableColor(requestedColor);
            this.state.players[playerId].color = availableColor;

            this.notifySubscribers(action, {
                success: false,
                assignedColor: availableColor,
                reason: 'Color conflict resolved'
            });

            return { success: false, assignedColor: availableColor };
        }

        // No conflict - assign requested color
        this.state.players[playerId].color = requestedColor;
        this.notifySubscribers(action, { success: true, assignedColor: requestedColor });

        return { success: true, assignedColor: requestedColor };
    }

    /**
     * Find player using a specific color
     */
    findPlayerByColor(color) {
        return Object.keys(this.state.players).find(playerId =>
            this.state.players[playerId].color === color
        );
    }

    /**
     * Get an available color (with fallback if conflicts)
     */
    getAvailableColor(preferredColor) {
        const defaultColors = [
            '#10AC84', '#3498db', '#e74c3c', '#f39c12',
            '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c',
            '#34495e', '#f1c40f'
        ];

        // Try preferred color first
        if (!this.findPlayerByColor(preferredColor)) {
            return preferredColor;
        }

        // Find first available color from defaults
        for (const color of defaultColors) {
            if (!this.findPlayerByColor(color)) {
                return color;
            }
        }

        // Generate random color if all defaults taken
        return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    /**
     * Get all player colors for conflict checking
     */
    getAllPlayerColors() {
        return Object.values(this.state.players).map(player => player.color);
    }

    /**
     * Update player name
     */
    updatePlayerName(playerId, name) {
        const action = {
            type: 'UPDATE_PLAYER_NAME',
            payload: { playerId, name }
        };

        this.state.players[playerId].name = name;
        this.notifySubscribers(action, { success: true });

        return { success: true };
    }

    /**
     * Add or update player
     */
    addOrUpdatePlayer(playerId, playerData) {
        const action = {
            type: 'ADD_OR_UPDATE_PLAYER',
            payload: { playerId, playerData }
        };

        if (!this.state.players[playerId]) {
            // New player - ensure unique color
            const assignedColor = this.getAvailableColor(playerData.color || '#10AC84');

            this.state.players[playerId] = {
                cash: 6000,
                actions: 20,
                votingPoints: 0,
                ownedParcels: [],
                emoji: '🏠',
                name: playerData.name || 'Player',
                color: assignedColor,
                settings: {}
            };
        } else {
            // Update existing player
            Object.assign(this.state.players[playerId], playerData);
        }

        this.notifySubscribers(action, { success: true, playerId });
        return { success: true, player: this.state.players[playerId] };
    }

    /**
     * Clear all state and reset to defaults
     */
    reset() {
        this.state = this.cloneState(new GameState().state);
        this.history = [];
        this.historyIndex = -1;
        this.changeLog = [];
        this.invalidateCache();
        this.notifySubscribers({ type: 'RESET' }, {});
    }
}

// Export for use in game.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameState;
}