import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { baseX3Config } from '#config/x3'

/**
 * La classe de base d'@adonisjs/inertia expose un cycle `init`/`dispose`,
 * alors que le routeur AdonisJS attend des middlewares à `handle(ctx, next)`.
 * Ce wrapper fait le pont : `init` avant la suite de la chaîne, `dispose`
 * après (toujours, même en cas d'erreur, pour poser les en-têtes Inertia).
 *
 * Définir des props partagées à toutes les pages via `share()` ci-dessous.
 */
class InertiaCore extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    const isAuthed = await ctx.auth.use('web').check()

    // Issue #118 — lien « Ouvrir dans X3 » côté front. Suit l'environnement de
    // la session (jamais un choix client) ; endpoint vide = pas de lien rendu.
    let x3Web: { baseUrl: string; endpoint: string } | null = null
    if (isAuthed && ctx.auth.user?.lastEnv) {
      const env = baseX3Config(ctx.auth.user.lastEnv)
      if (env.webEndpoint) {
        x3Web = {
          baseUrl: `${env.webScheme}://${env.host}:${env.port}`,
          endpoint: env.webEndpoint,
        }
      }
    }

    return {
      authUser:
        isAuthed && ctx.auth.user
          ? { username: ctx.auth.user.username, env: ctx.auth.user.lastEnv }
          : null,
      x3Web,
      flash: ctx.session?.flashMessages.all() ?? {},
    }
  }
}

export default class InertiaMiddleware {
  #core = new InertiaCore()

  async handle(ctx: HttpContext, next: NextFn) {
    await this.#core.init(ctx)
    try {
      return await next()
    } finally {
      this.#core.dispose(ctx)
    }
  }
}
