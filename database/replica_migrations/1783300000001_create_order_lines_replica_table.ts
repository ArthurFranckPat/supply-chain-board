import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique d'ORDERS WIPTYP=1 (lignes de demande client ouvertes).
 *
 * Répliquée dès le lot 1 alors que l'issue #98 ne cite qu'ORDERS WIPTYP=5 et
 * STOCK : sans WIPTYP=1, le lot 2 ne peut basculer aucune page réelle. Le
 * matching OF↔commande — donc `/programme`, `/ruptures`, `/suivi` — lit les deux
 * côtés. Une réplique qui ne porte que l'offre ne sert que des écrans qui
 * n'existent pas.
 *
 * Grain : une ligne de commande (num_commande, ligne). Alimentée par
 * `X3OrderLineRepository.getOpenOrderLines()`.
 *
 * `nature` distingue COMMANDE (WIPSTA=1) de PREVISION (WIPSTA=3) — les deux
 * vivent dans WIPTYP=1 et ne se traitent pas pareil côté engagement.
 */
export default class extends BaseSchema {
  protected tableName = 'order_lines_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        num_commande   TEXT NOT NULL,
        ligne          TEXT NOT NULL,
        client         TEXT,
        article        TEXT NOT NULL,
        designation    TEXT,
        quantite       REAL NOT NULL,
        date_livraison TEXT NOT NULL,
        contremarque   TEXT,
        unite          TEXT,
        order_type     TEXT,
        nature         TEXT NOT NULL,
        PRIMARY KEY (num_commande, ligne)
      ) STRICT
    `)

    this.schema.raw(
      `CREATE INDEX idx_order_lines_replica_date ON ${this.tableName} (date_livraison)`
    )
    this.schema.raw(
      `CREATE INDEX idx_order_lines_replica_article_date ON ${this.tableName} (article, date_livraison)`
    )
    // Le repli de matching passe par la contremarque : sans index, chaque
    // résolution OF→commande scannerait la table entière.
    this.schema.raw(
      `CREATE INDEX idx_order_lines_replica_contremarque ON ${this.tableName} (contremarque)`
    )
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
