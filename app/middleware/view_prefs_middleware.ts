import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  fallbackPathFor,
  isPageHidden,
  isSubviewHidden,
  pageTargetForPath,
} from '#types/view_prefs'

/**
 * Applique les préférences de vues de l'utilisateur (issue « page Vues »).
 *
 * Une page (ou une sous-vue routée, ex. les onglets de Config) masquée dans
 * `/configuration/vues` n'est plus joignable : ouvrir son URL renvoie vers une
 * cible visible (`fallbackPathFor`) plutôt qu'un 403 brut — l'utilisateur ne
 * voit jamais d'écran d'erreur pour son propre réglage.
 *
 * À placer APRÈS `auth` (il lit `ctx.auth.user`). Les routes non concernées
 * (API JSON, assets, page de préférences, pages de lab) passent : `null`.
 */
export default class ViewPrefsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const target = pageTargetForPath(ctx.request.url())
    const user = ctx.auth.user
    if (target && user) {
      const prefs = user.getViewPrefs()
      const hidden =
        isPageHidden(prefs, target.page) ||
        (target.subview ? isSubviewHidden(prefs, target.page, target.subview) : false)
      if (hidden) {
        return ctx.response.redirect().toPath(fallbackPathFor(prefs, target))
      }
    }
    return next()
  }
}
