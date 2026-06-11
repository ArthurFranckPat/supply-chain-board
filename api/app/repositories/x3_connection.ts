/**
 * X3 Connection adapter -- wraps x3-graphql-node SOAP/SQL client.
 *
 * Only uses the raw SQL path (X3Connection.query), no GraphQL.
 * Provides the X3Queryable interface consumed by repositories.
 */

import type { X3QueryResult } from 'x3-graphql-mcp/src/types.js'

export type { X3QueryResult }

export interface X3Queryable {
  query(sql: string, params?: Array<string | number> | Record<string, string | number> | null, options?: any): Promise<X3QueryResult>
}

export class X3Adapter implements X3Queryable {
  private conn: any = null

  constructor(private env: string) {}

  async connect(): Promise<void> {
    const { X3Connection } = await import('x3-graphql-mcp/src/x3/connection.js')
    this.conn = new X3Connection(this.env)
  }

  async query(sql: string, params?: Array<string | number> | Record<string, string, number> | null, options?: any): Promise<X3QueryResult> {
    if (!this.conn) await this.connect()
    return this.conn.query(sql, params, options)
  }

  async healthCheck(): Promise<{ reachable: boolean; env: string; detail: string; error: string }> {
    if (!this.conn) await this.connect()
    return this.conn.healthCheck()
  }
}
