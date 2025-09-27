#!/usr/bin/env node

/**
 * Mobility Code Analyzer
 * Extracts and documents all mobility-related code patterns for Mobility v2 design
 */

const fs = require('fs');
const path = require('path');

class MobilityCodeAnalyzer {
    constructor() {
        this.results = {
            htmlStructure: [],
            cssStyles: [],
            jsEvents: [],
            jsFunctions: [],
            integrationPoints: [],
            modalPatterns: [],
            canvasInteractions: [],
            costCalculations: []
        };
    }

    analyzeFile(filePath, content) {
        console.log(`\n🔍 Analyzing: ${filePath}`);

        if (filePath.endsWith('.html')) {
            this.analyzeHTML(filePath, content);
        } else if (filePath.endsWith('.css')) {
            this.analyzeCSS(filePath, content);
        } else if (filePath.endsWith('.js')) {
            this.analyzeJavaScript(filePath, content);
        }
    }

    analyzeHTML(filePath, content) {
        // Extract modal structures
        const modalMatches = content.match(/<div[^>]*modal[^>]*>[\s\S]*?<\/div>/gi);
        if (modalMatches) {
            modalMatches.forEach(match => {
                if (match.includes('transport') || match.includes('road') || match.includes('mobility')) {
                    this.results.htmlStructure.push({
                        file: filePath,
                        type: 'modal',
                        content: match.substring(0, 200) + '...'
                    });
                }
            });
        }

        // Extract tab structures
        const tabMatches = content.match(/<[^>]*tab[^>]*>[\s\S]*?<\/[^>]*>/gi);
        if (tabMatches) {
            tabMatches.forEach(match => {
                if (match.includes('road') || match.includes('stop') || match.includes('connect')) {
                    this.results.modalPatterns.push({
                        file: filePath,
                        type: 'tab-structure',
                        content: match.substring(0, 150) + '...'
                    });
                }
            });
        }

        // Extract form structures
        const formMatches = content.match(/<form[^>]*>[\s\S]*?<\/form>/gi);
        if (formMatches) {
            formMatches.forEach(match => {
                if (match.includes('transport') || match.includes('road') || match.includes('infrastructure')) {
                    this.results.htmlStructure.push({
                        file: filePath,
                        type: 'form',
                        content: match.substring(0, 200) + '...'
                    });
                }
            });
        }
    }

