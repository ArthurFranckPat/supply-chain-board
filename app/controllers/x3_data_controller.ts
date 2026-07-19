import { type HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import type { X3Queryable } from '#app/x3/types'

export default class X3DataController {
  private async getX3(ctx: HttpContext): Promise<X3Queryable> {
    return ctx.containerResolver.make('x3')
  }

  async load(ctx: HttpContext) {
    // K1 (audit sécu) : ce endpoint pipe le SQL du body vers ZSOAPSQL. Il ne doit
    // jamais être exposé en production — on renvoie 404 (et non 403) pour ne pas
    // révéler l'existence de la route. Conservation du code pour env test/dev.
    if (app.inProduction) {
      return ctx.response.notFound({ message: 'Endpoint de debug disponible en environnement de test uniquement' })
    }

    const { sql, params } = ctx.request.only(['sql', 'params'])

    if (!sql || typeof sql !== 'string') {
      return ctx.response.badRequest({ message: 'sql query is required' })
    }

    const x3 = await this.getX3(ctx)
    const result = await x3.query(sql, params ?? null)

    return {
      status: result.success ? 'loaded' : 'error',
      data: result.data ?? [],
      total: result.data?.length ?? 0,
      error: result.error ?? null,
    }
  }
}
