/**
 * Unified Tooltip Management System
 * Provides consistent, performant tooltips across the entire application
 */

class TooltipManager {
    constructor() {
        this.currentTooltip = null;
        this.tooltipElement = null;
        this.hideTimer = null;
        this.showTimer = null;
        this.isVisible = false;
        this.lastContent = null;
        this.lastPosition = { x: 0, y: 0 };
        this.contentCache = new Map();
        this.priority = 0; // Higher priority tooltips override lower ones
        this.isDestroyed = false;
        
        // Performance tracking
        this.metrics = {
            showCount: 0,
            cacheHits: 0,
            positionCalculations: 0
        };
        
        this.createTooltipElement();
        this.setupGlobalEventListeners();
    }
    
    createTooltipElement() {
        // Remove any existing unified tooltip
        const existing = document.getElementById('unified-tooltip');
        if (existing) existing.remove();
        
        // Create single tooltip element
        this.tooltipElement = document.createElement('div');
        this.tooltipElement.id = 'unified-tooltip';
        this.tooltipElement.className = 'unified-tooltip';
        this.tooltipElement.style.cssText = `
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            padding: 8px 12px;
            color: #ffffff;
            font-size: 12px;
            line-height: 1.4;
            white-space: normal;
            word-wrap: break-word;
            overflow-wrap: break-word;
            max-width: 300px;
            pointer-events: none;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.15s ease, visibility 0.15s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        `;
        document.body.appendChild(this.tooltipElement);
    }
    
    show(content, x, y, options = {}) {
        if (this.isDestroyed || !content) return;
        
        const { 
            delay = 250, // 2x faster (was 500ms)
            html = false, 
            maxWidth = 300,
            className = '',
            priority = 0,
            cacheKey = null,
            animationSpeed = 'normal'
        } = options;
        
        // Priority system - don't override higher priority tooltips
        if (this.isVisible && priority < this.priority) {
            return;
        }
        
        // Performance optimization: Skip if content and position haven't changed significantly
        const positionChanged = Math.abs(x - this.lastPosition.x) > 5 || Math.abs(y - this.lastPosition.y) > 5;
        if (this.isVisible && content === this.lastContent && !positionChanged) {
            return;
        }
        
        this.hide(); // Hide any existing tooltip first
        this.priority = priority;
        
        // Clear any existing timers
        this.clearTimers();
        
        // Cache content for performance
        let processedContent = content;
        if (cacheKey && this.contentCache.has(cacheKey)) {
            processedContent = this.contentCache.get(cacheKey);
            this.metrics.cacheHits++;
        } else if (cacheKey) {
            this.contentCache.set(cacheKey, content);
            // Limit cache size to prevent memory leaks
            if (this.contentCache.size > 100) {
                const firstKey = this.contentCache.keys().next().value;
                this.contentCache.delete(firstKey);
            }
        }
        
        // Set timer to show tooltip after delay
        this.showTimer = setTimeout(() => {
            if (this.isDestroyed) return;
            
            if (html) {
                this.tooltipElement.innerHTML = processedContent;
            } else {
                this.tooltipElement.textContent = processedContent;
            }
            
            this.tooltipElement.style.maxWidth = maxWidth + 'px';
            this.tooltipElement.className = `unified-tooltip ${className}`;
            
            // Position tooltip with intelligent positioning
            this.position(x, y);
            
            // Set animation speed
            const transitionDuration = animationSpeed === 'fast' ? '0.075s' : '0.15s';
            this.tooltipElement.style.transition = `opacity ${transitionDuration} ease, visibility ${transitionDuration} ease`;
            
            // Show tooltip with smooth animation
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.visibility = 'visible';
            this.isVisible = true;
            this.lastContent = content;
            this.lastPosition = { x, y };
            this.metrics.showCount++;
            
        }, delay);
    }
    
    showImmediate(content, x, y, options = {}) {
        this.show(content, x, y, { ...options, delay: 0 });
    }
    
