import { type HttpContext } from '@adonisjs/core/http'
import PrintJob from '#models/print_job'
import printService, { DOC_LABELS, type DocType } from '#services/print_service'
import { atelierLabel } from '#app/domain/atelier'

/**
 * Vue d'exploitation des impressions (issue #85, lot 4).
 *
 * Le journal existe depuis le lot 2, mais logé en bas d'un écran de
 * configuration : on y lit les 50 derniers tirages, sans filtre. Or la question
 * du matin est « qu'est-ce qui a raté cette nuit ? », et elle mérite sa page.
 *
 * L'écran est **en lecture**, à deux exceptions près, toutes deux explicites :
 * relancer un tirage échoué et réconcilier les verdicts en attente.
 */
const DAY = 86_400

export default class PrintJournalController {
  /** GET /impressions — page Inertia (aujourd'hui par défaut). */
  async index(ctx: HttpContext) {
    const since = Math.floor(Date.now() / 1000) - DAY
    const [jobs, settings] = await Promise.all([
      PrintJob.query().where('created_at', '>=', since).orderBy('id', 'desc').limit(200),
      printService.getSettings(),
    ])

    // Ateliers présents dans le journal — suffisant pour filtrer, et sans
    // dépendre de X3 : cette page doit rester lisible ERP éteint.
    const ateliers = [...new Set(jobs.map((j) => j.stoloc).filter(Boolean))]
      .map((code) => ({ code, label: atelierLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return ctx.inertia.render('impressions', {
      jobs: jobs.map(serializeJob),
      ateliers,
      autoPrintMode: settings.autoPrintMode,
      since,
    })
  }

  /**
   * GET /api/v1/print/journal — journal filtré.
   *
   * `failed=1` retient les DEUX formes d'échec, refus X3 et erreur du serveur
   * d'édition : du point de vue de l'atelier elles se valent, il n'y a pas de
   * papier.
   */
  async rows(ctx: HttpContext) {
    const r = ctx.request
    const limit = Math.min(Number(r.input('limit') ?? 200) || 200, 1000)
    const ofNum = String(r.input('of') ?? '').trim()
    const stoloc = String(r.input('stoloc') ?? '').trim()
    const since = Number(r.input('since') ?? 0) || 0
    const failedOnly = r.input('failed') === '1' || r.input('failed') === true

    const q = PrintJob.query().orderBy('id', 'desc').limit(limit)
    if (ofNum) q.whereILike('of_num', `%${ofNum}%`)
    if (stoloc) q.where('stoloc', stoloc)
    if (since > 0) q.where('created_at', '>=', since)
    if (failedOnly) {
      q.where((sub) => sub.where('status', 'failed').orWhere('server_verdict', 'error'))
    }
    const rows = await q
    return { ok: true, jobs: rows.map(serializeJob) }
  }
}

export function serializeJob(j: PrintJob) {
  return {
    id: j.id,
    ofNum: j.ofNum,
    docType: j.docType,
    docLabel: DOC_LABELS[j.docType as DocType] ?? j.docType,
    attempt: j.attempt,
    stoloc: j.stoloc,
    atelierLabel: j.stoloc ? atelierLabel(j.stoloc) : '',
    destCode: j.destCode,
    sandbox: j.sandbox,
    status: j.status,
    serverVerdict: j.serverVerdict,
    jobRank: j.jobRank,
    jobPhase: j.jobPhase,
    jobDetail: j.jobDetail,
    verdictInferred: j.verdictInferred,
    message: j.message,
    error: j.error,
    origin: j.origin,
    requestedBy: j.requestedBy,
    createdAt: j.createdAt,
  }
}
