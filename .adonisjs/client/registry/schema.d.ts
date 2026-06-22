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
  'scheduler.vision': {
    methods: ["GET","HEAD"]
    pattern: '/vision'
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
  'planning_board.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/ofs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.show': {
    methods: ["GET","HEAD"]
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
  'planning_board.reset_override': {
    methods: ["DELETE"]
    pattern: '/api/v1/planning/ofs/:of/override'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { of: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.list_overrides': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/overrides'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.reset_all': {
    methods: ["DELETE"]
    pattern: '/api/v1/planning/overrides'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.feasibility': {
    methods: ["POST"]
    pattern: '/api/v1/planning/feasibility'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.whatif': {
    methods: ["POST"]
    pattern: '/api/v1/planning/whatif'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.order_impacts': {
    methods: ["POST"]
    pattern: '/api/v1/planning/order-impacts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.list_events': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
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
  'planning_board.shortages': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/shortages'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.nomenclature': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning/nomenclature/:article'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { article: ParamValue }
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
  'planning_board.reload_data': {
    methods: ["POST"]
    pattern: '/api/v1/planning/reload'
    types: {
      body: {}
      paramsTuple: []
      params: {}
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
  'suivi.status_detail': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/status/status/:order'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { order: ParamValue }
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
  'pipeline.supply_board': {
    methods: ["POST"]
    pattern: '/api/v1/pipeline/supply-board'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'pipeline.suivi_status': {
    methods: ["POST"]
    pattern: '/api/v1/pipeline/suivi-status'
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
}
