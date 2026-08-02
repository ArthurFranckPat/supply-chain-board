import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajout d'`itmsta` à `orders_flux_replica` (#105) — et retrait du filtre
 * `I.ITMSTA_0 = 1` de l'INGESTION, qui est la vraie correction.
 *
 * Le filtre venait des vues DEMANDE (`getOpenOrderLines`, `getOrderLinesForLoad`,
 * `RetardRepository`), qui ne veulent que des articles actifs. Posé dans le
 * `WHERE` commun de `buildOrdersSql`, il s'appliquait aussi à la tranche
 * WIPTYP=5 — alors qu'`X3OfRepository.getManufacturingOrders()`, la voie directe
 * que cette tranche mire, ne joint même pas `ITMMASTER`.
 *
 * Conséquence mesurée en PROD le 02/08/2026 : **118 OF FERMES absents de la
 * réplique**, tous sur des articles `ITMSTA_0 = 6`. Le board les affichait en
 * mode direct et les perdait en mode réplique — silencieusement, la seule panne
 * que ce chantier s'interdit.
 *
 * C'est le cas d'école de l'issue, une fois de plus : **on ingère la SOURCE et on
 * filtre à la LECTURE.** La colonne permet aux vues demande de reposer leur
 * filtre chez elles, où il appartient.
 *
 * Nullable À DESSEIN, et l'absence vaut ACTIF — contrairement à `stofcy` ou
 * `bprnum`, où l'absence valait « indéterminé ». La raison est démontrable :
 * avant cette migration l'ingestion ne gardait QUE `ITMSTA_0 = 1`, donc une ligne
 * sans `itmsta` a forcément un article actif. Traiter ce `null` comme inconnu
 * viderait les vues demande jusqu'au prochain swap complet.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_flux_replica'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN itmsta INTEGER`)
    this.schema.raw(
      `CREATE INDEX IF NOT EXISTS idx_orders_flux_itmsta ON ${this.tableName} (wiptyp, itmsta)`
    )
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_orders_flux_itmsta`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN itmsta`)
  }
}
