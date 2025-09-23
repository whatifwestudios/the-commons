/**
 * Authentication Service - Magic Link Authentication
 *
 * Provides secure email-based authentication for The Commons
 * Sets foundation for multiplayer user isolation
 */

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

class AuthService {
    constructor() {
        // In-memory user storage (replace with database in production)
        this.users = new Map(); // email -> { id, email, createdAt, lastLoginAt }
        this.magicTokens = new Map(); // token -> { email, expires, used }

        // JWT secret (should be environment variable in production)
        this.jwtSecret = process.env.JWT_SECRET || 'the-commons-dev-secret-' + Date.now();

        // Magic link expiration (10 minutes)
        this.magicLinkExpiry = 10 * 60 * 1000;

        // Setup email transporter
        this.setupEmailTransporter();
    }

    setupEmailTransporter() {
        // Gmail SMTP configuration
        // Note: For production, use App Passwords or OAuth2
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER, // Set this environment variable
                pass: process.env.GMAIL_APP_PASSWORD // Set this environment variable
            }
        });
    }

    /**
     * Generate and send magic link to user's email
     */
    async sendMagicLink(email, baseUrl = 'http://localhost:3000') {
        try {
            // Generate unique magic token
            const token = uuidv4();
            const expires = Date.now() + this.magicLinkExpiry;

            // Store token
            this.magicTokens.set(token, {
                email: email.toLowerCase(),
                expires,
                used: false
            });

            // Create magic link
            const magicLink = `${baseUrl}/auth/verify?token=${token}`;

            // Email content
            const mailOptions = {
                from: process.env.GMAIL_USER,
                to: email,
                subject: '🏙️ Your magic link for The Commons',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2c3e50;">Welcome to The Commons!</h2>
                        <p>Click the link below to log into your city-building account:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${magicLink}"
                               style="background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                🏗️ Enter The Commons
                            </a>
                        </div>
                        <p style="color: #7f8c8d; font-size: 14px;">
                            This link will expire in 10 minutes for security.<br>
                            If you didn't request this, you can safely ignore this email.
                        </p>
                        <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
                        <p style="color: #95a5a6; font-size: 12px;">
                            The Commons - Collaborative City Building Game
                        </p>
                    </div>
                `
            };

            // Send email
            await this.transporter.sendMail(mailOptions);

            console.log(`📧 Magic link sent to ${email}`);
            return { success: true, message: 'Magic link sent to your email' };

        } catch (error) {
            console.error('❌ Failed to send magic link:', error);
            return { success: false, error: 'Failed to send magic link' };
        }
    }

    /**
     * Verify magic token and create user session
     */
    async verifyMagicToken(token) {
        try {
            const tokenData = this.magicTokens.get(token);

            if (!tokenData) {
                return { success: false, error: 'Invalid or expired magic link' };
            }

            if (tokenData.used) {
                return { success: false, error: 'Magic link has already been used' };
            }

            if (Date.now() > tokenData.expires) {
                this.magicTokens.delete(token);
                return { success: false, error: 'Magic link has expired' };
            }

            // Mark token as used
            tokenData.used = true;

            // Get or create user
            const user = this.getOrCreateUser(tokenData.email);

            // Generate JWT session token
            const sessionToken = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    iat: Date.now()
                },
                this.jwtSecret,
                { expiresIn: '30d' } // 30 day sessions
            );

            // Update last login
            user.lastLoginAt = new Date().toISOString();

            console.log(`✅ User authenticated: ${user.email} (${user.id})`);

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email
                },
                sessionToken
            };

        } catch (error) {
            console.error('❌ Magic token verification failed:', error);
            return { success: false, error: 'Authentication failed' };
        }
    }

    /**
     * Verify JWT session token
     */
    verifySession(sessionToken) {
        try {
            const decoded = jwt.verify(sessionToken, this.jwtSecret);
            const user = this.users.get(decoded.email);

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email
                }
            };

        } catch (error) {
            return { success: false, error: 'Invalid session token' };
        }
    }

    /**
     * Get or create user account
     */
    getOrCreateUser(email) {
        const normalizedEmail = email.toLowerCase();

        if (this.users.has(normalizedEmail)) {
            return this.users.get(normalizedEmail);
        }

        // Create new user
        const user = {
            id: uuidv4(),
            email: normalizedEmail,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString()
        };

        this.users.set(normalizedEmail, user);
        console.log(`👤 New user created: ${email} (${user.id})`);

        return user;
    }

    /**
     * Clean up expired magic tokens (call periodically)
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        for (const [token, data] of this.magicTokens.entries()) {
            if (now > data.expires || data.used) {
                this.magicTokens.delete(token);
            }
        }
    }

    /**
     * Get user statistics
     */
    getUserStats() {
        return {
            totalUsers: this.users.size,
            activeMagicTokens: this.magicTokens.size
        };
    }
}

module.exports = AuthService;