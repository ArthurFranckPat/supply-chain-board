/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'auth.login': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'auth.attempt': {
    methods: ["POST"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'auth.logout': {
    methods: ["POST"]
    pattern: '/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.css': {
    methods: ["GET","HEAD"]
    pattern: '/css/app.css'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.js': {
    methods: ["GET","HEAD"]
    pattern: '/js/app.js'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.favicon_svg': {
    methods: ["GET","HEAD"]
    pattern: '/favicon.svg'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.favicon_ico': {
    methods: ["GET","HEAD"]
    pattern: '/favicon.ico'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.favicon_32x32_png': {
    methods: ["GET","HEAD"]
    pattern: '/favicon-32x32.png'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.favicon_16x16_png': {
    methods: ["GET","HEAD"]
    pattern: '/favicon-16x16.png'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.apple_touch_icon_png': {
    methods: ["GET","HEAD"]
    pattern: '/apple-touch-icon.png'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'assets.site_webmanifest': {
    methods: ["GET","HEAD"]
    pattern: '/site.webmanifest'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'health.index': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dashboard': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'design_system': {
    methods: ["GET","HEAD"]
    pattern: '/design-system'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'diagnostic_test': {
    methods: ["GET","HEAD"]
    pattern: '/diagnostic-test'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'react_lab': {
    methods: ["GET","HEAD"]
    pattern: '/react-lab'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback_test': {
    methods: ["GET","HEAD"]
    pattern: '/writeback-test'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_print_test': {
    methods: ["GET","HEAD"]
    pattern: '/print-test'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduling': {
    methods: ["GET","HEAD"]
    pattern: '/ordonnancement'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning': {
    methods: ["GET","HEAD"]
    pattern: '/planification'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduler.shortage_tracker': {
    methods: ["GET","HEAD"]
    pattern: '/ruptures'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'controle_prod.index': {
    methods: ["GET","HEAD"]
    pattern: '/controle-prod'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'cockpit.index': {
    methods: ["GET","HEAD"]
    pattern: '/cockpit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.board': {
    methods: ["GET","HEAD"]
    pattern: '/suivi'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduler.programme': {
    methods: ["GET","HEAD"]
    pattern: '/programme'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.compare': {
    methods: ["GET","HEAD"]
    pattern: '/programme/scenarios/comparer'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'sequenceur.index': {
    methods: ["GET","HEAD"]
    pattern: '/sequenceur'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'load.index': {
    methods: ["GET","HEAD"]
    pattern: '/charge'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'expeditions.index': {
    methods: ["GET","HEAD"]
    pattern: '/expeditions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'receptions.index': {
    methods: ["GET","HEAD"]
    pattern: '/receptions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'approvisionnements.index': {
    methods: ["GET","HEAD"]
    pattern: '/approvisionnements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'conditionnements.index': {
    methods: ["GET","HEAD"]
    pattern: '/conditionnements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.show': {
    methods: ["GET","HEAD"]
    pattern: '/copilote'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'calendar_config.index': {
    methods: ["GET","HEAD"]
    pattern: '/configuration/calendrier'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.index': {
    methods: ["GET","HEAD"]
    pattern: '/configuration/impressions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.index': {
    methods: ["GET","HEAD"]
    pattern: '/configuration/donnees'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_journal': {
    methods: ["GET","HEAD"]
    pattern: '/impressions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'calendar_config.toggle_holiday': {
    methods: ["POST"]
    pattern: '/api/v1/config/holidays/toggle'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'calendar_config.create_closure': {
    methods: ["POST"]
    pattern: '/api/v1/config/closures'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'calendar_config.update_closure': {
    methods: ["PATCH"]
    pattern: '/api/v1/config/closures/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'calendar_config.delete_closure': {
    methods: ["DELETE"]
    pattern: '/api/v1/config/closures/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.destinations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config/print/destinations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.update_settings': {
    methods: ["POST"]
    pattern: '/api/v1/config/print/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.upsert_rule': {
    methods: ["POST"]
    pattern: '/api/v1/config/print/rules'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.delete_rule': {
    methods: ["DELETE"]
    pattern: '/api/v1/config/print/rules/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.upsert_document': {
    methods: ["POST"]
    pattern: '/api/v1/config/print/documents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.delete_document': {
    methods: ["DELETE"]
    pattern: '/api/v1/config/print/documents/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.jobs': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config/print/jobs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_config.reconcile': {
    methods: ["POST"]
    pattern: '/api/v1/config/print/reconcile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print_journal.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config/print/journal'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config/data/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.update_mode': {
    methods: ["POST"]
    pattern: '/api/v1/config/data/mode'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.sync': {
    methods: ["POST"]
    pattern: '/api/v1/config/data/sync'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.reset_dirty': {
    methods: ["POST"]
    pattern: '/api/v1/config/data/reset-dirty'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data_config.logs': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/config/data/logs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'order_planning.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/order-lines'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'order_planning.line_detail': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/order-lines/:order/:line'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { order: ParamValue; line: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'order_planning.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/planning/order-lines/:order/:line'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { order: ParamValue; line: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'order_planning.reset_override': {
    methods: ["DELETE"]
    pattern: '/api/v1/planning/order-lines/:order/:line/override'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { order: ParamValue; line: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/planning/ofs/:of'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { of: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.board_feasibility': {
    methods: ["POST"]
    pattern: '/api/v1/planning/board-feasibility'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.articles_by_component': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/articles-by-component/:component'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { component: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.search_poste': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/search/poste'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.search_of': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/search/of'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.search_pf': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/search/pf'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.of_materials_diagnostic': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/of-materials/:of/diagnostic'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { of: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning.suggestion_firm': {
    methods: ["POST"]
    pattern: '/api/v1/planning/suggestions/:sugNum/firm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { sugNum: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print.documents': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/print/documents'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print.print': {
    methods: ["POST"]
    pattern: '/api/v1/planning/orders/:orderNum/print'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderNum: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'print.history': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/orders/:orderNum/print'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderNum: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning.order_firm': {
    methods: ["POST"]
    pattern: '/api/v1/planning/orders/:orderNum/firm'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderNum: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/scenarios'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.store': {
    methods: ["POST"]
    pattern: '/api/v1/planning/scenarios'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.diff': {
    methods: ["POST"]
    pattern: '/api/v1/planning/scenarios/diff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/scenarios/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/planning/scenarios/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scenarios.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/planning/scenarios/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduler.of_detail': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/ofs/:of/detail'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { of: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduler.poste_engagement': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/postes/:poste/engagement'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { poste: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'scheduler.shortage_rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/shortages/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'controle_prod.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/controle-prod'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'controle_prod.of_a_solder': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/of-a-solder'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'cockpit.postes': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/cockpit/postes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'cockpit.anomalies_usine': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/cockpit/postes/:poste/anomalies-usine'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { poste: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'cockpit.poste': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/cockpit/postes/:poste'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { poste: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'charge.detail': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/charge/detail'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.assign': {
    methods: ["POST"]
    pattern: '/api/v1/status/assign'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.from_latest_export': {
    methods: ["POST"]
    pattern: '/api/v1/status/from-latest-export'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.palette': {
    methods: ["POST"]
    pattern: '/api/v1/status/palette'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.retard_charge': {
    methods: ["POST"]
    pattern: '/api/v1/status/retard-charge'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/status/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'suivi.proactive_rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/status/proactive-rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dashboard.kpis': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard/kpis'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dashboard.otd': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard/otd'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dashboard.stock_valuation': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard/stock'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dashboard.stock_article_detail': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/dashboard/stock/article'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'user.dashboard_layout.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/user/dashboard-layout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'expeditions.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/expeditions/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'expeditions.forecast': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/expeditions/forecast'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'receptions.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/receptions/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'receptions.criticite': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/receptions/criticite'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'appro.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/appro/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'appro.decision': {
    methods: ["POST"]
    pattern: '/api/v1/appro/decision'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'appro.diff': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/appro/diff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'appro.messagesDiff': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/appro/messages-diff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'appro.articleExplanation': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/appro/article-explanation'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'conditionnements.rows': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/conditionnements/rows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'conditionnements.estimations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/conditionnements/estimations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'promesse.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/promesse'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'data.load': {
    methods: ["POST"]
    pattern: '/api/v1/data/load'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'static_sync.status': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/static/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'static_sync.sync': {
    methods: ["POST"]
    pattern: '/api/v1/static/sync'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.describe': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/x3/writeback/describe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.read': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/x3/writeback/read'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.save': {
    methods: ["POST"]
    pattern: '/api/v1/x3/writeback/save'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.modify': {
    methods: ["POST"]
    pattern: '/api/v1/x3/writeback/modify'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.delete': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/x3/writeback/delete'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.list': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/x3/writeback/list'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_writeback.run': {
    methods: ["POST"]
    pattern: '/api/v1/x3/writeback/run'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'x3_print.test': {
    methods: ["POST"]
    pattern: '/api/v1/x3/print/test'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'perf.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/_perf'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.health': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.chat': {
    methods: ["POST"]
    pattern: '/api/v1/agent/chat'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.metrics': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/metrics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.conversations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/conversations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.conversation': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.conversationsDestroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/agent/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.conversationsUpdate': {
    methods: ["PATCH"]
    pattern: '/api/v1/agent/conversations/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.mcp.app': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/agent/mcp/app'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'agent.mcp.call': {
    methods: ["POST"]
    pattern: '/api/v1/agent/mcp/call'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
}
