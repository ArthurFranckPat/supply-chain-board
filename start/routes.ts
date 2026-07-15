import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'
import { readFile } from 'node:fs/promises'
import { middleware } from '#start/kernel'

/*
|--------------------------------------------------------------------------
| Routes publiques (sans authentification)
|--------------------------------------------------------------------------
*/

// Auth (issue #13) — login natif validé par healthcheck X3, sélecteur d'env.
router.get('/login', '#controllers/auth_controller.show').use(middleware.guest()).as('auth.login')
router
  .post('/login', '#controllers/auth_controller.login')
  .use(middleware.guest())
  .as('auth.attempt')
router
  .post('/logout', '#controllers/auth_controller.logout')
  .use(middleware.auth())
  .as('auth.logout')

// Compiled frontend assets (Tailwind CSS + Alpine JS bundles).
// No caching in dev so rebuilds are picked up on a plain reload; 1h in prod.
const assetCache = app.inProduction ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate'
router
  .get('/css/app.css', async ({ response }) => {
    response.header('content-type', 'text/css')
    response.header('cache-control', assetCache)
    return await readFile(app.makePath('public/css/app.css'), 'utf8')
  })
  .as('assets.css')
router
  .get('/js/app.js', async ({ response }) => {
    response.header('content-type', 'text/javascript')
    response.header('cache-control', assetCache)
    return await readFile(app.makePath('public/js/app.js'), 'utf8')
  })
  .as('assets.js')

// Health (sonde infra, pas d'auth)
router.get('/health', '#controllers/health_controller.index')

