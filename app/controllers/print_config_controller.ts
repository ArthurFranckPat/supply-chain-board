import { type HttpContext } from '@adonisjs/core/http'
import PrintDestination from '#models/print_destination'
import PrintJob from '#models/print_job'
import printService, {
  AUTO_PRINT_MODES,
  DOC_TYPES,
  type AutoPrintMode,
  type DocType,
} from '#services/print_service'
import staticSync from '#services/static_sync_service'
import { atelierLabel } from '#app/domain/atelier'

/**
 * Configuration du routage d'impression (issue #85, lot 2).
 *
 * Page `/configuration/impressions` : une règle par atelier et par document,
 * plus une règle par défaut. Le tableau des destinations vient de X3
 * (`APRINTER`) — l'écran ne propose que ce qui existe côté ERP.
 *
 * Deux garde-fous portés par le contrôleur, pas seulement par l'UI :
 *  - une destination inconnue de X3 est refusée (sinon l'impression échouerait
 *    silencieusement au tirage, bien plus tard) ;
 *  - `sandbox` est déduit du type de destination X3 et non de ce que le client
 *    envoie : seul le type 2 (imprimante) sort du papier.
 */
const isDocType = (v: string): v is DocType => (DOC_TYPES as string[]).includes(v)

export default class PrintConfigController {
  /** GET /configuration/impressions — page Inertia. */
  async index(ctx: HttpContext) {
    const [rules, workstations, jobs, settings] = await Promise.all([
      printService.listRules(),
      staticSync.readWorkstations().catch(() => []),
      PrintJob.query().orderBy('id', 'desc').limit(50),
      printService.getSettings(),
    ])

    // Destinations X3 : la page reste utilisable si X3 est injoignable (les
    // règles existantes s'affichent), avec la cause à l'écran.
    let destinations: Awaited<ReturnType<typeof printService.listX3Destinations>> = []
    let destinationsError = ''
    try {
      destinations = await printService.listX3Destinations()
      if (destinations.length === 0) destinationsError = 'X3 n’a renvoyé aucune destination.'
    } catch (e) {
      destinationsError = String(e)
    }

    // Files réellement connues du serveur d'édition : c'est ce qui permet de
    // repérer une règle qui échouera au tirage AVANT qu'elle n'échoue.
    let queues: string[] = []
    let queuesError = ''
    const q = await printService.listPrintServerQueues().catch((e) => ({ error: String(e) }))
    if (Array.isArray(q)) queues = q
    else queuesError = q.error

    const ateliers = [...new Set(workstations.map((w) => w.stockLocation).filter(Boolean))]
      .map((code) => ({ code, label: atelierLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return ctx.inertia.render('config/impressions', {
      ateliers,
      destinations,
      destinationsError,
      queues,
      queuesError,
      settings,
      rules: rules.map(serializeRule),
      jobs: jobs.map(serializeJob),
    })
  }

  /**
   * POST /api/v1/config/print/settings — règle le déclenchement automatique.
   *
   * Le mode est validé contre la liste connue : une valeur inattendue doit être
   * refusée, pas silencieusement rabattue sur un défaut qui pourrait imprimer.
   */
  async updateSettings(ctx: HttpContext) {
    const mode = String(ctx.request.input('autoPrintMode') ?? '').trim()
    if (!(AUTO_PRINT_MODES as string[]).includes(mode)) {
      return ctx.response.badRequest({
        ok: false,
        error: `Mode invalide : ${mode || '(vide)'}. Attendu ${AUTO_PRINT_MODES.join(' | ')}.`,
      })
    }
    await printService.setAutoPrintMode(mode as AutoPrintMode, ctx.auth.user?.username ?? '')
    return { ok: true, settings: await printService.getSettings() }
  }

  /** POST /api/v1/config/print/rules — crée ou remplace la règle (atelier, document). */
  async upsertRule(ctx: HttpContext) {
    const r = ctx.request
    const stoloc = String(r.input('stoloc') ?? '').trim()
    const docType = String(r.input('docType') ?? '').trim()
    const destCode = String(r.input('destCode') ?? '').trim()
    const note = String(r.input('note') ?? '').trim()

    if (!isDocType(docType)) return ctx.response.badRequest({ error: 'docType invalide' })
    if (!destCode) return ctx.response.badRequest({ error: 'destination requise' })

    const known = await printService.listX3Destinations()
    const dest = known.find((d) => d.code === destCode)
    if (!dest) {
      return ctx.response.badRequest({
        error: `Destination ${destCode} inconnue de X3 (APRINTER).`,
      })
    }
    if (!dest.active) {
      return ctx.response.badRequest({ error: `Destination ${destCode} inactive dans X3.` })
    }

    const row = await PrintDestination.updateOrCreate(
      { stoloc, docType },
      {
        stoloc,
        docType,
        destCode,
        destLabel: dest.label,
        // Vérité X3, pas déclaration du client : seul le type 2 met du papier.
        sandbox: dest.sandbox,
        note,
        updatedAt: Math.floor(Date.now() / 1000),
        updatedBy: ctx.auth.user?.username ?? '',
      }
    )
    return { ok: true, rule: serializeRule(row) }
  }

  /** DELETE /api/v1/config/print/rules/:id — supprime une règle. */
  async deleteRule(ctx: HttpContext) {
    const row = await PrintDestination.find(Number(ctx.params.id))
    if (row) await row.delete()
    return { ok: true }
  }

  /** GET /api/v1/config/print/destinations — destinations X3 (rafraîchies). */
  async destinations(ctx: HttpContext) {
    try {
      return { ok: true, destinations: await printService.listX3Destinations() }
    } catch (e) {
      return ctx.response.badGateway({ ok: false, error: String(e) })
    }
  }

  /**
   * GET /api/v1/config/print/jobs — 50 derniers tirages, sans filtre.
   * Le journal filtrable vit sur `/impressions` (`print_journal_controller`) :
   * une seule implémentation des filtres, pour qu'elles ne divergent pas.
   */
  async jobs(ctx: HttpContext) {
    const limit = Math.min(Number(ctx.request.input('limit') ?? 50) || 50, 500)
    const ofNum = String(ctx.request.input('of') ?? '').trim()
    const q = PrintJob.query().orderBy('id', 'desc').limit(limit)
    if (ofNum) q.where('of_num', ofNum)
    const rows = await q
    return { ok: true, jobs: rows.map(serializeJob) }
  }

  /**
   * POST /api/v1/config/print/reconcile — tranche les tirages sans verdict.
   * Même règle que `node ace print:reconcile`, déclenchée depuis l'écran.
   */
  async reconcile(ctx: HttpContext) {
    try {
      return { ok: true, ...(await printService.reconcilePending()) }
    } catch (e) {
      return ctx.response.badGateway({ ok: false, error: String(e) })
    }
  }
}

function serializeRule(r: PrintDestination) {
  return {
    id: r.id,
    stoloc: r.stoloc,
    atelierLabel: r.stoloc ? atelierLabel(r.stoloc) : 'Par défaut',
    docType: r.docType,
    destCode: r.destCode,
    destLabel: r.destLabel,
    sandbox: r.sandbox,
    note: r.note,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  }
}

function serializeJob(j: PrintJob) {
  return {
    id: j.id,
    ofNum: j.ofNum,
    docType: j.docType,
    attempt: j.attempt,
    stoloc: j.stoloc,
    destCode: j.destCode,
    sandbox: j.sandbox,
    status: j.status,
    /** Verdict du serveur d'édition — distinct de `status` (cf. print_service). */
    serverVerdict: j.serverVerdict,
    jobRank: j.jobRank,
    jobPhase: j.jobPhase,
    jobDetail: j.jobDetail,
    verdictInferred: j.verdictInferred,
    retCod: j.retCod,
    message: j.message,
    error: j.error,
    durationMs: j.durationMs,
    origin: j.origin,
    requestedBy: j.requestedBy,
    createdAt: j.createdAt,
  }
}
