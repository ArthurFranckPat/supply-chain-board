/**
 * Évaluation du diff d'un scénario (issue #57, pivot vision étage 2/3).
 *
 * Charge le plan réel (mêmes données X3 que le board /programme via `loadOrderImpacts`),
 * puis exécute le moteur de diff pur (`evaluatePlanDiffDetailed`) : évaluer(plan) vs
 * évaluer(plan + mutations). La sortie est un CONSTAT signé sur 4 axes
 * (client / appro / allocation / charge).
 *
 * Deux règles à ne pas défaire :
 *  1. le « avant » du diff est `ctx.result` — l'évaluation que le board affiche déjà.
 *     Le recalculer donnait deux chiffres de retard contradictoires à l'écran ;
 *  2. le plan muté est évalué avec LES MÊMES entrées moteur que le board
 *     (`ctx.engine` : faisabilité MFGMAT, avancement, charge gamme). Sans elles, le
 *     « après » retombait sur le BOM théorique et 1 jour de fabrication par OF.
 * Résultat : une seule évaluation supplémentaire par diff, au lieu de quatre.
 */

import { loadOrderImpacts } from '#services/order_impacts_loader'
import { evaluatePlanDiffDetailed, type PlanDiff, type PlanMutation } from '#app/domain/plan_diff'
import type { AllocationStrategy } from '#app/domain/of_conso'
import type { OrderImpactResult } from '#app/domain/order_impacts'

export interface ScenarioDiffResult {
  diff: PlanDiff
  /** Horodatage de l'évaluation (« évalué le … »). */
  evaluatedAt: string
  /** Instant d'assemblage des données du plan (« sur données du … »). */
  dataAt: string
  beforeStats: {
    delayedOrders: number
    inducedShortages: number
  }
  afterStats: {
    delayedOrders: number
    inducedShortages: number
  }
}

/** Composants en manque sur au moins un OF de l'évaluation. */
function shortageCount(result: OrderImpactResult): number {
  const composants = new Set<string>()
  for (const of of result.ofs) {
    for (const [composant, qty] of Object.entries(of.missingComponents)) {
      if (qty > 0) composants.add(composant)
    }
  }
  return composants.size
}

function statsOf(result: OrderImpactResult) {
  return {
    delayedOrders: result.orders.filter((o) => o.statut === 'retard').length,
    inducedShortages: shortageCount(result),
  }
}

export async function evaluateScenarioDiff(
  mutations: PlanMutation[],
  window: { from: Date; to: Date },
  strategy?: AllocationStrategy
): Promise<ScenarioDiffResult> {
  const ctx = await loadOrderImpacts({
    from: window.from,
    to: window.to,
    pipeline: 'programme',
  })

  const { diff, before, after } = evaluatePlanDiffDetailed(
    {
      demands: ctx.planInputs.demands,
      supplyFlows: ctx.planInputs.supplyFlows,
      overrides: ctx.planInputs.overrides,
      nomenclatures: ctx.nomenclatures,
      articles: ctx.articles,
      window,
      strategy,
      before: ctx.result,
      engine: ctx.engine,
      ofCharges: ctx.ofCharges,
    },
    mutations
  )

  return {
    diff,
    evaluatedAt: new Date().toISOString(),
    dataAt: ctx.dataAt.toISOString(),
    beforeStats: statsOf(before),
    afterStats: statsOf(after),
  }
}
