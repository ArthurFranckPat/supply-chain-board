import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Distingue un run COMPLET d'une ré-ingestion PARTIELLE.
 *
 * Sans cette colonne, une ré-ingestion ciblée après écriture (quelques OF relus
 * par numéro) laisserait dans `ingestion_log` une ligne indistinguable d'un run
 * complet. La règle de confirmation du read-after-write — « la réplique a rattrapé
 * si un run a démarré après l'écriture » — deviendrait fausse : un run partiel n'a
 * rafraîchi que les clés qu'on lui a nommées, pas la table.
 *
 * `full` par défaut : les runs déjà journalisés en sont.
 *
 * `note` va avec : une ligne `partial` est illisible sans elle — 3 lignes relues
 * sur 11 000, mais lesquelles ? Colonne distincte d'`error`, qui doit rester
 * réservée aux échecs pour qu'un `WHERE error IS NOT NULL` garde un sens.
 */
export default class extends BaseSchema {
  protected tableName = 'ingestion_log'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN note TEXT`)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN note`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN scope`)
  }
}
