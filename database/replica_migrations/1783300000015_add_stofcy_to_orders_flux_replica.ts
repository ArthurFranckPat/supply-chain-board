import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajout de `stofcy` à `orders_flux_replica` (#105).
 *
 * La résolution des clés d'affermissement (issue #31) a besoin du SITE d'un
 * ordre (`STOFCY_0`, exigé par le sous-programme FUNMAUTR). La table mire la
 * SOURCE `ORDERS` — le site y est, il manquait à la réplique. Sans lui, la
 * lecture réplique ne pouvait pas remplacer `X3SuggestionRepository` en mode
 * réplique.
 *
 * Nullable à dessein : les lignes ingérées AVANT cette migration n'ont pas de
 * site. La lecture le traite comme « inconnu » et retombe sur X3 pour cet
 * ordre, plutôt que d'affermir sur un site vide.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_flux_replica'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN stofcy TEXT`)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN stofcy`)
  }
}
