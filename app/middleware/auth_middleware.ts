import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Protège les routes derrière le guard de session (issue #13).
 *
 * Non authentifié : redirige vers `/login` (requête HTML) ou répond 401 (API).
 */
export default class AuthMiddleware {
  /** URL de redirection quand l'utilisateur n'est pas authentifié. */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    try {
      await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'E_UNAUTHORIZED_ACCESS') throw error

      // Navigation HTML ou requête Inertia → redirige vers le login (Inertia
      // suit la 302 vers une page Inertia). API / JSON → laisse remonter le 401.
      const isInertia = ctx.request.header('x-inertia')
      const wantsHtml = ctx.request.accepts(['html', 'json']) === 'html'
      if (isInertia || wantsHtml) {
        return ctx.response.redirect(this.redirectTo)
      }
      throw error
    }
    return next()
  }
}
