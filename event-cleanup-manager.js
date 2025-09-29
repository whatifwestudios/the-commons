/**
 * Event Cleanup Manager
 *
 * Centralized system for managing event listeners with automatic cleanup
 * to prevent memory leaks in multiplayer sessions
 */

class EventCleanupManager {
    constructor() {
        this.listeners = new Map(); // element -> [{event, handler, options}]
        this.boundHandlers = new WeakMap(); // Store bound versions of handlers
    }

    /**
     * Add an event listener with automatic cleanup tracking
     */
    addEventListener(element, event, handler, options = false) {
        if (!element) return;

        // Create bound version if needed for proper removal
        let boundHandler = handler;
        if (typeof handler === 'function' && handler.bind) {
            if (!this.boundHandlers.has(handler)) {
                boundHandler = handler;
                this.boundHandlers.set(handler, boundHandler);
            } else {
                boundHandler = this.boundHandlers.get(handler);
            }
        }

        // Track the listener
        if (!this.listeners.has(element)) {
            this.listeners.set(element, []);
        }

        this.listeners.get(element).push({
            event,
            handler: boundHandler,
            originalHandler: handler,
            options
        });

        // Add the actual listener
        element.addEventListener(event, boundHandler, options);

        return boundHandler; // Return bound handler for manual removal if needed
    }

    /**
     * Remove a specific event listener
     */
    removeEventListener(element, event, handler) {
        if (!element || !this.listeners.has(element)) return;

        const listeners = this.listeners.get(element);
        const index = listeners.findIndex(l =>
            l.event === event &&
            (l.originalHandler === handler || l.handler === handler)
        );

        if (index !== -1) {
            const listener = listeners[index];
            element.removeEventListener(event, listener.handler, listener.options);
            listeners.splice(index, 1);

            // Clean up if no more listeners on this element
            if (listeners.length === 0) {
                this.listeners.delete(element);
            }
        }
    }

    /**
     * Remove all event listeners for an element
     */
    removeAllListeners(element) {
        if (!element || !this.listeners.has(element)) return;

        const listeners = this.listeners.get(element);
        listeners.forEach(({event, handler, options}) => {
            element.removeEventListener(event, handler, options);
        });

        this.listeners.delete(element);
    }

    /**
     * Clean up all tracked listeners (for component destroy)
     */
    cleanup() {
        this.listeners.forEach((listeners, element) => {
            listeners.forEach(({event, handler, options}) => {
                try {
                    element.removeEventListener(event, handler, options);
                } catch (e) {
                    // Element may have been removed from DOM
                    console.debug('Cleanup error (element may be removed):', e);
                }
            });
        });

        this.listeners.clear();
    }

    /**
     * Get listener count for debugging
     */
    getListenerCount() {
        let count = 0;
        this.listeners.forEach(listeners => {
            count += listeners.length;
        });
        return count;
    }

    /**
     * Debug: List all active listeners
     */
    debugListeners() {
        const summary = [];
        this.listeners.forEach((listeners, element) => {
            const elementName = element.id || element.className || element.tagName || 'unknown';
            listeners.forEach(({event}) => {
                summary.push(`${elementName}: ${event}`);
            });
        });
        return summary;
    }
}

// Export as singleton for global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventCleanupManager;
}

// Also make available globally for browser
if (typeof window !== 'undefined') {
    window.EventCleanupManager = EventCleanupManager;
}