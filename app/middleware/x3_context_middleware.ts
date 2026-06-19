import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { X3Credentials } from '#config/x3'

/**
 * Contextualise les identifiants X3 de la session (issue #13).
 *
 * À placer APRÈS le middleware `auth`. Lit l'utilisateur authentifié, déchiffre
 * son mot de passe X3 et pose `ctx.x3Credentials` (env + creds). `getX3EnvConfig`
 * lit cette propriété via le HttpContext (AsyncLocalStorage), ce qui propage les
 * creds de l'utilisateur à TOUTES les connexions X3 (pool Lucid + `X3Database`)
 * sans toucher la signature des repositories.
 *
 * Le mot de passe ne vit qu'en mémoire le temps de la requête : jamais loggé,
 * jamais sérialisé.
 */
export default class X3ContextMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user
    if (user) {
      const password = user.getX3Password()
      if (password) {
        ctx.x3Credentials = {
          env: user.lastEnv,
          user: user.username,
          password,
        }
      }
    }
    return next()
  }
}

declare module '@adonisjs/core/http' {
  interface HttpContext {
    /**
     * Identifiants X3 de la session courante (posés par `x3_context_middleware`).
     * Lu par `getX3EnvConfig()` pour scoper les connexions X3 à l'utilisateur.
     */
    x3Credentials?: X3Credentials
  }
}
