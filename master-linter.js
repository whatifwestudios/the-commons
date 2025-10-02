#!/usr/bin/env node

/**
 * Master Linter for The Commons
 *
 * Comprehensive code quality checker with multiple lint profiles:
 * - Multiplayer/V2 Architecture compliance
 * - Performance optimization checks
 * - Security vulnerability scanning
 * - Code quality and consistency
 * - Documentation coverage
 * - Accessibility compliance
 */

const fs = require('fs');
const path = require('path');

class MasterLinter {
    constructor(options = {}) {
        this.options = {
            profiles: options.profiles || ['all'],
            verbose: options.verbose || false,
            fix: options.fix || false,
            reportFormat: options.reportFormat || 'console', // console, json, html
            excludeDirs: ['node_modules', 'archive', 'build', 'dist', '.git'],
            excludeFiles: ['test', 'spec', '.min.']
        };

        // Initialize result collectors
        this.results = {
            errors: [],
            warnings: [],
            suggestions: [],
            info: [],
            fixed: []
        };

        this.stats = {
            filesScanned: 0,
            totalLines: 0,
            profiles: {}
        };

        // Define lint profiles
        this.profiles = {
            multiplayer: new MultiplayerLintProfile(),
            performance: new PerformanceLintProfile(),
            security: new SecurityLintProfile(),
            quality: new QualityLintProfile(),
            documentation: new DocumentationLintProfile(),
            accessibility: new AccessibilityLintProfile(),
            economic: new EconomicSystemLintProfile()
        };
    }

    /**
     * Main run method
     */
    async run() {
        console.log('🔍 Master Linter for The Commons\n');
        console.log('=' .repeat(60));

        const startTime = Date.now();
        const files = this.scanFiles();

        console.log(`📁 Found ${files.length} files to lint\n`);

        // Determine which profiles to run
        const profilesToRun = this.options.profiles.includes('all')
            ? Object.keys(this.profiles)
            : this.options.profiles;

        console.log(`🎯 Running profiles: ${profilesToRun.join(', ')}\n`);

        // Run each profile
        for (const profileName of profilesToRun) {
            if (this.profiles[profileName]) {
                console.log(`\n⚡ Running ${profileName} checks...`);
                await this.runProfile(profileName, files);
            }
        }

        // Generate report
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        this.generateReport(duration);

        // Return exit code based on errors
        return this.results.errors.length > 0 ? 1 : 0;
    }

