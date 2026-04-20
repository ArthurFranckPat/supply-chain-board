export interface ResidualComponentGap {
  article: string
  description: string
  qty_needed: number
  qty_available: number
  shortage_qty: number
  is_purchase: boolean
  path: string[]
}

export interface ResidualFabricationResult {
  pf_article: string
  description: string
  desired_qty: number
  feasible: boolean
  max_feasible_qty: number
  stock_gaps: ResidualComponentGap[]
  alerts: string[]
}

export type ResidualFabricationResponse = ResidualFabricationResult[]
