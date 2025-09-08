// Authentication client for The Commons
class AuthClient {
  constructor() {
    this.user = null;
    this.gameProfile = null;
    this.isAuthenticated = false;
    
    this.setupUI();
    this.checkAuthStatus();
  }

  setupUI() {
    this.createAuthModal();
    this.createProfilePanel();
    this.updateSetupScreen();
  }

  createAuthModal() {
    const authModal = document.createElement('div');
    authModal.id = 'auth-modal';
    authModal.className = 'auth-modal';
    authModal.innerHTML = `
      <div class="auth-content">
        <div class="auth-header">
          <h2>🏙️ Welcome to The Commons</h2>
          <p>Log in to track your progress and compete on the global leaderboards!</p>
        </div>
        
        <div class="auth-form" id="login-form">
          <div class="form-field">
            <label for="email">Email Address</label>
            <input type="email" id="email" placeholder="your@email.com" required>
          </div>
          
          <div class="form-field">
            <label for="player-name">Player Name (Optional)</label>
            <input type="text" id="auth-player-name" placeholder="Enter your name" maxlength="20">
            <small>You can change this later in your profile</small>
          </div>
          
          <button class="auth-btn primary" id="send-magic-link" type="button">
            📧 Send Magic Link
          </button>
          
          <div class="auth-divider">
            <span>or</span>
          </div>
          
          <button class="auth-btn secondary" id="play-anonymous" type="button">
            👤 Play Anonymously
          </button>
          
          <p class="auth-note">
            <small>Magic links are sent to your email and expire in 10 minutes. 
            Your email is only used for login - no spam ever!</small>
          </p>
        </div>
        
        <div class="auth-success hidden" id="auth-success">
          <div class="success-icon">📧</div>
          <h3>Check Your Email!</h3>
          <p>We've sent a magic link to <strong id="sent-email"></strong></p>
          <p><small>The link expires in 10 minutes and can only be used once.</small></p>
          <button class="auth-btn secondary" id="try-different-email">
            Try Different Email
          </button>
        </div>
        
        <div class="auth-error hidden" id="auth-error">
          <p id="error-message"></p>
          <button class="auth-btn secondary" id="retry-auth">Try Again</button>
        </div>
      </div>
    `;

    document.body.appendChild(authModal);
    this.setupAuthEvents();
  }

  createProfilePanel() {
    const profilePanel = document.createElement('div');
    profilePanel.id = 'profile-panel';
    profilePanel.className = 'profile-panel hidden';
    profilePanel.innerHTML = `
      <div class="profile-header">
        <h3>👤 Player Profile</h3>
        <button class="close-btn" id="close-profile">×</button>
      </div>
      
      <div class="profile-content">
        <div class="profile-info">
          <div class="profile-avatar">
            <span class="profile-emoji" id="profile-emoji">🏠</span>
          </div>
          <div class="profile-details">
            <h4 id="profile-name">Player</h4>
            <p id="profile-email">user@example.com</p>
            <p class="profile-joined">Member since <span id="profile-joined"></span></p>
          </div>
        </div>
        
        <div class="profile-stats">
          <h4>Game Statistics</h4>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value" id="games-played">0</span>
              <span class="stat-label">Games Played</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="games-won">0</span>
              <span class="stat-label">Games Won</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="win-rate">0%</span>
              <span class="stat-label">Win Rate</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="best-cities">0</span>
              <span class="stat-label">Best Cities</span>
            </div>
            <div class="stat-item">
              <span class="stat-value" id="double-wins">0</span>
              <span class="stat-label">Double Wins</span>
            </div>
            <div class="stat-item highlight">
              <span class="stat-value" id="current-multiplier">1.000x</span>
              <span class="stat-label">Current Multiplier</span>
            </div>
          </div>
          
          <div class="next-game-bonus">
            <h4>Next Game Starting Cash</h4>
            <div class="bonus-amount" id="next-starting-cash">$5,000</div>
          </div>
        </div>
        
        <div class="recent-games">
          <h4>Recent Games</h4>
          <div id="recent-games-list"></div>
        </div>
        
        <div class="profile-actions">
          <button class="auth-btn secondary" id="logout-btn">🚪 Logout</button>
        </div>
      </div>
    `;

    document.body.appendChild(profilePanel);
    this.setupProfileEvents();
  }

  updateSetupScreen() {
    // Update the existing setup screen to integrate with auth
    const setupModal = document.getElementById('setup-modal');
    if (!setupModal) return;

    const setupContent = setupModal.querySelector('.setup-content');
    if (!setupContent) return;

    // Add auth status to setup screen
    const authStatus = document.createElement('div');
    authStatus.className = 'auth-status';
    authStatus.id = 'setup-auth-status';
    
    setupContent.insertBefore(authStatus, setupContent.firstChild);
    
    // Add profile button to top bar
    const playerBtn = document.getElementById('player-btn');
    if (playerBtn) {
      playerBtn.addEventListener('click', () => {
        if (this.isAuthenticated) {
          this.showProfile();
        } else {
          this.showAuthModal();
        }
      });
    }
  }

