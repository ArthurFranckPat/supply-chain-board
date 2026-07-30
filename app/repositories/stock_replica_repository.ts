import db from '@adonisjs/lucid/services/db'
import type { Flow } from '#app/domain/models/flow'

type ReplicaRow = {
  article: string
  physique: number
  controle_qual: number
  rebut: number
  alloue_phys: number
  alloue_global: number
  pmp: number | null
}

function toFlows(row: ReplicaRow): Flow[] {
  const flows: Flow[] = []
  const strict = row.physique - row.alloue_phys - row.alloue_global
  const pmp = row.pmp

  if (strict > 0) {
    flows.push({
      article: row.article,
      quantity: strict,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'strict', pmp },
    })
  }
  if (row.controle_qual > 0) {
    flows.push({
      article: row.article,
      quantity: row.controle_qual,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'qc', pmp },
    })
  }
  if (row.rebut > 0) {
    flows.push({
      article: row.article,
      quantity: row.rebut,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'rejected', pmp },
    })
  }
  return flows
}

/**
 * Lecture read-only de `stock_replica` (#98, lot 2).
 *
 * Miroir de `X3StockRepository.getStockFlows()` — même formule exacte (strict =
 * physique - allouePhys - alloueGlobal ; contrôle qualité et rebut en flux à part,
 * cf. décision projet « Q compté dispo »). `stock_replica` est déjà agrégée au
 * grain article par `X3StockRepository.getStockLevels()` à l'ingestion (ITMMVT porte
 * plusieurs lignes par article — une par site) : aucune ré-agrégation nécessaire ici.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('stock_replica')` en amont.
 */
export class StockReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getStockFlows(articles?: string[]): Promise<Flow[]> {
    let query = this.conn.from('stock_replica').select('*')
    if (articles && articles.length > 0) {
      query = query.whereIn('article', [...new Set(articles.filter(Boolean))])
    }
    const rows = await query
    return (rows as ReplicaRow[]).flatMap(toFlows)
  }
}

const stockReplicaRepository = new StockReplicaRepository()
export default stockReplicaRepository