    position(x, y) {
        if (!this.tooltipElement) return;
        
        this.metrics.positionCalculations++;
        
        // Force layout calculation if needed
        if (this.tooltipElement.offsetWidth === 0) {
            this.tooltipElement.style.visibility = 'hidden';
            this.tooltipElement.style.opacity = '1';
            this.tooltipElement.style.display = 'block';
        }
        
        const rect = this.tooltipElement.getBoundingClientRect();
        const tooltipWidth = rect.width || 200;
        const tooltipHeight = rect.height || 50;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 15;
        const offset = 12;
        
        // Intelligent positioning algorithm
        const positions = [
            { x: x + offset, y: y - tooltipHeight - offset, name: 'top-right' },
            { x: x - tooltipWidth - offset, y: y - tooltipHeight - offset, name: 'top-left' },
            { x: x + offset, y: y + offset, name: 'bottom-right' },
            { x: x - tooltipWidth - offset, y: y + offset, name: 'bottom-left' },
            { x: x - tooltipWidth / 2, y: y - tooltipHeight - offset, name: 'top-center' },
            { x: x - tooltipWidth / 2, y: y + offset, name: 'bottom-center' }
        ];
        
        // Find the best position that fits in viewport
        let bestPosition = positions[0];
        let bestScore = -1;
        
        for (const pos of positions) {
            let score = 0;
            
            // Check if position fits in viewport
            const fitsHorizontally = pos.x >= margin && pos.x + tooltipWidth <= viewportWidth - margin;
            const fitsVertically = pos.y >= margin && pos.y + tooltipHeight <= viewportHeight - margin;
            
            if (fitsHorizontally && fitsVertically) {
                score = 100; // Perfect fit
                
                // Bonus for preferred positions (top positions preferred)
                if (pos.name.includes('top')) score += 10;
                
                // Prefer left positioning when near sidebar (rightmost 350px)
                if (x > viewportWidth - 350) {
                    if (pos.name.includes('left')) score += 15;
                } else {
                    if (pos.name.includes('right')) score += 5;
                }
                
                // Distance from edges (closer to center is better)
                const edgeDistanceX = Math.min(pos.x - margin, viewportWidth - margin - (pos.x + tooltipWidth));
                const edgeDistanceY = Math.min(pos.y - margin, viewportHeight - margin - (pos.y + tooltipHeight));
                score += Math.min(edgeDistanceX, edgeDistanceY) * 0.1;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestPosition = pos;
                }
            }
        }
        
        // Fallback: force fit in viewport if no perfect position found
        let finalX = bestPosition.x;
        let finalY = bestPosition.y;
        
        if (bestScore < 0) {
            finalX = Math.max(margin, Math.min(x - tooltipWidth / 2, viewportWidth - tooltipWidth - margin));
            finalY = Math.max(margin, Math.min(y - tooltipHeight - offset, viewportHeight - tooltipHeight - margin));
        }
        
        this.tooltipElement.style.left = finalX + 'px';
        this.tooltipElement.style.top = finalY + 'px';
        
        // Reset visibility styles
        this.tooltipElement.style.visibility = 'visible';
        this.tooltipElement.style.display = '';
    }
    
    hide() {
        this.clearTimers();
        
        if (this.tooltipElement && this.isVisible) {
            this.tooltipElement.style.opacity = '0';
            this.tooltipElement.style.visibility = 'hidden';
            this.isVisible = false;
            this.priority = 0;
            this.lastContent = null;
        }
    }
    
    clearTimers() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }
    }
    
    setupGlobalEventListeners() {
        // Global event listeners for better UX
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
        
        // Hide tooltip when scrolling
        document.addEventListener('scroll', () => {
            if (this.isVisible) {
                this.hide();
            }
        }, { passive: true });
        
        // Hide tooltip on window resize
        window.addEventListener('resize', () => {
            if (this.isVisible) {
                this.hide();
            }
        });
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.contentCache.size,
            cacheHitRate: this.metrics.showCount > 0 ? (this.metrics.cacheHits / this.metrics.showCount * 100).toFixed(1) + '%' : '0%'
        };
    }
    
    clearCache() {
        this.contentCache.clear();
        this.metrics.cacheHits = 0;
    }
    
    destroy() {
        this.isDestroyed = true;
        this.hide();
        this.clearTimers();
        this.clearCache();
        
        if (this.tooltipElement) {
            this.tooltipElement.remove();
            this.tooltipElement = null;
        }
    }
}

