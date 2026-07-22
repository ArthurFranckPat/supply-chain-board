import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Impression du dossier d'OF (issue #85, lot 2) — routage + journal.
 *
 * Deux tables, deux rôles distincts :
 *  - `print_destinations` : QUELLE destination X3 pour quel atelier et quel
 *    document. Table de configuration, éditée par le métier.
 *  - `print_jobs` : CE QUI A ÉTÉ TIRÉ. Journal d'audit ET verrou d'idempotence —
 *    le papier ne se reprend pas, donc un OF déjà imprimé ne se réimprime que
 *    sur demande explicite.
 */
export default class extends BaseSchema {
  async up() {
    // --- Routage atelier × document → destination X3 --------------------------
    this.schema.createTable('print_destinations', (t) => {
      t.increments('id')
      /** STOLOC de l'atelier ; '' = règle par défaut (repli quand aucun atelier ne matche). */
      t.string('stoloc').notNullable().defaultTo('')
      /** Code état X3 : 'BONTRV' (bon de travail) | 'BSM' (bon de sortie matière). */
      t.string('doc_type').notNullable()
      /** Code destination `APRINTER.COD_0` (GESAIM). */
      t.string('dest_code').notNullable()
      /**
       * true = destination sans effet physique (fichier/mail/aperçu).
       * Défaut true : une règle fraîchement saisie ne sort pas de papier tant que
       * quelqu'un n'a pas décoché en connaissance de cause.
       */
      t.boolean('sandbox').notNullable().defaultTo(true)
      /** Libellé X3 recopié à la saisie — lisibilité de l'écran sans rappel X3. */
      t.string('dest_label').notNullable().defaultTo('')
      t.string('note').notNullable().defaultTo('')
      t.integer('updated_at').notNullable().defaultTo(0)
      t.string('updated_by').notNullable().defaultTo('')
    })
    // Une seule règle par atelier et par document — l'ambiguïté de routage
    // enverrait le même bon sur deux imprimantes.
    this.schema.raw(
      'CREATE UNIQUE INDEX print_destinations_stoloc_doc_unique ON print_destinations (stoloc, doc_type)'
    )

    // --- Journal des tirages --------------------------------------------------
    this.schema.createTable('print_jobs', (t) => {
      t.increments('id')
      t.string('of_num').notNullable()
      t.string('doc_type').notNullable()
      /**
       * Rang du tirage pour ce couple (OF, document) : 1 = tirage initial,
       * 2+ = réimpression explicite. L'index unique ci-dessous fait du rang le
       * verrou d'idempotence : un second tirage automatique retomberait sur 1 et
       * serait refusé par la base, pas seulement par le code applicatif.
       */
      t.integer('attempt').notNullable().defaultTo(1)
      t.string('stoloc').notNullable().defaultTo('')
      t.string('dest_code').notNullable()
      t.boolean('sandbox').notNullable().defaultTo(true)
      /** 'submitted' = X3 a accepté l'édition · 'failed' = refus/erreur. */
      t.string('status').notNullable()
      /** WRETCOD renvoyé par ZSOAPPRINT ('0' = appel passé). */
      t.string('ret_cod').notNullable().defaultTo('')
      /** WRETERMSG (cause du refus) ou message X3 de confirmation. */
      t.string('message').notNullable().defaultTo('')
      t.string('error').notNullable().defaultTo('')
      /** Entrée de pool X3 servie — corrélation avec les traces serveur. */
      t.string('pool_entry_idx').notNullable().defaultTo('')
      t.integer('duration_ms').notNullable().defaultTo(0)
      /** 'firm' (enchaîné sur l'affermissement) | 'manual' | 'test'. */
      t.string('origin').notNullable().defaultTo('manual')
      t.string('requested_by').notNullable().defaultTo('')
      t.integer('created_at').notNullable().defaultTo(0)
    })
    this.schema.raw(
      'CREATE UNIQUE INDEX print_jobs_of_doc_attempt_unique ON print_jobs (of_num, doc_type, attempt)'
    )
    this.schema.alterTable('print_jobs', (t) => {
      t.index(['created_at'], 'print_jobs_created_at_idx')
    })
  }

  async down() {
    this.schema.dropTable('print_jobs')
    this.schema.dropTable('print_destinations')
  }
}
