import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ReplicaGate, maxAgeMsFor, type ReplicaTable } from '#services/replica_gate'

/**
 * Read-after-write (#98) : le portail sert-il la réplique ou la voie directe ?
 *
 * Le comportement testé est la RÈGLE DE CONFIRMATION — « un run complet réussi
 * démarré après l'écriture prouve que la réplique a rattrapé » — et surtout ses
 * échecs : jamais ingéré, dernier run en échec, table marquée sale, run seulement
 * partiel. Dans les quatre cas le verdict doit être `direct`, parce que le défaut
 * doit être la voie qui marche, jamais une donnée fausse.
 *
 * `REPLICA_READS` n'étant pas à `true` dans `.env`, la classe est instanciée avec
 * l'interrupteur forcé ouvert : sans ça tous les verdicts vaudraient `disabled` et
 * le test ne prouverait rien. Le cas `disabled` a son propre test, sur une
 * instance normale.
 */

/**
 * Nom de table FICTIF, et c'est important : le portail ne lit que `ingestion_log`
 * et `replica_dirty`, il n'ouvre jamais la table qu'on lui nomme. Utiliser un vrai
 * nom (`orders_replica`) faisait effacer par le `setup` les lignes de journal d'une
 * ingestion réelle — constaté : un run complet de 11 054 OF avait disparu du
 * journal, laissant la table « jamais ingérée » alors qu'elle était pleine.
 */
const TABLE = 'probe_replica' as ReplicaTable

/** Interrupteur forcé ouvert — voir la note ci-dessus. */
class OpenGate extends ReplicaGate {
  protected get enabled() {
    return true
  }
}

/** ISO 8601 décalé de `deltaMs` par rapport à maintenant. */
function isoAt(deltaMs: number): string {
  return new Date(Date.now() + deltaMs).toISOString()
}

test.group('ReplicaGate — read-after-write', (group) => {
  const conn = db.connection('replica')
  const gate = new OpenGate()

  async function logRun(opts: {
    status: 'ok' | 'failed'
    scope: 'full' | 'partial'
    startedAt: string
    /** Provenance. Défaut `test` : c'est ce que `getActiveX3EnvName()` renvoie
     *  hors requête HTTP, donc dans ces tests. Jamais `null` — la colonne est
     *  `NOT NULL`, une provenance absente n'est pas un état atteignable. */
    x3Env?: string
  }) {
    await conn.table('ingestion_log').insert({
      table_name: TABLE,
      status: opts.status,
      scope: opts.scope,
      started_at: opts.startedAt,
      finished_at: opts.startedAt,
      rows: 1,
      duration_ms: 1,
      source: 'test',
      x3_env: opts.x3Env ?? 'test',
    })
  }

  group.each.setup(async () => {
    await conn.from('ingestion_log').where('table_name', TABLE).delete()
    await conn.from('replica_dirty').where('table_name', TABLE).delete()
  })

  group.teardown(async () => {
    await conn.from('ingestion_log').where('table_name', TABLE).delete()
    await conn.from('replica_dirty').where('table_name', TABLE).delete()
  })

  test('jamais ingérée → voie directe', async ({ assert }) => {
    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'never-ingested')
  })

  test('run complet réussi, pas d’écriture depuis → réplique', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'replica')
    assert.isNull(verdict.reason)
  })

  test('écriture APRÈS le dernier run → voie directe', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })
    await gate.markDirty([TABLE], 'test')

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'dirty')
  })

  test('run complet DÉMARRÉ après l’écriture → réplique de nouveau', async ({ assert }) => {
    await gate.markDirty([TABLE], 'test')
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'replica')
  })

  test('un run PARTIEL postérieur à l’écriture ne rachète pas la table', async ({ assert }) => {
    // Run complet AVANT l'écriture : la table était à jour à ce moment-là.
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })
    await gate.markDirty([TABLE], 'test')
    // Postérieur à l'écriture, mais partiel : il n'a relu que les clés nommées,
    // il ne dit rien du reste de la table.
    await logRun({ status: 'ok', scope: 'partial', startedAt: isoAt(60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'dirty')
    // Le verdict ne doit pas non plus retenir le run partiel comme référence :
    // le dernier run COMPLET est antérieur à l'écriture.
    assert.isBelow(Date.parse(verdict.lastFullRunAt!), Date.parse(verdict.dirtySince!))
  })

  test('aucun run complet, seulement un partiel → jamais ingérée', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'partial', startedAt: isoAt(-60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'never-ingested')
  })

  test('dernier run complet en échec → voie directe', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-120_000) })
    await logRun({ status: 'failed', scope: 'full', startedAt: isoAt(-60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'last-run-failed')
  })

  test('clearDirty lève le marquage', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })
    await gate.markDirty([TABLE], 'test')
    await gate.clearDirty([TABLE])

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'replica')
  })

  /**
   * Provenance (#98) — le trou que les deux règles précédentes laissaient ouvert.
   *
   * L'ingestion tourne hors requête HTTP et prend donc `X3_ENV` ; les lectures
   * tournent dans une requête et prennent l'environnement de l'utilisateur
   * connecté. Rien n'imposait que les deux coïncident, et en développement
   * (`X3_ENV=test` + compte prod) ils ne coïncident pas : la réplique était
   * remplie depuis CLTEST et servie à une session prod, sans le moindre signal
   * à l'écran.
   *
   * Ces tests tournent hors requête, donc `getActiveX3EnvName()` vaut `test`.
   */
  test('ingestion venue d’un AUTRE environnement X3 → voie directe', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000), x3Env: 'prod' })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'env-mismatch')
  })

  test('la provenance prime sur la fraîcheur et sur le marquage', async ({ assert }) => {
    // Run récent, table propre : tout est bon SAUF l'environnement. Une donnée
    // fraîche et propre reste fausse si elle vient de l'autre X3, donc ce motif
    // doit être annoncé avant les autres.
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-1_000), x3Env: 'prod' })
    await gate.markDirty([TABLE], 'test')

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.reason, 'env-mismatch')
  })

  test('markDirty deux fois de suite ne duplique pas la ligne', async ({ assert }) => {
    await gate.markDirty([TABLE], 'première')
    await gate.markDirty([TABLE], 'seconde')

    const rows = await conn.from('replica_dirty').where('table_name', TABLE)

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].reason, 'seconde')
  })

  /**
   * Fraîcheur (#98) — la règle de confirmation ci-dessus prouve que la réplique
   * a vu NOS écritures, pas qu'elle a vu celles de X3. Sans borne d'âge, un run
   * réussi il y a trois semaines la satisfait pleinement : c'est exactement ce
   * qui figerait `operations_replica` / `stock_detail_replica` (hors `syncAll()`,
   * alimentées à la main) sur un seul run manuel.
   *
   * `probe_replica` n'ayant pas d'entrée dans `MAX_AGE_MS`, ces cas s'appuient
   * sur `DEFAULT_MAX_AGE_MS` (30 min) — et vérifient au passage que le défaut
   * est bien appliqué à une table inconnue plutôt qu'ignoré.
   */
  test('dernier run complet trop vieux → voie directe', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-31 * 60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'stale')
  })

  test('run complet récent, sous le seuil → réplique', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-29 * 60_000) })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'replica')
    assert.isNull(verdict.reason)
  })

  test('`finished_at` absent sur un run OK → voie directe (âge indémontrable)', async ({
    assert,
  }) => {
    await conn.table('ingestion_log').insert({
      table_name: TABLE,
      status: 'ok',
      scope: 'full',
      started_at: isoAt(-60_000),
      finished_at: null,
      rows: 1,
      duration_ms: 1,
      source: 'test',
    })

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'stale')
  })

  test('une écriture récente prime sur un run récent', async ({ assert }) => {
    // `dirty` doit rester diagnostiqué comme tel : les deux motifs mènent à la
    // voie directe, mais confondre « périmé » et « écriture non vue » enverrait
    // sur la mauvaise piste au diagnostic — la première se corrige par une
    // cadence, la seconde par une ré-ingestion ciblée.
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })
    await gate.markDirty([TABLE], 'test')

    const verdict = await gate.verdict(TABLE)

    assert.equal(verdict.reason, 'dirty')
  })

  test('REPLICA_READS absent ou faux → voie directe quoi qu’il arrive', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })

    // Instance normale : l'interrupteur lit l'environnement, où il n'est pas posé.
    const verdict = await new ReplicaGate().verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'disabled')
  })
})