/**
 * Generate tooltip content for vitality bars with proper logical line breaks
 */
function generateTooltipContent(tooltipData) {
    const data = JSON.parse(tooltipData);
    
    if (data.type === 'supply-demand') {
        let content = `<strong>${data.domain}</strong><br><em>Supply & Demand</em><br><br>`;
        content += `<strong>Supply:</strong> ${data.supply.toFixed(1)}<br>`;
        content += `<strong>Demand:</strong> ${data.demand.toFixed(1)}<br>`;
        content += `<strong>Balance:</strong> ${data.balance >= 0 ? '+' : ''}${data.balance.toFixed(1)}<br>`;
        content += `<strong>Ratio:</strong> ${data.ratio.toFixed(0)}%<br><br>`;
        
        if (data.ratio > 0) {
            content += `<span style="color: #4CAF50">✓ Surplus available</span>`;
        } else if (data.ratio < -50) {
            content += `<span style="color: #f44336">⚠ Critical shortage</span>`;
        } else if (data.ratio < 0) {
            content += `<span style="color: #ff9800">⚠ Shortage detected</span>`;
        } else {
            content += `<span style="color: #666">— Balanced</span>`;
        }
        
        return content;
    } else if (data.type === 'net-score') {
        let content = `<strong>${data.domain}</strong><br><em>Net Score</em><br><br>`;
        content += `<strong>Score:</strong> ${data.score >= 0 ? '+' : ''}${data.score.toFixed(0)}<br>`;
        content += `<strong>Buildings:</strong> ${data.buildingCount}<br><br>`;
        
        if (Object.keys(data.impactDetails).length > 0) {
            content += `<strong>Building Breakdown:</strong><br>`;
            Object.entries(data.impactDetails)
                .sort(([,a], [,b]) => Math.abs(b.totalImpact) - Math.abs(a.totalImpact))
                .slice(0, 4) // Show top 4 contributors
                .forEach(([name, details]) => {
                    const impact = details.totalImpact >= 0 ? '+' : '';
                    const color = details.totalImpact >= 0 ? '#4CAF50' : '#f44336';
                    content += `• <span style="color: ${color}">${name} (×${details.count}): ${impact}${details.totalImpact.toFixed(1)}</span><br>`;
                });
                
            if (Object.keys(data.impactDetails).length > 4) {
                content += `• <em>... and ${Object.keys(data.impactDetails).length - 4} others</em><br>`;
            }
        } else {
            content += `<em>No buildings affecting this metric</em>`;
        }
        
        return content;
    }
    
    return 'No data available';
}

/**
 * Setup vitality bar tooltips
 */
function setupVitalityTooltips() {
    const tooltip = document.getElementById('custom-tooltip');

    document.querySelectorAll('.vitality-row[data-vitality]').forEach(row => {
        row.addEventListener('mouseenter', (e) => {
            const tooltipData = row.getAttribute('data-tooltip-data');
            if (tooltipData) {
                const content = generateTooltipContent(tooltipData);
                
                // Try unified tooltip manager first
                if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                    const rect = row.getBoundingClientRect();
                    const x = rect.left - 20;
                    const y = rect.top + rect.height / 2;
                    
                    window.game.tooltipManager.show(content, x, y, {
                        delay: 0,
                        maxWidth: 320,
                        priority: 2,
                        html: true,
                        animationSpeed: 'fast'
                    });
                } else if (tooltip) {
                    // Fallback to old custom tooltip system
                    console.log('⚠️ Using fallback vitality tooltip system');
                    tooltip.textContent = content;
                    
                    const rect = row.getBoundingClientRect();
                    const tooltipHeight = tooltip.offsetHeight || 100;
                    
                    tooltip.style.left = `${rect.left - 300}px`;
                    tooltip.style.top = `${rect.top + (rect.height / 2) - (tooltipHeight / 2)}px`;
                    tooltip.style.transform = 'none';
                    
                    tooltip.classList.add('visible');
                }
            }
        });
        
        row.addEventListener('mouseleave', () => {
            // Hide unified tooltip
            if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                window.game.tooltipManager.hide();
            }
            // Hide fallback tooltip
            if (tooltip) {
                tooltip.classList.remove('visible');
            }
        });
    });
}

