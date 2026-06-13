/**
 * Date de promise — itère jours pour trouver la date faisable la plus tôt.
 *
 * Chaque jour, ajoute les réceptions au stock virtuel,
 * teste checkFeasibility(). Retourne la première date faisable.
 *
 * Port de feasibility/feasibility_service.py (promise_date).
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { checkFeasibility, type BlockingComponent } from './feasibility.js'

export interface PromiseDateResult {
  feasibleDate: Date | null
  feasible: boolean
  blockingComponents: BlockingComponent[]
  daysChecked: number
}

/**
 * Trouve la date la plus tôt où produire `quantity` d'un article est faisable.
 *
 * Itère jour par jour (max maxHorizonDays), en incluant les réceptions
 * fournisseurs dont la date tombe avant le jour testé.
 */
export function promiseDate(
  article: string,
  quantity: number,
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  options?: { maxHorizonDays?: number; startDate?: Date },
): PromiseDateResult {
  const maxDays = options?.maxHorizonDays ?? 60
  const startDate = options?.startDate ?? new Date()
  startDate.setHours(0, 0, 0, 0)

  let lastResult: { feasible: boolean; blockingComponents: BlockingComponent[] } | null = null

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
    const testDate = new Date(startDate)
    testDate.setDate(testDate.getDate() + dayOffset)

    const result = checkFeasibility(article, quantity, flows, nomenclatures, articles, testDate)
    lastResult = result

    if (result.feasible) {
      return {
        feasibleDate: testDate,
        feasible: true,
        blockingComponents: [],
        daysChecked: dayOffset + 1,
      }
    }
  }

  return {
    feasibleDate: null,
    feasible: false,
    blockingComponents: lastResult?.blockingComponents ?? [],
    daysChecked: maxDays + 1,
  }
}
