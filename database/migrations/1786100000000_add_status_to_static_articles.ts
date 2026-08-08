import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Statut article (`ITMMASTER.ITMSTA_0`, menu local 246) dans le référentiel local.
 *
 * `static_articles` ne contenait que les articles ACTIFS (`ITMSTA_0 = 1` posé
 * dans le `WHERE` du sync). Conséquence mesurée le 08/08/2026 : un article qui
 * passe « Non utilisable » SORT du référentiel, et devient donc invisible au
 * filtre de catégorie Z — qui se résout précisément via cette table. Les 106
 * références `ET####` (toutes en catégorie `ZHE`, statut 6) traversaient la
 * frise des drivers sans désignation, sans famille et sans être écartées : le
 * garde-fou se dégradait tout seul sur la population qu'il vise.
 *
 * Le référentiel accueille donc TOUS les articles, statut compris (6 548 actifs
 * + 6 331 non utilisables en PROD). Les consommateurs qui veulent le seul parc
 * vivant posent désormais un filtre EXPLICITE (`statusActif()` dans
 * `StaticSyncService`) plutôt que de s'en remettre à un `WHERE` d'ingestion
 * invisible depuis leur code.
 *
 * Défaut `1` : les lignes déjà en base viennent toutes d'un sync qui ne
 * ramenait que des actifs — le défaut décrit donc l'existant, il ne l'invente
 * pas. Le premier `sync:x3` réécrit la table en entier de toute façon.
 */
export default class extends BaseSchema {
  protected tableName = 'static_articles'

  async up() {
    this.schema.alterTable(this.tableName, (t) => {
      t.integer('status').notNullable().defaultTo(1)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (t) => {
      t.dropColumn('status')
    })
  }
}