/**
 * Setup metric tooltips for sidebar elements
 */
function setupMetricTooltips() {
    const metricTooltip = document.getElementById('custom-tooltip');
    document.querySelectorAll('.metric-tooltip').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const tooltipText = element.getAttribute('data-tooltip');
            if (tooltipText) {
                // Try unified tooltip manager first
                if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left - 20; // Position to the left of sidebar
                    const y = rect.top + rect.height / 2;
                    
                    window.game.tooltipManager.show(tooltipText, x, y, {
                        delay: 200,
                        maxWidth: 300,
                        priority: 1,
                        html: true
                    });
                } else if (metricTooltip) {
                    // Fallback to old custom tooltip system
                    console.log('⚠️ Using fallback metric tooltip system');
                    metricTooltip.textContent = tooltipText;
                    
                    const rect = element.getBoundingClientRect();
                    const tooltipHeight = metricTooltip.offsetHeight || 100;
                    
                    metricTooltip.style.left = `${rect.left - 300}px`;
                    metricTooltip.style.top = `${rect.top + (rect.height / 2) - (tooltipHeight / 2)}px`;
                    metricTooltip.style.transform = 'none';
                    
                    metricTooltip.classList.add('visible');
                }
            }
        });
        
        element.addEventListener('mouseleave', () => {
            // Hide unified tooltip
            if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                window.game.tooltipManager.hide();
            }
            // Hide fallback tooltip
            if (metricTooltip) {
                metricTooltip.classList.remove('visible');
            }
        });
    });
}

/**
 * Setup governance tooltips for budget categories
 */
function setupGovernanceTooltips() {
    const governanceTooltip = document.getElementById('custom-tooltip');
    
    // Ensure tooltip is hidden initially
    if (governanceTooltip) {
        governanceTooltip.classList.remove('visible');
        governanceTooltip.style.display = 'none';
    }
    
    document.querySelectorAll('.budget-category[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const tooltipText = element.getAttribute('data-tooltip');
            if (tooltipText) {
                // Try unified tooltip manager first
                if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top;
                    
                    window.game.tooltipManager.show(tooltipText, x, y, {
                        delay: 150,
                        maxWidth: 280,
                        priority: 1,
                        html: true
                    });
                } else if (governanceTooltip) {
                    // Fallback to old custom tooltip system
                    console.log('⚠️ Using fallback governance tooltip system');
                    governanceTooltip.textContent = tooltipText;
                    governanceTooltip.style.display = 'block';
                    
                    const rect = element.getBoundingClientRect();
                    governanceTooltip.style.left = `${rect.left + rect.width / 2}px`;
                    governanceTooltip.style.top = `${rect.top - 40}px`;
                    governanceTooltip.style.transform = 'translateX(-50%)';
                    
                    setTimeout(() => {
                        governanceTooltip.classList.add('visible');
                    }, 10);
                }
            }
        });
        
        element.addEventListener('mouseleave', () => {
            // Hide unified tooltip
            if (window.game && window.game.tooltipManager && window.game.tooltipManager.tooltipElement) {
                window.game.tooltipManager.hide();
            }
            // Hide fallback tooltip
            if (governanceTooltip) {
                governanceTooltip.classList.remove('visible');
                setTimeout(() => {
                    governanceTooltip.style.display = 'none';
                }, 150);
            }
        });
    });
}

/**
 * Initialize all tooltip systems
 * Call this after DOM is ready and game is initialized
 */
function initializeTooltips() {
    setupVitalityTooltips();
    setupMetricTooltips();
    setupGovernanceTooltips();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TooltipManager,
        generateTooltipContent,
        setupVitalityTooltips,
        setupMetricTooltips,
        setupGovernanceTooltips,
        initializeTooltips
    };
}