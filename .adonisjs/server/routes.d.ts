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
    'dashboard': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'diagnostic_test': { paramsTuple?: []; params?: {} }
    'x3_writeback_test': { paramsTuple?: []; params?: {} }
    'scheduling': { paramsTuple?: []; params?: {} }
    'planning': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.programme': { paramsTuple?: []; params?: {} }
    'load.index': { paramsTuple?: []; params?: {} }
    'calendar_config.index': { paramsTuple?: []; params?: {} }
    'calendar_config.toggle_holiday': { paramsTuple?: []; params?: {} }
    'calendar_config.create_closure': { paramsTuple?: []; params?: {} }
    'calendar_config.update_closure': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'calendar_config.delete_closure': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'order_planning.update': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'order_planning.reset_override': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning_board.board_feasibility': { paramsTuple?: []; params?: {} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials_diagnostic': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'planning.suggestion_firm': { paramsTuple: [ParamValue]; params: {'sugNum': ParamValue} }
    'planning.order_firm': { paramsTuple: [ParamValue]; params: {'orderNum': ParamValue} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.assign': { paramsTuple?: []; params?: {} }
    'suivi.from_latest_export': { paramsTuple?: []; params?: {} }
    'suivi.palette': { paramsTuple?: []; params?: {} }
    'suivi.retard_charge': { paramsTuple?: []; params?: {} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'dashboard.kpis': { paramsTuple?: []; params?: {} }
    'dashboard.otd': { paramsTuple?: []; params?: {} }
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
    'x3_writeback.describe': { paramsTuple?: []; params?: {} }
    'x3_writeback.read': { paramsTuple?: []; params?: {} }
    'x3_writeback.save': { paramsTuple?: []; params?: {} }
    'x3_writeback.modify': { paramsTuple?: []; params?: {} }
    'x3_writeback.delete': { paramsTuple?: []; params?: {} }
    'x3_writeback.list': { paramsTuple?: []; params?: {} }
    'x3_writeback.run': { paramsTuple?: []; params?: {} }
    'perf.index': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'auth.login': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'diagnostic_test': { paramsTuple?: []; params?: {} }
    'x3_writeback_test': { paramsTuple?: []; params?: {} }
    'scheduling': { paramsTuple?: []; params?: {} }
    'planning': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.programme': { paramsTuple?: []; params?: {} }
    'load.index': { paramsTuple?: []; params?: {} }
    'calendar_config.index': { paramsTuple?: []; params?: {} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials_diagnostic': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'dashboard.kpis': { paramsTuple?: []; params?: {} }
    'dashboard.otd': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'x3_writeback.describe': { paramsTuple?: []; params?: {} }
    'x3_writeback.read': { paramsTuple?: []; params?: {} }
    'x3_writeback.delete': { paramsTuple?: []; params?: {} }
    'x3_writeback.list': { paramsTuple?: []; params?: {} }
    'perf.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'auth.login': { paramsTuple?: []; params?: {} }
    'assets.css': { paramsTuple?: []; params?: {} }
    'assets.js': { paramsTuple?: []; params?: {} }
    'health.index': { paramsTuple?: []; params?: {} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'design_system': { paramsTuple?: []; params?: {} }
    'diagnostic_test': { paramsTuple?: []; params?: {} }
    'x3_writeback_test': { paramsTuple?: []; params?: {} }
    'scheduling': { paramsTuple?: []; params?: {} }
    'planning': { paramsTuple?: []; params?: {} }
    'scheduler.shortage_tracker': { paramsTuple?: []; params?: {} }
    'suivi.board': { paramsTuple?: []; params?: {} }
    'scheduler.programme': { paramsTuple?: []; params?: {} }
    'load.index': { paramsTuple?: []; params?: {} }
    'calendar_config.index': { paramsTuple?: []; params?: {} }
    'order_planning.index': { paramsTuple?: []; params?: {} }
    'order_planning.line_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.articles_by_component': { paramsTuple: [ParamValue]; params: {'component': ParamValue} }
    'planning_board.search_poste': { paramsTuple?: []; params?: {} }
    'planning_board.search_of': { paramsTuple?: []; params?: {} }
    'planning_board.search_pf': { paramsTuple?: []; params?: {} }
    'planning_board.of_materials_diagnostic': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.of_detail': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
    'scheduler.shortage_rows': { paramsTuple?: []; params?: {} }
    'suivi.rows': { paramsTuple?: []; params?: {} }
    'suivi.proactive_rows': { paramsTuple?: []; params?: {} }
    'dashboard.kpis': { paramsTuple?: []; params?: {} }
    'dashboard.otd': { paramsTuple?: []; params?: {} }
    'static_sync.status': { paramsTuple?: []; params?: {} }
    'x3_writeback.describe': { paramsTuple?: []; params?: {} }
    'x3_writeback.read': { paramsTuple?: []; params?: {} }
    'x3_writeback.delete': { paramsTuple?: []; params?: {} }
    'x3_writeback.list': { paramsTuple?: []; params?: {} }
    'perf.index': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.attempt': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'calendar_config.toggle_holiday': { paramsTuple?: []; params?: {} }
    'calendar_config.create_closure': { paramsTuple?: []; params?: {} }
    'planning_board.board_feasibility': { paramsTuple?: []; params?: {} }
    'planning.suggestion_firm': { paramsTuple: [ParamValue]; params: {'sugNum': ParamValue} }
    'planning.order_firm': { paramsTuple: [ParamValue]; params: {'orderNum': ParamValue} }
    'suivi.assign': { paramsTuple?: []; params?: {} }
    'suivi.from_latest_export': { paramsTuple?: []; params?: {} }
    'suivi.palette': { paramsTuple?: []; params?: {} }
    'suivi.retard_charge': { paramsTuple?: []; params?: {} }
    'data.load': { paramsTuple?: []; params?: {} }
    'static_sync.sync': { paramsTuple?: []; params?: {} }
    'x3_writeback.save': { paramsTuple?: []; params?: {} }
    'x3_writeback.modify': { paramsTuple?: []; params?: {} }
    'x3_writeback.run': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'calendar_config.update_closure': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'order_planning.update': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
    'planning_board.update': { paramsTuple: [ParamValue]; params: {'of': ParamValue} }
  }
  DELETE: {
    'calendar_config.delete_closure': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'order_planning.reset_override': { paramsTuple: [ParamValue,ParamValue]; params: {'order': ParamValue,'line': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}