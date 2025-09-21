/**
 * Governance System for The Commons
 * Handles budget allocation, voting, tax rates, and civic policies
 */

class GovernanceSystem {
    constructor(game) {
        this.game = game;
        
        // Governance state
        this.governance = {
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
                    lvtVotes: 0  // Track LVT votes separately
                }
            },
            taxRate: 0.50, // 50% default LVT rate
            votingPoints: 2, // Start with 2 voting points
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
        this.calculateTotalBudget();
        this.updatePolicyEffects();
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
     * Add a vote to a category (costs 1 voting point)
     */
    addCategoryVote(category, playerId = 'player') {
        if (!this.budgetCategories[category]) {
            console.error('Invalid budget category:', category);
            return false;
        }

        if (this.governance.votingPoints < 1) {
            console.log('Not enough voting points');
            return false;
        }

        // Ensure player entry exists
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

        // Spend point and add vote
        this.governance.votingPoints -= 1;
        this.governance.voteAllocations[category] += 1;
        this.governance.playerVotes[playerId].categories[category] += 1;

        this.calculateActualAllocations();
        this.updatePolicyEffects();
        this.updateGovernanceModal();

        return true;
    }

    /**
     * Remove a vote from a category (refunds 1 voting point)
     */
    removeCategoryVote(category, playerId = 'player') {
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

        // Refund point and remove vote
        this.governance.votingPoints += 1;
        this.governance.voteAllocations[category] -= 1;
        this.governance.playerVotes[playerId].categories[category] -= 1;

        this.calculateActualAllocations();
        this.updatePolicyEffects();
        this.updateGovernanceModal();

        return true;
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

        console.log(`💰 Calculated allocations from ${totalVotes} total votes:`, this.governance.allocations);
        this.updateUnallocatedFunds();
    }

    /**
     * Set tax rate
     */
    /**
     * Increase LVT rate by 1% (costs 1 voting point)
     */
    increaseLVTRate(playerId = 'player') {
        if (this.governance.votingPoints < 1) {
            console.log('Not enough voting points');
            return false;
        }

        if (this.governance.taxRate >= 1.0) {
            console.log('LVT rate already at maximum (100%)');
            return false;
        }

        // Ensure player entry exists
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

        // Spend point and increase rate
        this.governance.votingPoints -= 1;
        this.governance.taxRate = Math.min(1.0, this.governance.taxRate + 0.01);
        this.governance.playerVotes[playerId].lvtVotes += 1;

        this.calculateTotalBudget();
        this.updatePolicyEffects();
        this.updateGovernanceModal();

        return true;
    }

