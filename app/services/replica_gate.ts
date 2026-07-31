import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { getActiveX3EnvName } from '#config/x3'

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
 * ## La règle de fraîcheur
 *
 * La règle de confirmation ci-dessus répond à « la réplique a-t-elle vu NOS
 * écritures ». Elle ne dit rien de « la réplique a-t-elle vu celles de X3 » —
 * un run réussi il y a trois semaines la satisfait pleinement.
 *
 * Ça suffisait tant que toute table lue était sur le tick 5 min. Ce n'est plus
 * vrai : `operations_replica` et `stock_detail_replica` (#98, suite lot 3) sont
 * hors `syncAll()`, alimentées à la main, cadence non arbitrée. Sans borne
 * d'âge, un seul `--only=operations` suivi de `REPLICA_READS=true` figerait les
 * pointages à cette date pour toujours — le SWR bentocache rejoue bien la
 * factory à chaque TTL, mais contre une réplique morte.
 *
 * D'où `MAX_AGE_MS`, par table, appliqué ici et pas dans les repositories :
 * trois contrôles de fraîcheur écrits séparément, c'est la classe de bug de
 * `getOrdersForWindow` (deux chemins de lecture qui divergent parce que la
 * règle vit à deux endroits).
 *
 * ## La règle de provenance
 *
 * Les deux règles ci-dessus supposent toutes deux que la réplique parle du même
 * X3 que le lecteur. Rien ne le garantissait.
 *
 * `getX3EnvConfig()` (`config/x3.ts`) prend l'environnement de la session HTTP
 * quand il y en a une, et `X3_ENV` sinon. Or l'ingestion tourne HORS requête
 * (provider, CLI) donc toujours sur `X3_ENV`, tandis que les lectures tournent
 * DANS une requête donc sur l'environnement de l'utilisateur connecté. Avec
 * `X3_ENV=test` et un utilisateur connecté en prod — configuration observée en
 * développement — la réplique est remplie depuis CLTEST et servie à une session
 * prod. Aucun écran ne le signalerait : les chiffres sont plausibles, faux.
 *
 * D'où `ingestion_log.x3_env`, comparé à l'environnement du lecteur. C'est la
 * règle la plus prioritaire des trois : une donnée fraîche et propre reste
 * fausse si elle vient de l'autre environnement.
 *
 * ## Dégradation
 *
 * Réplique jamais alimentée, ingestion en panne, provenance différente de celle
 * du lecteur, table marquée sale, dernier run trop vieux : le verdict est
 * `direct` dans les cinq cas. Le défaut est donc la voie qui marche
 * aujourd'hui, jamais une donnée fausse.
 */

/**
 * Le MODE de lecture de l'application. `REPLICA_READS` ne règle pas un détail du
 * portail : il choisit entre deux architectures.
 *
 * - **FERMÉ — mode direct.** Les écrans lisent X3 à travers bentocache. Le
 *   préchauffage au boot et le warmer périodique ont tout leur sens : ils
 *   amortissent un cold start de ~18 s.
 * - **OUVERT — mode réplique.** Les écrans lisent SQLite. Le cache n'a plus rien
 *   à amortir — une lecture indexée coûte ~4 ms, quand un hit L1 repaie un
 *   `SuperJSON.parse` mesuré à 22-93 ms. **Le cache est plus lent que ce qu'il
 *   enveloppe**, et préchauffer revient à recopier la réplique en mémoire pour
 *   la relire plus lentement.
 *
 * D'où cette fonction exportée plutôt qu'un `env.get()` recopié : le mode se lit
 * au même endroit partout, et `cache_preheat_provider` s'éteint en mode réplique.
 */
export function replicaReadsEnabled(): boolean {
  return env.get('REPLICA_READS', false) === true
}

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
  reason:
    'disabled' | 'never-ingested' | 'last-run-failed' | 'env-mismatch' | 'dirty' | 'stale' | null
  dirtySince: string | null
  lastFullRunAt: string | null
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

/**
 * Âge maximal du dernier run complet réussi, au-delà duquel la table repart en
 * voie directe. C'est un seuil de CONFIANCE, pas un TTL de cache : la question
 * n'est pas « quand rafraîchir » (l'ingestion décide) mais « à partir de quand
 * cette donnée devient trompeuse à l'écran ».
 *
 * Trois régimes, chacun aligné sur la CADENCE d'ingestion de la table — un seuil
 * plus court que la cadence rejetterait la réplique en permanence :
 *  - **30 min** pour ce qui bouge vite. Les tables du tick 5 min tolèrent ainsi
 *    5 ticks manqués avant de replier — le cas visé est un scheduler mort, pas
 *    un run lent. `operations_replica` (pointages) y est aussi : la donnée
 *    change en continu pendant un poste, une heure de retard se voit sur un
 *    écran d'avancement.
 *  - **6 h** pour `stock_detail_replica` : l'estimateur conditionnement en tire
 *    des ratios US/palette observés, pas un état instantané.
 *  - **26 h** pour `stock_flux_replica`, seule table sur cadence QUOTIDIENNE
 *    (cf. `replica_sync_provider.ts`). 24 h de cadence + 2 h de marge : un run
 *    dure ~3-4 min et peut démarrer en retard après un redémarrage, un seuil à
 *    24 h pile ferait clignoter la table en voie directe chaque fin de journée.
 *    Ce que ça autorise : une valorisation amputée des mouvements du jour. Assumé
 *    — série lue en tendance sur 12 mois glissants.
 *
 * Conséquence assumée pour les deux tables restées hors cadence (`operations`,
 * `stock_detail`) : elles ne servent la réplique que peu après un run manuel, et
 * sinon X3 direct. Le seuil ne dégrade rien ; il rend la décision de cadence
 * nécessaire pour en tirer un gain, au lieu de laisser une donnée périmée passer
 * pour fraîche.
 */
const MAX_AGE_MS: Record<ReplicaTable, number> = {
  orders_replica: 30 * MINUTE,
  order_lines_replica: 30 * MINUTE,
  stock_replica: 30 * MINUTE,
  receptions_replica: 30 * MINUTE,
  operations_replica: 30 * MINUTE,
  stock_flux_replica: 26 * HOUR,
  stock_detail_replica: 6 * HOUR,
}

/** Défaut volontairement STRICT : une table ajoutée à `ReplicaTable` sans entrée
 *  dans `MAX_AGE_MS` hérite du régime court, jamais du permissif. L'oubli coûte
 *  alors des lectures en voie directe — visible et sans danger — plutôt que de
 *  servir du périmé en silence. */
const DEFAULT_MAX_AGE_MS = 30 * MINUTE

/** Seuil applicable à une table. Pur, testable sans DB. */
export function maxAgeMsFor(table: ReplicaTable): number {
  return MAX_AGE_MS[table] ?? DEFAULT_MAX_AGE_MS
}

/** Âge en ms d'un horodatage ISO 8601. `null` si absent ou illisible — un âge
 *  indémontrable ne doit jamais valoir « frais ». Un horodatage dans le futur
 *  (décalage d'horloge) donne un âge négatif, donc frais : le seuil borne le
 *  retard, pas l'avance. */
function ageOf(finishedAt: string | null | undefined): number | null {
  if (!finishedAt) return null
  const t = Date.parse(finishedAt)
  return Number.isNaN(t) ? null : Date.now() - t
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
    return replicaReadsEnabled()
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

    // PROVENANCE avant tout le reste : une donnée du bon âge et propre reste
    // fausse si elle vient de l'autre environnement X3.
    //
    // Le cas n'est pas théorique. `getX3EnvConfig()` prend l'environnement de la
    // session HTTP quand il y en a une, et `X3_ENV` sinon. L'ingestion tourne
    // hors requête (provider, CLI) donc toujours sur `X3_ENV` ; les lectures
    // tournent dans une requête donc sur l'environnement de l'utilisateur
    // connecté. Avec `X3_ENV=test` et un utilisateur connecté en prod —
    // configuration observée en développement — la réplique est remplie depuis
    // CLTEST et servie à une session prod. Rien à l'écran ne le signalerait :
    // les chiffres sont plausibles, simplement faux.
    //
    // Le `?? null` couvre un cas que le schéma rend inatteignable (`x3_env` est
    // `NOT NULL DEFAULT 'test'`, les lignes antérieures à la migration ont donc
    // été étiquetées, pas laissées vides). Gardé quand même : si la colonne
    // devenait nullable un jour, l'absence doit valoir refus et non « la bonne
    // provenance » — même principe que l'âge indémontrable.
    const runEnv: string | null = lastRun.x3_env ?? null
    if (runEnv === null || runEnv !== getActiveX3EnvName()) {
      return { ...base, source: 'direct', reason: 'env-mismatch' }
    }

    // Le run doit avoir DÉMARRÉ après l'écriture. Comparaison sur des ISO 8601 en
    // UTC, donc l'ordre lexicographique vaut l'ordre chronologique.
    if (dirtySince !== null && lastFullRunAt !== null && lastFullRunAt <= dirtySince) {
      return { ...base, source: 'direct', reason: 'dirty' }
    }

    // Fraîcheur mesurée sur `finished_at` et non `started_at` : c'est la fin du
    // swap qui date la donnée visible. L'écart compte — `stock_flux_replica`
    // met ~3-4 min par run, `orders_replica` ~13 s.
    //
    // `finished_at` absent sur un run marqué `ok` ne devrait pas arriver
    // (`log()` l'écrit toujours) ; si ça arrive, l'âge est indémontrable, donc
    // voie directe. Même principe que le reste : on ne sert la réplique que sur
    // preuve.
    const ageMs = ageOf(lastRun.finished_at)
    if (ageMs === null || ageMs > maxAgeMsFor(table)) {
      return { ...base, source: 'direct', reason: 'stale' }
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
