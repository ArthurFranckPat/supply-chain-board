import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DatabaseSync } from 'node:sqlite'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'

export default class SyncLocalMenus extends BaseCommand {
  static commandName = 'sync:local-menus'
  static description = 'Sync local menus from x3_catalog.db into local SQLite'

  static options: CommandOptions = { startApp: true }

  async run() {
    const catalogPath = env.get(
      'X3_CATALOG_PATH',
      '/Users/arthurbledou/Desktop/MCP/x3-graphql-node/data/x3_catalog.db'
    )
    const catalog = new DatabaseSync(catalogPath, { readOnly: true })

    const rows = catalog
      .prepare('SELECT chapter, name, value, label FROM menus ORDER BY chapter, value')
      .all() as Array<{
      chapter: number
      name: string
      value: number
      label: string
    }>
    catalog.close()

    if (!rows.length) {
      this.logger.error('x3_catalog.db menus table is empty')
      return
    }

    await db.from('local_menus').delete()

    const chunks = []
    for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500))

    for (const chunk of chunks) {
      await db.table('local_menus').insert(chunk)
    }

    this.logger.success(`Synced ${rows.length} menu entries`)
  }
}
