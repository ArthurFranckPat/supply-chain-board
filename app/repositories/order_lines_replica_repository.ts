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
  /** Nullable : lignes ingérées avant la migration des quantités (#98). */
  qte_restante: number | null
  qte_commandee: number | null
  qte_allouee: number | null
}

/** Ligne de commande ferme telle que `RetardRepository` la consomme. */
export interface RetardReplicaLine {
  numCommande: string
  ligne: string
  client: string | null
  article: string
  designation: string | null
  dateExpedition: Date
  qteRestante: number
  qteCommandee: number
  qteAllouee: number
  contremarque: string | null
  orderType: OrderType | null
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
    // `quantite > 0` REPRODUIT ICI le filtre que l'ingestion appliquait avant
    // (#98) : la table mire désormais la source (`RMNEXTQTY_0 > 0`) et contient
    // donc aussi les lignes entièrement allouées, à besoin nul. Les retirer ici
    // rend aux appelants exactement le contrat de
    // `X3OrderLineRepository.getOpenOrderLines()`, ni plus ni moins.
    let query = this.conn.from('order_lines_replica').select('*').where('quantite', '>', 0)
    if (opts?.from && opts?.to) {
      query = query
        .where('date_livraison', '>=', opts.from)
        .andWhere('date_livraison', '<=', opts.to)
    }
    const rows = await query
    return (rows as ReplicaRow[]).map(toOrderLine)
  }

  /**
   * Population de `RetardRepository` : commandes FERMES à reliquat, sur une
   * fenêtre d'échéance. Miroir de son `buildSql`.
   *
   * Trois correspondances à ne pas perdre de vue :
   *
   *  - `nature = 'COMMANDE'` ≡ `WIPSTA_0 = 1` (cf. `X3OrderLineRepository`).
   *  - `qte_restante > 0` ≡ `RMNEXTQTY_0 > 0`, le filtre du retard — et NON
   *    `quantite > 0`, qui exclurait les lignes entièrement allouées que ce KPI
   *    existe justement pour écarter en connaissance de cause.
   *  - `date_livraison` vaut `SHIDAT_0` pour les fermes, quand `buildSql` lit
   *    `ENDDAT_0`. Vérifié en PROD sur TOUTE la population
   *    `WIPTYP_0=1 AND WIPSTA_0=1 AND RMNEXTQTY_0>0` : `SHIDAT_0 = ENDDAT_0` sur
   *    100 % des lignes, zéro divergence (commit 9894797). Le jour où ça cesse
   *    d'être vrai, c'est cette lecture qui décale.
   *
   * Borne HAUTE exclusive, comme `buildSql` (`< toStr`).
   *
   * `ITMSTA_0 = 1` (article actif) n'est pas rejouable ici : le filtre est
   * appliqué à l'INGESTION et la colonne n'est pas répliquée. Sans conséquence,
   * les deux requêtes le posent identiquement.
   */
  async getRetardLines(fromIso: string, toIso: string): Promise<RetardReplicaLine[]> {
    const rows = await this.conn
      .from('order_lines_replica')
      .select('*')
      .where('nature', 'COMMANDE')
      .andWhere('qte_restante', '>', 0)
      .andWhere('date_livraison', '>=', fromIso)
      .andWhere('date_livraison', '<', toIso)
      .orderBy('date_livraison')

    return (rows as ReplicaRow[]).map((r) => ({
      numCommande: r.num_commande,
      ligne: r.ligne,
      client: r.client,
      article: r.article,
      designation: r.designation,
      dateExpedition: new Date(`${r.date_livraison}T00:00:00`),
      qteRestante: r.qte_restante ?? 0,
      qteCommandee: r.qte_commandee ?? 0,
      qteAllouee: r.qte_allouee ?? 0,
      contremarque: r.contremarque,
      orderType: (r.order_type as OrderType | null) ?? null,
    }))
  }
}

const orderLinesReplicaRepository = new OrderLinesReplicaRepository()
export default orderLinesReplicaRepository
