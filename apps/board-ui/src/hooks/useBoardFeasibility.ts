import { useCallback, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { planningBoardApi } from '@/api/repositories/planningBoard'
import type { FeasibilityDiff, FeasibilityEntry, FeasibilityResponse } from '@/types/planningBoard'

/**
 * Évaluation de faisabilité des OF de la fenêtre du planning board.
 *
 * Conserve le résultat précédent pour produire un diff après chaque
 * réévaluation (ex : après affermissement, quels OF sont dégradés ?).
 */
export function useBoardFeasibility(windowFrom: string, windowTo: string) {
  const [result, setResult] = useState<FeasibilityResponse | null>(null)
  const [diff, setDiff] = useState<FeasibilityDiff | null>(null)
  const previousRef = useRef<Record<string, FeasibilityEntry> | null>(null)

  const mutation = useMutation({
    mutationFn: () => planningBoardApi.evaluateFeasibility({ from: windowFrom, to: windowTo }),
    onSuccess: (data) => {
      const previous = previousRef.current
      if (previous) {
        const degraded: string[] = []
        const improved: string[] = []
        for (const [numOf, entry] of Object.entries(data.results)) {
          const before = previous[numOf]
          if (!before) continue
          if (before.faisable && !entry.faisable) degraded.push(numOf)
          else if (!before.faisable && entry.faisable) improved.push(numOf)
        }
        setDiff(degraded.length || improved.length ? { degraded, improved } : null)
      } else {
        setDiff(null)
      }
      previousRef.current = data.results
      setResult(data)
    },
  })

  const evaluate = useCallback(() => mutation.mutate(), [mutation])

  /** Oublie l'état précédent (changement de fenêtre → diff non comparable). */
  const invalidateBaseline = useCallback(() => {
    previousRef.current = null
    setResult(null)
    setDiff(null)
  }, [])

  return {
    feasibility: result,
    entries: result?.results ?? null,
    diff,
    clearDiff: () => setDiff(null),
    evaluate,
    invalidateBaseline,
    isEvaluating: mutation.isPending,
    error: mutation.error,
  }
}
