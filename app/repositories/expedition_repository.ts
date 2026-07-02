import { X3Database } from '#app/x3/client/x3_database'

/** STOJOU.TRSTYP_0 = 4 → mouvement de livraison client (cf. issue #44). */
const TRSTYP_LIVRAISON_CLIENT = 4

/**
 * Filtre sur `CREDAT_0` (date, colonne Oracle DATE fiable — cf. modèle StockJournal)
 * plutôt que sur `CREDATTIM_0` (date+heure, typé string côté modèle car son format
 * réel n'est pas encore validé — cf. issue #44 "à valider sur données réelles").
 * `CREDATTIM_0` brut sert uniquement de clé de regroupement « camion » ci-dessous.
 */
const buildSql = (fromStr: string, toStr: string) => `
SELECT
  S.BPRNUM_0,
  P.BPRNAM_0,
  S.CREDATTIM_0,
  SUM(S.QTYPCU_0)              AS QTE_UC,
  COUNT(DISTINCT S.PALNUM_0)   AS NB_PALETTES,
  COUNT(DISTINCT S.LPNNUM_0)   AS NB_CONTENANTS
FROM STOJOU S
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = S.BPRNUM_0
WHERE S.TRSTYP_0 = ${TRSTYP_LIVRAISON_CLIENT}
AND S.CREDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY S.BPRNUM_0, P.BPRNAM_0, S.CREDATTIM_0
ORDER BY S.CREDATTIM_0 DESC
`

type RawRow = Record<string, string | null>

export interface CamionDtl {
  client: string
  bprnum: string
  /**
   * `CREDATTIM_0` brut, tel que renvoyé par X3 (trim uniquement). Le format
   * exact (Oracle DATE vs numérique) reste à valider sur données réelles
   * (VPN requise, cf. issue #44) avant d'y appliquer un formatage d'affichage.
   */
  dateHeure: string
  qteUc: number
  nbPalettes: number
  nbContenants: number
}

export interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  camions: CamionDtl[]
}

function toNum(v: string | null): number {
  return parseFloat(v ?? '0') || 0
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export class ExpeditionRepository {
  /**
   * Expéditions (livraisons client) sur `[from, to]`. Un « camion » = un groupe
   * (client, CREDATTIM_0) — cf. issue #44 pour la logique métier de validation
   * groupée des bordereaux de livraison.
   */
  async getExpeditions(from: Date, to: Date, label: string): Promise<ExpeditionKpi> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(to)))
    } finally {
      await db.destroy()
    }

    let totalUc = 0
    const camions: CamionDtl[] = rows.map((row) => {
      const qteUc = toNum(row.QTE_UC)
      totalUc += qteUc
      return {
        client: row.BPRNAM_0?.trim() ?? row.BPRNUM_0?.trim() ?? '',
        bprnum: row.BPRNUM_0?.trim() ?? '',
        dateHeure: row.CREDATTIM_0?.trim() ?? '',
        qteUc,
        nbPalettes: toNum(row.NB_PALETTES),
        nbContenants: toNum(row.NB_CONTENANTS),
      }
    })

    return { label, totalUc, nbCamions: camions.length, camions }
  }
}
