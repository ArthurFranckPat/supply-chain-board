import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Photo quotidienne du besoin (#74, lot 1 — absorbé par #98 lot 4).
 *
 * X3 ne versionne rien côté prévisions : chaque cycle S&OP réécrit les lignes,
 * `ORDERS` est régénéré à chaque calcul CBN. « Ce que la prévision disait à la
 * date D » est irrécupérable rétroactivement — la valeur de cette table dépend
 * donc de sa date de mise en route, pas d'une reconstruction historique.
 *
 * `source` distingue les 7 populations captées par une photo (cf.
 * `DemandSnapshotService`) : `of_ferme` / `of_planifie` / `of_suggestion`
 * (OF, WIPTYP=5), `demande_ferme` / `demande_prevision` (commandes/prévisions
 * client, WIPTYP=1), `stock` (dispo par article), `appro` (PORDERQ ouvertes).
 *
 * `vcrnum`/`vcrlin` nullable : `stock` n'a pas d'identité de document ;
 * `appro` n'expose pas de ligne (POHNUM seul, cf. `getReceptionFlows`).
 * Pas de contrainte UNIQUE sur la clé composite de l'issue (elle contiendrait
 * des NULL sur ces deux colonnes, sémantique fragile en SQLite) : l'idempotence
 * vient du service (swap complet par `snapshot_date`), pas du schéma.
 */
export default class extends BaseSchema {
  protected tableName = 'demand_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.date('snapshot_date').notNullable()
      table.string('source', 24).notNullable()
      table.string('itmref', 20).notNullable()
      table.string('vcrnum', 20).nullable()
      table.string('vcrlin', 10).nullable()
      table.double('quantity').notNullable()
      table.date('date_echeance').nullable()
      table.string('fournisseur', 80).nullable()

      table.timestamp('created_at')
    })

    this.schema.raw(
      `CREATE INDEX idx_demand_snapshots_date_source ON ${this.tableName} (snapshot_date, source)`
    )
    this.schema.raw(
      `CREATE INDEX idx_demand_snapshots_date_article ON ${this.tableName} (snapshot_date, itmref)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
