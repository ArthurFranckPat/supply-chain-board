#!/usr/bin/env bash
# Lance les 2 APIs + le frontend en une commande. Ctrl-C arrête tout.
set -e
cd "$(dirname "$0")/.."

trap 'kill 0' EXIT INT TERM

(cd apps/planning-engine && python -m uvicorn production_planning.api.server:app --port 8000 --reload) &
(cd apps/suivi-commandes && python -m uvicorn suivi_commandes.api:app --port 8001 --reload) &
(cd apps/board-ui && npm run dev) &

wait
