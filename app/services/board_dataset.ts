import type { Flow } from '#app/domain/models/flow'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { Workstation } from '#app/domain/models/workstation'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { CombinedOrdersRepository } from '#repositories/combined_orders_repository'
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
// SWR (issue #33) : timeout 0 = vrai stale-while-revalidate de bentocache. Si une valeur en grace
// existe, elle est servie INSTANTANÉMENT et le refresh X3 part en arrière-plan (isBackground → les
// erreurs de la factory sont avalées). NE PAS mettre > 0 : un timeout positif sort le refresh du mode
// background ; à son rejet la promesse orpheline → unhandled rejection → crash serveur.
const SWR_TIMEOUT = 0

type Referential = { gamme: GammeOperation[]; workstations: Workstation[]; at: number }
type BomCache = { entries: NomenclatureEntry[]; at: number }
type Orders = { mos: ManufacturingOrder[]; supply: Flow[]; at: number }
type Live = { demand: Flow[]; reception: Flow[]; at: number }

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
          },
        }))
        this.lastOrdersAt = Date.now()
        return { mos, supply, at: this.lastOrdersAt } satisfies Orders
      },
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
        const { demandFlows, receptionFlows } = await new CombinedOrdersRepository().fetchLive(from, to)
        return { demand: demandFlows, reception: receptionFlows, at: Date.now() } satisfies Live
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

  /** Stock scopé aux articles fournis. SWR 2min — suffisant pour un outil de planning. */
  async getStock(articles: string[]): Promise<Flow[]> {
    if (!articles.length) return []
    const key = `stock:${createHash('md5').update([...articles].sort().join(',')).digest('hex')}`
    return board().getOrSet({
      key,
      ttl: STOCK_TTL,
      timeout: SWR_TIMEOUT,
      factory: () => new X3StockRepository().getStockFlows(articles),
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
   * — plus de source CBNDET séparée ni de suggestion à fusionner. getPool() assemble
   * depuis les caches existants (orders + live) sans cache propre.
   *
   * Utilisation : toute action qui doit voir la totalité des OF opérationnels (board
   * index, show, diagnostic).
   */
  async getPool(from: string, to: string): Promise<{ supply: Flow[]; mos: ManufacturingOrder[] }> {
    const [orders] = await Promise.all([this.getOrders(), this.getLive(from, to)])
    return { supply: orders.supply, mos: orders.mos }
  }

  /** Articles (lecture SQLite). Utilisé pour la classification ACHAT/FABRICATION dans la faisabilité. */
  async getArticles(): Promise<import('#app/domain/models/article').Article[]> {
    return staticSync.readArticles().catch(() => [])
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
