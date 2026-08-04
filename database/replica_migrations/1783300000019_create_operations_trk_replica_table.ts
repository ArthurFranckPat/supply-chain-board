import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Réplique MFGOPETRK (pointages de suivi de fabrication) — #119, lot 1.
 *
 * Source du PASSÉ constaté du cockpit poste : quantité déclarée par poste, heures
 * opératoires et réglage, rebut, sur 6 mois glissants (`syncOperationsTrk`,
 * cadence quotidienne dans `SCHEDULE`). Rien n'est exposé en l'état — la
 * sélection de la dernière opération quantifiée et l'agrégation par maille sont
 * le lot 2 (`app/domain/production_realisee.ts`).
 *
 * ## Colonnes ingérées, colonnes exposées
 *
 * `rejcplqty`, `empnum`, `x4panflg`, `x4arretprod`, `xequipe` sont ingérées mais
 * ne seront exposées par AUCUN lecteur en v1 (décision #119 : rebuts, pannes et
 * arrêts, production par opérateur hors périmètre — donnée nominative). Les
 * ingérer maintenant coûte rien et évite une ré-ingestion complète le jour où une
 * demande arrive ; le repository de lecture (`operations_trk_replica_repository`)
 * ne les sélectionne tout simplement pas. `x4panflg`/`x4arretprod` valent 0 sur
 * tous les pointages relevés depuis février 2026 (jamais alimentés en PROD),
 * `xequipe` vaut `8` partout — constaté dans l'issue, à reconfirmer avant tout
 * usage.
 *
 * ## Article produit
 *
 * `itmref` (MFGOPETRK.ITMREF_0) est documenté « Gamme » au dictionnaire X3 : pas
 * fiable comme article produit. `itmref_of` porte l'article de l'OF via
 * MFGITM (LEFT JOIN à l'extraction) — c'est lui que les lecteurs utilisent.
 * `itmref` reste ingérée pour pouvoir constater un jour qu'ils coïncident (ou
 * non), jamais exposée en attendant.
 *
 * ## Pas de clé primaire
 *
 * Aucune identité de ligne stable n'est démontrable : plusieurs pointages
 * portent le même couple (OF, opération) — déclarations partielles légitimes,
 * jusqu'à 6 opérations quantifiées relevées sur un même couple (OF, poste).
 * Une clé composite ferait disparaître des lignes en silence à l'insert
 * (`INSERT` simple lèverait, `OR REPLACE` écraserait). La table vit en SWAP
 * complet à chaque run, donc la clé n'a aucun rôle à jouer ; le rowid implicite
 * suffit. À reconfirmer sous X3 s'il existe un compteur/identifiant de pointage
 * — ce permettrait un jour une ingestion incrémentale vraie.
 *
 * L'index (cplwst, iptdat) sert la lecture principale du cockpit : « les
 * pointages de CE poste sur CETTE fenêtre », égalité stricte sur le poste.
 */
export default class extends BaseSchema {
  protected tableName = 'operations_trk_replica'

  async up() {
    this.schema.raw(`
      CREATE TABLE ${this.tableName} (
        num_of        TEXT    NOT NULL,
        openum        INTEGER NOT NULL,
        iptdat        TEXT    NOT NULL,
        cplwst        TEXT    NOT NULL,
        cplqty        REAL    NOT NULL,
        rejcplqty     REAL    NOT NULL,
        opetim        REAL    NOT NULL,
        settim        REAL    NOT NULL,
        itmref        TEXT    NOT NULL,
        itmref_of     TEXT,
        empnum        TEXT,
        x4panflg      INTEGER,
        x4arretprod   INTEGER,
        xequipe       TEXT
      ) STRICT
    `)
    this.schema.raw(`CREATE INDEX idx_operations_trk_wst_day ON ${this.tableName} (cplwst, iptdat)`)
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
