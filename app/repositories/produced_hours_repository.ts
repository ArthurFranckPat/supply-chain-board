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
  morningHours: number
  afternoonHours: number
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
  time?: string
  shift?: 'matin' | 'aprem'
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

/**
 * Clause SQL restreignant `col` à une liste d'articles — '' si pas de filtre.
 * Oracle plafonne une liste IN à 1 000 éléments : on découpe en OR. Liste vide
 * (filtre posé mais aucun article résolu) → clause toujours fausse.
 */
function articleClause(col: string, articles?: string[]): string {
  if (!articles) return ''
  if (articles.length === 0) return 'AND 1 = 0'
  const quoted = articles.map((a) => `'${a.replace(/'/g, "''")}'`)
  const chunks: string[] = []
  for (let i = 0; i < quoted.length; i += 1000) {
    chunks.push(`${col} IN (${quoted.slice(i, i + 1000).join(', ')})`)
  }
  return `AND (${chunks.join(' OR ')})`
}

export class X3ProducedHoursRepository {
  /**
   * Récupère le résumé agrégé des heures produites par poste de charge sur [from, to].
   * Source : table MFGOPETRK (suivis d'opérations d'OF).
   */
  async getSummary(
    from: string,
    to: string,
    articles?: string[]
  ): Promise<WorkstationProducedSummaryRow[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const itmClause = articleClause('ITMREF_0', articles)

    const hoursSql = `
      SELECT
        CPLWST_0                                 AS POSTE,
        TO_CHAR(SUM(CPLOPETIM_0))                AS OPETIM,
        TO_CHAR(SUM(CPLSETTIM_0))                AS SETTIM,
        TO_CHAR(SUM(CPLALOPTIM_0))               AS ALOPTIM,
        TO_CHAR(SUM(CPLALSETIM_0))               AS ALSETIM,
        COUNT(DISTINCT MFGNUM_0)                 AS NBOF,
        COUNT(MFGTRKNUM_0)                       AS NBTRK
      FROM MFGOPETRK
      WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND CPLWST_0 IS NOT NULL
        ${itmClause}
      GROUP BY CPLWST_0
      ORDER BY CPLWST_0 ASC
    `

    const qtySql = `
      SELECT
        w.CPLWST_0                               AS POSTE,
        TO_CHAR(SUM(i.CPLQTY_0))                 AS QTY,
        TO_CHAR(SUM(i.REJCPLQTY_0))              AS REJQTY
      FROM (
        SELECT DISTINCT CPLWST_0, MFGNUM_0
        FROM MFGOPETRK
        WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
          AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
          AND CPLWST_0 IS NOT NULL
          ${itmClause}
      ) w
      JOIN MFGITM i ON i.MFGNUM_0 = w.MFGNUM_0
      GROUP BY w.CPLWST_0
    `

    const db = new X3Database()
    try {
      const [hoursResult, qtyResult] = await Promise.all([db.raw(hoursSql), db.raw(qtySql)])
      const hoursRows: RawRow[] = Array.isArray(hoursResult)
        ? hoursResult
        : ((hoursResult as any)?.rows ?? [])
      const qtyRows: RawRow[] = Array.isArray(qtyResult)
        ? qtyResult
        : ((qtyResult as any)?.rows ?? [])

      const qtyMap = new Map<string, { qty: number; rejQty: number }>()
      for (const q of qtyRows) {
        qtyMap.set(str(q.POSTE), { qty: num(q.QTY), rejQty: num(q.REJQTY) })
      }

      return hoursRows
        .map((r) => {
          const posteKey = str(r.POSTE)
          const opeH = num(r.OPETIM)
          const setH = num(r.SETTIM)
          const totH = Math.round((opeH + setH) * 100) / 100
          const alOpeH = num(r.ALOPTIM)
          const alSetH = num(r.ALSETIM)
          const totAlH = Math.round((alOpeH + alSetH) * 100) / 100
          const delta = Math.round((totH - totAlH) * 100) / 100
          const eff = totH > 0 ? Math.round((totAlH / totH) * 1000) / 10 : totAlH > 0 ? 100 : 100

          const pieces = qtyMap.get(posteKey)

          return {
            poste: posteKey,
            operationHours: Math.round(opeH * 100) / 100,
            setupHours: Math.round(setH * 100) / 100,
            totalHours: totH,
            allocatedOperationHours: Math.round(alOpeH * 100) / 100,
            allocatedSetupHours: Math.round(alSetH * 100) / 100,
            totalAllocatedHours: totAlH,
            deltaHours: delta,
            efficiency: eff,
            quantity: pieces?.qty ?? 0,
            rejectQuantity: pieces?.rejQty ?? 0,
            nbOfs: num(r.NBOF),
            nbTrackings: num(r.NBTRK),
          }
        })
        .filter((row) => row.poste && (row.totalHours > 0 || row.quantity > 0))
    } finally {
      await db.destroy()
    }
  }

