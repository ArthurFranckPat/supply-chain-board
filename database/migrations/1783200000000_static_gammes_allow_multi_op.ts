import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Un article peut router sur plusieurs postes de charge (ROUOPE alt 1).
 * L'index unique sur `article` seul écrasait silencieusement les opérations
 * supplémentaires à la synchro — cf. issue #96 point 2.
 */
export default class extends BaseSchema {
  protected tableName = 'static_gammes'

  async up() {
    this.schema.raw('DROP INDEX IF EXISTS static_gammes_article_unique')
    this.schema.raw(
      'CREATE UNIQUE INDEX static_gammes_article_workstation_unique ON static_gammes (article, workstation)'
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS static_gammes_article_workstation_unique')
    this.schema.raw(
      'CREATE UNIQUE INDEX static_gammes_article_unique ON static_gammes (article)'
    )
  }
}
