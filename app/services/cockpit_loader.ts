import boardDataset from '#services/board_dataset'
import operationsTrkReplicaRepository from '#repositories/operations_trk_replica_repository'
import replicaGate, { type GateVerdict } from '#services/replica_gate'
import { operationsTrkWindow } from '#services/replica_sync_service'
import {
  loadPosteEngagement,
  weeklyCapacityOf,
  type PosteEngagement,
} from '#services/poste_engagement_loader'
import { POSTE_PP_RE, atelierLabel } from '#app/domain/atelier'
import { capacityPeriod } from '#app/domain/capacity'
import {
  heuresConvertiesParJour,
  productionParMois,
  productionRealiseeParJour,
  type PointageTrk,
  type ProductionMois,
} from '#app/domain/production_realisee'
import { isoDay } from '#app/utils/dates'
import { cacheNs } from '#services/cache_ns'

/**
 * Cockpit poste (#119) — sélecteur, identité, passé constaté, engagement.
 *
 * Le passé constaté vient de `operations_trk_replica` et JAMAIS de la voie
 * directe : si le portail refuse la réplique (pas encore ingérée, run en retard,
 * autre environnement X3), le cockpit affiche l'indisponibilité plutôt que
 * d'interroger MFGOPETRK en direct. L'engagement, lui, vient du pipeline #46
 * (`loadPosteEngagement`) qui a ses propres sources ORDERS/gammes.
 *
 * La production réalisée et sa conversion en heures sont du DOMAINE PUR
 * (`app/domain/production_realisee.ts`) : le loader assemble réplique + gamme +
 * capacité, il ne recalcule rien.
 */

/** Poste présélectionné à l'ouverture — celui qui a motivé l'écran (#119). */
const POSTE_DEFAUT = 'PP_093'

const COCKPIT_TTL = 5 * 60 * 1000

export interface CockpitPosteListItem {
  code: string
  label: string
}

export interface CockpitReplicaState {
  disponible: boolean
  /** Pourquoi elle ne l'est pas — null quand elle sert. */
  raison: GateVerdict['reason']
  dernierRunIso: string | null
}

export interface CockpitPostesPayload {
  postes: CockpitPosteListItem[]
  defaut: string | null
  /** Fenêtre de pointage couverte par la réplique (6 mois glissants). */
  fenetre: { fromIso: string; toIso: string }
  replica: CockpitReplicaState
}

export interface CockpitPosteInfo {
  code: string
  label: string
  /** Atelier de rattachement (STOLOC) — même rattachement que /charge et le
   *  séquenceur. Vide si le poste est inconnu du référentiel WORKSTATIO. */
  atelier: string
  atelierLabel: string
  /** Capacité hebdomadaire théorique (h) — la même formule et le même nombre
   *  qu'au séquenceur (WORKSTATIO + TABWEEDIA, #35/#37). Null si poste inconnu
   *  ou sans capacité. */
  capaciteHebdoHeures: number | null
  /** Régime du schéma horaire : DAYCAP Lundi→Dimanche (heures brutes, avant
   *  efficience/utilisation). Null si poste inconnu du référentiel. */
  regimeHebdo: number[] | null
  /** Dernier pointage du poste dans la fenêtre répliquée — null si aucun. */
  dernierPointageIso: string | null
}

/** Un mois du graphe heures vs capacité : trois lectures en heures. */
export interface CockpitHeuresMois {
  mois: string
  /** Capacité nette TABWEEDIA sur le mois, bornée à la fenêtre répliquée. */
  capacite: number
  /** Heures réellement pointées (opératoire + réglage). */
  heuresPointees: number
  /** Quantité produite convertie en heures de gamme — convention de gestion. */
  heuresConverties: number
}

/**
 * Le passé constaté d'un poste sur la fenêtre répliquée. Null quand la réplique
 * est indisponible : jamais de repli en voie directe sur les pointages.
 */
export interface CockpitPasse {
  nbPointages: number
  productionParMois: ProductionMois[]
  heuresParMois: CockpitHeuresMois[]
}

export interface CockpitPostePayload {
  poste: CockpitPosteInfo
  /** Engagement futur — pipeline #46 réutilisé tel quel, jamais réimplémenté. */
  engagement: PosteEngagement | null
  /** Passé constaté — réplique de pointages + domaine pur, lot 4. */
  passe: CockpitPasse | null
  fenetre: { fromIso: string; toIso: string }
  replica: CockpitReplicaState
  x3Error: string | null
}

