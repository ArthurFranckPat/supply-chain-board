# board-ui

React cockpit app for the unified supply-chain board.

## Run

```bash
npm install
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust if needed.

- `VITE_API_BASE_URL`: planning-engine base URL (default `http://127.0.0.1:8000`)
- `VITE_SUIVI_API_BASE_URL`: suivi-commandes base URL (default `http://127.0.0.1:8001`)
- `VITE_EXTRACTIONS_DIR`: optional ERP extractions directory passed to API load endpoints

## Architecture

**Stack:** React + Vite + TypeScript + TailwindCSS + Recharts

### Views

| View | Description |
|------|-------------|
| `PilotageView` | Vue Pilotage : état des APIs, données chargées, lancement de l'ordonnancement |
| `OrdonnancementView` | Vue Ordonnancement : planning, projection de stock, KPIs, heatmap capacité |
| `CapacityView` | Calendar config, capacity per poste, overrides |
| `ActionsView` | Actions appro issues des calculs d'ordonnancement |
| `RapportsView` | Consultation des rapports générés |

### Key Components

**Ordonnancement** (`components/scheduler/`):
- `PlanningTable` — Production schedule grid
- `StockProjection` — Stock evolution chart
- `KpiDashboard` — Key performance indicators
- `CapacityHeatmap` — Load heatmap by poste/week
- `Workqueue` — Work order queue
- `FocusBar` — Focused item details
- `ExpectedComponents` — Component requirements

**Capacity** (`components/capacity/`):
- `MonthGrid` — Monthly calendar with working/off days
- `PosteConfigTable` — Per-poste capacity settings
- `WeeklyCapacityGrid` — Weekly capacity overview

### Hooks

- `useCalendar` — Calendar data fetching and mutation
- `useCapacityConfig` — Capacity configuration management
- `useScheduleRun` — Execution and polling for ordonnancement runs

### Types

- `api.ts` — API request/response interfaces
- `capacity.ts` — Calendar and capacity types
- `scheduler.ts` — Ordonnancement result types

## Data flow

```
board-ui → planning-engine (port 8000, /api/v1)
         → suivi-commandes (port 8001, /api/v1)
```

- `POST /api/v1/runs/schedule` triggers a planning-engine ordonnancement run
- `POST /api/v1/status/from-erp-extractions` loads order tracking status from suivi-commandes
- Ordonnancement runs return KPIs, planning data, and stock projections
- `integration-hub` remains available for service-to-service consolidated pipeline calls
