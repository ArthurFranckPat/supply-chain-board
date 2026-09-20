import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import type { MouvementStock } from '#app/domain/export_delay_causes'

/**
 * Journal de stock des articles en retard, seule trace qui survit à un retard
 * déjà résorbé (cf. `export_delay_causes.ts`).
 *
 * **Netté par document** (issue #88) : STOJOU est un journal d'écritures, pas
 * d'événements physiques. Reclassements d'emplacement, changements de statut et
 * contrepassations s'y écrivent en paires ±X dans le même document ; sommer les
 * quantités positives ferait voir des entrées de marchandise qui n'ont jamais
 * eu lieu. Le `HAVING SUM(...) <> 0` les efface et replie les contrepassations
 * sur leur quantité réelle.
 *
 * Toujours borné par articles ET par dates : une requête STOJOU non bornée
 * expire côté ZSOAPSQL et remonte un « resultXml is nil » qui ne dit pas qu'il
 * est un timeout.
 *
 * Pas d'`ORDER BY` : les ordinaux (`ORDER BY 1, 2`) font échouer ZSOAPSQL sur
 * la même erreur muette, alors que `GROUP BY` et `HAVING` passent sans
 * problème. Le tri se fait en TypeScript, où il ne coûte rien.
 */
const buildSql = (articles: string[], fromStr: string, toStr: string) => `
SELECT
  J.ITMREF_0                      AS ARTICLE,
  J.IPTDAT_0                      AS JOUR,
  J.VCRNUM_0                      AS DOCUMENT,
  J.TRSTYP_0                      AS TYPE_MVT,
  SUM(J.QTYSTU_0)                 AS QTE_NETTE
FROM STOJOU J
WHERE J.ITMREF_0 IN (${articles.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})
  AND J.IPTDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY J.ITMREF_0, J.IPTDAT_0, J.VCRNUM_0, J.TRSTYP_0
HAVING SUM(J.QTYSTU_0) <> 0
`

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export class ExportCausesRepository {
  /** Mouvements nettés des articles demandés sur la fenêtre. Liste vide si aucun article. */
  async getMouvements(articles: string[], from: Date, to: Date): Promise<MouvementStock[]> {
    const uniques = [...new Set(articles.map((a) => a.trim()).filter(Boolean))]
    if (uniques.length === 0) return []

    const db = new X3Database()
    let rows: Record<string, string | null>[] = []
    try {
      rows = await db.raw(buildSql(uniques, toYYYYMMDD(from), toYYYYMMDD(to)))
    } finally {
      await db.destroy()
    }

    let datesIllisibles = 0
    const mouvements = rows.flatMap((row) => {
      const jour = parseX3Date(row.JOUR)
      if (!jour) {
        datesIllisibles++
        return []
      }
      return [
        {
          article: row.ARTICLE?.trim() ?? '',
          jour,
          quantite: Number.parseFloat(row.QTE_NETTE ?? '0') || 0,
          type: Number.parseInt(row.TYPE_MVT ?? '0', 10) || 0,
        },
      ]
    })

    // Une date illisible ne doit JAMAIS se traduire par « aucun mouvement » :
    // la cause deviendrait « non documentée » alors que la trace existe. Le
    // format attendu est celui d'Oracle via X3 (dd-MMM-yy) — un TO_CHAR dans la
    // requête le casse en silence.
    if (datesIllisibles > 0 && mouvements.length === 0) {
      throw new Error(
        `STOJOU : ${datesIllisibles} mouvements lus mais aucune date exploitable — format de date inattendu, cause non reconstituable.`
      )
    }

    // Tri chronologique ici plutôt que dans le SQL : la reconstitution de cause
    // lit les mouvements dans l'ordre et doit être déterministe.
    return mouvements.sort((a, b) => a.jour.getTime() - b.jour.getTime())
  }
}