    analyzeCSS(filePath, content) {
        // Extract mobility-related styles
        const mobilityPatterns = [
            /\.road[^{]*\{[^}]*\}/g,
            /\.transport[^{]*\{[^}]*\}/g,
            /\.modal[^{]*\{[^}]*\}/g,
            /\.tab[^{]*\{[^}]*\}/g,
            /\.cost[^{]*\{[^}]*\}/g,
            /\.segment[^{]*\{[^}]*\}/g,
            /\.mobility[^{]*\{[^}]*\}/g
        ];

        mobilityPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    this.results.cssStyles.push({
                        file: filePath,
                        selector: match.split('{')[0].trim(),
                        styles: match.split('{')[1]?.replace('}', '').trim()
                    });
                });
            }
        });
    }

    analyzeJavaScript(filePath, content) {
        // Extract function definitions
        const functionPatterns = [
            /function\s+(\w*(?:road|transport|mobility|modal|tab|segment|cost|infrastructure)\w*)[^{]*\{/gi,
            /(\w*(?:road|transport|mobility|modal|tab|segment|cost|infrastructure)\w*)\s*[:=]\s*(?:async\s+)?function/gi,
            /(?:async\s+)?(\w*(?:road|transport|mobility|modal|tab|segment|cost|infrastructure)\w*)\s*\(/gi
        ];

        functionPatterns.forEach(pattern => {
            const matches = [...content.matchAll(pattern)];
            matches.forEach(match => {
                const functionName = match[1];
                if (functionName && functionName.length > 2) {
                    // Get function body preview
                    const startIndex = match.index;
                    const preview = content.substring(startIndex, startIndex + 300);

                    this.results.jsFunctions.push({
                        file: filePath,
                        name: functionName,
                        preview: preview.replace(/\n/g, ' ').trim()
                    });
                }
            });
        });

        // Extract event handlers
        const eventPatterns = [
            /addEventListener\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)/g,
            /on\w+\s*=\s*['"`]?([^'"`\s;]+)/g,
            /\$\([^)]*\)\.on\s*\(\s*['"`]([^'"`]+)['"`]/g
        ];

        eventPatterns.forEach(pattern => {
            const matches = [...content.matchAll(pattern)];
            matches.forEach(match => {
                const context = content.substring(Math.max(0, match.index - 100), match.index + 200);
                if (context.includes('road') || context.includes('transport') || context.includes('mobility') ||
                    context.includes('modal') || context.includes('segment') || context.includes('infrastructure')) {

                    this.results.jsEvents.push({
                        file: filePath,
                        event: match[1] || match[0],
                        context: context.replace(/\n/g, ' ').trim()
                    });
                }
            });
        });

        // Extract cost calculation patterns
        const costPatterns = [
            /cost[^=]*=\s*[^;]+/gi,
            /price[^=]*=\s*[^;]+/gi,
            /maintenance[^=]*=\s*[^;]+/gi,
            /calculate.*cost/gi,
            /calculate.*price/gi
        ];

        costPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const context = content.substring(
                        Math.max(0, content.indexOf(match) - 100),
                        content.indexOf(match) + match.length + 100
                    );

                    if (context.includes('road') || context.includes('transport') || context.includes('segment')) {
                        this.results.costCalculations.push({
                            file: filePath,
                            calculation: match.trim(),
                            context: context.replace(/\n/g, ' ').trim()
                        });
                    }
                });
            }
        });

        // Extract canvas interaction patterns
        const canvasPatterns = [
            /canvas[^.]*\.[^(]*\(/g,
            /ctx[^.]*\.[^(]*\(/g,
            /drawImage[^)]*\)/g,
            /fillRect[^)]*\)/g,
            /strokeRect[^)]*\)/g
        ];

        canvasPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const context = content.substring(
                        Math.max(0, content.indexOf(match) - 150),
                        content.indexOf(match) + match.length + 50
                    );

                    if (context.includes('road') || context.includes('segment') || context.includes('transport') ||
                        context.includes('infrastructure')) {

                        this.results.canvasInteractions.push({
                            file: filePath,
                            interaction: match.trim(),
                            context: context.replace(/\n/g, ' ').trim()
                        });
                    }
                });
            }
        });
    }

    generateReport() {
        let report = `# Mobility System Code Analysis Report\n\n`;
        report += `Generated: ${new Date().toISOString()}\n\n`;

        // HTML Structure Analysis
        if (this.results.htmlStructure.length > 0) {
            report += `## 🏗️ HTML Structure Patterns\n\n`;
            this.results.htmlStructure.forEach(item => {
                report += `### ${item.type.toUpperCase()} - ${item.file}\n`;
                report += `\`\`\`html\n${item.content}\n\`\`\`\n\n`;
            });
        }

        // Modal Patterns
        if (this.results.modalPatterns.length > 0) {
            report += `## 📱 Modal & Tab Patterns\n\n`;
            this.results.modalPatterns.forEach(item => {
                report += `### ${item.type} - ${item.file}\n`;
                report += `\`\`\`html\n${item.content}\n\`\`\`\n\n`;
            });
        }

        // CSS Styles
        if (this.results.cssStyles.length > 0) {
            report += `## 🎨 CSS Style Patterns\n\n`;
            this.results.cssStyles.forEach(item => {
                report += `### ${item.selector} - ${item.file}\n`;
                report += `\`\`\`css\n${item.selector} {\n    ${item.styles.replace(/;/g, ';\n    ')}\n}\n\`\`\`\n\n`;
            });
        }

        // JavaScript Functions
        if (this.results.jsFunctions.length > 0) {
            report += `## ⚙️ JavaScript Functions\n\n`;
            this.results.jsFunctions.forEach(item => {
                report += `### ${item.name}() - ${item.file}\n`;
                report += `\`\`\`javascript\n${item.preview}...\n\`\`\`\n\n`;
            });
        }

        // Event Handlers
        if (this.results.jsEvents.length > 0) {
            report += `## 🎯 Event Handling Patterns\n\n`;
            this.results.jsEvents.forEach(item => {
                report += `### Event: ${item.event} - ${item.file}\n`;
                report += `\`\`\`javascript\n${item.context}\n\`\`\`\n\n`;
            });
        }

        // Cost Calculations
        if (this.results.costCalculations.length > 0) {
            report += `## 💰 Cost Calculation Patterns\n\n`;
            this.results.costCalculations.forEach(item => {
                report += `### ${item.file}\n`;
                report += `\`\`\`javascript\n${item.context}\n\`\`\`\n\n`;
            });
        }

        // Canvas Interactions
        if (this.results.canvasInteractions.length > 0) {
            report += `## 🎨 Canvas Interaction Patterns\n\n`;
            this.results.canvasInteractions.forEach(item => {
                report += `### ${item.interaction} - ${item.file}\n`;
                report += `\`\`\`javascript\n${item.context}\n\`\`\`\n\n`;
            });
        }

        return report;
    }

    async analyzeMobilitySystem() {
        const filesToAnalyze = [
            'index.html',
            'game.js',
            'transportation.js',
            'style.css',
            'game.css'
        ];

        console.log('🚀 Starting Mobility System Code Analysis...\n');

        for (const fileName of filesToAnalyze) {
            const filePath = path.join(__dirname, fileName);

            try {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    this.analyzeFile(fileName, content);
                } else {
                    console.log(`⚠️  File not found: ${fileName}`);
                }
            } catch (error) {
                console.log(`❌ Error reading ${fileName}:`, error.message);
            }
        }

        // Generate and save report
        const report = this.generateReport();
        const reportPath = path.join(__dirname, 'MOBILITY_CODE_ANALYSIS.md');

        fs.writeFileSync(reportPath, report, 'utf8');

        console.log('\n✅ Analysis complete!');
        console.log(`📊 Report saved to: ${reportPath}`);
        console.log('\n📋 Summary:');
        console.log(`   HTML Structures: ${this.results.htmlStructure.length}`);
        console.log(`   CSS Styles: ${this.results.cssStyles.length}`);
        console.log(`   JS Functions: ${this.results.jsFunctions.length}`);
        console.log(`   Event Handlers: ${this.results.jsEvents.length}`);
        console.log(`   Cost Calculations: ${this.results.costCalculations.length}`);
        console.log(`   Canvas Interactions: ${this.results.canvasInteractions.length}`);
        console.log(`   Modal Patterns: ${this.results.modalPatterns.length}`);

        return reportPath;
    }
}

// Run the analyzer
if (require.main === module) {
    const analyzer = new MobilityCodeAnalyzer();
    analyzer.analyzeMobilitySystem().then(reportPath => {
        console.log(`\n🎯 Next step: Review ${reportPath} for Mobility v2 implementation patterns`);
    });
}

module.exports = MobilityCodeAnalyzer;