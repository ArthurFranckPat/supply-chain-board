import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Suppression d'`orders_replica` et `order_lines_replica` (#105).
 *
 * `orders_flux_replica` les a absorbées (`57941a8`) : elle mire la SOURCE
 * `ORDERS` et contient leurs deux tranches (WIPTYP 5 et 1). Plus aucun lecteur
 * applicatif, plus dans `syncAll()`, plus dans `--only=` — les deux tables ne
 * servaient plus qu'à écrire des lignes que personne ne lit.
 *
 * Les tables existantes sont supprimées, leurs traces de journal et de salissure
 * purgées : une table morte n'a plus d'âge à afficher ni de `dirty` à lever.
 * Les fichiers `0000`/`0001`/`0011` qui les créaient sont retirés : une base
 * fraîche ne les recrée jamais.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_replica'

  async up() {
    for (const table of ['orders_replica', 'order_lines_replica']) {
      this.schema.raw(`DROP TABLE IF EXISTS ${table}`)
      this.schema.raw(`DELETE FROM ingestion_log WHERE table_name = '${table}'`)
      this.schema.raw(`DELETE FROM replica_dirty WHERE table_name = '${table}'`)
    }
  }

  async down() {
    // Pas de restauration : la population vit dans `orders_flux_replica`.
  }
}
