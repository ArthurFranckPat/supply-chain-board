/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: {
    index: typeof routes['health.index']
  }
  x3Debug: {
    index: typeof routes['x_3_debug.index']
  }
  planningBoard: {
    board: typeof routes['planning_board.board']
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
    nomenclature: typeof routes['planning_board.nomenclature']
    articlesByComponent: typeof routes['planning_board.articles_by_component']
    ofMaterials: typeof routes['planning_board.of_materials']
    reloadData: typeof routes['planning_board.reload_data']
  }
  scheduler: {
    expertBoard: typeof routes['scheduler.expert_board']
    ofDetail: typeof routes['scheduler.of_detail']
  }
  suivi: {
    assign: typeof routes['suivi.assign']
    fromLatestExport: typeof routes['suivi.from_latest_export']
    statusDetail: typeof routes['suivi.status_detail']
    palette: typeof routes['suivi.palette']
    retardCharge: typeof routes['suivi.retard_charge']
  }
  pipeline: {
    supplyBoard: typeof routes['pipeline.supply_board']
    suiviStatus: typeof routes['pipeline.suivi_status']
  }
  x3Data: {
    load: typeof routes['x_3_data.load']
  }
  staticSync: {
    status: typeof routes['static_sync.status']
    sync: typeof routes['static_sync.sync']
  }
}
