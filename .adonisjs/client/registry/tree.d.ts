/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    login: typeof routes['auth.login']
    attempt: typeof routes['auth.attempt']
    logout: typeof routes['auth.logout']
  }
  assets: {
    css: typeof routes['assets.css']
    js: typeof routes['assets.js']
  }
  health: {
    index: typeof routes['health.index']
  }
  dashboard: typeof routes['dashboard']
  designSystem: typeof routes['design_system']
  diagnosticTest: typeof routes['diagnostic_test']
  x3WritebackTest: typeof routes['x3_writeback_test']
  scheduling: typeof routes['scheduling']
  planning: typeof routes['planning'] & {
    suggestionFirm: typeof routes['planning.suggestion_firm']
    orderFirm: typeof routes['planning.order_firm']
  }
  scheduler: {
    shortageTracker: typeof routes['scheduler.shortage_tracker']
    vision: typeof routes['scheduler.vision']
    ofDetail: typeof routes['scheduler.of_detail']
    shortageRows: typeof routes['scheduler.shortage_rows']
  }
  suivi: {
    board: typeof routes['suivi.board']
    assign: typeof routes['suivi.assign']
    fromLatestExport: typeof routes['suivi.from_latest_export']
    statusDetail: typeof routes['suivi.status_detail']
    palette: typeof routes['suivi.palette']
    retardCharge: typeof routes['suivi.retard_charge']
    rows: typeof routes['suivi.rows']
    proactiveRows: typeof routes['suivi.proactive_rows']
  }
  orderPlanning: {
    index: typeof routes['order_planning.index']
    lineDetail: typeof routes['order_planning.line_detail']
    update: typeof routes['order_planning.update']
    resetOverride: typeof routes['order_planning.reset_override']
  }
  planningBoard: {
    index: typeof routes['planning_board.index']
    show: typeof routes['planning_board.show']
    update: typeof routes['planning_board.update']
    resetOverride: typeof routes['planning_board.reset_override']
    listOverrides: typeof routes['planning_board.list_overrides']
    resetAll: typeof routes['planning_board.reset_all']
    feasibility: typeof routes['planning_board.feasibility']
    whatif: typeof routes['planning_board.whatif']
    orderImpacts: typeof routes['planning_board.order_impacts']
    listEvents: typeof routes['planning_board.list_events']
    boardFeasibility: typeof routes['planning_board.board_feasibility']
    shortages: typeof routes['planning_board.shortages']
    nomenclature: typeof routes['planning_board.nomenclature']
    articlesByComponent: typeof routes['planning_board.articles_by_component']
    searchPoste: typeof routes['planning_board.search_poste']
    searchOf: typeof routes['planning_board.search_of']
    searchPf: typeof routes['planning_board.search_pf']
    ofMaterialsDiagnostic: typeof routes['planning_board.of_materials_diagnostic']
    reloadData: typeof routes['planning_board.reload_data']
  }
  pipeline: {
    supplyBoard: typeof routes['pipeline.supply_board']
    suiviStatus: typeof routes['pipeline.suivi_status']
  }
  data: {
    load: typeof routes['data.load']
  }
  staticSync: {
    status: typeof routes['static_sync.status']
    sync: typeof routes['static_sync.sync']
  }
  x3Writeback: {
    describe: typeof routes['x3_writeback.describe']
    read: typeof routes['x3_writeback.read']
    save: typeof routes['x3_writeback.save']
    modify: typeof routes['x3_writeback.modify']
    delete: typeof routes['x3_writeback.delete']
    list: typeof routes['x3_writeback.list']
    run: typeof routes['x3_writeback.run']
  }
}
