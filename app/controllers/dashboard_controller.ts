import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { SuiviService, reloadSuiviContext, type RetardChargeKpi } from '#services/suivi_service'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Page d'accueil par défaut post-login.
 *
 * Même motif que /suivi : la coquille Inertia est rendue instantanément (aucun calcul X3),
 * les KPI (calcul lourd : assignation des statuts + charge gamme) sont chargés en différé
 * côté client via fetch JSON sur `kpisHref`.
 */
export default class DashboardController {
  /** GET / — coquille du tableau de bord. */
  async index(ctx: HttpContext) {
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) || new Date().toISOString().slice(0, 10)
    return ctx.inertia.render('dashboard', {
      referenceDate,
      kpisHref: `/api/v1/dashboard/kpis?referenceDate=${encodeURIComponent(referenceDate)}`,
    })
  }

  /**
   * GET /api/v1/dashboard/kpis — KPI du tableau de bord (calcul lourd différé).
   * KPI #1 (issue #38) : charge (h) des lignes de commande en RETARD_PROD, par poste.
   */
  async kpis(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    if (ctx.request.input('refresh')) await reloadSuiviContext()

    let retardCharge: RetardChargeKpi = { totalHeures: 0, nbLignes: 0, postes: [] }
    let x3Error: string | null = null

    try {
      retardCharge = await new SuiviService().retardChargeKpi(refDate)
    } catch (e) {
      // L'erreur X3 (SOAP via curl) contient des creds basic-auth → jamais renvoyée au client.
      logger.error({ err: e }, '[dashboard] kpis — échec chargement X3')
      x3Error = 'Données X3 indisponibles — KPI momentanément incalculable.'
    }

    return {
      retardCharge,
      x3Error,
      referenceDate: refDate.toISOString().slice(0, 10),
    }
  }
}
