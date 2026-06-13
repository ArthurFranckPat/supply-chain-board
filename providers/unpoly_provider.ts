import { HttpContext } from '@adonisjs/core/http'
import type { ApplicationService } from '@adonisjs/core/types'
import Up from '#app/unpoly/up'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    up: Up
  }
}

export default class UnpolyProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    HttpContext.getter(
      'up',
      function (this: HttpContext) {
        return new Up(this)
      },
      true
    )
  }
}
