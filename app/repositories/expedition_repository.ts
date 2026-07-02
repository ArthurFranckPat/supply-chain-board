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
 * Capacité de référence d'un camion (en palettes) pour le calcul du taux de remplissage.
 * Un camion standard europe = 33 palettes. Calibrable via env. Sert de dénominateur au
 * `tauxRemplissage` (équivalent-palettes / capacité). Indépendant du seuil d'anomalie
 * `MAX_PALETTES_CAMION` qui lui détecte les clusters heuristiques mal regroupés.
 */
export const CAMION_CAPACITE_PALETTES = Number(process.env.EXPEDITION_CAMION_CAPACITE) || 33

/**
 * Seuil de divergence entre palettes comptées (PALNUM) et palettes théoriques (calcul UC).
 * Au-delà, on considère que la saisie terrain est suspecte (scan incomplet ou palette
 * éclatée en plusieurs PALNUM). Exprimé en ratio (0.3 = ±30% de tolérance).
 */
export const SEUIL_ECART_PALETTES = Number(process.env.EXPEDITION_SEUIL_ECART_PAL) || 0.3

/**
 * Facteur de surface d'une palette ESH (1000×1200) vs palette standard (800×1200).
 * 1,20 m² / 0,96 m² = 1,25. Les palettes de la famille YFAMSTAT7 = 'ESH' occupent 25%
 * plus de place au sol qu'une palette standard ; on les compte pour 1,25 équivalent-
 * palettes dans le `palTheo` pour que le taux de remplissage reste homogène.
 * Calibrable via env. Extensible à d'autres familles plus tard.
 */
export const ESH_SURFACE_RATIO = Number(process.env.EXPEDITION_ESH_SURFACE_RATIO) || 1.25

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
  S.LPNNUM_0  AS LPNNUM,
  S.ITMREF_0  AS ITMREF,
  I.ITMDES1_0 AS DESIGNATION,
  S.VCRNUM_0  AS VCRNUM,
  S.VCRLIN_0  AS VCRLIN,
  I.PCU_0     AS PCU,
  I.PCUSTUCOE_0 AS PCU_STU_COE,
  I.PCUSTUCOE_1 AS UC_PAR_PAL,
  I.YFAMSTAT7_0 AS YFAMSTAT7
FROM STOJOU S
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = S.BPRNUM_0
LEFT JOIN ITMMASTER I ON I.ITMREF_0 = S.ITMREF_0
WHERE S.TRSTYP_0 = ${TRSTYP_LIVRAISON_CLIENT}
AND S.CREDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
ORDER BY S.BPRNUM_0, ${CREDATTIM_FMT}
`

/**
 * Mapping palette → navette (YNAVETTE, table custom AERECO). Une navette = un
 * regroupement réel de palettes saisi au préparation/expédition (source de vérité
 * terrain, cf. issue #44 affinage). On récupère l'ensemble {PALNUM, NAVETTE, SOHNUM}
 * sur la période pour rapprocher les lignes STOJOU sans heuristique.
 */
const buildNavetteSql = (fromStr: string, toStr: string) => `
SELECT NAVETTE_0 AS NAVETTE, PALNUM_0 AS PALNUM, SOHNUM_0 AS SOHNUM
FROM YNAVETTE
WHERE DAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
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
  /** Article (ITMREF_0) + désignation (ITMMASTER.ITMDES1_0) — détail camion. */
  itmref: string | null
  designation: string | null
  /** N° de pièce liée = bon de livraison pour TRSTYP_0=4 (VCRNUM_0 / VCRLIN_0). */
  vcrnum: string | null
  vcrlin: number | null
  /** Commande client (YNAVETTE.SOHNUM_0) — renseignée post-fetch par rapprochement
   *  PALNUM_0 → navette. `null` tant que le mapping navette n'a pas été appliqué. */
  sohnum: string | null
  /** Unité de conditionnement (ITMMASTER.PCU_0) — ex. CAR (carton), PAL (palette). */
  pcu: string | null
  /** Coefficient UC→US niveau 0 (ITMMASTER.PCUSTUCOE_0) — nb d'US par UC (colisage). */
  pcuStuCoe: number | null
  /** UC par palette (ITMMASTER.PCUSTUCOE_1) — palettisation de l'article. Sert au
   *  calcul de l'équivalent-palettes théorique : palTheo = Σ UC / ucParPal. */
  ucParPal: number | null
  /** Famille statistique 7 (ITMMASTER.YFAMSTAT7_0). 'ESH' = palette 1000×1200
   *  (vs 800×1200 standard) — impacte le facteur de surface (cf. calcVolumes). */
  yfamstat7: string | null
}

