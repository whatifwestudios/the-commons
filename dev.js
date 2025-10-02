#!/usr/bin/env node

/**
 * Development Utility for The Commons
 * Provides easy commands for development workflow
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
    help: {
        description: 'Show this help message',
        action: showHelp
    },
    status: {
        description: 'Show running server processes',
        action: showStatus
    },
    cleanup: {
        description: 'Kill all server processes',
        action: cleanup
    },
    dev: {
        description: 'Start development server with auto-restart',
        action: () => startDev()
    },
    'dev:debug': {
        description: 'Start development server with debug logging',
        action: () => startDev('debug')
    },
    'dev:solo': {
        description: 'Start development server in solo mode',
        action: () => startDev('solo')
    },
    'dev:multi': {
        description: 'Start development server in multiplayer mode',
        action: () => startDev('multi')
    },
    test: {
        description: 'Quick test setup (cleanup + dev:debug)',
        action: () => testSetup()
    }
};

function showHelp() {
    console.log('🔧 The Commons Development Utility\n');
    console.log('Usage: node dev.js <command>\n');
    console.log('Available commands:');

    Object.entries(commands).forEach(([cmd, { description }]) => {
        console.log(`  ${cmd.padEnd(12)} - ${description}`);
    });

    console.log('\nAlternatively, use npm scripts:');
    console.log('  npm run dev         - Basic development mode');
    console.log('  npm run dev:debug   - Development with debug logging');
    console.log('  npm run dev:solo    - Solo mode development');
    console.log('  npm run dev:multi   - Multiplayer mode development');
    console.log('  npm run test        - Quick test setup');
    console.log('  npm run cleanup     - Kill all server processes');
    console.log('  npm run status      - Show running processes');
}

function showStatus() {
    console.log('🔍 Checking server processes...\n');
    exec("ps aux | grep 'node.*server.js' | grep -v grep", (error, stdout, stderr) => {
        if (stdout.trim()) {
            console.log('Running server processes:');
            console.log(stdout);
        } else {
            console.log('✅ No server processes running');
        }
    });
}

function cleanup() {
    console.log('🧹 Cleaning up server processes...');
    exec("pkill -f 'node.*server.js'", (error, stdout, stderr) => {
        setTimeout(() => {
            console.log('✅ Cleanup complete');
            showStatus();
        }, 1000);
    });
}

function startDev(mode) {
    console.log('🚀 Starting development server...\n');

    let env = { ...process.env };

    switch (mode) {
        case 'debug':
            env.NODE_ENV = 'development';
            env.DEBUG = 'true';
            break;
        case 'solo':
            env.NODE_ENV = 'development';
            env.GAME_MODE = 'solo';
            break;
        case 'multi':
            env.NODE_ENV = 'development';
            env.GAME_MODE = 'multiplayer';
            break;
        default:
            env.NODE_ENV = 'development';
    }

    const nodemon = spawn('npx', ['nodemon', 'server.js'], {
        env,
        stdio: 'inherit'
    });

    nodemon.on('error', (error) => {
        console.error('❌ Failed to start nodemon:', error);
    });
}

function testSetup() {
    console.log('🧪 Setting up test environment...\n');
    cleanup();
    setTimeout(() => {
        startDev('debug');
    }, 2000);
}

// Execute command
if (!command || command === 'help') {
    showHelp();
} else if (commands[command]) {
    commands[command].action();
} else {
    console.error(`❌ Unknown command: ${command}`);
    console.log('Run "node dev.js help" for available commands');
    process.exit(1);
}