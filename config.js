// Configuration for The Commons - Railway Deployment
window.CONFIG = {
  // Railway-focused configuration
  SERVER_URL: (function() {
    // Check if we're in production (deployed on Railway)
    if (window.location.hostname.includes('railway.app')) {
      return window.location.origin; // Use same origin for Railway
    }
    // Development environment
    return 'http://localhost:3000';
  })(),
  
  // WebSocket configuration options
  WS_TIMEOUT: 10000,
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000,
  HEARTBEAT_INTERVAL: 30000
};