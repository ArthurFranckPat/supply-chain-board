/**
 * X3 Dialect (Lucid) — bridges Lucid ORM to the X3 Knex client.
 * Read-only: schema operations, locking, and DDL are unsupported.
 */

import type { DialectContract } from '@adonisjs/lucid/types/database.js'
import type { QueryClientContract } from '@adonisjs/lucid/types/querybuilder.js'

export class X3Dialect implements DialectContract {
  name = 'x3'
  supportsAdvisoryLocks = false
  supportsViews = false
  supportsTypes = false
  supportsDomains = false
  supportsReturningStatement = false
  version: string | undefined
  dateTimeFormat = 'yyyy-MM-dd HH:mm:ss'

  constructor(
    private _client: QueryClientContract,
    _config: any,
  ) {
    this.version = undefined
  }

  async getAllTables(): Promise<string[]> {
    throw new Error('X3 is read-only')
  }
  async getAllTablesWithSchema(): Promise<any[]> {
    throw new Error('X3 is read-only')
  }
  async truncate(_table: string, _cascade?: boolean): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async truncateAllTables(): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async dropAllTables(): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async getAllViews(): Promise<string[]> {
    throw new Error('X3 is read-only')
  }
  async getAllTypes(): Promise<string[]> {
    throw new Error('X3 is read-only')
  }
  async getAllDomains(): Promise<string[]> {
    throw new Error('X3 is read-only')
  }
  async dropAllViews(): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async dropAllTypes(): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async dropAllDomains(): Promise<void> {
    throw new Error('X3 is read-only')
  }
  async getPrimaryKeys(_table: string): Promise<string[]> {
    throw new Error('X3 is read-only')
  }
  getAdvisoryLock(): Promise<boolean> {
    throw new Error('X3: advisory locks not supported')
  }
  releaseAdvisoryLock(): Promise<boolean> {
    throw new Error('X3: advisory locks not supported')
  }
}
