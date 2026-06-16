import type { Flow } from '#app/domain/models/flow'
import type { GammeOperation } from '#app/domain/models/gamme'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import { X3OfRepository, type ManufacturingOrder } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import { X3SuggestionRepository } from '#repositories/suggestion_repository'
import staticSync from '#services/static_sync_service'

/**
 * Loader mémoire des données X3, stratégie en 4 tiers (cf. décision projet) :
 *  - Référentiel (gammes…) : statique, TTL long.
 *  - OF ouverts : tous (backlog en a besoin), TTL court / reload.
 *  - Live (demande + réceptions) : scopé à l'horizon [from,to], par fenêtre.
 *  - Stock : vivant, scopé par article, toujours frais.
 *
 * Singleton (export default instance). Rechargeable via reloadAll().
 */

const REF_TTL = 2 * 60 * 60 * 1000 // 2 h — référentiel quasi statique
const ORDERS_TTL = 5 * 60 * 1000 // 5 min — OF
const LIVE_TTL = 2 * 60 * 1000 // 2 min — demande/réception par fenêtre

type Referential = { gamme: GammeOperation[]; at: number }
type BomCache = { entries: NomenclatureEntry[]; at: number }
type Orders = { mos: ManufacturingOrder[]; supply: Flow[]; at: number }
type Live = { demand: Flow[]; reception: Flow[]; suggestion: Flow[]; at: number }

class BoardDataset {
  private referential: Referential | null = null
  private orders: Orders | null = null
  private live = new Map<string, Live>()
  private bom: BomCache | null = null

  private fresh(at: number, ttl: number) {
    return Date.now() - at < ttl
  }

  /** Référentiel statique (gammes). TTL long. */
  async getReferential(force = false): Promise<Referential> {
    if (!force && this.referential && this.fresh(this.referential.at, REF_TTL)) {
      return this.referential
    }
    const gamme = await staticSync.readGammes().catch(() => [] as GammeOperation[])
    this.referential = { gamme, at: Date.now() }
    return this.referential
  }

  /** OF ouverts (tous) + flux supply dérivés. TTL court. */
  async getOrders(force = false): Promise<Orders> {
    if (!force && this.orders && this.fresh(this.orders.at, ORDERS_TTL)) {
      return this.orders
    }
    let mos: ManufacturingOrder[]
    try {
      mos = await new X3OfRepository().getManufacturingOrders()
    } catch (e) {
      if (this.orders) return this.orders // sert le cache périmé si X3 KO
      throw e
    }
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
    this.orders = { mos, supply, at: Date.now() }
    return this.orders
  }

  /** Demande + réceptions scopées à l'horizon [from,to]. Cache par fenêtre. */
  async getLive(from: string, to: string, force = false): Promise<Live> {
    const key = `${from}|${to}`
    const hit = this.live.get(key)
    if (!force && hit && this.fresh(hit.at, LIVE_TTL)) return hit

    const [demand, reception, suggestion] = await Promise.all([
      new X3BesoinClientRepository().getDemandFlows({ from, to }),
      new X3ReceptionRepository().getReceptionFlows({ to }),
      // Suggestions CBN (WOS) : supply fab couvrant les MTO/NOR non encore affermies.
      new X3SuggestionRepository().getSuggestionFlows({ from, to }),
    ])
    const fresh: Live = { demand, reception, suggestion, at: Date.now() }
    this.live.set(key, fresh)
    return fresh
  }

  /**
   * Nomenclature (BOM) — chargée à la demande uniquement (bouton Faisabilité).
   * TTL long (2h) : la BOM est quasi-statique mais la requête X3 est lente.
   * Ne pas appeler depuis board() pour ne pas bloquer le chargement du tableau.
   */
  async getNomenclature(force = false): Promise<NomenclatureEntry[]> {
    if (!force && this.bom && this.fresh(this.bom.at, REF_TTL)) return this.bom.entries
    const entries = await staticSync.readNomenclatures().catch(() => [] as NomenclatureEntry[])
    this.bom = { entries, at: Date.now() }
    return entries
  }

  /** Stock vivant, scopé aux articles fournis. Toujours frais (pas de cache). */
  async getStock(articles: string[]): Promise<Flow[]> {
    if (!articles.length) return []
    return new X3StockRepository().getStockFlows(articles)
  }

  /** Vide tous les caches → prochain accès recharge depuis X3. */
  reloadAll() {
    this.referential = null
    this.orders = null
    this.live.clear()
    this.bom = null
  }

  /** Articles (lecture SQLite). Utilisé pour la classification ACHAT/FABRICATION dans la faisabilité. */
  async getArticles(): Promise<import('#app/domain/models/article').Article[]> {
    return staticSync.readArticles().catch(() => [])
  }

  status() {
    return {
      referentialAt: this.referential?.at ?? null,
      ordersAt: this.orders?.at ?? null,
      windows: [...this.live.keys()],
    }
  }
}

const boardDataset = new BoardDataset()
export default boardDataset