    /**
     * Decrease LVT rate by 1% (refunds 1 voting point if player allocated it)
     */
    decreaseLVTRate(playerId = 'player') {
        // Check if player has LVT votes to remove
        if (!this.governance.playerVotes[playerId] ||
            this.governance.playerVotes[playerId].lvtVotes <= 0) {
            console.log('No LVT votes to remove for this player');
            return false;
        }

        if (this.governance.taxRate <= 0.0) {
            console.log('LVT rate already at minimum (0%)');
            return false;
        }

        // Refund point and decrease rate
        this.governance.votingPoints += 1;
        this.governance.taxRate = Math.max(0.0, this.governance.taxRate - 0.01);
        this.governance.playerVotes[playerId].lvtVotes -= 1;

        this.calculateTotalBudget();
        this.updatePolicyEffects();
        this.updateGovernanceModal();

        return true;
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
     * Process monthly governance update (awards 2 points to each player)
     */
    processMonthlyUpdate() {
        // Award 2 voting points monthly
        this.governance.votingPoints += 2;

        // Recalculate budget based on current LVT rate
        this.calculateTotalBudget();
        this.calculateActualAllocations();
        this.updatePolicyEffects();

        console.log(`Monthly governance update: +2 voting points (total: ${this.governance.votingPoints})`);

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
    getBuildingCostWithFunding(building) {
        if (!building || !building.cost) return 0;
        
        const baseCost = building.cost;
        const category = building.category?.toLowerCase();
        const discount = this.policyEffects.buildingCostReductions.get(category) || 0;
        
        return Math.round(baseCost * (1 - discount));
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
     * Open governance modal
     */
    openGovernanceModal() {
        
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
        console.log('🔄 Updating governance modal UI...');
        console.log('📊 Current state:', {
            votingPoints: this.governance.votingPoints,
            taxRate: this.governance.taxRate,
            allocations: this.governance.allocations
        });

        // Update voting points display
        const votingPointsEl = document.getElementById('player-voting-points');
        if (votingPointsEl) {
            votingPointsEl.textContent = this.governance.votingPoints.toString();
            console.log('✅ Updated voting points display:', this.governance.votingPoints);
        } else {
            console.warn('❌ Voting points element not found');
        }

        // Update monthly LVT collection
        const monthlyLvtEl = document.getElementById('monthly-lvt-amount');
        if (monthlyLvtEl) {
            monthlyLvtEl.textContent = this.governance.totalBudget.toLocaleString();
        }

        // Update unallocated funds
        const unallocatedEl = document.getElementById('unallocated-funds-amount');
        if (unallocatedEl) {
            unallocatedEl.textContent = this.governance.unallocatedFunds.toLocaleString();
        }

        // Update tax rate display
        const taxRateEl = document.getElementById('current-lvt-display');
        if (taxRateEl) {
            taxRateEl.textContent = `${(this.governance.taxRate * 100).toFixed(1)}%`;
        }

        // Update vote counts for each category
        console.log(`🔄 updateGovernanceModal called, current vote allocations:`, this.governance.voteAllocations);

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
            console.log(`🔍 Processing category ${category} with ${voteCount} votes`);
            const categoryRow = document.querySelector(`[data-category="${category}"]`);
            const categoryEl = document.querySelector(`[data-category="${category}"] .vote-count`);

            if (categoryEl) {
                console.log(`🔄 Setting ${category} vote count to: ${voteCount}`);
                categoryEl.textContent = voteCount.toString();
                console.log(`✅ Updated ${category} vote count: ${voteCount}`);
            } else {
                console.warn(`❌ Vote count element not found for category: ${category}`);
            }

            // Update percentage display
            const percentEl = document.querySelector(`[data-category="${category}"] .category-percentage`);
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
     * Reset governance state
     */
    reset() {
        this.governance = {
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
            taxRate: 0.50,
            votingPoints: 2,
            lastBudgetUpdate: 0
        };

        this.policyEffects.buildingCostReductions.clear();
        this.policyEffects.ubiRevenueBoost = 0;
        this.updatePolicyEffects();
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
        console.log('🔧 Setting up governance modal event listeners...');

        // Check if elements exist first
        const modal = document.getElementById('governance-modal');
        const closeBtn = document.getElementById('close-governance-modal');
        const voteButtons = document.querySelectorAll('.vote-btn[data-category]');

        console.log('📍 Modal found:', !!modal);
        console.log('📍 Close button found:', !!closeBtn);
        console.log('📍 Vote buttons found:', voteButtons.length);

        if (!modal) {
            console.error('❌ Governance modal not found in DOM');
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

                btn.addEventListener('click', () => {
                    try {
                        console.log(`🔲 Vote button clicked: ${category} ${action}`);

                        let result = false;
                        if (action === 'increase') {
                            result = this.addCategoryVote(category);
                        } else {
                            result = this.removeCategoryVote(category);
                        }

                        console.log('📊 Vote allocation result:', result);
                    } catch (error) {
                        console.error('Error in vote button click:', error);
                    }
                });
            });

            // LVT point allocation buttons
            const lvtIncreaseBtn = document.getElementById('lvt-increase-btn');
            if (lvtIncreaseBtn) {
                console.log('✅ LVT increase button found, adding event listener');
                lvtIncreaseBtn.addEventListener('click', () => {
                    console.log('🔲 LVT increase button clicked!');
                    try {
                        const result = this.increaseLVTRate();
                        console.log('📊 LVT increase result:', result);
                    } catch (error) {
                        console.error('Error in LVT increase button:', error);
                    }
                });
            } else {
                console.warn('❌ LVT increase button not found');
            }

            const lvtDecreaseBtn = document.getElementById('lvt-decrease-btn');
            if (lvtDecreaseBtn) {
                console.log('✅ LVT decrease button found, adding event listener');
                lvtDecreaseBtn.addEventListener('click', () => {
                    console.log('🔲 LVT decrease button clicked!');
                    try {
                        const result = this.decreaseLVTRate();
                        console.log('📊 LVT decrease result:', result);
                    } catch (error) {
                        console.error('Error in LVT decrease button:', error);
                    }
                });
            } else {
                console.warn('❌ LVT decrease button not found');
            }

            console.log('✅ Governance event listeners setup complete');
        } catch (error) {
            console.error('Error setting up governance modal:', error);
        }
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GovernanceSystem;
}