import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajout de `bprnum` à `orders_flux_replica` (#105).
 *
 * La vue /charge (`OrderLineForLoad.clientCode`) a besoin du CODE tiers brut de
 * la ligne (`BPRNUM_0`) — pas du nom résolu, résolu à la demande par
 * `resolveClientNames`. La table mire la SOURCE `ORDERS` : le code y est, il
 * manquait à la réplique.
 *
 * Nullable à dessein : les lignes ingérées AVANT cette migration n'ont pas de
 * code tiers. La lecture rend alors `clientCode: null`, comme la voie directe
 * sur une ligne sans BPRNUM — pas de fabrication de code.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_flux_replica'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN bprnum TEXT`)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN bprnum`)
  }
}
