import db from '@adonisjs/lucid/services/db'
import type { StockFluxDocRow } from '#repositories/stock_flux_repository'

/**
 * Lecture read-only de `stock_flux_replica` (#98, lot 3 — scoping du
 * 30/07/2026). Miroir de `StockFluxRepository.getFluxNetByDocument()` : même
 * grain (article, jour, document), même bornes [from, to] inclusives.
 *
 * PAS ENCORE consommée par `stock_valuation_repository`/`board_dataset` — cette
 * table sert d'abord à valider l'ingestion (`replica:sync --compare`) avant
 * d'envisager de basculer une lecture dessus, même motif que le lot 1 pour
 * `orders_replica`/`stock_replica`.
 */
type ReplicaRow = {
  article: string
  jour: string
  vcrtyp: string
  vcrnum: string
  net_doc: number
}

function toOwn(row: ReplicaRow): StockFluxDocRow {
  return {
    article: row.article,
    jour: new Date(`${row.jour}T00:00:00`),
    vcrtyp: row.vcrtyp,
    vcrnum: row.vcrnum,
    netDoc: row.net_doc,
  }
}

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export class StockFluxReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getFluxNetByDocument(from: Date, to: Date): Promise<StockFluxDocRow[]> {
    const rows = await this.conn
      .from('stock_flux_replica')
      .where('jour', '>=', isoLocal(from))
      .andWhere('jour', '<=', isoLocal(to))
      .select('*')
    return (rows as ReplicaRow[]).map(toOwn)
  }
}

const stockFluxReplicaRepository = new StockFluxReplicaRepository()
export default stockFluxReplicaRepository
