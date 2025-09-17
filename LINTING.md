# Code Linting for The Commons

This project uses a custom linter to catch multiplayer compatibility bugs that can break core game systems.

## Quick Start

```bash
# Install dependencies (one time)
npm install

# Check for multiplayer compatibility issues
npm run lint

# Run full ESLint (more comprehensive but noisier)
npm run lint:full
```

## Custom Rules

### Multiplayer Compatibility
The linter will catch common multiplayer bugs:

```javascript
// ❌ BAD - Will be flagged by linter
if (parcel.owner === 'player') { ... }
if (parcel.owner !== 'player') { ... }

// ✅ GOOD - Multiplayer compatible
if (this.isCurrentPlayer(parcel.owner)) { ... }
if (!this.isCurrentPlayer(parcel.owner)) { ... }
```

### Why This Matters
In single-player mode, `owner` is always `'player'`, but in multiplayer mode it's actual player IDs like `'player_abc123'`. Using `this.isCurrentPlayer()` works for both cases.

## Common Issues Fixed

- **LVT Collection**: Revenue calculations now include your buildings
- **Population Counting**: Residents are properly counted from your buildings  
- **DCF Display**: Cashflow shows your building income/costs
- **Tooltips**: Show correct ownership information
- **Context Menus**: Appear on parcels you own

## IDE Integration

### VS Code
Install the ESLint extension to see lint errors in real-time:
1. Install "ESLint" extension by Microsoft
2. Errors will be underlined in red as you type
3. Hover to see the fix suggestion

### Other Editors
ESLint plugins exist for most editors (Vim, Emacs, Atom, etc.)

## Automated Checking

GitHub Actions will automatically run linting on:
- Every push to main/master branch  
- Every pull request
- Will fail the build if multiplayer compatibility issues are found

## Adding New Rules

To add more custom rules, edit `eslint.config.js`:

```javascript
"no-restricted-syntax": [
    "error", 
    {
        "selector": "YourPatternHere",
        "message": "Your helpful error message"
    }
]
```

## Benefits

1. **Catch bugs before deployment** 
2. **Consistent code style**
3. **Multiplayer compatibility enforcement**
4. **Real-time feedback while coding**
5. **Automated quality checks**