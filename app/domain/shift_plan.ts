/**
 * Moteur de plan de schéma horaire — proposition, par poste de charge, du schéma
 * à tenir semaine par semaine sur l'horizon court (lot 1).
 *
 * Domaine pur : aucune dépendance Adonis, aucune I/O. Même maison que
 * `plan-diff.ts` et `rupture-engine.ts`.
 *
 * ── Le problème ─────────────────────────────────────────────────────────────
 * Le choix naïf — « le plus petit schéma dont la capacité couvre la semaine » —
 * produit du yo-yo : 1×8, 2×8, 1×8, 2×8. Inexploitable : le responsable d'atelier
 * staffe des équipes, pas des heures, et une équipe ne se recrute pas pour cinq
 * jours. Le plan doit donc être le plus RÉGULIER possible, pas le plus ajusté.
 *
 * ── Les deux règles ─────────────────────────────────────────────────────────
 * 1. PALIER MINIMUM : un schéma retenu tient `minPlateauWeeks` semaines (3 par
 *    défaut, choix métier). Tout palier du plan respecte ce plancher, y compris
 *    le dernier — sans quoi le moteur tricherait en fin d'horizon.
 *
 * 2. LISSAGE EN CUMULÉ : à l'intérieur d'un palier, le critère n'est PAS
 *    « capacité ≥ charge chaque semaine » mais « capacité cumulée ≥ charge
 *    cumulée ». Un 2×8 tenu trois semaines absorbe un pic de S3 en produisant dès
 *    S1. C'est ce report intra-palier qui rend un schéma stable soutenable.
 *
 * ── Ce que le moteur ne simule PAS : le rattrapage inter-palier ──────────────
 * La dette d'un palier sous-capacitaire est FACTURÉE (coût `debt`) et rendue
 * visible, jamais reportée sur le palier suivant. Raison : la charge d'entrée
 * vient du jalonnement CBN ou des dates demandées — si un poste ne tient pas sa
 * semaine, le CBN du lendemain repoussera le reste de lui-même. Ce moteur n'a
 * pas à réécrire le MRP ; il dit « ce palier ne tient pas » et propose le schéma
 * au-dessus. C'est aussi ce qui garde la décomposition en paliers exacte : le
 * report entrant d'un palier valant toujours zéro, son coût est local, et la
 * programmation dynamique ci-dessous est optimale plutôt qu'heuristique.
 *
 * ── Asymétrie avance / retard ───────────────────────────────────────────────
 * Produire en avance coûte du stock et de la place ; produire en retard rate le
 * service client. Les poids par défaut le reflètent (`early` ≪ `late`). L'avance
 * suppose en outre que la matière soit là : le lot 1 ne la plafonne pas, il
 * n'affiche que le schéma — le croisement avec `material_projection` est prévu
 * au lot 3.
 */

import type { ShiftSchedule } from '#app/domain/shift_schedules'
import { SHIFT_CATALOG, targetEquivalent } from '#app/domain/shift_schedules'

/** Poids du coût, en « heures équivalentes ». */
export interface ShiftPlanWeights {
  /** Capacité ouverte et inutilisée, en fin de palier. */
  idle: number
  /** Heures·semaine produites en avance à l'intérieur du palier (stock). */
  early: number
  /** Heures·semaine de charge en retard à l'intérieur du palier. */
  late: number
  /** Heures de charge que le palier ne tient pas du tout (dette sortante). */
  debt: number
  /** Coût fixe d'un changement de schéma — l'organisation, pas les heures. */
  switch: number
  /**
   * Prix d'une semaine courte, en FRACTION de la capacité qu'aurait le schéma
   * cible de même effectif sur le palier. L'usine vise le 1×8 ou le 2×8 sur cinq
   * jours ; fermer un jour répond à une sous-charge franche, ce n'est pas une
   * façon d'ajuster la capacité au plus juste.
   *
   * Relatif et non fixe, parce qu'un forfait ne peut pas servir les deux bouts :
   * assez cher pour écarter un 2×8 de quatre jours qui gratte quelques heures, il
   * devient assez cher pour imposer cinq jours à un poste chargé à 38 %. La
   * fraction, elle, dit la seule chose qui compte — quelle part de la semaine
   * pleine resterait inemployée.
   */
  offTarget: number
}

