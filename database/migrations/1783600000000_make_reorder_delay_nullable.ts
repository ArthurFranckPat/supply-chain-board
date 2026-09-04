import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `reorder_delay` nullable : distinguer « délai X3 renseigné » (même à 14) de
 * « délai inconnu ». Avant : `Number(PRPLTI_0) || 14` — 2 472 articles achat à
 * 14 j sans qu'on sache lesquels sont réellement renseignés.
 *
 * SQLite ne sait pas ALTER une contrainte : recréation avec données conservées.
 * Les 14 historiques restent 14 (indistinguables) jusqu'au prochain `sync:x3`,
 * qui réécrira NULL où X3 est vide. Sans conséquence pour /charge (replis
 * locaux inchangés) ; prérequis au plan appro lot 4 (date de commande).
 */
export default class extends BaseSchema {
  protected tableName = 'static_articles'

  private createTable(reorderDef: string) {
    return `
      CREATE TABLE static_articles_new (
        code varchar(255) NOT NULL PRIMARY KEY,
        description varchar(255) NOT NULL DEFAULT '',
        category varchar(255) NOT NULL DEFAULT '',
        supply_type varchar(255) NOT NULL DEFAULT 'FABRICATION',
        synced_at integer NOT NULL DEFAULT 0,
        famille varchar(255) NOT NULL DEFAULT '',
        typologie varchar(255) NOT NULL DEFAULT '',
        reorder_delay integer ${reorderDef},
        us_par_palette float NULL,
        status integer NOT NULL DEFAULT 1
      )`
  }

  async up() {
    this.schema.raw(this.createTable('NULL'))
    this.schema.raw(`INSERT INTO static_articles_new
      (code, description, category, supply_type, synced_at, famille, typologie,
       reorder_delay, us_par_palette, status)
      SELECT code, description, category, supply_type, synced_at, famille, typologie,
       reorder_delay, us_par_palette, status FROM static_articles`)
    this.schema.raw('DROP TABLE static_articles')
    this.schema.raw('ALTER TABLE static_articles_new RENAME TO static_articles')
  }

  async down() {
    this.schema.raw(this.createTable(`NOT NULL DEFAULT '14'`))
    this.schema.raw(`INSERT INTO static_articles_new
      (code, description, category, supply_type, synced_at, famille, typologie,
       reorder_delay, us_par_palette, status)
      SELECT code, description, category, supply_type, synced_at, famille, typologie,
       COALESCE(reorder_delay, 14), us_par_palette, status FROM static_articles`)
    this.schema.raw('DROP TABLE static_articles')
    this.schema.raw('ALTER TABLE static_articles_new RENAME TO static_articles')
  }
}
