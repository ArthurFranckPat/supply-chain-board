import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import stockReplicaRepository from '#repositories/stock_replica_repository'

/**
 * Lecture `stock_replica` (#98, lot 2).
 *
 * Même précaution que les autres tests réplique : connexion `replica` partagée avec
 * le dev, articles préfixés `TESTART-` et nettoyage par filtre.
 */

const ARTICLES = ['TESTART-A', 'TESTART-B']

test.group('StockReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('stock_replica').whereIn('article', ARTICLES).delete()
  })

  test('strict = physique - allouePhys - alloueGlobal', async ({ assert }) => {
    await conn.table('stock_replica').insert({
      article: 'TESTART-A',
      physique: 100,
      controle_qual: 0,
      rebut: 0,
      alloue_phys: 20,
      alloue_global: 10,
      pmp: 5.5,
    })

    const flows = await stockReplicaRepository.getStockFlows(['TESTART-A'])

    assert.deepEqual(flows, [
      {
        article: 'TESTART-A',
        quantity: 70,
        direction: 'supply',
        date: null,
        origin: { type: 'stock', subType: 'strict', pmp: 5.5 },
      },
    ])
  })

  test('émet un flux par sous-type non nul (strict/qc/rejected)', async ({ assert }) => {
    await conn.table('stock_replica').insert({
      article: 'TESTART-B',
      physique: 50,
      controle_qual: 8,
      rebut: 3,
      alloue_phys: 0,
      alloue_global: 0,
      pmp: null,
    })

    const flows = await stockReplicaRepository.getStockFlows(['TESTART-B'])

    assert.deepEqual(
      flows.map((f) => (f.origin.type === 'stock' ? f.origin.subType : null)).sort(),
      ['qc', 'rejected', 'strict']
    )
  })

  test('strict négatif ou nul ne produit aucun flux "strict"', async ({ assert }) => {
    await conn.table('stock_replica').insert({
      article: 'TESTART-A',
      physique: 10,
      controle_qual: 0,
      rebut: 0,
      alloue_phys: 10,
      alloue_global: 5,
      pmp: null,
    })

    const flows = await stockReplicaRepository.getStockFlows(['TESTART-A'])

    assert.deepEqual(flows, [])
  })
})
