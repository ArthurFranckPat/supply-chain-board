import type { Flow } from '#app/domain/models/flow'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3SuggestionRepository } from '#repositories/suggestion_repository'
import staticSync from '#services/static_sync_service'
import cache from '@adonisjs/cache/services/main'
import { HttpContext } from '@adonisjs/core/http'

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

type Referential = { gamme: GammeOperation[]; at: number }
type BomCache = { entries: NomenclatureEntry[]; at: number }
type Orders = { mos: ManufacturingOrder[]; supply: Flow[]; at: number }
type Live = { demand: Flow[]; reception: Flow[]; suggestion: Flow[]; at: number }

/** Cache namespacé `board:*` par utilisateur (cf. config/cache.ts). */
const board = () => {
  const userId = HttpContext.get()?.auth?.user?.id
  return cache.namespace(userId ? `board:user_${userId}` : 'board')
}

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
        const gamme = await staticSync.readGammes().catch(() => [] as GammeOperation[])
        this.lastReferentialAt = Date.now()
        return { gamme, at: this.lastReferentialAt } satisfies Referential
      },
    })
  }

  /** OF ouverts (tous) + flux supply dérivés. TTL court. */
  async getOrders(force = false): Promise<Orders> {
    if (force) await board().delete({ key: 'orders' })
    return board().getOrSet({
      key: 'orders',
      ttl: ORDERS_TTL,
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

  /** Demande + réceptions scopées à l'horizon [from,to]. Cache par fenêtre. */
  async getLive(from: string, to: string, force = false): Promise<Live> {
    const key = `live:${from}:${to}`
    if (force) await board().delete({ key })
    this.liveWindows.add(`${from}|${to}`)
    return board().getOrSet({
      key,
      ttl: LIVE_TTL,
      factory: async () => {
        const [demand, reception, suggestion] = await Promise.all([
          new X3BesoinClientRepository().getDemandFlows({ from, to }),
          new X3ReceptionRepository().getReceptionFlows({ to }),
          // Suggestions CBN (WOS) : supply fab couvrant les MTO/NOR non encore affermies.
          new X3SuggestionRepository().getSuggestionFlows({ from, to }),
        ])
        return { demand, reception, suggestion, at: Date.now() } satisfies Live
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

  /** Stock vivant, scopé aux articles fournis. Toujours frais (pas de cache). */
  async getStock(articles: string[]): Promise<Flow[]> {
    if (!articles.length) return []
    return new X3StockRepository().getStockFlows(articles)
  }

  /** Vide tous les caches `board:*` → prochain accès recharge depuis X3. */
  async reloadAll() {
    await board().clear()
    this.lastReferentialAt = null
    this.lastOrdersAt = null
    this.liveWindows.clear()
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