    /**
     * Scan for files to lint
     */
    scanFiles(dir = '.', files = []) {
        const entries = fs.readdirSync(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                if (!this.options.excludeDirs.some(ex => fullPath.includes(ex))) {
                    this.scanFiles(fullPath, files);
                }
            } else if (this.shouldLintFile(fullPath)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Check if file should be linted
     */
    shouldLintFile(filePath) {
        const ext = path.extname(filePath);
        const name = path.basename(filePath);

        // JavaScript and related files
        if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            return !this.options.excludeFiles.some(ex => name.includes(ex));
        }

        // CSS for accessibility checks
        if (['.css', '.scss', '.sass'].includes(ext)) {
            return this.options.profiles.includes('accessibility') ||
                   this.options.profiles.includes('all');
        }

        // HTML for accessibility and security
        if (['.html', '.htm'].includes(ext)) {
            return this.options.profiles.includes('accessibility') ||
                   this.options.profiles.includes('security') ||
                   this.options.profiles.includes('all');
        }

        return false;
    }

    /**
     * Run a specific lint profile
     */
    async runProfile(profileName, files) {
        const profile = this.profiles[profileName];
        this.stats.profiles[profileName] = {
            errors: 0,
            warnings: 0,
            suggestions: 0
        };

        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const results = await profile.lint(file, content, this.options);

                // Aggregate results
                if (results.errors) {
                    this.results.errors.push(...results.errors.map(e => ({
                        profile: profileName,
                        file,
                        ...e
                    })));
                    this.stats.profiles[profileName].errors += results.errors.length;
                }

                if (results.warnings) {
                    this.results.warnings.push(...results.warnings.map(w => ({
                        profile: profileName,
                        file,
                        ...w
                    })));
                    this.stats.profiles[profileName].warnings += results.warnings.length;
                }

                if (results.suggestions) {
                    this.results.suggestions.push(...results.suggestions.map(s => ({
                        profile: profileName,
                        file,
                        ...s
                    })));
                    this.stats.profiles[profileName].suggestions += results.suggestions.length;
                }

                // Auto-fix if enabled
                if (this.options.fix && results.fixes) {
                    this.applyFixes(file, content, results.fixes);
                }

                this.stats.filesScanned++;
                this.stats.totalLines += content.split('\n').length;

            } catch (error) {
                this.results.errors.push({
                    profile: 'system',
                    file,
                    message: `Failed to lint: ${error.message}`
                });
            }
        }
    }

    /**
     * Apply automatic fixes
     */
    applyFixes(file, content, fixes) {
        let fixedContent = content;
        let fixCount = 0;

        for (const fix of fixes) {
            if (fix.type === 'replace') {
                fixedContent = fixedContent.replace(fix.search, fix.replace);
                fixCount++;
            } else if (fix.type === 'insert') {
                // Insert at line number
                const lines = fixedContent.split('\n');
                lines.splice(fix.line, 0, fix.content);
                fixedContent = lines.join('\n');
                fixCount++;
            }
        }

        if (fixCount > 0) {
            fs.writeFileSync(file, fixedContent);
            this.results.fixed.push({
                file,
                fixes: fixCount
            });
        }
    }

    /**
     * Generate final report
     */
    generateReport(duration) {
        console.log('\n' + '=' .repeat(60));
        console.log('📊 MASTER LINTER REPORT\n');

        // Profile summaries
        console.log('Profile Results:');
        for (const [name, stats] of Object.entries(this.stats.profiles)) {
            const total = stats.errors + stats.warnings + stats.suggestions;
            if (total > 0) {
                console.log(`  ${name}: ${stats.errors} errors, ${stats.warnings} warnings, ${stats.suggestions} suggestions`);
            }
        }

        // Critical errors
        if (this.results.errors.length > 0) {
            console.log('\n❌ CRITICAL ERRORS:');
            this.groupAndDisplay(this.results.errors.slice(0, 10), 'error');
            if (this.results.errors.length > 10) {
                console.log(`  ... and ${this.results.errors.length - 10} more errors\n`);
            }
        }

        // Warnings
        if (this.results.warnings.length > 0) {
            console.log('\n⚠️  WARNINGS:');
            this.groupAndDisplay(this.results.warnings.slice(0, 10), 'warning');
            if (this.results.warnings.length > 10) {
                console.log(`  ... and ${this.results.warnings.length - 10} more warnings\n`);
            }
        }

        // Suggestions
        if (this.results.suggestions.length > 0 && this.options.verbose) {
            console.log('\n💡 SUGGESTIONS:');
            this.groupAndDisplay(this.results.suggestions.slice(0, 5), 'suggestion');
            if (this.results.suggestions.length > 5) {
                console.log(`  ... and ${this.results.suggestions.length - 5} more suggestions\n`);
            }
        }

        // Fixes applied
        if (this.results.fixed.length > 0) {
            console.log('\n🔧 AUTO-FIXES APPLIED:');
            this.results.fixed.forEach(fix => {
                console.log(`  ${fix.file}: ${fix.fixes} fixes applied`);
            });
        }

        // Statistics
        console.log('\n📈 Statistics:');
        console.log(`  Files scanned: ${this.stats.filesScanned}`);
        console.log(`  Total lines: ${this.stats.totalLines.toLocaleString()}`);
        console.log(`  Scan duration: ${duration}s`);

        // Health score
        const score = this.calculateHealthScore();
        console.log(`\n🏆 Overall Code Health Score: ${score}/100`);

        if (score >= 90) {
            console.log('   🌟 Excellent! Your code meets high quality standards.');
        } else if (score >= 75) {
            console.log('   ✅ Good code quality with minor issues.');
        } else if (score >= 60) {
            console.log('   ⚠️  Fair code quality. Review warnings for improvements.');
        } else {
            console.log('   ❌ Significant issues detected. Address errors and warnings.');
        }

        // Export results if needed
        if (this.options.reportFormat === 'json') {
            this.exportJSON();
        } else if (this.options.reportFormat === 'html') {
            this.exportHTML();
        }
    }

    /**
     * Group and display issues
     */
    groupAndDisplay(issues, type) {
        const grouped = {};

        issues.forEach(issue => {
            const key = issue.profile || 'general';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(issue);
        });

        for (const [profile, items] of Object.entries(grouped)) {
            console.log(`  [${profile}]`);
            items.forEach(item => {
                const location = item.line ? `:${item.line}` : '';
                console.log(`    ${item.file}${location} - ${item.message || item}`);
            });
        }
    }

    /**
     * Calculate overall health score
     */
    calculateHealthScore() {
        let score = 100;

        // Deduct points based on issue severity
        score -= this.results.errors.length * 5;
        score -= this.results.warnings.length * 2;
        score -= this.results.suggestions.length * 0.5;

        // Bonus for fixes applied
        score += this.results.fixed.length * 2;

        // Ensure score is within bounds
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Export results as JSON
     */
    exportJSON() {
        const output = {
            timestamp: new Date().toISOString(),
            stats: this.stats,
            results: this.results,
            score: this.calculateHealthScore()
        };

        fs.writeFileSync('lint-report.json', JSON.stringify(output, null, 2));
        console.log('\n📄 JSON report saved to lint-report.json');
    }

    /**
     * Export results as HTML
     */
    exportHTML() {
        const html = this.generateHTMLReport();
        fs.writeFileSync('lint-report.html', html);
        console.log('\n📄 HTML report saved to lint-report.html');
    }

    generateHTMLReport() {
        // Simple HTML report template
        return `<!DOCTYPE html>
<html>
<head>
    <title>Commons Lint Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        h1 { color: #2563eb; }
        .score { font-size: 48px; font-weight: bold; }
        .error { color: #dc2626; }
        .warning { color: #d97706; }
        .suggestion { color: #059669; }
        .section { margin: 20px 0; padding: 15px; background: #f3f4f6; border-radius: 8px; }
        pre { background: #1f2937; color: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>The Commons - Lint Report</h1>
    <div class="section">
        <h2>Overall Score</h2>
        <div class="score">${this.calculateHealthScore()}/100</div>
    </div>
    <div class="section">
        <h2>Issues</h2>
        <div class="error">Errors: ${this.results.errors.length}</div>
        <div class="warning">Warnings: ${this.results.warnings.length}</div>
        <div class="suggestion">Suggestions: ${this.results.suggestions.length}</div>
    </div>
    <div class="section">
        <h2>Statistics</h2>
        <p>Files Scanned: ${this.stats.filesScanned}</p>
        <p>Total Lines: ${this.stats.totalLines.toLocaleString()}</p>
    </div>
</body>
</html>`;
    }
}

