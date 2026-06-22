import { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import { getX3EnvConfig } from '#config/x3'
import { callRunSubprog } from '#app/x3/run-client'
import { X3SuggestionRepository } from '#app/repositories/suggestion_repository'

/** Invalide les caches board + vision de l'utilisateur (issue #20) après un write-back. */
async function bustBoardCaches(userId: number | string | undefined) {
  const ns = userId ? `user_${userId}` : ''
  await Promise.all([
    cache.namespace(ns ? `board:${ns}` : 'board').clear(),
    cache.namespace(ns ? `vision:${ns}` : 'vision').clear(),
  ])
}

/**
 * Affermissement d'un ordre X3 en OF ferme (issue #31).
 *
 * `POST /api/v1/planning/orders/:orderNum/firm` appelle le sous-programme publié
 * `ZSOAPFIRM`, qui pilote la fonction standard X3 **FUNMAUTR** (« Lancement
 * automatique ») scopée sur un ordre, headless.
 *
 * Fonctionne pour les DEUX sources (le sous-programme X3 auto-détecte le statut) :
 *   - suggestion CBNDET (WIPSTA=3, n° SGAE…) → crée un nouvel OF ferme + consomme
 *     la suggestion (explosion nomenclature/gamme via transaction MFGMTSNUM=OF6).
 *   - OF planifié MFGHEAD (MFGSTA=2, n° F…) → modifie l'OF existant vers Ferme.
 *
 * Pas de double appro (FUNMAUTR consomme/transforme nativement), pas de delete
 * séparé, batch-safe (pas de fenêtre IVISUGHOST contrairement à un `save` GESMFG).
 *
 * Le board ne porte que l'id de l'ordre ; on relit CBNDET puis MFGHEAD pour le
 * site (clé exigée par FUNMAUTR).
 */
export default class SuggestionFirmController {
  async firm(ctx: HttpContext) {
    const orderNum = (ctx.params.orderNum || ctx.params.sugNum || '').toString().trim()
    if (!orderNum) {
      return ctx.response.badRequest({ ok: false, error: 'orderNum requis' })
    }

    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.unauthorized({
        ok: false,
        error: 'Identifiants X3 absents : connectez-vous avant l’affermissement.',
        env: config.pool,
      })
    }

    const repo = new X3SuggestionRepository()
    const keys = await repo.getFirmingKeys(orderNum)
    if (!keys) {
      return ctx.response.notFound({
        ok: false,
        error: `Ordre ${orderNum} introuvable ou non affermissable (déjà ferme ?).`,
      })
    }

    // Params groupés sous GRP1, ordre = publication FIRMSUGG
    // (WSUGNUM, WSTOFCY, WITMREF). Statut Ferme câblé dans le subprogram.
    const inputXml =
      `<PARAM>` +
      `<GRP ID="GRP1">` +
      `<FLD NAME="WSUGNUM">${escapeXml(keys.sugNum)}</FLD>` +
      `<FLD NAME="WSTOFCY">${escapeXml(keys.stofcy)}</FLD>` +
      `<FLD NAME="WITMREF">${escapeXml(keys.itmref)}</FLD>` +
      `</GRP>` +
      `</PARAM>`

    const result = await callRunSubprog('ZSOAPFIRM', config, inputXml)

    // Verdict : WMFGNUM rempli = succès ; WRETERMSG = message d'erreur sinon.
    const mfgNum = (result.fields.WMFGNUM ?? '').trim()
    const retErr = (result.fields.WRETERMSG ?? '').trim()
    const ok = result.ok && mfgNum !== ''

    if (!ok) {
      return ctx.response.unprocessableEntity({
        ok: false,
        sugNum: keys.sugNum,
        mfgNum: mfgNum || null,
        error:
          retErr ||
          result.error ||
          result.messages.map((m) => m.text).join(' · ') ||
          'Affermissement refusé par X3.',
        env: config.pool,
      })
    }

    // Write-back réussi : l'ordre a changé (statut/n°). On invalide les caches
    // board + vision de l'utilisateur pour que le prochain reload soit à jour.
    await bustBoardCaches(ctx.auth.user?.id)

    return {
      ok: true,
      sugNum: keys.sugNum,
      mfgNum,
      article: keys.itmref,
      site: keys.stofcy,
      env: config.pool,
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
