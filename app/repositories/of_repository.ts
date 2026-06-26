import type { Flow } from '#app/domain/models/flow'
import LocalMenu from '#models/local_menu'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import staticSync from '#services/static_sync_service'

/**
 * Ordre de fabrication (ferme / planifié / suggéré), lu dans la vue planning
 * temps réel ORDERS (issue #32). Source unique : remplace MFGITM/MFGHEAD pour
 * les fermes/planifiés ET CBNDET pour les suggestions. ORDERS est mis à jour
 * immédiatement par FUNMAUTR/FUNGBENCH → une suggestion affermie y disparaît,
 * pas de drift ni de blacklist.
 *
 * Pas de JOIN ITMMASTER côté X3 (SOAP-06 : timeout sur jointure massive). La
 * désignation est résolue depuis le référentiel local synchronisé (SQLite via
 * staticSync), comme le font déjà les autres lecteurs X3.
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

// Lookback pour les OF (via env RETARD_LOOKBACK_DAYS, même variable que la vue retards).
// Élimine les OF très en retard (anomalies ERP) → réduit drastiquement les lignes ZSOAPSQL O(n²).
const OF_LOOKBACK_DAYS = parseInt(process.env.RETARD_LOOKBACK_DAYS ?? '90', 10)

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** WIPTYP=5 = fabrication. WIPSTA 1/2/3 = Ferme/Planifié/Suggéré. ORDERS seule. */
const buildSql = (fromStr: string) => `
SELECT
  VCRNUM_0    AS NUM,
  ITMREF_0    AS ARTICLE,
  WIPSTA_0    AS STA,
  EXTQTY_0    AS LAUNCHED,
  CPLQTY_0    AS DONE,
  RMNEXTQTY_0 AS REMAIN,
  STRDAT_0    AS STRDAT,
  ENDDAT_0    AS ENDDAT
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND WIPSTA_0 IN (1, 2, 3)
  AND RMNEXTQTY_0 > 0
  AND ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
`

function toNum(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0
}

export class X3OfRepository {
  /** Lit les ordres depuis ORDERS + enrichit la désignation depuis le référentiel local. */
  private async fetch(): Promise<{ rows: RawRow[]; label: (chapter: number, value: number | null) => string | null; designations: Map<string, string> }> {
    const from = new Date()
    from.setDate(from.getDate() - OF_LOOKBACK_DAYS)
    const [rows, menuRows, articles] = await Promise.all([
      new X3Database().raw(buildSql(toYYYYMMDD(from))) as unknown as RawRow[],
      LocalMenu.query().whereIn('chapter', [317]),
      staticSync.readArticles().catch(() => []),
    ])
    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null
    const designations = new Map<string, string>()
    for (const a of articles) if (a.code) designations.set(a.code, a.description)
    return { rows, label, designations }
  }

  async getSupplyFlows(): Promise<Flow[]> {
    const { rows, label, designations } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.STA ?? '0') as 1 | 2 | 3
      const article = row.ARTICLE?.trim() ?? ''
      return {
        article,
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
          designation: designations.get(article) ?? null,
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
    const { rows, label, designations } = await this.fetch()

    return rows.map((row) => {
      const status = parseInt(row.STA ?? '0') as 1 | 2 | 3
      const article = row.ARTICLE?.trim() ?? ''
      return {
        numOf: row.NUM?.trim() ?? '',
        article,
        designation: designations.get(article) ?? null,
        status,
        statutLabel: label(317, status),
        typeOfLabel: null,
        quantity: toNum(row.REMAIN),
        quantityLaunched: toNum(row.LAUNCHED),
        quantityDone: toNum(row.DONE),
        unit: null,
        startDate: parseX3Date(row.STRDAT),
        endDate: parseX3Date(row.ENDDAT),
      }
    })
  }
}
