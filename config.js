// Configuration for The Commons
window.CONFIG = {
  // Auto-detect environment and set appropriate server URL
  SERVER_URL: (function() {
    // Check if we're in production (deployed on Vercel)
    if (window.location.hostname.includes('vercel.app') || window.location.hostname === 'the-commons-v2.vercel.app') {
      return 'https://the-commons-server-zjb.fly.dev';
    }
    // Development environment
    return 'http://localhost:3000';
  })(),
  
  // Other configuration options
  WS_TIMEOUT: 10000,
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000
};