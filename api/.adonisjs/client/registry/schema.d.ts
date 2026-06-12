/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
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
  'planning_board.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning-board/ofs'
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
    pattern: '/api/v1/planning-board/ofs/:numOf'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { numOf: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/planning-board/ofs/:numOf'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { numOf: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.reset_override': {
    methods: ["DELETE"]
    pattern: '/api/v1/planning-board/ofs/:numOf/override'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { numOf: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'planning_board.list_overrides': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/planning-board/overrides'
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
    pattern: '/api/v1/planning-board/overrides'
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
    pattern: '/api/v1/planning-board/feasibility'
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
    pattern: '/api/v1/planning-board/whatif'
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
    pattern: '/api/v1/planning-board/order-impacts'
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
    pattern: '/api/v1/planning-board/events'
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
    pattern: '/api/v1/status/status/:noCommande'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { noCommande: ParamValue }
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
  'x_3_data.load': {
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
}
