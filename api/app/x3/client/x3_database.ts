import knex from 'knex'
import { X3Client } from './x3_client.js'
import type { X3Queryable } from '../types.js'
import { getX3EnvConfig, type X3EnvConfig } from '#config/x3'

export class X3Database {
  private db: ReturnType<typeof knex>

  constructor(x3Connection?: X3Queryable | X3EnvConfig) {
    let connection: Record<string, any> = {}

    if (!x3Connection) {
      const config = getX3EnvConfig()
      connection.env = config.pool
    } else if ('query' in x3Connection) {
      connection.x3Connection = x3Connection
    } else {
      connection.env = (x3Connection as X3EnvConfig).pool
    }

    this.db = knex({
      client: X3Client as any,
      connection,
      pool: { min: 1, max: 1 },
    })
  }

  from(table: string) {
    return this.db.from(table)
  }

  raw(sql: string, bindings?: any[]) {
    if (bindings !== undefined) return this.db.raw(sql, bindings)
    return this.db.raw(sql)
  }

  async destroy() {
    await this.db.destroy()
  }

  get knex() {
    return this.db
  }
}
