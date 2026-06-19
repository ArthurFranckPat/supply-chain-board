/** X3 Connection pool with retry and timeout.
 *
 * Ported from x3_sql.py (query function) and db.py (X3Connection).
 */

import type { X3QueryResult } from './types.js'
import { bindParams } from './sql-builder.js'
import { extractColumns } from './sql-parser.js'
import { callSoap, type X3SoapConfig } from './soap-client.js'
import { formatResults } from './response-parser.js'
import { getX3EnvConfig } from '#config/x3'

const TRANSIENT_ERRORS = [
  'curl',
  'timeout',
  'connection',
  'refused',
  'econnrefused',
  'resultxml is nil',
]

export interface QueryOptions {
  retries?: number
  timeout?: number
}

export class X3Connection {
  /**
   * `config` optionnel : si absent, la config est résolue paresseusement à
   * chaque requête via `getX3EnvConfig()` (creds de la session courante). Une
   * connexion poolée sans config figée reflète donc toujours l'utilisateur
   * courant — pas l'utilisateur qui l'a créée (issue #13).
   */
  constructor(private config?: X3SoapConfig) {}

  /** Config effective : explicite si fournie, sinon contexte session / `.env`. */
  private resolveConfig(): X3SoapConfig {
    return this.config ?? getX3EnvConfig()
  }

  async query(
    sql: string,
    params?: any[] | Record<string, any> | null,
    options: QueryOptions = {}
  ): Promise<X3QueryResult> {
    const config = this.resolveConfig()
    if (!config.user || !config.password) {
      return {
        success: false,
        error: `Identifiants X3 absents : connexion non authentifiée.`,
        count: 0,
        data: [],
      }
    }

    const boundSql = bindParams(sql, params ?? null)
    const columns = extractColumns(boundSql)

    if (columns.length === 0) {
      return {
        success: false,
        error: 'Could not extract columns from SQL',
        sql: boundSql,
        count: 0,
        data: [],
      }
    }

    const retries = options.retries ?? 1
    let lastError = ''

    for (let attempt = 0; attempt <= retries; attempt++) {
      const resp = await callSoap(boundSql, config, 0)

      if (resp.status === 1 && resp.error !== 'resultXml is nil') {
        const records = formatResults(resp, columns)
        return {
          success: true,
          count: resp.count || records.length,
          columns,
          data: records,
        }
      }

      lastError = resp.error
      const isTransient = TRANSIENT_ERRORS.some((kw) => lastError.toLowerCase().includes(kw))

      if (!isTransient || attempt >= retries) {
        return {
          success: false,
          error: lastError,
          status: resp.status,
          sql: boundSql,
          count: 0,
          data: [],
        }
      }

      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }

    return {
      success: false,
      error: `Failed after ${retries + 1} attempt(s): ${lastError}`,
      count: 0,
      data: [],
    }
  }

  async healthCheck(): Promise<{ reachable: boolean; env: string; detail: string; error: string }> {
    const config = this.resolveConfig()
    if (!config.user || !config.password) {
      return { reachable: false, env: config.ws, detail: '', error: 'No credentials' }
    }

    try {
      const result = await this.query('SELECT TO_CHAR(1) AS CNT FROM DUAL')
      return {
        reachable: result.success,
        env: config.ws,
        detail: result.success ? '' : (result.error ?? ''),
        error: result.error ?? '',
      }
    } catch (e) {
      return { reachable: false, env: config.ws, detail: '', error: (e as Error).message }
    }
  }
}
