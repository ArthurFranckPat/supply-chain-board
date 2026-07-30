import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ReplicaGate, type ReplicaTable } from '#services/replica_gate'

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

  test('markDirty deux fois de suite ne duplique pas la ligne', async ({ assert }) => {
    await gate.markDirty([TABLE], 'première')
    await gate.markDirty([TABLE], 'seconde')

    const rows = await conn.from('replica_dirty').where('table_name', TABLE)

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].reason, 'seconde')
  })

  test('REPLICA_READS absent ou faux → voie directe quoi qu’il arrive', async ({ assert }) => {
    await logRun({ status: 'ok', scope: 'full', startedAt: isoAt(-60_000) })

    // Instance normale : l'interrupteur lit l'environnement, où il n'est pas posé.
    const verdict = await new ReplicaGate().verdict(TABLE)

    assert.equal(verdict.source, 'direct')
    assert.equal(verdict.reason, 'disabled')
  })
})
