import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { updateViewPrefsValidator } from '#validators/view_prefs'
import { DEFAULT_VIEW_PREFS, type ViewPrefs } from '#types/view_prefs'

/**
 * Préférences de vues de l'utilisateur (pages du menu + sous-vues).
 *
 * Même patron que `dashboard_layout_controller` : l'état de vérité vit en base
 * (`users.view_prefs`), les props Inertia le portent à chaque page, et le client
 * PATCH à chaque mutation. La page `/configuration/vues` est la seule surface
 * de réglage ; le masthead et les sous-vues la consomment.
 */
export default class ViewPrefsController {
  /** GET /configuration/vues — page de réglage (couche Inertia pure). */
  async index(ctx: HttpContext) {
    const prefs = ctx.auth.user?.getViewPrefs() ?? DEFAULT_VIEW_PREFS
    return ctx.inertia.render('config/vues', { prefs })
  }

  /** PATCH /api/v1/user/view-prefs — sauvegarde les préférences de l'utilisateur. */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateViewPrefsValidator)

    const user = ctx.auth.user
    if (!user) {
      return ctx.response.unauthorized({ error: 'Non authentifié' })
    }

    // On re-normalise côté serveur (complétude + dédoublonnage) avant de
    // persister, puis on renvoie le résultat canonique pour resynchroniser le
    // client.
    user.setViewPrefs(payload as unknown as ViewPrefs)
    try {
      await user.save()
    } catch (e) {
      logger.error({ err: e }, '[view_prefs] update — échec save user')
      return ctx.response.internalServerError({ error: 'Sauvegarde impossible' })
    }

    return { ok: true, prefs: user.getViewPrefs() }
  }
}
