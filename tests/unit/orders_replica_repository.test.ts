import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ordersReplicaRepository from '#repositories/orders_replica_repository'

/**
 * Lecture `orders_replica` (#98, lot 2).
 *
 * La connexion `replica` pointe le même fichier en test qu'en dev (pas de
 * `.env.test` dans ce dépôt) — un `DELETE FROM orders_replica` viderait donc une
 * réplique réelle. Les lignes de test portent des `num_of` préfixés `TESTOF-` et
 * sont supprimées par ce filtre en sortie, jamais par un wipe de la table.
 */

const NUMS = ['TESTOF-A', 'TESTOF-B', 'TESTOF-C']

test.group('OrdersReplicaRepository', (group) => {
  const conn = db.connection('replica')

  group.each.teardown(async () => {
    await conn.from('orders_replica').whereIn('num_of', NUMS).delete()
  })

  test('mappe une ligne réplique vers ManufacturingOrder', async ({ assert }) => {
    await conn.table('orders_replica').insert({
      num_of: 'TESTOF-A',
      article: 'ART-1',
      designation: 'Vis 6x30',
      status: 1,
      statut_label: 'Ferme',
      quantity: 12.5,
      quantity_launched: 20,
      quantity_done: 7.5,
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    })

    const orders = await ordersReplicaRepository.getManufacturingOrders()
    const of = orders.find((o) => o.numOf === 'TESTOF-A')

    assert.isDefined(of)
    assert.deepEqual(of, {
      numOf: 'TESTOF-A',
      article: 'ART-1',
      designation: 'Vis 6x30',
      status: 1,
      statutLabel: 'Ferme',
      typeOfLabel: null,
      quantity: 12.5,
      quantityLaunched: 20,
      quantityDone: 7.5,
      unit: null,
      startDate: new Date('2026-08-01T00:00:00'),
      endDate: new Date('2026-08-05T00:00:00'),
    })
  })

  test('startDate/endDate null quand la colonne est vide', async ({ assert }) => {
    await conn.table('orders_replica').insert({
      num_of: 'TESTOF-B',
      article: 'ART-2',
      designation: null,
      status: 3,
      statut_label: 'Suggéré',
      quantity: 1,
      quantity_launched: 0,
      quantity_done: 0,
      start_date: null,
      end_date: null,
    })

    const orders = await ordersReplicaRepository.getManufacturingOrders()
    const of = orders.find((o) => o.numOf === 'TESTOF-B')

    assert.isDefined(of)
    assert.isNull(of!.startDate)
    assert.isNull(of!.endDate)
  })

  test('getManufacturingOrdersForWindow filtre sur start_date', async ({ assert }) => {
    await conn.table('orders_replica').insert([
      {
        num_of: 'TESTOF-A',
        article: 'ART-1',
        designation: null,
        status: 1,
        statut_label: null,
        quantity: 1,
        quantity_launched: 0,
        quantity_done: 0,
        start_date: '2026-08-03',
        end_date: '2026-08-10',
      },
      {
        num_of: 'TESTOF-C',
        article: 'ART-3',
        designation: null,
        status: 1,
        statut_label: null,
        quantity: 1,
        quantity_launched: 0,
        quantity_done: 0,
        start_date: '2026-09-15',
        end_date: '2026-09-20',
      },
    ])

    const orders = await ordersReplicaRepository.getManufacturingOrdersForWindow(
      new Date('2026-08-01T00:00:00'),
      new Date('2026-08-31T00:00:00')
    )
    // La table réplique locale peut déjà contenir des lignes réelles dans cette
    // fenêtre (dernier `replica:sync` en dev) — on ne vérifie que nos propres lignes.
    const ours = orders.filter((o) => NUMS.includes(o.numOf))

    assert.deepEqual(ours.map((o) => o.numOf).sort(), ['TESTOF-A'])
  })
})