// ============================================================================
// LINT PROFILES
// ============================================================================

/**
 * Base Lint Profile
 */
class BaseLintProfile {
    async lint(file, content, options) {
        return {
            errors: [],
            warnings: [],
            suggestions: [],
            fixes: []
        };
    }
}

/**
 * Multiplayer/V2 Architecture Lint Profile
 */
class MultiplayerLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: [],
            fixes: []
        };

        const lines = content.split('\n');
        const isServerFile = file.includes('server');
        const isClientFile = !isServerFile && file.endsWith('.js');

        lines.forEach((line, i) => {
            // CRITICAL: Client-side authority violations
            if (isClientFile && !line.includes('//')) {
                // Direct cash manipulation
                if (/\.cash\s*[\+\-]=|\.cash\s*=\s*[^=]/.test(line) ||
                    /\.playerData\.cash\s*[\+\-]=|\.playerData\.cash\s*=\s*[^=]/.test(line) ||
                    /\.balance\s*[\+\-]=|\.balance\s*=\s*[^=]/.test(line)) {
                    results.errors.push({
                        line: i + 1,
                        message: "AUTHORITY VIOLATION: Client directly modifying cash/balance - must use server transactions"
                    });
                }

                // Direct construction progress manipulation
                if (/\._constructionProgress\s*[\+\-]=|\._constructionProgress\s*=\s*[^=]/.test(line) ||
                    /\.constructionProgress\s*[\+\-]=|\.constructionProgress\s*=\s*[^=]/.test(line)) {
                    results.errors.push({
                        line: i + 1,
                        message: "AUTHORITY VIOLATION: Client calculating construction progress - server must manage timing"
                    });
                }

                // Direct infrastructure state modification
                if (/infra\.(roadway|sidewalks|bikelanes|busStop|subwayEntrance|trafficControl)\s*=/.test(line) &&
                    !line.includes('sendToServer') && !line.includes('economicClient')) {
                    results.errors.push({
                        line: i + 1,
                        message: "AUTHORITY VIOLATION: Client directly modifying infrastructure - must use server transactions"
                    });
                }

                // Direct game time manipulation
                if (/\.gameTime\s*[\+\-]=|\.gameTime\s*=\s*[^=]/.test(line) ||
                    /\.currentDay\s*[\+\-\+]=|\.currentDay\s*=\s*[^=]/.test(line)) {
                    results.errors.push({
                        line: i + 1,
                        message: "AUTHORITY VIOLATION: Client modifying game time - server controls progression"
                    });
                }

                // Direct parcel ownership changes (outside of server sync)
                if (/parcel\.owner\s*=/.test(line) &&
                    !line.includes('serverParcel') &&
                    !line.includes('handleServerUpdate') &&
                    !line.includes('handleEconomicUpdate')) {
                    results.warnings.push({
                        line: i + 1,
                        message: "Potential authority issue: Direct parcel ownership change - verify this is from server sync"
                    });
                }
            }

            // Check for hardcoded player IDs
            if (/['"]\s*player\s*['"]/.test(line) &&
                !line.includes('playerId') &&
                !line.includes('//')) {
                results.errors.push({
                    line: i + 1,
                    message: "Hardcoded 'player' ID - must be parameterized"
                });

                if (options.fix) {
                    results.fixes.push({
                        type: 'replace',
                        search: /'player'/g,
                        replace: 'playerId'
                    });
                }
            }

            // Check for global state assignments
            if (/window\.\w+\s*=/.test(line) && !line.includes('//')) {
                results.warnings.push({
                    line: i + 1,
                    message: "Global state assignment - breaks multiplayer isolation"
                });
            }

            // Check for event listeners without cleanup
            if (/addEventListener/.test(line)) {
                const eventMatch = line.match(/addEventListener\s*\(\s*['"](\w+)['"]/);
                if (eventMatch && !content.includes(`removeEventListener.*${eventMatch[1]}`)) {
                    results.warnings.push({
                        line: i + 1,
                        message: `Event listener '${eventMatch[1]}' without cleanup`
                    });
                }
            }

            // Check for console.log in commented-out client calculations
            if (/\/\/.*this\.currentDay\+\+/.test(line)) {
                results.suggestions.push({
                    line: i + 1,
                    message: "Good: Client-side time progression is properly commented out"
                });
            }
        });

        // File-level checks
        if (isClientFile) {
            // Check for proper optimistic UI patterns
            if (content.includes('localState') && content.includes('sendToServer')) {
                results.suggestions.push({
                    message: "Good: Using optimistic UI with server sync pattern"
                });
            }

            // Check for proper server event handling
            if (content.includes('handleServerUpdate') || content.includes('handleEconomicUpdate')) {
                results.suggestions.push({
                    message: "Good: Properly handling server state updates"
                });
            }
        }

        // Check for V2 compliance
        if (file.includes('economic') || file.includes('server')) {
            if (!content.includes('broadcastGameState') && !content.includes('handleServerUpdate')) {
                results.suggestions.push({
                    message: "Economic file should use V2 state synchronization patterns"
                });
            }
        }

        return results;
    }
}

/**
 * Performance Lint Profile
 */
class PerformanceLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: [],
            fixes: []
        };

        const lines = content.split('\n');

        lines.forEach((line, i) => {
            // Check for console.log in production code
            if (/console\.log/.test(line) && !line.includes('//')) {
                results.warnings.push({
                    line: i + 1,
                    message: "console.log in production code"
                });

                if (options.fix) {
                    results.fixes.push({
                        type: 'replace',
                        search: /console\.log/g,
                        replace: '// console.log'
                    });
                }
            }

            // Check for inefficient loops
            if (/for.*in\s/.test(line) && !line.includes('hasOwnProperty')) {
                results.warnings.push({
                    line: i + 1,
                    message: "for...in loop without hasOwnProperty check"
                });
            }

            // Check for repeated DOM queries
            if (/document\.(getElementById|querySelector)/.test(line)) {
                const match = line.match(/document\.(getElementById|querySelector)\(['"]([^'"]+)['"]\)/);
                if (match) {
                    // Check if this selector is used multiple times
                    const selector = match[2];
                    const count = content.split(selector).length - 1;
                    if (count > 3) {
                        results.suggestions.push({
                            line: i + 1,
                            message: `DOM element '${selector}' queried multiple times - consider caching`
                        });
                    }
                }
            }

            // Check for synchronous XHR
            if (/XMLHttpRequest.*false\)/.test(line)) {
                results.errors.push({
                    line: i + 1,
                    message: "Synchronous XMLHttpRequest detected - blocks main thread"
                });
            }

            // Check for large timeouts
            const timeoutMatch = line.match(/setTimeout.*?(\d{5,})/);
            if (timeoutMatch) {
                results.warnings.push({
                    line: i + 1,
                    message: `Very long timeout: ${timeoutMatch[1]}ms`
                });
            }
        });

        return results;
    }
}

