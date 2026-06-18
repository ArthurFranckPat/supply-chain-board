/**
 * Composition « suivi des commandes » — wiring domaine ↔ repos X3 (≈ composition.py).
 *
 * Branche les ports purs de #app/domain/suivi sur les repos X3 existants, et expose des
 * méthodes de haut niveau consommées par suivi_controller (endpoints minces).
 *
 * Champs ERP manquants (cf. ENRICHMENT_TODO sur master, décision issue #19 =
 * « porter l'algo, champs vides pour l'instant ») :
 *  - emplacements → [] (zone d'expédition non détectable tant que la source n'est pas tranchée)
 *  - dateLivPrevu → null
 *  - infos palette / postes de charge → providers stubbés (résultats vides mais structure réelle)
 * Les algorithmes sont entièrement portés : dès que ces sources existeront, il suffira de
 * remplacer les adapters stub ci-dessous (StubPaletteProvider / StubChargeCalculator) et de
 * peupler `emplacements`.
 */

import {
  assignStatuses,
  attachCauses,
  computePaletteSummary,
  computeRetardCharge,
  recommendActions,
  buildStatusCounts,
  type OrderLine,
  type StockBreakdown,
  type StockProvider,
  type OfMatcherPort,
  type OFInfo,
  type BomNavigator,
  type ChargeCalculatorPort,
  type PaletteInfoProvider,
  type PaletteInfo,
  type StatusAssignment,
  type TypeCommande,
} from '#app/domain/suivi'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3OfRepository } from '#repositories/of_repository'
import { X3NomenclatureRepository } from '#repositories/nomenclature_repository'
import { buildNomenclatureMap, buildOfRecords } from '#services/feasibility-loader-adapter'
import { RecursiveChecker, type OfRecord, type StockRecord, type ReceptionRecord } from '#app/domain/recursive-checker'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Article } from '#app/domain/models/article'
import type { ErpAllocation } from '#app/domain/allocation'
import type { Flow } from '#app/domain/models/flow'

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** StockProvider à partir d'une map de breakdown article → {strict, qc, total}. */
class MapStockProvider implements StockProvider {
  constructor(private breakdown: Map<string, StockBreakdown>) {}

  getAvailableStock(article: string): number {
    return this.breakdown.get(article)?.total ?? 0
  }

  getStockBreakdown(article: string): StockBreakdown {
    return this.breakdown.get(article) ?? { strict: 0, qc: 0, total: 0 }
  }
}

/** OfMatcherPort minimal : meilleur OF planifiable (statut 1>2>3, puis date la plus tôt). */
class FlowOfMatcher implements OfMatcherPort {
  private byArticle = new Map<string, OFInfo[]>()

  constructor(ofFlows: Flow[], private allocations: Map<string, ErpAllocation[]> = new Map()) {
    for (const f of ofFlows) {
      if (f.direction !== 'supply' || f.origin.type !== 'of' || f.quantity <= 0) continue
      const origin = f.origin as Extract<Flow['origin'], { type: 'of' }>
      const status = origin.status ?? 3
      if (status < 1 || status > 3) continue
      const info: OFInfo = {
        numOf: origin.id ?? '',
        article: f.article,
        qteRestante: f.quantity,
        statutNum: status,
        dateFin: f.date,
      }
      const arr = this.byArticle.get(f.article) ?? []
      arr.push(info)
      this.byArticle.set(f.article, arr)
    }
  }

  private static priority(statutNum: number): number {
    if (statutNum === 1) return 0
    if (statutNum === 2) return 1
    return 2
  }

  findMatchingOf(_numCommande: string, article: string, _typeCommande: TypeCommande): OFInfo | null {
    const candidates = this.byArticle.get(article)
    if (!candidates || candidates.length === 0) return null
    return [...candidates].sort((a, b) => {
      const pa = FlowOfMatcher.priority(a.statutNum)
      const pb = FlowOfMatcher.priority(b.statutNum)
      if (pa !== pb) return pa - pb
      const da = a.dateFin?.getTime() ?? Infinity
      const db = b.dateFin?.getTime() ?? Infinity
      return da - db
    })[0]
  }

