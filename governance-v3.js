/**
 * Governance System V3 - Clean, Simple, Rock-solid
 *
 * Core Principles:
 * - Points are allocated, never spent
 * - Players start with 2 points, gain 2 more each month
 * - Points can be reallocated at any time
 * - Server-authoritative via WebSocket
 * - Immediate visual feedback
 */

class GovernanceV3 {
    constructor() {
        this.initialized = false;
        this.modal = null;
        this.economicClient = null;

        // Categories for budget allocation
        this.categories = [
            'education', 'healthcare', 'infrastructure', 'housing',
            'culture', 'recreation', 'commercial', 'civic',
            'emergency', 'ubi'
        ];

        // Cache DOM elements for performance
        this.domCache = {};

        // Local state for immediate UI feedback
        this.localState = {
            totalPoints: 2,  // Players start with 2 points, earn 2 more each month
            allocations: {},
            lvtVote: 0
        };

        // Initialize allocations to 0
        this.categories.forEach(cat => {
            this.localState.allocations[cat] = 0;
        });
    }

    /**
     * Initialize the governance system
     */
    async initialize(economicClient) {
        if (this.initialized) return;

        this.economicClient = economicClient;
        this.modal = document.getElementById('governance-modal');

        if (!this.modal) {
            console.error('❌ Governance modal not found in DOM');
            return;
        }

        // Cache DOM elements
        this.cacheElements();

        // Setup event listeners
        this.setupEventListeners();

        // Sync with server state
        await this.syncWithServer();

        // Listen for server updates
        this.listenForUpdates();

        this.initialized = true;
        console.log('🏛️ Governance V3 initialized');
    }

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        // Points display - try both possible IDs
        this.domCache.totalPoints = document.getElementById('player-voting-points');
        this.domCache.availablePoints = document.getElementById('available-points') || document.getElementById('points-available');

        // Category elements
        this.categories.forEach(cat => {
            const btn = document.querySelector(`[data-category="${cat}"]`);
            if (btn) {
                const container = btn.closest('.budget-category');
                this.domCache[cat] = {
                    container,
                    voteCount: container?.querySelector('.vote-count'),
                    increaseBtn: container?.querySelector('[data-action="increase"]'),
                    decreaseBtn: container?.querySelector('[data-action="decrease"]')
                };
            }
        });

        // LVT elements - using correct IDs from HTML
        this.domCache.lvt = {
            votePoints: document.getElementById('lvt-vote-points'), // This shows the vote points like "+2"
            rateDisplay: document.getElementById('current-lvt-display'), // This shows actual rate like "52%"
            increaseBtn: document.getElementById('lvt-increase-btn'),
            decreaseBtn: document.getElementById('lvt-decrease-btn')
        };

        // Modal controls
        this.domCache.closeBtn = document.getElementById('close-governance-modal');
        this.domCache.resetBtn = document.getElementById('reset-governance');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Category vote buttons
        this.categories.forEach(cat => {
            const cache = this.domCache[cat];
            if (!cache) return;

            if (cache.increaseBtn) {
                cache.increaseBtn.onclick = () => this.adjustAllocation(cat, 1);
            }

            if (cache.decreaseBtn) {
                cache.decreaseBtn.onclick = () => this.adjustAllocation(cat, -1);
            }
        });

        // LVT buttons
        if (this.domCache.lvt.increaseBtn) {
            this.domCache.lvt.increaseBtn.onclick = () => this.adjustLVT(1);
        }

        if (this.domCache.lvt.decreaseBtn) {
            this.domCache.lvt.decreaseBtn.onclick = () => this.adjustLVT(-1);
        }

        // Modal controls
        if (this.domCache.closeBtn) {
            this.domCache.closeBtn.onclick = () => this.closeModal();
        }