  /** Articles distincts pointés sur [from, to] — borne le filtre article avant la clause IN. */
  async getPointedArticles(from: string, to: string): Promise<string[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const sql = `
      SELECT DISTINCT ITMREF_0 AS ITMREF
      FROM MFGOPETRK
      WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND CPLWST_0 IS NOT NULL
    `
    const db = new X3Database()
    try {
      const result = await db.raw(sql)
      const rows: RawRow[] = Array.isArray(result) ? result : ((result as any)?.rows ?? [])
      return rows.map((r) => str(r.ITMREF)).filter(Boolean)
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
    posteFilter?: string,
    articles?: string[]
  ): Promise<DailyProducedPoint[]> {
    const safeFrom = sanitizeDate(from, '1970-01-01')
    const safeTo = sanitizeDate(to, '2099-12-31')
    const posteClause =
      (posteFilter && /^[A-Za-z0-9_-]+$/.test(posteFilter)
        ? `AND CPLWST_0 = '${posteFilter.trim()}'`
        : '') +
      ' ' +
      articleClause('ITMREF_0', articles)

    const hoursSql = `
      SELECT
        CPLWST_0                                            AS POSTE,
        TO_CHAR(IPTDAT_0, 'YYYY-MM-DD')                     AS JOUR,
        TO_CHAR(SUM(CPLOPETIM_0))                           AS OPETIM,
        TO_CHAR(SUM(CPLSETTIM_0))                           AS SETTIM,
        TO_CHAR(SUM(CASE 
          WHEN NVL(TO_NUMBER(REGEXP_SUBSTR(COALESCE(NULLIF(TRIM(CPLSTRHOU_0), ''), TO_CHAR(CREDATTIM_0, 'HH24MI')), '^[0-9]{1,4}')), 800) < 1300 
          THEN CPLOPETIM_0 + CPLSETTIM_0 
          ELSE 0 
        END))                                               AS MATIN_H,
        TO_CHAR(SUM(CASE 
          WHEN NVL(TO_NUMBER(REGEXP_SUBSTR(COALESCE(NULLIF(TRIM(CPLSTRHOU_0), ''), TO_CHAR(CREDATTIM_0, 'HH24MI')), '^[0-9]{1,4}')), 800) >= 1300 
          THEN CPLOPETIM_0 + CPLSETTIM_0 
          ELSE 0 
        END))                                               AS APREM_H,
        TO_CHAR(SUM(CPLALOPTIM_0 + CPLALSETIM_0))           AS ALLOUEES
      FROM MFGOPETRK
      WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
        AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
        AND CPLWST_0 IS NOT NULL
        ${posteClause}
      GROUP BY CPLWST_0, IPTDAT_0
      ORDER BY CPLWST_0 ASC, IPTDAT_0 ASC
    `

    const qtySql = `
      SELECT 
        w.CPLWST_0                                          AS POSTE,
        TO_CHAR(w.LAST_DAY, 'YYYY-MM-DD')                   AS JOUR,
        TO_CHAR(SUM(i.CPLQTY_0))                            AS QTY
      FROM (
        SELECT CPLWST_0, MFGNUM_0, MAX(IPTDAT_0) AS LAST_DAY
        FROM MFGOPETRK
        WHERE IPTDAT_0 >= TO_DATE('${safeFrom}', 'YYYY-MM-DD')
          AND IPTDAT_0 <= TO_DATE('${safeTo}', 'YYYY-MM-DD')
          AND CPLWST_0 IS NOT NULL
          ${posteClause}
        GROUP BY CPLWST_0, MFGNUM_0
      ) w
      JOIN MFGITM i ON i.MFGNUM_0 = w.MFGNUM_0
      GROUP BY w.CPLWST_0, w.LAST_DAY
    `

    const db = new X3Database()
    try {
      const [hoursResult, qtyResult] = await Promise.all([db.raw(hoursSql), db.raw(qtySql)])
      const hoursRows: RawRow[] = Array.isArray(hoursResult)
        ? hoursResult
        : ((hoursResult as any)?.rows ?? [])
      const qtyRows: RawRow[] = Array.isArray(qtyResult)
        ? qtyResult
        : ((qtyResult as any)?.rows ?? [])

      const qtyMap = new Map<string, number>()
      for (const q of qtyRows) {
        qtyMap.set(`${str(q.POSTE)}_${str(q.JOUR)}`, num(q.QTY))
      }

      return hoursRows.map((r) => {
        const opeH = num(r.OPETIM)
        const setH = num(r.SETTIM)
        const totH = Math.round((opeH + setH) * 100) / 100
        const matinH = Math.round(num(r.MATIN_H) * 100) / 100
        const apremH = Math.round(num(r.APREM_H) * 100) / 100
        const alH = Math.round(num(r.ALLOUEES) * 100) / 100

        const pKey = str(r.POSTE)
        const jKey = str(r.JOUR)
        const q = qtyMap.get(`${pKey}_${jKey}`) ?? 0

        return {
          poste: pKey,
          date: jKey,
          operationHours: Math.round(opeH * 100) / 100,
          setupHours: Math.round(setH * 100) / 100,
          totalHours: totH,
          morningHours: matinH,
          afternoonHours: apremH,
          allocatedHours: alH,
          quantity: q,
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
    limit = 500,
    articles?: string[]
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
        COALESCE(NULLIF(TRIM(CPLSTRHOU_0), ''), TO_CHAR(CREDATTIM_0, 'HH24MI')) AS STRHOU,
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
        ${articleClause('ITMREF_0', articles)}
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

        const rawHou = str(r.STRHOU).replace(/\D/g, '')
        let time = ''
        let shift: 'matin' | 'aprem' = 'matin'
        if (rawHou && rawHou.length >= 3) {
          const padded = rawHou.padStart(4, '0')
          time = `${padded.slice(0, 2)}:${padded.slice(2, 4)}`
          const hNum = Number.parseInt(padded, 10)
          shift = hNum < 1300 ? 'matin' : 'aprem'
        }

        return {
          trackingNum: str(r.TRKNUM),
          lineNum: num(r.LINNUM),
          ofNum: str(r.MFGNUM),
          opeNum: num(r.OPENUM),
          article: str(r.ITMREF),
          date: str(r.IPTDAT),
          time: time || undefined,
          shift,
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