export interface ShiftPlanOptions {
  /** Durée minimale d'un palier, en semaines. Règle métier : 3. */
  minPlateauWeeks: number
  /**
   * Semaines de préavis en tête d'horizon : elles portent obligatoirement le
   * schéma courant. On ne passe pas un atelier en 2×8 pour lundi prochain.
   */
  frozenWeeks: number
  weights: ShiftPlanWeights
  /** Schémas candidats (défaut : tout le catalogue). */
  catalog: ShiftSchedule[]
}

/**
 * Poids par défaut, calés pour que trois situations réelles tombent juste : un pic
 * isolé absorbé en avance sans semaine courte, une sous-charge légère (~75 % du
 * 1×8 plein) qui garde ses cinq jours, une sous-charge franche (~38 %) qui ferme
 * des jours plutôt que de tourner à vide. Ce sont des points de départ, pas des
 * constantes physiques : ils se règlent sur les postes pilotes avec le métier,
 * et les tests de `shift_plan.test.ts` disent ce que chaque réglage doit préserver.
 */
export const DEFAULT_SHIFT_PLAN_OPTIONS: ShiftPlanOptions = {
  minPlateauWeeks: 3,
  frozenWeeks: 2,
  weights: { idle: 1, early: 0.3, late: 6, debt: 12, switch: 40, offTarget: 0.65 },
  catalog: SHIFT_CATALOG,
}

/** État d'une semaine sous le schéma retenu. */
export type ShiftWeekState =
  /** Charge couverte, capacité raisonnablement employée. */
  | 'tenu'
  /** Capacité nettement supérieure à la charge : le schéma tourne à vide. */
  | 'sous_charge'
  /** Cumul du palier en déficit à cette semaine : la charge glisse. */
  | 'retard'

export interface ShiftWeek {
  /** Index de la semaine dans l'horizon fourni. */
  index: number
  /** Charge (h) de la semaine, telle que reçue. */
  load: number
  /** Capacité (h) sous le schéma retenu, calendrier appliqué. */
  capacity: number
  /** Équipes-jour réellement staffées — l'unité que somme l'atelier. */
  crewDays: number
  state: ShiftWeekState
}

export interface ShiftPlateau {
  /** Index de la première semaine (inclus) et de la dernière (inclus). */
  from: number
  to: number
  schedule: ShiftSchedule
  /** Le palier est imposé par le préavis, pas choisi. */
  frozen: boolean
  /** Heures de charge que le palier ne tient pas (0 = palier soutenable). */
  debtHours: number
  /** Heures de capacité ouvertes pour rien sur le palier. */
  idleHours: number
  /** Charge (h) à produire sur le palier — le « combien » de la décision. */
  loadHours: number
  /** Capacité (h) ouverte par le schéma retenu sur le palier. */
  capacityHours: number
  /**
   * Capacité (h) qu'on aurait en NE CHANGEANT RIEN, c'est-à-dire sous le schéma
   * du palier précédent. `null` sur le premier palier, qui ne change rien par
   * définition.
   *
   * C'est le seul chiffre qui justifie une bascule à un responsable d'atelier :
   * « 111 h à produire, 105 h si tu restes en 1×8 ». Un taux de saturation ne le
   * dit pas — il faut le calculer ici, pendant qu'on a encore la capacité de
   * TOUS les schémas candidats sous la main.
   */
  keepHours: number | null
}

export interface ShiftPlan {
  plateaus: ShiftPlateau[]
  /** Une entrée par semaine de l'horizon, à plat. */
  weeks: ShiftWeek[]
  /** Nombre de changements de schéma sur l'horizon. */
  switches: number
  /** Coût total retenu — comparatif entre variantes, sans unité métier. */
  cost: number
}

