# Supply Chain Board Monorepo

This repository is a monorepo that hosts independent supply-chain applications and shared integration building blocks.

## Goals

- Keep each app autonomous: codebase, release cadence, tests, dependencies.
- Avoid direct cross-app imports.
- Enable communication through stable APIs and shared contracts.

## Repository layout

```text
apps/
  ordo-core/          # Scheduling, feasibility, S+1 engine (existing project)
  suivi-commandes/    # Order tracking and status logic (existing project)
  board-ui/           # Unified cockpit UI (React + Vite)
packages/
  domain-contracts/   # Shared Pydantic contracts used by services
  integration-sdk/    # HTTP clients for inter-service communication
services/
  integration-hub/    # Orchestration API that combines app capabilities
infra/
  docker-compose.yml  # Local orchestration of APIs
```

## Communication model

- `suivi-commandes` exposes status computation API endpoints.
- `ordo-core` exposes scheduling and S+1 APIs.
- `integration-hub` orchestrates both and returns a consolidated payload for a board UI.

## Local setup

Quick path:

- `.\bootstrap.ps1` installs dependencies and starts the 3 APIs.
- `.\bootstrap.ps1 -StartUi` also installs and starts `board-ui`.

Manual path:

1. Create and activate a Python 3.11+ virtual environment.
2. Install editable shared packages:
   - `pip install -e packages/domain-contracts`
   - `pip install -e packages/integration-sdk`
3. Install app dependencies:
   - `pip install -r apps/ordo-core/requirements.txt`
   - `pip install -r apps/suivi-commandes/requirements.txt`
4. Install integration hub:
   - `pip install -e services/integration-hub`

## Run locally

One command:

- `.\bootstrap.ps1`
- Optional with UI: `.\bootstrap.ps1 -StartUi`

Manual:

- `ordo-core` API:
  - `cd apps/ordo-core`
  - `uvicorn src.api.server:app --reload --port 8000`
- `suivi-commandes` API:
  - `cd apps/suivi-commandes`
  - `uvicorn api_server:app --reload --port 8001`
- `integration-hub` API:
  - `cd services/integration-hub`
  - `uvicorn app.main:app --reload --port 8010`
- `board-ui`:
  - `cd apps/board-ui`
  - `npm install`
  - `npm run dev`

Then call:

- `GET http://127.0.0.1:8010/health`
- `POST http://127.0.0.1:8010/v1/pipeline/supply-board`

## Design rule

No app-to-app direct import. Keep integration inside `services/` and `packages/`.
