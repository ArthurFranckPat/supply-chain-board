import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ledger de décisions acheteur `/approvisionnements` (#134 — décision #112).
 *
 * APPEND-ONLY : chaque action (vu / ignorer / à passer) est une LIGNE NOUVELLE,
 * jamais une mise à jour — la plus récente fait foi pour l'affichage, l'historique
 * reste lisible et rend l'override rate mesurable. Rien n'est écrit dans X3 en v1.
 *
 * `cle_logique` :
 *  - suggestion → **fingerprint #112** `sha256(fournisseur, article, bucket
 *    échéance ±7 j, bucket quantité ±20 %)` — survit à la recréation nocturne
 *    du CBN (`VCRNUM` instable) : une suggestion recréée identique hérite de la
 *    décision passée ; un fingerprint différent = nouvelle décision.
 *  - message replanif → `M:VCRNUM:VCRLIN` — clé stable directe (#107), sans
 *    fingerprint.
 *
 * Expiration auto : `absent_runs` compte les runs où la clé n'apparaît plus dans
 * la file (suggestion disparue du CBN, ou fingerprint devenu différent car
 * échéance/quantité hors tolérances) ; à 3 runs, `expiree = true` et la décision
 * ne s'affiche plus. `quantite`/`echeance` sont un instantané de décision, pour
 * le diagnostic.
 */
export default class extends BaseSchema {
  protected tableName = 'appro_decision_ledger'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('cle_logique', 96).notNullable()
      table.string('nature', 12).notNullable()
      table.string('statut', 16).notNullable()
      table.string('article', 20).notNullable()
      table.string('fournisseur', 20).nullable()
      table.double('quantite').notNullable()
      table.date('echeance').nullable()
      table.integer('absent_runs').notNullable().defaultTo(0)
      table.boolean('expiree').notNullable().defaultTo(false)
      table.timestamp('decided_at').notNullable()
      table.timestamp('created_at')
    })

    this.schema.raw(`CREATE INDEX idx_appro_ledger_cle ON ${this.tableName} (cle_logique, expiree)`)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
