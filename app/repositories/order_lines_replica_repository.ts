import db from '@adonisjs/lucid/services/db'
import type { OrderLineRow } from '#repositories/order_line_repository'
import type { OrderType, NeedNature } from '#app/domain/models/flow'

type ReplicaRow = {
  num_commande: string
  ligne: string
  client: string | null
  article: string
  designation: string | null
  quantite: number
  date_livraison: string
  contremarque: string | null
  unite: string | null
  order_type: string | null
  nature: string
}

function toOrderLine(row: ReplicaRow): OrderLineRow {
  return {
    numCommande: row.num_commande,
    ligne: row.ligne,
    client: row.client,
    article: row.article,
    designation: row.designation,
    quantite: row.quantite,
    dateLivraison: new Date(`${row.date_livraison}T00:00:00`),
    contremarque: row.contremarque,
    unite: row.unite,
    orderType: (row.order_type as OrderType | null) ?? null,
    nature: row.nature as NeedNature,
  }
}

/**
 * Lecture read-only de `order_lines_replica` (#98, lot 2).
 *
 * Miroir de `X3OrderLineRepository.getOpenOrderLines()` : la réplique est ingérée
 * SANS fenêtre (`ReplicaSyncService.syncOrderLines()` appelle `getOpenOrderLines()`
 * sans `{ from, to }`), donc `date_livraison` (= ECHEANCE, `SHIDAT_0` firme /
 * `ENDDAT_0` prévision selon `X3OrderLineRepository`) couvre déjà tout ce qu'une
 * fenêtre demanderait — filtrer localement reproduit `getOpenOrderLines({from,to})`.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('order_lines_replica')` en amont.
 */
export class OrderLinesReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getOpenOrderLines(opts?: { from?: string; to?: string }): Promise<OrderLineRow[]> {
    let query = this.conn.from('order_lines_replica').select('*')
    if (opts?.from && opts?.to) {
      query = query
        .where('date_livraison', '>=', opts.from)
        .andWhere('date_livraison', '<=', opts.to)
    }
    const rows = await query
    return (rows as ReplicaRow[]).map(toOrderLine)
  }
}

const orderLinesReplicaRepository = new OrderLinesReplicaRepository()
export default orderLinesReplicaRepository
