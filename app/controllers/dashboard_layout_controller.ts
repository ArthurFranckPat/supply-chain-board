import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { updateDashboardLayoutValidator } from '#validators/dashboard_layout'
import type { DashboardLayout } from '#types/dashboard_layout'

/**
 * Persistance du layout du tableau de bord (feature KPI personnalisables).
 *
 * Le layout est lu au montage de la page via la prop Inertia `layout` (calculée
 * par `DashboardController.index`), puis sauvegardé ici à chaque mutation
 * côté client (déplacez / redimensionnez / masquez un KPI → PATCH debounce).
 */
export default class DashboardLayoutController {
  /** PATCH /api/v1/user/dashboard-layout — sauvegarde le layout de l'utilisateur. */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateDashboardLayoutValidator)

    const user = ctx.auth.user
    if (!user) {
      return ctx.response.unauthorized({ error: 'Non authentifié' })
    }

    // On re-normalise côté serveur (complétude + dédoublonnage) avant de persister,
    // puis on renvoie le layout canonique pour que le client reste synchronisé.
    user.setDashboardLayout(payload as unknown as DashboardLayout)
    try {
      await user.save()
    } catch (e) {
      logger.error({ err: e }, '[dashboard_layout] update — échec save user')
      return ctx.response.internalServerError({ error: 'Sauvegarde impossible' })
    }

    return { ok: true, layout: user.getDashboardLayout() }
  }
}
