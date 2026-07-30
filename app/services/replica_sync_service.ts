import db from '@adonisjs/lucid/services/db'
import { X3OfRepository } from '#repositories/of_repository'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import replicaGate, { type ReplicaTable } from '#services/replica_gate'

/**
 * Ingestion X3 → réplique SQLite locale (issue #98, lot 1).
 *
 * Un seul écrivain (ce service), beaucoup de lecteurs. L'app ne lit PAS encore la
 * réplique : ce lot la remplit et la rend observable, rien d'autre. La bascule des
 * lectures est le lot 2.
 *
 * ## Pourquoi un service distinct de `StaticSyncService`
 *
 * L'issue dit « étendre StaticSyncService ». Elle dit aussi « deux fichiers, pas
 * un » — et les deux exigences se contredisent : `StaticSyncService` écrit sur la
 * connexion `sqlite` (base applicative), la réplique vit sur la connexion
 * `replica` (fichier séparé, cf. `config/database.ts`). Les mélanger rendrait
 * invisible l'invariant qui justifie le second fichier : un écrivain par fichier.
 * Le motif d'origine (swap complet, tableau de lignes, chunks d'insert) est
 * conservé.
 *
 * ## Pourquoi un swap complet et non un merge incrémental
 *
 * Pas d'abord pour la vitesse : pour la COHÉRENCE. `ORDERS` est un produit de
 * batch — l'essentiel de la tranche utile est constitué de suggestions, c'est-à-dire
 * la sortie du CBN, reconstruites à chaque run et sans identité stable. Un merge
 * incrémental sur une table régénérée par lots donne une vue déchirée, moitié run
 * N moitié run N+1. Un swap donne un instantané attribuable à un run.
 *
 * ## Pourquoi les repositories plutôt que du SQL neuf
 *
 * Les repositories portent les règles durement acquises — lookback 90 j,
 * `ROUALT_0 = 1`, exclusion des composants Z, sémantique WIPTYP × WIPSTA,
 * redécoupage des lots sur `resultXml is nil`. Réécrire le SQL ici les
 * réintroduirait une par une, sous forme de bugs.
 */

/** Taille des lots d'insert. Au-delà, SQLite dépasse sa limite de variables liées. */
const INSERT_CHUNK = 400

export type IngestionStatus = 'ok' | 'failed'

export interface TableIngestionResult {
  table: string
  status: IngestionStatus
  rows: number
  durationMs: number
  error?: string
}

export interface ReplicaSyncResult {
  results: TableIngestionResult[]
  durationMs: number
}

export interface ReplicaFreshness {
  table: string
  status: IngestionStatus
  startedAt: string
  finishedAt: string | null
  rows: number | null
  durationMs: number | null
  ageMs: number | null
}

type Row = Record<string, string | number | null>

