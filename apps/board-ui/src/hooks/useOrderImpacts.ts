import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { planningBoardApi } from '@/api/repositories/planningBoard'
import type { OrderImpactRow, OrderImpactsResponse } from '@/types/planningBoard'

/** Impacts du planning sur les commandes clients (matching OF ↔ commande). */
export function useOrderImpacts(windowFrom: string, windowTo: string) {
  const [result, setResult] = useState<OrderImpactsResponse | null>(null)

  const mutation = useMutation({
    mutationFn: () => planningBoardApi.orderImpacts({ from: windowFrom, to: windowTo }),
    onSuccess: setResult,
  })

  const evaluate = useCallback(() => mutation.mutate(), [mutation])
  const reset = useCallback(() => setResult(null), [])

  /** Index inverse : num_of → commandes qui en dépendent. */
  const ordersByOf = useMemo(() => {
    const map: Record<string, OrderImpactRow[]> = {}
    for (const row of result?.orders ?? []) {
      for (const of of row.ofs) {
        if (!map[of.num_of]) map[of.num_of] = []
        map[of.num_of].push(row)
      }
    }
    return map
  }, [result])

  return {
    impacts: result,
    ordersByOf,
    evaluate,
    reset,
    isEvaluating: mutation.isPending,
    error: mutation.error,
  }
}
