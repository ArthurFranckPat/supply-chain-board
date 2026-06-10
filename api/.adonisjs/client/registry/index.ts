/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health']['types'],
  },
  'planning_board.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning-board/ofs',
    tokens: [{"old":"/api/v1/planning-board/ofs","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/ofs","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/ofs","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/ofs","type":0,"val":"ofs","end":""}],
    types: placeholder as Registry['planning_board.index']['types'],
  },
  'planning_board.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning-board/ofs/:numOf',
    tokens: [{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":1,"val":"numOf","end":""}],
    types: placeholder as Registry['planning_board.show']['types'],
  },
  'planning_board.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/planning-board/ofs/:numOf',
    tokens: [{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning-board/ofs/:numOf","type":1,"val":"numOf","end":""}],
    types: placeholder as Registry['planning_board.update']['types'],
  },
  'planning_board.reset_override': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning-board/ofs/:numOf/override',
    tokens: [{"old":"/api/v1/planning-board/ofs/:numOf/override","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/ofs/:numOf/override","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/ofs/:numOf/override","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/ofs/:numOf/override","type":0,"val":"ofs","end":""},{"old":"/api/v1/planning-board/ofs/:numOf/override","type":1,"val":"numOf","end":""},{"old":"/api/v1/planning-board/ofs/:numOf/override","type":0,"val":"override","end":""}],
    types: placeholder as Registry['planning_board.reset_override']['types'],
  },
  'planning_board.list_overrides': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning-board/overrides',
    tokens: [{"old":"/api/v1/planning-board/overrides","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"overrides","end":""}],
    types: placeholder as Registry['planning_board.list_overrides']['types'],
  },
  'planning_board.reset_all': {
    methods: ["DELETE"],
    pattern: '/api/v1/planning-board/overrides',
    tokens: [{"old":"/api/v1/planning-board/overrides","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/overrides","type":0,"val":"overrides","end":""}],
    types: placeholder as Registry['planning_board.reset_all']['types'],
  },
  'planning_board.feasibility': {
    methods: ["POST"],
    pattern: '/api/v1/planning-board/feasibility',
    tokens: [{"old":"/api/v1/planning-board/feasibility","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/feasibility","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/feasibility","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/feasibility","type":0,"val":"feasibility","end":""}],
    types: placeholder as Registry['planning_board.feasibility']['types'],
  },
  'planning_board.whatif': {
    methods: ["POST"],
    pattern: '/api/v1/planning-board/whatif',
    tokens: [{"old":"/api/v1/planning-board/whatif","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/whatif","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/whatif","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/whatif","type":0,"val":"whatif","end":""}],
    types: placeholder as Registry['planning_board.whatif']['types'],
  },
  'planning_board.order_impacts': {
    methods: ["POST"],
    pattern: '/api/v1/planning-board/order-impacts',
    tokens: [{"old":"/api/v1/planning-board/order-impacts","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/order-impacts","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/order-impacts","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/order-impacts","type":0,"val":"order-impacts","end":""}],
    types: placeholder as Registry['planning_board.order_impacts']['types'],
  },
  'planning_board.list_events': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/planning-board/events',
    tokens: [{"old":"/api/v1/planning-board/events","type":0,"val":"api","end":""},{"old":"/api/v1/planning-board/events","type":0,"val":"v1","end":""},{"old":"/api/v1/planning-board/events","type":0,"val":"planning-board","end":""},{"old":"/api/v1/planning-board/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['planning_board.list_events']['types'],
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
    pattern: '/api/v1/status/status/:noCommande',
    tokens: [{"old":"/api/v1/status/status/:noCommande","type":0,"val":"api","end":""},{"old":"/api/v1/status/status/:noCommande","type":0,"val":"v1","end":""},{"old":"/api/v1/status/status/:noCommande","type":0,"val":"status","end":""},{"old":"/api/v1/status/status/:noCommande","type":0,"val":"status","end":""},{"old":"/api/v1/status/status/:noCommande","type":1,"val":"noCommande","end":""}],
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
  'x_3_data.load': {
    methods: ["POST"],
    pattern: '/api/v1/data/load',
    tokens: [{"old":"/api/v1/data/load","type":0,"val":"api","end":""},{"old":"/api/v1/data/load","type":0,"val":"v1","end":""},{"old":"/api/v1/data/load","type":0,"val":"data","end":""},{"old":"/api/v1/data/load","type":0,"val":"load","end":""}],
    types: placeholder as Registry['x_3_data.load']['types'],
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
