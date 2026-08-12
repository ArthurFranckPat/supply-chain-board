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
    faviconSvg: typeof routes['assets.favicon_svg']
    faviconIco: typeof routes['assets.favicon_ico']
    favicon32X32Png: typeof routes['assets.favicon_32x32_png']
    favicon16X16Png: typeof routes['assets.favicon_16x16_png']
    appleTouchIconPng: typeof routes['assets.apple_touch_icon_png']
    siteWebmanifest: typeof routes['assets.site_webmanifest']
  }
  health: {
    index: typeof routes['health.index']
  }
  dashboard: typeof routes['dashboard'] & {
    kpis: typeof routes['dashboard.kpis']
    otd: typeof routes['dashboard.otd']
    stockValuation: typeof routes['dashboard.stock_valuation']
    stockArticleDetail: typeof routes['dashboard.stock_article_detail']
  }
  designSystem: typeof routes['design_system']
  diagnosticTest: typeof routes['diagnostic_test']
  reactLab: typeof routes['react_lab']
  x3WritebackTest: typeof routes['x3_writeback_test']
  x3PrintTest: typeof routes['x3_print_test']
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
  controleProd: {
    index: typeof routes['controle_prod.index']
    rows: typeof routes['controle_prod.rows']
    ofASolder: typeof routes['controle_prod.of_a_solder']
  }
  cockpit: {
    index: typeof routes['cockpit.index']
    postes: typeof routes['cockpit.postes']
    anomaliesUsine: typeof routes['cockpit.anomalies_usine']
    poste: typeof routes['cockpit.poste']
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
  sequenceur: {
    index: typeof routes['sequenceur.index']
  }
  load: {
    index: typeof routes['load.index']
  }
  expeditions: {
    index: typeof routes['expeditions.index']
    rows: typeof routes['expeditions.rows']
    forecast: typeof routes['expeditions.forecast']
  }
  receptions: {
    index: typeof routes['receptions.index']
    rows: typeof routes['receptions.rows']
    criticite: typeof routes['receptions.criticite']
  }
  approvisionnements: {
    index: typeof routes['approvisionnements.index']
  }
  besoins: {
    evolution: typeof routes['besoins.evolution']
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
    metrics: typeof routes['agent.metrics']
    conversations: typeof routes['agent.conversations']
    conversation: typeof routes['agent.conversation']
    conversationsDestroy: typeof routes['agent.conversationsDestroy']
    mcp: {
      app: typeof routes['agent.mcp.app']
      call: typeof routes['agent.mcp.call']
    }
  }
  calendarConfig: {
    index: typeof routes['calendar_config.index']
    toggleHoliday: typeof routes['calendar_config.toggle_holiday']
    createClosure: typeof routes['calendar_config.create_closure']
    updateClosure: typeof routes['calendar_config.update_closure']
    deleteClosure: typeof routes['calendar_config.delete_closure']
  }
  printConfig: {
    index: typeof routes['print_config.index']
    destinations: typeof routes['print_config.destinations']
    updateSettings: typeof routes['print_config.update_settings']
    upsertRule: typeof routes['print_config.upsert_rule']
    deleteRule: typeof routes['print_config.delete_rule']
    upsertDocument: typeof routes['print_config.upsert_document']
    deleteDocument: typeof routes['print_config.delete_document']
    jobs: typeof routes['print_config.jobs']
    reconcile: typeof routes['print_config.reconcile']
  }
  printJournal: typeof routes['print_journal'] & {
    rows: typeof routes['print_journal.rows']
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
  print: {
    documents: typeof routes['print.documents']
    print: typeof routes['print.print']
    history: typeof routes['print.history']
  }
  charge: {
    detail: typeof routes['charge.detail']
  }
  user: {
    dashboardLayout: {
      update: typeof routes['user.dashboard_layout.update']
    }
  }
  appro: {
    rows: typeof routes['appro.rows']
    decision: typeof routes['appro.decision']
    diff: typeof routes['appro.diff']
    messagesDiff: typeof routes['appro.messagesDiff']
    snapshots: typeof routes['appro.snapshots']
    articleExplanation: typeof routes['appro.articleExplanation']
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
  x3Print: {
    test: typeof routes['x3_print.test']
  }
  perf: {
    index: typeof routes['perf.index']
  }
}