/** ISO local `YYYY-MM-DD`, ou null. Voir la note « dates » des migrations. */
function isoDay(date: Date | null | undefined): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export class ReplicaSyncService {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Rejoue toutes les tables.
   *
   * SÉQUENTIEL et non parallèle : `ZSOAPSQL` est en O(n²) côté serveur X3 et le
   * coût est CPU — trois extractions concurrentes se ralentissent mutuellement.
   * La parallélisation des chunks SOAP a déjà été mesurée sans gain sur ce projet.
   *
   * Une table qui échoue n'interrompt pas les suivantes : `ingest` capture ses
   * erreurs et rend un résultat `failed` au lieu de lever. Une réplique
   * partiellement fraîche reste utilisable, ce qui n'est pas le cas d'une réplique
   * vide. Chaque échec laisse une ligne dans `ingestion_log`.
   */
  async syncAll(source = 'manual'): Promise<ReplicaSyncResult> {
    const start = Date.now()
    const results: TableIngestionResult[] = []

    results.push(await this.syncOrders(source))
    results.push(await this.syncOrderLines(source))
    results.push(await this.syncStock(source))

    return { results, durationMs: Date.now() - start }
  }

  async syncOrders(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('orders_replica', source, async () => {
      const orders = await new X3OfRepository().getManufacturingOrders()
      return orders.map((o): Row => ({
        num_of: o.numOf,
        article: o.article,
        designation: o.designation,
        status: o.status,
        statut_label: o.statutLabel,
        quantity: o.quantity,
        quantity_launched: o.quantityLaunched,
        quantity_done: o.quantityDone,
        start_date: isoDay(o.startDate),
        end_date: isoDay(o.endDate),
      }))
    })
  }

  async syncOrderLines(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('order_lines_replica', source, async () => {
      const lines = await new X3OrderLineRepository().getOpenOrderLines()
      return lines.map((l): Row => ({
        num_commande: l.numCommande,
        ligne: l.ligne,
        client: l.client,
        article: l.article,
        designation: l.designation,
        quantite: l.quantite,
        // `date_livraison` est NOT NULL : `OrderLineRow.dateLivraison` n'est pas
        // nullable côté type, mais une date X3 à 0 ressort en `Invalid Date`.
        // `isoDay` rendrait `NaN-NaN-NaN`, que la table STRICT accepterait
        // (c'est du TEXT) et qui casserait tout `BETWEEN` en aval.
        date_livraison: isoDay(l.dateLivraison) ?? '',
        contremarque: l.contremarque,
        unite: l.unite,
        order_type: l.orderType,
        nature: l.nature,
      }))
    })
  }

  async syncStock(source = 'manual'): Promise<TableIngestionResult> {
    return this.ingest('stock_replica', source, async () => {
      const levels = await new X3StockRepository().getStockLevels()
      return levels.map((s): Row => ({
        article: s.article,
        physique: s.physique,
        controle_qual: s.controleQual,
        rebut: s.rebut,
        alloue_phys: s.allouePhys,
        alloue_global: s.alloueGlobal,
        pmp: s.pmp,
      }))
    })
  }

  /**
   * Fraîcheur de chaque table : le dernier run journalisé, avec son âge.
   *
   * C'est ce qui rend la péremption interrogeable. La situation actuelle en a une
   * aussi (TTL 2–5 min + grâce 12 h) mais aucune requête ne peut la lire.
   */
  async freshness(): Promise<ReplicaFreshness[]> {
    // `scope = 'full'` DANS LES DEUX clauses, y compris la sous-requête : sans le
    // filtre côté `MAX(id)`, une ré-ingestion partielle plus récente gagnerait
    // l'agrégat puis serait écartée par la jointure, et la table ressortirait
    // « jamais ingérée » alors qu'un run complet a bien eu lieu.
    const rows = await this.conn.rawQuery(
      `SELECT l.table_name, l.status, l.started_at, l.finished_at, l.rows, l.duration_ms
         FROM ingestion_log l
         JOIN (
           SELECT table_name, MAX(id) AS id
             FROM ingestion_log
            WHERE scope = 'full'
            GROUP BY table_name
         ) last ON last.id = l.id
        WHERE l.scope = 'full'
        ORDER BY l.table_name`
    )

    const now = Date.now()
    return (rows as any[]).map((r) => {
      const finished = r.finished_at ? Date.parse(r.finished_at) : null
      return {
        table: r.table_name,
        status: r.status as IngestionStatus,
        startedAt: r.started_at,
        finishedAt: r.finished_at ?? null,
        rows: r.rows ?? null,
        durationMs: r.duration_ms ?? null,
        ageMs: finished === null ? null : now - finished,
      }
    })
  }

  /**
   * Ré-ingestions partielles récentes.
   *
   * `freshness()` ne retient que les runs complets — c'est la bonne règle pour
   * juger de la fraîcheur d'une table, mais ça rend les partiels invisibles. Les
   * exposer à part évite de conclure qu'ils n'ont pas eu lieu.
   */
  async recentPartialRuns(
    limit = 5
  ): Promise<{ table: string; startedAt: string; note: string | null }[]> {
    const rows = await this.conn
      .from('ingestion_log')
      .select('table_name', 'started_at', 'note')
      .where('scope', 'partial')
      .orderBy('id', 'desc')
      .limit(limit)

    return rows.map((r) => ({
      table: r.table_name,
      startedAt: r.started_at,
      note: r.note ?? null,
    }))
  }

  /**
   * Extraction hors transaction, swap dedans.
   *
   * L'extraction X3 dure des dizaines de secondes ; la tenir dans la transaction
   * retiendrait le verrou d'écriture SQLite tout ce temps pour rien. Le
   * `DELETE` + `INSERT` transactionnel, lui, prend une centaine de millisecondes :
   * les lecteurs voient l'ancienne version jusqu'au COMMIT, donc jamais de table
   * vide — c'est toute la raison d'être du swap transactionnel.
   *
   * `protected` et non `private` : c'est la seule méthode du service qui porte une
   * logique non triviale (swap, rollback, journalisation des échecs) et la seule
   * qu'un test peut exercer sans X3 en face. Le test la rejoue sur une table
   * jetable, cf. `tests/unit/replica_sync.test.ts`.
   */
  protected async ingest(
    table: string,
    source: string,
    fetch: () => Promise<Row[]>
  ): Promise<TableIngestionResult> {
    const start = Date.now()
    const startedAt = new Date().toISOString()

    try {
      const rows = await fetch()

      const trx = await this.conn.transaction()
      try {
        await trx.from(table).delete()
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await trx.table(table).insert(rows.slice(i, i + INSERT_CHUNK))
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const durationMs = Date.now() - start
      await this.log({
        table,
        status: 'ok',
        scope: 'full',
        startedAt,
        rows: rows.length,
        durationMs,
        source,
      })

      // Le run a démontré avoir vu tout ce qui était écrit avant son démarrage :
      // le marquage `dirty` de cette table n'a plus d'objet.
      //
      // Seul un run COMPLET peut lever le marquage. Une ré-ingestion partielle le
      // lève aussi, mais sous une condition plus étroite, cf. `reingestOrders`.
      await replicaGate.clearDirty([table as ReplicaTable])

      return { table, status: 'ok', rows: rows.length, durationMs }
    } catch (error) {
      const durationMs = Date.now() - start
      const message = (error as Error)?.message ?? String(error)
      await this.log({
        table,
        status: 'failed',
        scope: 'full',
        startedAt,
        durationMs,
        source,
        error: message,
      })
      return { table, status: 'failed', rows: 0, durationMs, error: message }
    }
  }

  /**
   * Ré-ingestion CIBLÉE de quelques OF, par numéro (#98, read-after-write).
   *
   * À appeler juste après une écriture X3 sur ces OF. Referme la fenêtre de voie
   * directe en ~1 s au lieu d'attendre le prochain run complet : un `IN (...)` sur
   * les numéros écrits, sans le lookback 90 j, donc quelques lignes ZSOAPSQL au
   * lieu de 11 000.
   *
   * ## Upsert et non swap
   *
   * Évident mais à dire : un `DELETE` complet viderait la table pour ne réécrire
   * que les OF nommés. Les lignes réécrites ici seront de toute façon remplacées
   * au prochain swap complet — c'est auto-réparateur, pas un conflit.
   *
   * ## Un OF disparu de la tranche est SUPPRIMÉ
   *
   * Si X3 ne rend plus l'OF (clos, supprimé, sorti du périmètre WIPTYP=5), sa ligne
   * est retirée de la réplique. Sans ça un OF clos y resterait vivant jusqu'au
   * prochain run complet — exactement le genre de fantôme que le board ne doit pas
   * afficher.
   *
   * ## Pourquoi ça peut lever le marquage `dirty`
   *
   * L'hypothèse est explicite : une écriture X3 ne modifie que les OF qu'elle
   * nomme. Sous cette hypothèse, relire ces OF suffit à remettre
   * `orders_replica` en accord avec X3.
   *
   * L'hypothèse ne s'étend PAS aux autres tables : un affermissement consomme des
   * allocations, donc `stock_replica` reste suspecte jusqu'à un run complet. C'est
   * à l'appelant de marquer les tables qu'il salit ; celle-ci n'en lave qu'une.
   */
  async reingestOrders(numOfs: string[], source = 'writeback'): Promise<TableIngestionResult> {
    const table = 'orders_replica'
    const start = Date.now()
    const startedAt = new Date().toISOString()
    const asked = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]

    if (asked.length === 0) {
      return { table, status: 'ok', rows: 0, durationMs: 0 }
    }

    try {
      const orders = await new X3OfRepository().getManufacturingOrdersByNums(asked)
      const found = new Set(orders.map((o) => o.numOf))
      const vanished = asked.filter((n) => !found.has(n))

      const trx = await this.conn.transaction()
      try {
        await trx.from(table).whereIn('num_of', asked).delete()
        const rows = orders.map((o): Row => ({
          num_of: o.numOf,
          article: o.article,
          designation: o.designation,
          status: o.status,
          statut_label: o.statutLabel,
          quantity: o.quantity,
          quantity_launched: o.quantityLaunched,
          quantity_done: o.quantityDone,
          start_date: isoDay(o.startDate),
          end_date: isoDay(o.endDate),
        }))
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await trx.table(table).insert(rows.slice(i, i + INSERT_CHUNK))
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const durationMs = Date.now() - start
      await this.log({
        table,
        status: 'ok',
        scope: 'partial',
        startedAt,
        rows: orders.length,
        durationMs,
        source,
        // Sans ça une ligne `partial` est illisible : 3 lignes sur 11 000, mais
        // lesquelles ?
        note: `${asked.length} demandés, ${orders.length} trouvés${
          vanished.length ? `, ${vanished.length} disparus : ${vanished.join(', ')}` : ''
        }`,
      })

      await replicaGate.clearDirty([table])

      return { table, status: 'ok', rows: orders.length, durationMs }
    } catch (error) {
      const durationMs = Date.now() - start
      const message = (error as Error)?.message ?? String(error)
      await this.log({
        table,
        status: 'failed',
        scope: 'partial',
        startedAt,
        durationMs,
        source,
        error: message,
      })
      // Pas de `clearDirty` : l'échec laisse la table suspecte, donc les lectures
      // restent sur la voie directe. C'est le comportement voulu.
      return { table, status: 'failed', rows: 0, durationMs, error: message }
    }
  }

  /**
   * Le journal s'écrit HORS de la transaction de swap : un rollback ne doit pas
   * emporter la trace de l'échec avec lui. C'est précisément quand le swap échoue
   * que la ligne de journal a de la valeur.
   */
  private async log(entry: {
    table: string
    status: IngestionStatus
    scope: 'full' | 'partial'
    startedAt: string
    rows?: number
    durationMs: number
    source: string
    error?: string | null
    note?: string
  }): Promise<void> {
    await this.conn.table('ingestion_log').insert({
      table_name: entry.table,
      status: entry.status,
      scope: entry.scope,
      started_at: entry.startedAt,
      finished_at: new Date().toISOString(),
      rows: entry.rows ?? null,
      duration_ms: entry.durationMs,
      source: entry.source,
      error: entry.error ?? null,
      note: entry.note ?? null,
    })
  }
}

const replicaSyncService = new ReplicaSyncService()
export default replicaSyncService
