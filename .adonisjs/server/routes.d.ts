import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health.index': { paramsTuple?: []; params?: {} }
    'x_3_debug.index': { paramsTuple?: []; params?: {} }
    'planning_board.board': { paramsTuple?: []; params?: {} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.reset_override': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.reset_all': { paramsTuple?: []; params?: {} }
    'planning_board.feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.whatif': { paramsTuple?: []; params?: {} }
    'planning_board.order_impacts': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.board_feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.reload_data': { paramsTuple?: []; params?: {} }
    'suivi.assign': { paramsTuple?: []; params?: {} }
    'suivi.from_latest_export': { paramsTuple?: []; params?: {} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'noCommande': ParamValue} }
    'suivi.palette': { paramsTuple?: []; params?: {} }
    'suivi.retard_charge': { paramsTuple?: []; params?: {} }
    'pipeline.supply_board': { paramsTuple?: []; params?: {} }
    'pipeline.suivi_status': { paramsTuple?: []; params?: {} }
    'x_3_data.load': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'health.index': { paramsTuple?: []; params?: {} }
    'x_3_debug.index': { paramsTuple?: []; params?: {} }
    'planning_board.board': { paramsTuple?: []; params?: {} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'noCommande': ParamValue} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'health.index': { paramsTuple?: []; params?: {} }
    'x_3_debug.index': { paramsTuple?: []; params?: {} }
    'planning_board.board': { paramsTuple?: []; params?: {} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'noCommande': ParamValue} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
  }
  DELETE: {
    'planning_board.reset_override': { paramsTuple: [ParamValue]; params: {'numOf': ParamValue} }
    'planning_board.reset_all': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'planning_board.feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.whatif': { paramsTuple?: []; params?: {} }
    'planning_board.order_impacts': { paramsTuple?: []; params?: {} }
    'planning_board.board_feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.reload_data': { paramsTuple?: []; params?: {} }
    'suivi.assign': { paramsTuple?: []; params?: {} }
    'suivi.from_latest_export': { paramsTuple?: []; params?: {} }
    'suivi.palette': { paramsTuple?: []; params?: {} }
    'suivi.retard_charge': { paramsTuple?: []; params?: {} }
    'pipeline.supply_board': { paramsTuple?: []; params?: {} }
    'pipeline.suivi_status': { paramsTuple?: []; params?: {} }
    'x_3_data.load': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}