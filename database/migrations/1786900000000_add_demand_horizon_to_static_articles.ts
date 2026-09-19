import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'static_articles'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('demand_horizon').nullable()
      table.integer('demand_horizon_unit').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('demand_horizon')
      table.dropColumn('demand_horizon_unit')
    })
  }
}
