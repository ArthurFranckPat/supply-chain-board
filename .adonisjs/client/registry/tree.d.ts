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
  dashboard: typeof routes['dashboard'] & {
    kpis: typeof routes['dashboard.kpis']
    otd: typeof routes['dashboard.otd']
    stockValuation: typeof routes['dashboard.stock_valuation']
  }
  designSystem: typeof routes['design_system']
  diagnosticTest: typeof routes['diagnostic_test']
  reactLab: typeof routes['react_lab']
  x3WritebackTest: typeof routes['x3_writeback_test']
  scheduling: typeof routes['scheduling']
  planning: typeof routes['planning'] & {
    suggestionFirm: typeof routes['planning.suggestion_firm']
    orderFirm: typeof routes['planning.order_firm']
  }
  scheduler: {
    shortageTracker: typeof routes['scheduler.shortage_tracker']
    programme: typeof routes['scheduler.programme']
    ofDetail: typeof routes['scheduler.of_detail']
    posteEngagement: typeof routes['scheduler.poste_engagement']
    shortageRows: typeof routes['scheduler.shortage_rows']
  }
  suivi: {
    board: typeof routes['suivi.board']
    assign: typeof routes['suivi.assign']
    fromLatestExport: typeof routes['suivi.from_latest_export']
    palette: typeof routes['suivi.palette']
    retardCharge: typeof routes['suivi.retard_charge']
    rows: typeof routes['suivi.rows']
    proactiveRows: typeof routes['suivi.proactive_rows']
  }
  scenarios: {
    compare: typeof routes['scenarios.compare']
    index: typeof routes['scenarios.index']
    store: typeof routes['scenarios.store']
    diff: typeof routes['scenarios.diff']
    show: typeof routes['scenarios.show']
    update: typeof routes['scenarios.update']
    destroy: typeof routes['scenarios.destroy']
  }
  load: {
    index: typeof routes['load.index']
  }
  expeditions: {
    index: typeof routes['expeditions.index']
    rows: typeof routes['expeditions.rows']
  }
  receptions: {
    index: typeof routes['receptions.index']
    rows: typeof routes['receptions.rows']
  }
  conditionnements: {
    index: typeof routes['conditionnements.index']
    rows: typeof routes['conditionnements.rows']
    estimations: typeof routes['conditionnements.estimations']
  }
  promesse: {
    show: typeof routes['promesse.show']
    index: typeof routes['promesse.index']
    articles: typeof routes['promesse.articles']
  }
  agent: {
    show: typeof routes['agent.show']
    health: typeof routes['agent.health']
    chat: typeof routes['agent.chat']
  }
  calendarConfig: {
    index: typeof routes['calendar_config.index']
    toggleHoliday: typeof routes['calendar_config.toggle_holiday']
    createClosure: typeof routes['calendar_config.create_closure']
    updateClosure: typeof routes['calendar_config.update_closure']
    deleteClosure: typeof routes['calendar_config.delete_closure']
  }
  orderPlanning: {
    index: typeof routes['order_planning.index']
    lineDetail: typeof routes['order_planning.line_detail']
    update: typeof routes['order_planning.update']
    resetOverride: typeof routes['order_planning.reset_override']
  }
  planningBoard: {
    update: typeof routes['planning_board.update']
    boardFeasibility: typeof routes['planning_board.board_feasibility']
    articlesByComponent: typeof routes['planning_board.articles_by_component']
    searchPoste: typeof routes['planning_board.search_poste']
    searchOf: typeof routes['planning_board.search_of']
    searchPf: typeof routes['planning_board.search_pf']
    ofMaterialsDiagnostic: typeof routes['planning_board.of_materials_diagnostic']
  }
  user: {
    dashboardLayout: {
      update: typeof routes['user.dashboard_layout.update']
    }
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
  perf: {
    index: typeof routes['perf.index']
  }
}
