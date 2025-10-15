// ESLint configuration for The Commons
// Using ESLint 9.x flat config format

export default [
    {
        ignores: [
            'node_modules/**',
            'archive/**',
            'docs/**',
            'Design guides/**',
            'dist/**',
            'build/**'
        ]
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script', // Using commonjs, not modules
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                fetch: 'readonly',
                WebSocket: 'readonly',

                // Node.js globals
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',

                // Game-specific globals (classes defined in other files)
                IsometricGrid: 'readonly',
                BuildingSystem: 'readonly',
                EconomicClient: 'readonly',
                UIManager: 'readonly',
                RenderingSystemV2: 'readonly',
                MapLayerSystem: 'readonly',
                MapLayerLegend: 'readonly',
                TooltipSystemV2: 'readonly',
                ContextMenuSystem: 'readonly',
                ParcelHoverV2: 'readonly',
                ActionMarketplaceV2: 'readonly',
                LandExchangeSystem: 'readonly',
                Governance: 'readonly',
                VictoryScreen: 'readonly',
                PlayerUtils: 'readonly',
                EventCleanupManager: 'readonly',
                ConnectionManager: 'readonly',
                BeerHallLobby: 'readonly',
                Chart: 'readonly' // Chart.js
            }
        },
        rules: {
            // Error prevention (keep these strict)
            'no-undef': 'warn', // Warn about undefined variables instead of error
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-constant-condition': 'warn',
            'no-debugger': 'warn',

            // Style rules (relaxed)
            'semi': 'off',
            'quotes': 'off',
            'indent': 'off',
            'comma-dangle': 'off',
            'no-trailing-spaces': 'off',
            'eol-last': 'off',
            'no-multiple-empty-lines': 'off',

            // Allow common patterns
            'no-case-declarations': 'off',
            'no-fallthrough': 'off',
            'no-empty': 'warn',
            'no-prototype-builtins': 'off',

            // Disable overly strict rules
            'no-inner-declarations': 'off',
            'no-control-regex': 'off',
            'no-useless-escape': 'off'
        }
    }
];
