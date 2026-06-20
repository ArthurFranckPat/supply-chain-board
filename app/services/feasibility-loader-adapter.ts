/**
 * Adapter factories for building domain loader interfaces from X3 data.
 *
 * These adapters let controllers use the new domain abstractions
 * (FeasibilityService, evaluateWindow, whatifOrder) without
 * changing how data is fetched from X3.
 *
 * Usage:
 *   const adapter = new FeasibilityLoaderAdapter({
 *     articles, nomenclatures, stocks, receptions, ofs,
 *   })
 *   const service = new FeasibilityService(adapter)
 *   service.check(article, qty, date)
 */
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { ErpAllocation } from '#app/domain/allocation'
import type { StockRecord, ReceptionRecord, OfRecord } from '#app/domain/recursive-checker'
import type { FeasibilityServiceLoader } from '#app/domain/feasibility-service'
import type { PlanningBoardFeasibilityLoader } from '#app/domain/planning-board-feasibility'

export interface LoaderInput {
  articles: Map<string, Article>
  nomenclatures: Map<string, Nomenclature>
  stocks: Map<string, StockRecord>
  receptions: Map<string, ReceptionRecord[]>
  ofs: OfRecord[]
  allocations?: Map<string, ErpAllocation[]>
}

export interface FeasibilityLoaderInput extends LoaderInput {
  commandesClients?: PlanningBoardFeasibilityLoader['commandesClients']
}

/**
 * Derive StockRecord from stock flows as used in the current X3 pipeline.
 * strict + qc = available stock; rejected is excluded.
 */
export function stockRecordFromFlows(
  flows: Array<{ origin: { subType?: string }; quantity: number }>,
): StockRecord | undefined {
  let strict = 0
  let qc = 0
  for (const f of flows) {
    const sub = (f.origin as { subType?: string }).subType
    if (sub === 'strict') strict += f.quantity
    else if (sub === 'qc') qc += f.quantity
  }
  // stockPhysique = strict + qc (inchangé pour les consommateurs board, #11).
  // stockQc tracé À PART : permet au diagnostic de distinguer le dispo réel (strict)
  // du stock bloqué en contrôle qualité, sans changer la sémantique partagée.
  return strict > 0 || qc > 0 ? { stockPhysique: strict + qc, stockAlloue: 0, stockQc: qc } : undefined
}

/**
 * Build a Nomenclature map from flat NomenclatureEntry[] entries.
 */
export function buildNomenclatureMap(entries: NomenclatureEntry[]): Map<string, Nomenclature> {
  const map = new Map<string, Nomenclature>()
  for (const entry of entries) {
    const existing = map.get(entry.parentArticle)
    if (existing) {
      existing.components.push(entry)
    } else {
      map.set(entry.parentArticle, {
        article: entry.parentArticle,
        description: entry.parentDescription,
        components: [entry],
      })
    }
  }
  return map
}

/**
 * Build StockRecord map from stock flows per article.
 */
export function buildStocksMap(
  stockFlows: Array<{ article: string; origin: { subType?: string }; quantity: number }>,
): Map<string, StockRecord> {
  const byArticle = new Map<string, Array<{ origin: { subType?: string }; quantity: number }>>()
  for (const f of stockFlows) {
    const arr = byArticle.get(f.article) ?? []
    arr.push(f)
    byArticle.set(f.article, arr)
  }
  const result = new Map<string, StockRecord>()
  for (const [article, flows] of byArticle) {
    const rec = stockRecordFromFlows(flows)
    if (rec) result.set(article, rec)
  }
  return result
}

/**
 * Build receptions map from reception flows per article.
 */
export function buildReceptionsMap(
  receptionFlows: Array<{ article: string; id?: string; supplier?: string; quantity: number; date: Date | null }>,
): Map<string, ReceptionRecord[]> {
  const byArticle = new Map<string, ReceptionRecord[]>()
  for (const f of receptionFlows) {
    if (!f.date) continue
    const arr = byArticle.get(f.article) ?? []
    arr.push({ id: f.id ?? '', article: f.article, supplier: f.supplier ?? '', quantity: f.quantity, date: f.date })
    byArticle.set(f.article, arr)
  }
  return byArticle
}

/**
 * Convert ManufacturingOrder-like objects → OfRecord[].
 */
export function buildOfRecords(
  mos: Array<{ numOf: string; article: string; status: number; quantity: number; startDate?: Date | null; endDate?: Date | null }>,
): OfRecord[] {
  return mos.map((mo) => ({
    numOf: mo.numOf,
    article: mo.article,
    statutNum: mo.status,
    qteRestante: mo.quantity,
    dateDebut: mo.startDate ?? undefined,
    dateFin: mo.endDate ?? undefined,
  }))
}

/**
 * Adapter implementing domain loader interfaces from pre-built maps.
 * No database/X3 dependency — pure transformation.
 */
export class FeasibilityLoaderAdapter implements FeasibilityServiceLoader, PlanningBoardFeasibilityLoader {
  public ofs: OfRecord[]
  public commandesClients: PlanningBoardFeasibilityLoader['commandesClients']

  constructor(private input: FeasibilityLoaderInput) {
    this.ofs = input.ofs
    this.commandesClients = input.commandesClients
  }

  getArticle(article: string): Article | undefined {
    return this.input.articles.get(article)
  }

  getNomenclature(article: string): Nomenclature | undefined {
    return this.input.nomenclatures.get(article)
  }

  getStock(article: string): StockRecord | undefined {
    return this.input.stocks.get(article)
  }

  getReceptions(article: string): ReceptionRecord[] {
    return this.input.receptions.get(article) ?? []
  }

  getAllocationsOf(numDoc: string): ErpAllocation[] {
    return this.input.allocations?.get(numDoc) ?? []
  }

  getOfsByArticle(article: string, statut?: number): OfRecord[] {
    let filtered = this.ofs.filter((o) => o.article === article)
    if (statut !== undefined) {
      filtered = filtered.filter((o) => o.statutNum === statut)
    }
    return filtered
  }
}
