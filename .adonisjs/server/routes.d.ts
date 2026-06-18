import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'assets.unpoly_js': { paramsTuple?: []; params?: {} }
    'assets.unpoly_css': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
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
    'pipeline.supply_board': { paramsTuple?: []; params?: {} }
    'pipeline.suivi_status': { paramsTuple?: []; params?: {} }
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'assets.unpoly_js': { paramsTuple?: []; params?: {} }
    'assets.unpoly_css': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
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
    'static_sync.status': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'assets.unpoly_js': { paramsTuple?: []; params?: {} }
    'assets.unpoly_css': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'scheduler.expert_board': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'order_planning.board': { paramsTuple?: []; params?: {} }
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
    'static_sync.status': { paramsTuple?: []; params?: {} }
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
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}