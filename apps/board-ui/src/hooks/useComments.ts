import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { suiviClient } from '@/api/suivi-client'

export function useComments() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['suivi-comments'],
    queryFn: () => suiviClient.getComments(),
    staleTime: 2 * 60 * 1000,
  })

  const batchSave = useMutation({
    mutationFn: (rows: Array<{ no_commande: string; article: string; comment: string }>) =>
      suiviClient.batchUpsertComments(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suivi-comments'] })
    },
  })

  return { ...query, batchSave }
}
