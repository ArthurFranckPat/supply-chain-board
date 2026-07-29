import type { HttpContext } from '@adonisjs/core/http'
import { loadControleProdData } from '#services/controle_prod_loader'

/**
 * Page « Contrôle prod » (issue #95) — OF dont la déclaration PF dépasse le
 * pointage atelier. Shell Inertia instantané ; payload X3 en différé JSON.
 */
export default class ControleProdController {
  /** GET /controle-prod — coquille Inertia. */
  async index(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    return ctx.inertia.render('scheduler/controle-prod', {
      rowsHref: `/api/v1/planning/controle-prod${force ? '?refresh=1' : ''}`,
    })
  }

  /** GET /api/v1/planning/controle-prod — JSON (calcul lourd). */
  async rows(ctx: HttpContext) {
    const force = !!ctx.request.input('refresh')
    return loadControleProdData(force)
  }
}