/*
|--------------------------------------------------------------------------
| Routes protégées (issue #13)
|--------------------------------------------------------------------------
| `auth` exige une session valide ; `x3Context` pose les identifiants X3 de
| l'utilisateur sur le HttpContext pour scoper toutes les connexions X3.
*/
router
  .group(() => {
    // Tableau — page d'accueil par défaut (landing post-login, issue #26).
    // KPI #1 « charge en retard » (issue #38) ; coquille instantanée + fetch différé.
    router.get('/', '#controllers/dashboard_controller.index').as('dashboard')

    // Design system « Papier » — showcase des vrais composants ui/* thémés.
    router
      .get('/design-system', async ({ inertia }) => {
        return inertia.render('design_system', {})
      })
      .as('design_system')

    // Diagnostic récursif (issue #25) — page de TEST provisoire pour valider
    // l'endpoint /api/v1/planning/of-materials/:of/diagnostic avant intégration
    // au design. À retirer une fois intégré dans le panneau de détail OF.
    router
      .get('/diagnostic-test', async ({ inertia }) => {
        return inertia.render('diagnostic-test', {})
      })
      .as('diagnostic_test')

    // Write-back X3 (issue #29) — terrain de test read/save/modify sur objets
    // publiés du stub CAdxWebServiceXmlCC. Cible TEST (login env=test). À
    // verrouiller/retirer une fois le write-back fiabilisé.
    router
      .get('/writeback-test', async ({ inertia }) => {
        return inertia.render('writeback-test', {})
      })
      .as('x3_writeback_test')

    // Pages Inertia (HTML, sans param de path) — URLs françaises (app pour public FR).
    // Les endpoints JSON associés vivent sous /api/v1/planning (P3, #18).
    //   /ordonnancement : board OF, vue experte haute densité
    //   /planification  : lignes de commande ouvertes (#10)
    //   /ruptures       : suivi des ruptures (issue #15)
    //   /vision         : vue unifiée OF ↔ commandes (issue #21)
    router
      .get('/ordonnancement', ({ response }) => response.redirect('/programme'))
      .as('scheduling')
    router
      .get('/planification', ({ response }) => response.redirect('/programme?mode=planification'))
      .as('planning')
    router.get('/ruptures', '#controllers/scheduler_controller.shortageTracker')
    router.get('/suivi', '#controllers/suivi_controller.board')
    router.get('/programme', '#controllers/scheduler_controller.programme')
    router
      .get('/programme/scenarios/comparer', '#controllers/scenario_controller.comparePage')
      .as('scenarios.compare')
    router.get('/charge', '#controllers/load_controller.index')
    router.get('/expeditions', '#controllers/expeditions_controller.index')
    router.get('/receptions', '#controllers/receptions_controller.index').as('receptions.index')
    router
      .get('/conditionnements', '#controllers/conditionnements_controller.index')
      .as('conditionnements.index')
    router.get('/configuration/calendrier', '#controllers/calendar_config_controller.index')

    // Configuration calendrier usine — API JSON (issue #37).
    router
      .group(() => {
        router.post('/holidays/toggle', '#controllers/calendar_config_controller.toggleHoliday')
        router.post('/closures', '#controllers/calendar_config_controller.createClosure')
        router.patch('/closures/:id', '#controllers/calendar_config_controller.updateClosure')
        router.delete('/closures/:id', '#controllers/calendar_config_controller.deleteClosure')
      })
      .prefix('/api/v1/config')

    // Planning — API JSON (fusion order-planning + planning-board sous un seul préfixe, #18 P7).
    //   order-lines/* : OrderPlanningController (overrides de date sur lignes de commande)
    router
      .group(() => {
        router.get('/order-lines', '#controllers/order_planning_controller.index')
        router.get('/order-lines/:order/:line', '#controllers/order_planning_controller.lineDetail')
        router.patch('/order-lines/:order/:line', '#controllers/order_planning_controller.update')
        router.delete(
          '/order-lines/:order/:line/override',
          '#controllers/order_planning_controller.resetOverride'
        )
      })
      .prefix('/api/v1/planning')

    //   ofs/overrides/feasibility/... : PlanningBoardController
    //   Endpoints legacy (index/show/whatif/orderImpacts/shortages/events/overrides/
    //   feasibility/nomenclature/reload/resetOverride) supprimés : non appelés par le front
    //   (board unifié sur /programme). Conservés : update, board-feasibility, search/*,
    //   articles-by-component, of-materials/diagnostic, firm.
    router
      .group(() => {
        router.patch('/ofs/:of', '#controllers/planning_board_controller.update')
        router.post('/board-feasibility', '#controllers/planning_board_controller.boardFeasibility')
        router.get(
          '/articles-by-component/:component',
          '#controllers/planning_board_controller.articlesByComponent'
        )
        router.get('/search/poste', '#controllers/planning_board_controller.searchPoste')
        router.get('/search/of', '#controllers/planning_board_controller.searchOf')
        router.get('/search/pf', '#controllers/planning_board_controller.searchPf')
        router.get(
          '/of-materials/:of/diagnostic',
          '#controllers/planning_board_controller.ofMaterialsDiagnostic'
        )
        // Affermissement d'un ordre en OF ferme (write-back X3, #31).
        // suggestions/:sugNum = suggestion CBN (SGAE…) ; orders/:orderNum = OF planifié (F…).
        router
          .post('/suggestions/:sugNum/firm', '#controllers/suggestion_firm_controller.firm')
          .as('planning.suggestion_firm')
        router
          .post('/orders/:orderNum/firm', '#controllers/suggestion_firm_controller.firm')
          .as('planning.order_firm')

        // Scénarios de plan (issue #57, vision étage 3) : persistance des mutations
        // + diff sur données fraîches (moteur étage 2). L'application (rejeu en PATCHs
        // réels) reste côté client via update/order_planning.update, puis statut=applique.
        router.get('/scenarios', '#controllers/scenario_controller.index').as('scenarios.index')
        router.post('/scenarios', '#controllers/scenario_controller.store_').as('scenarios.store')
        router.post('/scenarios/diff', '#controllers/scenario_controller.diff').as('scenarios.diff')
        router.get('/scenarios/:id', '#controllers/scenario_controller.show').as('scenarios.show')
        router
          .patch('/scenarios/:id', '#controllers/scenario_controller.update')
          .as('scenarios.update')
        router
          .delete('/scenarios/:id', '#controllers/scenario_controller.destroy')
          .as('scenarios.destroy')
      })
      .prefix('/api/v1/planning')

    // Endpoints JSON relocalisés depuis /scheduler (P3, #18) : du JSON, pas des pages Inertia.
    router.get('/api/v1/planning/ofs/:of/detail', '#controllers/scheduler_controller.ofDetail')
    // Engagement par poste (#46) : tous les OF fermes du poste + commandes liées.
    router.get(
      '/api/v1/planning/postes/:poste/engagement',
      '#controllers/scheduler_controller.posteEngagement'
    )
    router.get('/api/v1/planning/shortages/rows', '#controllers/scheduler_controller.shortageRows')

    // Suivi Commandes
    router
      .group(() => {
        router.post('/assign', '#controllers/suivi_controller.assign')
        router.post('/from-latest-export', '#controllers/suivi_controller.fromLatestExport')
        router.post('/palette', '#controllers/suivi_controller.palette')
        router.post('/retard-charge', '#controllers/suivi_controller.retardCharge')
        router.get('/rows', '#controllers/suivi_controller.rows')
        router.get('/proactive-rows', '#controllers/suivi_controller.proactiveRows')
      })
      .prefix('/api/v1/status')

    // Tableau de bord — KPI (issue #38), calcul lourd différé.
    router.get('/api/v1/dashboard/kpis', '#controllers/dashboard_controller.kpis')
    router.get('/api/v1/dashboard/otd', '#controllers/dashboard_controller.otd')
    router.get('/api/v1/dashboard/stock', '#controllers/dashboard_controller.stockValuation')

    // Expéditions (issue #44) — onglet dédié, calcul lourd différé.
    router.get('/api/v1/expeditions/rows', '#controllers/expeditions_controller.rows')

    // Réceptions fournisseurs — planning réceptions attendues + charge palettes par jour.
    router
      .get('/api/v1/receptions/rows', '#controllers/receptions_controller.rows')
      .as('receptions.rows')

    // Conditionnements — identification des coefs manquants + estimation (STOCK/STOJOU).
    router
      .get('/api/v1/conditionnements/rows', '#controllers/conditionnements_controller.rows')
      .as('conditionnements.rows')
    router
      .get(
        '/api/v1/conditionnements/estimations',
        '#controllers/conditionnements_controller.estimations'
      )
      .as('conditionnements.estimations')

    // CTP — Capable-to-Promise : date au plus tôt (PRD §6.2, lot 2).
    router
      .get('/api/v1/promesse', '#controllers/promise_controller.index')
      .as('promesse.index')

    // X3 Data (raw SQL debug) — `.as('data.load')` pour éviter le nom auto
    // `x_3_data.load` généré depuis X3DataController (issue #18).
    router
      .group(() => {
        router.post('/load', '#controllers/x3_data_controller.load').as('data.load')
      })
      .prefix('/api/v1/data')

    // Données statiques (SQLite local, sync depuis X3)
    router
      .group(() => {
        router.get('/status', '#controllers/static_sync_controller.status')
        router.post('/sync', '#controllers/static_sync_controller.sync')
      })
      .prefix('/api/v1/static')

    // Write-back X3 (issue #29) — CRUD objet CAdxWebServiceXmlCC (terrain de test).
    router
      .group(() => {
        router
          .get('/describe', '#controllers/x3_writeback_controller.describe')
          .as('x3_writeback.describe')
        router.get('/read', '#controllers/x3_writeback_controller.read').as('x3_writeback.read')
        router.post('/save', '#controllers/x3_writeback_controller.save').as('x3_writeback.save')
        router
          .post('/modify', '#controllers/x3_writeback_controller.modify')
          .as('x3_writeback.modify')
        router
          .get('/delete', '#controllers/x3_writeback_controller.delete')
          .as('x3_writeback.delete')
        router.get('/list', '#controllers/x3_writeback_controller.list').as('x3_writeback.list')
        router
          .post('/run', '#controllers/x3_writeback_controller.runSubprog')
          .as('x3_writeback.run')
      })
      .prefix('/api/v1/x3/writeback')

    // Baseline perf (issue #33) — P50/P95 par route, collectés par timing_middleware.
    router.get('/api/v1/_perf', '#controllers/perf_controller.index').as('perf.index')
  })
  .use([middleware.auth(), middleware.x3Context()])
