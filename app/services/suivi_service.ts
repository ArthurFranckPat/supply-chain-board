/**
 * Composition « suivi des commandes » — wiring domaine ↔ repos X3 (≈ composition.py).
 *
 * Branche les ports purs de #app/domain/suivi sur les repos X3 existants, et expose des
 * méthodes de haut niveau consommées par suivi_controller (endpoints minces).
 *
 * Champs ERP manquants (cf. ENRICHMENT_TODO sur master, décision issue #19 =
 * « porter l'algo, champs vides pour l'instant ») :
 *  - emplacements → chargés (STOALL allocation + STOCK physique via X3EmplacementRepository)
 *  - dateLivPrevu → null
 *  - infos palette / postes de charge → providers stubbés (résultats vides mais structure réelle)
 * Les algorithmes sont entièrement portés : dès que ces sources existeront, il suffira de
 * remplacer les adapters stub ci-dessous (StubPaletteProvider / StubChargeCalculator).
 */

import {
  assignStatuses,
  attachCauses,
  computePaletteSummary,
  computeRetardCharge,
  type Emplacement,
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
import { X3EmplacementRepository } from '#repositories/emplacement_repository'
import { buildNomenclatureMap, buildOfRecords } from '#services/feasibility-loader-adapter'
import staticSync from '#services/static_sync_service'
import boardDataset from '#services/board_dataset'
import type { GammeOperation } from '#app/domain/models/gamme'
import cache from '@adonisjs/cache/services/main'
import { RecursiveChecker, type OfRecord, type StockRecord, type ReceptionRecord } from '#app/domain/recursive-checker'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
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
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
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

/**
 * ChargeCalculator réel branché sur la gamme (issue #38). Heures = qté / rate (unités/h)
 * par poste de charge (workstation), source = référentiel partagé `boardDataset` (cache SWR,
 * même source que /charge). Remplace le stub pour le KPI « charge en retard ».
 *
 * v1 : `calculateRecursiveCharge` = `calculateDirectCharge` — seule la charge du PF (gamme
 * directe) est comptée ; les sous-ensembles fabriqués ne sont PAS encore sommés (à itérer).
 */
class GammeChargeCalculator implements ChargeCalculatorPort {
  constructor(
    private opsByArticle: Map<string, GammeOperation[]>,
    private labels: Map<string, string>,
  ) {}

  calculateDirectCharge(article: string, quantity: number): Record<string, number> {
    const out: Record<string, number> = {}
    for (const op of this.opsByArticle.get(article) ?? []) {
      if (op.rate > 0 && op.workstation) {
        out[op.workstation] = (out[op.workstation] ?? 0) + quantity / op.rate
      }
    }
    return out
  }
  calculateRecursiveCharge(article: string, quantity: number): Record<string, number> {
    return this.calculateDirectCharge(article, quantity)
  }
  getPosteLibelle(poste: string): string {
    return this.labels.get(poste) ?? poste
  }
  isValidPoste(poste: string): boolean {
    return this.labels.has(poste)
  }
}

/**
 * Construit le ChargeCalculator gamme depuis le référentiel (boardDataset). Dégrade en stub
 * (charge vide) si le référentiel est indisponible → KPI à 0, jamais de crash.
 */
async function buildGammeChargeCalculator(): Promise<ChargeCalculatorPort> {
  try {
    const ref = await boardDataset.getReferential()
    const opsByArticle = new Map<string, GammeOperation[]>()
    const labels = new Map<string, string>()
    for (const g of ref.gamme) {
      const arr = opsByArticle.get(g.article) ?? []
      arr.push(g)
      opsByArticle.set(g.article, arr)
      if (g.workstation && !labels.has(g.workstation)) {
        labels.set(g.workstation, g.workstationLabel || g.workstation)
      }
    }
    return new GammeChargeCalculator(opsByArticle, labels)
  } catch {
    return new StubChargeCalculator()
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

/**
 * Snapshot brut des données X3/SQLite mis en cache sous `suivi:context` (issue #20).
 * Uniquement des structures sérialisables : superjson (config/cache.ts) préserve les
 * `Date` et les `Map` à travers Redis ET la couche L1 mémoire. Les ports domaine
 * (providers, navigateurs BOM) ne sont PAS sérialisables et sont reconstruits à chaud
 * à partir de ce snapshot par `assembleContext()` (partie CPU peu coûteuse).
 */
interface RawSuiviData {
  demandFlows: Flow[]
  ofFlows: Flow[]
  nomenclatureEntries: NomenclatureEntry[]
  articleList: Article[]
  stockFlows: Flow[]
  detailedByOrderLine: Map<string, Emplacement[]>
  stockByArticle: Map<string, Emplacement[]>
  /**
   * Allocations ERP par OF (STOALL, qté active). Créditées au diagnostic de cause :
   * un OF qui tient une allocation sur un composant ne doit pas être accusé de la
   * rupture que sa propre réservation crée (le stock net est déjà minoré de GLOALL).
   * Optionnel : absent des snapshots cachés antérieurs (grace) → dégrade en Map vide.
   */
  allocationsByOf?: Map<string, ErpAllocation[]>
}

// Cache distribué du contexte (cf. boardDataset, issue #20), namespace `suivi:*`.
// Le contexte (lignes + stock + OF + BOM) est indépendant de la date : seul
// assignStatuses/attachCauses (purs, rapides) rerun par referenceDate. Les sources
// live (demande/OF/stock) sont vivantes → TTL court. Persistant cross-reboot via Redis :
// après redémarrage, tant que la clé est valide, pas de cold start X3 (~14 s).
const CONTEXT_TTL = 2 * 60 * 1000 // 2 min

/**
 * Fenêtre arrière (jours) du moteur de causes/faisabilité (issue #39).
 * Couvre l'ancienneté des retards d'expédition. -365 j était absurde : il forçait un scan
 * d'un an de la table ORDERS (filtre date non indexé — ENDDAT/SHIDAT jamais en tête d'index),
 * gonflant la requête demande à ~12k lignes / ~25 s. 90 j (un trimestre) couvre les retards
 * réels ; surcharge possible via `RETARD_LOOKBACK_DAYS`. Partagé par /suivi et /dashboard.
 */
export const RETARD_LOOKBACK_DAYS = Number(process.env.RETARD_LOOKBACK_DAYS) || 90
// Lead time commercial ~21j → commandes à +30j sont déjà hors scope opérationnel.
// Surcharge via SUIVI_FORWARD_DAYS si nécessaire.
export const SUIVI_FORWARD_DAYS = Number(process.env.SUIVI_FORWARD_DAYS) || 30
// Clé GLOBALE, pas par utilisateur (issue #39, C2) : le contexte suivi (lignes +
// stock + OF + BOM) est identique pour tous les users → un namespace par user
// faisait repayer le cold start X3 (~14 s) à chacun. Clé partagée = le premier
// réchauffe pour tous.
const suiviCache = () => cache.namespace('suivi')

/** Invalide le cache de contexte → prochain buildContext() recharge depuis X3. */
export async function reloadSuiviContext() {
  await suiviCache().delete({ key: 'context' })
}

export class SuiviService {
  /**
   * Construit le contexte domaine (lignes + ports branchés). Le snapshot brut X3 est
   * mémoïsé (TTL 2 min, cache distribué) ; les ports (non sérialisables) sont reconstruits
   * à chaque appel à partir du snapshot. Le grace period (config/cache.ts) sert le snapshot
   * périmé si X3 échoue.
   */
  async buildContext(): Promise<SuiviContext> {
    const raw = await suiviCache().getOrSet({
      key: 'context',
      ttl: CONTEXT_TTL,
      // SWR (issue #33) : on laisse le timeout par défaut de bentocache (0) = vrai stale-while-revalidate.
      // À 0, si une valeur en grace existe, elle est servie INSTANTANÉMENT et le refresh part en
      // arrière-plan (isBackground → les erreurs de la factory sont avalées, cf. bentocache). NE PAS
      // remettre `timeout: 1000` : avec un timeout > 0, le refresh tourne hors mode background ; quand
      // il rejette (loadRaw échoue en tâche de fond) la promesse orpheline → unhandled rejection →
      // crash du serveur → la page /suivi tourne dans le vide. Cold start : pas de grace → attend la factory.
      factory: () => this.loadRaw(),
    })
    return this.assembleContext(raw)
  }

  /**
   * Récupère le snapshot brut depuis X3/SQLite (partie coûteuse — mise en cache).
   *
   * Référentiel (BOM + articles) lu depuis le cache local (staticSync, SQLite) — comme
   * boardDataset — et NON en live X3 : la requête BOM SOAP est lente (timeout 120 s) et
   * fait planter le suivi quand X3 est lent/injoignable, alors que le reste de l'app
   * sert ces mêmes données depuis le local. Demande / OF / stock restent live (vivants).
   */
  private async loadRaw(): Promise<RawSuiviData> {
    const from = new Date()
    from.setDate(from.getDate() - RETARD_LOOKBACK_DAYS)
    const to = new Date()
    to.setDate(to.getDate() + SUIVI_FORWARD_DAYS)
    const fromIso = from.toISOString().slice(0, 10)
    const toIso = to.toISOString().slice(0, 10)

    // 1 SOAP getLive WIPTYP=1+2+5, fenêtre [today-90, today+30].
    // Lead time commercial ~21j → +30j couvre le backlog opérationnel. Commandes au-delà = non actionnables.
    const [{ demand: demandFlows, reception: receptionFlows, supply: ofFlows }, nomenclatureEntries, articleList] = await Promise.all([
      boardDataset.getLive(fromIso, toIso),
      staticSync.readNomenclatures().catch(() => [] as NomenclatureEntry[]),
      staticSync.readArticles().catch(() => [] as Article[]),
    ])

    // Même construction que loadOrderImpacts : seed OFs+demand+réceptions, expansion BOM récursive.
    // → articleSet identique → même md5 → cache stock partagé entre rows et proactive-rows.
    const scopeArticles = new Set<string>()
    for (const f of ofFlows) if (f.article) scopeArticles.add(f.article)
    for (const f of demandFlows) if (f.article) scopeArticles.add(f.article)
    for (const f of receptionFlows) if (f.article) scopeArticles.add(f.article)
    let added = true
    while (added) {
      added = false
      for (const e of nomenclatureEntries) {
        if (scopeArticles.has(e.parentArticle) && !scopeArticles.has(e.componentArticle)) {
          scopeArticles.add(e.componentArticle)
          added = true
        }
      }
    }

    const stockFlows = await boardDataset.getStock([...scopeArticles])

    // Emplacements par ligne (détection zone d'expédition). STOALL = allocation détaillée
    // (ligne réservée), sinon STOCK physique (pré-allocation, cas MTO/normal). Remis dans le
    // cold path : les emplacements alimentent la colonne « Emplacement » ET le statut retard
    // via enZoneExpedition() — une ligne dont le stock est déjà au quai n'est pas en retard.
    // Le commit perf bc4a911 les avait retirés en attente d'un endpoint lazy, mais la zone
    // d'expé doit être connue AU cold path pour un statut correct. Les 2 SOAP sont dans le
    // cache SWR suivi:context (TTL 2 min + grace) → chaud = instantané.
    const orderDemand = demandFlows.filter((f) => f.direction === 'demand' && f.origin.type === 'order')
    const numCommandes = [...new Set(orderDemand.map((f) => (f.origin as Extract<Flow['origin'], { type: 'order' }>).id).filter(Boolean))]
    const lineArticles = [...new Set(orderDemand.map((f) => f.article).filter(Boolean))]
    const emplRepo = new X3EmplacementRepository()
    // Allocations ERP des OF de la fenêtre (crédit au diagnostic de cause, cf. RawSuiviData).
    const numOfs = [...new Set(
      ofFlows
        .filter((f) => f.origin.type === 'of')
        .map((f) => ((f.origin as Extract<Flow['origin'], { type: 'of' }>).id ?? '').trim())
        .filter(Boolean)
    )]
    const [detailedByOrderLine, stockByArticle, allocationsByOf] = await Promise.all([
      emplRepo.getDetailedByOrderLine(numCommandes),
      emplRepo.getStockLocations(lineArticles),
      emplRepo.getOfAllocations(numOfs),
    ])

    return { demandFlows, ofFlows, nomenclatureEntries, articleList, stockFlows, detailedByOrderLine, stockByArticle, allocationsByOf }
  }

  /**
   * Reconstruit le contexte domaine (ports + maps + lignes) à partir du snapshot brut.
   * Pur / synchrone : aucune I/O. Rejoué à chaque requête (les instances de classes ne
   * survivent pas à la sérialisation du cache).
   */
  private assembleContext(raw: RawSuiviData): SuiviContext {
    const nomenclatures = buildNomenclatureMap(raw.nomenclatureEntries)
    const articles = new Map<string, Article>(raw.articleList.map((a) => [a.code, a]))
    const breakdown = buildStockBreakdownMap(raw.stockFlows)
    const stocks = buildStockRecordMap(raw.stockFlows)
    const ofs: OfRecord[] = buildOfRecords(
      raw.ofFlows
        .filter((f) => f.origin.type === 'of')
        .map((f) => {
          const o = f.origin as Extract<Flow['origin'], { type: 'of' }>
          return { numOf: o.id ?? '', article: f.article, status: o.status ?? 3, quantity: f.quantity, endDate: f.date }
        }),
    )

    const lines = buildOrderLines(raw.demandFlows, nomenclatures, articles)
    applyEmplacements(lines, raw.detailedByOrderLine, raw.stockByArticle)

    return {
      lines,
      stockProvider: new MapStockProvider(breakdown),
      ofMatcher: new FlowOfMatcher(raw.ofFlows, raw.allocationsByOf ?? new Map()),
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
    const chargeCalculator = await buildGammeChargeCalculator()
    return computeRetardCharge(assignments, ctx.bomNavigator, chargeCalculator)
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
 * `f.quantity` = RESTE_LIVRER = EXTQTY_0 - DLVQTY_0 = quantité restant à livrer.
 * `origin.qteCommandee` = EXTQTY_0 = quantité totale commandée.
 * `origin.qteAllouee` = ALLQTY_0 = quantité allouée dans X3.
 *
 * qteRestante = f.quantity (reste à livrer), pas f.quantity + qteAllouee :
 * l'ancienne formule compensait le fait que RESTE_LIVRER était en fait
 * un « reste à fabriquer » (RMNEXTQTY_0 - ALLQTY_0). Maintenant que c'est
 * un vrai reste à livrer, plus de double-count.
 */
export function buildOrderLines(
  demandFlows: Flow[],
  nomenclatures: Map<string, Nomenclature>,
  articles: Map<string, Article>,
): OrderLine[] {
  const lines: OrderLine[] = []
  for (const f of demandFlows) {
    if (f.direction !== 'demand' || f.origin.type !== 'order') continue
    const origin = f.origin as Extract<Flow['origin'], { type: 'order' }>
    const qteAllouee = origin.qteAllouee ?? 0
    lines.push({
      numCommande: origin.id,
      ligne: String(origin.ligne ?? '').trim(),
      article: f.article,
      designation: articles.get(f.article)?.description ?? '',
      nomClient: origin.customer ?? '',
      typeCommande: (origin.orderType ?? 'NOR') as TypeCommande,
      dateExpedition: f.date,
      dateLivPrevu: null,
      qteCommandee: origin.qteCommandee ?? f.quantity,
      qteAllouee,
      qteRestante: f.quantity,
      isFabrique: nomenclatures.has(f.article),
      isHardPegged: origin.contremarque != null,
      ofPegue: origin.contremarque?.trim() || null,
      emplacements: [],
      refCommandeClient: origin.refCommandeClient ?? null,
      refArticleClient: origin.refArticleClient ?? null,
    })
  }
  return lines
}

/**
 * Attache les emplacements à chaque ligne. Deux cas :
 *  - STOALL (allocation) → pastille verte. Résout le stock physique via
 *    STOCOU (chrono stock X3, lien canonique entre STOALL et STOCK) pour
 *    obtenir le vrai emplacement, le PALNUM et la qty réelle.
 *  - sinon → stock physique STOCK (pré-allocation / MTO / normal), en
 *    marquant barré les emplacements déjà alloués à d'autres lignes.
 */
export function applyEmplacements(
  lines: OrderLine[],
  detailedByOrderLine: Map<string, Emplacement[]>,
  stockByArticle: Map<string, Emplacement[]>,
): void {
  // Index STOCOU → STOCK pour le lien canonique entre allocation et stock physique.
  const stockByStoCou = new Map<string, Emplacement>()
  for (const entries of stockByArticle.values()) {
    for (const e of entries) {
      if (e.stoCou) stockByStoCou.set(e.stoCou, e)
    }
  }

  // Collecte tous les STOCOU alloués (toutes lignes confondues) → le stock
  // correspondant n'est pas libre pour les lignes sans allocation.
  const alloues = new Set<string>()
  for (const entries of detailedByOrderLine.values()) {
    for (const e of entries) {
      if (e.stoCou) alloues.add(e.stoCou)
    }
  }

  for (const line of lines) {
    const fromStoall = detailedByOrderLine.get(`${line.numCommande}#${line.ligne}`)
    if (fromStoall && fromStoall.length) {
      // STOALL trouvé → pastille verte. On résout le STOCK physique via
      // STOCOU pour avoir le vrai LOC, PALNUM et la qty réelle à l'emplacement.
      let hasQc = false
      line.emplacements = fromStoall.map((e) => {
        const stockLoc = e.stoCou ? stockByStoCou.get(e.stoCou) : undefined
        if (stockLoc) {
          if (stockLoc.isQc) hasQc = true
          return {
            ...e,
            nom: stockLoc.nom,
            qtePalette: stockLoc.qtePalette,
            hum: stockLoc.hum,
            stoCou: e.stoCou,
            isQc: stockLoc.isQc,
          }
        }
        return e
      })
      line.allocationQc = hasQc
    } else {
      // Pas d'allocation → stock libre, mais on signale visuellement les
      // emplacements déjà alloués à d'autres lignes (flag alreadyAllocated).
      const fromStock = stockByArticle.get(line.article)
      if (fromStock && fromStock.length) {
        line.emplacements = fromStock.map((s) => ({
          ...s,
          alreadyAllocated: s.stoCou ? alloues.has(s.stoCou) : false,
        }))
      }
    }
  }
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

