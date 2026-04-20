import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

export function useCalendar(year: number, month: number) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => apiClient.getCalendar(year, month),
  })

  const toggleManualOff = useMutation({
    mutationFn: (params: { date: string; reason: string; remove: boolean }) => {
      if (params.remove) {
        return apiClient.updateManualOffDays({ year, additions: [], removals: [params.date] })
      }
      return apiClient.updateManualOffDays({ year, additions: [{ date: params.date, reason: params.reason }], removals: [] })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', year, month] })
    },
  })

  const refreshHolidays = useMutation({
    mutationFn: () => apiClient.refreshHolidays(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', year, month] })
    },
  })

  return {
    ...query,
    toggleManualOff,
    refreshHolidays,
  }
}
