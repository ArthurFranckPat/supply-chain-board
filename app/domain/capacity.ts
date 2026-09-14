import type { Workstation } from '#app/domain/models/workstation'

/**
 * Capacité de production d'un poste de charge (issue #35).
 *
 * ── Base horaire : l'ÉQUIPE, pas le DAYCAP X3 ───────────────────────────────
 * Une équipe vaut `SHIFT_HOURS` heures effectives (décision métier). X3 ne stocke
 * pas le nombre d'équipes : le paramétrage l'exprime de DEUX façons, et le dossier
 * AE1 utilise les deux sans jamais les combiner (vérifié : aucun poste n'a à la fois
 * un schéma multi-équipes et WSTNBR > 1) :
 *
 *   1. par le SCHÉMA HORAIRE (`TABWEEDIA`, code `TWD_0`) : `2/8` = 14,34 h/j ;
 *   2. par le NOMBRE D'EXEMPLAIRES (`WSTNBR_0`) : `PP_830` = CFA 7,5 h/j × 2.
 *
 * Les deux disent la même chose côté capacité — deux équipes qui se succèdent
 * (matin/soir), PAS deux ressources parallèles. `PP_830` en est l'exemple : X3 le
 * déclare à 2 exemplaires, l'atelier le fait tourner en 2×8 sur une seule ligne.
 *
 * On ramène donc tout à un nombre d'équipes, puis on multiplie par la base 7 h :
 *
 *   cap_jour_théorique = SHIFT_HOURS × équipes(schéma) × WSTNBR
 *   cap_jour_nette     = cap_jour_théorique × EFF% × USE% × (1 − SHR%)
 *
 * `PP_830` : 7 × 1 × 2 = 14 h théoriques → × 0,90 = 12,6 h/j nettes.
 * `PP_153` (schéma 2/8, 1 exemplaire) : 7 × 2 × 1 = 14 h → × 0,80 = 11,2 h/j.
 *
 * ── Schémas non normalisés ──────────────────────────────────────────────────
 * Un schéma absent de `SHIFTS_BY_SCHEDULE` n'est PAS une journée d'équipe standard
 * (feu continu 24 h, semaine de 4 jours, horaires variables par jour…). Sa capacité
 * reste lue telle quelle dans `DAYCAP` : mieux vaut la valeur X3 qu'un arrondi en
 * équipes qui inventerait ou supprimerait des heures. Un nouveau schéma ajouté dans
 * X3 tombe donc dans ce repli, jamais dans un calcul faux en silence.
 *
 * Les pourcentages valent 0 quand X3 ne les renseigne pas : on retombe alors sur
 * 100 % (efficience/utilisation neutres) plutôt que d'annuler la capacité.
 */

const DAY_MS = 86_400_000

/**
 * Durée effective d'une équipe, en heures. Base métier — délibérément PAS le DAYCAP
 * X3 (7,5 h en CFA, 7,07 h en 1/8) : ces valeurs incluent des temps qui ne sont pas
 * produits. Le rendement (EFF/USE/SHR) s'applique par-dessus.
 */
export const SHIFT_HOURS = 7

/**
 * Nombre d'équipes par jour ouvré, par code de schéma horaire X3 (`TABWEEDIA.TWD_0`).
 * Ne lister QUE les schémas qui sont de vraies journées d'équipe : tout autre code
 * retombe sur `DAYCAP` (cf. en-tête). Les codes sont ceux du dossier AE1.
 */
export const SHIFTS_BY_SCHEDULE: Record<string, number> = {
  'CFA': 1, // journée standard
  '1/8': 1, // une équipe
  '2/8': 2, // deux équipes (matin + soir)
}

/** Index jour de la semaine, 0 = Lundi … 6 = Dimanche (aligné sur DAYCAP_0..6). */
const dayIndex = (d: Date): number => (d.getDay() + 6) % 7