  getAllocations(numOf: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const alloc of this.allocations.get(numOf) ?? []) {
      out[alloc.article] = (out[alloc.article] ?? 0) + alloc.qteAllouee
    }
    return out
  }
}

/** Loader minimal pour RecursiveChecker, alimenté par les maps déjà chargées. */
class SuiviBomLoader {
  constructor(
    private nomenclatures: Map<string, Nomenclature>,
    private stocks: Map<string, StockRecord>,
    private ofs: OfRecord[],
    private articles: Map<string, Article>,
    private ownAllocations: ErpAllocation[] = [],
  ) {}

  getArticle(article: string): Article | undefined {
    return this.articles.get(article)
  }
  getNomenclature(article: string): Nomenclature | undefined {
    return this.nomenclatures.get(article)
  }
  getStock(article: string): StockRecord | undefined {
    return this.stocks.get(article)
  }
  getReceptions(_article: string): ReceptionRecord[] {
    return []
  }
  getAllocationsOf(_numDoc: string): ErpAllocation[] {
    return this.ownAllocations
  }
  getOfsByArticle(article: string, statut?: number): OfRecord[] {
    let f = this.ofs.filter((o) => o.article === article)
    if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
    return f
  }
}

/** BomNavigator branché sur la nomenclature + RecursiveChecker existant. */
class NomenclatureBomNavigator implements BomNavigator {
  constructor(
    private nomenclatures: Map<string, Nomenclature>,
    private stocks: Map<string, StockRecord>,
    private ofs: OfRecord[],
    private articles: Map<string, Article>,
  ) {}

  getComponentShortages(
    article: string,
    quantity: number,
    ownAllocations: Record<string, number>,
  ): Record<string, number> {
    const allocs: ErpAllocation[] = Object.entries(ownAllocations).map(([art, qty]) => ({
      article: art,
      qteAllouee: qty,
    }))
    const loader = new SuiviBomLoader(this.nomenclatures, this.stocks, this.ofs, this.articles, allocs)
    const checker = new RecursiveChecker(loader, { useReceptions: false })
    // numOfParent synthétique → RecursiveChecker applique ownAllocations via getAllocationsOf.
    const result = checker.checkArticleRecursive(article, quantity, new Date(), 0, false, '__suivi__')
    return result.missingComponents
  }

  isComponentInSubassembly(component: string, rootArticle: string): boolean {
    // Vrai si le composant n'est pas un enfant direct mais apparaît plus profond.
    const root = this.nomenclatures.get(rootArticle)
    if (!root) return false
    const directChild = root.components.some((c) => c.componentArticle === component)
    if (directChild) return false
    for (const child of root.components) {
      if (this.isInBom(component, child.componentArticle)) return true
    }
    return false
  }

  isInBom(component: string, article: string, seen = new Set<string>()): boolean {
    if (seen.has(article)) return false
    seen.add(article)
    const bom = this.nomenclatures.get(article)
    if (!bom) return false
    for (const child of bom.components) {
      if (child.componentArticle === component) return true
      if (this.isInBom(component, child.componentArticle, seen)) return true
    }
    return false
  }
}

/**
 * Stub PaletteInfoProvider — pas de source d'infos palette tant que les champs ERP
 * (unites_par_pal, type_palette) ne sont pas chargés (cf. ENRICHMENT_TODO). Retourne
 * toujours null → résumé palettes vide mais structurellement correct.
 */
class StubPaletteProvider implements PaletteInfoProvider {
  getPaletteInfo(_article: string): PaletteInfo | null {
    return null
  }
}

/**
 * Stub ChargeCalculator — le calcul de charge par poste nécessite gammes + postes de
 * charge non encore branchés ici. Retourne des maps vides → charge retard vide mais
 * structurellement correcte. À remplacer par un adapter gamme/poste réel.
 */
