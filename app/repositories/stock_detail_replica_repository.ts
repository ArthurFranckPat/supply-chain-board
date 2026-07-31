import db from '@adonisjs/lucid/services/db'
import type { PaletteObservation } from '#app/domain/conditionnement_estimator'
import { typeLoc } from '#repositories/conditionnement_repository'

type ReplicaRow = {
  uuid: string
  article: string
  loc: string
  qte: number
}

/**
 * Lecture read-only de `stock_detail_replica` (#98, suite lot 3).
 *
 * Miroir de `ConditionnementRepository.getStockSrmParArticle()` — même filtre LOC_0
 * (SM* / S*P / CLP) et seuil qté>1, appliqués à l'INGESTION par
 * `ReplicaSyncService.syncStockDetail()`. La classification stockage/conso
 * (`typeLoc`) est réutilisée telle quelle : c'est la règle qui fait porter le
 * consensus de dominance sur les seuls `SM*`, jamais sur les emplacements de
 * consommation à quantité variable.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('stock_detail_replica')` en amont.
 */
export class StockDetailReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getObservations(): Promise<Map<string, PaletteObservation[]>> {
    const rows = await this.getRows()
    const byArticle = new Map<string, PaletteObservation[]>()
    for (const row of rows) {
      const type = typeLoc(row.loc)
      if (!type) continue
      const arr = byArticle.get(row.article) ?? []
      arr.push({ us: row.qte, source: 'STOCK', typeEmplacement: type })
      byArticle.set(row.article, arr)
    }
    return byArticle
  }

  /** Lignes brutes — sert `replica:sync --compare` (diff par agrégat article#loc). */
  async getRows(): Promise<ReplicaRow[]> {
    return this.conn.from('stock_detail_replica').select('*')
  }
}

const stockDetailReplicaRepository = new StockDetailReplicaRepository()
export default stockDetailReplicaRepository
