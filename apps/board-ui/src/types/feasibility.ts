export interface ComponentGap {
  article: string
  description: string
  quantity_needed: number
  quantity_available: number
  quantity_gap: number
  earliest_reception: string | null
  is_purchase: boolean
}

export interface CapacityImpact {
  poste_charge: string
  poste_label: string
  hours_required: number
  hours_available: number
  hours_remaining: number
  utilization_pct: number
}

export interface AffectedOrder {
  num_commande: string
  client: string
  article: string
  quantity: number
  original_date: string
  impact: string
}

export interface ComponentDelta {
  article: string
  description: string
  is_purchase: boolean
  original_needed: number
  original_available: number
  original_gap: number
  simulated_needed: number
  simulated_available: number
  simulated_gap: number
  delta_needed: number
  delta_gap: number
  status: 'unchanged' | 'worse' | 'better' | 'new_gap' | 'resolved'
  earliest_reception: string | null
}

export interface BOMNode {
  article: string
  description: string
  is_purchase: boolean
  quantity_needed: number
  quantity_per_unit: number
  stock_available: number
  stock_gap: number
  status: 'ok' | 'shortage' | 'no_stock_data'
  earliest_reception: string | null
  children: BOMNode[]
}

export interface FeasibilityResponse {
  feasible: boolean
  article: string
  description: string
  quantity: number
  feasible_date: string | null
  desired_date: string | null
  component_gaps: ComponentGap[]
  capacity_impacts: CapacityImpact[]
  affected_orders: AffectedOrder[]
  component_deltas: ComponentDelta[]
  bom_tree: BOMNode[]
  depth_mode: 'level1' | 'full'
  original_date: string | null
  original_quantity: number | null
  alerts: string[]
  computation_ms: number
}

export interface ArticleSearchResult {
  code: string
  description: string
  type_appro: string
}

export interface OrderSearchResult {
  num_commande: string
  article: string
  description: string
  client: string
  type_commande: string
  quantity: number
  quantity_ordered: number
  quantity_allocated: number
  date_expedition: string | null
  nature: string
  categorie: string
}
