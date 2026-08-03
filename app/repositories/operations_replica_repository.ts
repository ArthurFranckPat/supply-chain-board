import db from '@adonisjs/lucid/services/db'
import type { OperationRecord } from '#repositories/operation_repository'

type ReplicaRow = {
  num_of: string
  openum: number
  cplqty: number
  opesta: string
  extqty: number
}

function toRecord(row: ReplicaRow): OperationRecord {
  return {
    mfgnum: row.num_of,
    openum: row.openum,
    cplqty: row.cplqty,
    opesta: row.opesta,
    extqty: row.extqty,
    // Réplique MFGOPE sans colonnes poste — le rattachement cockpit passe par
    // la gamme ou MFGOPETRK (of_a_solder / controle_prod en voie X3).
    cplwst: null,
    extwst: null,
  }
}

/**
 * Lecture read-only de `operations_replica` (#98, suite lot 3).
 *
 * Miroir de `X3OperationRepository.getOperations(numOfs)`, scopée aux `num_of` de
 * la tranche OF d'`orders_flux_replica` (cf. `ReplicaSyncService.replicatedOfNums`)
 * — un `numOf` hors de ce périmètre (ex. `controle_prod_loader`, MFGITM ouverts
 * absents du live) ne ressortira JAMAIS ici, silencieusement. Ce repository ne le
 * sait pas et ne peut pas le détecter : à l'appelant de vérifier que ses `numOfs`
 * restent dans le périmètre couvert avant de basculer sur cette voie (cf.
 * `board_dataset.getOperations`).
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('operations_replica')` en amont.
 */
export class OperationsReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getOperations(numOfs: string[]): Promise<OperationRecord[]> {
    if (!numOfs.length) return []
    const rows = await this.conn
      .from('operations_replica')
      .whereIn('num_of', [...new Set(numOfs)])
      .select('*')
    return (rows as ReplicaRow[]).map(toRecord)
  }
}

const operationsReplicaRepository = new OperationsReplicaRepository()
export default operationsReplicaRepository
