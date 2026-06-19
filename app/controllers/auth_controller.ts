import { DateTime } from 'luxon'
import { type HttpContext } from '@adonisjs/core/http'
import { loginValidator } from '#validators/auth'
import { X3HealthcheckService } from '#services/x3_healthcheck'
import User from '#models/user'
import type { X3EnvName } from '#config/x3'

/** Cookie d'aide à la saisie : username + env uniquement, jamais le mot de passe. */
const LOGIN_HINT_COOKIE = 'x3_login_hint'
const LOGIN_HINT_MAX_AGE = 60 * 60 * 24 * 30 // 30 jours (secondes)

/**
 * Authentification native (issue #13).
 *
 * L'utilisateur se connecte avec ses identifiants Sage X3. Le couple
 * username/password est validé par un healthcheck X3 (lecture d'une table
 * métier) sur l'environnement choisi (test/prod). En cas de succès, une session
 * est ouverte et les requêtes X3 utilisent ses credentials (chiffrés au repos).
 */
export default class AuthController {
  /** GET /login — formulaire (préremplit username/env si « se souvenir »). */
  async show({ inertia, request, session }: HttpContext) {
    const hint = request.cookie(LOGIN_HINT_COOKIE) as { username?: string; env?: X3EnvName } | null

    return inertia.render('auth/login', {
      lastUsername: hint?.username ?? '',
      lastEnv: hint?.env ?? 'test',
      error: session.flashMessages.get('error') ?? null,
    })
  }

  /** POST /login — valide les identifiants via X3, ouvre la session. */
  async login({ request, response, auth, session, logger }: HttpContext) {
    const { username, password, env, remember } = await request.validateUsing(loginValidator)

    const result = await new X3HealthcheckService().check(env, username, password)
    if (!result.ok) {
      session.flash('error', result.reason)
      session.flashOnly(['username'])
      return response.redirect().back()
    }

    // Auto-provisioning : l'utilisateur est créé au premier login réussi.
    // X3 reste l'autorité ; aucun mot de passe local en clair n'est stocké.
    const user = await User.firstOrNew({ username }, {})
    user.username = username
    user.lastEnv = env
    user.setX3Password(password)
    user.lastLoginAt = DateTime.now()
    await user.save()

    await auth.use('web').login(user)

    // Garde-fou prod : trace l'usage (sans aucun credential).
    if (env === 'prod') {
      logger.warn({ username, env }, 'Connexion X3 en environnement PROD')
    }

    if (remember) {
      response.cookie(
        LOGIN_HINT_COOKIE,
        { username, env },
        { maxAge: LOGIN_HINT_MAX_AGE, httpOnly: true }
      )
    } else {
      response.clearCookie(LOGIN_HINT_COOKIE)
    }

    return response.redirect('/')
  }

  /** POST /logout — ferme la session. */
  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect('/login')
  }
}
