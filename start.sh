#!/bin/bash
# Kill any existing server
lsof -ti :4000 | xargs kill -9 2>/dev/null
sleep 1

# Start server fully detached from this shell
cd "$(dirname "$0")"
nohup node server.js >> /tmp/aquasmart.log 2>&1 &
echo $! > /tmp/aquasmart.pid
echo "✅ AquaSmart started (PID: $(cat /tmp/aquasmart.pid))"
echo "🌐 Open: http://localhost:4000"
echo "🔐 Login: admin@aquasmart.com / aqua@1234"
