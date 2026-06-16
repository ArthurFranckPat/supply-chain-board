import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * La classe de base d'@adonisjs/inertia expose un cycle `init`/`dispose`,
 * alors que le routeur AdonisJS attend des middlewares à `handle(ctx, next)`.
 * Ce wrapper fait le pont : `init` avant la suite de la chaîne, `dispose`
 * après (toujours, même en cas d'erreur, pour poser les en-têtes Inertia).
 *
 * Définir des props partagées à toutes les pages via `share()` ci-dessous.
 */
class InertiaCore extends BaseInertiaMiddleware {
  share() {
    return {}
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
