/**
 * High-level feasibility service.
 *
 * Wraps RecursiveChecker / availability helpers to expose:
 * - check(): feasibility at a given date with optional reception usage
 * - promiseDate(): earliest feasible date within a horizon
 *
 * Mirrors production_planning.feasibility.feasibility_service.FeasibilityService.
 */
import type { Nomenclature } from './models/nomenclature.js'
import type { Article } from './models/article.js'
import { RecursiveChecker, type RecursiveCheckerLoader, type StockRecord, type ReceptionRecord, type OfRecord } from './recursive-checker.js'
import type { ErpAllocation } from './allocation.js'

export interface ComponentGap {
  article: string
  quantityAvailable: number
  quantityNeeded: number
  quantityGap: number
  earliestReception: string | null
}

export interface FeasibilityCheckResult {
  feasible: boolean
  componentGaps: ComponentGap[]
  feasibleDate: string | null
}

export interface FeasibilityServiceLoader {
  getArticle(article: string): Article | undefined
  getNomenclature(article: string): Nomenclature | undefined
  getStock(article: string): StockRecord | undefined
  getReceptions(article: string): ReceptionRecord[]
  getAllocationsOf?(numDoc: string): ErpAllocation[]
  getOfsByArticle?(article: string, statut?: number, dateBesoin?: Date): OfRecord[]
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export class FeasibilityService {
  constructor(private loader: FeasibilityServiceLoader) {}

  private makeChecker(useReceptions: boolean, checkDate: Date): RecursiveChecker {
    const loader: RecursiveCheckerLoader = {
      getArticle: (a) => this.loader.getArticle(a),
      getNomenclature: (a) => this.loader.getNomenclature(a),
      getStock: (a) => this.loader.getStock(a),
      getReceptions: (a) => (useReceptions ? this.loader.getReceptions(a) : []),
      getAllocationsOf: (numDoc) => this.loader.getAllocationsOf?.(numDoc) ?? [],
      getOfsByArticle: (article, statut, dateBesoin) => this.loader.getOfsByArticle?.(article, statut, dateBesoin) ?? [],
    }
    return new RecursiveChecker(loader, { dispoPolicy: useReceptions ? 'stock_plus_receptions' : 'stock_strict', checkDate })
  }

  /**
   * Check feasibility of producing/purchasing `quantity` of `article` by `date`.
   */
  check(
    article: string,
    quantity: number,
    date: Date,
    options: { useReceptions?: boolean; checkCapacity?: boolean } = {},
  ): FeasibilityCheckResult {
    const useReceptions = options.useReceptions ?? false
    const checkCapacity = options.checkCapacity ?? false

    const checker = this.makeChecker(useReceptions, date)
    const result = checker.checkArticleRecursive(article, quantity, date)

    const componentGaps: ComponentGap[] = []
    for (const [component, gap] of Object.entries(result.missingComponents)) {
      const stock = this.loader.getStock(component)
      const receptions = this.loader.getReceptions(component)
      const available = (stock ? stock.stockPhysique - stock.stockAlloue : 0) + (useReceptions ? receptions.filter((r) => r.date <= date).reduce((s, r) => s + r.quantity, 0) : 0)
      const earliest = receptions.length > 0 ? receptions.sort((a, b) => a.date.getTime() - b.date.getTime())[0].date : null
      componentGaps.push({
        article: component,
        quantityAvailable: available,
        quantityNeeded: available + gap,
        quantityGap: gap,
        earliestReception: earliest ? formatDate(earliest) : null,
      })
    }

    if (checkCapacity) {
      // Capacity checks are out of scope for this minimal port.
    }

    return {
      feasible: result.feasible,
      componentGaps,
      feasibleDate: null,
    }
  }

  /**
   * Find the earliest date when `quantity` of `article` becomes feasible.
   */
  promiseDate(
    article: string,
    quantity: number,
    options: { horizonDays?: number } = {},
  ): FeasibilityCheckResult {
    const horizonDays = options.horizonDays ?? 365
    const today = new Date()
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + horizonDays)

    const candidateDates = new Set<number>([today.getTime()])
    const addReceptions = (a: string) => {
      for (const rec of this.loader.getReceptions(a)) {
        if (rec.date <= maxDate) {
          candidateDates.add(rec.date.getTime())
        }
      }
    }
    addReceptions(article)
    const bom = this.loader.getNomenclature(article)
    if (bom) {
      for (const entry of bom.components) {
        addReceptions(entry.componentArticle)
      }
    }

    const sortedDates = Array.from(candidateDates).sort((a, b) => a - b).map((t) => new Date(t))

    for (const date of sortedDates) {
      const checkResult = this.check(article, quantity, date, { useReceptions: true })
      if (checkResult.feasible) {
        // Report gaps as they stood just before this covering date
        const previousDate = new Date(date)
        previousDate.setDate(date.getDate() - 1)
        const gapResult = this.check(article, quantity, previousDate, { useReceptions: true })
        // Patch earliest reception to the covering date itself
        const patchedGaps = gapResult.componentGaps.map((g) => ({ ...g, earliestReception: formatDate(date) }))
        return {
          feasible: true,
          componentGaps: patchedGaps,
          feasibleDate: formatDate(date),
        }
      }
    }

    // Not feasible within horizon: report gaps at maxDate
    const finalCheck = this.check(article, quantity, maxDate, { useReceptions: true })
    return {
      feasible: false,
      componentGaps: finalCheck.componentGaps,
      feasibleDate: null,
    }
  }
}
