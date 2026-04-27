#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$ROOT_DIR/.dev-logs"
PID_FILE="$LOGS_DIR/.pids"
PORTS=(8000 8001 8010 5173)

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

PYTHON="/c/Users/bledoua/AppData/Local/Python/bin/python.exe"
NPM="/c/Users/bledoua/Downloads/node-v24.14.1-win-x64/node-v24.14.1-win-x64/npm"

find_pid_on_port() {
    local port=$1
    netstat -ano 2>/dev/null | grep ":${port} " | grep LISTENING | awk '{print $5}' | head -1 || true
}

stop_services() {
    echo -e "${RED}▸${NC} Stopping all services..."
    for port in "${PORTS[@]}"; do
        local pid=$(find_pid_on_port "$port")
        if [ -n "$pid" ]; then
            taskkill //PID "$pid" //F 2>/dev/null || kill "$pid" 2>/dev/null || true
            echo "  Port $port → killed ($pid)"
        fi
    done
    rm -f "$PID_FILE"
    echo "Done."
}

# Handle sub-command
case "${1:-}" in
    stop|--stop|-s)
        stop_services
        exit 0
        ;;
    status|--status)
        echo "Service status:"
        for port in "${PORTS[@]}"; do
            pid=$(find_pid_on_port "$port")
            if [ -n "$pid" ]; then
                echo -e "  ${GREEN}●${NC} Port $port → running (PID $pid)"
            else
                echo -e "  ${RED}○${NC} Port $port → stopped"
            fi
        done
        exit 0
        ;;
    restart|--restart)
        stop_services
        echo ""
        exec "$0"
        ;;
esac

cleanup() {
    stop_services
}
trap cleanup EXIT INT TERM

mkdir -p "$LOGS_DIR"

log_file() {
    echo "$LOGS_DIR/$1.log"
}

start_service() {
    local name=$1
    local cmd=$2
    local log=$(log_file "$name")
    echo -e "${GREEN}▸${NC} Starting ${CYAN}$name${NC} → log: $log"
    eval "$cmd" > "$log" 2>&1 &
}

# --- planning-engine (FastAPI :8000) ---
start_service "planning-engine" \
    "cd $ROOT_DIR/apps/planning-engine && $PYTHON -m uvicorn production_planning.api.server:app --reload --port 8000"

# --- suivi-commandes (FastAPI :8001) ---
start_service "suivi-commandes" \
    "cd $ROOT_DIR/apps/suivi-commandes && $PYTHON -m uvicorn api_server:app --reload --port 8001"

# --- integration-hub (FastAPI :8010) ---
start_service "integration-hub" \
    "cd $ROOT_DIR/services/integration-hub && $PYTHON -m uvicorn integration_hub.api:app --reload --port 8010"

# --- board-ui (Vite :5173) ---
start_service "board-ui" \
    "cd $ROOT_DIR/apps/board-ui && $NPM run dev -- --host 127.0.0.1 --port 5173"

# Wait for APIs
echo ""
echo -e "${CYAN}▸${NC} Waiting for APIs to be ready..."
for port in 8000 8001 8010; do
    for i in $(seq 1 15); do
        if curl -sf "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
done

echo ""
echo -e "${GREEN}All services running.${NC} Press Ctrl+C to stop."
echo ""
echo "  planning-engine → http://127.0.0.1:8000"
echo "  suivi-commandes → http://127.0.0.1:8001"
echo "  integration-hub → http://127.0.0.1:8010"
echo "  board-ui        → http://127.0.0.1:5173"
echo ""

wait
