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
import { evaluatePlanDiff, applyMutations, type PlanDiff, type PlanMutation } from '#app/domain/plan-diff'
import type { AllocationStrategy } from '#app/domain/of-conso'
import { evaluateOrderImpacts, type OrderImpactResult } from '#app/domain/order-impacts'

export interface ScenarioDiffResult {
  diff: PlanDiff
  /** Horodatage de l'évaluation (« évalué le … »). */
  evaluatedAt: string
  /** Borne haute des données chargées (« sur données du … ») = fin de fenêtre. */
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

  const before = evaluateOrderImpacts(
    ctx.planInputs.demands,
    ctx.planInputs.supplyFlows,
    ctx.nomenclatures,
    ctx.articles,
    ctx.planInputs.overrides,
    window,
    undefined,
    undefined,
    undefined,
    'date_besoin'
  )

  const mutated = applyMutations(ctx.planInputs, mutations)
  const after = evaluateOrderImpacts(
    mutated.demands,
    mutated.supplyFlows,
    ctx.nomenclatures,
    ctx.articles,
    mutated.overrides,
    window,
    undefined,
    undefined,
    undefined,
    strategy ?? 'date_besoin'
  )

  const diff = evaluatePlanDiff(
    {
      demands: ctx.planInputs.demands,
      supplyFlows: ctx.planInputs.supplyFlows,
      overrides: ctx.planInputs.overrides,
      nomenclatures: ctx.nomenclatures,
      articles: ctx.articles,
      window,
      strategy,
    },
    mutations
  )

  const beforeDelayed = before.orders.filter((o) => o.statut === 'retard').length
  const afterDelayed = after.orders.filter((o) => o.statut === 'retard').length

  const getShortageCount = (impactResult: OrderImpactResult) => {
    const componentsWithShortage = new Set<string>()
    for (const ofInfo of impactResult.ofs) {
      for (const [comp, qty] of Object.entries(ofInfo.missingComponents)) {
        if (qty > 0) {
          componentsWithShortage.add(comp)
        }
      }
    }
    return componentsWithShortage.size
  }

  const beforeShortages = getShortageCount(before)
  const afterShortages = getShortageCount(after)

  const now = new Date().toISOString()
  return {
    diff,
    evaluatedAt: now,
    dataAt: window.to.toISOString(),
    beforeStats: {
      delayedOrders: beforeDelayed,
      inducedShortages: beforeShortages,
    },
    afterStats: {
      delayedOrders: afterDelayed,
      inducedShortages: afterShortages,
    },
  }
}
