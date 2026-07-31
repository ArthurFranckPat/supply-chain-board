import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Les deux colonnes qui manquaient à `orders_flux_replica` pour absorber
 * `orders_replica` (#98, #105).
 *
 * ## Pourquoi consolider
 *
 * `orders_flux_replica` contient DÉJÀ ce que `orders_replica` (WIPTYP=5) et
 * `order_lines_replica` (WIPTYP=1) contiennent — mêmes lignes d'`ORDERS`, mêmes
 * filtres. Le tick allait donc chercher deux fois la même donnée dans X3 :
 *
 * ```
 * avant  orders 21,6 s + order_lines 16,5 s + stock 2,5 + receptions 0,9  = 41,5 s
 *        (+ orders-flux 60 s à la main)                                   = 101,5 s
 * après  orders-flux 60 s + stock 2,5 + receptions 0,9                    =  63,4 s
 * ```
 *
 * Moins cher que le tick actuel une fois `orders-flux` ajouté, et surtout une
 * seule vérité : deux tables alimentées séparément depuis la même source finissent
 * par diverger, et rien ne le signale.
 *
 * ## Ce qui manquait
 *
 * `buildOrdersSql` sert `fetchLive`, qui n'a jamais eu besoin de l'avancement d'un
 * OF : il lui suffit de savoir ce qui reste à produire. Le board, lui, affiche
 * lancé / réalisé / restant.
 *
 * - `qte_realisee` ← `CPLQTY_0`. `qte_commandee` porte déjà `EXTQTY_0`, que
 *   `ManufacturingOrder` nomme `quantityLaunched` — même champ X3, deux noms
 *   selon qu'on parle d'une commande ou d'un OF.
 * - `date_debut` ← `STRDAT_0`, la date de LANCEMENT, distincte de
 *   `date_echeance` (`ENDDAT_0`, la fin). `/programme` et `/charge` positionnent
 *   les OF sur le début.
 *
 * Nullable, comme partout ailleurs : les lignes WIPTYP 1 et 2 n'ont pas
 * d'avancement de production, et un `DEFAULT 0` ferait passer « sans objet » pour
 * « rien de réalisé ».
 */
export default class extends BaseSchema {
  protected tableName = 'orders_flux_replica'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN qte_realisee REAL`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN date_debut TEXT`)

    // `/programme` et `/charge` attaquent les OF par leur date de DÉBUT sur une
    // fenêtre courte — l'index sur (wiptyp, date_echeance) ne les sert pas.
    this.schema.raw(
      `CREATE INDEX idx_orders_flux_replica_wiptyp_debut
       ON ${this.tableName} (wiptyp, date_debut)`
    )
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_orders_flux_replica_wiptyp_debut`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN date_debut`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN qte_realisee`)
  }
}