class StubChargeCalculator implements ChargeCalculatorPort {
  calculateDirectCharge(_article: string, _quantity: number): Record<string, number> {
    return {}
  }
  calculateRecursiveCharge(_article: string, _quantity: number): Record<string, number> {
    return {}
  }
  getPosteLibelle(_poste: string): string {
    return ''
  }
  isValidPoste(_poste: string): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface SuiviContext {
  lines: OrderLine[]
  stockProvider: StockProvider
  ofMatcher: OfMatcherPort
  bomNavigator: BomNavigator
  paletteProvider: PaletteInfoProvider
  chargeCalculator: ChargeCalculatorPort
}

export class SuiviService {
  /** Contexte mémoïsé : un seul jeu de fetch X3 par instance, réutilisé par les 3 méthodes. */
  private contextPromise?: Promise<SuiviContext>

  /**
   * Charge les données X3 et construit le contexte domaine (lignes + ports branchés).
   * Mémoïsé : les appels suivants réutilisent le même contexte (pas de re-fetch).
   */
  buildContext(): Promise<SuiviContext> {
    return (this.contextPromise ??= this.loadContext())
  }

  private async loadContext(): Promise<SuiviContext> {
    // Demande / OF / BOM : déjà filtrés côté serveur (ou sans param de scope). Le stock,
    // lui, balaie toute la base sans scope → on le borne aux seuls articles utiles.
    const [demandFlows, ofFlows, nomenclatureEntries] = await Promise.all([
      new X3BesoinClientRepository().getDemandFlows(),
      new X3OfRepository().getSupplyFlows(),
      new X3NomenclatureRepository().getNomenclatureEntries(),
    ])

    const nomenclatures = buildNomenclatureMap(nomenclatureEntries)

    // Articles dont on a besoin du stock : PF commandés + articles OF + tout l'arbre BOM
    // (parents + composants) pour le calcul de rupture récursif.
    const scopeArticles = new Set<string>()
    for (const f of demandFlows) if (f.direction === 'demand' && f.origin.type === 'order') scopeArticles.add(f.article)
    for (const f of ofFlows) if (f.origin.type === 'of') scopeArticles.add(f.article)
    for (const e of nomenclatureEntries) {
      scopeArticles.add(e.parentArticle)
      scopeArticles.add(e.componentArticle)
    }

    const stockFlows = await new X3StockRepository().getStockFlows([...scopeArticles])
    const breakdown = buildStockBreakdownMap(stockFlows)
    const stocks = buildStockRecordMap(stockFlows)
    const ofs: OfRecord[] = buildOfRecords(
      ofFlows
        .filter((f) => f.origin.type === 'of')
        .map((f) => {
          const o = f.origin as Extract<Flow['origin'], { type: 'of' }>
          return { numOf: o.id ?? '', article: f.article, status: o.status ?? 3, quantity: f.quantity, endDate: f.date }
        }),
    )
    const articles = new Map<string, Article>() // catalogue article non chargé ici (dégradation acceptée)

    const lines = buildOrderLines(demandFlows, nomenclatures)

    return {
      lines,
      stockProvider: new MapStockProvider(breakdown),
      ofMatcher: new FlowOfMatcher(ofFlows),
      bomNavigator: new NomenclatureBomNavigator(nomenclatures, stocks, ofs, articles),
      paletteProvider: new StubPaletteProvider(),
      chargeCalculator: new StubChargeCalculator(),
    }
  }

  /** Assigne les statuts + cause + signal CQ pour toutes les lignes courantes. */
  async assignFromLatest(referenceDate: Date): Promise<StatusAssignment[]> {
    const ctx = await this.buildContext()
    return this.assign(ctx, referenceDate)
  }