/**
 * Ligne de détail d'un camion (= une ligne STOJOU). Qté en valeur absolue, ts formaté.
 * Sert uniquement à l'affichage dans le drawer de détail camion (cf. issue #44).
 */
export interface CamionLigne {
  itmref: string
  designation: string
  vcrnum: string
  vcrlin: number
  client: string
  palnum: string
  lpnnum: string
  /** Quantité en valeur absolue (UC). */
  qteUc: number
  /** Heure du mouvement (HH:mm:ss). */
  ts: string
  /** Commande client (YNAVETTE.SOHNUM_0) — uniquement pour les lignes rattachées à une navette. */
  sohnum: string
  /** Unité de conditionnement (ITMMASTER.PCU_0) — ex. CAR, PAL, BO. */
  pcu: string
  /** Coefficient UC→US niveau 0 (ITMMASTER.PCUSTUCOE_0) — nb d'US par UC. */
  pcuStuCoe: number
  /** UC par palette (ITMMASTER.PCUSTUCOE_1) — palettisation de l'article. */
  ucParPal: number
  /** Famille statistique 7. 'ESH' = palette 1000×1200 (facteur surface 1,25). */
  yfamstat7: string
}

/**
 * Origine du regroupement d'un camion (issue #44, affinage navette).
 * - `'navette'`     : regroupement réel saisi dans YNAVETTE (source de vérité terrain).
 * - `'heuristique'` : palette sans navette → clusterCamions (client + trou < gap), filet de sécurité.
 */
export type CamionSource = 'navette' | 'heuristique'

export interface CamionDtl {
  source: CamionSource
  /** N° de navette (NAV…), uniquement si `source === 'navette'`. */
  navetteNum: string | null
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
   *  plusieurs camions réels fusionnés à tort (tolérance à resserrer). Concerne
   *  uniquement les camions `source === 'heuristique'` (les navettes sont fiables). */
  anomalie: boolean
  /**
   * Équivalent-palettes théorique (calculé depuis les UC + coefficients PCUSTUCOE).
   * Indicateur de volume indépendant du scan PALNUM. Sert à fiabiliser la détection
   * d'anomalies (cf. `ecartPalettes`) et le taux de remplissage (issue #44 affinage).
   * -1 si aucun coef disponible (impossible à calculer).
   */
  palTheo: number
  /** Taux de remplissage du camion = palTheo / CAMION_CAPACITE_PALETTES (0-1+). -1 si N/A. */
  tauxRemplissage: number
  /**
   * Écart relatif entre palettes comptées (PALNUM) et palettes théoriques (UC÷coef).
   * > SEUIL_ECART_PALETTES → saisie suspecte (scan incomplet ou palette éclatée).
   * -1 si palTheo non calculable.
   */
  ecartPalettes: number
  /** Détail des lignes STOJOU composant le camion (article, BL, palette…). */
  lignes: CamionLigne[]
}

export interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  maxPalettesCamion: number
  /** Capacité camion de référence (palettes) — dénominateur du taux de remplissage. */
  camionCapacitePalettes: number
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

function fmtHeureSec(tsMs: number): string {
  return DateTime.fromMillis(tsMs, { zone: 'UTC' }).toFormat('HH:mm:ss')
}

