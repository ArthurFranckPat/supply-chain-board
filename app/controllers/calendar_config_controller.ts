import { HttpContext } from '@adonisjs/core/http'
import CapacityClosure from '#models/capacity_closure'
import CapacityHolidayOverride from '#models/capacity_holiday_override'
import capacityCalendar from '#services/capacity_calendar_service'
import staticSync from '#services/static_sync_service'
import { atelierLabel } from '#app/domain/atelier'

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

  /** POST /api/v1/config/closures — crée une fermeture. */
  async createClosure(ctx: HttpContext) {
    const r = ctx.request
    const scope = String(r.input('scope') ?? 'global')
    const code = String(r.input('code') ?? '').trim()
    const from = String(r.input('from') ?? '').trim()
    const to = String(r.input('to') ?? from).trim()
    const motif = String(r.input('motif') ?? '').trim()
    const factor = Number(r.input('factor') ?? 0)
    if (!from || !to) return ctx.response.badRequest({ error: 'dates requises' })
    if (scope !== 'global' && !code) return ctx.response.badRequest({ error: 'code requis pour ce scope' })
    const row = await CapacityClosure.create({
      scope,
      code: scope === 'global' ? '' : code,
      dateFrom: from <= to ? from : to,
      dateTo: from <= to ? to : from,
      motif,
      factor: Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 0,
      createdAt: Date.now(),
    })
    return { ok: true, id: row.id }
  }

  /** DELETE /api/v1/config/closures/:id — supprime une fermeture. */
  async deleteClosure(ctx: HttpContext) {
    const id = Number(ctx.params.id)
    const row = await CapacityClosure.find(id)
    if (row) await row.delete()
    return { ok: true }
  }
}
