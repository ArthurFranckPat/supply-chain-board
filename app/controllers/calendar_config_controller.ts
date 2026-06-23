import { HttpContext } from '@adonisjs/core/http'
import CapacityClosure from '#models/capacity_closure'
import CapacityHolidayOverride from '#models/capacity_holiday_override'
import capacityCalendar from '#services/capacity_calendar_service'
import staticSync from '#services/static_sync_service'
import { atelierLabel } from '#app/domain/atelier'

/** Jour suivant une date ISO `YYYY-MM-DD`. */
const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Deux plages ISO incluses se chevauchent. */
const rangesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  aFrom <= bTo && aTo >= bFrom
/** Chevauchement OU adjacence (plages dos à dos → fusionnables). */
const rangesTouch = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  rangesOverlap(aFrom, aTo, bFrom, bTo) || nextDay(aTo) === bFrom || nextDay(bTo) === aFrom

/**
 * Page de configuration du calendrier usine (issue #37, design « Registre » V2).
 * Gère les jours fériés (activer/désactiver) et les fermetures par ligne.
 * Le calcul de capacité de /charge consomme directement ces données.
 */
export default class CalendarConfigController {
  /** GET /configuration/calendrier — page Inertia. */
  async index(ctx: HttpContext) {
    const yearParam = parseInt(ctx.request.input('year') ?? '') || new Date().getFullYear()

    const [holidays, closures, workstations] = await Promise.all([
      capacityCalendar.holidays(yearParam, yearParam),
      capacityCalendar.closures(),
      staticSync.readWorkstations().catch(() => []),
    ])

    // Postes (pour le sélecteur de scope) + ateliers distincts.
    const postes = workstations
      .map((w) => ({ code: w.code, label: w.description || w.code, atelier: w.stockLocation }))
      .sort((a, b) => a.code.localeCompare(b.code))
    const ateliers = [...new Set(workstations.map((w) => w.stockLocation).filter(Boolean))]
      .map((code) => ({ code, label: atelierLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return ctx.inertia.render('config/calendrier', {
      year: yearParam,
      holidays,
      closures,
      postes,
      ateliers,
    })
  }

  /** POST /api/v1/config/holidays/toggle — active/désactive un férié. */
  async toggleHoliday(ctx: HttpContext) {
    const date = String(ctx.request.input('date') ?? '').trim()
    const active = ctx.request.input('active') !== false && ctx.request.input('active') !== 'false'
    if (!date) return ctx.response.badRequest({ error: 'date requise' })
    await CapacityHolidayOverride.updateOrCreate({ date }, { date, active })
    return { ok: true, date, active }
  }

  /**
   * POST /api/v1/config/closures — crée une fermeture, avec fusion automatique des
   * chevauchements (issue #37) : si des fermetures existantes du même poste partagent
   * motif + capacité et chevauchent/jouxtent la nouvelle plage, elles sont fusionnées
   * en une seule (union des dates). `warn` signale un chevauchement résiduel de motif/
   * capacité différents (où le plus restrictif l'emporte au calcul).
   */
  async createClosure(ctx: HttpContext) {
    const r = ctx.request
    const scope = String(r.input('scope') ?? 'global')
    const inCode = String(r.input('code') ?? '').trim()
    const rawFrom = String(r.input('from') ?? '').trim()
    const rawTo = String(r.input('to') ?? rawFrom).trim()
    const motif = String(r.input('motif') ?? '').trim()
    const rawFactor = Number(r.input('factor') ?? 0)
    if (!rawFrom || !rawTo) return ctx.response.badRequest({ error: 'dates requises' })
    if (scope !== 'global' && !inCode) return ctx.response.badRequest({ error: 'code requis pour ce scope' })

    const code = scope === 'global' ? '' : inCode
    const factor = Number.isFinite(rawFactor) ? Math.max(0, Math.min(1, rawFactor)) : 0
    let from = rawFrom <= rawTo ? rawFrom : rawTo
    let to = rawFrom <= rawTo ? rawTo : rawFrom

    // Fermetures du même poste (mêmes scope+code) déjà saisies.
    const siblings = await CapacityClosure.query().where('scope', scope).where('code', code)

    // Fusion : mêmes motif+capacité ET plages qui se chevauchent ou se jouxtent.
    const mergeable = siblings.filter(
      (c) => c.motif === motif && c.factor === factor && rangesTouch(c.dateFrom, c.dateTo, from, to),
    )
    const removedIds: number[] = []
    for (const c of mergeable) {
      if (c.dateFrom < from) from = c.dateFrom
      if (c.dateTo > to) to = c.dateTo
      removedIds.push(c.id)
      await c.delete()
    }

    const row = await CapacityClosure.create({ scope, code, dateFrom: from, dateTo: to, motif, factor, createdAt: Date.now() })

    // Avertissement : chevauchement résiduel avec une fermeture de motif/capacité différents.
    const warn = siblings.some(
      (c) => !removedIds.includes(c.id) && rangesOverlap(c.dateFrom, c.dateTo, from, to) && (c.motif !== motif || c.factor !== factor),
    )

    return {
      ok: true,
      closure: { id: row.id, scope, code, from, to, motif, factor },
      removedIds,
      warn,
    }
  }

  /** DELETE /api/v1/config/closures/:id — supprime une fermeture. */
  async deleteClosure(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    const row = await CapacityClosure.find(id)
    if (row) await row.delete()
    return { ok: true }
  }
}
