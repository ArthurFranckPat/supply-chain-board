/**
 * Catalogue des schémas horaires planifiables (lot 1 du plan de schéma horaire).
 *
 * ── Pourquoi un catalogue, et pas `SHIFTS_BY_SCHEDULE` ──────────────────────
 * `capacity.ts` lit le paramétrage X3 et le réduit à un SCALAIRE (équipes par jour
 * ouvré). Suffisant pour constater une capacité, insuffisant pour en décider une :
 * « deux jours de production » n'est pas un nombre d'équipes, c'est un profil de
 * semaine. Un schéma planifiable porte donc un VECTEUR Lundi→Dimanche, aligné sur
 * `DAYCAP_0..6`.
 *
 * ── Le piège `WSTNBR` ───────────────────────────────────────────────────────
 * X3 exprime les équipes de deux façons que le dossier AE1 ne combine jamais :
 * par le schéma (`PP_153` en `2/8`) ou par les exemplaires (`PP_830` en `CFA`
 * avec `WSTNBR_0 = 2`, qui est un 2×8 sur UNE ligne, pas deux lignes parallèles).
 *
 * Un schéma planifié SUBSTITUE le nombre d'équipes total, quelle que soit la façon
 * dont X3 l'exprimait : `WSTNBR` ne se multiplie PLUS par-dessus. Sans cette règle,
 * poser `2x8-5j` sur `PP_830` donnerait 7 × 2 × 2 = 28 h/j — faux d'un facteur 2
 * et silencieusement plausible. C'est aussi pourquoi l'état initial de `PP_830`
 * est `2x8-5j` et non `1x8-5j` : ses deux exemplaires SONT ses deux équipes.
 */

import { CLOSED_CAP_H, SHIFT_HOURS, shiftsOf, yieldFactor } from '#app/domain/capacity'
import type { Workstation } from '#app/domain/models/workstation'

export interface ShiftSchedule {
  /** Code stable, persisté dans le plan (`2x8-5j`). */
  code: string
  /** Libellé d'atelier (« 2×8 · 5 jours »). */
  label: string
  /** Équipes par jour, index 0 = Lundi … 6 = Dimanche (aligné `DAYCAP_0..6`). */
  shifts: number[]
  /** Équipes à staffer en simultané — ce que le responsable d'atelier recrute. */
  crews: number
  /** Jours de production par semaine. */
  openDays: number
  /** Équipes-jour par semaine (Σ shifts) : l'unité d'effectif agrégeable. */
  crewDays: number
  /**
   * Schéma que l'usine VISE (semaine pleine). Les semaines courtes n'existent
   * que pour la franche sous-charge : à capacité équivalente, un atelier préfère
   * cinq jours à quatre. Le moteur leur applique une pénalité (`offTarget`) qui
   * les réserve aux cas où fermer un jour est nettement plus sensé que tourner
   * à vide.
   */
  target: boolean
}

const schedule = (code: string, label: string, crews: number, openDays: number): ShiftSchedule => {
  const shifts = [0, 0, 0, 0, 0, 0, 0]
  for (let d = 0; d < openDays; d++) shifts[d] = crews
  return {
    code,
    label,
    shifts,
    crews,
    openDays,
    crewDays: crews * openDays,
    target: openDays === 5,
  }
}

/**
 * Schémas autorisés, par capacité croissante. Les deux cibles sont `1x8-5j` et
 * `2x8-5j` ; les semaines courtes n'existent que pour la sous-charge, où faire
 * tourner cinq jours à vide coûte plus cher que fermer le jeudi.
 *
 * `3x8` est délibérément absent : non autorisé aujourd'hui par le métier. L'ajouter
 * est une ligne ici, rien d'autre dans le moteur n'en dépend.
 */
export const SHIFT_CATALOG: ShiftSchedule[] = [
  schedule('1x8-2j', '1×8 · 2 jours', 1, 2),
  schedule('1x8-3j', '1×8 · 3 jours', 1, 3),
  schedule('1x8-4j', '1×8 · 4 jours', 1, 4),
  schedule('1x8-5j', '1×8 · 5 jours', 1, 5),
  schedule('2x8-4j', '2×8 · 4 jours', 2, 4),
  schedule('2x8-5j', '2×8 · 5 jours', 2, 5),
]

export const scheduleByCode = (code: string): ShiftSchedule | undefined =>
  SHIFT_CATALOG.find((s) => s.code === code)

/**
 * Schéma CIBLE de même effectif (semaine pleine) : `1x8-3j` → `1x8-5j`. Sert de
 * référence au moteur pour juger si une semaine courte est justifiée — la
 * question n'est jamais « ce schéma gaspille-t-il moins ? » mais « la sous-charge
 * est-elle assez franche pour fermer un jour ? ».
 */
export const targetEquivalent = (s: ShiftSchedule): ShiftSchedule | undefined =>
  s.target ? s : SHIFT_CATALOG.find((t) => t.target && t.crews === s.crews)

/**
 * Schéma du catalogue correspondant au paramétrage X3 ACTUEL du poste, ou `null`
 * si ce paramétrage n'entre pas dans le catalogue.
 *
 * Équipes = schéma X3 × exemplaires (cf. en-tête : les deux expriment la même
 * chose). Jours = jours dont `DAYCAP` dépasse la sentinelle « fermé » (0,01 h),
 * et il faut qu'ils soient les N PREMIERS de la semaine : un poste ouvert
 * lundi-mercredi-vendredi n'est pas un « 3 jours » du catalogue, et l'arrondir
 * en serait un mensonge. Il reste alors sur sa capacité X3, non planifié.
 */
export function currentScheduleOf(w: Workstation): ShiftSchedule | null {
  const crews = (shiftsOf(w) ?? 0) * (w.parallelUnits > 0 ? w.parallelUnits : 1)
  if (crews <= 0) return null

  let openDays = 0
  for (let d = 0; d < 7; d++) {
    const open = (w.dailyCapacity[d] ?? 0) > CLOSED_CAP_H
    if (open && openDays !== d) return null // trou dans la semaine → hors catalogue
    if (open) openDays++
  }
  if (openDays === 0) return null

  return SHIFT_CATALOG.find((s) => s.crews === crews && s.openDays === openDays) ?? null
}

/**
 * Capacité (h) d'un poste pour une semaine sous un schéma donné.
 *
 * `dayFactors` = facteur d'ouverture du calendrier (férié / fermeture) pour les
 * sept jours de CETTE semaine. Il multiplie TOUJOURS en dernier : un 2×8 le
 * 15 août reste fermé. Le plan est substitutif, le calendrier est multiplicatif —
 * les deux ne jouent pas au même étage.
 */
export function weeklyCapacityUnder(
  s: ShiftSchedule,
  w: Workstation,
  dayFactors: number[]
): number {
  const y = yieldFactor(w)
  let h = 0
  for (let d = 0; d < 7; d++) h += SHIFT_HOURS * s.shifts[d] * y * (dayFactors[d] ?? 1)
  return h
}

/** Équipes-jour réellement staffées sur la semaine (jours fermés retirés). */
export function weeklyCrewDaysUnder(s: ShiftSchedule, dayFactors: number[]): number {
  let n = 0
  for (let d = 0; d < 7; d++) if ((dayFactors[d] ?? 1) > 0) n += s.shifts[d]
  return n
}
