import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Marquage « cette table a pris une écriture X3 que la réplique n'a pas encore
 * vue » — le mécanisme de read-after-write (#98).
 *
 * Le problème : l'app écrit dans X3 (write-back #29, FIRMSUGG #31, création d'OF
 * par scan #86). Aujourd'hui l'invalidation par namespace rend l'écriture visible
 * immédiatement. Une réplique alimentée par poll, non : l'OF affermi n'y existe
 * pas avant le run suivant.
 *
 * La solution retenue : quand une écriture rend une table suspecte, les lectures
 * de cette table repartent sur la VOIE DIRECTE X3 jusqu'à ce qu'un run
 * d'ingestion complet ait démontré avoir vu l'écriture. Pas d'overlay à merger,
 * pas d'angle mort — pendant la fenêtre sale c'est X3 qui répond, donc les effets
 * de bord (allocations consommées par un affermissement, par exemple) sont
 * couverts eux aussi.
 *
 * La règle de confirmation ne demande aucune plomberie neuve :
 * `ingestion_log.started_at` est enregistré AVANT l'extraction, donc tout run
 * `ok` de portée `full` démarré après `dirty_since` a forcément vu l'écriture.
 *
 * Une ligne par table, écrasée à chaque marquage — on ne veut pas un historique
 * des écritures ici, seulement « depuis quand cette table est suspecte ».
 */
export default class extends BaseSchema {
  protected tableName = 'replica_dirty'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        table_name  TEXT NOT NULL PRIMARY KEY,
        dirty_since TEXT NOT NULL,
        reason      TEXT
      ) STRICT
    `)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
