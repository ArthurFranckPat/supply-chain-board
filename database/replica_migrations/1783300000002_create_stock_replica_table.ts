import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique du stock courant (ITMMVT × ITMMASTER actifs), au grain ARTICLE.
 *
 * On stocke les COMPOSANTES brutes (physique, contrôle qualité, rebut,
 * allocations) et non le `Flow[]` exposé aujourd'hui par
 * `X3StockRepository.getStockFlows()`. Deux raisons :
 *
 * 1. l'éclatement en flows est une décision de présentation — un flow par
 *    sous-type, seulement si la quantité est > 0. Répliquer le résultat
 *    interdirait toute requête que cette découpe n'anticipe pas ;
 * 2. `strict = physique − alloué physique − alloué global` est un calcul, pas une
 *    donnée. Le garder dérivable laisse la règle modifiable sans réingestion.
 *
 * Rappel de la décision assumée du projet : le stock de statut Q (contrôle
 * qualité) compte comme disponible côté faisabilité. La colonne est distincte
 * pour que cette décision reste révisable en SQL, sans nouvelle ingestion.
 */
export default class extends BaseSchema {
  protected tableName = 'stock_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        article        TEXT NOT NULL PRIMARY KEY,
        physique       REAL NOT NULL,
        controle_qual  REAL NOT NULL,
        rebut          REAL NOT NULL,
        alloue_phys    REAL NOT NULL,
        alloue_global  REAL NOT NULL,
        pmp            REAL
      ) STRICT
    `)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
