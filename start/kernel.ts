import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * Middleware global exécuté sur chaque requête, dans l'ordre.
 *
 * `session` → `initialize_auth` doivent précéder `inertia` (qui partage
 * l'utilisateur dans les props) et les middlewares nommés `auth`/`x3_context`.
 */
router.use([
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/inertia_middleware'),
])

server.use([
  () => import('#middleware/timing_middleware'),
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/vite/vite_middleware'),
])

/**
 * Middlewares nommés, appliqués explicitement sur des routes via
 * `middleware.auth()`, `middleware.guest()`, `middleware.x3Context()`.
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  guest: () => import('#middleware/guest_middleware'),
  x3Context: () => import('#middleware/x3_context_middleware'),
})
