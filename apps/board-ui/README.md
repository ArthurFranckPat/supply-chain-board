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

## Architecture

**Stack:** React + Vite + TypeScript + TailwindCSS + Recharts

### Views

| View | Description |
|------|-------------|
| `HomeView` | Control panel: load data, run scheduler |
| `SchedulerView` | Planning table, stock projection, KPIs, capacity heatmap |
| `CapacityView` | Calendar config, capacity per poste, overrides |
| `ActionsView` | Action reports from scheduler runs |
| `ReportsView` | Download/view generated reports |

### Key Components

**Scheduler** (`components/scheduler/`):
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
- `useScheduleRun` — Scheduler execution and polling

### Types

- `api.ts` — API request/response interfaces
- `capacity.ts` — Calendar and capacity types
- `scheduler.ts` — Scheduler result types

## Data flow

```
board-ui → integration-hub (port 8010) → ordo-core (port 8000)
                                      → suivi-commandes (port 8001)
```

- `POST /v1/pipeline/supply-board` triggers the full pipeline
- Scheduler runs return KPIs, planning data, and stock projections
- Calendar and capacity endpoints are called directly on ordo-core
