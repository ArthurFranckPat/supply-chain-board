import { X3Database } from '#app/x3/client/x3_database'

export type OrderDateMode = 'demandee' | 'acceptee'

const DATE_FIELD: Record<OrderDateMode, string> = {
  demandee: 'X4HSHIDAT_0',
  acceptee: 'SHIDAT_0',
}

export interface RawOrderedQuantityRow {
  article: string
  date: string
  quantity: number
  nbOrders: number
}

type RawRow = Record<string, string | number | null>

const num = (v: string | number | null, fallback = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback
  const n = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

const str = (v: string | number | null): string => String(v ?? '').trim()

function sanitizeDate(d: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback
}

export class X3OrderedQuantitiesRepository {
  /**
   * Récupère les quantités commandées par article et par jour sur la période [from, to].
   * Source : SORDERQ joint à SORDER.
   * Filtrage temporel sur la date demandée (X4HSHIDAT_0) ou acceptée (SHIDAT_0).
   */
  async getOrderedQuantities(
    from: string,
    to: string,
    dateMode: OrderDateMode = 'demandee'
  ): Promise<RawOrderedQuantityRow[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const dateCol = DATE_FIELD[dateMode] || 'X4HSHIDAT_0'

    const sql = `
      SELECT
        Q.ITMREF_0                               AS ARTICLE,
        TO_CHAR(Q.${dateCol}, 'YYYY-MM-DD')      AS JOUR,
        TO_CHAR(SUM(Q.QTY_0))                    AS QTE,
        COUNT(DISTINCT Q.SOHNUM_0)               AS NB_ORDERS
      FROM SORDERQ Q
      INNER JOIN SORDER H ON H.SOHNUM_0 = Q.SOHNUM_0
      WHERE Q.${dateCol} >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND Q.${dateCol} <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND Q.ITMREF_0 IS NOT NULL
      GROUP BY Q.ITMREF_0, Q.${dateCol}
      ORDER BY Q.${dateCol} ASC
    `

    const db = new X3Database()
    try {
      const result = await db.raw(sql)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])

      return rows
        .map((r) => ({
          article: str(r.ARTICLE).toUpperCase(),
          date: str(r.JOUR),
          quantity: Math.round(num(r.QTE) * 100) / 100,
          nbOrders: num(r.NB_ORDERS),
        }))
        .filter((r) => r.article && r.quantity > 0)
    } finally {
      await db.destroy()
    }
  }
}
