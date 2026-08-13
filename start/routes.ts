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

// Favicons — Adonis ne sert pas public/ en statique (pas de @adonisjs/static).
// On expose chaque fichier explicitement, comme pour css/js ci-dessus.
const faviconCache = app.inProduction
  ? 'public, max-age=86400'
  : 'no-cache, no-store, must-revalidate'
for (const [route, file, contentType] of [
  ['/favicon.svg', 'public/favicon.svg', 'image/svg+xml'],
  ['/favicon.ico', 'public/favicon.ico', 'image/x-icon'],
  ['/favicon-32x32.png', 'public/favicon-32x32.png', 'image/png'],
  ['/favicon-16x16.png', 'public/favicon-16x16.png', 'image/png'],
  ['/apple-touch-icon.png', 'public/apple-touch-icon.png', 'image/png'],
  ['/site.webmanifest', 'public/site.webmanifest', 'application/manifest+json'],
] as const) {
  router
    .get(route, async ({ response }) => {
      response.header('content-type', contentType)
      response.header('cache-control', faviconCache)
      return await readFile(app.makePath(file))
    })
    .as(`assets.${route.slice(1).replace(/[^a-z0-9]/gi, '_')}`)
}

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

    // Pages Inertia (HTML, sans param de path) — URLs françaises (app pour public FR).
    // Les endpoints JSON associés vivent sous /api/v1/planning (P3, #18).
    //   /ordonnancement : board OF, vue experte haute densité
    //   /planification  : lignes de commande ouvertes (#10)
    //   /ruptures       : suivi des ruptures (issue #15)
    //   /programme      : vue unifiée OF ↔ commandes (issue #21)
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
    // Séquenceur (#46/#100) : board /programme en table, filtre poste côté client.
    router.get('/sequenceur', '#controllers/scheduler_controller.sequenceur').as('sequenceur.index')
    router.get('/charge', '#controllers/load_controller.index')
    router.get('/configuration/calendrier', '#controllers/calendar_config_controller.index')
    router
      .get('/configuration/impressions', '#controllers/print_config_controller.index')
      .as('print_config.index')
    router.get('/impressions', '#controllers/print_journal_controller.index').as('print_journal')

    // Configuration calendrier usine — API JSON (issue #37).
    router
      .group(() => {
        router.post('/holidays/toggle', '#controllers/calendar_config_controller.toggleHoliday')
        router.post('/closures', '#controllers/calendar_config_controller.createClosure')
        router.patch('/closures/:id', '#controllers/calendar_config_controller.updateClosure')
        router.delete('/closures/:id', '#controllers/calendar_config_controller.deleteClosure')

        // Routage d'impression du dossier d'OF (issue #85, lot 2).
        router.get('/print/destinations', '#controllers/print_config_controller.destinations')
        router.post('/print/settings', '#controllers/print_config_controller.updateSettings')
        router.post('/print/rules', '#controllers/print_config_controller.upsertRule')
        router.delete('/print/rules/:id', '#controllers/print_config_controller.deleteRule')
        // Documents du dossier : le couple d'états dépend du dossier X3.
        router.post('/print/documents', '#controllers/print_config_controller.upsertDocument')
        router.delete('/print/documents/:id', '#controllers/print_config_controller.deleteDocument')
        router.get('/print/jobs', '#controllers/print_config_controller.jobs')
        router.post('/print/reconcile', '#controllers/print_config_controller.reconcile')
        router.get('/print/journal', '#controllers/print_journal_controller.rows')
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
        // Impression du dossier d'OF à la demande / historique (#85 lot 3).
        router
          .get('/print/documents', '#controllers/print_controller.documents')
          .as('print.documents')
        router.post('/orders/:orderNum/print', '#controllers/print_controller.print')
        router.get('/orders/:orderNum/print', '#controllers/print_controller.history')
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
    // Détail d'une période de charge : composition d'une barre du graphe /charge.
    router
      .get('/api/v1/planning/charge/detail', '#controllers/load_controller.periodDetail')
      .as('charge.detail')

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
    // Détail d'un article (sheet ouverte au clic d'une ligne du KPI stock).
    router.get(
      '/api/v1/dashboard/stock/article',
      '#controllers/dashboard_controller.stockArticleDetail'
    )

    // Layout KPI personnalisables (feature tableau de bord) — le contrôleur +
    // le validator existent déjà ; la route manquait, le PATCH front 404 à chaque
    // drag/resize (🟡 dead-code §2). Rattaché au scope « user » (layout persisté
    // sur le modèle User courant).
    router
      .patch('/api/v1/user/dashboard-layout', '#controllers/dashboard_layout_controller.update')
      .as('user.dashboard_layout.update')

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

    // Baseline perf (issue #33) — P50/P95 par route, collectés par timing_middleware.
    router.get('/api/v1/_perf', '#controllers/perf_controller.index').as('perf.index')
  })
  .use([middleware.auth(), middleware.x3Context()])
