import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Préférences de vues (pages + sous-vues) par utilisateur.
 *
 * Colonne TEXT nullable portant un JSON sérialisé, suivant exactement le patron
 * de `users.dashboard_layout` : tant que l'utilisateur n'a rien personnalisé,
 * la colonne reste NULL et le code retourne `DEFAULT_VIEW_PREFS` (tout visible).
 * Une seule colonne, pas une table de jointure : la préférence est un petit
 * document par utilisateur, lu à chaque page (partagé par Inertia).
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('view_prefs').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('view_prefs')
    })
  }
}
