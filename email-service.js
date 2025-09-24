/**
 * Email Service for The Commons
 * Handles magic link email sending via SendGrid
 */

const sgMail = require('@sendgrid/mail');

class EmailService {
    constructor() {
        // Set SendGrid API key from environment variable
        const apiKey = process.env.SENDGRID_API_KEY;
        if (apiKey) {
            sgMail.setApiKey(apiKey);
            console.log('📧 SendGrid email service initialized');
        } else {
            console.warn('⚠️  SENDGRID_API_KEY not found - email sending disabled');
        }

        // Default email configuration
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@playthecommons.net';
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    /**
     * Send a magic link email
     * @param {string} email - Recipient email address
     * @param {string} magicLinkUrl - The magic link URL
     * @returns {Promise<boolean>} - Success status
     */
    async sendMagicLink(email, magicLinkUrl) {
        // In development, just log the link
        if (!this.isProduction) {
            console.log('🔗 Magic Link for', email + ':', magicLinkUrl);
            return true;
        }

        // In production, check if SendGrid is configured
        if (!process.env.SENDGRID_API_KEY) {
            console.error('❌ Cannot send email: SENDGRID_API_KEY not configured');
            throw new Error('Email service not configured');
        }

        try {
            const msg = {
                to: email,
                from: {
                    email: this.fromEmail,
                    name: 'The Commons'
                },
                subject: 'Sign in to The Commons',
                html: this.generateMagicLinkEmail(magicLinkUrl),
                text: this.generateMagicLinkEmailText(magicLinkUrl)
            };

            await sgMail.send(msg);
            console.log('📧 Magic link email sent to:', email);
            return true;

        } catch (error) {
            console.error('❌ Failed to send magic link email:', error.message);
            if (error.response) {
                console.error('SendGrid error:', error.response.body);
            }
            throw error;
        }
    }

    /**
     * Generate HTML email template for magic link
     * @param {string} magicLinkUrl - The magic link URL
     * @returns {string} - HTML email content
     */
    generateMagicLinkEmail(magicLinkUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sign in to The Commons</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .email-container {
                    background: #ffffff;
                    border-radius: 12px;
                    padding: 40px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .header h1 {
                    color: #1a1a1a;
                    font-size: 28px;
                    margin: 0 0 10px 0;
                }
                .header p {
                    color: #666;
                    margin: 0;
                }
                .magic-link-btn {
                    display: inline-block;
                    background: #9C27B0;
                    color: white !important;
                    text-decoration: none;
                    padding: 16px 32px;
                    border-radius: 8px;
                    font-weight: 600;
                    text-align: center;
                    margin: 30px 0;
                    transition: background-color 0.3s ease;
                }
                .magic-link-btn:hover {
                    background: #7B1FA2;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    font-size: 14px;
                    color: #666;
                    text-align: center;
                }
                .security-note {
                    background: #f8f9fa;
                    border-left: 4px solid #9C27B0;
                    padding: 15px;
                    margin: 20px 0;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <h1>The Commons</h1>
                    <p>A game about property, taxes, community and winning</p>
                </div>

                <p>Click the button below to sign in to your account:</p>

                <div style="text-align: center;">
                    <a href="${magicLinkUrl}" class="magic-link-btn">Sign In to The Commons</a>
                </div>

                <div class="security-note">
                    <strong>Security Note:</strong> This link will expire in 15 minutes and can only be used once. If you didn't request this sign-in link, you can safely ignore this email.
                </div>

                <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666; font-size: 14px;">${magicLinkUrl}</p>

                <div class="footer">
                    <p>This email was sent to you because you requested to sign in to The Commons.</p>
                    <p>If you have any questions, please contact us at support@playthecommons.net</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate plain text email for magic link
     * @param {string} magicLinkUrl - The magic link URL
     * @returns {string} - Plain text email content
     */
    generateMagicLinkEmailText(magicLinkUrl) {
        return `
The Commons - Sign In

Click the link below to sign in to your account:

${magicLinkUrl}

This link will expire in 15 minutes and can only be used once. If you didn't request this sign-in link, you can safely ignore this email.

---
The Commons
A game about property, taxes, community and winning

If you have any questions, please contact us at support@playthecommons.net
        `.trim();
    }
}

module.exports = EmailService;