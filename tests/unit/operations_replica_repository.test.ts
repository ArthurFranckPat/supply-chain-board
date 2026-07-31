import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import operationsReplicaRepository from '#repositories/operations_replica_repository'

/**
 * Lecture `operations_replica` (#98, suite lot 3). Même discipline que les autres
 * tests réplique : `num_of` de test préfixés `TESTOF-OPS-`, nettoyés en sortie.
 */

const NUMS = ['TESTOF-OPS-A', 'TESTOF-OPS-B']

test.group('OperationsReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('operations_replica').whereIn('num_of', NUMS).delete()
  })

  test('mappe des lignes réplique vers OperationRecord, scopé aux numOfs demandés', async ({
    assert,
  }) => {
    await conn.table('operations_replica').insert([
      { num_of: 'TESTOF-OPS-A', openum: 10, cplqty: 5, opesta: 'A', extqty: 20 },
      { num_of: 'TESTOF-OPS-A', openum: 20, cplqty: 0, opesta: 'A', extqty: 20 },
      { num_of: 'TESTOF-OPS-B', openum: 10, cplqty: 20, opesta: 'C', extqty: 20 },
    ])

    const ops = await operationsReplicaRepository.getOperations(['TESTOF-OPS-A'])

    assert.lengthOf(ops, 2)
    assert.deepEqual(ops.map((o) => o.openum).sort(), [10, 20])
    assert.isTrue(ops.every((o) => o.mfgnum === 'TESTOF-OPS-A'))
  })

  test('numOfs vide → tableau vide sans requête', async ({ assert }) => {
    const ops = await operationsReplicaRepository.getOperations([])
    assert.deepEqual(ops, [])
  })
})
