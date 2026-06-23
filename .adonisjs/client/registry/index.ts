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
  'forecast.index': {
    methods: ["GET","HEAD"],
    pattern: '/charge',
    tokens: [{"old":"/charge","type":0,"val":"charge","end":""}],
    types: placeholder as Registry['forecast.index']['types'],
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
  'planning_board.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/ofs',
    tokens: [{"old":"/api/v1/planning/ofs","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs","type":0,"val":"ofs","end":""}],
    types: placeholder as Registry['planning_board.index']['types'],
  },
  'planning_board.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/ofs/:of',
    tokens: [{"old":"/api/v1/planning/ofs/:of","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of","type":1,"val":"of","end":""}],
    types: placeholder as Registry['planning_board.show']['types'],
  },
  'planning_board.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/planning/ofs/:of',
    tokens: [{"old":"/api/v1/planning/ofs/:of","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of","type":1,"val":"of","end":""}],
    types: placeholder as Registry['planning_board.update']['types'],
  },
  'planning_board.reset_override': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning/ofs/:of/override',
    tokens: [{"old":"/api/v1/planning/ofs/:of/override","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of/override","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of/override","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of/override","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of/override","type":1,"val":"of","end":""},{"old":"/api/v1/planning/ofs/:of/override","type":0,"val":"override","end":""}],
    types: placeholder as Registry['planning_board.reset_override']['types'],
  },
  'planning_board.list_overrides': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/overrides',
    tokens: [{"old":"/api/v1/planning/overrides","type":0,"val":"api","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"overrides","end":""}],
    types: placeholder as Registry['planning_board.list_overrides']['types'],
  },
  'planning_board.reset_all': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning/overrides',
    tokens: [{"old":"/api/v1/planning/overrides","type":0,"val":"api","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/overrides","type":0,"val":"overrides","end":""}],
    types: placeholder as Registry['planning_board.reset_all']['types'],
  },
  'planning_board.feasibility': {
    methods: ["POST"],
    pattern: '/api/v1/planning/feasibility',
    tokens: [{"old":"/api/v1/planning/feasibility","type":0,"val":"api","end":""},{"old":"/api/v1/planning/feasibility","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/feasibility","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/feasibility","type":0,"val":"feasibility","end":""}],
    types: placeholder as Registry['planning_board.feasibility']['types'],
  },
  'planning_board.whatif': {
    methods: ["POST"],
    pattern: '/api/v1/planning/whatif',
    tokens: [{"old":"/api/v1/planning/whatif","type":0,"val":"api","end":""},{"old":"/api/v1/planning/whatif","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/whatif","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/whatif","type":0,"val":"whatif","end":""}],
    types: placeholder as Registry['planning_board.whatif']['types'],
  },
  'planning_board.order_impacts': {
    methods: ["POST"],
    pattern: '/api/v1/planning/order-impacts',
    tokens: [{"old":"/api/v1/planning/order-impacts","type":0,"val":"api","end":""},{"old":"/api/v1/planning/order-impacts","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/order-impacts","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/order-impacts","type":0,"val":"order-impacts","end":""}],
    types: placeholder as Registry['planning_board.order_impacts']['types'],
  },
  'planning_board.list_events': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/events',
    tokens: [{"old":"/api/v1/planning/events","type":0,"val":"api","end":""},{"old":"/api/v1/planning/events","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/events","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['planning_board.list_events']['types'],
  },
  'planning_board.board_feasibility': {
    methods: ["POST"],
    pattern: '/api/v1/planning/board-feasibility',
    tokens: [{"old":"/api/v1/planning/board-feasibility","type":0,"val":"api","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/board-feasibility","type":0,"val":"board-feasibility","end":""}],
    types: placeholder as Registry['planning_board.board_feasibility']['types'],
  },
  'planning_board.shortages': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/shortages',
    tokens: [{"old":"/api/v1/planning/shortages","type":0,"val":"api","end":""},{"old":"/api/v1/planning/shortages","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/shortages","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/shortages","type":0,"val":"shortages","end":""}],
    types: placeholder as Registry['planning_board.shortages']['types'],
  },
  'planning_board.nomenclature': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/nomenclature/:article',
    tokens: [{"old":"/api/v1/planning/nomenclature/:article","type":0,"val":"api","end":""},{"old":"/api/v1/planning/nomenclature/:article","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/nomenclature/:article","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/nomenclature/:article","type":0,"val":"nomenclature","end":""},{"old":"/api/v1/planning/nomenclature/:article","type":1,"val":"article","end":""}],
    types: placeholder as Registry['planning_board.nomenclature']['types'],
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
  'planning_board.reload_data': {
    methods: ["POST"],
    pattern: '/api/v1/planning/reload',
    tokens: [{"old":"/api/v1/planning/reload","type":0,"val":"api","end":""},{"old":"/api/v1/planning/reload","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/reload","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/reload","type":0,"val":"reload","end":""}],
    types: placeholder as Registry['planning_board.reload_data']['types'],
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
  'scheduler.of_detail': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning/ofs/:of/detail',
    tokens: [{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"api","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"v1","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"planning","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":1,"val":"of","end":""},{"old":"/api/v1/planning/ofs/:of/detail","type":0,"val":"detail","end":""}],
    types: placeholder as Registry['scheduler.of_detail']['types'],
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
  'suivi.status_detail': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/status/status/:order',
    tokens: [{"old":"/api/v1/status/status/:order","type":0,"val":"api","end":""},{"old":"/api/v1/status/status/:order","type":0,"val":"v1","end":""},{"old":"/api/v1/status/status/:order","type":0,"val":"status","end":""},{"old":"/api/v1/status/status/:order","type":0,"val":"status","end":""},{"old":"/api/v1/status/status/:order","type":1,"val":"order","end":""}],
    types: placeholder as Registry['suivi.status_detail']['types'],
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
  'pipeline.supply_board': {
    methods: ["POST"],
    pattern: '/api/v1/pipeline/supply-board',
    tokens: [{"old":"/api/v1/pipeline/supply-board","type":0,"val":"api","end":""},{"old":"/api/v1/pipeline/supply-board","type":0,"val":"v1","end":""},{"old":"/api/v1/pipeline/supply-board","type":0,"val":"pipeline","end":""},{"old":"/api/v1/pipeline/supply-board","type":0,"val":"supply-board","end":""}],
    types: placeholder as Registry['pipeline.supply_board']['types'],
  },
  'pipeline.suivi_status': {
    methods: ["POST"],
    pattern: '/api/v1/pipeline/suivi-status',
    tokens: [{"old":"/api/v1/pipeline/suivi-status","type":0,"val":"api","end":""},{"old":"/api/v1/pipeline/suivi-status","type":0,"val":"v1","end":""},{"old":"/api/v1/pipeline/suivi-status","type":0,"val":"pipeline","end":""},{"old":"/api/v1/pipeline/suivi-status","type":0,"val":"suivi-status","end":""}],
    types: placeholder as Registry['pipeline.suivi_status']['types'],
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
