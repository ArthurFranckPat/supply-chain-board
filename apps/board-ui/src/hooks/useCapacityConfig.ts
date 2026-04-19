import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

export function useCapacityConfig() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['capacity-config'],
    queryFn: () => apiClient.getCapacityConfig(),
  })

  const updatePoste = useMutation({
    mutationFn: (data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) =>
      apiClient.updatePosteConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capacity-config'] })
    },
  })

  const setOverride = useMutation({
    mutationFn: (data: { poste: string; key: string; hours?: number; reason: string; pattern?: Record<string, number> }) =>
      apiClient.setCapacityOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capacity-config'] })
    },
  })

  const removeOverride = useMutation({
    mutationFn: (data: { poste: string; key: string }) =>
      apiClient.removeCapacityOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capacity-config'] })
    },
  })

  return {
    ...query,
    updatePoste,
    setOverride,
    removeOverride,
  }
}
