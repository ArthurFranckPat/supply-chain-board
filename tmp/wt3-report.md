# WT3 — Fix/audit validators dashboard

Branche : `fix/audit-validators-dashboard` (depuis `feat/agentic-layer`)

## Correctifs

### H4 — Validator PATCH override planning board
- **Fichier créé** : `app/validators/planning_board.ts` (schéma vine)
  - `status` ∈ {1, 2, 3} via `vine.enum([1,2,3] as const).optional()`
  - `dateDebut`/`dateFin` ISO `^\d{4}-\d{2}-\d{2}$` (aligné sur `ISO_RE` de `order_planning_controller.ts:25`)
  - `workstation` : string trim min 1 max 50
  - `note` : string trim max 2000
- **Controller** : `app/controllers/planning_board_controller.ts` (`update`, lignes 35-58)
  - Remplace `ctx.request.only([...])` par `await ctx.request.validateUsing(planningBoardUpdateValidator)`
  - Ajoute `OF_RE = /^[A-Za-z0-9_-]{1,40}$/` + contrôle du path param `of` (badRequest si invalide)
  - Signature de `OverrideStore.save` inchangée
- **Test mis à jour** : `tests/domain/planning_board_controller.test.ts`
  - Mock : `request.only` → `request.validateUsing` (retourne le body brut)
  - Ajout d'un test `update rejette un numOf d'OF invalide (H4)`

### Dashboard boucle morte (dead-code §2)
- **Route ajoutée** : `start/routes.ts` (lignes 205-215)
  - `PATCH /api/v1/user/dashboard-layout` → `dashboard_layout_controller.update`
  - `.as('user.dashboard_layout.update')`
  - Placée dans le groupe `auth` + `x3Context` existant (couvre `/api/v1/dashboard/*`)
- Le contrôleur existait déjà et était complet : `app/controllers/dashboard_layout_controller.ts` (35 LOC)
  - Utilise `ctx.request.validateUsing(updateDashboardLayoutValidator)` ✓
  - Appelle bien `user.setDashboardLayout(payload)` puis `user.save()` ✓
- Le validator existait déjà : `app/validators/dashboard_layout.ts` (21 LOC)
- **Contrat front/back aligné** : le body envoyé par `inertia/pages/dashboard.tsx:499-508`
  est `{ items: [{id,visible,width}], printOrder: KpiId[] }` → match exact avec le schéma vine.

## Vérifications

- `npm run typecheck` → **OK** (0 erreur)
- Test ciblé `planning_board_controller` : **non exécutable dans le worktree**
  (problème de résolution Adonis des modules compilés `@adonisjs/lucid/build/...`
  depuis un sous-répertoire worktree). Le mock du test a été mis à jour pour
  refléter le nouveau contrat `validateUsing` ; le typecheck confirme la cohérence
  des types. Le test est exécutable depuis le checkout principal après merge.

## Diff court

```
 app/controllers/planning_board_controller.ts   | 30 +++++++++++++++++--------
 start/routes.ts                                | 11 +++++++++
 tests/domain/planning_board_controller.test.ts | 31 +++++++++++++++++---------
 app/validators/planning_board.ts               | 35 +++++++++++++++++++++++++++ (new)
 4 files changed (if on compte le nouveau validator)
```

## Non-couverture respectée
Aucune modification de : `session_store.ts`, `agent_controller.ts`, `agent_service.ts`,
`suggestion_firm_controller.ts`, `x3_data_controller.ts`, `combined_orders_repository.ts`.
`start/routes.ts` : uniquement l'ajout de la route dashboard-layout.

## Commit
À pousser sur `origin fix/audit-validators-dashboard`.
