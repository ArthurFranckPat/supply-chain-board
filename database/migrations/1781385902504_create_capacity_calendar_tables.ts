import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Fermetures saisies (maintenance, congés…) par ligne — issue #37.
    this.schema.createTable('capacity_closures', (t) => {
      t.increments('id')
      t.string('scope').notNullable() // 'global' | 'wst' | 'stoloc'
      t.string('code').notNullable().defaultTo('') // WST ou STOLOC (vide si global)
      t.string('date_from').notNullable() // ISO YYYY-MM-DD (inclus)
      t.string('date_to').notNullable() // ISO YYYY-MM-DD (inclus)
      t.string('motif').notNullable().defaultTo('') // 'maintenance' | 'conges' | 'autre' libellé
      t.float('factor').notNullable().defaultTo(0) // 0 = fermé, 0.5 = demi-journée, 1 = ouvert
      t.integer('created_at').notNullable().defaultTo(0)
    })
    this.schema.alterTable('capacity_closures', (t) => {
      t.index(['scope', 'code'], 'capacity_closures_scope_code_idx')
    })

    // Surcharges des jours fériés (désactiver un férié = jour travaillé) — issue #37.
    this.schema.createTable('capacity_holiday_overrides', (t) => {
      t.increments('id')
      t.string('date').notNullable() // ISO YYYY-MM-DD du férié
      t.boolean('active').notNullable().defaultTo(true) // false = férié neutralisé (on travaille)
    })
    this.schema.raw(
      'CREATE UNIQUE INDEX capacity_holiday_overrides_date_unique ON capacity_holiday_overrides (date)'
    )
  }

  async down() {
    this.schema.dropTable('capacity_closures')
    this.schema.dropTable('capacity_holiday_overrides')
  }
}
