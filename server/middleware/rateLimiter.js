const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiters for different types of actions
const actionRateLimiter = new RateLimiterMemory({
  keyGenerator: (socket) => socket.id,
  points: 10, // Number of actions
  duration: 1, // Per 1 second
});

const chatRateLimiter = new RateLimiterMemory({
  keyGenerator: (socket) => socket.id,
  points: 5, // Number of messages
  duration: 60, // Per 1 minute
});

const votingRateLimiter = new RateLimiterMemory({
  keyGenerator: (socket) => socket.id,
  points: 1, // Number of votes
  duration: 300, // Per 5 minutes
});

// Middleware function for socket.io
const rateLimiter = (socket, next) => {
  // Attach rate limiters to socket
  socket.rateLimiter = {
    consume: async (key) => {
      try {
        await actionRateLimiter.consume(key);
        return true;
      } catch (rejRes) {
        console.log(`Rate limit exceeded for socket ${key}: ${rejRes.totalHits} hits`);
        return false;
      }
    }
  };

  socket.chatLimiter = {
    consume: async (key) => {
      try {
        await chatRateLimiter.consume(key);
        return true;
      } catch (rejRes) {
        console.log(`Chat rate limit exceeded for socket ${key}: ${rejRes.totalHits} hits`);
        return false;
      }
    }
  };

  socket.votingLimiter = {
    consume: async (key) => {
      try {
        await votingRateLimiter.consume(key);
        return true;
      } catch (rejRes) {
        console.log(`Voting rate limit exceeded for socket ${key}: ${rejRes.totalHits} hits`);
        return false;
      }
    }
  };

  next();
};

module.exports = { rateLimiter, actionRateLimiter, chatRateLimiter, votingRateLimiter };