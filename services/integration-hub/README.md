# integration-hub

Orchestration API that composes:
- production-planning API (scheduling and feasibility)
- suivi-commandes API (order status assignment)

Default ports expected:
- production-planning: `http://127.0.0.1:8000`
- suivi-commandes: `http://127.0.0.1:8001`
- integration-hub: `http://127.0.0.1:8010`

Main endpoints:
- `GET /health`
- `POST /api/v1/pipeline/suivi-status`
- `POST /api/v1/pipeline/supply-board`

Run target: `uvicorn integration_hub.api:app --reload --port 8010`.
`app.main:app` remains as a compatibility wrapper.
