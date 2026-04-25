import { useMutation } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/api/client'
import type { LotEcoResponse } from '@/types/lot-eco'

export function useLotEco() {
  return useMutation<LotEcoResponse, ApiError, { targetCoverageWeeks?: number }>({
    mutationFn: ({ targetCoverageWeeks = 4 }) =>
      apiClient.analyseLotEco(targetCoverageWeeks),
  })
}
