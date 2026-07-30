import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import replicaSyncService, { ReplicaSyncService } from '#services/replica_sync_service'
import replicaGate, { type ReplicaTable } from '#services/replica_gate'

/**
 * Swap transactionnel et journalisation (#98, lot 1).
 *
 * Les extractions X3 ne sont pas testées ici : elles délèguent aux repositories,
 * déjà couverts, et exigeraient un X3 joignable. Ce qui est propre à ce service —
 * et donc testé — c'est le swap : est-ce atomique, et l'échec laisse-t-il une trace.
 *
 * Le test tourne sur une table jetable (`swap_probe`) et non sur les tables de
 * réplique : la connexion `replica` pointe le même fichier en test qu'en dev
 * (pas de `.env.test` dans ce dépôt), un `DELETE FROM orders_replica` viderait
 * donc une réplique réelle. Les lignes de journal produites portent
 * `source = 'test'` et sont nettoyées en sortie.
 */

const SOURCE = 'test'

/** Ouvre `ingest`, seule méthode du service exerçable sans X3. */
class ProbeService extends ReplicaSyncService {
  run(table: string, fetch: () => Promise<Record<string, string | number | null>[]>) {
    return this.ingest(table, SOURCE, fetch)
  }
}

test.group('ReplicaSyncService — swap transactionnel', (group) => {
  const conn = db.connection('replica')
  const service = new ProbeService()

  group.each.setup(async () => {
    await conn.rawQuery(
      `CREATE TABLE IF NOT EXISTS swap_probe (id TEXT NOT NULL PRIMARY KEY, val INTEGER NOT NULL) STRICT`
    )
    await conn.from('swap_probe').delete()
  })

  group.teardown(async () => {
    await conn.rawQuery('DROP TABLE IF EXISTS swap_probe')
    await conn.from('ingestion_log').where('source', SOURCE).delete()
    await conn.from('replica_dirty').where('table_name', 'swap_probe').delete()
  })

  test('un swap réussi remplace intégralement le contenu', async ({ assert }) => {
    await service.run('swap_probe', async () => [
      { id: 'a', val: 1 },
      { id: 'b', val: 2 },
    ])

    const second = await service.run('swap_probe', async () => [{ id: 'c', val: 3 }])

    const rows = await conn.from('swap_probe').select('id').orderBy('id')

    assert.equal(second.status, 'ok')
    assert.equal(second.rows, 1)
    assert.deepEqual(
      rows.map((r) => r.id),
      ['c']
    )
  })

  test("un échec d'extraction laisse la table intacte", async ({ assert }) => {
    await service.run('swap_probe', async () => [{ id: 'a', val: 1 }])

    const failed = await service.run('swap_probe', async () => {
      throw new Error('X3 injoignable')
    })

    const rows = await conn.from('swap_probe').select('id')

    assert.equal(failed.status, 'failed')
    assert.equal(failed.error, 'X3 injoignable')
    assert.deepEqual(
      rows.map((r) => r.id),
      ['a']
    )
  })

  test("un échec pendant l'insert est annulé — pas de table à moitié remplie", async ({
    assert,
  }) => {
    await service.run('swap_probe', async () => [{ id: 'a', val: 1 }])

    // `val` est NOT NULL sur une table STRICT : la seconde ligne fait échouer
    // l'insert APRÈS que le DELETE a eu lieu dans la même transaction.
    const failed = await service.run('swap_probe', async () => [
      { id: 'x', val: 10 },
      { id: 'y', val: null },
    ])

    const rows = await conn.from('swap_probe').select('id')

    assert.equal(failed.status, 'failed')
    assert.deepEqual(
      rows.map((r) => r.id),
      ['a']
    )
  })

  test('un échec est journalisé avec son message', async ({ assert }) => {
    await service.run('swap_probe', async () => {
      throw new Error('panne simulée')
    })

    const entry = await conn
      .from('ingestion_log')
      .where('table_name', 'swap_probe')
      .where('source', SOURCE)
      .orderBy('id', 'desc')
      .first()

    assert.equal(entry.status, 'failed')
    assert.include(entry.error, 'panne simulée')
    assert.isNotNull(entry.finished_at)
  })

  /**
   * Couplage swap → read-after-write : un run complet réussi doit lever le
   * marquage `dirty`, sinon les lectures resteraient sur la voie directe pour
   * toujours. Un run en échec doit le laisser, sinon on servirait une réplique qui
   * n'a rien rattrapé.
   *
   * `swap_probe` n'est pas un `ReplicaTable`, d'où le cast : `clearDirty` et
   * `markDirty` travaillent sur un nom de table au runtime, le type ne sert qu'à
   * empêcher les fautes de frappe côté appelants réels.
   */
  const probeTable = 'swap_probe' as ReplicaTable

  test('un swap réussi lève le marquage dirty', async ({ assert }) => {
    await replicaGate.markDirty([probeTable], 'test')

    await service.run('swap_probe', async () => [{ id: 'a', val: 1 }])

    const dirty = await conn.from('replica_dirty').where('table_name', 'swap_probe').first()
    assert.isNotOk(dirty)
  })

  test('un swap en échec laisse le marquage dirty', async ({ assert }) => {
    await replicaGate.markDirty([probeTable], 'test')

    await service.run('swap_probe', async () => {
      throw new Error('X3 injoignable')
    })

    const dirty = await conn.from('replica_dirty').where('table_name', 'swap_probe').first()
    assert.isDefined(dirty)
  })

  test('une ré-ingestion ciblée sans numéro ne touche ni X3 ni la table', async ({ assert }) => {
    const result = await replicaSyncService.reingestOrders([])

    assert.equal(result.status, 'ok')
    assert.equal(result.rows, 0)
    assert.equal(result.durationMs, 0)
  })

  test('freshness rend le dernier run de chaque table', async ({ assert }) => {
    await service.run('swap_probe', async () => [{ id: 'a', val: 1 }])
    await service.run('swap_probe', async () => [
      { id: 'a', val: 1 },
      { id: 'b', val: 2 },
    ])

    const freshness = await service.freshness()
    const probe = freshness.find((f) => f.table === 'swap_probe')

    assert.isDefined(probe)
    assert.equal(probe!.status, 'ok')
    assert.equal(probe!.rows, 2)
    assert.isNotNull(probe!.ageMs)
  })
})
