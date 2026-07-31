import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique STOCK au grain LIGNE (article × emplacement) — #98, suite lot 3.
 *
 * PAS un doublon de `stock_replica` : celle-ci est déjà agrégée au grain article
 * (physique/contrôle qualité/rebut/alloué) pour le board. L'estimateur de
 * conditionnement (`ConditionnementRepository.getStockSrmParArticle()`) a besoin du
 * détail par emplacement (`LOC_0`) — SM* (stockage, fiable) vs S*P/CLP
 * (consommation, qté variable) — pour faire porter son consensus de dominance
 * uniquement sur les SM*. Deux besoins différents, deux tables.
 *
 * C'est le vrai goulot conditionnement : requête ~45k lignes, `ZSOAPSQL` O(n²),
 * connue pour timeout côté X3 avant le déploiement du fix 4GL (cf. dégradation
 * `Promise.allSettled` dans `ConditionnementRepository.getObservations()`) — pas
 * `getStojouRangements()`, bornée à ~3 lignes/article par un `ROW_NUMBER` et jamais
 * un problème de performance.
 *
 * Swap complet, comme les autres tables `_replica`. `AUUID_0` (clé primaire du
 * modèle `Stock`) donne une identité de ligne stable pour le `--compare`.
 */
export default class extends BaseSchema {
  protected tableName = 'stock_detail_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        uuid    TEXT NOT NULL PRIMARY KEY,
        article TEXT NOT NULL,
        loc     TEXT NOT NULL,
        qte     REAL NOT NULL
      ) STRICT
    `)

    this.schema.raw(`CREATE INDEX idx_stock_detail_replica_article ON ${this.tableName} (article)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