/**
 * Security Lint Profile
 */
class SecurityLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: []
        };

        const lines = content.split('\n');

        lines.forEach((line, i) => {
            // Check for eval usage
            if (/eval\s*\(/.test(line) && !line.includes('//')) {
                results.errors.push({
                    line: i + 1,
                    message: "eval() usage - major security risk"
                });
            }

            // Check for innerHTML usage
            if (/innerHTML\s*=/.test(line) && !line.includes('//')) {
                results.warnings.push({
                    line: i + 1,
                    message: "innerHTML usage - potential XSS vulnerability"
                });
            }

            // Check for hardcoded credentials
            if (/(password|token|secret|api[_-]?key)\s*[:=]\s*['"][^'"]+['"]/.test(line.toLowerCase())) {
                results.errors.push({
                    line: i + 1,
                    message: "Potential hardcoded credential detected"
                });
            }

            // Check for SQL injection vulnerabilities
            if (/query.*\+.*user|SELECT.*\+|INSERT.*\+|UPDATE.*\+|DELETE.*\+/.test(line)) {
                results.warnings.push({
                    line: i + 1,
                    message: "Potential SQL injection vulnerability"
                });
            }

            // Check for unsafe regex
            if (/new RegExp\(.*user|RegExp\(.*input/.test(line)) {
                results.warnings.push({
                    line: i + 1,
                    message: "User input in RegExp - potential ReDoS attack"
                });
            }
        });

        return results;
    }
}

/**
 * Code Quality Lint Profile
 */
class QualityLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: []
        };

        const lines = content.split('\n');

        // Check for proper error handling
        if (content.includes('try') && !content.includes('catch')) {
            results.warnings.push({
                message: "try block without catch - incomplete error handling"
            });
        }

        // Check for TODO/FIXME comments
        lines.forEach((line, i) => {
            if (/TODO|FIXME|HACK|XXX/.test(line)) {
                results.suggestions.push({
                    line: i + 1,
                    message: `Unresolved comment: ${line.trim()}`
                });
            }

            // Check for magic numbers
            if (/[^a-zA-Z0-9_](\d{3,})[^a-zA-Z0-9_]/.test(line) &&
                !line.includes('//') &&
                !line.includes('port') &&
                !line.includes('timeout')) {
                results.suggestions.push({
                    line: i + 1,
                    message: "Magic number detected - consider using named constant"
                });
            }

            // Check for long lines
            if (line.length > 120) {
                results.suggestions.push({
                    line: i + 1,
                    message: `Line too long (${line.length} chars) - consider breaking it up`
                });
            }

            // Check for missing semicolons (basic check)
            if (!line.trim().endsWith(';') &&
                !line.trim().endsWith('{') &&
                !line.trim().endsWith('}') &&
                line.trim().length > 0 &&
                !line.includes('//') &&
                !line.includes('if') &&
                !line.includes('for') &&
                !line.includes('while') &&
                !line.includes('function')) {
                // This is a very basic check and may have false positives
            }
        });

        // Check for function complexity
        const functions = content.match(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/g) || [];
        functions.forEach(func => {
            const lines = func.split('\n').length;
            if (lines > 50) {
                results.warnings.push({
                    message: `Function too long (${lines} lines) - consider refactoring`
                });
            }
        });

        return results;
    }
}

