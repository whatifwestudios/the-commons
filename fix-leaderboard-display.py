#!/usr/bin/env python3
import re

print('Fixing ui-manager.js leaderboard display...')

# Read ui-manager.js
with open('ui-manager.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the updateLeaderboard method's innerHTML section
old_code = r'''            row\.innerHTML = `
                <div class="lb-rank">\$\{index \+ 1\}\$\{rankSuffix\}</div>
                <div class="lb-player">\$\{playerScore\.playerName \|\| 'Player'\}</div>
                <div class="lb-wealth">\$\$\$\{playerScore\.wealth\.toLocaleString\(\)\}</div>
                <div class="lb-lvt">\$\{\(playerScore\.lvtRatio \* 100\)\.toFixed\(1\)\}%</div>
                <div class="lb-score">\$\{playerScore\.score\.toFixed\(1\)\}</div>
            `;'''

new_code = '''            // Handle NaN/undefined values gracefully
            const wealthScore = (playerScore.wealthScore !== undefined && !isNaN(playerScore.wealthScore)) ? playerScore.wealthScore.toFixed(1) : '0.0';
            const civicScore = (playerScore.civicScore !== undefined && !isNaN(playerScore.civicScore)) ? playerScore.civicScore.toFixed(1) : '0.0';
            const totalScore = (playerScore.score !== undefined && !isNaN(playerScore.score)) ? playerScore.score.toFixed(1) : '0.0';

            row.innerHTML = `
                <div class="lb-rank">${index + 1}${rankSuffix}</div>
                <div class="lb-player">${playerScore.playerName || 'Player'}</div>
                <div class="lb-wealth">${wealthScore}</div>
                <div class="lb-civic">${civicScore}</div>
                <div class="lb-score">${totalScore}</div>
            `;'''

# Use re.sub with regex
content = re.sub(old_code, new_code, content)

# Write back
with open('ui-manager.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Fixed ui-manager.js leaderboard display!')
print('   - Removed $ from wealth column')
print('   - Changed lvtRatio% to civicScore')
print('   - Added NaN handling for all score fields')
