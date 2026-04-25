export interface StockMovement {
  iptdat: string
  itmref: string
  qtystu: number
  trstyp: number
  vcrnum: string
  vcrnumori: string
  loc: string
  creusr: string
  stock_avant: number
  stock_apres: number
}

export interface StockAnalytics {
  article: string
  stock_min: number
  stock_max: number
  stock_moyen: number
  rotation: number
  tendance: 'croissante' | 'décroissante' | 'stable'
  nombre_mouvements: number
  periode_debut: string | null
  periode_fin: string | null
}

export interface StockEvolutionResponse {
  article: string
  description: string
  stock_physique: number
  stock_sous_cq: number
  valeur_stock: number
  pmp: number
  stock_min: number
  stock_max: number
  stock_moyen: number
  rotation: number
  tendance: string
  nombre_mouvements: number
  periode_debut: string | null
  periode_fin: string | null
  items: StockMovement[]
}

export interface StockChartStats {
  stock_min: number
  stock_max: number
  stock_moyen: number
  rotation: number
  tendance: string
  nombre_mouvements: number
  periode_debut: string | null
  periode_fin: string | null
}

export interface StockChartData {
  article: string
  dates: string[]
  stocks: number[]
  qtystu: number[]
  trstyp: number[]
  vcrnum: string[]
  stats: StockChartStats
}

// ── Stock Projection ────────────────────────────────────────────

export interface WeeklyProjection {
  week_start: string
  week_label: string
  projected_stock: number
  client_exits: number
  supplier_receptions: number
  production_entries: number
  simulated_replenishment: number
  is_below_threshold: boolean
  cumul_exits: number
}

export interface StockProjectionResponse {
  article: string
  description: string
  stock_initial: number
  lot_eco: number
  lot_optimal: number
  delai_reappro_jours: number
  demande_hebdo: number
  threshold: number
  horizon_weeks: number
  weeks: WeeklyProjection[]
  rupture_week: number | null
}