/**
 * Seuils par table — pur, sans DB. Le test de verdict ci-dessus tourne sur un
 * nom fictif (il ne peut pas toucher `ingestion_log` d'une vraie table sans
 * effacer un run réel) : il exerce la MÉCANIQUE de la borne, jamais les valeurs.
 * Ce groupe couvre ce qu'il ne peut pas voir.
 */
test.group('ReplicaGate — seuils de fraîcheur', () => {
  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE

  test('les tables à mouvement rapide replient après 30 min', ({ assert }) => {
    // Les quatre premières sont sur le tick 5 min de `syncAll()` : 30 min tolère
    // 5 ticks manqués, le cas visé étant un scheduler mort. `operations_replica`
    // (pointages) partage le régime court sans être sur le tick — la donnée
    // change en continu pendant un poste.
    for (const table of [
      'orders_replica',
      'order_lines_replica',
      'stock_replica',
      'receptions_replica',
      'operations_replica',
    ] as ReplicaTable[]) {
      assert.equal(maxAgeMsFor(table), 30 * MINUTE, table)
    }
  })

  test('stock_detail_replica, lue en tendance, tolère 6 h', ({ assert }) => {
    assert.equal(maxAgeMsFor('stock_detail_replica'), 6 * HOUR)
  })

  test('stock_flux_replica tolère 26 h — seule table sur cadence quotidienne', ({ assert }) => {
    // Le seuil doit dépasser la cadence, sinon la table repart en voie directe
    // chaque fin de journée : 24 h d'intervalle + 2 h de marge pour un run de
    // ~3-4 min qui peut démarrer en retard après un redémarrage.
    assert.equal(maxAgeMsFor('stock_flux_replica'), 26 * HOUR)
    assert.isAbove(maxAgeMsFor('stock_flux_replica'), 24 * HOUR)
  })

  test('une table sans seuil déclaré hérite du régime COURT, pas du permissif', ({ assert }) => {
    // Le défaut décide ce que coûte un oubli : régime court → des lectures en
    // voie directe, visibles et sans danger ; régime long → du périmé servi en
    // silence pendant 6 h.
    assert.equal(maxAgeMsFor('table_pas_declaree' as ReplicaTable), 30 * MINUTE)
  })
})