/** Entrée du moteur pour UN poste. */
export interface ShiftPlanInput {
  /** Charge (h) par semaine, sur l'horizon. */
  load: number[]
  /**
   * Capacité (h) par semaine et par schéma du catalogue : `capacity[w][code]`.
   * Calculée en amont parce qu'elle dépend du calendrier (fériés, fermetures),
   * que le domaine pur n'a pas à connaître.
   */
  capacity: Map<string, number>[]
  /** Équipes-jour par semaine et par schéma, même indexation. */
  crewDays: Map<string, number>[]
  /** Schéma X3 courant du poste — imposé sur les semaines de préavis. */
  current: ShiftSchedule | null
}

/** Sous-charge à partir de laquelle une semaine est signalée comme tournant à vide. */
const IDLE_RATIO = 0.75

interface PlateauCost {
  cost: number
  debtHours: number
  idleHours: number
}

/**
 * Coût d'un palier [from, to] sous un schéma. Le report entrant vaut zéro (cf.
 * en-tête), donc ce coût ne dépend que du palier : c'est ce qui rend la
 * programmation dynamique exacte.
 */
function plateauCost(
  input: ShiftPlanInput,
  from: number,
  to: number,
  s: ShiftSchedule,
  w: ShiftPlanWeights
): PlateauCost {
  let totalLoad = 0
  for (let i = from; i <= to; i++) totalLoad += input.load[i] ?? 0

  // Capacité qu'aurait le schéma cible de même effectif : référence du prix
  // d'une semaine courte (nulle quand le schéma EST la cible).
  const equiv = targetEquivalent(s)
  let offTargetBase = 0

  let cumLoad = 0
  let cumCap = 0
  let lateHours = 0
  let earlyHours = 0

  for (let i = from; i <= to; i++) {
    cumLoad += input.load[i] ?? 0
    cumCap += input.capacity[i]?.get(s.code) ?? 0
    if (equiv && equiv.code !== s.code) offTargetBase += input.capacity[i]?.get(equiv.code) ?? 0
    const delta = cumCap - cumLoad
    if (delta < 0) {
      // Déficit cumulé : la charge de la semaine i glisse sur la suivante.
      lateHours += -delta
    } else {
      // Excédent cumulé : de l'avance, mais seulement à hauteur de ce qu'il
      // reste à produire dans le palier. Au-delà, ce n'est plus de l'avance,
      // c'est de la capacité ouverte pour rien — comptée en `idle` en sortie.
      earlyHours += Math.min(delta, totalLoad - cumLoad)
    }
  }

  const idleHours = Math.max(0, cumCap - cumLoad)
  const debtHours = Math.max(0, cumLoad - cumCap)
  const cost =
    w.idle * idleHours +
    w.early * earlyHours +
    w.late * lateHours +
    w.debt * debtHours +
    w.offTarget * offTargetBase

  return { cost, debtHours, idleHours }
}

/**
 * Découpes autorisées d'un palier démarrant en `from` : toute fin telle que le
 * palier dure au moins `min`, ET que le RESTE après lui en dure autant — sinon
 * la fin d'horizon laisserait un palier trop court. Quand le reste est trop
 * court, la seule découpe valide est « jusqu'au bout ».
 */
function plateauEnds(from: number, n: number, min: number): number[] {
  const ends: number[] = []
  for (let to = from + min - 1; to < n; to++) {
    const rest = n - 1 - to
    if (rest === 0 || rest >= min) ends.push(to)
  }
  if (ends.length === 0 && from < n) ends.push(n - 1)
  return ends
}

/**
 * Plan optimal d'un poste : programmation dynamique sur les PALIERS (pas sur les
 * semaines). L'état est (première semaine du palier, schéma du palier précédent) ;
 * `min` étant à 3 et l'horizon à 12, l'espace est minuscule et la solution exacte.
 */
