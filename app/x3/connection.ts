/** X3 Connection pool with retry and timeout.
 *
 * Ported from x3_sql.py (query function) and db.py (X3Connection).
 */

import { Cause, Effect, Exit, Schedule } from 'effect'

import type { X3QueryResult } from './types.js'
import { bindParams } from './sql_builder.js'
import { extractColumns } from './sql_parser.js'
import { soapQuery, type X3SoapConfig } from './soap_client.js'
import { formatResults } from './response_parser.js'
import { isTransient } from './x3_errors.js'
import { getX3EnvConfig } from '#config/x3'

/** Premier délai entre deux tentatives, doublé à chaque réessai (1 s, 2 s, 4 s…). */
const RETRY_BASE_DELAY = '1 second'

export interface QueryOptions {
  retries?: number
  timeout?: number
  /** Annule la requête SOAP sous-jacente, notamment à l'expiration du healthcheck. */
  signal?: AbortSignal
}

const ABORTED: X3QueryResult = {
  success: false,
  error: 'X3 query aborted',
  status: null,
  count: 0,
  data: [],
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

  /**
   * Façade Promise de `queryEffect`, contrat inchangé : ne rejette jamais pour
   * un échec X3, qui devient un `X3QueryResult` en échec. `options.signal`
   * interrompt l'effet — curl tué, slot rendu, aucun réessai.
   */
  async query(
    sql: string,
    params?: any[] | Record<string, any> | null,
    options: QueryOptions = {}
  ): Promise<X3QueryResult> {
    if (options.signal?.aborted) return { ...ABORTED }

    const exit = await Effect.runPromiseExit(this.queryEffect(sql, params, options), {
      signal: options.signal,
    })
    if (Exit.isSuccess(exit)) return exit.value
    if (Cause.isInterruptedOnly(exit.cause)) return { ...ABORTED }
    throw Cause.squash(exit.cause)
  }

  /**
   * Lecture SQL X3, réessayée tant que l'échec est transitoire (`isTransient`).
   * L'effet n'échoue pas : tout échec X3 devient un `X3QueryResult` en échec.
   */
  queryEffect(
    sql: string,
    params?: any[] | Record<string, any> | null,
    options: Pick<QueryOptions, 'retries'> = {}
  ): Effect.Effect<X3QueryResult> {
    const config = this.resolveConfig()
    if (!config.user || !config.password) {
      return Effect.succeed({
        success: false,
        error: `Identifiants X3 absents : connexion non authentifiée.`,
        count: 0,
        data: [],
      })
    }

    const boundSql = bindParams(sql, params ?? null)
    const columns = extractColumns(boundSql)

    if (columns.length === 0) {
      return Effect.succeed({
        success: false,
        error: 'Could not extract columns from SQL',
        sql: boundSql,
        count: 0,
        data: [],
      })
    }

    return soapQuery(boundSql, config).pipe(
      Effect.retry({
        schedule: Schedule.exponential(RETRY_BASE_DELAY),
        times: options.retries ?? 1,
        while: isTransient,
      }),
      Effect.map((resp): X3QueryResult => {
        const records = formatResults(resp, columns)
        return { success: true, count: resp.count || records.length, columns, data: records }
      }),
      Effect.catchAll((error) =>
        Effect.succeed<X3QueryResult>({
          success: false,
          error: error.message,
          status: 'status' in error ? error.status : null,
          sql: boundSql,
          count: 0,
          data: [],
        })
      )
    )
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
