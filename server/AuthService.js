const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class AuthService {
  constructor() {
    // In-memory storage for demo - replace with database in production
    this.users = new Map(); // email -> user data
    this.magicLinks = new Map(); // token -> { email, expires, used }
    this.sessions = new Map(); // sessionId -> { userId, email, expires }
    
    // Magic link expiry time (10 minutes)
    this.MAGIC_LINK_EXPIRES = 10 * 60 * 1000;
    
    // Session expiry time (7 days)
    this.SESSION_EXPIRES = 7 * 24 * 60 * 60 * 1000;
  }

  // Send magic link to email
  async sendMagicLink(email, playerName = null) {
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address');
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.MAGIC_LINK_EXPIRES;

    // Store magic link
    this.magicLinks.set(token, {
      email: email.toLowerCase(),
      expires,
      used: false,
      playerName
    });

    // Get or create user
    const user = this.getOrCreateUser(email, playerName);

    // Create magic link URL
    const magicUrl = `${process.env.CLIENT_URL || 'http://localhost:8000'}/auth/verify?token=${token}`;

    // In production, you'd send this via email service (SendGrid, etc.)
    // For demo, we'll just log it and return it
    console.log(`🔗 Magic link for ${email}: ${magicUrl}`);

    // Simulate email sending
    const emailContent = this.generateEmailContent(user.name || playerName || 'Player', magicUrl);

    return {
      success: true,
      message: 'Magic link sent to your email',
      // For demo purposes only - remove in production
      magicUrl: process.env.NODE_ENV === 'development' ? magicUrl : undefined,
      emailPreview: process.env.NODE_ENV === 'development' ? emailContent : undefined
    };
  }

  // Verify magic link and create session
  async verifyMagicLink(token) {
    const linkData = this.magicLinks.get(token);

    if (!linkData) {
      throw new Error('Invalid or expired magic link');
    }

    if (linkData.used) {
      throw new Error('Magic link already used');
    }

    if (Date.now() > linkData.expires) {
      this.magicLinks.delete(token);
      throw new Error('Magic link expired');
    }

    // Mark link as used
    linkData.used = true;

    // Get user
    const user = this.users.get(linkData.email);
    if (!user) {
      throw new Error('User not found');
    }

    // Create session
    const sessionId = uuidv4();
    const sessionExpires = Date.now() + this.SESSION_EXPIRES;

    this.sessions.set(sessionId, {
      userId: user.id,
      email: user.email,
      expires: sessionExpires
    });

    // Update user last login
    user.lastLogin = Date.now();

    // Clean up used magic link
    this.magicLinks.delete(token);

    return {
      success: true,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      expiresAt: sessionExpires
    };
  }

  // Validate session
  validateSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expires) {
      this.sessions.delete(sessionId);
      return null;
    }

    const user = this.users.get(session.email);
    if (!user) {
      this.sessions.delete(sessionId);
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name
    };
  }

  // Logout (invalidate session)
  logout(sessionId) {
    return this.sessions.delete(sessionId);
  }

  // Get or create user
  getOrCreateUser(email, name = null) {
    const normalizedEmail = email.toLowerCase();
    
    let user = this.users.get(normalizedEmail);
    
    if (!user) {
      user = {
        id: uuidv4(),
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        createdAt: Date.now(),
        lastLogin: null
      };
      
      this.users.set(normalizedEmail, user);
      console.log(`👤 Created new user: ${user.email} (${user.name})`);
    } else if (name && name !== user.name) {
      // Update name if provided and different
      user.name = name;
    }

    return user;
  }

  // Update user profile
  updateUser(userId, updates) {
    // Find user by ID
    for (const [email, user] of this.users.entries()) {
      if (user.id === userId) {
        // Only allow certain fields to be updated
        if (updates.name) user.name = updates.name.substring(0, 50);
        return user;
      }
    }
    
    throw new Error('User not found');
  }

  // Get user by ID
  getUserById(userId) {
    for (const [email, user] of this.users.entries()) {
      if (user.id === userId) {
        return user;
      }
    }
    return null;
  }

  // Generate email content
  generateEmailContent(playerName, magicUrl) {
    return {
      subject: 'Your login link for The Commons',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #52C77E;">🏙️ Welcome to The Commons</h1>
          
          <p>Hi ${playerName},</p>
          
          <p>Click the link below to log in to your account:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicUrl}" 
               style="background: #52C77E; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              🔗 Log in to The Commons
            </a>
          </div>
          
          <p><small>This link expires in 10 minutes and can only be used once.</small></p>
          
          <p>If you didn't request this login, you can safely ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #888; font-size: 14px;">
            The Commons - A city-building game exploring land value economics<br>
            Build, compete, and cooperate to create the most valuable cities!
          </p>
        </div>
      `,
      text: `
        Welcome to The Commons!
        
        Hi ${playerName},
        
        Click this link to log in: ${magicUrl}
        
        This link expires in 10 minutes and can only be used once.
        
        If you didn't request this login, you can safely ignore this email.
        
        The Commons - A city-building game exploring land value economics
      `
    };
  }

  // Cleanup expired links and sessions
  cleanup() {
    const now = Date.now();

    // Clean up expired magic links
    for (const [token, linkData] of this.magicLinks.entries()) {
      if (now > linkData.expires) {
        this.magicLinks.delete(token);
      }
    }

    // Clean up expired sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expires) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Get stats for admin
  getStats() {
    return {
      totalUsers: this.users.size,
      activeSessions: this.sessions.size,
      pendingMagicLinks: this.magicLinks.size
    };
  }

  // For persistence - export data
  exportData() {
    return {
      users: Array.from(this.users.entries()),
      sessions: Array.from(this.sessions.entries())
      // Don't persist magic links - they're temporary
    };
  }

  // For persistence - import data
  importData(data) {
    if (data.users) {
      this.users = new Map(data.users);
    }
    if (data.sessions) {
      // Only import non-expired sessions
      const now = Date.now();
      const validSessions = data.sessions.filter(([_, session]) => now < session.expires);
      this.sessions = new Map(validSessions);
    }
  }
}

module.exports = AuthService;