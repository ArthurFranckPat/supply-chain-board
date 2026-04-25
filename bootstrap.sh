#!/usr/bin/env bash
# bootstrap.sh — Start all supply-chain-board services (macOS / Linux)
#
# Usage:
#   ./bootstrap.sh              # Install deps + start APIs
#   ./bootstrap.sh --install    # Install only
#   ./bootstrap.sh --start      # Start only (skip install)
#   ./bootstrap.sh --ui         # Also start board-ui
#   ./bootstrap.sh --stop       # Stop all running services

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$REPO_ROOT/.venv"
PYTHON="$VENV/bin/python"
EXTRACTIONS_DIR="${ORDO_EXTRACTIONS_DIR:-$HOME/Library/CloudStorage/OneDrive-AldesAeraulique/Donn\u00e9es/Extractions}"

# Colors
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "${CYAN}[bootstrap]${NC} $*"; }
ok()    { echo -e "${GREEN}$*${NC}"; }
warn()  { echo -e "${YELLOW}$*${NC}"; }

# ── Parse args ────────────────────────────────────────────────────
ACTION="all"
START_UI=false
for arg in "$@"; do
  case "$arg" in
    --install) ACTION="install" ;;
    --start)   ACTION="start" ;;
    --ui)      START_UI=true ;;
    --stop)    ACTION="stop" ;;
    -h|--help)
      echo "Usage: $0 [--install|--start|--stop|--ui]"
      exit 0 ;;
  esac
done

# ── Stop ──────────────────────────────────────────────────────────
if [ "$ACTION" = "stop" ]; then
  step "Stopping all services..."
  pkill -f "uvicorn planning_engine.api.server:app" 2>/dev/null || true
  pkill -f "uvicorn api_server:app" 2>/dev/null || true
  pkill -f "uvicorn app.main:app" 2>/dev/null || true
  pkill -f "uvicorn integration_hub.api:app" 2>/dev/null || true
  pkill -f "vite.*board-ui" 2>/dev/null || true
  ok "All services stopped."
  exit 0
fi

# ── Install ───────────────────────────────────────────────────────
if [ "$ACTION" = "all" ] || [ "$ACTION" = "install" ]; then
  if [ ! -f "$PYTHON" ]; then
    step "Creating virtual environment (.venv)..."
    python3 -m venv "$VENV"
  fi

  step "Upgrading pip..."
  "$PYTHON" -m pip install --upgrade pip -q

  step "Installing shared packages..."
  "$PYTHON" -m pip install -e "$REPO_ROOT/packages/domain-contracts" -q 2>/dev/null || true
  "$PYTHON" -m pip install -e "$REPO_ROOT/packages/integration-sdk" -q 2>/dev/null || true
  "$PYTHON" -m pip install -e "$REPO_ROOT/packages/erp-data-access" -q 2>/dev/null || true

  step "Installing app dependencies..."
  "$PYTHON" -m pip install -r "$REPO_ROOT/apps/planning-engine/requirements.txt" -q 2>/dev/null || true
  "$PYTHON" -m pip install -r "$REPO_ROOT/apps/suivi-commandes/requirements.txt" -q 2>/dev/null || true

  step "Installing integration-hub..."
  "$PYTHON" -m pip install -e "$REPO_ROOT/services/integration-hub" -q 2>/dev/null || true

  if [ "$START_UI" = true ]; then
    if command -v npm &>/dev/null; then
      step "Installing board-ui dependencies..."
      (cd "$REPO_ROOT/apps/board-ui" && npm install)
    else
      warn "npm not found. board-ui dependencies not installed."
    fi
  fi

  if [ "$ACTION" = "install" ]; then
    ok "Install completed."
    exit 0
  fi
fi

# ── Start ─────────────────────────────────────────────────────────
if [ ! -f "$PYTHON" ]; then
  echo -e "${RED}Virtual environment not found. Run $0 first.${NC}"
  exit 1
fi

export ORDO_EXTRACTIONS_DIR="$EXTRACTIONS_DIR"

# Function to start a service in background and echo PID
start_service() {
  local name="$1" port="$2" dir="$3" module="$4"
  step "Starting $name on http://127.0.0.1:$port"
  (cd "$REPO_ROOT/$dir" && "$PYTHON" -m uvicorn "$module" --host 127.0.0.1 --port "$port" --reload &>/tmp/"$(basename "$dir").log") &
  echo "$!" > "/tmp/supplychain-$(echo "$name" | tr ' ' '-').pid"
}

start_service "planning-engine" 8000 "apps/planning-engine" "planning_engine.api.server:app"
start_service "suivi-commandes" 8001 "apps/suivi-commandes" "api_server:app"
start_service "integration-hub" 8010 "services/integration-hub" "integration_hub.api:app"

if [ "$START_UI" = true ]; then
  if command -v npm &>/dev/null; then
    step "Starting board-ui on http://127.0.0.1:5173"
    (cd "$REPO_ROOT/apps/board-ui" && npm run dev -- --host 127.0.0.1 --port 5173 &>/tmp/board-ui.log) &
    echo "$!" > /tmp/supplychain-board-ui.pid
  fi
fi

# Wait for APIs to be ready
step "Waiting for APIs to be ready..."
for port in 8000 8001; do
  for i in $(seq 1 15); do
    if curl -sf "http://127.0.0.1:$port/health" &>/dev/null; then
      break
    fi
    sleep 1
  done
done

echo ""
ok "Services started:"
ok "  planning-engine API: http://127.0.0.1:8000"
ok "  suivi-commandes API:  http://127.0.0.1:8001"
ok "  integration-hub API:  http://127.0.0.1:8010"
if [ "$START_UI" = true ]; then
  ok "  board-ui:             http://127.0.0.1:5173"
fi
echo ""
echo "Logs: tail -f /tmp/planning-engine.log /tmp/suivi-commandes.log /tmp/integration-hub.log"
echo "Stop:  $0 --stop"
