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
 * Cluster interne (avant mapping vers CamionDtl). C'est l'unité de fusion : les merges
 * BL et navette opèrent sur ces clusters avant le calcul final des volumes.
 */
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
  /** N° de navette si au moins une ligne du cluster est rattachée à YNAVETTE.
   *  Permet à mergeClustersByNavette de fusionner les clusters d'une même navette,
   *  et à clusterToCamion de déterminer la source ('navette' vs 'heuristique'). */
  navetteNum: string | null
}

/** Lit le n° de navette transitoire posé par getExpeditions (ou null si non rattaché). */
const navetteOf = (l: StojouLine): string | null =>
  (l as StojouLine & { navetteNum?: string }).navetteNum ?? null

const stojouLineToCamionLigne = (l: StojouLine): CamionLigne => ({
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

/**
 * Fusionne les clusters partageant une même clé (union-find transitif). Cœur commun
 * pour la fusion BL (`vcrnum` des lignes) et la fusion navette (`navetteNum` du cluster).
 *
 * La fusion est transitive : si A partage clé-x avec B, et B partage clé-y avec C,
 * alors A, B, C fusionnent. Les clusters sans clé (ou dont la clé est unique) restent
 * inchangés. La reconstruction re-déduplique palettes/contenants, prend le client du
 * cluster au début le plus précoce, et propage le premier navetteNum non-null trouvé.
 */
function mergeClustersByKey(
  clusters: Cluster[],
  /** Extrait les clés de fusion d'un cluster (clés vides/null ignorées). */
  keysOf: (c: Cluster) => string[],
): Cluster[] {
  if (clusters.length <= 1) return clusters

  // clé → indices des clusters qui la portent.
  const keyToClusters = new Map<string, Set<number>>()
  for (let i = 0; i < clusters.length; i++) {
    for (const key of keysOf(clusters[i]!)) {
      let set = keyToClusters.get(key)
      if (!set) {
        set = new Set()
        keyToClusters.set(key, set)
      }
      set.add(i)
    }
  }

  // Union-find sur les indices de clusters.
  const parent = clusters.map((_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]!
      x = parent[x]!
    }
    return x
  }
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  for (const indices of keyToClusters.values()) {
    const arr = [...indices]
    for (let k = 1; k < arr.length; k++) union(arr[0]!, arr[k]!)
  }

  // Regroupe les clusters par racine.
  const groups = new Map<number, number[]>()
  for (let i = 0; i < clusters.length; i++) {
    const root = find(i)
    let g = groups.get(root)
    if (!g) {
      g = []
      groups.set(root, g)
    }
    g.push(i)
  }

  // Reconstruit chaque cluster fusionné.
  return [...groups.values()].map((indices) => {
    if (indices.length === 1) return clusters[indices[0]!]!
    const parts = indices.map((i) => clusters[i]!)
    const debutMs = Math.min(...parts.map((c) => c.debutMs))
    const finMs = Math.max(...parts.map((c) => c.finMs))
    const palettes = new Set<string>()
    const contenants = new Set<string>()
    let qteUc = 0
    let nbLignes = 0
    const lignes: CamionLigne[] = []
    for (const c of parts) {
      for (const p of c.palettes) palettes.add(p)
      for (const ct of c.contenants) contenants.add(ct)
      qteUc += c.qteUc
      nbLignes += c.nbLignes
      lignes.push(...c.lignes)
    }
    const earliest = parts.reduce((min, c) => (c.debutMs < min.debutMs ? c : min))
    return {
      client: earliest.client,
      bprnum: earliest.bprnum,
      debutMs,
      finMs,
      qteUc,
      palettes,
      contenants,
      nbLignes,
      lignes,
      navetteNum: parts.map((c) => c.navetteNum).find((n) => n !== null) ?? null,
    }
  })
}

/** Fusionne les clusters partageant un même BL (VCRNUM_0) — un BL ne s'éclate jamais. */
function mergeClustersByBl(clusters: Cluster[]): Cluster[] {
  return mergeClustersByKey(clusters, (c) => {
    const bls = new Set<string>()
    for (const l of c.lignes) if (l.vcrnum) bls.add(l.vcrnum)
    return [...bls]
  })
}

/** Fusionne les clusters partageant une même navette — une navette ne s'éclate jamais. */
function mergeClustersByNavette(clusters: Cluster[]): Cluster[] {
  return mergeClustersByKey(clusters, (c) => (c.navetteNum ? [c.navetteNum] : []))
}

/** Mappe un cluster interne vers le CamionDtl final (volumes + source déduites ici).
 *
 * Si au moins une ligne du cluster porte un n° de navette → source 'navette' (le camion
 * contient au moins une palette saisie dans YNAVETTE, potentiellement rattrapée avec des
 * palettes orphelines). Les navettes sont fiables → jamais d'anomalie.
 * Sinon → source 'heuristique', anomalie selon MAX_PALETTES_CAMION. */
function clusterToCamion(c: Cluster, maxPalettesCamion: number): CamionDtl {
  const nbPalettes = c.palettes.size
  const { palTheo, tauxRemplissage, ecartPalettes } = calcVolumes(c.lignes, nbPalettes)
  const isNavette = c.navetteNum !== null
  return {
    source: isNavette ? 'navette' : 'heuristique',
    navetteNum: c.navetteNum,
    client: c.client,
    bprnum: c.bprnum,
    debut: fmtHeure(c.debutMs),
    fin: fmtHeure(c.finMs),
    qteUc: c.qteUc,
    nbPalettes,
    nbContenants: c.contenants.size,
    nbLignes: c.nbLignes,
    anomalie: isNavette ? false : nbPalettes > maxPalettesCamion,
    palTheo,
    tauxRemplissage,
    ecartPalettes,
    lignes: c.lignes,
  }
}

/**
 * Regroupe des lignes STOJOU en « camions » par trou < `gapMinutes` (gaps-and-islands) :
 * au sein d'un même client, deux lignes consécutives (triées) appartiennent au même camion
 * tant que l'écart avec la dernière ligne du cluster reste sous le seuil (chaînage). Les
 * palettes/contenants sont dédupliqués sur l'ensemble du cluster (Set), pas sommés par
 * sous-groupe — sinon une même palette répartie sur plusieurs timestamps est comptée
 * plusieurs fois.
 *
 * Pipeline en 3 phases :
 *   1. Walk gap (client + trou < gap) → Cluster[] internes.
 *   2. mergeClustersByBl → fusionne les clusters partageant un BL (règle non-éclatement).
 *   3. clusterToCamion → calcule volumes + anomalie, mappe vers CamionDtl.
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

  // Phase 1 — walk gap.
  // Frontière navette (hard stop) : deux navettes distinctes ne doivent jamais être
  // fusionnées, même si validées dans la foulée (même client + créneau contigu). C'est
  // la protection contre la sur-fusion de camions réels distincts (ex. cas 61 palettes).
  // Les lignes orphelines (sans navette) restent absorbables par n'importe quel cluster.
  const clusters: Cluster[] = []
  for (const l of sorted) {
    const current = clusters[clusters.length - 1]
    const ln = navetteOf(l)
    const conflitNavette =
      current !== undefined &&
      current.navetteNum !== null &&
      ln !== null &&
      current.navetteNum !== ln
    if (
      current &&
      !conflitNavette &&
      current.bprnum === l.bprnum &&
      l.tsMs - current.finMs <= gapMs
    ) {
      current.qteUc += Math.abs(l.qteUc)
      if (l.palnum) current.palettes.add(l.palnum)
      if (l.lpnnum) current.contenants.add(l.lpnnum)
      current.nbLignes += 1
      current.finMs = l.tsMs
      current.lignes.push(stojouLineToCamionLigne(l))
      if (ln) current.navetteNum = ln
    } else {
      clusters.push({
        client: l.client,
        bprnum: l.bprnum,
        debutMs: l.tsMs,
        finMs: l.tsMs,
        qteUc: Math.abs(l.qteUc),
        palettes: new Set(l.palnum ? [l.palnum] : []),
        contenants: new Set(l.lpnnum ? [l.lpnnum] : []),
        nbLignes: 1,
        lignes: [stojouLineToCamionLigne(l)],
        navetteNum: navetteOf(l),
      })
    }
  }

  // Phase 2 — fusion BL (un BL ne doit pas être éclaté sur plusieurs camions).
  const mergedBl = mergeClustersByBl(clusters)

  // Phase 3 — fusion navette (une navette ne doit pas être éclatée non plus).
  const merged = mergeClustersByNavette(mergedBl)

  // Phase 4 — mapping final (volumes + source/navette déduites du cluster).
  return merged.map((c) => clusterToCamion(c, maxPalettesCamion))
}

/**
 * Expéditions (livraisons client) sur `[from, to]`. Le pipeline unifié `clusterCamions`
 * regroupe TOUTES les lignes ensemble (client + gap), puis applique 3 contraintes de
 * fusion successives : BL (un BL ne s'éclate pas), navette (une navette ne s'éclate pas).
 *
 * Ainsi une palette orpheline (non saisie dans YNAVETTE) mais partie dans le même camion
 * (même client + créneau) est rattrapée naturellement par le walk gap, puis absorbée dans
 * le camion navette lors de la fusion. La source du camion ('navette' vs 'heuristique')
 * est déduite a posteriori : si au moins une palette porte un n° de navette, le camion
 * est marqué 'navette' et n'est jamais signalé en anomalie (source fiable terrain).
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

    // Pipeline unifié : toutes les lignes passent par clusterCamions (walk gap → fusion
    // BL → fusion navette). Fini la partition navette/heuristique : les palettes
    // orphelines sont rattrapées par le walk gap puis absorbées par la fusion navette.
    const camions = clusterCamions(lines, gapMinutes, MAX_PALETTES_CAMION)
    camions.sort((a, b) => a.debut.localeCompare(b.debut))
    const totalUc = camions.reduce((sum, c) => sum + c.qteUc, 0)

    return { label, totalUc, nbCamions: camions.length, gapMinutes, maxPalettesCamion: MAX_PALETTES_CAMION, camionCapacitePalettes: CAMION_CAPACITE_PALETTES, camions }
  }
}
