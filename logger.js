/**
 * Simple logging utility for development/production environments
 */
class Logger {
    constructor(module = 'app') {
        this.module = module;
        this.isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
    }

    debug(...args) {
        if (this.isDev) {
            console.log(`[${this.module}]`, ...args);
        }
    }

    info(...args) {
        console.log(`[${this.module}]`, ...args);
    }

    warn(...args) {
        console.warn(`[${this.module}]`, ...args);
    }

    error(...args) {
        console.error(`[${this.module}]`, ...args);
    }
}

// Browser-compatible version
if (typeof window !== 'undefined') {
    window.Logger = Logger;
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
}