  setupAuthEvents() {
    // Send magic link
    document.getElementById('send-magic-link').addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      const playerName = document.getElementById('auth-player-name').value.trim();

      if (!email) {
        this.showAuthError('Please enter your email address');
        return;
      }

      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, playerName })
        });

        const result = await response.json();

        if (result.error) {
          this.showAuthError(result.error);
        } else {
          this.showAuthSuccess(email);
          
          // For development - auto-open magic link
          if (result.magicUrl) {
            console.log('Magic link:', result.magicUrl);
            setTimeout(() => {
              if (confirm('Development mode: Open magic link automatically?')) {
                window.location.href = result.magicUrl;
              }
            }, 1000);
          }
        }
      } catch (error) {
        this.showAuthError('Failed to send magic link. Please try again.');
      }
    });

    // Play anonymously
    document.getElementById('play-anonymous').addEventListener('click', () => {
      this.hideAuthModal();
      // Continue to setup screen
    });

    // Try different email
    document.getElementById('try-different-email').addEventListener('click', () => {
      this.showLoginForm();
    });

    // Retry auth
    document.getElementById('retry-auth').addEventListener('click', () => {
      this.showLoginForm();
    });

    // Enter key to send magic link
    document.getElementById('email').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('send-magic-link').click();
      }
    });
  }

  setupProfileEvents() {
    // Close profile
    document.getElementById('close-profile').addEventListener('click', () => {
      this.hideProfile();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
        this.logout();
      } catch (error) {
        console.error('Logout error:', error);
        this.logout(); // Logout locally anyway
      }
    });
  }

  async checkAuthStatus() {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.user = data.user;
        this.gameProfile = data.gameProfile;
        this.isAuthenticated = true;
        this.updateAuthUI();
        
        // Don't show auth modal if already authenticated
        this.hideAuthModal();
      } else {
        // Check URL for auth status
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('authenticated') === 'true') {
          // Redirect worked, check auth again
          setTimeout(() => this.checkAuthStatus(), 500);
        } else if (urlParams.get('error') === 'auth_failed') {
          this.showAuthError('Login failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  }

  showAuthModal() {
    const authModal = document.getElementById('auth-modal');
    authModal.classList.remove('hidden');
    this.showLoginForm();
  }

  hideAuthModal() {
    const authModal = document.getElementById('auth-modal');
    authModal.classList.add('hidden');
  }

  showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-success').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    
    // Focus email input
    setTimeout(() => {
      document.getElementById('email').focus();
    }, 100);
  }

  showAuthSuccess(email) {
    document.getElementById('sent-email').textContent = email;
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('auth-success').classList.remove('hidden');
    document.getElementById('auth-error').classList.add('hidden');
  }

  showAuthError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('auth-success').classList.add('hidden');
    document.getElementById('auth-error').classList.remove('hidden');
  }

  showProfile() {
    if (!this.isAuthenticated) {
      this.showAuthModal();
      return;
    }

    this.updateProfileData();
    document.getElementById('profile-panel').classList.remove('hidden');
  }

  hideProfile() {
    document.getElementById('profile-panel').classList.add('hidden');
  }

  updateAuthUI() {
    // Update setup screen auth status
    const authStatus = document.getElementById('setup-auth-status');
    if (authStatus) {
      if (this.isAuthenticated) {
        authStatus.innerHTML = `
          <div class="auth-logged-in">
            <span>👋 Welcome back, ${this.user.name}!</span>
            <button class="link-btn" onclick="window.authClient.showProfile()">View Profile</button>
          </div>
        `;
      } else {
        authStatus.innerHTML = `
          <div class="auth-logged-out">
            <p>🏆 <strong>Log in to track your progress</strong> and compete on global leaderboards!</p>
            <button class="link-btn" onclick="window.authClient.showAuthModal()">Log In</button>
          </div>
        `;
      }
    }

    // Update player button
    const playerBtn = document.getElementById('player-btn');
    if (playerBtn && this.isAuthenticated) {
      const name = this.user.name || 'Player';
      playerBtn.innerHTML = `${name.toUpperCase()}<span class="indicator">▼</span>`;
    }
  }

  updateProfileData() {
    if (!this.isAuthenticated || !this.gameProfile) return;

    // Update profile info
    document.getElementById('profile-name').textContent = this.user.name;
    document.getElementById('profile-email').textContent = this.user.email;
    
    const joinDate = new Date(this.user.createdAt || Date.now()).toLocaleDateString();
    document.getElementById('profile-joined').textContent = joinDate;

    // Update stats
    document.getElementById('games-played').textContent = this.gameProfile.gamesPlayed;
    document.getElementById('games-won').textContent = this.gameProfile.gamesWon;
    document.getElementById('win-rate').textContent = this.gameProfile.winRate;
    document.getElementById('best-cities').textContent = this.gameProfile.bestCities;
    document.getElementById('double-wins').textContent = this.gameProfile.doubleWins;
    document.getElementById('current-multiplier').textContent = this.gameProfile.currentMultiplier;
    document.getElementById('next-starting-cash').textContent = '$' + this.gameProfile.nextStartingCash.toLocaleString();

    // Update recent games (if available)
    // This would be populated from the /auth/me endpoint
  }

  logout() {
    this.user = null;
    this.gameProfile = null;
    this.isAuthenticated = false;
    this.updateAuthUI();
    this.hideProfile();
    
    // Reload page to reset game state
    window.location.reload();
  }

  // Get authenticated player data for game
  getPlayerData() {
    if (this.isAuthenticated && this.user) {
      return {
        id: this.user.userId,
        name: this.user.name,
        isAuthenticated: true
      };
    }
    
    return null;
  }
}

// Initialize auth client
window.authClient = new AuthClient();