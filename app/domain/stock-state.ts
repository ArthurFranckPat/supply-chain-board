/**
 * Stock virtuel pour allocation concurrente entre OF.
 *
 * Tracke les allocations sans modifier le stock réel.
 * Utilisé par evaluateSequentialFeasibility et CommandeOFMatcher.
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { Nomenclature } from './models/nomenclature.js'
import { checkFeasibility } from './feasibility.js'
import { isFirm } from './rules.js'

export interface FeasibilityEntry {
  numOf: string
  article: string
  feasible: boolean
  status: 'ok' | 'blocked' | 'no_bom'
  missingComponents: Record<string, number>
  alerts: string[]
  allocated: Record<string, number>
  dateBesoin: string | null
  statutNum: number
}

export interface OfInput {
  numOf: string
  article: string
  qteRestante: number
  dateDebut: string | null
  dateFin: string | null
  statutNum: number
}

function directPurchaseRequirements(
  article: string,
  quantity: number,
  nomenclatures: Map<string, Nomenclature>,
): Record<string, number> {
  const requirements: Record<string, number> = {}
  const bom = nomenclatures.get(article)
  if (!bom) return requirements
  for (const comp of bom.components) {
    if (comp.componentType === 'ACHETE') {
      const qty = comp.consumptionNature === 'FORFAIT' ? comp.linkQuantity : comp.linkQuantity * quantity
      requirements[comp.componentArticle] = (requirements[comp.componentArticle] ?? 0) + qty
    }
  }
  return requirements
}

function classifyFeasibility(result: { feasible: boolean; blockingComponents: Array<{ article: string }> }): 'ok' | 'blocked' | 'no_bom' {
  return result.feasible ? 'ok' : 'blocked'
}

/**
 * Évalue la faisabilité de tous les OF avec allocation virtuelle séquentielle.
 *
 * Algorithme :
 * 1. Stock initial = stock flows + réceptions dans horizon
 * 2. Pré-passe : vérifie faisabilité sur stock complet → tri (faisable d'abord)
 * 3. Tri : (ferme d'abord, date_besoin, faisable avant non-faisable, numOf)
 * 4. Boucle : checkFeasibility avec StockState partagé → si faisable, alloue composants ACHAT
 */
export function evaluateSequentialFeasibility(
  ofs: OfInput[],
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  horizonEnd: Date,
  options?: { useReceptions?: boolean },
): Map<string, FeasibilityEntry> {
  const useReceptions = options?.useReceptions ?? true

  // 1. Build initial stock
  const initialStock = new Map<string, number>()
  for (const flow of flows) {
    if (flow.direction !== 'supply') continue
    if (flow.origin.type === 'stock') {
      initialStock.set(flow.article, (initialStock.get(flow.article) ?? 0) + flow.quantity)
    }
    if (useReceptions && flow.origin.type === 'reception' && flow.date && flow.date <= horizonEnd) {
      initialStock.set(flow.article, (initialStock.get(flow.article) ?? 0) + flow.quantity)
    }
  }

  const stockState = new StockState(initialStock)

  // 2. Separate firm OFs with ERP allocations (skip virtual allocation)
  const firmWithAllocations = new Set<string>()
  // In TS we don't have ERP allocation data directly, so we skip this for now

  // 3. Pre-pass: feasibility on full stock for sorting (rule 2)
  const preFeasible = new Map<string, boolean>()
  for (const ofInput of ofs) {
    if (firmWithAllocations.has(ofInput.numOf)) continue
    const result = checkFeasibility(ofInput.article, ofInput.qteRestante, flows, nomenclatures, articles, horizonEnd)
    preFeasible.set(ofInput.numOf, result.feasible)
  }

  // 4. Sort: firm first, date_besoin, feasible first (rule 2), numOf
  const dateBesoin = (ofInput: OfInput) => ofInput.dateDebut ?? ofInput.dateFin ?? ''
  const sorted = ofs
    .filter((ofInput) => !firmWithAllocations.has(ofInput.numOf))
    .sort((a, b) => {
      const pa = isFirm(a.statutNum) ? 0 : 1
      const pb = isFirm(b.statutNum) ? 0 : 1
      if (pa !== pb) return pa - pb
      const da = dateBesoin(a)
      const db = dateBesoin(b)
      if (da !== db) return da < db ? -1 : 1
      const fa = preFeasible.get(a.numOf) ? 0 : 1
      const fb = preFeasible.get(b.numOf) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.numOf.localeCompare(b.numOf)
    })

  // 5. Sequential allocation loop — use mutable flows so checkFeasibility sees consumed stock
  const entries = new Map<string, FeasibilityEntry>()
  const mutableFlows = flows.map((f) => ({ ...f }))

  for (const ofInput of sorted) {
    const result = checkFeasibility(ofInput.article, ofInput.qteRestante, mutableFlows, nomenclatures, articles, horizonEnd)

    const allocated: Record<string, number> = {}
    if (result.feasible) {
      const requirements = directPurchaseRequirements(ofInput.article, ofInput.qteRestante, nomenclatures)
      for (const [article, besoin] of Object.entries(requirements)) {
        const qte = Math.min(besoin, stockState.getAvailable(article))
        if (qte > 0) {
          allocated[article] = qte
        }
      }
      if (Object.keys(allocated).length > 0) {
        stockState.allocate(ofInput.numOf, allocated)
        // Decrement mutable flows so subsequent OFs see reduced stock
        for (const [article, qty] of Object.entries(allocated)) {
          let remaining = qty
          for (const flow of mutableFlows) {
            if (remaining <= 0) break
            if (flow.article === article && flow.direction === 'supply' && flow.quantity > 0) {
              const taken = Math.min(remaining, flow.quantity)
              flow.quantity -= taken
              remaining -= taken
            }
          }
        }
      }
    }

    const missingComponents: Record<string, number> = {}
    for (const bc of result.blockingComponents) {
      missingComponents[bc.article] = bc.shortage
    }

    entries.set(ofInput.numOf, {
      numOf: ofInput.numOf,
      article: ofInput.article,
      feasible: result.feasible,
      status: classifyFeasibility(result),
      missingComponents,
      alerts: [],
      allocated,
      dateBesoin: dateBesoin(ofInput) || null,
      statutNum: ofInput.statutNum,
    })
  }

  return entries
}

export class StockState {
  private initialStock: Map<string, number>
  private allocatedStock: Map<string, number> = new Map()

  constructor(initialStock: Map<string, number> | Record<string, number>) {
    if (initialStock instanceof Map) {
      this.initialStock = new Map(initialStock)
    } else {
      this.initialStock = new Map(Object.entries(initialStock))
    }
  }

  getAvailable(article: string): number {
    return (this.initialStock.get(article) ?? 0) - (this.allocatedStock.get(article) ?? 0)
  }

  allocate(_ofNum: string, allocations: Map<string, number> | Record<string, number>): void {
    const entries = allocations instanceof Map ? allocations.entries() : Object.entries(allocations)
    for (const [article, quantity] of entries) {
      const current = this.allocatedStock.get(article) ?? 0
      this.allocatedStock.set(article, current + quantity)
    }
  }

  addSupply(article: string, quantity: number): void {
    const current = this.initialStock.get(article) ?? 0
    this.initialStock.set(article, current + quantity)
  }

  getInitialStock(article: string): number {
    return this.initialStock.get(article) ?? 0
  }

  getAllocated(article: string): number {
    return this.allocatedStock.get(article) ?? 0
  }
}
