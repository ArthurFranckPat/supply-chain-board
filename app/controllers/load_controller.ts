import { type HttpContext } from '@adonisjs/core/http'
import { loadChargePayload } from '#services/load_payload_loader'
import {
  ChargeDetailBadRequest,
  loadChargeDetail,
  type ChargeDetailView,
  type ChargeGran,
} from '#services/charge_detail_loader'
import {
  ChargeExportBadRequest,
  chargeExportCsv,
  chargeExportFilename,
  loadChargeExport,
  type ChargeExportQtyMode,
} from '#services/charge_export_builder'
import { LissageBadRequest, loadPlanLissage } from '#services/load_smoothing_builder'

/** Paramètre de liste CSV (`a,b,c`) → tableau nettoyé, sans entrée vide. */
function csvList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

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
   * GET /api/v1/planning/charge/export.csv — export CSV du DÉTAIL de la charge
   * pour tous les postes visibles et toutes les périodes affichées.
   *
   * Côté serveur parce que la vue commande explose la nomenclature : la faire
   * une seule fois pour tout l'horizon est le seul montage tenable, et ça garde
   * un moteur unique (cf. charge_export_builder). Le fichier est strictement ce
   * que la table de détail afficherait, barre par barre, snapshot compris.
   */
  async exportCsv({ request, response }: HttpContext) {
    const qtyMode = request.input('qtyMode')
    try {
      const data = await loadChargeExport({
        start: (request.input('start') as string | undefined) || undefined,
        ofDate: request.input('ofDate') === 'end' ? 'end' : 'start',
        view: request.input('view') === 'of' ? 'of' : 'commande',
        gran: request.input('gran') === 'week' ? 'week' : 'month',
        qtyMode: (qtyMode === 'brut' || qtyMode === 'net'
          ? qtyMode
          : 'reste') as ChargeExportQtyMode,
        applyDemandHorizon: request.input('applyDemandHorizon') !== '0',
        segments: csvList(request.input('segments')),
        postes: csvList(request.input('postes')),
        buckets: csvList(request.input('buckets')),
        // Version du snapshot charge : le fichier doit refléter le graphe
        // affiché, pas un état X3 relu entre-temps.
        version: (request.input('v') as string | undefined) || undefined,
        refresh: !!request.input('refresh'),
      })
      response.header('content-type', 'text/csv; charset=utf-8')
      response.header('content-disposition', `attachment; filename="${chargeExportFilename(data)}"`)
      // Un export dépend de l'état au moment du clic (overrides, snapshot) :
      // aucun intermédiaire ne doit le mettre en cache.
      response.header('cache-control', 'no-store')
      return response.send(chargeExportCsv(data))
    } catch (error) {
      // Paramètre invalide → 400 explicite. Un fichier vide ou tronqué serait
      // pire qu'un refus : il se propagerait sans que personne ne s'en aperçoive.
      if (error instanceof ChargeExportBadRequest) {
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