/**
 * Métriques volumes d'un ensemble de lignes : équivalent-palettes théorique (calcul UC),
 * taux de remplissage, et écart vs palettes comptées (PALNUM).
 *
 * `palTheo` = Σ (UC / ucParPal × facteurSurface), où `ucParPal` = PCUSTUCOE_1 (nombre
 * d'UC par palette pour l'article, cf. ITMMASTER). Le facteur de surface vaut
 * `ESH_SURFACE_RATIO` (1,25) pour les palettes ESH (1000×1200, famille YFAMSTAT7='ESH'),
 * 1,0 sinon (palette standard 800×1200) — afin que le taux de remplissage reste homogène
 * quel que soit le format mélangé dans le camion.
 *
 * Si aucune ligne n'a de `ucParPal` exploitable (>0), retourne -1 (impossible à calculer).
 */
function calcVolumes(
  lignes: { qteUc: number; ucParPal: number | null; yfamstat7?: string | null }[],
  nbPalettesComptees: number,
): { palTheo: number; tauxRemplissage: number; ecartPalettes: number } {
  let palTheoBrut = 0
  let hasCoef = false
  for (const l of lignes) {
    if (l.ucParPal && l.ucParPal > 0) {
      const palLigne = Math.abs(l.qteUc) / l.ucParPal
      const facteur = l.yfamstat7 === 'ESH' ? ESH_SURFACE_RATIO : 1
      palTheoBrut += palLigne * facteur
      hasCoef = true
    }
  }
  if (!hasCoef) {
    return { palTheo: -1, tauxRemplissage: -1, ecartPalettes: -1 }
  }
  const palTheo = palTheoBrut
  const tauxRemplissage = CAMION_CAPACITE_PALETTES > 0 ? palTheo / CAMION_CAPACITE_PALETTES : -1
  // Écart relatif entre compté et théorique (symétrique). 0 = parfait.
  const ecartPalettes =
    palTheo > 0 ? Math.abs(nbPalettesComptees - palTheo) / palTheo : -1
  return { palTheo, tauxRemplissage, ecartPalettes }
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
    lignes: CamionLigne[]
  }

  const clusters: Cluster[] = []

  const toLigne = (l: StojouLine): CamionLigne => ({
    itmref: l.itmref ?? '',
    designation: l.designation ?? '',
    vcrnum: l.vcrnum ?? '',
    vcrlin: l.vcrlin ?? 0,
    client: l.client,
    palnum: l.palnum ?? '',
    lpnnum: l.lpnnum ?? '',
    qteUc: Math.abs(l.qteUc),
    ts: fmtHeureSec(l.tsMs),
    sohnum: l.sohnum ?? '',
    pcu: l.pcu ?? '',
    pcuStuCoe: l.pcuStuCoe ?? 0,
    ucParPal: l.ucParPal ?? 0,
    yfamstat7: l.yfamstat7 ?? '',
  })

  for (const l of sorted) {
    const current = clusters[clusters.length - 1]
    if (current && current.bprnum === l.bprnum && l.tsMs - current.finMs <= gapMs) {
      current.qteUc += Math.abs(l.qteUc)
      if (l.palnum) current.palettes.add(l.palnum)
      if (l.lpnnum) current.contenants.add(l.lpnnum)
      current.nbLignes += 1
      current.finMs = l.tsMs
      current.lignes.push(toLigne(l))
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
        lignes: [toLigne(l)],
      }
      clusters.push(c)
    }
  }

  return clusters.map((c) => {
    const nbPalettes = c.palettes.size
    const { palTheo, tauxRemplissage, ecartPalettes } = calcVolumes(c.lignes, nbPalettes)
    return {
      source: 'heuristique' as const,
      navetteNum: null,
      client: c.client,
      bprnum: c.bprnum,
      debut: fmtHeure(c.debutMs),
      fin: fmtHeure(c.finMs),
      qteUc: c.qteUc,
      nbPalettes,
      nbContenants: c.contenants.size,
      nbLignes: c.nbLignes,
      anomalie: nbPalettes > maxPalettesCamion,
      palTheo,
      tauxRemplissage,
      ecartPalettes,
      lignes: c.lignes,
    }
  })
}