/** Multiplicateur de rendement (EFF × USE × (1 − SHR)), pourcentages non renseignés → neutres. */
const yieldFactor = (w: Workstation): number => {
  const eff = w.efficiency > 0 ? w.efficiency : 100
  const use = w.utilization > 0 ? w.utilization : 100
  const shr = w.scrap > 0 ? w.scrap : 0
  return (eff / 100) * (use / 100) * (1 - shr / 100)
}

/**
 * Convertit une charge standard en heures réellement consommées par la ligne.
 * Une efficience de 90 % transforme ainsi 10 h standard en 11,11 h de charge.
 * Une valeur absente ou nulle reste neutre, comme pour la capacité.
 */
export function chargeHoursWithEfficiency(hours: number, w: Workstation | undefined): number {
  if (!w || w.efficiency <= 0) return hours
  return hours / (w.efficiency / 100)
}

const units = (w: Workstation): number => (w.parallelUnits > 0 ? w.parallelUnits : 1)

/**
 * Sentinelle X3 « fermé » : `DAYCAP` vaut `0.01` (et non 0) sur les jours non
 * travaillés — présent sur TOUS les postes le samedi dans la réplique, et même un
 * vendredi pour `PP_001`. Toute comparaison d'ouverture doit porter sur ce seuil,
 * pas sur le jour de la semaine : `PP_078` est ouvert 24 h le samedi.
 */
export const CLOSED_CAP_H = 0.01

/**
 * Équipes par jour ouvré du poste, ou `null` si son schéma n'est pas une journée
 * d'équipe normalisable (le calcul retombe alors sur `DAYCAP`).
 */
export function shiftsOf(w: Workstation): number | null {
  return SHIFTS_BY_SCHEDULE[w.scheduleCode.trim()] ?? null
}

/** Capacité (h) du poste pour un index de jour de semaine (0 = Lundi). */
function capDayIndex(w: Workstation, idx: number, theoretical: boolean): number {
  const daycap = w.dailyCapacity[idx] ?? 0
  // Jour fermé : la sentinelle 0,01 vaut zéro, elle ne doit pas se voir multipliée
  // par les exemplaires et le rendement pour ressortir au-dessus du seuil (ce que
  // faisait l'ancien calcul : 0,01 × 2 × 0,9 = 0,018 > CLOSED_CAP_H, samedi « ouvert »).
  if (daycap <= CLOSED_CAP_H) return 0

  const shifts = shiftsOf(w)
  const base = shifts === null ? daycap : SHIFT_HOURS * shifts
  const cap = base * units(w)
  return theoretical ? cap : cap * yieldFactor(w)
}

/** Capacité (h) d'un poste pour une date donnée. */
export function capDay(w: Workstation, date: Date, theoretical = false): number {
  return capDayIndex(w, dayIndex(date), theoretical)
}

/** Le poste est-il ouvert ce jour (facteur calendrier > 0 et capacité non sentinelle) ? */
export function isOpenDay(w: Workstation, date: Date, factor: number): boolean {
  return factor > 0 && capDay(w, date) > CLOSED_CAP_H
}

/**
 * Capacité (h) d'une semaine type du poste — somme des 7 jours du schéma, sans
 * calendrier (ni fériés ni fermetures). Sert aux jauges de saturation (séquenceur,
 * panneau d'engagement) qui comparent un engagement à un rythme hebdomadaire.
 * Null si le poste n'a aucun jour ouvert.
 */
export function weeklyCapacity(w: Workstation, theoretical = false): number | null {
  let total = 0
  for (let i = 0; i < 7; i++) total += capDayIndex(w, i, theoretical)
  if (total <= 0) return null
  return Math.round(total * 100) / 100
}

/**
 * Capacité (h) cumulée d'un poste sur l'intervalle `[from, to]` (bornes incluses,
 * à la maille jour). Net par défaut.
 */
export function capacityPeriod(w: Workstation, from: Date, to: Date, theoretical = false): number {
  let total = 0
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    total += capDay(w, new Date(t), theoretical)
  }
  return total
}
