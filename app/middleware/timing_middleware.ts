import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { performance } from 'node:perf_hooks'
import perfMetrics from '#services/perf_metrics'

/**
 * Mesure la durée de chaque requête (issue #33 — baseline perf).
 *
 * Global (`server.use`) afin d'englober toute la chaîne (auth, x3Context, contrôleur).
 * Trois sorties complémentaires :
 *  - header `Server-Timing: total;dur=<ms>` → lisible dans l'onglet réseau du navigateur, gratuit ;
 *  - log structuré → trace terrain ;
 *  - agrégat mémoire `perfMetrics` → exposé en P50/P95 sur `GET /api/v1/_perf`.
 *
 * Clé de route = le pattern (`/api/v1/planning/ofs/:of/detail`), pas l'URL concrète, pour éviter
 * l'explosion de cardinalité due aux paramètres.
 */
export default class TimingMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const start = performance.now()
    try {
      return await next()
    } finally {
      const durationMs = performance.now() - start

      // Ne tracer que les routes applicatives. Les assets servis par Vite en dev
      // (/node_modules, /@fs, /@id, /@vite, /inertia, /.vite…) n'ont pas de route
      // Adonis → bruit de log + explosion de cardinalité perfMetrics. On les ignore.
      // NB : pas de `return` ici — un return dans un finally avalerait une exception
      // remontée par next(). On garde un simple garde-fou conditionnel.
      if (ctx.route) {
        const route = ctx.route.pattern
        const key = `${ctx.request.method()} ${route}`

        perfMetrics.record(key, durationMs)

        // En-tête perçu côté navigateur (ignoré si la réponse est déjà partie en streaming).
        try {
          ctx.response.header('Server-Timing', `total;dur=${durationMs.toFixed(1)}`)
        } catch {}

        logger.info({
          method: ctx.request.method(),
          route,
          status: ctx.response.getStatus(),
          durationMs: Math.round(durationMs),
        })
      }
    }
  }
}
