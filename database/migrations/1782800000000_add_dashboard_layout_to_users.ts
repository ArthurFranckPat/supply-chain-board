import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Préférences de disposition du tableau de bord (par utilisateur).
 *
 * On persiste le layout (ordre, visibilité, largeur des KPI + ordre d'impression)
 * comme JSON sérialisé dans un TEXT, suivant le même patron que
 * `scenarios.mutations`. Tant que l'utilisateur n'a pas personnalisé sa page,
 * la colonne reste NULL et le code retourne `DEFAULT_DASHBOARD_LAYOUT`.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('dashboard_layout').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('dashboard_layout')
    })
  }
}