/**
 * Documentation Lint Profile
 */
class DocumentationLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: []
        };

        // Check for JSDoc comments
        const functions = content.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*)?(?:async\s+)?(?:function\s*)?\(/g) || [];

        functions.forEach(func => {
            const funcName = func.match(/(\w+)\s*(?:=|\()/)[1];
            const beforeFunc = content.substring(0, content.indexOf(func));
            const lastComment = beforeFunc.lastIndexOf('/**');
            const lastCommentEnd = beforeFunc.lastIndexOf('*/');

            if (lastComment === -1 || lastCommentEnd < lastComment) {
                results.suggestions.push({
                    message: `Function '${funcName}' missing JSDoc comment`
                });
            }
        });

        // Check for file header comment
        if (!content.startsWith('/**') && !content.startsWith('//')) {
            results.suggestions.push({
                message: "File missing header documentation"
            });
        }

        return results;
    }
}

/**
 * Accessibility Lint Profile (for HTML/CSS)
 */
class AccessibilityLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: []
        };

        if (file.endsWith('.html')) {
            // Check for alt text on images
            const images = content.match(/<img[^>]*>/g) || [];
            images.forEach(img => {
                if (!img.includes('alt=')) {
                    results.errors.push({
                        message: "Image missing alt attribute"
                    });
                }
            });

            // Check for form labels
            const inputs = content.match(/<input[^>]*>/g) || [];
            inputs.forEach(input => {
                if (!input.includes('aria-label') && !input.includes('id=')) {
                    results.warnings.push({
                        message: "Input missing label or aria-label"
                    });
                }
            });

            // Check for heading hierarchy
            const headings = content.match(/<h[1-6]>/g) || [];
            let lastLevel = 0;
            headings.forEach(h => {
                const level = parseInt(h[2]);
                if (level - lastLevel > 1) {
                    results.warnings.push({
                        message: `Heading hierarchy skip: h${lastLevel} to h${level}`
                    });
                }
                lastLevel = level;
            });
        }

        if (file.endsWith('.css')) {
            // Check for sufficient color contrast (basic check)
            const colors = content.match(/color:\s*#[0-9a-f]{3,6}/gi) || [];
            // This would need more sophisticated checking for real contrast analysis
            if (colors.length > 0) {
                results.suggestions.push({
                    message: "Review color contrast for accessibility compliance"
                });
            }

            // Check for focus styles
            if (!content.includes(':focus')) {
                results.warnings.push({
                    message: "No :focus styles defined - keyboard navigation may be unclear"
                });
            }
        }

        return results;
    }
}

