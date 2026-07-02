import { DateTime } from 'luxon'
import { X3Database } from '#app/x3/client/x3_database'

/** STOJOU.TRSTYP_0 = 4 → mouvement de livraison client (cf. issue #44). */
const TRSTYP_LIVRAISON_CLIENT = 4

/**
 * Tolérance de regroupement « camion » : deux lignes STOJOU du même client dont les
 * `CREDATTIM_0` se suivent à moins de N minutes d'écart sont considérées comme un seul
 * camion (la validation d'un bordereau grave potentiellement des timestamps légèrement
 * différents d'une palette à l'autre — cf. issue #44). Calibrable sans redeploy ; peut
 * aussi être surchargée par requête via `expGapMin` (dashboard_controller) le temps de
 * calibrer sur un échantillon réel (VPN requise).
 */
export const CAMION_GAP_MINUTES = Number(process.env.EXPEDITION_CAMION_GAP_MINUTES) || 5

/**
 * Filtre sur `CREDAT_0` (date, colonne Oracle DATE fiable — cf. modèle StockJournal)
 * plutôt que sur `CREDATTIM_0` pour la clause WHERE. `CREDATTIM_0` est en revanche
 * explicitement formaté via TO_CHAR (indépendant du NLS_DATE_FORMAT de session, qui
 * tronquerait sinon l'heure) pour servir de clé de regroupement + clustering « camion ».
 */
const CREDATTIM_FMT = "TO_CHAR(S.CREDATTIM_0, 'YYYY-MM-DD HH24:MI:SS')"

const buildSql = (fromStr: string, toStr: string) => `
SELECT
  S.BPRNUM_0,
  P.BPRNAM_0,
  ${CREDATTIM_FMT}              AS CREDATTIM_FMT,
  SUM(S.QTYPCU_0)                AS QTE_UC,
  COUNT(DISTINCT S.PALNUM_0)     AS NB_PALETTES,
  COUNT(DISTINCT S.LPNNUM_0)     AS NB_CONTENANTS
FROM STOJOU S
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = S.BPRNUM_0
WHERE S.TRSTYP_0 = ${TRSTYP_LIVRAISON_CLIENT}
AND S.CREDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY S.BPRNUM_0, P.BPRNAM_0, ${CREDATTIM_FMT}
ORDER BY S.BPRNUM_0, ${CREDATTIM_FMT}
`

type RawRow = Record<string, string | null>

/** Un groupe (client, timestamp exact) avant clustering — plusieurs groupes fusionnent en 1 camion. */
interface TimestampGroup {
  bprnum: string
  client: string
  tsMs: number
  qteUc: number
  nbPalettes: number
  nbContenants: number
}

export interface CamionDtl {
  client: string
  bprnum: string
  /** Heure du premier mouvement du camion (HH:mm). */
  debut: string
  /** Heure du dernier mouvement du camion (HH:mm) — égale à `debut` si un seul timestamp. */
  fin: string
  qteUc: number
  nbPalettes: number
  nbContenants: number
  /** Nombre de timestamps distincts fusionnés dans ce camion (diagnostic calibration). */
  nbLignes: number
}

export interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  camions: CamionDtl[]
}

function toNum(v: string | null): number {
  return parseFloat(v ?? '0') || 0
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function fmtHeure(tsMs: number): string {
  return DateTime.fromMillis(tsMs, { zone: 'UTC' }).toFormat('HH:mm')
}

/**
 * Regroupe des timestamps exacts en « camions » par trou < `gapMinutes` (gaps-and-islands) :
 * au sein d'un même client, deux timestamps consécutifs (triés) appartiennent au même camion
 * tant que l'écart avec le timestamp précédent du cluster reste sous le seuil.
 */
export function clusterCamions(groups: TimestampGroup[], gapMinutes: number): CamionDtl[] {
  const gapMs = gapMinutes * 60_000
  const sorted = [...groups].sort((a, b) =>
    a.bprnum === b.bprnum ? a.tsMs - b.tsMs : a.bprnum.localeCompare(b.bprnum),
  )

  const camions: (CamionDtl & { lastTs: number })[] = []

  for (const g of sorted) {
    const current = camions[camions.length - 1]
    if (current && current.bprnum === g.bprnum && g.tsMs - current.lastTs <= gapMs) {
      current.qteUc += g.qteUc
      current.nbPalettes += g.nbPalettes
      current.nbContenants += g.nbContenants
      current.nbLignes += 1
      current.fin = fmtHeure(g.tsMs)
      current.lastTs = g.tsMs
    } else {
      camions.push({
        client: g.client,
        bprnum: g.bprnum,
        debut: fmtHeure(g.tsMs),
        fin: fmtHeure(g.tsMs),
        qteUc: g.qteUc,
        nbPalettes: g.nbPalettes,
        nbContenants: g.nbContenants,
        nbLignes: 1,
        lastTs: g.tsMs,
      })
    }
  }

  return camions.map(({ lastTs: _lastTs, ...c }) => c)
}

export class ExpeditionRepository {
  /**
   * Expéditions (livraisons client) sur `[from, to]`. Un « camion » = un cluster de lignes
   * STOJOU du même client dont les `CREDATTIM_0` se suivent à moins de `gapMinutes` d'écart
   * — cf. issue #44 pour la logique métier de validation groupée des bordereaux.
   */
  async getExpeditions(
    from: Date,
    to: Date,
    label: string,
    gapMinutes: number = CAMION_GAP_MINUTES,
  ): Promise<ExpeditionKpi> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(to)))
    } finally {
      await db.destroy()
    }

    const groups: TimestampGroup[] = []
    for (const row of rows) {
      const dt = DateTime.fromFormat((row.CREDATTIM_FMT ?? '').trim(), 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC' })
      if (!dt.isValid) continue
      groups.push({
        bprnum: row.BPRNUM_0?.trim() ?? '',
        client: row.BPRNAM_0?.trim() ?? row.BPRNUM_0?.trim() ?? '',
        tsMs: dt.toMillis(),
        qteUc: toNum(row.QTE_UC),
        nbPalettes: toNum(row.NB_PALETTES),
        nbContenants: toNum(row.NB_CONTENANTS),
      })
    }

    const camions = clusterCamions(groups, gapMinutes)
    const totalUc = camions.reduce((sum, c) => sum + c.qteUc, 0)

    return { label, totalUc, nbCamions: camions.length, gapMinutes, camions }
  }
}
