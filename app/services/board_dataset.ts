import type { Flow } from '#app/domain/models/flow'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { Workstation } from '#app/domain/models/workstation'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3MfgmatRepository, type OfMaterial } from '#repositories/mfgmat_repository'
import { X3OrderLineRepository, type OfCommandePeg } from '#repositories/order_line_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { ConditionnementRepository } from '#repositories/conditionnement_repository'
import { estimerDepuisStock, type EstimationsPaire } from '#app/domain/conditionnement_estimator'
import { CombinedOrdersRepository } from '#repositories/combined_orders_repository'
import { computeSupplierLatency } from '#repositories/supplier_latency_repository'
import {
  StockValuationRepository,
  type StockValuationKpi,
  type StockGrain,
} from '#repositories/stock_valuation_repository'
import { createHash } from 'node:crypto'
import staticSync from '#services/static_sync_service'
import cache from '@adonisjs/cache/services/main'

/**
 * Loader des données X3, stratégie en 4 tiers (cf. décision projet) :
 *  - Référentiel (gammes…) : statique, TTL long.
 *  - OF ouverts : tous (backlog en a besoin), TTL court / reload.
 *  - Live (demande + réceptions) : scopé à l'horizon [from,to], par fenêtre.
 *  - Stock : vivant, scopé par article, toujours frais.
 *
 * Cache distribué via `@adonisjs/cache` (issue #20), namespace `board:*` :
 * persistant cross-reboot + partagé entre instances (L2 Redis), avec une couche
 * L1 mémoire pour l'accès rapide intra-process. Le grace period (config/cache.ts)
 * sert la valeur périmée si X3 est injoignable (remplace l'ancien fallback in-memory).
 *
 * Singleton (export default instance). Invalidation globale via reloadAll().
 */

const REF_TTL = 2 * 60 * 60 * 1000 // 2 h — référentiel quasi statique
const ORDERS_TTL = 5 * 60 * 1000 // 5 min — OF
const LIVE_TTL = 2 * 60 * 1000 // 2 min — demande/réception par fenêtre
const STOCK_TTL = 2 * 60 * 1000 // 2 min — stock (vivant mais acceptable pour planning)
const MFGMAT_TTL = 2 * 60 * 1000 // 2 min — matières OF (consommation lente en planning)
const PEG_TTL = 5 * 60 * 1000 // 5 min — peg OF→commande (liens stables)
// SWR (issue #33) : timeout 0 = vrai stale-while-revalidate de bentocache. Si une valeur en grace
// existe, elle est servie INSTANTANÉMENT et le refresh X3 part en arrière-plan (isBackground → les
// erreurs de la factory sont avalées). NE PAS mettre > 0 : un timeout positif sort le refresh du mode
// background ; à son rejet la promesse orpheline → unhandled rejection → crash serveur.
const SWR_TIMEOUT = 0

type Referential = { gamme: GammeOperation[]; workstations: Workstation[]; at: number }
type BomCache = { entries: NomenclatureEntry[]; at: number }
type Orders = { mos: ManufacturingOrder[]; supply: Flow[]; at: number }
type Live = { demand: Flow[]; reception: Flow[]; supply: Flow[]; at: number }

/**
 * Cache namespacé `board:*` — clé GLOBALE, pas par utilisateur (issue #39, C2).
 * referential/orders/live/bom sont des données usine identiques pour tous les
 * users (vues ERP read-only). Un namespace par user faisait repayer le cold start
 * X3 (~18 s) à chaque nouvel utilisateur. Avec une clé partagée, le premier user
 * réchauffe pour tous. Les creds X3 (via ALS) ne changent que la session, pas la
 * donnée renvoyée → aucun risque de cloisonnement.
 */
const board = () => cache.namespace('board')

class BoardDataset {
  // Horodatages du dernier peuplement (in-memory, pour status() / affichage UI).
  // Réinitialisés au boot et au reloadAll ; la donnée elle-même vit dans le cache.
  private lastReferentialAt: number | null = null
  private lastOrdersAt: number | null = null
  private liveWindows = new Set<string>()

  /** Référentiel statique (gammes). TTL long. */
  async getReferential(force = false): Promise<Referential> {
    if (force) await board().delete({ key: 'referential' })
    return board().getOrSet({
      key: 'referential',
      ttl: REF_TTL,
      factory: async () => {
        const [gamme, workstations] = await Promise.all([
          staticSync.readGammes().catch(() => [] as GammeOperation[]),
          staticSync.readWorkstations().catch(() => [] as Workstation[]),
        ])
        this.lastReferentialAt = Date.now()
        return { gamme, workstations, at: this.lastReferentialAt } satisfies Referential
      },
    })
  }

