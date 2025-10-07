#!/usr/bin/env python3
import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the line with land-exchange-system.js and insert victory-screen.js after it
html = html.replace(
    '    <script src="land-exchange-system.js"></script>',
    '    <script src="land-exchange-system.js"></script>\n    <script src="victory-screen.js"></script>'
)

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('✅ Added victory-screen.js script tag to index.html!')
