import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import orderLinesReplicaRepository from '#repositories/order_lines_replica_repository'

/**
 * Lecture `order_lines_replica` (#98, lot 2).
 *
 * Même précaution que `orders_replica_repository.test.ts` : la connexion `replica`
 * pointe le même fichier en test qu'en dev, donc lignes préfixées `TESTCMD-` et
 * nettoyage par filtre, jamais par wipe de la table.
 */

const NUMS = ['TESTCMD-A', 'TESTCMD-B']

test.group('OrderLinesReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('order_lines_replica').whereIn('num_commande', NUMS).delete()
  })

  test('mappe une ligne réplique vers OrderLineRow', async ({ assert }) => {
    await conn.table('order_lines_replica').insert({
      num_commande: 'TESTCMD-A',
      ligne: '1',
      client: 'CLIENT-1',
      article: 'ART-1',
      designation: 'Vis 6x30',
      quantite: 10,
      date_livraison: '2026-08-01',
      contremarque: 'CM-1',
      unite: 'UN',
      order_type: 'SO',
      nature: 'COMMANDE',
    })

    const lines = await orderLinesReplicaRepository.getOpenOrderLines()
    const line = lines.find((l) => l.numCommande === 'TESTCMD-A')

    assert.isDefined(line)
    assert.deepEqual(line, {
      numCommande: 'TESTCMD-A',
      ligne: '1',
      client: 'CLIENT-1',
      article: 'ART-1',
      designation: 'Vis 6x30',
      quantite: 10,
      dateLivraison: new Date('2026-08-01T00:00:00'),
      contremarque: 'CM-1',
      unite: 'UN',
      orderType: 'SO',
      nature: 'COMMANDE',
    })
  })

  test('filtre from/to sur date_livraison', async ({ assert }) => {
    await conn.table('order_lines_replica').insert([
      {
        num_commande: 'TESTCMD-A',
        ligne: '1',
        client: null,
        article: 'ART-1',
        designation: null,
        quantite: 1,
        date_livraison: '2026-08-05',
        contremarque: null,
        unite: null,
        order_type: null,
        nature: 'PREVISION',
      },
      {
        num_commande: 'TESTCMD-B',
        ligne: '1',
        client: null,
        article: 'ART-2',
        designation: null,
        quantite: 1,
        date_livraison: '2026-09-15',
        contremarque: null,
        unite: null,
        order_type: null,
        nature: 'PREVISION',
      },
    ])

    const lines = await orderLinesReplicaRepository.getOpenOrderLines({
      from: '2026-08-01',
      to: '2026-08-31',
    })
    const ours = lines.filter((l) => NUMS.includes(l.numCommande))

    assert.deepEqual(
      ours.map((l) => l.numCommande),
      ['TESTCMD-A']
    )
  })
})
