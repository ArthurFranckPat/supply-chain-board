import { ApplicationService } from '@adonisjs/core/types'
import { X3Adapter, type X3Queryable } from '#repositories/x3_connection'
import { getX3EnvConfig } from '#config/x3'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    x3: X3Queryable
  }
}

export default class X3Provider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('x3', () => {
      const config = getX3EnvConfig()
      return new X3Adapter(config.pool)
    })
  }
}
