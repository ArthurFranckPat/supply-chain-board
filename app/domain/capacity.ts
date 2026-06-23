import type { Workstation } from '#app/domain/models/workstation'

/**
 * Capacité de production d'un poste de charge (issue #35).
 *
 * Capacité **nette** d'un jour :
 *   cap_jour = DAYCAP[jourSemaine] × WSTNBR × EFF% × USE% × (1 − SHR%)
 * Capacité **théorique** (sans rendement) : DAYCAP[jourSemaine] × WSTNBR.
 *
 * Validation `PP_830` (CFA, WSTNBR=2, EFF=90 %) : 7,5 × 2 × 0,90 = 13,5 h/j → ~293 h/mois.
 *
 * Les pourcentages valent 0 quand X3 ne les renseigne pas : on retombe alors sur
 * 100 % (efficience/utilisation neutres) plutôt que d'annuler la capacité.
 */

const DAY_MS = 86_400_000

/** Index jour de la semaine, 0 = Lundi … 6 = Dimanche (aligné sur DAYCAP_0..6). */
const dayIndex = (d: Date): number => (d.getDay() + 6) % 7

/** Multiplicateur de rendement (EFF × USE × (1 − SHR)), pourcentages non renseignés → neutres. */
const yieldFactor = (w: Workstation): number => {
  const eff = w.efficiency > 0 ? w.efficiency : 100
  const use = w.utilization > 0 ? w.utilization : 100
  const shr = w.scrap > 0 ? w.scrap : 0
  return (eff / 100) * (use / 100) * (1 - shr / 100)
}

const units = (w: Workstation): number => (w.parallelUnits > 0 ? w.parallelUnits : 1)

/** Capacité (h) d'un poste pour une date donnée. */
export function capDay(w: Workstation, date: Date, theoretical = false): number {
  const base = w.dailyCapacity[dayIndex(date)] ?? 0
  const cap = base * units(w)
  return theoretical ? cap : cap * yieldFactor(w)
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