/**
 * Economic System Lint Profile (Commons-specific)
 */
class EconomicSystemLintProfile extends BaseLintProfile {
    async lint(file, content, options) {
        const results = {
            errors: [],
            warnings: [],
            suggestions: []
        };

        // Check for V2 economic patterns
        if (file.includes('economic') || file.includes('cash') || file.includes('balance')) {
            // Check for client-side balance modifications
            if (/this\.playerCash\s*[+\-*/]=/.test(content)) {
                results.errors.push({
                    message: "Direct client-side balance modification detected"
                });
            }

            // Check for proper server communication
            if (!content.includes('economicClient') && !content.includes('WebSocket')) {
                results.warnings.push({
                    message: "Economic file should use server communication"
                });
            }

            // Check for JEEFHH/CARENS implementation
            if (content.includes('calculate') &&
                !content.includes('JEEFHH') &&
                !content.includes('CARENS')) {
                results.suggestions.push({
                    message: "Economic calculations should consider JEEFHH/CARENS metrics"
                });
            }
        }

        return results;
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    // Parse command line arguments
    const options = {
        profiles: [],
        verbose: false,
        fix: false,
        reportFormat: 'console'
    };

    args.forEach(arg => {
        if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--fix') {
            options.fix = true;
        } else if (arg.startsWith('--format=')) {
            options.reportFormat = arg.split('=')[1];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Master Linter for The Commons

Usage: node master-linter.js [options] [profiles]

Options:
  --verbose, -v     Show detailed output including suggestions
  --fix            Auto-fix issues where possible
  --format=FORMAT  Output format (console, json, html)
  --help, -h       Show this help message

Profiles:
  all              Run all lint profiles (default)
  multiplayer      V2 multiplayer architecture checks
  performance      Performance optimization checks
  security         Security vulnerability checks
  quality          Code quality and consistency checks
  documentation    Documentation coverage checks
  accessibility    Accessibility compliance checks
  economic         Economic system specific checks

Examples:
  node master-linter.js                    # Run all profiles
  node master-linter.js multiplayer        # Run only multiplayer checks
  node master-linter.js --fix security     # Run security checks with auto-fix
  node master-linter.js --format=html all  # Generate HTML report
            `);
            process.exit(0);
        } else if (!arg.startsWith('-')) {
            options.profiles.push(arg);
        }
    });

    // Default to all profiles if none specified
    if (options.profiles.length === 0) {
        options.profiles = ['all'];
    }

    // Run the linter
    const linter = new MasterLinter(options);
    linter.run().then(exitCode => {
        process.exit(exitCode);
    });
}

module.exports = MasterLinter;