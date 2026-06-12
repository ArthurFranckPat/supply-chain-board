/**
 * X3 Database Provider — registers X3 in Lucid's dialect registry and
 * patches Lucid's Connection to inject the X3Client class.
 *
 * Strategy:
 *  1. Load Lucid's internal dialect module via file:// URL + patch
 *  2. Load Lucid's Connection class via file:// URL + patch getWriteConfig
 *     to replace `client: 'x3'` with the X3Client class (Knex accepts a
 *     Client class directly, bypassing frozen SUPPORTED_CLIENTS)
 *
 * Must run AFTER @adonisjs/lucid/database_provider.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ApplicationService } from '@adonisjs/core/types'
import { X3Client } from '#app/database/x3_client'
import { X3Dialect } from '#app/database/x3_dialect'

export default class X3DatabaseProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    await this.patchLucidDialects()
    await this.patchConnection()
  }

  /** Register X3Dialect in Lucid's dialect registry. */
  private async patchLucidDialects(): Promise<void> {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    const dialectPath = resolve(
      __dirname,
      '../node_modules/@adonisjs/lucid/build/src/dialects/index.js',
    )
    const dialects = await import(new URL('file://' + dialectPath).href)

    ;(dialects.clientsToDialectsMapping as Record<string, any>)['x3'] = X3Dialect
    if (!dialects.clientsNames.includes('x3')) {
      dialects.clientsNames.push('x3')
    }
  }

  /**
   * Patch Lucid's Connection.prototype.getWriteConfig to convert
   * `client: 'x3'` → `client: X3Client` (a class).
   *
   * Knex accepts a Client class in place of a client name string,
   * bypassing the frozen SUPPORTED_CLIENTS check entirely.
   *
   * Same pattern Lucid uses internally for 'libsql'.
   */
  private async patchConnection(): Promise<void> {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    const connPath = resolve(
      __dirname,
      '../node_modules/@adonisjs/lucid/build/src/connection/index.js',
    )
    const { Connection } = await import(new URL('file://' + connPath).href) as {
      Connection: {
        new (...args: any[]): any
        prototype: Record<string, any>
      }
    }

    const origGetWriteConfig = Connection.prototype.getWriteConfig
    Connection.prototype.getWriteConfig = function (this: any) {
      if (this.config.client === 'x3') {
        return {
          ...this.config,
          client: X3Client,
        }
      }
      return origGetWriteConfig.call(this)
    }
  }
}
