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

/** Paramètre de liste CSV (`a,b,c`) → tableau nettoyé, sans entrée vide. */
function csvList(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Date de rattachement des OF (début / fin) — mémorisée en session, jamais dans l'URL. */
const OF_DATE_SESSION_KEY = 'charge.ofDate'

export default class LoadController {
  /**
   * GET /charge — page Inertia de projection de charge long terme. Cf. loadChargePayload.
   *
   * Le choix Début OF / Fin OF arrive en `?ofDate=` depuis la bascule de la page :
   * on le range en session et on redirige vers la même URL SANS lui. La barre
   * d'adresse reste `/charge`, et le choix tient d'une visite à l'autre.
   */
  async index(ctx: HttpContext) {
    const raw = ctx.request.input('ofDate')
    if (raw !== undefined && raw !== null) {
      ctx.session.put(OF_DATE_SESSION_KEY, raw === 'end' ? 'end' : 'start')
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(ctx.request.qs())) {
        if (k !== 'ofDate' && v !== undefined && v !== null) qs.set(k, String(v))
      }
      const q = qs.toString()
      // `withQs(false)` : `config/app.ts` active `forwardQueryString`, qui recolle
      // la query string d'origine — `?ofDate=` compris — à toute redirection.
      // Sans lui, la redirection bouclait jusqu'à l'abandon du navigateur.
      return ctx.response
        .redirect()
        .withQs(false)
        .toPath(`${ctx.request.parsedUrl.pathname}${q ? `?${q}` : ''}`)
    }
    const ofDate = ctx.session.get(OF_DATE_SESSION_KEY) === 'end' ? 'end' : 'start'
    const props = await loadChargePayload(ctx, ofDate)
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
}
