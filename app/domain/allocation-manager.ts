/**
 * AllocationManager.
 *
 * Mirrors Python production_planning.orders.allocation.AllocationManager:
 * - sorts OFs by priority (firm first, then planned/suggested, feasible first)
 * - allocates purchased components virtually while honoring ERP allocations for firm OFs
 * - uses a shared StockState so earlier allocations reduce later availability
 */

import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import { RecursiveChecker, type RecursiveCheckerLoader, type OfRecord, type StockRecord, type ReceptionRecord } from './recursive-checker.js'
import { StockState } from './stock-state.js'
import type { ErpAllocation } from './allocation.js'
import type { Article } from './models/article.js'

export interface AllocationManagerLoader extends RecursiveCheckerLoader {
  commandesClients?: unknown[]
}

export interface AllocationResult {
  numOf: string
  article: string
  statutNum: number
  feasible: boolean
  allocatedQuantity: Record<string, number>
  missingComponents: Record<string, number>
}

function isFirm(statutNum: number): boolean {
  return statutNum === 1
}

export class AllocationManager {
  dataLoader: AllocationManagerLoader
  checker: RecursiveChecker

  constructor(loader: AllocationManagerLoader, checker: RecursiveChecker) {
    this.dataLoader = loader
    this.checker = checker
  }
  /**
   * Sort OFs by firm first, then by date, then feasible first, then numOf.
   */
  sortOfsByPriority(ofs: OfRecord[], stockState: StockState): OfRecord[] {
    const feasibility = new Map<string, boolean>()
    const tempChecker = new RecursiveChecker(this.dataLoader, {
      useReceptions: this.checker.useReceptions,
      checkDate: this.checker.checkDate,
      stockState,
    })
    for (const of of ofs) {
      if (isFirm(of.statutNum)) {
        feasibility.set(of.numOf, true)
        continue
      }
      const result = tempChecker.checkArticleRecursive(
        of.article,
        of.qteRestante,
        of.dateDebut ?? new Date(8640000000000000),
        0,
        false,
        of.numOf,
      )
      feasibility.set(of.numOf, result.feasible)
    }

    return [...ofs].sort((a, b) => {
      const fa = feasibility.get(a.numOf) ? 0 : 1
      const fb = feasibility.get(b.numOf) ? 0 : 1
      if (fa !== fb) return fa - fb
      return a.numOf.localeCompare(b.numOf)
    })
  }

  /**
   * Compute direct purchased-component requirements for an OF.
   */
  calculateAllocations(of: OfRecord, stockState: StockState): Record<string, number> {
    const nomenclature = this.dataLoader.getNomenclature(of.article)
    if (!nomenclature) return {}

    const allocations: Record<string, number> = {}
    for (const comp of nomenclature.components) {
      if (comp.componentType !== 'ACHETE') continue
      const besoin = requiredQuantity(comp, of.qteRestante)
      const available = stockState.getAvailable(comp.componentArticle)
      const qty = Math.min(besoin, available)
      if (qty > 0) {
        allocations[comp.componentArticle] = qty
      }
    }
    return allocations
  }

  /**
   * Allocate a single OF respecting ERP allocations for firm OFs.
   */
  allocateOf(of: OfRecord, stockState: StockState): AllocationResult {
    const dateBesoin = of.dateDebut ?? new Date(8640000000000000)

    // Firm OFs with ERP allocations are feasible by definition and do not consume virtual stock.
    if (isFirm(of.statutNum)) {
      const erp = this.dataLoader.getAllocationsOf(of.numOf)
      if (erp && erp.length > 0) {
        return {
          numOf: of.numOf,
          article: of.article,
          statutNum: of.statutNum,
          feasible: true,
          allocatedQuantity: {},
          missingComponents: {},
        }
      }
    }

    const result = this.checker.checkArticleRecursive(of.article, of.qteRestante, dateBesoin, 0, isFirm(of.statutNum), of.numOf)
    const allocations: Record<string, number> = {}

    if (result.feasible) {
      const direct = this.calculateAllocations(of, stockState)
      for (const [article, qty] of Object.entries(direct)) {
        allocations[article] = qty
      }
      if (Object.keys(allocations).length > 0) {
        stockState.allocate(of.numOf, allocations)
      }
    }

    return {
      numOf: of.numOf,
      article: of.article,
      statutNum: of.statutNum,
      feasible: result.feasible,
      allocatedQuantity: allocations,
      missingComponents: result.missingComponents,
    }
  }

  /**
   * Allocate a list of OFs sequentially.
   */
  allocateStock(ofs: OfRecord[], initialStock?: Map<string, number>): Record<string, AllocationResult> {
    const stockState = new StockState(initialStock ?? new Map())
    const sorted = this.sortOfsByPriority(ofs, stockState)
    const results: Record<string, AllocationResult> = {}
    for (const of of sorted) {
      results[of.numOf] = this.allocateOf(of, stockState)
    }
    return results
  }
}

export { StockState, RecursiveChecker }
export type { OfRecord, StockRecord, ReceptionRecord, ErpAllocation, Article, Nomenclature }
