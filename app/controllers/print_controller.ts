import { type HttpContext } from '@adonisjs/core/http'
import { getX3EnvConfig } from '#config/x3'
import { X3Connection } from '#app/x3/connection'
import printService, { DOC_LABELS, DOC_TYPES, type DocType } from '#services/print_service'
import PrintJob from '#models/print_job'

/**
 * Impression du dossier d'un OF à la demande (issue #85, lot 3).
 *
 * Sert la réimpression explicite depuis le détail OF : l'enchaînement
 * automatique vit dans `suggestion_firm_controller`. Ici, l'utilisateur sait ce
 * qu'il fait — le verrou d'idempotence n'est levé que sur `force`, et la
 * réimpression est journalisée comme telle (rang de tirage incrémenté).
 *
 * Le site et l'article ne sont PAS pris du client : ils sont relus dans X3 à
 * partir du numéro d'OF. Un site falsifié imprimerait le dossier d'un autre
 * établissement.
 */
export default class PrintController {
  /** POST /api/v1/planning/orders/:orderNum/print — imprime (ou réimprime) le dossier. */
  async print(ctx: HttpContext) {
    const ofNum = String(ctx.params.orderNum ?? '').trim()
    if (!ofNum) return ctx.response.badRequest({ ok: false, error: 'orderNum requis' })

    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.unauthorized({ ok: false, error: 'Identifiants X3 absents.' })
    }

    const body = ctx.request.body()
    const force = body.force === true || body.force === '1'
    const requested = Array.isArray(body.docTypes)
      ? body.docTypes.map((d: unknown) => String(d).trim().toUpperCase())
      : []
    const docTypes = requested.filter((d: string): d is DocType =>
      (DOC_TYPES as string[]).includes(d)
    )

    const head = await this.headOf(ofNum, config)
    if (!head) {
      return ctx.response.notFound({ ok: false, error: `OF ${ofNum} introuvable dans X3.` })
    }

    const folder = await printService.printFolder({
      ofNum,
      stofcy: head.site,
      itmref: head.article,
      docTypes: docTypes.length > 0 ? docTypes : undefined,
      force,
      origin: 'manual',
      requestedBy: ctx.auth.user?.username ?? '',
      config,
    })

    return {
      ok: folder.ok,
      ofNum,
      atelier: folder.atelier,
      documents: folder.documents.map((d) => ({
        docType: d.docType,
        label: DOC_LABELS[d.docType],
        status: d.status,
        destCode: d.destCode,
        sandbox: d.sandbox,
        serverVerdict: d.serverVerdict,
        jobRank: d.jobRank,
        attempt: d.attempt,
        message: d.message,
        error: d.error || d.jobDetail,
        previous: d.previous,
      })),
    }
  }

  /** GET /api/v1/planning/orders/:orderNum/print — tirages déjà journalisés. */
  async history(ctx: HttpContext) {
    const ofNum = String(ctx.params.orderNum ?? '').trim()
    const rows = await PrintJob.query().where('of_num', ofNum).orderBy('id', 'desc')
    return {
      ok: true,
      ofNum,
      jobs: rows.map((j) => ({
        id: j.id,
        docType: j.docType,
        label: DOC_LABELS[j.docType as DocType] ?? j.docType,
        attempt: j.attempt,
        destCode: j.destCode,
        sandbox: j.sandbox,
        status: j.status,
        serverVerdict: j.serverVerdict,
        jobRank: j.jobRank,
        error: j.error || j.jobDetail,
        origin: j.origin,
        requestedBy: j.requestedBy,
        createdAt: j.createdAt,
      })),
    }
  }

  /** Site et article d'un OF, relus dans X3 (jamais pris du client). */
  private async headOf(
    ofNum: string,
    config: ReturnType<typeof getX3EnvConfig>
  ): Promise<{ site: string; article: string } | null> {
    const conn = new X3Connection(config)
    const res = await conn.query(
      // Non qualifié : `config.pool` est l'alias de pool, pas le schéma Oracle.
      `SELECT MFGFCY_0, ITMREF_0 FROM MFGITM
        WHERE MFGNUM_0 = %ofNum% AND ROWNUM <= 1`,
      { ofNum }
    )
    if (!res.success || res.data.length === 0) return null
    const r = res.data[0] as Record<string, string>
    return { site: String(r.MFGFCY_0 ?? '').trim(), article: String(r.ITMREF_0 ?? '').trim() }
  }
}
