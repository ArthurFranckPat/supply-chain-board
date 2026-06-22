/**
 * Faisabilité d'un OF à partir de ses matières RÉELLES (MFGMAT).
 *
 * Source de vérité UNIQUE partagée entre :
 *  - le badge du board (`boardFeasibility`)
 *  - le panneau de détail OF du board (`ofMaterials`)
 *  - la page OF autonome (`loadOfDetail`)
 *
 * cf. issue #11 : un seul calcul, un seul verdict. Avant cette unification, le badge
 * recalculait depuis la nomenclature théorique (filtrée : famille Z, articles inactifs,
 * fenêtre de validité BOM, alternative ≠ 1) tandis que le détail lisait MFGMAT — d'où
 * des verdicts contradictoires pour le même OF.
 *
 * Sémantique "dispo instantanée" : stock présent strict/qc + allocation ERP de l'OF,
 * SANS réceptions futures. OF ferme (statut 1) → toujours faisable (pas de calcul stock).
 */

import type { Flow } from './models/flow.js'

/**
 * Construit la dispo par article à partir des flux stock, en ne retenant que les
 * sous-types consommables strict + qc (exclut 'rejected'). Périmètre identique entre
 * le badge et le détail (issue #11).
 */
export function buildStrictQcStock(flows: Flow[]): Map<string, number> {
  const stock = new Map<string, number>()
  for (const f of flows) {
    if (f.origin.type !== 'stock') continue
    const sub = (f.origin as { subType?: string }).subType
    if (sub === 'strict' || sub === 'qc') {
      stock.set(f.article, (stock.get(f.article) ?? 0) + f.quantity)
    }
  }
  return stock
}

export interface MfgMaterialInput {
  article: string
  description?: string
  unit?: string | null
  /** Reste à sortir (RETQTY - USEQTY). */
  remaining: number
  /** Déjà alloué en stock pour cet OF (ALLQTY). */
  allocated: number
}

export interface MaterialVerdict {
  article: string
  description: string
  unit: string | null
  remaining: number
  /** Stock disponible strict/qc ; null si l'article est absent du stock chargé. */
  available: number | null
  allocated: number
  /** null = stock inconnu (ni faisable, ni en rupture). */
  feasible: boolean | null
  missing: number
}

export interface OfFeasibilityVerdict {
  materials: MaterialVerdict[]
  feasible: boolean
  blockedCount: number
  missingComponents: Record<string, number>
}

/**
 * Évalue la faisabilité d'un OF à partir de ses matières MFGMAT et du stock strict/qc.
 *
 * @param materials - Matières réelles de l'OF (MFGMAT).
 * @param stockByArticle - Stock disponible par article (somme des sous-types strict + qc).
 * @param isFirm - OF ferme (statut 1) → toujours faisable.
 */
export function evaluateMfgFeasibility(
  materials: MfgMaterialInput[],
  stockByArticle: Map<string, number>,
  isFirm: boolean,
): OfFeasibilityVerdict {
  const rows: MaterialVerdict[] = materials.map((m) => {
    // Un composant absent de la map stock (= stock strict 0 : les flows 'strict'
    // ne sont émis que si strict > 0) est traité en RUPTURE (available 0), exactement
    // comme le RecursiveDiagnosticChecker (available ?? 0). Avant : null = indéterminé
    // → non bloqué → verdict faisable à tort (bug « composants dispo, badge rupture »).
    const available = stockByArticle.get(m.article) ?? 0
    const feasible = isFirm ? true : available + m.allocated >= m.remaining
    const missing = feasible === false ? Math.max(0, m.remaining - available) : 0
    return {
      article: m.article,
      description: m.description ?? '',
      unit: m.unit ?? null,
      remaining: m.remaining,
      available,
      allocated: m.allocated,
      feasible,
      missing,
    }
  })

  const missingComponents: Record<string, number> = {}
  for (const r of rows) {
    if (r.feasible === false) missingComponents[r.article] = r.missing
  }
  const blockedCount = rows.filter((r) => r.feasible === false).length

  return { materials: rows, feasible: blockedCount === 0, blockedCount, missingComponents }
}
