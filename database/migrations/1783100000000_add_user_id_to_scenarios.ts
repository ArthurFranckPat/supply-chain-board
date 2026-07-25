import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Propriétaire d'un scénario (audit feature scénario). `auteur` n'était qu'un texte
 * d'affichage : la liste renvoyait tous les scénarios à tout le monde, et show /
 * update / destroy / comparer acceptaient n'importe quel id.
 *
 * Nullable : les scénarios antérieurs (aucun en base à la migration) n'ont pas de
 * propriétaire connu et restent invisibles plutôt que d'être attribués au hasard.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('scenarios', (table) => {
      table.integer('user_id').nullable()
      table.index(['user_id'], 'scenarios_user_id_index')
    })
  }

  async down() {
    this.schema.alterTable('scenarios', (table) => {
      table.dropIndex(['user_id'], 'scenarios_user_id_index')
      table.dropColumn('user_id')
    })
  }
}
