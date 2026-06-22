import type { HttpContext } from '@adonisjs/core/http'
import perfMetrics from '#services/perf_metrics'

/**
 * Expose la baseline de latence collectée par `timing_middleware` (issue #33).
 *
 * Lecture seule, réservée aux sessions authentifiées. Sert à relever P50/P95 par route après
 * quelques navigations, et à comparer avant/après un levier perf. `?reset=1` vide la fenêtre
 * d'échantillons (utile pour mesurer un scénario propre).
 */
export default class PerfController {
  async index({ request, response }: HttpContext) {
    if (request.input('reset') === '1') {
      perfMetrics.reset()
      return response.json({ reset: true, routes: [] })
    }
    return response.json({ routes: perfMetrics.snapshot() })
  }
}