  /** OF ouverts (tous) + flux supply dérivés. TTL court. */
  async getOrders(force = false): Promise<Orders> {
    if (force) await board().delete({ key: 'orders' })
    return board().getOrSet({
      key: 'orders',
      ttl: ORDERS_TTL,
      // SWR (issue #33) : la vue ORDERS X3 est lente (~18 s cold). Si une valeur en grace
      // existe et que la factory dépasse SWR_TIMEOUT, on rend la stale instantanément et le
      // refresh X3 finit en arrière-plan (contexte requête → creds X3 via ALS). L'utilisateur
      // ne paie le mur froid qu'au tout premier chargement (aucune valeur en grace).
      timeout: SWR_TIMEOUT,
      factory: async () => {
        // Throw si X3 KO → le grace period sert la valeur périmée si disponible.
        const mos = await new X3OfRepository().getManufacturingOrders()
        const supply: Flow[] = mos.map((mo) => ({
          article: mo.article,
          quantity: mo.quantity,
          direction: 'supply',
          date: mo.endDate,
          origin: {
            type: 'of',
            id: mo.numOf,
            status: mo.status,
            statutLabel: mo.statutLabel,
            typeOf: null,
            typeOfLabel: mo.typeOfLabel,
            designation: mo.designation,
            launched: mo.quantityLaunched,
          },
        }))
        this.lastOrdersAt = Date.now()
        return { mos, supply, at: this.lastOrdersAt } satisfies Orders
      },
    })
  }

