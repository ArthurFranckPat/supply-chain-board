import { test } from '@japa/runner'
import { X3Database } from '#app/x3/client/x3_database'
import app from '@adonisjs/core/services/app'
import SalesOrder from '#models/x3/sorder'

test.group('X3 Models', () => {
  test('SalesOrder.query() returns SORDER data from X3', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'BPCNAM_0', 'ORDDAT_0')
      .limit(3)

    assert.isArray(orders)
    assert.equal(orders.length, 3)
    // Lucid uses TypeScript property names as $attributes keys (not column names)
    assert.equal(orders[0].$attributes.noCommande, 'AR0802469')
    assert.equal(orders[0].$attributes.nomClientCommande, 'AERECO GmbH')
  })

  test('SalesOrder.query() with where clause', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'BPCNAM_0')
      .where('SOHNUM_0', 'AR0802469')
      .limit(1)

    assert.equal(orders.length, 1)
    assert.equal(orders[0].$attributes.noCommande, 'AR0802469')
    assert.equal(orders[0].$attributes.nomClientCommande, 'AERECO GmbH')
  })

  test('SalesOrder.query() with orderBy', async ({ assert }) => {
    const orders = await SalesOrder.query()
      .select('SOHNUM_0', 'ORDDAT_0')
      .orderBy('ORDDAT_0', 'desc')
      .limit(3)

    assert.isArray(orders)
    assert.equal(orders.length, 3)
  })

  test('X3Database raw query returns same data', async ({ assert }) => {
    const db = new X3Database()
    const rows = await db.raw(
      'SELECT SOHNUM_0, BPCNAM_0, ORDDAT_0 FROM SORDER FETCH FIRST 3 ROWS ONLY'
    )

    assert.isArray(rows)
    assert.equal(rows.length, 3)
    assert.equal(rows[0].SOHNUM_0, 'AR0802469')
    assert.equal(rows[0].BPCNAM_0, 'AERECO GmbH')
    await db.destroy()
  })

  test('x3db from container (like controllers use) returns SORDER data', async ({ assert }) => {
    const db = await app.container.make('x3db') as X3Database
    const rows = await db
      .from('SORDER')
      .select('SOHNUM_0', 'BPCNAM_0')
      .limit(2)

    assert.equal(rows.length, 2)
    assert.equal(rows[0].SOHNUM_0, 'AR0802469')
  })
})
