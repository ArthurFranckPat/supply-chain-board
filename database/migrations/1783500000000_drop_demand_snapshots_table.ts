import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Suppression de la photo quotidienne du besoin (#74, jamais livrée).
 *
 * La table n'a JAMAIS eu de lecteur. Le lot 1 de #74 l'écrivait — 8 populations
 * par jour, swap transactionnel par date — et le lot 2, le diff et l'UI qui
 * devaient l'exploiter, n'a pas été commencé. Le test unitaire du service le
 * disait explicitement : « table dédiée neuve (pas encore lue par l'app) ».
 * Elle a cessé d'être alimentée le 10/08/2026 : 12 photos au total, du 30/07 au
 * 10/08, 396 204 lignes, exportées en CSV avant cette migration.
 *
 * Le coût de la garder n'était pas le stockage : c'était que
 * `DemandSnapshotService.buildRows()` consommait TOUTES les suggestions du CBN
 * de `boardDataset.getOrders()`, sans borne d'horizon. C'était le seul
 * consommateur qui justifiait que `board:orders` remonte jusqu'à J+365 — 87 %
 * de suggestions, dont 5 471 lignes au-delà de J+180 — rechargées ~180 fois par
 * jour par le warmer pour alimenter une table que rien ne lisait.
 *
 * La migration de création est CONSERVÉE volontairement : une base neuve crée
 * la table puis la supprime, une base existante la supprime seulement. Effacer
 * la création à la place laisserait une table orpheline dans toutes les bases
 * déjà migrées, invisible au code comme au schéma.
 *
 * Si #138 (expliquer les messages de replanification du CBN) reprend ce
 * principe, il faudra recapturer : l'historique d'une prévision est
 * irrécupérable rétroactivement, X3 ne versionne rien. Et la capture devra
 * aller chercher son propre pool long, pas le faire payer à chaque
 * rafraîchissement de board.
 */
export default class extends BaseSchema {
  protected tableName = 'demand_snapshots'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
    // Pas de reconstruction : recréer une table vide ne rendrait pas les photos,
    // et le service qui les produisait n'existe plus. Le CSV archivé est la
    // seule trace, et il n'a pas de lecteur à qui être rendu.
  }
}
