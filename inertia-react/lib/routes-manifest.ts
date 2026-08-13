/**
 * AUTO-GÉNÉRÉ par scripts/gen-routes-manifest.mjs — NE PAS ÉDITER À LA MAIN.
 * Source : `start/routes.ts` → `node ace list:routes --jsonl`.
 * Régénérer : `npm run routes:gen` · Vérifier la fraîcheur : `npm run routes:check`.
 * 78 routes nommées.
 */

export const MANIFEST = {
  'assets.apple_touch_icon_png': { method: 'GET', pattern: '/apple-touch-icon.png' },
  'assets.css': { method: 'GET', pattern: '/css/app.css' },
  'assets.favicon_16x16_png': { method: 'GET', pattern: '/favicon-16x16.png' },
  'assets.favicon_32x32_png': { method: 'GET', pattern: '/favicon-32x32.png' },
  'assets.favicon_ico': { method: 'GET', pattern: '/favicon.ico' },
  'assets.favicon_svg': { method: 'GET', pattern: '/favicon.svg' },
  'assets.js': { method: 'GET', pattern: '/js/app.js' },
  'assets.site_webmanifest': { method: 'GET', pattern: '/site.webmanifest' },
  'auth.attempt': { method: 'POST', pattern: '/login' },
  'auth.login': { method: 'GET', pattern: '/login' },
  'auth.logout': { method: 'POST', pattern: '/logout' },
  'calendar_config.create_closure': { method: 'POST', pattern: '/api/v1/config/closures' },
  'calendar_config.delete_closure': { method: 'DELETE', pattern: '/api/v1/config/closures/:id' },
  'calendar_config.index': { method: 'GET', pattern: '/configuration/calendrier' },
  'calendar_config.toggle_holiday': { method: 'POST', pattern: '/api/v1/config/holidays/toggle' },
  'calendar_config.update_closure': { method: 'PATCH', pattern: '/api/v1/config/closures/:id' },
  'charge.detail': { method: 'GET', pattern: '/api/v1/planning/charge/detail' },
  'dashboard': { method: 'GET', pattern: '/' },
  'dashboard.kpis': { method: 'GET', pattern: '/api/v1/dashboard/kpis' },
  'dashboard.otd': { method: 'GET', pattern: '/api/v1/dashboard/otd' },
  'dashboard.stock_article_detail': { method: 'GET', pattern: '/api/v1/dashboard/stock/article' },
  'dashboard.stock_valuation': { method: 'GET', pattern: '/api/v1/dashboard/stock' },
  'data.load': { method: 'POST', pattern: '/api/v1/data/load' },
  'health.index': { method: 'GET', pattern: '/health' },
  'load.index': { method: 'GET', pattern: '/charge' },
  'order_planning.index': { method: 'GET', pattern: '/api/v1/planning/order-lines' },
  'order_planning.line_detail': {
    method: 'GET',
    pattern: '/api/v1/planning/order-lines/:order/:line',
  },
  'order_planning.reset_override': {
    method: 'DELETE',
    pattern: '/api/v1/planning/order-lines/:order/:line/override',
  },
  'order_planning.update': {
    method: 'PATCH',
    pattern: '/api/v1/planning/order-lines/:order/:line',
  },
  'perf.index': { method: 'GET', pattern: '/api/v1/_perf' },
  'planning': { method: 'GET', pattern: '/planification' },
  'planning_board.articles_by_component': {
    method: 'GET',
    pattern: '/api/v1/planning/articles-by-component/:component',
  },
  'planning_board.board_feasibility': {
    method: 'POST',
    pattern: '/api/v1/planning/board-feasibility',
  },
  'planning_board.of_materials_diagnostic': {
    method: 'GET',
    pattern: '/api/v1/planning/of-materials/:of/diagnostic',
  },
  'planning_board.search_of': { method: 'GET', pattern: '/api/v1/planning/search/of' },
  'planning_board.search_pf': { method: 'GET', pattern: '/api/v1/planning/search/pf' },
  'planning_board.search_poste': { method: 'GET', pattern: '/api/v1/planning/search/poste' },
  'planning_board.update': { method: 'PATCH', pattern: '/api/v1/planning/ofs/:of' },
  'planning.order_firm': { method: 'POST', pattern: '/api/v1/planning/orders/:orderNum/firm' },
  'planning.suggestion_firm': {
    method: 'POST',
    pattern: '/api/v1/planning/suggestions/:sugNum/firm',
  },
  'print_config.delete_document': {
    method: 'DELETE',
    pattern: '/api/v1/config/print/documents/:id',
  },
  'print_config.delete_rule': { method: 'DELETE', pattern: '/api/v1/config/print/rules/:id' },
  'print_config.destinations': { method: 'GET', pattern: '/api/v1/config/print/destinations' },
  'print_config.index': { method: 'GET', pattern: '/configuration/impressions' },
  'print_config.jobs': { method: 'GET', pattern: '/api/v1/config/print/jobs' },
  'print_config.reconcile': { method: 'POST', pattern: '/api/v1/config/print/reconcile' },
  'print_config.update_settings': { method: 'POST', pattern: '/api/v1/config/print/settings' },
  'print_config.upsert_document': { method: 'POST', pattern: '/api/v1/config/print/documents' },
  'print_config.upsert_rule': { method: 'POST', pattern: '/api/v1/config/print/rules' },
  'print_journal': { method: 'GET', pattern: '/impressions' },
  'print_journal.rows': { method: 'GET', pattern: '/api/v1/config/print/journal' },
  'print.documents': { method: 'GET', pattern: '/api/v1/planning/print/documents' },
  'print.history': { method: 'GET', pattern: '/api/v1/planning/orders/:orderNum/print' },
  'print.print': { method: 'POST', pattern: '/api/v1/planning/orders/:orderNum/print' },
  'scenarios.compare': { method: 'GET', pattern: '/programme/scenarios/comparer' },
  'scenarios.destroy': { method: 'DELETE', pattern: '/api/v1/planning/scenarios/:id' },
  'scenarios.diff': { method: 'POST', pattern: '/api/v1/planning/scenarios/diff' },
  'scenarios.index': { method: 'GET', pattern: '/api/v1/planning/scenarios' },
  'scenarios.show': { method: 'GET', pattern: '/api/v1/planning/scenarios/:id' },
  'scenarios.store': { method: 'POST', pattern: '/api/v1/planning/scenarios' },
  'scenarios.update': { method: 'PATCH', pattern: '/api/v1/planning/scenarios/:id' },
  'scheduler.of_detail': { method: 'GET', pattern: '/api/v1/planning/ofs/:of/detail' },
  'scheduler.poste_engagement': {
    method: 'GET',
    pattern: '/api/v1/planning/postes/:poste/engagement',
  },
  'scheduler.programme': { method: 'GET', pattern: '/programme' },
  'scheduler.shortage_rows': { method: 'GET', pattern: '/api/v1/planning/shortages/rows' },
  'scheduler.shortage_tracker': { method: 'GET', pattern: '/ruptures' },
  'scheduling': { method: 'GET', pattern: '/ordonnancement' },
  'sequenceur.index': { method: 'GET', pattern: '/sequenceur' },
  'static_sync.status': { method: 'GET', pattern: '/api/v1/static/status' },
  'static_sync.sync': { method: 'POST', pattern: '/api/v1/static/sync' },
  'suivi.assign': { method: 'POST', pattern: '/api/v1/status/assign' },
  'suivi.board': { method: 'GET', pattern: '/suivi' },
  'suivi.from_latest_export': { method: 'POST', pattern: '/api/v1/status/from-latest-export' },
  'suivi.palette': { method: 'POST', pattern: '/api/v1/status/palette' },
  'suivi.proactive_rows': { method: 'GET', pattern: '/api/v1/status/proactive-rows' },
  'suivi.retard_charge': { method: 'POST', pattern: '/api/v1/status/retard-charge' },
  'suivi.rows': { method: 'GET', pattern: '/api/v1/status/rows' },
  'user.dashboard_layout.update': { method: 'PATCH', pattern: '/api/v1/user/dashboard-layout' },
} as const satisfies Record<string, { method: string; pattern: string }>

