import type { StockEvolutionResponse, StockChartData, StockProjectionResponse } from '@/types/stock-evolution'
import { apiRequest } from '@/api/core'

export const stockApi = {
  getStockEvolution(itmref: string, options?: { horizon_days?: number; include_internal?: boolean; include_stock_q?: boolean }) {
    const params = new URLSearchParams({ itmref })
    if (options?.horizon_days) params.set('horizon_days', String(options.horizon_days))
    if (options?.include_internal) params.set('include_internal', 'true')
    if (options?.include_stock_q) params.set('include_stock_q', 'true')
    return apiRequest<StockEvolutionResponse>(`/api/v1/stock-evolution/${encodeURIComponent(itmref)}?${params}`)
  },

  getStockEvolutionChart(itmref: string, options?: { horizon_days?: number; include_internal?: boolean }) {
    const params = new URLSearchParams({ itmref })
    if (options?.horizon_days) params.set('horizon_days', String(options.horizon_days))
    if (options?.include_internal) params.set('include_internal', 'true')
    return apiRequest<StockChartData>(`/api/v1/stock-evolution/${encodeURIComponent(itmref)}/chart?${params}`)
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
