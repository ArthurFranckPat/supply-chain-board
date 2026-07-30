import db from '@adonisjs/lucid/services/db'
import type { ManufacturingOrder } from '#repositories/of_repository'

type ReplicaRow = {
  num_of: string
  article: string
  designation: string | null
  status: number
  statut_label: string | null
  quantity: number
  quantity_launched: number
  quantity_done: number
  start_date: string | null
  end_date: string | null
}

/** Miroir local de `toLocalYYYYMMDD` / `isoDay` — même format `YYYY-MM-DD`. */
function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function parseLocalDay(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toOrder(row: ReplicaRow): ManufacturingOrder {
  return {
    numOf: row.num_of,
    article: row.article,
    designation: row.designation,
    status: row.status as 1 | 2 | 3,
    statutLabel: row.statut_label,
    typeOfLabel: null,
    quantity: row.quantity,
    quantityLaunched: row.quantity_launched,
    quantityDone: row.quantity_done,
    unit: null,
    startDate: parseLocalDay(row.start_date),
    endDate: parseLocalDay(row.end_date),
  }
}

/**
 * Lecture read-only de `orders_replica` (#98, lot 2 — bascule des lectures).
 *
 * Miroir de `X3OfRepository.getManufacturingOrders()` /
 * `getManufacturingOrdersForWindow()` : mêmes filtres (WIPTYP=5, WIPSTA 1/2/3,
 * RMNEXTQTY>0, lookback ENDDAT ≥ J-90), appliqués par `ReplicaSyncService.syncOrders()`
 * à l'INGESTION plutôt qu'ici. `unit`/`typeOfLabel` valent `null` des deux côtés —
 * `X3OfRepository.getManufacturingOrders()` ne les renseigne jamais non plus, donc
 * aucune perte face à la voie directe.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('orders_replica')` en amont (cf. `board_dataset.ts`).
 */
export class OrdersReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /** Toute la tranche utile — mêmes lignes que `getManufacturingOrders()`. */
  async getManufacturingOrders(): Promise<ManufacturingOrder[]> {
    const rows = await this.conn.from('orders_replica').select('*')
    return (rows as ReplicaRow[]).map(toOrder)
  }

  /**
   * OFs dont `start_date` ∈ [from, to] — même sémantique que
   * `getManufacturingOrdersForWindow()`.
   *
   * `orders_replica` est peuplée avec le lookback ENDDAT ≥ J-90 (cf.
   * `X3OfRepository.getManufacturingOrders()`) : une fenêtre qui démarrerait plus de
   * 90 j dans le passé perdrait des lignes que la voie directe aurait vues. Sans
   * conséquence pour /programme (fenêtres proches d'aujourd'hui) — à garder en tête
   * si un futur appelant élargit la fenêtre vers le passé.
   */
  async getManufacturingOrdersForWindow(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    const rows = await this.conn
      .from('orders_replica')
      .where('start_date', '>=', isoLocal(from))
      .andWhere('start_date', '<=', isoLocal(to))
      .select('*')
    return (rows as ReplicaRow[]).map(toOrder)
  }

  /**
   * Miroir réplique de `X3OfRepository.getManufacturingOrdersForMatching()` (#99) :
   * OFs démarrés avant `from`, encore ouverts, fin ≤ `to`, sur un article ayant de
   * la demande dans la fenêtre.
   *
   * Deux requêtes plutôt qu'une jointure/sous-requête corrélée : `order_lines_replica`
   * et `orders_replica` sont deux tables indépendantes du même fichier SQLite, le
   * volume (dizaines de lignes) rend le coût du deuxième aller négligeable.
   *
   * Le sous-filtre WIPTYP=1 de `buildMatchingDeltaSql` compare sur `ENDDAT_0` brut,
   * alors que `date_livraison` vaut l'ÉCHÉANCE (`SHIDAT_0` firme / `ENDDAT_0`
   * prévision, cf. `X3OrderLineRepository`). Vérifié en PROD le 30/07/2026 :
   * `SHIDAT_0 = ENDDAT_0` sur 100 % des lignes fermes (WIPTYP=1, WIPSTA=1,
   * RMNEXTQTY>0) — pas une divergence marginale, une égalité totale sur toute la
   * population. `date_livraison` est donc équivalent à `ENDDAT_0` ici.
   */
  async getManufacturingOrdersForMatching(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    const fromIso = isoLocal(from)
    const toIso = isoLocal(to)

    const demandRows = await this.conn
      .from('order_lines_replica')
      .where('date_livraison', '>=', fromIso)
      .andWhere('date_livraison', '<=', toIso)
      .distinct('article')
      .select('article')
    const articles = (demandRows as { article: string }[]).map((r) => r.article)
    if (articles.length === 0) return []

    const rows = await this.conn
      .from('orders_replica')
      .where('end_date', '<=', toIso)
      .andWhere((q) => q.where('start_date', '<', fromIso).orWhere('start_date', '>', toIso))
      .whereIn('article', articles)
      .select('*')
    return (rows as ReplicaRow[]).map(toOrder)
  }
}

const ordersReplicaRepository = new OrdersReplicaRepository()
export default ordersReplicaRepository
