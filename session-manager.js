/**
 * SessionManager - Client-side session persistence for reconnection
 * Handles storing and retrieving game session data
 */

class SessionManager {
    constructor() {
        this.SESSION_KEY = 'the-commons-session';
    }

    /**
     * Save session data to sessionStorage
     */
    saveSession(data) {
        try {
            const session = {
                playerId: data.playerId,
                sessionToken: data.sessionToken,
                roomId: data.roomId,
                playerName: data.playerName,
                playerColor: data.playerColor,
                timestamp: Date.now()
            };

            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
            console.log('💾 Session saved:', session);
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    /**
     * Get current session from sessionStorage
     */
    getSession() {
        try {
            const data = sessionStorage.getItem(this.SESSION_KEY);
            if (!data) return null;

            const session = JSON.parse(data);

            // Check if session is too old (> 2 minutes since server timeout is 2 min)
            const SESSION_MAX_AGE = 2 * 60 * 1000;
            if (Date.now() - session.timestamp > SESSION_MAX_AGE) {
                console.log('⏰ Session expired (>2 minutes old)');
                this.clearSession();
                return null;
            }

            return session;
        } catch (error) {
            console.error('Failed to get session:', error);
            return null;
        }
    }

    /**
     * Update session timestamp (keep alive)
     */
    updateTimestamp() {
        const session = this.getSession();
        if (session) {
            session.timestamp = Date.now();
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        }
    }

    /**
     * Update room ID in session (when player joins a room)
     */
    updateRoomId(roomId) {
        const session = this.getSession();
        if (session) {
            session.roomId = roomId;
            session.timestamp = Date.now();
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        }
    }

    /**
     * Clear session (on logout or intentional disconnect)
     */
    clearSession() {
        sessionStorage.removeItem(this.SESSION_KEY);
        console.log('🧹 Session cleared');
    }

    /**
     * Check if there's an active session
     */
    hasActiveSession() {
        return this.getSession() !== null;
    }
}

// Export as singleton
const sessionManager = new SessionManager();
window.sessionManager = sessionManager;
