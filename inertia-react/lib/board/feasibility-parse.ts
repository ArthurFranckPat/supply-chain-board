/**
 * Traduction du payload `POST /board-feasibility` en badges — règles ok / qc / blocked.
 *
 * Volontairement SANS aucun import runtime (seuls des types, effacés à la compilation) :
 * c'est ce qui le rend testable côté Node, où l'alias `@r/*` n'est pas câblé. Le fetch et
 * la résolution de route vivent dans `feasibility-map.ts`, qui réexporte ce module.
 */
import type { FeasStatus } from './types.js'

export interface FeasibilityOfPayload {
  numOf: string
  feasible?: boolean
  /** Réf composant → quantité manquante. */
  missingComponents?: Record<string, number>
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
      const missingQty = of.missingComponents ?? {}
      map[of.numOf] = {
        st: 'blocked',
        missing: Object.keys(missingQty),
        // Quantités CONSERVÉES : elles étaient jetées ici, et le board ne pouvait plus dire
        // que « rupture », sans jamais dire de combien.
        ...(Object.keys(missingQty).length > 0 ? { missingQty } : {}),
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
