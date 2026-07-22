import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Verdict du serveur d'édition sur un tirage (issue #85).
 *
 * `status` disait jusqu'ici ce que X3 avait accepté — pas ce que l'impression
 * était devenue. Ces colonnes portent le second verdict, lu sur l'API REST du
 * serveur d'édition, qui détecte les échecs invisibles côté X3 (file inexistante,
 * moteur Crystal en erreur).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('print_jobs', (t) => {
      /** 'ok' | 'error' | 'unknown' | 'pending' (pas encore interrogé). */
      t.string('server_verdict').notNullable().defaultTo('pending')
      /** Numéro de tâche du serveur d'édition (`rank`, celui de PSIMP). 0 = inconnu. */
      t.integer('job_rank').notNullable().defaultTo(0)
      /** Dernière étape observée (« … moteur d'impression crystal »). */
      t.string('job_phase').notNullable().defaultTo('')
      /** Cause d'un verdict non concluant, ou libellé de l'erreur serveur. */
      t.string('job_detail').notNullable().defaultTo('')
      /**
       * true quand `ok` est déduit de la disparition de la tâche plutôt que lu
       * sur un statut terminal — distinction à conserver : sans rétention côté
       * console, c'est le seul succès disponible, et il est plus faible.
       */
      t.boolean('verdict_inferred').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('print_jobs', (t) => {
      t.dropColumn('server_verdict')
      t.dropColumn('job_rank')
      t.dropColumn('job_phase')
      t.dropColumn('job_detail')
      t.dropColumn('verdict_inferred')
    })
  }
}
