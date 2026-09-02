import type { Flow } from '#app/domain/models/flow'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { Workstation } from '#app/domain/models/workstation'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3MfgmatRepository, type OfMaterial } from '#repositories/mfgmat_repository'
import { X3OrderLineRepository, type OfCommandePeg } from '#repositories/order_line_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3OperationRepository, type OperationRecord } from '#repositories/operation_repository'
import { ConditionnementRepository } from '#repositories/conditionnement_repository'
import {
  estimerDepuisStock,
  estimerDepuisStojou,
  type EstimationsPaire,
} from '#app/domain/conditionnement_estimator'
import { CombinedOrdersRepository } from '#repositories/combined_orders_repository'
import { computeSupplierLatency } from '#repositories/supplier_latency_repository'
import {
  StockValuationRepository,
  isoWeekKey,
  type StockValuationKpi,
  type StockArticleHistory,
  type StockGrain,
} from '#repositories/stock_valuation_repository'
// Type-only : retard_repository importe CE module (getReferential/getOrders).
// Un import de valeur ferait un cycle — la classe est chargée dynamiquement
// dans la factory de getRetardKpi().
import type { RetardChargeKpi } from '#repositories/retard_repository'
import { createHash } from 'node:crypto'
import staticSync from '#services/static_sync_service'
import { cacheNs } from '#services/cache_ns'
import { logStockValuationCall } from '#services/stock_valuation_usage_logger'

/**
 * Loader des données X3, stratégie en 4 tiers (cf. décision projet) :
 *  - Référentiel (gammes…) : statique, TTL long.
 *  - OF ouverts : bornés à [J-90, J+180) sur l'ENDDAT (#183), TTL court / reload.
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
const RETARD_TTL = 5 * 60 * 1000 // 5 min — charge en retard (même fraîcheur que les OF)
const PEG_TTL = 5 * 60 * 1000 // 5 min — peg OF→commande (liens stables)
/**
 * 2 h — valorisation du stock (#183).
 *
 * NE PAS aligner sur `STOCK_TTL`. C'était le cas, et le préchauffage passe
 * toutes les 4 min (`cache_preheat_provider.WARM_INTERVAL_MS`) : 4 min > 2 min,
 * donc l'entrée était TOUJOURS expirée à l'arrivée du warmer, qui rejouait la
 * factory à chaque tick sans exception. ~360 reconstructions par jour de la
 * requête la plus lourde de l'app — 7 appels SOAP chacune (1 base ITMMASTER ×
 * ITMMVT semi-jointe à STOJOU, puis 6 chunks STOJOU de 120 articles sur 12
 * mois). C'est elle qui sort en `curl (28) timed out after 120 s` — et parmi ses
 * 7 appels, ce sont les 6 chunks : la requête de base a été mesurée à 1,1 s le
 * 02/09/2026 (cf. `buildBaseSql` dans `stock_valuation_repository.ts`).
 *
 * 2 h > 4 min : le warmer trouve désormais l'entrée fraîche et ne fait rien.
 * Le coût tombe à ~12 reconstructions par jour.
 *
 * La fraîcheur ne souffre pas : ce KPI est une courbe de valorisation par
 * buckets MENSUELS sur 12 mois glissants. Seul le bucket courant bouge, et une
 * tendance de stock à 2 h près reste juste. Un utilisateur qui veut le dernier
 * état a le chemin `force` (rechargement explicite), qui purge la clé.
 */
const VALUATION_TTL = 2 * 60 * 60 * 1000
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
const board = () => cacheNs('board')

/**
 * Bucket de période d'une date : `YYYY-MM` (mois) ou `YYYY-Www` (semaine ISO).
 *
 * Sert à construire des clés de cache STABLES pour les plages « glissantes »
 * calculées depuis aujourd'hui. Une clé qui embarque le jour courant tourne à
 * minuit : au 1er hit du lendemain il n'existe aucune valeur en grâce, le SWR
 * ne peut rien servir et l'utilisateur paie le recalcul X3 synchrone (mur
 * mesuré : 9 s sur la valorisation du stock). Même piège que 350396b
 * (engagement poste) et 84112b2 (loadPosteSummaries).
 */
