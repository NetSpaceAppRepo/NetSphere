#!/bin/bash
# Persistent launcher for the trace-service mini-service.
# Detaches the process into its own session so it survives the bash tool's exit.

SERVICE_DIR="/home/z/my-project/mini-services/trace-service"
LOG_FILE="/home/z/my-project/trace-service.log"
PID_FILE="/home/z/my-project/trace-service.pid"

# Kill any existing instance
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null
        sleep 1
    fi
fi

cd "$SERVICE_DIR" || exit 1

# Start the service fully detached
setsid bun index.ts > "$LOG_FILE" 2>&1 < /dev/null &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

# Give it a moment to start
sleep 2

if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "trace-service started successfully (PID: $NEW_PID)"
    cat "$LOG_FILE"
else
    echo "trace-service failed to start"
    cat "$LOG_FILE"
    exit 1
fi
