import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { RetardRepository, type RetardChargeKpi } from '#repositories/retard_repository'
import { OtdRepository, resolveOtdPeriods, type OtdKpi, type OtdMode } from '#repositories/otd_repository'
import {
  ExpeditionRepository,
  CAMION_GAP_MINUTES,
  type ExpeditionKpi,
} from '#repositories/expedition_repository'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Page d'accueil par défaut post-login.
 *
 * Même motif que /suivi : la coquille Inertia est rendue instantanément (aucun calcul X3),
 * les KPI (calcul lourd) sont chargés en différé via deux endpoints séparés :
 *   - /api/v1/dashboard/kpis        → charge en retard (stable, rechargé uniquement au refresh)
 *   - /api/v1/dashboard/otd         → OTD (volatile : mode + plage date changent côté client)
 *   - /api/v1/dashboard/expeditions → expéditions (volatile : plage date change côté client, #44)
 */
export default class DashboardController {
  /** GET / — coquille du tableau de bord. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) || new Date().toISOString().slice(0, 10)
    return ctx.inertia.render('dashboard', {
      referenceDate,
      kpisHref: `/api/v1/dashboard/kpis?referenceDate=${encodeURIComponent(referenceDate)}`,
      otdHref: `/api/v1/dashboard/otd?referenceDate=${encodeURIComponent(referenceDate)}`,
      expeditionsHref: `/api/v1/dashboard/expeditions?referenceDate=${encodeURIComponent(referenceDate)}`,
    })
  }

  /** GET /api/v1/dashboard/kpis — charge en retard (1 SQL ORDERS + gamme SQLite). */
  async kpis(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    let retardCharge: RetardChargeKpi = { totalHeures: 0, nbLignes: 0, postes: [], lignes: [] }
    let x3Error: string | null = null

    try {
      retardCharge = await new RetardRepository().getRetardKpi(refDate, RETARD_LOOKBACK_DAYS)
    } catch (e) {
      logger.error({ err: e }, '[dashboard] kpis — échec chargement retard X3')
      x3Error = 'Données X3 indisponibles — KPI momentanément incalculable.'
    }

    return { retardCharge, x3Error, referenceDate: refDate.toISOString().slice(0, 10) }
  }

  /** GET /api/v1/dashboard/otd — OTD (volatile : mode + plage changent côté client). */
  async otd(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const rawMode = ctx.request.input('otdMode')
    const otdMode: OtdMode = rawMode === 'acceptee' ? 'acceptee' : 'demandee'

    const otdFromParam = ctx.request.input('otdFrom')
    const otdToParam = ctx.request.input('otdTo')
    let periods: Array<{ from: Date; to: Date; label: string }>

    if (otdFromParam && otdToParam) {
      const from = new Date(otdFromParam)
      const to = new Date(otdToParam)
      const fmtD = (d: Date) =>
        `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const label = otdFromParam === otdToParam ? fmtD(from) : `${fmtD(from)} → ${fmtD(to)}`
      periods = [{ from, to, label }]
    } else {
      periods = resolveOtdPeriods(refDate)
    }

    let otd: OtdKpi[] = []
    let x3Error: string | null = null
    const repo = new OtdRepository()

    const results = await Promise.allSettled(
      periods.map((p) => repo.getOtd(p.from, p.to, p.label, otdMode)),
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        otd.push(r.value)
      } else {
        logger.error({ err: r.reason }, '[dashboard] otd — échec chargement X3')
        if (!x3Error) x3Error = 'Données X3 indisponibles — OTD momentanément incalculable.'
      }
    }

    return { otd, x3Error }
  }

  /** GET /api/v1/dashboard/expeditions — expéditions client (issue #44). Défaut : J-1. */
  async expeditions(ctx: HttpContext) {
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
    const gapMinutes = Number.isFinite(gapMinParam) && gapMinParam > 0 ? gapMinParam : CAMION_GAP_MINUTES

    let expeditions: ExpeditionKpi = { label, totalUc: 0, nbCamions: 0, gapMinutes, camions: [] }
    let x3Error: string | null = null

    try {
      expeditions = await new ExpeditionRepository().getExpeditions(from, to, label, gapMinutes)
    } catch (e) {
      logger.error({ err: e }, '[dashboard] expeditions — échec chargement X3')
      x3Error = 'Données X3 indisponibles — expéditions momentanément incalculables.'
    }

    return { expeditions, x3Error }
  }
}
