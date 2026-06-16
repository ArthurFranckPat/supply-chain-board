import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import type { OrderType, NeedNature } from '#app/domain/models/flow'

/**
 * Issue #10 — Mode planification : lignes de commande ouvertes au niveau ligne.
 * Calque de X3BesoinClientRepository (qui jette VCRLIN_0) en sélectionnant
 * O.VCRLIN_0 (clé SOPLIN_0) pour identifiant unique (numCommande, ligne).
 * Filtre `RESTE_LIVRER > 0` et `WIPTYP_0=1` (commandes).
 *
 * Expose aussi le type commande (SOHTYP_0 : MTS/MTO/NOR) et la nature
 * (WIPSTA_0 : 1=COMMANDE / 3=PREVISION) pour les filtres du board.
 */
const SQL = `
SELECT
  O.VCRNUM_0  AS NO_COMMANDE,
  O.VCRLIN_0  AS LIGNE,
  NVL(P_REEL.BPRNAM_0, P_LINK.BPRNAM_0) AS CLIENT,
  O.ITMREF_0  AS ARTICLE,
  I.ITMDES1_0 AS DESIGNATION,
  Q.FMINUM_0  AS CONTREMARQUE,
  O.WIPSTA_0  AS WIPSTA,
  CASE
    WHEN O.WIPSTA_0 = 1 THEN H_CUR.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 THEN
      CASE WHEN NVL(P_REEL.CRY_0, P_LINK.CRY_0) <> 'FR' THEN 'NOR' ELSE '' END
    ELSE 'NOR'
  END AS SOHTYP,
  CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END AS ECHEANCE,
  (O.RMNEXTQTY_0 - O.ALLQTY_0) AS RESTE_LIVRER,
  I.STU_0     AS UNITE
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P_REEL ON P_REEL.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H_CUR ON H_CUR.SOHNUM_0 = O.VCRNUM_0
LEFT JOIN SORDERQ Q ON Q.SOHNUM_0 = O.VCRNUM_0 AND Q.SOPLIN_0 = O.VCRLIN_0
LEFT JOIN (
  SELECT ITMREF_0, MIN(BPCNUM_0) AS BPCNUM_0
  FROM ITMBPC
  GROUP BY ITMREF_0
) L ON L.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P_LINK ON P_LINK.BPRNUM_0 = L.BPCNUM_0
WHERE O.WIPTYP_0 = 1
  AND I.ITMSTA_0 = 1
  AND (O.RMNEXTQTY_0 - O.ALLQTY_0) > 0
  AND NOT (O.WIPSTA_0 = 3 AND L.ITMREF_0 IS NULL)
`

type RawRow = Record<string, string | null>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export interface OrderLineRow {
  numCommande: string
  ligne: string
  client: string | null
  article: string
  designation: string | null
  quantite: number
  dateLivraison: Date
  contremarque: string | null
  unite: string | null
  orderType: OrderType | null
  nature: NeedNature
}

export class X3OrderLineRepository {
  /**
   * Lignes de commande ouvertes (RESTE_LIVRER > 0), niveau ligne.
   * `from`/`to` optionnels : borne par ECHEANCE (SHIDAT_0 firmes / ENDDAT_0 prévisions).
   */
  async getOpenOrderLines(opts?: { from?: string; to?: string }): Promise<OrderLineRow[]> {
    let sql = SQL
    if (opts?.from && opts?.to && ISO.test(opts.from) && ISO.test(opts.to)) {
      sql +=
        `\n  AND (CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END)` +
        ` BETWEEN TO_DATE('${opts.from}', 'YYYY-MM-DD') AND TO_DATE('${opts.to}', 'YYYY-MM-DD')`
    }

    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const out: OrderLineRow[] = []
      for (const row of rows) {
        const date = parseX3Date(row.ECHEANCE)
        if (!date) continue
        const rawType = row.SOHTYP?.trim() ?? ''
        const orderType: OrderType | null = rawType === '' ? null : (rawType as OrderType)
        const nature: NeedNature = row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION'
        out.push({
          numCommande: row.NO_COMMANDE?.trim() ?? '',
          ligne: row.LIGNE?.trim() ?? '',
          client: row.CLIENT?.trim() || null,
          article: row.ARTICLE?.trim() ?? '',
          designation: row.DESIGNATION?.trim() || null,
          quantite: parseFloat(row.RESTE_LIVRER ?? '0') || 0,
          dateLivraison: date,
          contremarque: row.CONTREMARQUE?.trim() || null,
          unite: row.UNITE?.trim() || null,
          orderType,
          nature,
        })
      }
      return out
    } finally {
      await db.destroy()
    }
  }
}
