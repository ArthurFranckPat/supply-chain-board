import CapacityClosure from '#models/capacity_closure'
import CapacityHolidayOverride from '#models/capacity_holiday_override'
import { frenchHolidaysRange, type Holiday } from '#app/domain/holidays'
import {
  buildWorkingCalendar,
  type Closure,
  type WorkingCalendar,
} from '#app/domain/working_calendar'

/** Férié enrichi de son état actif/inactif (override utilisateur). */
export interface HolidayState extends Holiday {
  active: boolean
}

/**
 * Charge fériés (calculés + overrides) et fermetures (SQLite) pour construire
 * le calendrier d'ouverture consommé par le calcul de capacité — issue #37.
 *
 * Lecture locale, tables petites : pas de cache dédié.
 */
class CapacityCalendarService {
  /** Fériés FR d'une plage d'années, avec leur état actif (override appliqué). */
  async holidays(fromYear: number, toYear: number): Promise<HolidayState[]> {
    const base = frenchHolidaysRange(fromYear, toYear)
    const overrides = await CapacityHolidayOverride.all()
    const off = new Set(overrides.filter((o) => !o.active).map((o) => o.date))
    return base.map((h) => ({ ...h, active: !off.has(h.date) }))
  }

  async closures(): Promise<(Closure & { id: number; motif: string })[]> {
    const rows = await CapacityClosure.all()
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as Closure['scope'],
      code: r.code,
      from: r.dateFrom,
      to: r.dateTo,
      factor: r.factor,
      motif: r.motif,
    }))
  }

  /**
   * Jours totalement fermés à l'échelle usine (ISO `YYYY-MM-DD`) : fériés actifs
   * + fermetures globales à facteur 0. Consommé par le moteur CTP (décalage en
   * jours ouvrés, mode engageante) qui n'a pas de contexte poste.
   */
  async globalClosedDays(fromYear: number, toYear: number): Promise<Set<string>> {
    const [holidays, closures] = await Promise.all([
      this.holidays(fromYear, toYear),
      this.closures(),
    ])
    const closed = new Set(holidays.filter((h) => h.active).map((h) => h.date))
    for (const c of closures) {
      if (c.scope !== 'global' || c.factor > 0) continue
      const d = new Date(c.from)
      const end = new Date(c.to)
      while (d.getTime() <= end.getTime()) {
        closed.add(d.toISOString().slice(0, 10))
        d.setUTCDate(d.getUTCDate() + 1)
      }
    }
    return closed
  }

  /** Calendrier d'ouverture prêt à l'emploi pour la plage d'années. */
  async buildCalendar(fromYear: number, toYear: number): Promise<WorkingCalendar> {
    const [holidays, closures] = await Promise.all([
      this.holidays(fromYear, toYear),
      this.closures(),
    ])
    const closedHolidays = new Set(holidays.filter((h) => h.active).map((h) => h.date))
    return buildWorkingCalendar(closedHolidays, closures)
  }
}

export default new CapacityCalendarService()
