/**
 * ConnectionManager - Clean WebSocket management with pub/sub architecture
 * Eliminates message forwarding by providing direct subscription system
 * Single responsibility: WebSocket connection + message routing
 */

class ConnectionManager {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.subscribers = new Map(); // messageType -> Set of callbacks
        this.connectionEventListeners = new Map(); // event -> Set of callbacks
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.heartbeatInterval = null;
        this.heartbeatTimeout = null;
        this.messageQueue = [];
        this.url = null;

        // Bind methods to preserve context
        this.handleMessage = this.handleMessage.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }

    /**
     * Connect to WebSocket server
     * @param {string} url - WebSocket URL
     * @returns {Promise<void>}
     */
    async connect(url) {
        this.url = url;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);

                this.ws.onopen = (event) => {
                    this.handleOpen(event);
                    resolve();
                };

                this.ws.onmessage = this.handleMessage;
                this.ws.onclose = this.handleClose;
                this.ws.onerror = (event) => {
                    this.handleError(event);
                    reject(new Error('WebSocket connection failed'));
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Subscribe to specific message types
     * @param {string} messageType - Type of message to listen for
     * @param {Function} callback - Function to call when message received
     * @returns {Function} unsubscribe function
     */
    subscribe(messageType, callback) {
        if (!this.subscribers.has(messageType)) {
            this.subscribers.set(messageType, new Set());
        }

        this.subscribers.get(messageType).add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.subscribers.get(messageType);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.subscribers.delete(messageType);
                }
            }
        };
    }

    /**
     * Subscribe to connection events (connected, disconnected, error, reconnecting)
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     * @returns {Function} unsubscribe function
     */
    on(event, callback) {
        if (!this.connectionEventListeners.has(event)) {
            this.connectionEventListeners.set(event, new Set());
        }

        this.connectionEventListeners.get(event).add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.connectionEventListeners.get(event);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.connectionEventListeners.delete(event);
                }
            }
        };
    }

    /**
     * Send message to server
     * @param {Object} message - Message object to send
     */
    send(message) {
        const messageStr = JSON.stringify(message);

        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(messageStr);
        } else {
            // Queue message for when connection is restored
            this.messageQueue.push(messageStr);
            console.warn('📡 Message queued - not connected:', message.type);
        }
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopHeartbeat();

        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnection
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }

        this.isConnected = false;
        this.emitConnectionEvent('disconnected');
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
            url: this.url,
            reconnectAttempts: this.reconnectAttempts,
            queuedMessages: this.messageQueue.length
        };
    }

    // Private methods

    handleOpen(event) {
        console.log('📡 ConnectionManager: Connected to server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.flushMessageQueue();
        this.emitConnectionEvent('connected', event);
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);

            // Handle heartbeat responses
            if (message.type === 'PONG') {
                this.handlePong();
                return;
            }

            // Route message to subscribers
            const callbacks = this.subscribers.get(message.type);
            if (callbacks) {
                callbacks.forEach(callback => {
                    try {
                        callback(message);
                    } catch (error) {
                        console.error(`📡 Error in message callback for ${message.type}:`, error);
                    }
                });
            } else {
                console.warn(`📡 No subscribers for message type: ${message.type}`);
            }

        } catch (error) {
            console.error('📡 Failed to parse WebSocket message:', error, event.data);
        }
    }

    handleClose(event) {
        console.log(`📡 ConnectionManager: Disconnected (${event.code}: ${event.reason})`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.emitConnectionEvent('disconnected', event);

        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnection();
        }
    }

    handleError(event) {
        console.error('📡 ConnectionManager: WebSocket error:', event);
        this.emitConnectionEvent('error', event);
    }

    async attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('📡 Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        console.log(`📡 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.emitConnectionEvent('reconnecting', { attempt: this.reconnectAttempts, delay });

        setTimeout(async () => {
            try {
                await this.connect(this.url);
            } catch (error) {
                console.error('📡 Reconnection failed:', error);
                this.attemptReconnection();
            }
        }, delay);
    }

    startHeartbeat() {
        this.stopHeartbeat();

        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                this.send({ type: 'PING', timestamp: Date.now() });

                // Set timeout for pong response
                this.heartbeatTimeout = setTimeout(() => {
                    console.warn('📡 Heartbeat timeout - closing connection');
                    this.ws.close(1000, 'Heartbeat timeout');
                }, 10000);
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    handlePong() {
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            this.ws.send(message);
        }

        if (this.messageQueue.length > 0) {
            console.log(`📡 Flushed queued messages, ${this.messageQueue.length} remaining`);
        }
    }

    emitConnectionEvent(eventName, data = null) {
        const callbacks = this.connectionEventListeners.get(eventName);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`📡 Error in connection event callback for ${eventName}:`, error);
                }
            });
        }
    }
}

// Create global instance
window.connectionManager = new ConnectionManager();

// Export for modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConnectionManager;
}