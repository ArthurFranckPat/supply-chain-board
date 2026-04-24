import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { EolResidualsResponse } from '@/types/eol-residuals'

export function useEolResiduals() {
  return useMutation<EolResidualsResponse, Error, {
    familles?: string[]; prefixes?: string[]
    bom_depth_mode?: string; stock_mode?: string
    component_types?: string; projection_date?: string
  }>({
    mutationFn: (params) => apiClient.eolResidualsAnalysis(params),
  })
}
