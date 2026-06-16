import type { Flow } from '#app/domain/models/flow'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Suggestions du calcul des besoins nets (CBN / FUNCBN) — table CBNDET.
 *
 * Les suggestions de fabrication n'existent PAS dans MFGHEAD (qui ne contient que les OF
 * affermis/planifiés). Les commandes MTO/NOR sont couvertes par ces suggestions tant qu'elles
 * ne sont pas affermies : sans elles, ces commandes n'ont aucun OF à matcher.
 *
 * Filtre : WIPSTA_0 = 3 (suggestion) ET WIPTYP_0 = 5 (ligne article OF = fabrication).
 * → uniquement des suggestions fab, aucun chevauchement avec MFGHEAD (ferme/planifié).
 *
 * Pas de peg direct vers la commande (VCRNUM non fiable sur une suggestion) : ces flux supply
 * sont rattachés à la demande par l'algorithme de matching OF→commande (article + date),
 * comme tout OF. Statut « suggéré » (3) → priorité la plus basse dans le matcher (les OF
 * affermis/planifiés sont consommés d'abord). Faisabilité par BOM théorique (pas de MFGMAT).
 *
 * WIPNUM_0 = identifiant de la suggestion (ex. « SGAE… »).
 * Qté : REQQTY_0 (Besoin/Ressource). Si la quantité affichée s'avère fausse, l'alternative
 * documentée est RMNEXTQTY_0 (reste net) — à basculer après vérification terrain.
 */
const SQL = `
SELECT
  D.WIPNUM_0  AS NUM,
  D.ITMREF_0  AS ARTICLE,
  D.REQQTY_0  AS QTE,
  D.ENDDAT_0  AS ENDDAT,
  I.ITMDES1_0 AS DESIGNATION
FROM CBNDET D
JOIN ITMMASTER I ON I.ITMREF_0 = D.ITMREF_0
WHERE D.WIPSTA_0 = 3
  AND D.WIPTYP_0 = 5
  AND D.REQQTY_0 > 0
  AND I.ITMSTA_0 = 1
`

type RawRow = Record<string, string | null>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export class X3SuggestionRepository {
  /**
   * Suggestions de fabrication ouvertes (CBN), en flux supply OF (statut 3 = suggéré).
   * `from`/`to` optionnels : borne par date de fin (ENDDAT_0). CBNDET est volumineuse —
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
