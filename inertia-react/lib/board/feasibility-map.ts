/**
 * Fetch `POST /board-feasibility` — chemin unique programme + séquenceur.
 * Le PARSEUR (règles ok / qc / blocked) vit dans `feasibility-parse.ts`, sans import
 * runtime, pour être testable hors Vite ; il est réexporté ici.
 */
import type { FeasibilityMode } from '@r/lib/board/types'
import { buildFeasibilityMap, type FeasibilityOfPayload } from '@r/lib/board/feasibility-parse'
import { route } from '@r/lib/routes'

/** Couverture d'un composant manquant : quand la matière rentre, et de qui. */
export interface ComponentCoverage {
  /** Date d'arrivée de la réception qui solde le manque. Null = rien en commande. */
  dateIso: string | null
  supplier: string
  /** N° de commande d'achat déterminante. */
  poId: string
}

export interface OfCoverage {
  /** Date à laquelle TOUS les manquants sont rentrés — donc où l'OF devient lançable. */
  readyIso: string | null
  byComponent: Record<string, ComponentCoverage>
}

// Réexport : les consommateurs historiques importent toujours depuis ce module.
export { buildFeasibilityMap }
export type { FeasibilityOfPayload }

/** Même contrat API que `useBoardStore.runFeasibility` — mode explicite (programme : store.mode, séquenceur : sequential). */
export async function fetchBoardFeasibility(opts: {
  from: string
  to: string
  mode: FeasibilityMode
  workstation?: string
}): Promise<
  ReturnType<typeof buildFeasibilityMap> & {
    /** Réf composant → désignation, pour les seuls composants cités par un verdict. */
    componentLabels: Record<string, string>
    /** N° d'OF → quand ses composants manquants rentrent (alloué dans l'ordre de la file). */
    coverage: Record<string, OfCoverage>
  }
> {
  const body: Record<string, string> = {
    from: opts.from,
    to: opts.to,
    mode: opts.mode,
  }
  if (opts.workstation) body.workstation = opts.workstation.toLowerCase()

  const res = await fetch(route('planning_board.board_feasibility'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as {
    ofs?: FeasibilityOfPayload[]
    componentLabels?: Record<string, string>
    coverage?: Record<string, OfCoverage>
  }
  return {
    ...buildFeasibilityMap(data.ofs ?? []),
    componentLabels: data.componentLabels ?? {},
    coverage: data.coverage ?? {},
  }
}

/** Fenêtre ISO pour couvrir les dates début des candidats.
 *  IMPORTANT : borner depuis min/max des dates candidats — pas depuis
 *  today+N j (sinon des OF à 3–5 mois sortent de board-feasibility / STRDAT). */
export function feasibilityWindowFromDates(
  dates: (string | null | undefined)[],
  fallbackDaysAhead = 90
): { from: string; to: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const iso = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }
  const valid = dates.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d))
  if (valid.length === 0) {
    const from = new Date(today)
    from.setDate(from.getDate() - 7)
    const to = new Date(today)
    to.setDate(to.getDate() + fallbackDaysAhead)
    return { from: iso(from), to: iso(to) }
  }
  const sorted = [...valid].sort()
  const from = new Date(sorted[0])
  const to = new Date(sorted[sorted.length - 1])
  // Marge 7 j de chaque côté pour STRDAT board-feasibility.
  from.setDate(from.getDate() - 7)
  to.setDate(to.getDate() + 7)
  return { from: iso(from), to: iso(to) }
}
