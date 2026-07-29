import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Journal des ingestions — une ligne par table et par run.
 *
 * C'est la contrepartie explicite de la réplique : la fraîcheur cesse d'être
 * implicite. Aujourd'hui la péremption existe déjà (TTL 2–5 min + grâce 12 h)
 * mais aucune requête ne peut y répondre. Ici l'âge de chaque table est une
 * donnée : `SELECT * FROM ingestion_log WHERE table_name = ? ORDER BY started_at
 * DESC LIMIT 1`.
 *
 * On journalise AUSSI les échecs (`status = 'failed'` + `error`). Un run qui
 * échoue sans laisser de trace rendrait indistinguables « la donnée est vieille
 * parce que rien ne tourne » et « la donnée est vieille parce que X3 refuse
 * depuis trois heures » — deux situations qui n'appellent pas la même action.
 */
export default class extends BaseSchema {
  protected tableName = 'ingestion_log'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name  TEXT    NOT NULL,
        status      TEXT    NOT NULL,
        started_at  TEXT    NOT NULL,
        finished_at TEXT,
        rows        INTEGER,
        duration_ms INTEGER,
        source      TEXT,
        error       TEXT
      ) STRICT
    `)

    // Toute lecture du journal cherche le dernier run d'une table donnée.
    this.schema.raw(
      `CREATE INDEX idx_ingestion_log_table_started ON ${this.tableName} (table_name, started_at DESC)`
    )
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