const periodBucket = (grain: StockGrain, d: Date): string =>
  grain === 'semaine' ? isoWeekKey(d) : d.toISOString().slice(0, 7)

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

  /**
   * OF ouverts + flux supply dérivés. TTL court.
   *
   * PÉRIMÈTRE BORNÉ, et ce n'est plus « tous » : `of_repository` ne lit que les
   * OF dont l'ENDDAT tombe dans `[J-RETARD_LOOKBACK_DAYS, J+OF_LOOKAHEAD_DAYS)`
   * — 90 j en arrière, 180 j en avant par défaut (#183). Sans borne haute, le
   * CBN remplissait le pool de suggestions lointaines : 87 % du volume, 42 %
   * au-delà de J+180, rechargées ~180 fois par jour par le warmer.
   *
   * Conséquence à connaître avant de s'appuyer dessus : un OF dont la fin
   * dépasse l'horizon est ABSENT de ce pool. Le symptôme est un OF introuvable
   * (recherche du board, diagnostic matières), jamais une erreur. Si un
   * consommateur a besoin de voir plus loin, il lui faut sa propre requête —
   * pas un élargissement de cette clé, qui est rechargée en permanence.
   */
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

  /**
   * Delta MATCHING (#99) : OFs démarrés AVANT la fenêtre qui servent encore une demande de
   * la fenêtre — invisibles de `getOrdersForWindow` (scopé STRDAT) alors que X3 nette le
   * stock prévisionnel sur les dates de FIN. ~14 lignes mesurées en PROD, cache dédié pour
   * ne jamais les mélanger au pool board (elles ne doivent pas s'afficher, juste consommer
   * de la demande dans le matcher).
   */
  async getOrdersForMatchingDelta(from: Date, to: Date, force = false): Promise<Flow[]> {
    const isoL = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${da}`
    }
    const key = `orders-matching-delta:${isoL(from)}:${isoL(to)}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: ORDERS_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const mos = await new X3OfRepository().getManufacturingOrdersForMatching(from, to)
        return mos.map((mo) => ({
          article: mo.article,
          quantity: mo.quantity,
          direction: 'supply' as const,
          date: mo.endDate,
          origin: {
            type: 'of' as const,
            id: mo.numOf,
            status: mo.status,
            statutLabel: mo.statutLabel,
            typeOf: null,
            typeOfLabel: mo.typeOfLabel,
            designation: mo.designation,
            launched: mo.quantityLaunched,
          },
        }))
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
      factory: async () => {
        return new X3OrderLineRepository().getOpenOrderLines({ from, to })
      },
    })
  }

  /** Lignes de commande allégées pour /charge (5 cols, 1 JOIN). Cache SWR partagé.
   * fromStr/toStr au format YYYYMMDD. */
  async getOrderLinesForLoad(
    fromStr: string,
    toStr: string,
    force = false
  ): Promise<import('#repositories/order_line_repository').OrderLineForLoad[]> {
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
        const rows = await staticSync.readNomenclatures().catch(() => [] as NomenclatureEntry[])
        return { entries: rows, at: Date.now() } satisfies BomCache
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

  /**
   * Avancement atelier des OF (pointages MFGOPE). SWR 5 min — même fraîcheur que
   * les OF eux-mêmes ; un pointage de plus ne déplace pas une décision de planning.
   *
   * Passé par le cache partagé parce que DEUX vues en ont désormais besoin (suivi
   * proactif et projection de charge) : sans clé commune, chacune repayait la
   * requête MFGOPE. La clé est le hash de la liste d'OF, comme `getStock` /
   * `getOfPegs` — deux appelants qui visent le même périmètre partagent l'entrée.
   *
   * Aux appelants de RESTREINDRE `numOfs` aux OF réellement pointables (fermes et
   * démarrés) : un OF suggéré n'a pas de pointage, l'envoyer ne fait que gonfler
   * la requête et fragmenter le cache.
   */
  async getOperations(numOfs: string[]): Promise<OperationRecord[]> {
    if (!numOfs.length) return []
    const key = `operations:${createHash('md5')
      .update([...numOfs].sort().join(','))
      .digest('hex')}`
    return board().getOrSet({
      key,
      ttl: ORDERS_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        return new X3OperationRepository().getOperations(numOfs)
      },
    })
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
      factory: async () => {
        return new X3ReceptionRepository().getReceptionFlows()
      },
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
      factory: async () => {
        return new X3StockRepository().getStockFlows(articles)
      },
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
    pinned = false,
    force = false
  ): Promise<StockValuationKpi> {
    // Instrumentation temporaire (cf. stock_valuation_usage_logger) —
    // fire-and-forget, jamais sur le chemin
    // bloquant (cf. stock_valuation_usage_logger.ts).
    void logStockValuationCall(grain, pinned, from, to)

    const isoL = (d: Date) => d.toISOString().slice(0, 10)
    // `pinned` = l'appelant a fourni une plage / une date de référence explicite :
    // ces valeurs ne tournent pas toutes seules, la clé peut les porter telles
    // quelles (et deux plages distinctes ne doivent pas se télescoper).
    // Sinon (cas par défaut du dashboard), la plage est glissante depuis
    // aujourd'hui : on la réduit à ses buckets de période pour que la clé reste
    // stable d'un jour sur l'autre. `refDate` sort de la clé — il ne fait
    // qu'ancrer le calcul, et la factory reçoit toujours la date du jour.
    const key = pinned
      ? `stock-valuation:${grain}:${isoL(from)}:${isoL(to)}:${isoL(refDate)}`
      : `stock-valuation:${grain}:${periodBucket(grain, from)}:${periodBucket(grain, to)}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: VALUATION_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new StockValuationRepository().getStockValuationKpi(refDate, grain, from, to),
    })
  }

  /**
   * KPI charge en retard (dashboard) — cache SWR GLOBAL.
   *
   * Sans cache, chaque affichage du dashboard rejouait 3 requêtes SOAP
   * SÉQUENTIELLES (ORDERS 90 j + 4 jointures, puis ITMMVT par chunks, puis
   * MFGOPE par chunks) : 23 s mesurées, pour chaque utilisateur, à chaque F5.
   * C'était le seul endpoint du dashboard à ne pas passer par ce loader.
   *
   * Clé stable sans date pour la référence « aujourd'hui » (cf. periodBucket) ;
   * une référence explicitement pinnée par l'appelant garde sa propre clé.
   *
   * Donnée usine (identique pour tous les users) → clé globale, comme orders.
   */
  async getRetardKpi(
    refDate: Date,
    lookbackDays: number,
    pinned = false,
    force = false
  ): Promise<RetardChargeKpi> {
    const key = pinned
      ? `retard-kpi:${lookbackDays}:${refDate.toISOString().slice(0, 10)}`
      : `retard-kpi:${lookbackDays}`
    if (force) await board().delete({ key })
    return board().getOrSet({
      key,
      ttl: RETARD_TTL,
      timeout: SWR_TIMEOUT,
      // Import dynamique : retard_repository importe ce module (getReferential /
      // getOrders). Un import statique en tête de fichier ferait un cycle.
      factory: async () => {
        const { RetardRepository } = await import('#repositories/retard_repository')
        return new RetardRepository().getRetardKpi(refDate, lookbackDays)
      },
    })
  }

  /**
   * Historique hebdo d'un article (sheet de détail du KPI stock). SWR 2 min —
   * même fraîcheur acceptable que le KPI. Le résultat est emballé dans un objet
   * car bentocache ne met pas en cache un `null` nu (article inconnu → 404 du
   * contrôleur, sans re-jeu SOAP à chaque clic).
   */
  async getStockArticleHistory(
    article: string,
    refDate: Date
  ): Promise<StockArticleHistory | null> {
    const isoL = (d: Date) => d.toISOString().slice(0, 10)
    const key = `stock-article-history:${article}:${isoL(refDate)}`
    const cached = await board().getOrSet({
      key,
      ttl: STOCK_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => ({
        detail: await new StockValuationRepository().getArticleStockHistory(article, refDate),
      }),
    })
    return cached.detail
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
   *
   * On cache un tableau d'entries et non la Map, comme `getMfgMaterials` et
   * `getOfPegs` : avec `serialize: false` sur le L1, la valeur cachée est rendue
   * par référence, et `Object.freeze` ne bloque pas `Map.set()` — le contenu
   * d'une Map vit dans des slots internes, pas dans des propriétés. Une Map
   * cachée serait donc mutable par n'importe quel appelant, sans garde-fou
   * possible (cf. `app/services/cache_ns.ts`). Reconstruire la Map à chaque
   * appel isole les appelants les uns des autres.
   */
  async getConditionnementEstimator(force = false): Promise<Map<string, EstimationsPaire>> {
    if (force) await board().delete({ key: 'cond-estimator' })
    const entries = await board().getOrSet({
      key: 'cond-estimator',
      ttl: REF_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const { stock, stojou } = await new ConditionnementRepository().getObservations()
        const articles = new Set([...stock.keys(), ...stojou.keys()])
        const out: [string, EstimationsPaire][] = []
        for (const article of articles) {
          // Les deux sources passent par le domaine : consensus SM* pour STOCK,
          // concordance des N derniers rangements pour STOJOU (ordre récent →
          // ancien préservé par le repository).
          const stockEstim = estimerDepuisStock(stock.get(article) ?? [])
          const stojouEstim = estimerDepuisStojou(stojou.get(article) ?? [])
          if (stockEstim || stojouEstim) {
            out.push([article, { stock: stockEstim, stojou: stojouEstim }])
          }
        }
        return out
      },
    })
    return new Map(entries)
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
   * Utilisation : toute action qui doit voir les OF opérationnels (board index,
   * show, diagnostic).
   *
   * « Totalité » ne vaut plus depuis #183 : le pool est borné à
   * `[J-90, J+180)` sur l'ENDDAT — cf. `getOrders()` juste au-dessus. Un OF plus
   * lointain n'y est pas.
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
   *
   * Entries plutôt que Map dans le cache, pour la même raison que
   * `getConditionnementEstimator` : une Map cachée serait rendue par référence
   * et `Object.freeze` ne protège pas son contenu.
   */
  async getSupplierLatency(force = false): Promise<Map<string, number>> {
    if (force) await board().delete({ key: 'supplier-latency' })
    const { latency } = await board().getOrSet({
      key: 'supplier-latency',
      ttl: REF_TTL,
      timeout: SWR_TIMEOUT,
      factory: async () => {
        const map = await computeSupplierLatency()
        return { latency: [...map.entries()], at: Date.now() }
      },
    })
    return new Map(latency)
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
