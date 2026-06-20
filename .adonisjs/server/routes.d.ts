import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.attempt': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'tableau': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.vision': { paramsTuple?: []; params?: {} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'order_planning.update': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'order_planning.reset_override': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.reset_override': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.reset_all': { paramsTuple?: []; params?: {} }
    'planning_board.feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.whatif': { paramsTuple?: []; params?: {} }
    'planning_board.order_impacts': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.board_feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.shortages': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.reload_data': { paramsTuple?: []; params?: {} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.assign': { paramsTuple?: []; params?: {} }
    'suivi.from_latest_export': { paramsTuple?: []; params?: {} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'order': ParamValue} }
    'suivi.palette': { paramsTuple?: []; params?: {} }
    'suivi.retard_charge': { paramsTuple?: []; params?: {} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'pipeline.supply_board': { paramsTuple?: []; params?: {} }
    'pipeline.suivi_status': { paramsTuple?: []; params?: {} }
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'auth.login': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'tableau': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.vision': { paramsTuple?: []; params?: {} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.shortages': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'order': ParamValue} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'auth.login': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'tableau': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.vision': { paramsTuple?: []; params?: {} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.index': { paramsTuple?: []; params?: {} }
    'planning_board.show': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.list_overrides': { paramsTuple?: []; params?: {} }
    'planning_board.list_events': { paramsTuple?: []; params?: {} }
    'planning_board.shortages': { paramsTuple?: []; params?: {} }
    'planning_board.nomenclature': { paramsTuple: [ParamValue]; params: {'article': ParamValue} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.status_detail': { paramsTuple: [ParamValue]; params: {'order': ParamValue} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.attempt': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
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
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'order_planning.update': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
  }
  DELETE: {
    'order_planning.reset_override': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.reset_override': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.reset_all': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}