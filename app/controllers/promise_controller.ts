/**
 * Controller CTP — endpoint simulateur « date au plus tôt ».
 *
 * GET /api/v1/promesse?article=PP_830_X&quantity=200&from=2026-07-15
 *
 * Réutilise les caches boardDataset (SWR partagé) via promise_loader.
 * Aucun appel X3 direct — cible < 500 ms sur données chaudes (PRD §8.7).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { loadPromise } from '#services/promise_loader'

export default class PromiseController {
  async index(ctx: HttpContext) {
    const article = (ctx.request.input('article') as string)?.trim()
    const quantity = Number.parseFloat(ctx.request.input('quantity') as string)
    const fromStr = ctx.request.input('from') as string | undefined

    if (!article) {
      return ctx.response.status(400).json({ error: 'Paramètre « article » requis.' })
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return ctx.response
        .status(400)
        .json({ error: 'Paramètre « quantity » doit être un nombre positif.' })
    }

    const from = fromStr ? new Date(fromStr) : undefined
    if (fromStr && Number.isNaN(from!.getTime())) {
      return ctx.response
        .status(400)
        .json({ error: 'Paramètre « from » invalide (format attendu : YYYY-MM-DD).' })
    }

    const result = await loadPromise({ article, quantity, from })
    return ctx.response.ok(result)
  }

  /** GET /promesse — page Inertia du simulateur CTP autonome. */
  async show(ctx: HttpContext) {
    return ctx.inertia.render('promesse', {})
  }
}
