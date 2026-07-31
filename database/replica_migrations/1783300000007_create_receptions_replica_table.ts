import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique des lignes PORDERQ ouvertes (réceptions attendues) — #98, suite lot 3.
 *
 * Miroir de `X3ReceptionRepository.getReceptionFlows()` : mêmes filtres
 * (PORDER.CLEFLG=1, PORDERQ.LINCLEFLG=1, ITMMASTER.ITMSTA=1, QTYSTU > RCPQTYSTU),
 * sans borne `to` — c'est l'appel que fait `board_dataset.getReceptions()`, déjà
 * partagé par 8+ écrans (cf. commentaire de la méthode). Swap complet comme
 * `orders_replica`/`stock_replica` : source batch, aucune écriture applicative ne
 * touche PORDERQ (réceptions saisies dans X3), donc jamais de fenêtre `dirty`.
 *
 * Grain : une ligne PORDERQ. `AUUID_0` est la clé primaire déclarée par le modèle
 * Lucid (`PurchaseOrderLine.primaryKey = 'identifiantUnique'`) — identité STABLE,
 * contrairement aux suggestions CBN d'`orders_replica` : pas de diff par agrégat
 * nécessaire ici, un diff exact par `uuid` suffit (cf. `replica:sync --compare`).
 */
export default class extends BaseSchema {
  protected tableName = 'receptions_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        uuid           TEXT NOT NULL PRIMARY KEY,
        num_commande   TEXT NOT NULL,
        article        TEXT NOT NULL,
        quantity       REAL NOT NULL,
        date           TEXT,
        supplier       TEXT,
        designation    TEXT,
        date_commande  TEXT,
        qte_commandee  REAL NOT NULL
      ) STRICT
    `)

    this.schema.raw(`CREATE INDEX idx_receptions_replica_article ON ${this.tableName} (article)`)
    this.schema.raw(`CREATE INDEX idx_receptions_replica_date ON ${this.tableName} (date)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
