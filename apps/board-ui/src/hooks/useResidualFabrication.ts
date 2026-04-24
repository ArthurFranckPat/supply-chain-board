import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { ResidualFabricationResponse } from '@/types/residual-fabrication'

export function useResidualFabrication() {
  return useMutation<ResidualFabricationResponse, Error, {
    familles?: string[]; prefixes?: string[]
    desired_qty?: number; bom_depth_mode?: string
    stock_mode?: string; projection_date?: string
  }>({
    mutationFn: (params) => apiClient.eolResidualsFabricable(params),
  })
}
