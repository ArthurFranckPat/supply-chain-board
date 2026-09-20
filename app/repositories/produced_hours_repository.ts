import { X3Database } from '#app/x3/client/x3_database'

export interface WorkstationProducedSummaryRow {
  poste: string
  operationHours: number
  setupHours: number
  totalHours: number
  allocatedOperationHours: number
  allocatedSetupHours: number
  totalAllocatedHours: number
  deltaHours: number
  efficiency: number
  quantity: number
  rejectQuantity: number
  nbOfs: number
  nbTrackings: number
}

export interface DailyProducedPoint {
  poste: string
  date: string
  operationHours: number
  setupHours: number
  totalHours: number
  allocatedHours: number
  quantity: number
}

export interface PosteTrackingDetail {
  trackingNum: string
  lineNum: number
  ofNum: string
  opeNum: number
  article: string
  date: string
  setupHours: number
  operationHours: number
  totalHours: number
  allocatedSetupHours: number
  allocatedOperationHours: number
  totalAllocatedHours: number
  deltaHours: number
  quantity: number
  rejectQuantity: number
  employee: string
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

export class X3ProducedHoursRepository {
  /**
   * Récupère le résumé agrégé des heures produites par poste de charge sur [from, to].
   * Source : table MFGOPETRK (suivis d'opérations d'OF).
   */
  async getSummary(from: string, to: string): Promise<WorkstationProducedSummaryRow[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')

    const sql = `
      SELECT
        CPLWST_0                                 AS POSTE,
        TO_CHAR(SUM(CPLOPETIM_0))                AS OPETIM,
        TO_CHAR(SUM(CPLSETTIM_0))                AS SETTIM,
        TO_CHAR(SUM(CPLALOPTIM_0))               AS ALOPTIM,
        TO_CHAR(SUM(CPLALSETIM_0))               AS ALSETIM,
        TO_CHAR(SUM(CPLQTY_0))                   AS QTY,
        TO_CHAR(SUM(REJCPLQTY_0))                AS REJQTY,
        COUNT(DISTINCT MFGNUM_0)                 AS NBOF,
        COUNT(MFGTRKNUM_0)                       AS NBTRK
      FROM MFGOPETRK
      WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND CPLWST_0 IS NOT NULL
      GROUP BY CPLWST_0
      ORDER BY CPLWST_0 ASC
    `

    const db = new X3Database()
    try {
      const result = await db.raw(sql)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])

