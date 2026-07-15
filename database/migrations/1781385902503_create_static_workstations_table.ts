import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'static_workstations'

  async up() {
    this.schema.createTable(this.tableName, (t) => {
      t.increments('id')
      t.string('code').notNullable() // WST_0
      t.string('description').notNullable().defaultTo('') // WSTDES_0
      t.integer('wsttyp').notNullable().defaultTo(1) // 1=machine 2=main d'œuvre 3=sous-traitance
      t.integer('wstnbr').notNullable().defaultTo(1) // nombre d'exemplaires (shifts // ressources //)
      t.float('eff').notNullable().defaultTo(100) // efficience %
      t.float('use_pct').notNullable().defaultTo(100) // utilisation %
      t.float('shr').notNullable().defaultTo(0) // perte %
      t.string('twd').notNullable().defaultTo('') // schéma horaire (FK TABWEEDIA)
      // Capacité (h) par jour, dénormalisée depuis TABWEEDIA.DAYCAP_0..6 (Lun→Dim).
      t.float('daycap_0').notNullable().defaultTo(0)
      t.float('daycap_1').notNullable().defaultTo(0)
      t.float('daycap_2').notNullable().defaultTo(0)
      t.float('daycap_3').notNullable().defaultTo(0)
      t.float('daycap_4').notNullable().defaultTo(0)
      t.float('daycap_5').notNullable().defaultTo(0)
      t.float('daycap_6').notNullable().defaultTo(0)
      // Rattachement atelier (issue #36).
      t.string('stoloc').notNullable().defaultTo('') // STOLOC_0 — emplacement / atelier
      t.string('wcr').notNullable().defaultTo('') // WCR_0 — centre de charge
      t.string('wcrfcy').notNullable().defaultTo('') // WCRFCY_0 — site de fabrication
      t.integer('synced_at').notNullable().defaultTo(0)
    })
    this.schema.raw(
      'CREATE UNIQUE INDEX static_workstations_code_unique ON static_workstations (code)'
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
