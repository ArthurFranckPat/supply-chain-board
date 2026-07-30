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
}

const ordersReplicaRepository = new OrdersReplicaRepository()
export default ordersReplicaRepository