export type RouteName = keyof typeof MANIFEST

/**
 * Params de path attendus par route (côté frontend).
 * `void` = aucun paramètre de path ; les query strings (?start&days…) restent à l'appelant.
 */
export type RouteParams = {
  'assets.apple_touch_icon_png': void
  'assets.css': void
  'assets.favicon_16x16_png': void
  'assets.favicon_32x32_png': void
  'assets.favicon_ico': void
  'assets.favicon_svg': void
  'assets.js': void
  'assets.site_webmanifest': void
  'auth.attempt': void
  'auth.login': void
  'auth.logout': void
  'calendar_config.create_closure': void
  'calendar_config.delete_closure': { id: string | number }
  'calendar_config.index': void
  'calendar_config.toggle_holiday': void
  'calendar_config.update_closure': { id: string | number }
  'charge.detail': void
  'dashboard': void
  'dashboard.kpis': void
  'dashboard.otd': void
  'dashboard.stock_article_detail': void
  'dashboard.stock_valuation': void
  'data.load': void
  'health.index': void
  'load.index': void
  'order_planning.index': void
  'order_planning.line_detail': { order: string | number; line: string | number }
  'order_planning.reset_override': { order: string | number; line: string | number }
  'order_planning.update': { order: string | number; line: string | number }
  'perf.index': void
  'planning': void
  'planning_board.articles_by_component': { component: string | number }
  'planning_board.board_feasibility': void
  'planning_board.of_materials_diagnostic': { of: string | number }
  'planning_board.search_of': void
  'planning_board.search_pf': void
  'planning_board.search_poste': void
  'planning_board.update': { of: string | number }
  'planning.order_firm': { orderNum: string | number }
  'planning.suggestion_firm': { sugNum: string | number }
  'print_config.delete_document': { id: string | number }
  'print_config.delete_rule': { id: string | number }
  'print_config.destinations': void
  'print_config.index': void
  'print_config.jobs': void
  'print_config.reconcile': void
  'print_config.update_settings': void
  'print_config.upsert_document': void
  'print_config.upsert_rule': void
  'print_journal': void
  'print_journal.rows': void
  'print.documents': void
  'print.history': { orderNum: string | number }
  'print.print': { orderNum: string | number }
  'scenarios.compare': void
  'scenarios.destroy': { id: string | number }
  'scenarios.diff': void
  'scenarios.index': void
  'scenarios.show': { id: string | number }
  'scenarios.store': void
  'scenarios.update': { id: string | number }
  'scheduler.of_detail': { of: string | number }
  'scheduler.poste_engagement': { poste: string | number }
  'scheduler.programme': void
  'scheduler.shortage_rows': void
  'scheduler.shortage_tracker': void
  'scheduling': void
  'sequenceur.index': void
  'static_sync.status': void
  'static_sync.sync': void
  'suivi.assign': void
  'suivi.board': void
  'suivi.from_latest_export': void
  'suivi.palette': void
  'suivi.proactive_rows': void
  'suivi.retard_charge': void
  'suivi.rows': void
  'user.dashboard_layout.update': void
}
