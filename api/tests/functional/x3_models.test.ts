import { test } from '@japa/runner'
import { X3Database } from '#app/database/x3_database'
import app from '@adonisjs/core/services/app'

test.group('X3 Models', () => {
  test('X3Database raw query returns SORDER data', async ({ assert }) => {
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

  test('X3Database query builder returns SORDER data', async ({ assert }) => {
    const db = new X3Database()
    const rows = await db
      .from('SORDER')
      .select('SOHNUM_0', 'BPCNAM_0', 'ORDDAT_0')
      .limit(3)

    assert.isArray(rows)
    assert.equal(rows.length, 3)
    assert.containsSubset(rows[0], { SOHNUM_0: 'AR0802469', BPCNAM_0: 'AERECO GmbH' })
    await db.destroy()
  })

  test('X3Database query builder with where clause', async ({ assert }) => {
    const db = new X3Database()
    const rows = await db
      .from('SORDER')
      .select('SOHNUM_0', 'BPCNAM_0')
      .where('SOHNUM_0', 'AR0802469')
      .limit(1)

    assert.equal(rows.length, 1)
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
