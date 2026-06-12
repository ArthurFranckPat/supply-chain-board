/**
 * X3 Connection adapter -- wraps local SOAP/SQL client.
 *
 * Uses app/x3/ scripts (soap-client, connection, sql-builder, response-parser)
 * — no external MCP dependency.
 */

import { getX3EnvConfig } from '#config/x3'
import { X3Connection } from '#app/x3/connection'
import type { X3QueryResult } from '#app/x3/types'

export type { X3QueryResult }

export interface X3Queryable {
  query(sql: string, params?: any[] | Record<string, any> | null, options?: any): Promise<X3QueryResult>
}

export class X3Adapter implements X3Queryable {
  private conn: X3Connection | null = null

  constructor(private env: string = 'test') {}

  async connect(): Promise<void> {
    const config = getX3EnvConfig(this.env)
    this.conn = new X3Connection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      pool: config.pool,
      ws: config.ws,
      grpSql: config.grpSql,
      grpRes: config.grpRes,
      grpCount: config.grpCount,
    })
  }

  async query(sql: string, params?: any[] | Record<string, any> | null, options?: any): Promise<X3QueryResult> {
    if (!this.conn) await this.connect()
    return this.conn!.query(sql, params, options)
  }

  async healthCheck(): Promise<{ reachable: boolean; env: string; detail: string; error: string }> {
    if (!this.conn) await this.connect()
    return this.conn!.healthCheck()
  }
}
