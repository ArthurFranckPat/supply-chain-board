import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import stockDetailReplicaRepository from '#repositories/stock_detail_replica_repository'

/**
 * Lecture `stock_detail_replica` (#98, suite lot 3). `uuid` de test préfixés
 * `TEST-STK-`, nettoyés en sortie — même discipline que les autres tests réplique.
 */

const UUIDS = ['TEST-STK-A', 'TEST-STK-B', 'TEST-STK-C']

test.group('StockDetailReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('stock_detail_replica').whereIn('uuid', UUIDS).delete()
  })

  test('getObservations classe SM* en stockage et S_P/CLP en conso', async ({ assert }) => {
    await conn.table('stock_detail_replica').insert([
      { uuid: 'TEST-STK-A', article: 'ART-COND', loc: 'SM01', qte: 720 },
      { uuid: 'TEST-STK-B', article: 'ART-COND', loc: 'S3P', qte: 340 },
      { uuid: 'TEST-STK-C', article: 'ART-AUTRE', loc: 'ZZZ', qte: 5 },
    ])

    const observations = await stockDetailReplicaRepository.getObservations()
    const ours = observations.get('ART-COND') ?? []

    assert.lengthOf(ours, 2)
    assert.sameDeepMembers(ours, [
      { us: 720, source: 'STOCK', typeEmplacement: 'stockage' },
      { us: 340, source: 'STOCK', typeEmplacement: 'conso' },
    ])
    // `ZZZ` ne matche ni SM* ni S_P/CLP : ligne écartée, pas de fantôme.
    assert.isFalse(observations.has('ART-AUTRE'))
  })
})
