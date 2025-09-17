#!/usr/bin/env node

// Simple custom linter to check for multiplayer compatibility issues
const { readFileSync, readdirSync } = require('fs');
const { join, extname } = require('path');

const MULTIPLAYER_PATTERNS = [
    {
        pattern: /\.owner\s*===\s*['"]player['"]/g,
        message: "Use this.isCurrentPlayer(owner) instead of owner === 'player' for multiplayer compatibility"
    },
    {
        pattern: /\.owner\s*!==\s*['"]player['"]/g, 
        message: "Use !this.isCurrentPlayer(owner) instead of owner !== 'player' for multiplayer compatibility"
    },
    {
        pattern: /\.owner\s*==\s*['"]player['"]/g,
        message: "Use this.isCurrentPlayer(owner) instead of owner == 'player' for multiplayer compatibility"
    },
    {
        pattern: /\.owner\s*!=\s*['"]player['"]/g,
        message: "Use !this.isCurrentPlayer(owner) instead of owner != 'player' for multiplayer compatibility"
    }
];

function checkFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];
    
    MULTIPLAYER_PATTERNS.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            const line = lines[lineNum - 1];
            
            issues.push({
                file: filePath,
                line: lineNum,
                column: match.index - content.lastIndexOf('\n', match.index - 1),
                message,
                code: line.trim()
            });
        }
        pattern.lastIndex = 0; // Reset regex state
    });
    
    return issues;
}

function checkDirectory(dir = '.') {
    const files = readdirSync(dir)
        .filter(file => extname(file) === '.js')
        .filter(file => !file.includes('node_modules'))
        .filter(file => !file.includes('eslint.config.js'))
        .filter(file => !file.includes('lint-multiplayer.js'));
    
    let totalIssues = 0;
    
    console.log('🔍 Checking for multiplayer compatibility issues...\n');
    
    files.forEach(file => {
        const issues = checkFile(file);
        if (issues.length > 0) {
            console.log(`❌ ${file}:`);
            issues.forEach(issue => {
                console.log(`  Line ${issue.line}: ${issue.message}`);
                console.log(`    ${issue.code}`);
                console.log('');
            });
            totalIssues += issues.length;
        }
    });
    
    if (totalIssues === 0) {
        console.log('✅ No multiplayer compatibility issues found!');
    } else {
        console.log(`\n❌ Found ${totalIssues} multiplayer compatibility issues`);
        console.log('\nThese issues can cause:');
        console.log('  • LVT not being collected from your buildings');
        console.log('  • Population stuck at 0');
        console.log('  • Buildings not showing in cashflow');
        console.log('  • Tooltips showing wrong ownership');
        console.log('  • Context menus not appearing');
        
        process.exit(1);
    }
}

checkDirectory();