import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import staticSyncService from '#services/static_sync_service'

export default class SyncStaticData extends BaseCommand {
  static commandName = 'sync:x3'
  static description = 'Sync articles, nomenclatures and gammes from X3'

  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Starting X3 sync...')

    const result = await staticSyncService.syncAll()

    if (result.errors.length) {
      this.logger.error('Sync completed with errors:')
      for (const err of result.errors) {
        this.logger.error(`  - ${err}`)
      }
    } else {
      this.logger.success(`Sync complete in ${result.durationMs}ms`)
    }

    this.logger.info(`  articles:       ${result.articles}`)
    this.logger.info(`  nomenclatures:  ${result.nomenclatures}`)
    this.logger.info(`  gammes:        ${result.gammes}`)
  }
}
