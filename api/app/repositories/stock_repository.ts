/**
 * Repository Stock — materialise des Flows supply depuis les stocks X3.
 *
 * Genere deux flows par article: un strict (physique - alloue) et un QC (sous controle qualite).
 */

import type { Flow } from '#app/domain/models/flow'
import type { X3Queryable } from '#app/x3/types'

export class X3StockRepository {
  constructor(private conn: X3Queryable) {}

  async getStockFlows(): Promise<Flow[]> {
    const sql = `SELECT ARTICLE, STOCK_PHYSIQUE, STOCK_ALLOUE, STOCK_SOUS_CQ FROM ZSTOCK`

    const result = await this.conn.query(sql)
    if (!result.success) return []

    const flows: Flow[] = []
    for (const row of result.data) {
      const physique = parseFloat(row.STOCK_PHYSIQUE) || 0
      const alloue = parseFloat(row.STOCK_ALLOUE) || 0
      const cq = parseFloat(row.STOCK_SOUS_CQ) || 0
      const article = row.ARTICLE.trim()

      const strict = physique - alloue
      if (strict > 0) {
        flows.push({
          article, quantity: strict, direction: 'supply', date: null,
          origin: { type: 'stock', subType: 'strict' },
        })
      }
      if (cq > 0) {
        flows.push({
          article, quantity: cq, direction: 'supply', date: null,
          origin: { type: 'stock', subType: 'qc' },
        })
      }
    }
    return flows
  }
}
