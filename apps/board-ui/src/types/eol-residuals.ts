export interface EolComponent {
  article: string
  description: string
  component_type: 'ACHAT' | 'FABRICATION'
  used_by_target_pf_count: number
  stock_qty: number
  pmp: number
  value: number
}

export interface EolSummary {
  target_pf_count: number
  unique_component_count: number
  total_stock_qty: number
  total_value: number
}

export interface EolResidualsResult {
  summary: EolSummary
  components: EolComponent[]
  warnings: string[]
}

export interface EolResidualsResponse extends EolResidualsResult {}
