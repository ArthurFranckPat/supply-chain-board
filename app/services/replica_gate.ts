import db from '@adonisjs/lucid/services/db'
import env from '#start/env'

/**
 * Décide, pour chaque table de réplique, si une lecture peut lui faire confiance
 * ou doit repartir sur la voie directe X3 (#98, read-after-write).
 *
 * ## Pourquoi ce portail existe
 *
 * L'app écrit dans X3 : write-back (#29), FIRMSUGG (#31), création d'OF par scan
 * (#86), affermissement batch (#34). Aujourd'hui l'invalidation par namespace rend
 * l'écriture visible tout de suite. Une réplique alimentée par poll, non — l'OF
 * affermi n'y existe pas avant le run suivant.
 *
 * Le portail rend cette fenêtre explicite : une écriture MARQUE les tables
 * concernées, et les lectures de ces tables repartent sur la voie directe jusqu'à
 * ce qu'un run d'ingestion COMPLET ait démontré avoir vu l'écriture.
 *
 * Pas d'overlay à merger, et surtout pas d'angle mort : pendant la fenêtre sale
 * c'est X3 qui répond, donc les effets de bord d'une écriture — les allocations
 * qu'un affermissement consomme, par exemple — sont couverts eux aussi, alors
 * qu'un overlay ne connaîtrait que la ligne écrite.
 *
 * ## La règle de confirmation
 *
 * `ingestion_log.started_at` est enregistré AVANT l'extraction X3. Donc tout run
 * `status = 'ok'` et `scope = 'full'` démarré après `dirty_since` a forcément vu
 * l'écriture. `scope` compte : une ré-ingestion partielle n'a rafraîchi que les
 * clés qu'on lui a nommées, elle ne prouve rien sur la table.
 *
 * ## Dégradation
 *
 * Réplique jamais alimentée, ingestion en panne, table marquée sale : le verdict
 * est `direct` dans les trois cas. Le défaut est donc la voie qui marche
 * aujourd'hui, jamais une donnée fausse.
 */

export type ReadSource = 'replica' | 'direct'

/** Tables de réplique adressables par le portail. */
export type ReplicaTable =
  | 'orders_replica'
  | 'order_lines_replica'
  | 'stock_replica'
  | 'stock_flux_replica'
  | 'receptions_replica'
  | 'operations_replica'
  | 'stock_detail_replica'

export interface GateVerdict {
  table: ReplicaTable
  source: ReadSource
  /** Pourquoi la voie directe, quand c'est elle. `null` si la réplique est servie. */
  reason: 'disabled' | 'never-ingested' | 'last-run-failed' | 'dirty' | null
  dirtySince: string | null
  lastFullRunAt: string | null
}

export class ReplicaGate {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Interrupteur global. Absent ou différent de `true` → la réplique n'est jamais
   * servie.
   *
   * Défaut FERMÉ, et ce n'est pas de la prudence de façade : au lot 1 la réplique
   * n'est lue par personne et son équivalence avec la voie directe n'est pas encore
   * démontrée. Un défaut ouvert ferait basculer la production sur une source non
   * vérifiée à la première ligne de code de lecture.
   *
   * `protected` : le test le force ouvert, sinon tous les verdicts vaudraient
   * `disabled` et ne prouveraient rien (cf. `tests/unit/replica_gate.test.ts`).
   */
  protected get enabled(): boolean {
    return env.get('REPLICA_READS', false) === true
  }

  /**
   * Marque des tables comme suspectes. À appeler depuis TOUTE écriture X3, au même
   * endroit que l'invalidation de cache — c'est le même événement.
   *
   * Marquer large plutôt que juste : une écriture d'OF touche `orders_replica`,
   * mais l'affermissement consomme aussi des allocations, donc `stock_replica`. Un
   * marquage en trop coûte une fenêtre de voie directe ; un marquage manquant sert
   * une donnée fausse.
   */
  async markDirty(tables: ReplicaTable[], reason: string): Promise<void> {
    const now = new Date().toISOString()
    for (const table of tables) {
      await this.conn.rawQuery(
        `INSERT INTO replica_dirty (table_name, dirty_since, reason)
         VALUES (?, ?, ?)
         ON CONFLICT (table_name) DO UPDATE SET dirty_since = excluded.dirty_since,
                                               reason      = excluded.reason`,
        [table, now, reason]
      )
    }
  }

  /**
   * Lève le marquage d'une table. Réservé à ce qui a PROUVÉ que la réplique a
   * rattrapé : un run complet réussi, ou une ré-ingestion ciblée des clés écrites.
   *
   * Ne jamais appeler « pour nettoyer ». Le marquage n'est pas du bruit, c'est
   * l'information qui empêche de servir une donnée fausse.
   */
  async clearDirty(tables: ReplicaTable[]): Promise<void> {
    await this.conn.from('replica_dirty').whereIn('table_name', tables).delete()
  }

  /** Verdict pour une table. */
  async verdict(table: ReplicaTable): Promise<GateVerdict> {
    if (!this.enabled) {
      return { table, source: 'direct', reason: 'disabled', dirtySince: null, lastFullRunAt: null }
    }

    const [dirty, lastRun] = await Promise.all([
      this.conn.from('replica_dirty').where('table_name', table).first(),
      this.conn
        .from('ingestion_log')
        .where('table_name', table)
        .where('scope', 'full')
        .orderBy('id', 'desc')
        .first(),
    ])

    const dirtySince: string | null = dirty?.dirty_since ?? null
    const lastFullRunAt: string | null = lastRun?.started_at ?? null

    const base = { table, dirtySince, lastFullRunAt }

    if (!lastRun) return { ...base, source: 'direct', reason: 'never-ingested' }
    if (lastRun.status !== 'ok') return { ...base, source: 'direct', reason: 'last-run-failed' }

    // Le run doit avoir DÉMARRÉ après l'écriture. Comparaison sur des ISO 8601 en
    // UTC, donc l'ordre lexicographique vaut l'ordre chronologique.
    if (dirtySince !== null && lastFullRunAt !== null && lastFullRunAt <= dirtySince) {
      return { ...base, source: 'direct', reason: 'dirty' }
    }

    return { ...base, source: 'replica', reason: null }
  }

  /** Raccourci : la réplique est-elle servable pour cette table ? */
  async canRead(table: ReplicaTable): Promise<boolean> {
    const v = await this.verdict(table)
    return v.source === 'replica'
  }

  /** Verdicts de toutes les tables — diagnostic, page d'admin, `replica:sync --status`. */
  async verdicts(): Promise<GateVerdict[]> {
    const tables: ReplicaTable[] = [
      'orders_replica',
      'order_lines_replica',
      'stock_replica',
      'stock_flux_replica',
      'receptions_replica',
      'operations_replica',
      'stock_detail_replica',
    ]
    return Promise.all(tables.map((t) => this.verdict(t)))
  }
}

const replicaGate = new ReplicaGate()
export default replicaGate
