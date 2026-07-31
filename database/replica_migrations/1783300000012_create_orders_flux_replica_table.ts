import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique de la SOURCE `ORDERS` — le carnet complet des besoins et des
 * ressources — jointures de contexte comprises (#98, #105).
 *
 * ## Ce qu'elle corrige
 *
 * Trois tables dérivent déjà d'`ORDERS` et AUCUNE ne peut servir
 * `CombinedOrdersRepository.fetchLive()`, qui alimente `/suivi` :
 *
 * ```
 * orders_replica       WIPTYP=5 seul, 10 colonnes — ni WIPTYP, ni WIPSTA, ni VCRNUM
 * order_lines_replica  WIPTYP=1 seul
 * receptions_replica   miroir de PORDERQ — PAS de ORDERS WIPTYP=2
 * ```
 *
 * Chacune n'a gardé que la tranche de son premier appelant. Celle-ci mire la
 * source : tous les `WIPTYP` utiles, `WIPTYP_0`/`WIPSTA_0` en colonnes, et
 * chaque lecteur filtre.
 *
 * ## Les jointures sont ingérées, et c'est volontaire
 *
 * `partner_nom`, `pays`, `date_commande` (SORDER), `contremarque` (SORDERQ),
 * `bpcord`/`cusordref`/`itmrefbpc` (ITMBPC) viennent de `LEFT JOIN`.
 *
 * Dénormaliser à l'ingestion n'est PAS le piège corrigé en `1783300000011`. Ce
 * piège, c'est ce qui RETIRE de l'information : un filtre qui rétrécit la
 * population, une quantité agrégée qui ne se décompose plus. Un `LEFT JOIN`
 * n'enlève aucune ligne et ajoute des colonnes — il sert plus d'appelants, pas
 * moins. La règle à tenir : `LEFT` jamais `INNER`, et aucune agrégation.
 *
 * (`INNER JOIN ITMMASTER … ITMSTA_0 = 1` reste, lui, un vrai filtre de
 * population. Il est conservé parce qu'il est identique dans TOUTES les
 * requêtes ORDERS du projet — article inactif = hors périmètre partout.)
 *
 * ## La clé, et pourquoi VCRSEQ_0
 *
 * `(wiptyp, vcrnum, vcrlin, vcrseq)`. Les trois premières NE SUFFISENT PAS :
 * une commande ouverte porte plusieurs échéances sur la même ligne.
 * `COA2400006` ligne 1 (WIPTYP=2) en a SIX, de 20 000 chacune, réparties de
 * septembre 2026 à février 2027 — seul `VCRSEQ_0` les distingue. Une clé sans
 * lui les écraserait en une seule et ferait disparaître 100 000 unités
 * d'approvisionnement, sans erreur ni signal.
 *
 * Vérifié en PROD sur tout `ORDERS` WIPTYP 1/2/5 : `(WIPTYP, VCRNUM, VCRLIN)`
 * a des doublons, `(WIPTYP, VCRNUM, VCRLIN, VCRSEQ)` n'en a aucun.
 *
 * `VCRSEQ_0` n'était sélectionnée par aucune requête du projet avant cette
 * table — le chemin X3 direct ne dédoublonne pas, donc le problème n'existait
 * pas pour lui.
 *
 * ## Dates en TEXT ISO
 *
 * `date_echeance` et `date_commande` en `YYYY-MM-DD`, comme les autres
 * répliques : l'ordre lexicographique vaut l'ordre chronologique, donc les
 * bornes de fenêtre se comparent en SQL sans conversion.
 */
export default class extends BaseSchema {
  protected tableName = 'orders_flux_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        wiptyp        INTEGER NOT NULL,
        wipsta        INTEGER NOT NULL,
        vcrnum        TEXT NOT NULL,
        vcrlin        TEXT NOT NULL,
        vcrseq        TEXT NOT NULL,
        article       TEXT NOT NULL,
        designation   TEXT,
        date_echeance TEXT,
        qte_restante  REAL NOT NULL,
        qte_commandee REAL NOT NULL,
        qte_allouee   REAL NOT NULL,
        partner_nom   TEXT,
        pays          TEXT,
        date_commande TEXT,
        contremarque  TEXT,
        bpcord        TEXT,
        cusordref     TEXT,
        itmrefbpc     TEXT,
        sohtyp        TEXT,
        PRIMARY KEY (wiptyp, vcrnum, vcrlin, vcrseq)
      ) STRICT
    `)

    // Toute lecture part du WIPTYP puis borne sur l'échéance — c'est la forme de
    // `fetchLive` (trois familles, une fenêtre). Même ordre de colonnes que
    // l'usage, comme `order_lines_replica`.
    this.schema.raw(
      `CREATE INDEX idx_orders_flux_replica_wiptyp_date
       ON ${this.tableName} (wiptyp, date_echeance)`
    )
    // Le matcher commande↔OF et la faisabilité attaquent par article.
    this.schema.raw(`CREATE INDEX idx_orders_flux_replica_article ON ${this.tableName} (article)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
