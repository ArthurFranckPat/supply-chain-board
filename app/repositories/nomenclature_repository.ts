import type {
  NomenclatureEntry,
  ComponentType,
  ConsumptionNature,
} from '#app/domain/models/nomenclature'
import { X3Database } from '#app/x3/client/x3_database'

// LEFT JOIN BOM BC removed — self-join causes 2min+ timeout on X3 SOAP over full dataset
// Instead: fetch fabricated article set first (fast), then cross-reference in TS
const SQL_FABRICATED = `SELECT ITMREF_0 AS ART FROM BOM WHERE BOMALT_0 = 1`

const SQL_BOM = `
SELECT
  B.ITMREF_0    AS ART_PARENT,
  IP.ITMDES1_0  AS DES_PARENT,
  IP.TCLCOD_0   AS PARENT_FAM,
  D.BOMSEQ_0    AS NIVEAU,
  D.CPNITMREF_0 AS ART_COMPOSANT,
  IC.ITMDES1_0  AS DES_COMPOSANT,
  IC.TCLCOD_0   AS COMP_FAM,
  D.LIKQTY_0    AS QTE_LIEN,
  D.LIKQTYCOD_0 AS LIKQTYCOD
FROM BOM B
INNER JOIN ITMMASTER IP ON IP.ITMREF_0 = B.ITMREF_0 AND IP.ITMSTA_0 = 1
INNER JOIN BOMD D
  ON D.ITMREF_0 = B.ITMREF_0
  AND D.BOMALT_0 = B.BOMALT_0
  AND D.BOMSTRDAT_0 <= SYSDATE
  AND (D.BOMENDDAT_0 = TO_DATE('1599-12-31', 'YYYY-MM-DD') OR D.BOMENDDAT_0 >= SYSDATE)
INNER JOIN ITMMASTER IC ON IC.ITMREF_0 = D.CPNITMREF_0 AND IC.ITMSTA_0 = 1
WHERE B.BOMALT_0 = 1
  AND SUBSTR(IP.TCLCOD_0, 1, 1) <> 'Z'
`

type RawRow = Record<string, string | null>

export class X3NomenclatureRepository {
  async getNomenclatureEntries(): Promise<NomenclatureEntry[]> {
    const db = new X3Database()
    try {
      const fabricatedRows: RawRow[] = await db.raw(SQL_FABRICATED)
      const fabricated = new Set(fabricatedRows.map((r) => r.ART?.trim() ?? ''))

      const rows: RawRow[] = await db.raw(SQL_BOM)
      return rows
        .filter((row) => !row.COMP_FAM?.startsWith('Z'))
        .map((row) => {
          const componentArticle = row.ART_COMPOSANT?.trim() ?? ''
          const componentType: ComponentType = fabricated.has(componentArticle)
            ? 'FABRIQUE'
            : 'ACHETE'
          const likqtycod = row.LIKQTYCOD?.trim() ?? ''
          const consumptionNature: ConsumptionNature =
            likqtycod === '2' ? 'FORFAIT' : 'PROPORTIONNEL'
          return {
            parentArticle: row.ART_PARENT?.trim() ?? '',
            parentDescription: row.DES_PARENT?.trim() ?? '',
            level: Number.parseInt(row.NIVEAU ?? '0') || 0,
            componentArticle,
            componentDescription: row.DES_COMPOSANT?.trim() ?? '',
            linkQuantity: Number.parseFloat(row.QTE_LIEN ?? '0') || 0,
            componentType,
            consumptionNature,
          }
        })
    } finally {
      await db.destroy()
    }
  }
}
