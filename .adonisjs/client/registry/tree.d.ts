/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    login: typeof routes['auth.login']
    attempt: typeof routes['auth.attempt']
    logout: typeof routes['auth.logout']
  }
  assets: {
    unpolyJs: typeof routes['assets.unpoly_js']
    unpolyCss: typeof routes['assets.unpoly_css']
    css: typeof routes['assets.css']
    js: typeof routes['assets.js']
  }
  health: {
    index: typeof routes['health.index']
  }
  home: typeof routes['home']
  designSystem: typeof routes['design_system']
  scheduler: {
    expertBoard: typeof routes['scheduler.expert_board']
    shortageTracker: typeof routes['scheduler.shortage_tracker']
    ofDetail: typeof routes['scheduler.of_detail']
    shortageRows: typeof routes['scheduler.shortage_rows']
  }
  orderPlanning: {
    board: typeof routes['order_planning.board']
    index: typeof routes['order_planning.index']
    lineDetail: typeof routes['order_planning.line_detail']
    update: typeof routes['order_planning.update']
    resetOverride: typeof routes['order_planning.reset_override']
  }
  suivi: {
    board: typeof routes['suivi.board']
    assign: typeof routes['suivi.assign']
    fromLatestExport: typeof routes['suivi.from_latest_export']
    statusDetail: typeof routes['suivi.status_detail']
    palette: typeof routes['suivi.palette']
    retardCharge: typeof routes['suivi.retard_charge']
    rows: typeof routes['suivi.rows']
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
    ofMaterials: typeof routes['planning_board.of_materials']
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
}
