# Supply Chain Board Monorepo

This repository is a monorepo that hosts independent supply-chain applications and shared integration building blocks.

## Goals

- Keep each app autonomous: codebase, release cadence, tests, dependencies.
- Avoid direct cross-app imports.
- Enable communication through stable APIs and shared contracts.

## Repository layout

```text
apps/
  planning-engine/     # Scheduling engine app shell (Python + FastAPI)
    production_planning/
      models/         # BesoinClient, OF, Article, Stock, etc.
      loaders/        # CSV loading from ERP extractions
      orders/         # Matching, allocation, forecast consumption
      feasibility/    # Feasibility verification and analyses
      planning/       # Calendar, capacity, holidays, weights, charge calculations
      scheduling/     # Scheduling engine, line scheduling, reporting
      api/            # FastAPI server (port 8000)
    config/           # calendar.json, capacity.json, holidays, weights
  suivi-commandes/    # Order tracking and status logic
  board-ui/           # Unified cockpit UI (React + Vite + TypeScript)
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
- `planning-engine` exposes versioned scheduling, feasibility, calendar and capacity APIs under `/api/v1`.
- `suivi-commandes` exposes versioned order-status APIs under `/api/v1`.
- `integration-hub` orchestrates both APIs and returns consolidated pipeline payloads under `/api/v1`.

## Planning-engine data source

`planning-engine` reads ERP CSV extractions from a centralized folder configured via:

```
ORDO_EXTRACTIONS_DIR=/path/to/extractions
```

Expected files: `Articles.csv`, `Gammes.csv`, `Nomenclatures.csv`, `Besoins Clients.csv`, `Ordres de fabrication.csv`, `Stocks.csv`, `Commandes Achats.csv`, `Allocations.csv`

See `apps/planning-engine/CLAUDE.md` for full column-level documentation.

## Development workflow (solo)

Before every push, lint and tests are checked automatically via a `pre-push` git hook. If either fails, the push is blocked until you fix the issues.

```bash
# Install the hooks once
./scripts/install-hooks.sh

# Or manually copy the hook
cp scripts/githooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

What the hook runs:
```bash
cd apps/planning-engine
python -m ruff check production_planning/
python -m pytest tests/ -q
```

You can bypass the hook in emergencies with `git push --no-verify`, but prefer fixing the root cause.

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
   - `pip install -r apps/planning-engine/requirements.txt`
   - `pip install -r apps/suivi-commandes/requirements.txt`
4. Install integration hub:
   - `pip install -e services/integration-hub`

## Run locally

One command:

- `.\bootstrap.ps1`
- Optional with UI: `.\bootstrap.ps1 -StartUi`

Manual:

- `planning-engine` API:
  - `cd apps/planning-engine`
  - `uvicorn production_planning.api.server:app --reload --port 8000`
- `suivi-commandes` API:
  - `cd apps/suivi-commandes`
  - `pip install -r requirements.txt`
  - `uvicorn suivi_commandes.api:app --reload --port 8001`
- `integration-hub` API:
  - `cd services/integration-hub`
  - `uvicorn app.main:app --reload --port 8010`
- `board-ui`:
  - `cd apps/board-ui`
  - `npm install`
  - `npm run dev`

Then call:

- `GET http://127.0.0.1:8010/health`
- `POST http://127.0.0.1:8010/api/v1/pipeline/supply-board`

## Design rule

No app-to-app direct import. Keep integration inside `services/` and `packages/`.

## CI/CD

GitHub Actions workflows are defined under `.github/workflows`:

- `ci.yml`:
  - Trigger: `pull_request` + pushes on `main`, `refactor/**`, `feature/**`
  - Runs `ruff` and Python tests for:
    - `apps/planning-engine/tests`
    - `apps/suivi-commandes/tests`
    - `services/integration-hub/tests`
  - Builds frontend: `npm --prefix apps/board-ui run build`

- `cd.yml`:
  - Trigger: push on `main`, tags `v*`, and manual `workflow_dispatch`
  - Runs a quality gate (`ruff` + Python tests) before packaging
  - Builds release artifacts:
    - Python sdists/wheels for shared packages, apps, and services
    - `board-ui` static bundle archive
  - On tag `v*`, publishes a GitHub Release with generated notes and attached artifacts.