  /** OFs dont STRDAT ∈ [from, to] — fenêtre courte, ~25× moins de lignes que getOrders().
   * Cache par fenêtre (clé orders-window:from:to). Utilisé par /ordonnancement et /programme
   * pour ne charger que les OFs visibles sur le board, au lieu du lookback 90j ENDDAT. */
  async getOrdersForWindow(from: Date, to: Date, force = false): Promise<Orders> {
    const isoL = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${da}`
    }
    const key = `orders-window:${isoL(from)}:${isoL(to)}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: ORDERS_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const mos = await new X3OfRepository().getManufacturingOrdersForWindow(from, to)
        const supply: Flow[] = mos.map((mo) => ({
          article: mo.article,
          quantity: mo.quantity,
          direction: 'supply',
          date: mo.endDate,
          origin: {
            type: 'of',
            id: mo.numOf,
            status: mo.status,
            statutLabel: mo.statutLabel,
            typeOf: null,
            typeOfLabel: mo.typeOfLabel,
            designation: mo.designation,
            launched: mo.quantityLaunched,
          },
        }))
        return { mos, supply, at: Date.now() } satisfies Orders
      },
    })
  }

  /** Demande (WIPTYP=1) + réceptions (WIPTYP=2) scopées à [from, to], sans OFs.
   * Remplace getLive() quand les OFs sont fournis par getOrdersForWindow().
   * ZSOAPSQL O(n²) ~2-3× moins de lignes → requête ~4-9× plus rapide. */
  async getDemandAndReception(
    from: string,
    to: string,
    force = false
  ): Promise<{ demand: Flow[]; reception: Flow[] }> {
    const key = `demand-recep:${from}:${to}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: LIVE_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const { demandFlows, receptionFlows } =
          await new CombinedOrdersRepository().fetchDemandAndReception(from, to)
        return { demand: demandFlows, reception: receptionFlows }
      },
    })
  }

  /** Lignes de commande ouvertes (OrderLineRow complet, fat query) pour la vue
   * planification (loadOrderBoardData). Cache SWR partagé — avant, /programme?mode=planification
   * appellait getOpenOrderLines en DIRECT à chaque load (SOAP fat 11 cols + 5 JOINs, non caché).
   * from/to au format ISO 'YYYY-MM-DD'. */
  async getOpenOrderLines(
    from: string,
    to: string,
    force = false
  ): Promise<import('#repositories/order_line_repository').OrderLineRow[]> {
    const key = `order-lines:${from}:${to}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: LIVE_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new X3OrderLineRepository().getOpenOrderLines({ from, to }),
    })
  }

  /** Lignes de commande allégées pour /charge (5 cols, 1 JOIN). Cache SWR partagé.
   * fromStr/toStr au format YYYYMMDD. */
  async getOrderLinesForLoad(
    fromStr: string,
    toStr: string,
    force = false
  ): Promise<
    Pick<
      import('#repositories/order_line_repository').OrderLineRow,
      'article' | 'designation' | 'quantite' | 'dateLivraison' | 'nature'
    >[]
  > {
    const key = `order-lines-load:${fromStr}:${toStr}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: LIVE_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new X3OrderLineRepository().getOrderLinesForLoad(fromStr, toStr),
    })
  }

  /** Demande + réceptions scopées à l'horizon [from,to]. Cache par fenêtre.
   * Les suggestions ne sont plus lues ici depuis #32 : elles viennent d'ORDERS via
   * getOrders() (statut 3), temps réel → plus de source CBNDET ni de blacklist. */
  async getLive(from: string, to: string, force = false): Promise<Live> {
    const key = `live:${from}:${to}`
    if (force) await board().delete({ key })
    this.liveWindows.add(`${from}|${to}`)
    return board().getOrSet({
      key,
      ttl: LIVE_TTL,
      // SWR (issue #33) : demande+réception X3 lent (~13 s cold). Cf. getOrders.
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const { demandFlows, receptionFlows, ofFlows } =
          await new CombinedOrdersRepository().fetchLive(from, to)
        return {
          demand: demandFlows,
          reception: receptionFlows,
          supply: ofFlows,
          at: Date.now(),
        } satisfies Live
      },
    })
  }

  /**
   * Nomenclature (BOM) — chargée à la demande uniquement (bouton Faisabilité).
   * TTL long (2h) : la BOM est quasi-statique mais la requête X3 est lente.
   * Ne pas appeler depuis board() pour ne pas bloquer le chargement du tableau.
   */
  async getNomenclature(force = false): Promise<NomenclatureEntry[]> {
    if (force) await board().delete({ key: 'bom' })
    const { entries } = await board().getOrSet({
      key: 'bom',
      ttl: REF_TTL,
      factory: async () => {
        const entries = await staticSync.readNomenclatures().catch(() => [] as NomenclatureEntry[])
        return { entries, at: Date.now() } satisfies BomCache
      },
    })
    return entries
  }

  /** Matières MFGMAT des OFs fournis. SWR 2min — évite l'épuisement du pool Knex X3 (max 4). */
  async getMfgMaterials(numOfs: string[]): Promise<Map<string, OfMaterial[]>> {
    if (!numOfs.length) return new Map()
    const key = `mfgmat:${createHash('md5')
      .update([...numOfs].sort().join(','))
      .digest('hex')}`
    const entries = await board().getOrSet({
      key,
      ttl: MFGMAT_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const map = await new X3MfgmatRepository().getMaterialsForOfs(numOfs)
        return [...map.entries()]
      },
    })
    return new Map(entries)
  }

  /** Reverse peg OF→commande. SWR 5min — liens stables entre refreshs. */
  async getOfPegs(numOfs: string[]): Promise<Map<string, OfCommandePeg>> {
    if (!numOfs.length) return new Map()
    const key = `ofpegs:${createHash('md5')
      .update([...numOfs].sort().join(','))
      .digest('hex')}`
    const entries = await board().getOrSet({
      key,
      ttl: PEG_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const map = await new X3OrderLineRepository().getCommandesByOf(numOfs)
        return [...map.entries()]
      },
    })
    return new Map(entries)
  }

  /** Reverse peg OF→commandes (N-N, triées par urgence). SWR 5min.
   * Panneau « Engagement » par poste (#46) — un OF peut alimenter plusieurs commandes. */
  async getOfPegsAll(numOfs: string[]): Promise<Map<string, OfCommandePeg[]>> {
    if (!numOfs.length) return new Map()
    const key = `ofpegs-all:${createHash('md5')
      .update([...numOfs].sort().join(','))
      .digest('hex')}`
    const entries = await board().getOrSet({
      key,
      ttl: PEG_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const map = await new X3OrderLineRepository().getAllCommandesByOf(numOfs)
        return [...map.entries()]
      },
    })
    return new Map(entries)
  }

  /**
   * Réceptions d'achat attendues (PORDERQ ouvertes) — cache SWR GLOBAL partagé.
   * Avant : `new X3ReceptionRepository().getReceptionFlows()` était appelé en direct
   * par 8+ controllers (suivi, board, ruptures, pipeline, planning…) → 8 SOAP ZSOAPSQL
   * O(n²) indépendants pour la MÊME donnée (lignes de commande d'achat ouvertes,
   * changement lent). Maintenant 1 SOAP/2min pour toute l'app. Bornage `from`/`to`
   * fait côté appelant (groupReceptionsByArticle) sur le sur-ensemble caché.
   */
  async getReceptions(force = false): Promise<Flow[]> {
    if (force) await board().delete({ key: 'receptions' })
    return board().getOrSet({
      key: 'receptions',
      ttl: LIVE_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new X3ReceptionRepository().getReceptionFlows(),
    })
  }

  /** Stock scopé aux articles fournis. SWR 2min — suffisant pour un outil de planning. */
  async getStock(articles: string[]): Promise<Flow[]> {
    if (!articles.length) return []
    const key = `stock:${createHash('md5')
      .update([...articles].sort().join(','))
      .digest('hex')}`
    return board().getOrSet({
      key,
      ttl: STOCK_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new X3StockRepository().getStockFlows(articles),
    })
  }

  /**
   * KPI Valorisation du stock (dashboard) — cache SWR GLOBAL par grain + plage.
   * 7 appels SOAP (1 base + 6 chunks STOJOU) → sans cache, chaque affichage de la
   * carte paie ~7 round-trips Syracuse. Donnée usine (identique pour tous les
   * users, comme receptions). TTL court (STOCK_TTL) : le stock évolue, mais 2 min
   * de stale acceptable pour un KPI de tendance.
   */
  async getStockValuation(
    grain: StockGrain,
    from: Date,
    to: Date,
    refDate: Date,
    force = false
  ): Promise<StockValuationKpi> {
    const isoL = (d: Date) => d.toISOString().slice(0, 10)
    const key = `stock-valuation:${grain}:${isoL(from)}:${isoL(to)}:${isoL(refDate)}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: STOCK_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new StockValuationRepository().getStockValuationKpi(refDate, grain, from, to),
    })
  }

  /**
   * Estimateur de US/palette pour les articles au coef de palettisation manquant.
   * Retourne les DEUX estimations (STOCK + STOJOU) indépendamment pour comparaison
   * croisée — l'appelant choisit la stratégie (priorité STOCK pour la page Réceptions,
   * affichage côte à côte pour la page Conditionnements).
   *
   * Clé GLOBALE : l'estimation ne dépend pas de l'utilisateur (données usine).
   * TTL long (REF_TTL = 2h) : le conditionnement change rarement et l'historique
   * STOJOU est quasi-immuable. SWR background (2 appels SOAP agrégeant beaucoup
   * de lignes).
   */
  async getConditionnementEstimator(force = false): Promise<Map<string, EstimationsPaire>> {
    if (force) await board().delete({ key: 'cond-estimator' })
    return board().getOrSet({
      key: 'cond-estimator',
      ttl: REF_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const { stock, stojou } = await new ConditionnementRepository().getObservations()
        const articles = new Set([...stock.keys(), ...stojou.keys()])
        const out = new Map<string, EstimationsPaire>()
        for (const article of articles) {
          // STOCK : consensus SM* calculé côté domaine depuis les observations brutes.
          const stockEstim = estimerDepuisStock(stock.get(article) ?? [])
          // STOJOU : déjà agrégé par Oracle (STATS_MODE) — directement utilisable.
          const stojouEstim = stojou.get(article) ?? null
          if (stockEstim || stojouEstim) {
            out.set(article, { stock: stockEstim, stojou: stojouEstim })
          }
        }
        return out
      },
    })
  }

  /** Vide tous les caches `board:*` → prochain accès recharge depuis X3. */
  async reloadAll() {
    await board().clear()
    this.lastReferentialAt = null
    this.lastOrdersAt = null
    this.liveWindows.clear()
  }

  /**
   * Pool unifié : tous les ordres de fabrication (statut 1/2/3) lus depuis ORDERS
   * (vue planning temps réel, #32). `supply` contient déjà les suggestions (statut 3)
   * — plus de source CBNDET séparée ni de suggestion à fusionner.
   *
   * NE PAS rebrancher getLive() ici (#55) : son résultat était jeté (le pool vient
   * à 100 % de getOrders) mais l'appel forçait un fetchLive FROID sur une fenêtre
   * de 13 mois (clé `live:from:to` que personne d'autre ne réchauffe) → ZSOAPSQL
   * O(n²) sur des dizaines de milliers de lignes → le diagnostic pendait sans fin.
   *
   * Utilisation : toute action qui doit voir la totalité des OF opérationnels (board
   * index, show, diagnostic).
   */
  async getPool(): Promise<{ supply: Flow[]; mos: ManufacturingOrder[] }> {
    const orders = await this.getOrders()
    return { supply: orders.supply, mos: orders.mos }
  }

  /** Articles (lecture SQLite). Utilisé pour la classification ACHAT/FABRICATION dans la faisabilité. */
  async getArticles(): Promise<import('#app/domain/models/article').Article[]> {
    return staticSync.readArticles().catch(() => [])
  }

  /**
   * Latence fournisseur moyenne par article (retard observé, en jours — PRD §8.6).
   * Source : historique PORDERQ (6 derniers mois). TTL long (2h) — donnée
   * historique qui évolue lentement. SWR : sert la stale si X3 est injoignable.
   */
  async getSupplierLatency(force = false): Promise<Map<string, number>> {
    if (force) await board().delete({ key: 'supplier-latency' })
    const { latency } = await board().getOrSet({
      key: 'supplier-latency',
      ttl: REF_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => ({
        latency: await computeSupplierLatency(),
        at: Date.now(),
      }),
    })
    return latency
  }

  status() {
    return {
      referentialAt: this.lastReferentialAt,
      ordersAt: this.lastOrdersAt,
      windows: [...this.liveWindows],
    }
  }
}

const boardDataset = new BoardDataset()
export default boardDataset
