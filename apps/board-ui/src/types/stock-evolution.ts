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
  stock_actuel: number
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

export interface StockChartData {
  article: string
  dates: string[]
  stocks: number[]
  qtystu: number[]
  trstyp: number[]
  vcrnum: string[]
  stats: Record<string, unknown>
}
