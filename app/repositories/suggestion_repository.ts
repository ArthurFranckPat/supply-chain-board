import type { Flow } from '#app/domain/models/flow'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Suggestions de fabrication — table ORDERS (fichier [ORD] en 4GL X3).
 *
 * ORDERS est la vue temps réel des ordres planifiés : mise à jour immédiatement par FUNMAUTR
 * (affermissement), FUNGBENCH et toute action X3 standard — sans attendre un recalcul CBN.
 * On lit la table snapshot CBNDET auparavant : quand FUNMAUTR affermissait une suggestion,
 * CBNDET.WIPSTA_0 restait à 3 jusqu'au prochain CBN, la suggestion fantôme persistait dans le
 * board en double de l'OF ferme. ORDERS fait basculer WIPSTA_0 3→1 à l'affermissement → la
 * suggestion disparaît d'office de cette query (le ferme étant servi par X3OfRepository/MFGHEAD).
 *
 * Les suggestions de fabrication n'existent PAS dans MFGHEAD (qui ne contient que les OF
 * affermis/planifiés). Les commandes MTO/NOR sont couvertes par ces suggestions tant qu'elles
 * ne sont pas affermies : sans elles, ces commandes n'ont aucun OF à matcher.
 *
 * Filtre : WIPSTA_0 = 3 (suggéré) ET WIPTYP_0 = 5 (OF = fabrication). On ne prend QUE le statut 3 :
 * les fermes (1) et planifiés (2) sont déjà servis par X3OfRepository (MFGHEAD/MFGITM) — élargir à
 * WIPSTA_0 IN (2,3) doublonnerait les planifiés.
 *
 * Pas de peg direct vers la commande (VCRNUM non fiable sur une suggestion) : ces flux supply
 * sont rattachés à la demande par l'algorithme de matching OF→commande (article + date),
 * comme tout OF. Statut « suggéré » (3) → priorité la plus basse dans le matcher (les OF
 * affermis/planifiés sont consommés d'abord). Faisabilité par BOM théorique (pas de MFGMAT).
 *
 * WIPNUM_0 = identifiant de la suggestion (ex. « SGAE… »).
 * Qté : RMNEXTQTY_0 (reste à produire) — cohérent avec X3OfRepository, et juste si une suggestion
 * est partiellement réalisée. Pour une suggestion non lancée, RMNEXTQTY_0 = EXTQTY_0 (CPLQTY_0 = 0).
 */
const SQL = `
SELECT
  D.WIPNUM_0    AS NUM,
  D.ITMREF_0    AS ARTICLE,
  D.RMNEXTQTY_0 AS QTE,
  D.ENDDAT_0    AS ENDDAT,
  I.ITMDES1_0   AS DESIGNATION
FROM ORDERS D
JOIN ITMMASTER I ON I.ITMREF_0 = D.ITMREF_0
WHERE D.WIPSTA_0 = 3
  AND D.WIPTYP_0 = 5
  AND D.RMNEXTQTY_0 > 0
  AND I.ITMSTA_0 = 1
`

type RawRow = Record<string, string | null>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export class X3SuggestionRepository {
  /**
   * Suggestions de fabrication ouvertes (ORDERS, temps réel), en flux supply OF (statut 3 = suggéré).
   * `from`/`to` optionnels : borne par date de fin (ENDDAT_0). ORDERS est volumineuse —
   * toujours scoper en pratique.
   */
  async getSuggestionFlows(opts?: { from?: string; to?: string }): Promise<Flow[]> {
    let sql = SQL
    if (opts?.from && opts?.to && ISO.test(opts.from) && ISO.test(opts.to)) {
      sql +=
        `\n  AND D.ENDDAT_0 BETWEEN TO_DATE('${opts.from}', 'YYYY-MM-DD')` +
        ` AND TO_DATE('${opts.to}', 'YYYY-MM-DD')`
    }

    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const out: Flow[] = []
      for (const row of rows) {
        const article = row.ARTICLE?.trim() ?? ''
        const id = row.NUM?.trim() ?? ''
        const quantity = parseFloat(row.QTE ?? '0') || 0
        if (!article || !id || quantity <= 0) continue
        out.push({
          article,
          quantity,
          direction: 'supply' as const,
          date: parseX3Date(row.ENDDAT),
          origin: {
            type: 'of' as const,
            id,
            status: 3,
            statutLabel: 'Suggéré',
            typeOf: null,
            typeOfLabel: null,
            designation: row.DESIGNATION?.trim() || null,
          },
        })
      }
      return out
    } finally {
      await db.destroy()
    }
  }
}