/** Fenêtre de pointage en ISO : `[fromIso, toExclIso)` et `toIso` (dernier jour
 *  inclus) pour l'affichage. */
function fenetrePointage(): { fromIso: string; toIso: string; toExclIso: string } {
  const { from, to } = operationsTrkWindow()
  const toExcl = new Date(to)
  toExcl.setDate(toExcl.getDate() + 1)
  return { fromIso: isoDay(from), toIso: isoDay(to), toExclIso: isoDay(toExcl) }
}

/** Tri numérique du code (PP_2 avant PP_10) — même règle qu'au séquenceur. */
const posteNum = (code: string): number =>
  Number.parseInt(POSTE_PP_RE.exec(code)?.[0].slice(3) ?? '0', 10)

/**
 * Liste des postes du sélecteur : les postes NUMÉRIQUES (`PP_\d+`) ayant pointé
 * dans la fenêtre répliquée. La réplique est la source — un poste pointé mais
 * absent du référentiel gammes doit rester sélectionnable (son libellé retombe
 * sur le code). À l'inverse, un poste du référentiel sans aucun pointage n'a pas
 * sa place ici : l'écran raconte le passé constaté.
 */
export async function loadCockpitPostes(force = false): Promise<CockpitPostesPayload> {
  const cache = cacheNs('cockpit')
  const key = 'postes:v1'
  if (force) await cache.delete({ key })
  return cache.getOrSet({
    key,
    ttl: COCKPIT_TTL,
    factory: async (): Promise<CockpitPostesPayload> => {
      const fen = fenetrePointage()
      const fenetre = { fromIso: fen.fromIso, toIso: fen.toIso }

      const verdict = await replicaGate.verdict('operations_trk_replica')
      const replica: CockpitReplicaState = {
        disponible: verdict.source === 'replica',
        raison: verdict.reason,
        dernierRunIso: verdict.lastFullRunAt,
      }
      if (!replica.disponible) return { postes: [], defaut: null, fenetre, replica }

      const codes = await operationsTrkReplicaRepository.getDistinctWorkstations(
        fen.fromIso,
        fen.toExclIso
      )

      // Libellé de gamme, PAS la description WORKSTATIO — même convention que le
      // séquenceur et le board, deux sources qui peuvent diverger.
      const ref = await boardDataset.getReferential()
      const wstLabels = new Map<string, string>()
      for (const g of ref.gamme)
        if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)

      const postes = codes
        .filter((c) => POSTE_PP_RE.test(c))
        .sort((a, b) => posteNum(a) - posteNum(b))
        .map((code) => ({ code, label: wstLabels.get(code) ?? code }))

      const defaut = postes.some((p) => p.code === POSTE_DEFAUT)
        ? POSTE_DEFAUT
        : (postes[0]?.code ?? null)

      return { postes, defaut, fenetre, replica }
    },
  })
}

