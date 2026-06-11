# Supply Chain Board — Port TypeScript/AdonisJS

## What This Is

Port du backend Python (FastAPI) vers TypeScript avec AdonisJS.
Architecture repensée autour du modèle **Flow** (supply/demand) au lieu des 9 dataclasses Python.
Les algos génétiques et d'ordonnancement sont **exclus** du scope.

## Scope

- Backend uniquement (frontend redesigné par Claude Code sur `feat/redesign-aldes-ui`)
- Branche : `refactor/typescript-adonis`
- TDD obligatoire

## Architecture

- **Framework** : AdonisJS 7 (API-only, port 3333)
- **DB locale** : SQLite via Lucid ORM (overrides, settings)
- **DB ERP** : X3 Oracle via SOAP/SQL (`x3-graphql-node`, pas de GraphQL)
- **Modèle central** : `Flow` — tout est un flux (stock, réception, OF, commande, besoin composant)
- **Pas de** : algos génétiques, ordonnancement, optimisation

## Progress

### Phase 1 — Domain Models
- [x] `Flow` (supply/demand, helpers: isSupply, netQuantity, sortByDate)
- [x] `Article`, `Nomenclature`, `Gamme`, `Charge`, `Planning`

### Phase 2 — Domain Core
- [x] `rules.ts` — isFirm, isPurchaseArticle, isComponentTreatedAsPurchase, demandPriorityKey
- [x] `availability.ts` — currentStock, availableAt, shortageAt, firstCoverageDate, allocateFromSupply, snapshot
- [x] `orders.ts` — matchOrder (MTS hard-pegging + NOR/MTO cumulative), matchOrders with virtual consumption
- [x] `feasibility.ts` — checkFeasibility (recursive BOM, circular ref protection)
- [x] `suivi.ts` — assignStatuses (A_EXPEDIER, ALLOCATION_A_FAIRE, RETARD_PROD, RAS)
- [x] `planning.ts` — calendar utils (nextWorkday, isHoliday, generateWorkdays, chargeByWorkstation)

### Phase 3 — Planning Board Domain
- [x] `planning_board.ts` — mergeOfWithOverride, buildEffectiveFlows
- [x] Tests : 5 tests (merge + effective flows with date window)

### Phase 4 — Data Layer
- [x] `X3Queryable` interface + `X3Adapter` (wraps x3-graphql-node SOAP/SQL)
- [x] Repositories : OF, Stock, Reception, BesoinClient (SQL queries, mockés en tests)

### Phase 5 — Override Store (SQLite)
- [x] Migration `of_overrides` (Lucid)
- [x] Modèle `OfOverride` (Lucid ORM)
- [x] Service `OverrideStore` — save, get, getAll, delete, deleteAll
- [x] Tests : 7 tests CRUD

### Phase 6 — Controllers (stubs)
- [x] Routes définies dans `start/routes.ts`
- [x] 5 controllers stubs (planning_board, suivi, pipeline, health, x3_data)
- [ ] **Controllers réels** — appeler le domaine + repositories + override store
  - [ ] `planning_board_controller` — CRUD overrides, feasibility, whatif, order impacts, events
  - [ ] `suivi_controller` — assignStatuses via flows X3
  - [ ] `pipeline_controller` — agrège supply board + suivi
  - [ ] `x3_data_controller` — proxy SQL vers X3
  - [ ] `health_controller` — quasi OK déjà

### Phase 7 — Tests Fonctionnels
- [ ] Tests HTTP (Japa API client) pour chaque controller
- [ ] Test d'intégration bout en bout (mock X3 → domain → API response)

### Phase 8 — Wiring & Cleanup
- [ ] Brancher X3Adapter dans le container IoC AdonisJS
- [ ] Nettoyer les doublons `X3Queryable` (centraliser dans `x3_connection.ts`)
- [ ] Variables d'environnement X3 (.env)
- [ ] README mise à jour

## Test Count

**66 tests passing** (domain + repositories + override store + planning board)

## File Layout

```
api/
  app/domain/models/       # Flow, Article, Nomenclature, Gamme, Charge, Planning
  app/domain/              # rules, availability, orders, feasibility, suivi, planning, planning_board
  app/repositories/        # of_repository, stock_repository, reception_repository, besoin_client_repository, x3_connection
  app/models/              # of_override (Lucid)
  app/services/            # override_store
  app/controllers/         # stubs → à implémenter
  config/x3.ts             # X3 env config
  database/migrations/     # of_overrides
  tests/domain/            # flow, availability, orders, feasibility, suivi, repositories, planning, planning_board, override_store
```
