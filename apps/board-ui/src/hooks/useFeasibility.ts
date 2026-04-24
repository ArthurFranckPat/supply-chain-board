import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { FeasibilityResponse } from '@/types/feasibility'

export function useFeasibility() {
  const check = useMutation<FeasibilityResponse, Error, {
    article: string; quantity: number; desired_date: string
    use_receptions?: boolean; check_capacity?: boolean; depth_mode?: string
  }>({
    mutationFn: (params) => apiClient.checkFeasibility(params),
  })

  const findPromise = useMutation<FeasibilityResponse, Error, {
    article: string; quantity: number; max_horizon_days?: number
  }>({
    mutationFn: (params) => apiClient.findPromiseDate(params),
  })

  const reschedule = useMutation<FeasibilityResponse, Error, {
    num_commande: string; article: string; new_date: string
    new_quantity?: number; depth_mode?: string; use_receptions?: boolean
  }>({
    mutationFn: (params) => apiClient.simulateReschedule(params),
  })

  return { check, findPromise, reschedule }
}
