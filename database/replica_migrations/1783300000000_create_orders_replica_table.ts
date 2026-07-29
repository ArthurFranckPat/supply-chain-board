import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique de la tranche utile d'ORDERS WIPTYP=5 (ordres de fabrication).
 *
 * Grain : un OF. Alimentée par `X3OfRepository.getManufacturingOrders()`, donc la
 * tranche est celle du board — WIPSTA 1/2/3, `RMNEXTQTY > 0`, lookback
 * `RETARD_LOOKBACK_DAYS` (90 j par défaut). Réutiliser le repository plutôt que
 * réécrire le SQL : c'est lui qui porte les règles durement acquises (lookback,
 * jointure désignation, libellés de menus locaux).
 *
 * Tables `STRICT` (SQLite ≥ 3.37), posées en SQL brut — le schema builder de Knex
 * ne sait pas l'émettre. Sans `STRICT`, SQLite accepte n'importe quel type dans
 * n'importe quelle colonne : une date écrite en nombre dans une colonne texte ne
 * lèverait rien et casserait les comparaisons plus tard.
 *
 * Dates en TEXT ISO `YYYY-MM-DD` et non en type natif (SQLite n'en a pas) : c'est
 * la seule forme où l'ordre lexicographique vaut l'ordre chronologique, donc où
 * un index sert un `BETWEEN`. Même convention que les tables `static_*`.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        num_of            TEXT    NOT NULL PRIMARY KEY,
        article           TEXT    NOT NULL,
        designation       TEXT,
        status            INTEGER NOT NULL,
        statut_label      TEXT,
        quantity          REAL    NOT NULL,
        quantity_launched REAL    NOT NULL,
        quantity_done     REAL    NOT NULL,
        start_date        TEXT,
        end_date          TEXT
      ) STRICT
    `)

    // `end_date` d'abord : tous les écrans de planning bornent une fenêtre de
    // dates puis filtrent le statut, jamais l'inverse.
    this.schema.raw(`CREATE INDEX idx_orders_replica_end_date ON ${this.tableName} (end_date)`)
    this.schema.raw(
      `CREATE INDEX idx_orders_replica_article_end ON ${this.tableName} (article, end_date)`
    )
    this.schema.raw(`CREATE INDEX idx_orders_replica_status ON ${this.tableName} (status)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
