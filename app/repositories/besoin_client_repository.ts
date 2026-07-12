import type { Flow, OrderType, NeedNature } from '#app/domain/models/flow'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

const SQL = `
SELECT
  NVL(P_REEL.BPRNAM_0, P_LINK.BPRNAM_0) AS CLIENT,
  NVL(P_REEL.CRY_0, P_LINK.CRY_0) AS PAYS,
  CASE
    WHEN O.WIPSTA_0 = 1 THEN H_CUR.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 THEN
      CASE
        WHEN NVL(P_REEL.CRY_0, P_LINK.CRY_0) <> 'FR' THEN 'NOR'
        ELSE ''
      END
    ELSE 'NOR'
  END AS SOHTYP,
  O.VCRNUM_0 AS NO_DOCUMENT,
  O.VCRLIN_0 AS LIGNE,
  CASE
    WHEN O.WIPSTA_0 = 1 THEN 'COMMANDE'
    WHEN O.WIPSTA_0 = 3 THEN 'PREVISION'
    ELSE S.LANMES_0
  END AS STATUT,
  O.ITMREF_0 AS ARTICLE,
  Q.FMINUM_0 AS CONTREMARQUE,
  CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END AS ECHEANCE,
  O.EXTQTY_0 AS QTE_PREVUE,
  O.ALLQTY_0 AS QTE_ALLOUEE,
  (O.EXTQTY_0 - NVL(Q.DLVQTY_0, 0)) AS RESTE_LIVRER
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P_REEL ON P_REEL.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN APLSTD S ON S.LAN_0 = 'FRA' AND S.LANCHP_0 = 317 AND S.LANNUM_0 = O.WIPSTA_0
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
  AND NOT (O.WIPSTA_0 = 3 AND L.ITMREF_0 IS NULL)
  AND (O.EXTQTY_0 - NVL(Q.DLVQTY_0, 0)) > 0
`

type RawRow = Record<string, string | null>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export class X3BesoinClientRepository {
  /**
   * Besoins clients. Si `from`/`to` fournis → bornés par échéance dans la
   * fenêtre (gros gain : la table ORDERS est énorme sans filtre date).
   */
  async getDemandFlows(opts?: { from?: string; to?: string }): Promise<Flow[]> {
    let sql = SQL
    if (opts?.from && opts?.to && ISO.test(opts.from) && ISO.test(opts.to)) {
      sql +=
        `\n  AND (CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END)` +
        ` BETWEEN TO_DATE('${opts.from}', 'YYYY-MM-DD') AND TO_DATE('${opts.to}', 'YYYY-MM-DD')`
    }
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      return rows
        .filter((row) => Number.parseFloat(row.RESTE_LIVRER ?? '0') > 0)
        .map((row) => {
          const statut = row.STATUT?.trim() ?? ''
          const nature: NeedNature = statut === 'COMMANDE' ? 'COMMANDE' : 'PREVISION'
          const rawType = row.SOHTYP?.trim() ?? ''
          const orderType: OrderType | null = rawType === '' ? null : (rawType as OrderType)
          const qteCommandee = Number.parseFloat(row.QTE_PREVUE ?? '0') || 0
          const qteAllouee = Number.parseFloat(row.QTE_ALLOUEE ?? '0') || 0
          const quantity = Number.parseFloat(row.RESTE_LIVRER ?? '0')
          const article = row.ARTICLE?.trim() ?? ''
          const customer = row.CLIENT?.trim() || null
          const pays = row.PAYS?.trim() || null
          const contremarque = row.CONTREMARQUE?.trim() || null
          const date = parseX3Date(row.ECHEANCE)

          if (nature === 'COMMANDE') {
            return {
              article,
              quantity,
              direction: 'demand' as const,
              date,
              origin: {
                type: 'order' as const,
                id: row.NO_DOCUMENT?.trim() ?? '',
                customer: customer ?? '',
                pays,
                orderType,
                nature,
                contremarque,
                qteCommandee,
                qteAllouee,
                ligne: String(row.LIGNE ?? '').trim(),
              },
            }
          }
          return {
            article,
            quantity,
            direction: 'demand' as const,
            date,
            origin: {
              type: 'forecast' as const,
              id: row.NO_DOCUMENT?.trim() ?? '',
              customer,
              pays,
              orderType,
              contremarque,
              qteCommandee,
              qteAllouee,
            },
          }
        })
    } finally {
      await db.destroy()
    }
  }
}
