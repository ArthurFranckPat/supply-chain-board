import { DateTime } from 'luxon'
import { X3Database } from '#app/x3/client/x3_database'

/** STOJOU.TRSTYP_0 = 4 → mouvement de livraison client (cf. issue #44). */
const TRSTYP_LIVRAISON_CLIENT = 4

/**
 * Tolérance de regroupement « camion » : deux lignes STOJOU du même client dont les
 * `CREDATTIM_0` se suivent à moins de N minutes d'écart sont considérées comme un seul
 * camion (la validation d'un bordereau grave potentiellement des timestamps légèrement
 * différents d'une palette à l'autre — cf. issue #44). Calibrable sans redeploy ; peut
 * aussi être surchargée par requête via `expGapMin` (expeditions_controller) le temps de
 * calibrer sur un échantillon réel (VPN requise).
 */
export const CAMION_GAP_MINUTES = Number(process.env.EXPEDITION_CAMION_GAP_MINUTES) || 5

/**
 * Capacité plausible d'un camion (en palettes) — sert uniquement à signaler les clusters
 * suspects (`anomalie`) quand le regroupement ci-dessus fusionne probablement plusieurs
 * camions réels (tolérance trop large). Un camion réel transporte ~33-35 palettes max.
 */
export const MAX_PALETTES_CAMION = Number(process.env.EXPEDITION_MAX_PALETTES_CAMION) || 35

/**
 * Filtre sur `CREDAT_0` (date, colonne Oracle DATE fiable — cf. modèle StockJournal)
 * plutôt que sur `CREDATTIM_0` pour la clause WHERE. `CREDATTIM_0` est en revanche
 * explicitement formaté via TO_CHAR (indépendant du NLS_DATE_FORMAT de session, qui
 * tronquerait sinon l'heure) pour servir de clé de tri + clustering « camion ».
 *
 * Pas de GROUP BY côté SQL : les lignes sont remontées au grain STOJOU et agrégées
 * côté application (cf. clusterCamions). Un COUNT(DISTINCT PALNUM_0) par groupe
 * (BPRNUM_0, CREDATTIM_0) puis sommé entre groupes surcomptait les palettes partagées
 * par plusieurs timestamps d'un même cluster — d'où des camions à 60+ palettes.
 */
const CREDATTIM_FMT = "TO_CHAR(S.CREDATTIM_0, 'YYYY-MM-DD HH24:MI:SS')"

const buildSql = (fromStr: string, toStr: string) => `
SELECT
  S.BPRNUM_0,
  P.BPRNAM_0,
  ${CREDATTIM_FMT} AS CREDATTIM_FMT,
  S.QTYPCU_0  AS QTE_UC,
  S.PALNUM_0  AS PALNUM,
  S.LPNNUM_0  AS LPNNUM
FROM STOJOU S
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = S.BPRNUM_0
WHERE S.TRSTYP_0 = ${TRSTYP_LIVRAISON_CLIENT}
AND S.CREDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
ORDER BY S.BPRNUM_0, ${CREDATTIM_FMT}
`

type RawRow = Record<string, string | null>

/** Ligne STOJOU brute, après parsing (avant clustering). */
export interface StojouLine {
  bprnum: string
  client: string
  tsMs: number
  /**
   * Quantité brute (signée) telle que renvoyée par X3. STOJOU grave les sorties de
   * stock (livraison client) avec un signe négatif (convention "variation de stock") —
   * `clusterCamions` prend la valeur absolue à l'accumulation : une expédition ne peut
   * pas être négative, cf. issue #44 (retour terrain).
   */
  qteUc: number
  palnum: string | null
  lpnnum: string | null
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
  /** Nombre de lignes STOJOU fusionnées dans ce camion. */
  nbLignes: number
  /** Nb de palettes au-delà de `MAX_PALETTES_CAMION` — cluster probablement composé de
   *  plusieurs camions réels fusionnés à tort (tolérance à resserrer). */
  anomalie: boolean
}

export interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  maxPalettesCamion: number
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
 * Regroupe des lignes STOJOU en « camions » par trou < `gapMinutes` (gaps-and-islands) :
 * au sein d'un même client, deux lignes consécutives (triées) appartiennent au même camion
 * tant que l'écart avec la dernière ligne du cluster reste sous le seuil (chaînage). Les
 * palettes/contenants sont dédupliqués sur l'ensemble du cluster (Set), pas sommés par
 * sous-groupe — sinon une même palette répartie sur plusieurs timestamps est comptée
 * plusieurs fois.
 */
export function clusterCamions(
  lines: StojouLine[],
  gapMinutes: number,
  maxPalettesCamion: number = MAX_PALETTES_CAMION,
): CamionDtl[] {
  const gapMs = gapMinutes * 60_000
  const sorted = [...lines].sort((a, b) =>
    a.bprnum === b.bprnum ? a.tsMs - b.tsMs : a.bprnum.localeCompare(b.bprnum),
  )

  interface Cluster {
    client: string
    bprnum: string
    debutMs: number
    finMs: number
    qteUc: number
    palettes: Set<string>
    contenants: Set<string>
    nbLignes: number
  }

  const clusters: Cluster[] = []

  for (const l of sorted) {
    const current = clusters[clusters.length - 1]
    if (current && current.bprnum === l.bprnum && l.tsMs - current.finMs <= gapMs) {
      current.qteUc += Math.abs(l.qteUc)
      if (l.palnum) current.palettes.add(l.palnum)
      if (l.lpnnum) current.contenants.add(l.lpnnum)
      current.nbLignes += 1
      current.finMs = l.tsMs
    } else {
      const c: Cluster = {
        client: l.client,
        bprnum: l.bprnum,
        debutMs: l.tsMs,
        finMs: l.tsMs,
        qteUc: Math.abs(l.qteUc),
        palettes: new Set(l.palnum ? [l.palnum] : []),
        contenants: new Set(l.lpnnum ? [l.lpnnum] : []),
        nbLignes: 1,
      }
      clusters.push(c)
    }
  }

  return clusters.map((c) => ({
    client: c.client,
    bprnum: c.bprnum,
    debut: fmtHeure(c.debutMs),
    fin: fmtHeure(c.finMs),
    qteUc: c.qteUc,
    nbPalettes: c.palettes.size,
    nbContenants: c.contenants.size,
    nbLignes: c.nbLignes,
    anomalie: c.palettes.size > maxPalettesCamion,
  }))
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

    const lines: StojouLine[] = []
    for (const row of rows) {
      const dt = DateTime.fromFormat((row.CREDATTIM_FMT ?? '').trim(), 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC' })
      if (!dt.isValid) continue
      lines.push({
        bprnum: row.BPRNUM_0?.trim() ?? '',
        client: row.BPRNAM_0?.trim() ?? row.BPRNUM_0?.trim() ?? '',
        tsMs: dt.toMillis(),
        qteUc: toNum(row.QTE_UC),
        palnum: row.PALNUM?.trim() || null,
        lpnnum: row.LPNNUM?.trim() || null,
      })
    }

    const camions = clusterCamions(lines, gapMinutes, MAX_PALETTES_CAMION)
    const totalUc = camions.reduce((sum, c) => sum + c.qteUc, 0)

    return { label, totalUc, nbCamions: camions.length, gapMinutes, maxPalettesCamion: MAX_PALETTES_CAMION, camions }
  }
}