/**
 * Regroupe les lignes STOJOU rattachées à une navette YNAVETTE en camions réels.
 * Contrairement à `clusterCamions` (heuristique par client + trou), ici le
 * regroupement est explicite (NAVETTE_0) — pas de seuil de tolérance, pas de flag
 * anomalie : la source est fiable (saisie terrain).
 *
 * Une navette peut être multi-commandes / multi-articles ; on agrège UC par somme
 * (valeur absolue) et palettes/contenants par déduplication (Set), comme pour
 * l'heuristique. Le `debut`/`fin` = timestamps min/max des mouvements du groupe.
 *
 * Le n° de navette de chaque ligne est lu via la propriété transitoire
 * `line.navetteNum` (posée par `getExpeditions` après rapprochement PALNUM → NAVETTE).
 * Les lignes sans navette sont ignorées.
 */
export function groupCamionsByNavette(lines: StojouLine[]): CamionDtl[] {
  interface NavetteGroup {
    navetteNum: string
    lignes: StojouLine[]
  }
  const groups = new Map<string, NavetteGroup>()
  for (const l of lines) {
    const nav = (l as StojouLine & { navetteNum?: string }).navetteNum
    if (!nav) continue
    let g = groups.get(nav)
    if (!g) {
      g = { navetteNum: nav, lignes: [] }
      groups.set(nav, g)
    }
    g.lignes.push(l)
  }

  const result: CamionDtl[] = []
  for (const g of groups.values()) {
    const sorted = [...g.lignes].sort((a, b) => a.tsMs - b.tsMs)
    const palettes = new Set<string>()
    const contenants = new Set<string>()
    let qteUc = 0
    const lignesDetail: CamionLigne[] = []
    for (const l of sorted) {
      qteUc += Math.abs(l.qteUc)
      if (l.palnum) palettes.add(l.palnum)
      if (l.lpnnum) contenants.add(l.lpnnum)
      lignesDetail.push({
        itmref: l.itmref ?? '',
        designation: l.designation ?? '',
        vcrnum: l.vcrnum ?? '',
        vcrlin: l.vcrlin ?? 0,
        client: l.client,
        palnum: l.palnum ?? '',
        lpnnum: l.lpnnum ?? '',
        qteUc: Math.abs(l.qteUc),
        ts: fmtHeureSec(l.tsMs),
        sohnum: l.sohnum ?? '',
        pcu: l.pcu ?? '',
        pcuStuCoe: l.pcuStuCoe ?? 0,
        ucParPal: l.ucParPal ?? 0,
        yfamstat7: l.yfamstat7 ?? '',
      })
    }
    const clientName = sorted[0]?.client ?? ''
    const bprnum = sorted[0]?.bprnum ?? ''
    const nbPalettes = palettes.size
    const { palTheo, tauxRemplissage, ecartPalettes } = calcVolumes(lignesDetail, nbPalettes)
    result.push({
      source: 'navette',
      navetteNum: g.navetteNum,
      client: clientName,
      bprnum,
      debut: fmtHeure(sorted[0]!.tsMs),
      fin: fmtHeure(sorted[sorted.length - 1]!.tsMs),
      qteUc,
      nbPalettes,
      nbContenants: contenants.size,
      nbLignes: sorted.length,
      anomalie: false, // Les navettes sont fiables — pas de flag anomalie.
      palTheo,
      tauxRemplissage,
      ecartPalettes,
      lignes: lignesDetail,
    })
  }
  return result
}

/**
 * Expéditions (livraisons client) sur `[from, to]`. Un « camion » est :
 *  - **navette** (source de vérité) : palette rattachée à YNAVETTE → camion = NAVETTE_0,
 *    regroupement réel saisi terrain (pas d'heuristique, pas d'anomalie).
 *  - **heuristique** (filet) : palette sans navette → `clusterCamions` (client + trou
 *    < gap), avec détection d'anomalie (MAX_PALETTES_CAMION).
 *
 * Stratégie hybride (issue #44 affinage navette) : les navettes apparaissent en
 * premier dans la liste, les clusters heuristiques ensuite.
 */