/** Liste des mois (YYYY-MM) couverts par la fenêtre, bornes incluses. */
function moisDeLaFenetre(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  const cur = fromIso.slice(0, 7)
  const last = toIso.slice(0, 7)
  let [y, m] = cur.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/**
 * Le passé constaté du poste : lecture réplique, puis domaine pur pour la
 * production réalisée et la conversion en heures. La capacité du graphe vient de
 * `capacityPeriod` (#35/#37), bornée à la fenêtre répliquée.
 *
 * Retourne null si la réplique est indisponible — l'appelant ne doit PAS tenter
 * la voie directe sur les pointages.
 */
async function computePasse(opts: {
  poste: string
  fen: { fromIso: string; toIso: string; toExclIso: string }
  wst: CockpitWorkstation | undefined
  gamme: { article: string; workstation: string; rate: number }[]
}): Promise<CockpitPasse | null> {
  const verdict = await replicaGate.verdict('operations_trk_replica')
  if (verdict.source !== 'replica') return null

  const rows = await operationsTrkReplicaRepository.getPointages(
    opts.fen.fromIso,
    opts.fen.toExclIso,
    opts.poste
  )
  if (rows.length === 0) {
    return { nbPointages: 0, productionParMois: [], heuresParMois: [] }
  }

  const pointages: PointageTrk[] = rows.map((r) => ({
    numOf: r.numOf,
    openum: r.openum,
    iptdat: r.iptdat,
    cplwst: r.cplwst,
    cplqty: r.cplqty,
    opetim: r.opetim,
    settim: r.settim,
    rebut: r.rebut,
    itmrefOf: r.itmrefOf,
  }))

  // Domaine pur : sélection dernière opération quantifiée + mailles jour + mois.
  const maillesJour = productionRealiseeParJour(pointages)
  const prodMois = productionParMois(maillesJour)

  // Cadence de gamme par (article, poste) pour la conversion en heures.
  const cadenceParCle = new Map<string, number>()
  for (const g of opts.gamme) {
    if (!g.workstation || g.rate <= 0) continue
    const cle = `${g.article}#${g.workstation}`
    if (!cadenceParCle.has(cle)) cadenceParCle.set(cle, g.rate)
  }
  const convertiesJour = heuresConvertiesParJour(
    pointages,
    (article, poste) => cadenceParCle.get(`${article}#${poste}`) ?? null
  )

  // Agrégat heures par mois : pointées (des mailles jour) + converties + capacité.
  const heuresPointeesParMois = new Map<string, number>()
  for (const m of maillesJour) {
    const mois = m.date.slice(0, 7)
    heuresPointeesParMois.set(mois, (heuresPointeesParMois.get(mois) ?? 0) + m.heures)
  }
  const convertiesParMois = new Map<string, number>()
  for (const [jour, h] of convertiesJour) {
    const mois = jour.slice(0, 7)
    convertiesParMois.set(mois, (convertiesParMois.get(mois) ?? 0) + h)
  }

  const from = new Date(`${opts.fen.fromIso}T00:00:00`)
  const to = new Date(`${opts.fen.toIso}T00:00:00`)
  const heuresParMois: CockpitHeuresMois[] = moisDeLaFenetre(opts.fen.fromIso, opts.fen.toIso).map(
    (mois) => {
      const debutMois = new Date(`${mois}-01T00:00:00`)
      const finMois = new Date(debutMois)
      finMois.setMonth(finMois.getMonth() + 1)
      finMois.setDate(finMois.getDate() - 1)
      const debut = debutMois > from ? debutMois : from
      const fin = finMois < to ? finMois : to
      const capacite = opts.wst ? (fin >= debut ? capacityPeriod(opts.wst, debut, fin) : 0) : 0
      return {
        mois,
        capacite: Math.round(capacite * 100) / 100,
        heuresPointees: Math.round((heuresPointeesParMois.get(mois) ?? 0) * 100) / 100,
        heuresConverties: Math.round((convertiesParMois.get(mois) ?? 0) * 100) / 100,
      }
    }
  )

  return { nbPointages: rows.length, productionParMois: prodMois, heuresParMois }
}

/** Poste du référentiel — shape minimale pour la capacité. */
type CockpitWorkstation = Parameters<typeof capacityPeriod>[0]

/**
 * Payload d'un poste : identité + passé constaté + engagement. La réplique
 * indisponible n'empêche pas l'engagement (sources ORDERS/gammes distinctes) —
 * elle met seulement le passé à null et l'écran le dira.
 */
export async function loadCockpitPoste(poste: string, force = false): Promise<CockpitPostePayload> {
  const safe = poste.trim()
  const fen = fenetrePointage()
  const fenetre = { fromIso: fen.fromIso, toIso: fen.toIso }

  const verdict = await replicaGate.verdict('operations_trk_replica')
  const replica: CockpitReplicaState = {
    disponible: verdict.source === 'replica',
    raison: verdict.reason,
    dernierRunIso: verdict.lastFullRunAt,
  }

  const ref = await boardDataset.getReferential()
  const wst = ref.workstations.find((w) => w.code === safe)
  let label = safe
  for (const g of ref.gamme) if (g.workstation === safe) label = g.workstationLabel || g.workstation

  const info: CockpitPosteInfo = {
    code: safe,
    label,
    atelier: wst?.stockLocation ?? '',
    atelierLabel: atelierLabel(wst?.stockLocation ?? ''),
    capaciteHebdoHeures: weeklyCapacityOf(safe, ref.workstations),
    regimeHebdo: wst ? [...wst.dailyCapacity] : null,
    dernierPointageIso: replica.disponible
      ? await operationsTrkReplicaRepository.getDernierPointageIso(safe, fen.fromIso, fen.toExclIso)
      : null,
  }

  const passe = await computePasse({ poste: safe, fen, wst, gamme: ref.gamme })

  let engagement: PosteEngagement | null = null
  let x3Error: string | null = null
  try {
    engagement = await loadPosteEngagement(safe, force)
    if (engagement.x3Error) x3Error = engagement.x3Error
  } catch (e) {
    x3Error = (e as Error).message
  }

  return { poste: info, engagement, passe, fenetre, replica, x3Error }
}
