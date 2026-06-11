/**
 * Repository OF — materialise des Flows supply depuis les Ordres de Fabrication X3.
 */

import type { Flow } from '#app/domain/models/flow'
import type { X3Queryable } from './x3_connection.js'

// Re-export for backward compat
export type { X3Queryable } from './x3_connection.js'

export class X3OfRepository {
  constructor(private conn: X3Queryable) {}

  async getSupplyFlows(): Promise<Flow[]> {
    const sql = `SELECT NUM_OF, ARTICLE, DESCRIPTION, STATUT, QTE_RESTANTE, DATE_FIN, DATE_DEBUT, METHODE_OBTENTION_LIVRAISON
FROM ZPREVCHARGEPF
WHERE QTE_RESTANTE > 0 AND STATUT IN (1, 2, 3)`

    const result = await this.conn.query(sql)
    if (!result.success) return []

    return result.data
      .filter(row => parseInt(row.QTE_RESTANTE) > 0)
      .map(row => ({
        article: row.ARTICLE.trim(),
        quantity: parseInt(row.QTE_RESTANTE),
        direction: 'supply' as const,
        date: row.DATE_FIN ? new Date(row.DATE_FIN) : null,
        origin: {
          type: 'of' as const,
          id: row.NUM_OF.trim(),
          status: parseInt(row.STATUT) as 1 | 2 | 3,
        },
      }))
  }
}
