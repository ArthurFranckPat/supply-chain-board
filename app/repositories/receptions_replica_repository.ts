import db from '@adonisjs/lucid/services/db'
import type { Flow } from '#app/domain/models/flow'

type ReplicaRow = {
  uuid: string
  num_commande: string
  article: string
  quantity: number
  date: string | null
  supplier: string | null
  designation: string | null
  date_commande: string | null
  qte_commandee: number
}

function parseLocalDay(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toFlow(row: ReplicaRow): Flow {
  return {
    article: row.article,
    quantity: row.quantity,
    direction: 'supply',
    date: parseLocalDay(row.date),
    origin: {
      type: 'reception',
      id: row.num_commande,
      supplier: row.supplier ?? '',
      designation: row.designation,
      categorie: null,
      dateCommande: parseLocalDay(row.date_commande),
      qteCommandee: row.qte_commandee,
      // Même invariant qu'à l'ingestion (`X3ReceptionRepository.getReceptionRows`) :
      // PORDERQ filtré sur PORDER.CLEFLG=1 → POs confirmées → toujours fermes.
      firm: true,
    },
  }
}

/**
 * Lecture read-only de `receptions_replica` (#98, suite lot 3).
 *
 * Miroir de `X3ReceptionRepository.getReceptionFlows()` (sans borne `to`, la seule
 * forme appelée par `board_dataset.getReceptions()`) — mêmes filtres appliqués à
 * l'ingestion par `ReplicaSyncService.syncReceptions()`.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('receptions_replica')` en amont.
 */
export class ReceptionsReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getReceptionFlows(): Promise<Flow[]> {
    const rows = await this.conn.from('receptions_replica').select('*')
    return (rows as ReplicaRow[]).map(toFlow)
  }
}

const receptionsReplicaRepository = new ReceptionsReplicaRepository()
export default receptionsReplicaRepository
