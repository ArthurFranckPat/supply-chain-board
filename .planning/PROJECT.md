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

### Phase 6 — Controllers
- [x] Routes définies dans `start/routes.ts`
- [x] 5 controllers implementes
  - [x] `planning_board_controller` — CRUD overrides, feasibility, whatif, order impacts, events
  - [x] `suivi_controller` — assignStatuses via flows X3, fromLatestExport, statusDetail, palette, retardCharge
  - [x] `pipeline_controller` — agrège supply board + suivi
  - [x] `x3_data_controller` — proxy SQL vers X3
  - [x] `health_controller` — quasi OK déjà

### Phase 7 — Tests Fonctionnels
- [x] Tests HTTP (Japa API client) pour chaque controller
- [x] Test d'intégration bout en bout (health, overrides CRUD, suivi assign, x3_data)
- [x] Bodyparser middleware configuré dans start/kernel.ts
- [x] Bootstrap fonctionnel avec httpServer().start() via configureSuite

### Phase 8 — Wiring & Cleanup
- [x] Brancher X3Adapter dans le container IoC AdonisJS (singleton via `x3_provider.ts`)
- [x] Nettoyer les doublons `X3Queryable` (centraliser dans `x3_connection.ts`)
- [x] Variables d'environnement X3 (.env, .env.test, .env.example, start/env.ts)
- [x] Controllers refactorisés pour utiliser IoC (`ctx.containerResolver.make('x3')`)
- [ ] README mise à jour

## Test Count

**88 tests passing** (78 unit + 10 functional HTTP)

## File Layout

```
api/
  app/domain/models/       # Flow, Article, Nomenclature, Gamme, Charge, Planning
  app/domain/              # rules, availability, orders, feasibility, suivi, planning, planning_board
  app/repositories/        # of_repository, stock_repository, reception_repository, besoin_client_repository, x3_connection
  app/models/              # of_override (Lucid)
  app/services/            # override_store
  app/controllers/         # tous implémentés, injection IoC
  app/services/            # override_store
  providers/               # api_provider, x3_provider (singleton X3)
  database/migrations/     # of_overrides
  tests/domain/            # flow, availability, orders, feasibility, suivi, repositories, planning, planning_board, override_store
```