  /** Assignation pure à partir d'un contexte déjà construit (testable / réutilisable). */
  assign(ctx: SuiviContext, referenceDate: Date): StatusAssignment[] {
    const breakdownMap = stockProviderToMap(ctx)
    const assignments = assignStatuses(ctx.lines, breakdownMap, referenceDate)
    attachCauses(assignments, ctx.stockProvider, ctx.ofMatcher, ctx.bomNavigator)
    return assignments
  }

  async paletteSummary(referenceDate: Date) {
    const ctx = await this.buildContext()
    const assignments = this.assign(ctx, referenceDate)
    return computePaletteSummary(assignments, ctx.paletteProvider, referenceDate)
  }

  async retardCharge(referenceDate: Date) {
    const ctx = await this.buildContext()
    const assignments = this.assign(ctx, referenceDate)
    return computeRetardCharge(assignments, ctx.bomNavigator, ctx.chargeCalculator)
  }
}

// ---------------------------------------------------------------------------
// Helpers de construction (exportés pour les tests)
// ---------------------------------------------------------------------------

export function buildStockBreakdownMap(stockFlows: Flow[]): Map<string, StockBreakdown> {
  const map = new Map<string, StockBreakdown>()
  for (const f of stockFlows) {
    if (f.direction !== 'supply' || f.origin.type !== 'stock') continue
    const sub = (f.origin as { subType?: string }).subType
    if (sub === 'rejected') continue
    const bd = map.get(f.article) ?? { strict: 0, qc: 0, total: 0 }
    if (sub === 'qc') bd.qc += f.quantity
    else bd.strict += f.quantity
    bd.total += f.quantity
    map.set(f.article, bd)
  }
  return map
}

function buildStockRecordMap(stockFlows: Flow[]): Map<string, StockRecord> {
  const map = new Map<string, StockRecord>()
  for (const f of stockFlows) {
    if (f.direction !== 'supply' || f.origin.type !== 'stock') continue
    const sub = (f.origin as { subType?: string }).subType
    if (sub !== 'strict' && sub !== 'qc') continue
    const rec = map.get(f.article) ?? { stockPhysique: 0, stockAlloue: 0 }
    rec.stockPhysique += f.quantity
    map.set(f.article, rec)
  }
  return map
}

/**
 * Construit les OrderLine domaine à partir des flows de demande (commandes uniquement).
 *
 * Sémantique quantités : `RESTE_LIVRER` (flow.quantity) = besoin net à livrer. On reconstruit
 * qteRestante = quantity + qteAllouee pour que besoin_net() = qteRestante - qteAllouee = quantity.
 */
export function buildOrderLines(
  demandFlows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
): OrderLine[] {
  const lines: OrderLine[] = []
  for (const f of demandFlows) {
    if (f.direction !== 'demand' || f.origin.type !== 'order') continue
    const origin = f.origin as Extract<Flow['origin'], { type: 'order' }>
    const qteAllouee = origin.qteAllouee ?? 0
    lines.push({
      numCommande: origin.id,
      article: f.article,
      designation: '',
      nomClient: origin.customer ?? '',
      typeCommande: (origin.orderType ?? 'NOR') as TypeCommande,
      dateExpedition: f.date,
      dateLivPrevu: null,
      qteCommandee: origin.qteCommandee ?? f.quantity,
      qteAllouee,
      qteRestante: f.quantity + qteAllouee,
      isFabrique: nomenclatures.has(f.article),
      isHardPegged: origin.contremarque != null,
      emplacements: [],
    })
  }
  return lines
}

/** Reconstruit une map breakdown depuis le StockProvider du contexte (pour assignStatuses). */
function stockProviderToMap(ctx: SuiviContext): Map<string, StockBreakdown> {
  const map = new Map<string, StockBreakdown>()
  for (const line of ctx.lines) {
    if (map.has(line.article)) continue
    map.set(line.article, ctx.stockProvider.getStockBreakdown(line.article))
  }
  return map
}

export { recommendActions, buildStatusCounts }
