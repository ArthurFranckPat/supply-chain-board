import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'
import { readFile } from 'node:fs/promises'

router.get('/', async ({ inertia }) => {
  return inertia.render('home', { message: 'Infra SolidJS + Inertia opérationnelle.' })
}).as('home')

// Design system « Papier » — showcase des vrais composants ui/* thémés.
router.get('/design-system', async ({ inertia }) => {
  return inertia.render('design_system', {})
}).as('design_system')

// Unpoly client (servi depuis node_modules, pas de CDN)
router.get('/vendor/unpoly.js', async ({ response }) => {
  response.header('content-type', 'text/javascript')
  response.header('cache-control', 'public, max-age=86400')
  return await readFile(app.makePath('node_modules/unpoly/unpoly.min.js'), 'utf8')
}).as('assets.unpoly_js')
router.get('/vendor/unpoly.css', async ({ response }) => {
  response.header('content-type', 'text/css')
  response.header('cache-control', 'public, max-age=86400')
  return await readFile(app.makePath('node_modules/unpoly/unpoly.min.css'), 'utf8')
}).as('assets.unpoly_css')

// Compiled frontend assets (Tailwind CSS + Alpine JS bundles).
// No caching in dev so rebuilds are picked up on a plain reload; 1h in prod.
const assetCache = app.inProduction ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate'
router.get('/css/app.css', async ({ response }) => {
  response.header('content-type', 'text/css')
  response.header('cache-control', assetCache)
  return await readFile(app.makePath('public/css/app.css'), 'utf8')
}).as('assets.css')
router.get('/js/app.js', async ({ response }) => {
  response.header('content-type', 'text/javascript')
  response.header('cache-control', assetCache)
  return await readFile(app.makePath('public/js/app.js'), 'utf8')
}).as('assets.js')

// Health
router.get('/health', '#controllers/health_controller.index')

// Scheduler — vues Material 3 (Stitch)
//   /scheduler/board   : Tableau d'ordonnancement, vue experte haute densité
//   /scheduler/of/:num : Détail OF — panneau Focus Productivité Technique
router.get('/scheduler/board', '#controllers/scheduler_controller.expertBoard')
router.get('/scheduler/of/:num', '#controllers/scheduler_controller.ofDetail')
//   /scheduler/shortages : page Inertia de suivi des ruptures (issue #15)
//   /scheduler/shortages/rows : endpoint JSON différé (calcul lourd) fetché côté client
router.get('/scheduler/shortages', '#controllers/scheduler_controller.shortageTracker')
router.get('/scheduler/shortages/rows', '#controllers/scheduler_controller.shortageRows')
// Issue #10 — mode planification (lignes de commande ouvertes, drag en temps)
router.get('/scheduler/planning-board', '#controllers/order_planning_controller.board')

// Order planning (API JSON) — overrides de date sur lignes de commande
router
  .group(() => {
    router.get('/order-lines', '#controllers/order_planning_controller.index')
    router.get('/lines/:num/:ligne', '#controllers/order_planning_controller.lineDetail')
    router.patch('/order-lines/:num/:ligne', '#controllers/order_planning_controller.update')
    router.delete(
      '/order-lines/:num/:ligne/override',
      '#controllers/order_planning_controller.resetOverride'
    )
  })
  .prefix('/api/v1/order-planning')

// Planning Board (API JSON)
router
  .group(() => {
    router.get('/ofs', '#controllers/planning_board_controller.index')
    router.get('/ofs/:numOf', '#controllers/planning_board_controller.show')
    router.patch('/ofs/:numOf', '#controllers/planning_board_controller.update')
    router.delete('/ofs/:numOf/override', '#controllers/planning_board_controller.resetOverride')
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
    router.get('/of-materials/:numOf', '#controllers/planning_board_controller.ofMaterials')
    router.post('/reload', '#controllers/planning_board_controller.reloadData')
  })
  .prefix('/api/v1/planning-board')

// Suivi Commandes
router
  .group(() => {
    router.post('/assign', '#controllers/suivi_controller.assign')
    router.post('/from-latest-export', '#controllers/suivi_controller.fromLatestExport')
    router.get('/status/:noCommande', '#controllers/suivi_controller.statusDetail')
    router.post('/palette', '#controllers/suivi_controller.palette')
    router.post('/retard-charge', '#controllers/suivi_controller.retardCharge')
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
