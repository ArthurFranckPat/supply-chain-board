import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Photo quotidienne des messages de replanification du CBN (#138, lot 0).
 *
 * `ApproRepository.fetch()` extrayait déjà les messages (`messagesSql`), mais
 * la photo du besoin les jetait : seules les suggestions étaient figées. Sans
 * historique des messages, aucune des questions du module v2 n'a de réponse —
 * « ce message est-il nouveau ? », « le décalage demandé a-t-il grandi ? »,
 * « existait-il la semaine dernière ? ». X3 n'autorise aucun rattrapage
 * rétroactif : chaque jour sans photo est un jour d'historique perdu.
 *
 * ## Pourquoi une table dédiée et non une source de plus dans `demand_snapshots`
 *
 * Un message porte deux champs que les autres populations n'ont pas : le CODE
 * du message (`MRPMES_0` — 2 avancer / 3 retarder / 6 inutile) et la date
 * PROPOSÉE par le CBN (`MRPDAT_0`), distincte de l'échéance actuelle de la
 * commande (`ENDDAT_0`). Les loger en colonnes nullable de `demand_snapshots`
 * rendrait la table illisible pour les huit autres sources, qui ne les
 * remplissent jamais.
 *
 * ## L'identité d'une ligne, c'est TROIS colonnes, pas deux
 *
 * L'affichage de la file (#107) désigne un message par `VCRNUM:VCRLIN` — stable
 * d'un run CBN à l'autre, contrairement aux suggestions recréées chaque nuit.
 * Ça suffit à un écran qui agrège par article ; ça ne suffit pas à une photo.
 * `VCRSEQ_0` est la 4ᵉ composante de l'identité d'une ligne d'`ORDERS` (cf.
 * `combined_orders_repository.ts`) et la seule qui la rende unique : mesuré le
 * 06/08/2026 sur la population de `messagesSql`, 777 lignes pour **773**
 * couples `(VCRNUM, VCRLIN)` — `COA2400006` ligne 1 porte cinq messages
 * « inutile » que seule la séquence distingue.
 *
 * Sans `vcrseq`, ces cinq lignes seraient strictement indiscernables en base et
 * le diff du lot 1 verrait « 5 puis 4 » sans jamais savoir laquelle a été
 * soldée — de l'historique inexploitable, et irrécupérable puisque X3 ne
 * versionne rien.
 *
 * ## Pourquoi pas de contrainte UNIQUE malgré ça
 *
 * L'unicité de `(vcrnum, vcrlin, vcrseq)` est vérifiée sur `ORDERS` entier,
 * mais elle reste une propriété des DONNÉES, pas du schéma X3. Si elle tombait
 * en défaut une seule nuit, la contrainte ferait échouer la transaction et on
 * perdrait la photo ENTIÈRE — exactement ce que ce lot cherche à empêcher. Une
 * ligne dupliquée se repère et s'ignore ; une nuit manquée, jamais.
 * L'idempotence vient du service (swap par `snapshot_date`), même choix que
 * `demand_snapshots`.
 */
export default class extends BaseSchema {
  protected tableName = 'appro_message_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.date('snapshot_date').notNullable()
      /** `VCRNUM_0` — numéro de commande fournisseur. */
      table.string('vcrnum', 20).notNullable()
      /** `VCRLIN_0` — ligne de la commande. */
      table.integer('vcrlin').notNullable()
      /** `VCRSEQ_0` — séquence, 3ᵉ composante de l'identité (cf. docstring). */
      table.string('vcrseq', 10).notNullable()
      table.string('itmref', 20).notNullable()
      table.string('fournisseur', 80).nullable()
      /** `MRPMES_0` : 2 = avancer, 3 = retarder, 6 = inutile (annuler). */
      table.integer('mrpmes').notNullable()
      /** `MRPDAT_0` — date proposée par le CBN. Absente sur « inutile ». */
      table.date('mrpdat').nullable()
      /** `ENDDAT_0` — échéance actuelle de la commande. */
      table.date('enddat').nullable()
      table.double('quantity').notNullable()

      table.timestamp('created_at')
    })

    this.schema.raw(
      `CREATE INDEX idx_appro_message_snapshots_date ON ${this.tableName} (snapshot_date)`
    )
    // Couvre la lecture « l'historique de CETTE ligne de commande », qui est la
    // question du diff des messages (lot 1) : la clé COMPLÈTE d'abord, la date
    // ensuite.
    this.schema.raw(
      `CREATE INDEX idx_appro_message_snapshots_key ON ${this.tableName} (vcrnum, vcrlin, vcrseq, snapshot_date)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
