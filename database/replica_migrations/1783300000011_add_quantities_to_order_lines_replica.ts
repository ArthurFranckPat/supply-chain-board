import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Les trois quantités BRUTES d'une ligne de commande, et l'élargissement de la
 * population ingérée qui va avec.
 *
 * ## Le défaut corrigé
 *
 * `order_lines_replica` était le miroir d'un CONSOMMATEUR
 * (`X3OrderLineRepository.getOpenOrderLines()`), pas de sa SOURCE (`ORDERS`).
 * Elle héritait donc des choix de ce consommateur :
 *
 *  - une seule quantité, `quantite` = reste à FABRIQUER = `RMNEXTQTY_0 − ALLQTY_0`
 *    (cf. `app/domain/models/orders_qty.ts`) ;
 *  - le filtre d'ingestion `resteAFabriquer > 0`.
 *
 * Conséquence : aucun autre appelant ne pouvait s'en servir. `RetardRepository`
 * a besoin des trois quantités séparément (il déduit lui-même le stock alloué)
 * et filtre sur `RMNEXTQTY_0 > 0`. Une ligne entièrement allouée
 * (`RMNEXTQTY_0 = ALLQTY_0 = 10`) donne `resteAFabriquer = 0` : elle était
 * ABSENTE de la réplique et PRÉSENTE dans le périmètre du retard — c'est-à-dire
 * exactement la population que ce KPI existe pour traiter.
 *
 * ## La règle qui en découle
 *
 * **Une réplique mire une SOURCE, pas une vue.** On ingère large et on filtre à
 * la lecture ; l'inverse enferme la table dans son premier appelant. Le filtre
 * `resteAFabriquer > 0` vit désormais dans
 * `OrderLinesReplicaRepository.getOpenOrderLines()`, où il reproduit à
 * l'identique le contrat rendu aux appelants existants.
 *
 * ## Nullable, pas de défaut numérique
 *
 * Les lignes déjà ingérées n'ont pas ces valeurs et ne peuvent pas les inventer :
 * un `DEFAULT 0` ferait passer « inconnu » pour « rien à livrer », et le retard
 * en tirerait des quantités fausses. `NULL` force la ré-ingestion à les remplir
 * et rend l'absence détectable. Le premier `syncOrderLines` qui suit cette
 * migration les renseigne toutes (swap complet).
 */
export default class extends BaseSchema {
  protected tableName = 'order_lines_replica'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN qte_restante REAL`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN qte_commandee REAL`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN qte_allouee REAL`)
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN qte_allouee`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN qte_commandee`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN qte_restante`)
  }
}
