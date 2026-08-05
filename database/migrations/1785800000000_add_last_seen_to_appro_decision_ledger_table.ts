import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Expiration du ledger de décisions acheteur : par JOUR d'absence, plus par
 * compteur de « runs » (#134, correctif de la décision #112).
 *
 * `absent_runs` comptait en réalité des REQUÊTES HTTP : l'expiration tournait
 * dans `attacheDecisions`, hors cache, à chaque `GET /api/v1/appro/rows`. Trois
 * rafraîchissements de page suffisaient à expirer une décision — et les clés
 * « présentes » étaient celles de la file FILTRÉE, si bien qu'une décision
 * simplement hors fenêtre (bascule d'horizon) comptait comme disparue.
 *
 * `last_seen_at` porte la même intention sans dépendre du nombre d'appels :
 * chaque chargement de la population complète marque les clés vues, et une
 * décision expire quand elle n'a plus été vue depuis 3 JOURS. Deux requêtes
 * SQL au lieu d'un scan + un UPDATE par ligne, et aucune course entre deux
 * chargements concurrents.
 *
 * L'index est déposé et recréé autour du `dropColumn` : sous SQLite, knex
 * reconstruit la table pour supprimer une colonne et ne restaure pas les index
 * créés en SQL brut.
 */
export default class extends BaseSchema {
  protected tableName = 'appro_decision_ledger'

  async up() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_appro_ledger_cle`)

    this.schema.alterTable(this.tableName, (table) => {
      table.date('last_seen_at').nullable()
    })

    // Les décisions déjà prises n'ont pas d'historique de présence : les faire
    // partir de leur jour de décision les laisse vivre leurs 3 jours normaux.
    this.schema.raw(
      `UPDATE ${this.tableName} SET last_seen_at = substr(decided_at, 1, 10) WHERE last_seen_at IS NULL`
    )

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('absent_runs')
    })

    this.schema.raw(`CREATE INDEX idx_appro_ledger_cle ON ${this.tableName} (cle_logique, expiree)`)
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_appro_ledger_cle`)
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('absent_runs').notNullable().defaultTo(0)
      table.dropColumn('last_seen_at')
    })
    this.schema.raw(`CREATE INDEX idx_appro_ledger_cle ON ${this.tableName} (cle_logique, expiree)`)
  }
}
