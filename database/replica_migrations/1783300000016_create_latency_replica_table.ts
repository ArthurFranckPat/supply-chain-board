import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique des événements de réception PORDERQ qui alimentent la latence
 * fournisseur (PRD §8.6, #105).
 *
 * Miroir de `X3LatencyRepository.getLatencyEvents()` : les lignes PORDERQ
 * CLÔTES (EXTRCPDAT_0 et LASRCPDAT_0 renseignées), 180 jours glissants, coupées
 * aux 5 000 réceptions les plus récentes. C'est une population DISTINCTE de
 * `receptions_replica`, qui ne garde que les lignes OUVERTES (QTYSTU >
 * RCPQTYSTU) — une latence ne s'observe que sur ce qui a été reçu.
 *
 * Pas de clé primaire : le swap complet (`DELETE` + `INSERT` dans `ingest()`)
 * remplace tout à chaque run, et rien ne garantit l'unicité d'un triplet
 * (article, prévu, réel) — deux lignes de commande peuvent porter les mêmes
 * dates. Les colonnes sont NOT NULL : une date X3 à 0 est écartée à la lecture,
 * pas stockée (cf. `isoDay`).
 *
 * Cadence PROPRE de 6 h (`SCHEDULE`, cf. `replica_sync_provider`) et non le tick
 * de 5 min : la requête est pourtant peu chère (ROWNUM ≤ 5000, ~1 s), c'est la
 * donnée qui ne mérite pas douze passages par heure — moyenne glissante sur
 * 180 jours, consommée derrière un cache de 2 h.
 */
export default class extends BaseSchema {
  protected tableName = 'latency_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        article      TEXT NOT NULL,
        date_prevue  TEXT NOT NULL,
        date_reelle  TEXT NOT NULL
      ) STRICT
    `)

    this.schema.raw(`CREATE INDEX idx_latency_replica_article ON ${this.tableName} (article)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
