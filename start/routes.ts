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
    router
      .get('/', async ({ inertia }) => {
        return inertia.render('home', { message: 'Infra SolidJS + Inertia opérationnelle.' })
      })
      .as('home')

    // Design system « Papier » — showcase des vrais composants ui/* thémés.
    router
      .get('/design-system', async ({ inertia }) => {
        return inertia.render('design_system', {})
      })
      .as('design_system')

    // Pages Inertia (HTML, sans param de path) — URLs françaises (app pour public FR).
    // Les endpoints JSON associés vivent sous /api/v1/planning (P3, #18).
    //   /ordonnancement : board OF, vue experte haute densité
    //   /planification  : lignes de commande ouvertes (#10)
    //   /ruptures       : suivi des ruptures (issue #15)
    //   /vision         : vue unifiée OF ↔ commandes (issue #21)
    router.get('/ordonnancement', '#controllers/scheduler_controller.expertBoard')
    router.get('/planification', '#controllers/order_planning_controller.board')
    router.get('/ruptures', '#controllers/scheduler_controller.shortageTracker')
    router.get('/suivi', '#controllers/suivi_controller.board')
    router.get('/vision', '#controllers/scheduler_controller.vision')

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
    router
      .group(() => {
        router.get('/ofs', '#controllers/planning_board_controller.index')
        router.get('/ofs/:of', '#controllers/planning_board_controller.show')
        router.patch('/ofs/:of', '#controllers/planning_board_controller.update')
        router.delete('/ofs/:of/override', '#controllers/planning_board_controller.resetOverride')
        router.get('/overrides', '#controllers/planning_board_controller.listOverrides')
        router.delete('/overrides', '#controllers/planning_board_controller.resetAll')
        router.post('/feasibility', '#controllers/planning_board_controller.feasibility')
        router.post('/whatif', '#controllers/planning_board_controller.whatif')
        router.post('/order-impacts', '#controllers/planning_board_controller.orderImpacts')
        router.get('/events', '#controllers/planning_board_controller.listEvents')
        router.post('/board-feasibility', '#controllers/planning_board_controller.boardFeasibility')
        router.get('/shortages', '#controllers/planning_board_controller.shortages')
        router.get('/nomenclature/:article', '#controllers/planning_board_controller.nomenclature')
        router.get(
          '/articles-by-component/:component',
          '#controllers/planning_board_controller.articlesByComponent'
        )
        router.get('/search/poste', '#controllers/planning_board_controller.searchPoste')
        router.get('/search/of', '#controllers/planning_board_controller.searchOf')
        router.get('/search/pf', '#controllers/planning_board_controller.searchPf')
        router.get('/of-materials/:of', '#controllers/planning_board_controller.ofMaterials')
        router.post('/reload', '#controllers/planning_board_controller.reloadData')
      })
      .prefix('/api/v1/planning')

    // Endpoints JSON relocalisés depuis /scheduler (P3, #18) : du JSON, pas des pages Inertia.
    router.get('/api/v1/planning/ofs/:of/detail', '#controllers/scheduler_controller.ofDetail')
    router.get('/api/v1/planning/shortages/rows', '#controllers/scheduler_controller.shortageRows')

    // Suivi Commandes
    router
      .group(() => {
        router.post('/assign', '#controllers/suivi_controller.assign')
        router.post('/from-latest-export', '#controllers/suivi_controller.fromLatestExport')
        router.get('/status/:order', '#controllers/suivi_controller.statusDetail')
        router.post('/palette', '#controllers/suivi_controller.palette')
        router.post('/retard-charge', '#controllers/suivi_controller.retardCharge')
        router.get('/rows', '#controllers/suivi_controller.rows')
        router.get('/proactive-rows', '#controllers/suivi_controller.proactiveRows')
      })
      .prefix('/api/v1/status')

    // Pipeline (remplace integration-hub)
    router
      .group(() => {
        router.post('/supply-board', '#controllers/pipeline_controller.supplyBoard')
        router.post('/suivi-status', '#controllers/pipeline_controller.suiviStatus')
      })
      .prefix('/api/v1/pipeline')

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
  })
  .use([middleware.auth(), middleware.x3Context()])
