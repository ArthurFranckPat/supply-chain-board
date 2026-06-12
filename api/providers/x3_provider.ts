import { ApplicationService } from '@adonisjs/core/types'
import { X3Database } from '#app/x3/client/x3_database'
import { X3Connection } from '#app/x3/connection'
import { getX3EnvConfig } from '#config/x3'
import type { X3Queryable } from '#app/x3/types'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    x3: X3Queryable
    x3db: X3Database
  }
}

export default class X3Provider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('x3', () => {
      return new X3Connection(getX3EnvConfig())
    })

    this.app.container.singleton('x3db', () => {
      return new X3Database()
    })
  }
}
