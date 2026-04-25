import type { AnalyseRuptureResponse } from '@/types/analyse-rupture'
import type { EolResidualsResponse } from '@/types/eol-residuals'
import type { ResidualFabricationResponse } from '@/types/residual-fabrication'
import type { LotEcoResponse, TarifAchat } from '@/types/lot-eco'
import type { StockProjectionResponse } from '@/types/stock-evolution'
import { apiRequest } from '@/api/core'

export const analyseApi = {
  analyserRupture(componentCode: string, options?: {
    include_previsions?: boolean
    include_receptions?: boolean
    use_pool?: boolean
    merge_branches?: boolean
    include_sf?: boolean
    include_pf?: boolean
  }) {
    return apiRequest<AnalyseRuptureResponse>('/api/v1/analyse-rupture', {
      method: 'POST',
      body: JSON.stringify({
        component_code: componentCode,
        include_previsions: options?.include_previsions ?? false,
        include_receptions: options?.include_receptions ?? false,
        use_pool: options?.use_pool ?? true,
        merge_branches: options?.merge_branches ?? true,
        include_sf: options?.include_sf ?? true,
        include_pf: options?.include_pf ?? false,
      }),
    })
  },

  eolResidualsAnalysis(data: {
    familles?: string[]
    prefixes?: string[]
    bom_depth_mode?: string
    stock_mode?: string
    component_types?: string
    projection_date?: string
  }) {
    return apiRequest<EolResidualsResponse>('/api/v1/eol-residuals', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  eolResidualsFabricable(data: {
    familles?: string[]
    prefixes?: string[]
    desired_qty?: number
    bom_depth_mode?: string
    stock_mode?: string
    projection_date?: string
  }) {
    return apiRequest<ResidualFabricationResponse>('/api/v1/eol-residuals/fabricable', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  analyseLotEco(targetCoverageWeeks = 4) {
    return apiRequest<LotEcoResponse>(`/api/v1/analyse-lot-eco?target_coverage_weeks=${targetCoverageWeeks}`, { method: 'POST' })
  },

  getTarifs(article: string) {
    return apiRequest<TarifAchat[]>(`/api/v1/tarifs/${encodeURIComponent(article)}`)
  },

  projectStock(data: {
    article: string
    stock_initial: number
    lot_eco: number
    lot_optimal: number
    delai_reappro_jours: number
    demande_hebdo: number
    horizon_weeks?: number
  }) {
    return apiRequest<StockProjectionResponse>('/api/v1/stock-projection', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}
