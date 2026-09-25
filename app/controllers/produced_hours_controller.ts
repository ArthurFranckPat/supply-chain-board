import { type HttpContext } from '@adonisjs/core/http'
import { producedHoursLoader, type OrderDateMode } from '#services/produced_hours_loader'
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
   * GET /heures-produites — Page Inertia de visualisation des heures produites ou commandes par poste.
   */
  async index(ctx: HttpContext) {
    const defaultRange = getDefaultDateRange()
    const from = (ctx.request.input('from') as string) || defaultRange.from
    const to = (ctx.request.input('to') as string) || defaultRange.to
    const view = ((ctx.request.input('view') as string) || 'heures') as 'heures' | 'commandes'
    const dateMode = ((ctx.request.input('dateMode') as string) || 'demandee') as OrderDateMode

    if (view === 'commandes') {
      const ordersPayload = await producedHoursLoader.loadOrdersPayload(from, to, dateMode)
      return ctx.inertia.render('produced_hours/index', {
        ...ordersPayload,
        initialView: 'commandes',
        initialDateMode: dateMode,
        ordersPayload,
        hoursPayload: null,
      })
    }

    const article = (ctx.request.input('article') as string) || undefined
    const hoursPayload = await producedHoursLoader.loadPayload(from, to, article)
    return ctx.inertia.render('produced_hours/index', {
      ...hoursPayload,
      initialView: 'heures',
      initialDateMode: dateMode,
      hoursPayload,
      ordersPayload: null,
    })
  }

  /**
   * GET /api/v1/heures-produites/summary — Données agrégées JSON pour changement dynamique de période.
   */
  async summary({ request, response }: HttpContext) {
    const defaultRange = getDefaultDateRange()
    const from = (request.input('from') as string) || defaultRange.from
    const to = (request.input('to') as string) || defaultRange.to
    const view = (request.input('view') as string) || 'heures'
    const dateMode = (request.input('dateMode') as OrderDateMode) || 'demandee'

    try {
      if (view === 'commandes') {
        const payload = await producedHoursLoader.loadOrdersPayload(from, to, dateMode)
        return response.json(payload)
      }
      const article = (request.input('article') as string) || undefined
      const payload = await producedHoursLoader.loadPayload(from, to, article)
      return response.json(payload)
    } catch (error) {
      return response.internalServerError({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement des données',
      })
    }
  }

  /**
   * GET /api/v1/heures-produites/orders-summary — Données agrégées JSON des commandes.
   */
  async ordersSummary({ request, response }: HttpContext) {
    const defaultRange = getDefaultDateRange()
    const from = (request.input('from') as string) || defaultRange.from
    const to = (request.input('to') as string) || defaultRange.to
    const dateMode = (request.input('dateMode') as OrderDateMode) || 'demandee'

    try {
      const payload = await producedHoursLoader.loadOrdersPayload(from, to, dateMode)
      return response.json(payload)
    } catch (error) {
      return response.internalServerError({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement des commandes',
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
    const article = (request.input('article') as string) || undefined

    try {
      const detail = await producedHoursLoader.loadWorkstationDetail(poste, from, to, article)
      return response.json(detail)
    } catch (error) {
      return response.internalServerError({
        error:
          error instanceof Error ? error.message : 'Erreur lors du chargement du détail du poste',
      })
    }
  }

  /**
   * GET /api/v1/heures-produites/orders-detail — Détail des commandes d'une ligne d'assemblage final (drill-down).
   */
  async ordersDetail({ request, response }: HttpContext) {
    const poste = (request.input('poste') as string)?.trim()
    if (!poste) {
      return response.badRequest({ error: 'Paramètre poste requis' })
    }

    const defaultRange = getDefaultDateRange()
    const from = (request.input('from') as string) || defaultRange.from
    const to = (request.input('to') as string) || defaultRange.to
    const dateMode = (request.input('dateMode') as OrderDateMode) || 'demandee'

    try {
      const detail = await producedHoursLoader.loadWorkstationOrdersDetail(
        poste,
        from,
        to,
        dateMode
      )
      return response.json(detail)
    } catch (error) {
      return response.internalServerError({
        error:
          error instanceof Error
            ? error.message
            : 'Erreur lors du chargement du détail des commandes du poste',
      })
    }
  }
}
