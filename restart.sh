#!/bin/bash

# Kill all node server processes
echo "🔴 Stopping all node server processes..."
ps aux | grep "node server.js" | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null

# Wait a moment for ports to free up
sleep 1

# Start fresh server
echo "🚀 Starting server on port 3000..."
PORT=3000 node server.js
