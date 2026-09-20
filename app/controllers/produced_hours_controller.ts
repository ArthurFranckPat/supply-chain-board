import { type HttpContext } from '@adonisjs/core/http'
import { producedHoursLoader } from '#services/produced_hours_loader'
import { isoDay } from '#app/utils/dates'

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: isoDay(firstOfMonth),
    to: isoDay(now),
  }
}

export default class ProducedHoursController {
  /**
   * GET /heures-produites — Page Inertia de visualisation des heures produites par poste.
   */
  async index(ctx: HttpContext) {
    const defaultRange = getDefaultDateRange()
    const from = (ctx.request.input('from') as string) || defaultRange.from
    const to = (ctx.request.input('to') as string) || defaultRange.to

    const payload = await producedHoursLoader.loadPayload(from, to)
    return ctx.inertia.render('produced_hours/index', payload)
  }

  /**
   * GET /api/v1/heures-produites/summary — Données agrégées JSON pour changement dynamique de période.
   */
  async summary({ request, response }: HttpContext) {
    const defaultRange = getDefaultDateRange()
    const from = (request.input('from') as string) || defaultRange.from
    const to = (request.input('to') as string) || defaultRange.to

    try {
      const payload = await producedHoursLoader.loadPayload(from, to)
      return response.json(payload)
    } catch (error) {
      return response.internalServerError({
        error:
          error instanceof Error ? error.message : 'Erreur lors du chargement des heures produites',
      })
    }
  }

  /**
   * GET /api/v1/heures-produites/detail — Détail des pointages d'un poste spécifique (drill-down).
   */
  async detail({ request, response }: HttpContext) {
    const poste = (request.input('poste') as string)?.trim()
    if (!poste) {
      return response.badRequest({ error: 'Paramètre poste requis' })
    }

    const defaultRange = getDefaultDateRange()
    const from = (request.input('from') as string) || defaultRange.from
    const to = (request.input('to') as string) || defaultRange.to

    try {
      const detail = await producedHoursLoader.loadWorkstationDetail(poste, from, to)
      return response.json(detail)
    } catch (error) {
      return response.internalServerError({
        error:
          error instanceof Error ? error.message : 'Erreur lors du chargement du détail du poste',
      })
    }
  }
}
