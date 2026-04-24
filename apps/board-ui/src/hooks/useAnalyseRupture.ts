import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { AnalyseRuptureResponse } from '@/types/analyse-rupture'

export interface AnalyseRuptureParams {
  componentCode: string
  include_previsions?: boolean
  include_receptions?: boolean
  use_pool?: boolean
  merge_branches?: boolean
  include_sf?: boolean
  include_pf?: boolean
}

export function useAnalyseRupture() {
  return useMutation<AnalyseRuptureResponse, Error, AnalyseRuptureParams>({
    mutationFn: (params) =>
      apiClient.analyserRupture(params.componentCode, params),
  })
}
