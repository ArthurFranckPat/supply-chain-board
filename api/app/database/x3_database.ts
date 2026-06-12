/**
 * X3 Database — Knex instance wrapper for X3 SOAP/SQL connection.
 *
 * Usage:
 *   const db = await container.make('x3db')
 *   const rows = await db.from('MFGHEAD').where('STATUT', 1)
 *   const result = await db.raw('SELECT COUNT(*) AS C FROM MFGHEAD')
 *
 * For testing, inject a mock X3 connection:
 *   const db = new X3Database(mockX3Queryable)
 */

import knex from 'knex'
import { X3Client, type X3Queryable } from '#app/database/x3_client'
import { getX3EnvConfig, type X3EnvConfig } from '#config/x3'

export class X3Database {
  private db: ReturnType<typeof knex>

  /**
   * @param x3Connection Optional mock connection (testing) or X3 env config.
   *                      In production, omit to use x3-graphql-mcp with env defaults.
   */
  constructor(x3Connection?: X3Queryable | X3EnvConfig) {
    let connection: Record<string, any> = {}

    if (!x3Connection) {
      // Production: env config
      const config = getX3EnvConfig()
      connection.env = config.pool
    } else if ('query' in x3Connection) {
      // Mock X3Queryable for testing
      connection.x3Connection = x3Connection
    } else {
      // X3EnvConfig object
      connection.env = (x3Connection as X3EnvConfig).pool
    }

    this.db = knex({
      client: X3Client as any,
      connection,
      pool: { min: 1, max: 1 },
    })
  }

  /** Knex query builder for an X3 table */
  from(table: string) {
    return this.db.from(table)
  }

  /** Raw SQL query */
  raw(sql: string, bindings?: any[]) {
    if (bindings !== undefined) return this.db.raw(sql, bindings)
    return this.db.raw(sql)
  }

  /** Close the Knex pool */
  async destroy() {
    await this.db.destroy()
  }

  /** Expose the underlying Knex instance */
  get knex() {
    return this.db
  }
}
