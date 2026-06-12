import { ApplicationService } from '@adonisjs/core/types'
import { X3Database } from '#app/database/x3_database'
import { X3Adapter, type X3Queryable } from '#repositories/x3_connection'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    x3: X3Queryable
    x3db: X3Database
  }
}

export default class X3Provider {
  constructor(protected app: ApplicationService) {}

  register() {
    // Low-level X3 SOAP connection (used by repositories)
    this.app.container.singleton('x3', () => {
      return new X3Adapter()
    })

    // High-level X3 database (Knex + X3Client, for Lucid-like queries)
    this.app.container.singleton('x3db', () => {
      return new X3Database()
    })
  }
}
