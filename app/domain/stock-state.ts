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


export interface FeasibilityOptions {
  useReceptions?: boolean
  mode?: 'immediate' | 'sequential'
  /** Allocations ERP par numéro d'OF : Map<numOf, Map<article, qteAllouee>> */
  allocations?: Map<string, Map<string, number>>
}
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
 * Vérifie la faisabilité composants pour une liste d'OF.
 *
 * @param mode — 'immediate' : chaque OF vérifié indépendamment (pas de consommation).
 *                'sequential' : OFs triés par priorité, chaque allocation consomme le stock
 *                et impacte la faisabilité des suivants (par défaut).
 * @param options.useReceptions — prend en compte les réceptions (par défaut true).
 */
export function evaluateSequentialFeasibility(
  ofs: OfInput[],
  flows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
  horizonEnd: Date,
  options?: FeasibilityOptions,
): Map<string, FeasibilityEntry> {
  const useReceptions = options?.useReceptions ?? true
  const mode = options?.mode ?? 'immediate'

  // 1. Build initial stock
  const initialStock = new Map<string, number>()
  const entries = new Map<string, FeasibilityEntry>()
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

  const dateBesoin = (ofInput: OfInput) => ofInput.dateDebut ?? ofInput.dateFin ?? ''

  if (mode === 'immediate') {
    for (const ofInput of ofs) {
      if (isFirm(ofInput.statutNum)) {
        entries.set(ofInput.numOf, {
          numOf: ofInput.numOf, article: ofInput.article, feasible: true,
          status: 'ok' as const, missingComponents: {}, alerts: [], allocated: {},
          dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
        })
        continue
      }
      const ofAllocs = options?.allocations?.get(ofInput.numOf)
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, flows, nomenclatures, articles, horizonEnd, true, undefined, ofAllocs)
      const missingComponents: Record<string, number> = {}
      for (const bc of result.blockingComponents) {
        missingComponents[bc.article] = bc.shortage
      }
      entries.set(ofInput.numOf, {
        numOf: ofInput.numOf, article: ofInput.article, feasible: result.feasible,
        status: classifyFeasibility(result), missingComponents, alerts: [], allocated: {},
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
  } else {
    // Mode séquentiel
    const preFeasible = new Map<string, boolean>()
    for (const ofInput of ofs) {
      if (isFirm(ofInput.statutNum)) continue
      const ofAllocs = options?.allocations?.get(ofInput.numOf)
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, flows, nomenclatures, articles, horizonEnd, true, undefined, ofAllocs)
      preFeasible.set(ofInput.numOf, result.feasible)
    }
    // OF fermes : toujours faisables, pas de calcul, pas d'allocation virtuelle
    for (const ofInput of ofs) {
      if (!isFirm(ofInput.statutNum)) continue
      entries.set(ofInput.numOf, {
        numOf: ofInput.numOf, article: ofInput.article, feasible: true,
        status: 'ok' as const, missingComponents: {}, alerts: [], allocated: {},
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
    // OF non fermes : allocation virtuelle séquentielle
    const nonFirm = ofs.filter((o) => !isFirm(o.statutNum))
    const sorted = nonFirm.sort((a, b) => {
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
    const mutableFlows = flows.map((f) => ({ ...f }))
    for (const ofInput of sorted) {
      const result = checkFeasibility(ofInput.article, ofInput.qteRestante, mutableFlows, nomenclatures, articles, horizonEnd)
      const allocated: Record<string, number> = {}
      if (result.feasible) {
        const requirements = directPurchaseRequirements(ofInput.article, ofInput.qteRestante, nomenclatures)
        for (const [article, besoin] of Object.entries(requirements)) {
          const qte = Math.min(besoin, stockState.getAvailable(article))
          if (qte > 0) allocated[article] = qte
        }
        if (Object.keys(allocated).length > 0) {
          stockState.allocate(ofInput.numOf, allocated)
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
        numOf: ofInput.numOf, article: ofInput.article, feasible: result.feasible,
        status: classifyFeasibility(result), missingComponents, alerts: [], allocated,
        dateBesoin: dateBesoin(ofInput) || null, statutNum: ofInput.statutNum,
      })
    }
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
