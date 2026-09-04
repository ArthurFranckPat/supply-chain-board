import { type HttpContext } from '@adonisjs/core/http'
import {
  MaterialBadRequest,
  loadMaterialDetailData,
  loadMaterialPayloadData,
} from '#services/material_plan_loader'

/**
 * Plan d'approvisionnement (lot 1) : besoins matières ventilés ferme /
 * prévision par article composant. Page coquille + 2 endpoints JSON —
 * le calcul lourd est servi en fetch client (payload volumineux).
 */
export default class ApprovisionnementController {
  /** GET /approvisionnement — page Inertia (cf. lot 1 frontend). */
  async index(ctx: HttpContext) {
    return ctx.inertia.render('approvisionnement', {})
  }

  /** GET /api/v1/planning/material-plan?from=&to=&gran=jour|semaine|mois */
  async payload({ request, response }: HttpContext) {
    try {
      const data = await loadMaterialPayloadData({
        from: String(request.input('from') ?? ''),
        to: String(request.input('to') ?? ''),
        gran: String(request.input('gran') ?? ''),
        force: !!request.input('refresh'),
      })
      return response.json(data)
    } catch (error) {
      // Paramètre invalide → 400 explicite, jamais de tableau dégénéré.
      if (error instanceof MaterialBadRequest) {
        return response.badRequest({ error: (error as Error).message })
      }
      throw error
    }
  }

  /** GET /api/v1/planning/material-plan/detail?v=&article=&from=&to= */
  async detail({ request, response }: HttpContext) {
    const data = await loadMaterialDetailData(
      String(request.input('v') ?? ''),
      String(request.input('article') ?? ''),
      String(request.input('from') ?? ''),
      String(request.input('to') ?? '')
    )
    if (!data) {
      return response.notFound({
        error: 'Snapshot expiré — rechargez le plan puis rouvrez le détail',
      })
    }
    return response.json(data)
  }
}
