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
import { isoDay } from '#app/utils/dates'
import { cacheNs } from '#services/cache_ns'

/**
 * Cockpit poste (#119, lot 3) — sélecteur, identité, engagement.
 *
 * Le passé constaté (lots 4-6) viendra de `operations_trk_replica` et JAMAIS de
 * la voie directe : si le portail refuse la réplique (pas encore ingérée, run en
 * retard, autre environnement X3), le cockpit affiche l'indisponibilité plutôt
 * que d'interroger MFGOPETRK en direct. L'engagement, lui, vient du pipeline
 * #46 (`loadPosteEngagement`) qui a ses propres sources ORDERS/gammes.
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

export interface CockpitPostePayload {
  poste: CockpitPosteInfo
  /** Engagement futur — pipeline #46 réutilisé tel quel, jamais réimplémenté. */
  engagement: PosteEngagement | null
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

/**
 * Payload d'un poste : identité + engagement. La réplique indisponible n'empêche
 * pas l'engagement (sources ORDERS/gammes distinctes) — elle vide seulement ce
 * qui vient des pointages et l'écran le dira.
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

  let engagement: PosteEngagement | null = null
  let x3Error: string | null = null
  try {
    engagement = await loadPosteEngagement(safe, force)
    if (engagement.x3Error) x3Error = engagement.x3Error
  } catch (e) {
    x3Error = (e as Error).message
  }

  return { poste: info, engagement, fenetre, replica, x3Error }
}