        if (this.domCache.resetBtn) {
            this.domCache.resetBtn.onclick = () => this.resetAllocations();
        }
    }

    /**
     * Sync with server state
     */
    async syncWithServer() {
        if (!this.economicClient) {
            console.log('🏛️ Governance V3: No economic client for sync');
            return;
        }

        const playerId = this.economicClient.playerId;
        if (!playerId) {
            console.log('🏛️ Governance V3: No player ID yet');
            return;
        }

        const playerData = this.economicClient.getPlayerData(playerId);

        console.log('🏛️ Governance V3: Syncing with server for player:', playerId);
        console.log('🏛️ Governance V3: PlayerData exists:', !!playerData);
        console.log('🏛️ Governance V3: Governance data:', playerData?.governance);
        console.log('🏛️ Governance V3: Economic client state:', {
            isConnected: this.economicClient.isConnected,
            hasPlayers: !!this.economicClient.players,
            playerCount: this.economicClient.players ? Object.keys(this.economicClient.players).length : 0
        });

        if (playerData?.governance) {
            this.localState.totalPoints = playerData.governance.votingPoints || 2;

            // Sync allocations
            if (playerData.governance.allocations) {
                Object.keys(playerData.governance.allocations).forEach(cat => {
                    this.localState.allocations[cat] = playerData.governance.allocations[cat] || 0;
                });
            }

            // Sync LVT vote
            this.localState.lvtVote = playerData.governance.lvtVote || 0;

            console.log('🏛️ Governance V3: Local state after sync:', this.localState);
        } else {
            console.log('🏛️ Governance V3: No governance data found in player data');
        }

        this.updateUI();
    }

    /**
     * Listen for server updates
     */
    listenForUpdates() {
        if (!this.economicClient) return;

        // Register for governance updates
        this.economicClient.onUpdate((update) => {
            if (update.type === 'GOVERNANCE_UPDATE' || update.type === 'STATE_UPDATE' || update.type === 'TRANSACTION_COMPLETE') {
                console.log('🏛️ Governance V3: Received update:', update.type);
                this.syncWithServer();
            }
        });
    }

    /**
     * Calculate available points
     */
    getAvailablePoints() {
        let allocated = 0;

        // Sum category allocations
        Object.values(this.localState.allocations).forEach(val => {
            allocated += val;
        });

        // Add absolute value of LVT vote
        allocated += Math.abs(this.localState.lvtVote);

        return Math.max(0, this.localState.totalPoints - allocated);
    }

    /**
     * Adjust allocation for a category
     */
    async adjustAllocation(category, delta) {
        const current = this.localState.allocations[category] || 0;
        const newValue = current + delta;

        // Validation
        if (newValue < 0) return; // Can't go negative

        if (delta > 0 && this.getAvailablePoints() < delta) {
            console.log('⚠️ Not enough points available');
            this.flashError('Not enough points available');
            return;
        }

        // Update local state immediately for responsiveness
        this.localState.allocations[category] = newValue;
        this.updateUI();

        // Send to server
        await this.sendToServer('allocation', { category, value: newValue });

        // Add visual feedback
        this.addVisualFeedback(category);
    }

    /**
     * Adjust LVT vote (allocation model - can be reallocated anytime)
     */
    async adjustLVT(delta) {
        const newValue = this.localState.lvtVote + delta;

        // Calculate how this change affects total point allocation
        const currentAllocated = Math.abs(this.localState.lvtVote);
        const newAllocated = Math.abs(newValue);
        const allocationDelta = newAllocated - currentAllocated;

        // Check if we have points for increased allocation
        if (allocationDelta > 0 && this.getAvailablePoints() < allocationDelta) {
            console.log('⚠️ Not enough points for LVT allocation');
            this.flashError('Not enough points available');
            return;
        }

        // Update local state (allocation model - points can be moved freely)
        this.localState.lvtVote = newValue;
        console.log(`🏛️ LVT allocation changed: ${this.localState.lvtVote - delta} → ${newValue} (delta: ${delta})`);

        this.updateUI();

        // Send to server
        await this.sendToServer('lvt', { value: newValue });
    }

    /**
     * Send changes to server
     */
    async sendToServer(type, data) {
        if (!this.economicClient || !this.economicClient.ws) {
            console.error('❌ No WebSocket connection');
            return;
        }

        const transaction = {
            type: 'GOVERNANCE_VOTE',
            voteType: type,
            ...data,
            playerId: this.economicClient.playerId
        };

        this.economicClient.ws.send(JSON.stringify(transaction));
    }

    /**
     * Reset all allocations
     */
    async resetAllocations() {
        // Reset local state
        this.categories.forEach(cat => {
            this.localState.allocations[cat] = 0;
        });
        this.localState.lvtVote = 0;

        // Update UI
        this.updateUI();

        // Send to server
        await this.sendToServer('reset', {});
    }

    /**
     * Update the UI with current state
     */
    updateUI() {
        const available = this.getAvailablePoints();

        console.log(`🏛️ Governance V3: UpdateUI - Total: ${this.localState.totalPoints}, Available: ${available}`);

        // Update points display
        if (this.domCache.totalPoints) {
            this.domCache.totalPoints.textContent = this.localState.totalPoints;
            console.log('🏛️ Governance V3: Updated total points element');
        } else {
            console.log('🏛️ Governance V3: No total points element found');
        }

        if (this.domCache.availablePoints) {
            this.domCache.availablePoints.textContent = available;
            console.log('🏛️ Governance V3: Updated available points element');
        } else {
            console.log('🏛️ Governance V3: No available points element found');
        }

        // Update category displays
        this.categories.forEach(cat => {
            const cache = this.domCache[cat];
            if (cache?.voteCount) {
                cache.voteCount.textContent = this.localState.allocations[cat] || 0;
            }

            // Enable/disable decrease button
            if (cache?.decreaseBtn) {
                cache.decreaseBtn.disabled = (this.localState.allocations[cat] || 0) <= 0;
            }

            // Enable/disable increase button based on available points
            if (cache?.increaseBtn) {
                cache.increaseBtn.disabled = available <= 0;
            }
        });

        // Update LVT vote points display
        if (this.domCache.lvt.votePoints) {
            const lvtValue = this.localState.lvtVote;
            const sign = lvtValue > 0 ? '+' : '';
            this.domCache.lvt.votePoints.textContent = `${sign}${lvtValue}`;
            console.log(`🏛️ Governance V3: Updated LVT vote points display to ${sign}${lvtValue}`);
        }

        // Enable/disable LVT buttons
        if (this.domCache.lvt.increaseBtn) {
            // Can increase LVT if we have available points
            this.domCache.lvt.increaseBtn.disabled = available <= 0;
        }
        if (this.domCache.lvt.decreaseBtn) {
            // Can always decrease LVT (moves towards zero, deallocating points)
            this.domCache.lvt.decreaseBtn.disabled = false;
        }
    }

    /**
     * Add visual feedback for allocation changes
     */
    addVisualFeedback(category) {
        const cache = this.domCache[category];
        if (!cache?.container) return;

        // Add glow effect
        cache.container.classList.add('governance-glow');
        setTimeout(() => {
            cache.container.classList.remove('governance-glow');
        }, 500);

        // TODO: Add player color dot when multiplayer is active
    }

    /**
     * Flash error message
     */
    flashError(message) {
        // Create or reuse error element
        let errorEl = document.getElementById('governance-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'governance-error';
            errorEl.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 10000;
                pointer-events: none;
            `;
            document.body.appendChild(errorEl);
        }

        errorEl.textContent = message;
        errorEl.style.display = 'block';

        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 2000);
    }

    /**
     * Open the governance modal
     */
    openModal() {
        if (!this.modal) return;

        // Ensure we're synced before showing
        this.syncWithServer();

        // Show modal
        this.modal.style.display = 'flex';
        this.modal.classList.add('visible');

        console.log('🏛️ Governance modal opened');
    }

    /**
     * Close the governance modal
     */
    closeModal() {
        if (!this.modal) return;

        this.modal.classList.remove('visible');
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 300);

        console.log('🏛️ Governance modal closed');
    }
}

// Global instance
window.governanceV3 = null;

// Initialize when economic client is ready
window.initializeGovernanceV3 = function(economicClient) {
    if (!window.governanceV3) {
        window.governanceV3 = new GovernanceV3();
        // Delay initialization slightly to ensure DOM is ready
        setTimeout(() => {
            window.governanceV3.initialize(economicClient);
        }, 100);
    }
};

// Hook for UI button
window.openGovernanceModal = function() {
    if (window.governanceV3) {
        window.governanceV3.openModal();
    } else {
        console.error('❌ Governance V3 not initialized');
    }
};