import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

/**
 * Authentification native AdonisJS (issue #13).
 *
 * L'autorité d'authentification est Sage X3 : il n'y a PAS de hash de mot de
 * passe local. Le login valide les identifiants via un healthcheck X3
 * (cf. `AuthController.login` + `X3HealthcheckService`), puis ouvre une
 * session. Le provider Lucid ne sert qu'à retrouver l'enregistrement `User`
 * (id en session) — il n'effectue aucune vérification de mot de passe.
 */
const authConfig = defineConfig({
  default: 'web',
  guards: {
    web: sessionGuard({
      useRememberMeTokens: false,
      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
    }),
  },
})

export default authConfig

declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
