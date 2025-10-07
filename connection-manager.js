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
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting

        // UI elements
        this.statusIndicator = null;
        this.statusText = null;

        // Bind methods to preserve context
        this.handleMessage = this.handleMessage.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);

        // Initialize UI after DOM loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeUI());
        } else {
            this.initializeUI();
        }
    }

    /**
     * Initialize UI elements for connection status
     */
    initializeUI() {
        this.statusIndicator = document.getElementById('connection-status');
        this.statusText = this.statusIndicator?.querySelector('.connection-text');
    }

    /**
     * Update connection status UI
     */
    updateStatusUI(state, message = null) {
        if (!this.statusIndicator) return;

        this.connectionState = state;
        this.statusIndicator.classList.remove('hidden', 'connecting', 'connected', 'disconnected', 'reconnecting');
        this.statusIndicator.classList.add(state);

        const messages = {
            connecting: 'Connecting...',
            connected: 'Connected',
            disconnected: 'Disconnected',
            reconnecting: `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        };

        let statusMessage = message || messages[state] || state;

        // Add queue info if messages are queued
        if (this.messageQueue.length > 0) {
            statusMessage += ` • ${this.messageQueue.length} queued`;
        }

        if (this.statusText) {
            this.statusText.textContent = statusMessage;
        }

        // Show indicator for non-connected states or during first 3 seconds of connection
        if (state !== 'connected') {
            this.statusIndicator.classList.remove('hidden');
        } else {
            // Auto-hide after 3 seconds when connected
            setTimeout(() => {
                if (this.connectionState === 'connected') {
                    this.statusIndicator.classList.add('hidden');
                }
            }, 3000);
        }
    }

    /**
     * Connect to WebSocket server
     */
    async connect(url) {
        // If already connected to the same URL, just return
        if (this.isConnected && this.url === url) {
            console.log('📡 Already connected to', url);
            return Promise.resolve();
        }

        // If connected to different URL, disconnect first
        if (this.isConnected && this.url !== url) {
            console.log('📡 Switching connection from', this.url, 'to', url);
            this.disconnect();
        }

        this.url = url;
        this.updateStatusUI('connecting');

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
                this.updateStatusUI('disconnected', 'Connection failed');
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
            // Update UI to show queued messages
            this.updateStatusUI(this.connectionState);
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
     * Attempt to rejoin existing session
     * Returns promise that resolves if successful
     */
    async attemptSessionRejoin() {
        if (!window.sessionManager) {
            console.warn('SessionManager not available');
            return false;
        }

        const session = window.sessionManager.getSession();
        if (!session || !session.sessionToken) {
            console.log('No valid session to rejoin');
            return false;
        }

        return new Promise((resolve, reject) => {
            // Subscribe to session restoration responses
            const unsubscribeRestored = this.subscribe('SESSION_RESTORED', (message) => {
                console.log('✅ Session restored successfully');
                unsubscribeRestored();
                unsubscribeExpired();
                unsubscribeGone();
                resolve(message);
            });

            const unsubscribeExpired = this.subscribe('SESSION_EXPIRED', () => {
                console.log('❌ Session expired');
                window.sessionManager.clearSession();
                unsubscribeRestored();
                unsubscribeExpired();
                unsubscribeGone();
                resolve(false);
            });

            const unsubscribeGone = this.subscribe('ROOM_GONE', () => {
                console.log('❌ Room no longer exists');
                window.sessionManager.clearSession();
                unsubscribeRestored();
                unsubscribeExpired();
                unsubscribeGone();
                resolve(false);
            });

            // Send rejoin request
            this.send({
                type: 'REJOIN_SESSION',
                sessionToken: session.sessionToken
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                console.log('⏰ Session rejoin timeout');
                unsubscribeRestored();
                unsubscribeExpired();
                unsubscribeGone();
                resolve(false);
            }, 5000);
        });
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
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatusUI('connected');
        this.startHeartbeat();
        this.flushMessageQueue();
        this.emitConnectionEvent('connected', event);
        console.log('📡 Connected to server');
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);

            // Handle heartbeat messages directly (protocol consistency)
            if (message.type === 'PONG') {
                this.handlePong();
                return;
            }

            if (message.type === 'PING') {
                this.handlePing(message);
                return;
            }

            // Handle CONNECTED message - check for existing session to rejoin
            if (message.type === 'CONNECTED') {
                // Check if we have an existing session to rejoin
                const existingSession = window.sessionManager?.getSession();

                if (existingSession && existingSession.sessionToken && existingSession.roomId) {
                    // We have an active session - attempt to rejoin instead of creating new session
                    console.log('🔄 Existing session detected, attempting rejoin...', existingSession);

                    // Send rejoin request immediately
                    this.send({
                        type: 'REJOIN_SESSION',
                        sessionToken: existingSession.sessionToken
                    });
                } else {
                    // No existing session - save the new session from server
                    if (window.sessionManager && message.playerId && message.sessionToken) {
                        window.sessionManager.saveSession({
                            playerId: message.playerId,
                            sessionToken: message.sessionToken,
                            roomId: null, // Will be set when player joins room
                            playerName: null,
                            playerColor: null
                        });
                    }
                }
            }

            // Handle SESSION_RESTORED - update session
            if (message.type === 'SESSION_RESTORED') {
                if (window.sessionManager && message.roomId) {
                    window.sessionManager.updateRoomId(message.roomId);
                }
            }

            // Handle error messages consistently
            if (message.type === 'ERROR') {
                console.error('Server error:', message.message);
                this.emitConnectionEvent('error', message);
                return;
            }

            // Route message to subscribers
            const callbacks = this.subscribers.get(message.type);
            if (callbacks) {
                callbacks.forEach(callback => {
                    try {
                        callback(message);
                    } catch (error) {
                        console.error(`Message handler error for ${message.type}:`, error);
                    }
                });
            } else {
                // Only warn for non-standard messages to reduce noise
                if (!['CONNECTED', 'PLAYER_IDENTIFIED', 'SESSION_RESTORED'].includes(message.type)) {
                    console.warn(`No subscribers for message type: ${message.type}`);
                }
            }

        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    handleClose(event) {
        this.isConnected = false;
        this.stopHeartbeat();

        // Update UI based on whether we'll reconnect
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.updateStatusUI('reconnecting');
            this.attemptReconnection();
        } else {
            this.updateStatusUI('disconnected', event.code === 1000 ? 'Disconnected' : 'Connection lost');
        }

        this.emitConnectionEvent('disconnected', event);
    }

    handleError(event) {
        this.emitConnectionEvent('error', event);
    }

    async attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('📡 Max reconnection attempts reached');
            this.updateStatusUI('disconnected', 'Connection failed - Please refresh');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        const jitter = Math.random() * delay * 0.2; // Add up to 20% jitter
        const finalDelay = delay + jitter;

        const secondsRemaining = Math.ceil(finalDelay / 1000);
        this.updateStatusUI('reconnecting', `Reconnecting in ${secondsRemaining}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        console.log(`📡 Reconnecting in ${finalDelay.toFixed(0)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.emitConnectionEvent('reconnecting', { attempt: this.reconnectAttempts, delay: finalDelay });

        setTimeout(async () => {
            try {
                await this.connect(this.url);
            } catch (error) {
                console.error('📡 Reconnection failed:', error);
                // The close event will trigger the next attempt
            }
        }, finalDelay);
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                this.send({ type: 'PING', timestamp: Date.now() });
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

    handlePing(message) {
        this.send({
            type: 'PONG',
            connectionId: message.connectionId,
            timestamp: Date.now()
        });
    }



    flushMessageQueue() {
        const queuedCount = this.messageQueue.length;

        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            this.ws.send(message);
        }

        if (queuedCount > 0) {
            console.log(`📡 Flushed ${queuedCount} queued messages`);
            // Update UI to clear queue counter
            this.updateStatusUI(this.connectionState);
        }

        if (this.messageQueue.length > 0) {
            console.warn(`📡 ${this.messageQueue.length} messages still queued after flush attempt`);
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