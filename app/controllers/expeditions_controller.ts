import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  ExpeditionRepository,
  CAMION_GAP_MINUTES,
  MAX_PALETTES_CAMION,
  CAMION_CAPACITE_PALETTES,
  type ExpeditionKpi,
} from '#repositories/expedition_repository'
import {
  loadExpeditionForecast,
  FORECAST_DEFAULT_HORIZON,
} from '#services/expedition_forecast_loader'

/**
 * Page « Expéditions » (issue #44 + #104) — rétroviseur STOJOU + prévision de charge
 * transport depuis l'ordonnancement.
 *
 * Même motif que /suivi : coquille Inertia instantanée, calculs lourds en différé
 * via /api/v1/expeditions/rows (passé) et /api/v1/expeditions/forecast (futur).
 */
export default class ExpeditionsController {
  /** GET /expeditions — coquille de la page. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) ||
      new Date().toISOString().slice(0, 10)
    const daysParam = Number.parseInt(
      ctx.request.input('days', String(FORECAST_DEFAULT_HORIZON)),
      10
    )
    const forecastDays =
      Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90
        ? daysParam
        : FORECAST_DEFAULT_HORIZON

    return ctx.inertia.render('expeditions', {
      referenceDate,
      rowsHref: `/api/v1/expeditions/rows?referenceDate=${encodeURIComponent(referenceDate)}`,
      forecastHref: `/api/v1/expeditions/forecast?days=${forecastDays}`,
      defaultGapMinutes: CAMION_GAP_MINUTES,
      maxPalettesCamion: MAX_PALETTES_CAMION,
      forecastDefaultDays: forecastDays,
    })
  }

  /** GET /api/v1/expeditions/rows — expéditions client (calcul lourd différé). Défaut : J-1. */
  async rows(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const expFromParam = ctx.request.input('expFrom')
    const expToParam = ctx.request.input('expTo')
    const fmtD = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`

    let from: Date
    let to: Date
    let label: string

    if (expFromParam && expToParam) {
      from = new Date(expFromParam)
      to = new Date(expToParam)
      label = expFromParam === expToParam ? fmtD(from) : `${fmtD(from)} → ${fmtD(to)}`
    } else {
      const y = refDate.getUTCFullYear()
      const m = refDate.getUTCMonth()
      const dom = refDate.getUTCDate()
      from = new Date(Date.UTC(y, m, dom - 1))
      to = from
      label = 'J-1'
    }

    // Tolérance de regroupement « camion » surchargeable par requête (calibration VPN, #44).
    const gapMinParam = Number.parseInt(ctx.request.input('expGapMin'), 10)
    const gapMinutes =
      Number.isFinite(gapMinParam) && gapMinParam > 0 ? gapMinParam : CAMION_GAP_MINUTES

    let expeditions: ExpeditionKpi = {
      label,
      totalUc: 0,
      nbCamions: 0,
      gapMinutes,
      maxPalettesCamion: MAX_PALETTES_CAMION,
      camionCapacitePalettes: CAMION_CAPACITE_PALETTES,
      camions: [],
    }
    let x3Error: string | null = null

    try {
      expeditions = await new ExpeditionRepository().getExpeditions(from, to, label, gapMinutes)
    } catch (e) {
      logger.error({ err: e }, '[expeditions] rows — échec chargement X3')
      x3Error = 'Données X3 indisponibles — expéditions momentanément incalculables.'
    }

    return { expeditions, x3Error }
  }

  /** GET /api/v1/expeditions/forecast — prévision charge transport J→J+n (issue #104). */
  async forecast(ctx: HttpContext) {
    const daysParam = Number.parseInt(
      ctx.request.input('days', String(FORECAST_DEFAULT_HORIZON)),
      10
    )
    const days =
      Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90
        ? daysParam
        : FORECAST_DEFAULT_HORIZON
    const force = !!ctx.request.input('refresh')
    const startParam = ctx.request.input('start') as string | undefined
    const start = startParam ? new Date(startParam) : undefined

    return loadExpeditionForecast({ start, days, force })
  }
}
