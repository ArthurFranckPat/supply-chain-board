import { type HttpContext } from '@adonisjs/core/http'
import { loadChargePayload } from '#services/load_payload_loader'
import {
  ChargeDetailBadRequest,
  loadChargeDetail,
  type ChargeDetailView,
  type ChargeGran,
} from '#services/charge_detail_loader'

export default class LoadController {
  /** GET /charge — page Inertia de projection de charge long terme. Cf. loadChargePayload. */
  async index(ctx: HttpContext) {
    const props = await loadChargePayload(ctx)
    return ctx.inertia.render('scheduler/load', props)
  }

  /**
   * GET /api/v1/planning/charge/detail — composition d'une barre du graphe
   * (poste × période). Cf. loadChargeDetail : mêmes entrées que l'agrégat,
   * filtrées au lieu d'être sommées.
   */
  async periodDetail({ request, response }: HttpContext) {
    const view = request.input('view') === 'commande' ? 'commande' : 'of'
    const gran = request.input('gran') === 'week' ? 'week' : 'month'
    try {
      const detail = await loadChargeDetail({
        start: (request.input('start') as string | undefined) || undefined,
        poste: String(request.input('poste') ?? ''),
        view: view as ChargeDetailView,
        gran: gran as ChargeGran,
        bucket: String(request.input('bucket') ?? ''),
        refresh: !!request.input('refresh'),
      })
      return response.json(detail)
    } catch (error) {
      // Paramètre invalide → 400 explicite. Servir un intervalle par défaut
      // afficherait une table plausible mais fausse.
      if (error instanceof ChargeDetailBadRequest) {
        return response.badRequest({ error: error.message })
      }
      throw error
    }
  }
}
