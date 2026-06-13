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

// Health
router.get('/health', '#controllers/health_controller.index')

// Debug X3 models
router.get('/debug/x3', '#controllers/x3_debug_controller.index')

// Planning Board — tableau d'ordonnancement drag & drop (vue HTML)
router.get('/board', '#controllers/planning_board_controller.board')

// Planning Board (API JSON)
router.group(() => {
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
}).prefix('/api/v1/planning-board')

// Suivi Commandes
router.group(() => {
  router.post('/assign', '#controllers/suivi_controller.assign')
  router.post('/from-latest-export', '#controllers/suivi_controller.fromLatestExport')
  router.get('/status/:noCommande', '#controllers/suivi_controller.statusDetail')
  router.post('/palette', '#controllers/suivi_controller.palette')
  router.post('/retard-charge', '#controllers/suivi_controller.retardCharge')
}).prefix('/api/v1/status')

// Pipeline (remplace integration-hub)
router.group(() => {
  router.post('/supply-board', '#controllers/pipeline_controller.supplyBoard')
  router.post('/suivi-status', '#controllers/pipeline_controller.suiviStatus')
}).prefix('/api/v1/pipeline')

// X3 Data
router.group(() => {
  router.post('/load', '#controllers/x3_data_controller.load')
}).prefix('/api/v1/data')
