import { X3Database } from '#app/x3/client/x3_database'

/**
 * Résolution des clés d'affermissement d'un ordre (issue #31).
 *
 * Depuis #32, les suggestions (WIPSTA=3) comme les OF fermes/planifiés (1/2) sont
 * lus dans la vue planning temps réel **ORDERS** (cf. `X3OfRepository`). Ce repo ne
 * garde qu'un point-lookup : retrouver le site d'un ordre depuis son numéro avant
 * l'appel au sous-programme `ZSOAPFIRM` (FUNMAUTR). Le sous-programme auto-détecte
 * le statut source ; le board n'a besoin que du site.
 *
 * L'ancienne source CBNDET (snapshot, drift post-affermissement) et la blacklist
 * `firmed_suggestions` sont supprimées — ORDERS est mis à jour immédiatement par
 * FUNMAUTR, une suggestion affermie en disparaît.
 */
type RawRow = Record<string, string | null>

export interface SuggestionKeys {
  /** N° de l'ordre (VCRNUM : SGAE… suggestion ou F… OF ferme/planifié). */
  sugNum: string
  stofcy: string
  itmref: string
  qte: number
}

export class X3SuggestionRepository {
  /**
   * Résout le site d'un ordre depuis son numéro — lu dans ORDERS (vue planning,
   * #32). Fonctionne pour une suggestion (WIPSTA=3) ou un OF ferme/planifié (1/2) :
   * le sous-programme X3 auto-détecte le statut source. Renvoie `null` si l'ordre
   * n'est pas affermissable (absent d'ORDERS, ou déjà ferme).
   */
  async getFirmingKeys(orderNum: string): Promise<SuggestionKeys | null> {
    const num = orderNum.trim()
    // VCRNUM X3 = alphanumérique (« SGAE… » / « F126-… ») : whitelist avant
    // interpolation SQL (pas de quote → pas d'injection).
    if (!num || !/^[A-Za-z0-9_-]+$/.test(num)) return null

    const sql = `
SELECT STOFCY_0 AS STOFCY, ITMREF_0 AS ARTICLE, RMNEXTQTY_0 AS QTE
FROM ORDERS
WHERE VCRNUM_0 = '${num}'
  AND WIPTYP_0 = 5
  AND WIPSTA_0 IN (2, 3)
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
      return { sugNum: num, stofcy, itmref, qte }
    } finally {
      await db.destroy()
    }
  }
}
