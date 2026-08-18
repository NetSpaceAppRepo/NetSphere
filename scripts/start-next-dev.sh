#!/bin/bash
# Persistent launcher for the Next.js dev server.
# Detaches the process into its own session so it survives the bash tool's exit.

PROJECT_DIR="/home/z/my-project"
LOG_FILE="/tmp/next-dev.log"
PID_FILE="/tmp/next-dev.pid"

# Kill any existing instance
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null
        sleep 1
    fi
fi
# Also kill anything on port 3000
fuser -k 3000/tcp 2>/dev/null
sleep 1

cd "$PROJECT_DIR" || exit 1

# Start the dev server fully detached
setsid npx next dev -p 3000 > "$LOG_FILE" 2>&1 < /dev/null &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

# Give it time to start
sleep 8

if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "Next.js dev server started (PID: $NEW_PID)"
    tail -5 "$LOG_FILE"
else
    echo "Next.js failed to start"
    cat "$LOG_FILE"
    exit 1
fi
