# board-ui

React cockpit app for the unified supply-chain board.

## Run

```bash
npm install
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust if needed.

- `VITE_HUB_URL`: integration-hub base URL (default `http://127.0.0.1:8010`)

## Current scope

- Trigger `POST /v1/pipeline/supply-board`
- Display consolidated summary KPIs
- Show status distribution from suivi-commandes
- Show Ordo run summary payload
