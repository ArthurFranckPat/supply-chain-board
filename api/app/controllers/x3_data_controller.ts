import { HttpContext } from '@adonisjs/core/http'
import type { X3Queryable } from '#repositories/x3_connection'

export default class X3DataController {
  private async getX3(ctx: HttpContext): Promise<X3Queryable> {
    return ctx.containerResolver.make('x3')
  }

  async load(ctx: HttpContext) {
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
