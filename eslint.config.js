import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ["*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script", // Most of our files use global scope, not modules
            globals: {
                // Browser globals
                window: "readonly",
                document: "readonly",
                console: "readonly",
                performance: "readonly",
                Image: "readonly",
                fetch: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                Response: "readonly",
                TextEncoder: "readonly",
                TransformStream: "readonly",
                Math: "readonly",
                Date: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                
                // Browser APIs we use
                localStorage: "readonly",
                EventSource: "readonly", 
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                confirm: "readonly",
                
                // CommonJS module system
                module: "readonly",
                exports: "readonly",
                require: "readonly",
                
                // Custom game globals
                Game: "writable",
                BuildingManager: "writable", 
                BuildingSystem: "writable",
                EconomicEngine: "writable",
                GameState: "writable",
                GovernanceSystem: "writable",
                PerformanceMonitor: "writable",
                RenderingSystem: "writable",
                TooltipManager: "writable",
                TransportationSystem: "writable",
                UIManager: "writable",
                AuctionSystem: "writable",
                MobilityLayer: "writable"
            }
        },
        rules: {
            // Standard ESLint rules - start lenient and tighten over time
            "no-unused-vars": "off", // Too many to fix right now
            "no-console": "off", // We use console.log for debugging
            "no-undef": "off", // Too many globals to fix right now
            "prefer-const": "off", // Can fix gradually
            "no-var": "warn",
            "no-implicit-globals": "off", // Our code uses global variables intentionally
            "no-redeclare": "off", // Our globals are intentionally redeclared
            
            // Catch common multiplayer bugs
            "no-restricted-syntax": [
                "error",
                {
                    "selector": "BinaryExpression[operator='==='][left.property.name='owner'][right.value='player']",
                    "message": "Use this.isCurrentPlayer(owner) instead of owner === 'player' for multiplayer compatibility"
                },
                {
                    "selector": "BinaryExpression[operator='=='][left.property.name='owner'][right.value='player']", 
                    "message": "Use this.isCurrentPlayer(owner) instead of owner == 'player' for multiplayer compatibility"
                },
                {
                    "selector": "BinaryExpression[operator='!=='][left.property.name='owner'][right.value='player']",
                    "message": "Use !this.isCurrentPlayer(owner) instead of owner !== 'player' for multiplayer compatibility"
                },
                {
                    "selector": "BinaryExpression[operator='!='][left.property.name='owner'][right.value='player']",
                    "message": "Use !this.isCurrentPlayer(owner) instead of owner != 'player' for multiplayer compatibility"
                }
            ]
        }
    }
];