import type { Flow } from '#app/domain/models/flow'
import LocalMenu from '#models/local_menu'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Ordre de fabrication (ferme / planifié / suggéré), lu dans la vue planning
 * temps réel ORDERS (issue #32). Source unique : remplace MFGITM/MFGHEAD pour
 * les fermes/planifiés ET CBNDET pour les suggestions. ORDERS est mis à jour
 * immédiatement par FUNMAUTR/FUNGBENCH → une suggestion affermie y disparaît,
 * pas de drift ni de blacklist.
 */
export interface ManufacturingOrder {
  numOf: string
  article: string
  designation: string | null
  status: 1 | 2 | 3
  statutLabel: string | null
  typeOfLabel: string | null
  quantity: number // reste à produire (RMNEXTQTY)
  quantityLaunched: number // qté lancée (EXTQTY)
  quantityDone: number // qté réalisée (CPLQTY)
  unit: string | null
  startDate: Date | null
  endDate: Date | null
}

type RawRow = Record<string, string | null>

/** WIPTYP=5 = fabrication. WIPSTA 1/2/3 = Ferme/Planifié/Suggéré. */
const SQL = `
SELECT
  O.VCRNUM_0   AS NUM,
  O.ITMREF_0   AS ARTICLE,
  O.WIPSTA_0   AS STA,
  O.EXTQTY_0   AS LAUNCHED,
  O.CPLQTY_0   AS DONE,
  O.RMNEXTQTY_0 AS REMAIN,
  O.STRDAT_0   AS STRDAT,
  O.ENDDAT_0   AS ENDDAT,
  O.CREDAT_0   AS CREDAT,
  I.ITMDES1_0  AS DESIGNATION,
  I.STU_0      AS UNIT
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 5
  AND O.WIPSTA_0 IN (1, 2, 3)
  AND O.RMNEXTQTY_0 > 0
  AND I.ITMSTA_0 = 1
`

function toNum(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0
}

export class X3OfRepository {
  /** Lit les ordres de fabrication depuis ORDERS (vue planning temps réel, #32). */
  private async fetch(): Promise<{ rows: RawRow[]; label: (chapter: number, value: number | null) => string | null }> {
    const [rows, menuRows] = await Promise.all([
      new X3Database().raw(SQL) as unknown as RawRow[],
      LocalMenu.query().whereIn('chapter', [317]),
    ])
    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null
    return { rows, label }
  }

  async getSupplyFlows(): Promise<Flow[]> {
    const { rows, label } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.STA ?? '0') as 1 | 2 | 3
      return {
        article: row.ARTICLE?.trim() ?? '',
        quantity: toNum(row.REMAIN),
        direction: 'supply' as const,
        date: parseX3Date(row.ENDDAT),
        origin: {
          type: 'of' as const,
          id: row.NUM?.trim() ?? '',
          status,
          statutLabel: label(317, status),
          typeOf: null,
          typeOfLabel: null,
          designation: row.DESIGNATION?.trim() ?? null,
        },
      }
    })
  }

  /**
   * Date d'affermissement (= création de l'OF ferme) par numéro d'OF, lue dans
   * ORDERS.CREDAT_0 (vue planning, #32). Quand une suggestion est affermie, elle
   * devient une ligne ORDERS WIPSTA=1 avec sa CREDAT → cette date matérialise le
   * lancement réel. Les numéros absents (pas dans ORDERS) ne figurent pas dans la map.
   */
  async getFirmDates(numOfs: string[]): Promise<Map<string, Date>> {
    const unique = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]
    const out = new Map<string, Date>()
    if (unique.length === 0) return out

    const db = new X3Database()
    try {
      // Alphanumérique VCRNUM : whitelist avant interpolation (pas de quote → pas d'injection).
      const safe = unique.filter((n) => /^[A-Za-z0-9_-]+$/.test(n))
      if (safe.length === 0) return out
      const inList = safe.map((n) => `'${n}'`).join(',')
      const rows = (await db.raw(
        `SELECT VCRNUM_0 AS NUM, CREDAT_0 AS CREDAT FROM ORDERS WHERE WIPTYP_0 = 5 AND VCRNUM_0 IN (${inList})`,
      )) as unknown as RawRow[]
      for (const row of rows) {
        const numOf = row.NUM?.trim() ?? ''
        const date = parseX3Date(row.CREDAT)
        if (numOf && date) out.set(numOf, date)
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  async getManufacturingOrders(): Promise<ManufacturingOrder[]> {
    const { rows, label } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.STA ?? '0') as 1 | 2 | 3
      return {
        numOf: row.NUM?.trim() ?? '',
        article: row.ARTICLE?.trim() ?? '',
        designation: row.DESIGNATION?.trim() ?? null,
        status,
        statutLabel: label(317, status),
        typeOfLabel: null,
        quantity: toNum(row.REMAIN),
        quantityLaunched: toNum(row.LAUNCHED),
        quantityDone: toNum(row.DONE),
        unit: row.UNIT?.trim() ?? null,
        startDate: parseX3Date(row.STRDAT),
        endDate: parseX3Date(row.ENDDAT),
      }
    })
  }
}
