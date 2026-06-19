import { createRequire } from 'node:module'
import type { X3Queryable } from '../types.js'
import { X3Connection } from '../connection.js'

const _require = createRequire(import.meta.url)
const KnexClient = _require('knex/lib/client.js')

export type { X3Queryable }

export class X3Client extends KnexClient {
  declare config: any

  get dialect() {
    return 'x3'
  }
  get driverName() {
    return 'x3'
  }

  _driver() {
    return {}
  }

  queryCompiler(builder: any, formatter: any) {
    const OracleQ = _require('knex/lib/dialects/oracle/query/oracle-querycompiler.js')
    const X3Q = class extends OracleQ {
      _surroundQueryWithLimitAndOffset(query: string) {
        const hasLimit = this.single.limit || this.single.limit === 0 || this.single.limit === '0'
        const hasOffset = !!this.single.offset
        if (!hasLimit || hasOffset) return super._surroundQueryWithLimitAndOffset(query)
        const limitVal = +this.single.limit
        const rownumClause = 'ROWNUM <= ' + limitVal
        if (/\bWHERE\b/i.test(query)) {
          return query.replace(/\bWHERE\b/i, (m: string) => m + ' ' + rownumClause + ' AND ')
        }
        const fromMatch = query.match(/\bFROM\b/i)
        if (fromMatch) {
          const idx = (fromMatch.index ?? 0) + fromMatch[0].length
          const afterFrom = query.slice(idx).trim()
          const tableName = afterFrom.split(/\s/)[0]
          return (
            query.slice(0, idx) +
            ' ' +
            tableName +
            ' WHERE ' +
            rownumClause +
            afterFrom.slice(tableName.length)
          )
        }
        return 'select * from (' + query + ') where ' + rownumClause
      }
    }
    return new (X3Q as any)(this, builder, formatter)
  }

  columnCompiler() {
    const OracleCC = _require('knex/lib/dialects/oracle/schema/oracle-columncompiler.js')
    return new OracleCC(this, ...arguments)
  }

  wrapIdentifierImpl(value: string) {
    return value.toUpperCase()
  }

  async acquireRawConnection(): Promise<{ x3conn: X3Queryable }> {
    if (this.config.connection?.x3Connection) {
      return { x3conn: this.config.connection.x3Connection }
    }
    // Pas de config figée : `X3Connection` résout les creds paresseusement à
    // chaque requête (session courante). Indispensable pour le pool Lucid `x3`
    // partagé, dont les connexions survivent à la requête qui les a créées —
    // figer les creds ici fuiterait l'utilisateur entre sessions (issue #13).
    return { x3conn: new X3Connection() }
  }

  async destroyRawConnection(_connection: { x3conn: X3Queryable }): Promise<void> {
    return Promise.resolve()
  }

  async _query(connection: { x3conn: X3Queryable }, obj: any): Promise<any> {
    if (!obj.sql) throw new Error('The query is empty')
    const bindings = obj.bindings?.length ? obj.bindings : null
    const result = await connection.x3conn.query(obj.sql, bindings)
    if (!result.success) throw new Error(`X3 query failed: ${result.error}`)
    obj.response = result.data
    return obj
  }

  processResponse(obj: any, _runner: any): any {
    const { response } = obj
    if (obj.output) return obj.output.call(_runner, response)
    switch (obj.method) {
      case 'select':
        return response
      case 'first':
        return response[0]
      case 'pluck':
        return response.map((r: Record<string, any>) => r[obj.pluck])
      default:
        return response
    }
  }
}
