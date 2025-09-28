/**
 * Governance System for The Commons
 * Handles budget allocation, voting, tax rates, and civic policies
 */

class GovernanceSystem {
    constructor(game) {
        this.game = game;
        
        // Governance state
        this.governance = {
            treasuryBalance: 0,  // Accumulated but not yet distributed funds
            monthlyCollected: 0, // Funds collected this month (resets monthly)
            totalBudget: 0,
            unallocatedFunds: 0,
            allocations: {
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0
            },
            voteAllocations: {
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0
            },
            // Track player-specific allocations for multiplayer
            playerVotes: {
                player: {
                    categories: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVotes: 0,
                    pregameLVTVotes: 0  // Track locked pre-game LVT votes separately
                }
            },
            taxRate: 0.50, // 50% default LVT rate
            votingPoints: 4, // Start with 4 voting points for pre-game LVT setup
            gameStarted: false, // Track if game has started (locks pre-game LVT)
            lastBudgetUpdate: 0
        };
        
        // Budget categories and their effects
        this.budgetCategories = {
            education: {
                name: 'Education',
                description: 'Educational institution funding',
                icon: '🎓',
                effect: 'Reduces building costs for educational facilities'
            },
            healthcare: {
                name: 'Healthcare',
                description: 'Medical facilities and health services',
                icon: '🏥',
                effect: 'Reduces building costs for healthcare facilities'
            },
            infrastructure: {
                name: 'Infrastructure',
                description: 'Roads, utilities, and basic city infrastructure',
                icon: '🛤️',
                effect: 'Reduces building costs for infrastructure projects'
            },
            housing: {
                name: 'Housing',
                description: 'Subsidies for residential development',
                icon: '🏠',
                effect: 'Reduces building costs for housing projects'
            },
            culture: {
                name: 'Culture',
                description: 'Cultural institutions and arts funding',
                icon: '🎭',
                effect: 'Reduces building costs for cultural facilities'
            },
            recreation: {
                name: 'Recreation',
                description: 'Parks and recreational facility funding',
                icon: '🏞️',
                effect: 'Reduces building costs for recreational facilities'
            },
            commercial: {
                name: 'Commercial',
                description: 'Business development incentives',
                icon: '🏪',
                effect: 'Reduces building costs for commercial projects'
            },
            civic: {
                name: 'Civic',
                description: 'Government and public service funding',
                icon: '🏛️',
                effect: 'Reduces building costs for civic buildings'
            },
            emergency: {
                name: 'Emergency',
                description: 'Emergency services and disaster preparedness',
                icon: '🚨',
                effect: 'Reduces building costs for emergency services'
            },
            ubi: {
                name: 'UBI',
                description: 'Universal Basic Income for all citizens',
                icon: '💰',
                effect: 'Boosts revenue for all building owners based on monthly distribution'
            }
        };
        
        // Policy effects cache
        this.policyEffects = {
            buildingCostReductions: new Map(),
            ubiRevenueBoost: 0,
            taxRevenue: 0,
            lastUpdate: 0
        };
    }
    
    /**
     * Initialize governance system
     */
    initialize() {
        // Ensure all required structures exist
        this.ensureGovernanceStructures();
        this.calculateTotalBudget();
        this.updatePolicyEffects();
        this.updateGovernanceModal(); // Update modal to reflect initial state

        // Proactively cache player color for better performance
        this.initializePlayerColorCache();
    }

    /**
     * Ensure all governance structures are properly initialized
     */
    ensureGovernanceStructures() {
        // Ensure voteAllocations exists
        if (!this.governance.voteAllocations) {
            this.governance.voteAllocations = {
                education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                culture: 0, recreation: 0, commercial: 0, civic: 0,
                emergency: 0, ubi: 0
            };
        }

        // Ensure playerVotes exists
        if (!this.governance.playerVotes) {
            this.governance.playerVotes = {
                player: {
                    categories: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVotes: 0,
                    pregameLVTVotes: 0
                }
            };
        }

        // Ensure player entry exists
        if (!this.governance.playerVotes.player) {
            this.governance.playerVotes.player = {
                categories: {
                    education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                    culture: 0, recreation: 0, commercial: 0, civic: 0,
                    emergency: 0, ubi: 0
                },
                lvtVotes: 0
            };
        }

        // ❌ REMOVED: Client-side treasury initialization
        // Treasury state is now server-authoritative and synced via broadcasts
    }
    
    /**
     * Calculate total city budget based on tax revenue
     */
    calculateTotalBudget() {
        const cityStats = this.getCityStatistics();
        const taxableIncome = cityStats.totalPopulation * 50; // $50 per resident per day
        const taxRevenue = taxableIncome * this.governance.taxRate;
        
        this.governance.totalBudget = Math.round(taxRevenue);
        this.updateUnallocatedFunds();
        
        return this.governance.totalBudget;
    }
    
    /**
     * Update unallocated funds
     */
    updateUnallocatedFunds() {
        const totalAllocated = Object.values(this.governance.allocations)
            .reduce((sum, amount) => sum + amount, 0);

        this.governance.unallocatedFunds = Math.max(0, this.governance.totalBudget - totalAllocated);
    }

    /**
     * Add funds to the treasury (accumulation stage)
     */
    addFunds(amount, source = 'misc') {
        if (amount <= 0) return;

        this.governance.treasuryBalance += amount;
        this.governance.monthlyCollected += amount;
        this.updateGovernanceModal();

        console.log(`💰 Added $${amount.toLocaleString()} to city treasury from ${source}`);
    }

