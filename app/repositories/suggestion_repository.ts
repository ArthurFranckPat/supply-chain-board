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

export interface SuggestionKeys {
  sugNum: string
  stofcy: string
  itmref: string
  qte: number
  /** Clé composite de l'objet X3 CBD (delete) : 6 champs. */
  buc: number
  /** Date besoin au format X3 attendu en clé objet (YYYYMMDD). */
  reqdat: string
  wiptyp: number
  /** Dates de la suggestion → dates de l'OF créé (YYYYMMDD). */
  strdat: string
  enddat: string
}

export class X3SuggestionRepository {
  /**
   * Résout les clés d'une suggestion (site + article + qté) depuis son numéro —
   * le board ne porte que l'id (WIPNUM = SUGNUM) et l'article. Nécessaire avant
   * l'affermissement (FIRMSUGG, issue #31) qui exige le site. Renvoie `null` si
   * la suggestion n'existe pas / n'est plus affermissable (WIPSTA<>3).
   */
  async getSuggestionKeys(sugNum: string): Promise<SuggestionKeys | null> {
    const num = sugNum.trim()
    // SUGNUM/WIPNUM X3 = alphanumérique « SGAE… » : refuser tout caractère hors
    // [A-Z0-9_] avant l'interpolation SQL (pas de quote → pas d'injection).
    if (!num || !/^[A-Za-z0-9_]+$/.test(num)) return null

    const sql = `
SELECT D.STOFCY_0 AS STOFCY, D.ITMREF_0 AS ARTICLE, D.REQQTY_0 AS QTE,
       D.BUC_0 AS BUC, TO_CHAR(D.REQDAT_0, 'YYYYMMDD') AS REQDAT, D.WIPTYP_0 AS WIPTYP,
       TO_CHAR(D.STRDAT_0, 'YYYYMMDD') AS STRDAT, TO_CHAR(D.ENDDAT_0, 'YYYYMMDD') AS ENDDAT
FROM CBNDET D
WHERE D.WIPNUM_0 = '${num}'
  AND D.WIPSTA_0 = 3
  AND D.WIPTYP_0 = 5
`
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const row = rows[0]
      if (!row) return null
      const stofcy = row.STOFCY?.trim() ?? ''
      const itmref = row.ARTICLE?.trim() ?? ''
      const qte = parseFloat(row.QTE ?? '0') || 0
      const buc = parseInt(row.BUC ?? '0', 10) || 0
      const reqdat = row.REQDAT?.trim() ?? ''
      const wiptyp = parseInt(row.WIPTYP ?? '0', 10) || 0
      const strdat = row.STRDAT?.trim() || reqdat
      const enddat = row.ENDDAT?.trim() || reqdat
      if (!stofcy || !itmref) return null
      return { sugNum: num, stofcy, itmref, qte, buc, reqdat, wiptyp, strdat, enddat }
    } finally {
      await db.destroy()
    }
  }

  /**
   * Résout le site d'un OF planifié (MFGHEAD, MFGSTA=2) depuis son numéro — pour
   * l'affermissement planifié→ferme (issue #31). Le sous-programme X3 auto-détecte
   * le statut source ; le board a juste besoin du site. Renvoie `null` si l'OF
   * n'existe pas ou n'est pas planifié.
   */
  async getPlannedOfKeys(mfgNum: string): Promise<SuggestionKeys | null> {
    const num = mfgNum.trim()
    if (!num || !/^[A-Za-z0-9_-]+$/.test(num)) return null

    const sql = `
SELECT M.MFGFCY_0 AS STOFCY, M.ITMREF_0 AS ARTICLE,
       M.MFGEXTQTY_0 AS QTE,
       TO_CHAR(M.STRDAT_0, 'YYYYMMDD') AS STRDAT, TO_CHAR(M.ENDDAT_0, 'YYYYMMDD') AS ENDDAT
FROM MFGHEAD M
WHERE M.MFGNUM_0 = '${num}'
  AND M.MFGSTA_0 = 2
`
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const row = rows[0]
      if (!row) return null
      const stofcy = row.STOFCY?.trim() ?? ''
      const itmref = row.ARTICLE?.trim() ?? ''
      if (!stofcy || !itmref) return null
      const qte = parseFloat(row.QTE ?? '0') || 0
      const strdat = row.STRDAT?.trim() ?? ''
      const enddat = row.ENDDAT?.trim() ?? ''
      // Champs CBNDET non pertinents pour un OF planifié (zéro).
      return { sugNum: num, stofcy, itmref, qte, buc: 0, reqdat: '', wiptyp: 5, strdat, enddat }
    } finally {
      await db.destroy()
    }
  }

  /**
   * Résout les clés d'affermissement d'un ordre, suggestion (CBNDET) OU OF planifié
   * (MFGHEAD) — le sous-programme X3 auto-détecte le statut source. Essaye CBNDET
   * puis MFGHEAD. Renvoie `null` si l'ordre n'est ni suggéré ni planifié.
   */
  async getFirmingKeys(orderNum: string): Promise<SuggestionKeys | null> {
    return (await this.getSuggestionKeys(orderNum)) ?? (await this.getPlannedOfKeys(orderNum))
  }

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
