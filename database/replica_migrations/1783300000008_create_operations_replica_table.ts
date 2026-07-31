import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique MFGOPE (pointages d'opérations) — #98, suite lot 3.
 *
 * Miroir de `X3OperationRepository.getOperations(numOfs)`, scopée aux `num_of` déjà
 * présents dans `orders_replica` (tranche utile ORDERS — WIPTYP=5, WIPSTA 1/2/3,
 * lookback 90 j). Ingérée juste après `syncOrders()` dans `syncAll()`, en relisant
 * la liste de `num_of` depuis la réplique elle-même plutôt que de refaire un appel
 * X3 : la table est écrite dans le même run, donc à jour.
 *
 * Un OF hors de ce périmètre (ex. `controle_prod_loader`, qui interroge aussi les
 * MFGITM ouverts absents du live) n'a PAS sa réplique servie — reste X3 direct,
 * comme documenté dans le repository de lecture.
 *
 * Grain : une ligne MFGOPE = un OF × une opération de gamme (`num_of, openum`).
 */
export default class extends BaseSchema {
  protected tableName = 'operations_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        num_of  TEXT    NOT NULL,
        openum  INTEGER NOT NULL,
        cplqty  REAL    NOT NULL,
        opesta  TEXT    NOT NULL,
        extqty  REAL    NOT NULL,
        PRIMARY KEY (num_of, openum)
      ) STRICT
    `)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
