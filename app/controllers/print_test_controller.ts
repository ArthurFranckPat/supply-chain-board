import { type HttpContext } from '@adonisjs/core/http'
import { getX3EnvConfig } from '#config/x3'
import { callRunSubprog } from '#app/x3/run-client'

/**
 * Terrain de test de l'impression X3 (issue #85, lot 1).
 *
 * Appelle le sous-programme publié `ZSOAPPRINT` (enveloppe `IMPRIM0`) sur UN OF,
 * vers une destination `APRINTER`. Page associée : `/print-test`.
 *
 * ⚠️ Effet physique : une destination de type imprimante SORT DU PAPIER, et le
 * papier ne se reprend pas. Utiliser `PDFFILE` (fichier) tant que la chaîne
 * n'est pas prouvée. `WRPTCOD=PING` sort du subprogram sans rien imprimer.
 *
 * ⚠️ `WRETCOD=0` signifie « IMPRIM0 a rendu la main », PAS « le document est
 * sorti » : le contrôle de statut côté L4G n'est pas encore rétabli (cf README
 * de `x3/subprograms`). Ne pas router vers un atelier sur cette base.
 */
export default class PrintTestController {
  async run(ctx: HttpContext) {
    const body = ctx.request.body()
    const rptCod = String(body.rptCod ?? '').trim()
    const stofcy = String(body.stofcy ?? '').trim()
    const mfgNum = String(body.mfgNum ?? '').trim()
    const dest = String(body.dest ?? '').trim()
    const trace = body.trace === true || body.trace === 'true'

    if (!rptCod || !stofcy || !mfgNum || !dest) {
      return ctx.response.badRequest({
        ok: false,
        error: 'Paramètres requis : rptCod, stofcy, mfgNum, dest.',
      })
    }

    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.badRequest({
        ok: false,
        error: 'Identifiants X3 absents : connectez-vous avant le test.',
      })
    }

    // Ordre = grille de publication GESAWE (rangs 1→6), groupe GRP1.
    const inputXml =
      `<PARAM><GRP ID="GRP1">` +
      `<FLD NAME="WRPTCOD">${escapeXml(rptCod)}</FLD>` +
      `<FLD NAME="WSTOFCY">${escapeXml(stofcy)}</FLD>` +
      `<FLD NAME="WMFGNUM">${escapeXml(mfgNum)}</FLD>` +
      `<FLD NAME="WDEST">${escapeXml(dest)}</FLD>` +
      `</GRP></PARAM>`

    const started = Date.now()
    const result = await callRunSubprog('ZSOAPPRINT', config, inputXml, { trace })

    return {
      ok: result.ok,
      status: result.status,
      env: config.pool,
      durationMs: Date.now() - started,
      poolEntryIdx: result.poolEntryIdx,
      sent: { rptCod, stofcy, mfgNum, dest },
      // Verdict du subprogram. Absents si l'appel n'a pas atteint le corps.
      retCod: result.fields.WRETCOD ?? null,
      retErMsg: result.fields.WRETERMSG ?? null,
      fields: result.fields,
      messages: result.messages,
      error: result.error,
      trace: result.trace,
    }
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
