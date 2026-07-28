/**
 * Parse la réponse `POST /board-feasibility` → map numOf → FeasStatus.
 * Même règles que le store board (`runFeasibility`) : ok / qc / blocked.
 * Extrait pour réemploi hors store (séquenceur #100).
 */
import type { FeasStatus } from '@r/lib/board/types'

export interface FeasibilityOfPayload {
  numOf: string
  feasible?: boolean
  missingComponents?: Record<string, unknown>
  qcComponents?: Record<string, number>
}

export function buildFeasibilityMap(ofs: FeasibilityOfPayload[]): {
  map: Record<string, FeasStatus>
  nbOk: number
  nbBlocked: number
  nbQc: number
} {
  const map: Record<string, FeasStatus> = {}
  let nbOk = 0
  let nbBlocked = 0
  let nbQc = 0
  for (const of of ofs) {
    const qcComponents = of.qcComponents ?? {}
    const dependsOnQc = Object.keys(qcComponents).length > 0
    if (of.feasible === false) {
      map[of.numOf] = {
        st: 'blocked',
        missing: Object.keys(of.missingComponents ?? {}),
        ...(dependsOnQc ? { qcComponents } : {}),
      }
      nbBlocked++
    } else if (of.feasible === true) {
      // Faisable mais tributaire du CQ → pas lançable tant que CQ non libéré.
      map[of.numOf] = dependsOnQc
        ? { st: 'qc', missing: [], qcComponents }
        : { st: 'ok', missing: [] }
      if (dependsOnQc) nbQc++
      else nbOk++
    }
  }
  return { map, nbOk, nbBlocked, nbQc }
}

/** Fenêtre ISO pour couvrir les dates début des candidats (+ marge). */
export function feasibilityWindowFromDates(
  dates: (string | null | undefined)[],
  fallbackDaysAhead = 60
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
  let from = new Date(today)
  from.setDate(from.getDate() - 7)
  let to = new Date(today)
  to.setDate(to.getDate() + fallbackDaysAhead)
  if (valid.length > 0) {
    const sorted = [...valid].sort()
    const min = new Date(sorted[0])
    const max = new Date(sorted[sorted.length - 1])
    if (min < from) from = min
    if (max > to) to = max
    // Marge 3 j de chaque côté pour STRDAT board-feasibility.
    from.setDate(from.getDate() - 3)
    to.setDate(to.getDate() + 3)
  }
  return { from: iso(from), to: iso(to) }
}
