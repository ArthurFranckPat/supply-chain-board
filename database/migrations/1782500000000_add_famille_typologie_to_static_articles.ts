import { BaseSchema } from '@adonisjs/lucid/schema'

// Ajoute famille (YFAMSTAT7_0) + typologie (TSICOD_4) sur static_articles.
// Sert à la classification PP_830 / bouches BDH60 / modules hygro BDH10 (issue #42).
// Découverte métier 2026-06-28 : ces 2 champs ITMMASTER sont la source de vérité
// pour le marquage « consomme bouche » (l'ancien critère préfixe `BDH%` était faux).
export default class extends BaseSchema {
  protected tableName = 'static_articles'

  async up() {
    this.schema.alterTable(this.tableName, (t) => {
      t.string('famille').notNullable().defaultTo('') // YFAMSTAT7_0 (ESH, BDH, ...)
      t.string('typologie').notNullable().defaultTo('') // TSICOD_4 (ESH10-60, BDH60, BDH10, ...)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (t) => {
      t.dropColumn('famille')
      t.dropColumn('typologie')
    })
  }
}
