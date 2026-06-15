import router from '@adonisjs/core/services/router'
import app from '@adonisjs/core/services/app'
import { readFile } from 'node:fs/promises'

router.get('/', async () => {
  return { status: 'ok', service: 'supply-chain-board' }
})

// Unpoly client (servi depuis node_modules, pas de CDN)
router.get('/vendor/unpoly.js', async ({ response }) => {
  response.header('content-type', 'text/javascript')
  response.header('cache-control', 'public, max-age=86400')
  return await readFile(app.makePath('node_modules/unpoly/unpoly.min.js'), 'utf8')
})
router.get('/vendor/unpoly.css', async ({ response }) => {
  response.header('content-type', 'text/css')
  response.header('cache-control', 'public, max-age=86400')
  return await readFile(app.makePath('node_modules/unpoly/unpoly.min.css'), 'utf8')
})

// Compiled frontend assets (Tailwind CSS + Alpine JS bundles).
// No caching in dev so rebuilds are picked up on a plain reload; 1h in prod.
const assetCache = app.inProduction ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate'
router.get('/css/app.css', async ({ response }) => {
  response.header('content-type', 'text/css')
  response.header('cache-control', assetCache)
  return await readFile(app.makePath('public/css/app.css'), 'utf8')
})
router.get('/js/app.js', async ({ response }) => {
  response.header('content-type', 'text/javascript')
  response.header('cache-control', assetCache)
  return await readFile(app.makePath('public/js/app.js'), 'utf8')
})

// Health
router.get('/health', '#controllers/health_controller.index')

// TEMP: board mock route (no X3 dependency, for frontend testing)
router.get('/board-mock', async ({ view }) => {
  return view.render('pages/board', {
    days: [
      {
        idx: 0,
        iso: '2026-06-16',
        weekday: 'lun.',
        dayNum: '16/06',
        weekNum: 25,
        weekStart: true,
        hours: 8,
      },
      {
        idx: 1,
        iso: '2026-06-17',
        weekday: 'mar.',
        dayNum: '17/06',
        weekNum: 25,
        weekStart: false,
        hours: 6,
      },
      {
        idx: 2,
        iso: '2026-06-18',
        weekday: 'mer.',
        dayNum: '18/06',
        weekNum: 25,
        weekStart: false,
        hours: 0,
      },
    ],
    weeks: [{ num: 25, span: 3 }],
    cols: 3,
    boardDataJson: JSON.stringify({
      days: ['2026-06-16', '2026-06-17', '2026-06-18'],
      cols: 3,
      ofData: {},
    }),
    lines: [],
    backlog: [],
    start: '2026-06-16',
    horizon: 3,
    totalOf: 0,
    backlogCount: 0,
    lineCount: 0,
    x3Error: null,
    cached: null,
  })
})

// Debug X3 models
router.get('/debug/x3', '#controllers/x3_debug_controller.index')

// Planning Board — tableau d'ordonnancement drag & drop (vue HTML)
router.get('/board', '#controllers/planning_board_controller.board')

// Scheduler — vues Material 3 (Stitch)
//   /scheduler/board   : Tableau d'ordonnancement, vue experte haute densité
//   /scheduler/of/:num : Détail OF — panneau Focus Productivité Technique
router.get('/scheduler/board', '#controllers/scheduler_controller.expertBoard')
router.get('/scheduler/of/:num', '#controllers/scheduler_controller.ofDetail')

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
    router.get('/nomenclature/:article', '#controllers/planning_board_controller.nomenclature')
    router.get('/articles-by-component/:component', '#controllers/planning_board_controller.articlesByComponent')
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

// X3 Data (raw SQL debug)
router
  .group(() => {
    router.post('/load', '#controllers/x3_data_controller.load')
  })
  .prefix('/api/v1/data')

// Données statiques (SQLite local, sync depuis X3)
router
  .group(() => {
    router.get('/status', '#controllers/static_sync_controller.status')
    router.post('/sync', '#controllers/static_sync_controller.sync')
  })
  .prefix('/api/v1/static')
