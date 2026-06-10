import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { planningBoardApi } from '@/api/repositories/planningBoard'
import type { OfPatchPayload, PlanningBoardOF, PlanningBoardResponse } from '@/types/planningBoard'

/* ── Helpers dates ─────────────────────────────────────────────── */

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/** Lundi de la semaine contenant d */
export function mondayOf(d: Date): Date {
  const copy = new Date(d)
  const dow = (copy.getDay() + 6) % 7 // 0 = lundi
  copy.setDate(copy.getDate() - dow)
  return copy
}

/** Jours ouvrés (lun→ven) sur n semaines à partir du lundi de référence */
export function buildWorkdays(startMonday: Date, weeks: number): string[] {
  const days: string[] = []
  for (let w = 0; w < weeks; w++) {
    for (let dow = 0; dow < 5; dow++) {
      const d = new Date(startMonday)
      d.setDate(d.getDate() + w * 7 + dow)
      days.push(toIso(d))
    }
  }
  return days
}

export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/* ── Filtres ───────────────────────────────────────────────────── */

export interface BoardFilters {
  statut: number | null
  poste: string | null
  query: string
  modifiedOnly: boolean
}

const QUERY_KEY = 'planning-board'

/* ── Hook principal ────────────────────────────────────────────── */

export function usePlanningBoard() {
  const queryClient = useQueryClient()

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [weeks, setWeeks] = useState(4)
  const [filters, setFilters] = useState<BoardFilters>({
    statut: null,
    poste: null,
    query: '',
    modifiedOnly: false,
  })
  const [selectedOf, setSelectedOf] = useState<string | null>(null)

  const workdays = useMemo(() => buildWorkdays(weekStart, weeks), [weekStart, weeks])
  const windowFrom = workdays[0]
  const windowTo = workdays[workdays.length - 1]

  const queryKey = [QUERY_KEY, windowFrom, windowTo, filters.statut, filters.poste, filters.query]

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      planningBoardApi.listOfs({
        from: windowFrom,
        to: windowTo,
        statut: filters.statut,
        poste: filters.poste,
        q: filters.query || null,
      }),
  })

  /* Mutation optimiste : la carte bouge immédiatement, rollback si erreur */
  const patchMutation = useMutation({
    mutationFn: ({ numOf, payload }: { numOf: string; payload: OfPatchPayload }) =>
      planningBoardApi.patchOf(numOf, payload),
    onMutate: async ({ numOf, payload }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<PlanningBoardResponse>(queryKey)
      if (previous) {
        queryClient.setQueryData<PlanningBoardResponse>(queryKey, {
          ...previous,
          ofs: previous.ofs.map((of) =>
            of.num_of === numOf
              ? {
                  ...of,
                  ...(payload.date_debut !== undefined && { date_debut: payload.date_debut }),
                  ...(payload.date_fin !== undefined && { date_fin: payload.date_fin }),
                  ...(payload.statut_num != null && {
                    statut_num: payload.statut_num,
                    statut_texte: { 1: 'Ferme', 2: 'Planifié', 3: 'Suggéré' }[payload.statut_num] ?? '',
                  }),
                  ...(payload.note !== undefined && { note: payload.note }),
                  modified: true,
                }
              : of,
          ),
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: (numOf: string) => planningBoardApi.resetOf(numOf),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })

  const resetAllMutation = useMutation({
    mutationFn: () => planningBoardApi.resetAll(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })

  /** Déplace un OF sur un nouveau jour de début (la fin glisse d'autant). */
  const moveOf = useCallback(
    (of: PlanningBoardOF, newStartIso: string) => {
      const currentStart = of.date_debut ?? of.date_fin
      if (!currentStart || currentStart === newStartIso) return
      const deltaDays = Math.round(
        (parseIso(newStartIso).getTime() - parseIso(currentStart).getTime()) / 86400000,
      )
      const payload: OfPatchPayload = { date_debut: newStartIso }
      if (of.date_fin) payload.date_fin = addDays(of.date_fin, deltaDays)
      patchMutation.mutate({ numOf: of.num_of, payload })
    },
    [patchMutation],
  )

  const visibleOfs = useMemo(() => {
    const ofs = data?.ofs ?? []
    return filters.modifiedOnly ? ofs.filter((o) => o.modified) : ofs
  }, [data, filters.modifiedOnly])

  const selected = useMemo(
    () => visibleOfs.find((o) => o.num_of === selectedOf) ?? null,
    [visibleOfs, selectedOf],
  )

  return {
    // Données
    data,
    ofs: visibleOfs,
    workdays,
    isLoading,
    error,
    refetch,
    // Navigation temporelle
    weekStart,
    setWeekStart,
    weeks,
    setWeeks,
    // Filtres
    filters,
    setFilters,
    // Sélection
    selectedOf,
    setSelectedOf,
    selected,
    // Actions
    moveOf,
    patchOf: (numOf: string, payload: OfPatchPayload) =>
      patchMutation.mutate({ numOf, payload }),
    resetOf: (numOf: string) => resetMutation.mutate(numOf),
    resetAll: () => resetAllMutation.mutate(),
    isSaving: patchMutation.isPending || resetMutation.isPending,
    saveError: patchMutation.error,
  }
}
