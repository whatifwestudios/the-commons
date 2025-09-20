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
                housing: 0,
                commercial: 0,
                utilities: 0,
                education: 0,
                recreation: 0,
                civic: 0
            },
            taxRate: 0.15, // 15% default tax rate
            votingPoints: 0,
            lastBudgetUpdate: 0
        };
        
        // Budget categories and their effects
        this.budgetCategories = {
            housing: {
                name: 'Housing',
                description: 'Subsidies for residential development',
                icon: '🏠',
                effect: 'Reduces building costs for housing projects'
            },
            commercial: {
                name: 'Commercial',
                description: 'Business development incentives',
                icon: '🏪', 
                effect: 'Reduces building costs for commercial projects'
            },
            utilities: {
                name: 'Utilities',
                description: 'Infrastructure and utility subsidies',
                icon: '⚡',
                effect: 'Reduces building costs for utility projects'
            },
            education: {
                name: 'Education',
                description: 'Educational institution funding',
                icon: '🎓',
                effect: 'Reduces building costs for educational facilities'
            },
            recreation: {
                name: 'Recreation',
                description: 'Parks and recreational facility funding',
                icon: '🏞️',
                effect: 'Reduces building costs for recreational facilities'
            },
            civic: {
                name: 'Civic',
                description: 'Government and public service funding',
                icon: '🏛️',
                effect: 'Reduces building costs for civic buildings'
            }
        };
        
        // Policy effects cache
        this.policyEffects = {
            buildingCostReductions: new Map(),
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
     * Allocate funds to a budget category
     */
    allocateFunds(category, amount) {
        if (!this.budgetCategories[category]) {
            console.error('Invalid budget category:', category);
            return false;
        }
        
        // Ensure we don't over-allocate
        const totalAllocated = Object.values(this.governance.allocations)
            .reduce((sum, amount) => sum + amount, 0);
        const currentAllocation = this.governance.allocations[category];
        const maxAmount = this.governance.totalBudget - (totalAllocated - currentAllocation);
        
        const finalAmount = Math.max(0, Math.min(amount, maxAmount));
        this.governance.allocations[category] = finalAmount;
        
        this.updateUnallocatedFunds();
        this.updatePolicyEffects();
        
        // Update state management system
        if (this.game.gameState) {
            this.game.gameState.dispatch({
                type: 'ALLOCATE_FUNDS',
                category,
                amount: finalAmount
            });
        }
        
        return true;
    }
    
    /**
     * Set tax rate
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
        
        // Calculate cost reduction for each category based on funding
        Object.entries(this.governance.allocations).forEach(([category, funding]) => {
            if (funding > 0) {
                // Maximum 50% cost reduction at $1000 funding per category
                const reduction = Math.min(0.5, funding / 1000);
                this.policyEffects.buildingCostReductions.set(category, reduction);
            }
        });
        
        // Calculate tax revenue effect on city happiness
        this.policyEffects.taxRevenue = this.governance.totalBudget;
        this.policyEffects.lastUpdate = Date.now();
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
        // Update budget displays
        this.game.uiManager?.updateText('totalBudget', `$${this.governance.totalBudget.toLocaleString()}`);
        this.game.uiManager?.updateText('budgetUnallocated', `$${this.governance.unallocatedFunds.toLocaleString()}`);
        this.game.uiManager?.updateText('votingPoints', this.governance.votingPoints.toString());
        this.game.uiManager?.updateText('taxRate', `${(this.governance.taxRate * 100).toFixed(1)}%`);
        
        // Update allocation displays
        Object.entries(this.governance.allocations).forEach(([category, amount]) => {
            const elementKey = `allocation${category.charAt(0).toUpperCase() + category.slice(1)}`;
            this.game.uiManager?.updateText(elementKey, `$${amount.toLocaleString()}`);
        });
        
        // Update budget category tooltips
        this.updateBudgetCategoryTooltips();
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
                housing: 0,
                commercial: 0,
                utilities: 0,
                education: 0,
                recreation: 0,
                civic: 0
            },
            taxRate: 0.15,
            votingPoints: 0,
            lastBudgetUpdate: 0
        };
        
        this.policyEffects.buildingCostReductions.clear();
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
            this.governance = { ...this.governance, ...data.governance };
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
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GovernanceSystem;
}