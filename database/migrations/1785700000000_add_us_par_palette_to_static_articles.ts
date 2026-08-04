import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * ITMMASTER.PCUSTUCOE_1 (US par palette) sur static_articles (#119, lot 6).
 *
 * Le cockpit affiche l'équivalent palette de la production via `calcPalettes`
 * (`app/domain/receptions.ts`) ; le coefficient doit venir du miroir statique
 * pour que la page reste 100 % réplique/statique, sans requête X3 en ligne.
 * Nullable : un article sans coefficient n'a PAS « 0 palette » — c'est une
 * absence de donnée (critère d'acceptation #119).
 *
 * La colonne existe dans deux repositories X3 du repo (`expedition_repository`,
 * `reception_repository`) sous le même nom ITMMASTER.PCUSTUCOE_1.
 */
export default class extends BaseSchema {
  protected tableName = 'static_articles'

  async up() {
    this.schema.alterTable(this.tableName, (t) => {
      t.float('us_par_palette').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (t) => {
      t.dropColumn('us_par_palette')
    })
  }
}
