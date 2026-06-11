/**
 * Repository Reception — materialise des Flows supply depuis les receptions prevues X3.
 */

import type { Flow } from '#app/domain/models/flow'
import type { X3Queryable } from './x3_connection.js'

export class X3ReceptionRepository {
  constructor(private conn: X3Queryable) {}

  async getReceptionFlows(): Promise<Flow[]> {
    const sql = `SELECT ARTICLE, QTE_RESTANTE, DATE_RECEPTION_PREVUE, NUM_COMMANDE, CODE_FOURNISSEUR
FROM ZRECEPTION
WHERE QTE_RESTANTE > 0`

    const result = await this.conn.query(sql)
    if (!result.success) return []

    return result.data
      .filter(row => parseFloat(row.QTE_RESTANTE) > 0)
      .map(row => ({
        article: row.ARTICLE.trim(),
        quantity: parseFloat(row.QTE_RESTANTE),
        direction: 'supply' as const,
        date: new Date(row.DATE_RECEPTION_PREVUE),
        origin: {
          type: 'reception' as const,
          id: row.NUM_COMMANDE?.trim() ?? '',
          supplier: row.CODE_FOURNISSEUR?.trim() ?? '',
        },
      }))
  }
}
