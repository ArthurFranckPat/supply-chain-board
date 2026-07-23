import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Documents du dossier d'OF (issue #85) — le couple d'états devient une donnée.
 *
 * `BONTRV` et `BSM` étaient écrits en dur, hérités du dossier de test. Sur prod
 * le bon de travail est en réalité l'état `RECETTE` (Crystal `ZRECETTE2`) : le
 * couple dépend du dossier, et un code d'état n'a pas sa place dans un type
 * TypeScript.
 *
 * Le code est celui de `GESARP`, tel quel — l'application ne traduit rien, elle
 * le passe à `ZSOAPPRINT`. Le libellé est métier : l'atelier ne parle pas en
 * codes X3.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('print_documents', (t) => {
      t.increments('id')
      /** Code état `AREPORT.RPTCOD` (GESARP). Unique : c'est la clé de routage. */
      t.string('code').notNullable().unique()
      t.string('label').notNullable().defaultTo('')
      /** Ordre d'impression du dossier — le bon de travail avant le bon matière. */
      t.integer('position').notNullable().defaultTo(0)
      /** Désactiver plutôt que supprimer : le journal garde des tirages passés. */
      t.boolean('active').notNullable().defaultTo(true)
      t.integer('updated_at').notNullable().defaultTo(0)
      t.string('updated_by').notNullable().defaultTo('')
    })

    // Couple retenu sur AE1, vérifié en imprimant : RECETTE puis BSM.
    // Les règles de routage existantes portant l'ancien code `BONTRV` sont
    // laissées telles quelles — les réécrire changerait un routage sans que
    // personne ne l'ait décidé. L'écran de configuration les signale.
    this.defer(async (db) => {
      const now = Math.floor(Date.now() / 1000)
      await db.table('print_documents').multiInsert([
        { code: 'RECETTE', label: 'Bon de travail', position: 1, active: true, updated_at: now, updated_by: '' },
        { code: 'BSM', label: 'Bon de sortie matière', position: 2, active: true, updated_at: now, updated_by: '' },
      ])
    })
  }

  async down() {
    this.schema.dropTable('print_documents')
  }
}
