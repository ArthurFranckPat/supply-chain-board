import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réglages d'impression (issue #85).
 *
 * Une seule ligne (id = 1). Le seul réglage qui compte aujourd'hui est le
 * déclenchement automatique à l'affermissement : imprimer systématiquement
 * signifie sortir du papier sur un affermissement d'essai ou une erreur de
 * manipulation, et le papier ne se reprend pas.
 *
 * Défaut **`off`** : aucun effet physique tant que quelqu'un n'a pas décidé le
 * contraire en connaissance de cause. La réimpression explicite depuis le détail
 * OF reste disponible quel que soit ce réglage — c'est un geste, pas un
 * automatisme.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('print_settings', (t) => {
      t.increments('id')
      /**
       * 'off'    — jamais d'impression automatique.
       * 'single' — affermissement unitaire seulement (le geste est délibéré,
       *            l'utilisateur regarde le résultat).
       * 'all'    — unitaire ET groupé (N OF = N dossiers d'un coup).
       */
      t.string('auto_print_mode').notNullable().defaultTo('off')
      t.integer('updated_at').notNullable().defaultTo(0)
      t.string('updated_by').notNullable().defaultTo('')
    })
  }

  async down() {
    this.schema.dropTable('print_settings')
  }
}
