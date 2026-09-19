/**
 * Assemblage des entrées du moteur de schéma horaire, pour la page /charge.
 *
 * Le domaine (`shift_plan.ts`) ne connaît ni le calendrier ni X3 : il reçoit une
 * charge hebdo et une capacité par schéma candidat. C'est ici qu'on fabrique cette
 * capacité, en appliquant le calendrier d'ouverture (fériés, fermetures) EN DERNIER
 * — un 2×8 le 15 août reste fermé.
 */

import { addDays, isoDay } from '#app/utils/dates'
import type { Workstation } from '#app/domain/models/workstation'
import {
  SHIFT_CATALOG,
  currentScheduleOf,
  weeklyCapacityUnder,
  weeklyCrewDaysUnder,
} from '#app/domain/shift_schedules'
import { planShifts, type ShiftPlan, type ShiftPlanInput } from '#app/domain/shift_plan'

/**
 * Semaines sur lesquelles le plan est proposé. Volontairement plus court que les
 * six mois du graphe : au-delà d'un trimestre, la charge vient surtout de
 * prévisions, et proposer une organisation d'atelier dessus serait de la fausse
 * précision. Le graphe garde son horizon long, le plan dit le court terme.
 */
export const SHIFT_PLAN_WEEKS = 12

/** Raison pour laquelle un poste n'entre pas dans le plan — jamais un silence. */
export type ShiftPlanSkip = 'hors_catalogue' | 'sans_charge'

export interface ShiftPlanLine {
  code: string
  /** Schéma X3 courant (code catalogue), `null` si hors catalogue. */
  current: string | null
  plan: ShiftPlan
}

export interface ShiftPlanPayload {
  /** ISO des lundis couverts par le plan (sous-ensemble des semaines du graphe). */
  weekKeys: string[]
  /** Catalogue servi une fois : le client n'a que des codes dans les plans. */
  catalog: { code: string; label: string; crews: number; openDays: number; target: boolean }[]
  /** Plans par vue de charge — une décision d'organisation se lit dans la vue
   *  où le responsable regarde sa charge, OF ou commande. */
  of: ShiftPlanLine[]
  commande: ShiftPlanLine[]
  /** Postes écartés et pourquoi, pour que l'absence d'une ligne soit lisible. */
  skipped: { code: string; reason: ShiftPlanSkip }[]
}

/** Facteurs d'ouverture des sept jours d'une semaine, pour un poste. */
function weekFactors(
  w: Workstation,
  monday: Date,
  calendar: { factor(w: Workstation, iso: string): number } | null
): number[] {
  const out: number[] = []
  for (let d = 0; d < 7; d++) {
    out.push(calendar ? calendar.factor(w, isoDay(addDays(monday, d))) : 1)
  }
  return out
}

/**
 * Construit les plans de tous les postes planifiables.
 *
 * @param loadByView Charge hebdo (h) par vue puis par poste, alignée sur `weekKeys`
 *                   COMPLET du graphe — elle est tronquée ici à l'horizon du plan.
 */
export function buildShiftPlans(params: {
  workstations: Workstation[]
  calendar: { factor(w: Workstation, iso: string): number } | null
  weekKeys: string[]
  loadByView: { of: Map<string, number[]>; commande: Map<string, number[]> }
}): ShiftPlanPayload {
  const { workstations, calendar, loadByView } = params
  const weekKeys = params.weekKeys.slice(0, SHIFT_PLAN_WEEKS)
  const skipped: { code: string; reason: ShiftPlanSkip }[] = []
  const of: ShiftPlanLine[] = []
  const commande: ShiftPlanLine[] = []

  for (const w of workstations) {
    const current = currentScheduleOf(w)
    const loads = [loadByView.of.get(w.code), loadByView.commande.get(w.code)]
    const hasLoad = loads.some((l) => (l ?? []).slice(0, SHIFT_PLAN_WEEKS).some((h) => h > 0))
    if (!hasLoad) {
      // Pas de charge sur l'horizon : rien à organiser. Signalé sans être planifié.
      if (loads.some((l) => l !== undefined)) skipped.push({ code: w.code, reason: 'sans_charge' })
      continue
    }
    if (!current) {
      // Schéma X3 non normalisable (feu continu, semaine trouée) : le poste garde
      // sa capacité X3 telle quelle plutôt que de se faire arrondir en équipes.
      skipped.push({ code: w.code, reason: 'hors_catalogue' })
      continue
    }

    // Capacité et effectif sous CHAQUE schéma candidat, semaine par semaine.
    const capacity: Map<string, number>[] = []
    const crewDays: Map<string, number>[] = []
    for (const key of weekKeys) {
      const factors = weekFactors(w, new Date(key), calendar)
      capacity.push(new Map(SHIFT_CATALOG.map((s) => [s.code, weeklyCapacityUnder(s, w, factors)])))
      crewDays.push(new Map(SHIFT_CATALOG.map((s) => [s.code, weeklyCrewDaysUnder(s, factors)])))
    }

    const run = (load: number[] | undefined): ShiftPlanInput => ({
      load: weekKeys.map((_, i) => load?.[i] ?? 0),
      capacity,
      crewDays,
      current,
    })
    of.push({ code: w.code, current: current.code, plan: planShifts(run(loads[0])) })
    commande.push({ code: w.code, current: current.code, plan: planShifts(run(loads[1])) })
  }

  return {
    weekKeys,
    catalog: SHIFT_CATALOG.map((s) => ({
      code: s.code,
      label: s.label,
      crews: s.crews,
      openDays: s.openDays,
      target: s.target,
    })),
    of,
    commande,
    skipped,
  }
}
