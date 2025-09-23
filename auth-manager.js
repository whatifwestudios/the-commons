/**
 * Client-Side Authentication Manager
 * Handles login/logout and user session management
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.loginCallbacks = [];
        this.logoutCallbacks = [];

        // Check for existing session on load
        this.checkSession();

        // Handle URL parameters for auth status
        this.handleAuthParams();
    }

    /**
     * Check if user has valid session
     */
    async checkSession() {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.setUser(result.user);
                    return true;
                }
            }
        } catch (error) {
            console.log('No existing session found');
        }

        return false;
    }

    /**
     * Handle URL parameters for auth feedback
     */
    handleAuthParams() {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('auth') && urlParams.get('auth') === 'success') {
            this.showMessage('Successfully logged in! 🎉', 'success');
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (urlParams.has('error')) {
            const error = urlParams.get('error');
            let message = 'Login failed';

            switch (error) {
                case 'invalid-link':
                    message = 'Invalid magic link. Please try again.';
                    break;
                case 'verification-failed':
                    message = 'Login verification failed. Please try again.';
                    break;
                default:
                    message = decodeURIComponent(error);
            }

            this.showMessage(message, 'error');
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    /**
     * Send magic link to email
     */
    async sendMagicLink(email) {
        try {
            const response = await fetch('/api/auth/magic-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(`Magic link sent to ${email}! Check your inbox. 📧`, 'success');
                return true;
            } else {
                this.showMessage(result.error || 'Failed to send magic link', 'error');
                return false;
            }
        } catch (error) {
            console.error('Magic link request failed:', error);
            this.showMessage('Network error. Please try again.', 'error');
            return false;
        }
    }

    /**
     * Logout current user
     */
    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout request failed:', error);
        }

        this.setUser(null);
        this.showMessage('Logged out successfully', 'info');
    }

    /**
     * Set current user and trigger callbacks
     */
    setUser(user) {
        const wasAuthenticated = this.isAuthenticated;

        this.currentUser = user;
        this.isAuthenticated = !!user;

        if (this.isAuthenticated && !wasAuthenticated) {
            // User just logged in
            this.loginCallbacks.forEach(callback => {
                try {
                    callback(user);
                } catch (error) {
                    console.error('Login callback error:', error);
                }
            });
        } else if (!this.isAuthenticated && wasAuthenticated) {
            // User just logged out
            this.logoutCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (error) {
                    console.error('Logout callback error:', error);
                }
            });
        }

        this.updateUI();
    }

    /**
     * Register callback for login events
     */
    onLogin(callback) {
        this.loginCallbacks.push(callback);
    }

    /**
     * Register callback for logout events
     */
    onLogout(callback) {
        this.logoutCallbacks.push(callback);
    }

    /**
     * Show login UI
     */
    showLoginUI() {
        const loginOverlay = document.createElement('div');
        loginOverlay.className = 'auth-overlay';
        loginOverlay.innerHTML = `
            <div class="auth-modal">
                <div class="auth-header">
                    <h2>🏙️ Welcome to The Commons</h2>
                    <p>Enter your email to get a magic link:</p>
                </div>
                <form class="auth-form" id="loginForm">
                    <input
                        type="email"
                        id="emailInput"
                        placeholder="your.email@example.com"
                        required
                        autocomplete="email"
                    >
                    <button type="submit" id="sendLinkBtn">
                        📧 Send Magic Link
                    </button>
                </form>
                <div class="auth-footer">
                    <p>We'll send you a secure link to log in.<br>No passwords needed! ✨</p>
                </div>
                <button class="auth-close" id="closeAuth">×</button>
            </div>
        `;

        document.body.appendChild(loginOverlay);

        // Handle form submission
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('emailInput');
        const sendBtn = document.getElementById('sendLinkBtn');
        const closeBtn = document.getElementById('closeAuth');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = emailInput.value.trim();
            if (!email) return;

            sendBtn.disabled = true;
            sendBtn.textContent = '⏳ Sending...';

            const success = await this.sendMagicLink(email);

            if (success) {
                setTimeout(() => {
                    document.body.removeChild(loginOverlay);
                }, 2000);
            } else {
                sendBtn.disabled = false;
                sendBtn.textContent = '📧 Send Magic Link';
            }
        });

        // Handle close
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(loginOverlay);
        });

        // Auto-focus email input
        emailInput.focus();
    }

    /**
     * Update UI based on auth state
     */
    updateUI() {
        const userInfoElement = document.getElementById('userInfo');
        const loginButton = document.getElementById('loginBtn');
        const logoutButton = document.getElementById('logoutBtn');

        if (this.isAuthenticated && this.currentUser) {
            if (userInfoElement) {
                userInfoElement.textContent = `👤 ${this.currentUser.email}`;
                userInfoElement.style.display = 'block';
            }
            if (loginButton) loginButton.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'block';
        } else {
            if (userInfoElement) userInfoElement.style.display = 'none';
            if (loginButton) loginButton.style.display = 'block';
            if (logoutButton) logoutButton.style.display = 'none';
        }
    }

    /**
     * Show message to user
     */
    showMessage(message, type = 'info') {
        // Create or update message element
        let messageEl = document.getElementById('authMessage');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'authMessage';
            messageEl.className = 'auth-message';
            document.body.appendChild(messageEl);
        }

        messageEl.textContent = message;
        messageEl.className = `auth-message auth-message-${type}`;
        messageEl.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.style.display = 'none';
            }
        }, 5000);
    }

    /**
     * Get current user info
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isLoggedIn() {
        return this.isAuthenticated;
    }
}

// Global auth manager instance
window.authManager = new AuthManager();