export function planShifts(
  input: ShiftPlanInput,
  options: Partial<ShiftPlanOptions> = {}
): ShiftPlan {
  const weights = { ...DEFAULT_SHIFT_PLAN_OPTIONS.weights, ...(options.weights ?? {}) }
  const opt: ShiftPlanOptions = { ...DEFAULT_SHIFT_PLAN_OPTIONS, ...options, weights }
  const w = weights
  const n = input.load.length
  const min = Math.max(1, opt.minPlateauWeeks)
  const empty: ShiftPlan = { plateaus: [], weeks: [], switches: 0, cost: 0 }
  if (n === 0 || opt.catalog.length === 0) return empty

  type Choice = { cost: number; to: number; schedule: ShiftSchedule; next: string | null }
  const memo = new Map<string, Choice | null>()

  const solve = (from: number, prev: ShiftSchedule | null): Choice | null => {
    if (from >= n) return null
    const key = `${from}|${prev?.code ?? ''}`
    const hit = memo.get(key)
    if (hit !== undefined) return hit

    // Préavis : les semaines gelées portent le schéma courant. Le premier palier
    // ne peut donc ni changer de schéma, ni s'arrêter avant la fin du gel.
    const frozen = from === 0 && opt.frozenWeeks > 0 && input.current !== null
    const candidates = frozen ? [input.current as ShiftSchedule] : opt.catalog

    let best: Choice | null = null
    for (const s of candidates) {
      // Deux paliers adjacents de même schéma sont un seul palier : on l'interdit,
      // sinon le coût de changement se contourne en découpant.
      if (prev && prev.code === s.code) continue
      for (const to of plateauEnds(from, n, min)) {
        if (frozen && to < opt.frozenWeeks - 1) continue
        const pc = plateauCost(input, from, to, s, w)
        const tail = solve(to + 1, s)
        const cost = pc.cost + (prev ? w.switch : 0) + (tail?.cost ?? 0)
        if (!best || cost < best.cost) {
          best = { cost, to, schedule: s, next: tail ? `${to + 1}|${s.code}` : null }
        }
      }
    }
    memo.set(key, best)
    return best
  }

  const plateaus: ShiftPlateau[] = []
  let cursor = 0
  let prev: ShiftSchedule | null = null
  let total = 0
  while (cursor < n) {
    const choice = solve(cursor, prev)
    if (!choice) break
    const pc = plateauCost(input, cursor, choice.to, choice.schedule, w)
    let loadHours = 0
    let capacityHours = 0
    let keepHours = prev ? 0 : null
    for (let i = cursor; i <= choice.to; i++) {
      loadHours += input.load[i] ?? 0
      capacityHours += input.capacity[i]?.get(choice.schedule.code) ?? 0
      if (prev && keepHours !== null) keepHours += input.capacity[i]?.get(prev.code) ?? 0
    }
    plateaus.push({
      from: cursor,
      to: choice.to,
      schedule: choice.schedule,
      frozen: cursor === 0 && opt.frozenWeeks > 0 && input.current !== null,
      debtHours: Math.round(pc.debtHours * 10) / 10,
      idleHours: Math.round(pc.idleHours * 10) / 10,
      loadHours: Math.round(loadHours * 10) / 10,
      capacityHours: Math.round(capacityHours * 10) / 10,
      keepHours: keepHours === null ? null : Math.round(keepHours * 10) / 10,
    })
    total += pc.cost + (prev ? w.switch : 0)
    prev = choice.schedule
    cursor = choice.to + 1
  }

  const weeks: ShiftWeek[] = []
  for (const p of plateaus) {
    let cumLoad = 0
    let cumCap = 0
    for (let i = p.from; i <= p.to; i++) {
      const load = input.load[i] ?? 0
      const capacity = input.capacity[i]?.get(p.schedule.code) ?? 0
      cumLoad += load
      cumCap += capacity
      // L'état se lit sur le CUMUL du palier, pas sur la semaine seule : une
      // semaine creuse à l'intérieur d'un palier qui tient n'est pas un problème,
      // c'est le lissage qui fonctionne.
      const state: ShiftWeekState =
        cumCap < cumLoad ? 'retard' : cumLoad < cumCap * IDLE_RATIO ? 'sous_charge' : 'tenu'
      weeks.push({
        index: i,
        load: Math.round(load * 10) / 10,
        capacity: Math.round(capacity * 10) / 10,
        crewDays: input.crewDays[i]?.get(p.schedule.code) ?? 0,
        state,
      })
    }
  }

  return {
    plateaus,
    weeks,
    switches: Math.max(0, plateaus.length - 1),
    cost: Math.round(total * 10) / 10,
  }
}
