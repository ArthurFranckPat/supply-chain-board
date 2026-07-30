import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique du flux STOJOU dédoublonné par document (#98, lot 3 — scoping du
 * 30/07/2026). Sert `stock_valuation_repository.getStockValuationKpi()`
 * uniquement — PAS `conditionnement_repository` (besoin de lignes brutes
 * récentes par article, pas d'un agrégat, cf. commentaire GitHub #98).
 *
 * Grain : (article, jour, document) — mirroir exact du sous-`GROUP BY` de
 * `buildFluxSql` (`ITMREF_0, TRUNC(IPTDAT_0), VCRTYP_0, VCRNUM_0`), le stade
 * qui neutralise les contrepassations/reclassements. La deuxième agrégation
 * (par période, mois OU semaine) se fait à la LECTURE — c'est ce qui permet à
 * une seule réplique de servir les deux grains sans choix figé à l'ingestion.
 *
 * Fenêtre glissante 12 mois (= `defaultStockRange('mois', ...)`), swap complet
 * comme `orders_replica`/`stock_replica` — mesuré en prod : ~50-55k lignes/mois
 * pleine échelle site AE1 (cf. commentaire GitHub #98), donc ~600k lignes/12
 * mois. Pas un problème de taille pour SQLite ; le swap re-fetch tout le
 * fenêtre à chaque run, chunké par semaine côté extraction X3 (cf.
 * `StockFluxRepository`) pour rester sous le seuil SOAP (`resultXml` nil
 * au-delà d'un certain volume par appel, même motif que le chunk par article
 * de `buildFluxSql`).
 */
export default class extends BaseSchema {
  protected tableName = 'stock_flux_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        article  TEXT NOT NULL,
        jour     TEXT NOT NULL,
        vcrtyp   TEXT NOT NULL,
        vcrnum   TEXT NOT NULL,
        net_doc  REAL NOT NULL,
        PRIMARY KEY (article, jour, vcrtyp, vcrnum)
      ) STRICT
    `)

    // Toute lecture filtre par article puis borne sur jour (plage période) —
    // même ordre que `order_lines_replica`.
    this.schema.raw(
      `CREATE INDEX idx_stock_flux_replica_article_jour ON ${this.tableName} (article, jour)`
    )
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
