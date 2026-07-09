/**
 * Évaluation du diff d'un scénario (issue #57, pivot vision étage 2/3).
 *
 * Charge le plan réel (mêmes données X3 que le board /programme via `loadOrderImpacts`),
 * puis exécute le moteur de diff pur (`evaluatePlanDiff`) : évaluer(plan) vs
 * évaluer(plan + mutations). La sortie est un CONSTAT signé sur 3 axes
 * (client / appro / allocation) — l'axe charge reste côté client (histogrammes
 * `lineWeekLoads`, déjà réactifs aux positions des cartes).
 */

import { loadOrderImpacts } from '#services/order_impacts_loader'
import { evaluatePlanDiff, type PlanDiff, type PlanMutation } from '#app/domain/plan-diff'

export interface ScenarioDiffResult {
  diff: PlanDiff
  /** Horodatage de l'évaluation (« évalué le … »). */
  evaluatedAt: string
  /** Borne haute des données chargées (« sur données du … ») = fin de fenêtre. */
  dataAt: string
}

export async function evaluateScenarioDiff(
  mutations: PlanMutation[],
  window: { from: Date; to: Date }
): Promise<ScenarioDiffResult> {
  const ctx = await loadOrderImpacts({
    from: window.from,
    to: window.to,
    pipeline: 'programme',
  })

  const diff = evaluatePlanDiff(
    {
      demands: ctx.planInputs.demands,
      supplyFlows: ctx.planInputs.supplyFlows,
      overrides: ctx.planInputs.overrides,
      nomenclatures: ctx.nomenclatures,
      articles: ctx.articles,
      window,
    },
    mutations
  )

  const now = new Date().toISOString()
  return { diff, evaluatedAt: now, dataAt: window.to.toISOString() }
}
