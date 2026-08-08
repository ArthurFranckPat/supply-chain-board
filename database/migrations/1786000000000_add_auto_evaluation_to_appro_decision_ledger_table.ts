import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Auto-évaluation du moteur d'explication (#138 lot 2).
 *
 * Le ledger de décisions est append-only : chaque action (vu / ignorer / à
 * passer) est une ligne nouvelle. En lot 2, on y fige aussi CE QUE LE MOTEUR
 * AVAIT DIT au moment de la décision — `cause_predit` (source dominante de la
 * corrélation), `confiance_predit` (confiance 0-1), `niveau_predit` (le badge
 * affiché : `directe` / `probable` / `correlation`) et `verdict_predit` (le
 * verdict du triage) — pour mesurer a posteriori la corrélation entre
 * l'explication et l'acceptation humaine.
 *
 * `niveau_predit` est le seul des quatre que l'acheteur VOIT. Sans lui,
 * l'auto-évaluation ne peut pas répondre à « les explications présentées comme
 * sûres sont-elles moins contredites que les autres ? » — la question de
 * calibrage la plus directe. Le rajouter plus tard laisserait un trou dans
 * l'historique : même argument que le lot 0 sur les messages.
 *
 * Sans cet instantané, l'auto-évaluation comparerait la décision à l'explication
 * ACTUELLE, qui a pu changer depuis — le taux d'override ne mesurerait plus la
 * qualité du moteur, mais la dérive du CBN.
 *
 * `verdict_predit` est ce qui rend le taux d'override calculable DEPUIS LE
 * LEDGER SEUL (`estOverride(verdict, statut)`) : sans lui, il faudrait
 * recharger la file X3 et la trier à nouveau pour savoir si « ignorer »
 * contredit le verdict — un calcul qui dépendrait de l'état courant du CBN,
 * pas de celui qui existait à la décision.
 *
 * Les colonnes sont nullable : une décision sur une suggestion ou sur un
 * message non expliqué n'a pas de prédiction à figer.
 */
export default class extends BaseSchema {
  protected tableName = 'appro_decision_ledger'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /** Source dominante de la corrélation (stock, demande_ferme, appro, …). */
      table.string('cause_predit', 24).nullable()
      /** Confiance 0-1 de l'explication au moment de la décision. */
      table.double('confiance_predit').nullable()
      /** Niveau affiché à l'acheteur (directe, probable, correlation). */
      table.string('niveau_predit', 16).nullable()
      /** Verdict du triage au moment de la décision (passer, replanifier, …). */
      table.string('verdict_predit', 16).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('verdict_predit')
      table.dropColumn('niveau_predit')
      table.dropColumn('cause_predit')
      table.dropColumn('confiance_predit')
    })
  }
}