export class ExpeditionRepository {
  async getExpeditions(
    from: Date,
    to: Date,
    label: string,
    gapMinutes: number = CAMION_GAP_MINUTES,
  ): Promise<ExpeditionKpi> {
    const fromStr = toYYYYMMDD(from)
    const toStr = toYYYYMMDD(to)

    const db = new X3Database()
    let rows: RawRow[] = []
    let navetteRows: RawRow[] = []
    try {
      ;[rows, navetteRows] = await Promise.all([
        db.raw(buildSql(fromStr, toStr)),
        db.raw(buildNavetteSql(fromStr, toStr)),
      ])
    } finally {
      await db.destroy()
    }

    // Mapping PALNUM → { navette, commande } sur la période.
    const navetteMap = new Map<string, { navette: string; sohnum: string }>()
    for (const row of navetteRows) {
      const pal = row.PALNUM?.trim()
      const nav = row.NAVETTE?.trim()
      if (pal && nav && !navetteMap.has(pal)) {
        navetteMap.set(pal, { navette: nav, sohnum: row.SOHNUM?.trim() ?? '' })
      }
    }

    const lines: StojouLine[] = []
    for (const row of rows) {
      const dt = DateTime.fromFormat((row.CREDATTIM_FMT ?? '').trim(), 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC' })
      if (!dt.isValid) continue
      const palnum = row.PALNUM?.trim() || null
      const matched = palnum ? navetteMap.get(palnum) : undefined
      lines.push({
        bprnum: row.BPRNUM_0?.trim() ?? '',
        client: row.BPRNAM_0?.trim() ?? row.BPRNUM_0?.trim() ?? '',
        tsMs: dt.toMillis(),
        qteUc: toNum(row.QTE_UC),
        palnum,
        lpnnum: row.LPNNUM?.trim() || null,
        itmref: row.ITMREF?.trim() || null,
        designation: row.DESIGNATION?.trim() || null,
        vcrnum: row.VCRNUM?.trim() || null,
        vcrlin: row.VCRLIN ? parseInt(row.VCRLIN, 10) || null : null,
        sohnum: matched?.sohnum ?? null,
        pcu: row.PCU?.trim() || null,
        pcuStuCoe: row.PCU_STU_COE ? toNum(row.PCU_STU_COE) : null,
        ucParPal: row.UC_PAR_PAL ? toNum(row.UC_PAR_PAL) : null,
        yfamstat7: row.YFAMSTAT7?.trim() || null,
        // Propriété transitoire lue par groupCamionsByNavette.
        ...(matched ? { navetteNum: matched.navette } : {}),
      } as StojouLine)
    }

    // Partition : lignes rattachées à une navette vs lignes hors navette.
    const withNavette = lines.filter((l) => !!(l as StojouLine & { navetteNum?: string }).navetteNum)
    const withoutNavette = lines.filter((l) => !(l as StojouLine & { navetteNum?: string }).navetteNum)

    const navetteCamions = groupCamionsByNavette(withNavette)
    const heuristiqueCamions = clusterCamions(withoutNavette, gapMinutes, MAX_PALETTES_CAMION)

    // Tri intra-groupe par heure de début (le plus tôt d'abord).
    const byDebut = (a: CamionDtl, b: CamionDtl) => a.debut.localeCompare(b.debut)
    navetteCamions.sort(byDebut)
    heuristiqueCamions.sort(byDebut)

    // Navettes d'abord, puis clusters heuristiques (choix UX, issue #44 affinage).
    const camions = [...navetteCamions, ...heuristiqueCamions]
    const totalUc = camions.reduce((sum, c) => sum + c.qteUc, 0)

    return { label, totalUc, nbCamions: camions.length, gapMinutes, maxPalettesCamion: MAX_PALETTES_CAMION, camionCapacitePalettes: CAMION_CAPACITE_PALETTES, camions }
  }
}
