#!/usr/bin/env python3
import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Victory Screen HTML to insert
victory_html = '''
    <!-- Victory Screen Modal -->
    <div class="modal victory-modal" id="victory-modal">
        <div class="modal-content victory-content">
            <div class="victory-header">
                <div class="victory-crown">👑</div>
                <h2 id="victory-title">Victory!</h2>
                <p id="victory-subtitle" class="victory-subtitle"></p>
            </div>
            <div class="modal-body victory-body">
                <!-- Winner Announcement -->
                <div class="winner-announcement" id="winner-announcement">
                    <div class="winner-badge">
                        <div class="winner-color" id="winner-color"></div>
                        <h3 id="winner-name">Player Name</h3>
                    </div>
                    <p id="victory-message" class="victory-message"></p>
                </div>

                <!-- Final Scoreboard -->
                <div class="final-scoreboard">
                    <h4>Final Scores</h4>
                    <div class="leaderboard-table">
                        <div class="leaderboard-header">
                            <div class="lb-rank">Rank</div>
                            <div class="lb-player">Player</div>
                            <div class="lb-wealth">Wealth</div>
                            <div class="lb-civic">Civic</div>
                            <div class="lb-score">Total</div>
                        </div>
                        <div class="leaderboard-rows" id="victory-scoreboard-rows">
                            <!-- Dynamic content -->
                        </div>
                    </div>
                </div>

                <!-- Fun Stats -->
                <div class="fun-stats" id="fun-stats">
                    <h4>Game Summary</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Final Population</span>
                            <span class="stat-value" id="stat-population">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Wealth</span>
                            <span class="stat-value" id="stat-wealth">$0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Buildings</span>
                            <span class="stat-value" id="stat-buildings">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">LVT Collected</span>
                            <span class="stat-value" id="stat-lvt">$0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Public Spending</span>
                            <span class="stat-value" id="stat-public-spending">$0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Final LVT Rate</span>
                            <span class="stat-value" id="stat-lvt-rate">0%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
'''

# Victory Screen CSS to insert
victory_css = '''
        /* Victory Screen Modal */
        .victory-modal {
            z-index: 10000;
        }

        .victory-content {
            max-width: 700px;
            max-height: 90vh;
            overflow-y: auto;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid #FFD700;
            box-shadow: 0 0 40px rgba(255, 215, 0, 0.3);
        }

        .victory-header {
            text-align: center;
            padding: 30px 20px 20px;
            background: linear-gradient(180deg, rgba(255, 215, 0, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        }

        .victory-crown {
            font-size: 60px;
            margin-bottom: 10px;
            animation: crown-float 3s ease-in-out infinite;
        }

        @keyframes crown-float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }

        .victory-header h2 {
            font-size: 36px;
            margin: 0 0 10px 0;
            color: #FFD700;
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
        }

        .victory-subtitle {
            font-size: 14px;
            color: #aaa;
            margin: 0;
        }

        .victory-body {
            padding: 20px;
        }

        .winner-announcement {
            text-align: center;
            padding: 20px;
            margin-bottom: 30px;
            background: rgba(255, 215, 0, 0.05);
            border-radius: 8px;
            border: 1px solid rgba(255, 215, 0, 0.2);
        }

        .winner-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }

        .winner-color {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid #FFD700;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
        }

        .winner-badge h3 {
            font-size: 24px;
            margin: 0;
            color: #FFD700;
        }

        .victory-message {
            margin: 15px 0 0 0;
            font-size: 16px;
            color: #ccc;
        }

        .final-scoreboard {
            margin-bottom: 30px;
        }

        .final-scoreboard h4 {
            font-size: 18px;
            margin: 0 0 15px 0;
            color: #FFD700;
        }

        .fun-stats {
            background: rgba(0, 0, 0, 0.2);
            padding: 20px;
            border-radius: 8px;
        }

        .fun-stats h4 {
            font-size: 18px;
            margin: 0 0 20px 0;
            color: #FFD700;
            text-align: center;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }

        .stat-item {
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .stat-value {
            font-size: 18px;
            font-weight: bold;
            color: #FFD700;
        }
'''

# Insert Victory HTML before Transition Overlay
html = html.replace(
    '    <!-- Transition Overlay -->',
    victory_html + '\n    <!-- Transition Overlay -->'
)

# Find a good place to insert CSS (after the last modal CSS)
# Look for the leaderboard modal styles
insertion_point = html.find('    <!-- Cashflow Modal -->')
if insertion_point > 0:
    # Find the style tag before this
    style_end = html.rfind('</style>', 0, insertion_point)
    if style_end > 0:
        # Insert before the closing style tag
        html = html[:style_end] + victory_css + '\n' + html[style_end:]

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('✅ Added Victory Screen to index.html!')
print('   - HTML modal structure')
print('   - CSS styling with crown animation')
