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
