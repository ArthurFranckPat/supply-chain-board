import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class UnpolyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if ('view' in ctx) {
      ctx.view.share({ up: ctx.up })
    }

    const response = await next()

    ctx.up.commit()

    return response
  }
}
