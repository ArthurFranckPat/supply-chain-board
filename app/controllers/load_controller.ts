import { type HttpContext } from '@adonisjs/core/http'
import { loadChargePayload } from '#services/load_payload_loader'
import {
  ChargeDetailBadRequest,
  loadChargeDetail,
  type ChargeDetailView,
  type ChargeGran,
} from '#services/charge_detail_loader'
import { LissageBadRequest, loadPlanLissage } from '#services/load_smoothing_builder'

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
        ofDate: request.input('ofDate') === 'end' ? 'end' : 'start',
        poste: String(request.input('poste') ?? ''),
        view: view as ChargeDetailView,
        gran: gran as ChargeGran,
        bucket: String(request.input('bucket') ?? ''),
        // Version du snapshot charge émise par le payload — aligne la table sur
        // la barre cliquée, snapshot X3 compris.
        version: (request.input('v') as string | undefined) || undefined,
        refresh: !!request.input('refresh'),
        applyDemandHorizon: request.input('applyDemandHorizon') !== '0',
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

  /**
   * GET /api/v1/planning/charge/lissage — plan de repositionnement de dates
   * pour UN poste, sur l'horizon de décision (3 semaines depuis `start`).
   *
   * Aucune écriture : le plan est une PROPOSITION. C'est l'écran qui applique,
   * déplacement par déplacement, via les overrides de ligne de commande
   * (`PATCH /order-lines/:order/:line`). Le séparer ainsi est volontaire — un
   * endpoint qui calculerait ET appliquerait ne laisserait jamais le
   * planificateur écarter une ligne du lot.
   *
   * Le calcul n'est PAS branché sur l'ouverture du panneau de détail : il
   * explose la nomenclature de toute la demande de la fenêtre pour borner
   * l'avance par la matière. On le déclenche sur demande explicite.
   */
  async smoothing({ request, response }: HttpContext) {
    const semaines = Number(request.input('semaines') ?? '')
    try {
      const plan = await loadPlanLissage({
        poste: String(request.input('poste') ?? ''),
        start: (request.input('start') as string | undefined) || undefined,
        semaines: Number.isFinite(semaines) && semaines > 0 ? semaines : undefined,
        force: !!request.input('refresh'),
      })
      return response.json(plan)
    } catch (error) {
      if (error instanceof LissageBadRequest) {
        return response.badRequest({ error: error.message })
      }
      throw error
    }
  }
}
