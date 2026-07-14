import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { RetardRepository, type RetardChargeKpi } from '#repositories/retard_repository'
import {
  OtdRepository,
  resolveOtdPeriods,
  type OtdKpi,
  type OtdMode,
} from '#repositories/otd_repository'
import {
  defaultStockRange,
  type StockValuationKpi,
  type StockGrain,
} from '#repositories/stock_valuation_repository'
import boardDataset from '#services/board_dataset'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Page d'accueil par défaut post-login.
 *
 * Même motif que /suivi : la coquille Inertia est rendue instantanément (aucun calcul X3),
 * les KPI (calcul lourd) sont chargés en différé via trois endpoints séparés :
 *   - /api/v1/dashboard/kpis  → charge en retard (stable, rechargé uniquement au refresh)
 *   - /api/v1/dashboard/otd   → OTD (volatile : mode + plage date changent côté client)
 *   - /api/v1/dashboard/stock → valorisation du stock sur 12 mois (AE1)
 *
 * Les expéditions (issue #44) vivent désormais dans leur propre onglet dédié
 * (/expeditions, ExpeditionsController) — retiré du dashboard car une carte résumée
 * ne suffisait pas à l'usage opérationnel (vérification camion par camion).
 */
export default class DashboardController {
  /** GET / — coquille du tableau de bord. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) ||
      new Date().toISOString().slice(0, 10)
    return ctx.inertia.render('dashboard', {
      referenceDate,
      kpisHref: `/api/v1/dashboard/kpis?referenceDate=${encodeURIComponent(referenceDate)}`,
      otdHref: `/api/v1/dashboard/otd?referenceDate=${encodeURIComponent(referenceDate)}`,
      stockHref: `/api/v1/dashboard/stock`,
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

    const client = (ctx.request.input('client') as string | undefined)?.trim() || ''

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
      periods.map((p) => repo.getOtd(p.from, p.to, p.label, otdMode, client || undefined))
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

  /** GET /api/v1/dashboard/stock — valorisation du stock sur une plage (AE1).
   *  Cache SWR global via boardDataset (7 appels SOAP → 1/2min pour toute l'app). */
  async stockValuation(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate as string) : new Date()
    const safeRef = Number.isNaN(refDate.getTime()) ? new Date() : refDate

    const rawGrain = ctx.request.input('stockGrain')
    const grain: StockGrain = rawGrain === 'semaine' ? 'semaine' : 'mois'

    const fromParam = ctx.request.input('stockFrom')
    const toParam = ctx.request.input('stockTo')
    // Résout la plage concrète (défaut = 12 périodes glissantes) pour que la clé
    // de cache soit stable, même si l'utilisateur n'a pas fourni de plage.
    let from: Date
    let to: Date
    if (fromParam && toParam) {
      const f = new Date(fromParam as string)
      const t = new Date(toParam as string)
      // Retombe sur la plage par défaut si les dates sont invalides.
      const range = Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())
        ? defaultStockRange(grain, safeRef)
        : { from: f, to: t }
      from = range.from
      to = range.to
    } else {
      const range = defaultStockRange(grain, safeRef)
      from = range.from
      to = range.to
    }

    let stockValuation: StockValuationKpi = {
      grain,
      series: [],
      totalActuel: 0,
      totalDebut: 0,
      deltaPct: 0,
      categories: [],
      articles: [],
      nbArticles: 0,
    }
    let x3Error: string | null = null

    try {
      stockValuation = await boardDataset.getStockValuation(grain, from, to, safeRef)
    } catch (e) {
      logger.error({ err: e }, '[dashboard] stock — échec chargement valorisation X3')
      x3Error = 'Données X3 indisponibles — valorisation momentanément incalculable.'
    }

    return { stockValuation, x3Error }
  }
}
