import type { Flow } from '#app/domain/models/flow'
import type { X3Queryable } from '#app/x3/types'

export class X3OfRepository {
  constructor(private conn: X3Queryable) {}

  async getSupplyFlows(): Promise<Flow[]> {
    const sql = `SELECT MFGNUM_0, ITMREF_0, MFGDES_0, MFGSTA_0, EXTQTY_0, CPLQTY_0, RMNEXTQTY_0, STRDAT_0, ENDDAT_0
FROM MFGITM
WHERE RMNEXTQTY_0 > 0 AND MFGSTA_0 IN (1, 2, 3)`

    const result = await this.conn.query(sql)
    if (!result.success) return []

    return result.data
      .filter(row => parseFloat(row.RMNEXTQTY_0) > 0)
      .map(row => ({
        article: row.ITMREF_0.trim(),
        quantity: parseFloat(row.RMNEXTQTY_0),
        direction: 'supply' as const,
        date: row.ENDDAT_0 ? new Date(row.ENDDAT_0) : null,
        origin: {
          type: 'of' as const,
          id: row.MFGNUM_0.trim(),
          status: parseInt(row.MFGSTA_0) as 1 | 2 | 3,
        },
      }))
  }
}
