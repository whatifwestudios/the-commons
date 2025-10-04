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

        // Track server LVT rate
        this.serverLVTRate = 0.5; // Default 50%

        // Track all players' governance data for dots
        this.allPlayersGovernance = {};

        // Track financial data from server
        this.treasuryData = {
            unallocatedFunds: 0,
            cityTreasury: 0
        };

        // Cache DOM elements for financial display
        this.financialElements = {
            unallocatedFunds: null, // Monthly LVT collection not yet allocated
            cityTreasury: null      // Total accumulated treasury
        };
    }

    /**
     * Initialize the governance system
     */
    async initialize(economicClient) {
        if (this.initialized) return;

        this.economicClient = economicClient;
        this.modal = document.getElementById('governance-modal');

        // Debug connection manager status
        console.log('🔍 ConnectionManager availability:', !!window.connectionManager);
        if (window.connectionManager) {
            console.log('🔍 ConnectionManager connected:', window.connectionManager.isConnected);
        }

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

        // Initialize MORE INFO panels
        this.setupMoreInfoPanels();

        this.initialized = true;
        console.log('✅ Governance V3 initialized');
    }

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        // Points display - get the existing element that shows voting points
        this.domCache.votingPointsDisplay = document.getElementById('player-voting-points');

        // Category elements
        this.categories.forEach(cat => {
            const btn = document.querySelector(`[data-category="${cat}"]`);
            if (btn) {
                const container = btn.closest('.budget-category');
                this.domCache[cat] = {
                    container,
                    voteCount: container?.querySelector('.vote-count'),
                    increaseBtn: container?.querySelector('[data-action="increase"]'),
                    decreaseBtn: container?.querySelector('[data-action="decrease"]'),
                    playerDots: container?.querySelector('.player-allocation-indicators')
                };
            }
        });

        // LVT elements - using correct IDs from HTML
        this.domCache.lvt = {
            votePoints: document.getElementById('lvt-vote-points'), // This shows the vote points like "+2"
            currentRate: document.getElementById('current-lvt-display'), // Current server rate
            proposedRate: document.getElementById('proposed-lvt-display'), // Proposed rate preview
            rateArrow: document.getElementById('lvt-rate-arrow'), // Arrow between rates
            netEffect: document.getElementById('lvt-net-effect'), // Net effect display with preview
            increaseBtn: document.getElementById('lvt-increase-btn'),
            decreaseBtn: document.getElementById('lvt-decrease-btn'),
            playerDots: document.getElementById('lvt-player-dots') // Player allocation dots
        };

        // Modal controls
        this.domCache.closeBtn = document.getElementById('close-governance-modal');
        this.domCache.resetBtn = document.getElementById('reset-governance');

        // Financial overview elements (note: IDs are inconsistent with labels in HTML)
        this.financialElements.unallocatedFunds = document.getElementById('monthly-lvt-amount'); // Shows unallocated funds
        this.financialElements.cityTreasury = document.getElementById('unallocated-funds-amount'); // Shows city treasury
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
            console.warn('⚠️ No economic client for governance sync');
            return;
        }

        const playerId = this.economicClient.playerId;
        if (!playerId) {
            console.warn('⚠️ No player ID for governance sync');
            return;
        }

        const playerData = this.economicClient.getPlayerData(playerId);

        // Syncing governance data with server

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

            // Local governance state synced with server
        } else {
            // No governance data found - using defaults
        }

        // Get current LVT rate from economic client
        if (this.economicClient && this.economicClient.getLVTRate) {
            this.serverLVTRate = this.economicClient.getLVTRate();
        }

        // Sync treasury data from server via economic client
        if (this.economicClient && this.economicClient.governance) {
            this.treasuryData.cityTreasury = this.economicClient.governance.treasury || 0;
            this.treasuryData.categoryBudgets = this.economicClient.governance.budgets || {};
        }

        // Get monthly budget data (unallocated funds) from economic client
        if (this.economicClient && this.economicClient.governance && this.economicClient.governance.monthlyBudget) {
            // Calculate unallocated funds: total LVT collection minus allocated budget
            const monthlyBudget = this.economicClient.governance.monthlyBudget;
            this.treasuryData.unallocatedFunds = monthlyBudget.totalRevenue || 0;
            this.treasuryData.budgetAllocations = monthlyBudget.totalAllocations || {};
            this.treasuryData.budgetProportions = monthlyBudget.proportions || {};

            console.log('💰 GOVERNANCE: Updated budget data:', {
                totalAllocations: monthlyBudget.totalAllocations,
                totalPoints: monthlyBudget.totalPoints,
                proportions: monthlyBudget.proportions,
                categoryBudgets: this.treasuryData.categoryBudgets
            });
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
                // Received governance update from server
                this.syncWithServer();
                // Update player dots when governance data changes
                this.updatePlayerDots();
            }
        });
    }

    /**
     * Calculate allocated and available points
     */
    getPointsData() {
        // Calculate total allocated points
        const allocatedInCategories = Object.values(this.localState.allocations).reduce((sum, points) => sum + points, 0);
        const allocatedInLVT = Math.abs(this.localState.lvtVote);
        const totalAllocated = allocatedInCategories + allocatedInLVT;
        const available = this.localState.totalPoints - totalAllocated;

        return {
            totalPoints: this.localState.totalPoints,
            allocated: totalAllocated,
            available: Math.max(0, available)
        };
    }

    /**
     * Calculate what the LVT rate would be if the player's vote were applied
     */
    calculateProposedLVTRate() {
        // Start with current server rate (base 50%)
        const baseRate = 0.5;

        // Add the effect of this player's vote (1% per vote point)
        const playerEffect = this.localState.lvtVote * 0.01;

        // Calculate proposed rate (clamped between 0% and 100%)
        const proposedRate = Math.max(0, Math.min(1, baseRate + playerEffect));

        return proposedRate;
    }

    /**
     * Calculate the net effect of all LVT votes from all players
     */
    calculateNetLVTEffect() {
        if (!this.economicClient || !this.economicClient.gameState || !this.economicClient.gameState.players) {
            return { netPoints: 0, previewRate: this.serverLVTRate, daysUntilApplied: 30 };
        }

        const players = this.economicClient.gameState.players;
        let totalLVTVotes = 0;

        // Sum up all LVT votes from all players
        Object.values(players).forEach(player => {
            if (player.governance && player.governance.lvtVote) {
                totalLVTVotes += player.governance.lvtVote;
            }
        });

        // Calculate the new rate with all votes applied (1% per vote point)
        const baseRate = 0.5; // Default 50%
        const netEffect = totalLVTVotes * 0.01;
        const previewRate = Math.max(0, Math.min(1, baseRate + netEffect));

        return {
            netPoints: totalLVTVotes,
            previewRate: previewRate,
            daysUntilApplied: 30 // Assuming monthly updates
        };
    }

    /**
     * Adjust allocation for a category
     */
    async adjustAllocation(category, delta) {
        const current = this.localState.allocations[category] || 0;
        const newValue = current + delta;

        // Validation
        if (newValue < 0) return; // Can't go negative

        const pointsData = this.getPointsData();
        if (delta > 0 && pointsData.available < delta) {
            console.warn('⚠️ Not enough points available');
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
        const pointsData = this.getPointsData();
        if (allocationDelta > 0 && pointsData.available < allocationDelta) {
            console.warn('⚠️ Not enough points for LVT allocation');
            this.flashError('Not enough points available');
            return;
        }

        // Update local state (allocation model - points can be moved freely)
        this.localState.lvtVote = newValue;
        // LVT allocation changed

        this.updateUI();

        // Send to server
        await this.sendToServer('lvt', { value: newValue });
    }

    /**
     * Send changes to server
     */
    async sendToServer(type, data) {
        // Use ConnectionManager like economic client
        if (!window.connectionManager || !window.connectionManager.isConnected) {
            console.error('❌ No ConnectionManager WebSocket connection');
            return;
        }

        const transaction = {
            type: 'GOVERNANCE_VOTE',
            voteType: type,
            ...data,
            playerId: this.economicClient.playerId
        };

        console.log('📨 Sending governance transaction:', transaction);
        window.connectionManager.send(transaction);
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
        const pointsData = this.getPointsData();

        // Update voting points display in "available/total" format
        if (this.domCache.votingPointsDisplay) {
            this.domCache.votingPointsDisplay.textContent = `${pointsData.available}/${pointsData.totalPoints}`;
        } else {
            console.warn('⚠️ No voting points display element found');
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
                cache.increaseBtn.disabled = pointsData.available <= 0;
            }
        });

        // Update LVT displays
        if (this.domCache.lvt.votePoints) {
            const lvtValue = this.localState.lvtVote;
            const sign = lvtValue > 0 ? '+' : '';
            this.domCache.lvt.votePoints.textContent = `${sign}${lvtValue}`;
        }

        // Update current LVT rate display
        if (this.domCache.lvt.currentRate) {
            const currentRate = Math.round(this.serverLVTRate * 100);
            this.domCache.lvt.currentRate.textContent = `${currentRate}%`;
        }

        // Update net effect display (shows collective impact of all players)
        const netEffect = this.calculateNetLVTEffect();
        if (this.domCache.lvt.netEffect && netEffect.netPoints !== 0) {
            const sign = netEffect.netPoints > 0 ? '+' : '';
            const previewRate = Math.round(netEffect.previewRate * 100);
            this.domCache.lvt.netEffect.textContent = `Net: ${sign}${netEffect.netPoints} (${previewRate}% in ${netEffect.daysUntilApplied} days)`;
            this.domCache.lvt.netEffect.style.display = 'inline';
            this.domCache.lvt.netEffect.style.color = netEffect.netPoints > 0 ? '#4CAF50' : '#F44336';
        } else if (this.domCache.lvt.netEffect) {
            this.domCache.lvt.netEffect.style.display = 'none';
        }

        // Hide the old proposed rate system since we're using the net effect display
        if (this.domCache.lvt.proposedRate) {
            this.domCache.lvt.proposedRate.style.display = 'none';
        }
        if (this.domCache.lvt.rateArrow) {
            this.domCache.lvt.rateArrow.style.display = 'none';
        }

        // Enable/disable LVT buttons
        if (this.domCache.lvt.increaseBtn) {
            // Can increase LVT if we have available points
            this.domCache.lvt.increaseBtn.disabled = pointsData.available <= 0;
        }
        if (this.domCache.lvt.decreaseBtn) {
            // Can always decrease LVT (moves towards zero, deallocating points)
            this.domCache.lvt.decreaseBtn.disabled = false;
        }

        // Update financial overview
        this.updateFinancialOverview();

        // Update player allocation dots
        this.updatePlayerDots();
    }

    /**
     * Update financial overview displays with real-time data
     */
    updateFinancialOverview() {
        // Update unallocated funds display
        if (this.financialElements.unallocatedFunds) {
            const unallocatedAmount = this.treasuryData.unallocatedFunds || 0;
            this.financialElements.unallocatedFunds.textContent = unallocatedAmount.toLocaleString();
        }

        // Update city treasury display
        if (this.financialElements.cityTreasury) {
            const treasuryAmount = this.treasuryData.cityTreasury || 0;
            this.financialElements.cityTreasury.textContent = treasuryAmount.toLocaleString();
        }
    }

    /**
     * Update player allocation dots for all categories
     */
    updatePlayerDots() {
        // Get all players' governance data from economic client
        if (this.economicClient && this.economicClient.gameState && this.economicClient.gameState.players) {
            const players = this.economicClient.gameState.players;

            // Debug: Log player data structure
            console.log('🔍 DEBUG: Player data in governance system:', players);
            Object.entries(players).forEach(([playerId, player]) => {
                console.log(`  Player ${playerId}:`, {
                    name: player.name,
                    color: player.color,
                    governance: player.governance
                });
            });

            this.categories.forEach(category => {
                this.updateCategoryPlayerDots(category, players);
            });

            // Also update LVT dots
            this.updateLVTPlayerDots(players);
        }
    }

    /**
     * Update player dots for a specific category
     */
    updateCategoryPlayerDots(category, players) {
        const dotsContainer = this.domCache[category]?.playerDots;
        if (!dotsContainer) return;

        // Clear existing dots
        dotsContainer.innerHTML = '';

        // Create dots for each player with allocations in this category
        Object.values(players).forEach(player => {
            if (player.governance && player.governance.allocations && player.governance.allocations[category] > 0) {
                const allocation = player.governance.allocations[category];
                const dot = this.createPlayerDot(player, allocation, category);
                dotsContainer.appendChild(dot);
            }
        });

        // Also show current player's local allocation if they have made changes not yet synced
        if (this.economicClient && this.economicClient.playerId && this.localState.allocations[category] > 0) {
            const currentPlayerData = players[this.economicClient.playerId];
            if (currentPlayerData) {
                // Only show if local allocation is different from server allocation
                const serverAllocation = (currentPlayerData.governance?.allocations?.[category] || 0);
                if (this.localState.allocations[category] !== serverAllocation) {
                    const dot = this.createPlayerDot(currentPlayerData, this.localState.allocations[category], category);
                    dot.style.border = '2px solid #FFD700'; // Gold border to indicate pending change
                    dot.title += ' (pending)';
                    dotsContainer.appendChild(dot);
                }
            }
        }
    }

    /**
     * Create a player allocation dot
     */
    createPlayerDot(player, allocation, category) {
        const dot = document.createElement('div');
        dot.className = 'player-dot';

        // Get dot size based on allocation (5 steps: 1-5+ points)
        const size = Math.min(5, Math.max(1, allocation));
        const dotSize = 6 + (size * 2); // 8px to 16px

        // Set player color (from game data or default)
        const playerColor = player.color || '#888';

        dot.style.cssText = `
            width: ${dotSize}px;
            height: ${dotSize}px;
            border-radius: 50%;
            background-color: ${playerColor};
            display: inline-block;
            margin: 1px;
            opacity: 0.8;
            transition: opacity 0.3s ease;
            position: relative;
            cursor: pointer;
        `;

        // Add hover tooltip with player name
        const playerName = player.name || player.playerName || `Player ${player.id || ''}`;
        dot.title = `${playerName}: ${allocation} points in ${category}`;

        // Add hover effects
        dot.addEventListener('mouseenter', () => {
            dot.style.opacity = '1';
        });

        dot.addEventListener('mouseleave', () => {
            dot.style.opacity = '0.8';
        });

        return dot;
    }

    /**
     * Update LVT player dots
     */
    updateLVTPlayerDots(players) {
        const dotsContainer = this.domCache.lvt.playerDots;
        if (!dotsContainer) return;

        // Clear existing dots
        dotsContainer.innerHTML = '';

        // Create dots for each player with LVT votes
        Object.values(players).forEach(player => {
            if (player.governance && player.governance.lvtVote && player.governance.lvtVote !== 0) {
                const lvtVote = player.governance.lvtVote;
                const dot = this.createLVTPlayerDot(player, lvtVote);
                dotsContainer.appendChild(dot);
            }
        });

        // Also show current player's local LVT vote if they have made changes not yet synced
        if (this.economicClient && this.economicClient.playerId && this.localState.lvtVote !== 0) {
            const currentPlayerData = players[this.economicClient.playerId];
            if (currentPlayerData) {
                // Only show if local LVT vote is different from server LVT vote
                const serverLVTVote = (currentPlayerData.governance?.lvtVote || 0);
                if (this.localState.lvtVote !== serverLVTVote) {
                    const dot = this.createLVTPlayerDot(currentPlayerData, this.localState.lvtVote);
                    dot.style.border = '2px solid #FFD700'; // Gold border to indicate pending change
                    dot.title += ' (pending)';
                    dotsContainer.appendChild(dot);
                }
            }
        }
    }

    /**
     * Create a player LVT vote dot
     */
    createLVTPlayerDot(player, lvtVote) {
        const dot = document.createElement('div');
        dot.className = 'player-dot lvt-dot';

        // Get dot size based on vote magnitude (5 steps: 1-5+ points)
        const magnitude = Math.abs(lvtVote);
        const size = Math.min(5, Math.max(1, magnitude));
        const dotSize = 6 + (size * 2); // 8px to 16px

        // Set player color (from game data or default)
        const playerColor = player.color || '#888';

        // Add visual indicator for increase (+) vs decrease (-)
        const border = lvtVote > 0 ? '2px solid #4CAF50' : '2px solid #F44336'; // Green for +, Red for -

        dot.style.cssText = `
            width: ${dotSize}px;
            height: ${dotSize}px;
            border-radius: 50%;
            background-color: ${playerColor};
            border: ${border};
            display: inline-block;
            margin: 1px;
            opacity: 0.8;
            transition: opacity 0.3s ease;
            position: relative;
            cursor: pointer;
        `;

        // Add hover tooltip with player name
        const playerName = player.name || player.playerName || `Player ${player.id || ''}`;
        const direction = lvtVote > 0 ? 'increase' : 'decrease';
        dot.title = `${playerName}: ${Math.abs(lvtVote)} points to ${direction} LVT rate`;

        // Add hover effects
        dot.addEventListener('mouseenter', () => {
            dot.style.opacity = '1';
        });

        dot.addEventListener('mouseleave', () => {
            dot.style.opacity = '0.8';
        });

        return dot;
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

        // Add player color dot when multiplayer is active
        if (this.economicClient?.isMultiplayer && this.economicClient?.playerId) {
            const playerColor = PlayerUtils.getPlayerColor(this.economicClient.playerId);

            // Create or update player indicator dot
            let indicatorDot = cache.container.querySelector('.player-indicator-dot');
            if (!indicatorDot) {
                indicatorDot = document.createElement('div');
                indicatorDot.className = 'player-indicator-dot';
                indicatorDot.style.cssText = `
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    opacity: 0.8;
                    pointer-events: none;
                    z-index: 10;
                `;
                cache.container.style.position = 'relative';
                cache.container.appendChild(indicatorDot);
            }

            indicatorDot.style.backgroundColor = playerColor;
            indicatorDot.style.boxShadow = `0 0 4px ${playerColor}`;
        }
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

        // Governance modal opened
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

        // Governance modal closed
    }

    /**
     * Setup MORE INFO panels functionality (copied from HTML inline script)
     */
    setupMoreInfoPanels() {
        const categoryData = {
            education: {
                title: "Education Budget",
                description: "Fund schools, libraries, and educational programs to boost citizen learning and development.",
                maintenance: "✓ Covers maintenance costs for education buildings",
                buildings: ["School", "Library", "University", "Research Lab", "Training Center"]
            },
            healthcare: {
                title: "Healthcare Budget",
                description: "Support hospitals, clinics, and public health programs to keep citizens healthy and productive.",
                maintenance: "✓ Covers maintenance costs for healthcare buildings",
                buildings: ["Clinic", "Hospital", "Medical Center", "Pharmacy", "Wellness Center"]
            },
            infrastructure: {
                title: "Infrastructure Budget",
                description: "Maintain roads, bridges, utilities, and core city systems that everything depends on.",
                maintenance: "✓ Covers maintenance costs for infrastructure buildings",
                buildings: ["Road", "Bridge", "Power Plant", "Water Treatment", "Telecom Tower"]
            },
            housing: {
                title: "Housing Budget",
                description: "Support affordable housing programs and residential development initiatives.",
                maintenance: "✓ Covers maintenance costs for housing buildings",
                buildings: ["Apartment Complex", "Social Housing", "Senior Housing", "Student Housing"]
            },
            culture: {
                title: "Culture Budget",
                description: "Fund arts, museums, cultural events, and programs that enrich community life.",
                maintenance: "✓ Covers maintenance costs for cultural buildings",
                buildings: ["Museum", "Art Gallery", "Theater", "Cultural Center", "Concert Hall"]
            },
            recreation: {
                title: "Recreation Budget",
                description: "Maintain parks, sports facilities, and recreational programs for citizen wellbeing.",
                maintenance: "✓ Covers maintenance costs for recreation buildings",
                buildings: ["Park", "Sports Complex", "Swimming Pool", "Gym", "Community Center"]
            },
            commercial: {
                title: "Commercial Budget",
                description: "Support business development, trade promotion, and economic growth initiatives.",
                maintenance: "✓ Covers maintenance costs for commercial buildings",
                buildings: ["Market", "Shopping Center", "Office Complex", "Business Park", "Trade Center"]
            },
            civic: {
                title: "Civic Budget",
                description: "Fund government services, public administration, and civic engagement programs.",
                maintenance: "✓ Covers maintenance costs for civic buildings",
                buildings: ["City Hall", "Police Station", "Fire Station", "Court House", "Public Service Center"]
            },
            emergency: {
                title: "Emergency Budget",
                description: "Maintain emergency response capabilities and disaster preparedness programs.",
                maintenance: "✓ Covers maintenance costs for emergency services",
                buildings: ["Emergency Center", "Fire Station", "Police Station", "Ambulance Service", "Disaster Relief Center"]
            },
            ubi: {
                title: "Universal Basic Income",
                description: "Provide direct cash payments to all citizens, ensuring basic economic security for everyone.",
                maintenance: "✓ Direct payments to citizens based on funding level",
                buildings: ["Payment Center", "Social Services Office", "Citizen Support Center"]
            }
        };

        // Track currently open category
        this.currentOpenCategory = null;

        // Add click handlers to all more-info-btn buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('more-info-btn')) {
                const category = e.target.getAttribute('data-category');
                if (category && categoryData[category]) {
                    // If clicking the same category that's already open, close it
                    if (this.currentOpenCategory === category) {
                        this.closeCategoryDetails();
                    } else {
                        this.showCategoryDetails(categoryData[category]);
                        this.currentOpenCategory = category;
                    }
                }
            }
        });

        // Close panel handler
        document.addEventListener('click', (e) => {
            if (e.target.id === 'close-category-details') {
                this.closeCategoryDetails();
            }
        });

        // Close panel when clicking outside (on governance modal but not on slide-out panel)
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('category-details-panel');
            const governanceModal = document.getElementById('governance-modal');

            // Check if the panel is open and user clicked inside governance modal but outside the panel
            if (this.currentOpenCategory && panel && governanceModal) {
                const isClickInsideModal = governanceModal.contains(e.target);
                const isClickInsidePanel = panel.contains(e.target);
                const isMoreInfoButton = e.target.classList.contains('more-info-btn');

                // Close if clicked inside modal but outside panel (and not on a more info button)
                if (isClickInsideModal && !isClickInsidePanel && !isMoreInfoButton) {
                    this.closeCategoryDetails();
                }
            }
        });
    }

    showCategoryDetails(data) {
        const panel = document.getElementById('category-details-panel');
        const title = document.getElementById('category-details-title');
        const content = document.getElementById('category-details-content');

        if (!panel || !title || !content) return;

        title.textContent = data.title;

        let buildingsHtml = '';
        if (Array.isArray(data.buildings)) {
            buildingsHtml = data.buildings.map(building =>
                `<div class="building-item">
                    <div class="building-name">${building}</div>
                    <div class="building-description">Click to place this building type</div>
                </div>`
            ).join('');
        }

        content.innerHTML = `
            <div class="category-description">${data.description}</div>
            <div class="maintenance-note">${data.maintenance}</div>
            <div class="buildings-list">
                <h5>Related Buildings:</h5>
                <div class="buildings-grid">${buildingsHtml}</div>
            </div>
        `;

        panel.classList.add('open');
    }

    closeCategoryDetails() {
        const panel = document.getElementById('category-details-panel');
        if (panel) {
            panel.classList.remove('open');
        }
        this.currentOpenCategory = null;
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