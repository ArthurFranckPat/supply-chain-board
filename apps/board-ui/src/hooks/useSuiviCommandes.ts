import { useQuery } from '@tanstack/react-query'
import { suiviClient } from '@/api/suivi-client'

export function useSuiviCommandes() {
  return useQuery({
    queryKey: ['suivi-commandes'],
    queryFn: () => suiviClient.getStatusFromErp(),
    staleTime: 5 * 60 * 1000,
  })
}