      return rows
        .map((r) => {
          const opeH = num(r.OPETIM)
          const setH = num(r.SETTIM)
          const totH = Math.round((opeH + setH) * 100) / 100
          const alOpeH = num(r.ALOPTIM)
          const alSetH = num(r.ALSETIM)
          const totAlH = Math.round((alOpeH + alSetH) * 100) / 100
          const delta = Math.round((totH - totAlH) * 100) / 100
          const eff = totH > 0 ? Math.round((totAlH / totH) * 1000) / 10 : totAlH > 0 ? 100 : 100

          return {
            poste: str(r.POSTE),
            operationHours: Math.round(opeH * 100) / 100,
            setupHours: Math.round(setH * 100) / 100,
            totalHours: totH,
            allocatedOperationHours: Math.round(alOpeH * 100) / 100,
            allocatedSetupHours: Math.round(alSetH * 100) / 100,
            totalAllocatedHours: totAlH,
            deltaHours: delta,
            efficiency: eff,
            quantity: num(r.QTY),
            rejectQuantity: num(r.REJQTY),
            nbOfs: num(r.NBOF),
            nbTrackings: num(r.NBTRK),
          }
        })
        .filter((row) => row.poste && (row.totalHours > 0 || row.quantity > 0))
    } finally {
      await db.destroy()
    }
  }

  /**
   * Récupère la chronologie journalière des heures par poste pour sparklines et graphiques.
   */
  async getDailyTimeline(
    from: string,
    to: string,
    posteFilter?: string
  ): Promise<DailyProducedPoint[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const posteClause =
      posteFilter && /^[A-Za-z0-9_-]+$/.test(posteFilter)
        ? `AND CPLWST_0 = '${posteFilter.trim()}'`
        : ''

    const sql = `
      SELECT
        CPLWST_0                                            AS POSTE,
        TO_CHAR(IPTDAT_0, 'YYYY-MM-DD')                     AS JOUR,
        TO_CHAR(SUM(CPLOPETIM_0))                           AS OPETIM,
        TO_CHAR(SUM(CPLSETTIM_0))                           AS SETTIM,
        TO_CHAR(SUM(CPLALOPTIM_0 + CPLALSETIM_0))           AS ALLOUEES,
        TO_CHAR(SUM(CPLQTY_0))                              AS QTY
      FROM MFGOPETRK
      WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND CPLWST_0 IS NOT NULL
        ${posteClause}
      GROUP BY CPLWST_0, IPTDAT_0
      ORDER BY CPLWST_0 ASC, IPTDAT_0 ASC
    `

    const db = new X3Database()
    try {
      const result = await db.raw(sql)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])

      return rows.map((r) => {
        const opeH = num(r.OPETIM)
        const setH = num(r.SETTIM)
        const totH = Math.round((opeH + setH) * 100) / 100
        const alH = Math.round(num(r.ALLOUEES) * 100) / 100

        return {
          poste: str(r.POSTE),
          date: str(r.JOUR),
          operationHours: Math.round(opeH * 100) / 100,
          setupHours: Math.round(setH * 100) / 100,
          totalHours: totH,
          allocatedHours: alH,
          quantity: num(r.QTY),
        }
      })
    } finally {
      await db.destroy()
    }
  }

  /**
   * Récupère la liste détaillée des pointages pour UN poste de charge donné.
   */
  async getPosteTrackings(
    poste: string,
    from: string,
    to: string,
    limit = 500
  ): Promise<PosteTrackingDetail[]> {
    const cleanPoste = poste.trim()
    if (!/^[A-Za-z0-9_-]+$/.test(cleanPoste)) return []

    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const maxRows = Math.min(Math.max(1, limit), 2000)

    const sql = `
      SELECT
        MFGTRKNUM_0                         AS TRKNUM,
        OPETRKLIN_0                         AS LINNUM,
        MFGNUM_0                            AS MFGNUM,
        OPENUM_0                            AS OPENUM,
        ITMREF_0                            AS ITMREF,
        TO_CHAR(IPTDAT_0, 'YYYY-MM-DD')     AS IPTDAT,
        TO_CHAR(CPLSETTIM_0)                AS SETTIM,
        TO_CHAR(CPLOPETIM_0)                AS OPETIM,
        TO_CHAR(CPLALSETIM_0)               AS ALSETIM,
        TO_CHAR(CPLALOPTIM_0)               AS ALOPTIM,
        TO_CHAR(CPLQTY_0)                   AS QTY,
        TO_CHAR(REJCPLQTY_0)                AS REJQTY,
        EMPNUM_0                            AS EMPNUM
      FROM MFGOPETRK
      WHERE CPLWST_0 = '${cleanPoste}'
        AND IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND ROWNUM <= ${maxRows}
      ORDER BY IPTDAT_0 DESC, MFGTRKNUM_0 DESC, OPETRKLIN_0 ASC
    `

    const db = new X3Database()
    try {
      const result = await db.raw(sql)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])

      return rows.map((r) => {
        const setH = num(r.SETTIM)
        const opeH = num(r.OPETIM)
        const totH = Math.round((setH + opeH) * 100) / 100
        const alSetH = num(r.ALSETIM)
        const alOpeH = num(r.ALOPTIM)
        const totAlH = Math.round((alSetH + alOpeH) * 100) / 100

        return {
          trackingNum: str(r.TRKNUM),
          lineNum: num(r.LINNUM),
          ofNum: str(r.MFGNUM),
          opeNum: num(r.OPENUM),
          article: str(r.ITMREF),
          date: str(r.IPTDAT),
          setupHours: Math.round(setH * 100) / 100,
          operationHours: Math.round(opeH * 100) / 100,
          totalHours: totH,
          allocatedSetupHours: Math.round(alSetH * 100) / 100,
          allocatedOperationHours: Math.round(alOpeH * 100) / 100,
          totalAllocatedHours: totAlH,
          deltaHours: Math.round((totH - totAlH) * 100) / 100,
          quantity: num(r.QTY),
          rejectQuantity: num(r.REJQTY),
          employee: str(r.EMPNUM),
        }
      })
    } finally {
      await db.destroy()
    }
  }
}