    /**
     * Add a vote to a category (costs 1 voting point)
     *
     * Expected server response:
     * {
     *   success: boolean,
     *   votingPoints: number,    // Remaining voting points
     *   votes: {                 // Full votes object for this player
     *     education: number,
     *     healthcare: number,
     *     infrastructure: number,
     *     housing: number,
     *     culture: number,
     *     recreation: number,
     *     commercial: number,
     *     civic: number,
     *     emergency: number,
     *     ubi: number
     *   },
     *   category: string,        // The category that was voted on
     *   action: string           // 'add' or 'remove'
     * }
     */
    async addCategoryVote(category, playerId = 'player') {
        // Ensure structures exist before proceeding
        this.ensureGovernanceStructures();

        if (!this.budgetCategories[category]) {
            console.error('Invalid budget category:', category);
            return false;
        }

        if (this.governance.votingPoints < 1) {
            console.log('Not enough voting points');
            return false;
        }

        // Send transaction to server instead of updating local state
        if (this.game && this.game.economicClient) {
            try {
                const transaction = {
                    type: 'GOVERNANCE_VOTE',
                    playerId: this.game.currentPlayerId || playerId,
                    category: category,
                    action: 'add'
                };

                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    // Update local state based on server response
                    this.governance.votingPoints = result.votingPoints;

                    // Ensure player votes structure exists
                    if (!this.governance.playerVotes[playerId]) {
                        this.governance.playerVotes[playerId] = {
                            categories: {
                                education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                                culture: 0, recreation: 0, commercial: 0, civic: 0,
                                emergency: 0, ubi: 0
                            },
                            lvtVotes: 0
                        };
                    }

                    // Update local allocations from server response
                    if (result.votes && result.votes[category] !== undefined) {
                        // Server returns the full votes object with all categories
                        this.governance.playerVotes[playerId].categories[category] = result.votes[category];
                    } else {
                        // Fallback: increment locally if server doesn't return vote details
                        this.governance.playerVotes[playerId].categories[category] =
                            (this.governance.playerVotes[playerId].categories[category] || 0) + 1;
                    }

                    // Update voting points from server
                    if (result.votingPoints !== undefined) {
                        this.governance.votingPoints = result.votingPoints;
                    }

                    this.governance.voteAllocations[category] = (this.governance.voteAllocations[category] || 0) + 1;

                    this.calculateActualAllocations();
                    this.updatePolicyEffects();
                    this.updateGovernanceModal();

                    console.log(`🗳️ Vote added for ${category}. Server confirmed: ${result.votingPoints} points remaining`);
                    return true;
                } else {
                    console.error('Server rejected governance vote:', result.error);
                    return false;
                }
            } catch (error) {
                console.error('Failed to send governance vote transaction:', error);
                return false;
            }
        } else {
            // Fallback to local-only mode if no economic client
            console.warn('No economic client available, using local-only governance');

            // Ensure player entry exists
            if (!this.governance.playerVotes[playerId]) {
                this.governance.playerVotes[playerId] = {
                    categories: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVotes: 0,
                    pregameLVTVotes: 0
                };
            }

            // Spend point and add vote (local only)
            this.governance.votingPoints -= 1;
            this.governance.voteAllocations[category] += 1;
            this.governance.playerVotes[playerId].categories[category] += 1;

            this.calculateActualAllocations();
            this.updatePolicyEffects();
            this.updateGovernanceModal();

            return true;
        }
    }

    /**
     * Remove a vote from a category (refunds 1 voting point)
     */
    async removeCategoryVote(category, playerId = 'player') {
        // Ensure structures exist before proceeding
        this.ensureGovernanceStructures();

        if (!this.budgetCategories[category]) {
            console.error('Invalid budget category:', category);
            return false;
        }

        // Check if player has votes to remove
        if (!this.governance.playerVotes[playerId] ||
            this.governance.playerVotes[playerId].categories[category] <= 0) {
            console.log('No votes to remove from this category for this player');
            return false;
        }

        // Send transaction to server instead of updating local state
        if (this.game && this.game.economicClient) {
            try {
                const transaction = {
                    type: 'GOVERNANCE_VOTE',
                    playerId: this.game.currentPlayerId || playerId,
                    category: category,
                    action: 'remove'
                };

                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    // Update local state based on server response
                    if (result.votingPoints !== undefined) {
                        this.governance.votingPoints = result.votingPoints;
                    }

                    // Update local allocations from server response
                    if (result.votes && result.votes[category] !== undefined) {
                        this.governance.playerVotes[playerId].categories[category] = result.votes[category];
                    } else {
                        // Fallback: decrement locally if server doesn't return vote details
                        this.governance.playerVotes[playerId].categories[category] =
                            Math.max(0, (this.governance.playerVotes[playerId].categories[category] || 0) - 1);
                    }

                    this.governance.voteAllocations[category] = Math.max(0, (this.governance.voteAllocations[category] || 0) - 1);

                    this.calculateActualAllocations();
                    this.updatePolicyEffects();
                    this.updateGovernanceModal();

                    console.log(`🗳️ Vote removed from ${category}. Server confirmed: ${result.votingPoints} points available`);
                    return true;
                } else {
                    console.error('Server rejected governance vote removal:', result.error);
                    return false;
                }
            } catch (error) {
                console.error('Failed to send governance vote removal transaction:', error);
                return false;
            }
        } else {
            // Fallback to local-only mode if no economic client
            console.warn('No economic client available, using local-only governance');

            // Refund point and remove vote (local only)
            this.governance.votingPoints += 1;
            this.governance.voteAllocations[category] -= 1;
            this.governance.playerVotes[playerId].categories[category] -= 1;

            this.calculateActualAllocations();
            this.updatePolicyEffects();
            this.updateGovernanceModal();

            return true;
        }
    }

    /**
     * Calculate actual dollar allocations based on vote distribution and LVT revenue
     */
    calculateActualAllocations() {
        const totalVotes = Object.values(this.governance.voteAllocations).reduce((sum, votes) => sum + votes, 0);

        if (totalVotes === 0) {
            // No votes allocated, clear all allocations
            Object.keys(this.governance.allocations).forEach(category => {
                this.governance.allocations[category] = 0;
            });
            return;
        }

        // Distribute total budget based on vote percentages
        Object.keys(this.governance.voteAllocations).forEach(category => {
            const voteShare = this.governance.voteAllocations[category] / totalVotes;
            this.governance.allocations[category] = this.governance.totalBudget * voteShare;
        });

        this.updateUnallocatedFunds();
    }

    /**
     * Set tax rate
     */
    /**
     * Vote to increase LVT rate by 1% (costs 1 voting point)
     *
     * Expected server response:
     * {
     *   success: boolean,
     *   votingPoints: number,  // Remaining voting points
     *   lvtRate: number,       // New LVT rate (0.0 to 1.0)
     *   lvtVotesIncrease: number,
     *   lvtVotesDecrease: number
     * }
     */
    async increaseLVTRate(playerId = 'player') {
        // Ensure structures exist before proceeding
        this.ensureGovernanceStructures();

        if (this.governance.votingPoints < 1) {
            console.log('Not enough voting points');
            return false;
        }

        // Send LVT vote to server
        if (this.game && this.game.economicClient) {
            try {
                const transaction = {
                    type: 'GOVERNANCE_VOTE',
                    playerId: this.game.currentPlayerId || playerId,
                    category: 'lvt_increase',
                    action: 'add'
                };

                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    // Update local state based on server response
                    if (result.votingPoints !== undefined) {
                        this.governance.votingPoints = result.votingPoints;
                    }
                    if (result.lvtRate !== undefined) {
                        this.governance.taxRate = result.lvtRate;
                    }

                    this.calculateTotalBudget();
                    this.updatePolicyEffects();
                    this.updateGovernanceModal();

                    const lvtRate = result.lvtRate || this.governance.taxRate;
                    console.log(`🗳️ LVT increase vote added. New rate: ${(lvtRate * 100).toFixed(1)}%`);
                    return true;
                } else {
                    console.error('Server rejected LVT increase vote:', result.error);
                    return false;
                }
            } catch (error) {
                console.error('Failed to send LVT increase vote:', error);
                return false;
            }
        }

        return false;
    }

    /**
     * Vote to decrease LVT rate by 1% (costs 1 voting point)
     */
    async decreaseLVTRate(playerId = 'player') {
        // Ensure structures exist before proceeding
        this.ensureGovernanceStructures();

        if (this.governance.votingPoints < 1) {
            console.log('Not enough voting points');
            return false;
        }

        // During gameplay, allow LVT changes but track them separately from pre-game baseline

        // Send LVT vote to server
        if (this.game && this.game.economicClient) {
            try {
                const transaction = {
                    type: 'GOVERNANCE_VOTE',
                    playerId: this.game.currentPlayerId || playerId,
                    category: 'lvt_decrease',
                    action: 'add'
                };

                const result = await this.game.economicClient.sendTransaction(transaction);

                if (result.success) {
                    // Update local state based on server response
                    if (result.votingPoints !== undefined) {
                        this.governance.votingPoints = result.votingPoints;
                    }
                    if (result.lvtRate !== undefined) {
                        this.governance.taxRate = result.lvtRate;
                    }

                    this.calculateTotalBudget();
                    this.updatePolicyEffects();
                    this.updateGovernanceModal();

                    const lvtRate = result.lvtRate || this.governance.taxRate;
                    console.log(`🗳️ LVT decrease vote added. New rate: ${(lvtRate * 100).toFixed(1)}%`);
                    return true;
                } else {
                    console.error('Server rejected LVT decrease vote:', result.error);
                    return false;
                }
            } catch (error) {
                console.error('Failed to send LVT decrease vote:', error);
                return false;
            }
        }

        return false;
    }

    /**
     * Set tax rate (internal method)
     */
    setTaxRate(rate) {
        this.governance.taxRate = Math.max(0, Math.min(1, rate)); // 0-100%
        this.calculateTotalBudget();
        this.updatePolicyEffects();

        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'UPDATE_TAX_RATE',
                rate: this.governance.taxRate
            });
        }
    }
    
    /**
     * Award voting points (called monthly)
     */
    awardVotingPoints(points = 10) {
        this.governance.votingPoints += points;

        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'AWARD_VOTING_POINTS',
                points
            });
        }
    }

    /**
     * Lock in pre-game LVT settings and reset for gameplay (called when game starts)
     */
    startGameplay() {
        console.log('🏛️ Locking in pre-game LVT settings and starting gameplay governance');

        // Mark game as started to prevent reclaiming pre-game LVT votes
        this.governance.gameStarted = true;

        // Lock in current LVT votes as pre-game baseline
        Object.keys(this.governance.playerVotes).forEach(playerId => {
            const currentLVTVotes = this.governance.playerVotes[playerId].lvtVotes || 0;
            this.governance.playerVotes[playerId].pregameLVTVotes = currentLVTVotes;
        });

        // Reset voting points to 2 for regular gameplay
        this.governance.votingPoints = 2;

        // Clear any category votes (LVT votes continue to be modifiable)
        Object.keys(this.governance.voteAllocations).forEach(category => {
            this.governance.voteAllocations[category] = 0;
        });

        // Clear player category votes but keep LVT system intact
        Object.keys(this.governance.playerVotes).forEach(playerId => {
            Object.keys(this.governance.playerVotes[playerId].categories).forEach(category => {
                this.governance.playerVotes[playerId].categories[category] = 0;
            });
            // LVT votes remain but are now baseline + any future changes
        });

        console.log(`🏛️ Game started with LVT rate: ${(this.governance.taxRate * 100).toFixed(1)}%`);
        console.log(`🏛️ Pre-game LVT votes locked, but LVT rate can still be modified during gameplay`);
        console.log(`🏛️ Players now have ${this.governance.votingPoints} points for regular governance`);
    }

    /**
     * Process monthly governance update (awards 2 points to each player)
     */
    processMonthlyUpdate() {
        // Award 2 voting points monthly
        this.governance.votingPoints += 2;

        // Recalculate budget based on current LVT rate
        this.calculateTotalBudget();
        this.calculateActualAllocations();
        this.updatePolicyEffects();


        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'MONTHLY_GOVERNANCE_UPDATE',
                votingPoints: this.governance.votingPoints
            });
        }
    }

    /**
     * Get current funding available for a category (for economic system)
     */
    getCategoryFunding(category) {
        if (!this.budgetCategories[category]) {
            return 0;
        }
        return this.governance.allocations[category] || 0;
    }

    /**
     * Spend funds from a specific category allocation
     */
    spendFromCategory(category, amount) {
        if (!this.budgetCategories[category]) {
            console.error('Invalid budget category:', category);
            return false;
        }

        const available = this.governance.allocations[category] || 0;
        if (amount > available) {
            console.error(`Insufficient funds in ${category}: need ${amount}, have ${available}`);
            return false;
        }

        this.governance.allocations[category] -= amount;
        this.governance.totalBudget -= amount;
        this.updateGovernanceModal();

        console.log(`💸 Spent $${amount.toLocaleString()} from ${category} budget`);
        return true;
    }

    /**
     * Distribute treasury funds to allocations based on voting percentages
     * Called at month rollover
     */
    distributeMonthlyBudget() {
        if (this.governance.treasuryBalance <= 0) {
            console.log('No treasury funds to distribute');
            return;
        }

        const totalVotes = Object.values(this.governance.voteAllocations)
            .reduce((sum, votes) => sum + votes, 0);

        if (totalVotes === 0) {
            console.log('No budget allocation votes - funds remain in treasury');
            return;
        }

        // Distribute treasury to allocations based on vote percentages
        const fundsToDistribute = this.governance.treasuryBalance;

        Object.keys(this.governance.allocations).forEach(category => {
            const votes = this.governance.voteAllocations[category] || 0;
            const voteShare = votes / totalVotes;
            const allocation = fundsToDistribute * voteShare;

            this.governance.allocations[category] += allocation;
        });

        // Move treasury to totalBudget and reset monthly tracking
        this.governance.totalBudget += this.governance.treasuryBalance;
        this.governance.treasuryBalance = 0;
        this.governance.monthlyCollected = 0;

        console.log(`📊 Distributed $${fundsToDistribute.toLocaleString()} from treasury to budget allocations`);
        this.updateGovernanceModal();
    }

    /**
     * Get current LVT rate (for economic system)
     */
    getCurrentLVTRate() {
        return this.governance.taxRate;
    }
    
    /**
     * Spend voting points
     */
    spendVotingPoints(amount, purpose = 'governance') {
        if (this.governance.votingPoints >= amount) {
            this.governance.votingPoints -= amount;
            
            // Update state management system
            if (this.game.gameState) {
                this.game.gameState.dispatch({
                    type: 'SPEND_VOTING_POINTS',
                    amount,
                    purpose
                });
            }
            
            return true;
        }
        return false;
    }
    
    /**
     * Update policy effects based on current allocations
     */
    updatePolicyEffects() {
        this.policyEffects.buildingCostReductions.clear();

        // Calculate cost reduction for each category based on funding (excluding UBI)
        Object.entries(this.governance.allocations).forEach(([category, funding]) => {
            if (funding > 0 && category !== 'ubi') {
                // Maximum 50% cost reduction at $1000 funding per category
                const reduction = Math.min(0.5, funding / 1000);
                this.policyEffects.buildingCostReductions.set(category, reduction);
            }
        });

        // Calculate UBI revenue boost effect
        this.policyEffects.ubiRevenueBoost = this.calculateUBIRevenueBoost();

        // Calculate tax revenue effect on city happiness
        this.policyEffects.taxRevenue = this.governance.totalBudget;
        this.policyEffects.lastUpdate = Date.now();
    }

    /**
     * Calculate UBI revenue boost multiplier
     * Formula: Monthly UBI per citizen / (Total city revenue + 1)
     */
    calculateUBIRevenueBoost() {
        const ubiAllocation = this.governance.allocations.ubi || 0;
        if (ubiAllocation <= 0) return 0;

        const cityStats = this.getCityStatistics();
        const totalPopulation = cityStats.totalPopulation;

        if (totalPopulation <= 0) return 0;

        // Monthly UBI per citizen
        const monthlyUbiPerCitizen = ubiAllocation / totalPopulation;

        // Total city revenue (sum of all building revenues)
        const totalCityRevenue = this.calculateTotalCityRevenue();

        // UBI boost formula: UBI per citizen / (total revenue + 1)
        const ubiBoost = monthlyUbiPerCitizen / (totalCityRevenue + 1);

        return Math.min(ubiBoost, 1.0); // Cap at 100% boost to prevent extreme multipliers
    }

    /**
     * Calculate total city revenue from all buildings
     */
    calculateTotalCityRevenue() {
        let totalRevenue = 0;

        if (!this.game.grid) return 0;

        for (let row = 0; row < this.game.gridSize; row++) {
            for (let col = 0; col < this.game.gridSize; col++) {
                const parcel = this.game.grid[row][col];
                if (parcel && parcel.building && parcel.revenue) {
                    totalRevenue += parcel.revenue;
                }
            }
        }

        return totalRevenue;
    }
    
    /**
     * Get building cost after applying governance discounts
     */
    getBuildingCostWithFunding(building, baseCost) {
        if (!building) {
            console.warn('🏤️ Governance: No building data provided');
            return 0;
        }

        if (!baseCost || baseCost <= 0) {
            console.warn('🏤️ Governance: No valid base cost provided:', baseCost);
            return 0;
        }

        const category = building.category?.toLowerCase();
        const discount = this.policyEffects.buildingCostReductions.get(category) || 0;
        const finalCost = Math.round(baseCost * (1 - discount));

        console.log('🏤️ Governance cost calculation:', {
            buildingId: building.id,
            baseCost,
            category,
            discount,
            finalCost
        });

        return finalCost;
    }
    
    /**
     * Get funding discount for a building category
     */
    getFundingDiscount(category) {
        return this.policyEffects.buildingCostReductions.get(category?.toLowerCase()) || 0;
    }

    /**
     * Get UBI revenue boost for building owners
     */
    getUBIRevenueBoost() {
        return this.policyEffects.ubiRevenueBoost || 0;
    }

    /**
     * Apply UBI boost to building revenue
     */
    applyUBIBoostToRevenue(baseRevenue) {
        const ubiBoost = this.getUBIRevenueBoost();
        return baseRevenue * (1 + ubiBoost);
    }
    
    /**
     * Get city statistics for budget calculations
     */
    getCityStatistics() {
        let totalPopulation = 0;
        let totalBuildings = 0;
        let playerBuildings = 0;
        
        if (this.game.grid) {
            for (let row = 0; row < this.game.gridSize; row++) {
                for (let col = 0; col < this.game.gridSize; col++) {
                    const parcel = this.game.grid[row][col];
                    if (parcel) {
                        if (parcel.population) {
                            totalPopulation += parcel.population;
                        }
                        if (parcel.building) {
                            totalBuildings++;
                            if (this.game.isCurrentPlayer(parcel.owner)) {
                                playerBuildings++;
                            }
                        }
                    }
                }
            }
        }
        
        return {
            totalPopulation,
            totalBuildings,
            playerBuildings
        };
    }
    
    /**
     * Process daily governance activities
     */
    processDailyGovernance() {
        // Recalculate budget (population may have changed)
        this.calculateTotalBudget();
        
        // Update policy effects
        this.updatePolicyEffects();
    }
    
    /**
     * Process monthly governance activities
     */
    processMonthlyGovernance() {
        // Award voting points (2 points per month, accumulating)
        this.game.awardMonthlyVotingPoints();
        
        // Recalculate budget for new month
        this.calculateTotalBudget();
        
        // Trigger governance button animation
        this.animateGovernanceButton();
    }
    
    /**
     * Animate governance button to indicate new voting points
     */
    animateGovernanceButton() {
        const governanceBtn = this.game.uiManager?.get('showGovernance');
        if (governanceBtn) {
            governanceBtn.classList.add('pulse-animation');
            setTimeout(() => {
                governanceBtn.classList.remove('pulse-animation');
            }, 2000);
        }
    }

    /**
     * Animate governance button with gold fade on month turnover
     */
    animateGovernanceButtonGold() {
        const governanceBtn = this.game.uiManager?.get('showGovernance');
        if (governanceBtn) {
            // Apply gold background that fades over 3 seconds
            governanceBtn.style.transition = 'background-color 3s ease-out';
            governanceBtn.style.backgroundColor = '#FFD700'; // Gold color

            setTimeout(() => {
                governanceBtn.style.backgroundColor = ''; // Reset to original
                setTimeout(() => {
                    governanceBtn.style.transition = ''; // Clear transition
                }, 100);
            }, 3000);

            console.log('🏆 Gold fade animation applied to governance button');
        }
    }
    
    /**
     * Open governance modal
     */
    openGovernanceModal() {
        // Skip DOM operations if running on server (Node.js)
        if (typeof document === 'undefined') {
            return;
        }

        // Get modal directly
        let modal = document.getElementById('governance-modal');
        
        if (!modal) {
            console.error('Governance modal not found in DOM!');
            return;
        }
        
        // Move modal to body to ensure it's not hidden by parent elements
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        
        // Use the new smooth modal animation system
        modal.classList.add('visible');

        // Ensure event listeners are set up
        this.setupEventListeners();

        this.updateGovernanceModal();
        
        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'OPEN_MODAL',
                modalId: 'governance'
            });
        }
    }
    
    /**
     * Close governance modal
     */
    closeGovernanceModal() {
        // Skip DOM operations if running on server (Node.js)
        if (typeof document === 'undefined') {
            return;
        }

        const modal = document.getElementById('governance-modal');

        if (modal) {
            modal.classList.remove('visible');

            // Reset inline styles
            modal.style.cssText = '';

            // Also reset modal content styles
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.cssText = '';
            }
        } else {
            console.error('Modal element not found when trying to close');
        }
        
        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'CLOSE_MODAL'
            });
        }
    }
    
    /**
     * Update governance modal with current data
     */
    updateGovernanceModal() {
        // Skip DOM updates if running on server (Node.js)
        if (typeof document === 'undefined') {
            return;
        }

        // Ensure structures exist before updating UI
        this.ensureGovernanceStructures();


        // Update voting points display
        const votingPointsEl = document.getElementById('player-voting-points');
        if (votingPointsEl && this.governance.votingPoints !== undefined) {
            votingPointsEl.textContent = this.governance.votingPoints.toString();
        }

        // Note: City treasury display is now handled by updatePlayerStats() in game.js

        // Update monthly collection (governance modal)
        const monthlyLvtEl = document.getElementById('monthly-lvt-amount');
        if (monthlyLvtEl) {
            const monthlyCollected = this.governance.monthlyCollected || 0;
            monthlyLvtEl.textContent = monthlyCollected.toLocaleString();
        }

        // Update unallocated funds (should match treasury balance since both represent available funds)
        const unallocatedEl = document.getElementById('unallocated-funds-amount');
        if (unallocatedEl) {
            const availableFunds = this.governance.treasuryBalance || 0;
            unallocatedEl.textContent = availableFunds.toLocaleString();
        }

        // Update tax rate display
        const taxRateEl = document.getElementById('current-lvt-display');
        if (taxRateEl) {
            taxRateEl.textContent = `${(this.governance.taxRate * 100).toFixed(1)}%`;
        }

        // Update vote counts for each category

        // Safety check: ensure voteAllocations exists
        if (!this.governance.voteAllocations) {
            console.warn('⚠️ voteAllocations is undefined, initializing...');
            this.governance.voteAllocations = {
                education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                culture: 0, recreation: 0, commercial: 0, civic: 0,
                emergency: 0, ubi: 0
            };
        }

        // Calculate total votes for percentage display
        const totalVotes = Object.values(this.governance.voteAllocations).reduce((sum, votes) => sum + votes, 0);
        const playerId = 'player'; // In future, get current player ID from game state
        const playerData = this.governance.playerVotes[playerId] || { categories: {}, lvtVotes: 0 };

        Object.entries(this.governance.voteAllocations).forEach(([category, voteCount]) => {
            const categoryRow = document.querySelector(`[data-category="${category}"]`);
            const categoryEl = document.querySelector(`[data-category="${category}"] .vote-count`);

            if (categoryEl) {
                categoryEl.textContent = voteCount.toString();
            }

            // Update percentage display
            const percentEl = document.querySelector(`[data-category="${category}"] .category-allocation`);
            if (percentEl) {
                const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(1) : '0.0';
                percentEl.textContent = `${percentage}%`;
            }

            // Apply purple highlighting based on player's allocation
            if (categoryRow) {
                const playerVotes = playerData.categories[category] || 0;
                if (playerVotes > 0) {
                    // Calculate intensity (0.1 to 0.5 based on vote count, max at 5 votes)
                    const intensity = Math.min(0.1 + (playerVotes * 0.08), 0.5);
                    categoryRow.style.backgroundColor = `rgba(147, 51, 234, ${intensity})`;
                    categoryRow.style.border = '1px solid rgba(147, 51, 234, 0.5)';
                } else {
                    categoryRow.style.backgroundColor = '';
                    categoryRow.style.border = '';
                }
            }

            // Update player allocation indicators (colored dots)
            this.updatePlayerAllocationDots(category, playerData.categories[category] || 0);

            // Update coffers display
            const cofferEl = document.querySelector(`[data-category="${category}"] .category-coffers span`);
            if (cofferEl) {
                const fundingAmount = this.governance.allocations[category] || 0;
                if (category === 'ubi') {
                    // Special display for UBI - show per citizen amount
                    const cityStats = this.getCityStatistics();
                    const perCitizen = cityStats.totalPopulation > 0 ? (fundingAmount / cityStats.totalPopulation) : 0;
                    cofferEl.textContent = perCitizen.toFixed(2);
                } else {
                    cofferEl.textContent = fundingAmount.toLocaleString();
                }
            }
        });

        // Apply LVT highlighting
        const lvtSection = document.querySelector('.lvt-allocation');
        if (lvtSection && playerData.lvtVotes > 0) {
            const intensity = Math.min(0.1 + (playerData.lvtVotes * 0.08), 0.5);
            lvtSection.style.backgroundColor = `rgba(147, 51, 234, ${intensity})`;
            lvtSection.style.border = '1px solid rgba(147, 51, 234, 0.5)';
        } else if (lvtSection) {
            lvtSection.style.backgroundColor = '';
            lvtSection.style.border = '';
        }
    }
    
    /**
     * Update tooltips for budget categories
     */
    updateBudgetCategoryTooltips() {
        Object.entries(this.budgetCategories).forEach(([category, info]) => {
            const funding = this.governance.allocations[category] || 0;
            const discount = this.getFundingDiscount(category);
            
            const tooltipText = `<strong>${info.name}</strong><br><br>` +
                `<strong>Current Funding:</strong> $${funding.toLocaleString()}<br>` +
                `<strong>Cost Reduction:</strong> ${(discount * 100).toFixed(1)}%<br><br>` +
                `<strong>Effect:</strong> ${info.effect}<br><br>` +
                `<em>Increase funding to reduce building costs in this category</em>`;
            
            // Find budget category element and set tooltip
            const categoryEl = document.querySelector(`.budget-category[data-category="${category}"]`);
            if (categoryEl) {
                categoryEl.setAttribute('data-tooltip', tooltipText);
            }
        });
    }
    
    /**
     * Get governance statistics for display
     */
    getGovernanceStats() {
        const cityStats = this.getCityStatistics();

        return {
            governance: this.governance,
            cityStats,
            policyEffects: {
                totalCostReductions: this.policyEffects.buildingCostReductions.size,
                averageDiscount: this.getAverageDiscount(),
                ubiRevenueBoost: this.policyEffects.ubiRevenueBoost,
                taxRevenue: this.policyEffects.taxRevenue
            }
        };
    }
    
    /**
     * Get average discount across all categories
     */
    getAverageDiscount() {
        const discounts = Array.from(this.policyEffects.buildingCostReductions.values());
        if (discounts.length === 0) return 0;
        
        const sum = discounts.reduce((a, b) => a + b, 0);
        return sum / discounts.length;
    }
    
    /**
     * Reset governance state (board game reset)
     */
    reset() {
        this.governance = {
            treasuryBalance: 0,
            monthlyCollected: 0,
            totalBudget: 0,
            unallocatedFunds: 0,
            allocations: {
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0
            },
            voteAllocations: {
                education: 0,
                healthcare: 0,
                infrastructure: 0,
                housing: 0,
                culture: 0,
                recreation: 0,
                commercial: 0,
                civic: 0,
                emergency: 0,
                ubi: 0
            },
            playerVotes: {
                player: {
                    categories: {
                        education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                        culture: 0, recreation: 0, commercial: 0, civic: 0,
                        emergency: 0, ubi: 0
                    },
                    lvtVotes: 0,
                    pregameLVTVotes: 0
                }
            },
            taxRate: 0.50,
            votingPoints: 4, // Start fresh with 4 voting points for LVT setup
            gameStarted: false, // Reset to pre-game state
            lastBudgetUpdate: 0
        };

        this.policyEffects.buildingCostReductions.clear();
        this.policyEffects.ubiRevenueBoost = 0;
        this.updatePolicyEffects();

        console.log('🎲 Governance system reset to fresh board game state');
    }
    
    /**
     * Export governance data
     */
    exportData() {
        return {
            governance: this.governance,
            policyEffects: {
                buildingCostReductions: Object.fromEntries(this.policyEffects.buildingCostReductions),
                taxRevenue: this.policyEffects.taxRevenue,
                lastUpdate: this.policyEffects.lastUpdate
            }
        };
    }
    
    /**
     * Import governance data
     */
    importData(data) {
        if (data.governance) {
            // Ensure voteAllocations exists in imported data
            const defaultVoteAllocations = {
                education: 0, healthcare: 0, infrastructure: 0, housing: 0,
                culture: 0, recreation: 0, commercial: 0, civic: 0,
                emergency: 0, ubi: 0
            };

            this.governance = {
                ...this.governance,
                ...data.governance,
                voteAllocations: {
                    ...defaultVoteAllocations,
                    ...(data.governance.voteAllocations || {})
                }
            };
        }
        
        if (data.policyEffects) {
            if (data.policyEffects.buildingCostReductions) {
                this.policyEffects.buildingCostReductions.clear();
                Object.entries(data.policyEffects.buildingCostReductions).forEach(([key, value]) => {
                    this.policyEffects.buildingCostReductions.set(key, value);
                });
            }
            
            this.policyEffects.taxRevenue = data.policyEffects.taxRevenue || 0;
            this.policyEffects.lastUpdate = data.policyEffects.lastUpdate || Date.now();
        }
        
        this.updateUnallocatedFunds();
    }

    /**
     * Set up governance modal event listeners
     */
    setupEventListeners() {
        // Skip DOM operations if running on server (Node.js)
        if (typeof document === 'undefined') {
            return;
        }

        // Prevent duplicate event listener registration
        if (this._eventListenersSetup) {
            console.log('🏛️ Governance event listeners already setup, skipping...');
            return;
        }

        // Check if elements exist first
        const modal = document.getElementById('governance-modal');
        const closeBtn = document.getElementById('close-governance-modal');
        const voteButtons = document.querySelectorAll('.vote-btn[data-category]');

        if (!modal) {
            console.error('Governance modal not found in DOM');
            return;
        }

        try {
            // Close modal button
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeGovernanceModal();
                });
            }

            // Close modal on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'governance-modal') {
                    this.closeGovernanceModal();
                }
            });

            // Budget category voting buttons (excluding LVT buttons)
            voteButtons.forEach((btn) => {
                const category = btn.getAttribute('data-category');
                const action = btn.getAttribute('data-action');

                btn.addEventListener('click', async () => {
                    try {
                        let result = false;
                        if (action === 'increase') {
                            result = await this.addCategoryVote(category);
                        } else {
                            result = await this.removeCategoryVote(category);
                        }
                    } catch (error) {
                        console.error('Error in vote button click:', error);
                    }
                });
            });

            // LVT point allocation buttons
            const lvtIncreaseBtn = document.getElementById('lvt-increase-btn');
            if (lvtIncreaseBtn) {
                lvtIncreaseBtn.addEventListener('click', () => {
                    try {
                        this.increaseLVTRate();
                    } catch (error) {
                        console.error('Error in LVT increase button:', error);
                    }
                });
            }

            const lvtDecreaseBtn = document.getElementById('lvt-decrease-btn');
            if (lvtDecreaseBtn) {
                lvtDecreaseBtn.addEventListener('click', () => {
                    try {
                        this.decreaseLVTRate();
                    } catch (error) {
                        console.error('Error in LVT decrease button:', error);
                    }
                });
            }

        } catch (error) {
            console.error('Error setting up governance modal:', error);
        }

        // Mark that event listeners have been set up to prevent duplicates
        this._eventListenersSetup = true;
        console.log('🏛️ Governance event listeners setup completed');
    }

    /**
     * Update player allocation indicators (colored dots) for a category
     * Shows one dot per player with 5 size steps based on vote count
     */
    async updatePlayerAllocationDots(category, playerVotes) {
        // Skip DOM operations if running on server (Node.js)
        if (typeof document === 'undefined') {
            return;
        }

        const indicatorsContainer = document.querySelector(`.player-allocation-indicators[data-category="${category}"]`);
        if (!indicatorsContainer) return;

        // Clear existing dots
        indicatorsContainer.innerHTML = '';

        try {
            // Get all players data to show all votes in this category
            const response = await fetch('/api/players');
            if (!response.ok) return;

            const data = await response.json();
            const allPlayers = data.players || {};

            // Create dots for all players who have voted in this category
            Object.entries(allPlayers).forEach(([playerId, playerData], index) => {
                const votes = this.governance.playerVotes[playerId]?.categories[category] || 0;

                if (votes > 0) {
                    const dot = document.createElement('div');

                    // Determine size class (1-5 based on vote count)
                    const sizeClass = Math.min(Math.max(votes, 1), 5);
                    dot.className = `player-allocation-dot visible size-${sizeClass}`;

                    // Set player color
                    const playerColor = playerData.color || this.getDefaultPlayerColor(playerId);
                    dot.style.backgroundColor = playerColor;

                    // Add hover tooltip with player name and vote count
                    dot.title = `${playerData.name || playerId}: ${votes} vote${votes !== 1 ? 's' : ''}`;

                    // Add data attributes for hover functionality
                    dot.dataset.playerId = playerId;
                    dot.dataset.playerName = playerData.name || playerId;
                    dot.dataset.voteCount = votes;

                    // Add slight animation delay
                    setTimeout(() => {
                        indicatorsContainer.appendChild(dot);
                    }, index * 30);
                }
            });
        } catch (error) {
            console.error('Failed to update player allocation dots:', error);
            // Fallback to old behavior showing only current player
            this.updatePlayerAllocationDotsFallback(category, playerVotes);
        }
    }

    /**
     * Fallback method for showing dots when API call fails
     */
    updatePlayerAllocationDotsFallback(category, playerVotes) {
        const indicatorsContainer = document.querySelector(`.player-allocation-indicators[data-category="${category}"]`);
        if (!indicatorsContainer || playerVotes <= 0) return;

        const playerColor = this.getPlayerColorSync();
        const dot = document.createElement('div');

        // Single dot sized by vote count
        const sizeClass = Math.min(Math.max(playerVotes, 1), 5);
        dot.className = `player-allocation-dot visible size-${sizeClass}`;
        dot.style.backgroundColor = playerColor;
        dot.title = `You: ${playerVotes} vote${playerVotes !== 1 ? 's' : ''}`;

        indicatorsContainer.appendChild(dot);
    }

    /**
     * Get default color for a player if not set
     */
    getDefaultPlayerColor(playerId) {
        const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
        const hash = playerId.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return colors[Math.abs(hash) % colors.length];
    }

    /**
     * Get current player's color from server (with fallbacks)
     */
    async getPlayerColor() {
        try {
            // First try to get from server
            const response = await fetch('/api/players');
            if (response.ok) {
                const data = await response.json();
                const currentPlayer = data.players?.player || data.players?.[Object.keys(data.players)[0]];
                if (currentPlayer && currentPlayer.color) {
                    // Cache the server data for sync method use
                    if (!this._cachedPlayerColors) {
                        this._cachedPlayerColors = {};
                    }
                    this._cachedPlayerColors.player = currentPlayer.color;
                    return currentPlayer.color;
                }
            }
        } catch (error) {
            console.warn('Could not fetch player color from server:', error);
        }

        // Fallback to game's player settings
        if (typeof window !== 'undefined' && window.game && window.game.playerSettings && window.game.playerSettings.color) {
            return window.game.playerSettings.color;
        }

        // Fallback to localStorage
        const savedColor = localStorage.getItem('playerColor');
        if (savedColor) {
            return savedColor;
        }

        // Default fallback color
        return '#10AC84';
    }

    /**
     * Synchronous version of getPlayerColor for immediate use
     */
    getPlayerColorSync() {
        // Priority 1: Game's player settings (most reliable after initialization fix)
        if (typeof window !== 'undefined' && window.game && window.game.playerSettings && window.game.playerSettings.color) {
            return window.game.playerSettings.color;
        }

        // Priority 2: Use cached server data if available
        if (this._cachedPlayerColors && this._cachedPlayerColors.player) {
            return this._cachedPlayerColors.player;
        }

        // Priority 3: Fallback to localStorage
        const savedColor = localStorage.getItem('playerColor');
        if (savedColor) {
            return savedColor;
        }

        // Priority 4: Default fallback color
        return '#10AC84';
    }

    /**
     * Initialize player color cache from server
     */
    async initializePlayerColorCache() {
        try {
            const color = await this.getPlayerColor();
            if (color) {
            }
        } catch (error) {
            console.warn('Could not initialize player color cache:', error);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GovernanceSystem;
}