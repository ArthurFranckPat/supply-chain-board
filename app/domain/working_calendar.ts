import type { Workstation } from '#app/domain/models/workstation'

/**
 * Calendrier d'ouverture (issue #37) : combine jours fériés actifs + fermetures
 * saisies (par poste / atelier / global) en un facteur d'ouverture [0..1] par
 * poste et par date, multiplié à la capacité brute du jour.
 *
 * 0 = fermé · 0.5 = demi-journée · 1 = ouvert normal.
 */

export type ClosureScope = 'global' | 'wst' | 'stoloc'

export interface Closure {
  scope: ClosureScope
  /** WST ou STOLOC selon le scope (ignoré si global). */
  code: string
  /** Bornes ISO incluses `YYYY-MM-DD`. */
  from: string
  to: string
  factor: number
}

export interface WorkingCalendar {
  /** Facteur d'ouverture d'un poste à une date ISO (le plus restrictif l'emporte). */
  factor(w: Workstation, isoDate: string): number
}

const matches = (c: Closure, w: Workstation): boolean =>
  c.scope === 'global' ||
  (c.scope === 'wst' && c.code === w.code) ||
  (c.scope === 'stoloc' && c.code === w.stockLocation)

/**
 * @param closedHolidays Dates ISO des fériés *actifs* (chômés) → facteur 0.
 * @param closures       Fermetures saisies.
 */
export function buildWorkingCalendar(
  closedHolidays: Set<string>,
  closures: Closure[]
): WorkingCalendar {
  return {
    factor(w, isoDate) {
      let f = closedHolidays.has(isoDate) ? 0 : 1
      if (f === 0) return 0
      for (const c of closures) {
        if (isoDate < c.from || isoDate > c.to || !matches(c, w)) continue
        f = Math.min(f, c.factor)
      }
      return f
    },
  }
}

/** Calendrier neutre (tout ouvert) — fallback quand rien n'est configuré. */
export const ALWAYS_OPEN: WorkingCalendar = { factor: () => 1 }
