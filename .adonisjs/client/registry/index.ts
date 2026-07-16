/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'auth.login': {
    methods: ["GET","HEAD"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'auth.attempt': {
    methods: ["POST"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.attempt']['types'],
  },
  'auth.logout': {
    methods: ["POST"],
    pattern: '/logout',
    tokens: [{"old":"/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.logout']['types'],
  },
  'assets.css': {
    methods: ["GET","HEAD"],
    pattern: '/css/app.css',
    tokens: [{"old":"/css/app.css","type":0,"val":"css","end":""},{"old":"/css/app.css","type":0,"val":"app.css","end":""}],
    types: placeholder as Registry['assets.css']['types'],
  },
  'assets.js': {
    methods: ["GET","HEAD"],
    pattern: '/js/app.js',
    tokens: [{"old":"/js/app.js","type":0,"val":"js","end":""},{"old":"/js/app.js","type":0,"val":"app.js","end":""}],
    types: placeholder as Registry['assets.js']['types'],
  },
  'health.index': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.index']['types'],
  },
  'dashboard': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['dashboard']['types'],
  },
  'design_system': {
    methods: ["GET","HEAD"],
    pattern: '/design-system',
    tokens: [{"old":"/design-system","type":0,"val":"design-system","end":""}],
    types: placeholder as Registry['design_system']['types'],
  },
  'diagnostic_test': {
    methods: ["GET","HEAD"],
    pattern: '/diagnostic-test',
    tokens: [{"old":"/diagnostic-test","type":0,"val":"diagnostic-test","end":""}],
    types: placeholder as Registry['diagnostic_test']['types'],
  },
  'x3_writeback_test': {
    methods: ["GET","HEAD"],
    pattern: '/writeback-test',
    tokens: [{"old":"/writeback-test","type":0,"val":"writeback-test","end":""}],
    types: placeholder as Registry['x3_writeback_test']['types'],
  },
  'scheduling': {
    methods: ["GET","HEAD"],
    pattern: '/ordonnancement',
    tokens: [{"old":"/ordonnancement","type":0,"val":"ordonnancement","end":""}],
    types: placeholder as Registry['scheduling']['types'],
  },
  'planning': {
    methods: ["GET","HEAD"],
    pattern: '/planification',
    tokens: [{"old":"/planification","type":0,"val":"planification","end":""}],
    types: placeholder as Registry['planning']['types'],
  },
  'scheduler.shortage_tracker': {
    methods: ["GET","HEAD"],
    pattern: '/ruptures',
    tokens: [{"old":"/ruptures","type":0,"val":"ruptures","end":""}],
    types: placeholder as Registry['scheduler.shortage_tracker']['types'],
  },
  'suivi.board': {
    methods: ["GET","HEAD"],
    pattern: '/suivi',
    tokens: [{"old":"/suivi","type":0,"val":"suivi","end":""}],
    types: placeholder as Registry['suivi.board']['types'],
  },
  'scheduler.programme': {
    methods: ["GET","HEAD"],
    pattern: '/programme',
    tokens: [{"old":"/programme","type":0,"val":"programme","end":""}],
    types: placeholder as Registry['scheduler.programme']['types'],
  },
  'scenarios.compare': {
    methods: ["GET","HEAD"],
    pattern: '/programme/scenarios/comparer',
    tokens: [{"old":"/programme/scenarios/comparer","type":0,"val":"programme","end":""},{"old":"/programme/scenarios/comparer","type":0,"val":"scenarios","end":""},{"old":"/programme/scenarios/comparer","type":0,"val":"comparer","end":""}],
    types: placeholder as Registry['scenarios.compare']['types'],
  },
  'load.index': {
    methods: ["GET","HEAD"],
    pattern: '/charge',
    tokens: [{"old":"/charge","type":0,"val":"charge","end":""}],
    types: placeholder as Registry['load.index']['types'],
  },
  'expeditions.index': {
    methods: ["GET","HEAD"],
    pattern: '/expeditions',
    tokens: [{"old":"/expeditions","type":0,"val":"expeditions","end":""}],
    types: placeholder as Registry['expeditions.index']['types'],
  },
  'receptions.index': {
    methods: ["GET","HEAD"],
    pattern: '/receptions',
    tokens: [{"old":"/receptions","type":0,"val":"receptions","end":""}],
    types: placeholder as Registry['receptions.index']['types'],
  },
  'conditionnements.index': {
    methods: ["GET","HEAD"],
    pattern: '/conditionnements',
    tokens: [{"old":"/conditionnements","type":0,"val":"conditionnements","end":""}],
    types: placeholder as Registry['conditionnements.index']['types'],
  },
  'promesse.show': {
    methods: ["GET","HEAD"],
    pattern: '/promesse',
    tokens: [{"old":"/promesse","type":0,"val":"promesse","end":""}],
    types: placeholder as Registry['promesse.show']['types'],
  },
  'calendar_config.index': {
    methods: ["GET","HEAD"],
    pattern: '/configuration/calendrier',
    tokens: [{"old":"/configuration/calendrier","type":0,"val":"configuration","end":""},{"old":"/configuration/calendrier","type":0,"val":"calendrier","end":""}],
    types: placeholder as Registry['calendar_config.index']['types'],
  },
  'calendar_config.toggle_holiday': {
    methods: ["POST"],
    pattern: '/api/v1/config/holidays/toggle',
    tokens: [{"old":"/api/v1/config/holidays/toggle","type":0,"val":"api","end":""},{"old":"/api/v1/config/holidays/toggle","type":0,"val":"v1","end":""},{"old":"/api/v1/config/holidays/toggle","type":0,"val":"config","end":""},{"old":"/api/v1/config/holidays/toggle","type":0,"val":"holidays","end":""},{"old":"/api/v1/config/holidays/toggle","type":0,"val":"toggle","end":""}],
    types: placeholder as Registry['calendar_config.toggle_holiday']['types'],
  },
  'calendar_config.create_closure': {
    methods: ["POST"],
    pattern: '/api/v1/config/closures',
    tokens: [{"old":"/api/v1/config/closures","type":0,"val":"api","end":""},{"old":"/api/v1/config/closures","type":0,"val":"v1","end":""},{"old":"/api/v1/config/closures","type":0,"val":"config","end":""},{"old":"/api/v1/config/closures","type":0,"val":"closures","end":""}],
    types: placeholder as Registry['calendar_config.create_closure']['types'],
  },
  'calendar_config.update_closure': {
    methods: ["PATCH"],
    pattern: '/api/v1/config/closures/:id',
    tokens: [{"old":"/api/v1/config/closures/:id","type":0,"val":"api","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"config","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"closures","end":""},{"old":"/api/v1/config/closures/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['calendar_config.update_closure']['types'],
  },
  'calendar_config.delete_closure': {
    methods: ["DELETE"],
    pattern: '/api/v1/config/closures/:id',
    tokens: [{"old":"/api/v1/config/closures/:id","type":0,"val":"api","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"config","end":""},{"old":"/api/v1/config/closures/:id","type":0,"val":"closures","end":""},{"old":"/api/v1/config/closures/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['calendar_config.delete_closure']['types'],
  },
  'order_planning.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/order-lines',
    tokens: [{"old":"/api/v1/planning/order-lines","type":0,"val":"api","end":""},{"old":"/api/v1/planning/order-lines","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/order-lines","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/order-lines","type":0,"val":"order-lines","end":""}],
    types: placeholder as Registry['order_planning.index']['types'],
  },
  'order_planning.line_detail': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/order-lines/:order/:line',
    tokens: [{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"api","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"order-lines","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":1,"val":"order","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":1,"val":"line","end":""}],
    types: placeholder as Registry['order_planning.line_detail']['types'],
  },
  'order_planning.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/planning/order-lines/:order/:line',
    tokens: [{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"api","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":0,"val":"order-lines","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":1,"val":"order","end":""},{"old":"/api/v1/planning/order-lines/:order/:line","type":1,"val":"line","end":""}],
    types: placeholder as Registry['order_planning.update']['types'],
  },
  'order_planning.reset_override': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning/order-lines/:order/:line/override',
    tokens: [{"old":"/api/v1/planning/order-lines/:order/:line/override","type":0,"val":"api","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":0,"val":"order-lines","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":1,"val":"order","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":1,"val":"line","end":""},{"old":"/api/v1/planning/order-lines/:order/:line/override","type":0,"val":"override","end":""}],
    types: placeholder as Registry['order_planning.reset_override']['types'],
  },
  'planning_board.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/planning/ofs/:of',
    tokens: [{"old":"/api/v1/planning/ofs/:of","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of","type":1,"val":"of","end":""}],
    types: placeholder as Registry['planning_board.update']['types'],
  },
  'planning_board.board_feasibility': {
    methods: ["POST"],
    pattern: '/api/v1/planning/board-feasibility',
    tokens: [{"old":"/api/v1/planning/board-feasibility","type":0,"val":"api","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"board-feasibility","end":""}],
    types: placeholder as Registry['planning_board.board_feasibility']['types'],
  },
  'planning_board.articles_by_component': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/articles-by-component/:component',
    tokens: [{"old":"/api/v1/planning/articles-by-component/:component","type":0,"val":"api","end":""},{"old":"/api/v1/planning/articles-by-component/:component","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/articles-by-component/:component","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/articles-by-component/:component","type":0,"val":"articles-by-component","end":""},{"old":"/api/v1/planning/articles-by-component/:component","type":1,"val":"component","end":""}],
    types: placeholder as Registry['planning_board.articles_by_component']['types'],
  },
  'planning_board.search_poste': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/search/poste',
    tokens: [{"old":"/api/v1/planning/search/poste","type":0,"val":"api","end":""},{"old":"/api/v1/planning/search/poste","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/search/poste","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/search/poste","type":0,"val":"search","end":""},{"old":"/api/v1/planning/search/poste","type":0,"val":"poste","end":""}],
    types: placeholder as Registry['planning_board.search_poste']['types'],
  },
  'planning_board.search_of': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/search/of',
    tokens: [{"old":"/api/v1/planning/search/of","type":0,"val":"api","end":""},{"old":"/api/v1/planning/search/of","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/search/of","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/search/of","type":0,"val":"search","end":""},{"old":"/api/v1/planning/search/of","type":0,"val":"of","end":""}],
    types: placeholder as Registry['planning_board.search_of']['types'],
  },
  'planning_board.search_pf': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/search/pf',
    tokens: [{"old":"/api/v1/planning/search/pf","type":0,"val":"api","end":""},{"old":"/api/v1/planning/search/pf","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/search/pf","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/search/pf","type":0,"val":"search","end":""},{"old":"/api/v1/planning/search/pf","type":0,"val":"pf","end":""}],
    types: placeholder as Registry['planning_board.search_pf']['types'],
  },
  'planning_board.of_materials_diagnostic': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/of-materials/:of/diagnostic',
    tokens: [{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":0,"val":"api","end":""},{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":0,"val":"of-materials","end":""},{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":1,"val":"of","end":""},{"old":"/api/v1/planning/of-materials/:of/diagnostic","type":0,"val":"diagnostic","end":""}],
    types: placeholder as Registry['planning_board.of_materials_diagnostic']['types'],
  },
  'planning.suggestion_firm': {
    methods: ["POST"],
    pattern: '/api/v1/planning/suggestions/:sugNum/firm',
    tokens: [{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":0,"val":"api","end":""},{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":0,"val":"suggestions","end":""},{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":1,"val":"sugNum","end":""},{"old":"/api/v1/planning/suggestions/:sugNum/firm","type":0,"val":"firm","end":""}],
    types: placeholder as Registry['planning.suggestion_firm']['types'],
  },
  'planning.order_firm': {
    methods: ["POST"],
    pattern: '/api/v1/planning/orders/:orderNum/firm',
    tokens: [{"old":"/api/v1/planning/orders/:orderNum/firm","type":0,"val":"api","end":""},{"old":"/api/v1/planning/orders/:orderNum/firm","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/orders/:orderNum/firm","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/orders/:orderNum/firm","type":0,"val":"orders","end":""},{"old":"/api/v1/planning/orders/:orderNum/firm","type":1,"val":"orderNum","end":""},{"old":"/api/v1/planning/orders/:orderNum/firm","type":0,"val":"firm","end":""}],
    types: placeholder as Registry['planning.order_firm']['types'],
  },
  'scenarios.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/scenarios',
    tokens: [{"old":"/api/v1/planning/scenarios","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"scenarios","end":""}],
    types: placeholder as Registry['scenarios.index']['types'],
  },
  'scenarios.store': {
    methods: ["POST"],
    pattern: '/api/v1/planning/scenarios',
    tokens: [{"old":"/api/v1/planning/scenarios","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios","type":0,"val":"scenarios","end":""}],
    types: placeholder as Registry['scenarios.store']['types'],
  },
  'scenarios.diff': {
    methods: ["POST"],
    pattern: '/api/v1/planning/scenarios/diff',
    tokens: [{"old":"/api/v1/planning/scenarios/diff","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios/diff","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios/diff","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios/diff","type":0,"val":"scenarios","end":""},{"old":"/api/v1/planning/scenarios/diff","type":0,"val":"diff","end":""}],
    types: placeholder as Registry['scenarios.diff']['types'],
  },
  'scenarios.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/scenarios/:id',
    tokens: [{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"scenarios","end":""},{"old":"/api/v1/planning/scenarios/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['scenarios.show']['types'],
  },
  'scenarios.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/planning/scenarios/:id',
    tokens: [{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"scenarios","end":""},{"old":"/api/v1/planning/scenarios/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['scenarios.update']['types'],
  },
  'scenarios.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning/scenarios/:id',
    tokens: [{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"api","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/scenarios/:id","type":0,"val":"scenarios","end":""},{"old":"/api/v1/planning/scenarios/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['scenarios.destroy']['types'],
  },
  'scheduler.of_detail': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/ofs/:of/detail',
    tokens: [{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":1,"val":"of","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"detail","end":""}],
    types: placeholder as Registry['scheduler.of_detail']['types'],
  },
  'scheduler.poste_engagement': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/postes/:poste/engagement',
    tokens: [{"old":"/api/v1/planning/postes/:poste/engagement","type":0,"val":"api","end":""},{"old":"/api/v1/planning/postes/:poste/engagement","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/postes/:poste/engagement","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/postes/:poste/engagement","type":0,"val":"postes","end":""},{"old":"/api/v1/planning/postes/:poste/engagement","type":1,"val":"poste","end":""},{"old":"/api/v1/planning/postes/:poste/engagement","type":0,"val":"engagement","end":""}],
    types: placeholder as Registry['scheduler.poste_engagement']['types'],
  },
  'scheduler.shortage_rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/shortages/rows',
    tokens: [{"old":"/api/v1/planning/shortages/rows","type":0,"val":"api","end":""},{"old":"/api/v1/planning/shortages/rows","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/shortages/rows","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/shortages/rows","type":0,"val":"shortages","end":""},{"old":"/api/v1/planning/shortages/rows","type":0,"val":"rows","end":""}],
    types: placeholder as Registry['scheduler.shortage_rows']['types'],
  },
  'suivi.assign': {
    methods: ["POST"],
    pattern: '/api/v1/status/assign',
    tokens: [{"old":"/api/v1/status/assign","type":0,"val":"api","end":""},{"old":"/api/v1/status/assign","type":0,"val":"v1","end":""},{"old":"/api/v1/status/assign","type":0,"val":"status","end":""},{"old":"/api/v1/status/assign","type":0,"val":"assign","end":""}],
    types: placeholder as Registry['suivi.assign']['types'],
  },
  'suivi.from_latest_export': {
    methods: ["POST"],
    pattern: '/api/v1/status/from-latest-export',
    tokens: [{"old":"/api/v1/status/from-latest-export","type":0,"val":"api","end":""},{"old":"/api/v1/status/from-latest-export","type":0,"val":"v1","end":""},{"old":"/api/v1/status/from-latest-export","type":0,"val":"status","end":""},{"old":"/api/v1/status/from-latest-export","type":0,"val":"from-latest-export","end":""}],
    types: placeholder as Registry['suivi.from_latest_export']['types'],
  },
  'suivi.palette': {
    methods: ["POST"],
    pattern: '/api/v1/status/palette',
    tokens: [{"old":"/api/v1/status/palette","type":0,"val":"api","end":""},{"old":"/api/v1/status/palette","type":0,"val":"v1","end":""},{"old":"/api/v1/status/palette","type":0,"val":"status","end":""},{"old":"/api/v1/status/palette","type":0,"val":"palette","end":""}],
    types: placeholder as Registry['suivi.palette']['types'],
  },
  'suivi.retard_charge': {
    methods: ["POST"],
    pattern: '/api/v1/status/retard-charge',
    tokens: [{"old":"/api/v1/status/retard-charge","type":0,"val":"api","end":""},{"old":"/api/v1/status/retard-charge","type":0,"val":"v1","end":""},{"old":"/api/v1/status/retard-charge","type":0,"val":"status","end":""},{"old":"/api/v1/status/retard-charge","type":0,"val":"retard-charge","end":""}],
    types: placeholder as Registry['suivi.retard_charge']['types'],
  },
  'suivi.rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/status/rows',
    tokens: [{"old":"/api/v1/status/rows","type":0,"val":"api","end":""},{"old":"/api/v1/status/rows","type":0,"val":"v1","end":""},{"old":"/api/v1/status/rows","type":0,"val":"status","end":""},{"old":"/api/v1/status/rows","type":0,"val":"rows","end":""}],
    types: placeholder as Registry['suivi.rows']['types'],
  },
  'suivi.proactive_rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/status/proactive-rows',
    tokens: [{"old":"/api/v1/status/proactive-rows","type":0,"val":"api","end":""},{"old":"/api/v1/status/proactive-rows","type":0,"val":"v1","end":""},{"old":"/api/v1/status/proactive-rows","type":0,"val":"status","end":""},{"old":"/api/v1/status/proactive-rows","type":0,"val":"proactive-rows","end":""}],
    types: placeholder as Registry['suivi.proactive_rows']['types'],
  },
  'dashboard.kpis': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/dashboard/kpis',
    tokens: [{"old":"/api/v1/dashboard/kpis","type":0,"val":"api","end":""},{"old":"/api/v1/dashboard/kpis","type":0,"val":"v1","end":""},{"old":"/api/v1/dashboard/kpis","type":0,"val":"dashboard","end":""},{"old":"/api/v1/dashboard/kpis","type":0,"val":"kpis","end":""}],
    types: placeholder as Registry['dashboard.kpis']['types'],
  },
  'dashboard.otd': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/dashboard/otd',
    tokens: [{"old":"/api/v1/dashboard/otd","type":0,"val":"api","end":""},{"old":"/api/v1/dashboard/otd","type":0,"val":"v1","end":""},{"old":"/api/v1/dashboard/otd","type":0,"val":"dashboard","end":""},{"old":"/api/v1/dashboard/otd","type":0,"val":"otd","end":""}],
    types: placeholder as Registry['dashboard.otd']['types'],
  },
  'dashboard.stock_valuation': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/dashboard/stock',
    tokens: [{"old":"/api/v1/dashboard/stock","type":0,"val":"api","end":""},{"old":"/api/v1/dashboard/stock","type":0,"val":"v1","end":""},{"old":"/api/v1/dashboard/stock","type":0,"val":"dashboard","end":""},{"old":"/api/v1/dashboard/stock","type":0,"val":"stock","end":""}],
    types: placeholder as Registry['dashboard.stock_valuation']['types'],
  },
  'expeditions.rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/expeditions/rows',
    tokens: [{"old":"/api/v1/expeditions/rows","type":0,"val":"api","end":""},{"old":"/api/v1/expeditions/rows","type":0,"val":"v1","end":""},{"old":"/api/v1/expeditions/rows","type":0,"val":"expeditions","end":""},{"old":"/api/v1/expeditions/rows","type":0,"val":"rows","end":""}],
    types: placeholder as Registry['expeditions.rows']['types'],
  },
  'receptions.rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/receptions/rows',
    tokens: [{"old":"/api/v1/receptions/rows","type":0,"val":"api","end":""},{"old":"/api/v1/receptions/rows","type":0,"val":"v1","end":""},{"old":"/api/v1/receptions/rows","type":0,"val":"receptions","end":""},{"old":"/api/v1/receptions/rows","type":0,"val":"rows","end":""}],
    types: placeholder as Registry['receptions.rows']['types'],
  },
  'conditionnements.rows': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/conditionnements/rows',
    tokens: [{"old":"/api/v1/conditionnements/rows","type":0,"val":"api","end":""},{"old":"/api/v1/conditionnements/rows","type":0,"val":"v1","end":""},{"old":"/api/v1/conditionnements/rows","type":0,"val":"conditionnements","end":""},{"old":"/api/v1/conditionnements/rows","type":0,"val":"rows","end":""}],
    types: placeholder as Registry['conditionnements.rows']['types'],
  },
  'conditionnements.estimations': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/conditionnements/estimations',
    tokens: [{"old":"/api/v1/conditionnements/estimations","type":0,"val":"api","end":""},{"old":"/api/v1/conditionnements/estimations","type":0,"val":"v1","end":""},{"old":"/api/v1/conditionnements/estimations","type":0,"val":"conditionnements","end":""},{"old":"/api/v1/conditionnements/estimations","type":0,"val":"estimations","end":""}],
    types: placeholder as Registry['conditionnements.estimations']['types'],
  },
  'promesse.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/promesse',
    tokens: [{"old":"/api/v1/promesse","type":0,"val":"api","end":""},{"old":"/api/v1/promesse","type":0,"val":"v1","end":""},{"old":"/api/v1/promesse","type":0,"val":"promesse","end":""}],
    types: placeholder as Registry['promesse.index']['types'],
  },
  'promesse.articles': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/promesse/articles',
    tokens: [{"old":"/api/v1/promesse/articles","type":0,"val":"api","end":""},{"old":"/api/v1/promesse/articles","type":0,"val":"v1","end":""},{"old":"/api/v1/promesse/articles","type":0,"val":"promesse","end":""},{"old":"/api/v1/promesse/articles","type":0,"val":"articles","end":""}],
    types: placeholder as Registry['promesse.articles']['types'],
  },
  'data.load': {
    methods: ["POST"],
    pattern: '/api/v1/data/load',
    tokens: [{"old":"/api/v1/data/load","type":0,"val":"api","end":""},{"old":"/api/v1/data/load","type":0,"val":"v1","end":""},{"old":"/api/v1/data/load","type":0,"val":"data","end":""},{"old":"/api/v1/data/load","type":0,"val":"load","end":""}],
    types: placeholder as Registry['data.load']['types'],
  },
  'static_sync.status': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/static/status',
    tokens: [{"old":"/api/v1/static/status","type":0,"val":"api","end":""},{"old":"/api/v1/static/status","type":0,"val":"v1","end":""},{"old":"/api/v1/static/status","type":0,"val":"static","end":""},{"old":"/api/v1/static/status","type":0,"val":"status","end":""}],
    types: placeholder as Registry['static_sync.status']['types'],
  },
  'static_sync.sync': {
    methods: ["POST"],
    pattern: '/api/v1/static/sync',
    tokens: [{"old":"/api/v1/static/sync","type":0,"val":"api","end":""},{"old":"/api/v1/static/sync","type":0,"val":"v1","end":""},{"old":"/api/v1/static/sync","type":0,"val":"static","end":""},{"old":"/api/v1/static/sync","type":0,"val":"sync","end":""}],
    types: placeholder as Registry['static_sync.sync']['types'],
  },
  'x3_writeback.describe': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/x3/writeback/describe',
    tokens: [{"old":"/api/v1/x3/writeback/describe","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/describe","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/describe","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/describe","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/describe","type":0,"val":"describe","end":""}],
    types: placeholder as Registry['x3_writeback.describe']['types'],
  },
  'x3_writeback.read': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/x3/writeback/read',
    tokens: [{"old":"/api/v1/x3/writeback/read","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/read","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/read","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/read","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/read","type":0,"val":"read","end":""}],
    types: placeholder as Registry['x3_writeback.read']['types'],
  },
  'x3_writeback.save': {
    methods: ["POST"],
    pattern: '/api/v1/x3/writeback/save',
    tokens: [{"old":"/api/v1/x3/writeback/save","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/save","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/save","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/save","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/save","type":0,"val":"save","end":""}],
    types: placeholder as Registry['x3_writeback.save']['types'],
  },
  'x3_writeback.modify': {
    methods: ["POST"],
    pattern: '/api/v1/x3/writeback/modify',
    tokens: [{"old":"/api/v1/x3/writeback/modify","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/modify","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/modify","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/modify","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/modify","type":0,"val":"modify","end":""}],
    types: placeholder as Registry['x3_writeback.modify']['types'],
  },
  'x3_writeback.delete': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/x3/writeback/delete',
    tokens: [{"old":"/api/v1/x3/writeback/delete","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/delete","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/delete","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/delete","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/delete","type":0,"val":"delete","end":""}],
    types: placeholder as Registry['x3_writeback.delete']['types'],
  },
  'x3_writeback.list': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/x3/writeback/list',
    tokens: [{"old":"/api/v1/x3/writeback/list","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/list","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/list","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/list","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/list","type":0,"val":"list","end":""}],
    types: placeholder as Registry['x3_writeback.list']['types'],
  },
  'x3_writeback.run': {
    methods: ["POST"],
    pattern: '/api/v1/x3/writeback/run',
    tokens: [{"old":"/api/v1/x3/writeback/run","type":0,"val":"api","end":""},{"old":"/api/v1/x3/writeback/run","type":0,"val":"v1","end":""},{"old":"/api/v1/x3/writeback/run","type":0,"val":"x3","end":""},{"old":"/api/v1/x3/writeback/run","type":0,"val":"writeback","end":""},{"old":"/api/v1/x3/writeback/run","type":0,"val":"run","end":""}],
    types: placeholder as Registry['x3_writeback.run']['types'],
  },
  'perf.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/_perf',
    tokens: [{"old":"/api/v1/_perf","type":0,"val":"api","end":""},{"old":"/api/v1/_perf","type":0,"val":"v1","end":""},{"old":"/api/v1/_perf","type":0,"val":"_perf","end":""}],
    types: placeholder as Registry['perf.index']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
