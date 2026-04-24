import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { StockEvolutionResponse } from '@/types/stock-evolution'

export function useStockEvolution() {
  return useMutation<StockEvolutionResponse, Error, {
    itmref: string; horizon_days?: number; include_internal?: boolean
  }>({
    mutationFn: (params) =>
      apiClient.getStockEvolution(params.itmref, {
        horizon_days: params.horizon_days,
        include_internal: params.include_internal,
      }),
  })
}
