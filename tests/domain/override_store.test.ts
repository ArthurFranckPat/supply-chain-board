import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import OfOverride from '#models/of_override'
import { OverrideStore } from '#services/override_store'

test.group('OverrideStore', (group) => {
  group.setup(async () => {
    await db.from('of_overrides').delete()
  })

  group.teardown(async () => {
    await db.from('of_overrides').delete()
  })

  test('save creates a new override', async ({ assert }) => {
    const store = new OverrideStore()
    await store.save('OF001', { dateDebut: '2026-06-12', dateFin: '2026-06-18', status: 1, note: 'Affermi' })

    const row = await OfOverride.findBy('num_of', 'OF001')
    assert.isNotNull(row)
    assert.equal(row!.dateFin, '2026-06-18')
    assert.equal(row!.status, 1)
  })

  test('save updates existing override', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const store = new OverrideStore()
    await store.save('OF002', { dateFin: '2026-06-20', status: null, note: null })
    await store.save('OF002', { dateFin: '2026-06-25', status: 2, note: 'Replan' })

    const row = await OfOverride.findBy('num_of', 'OF002')
    assert.equal(row!.dateFin, '2026-06-25')
    assert.equal(row!.status, 2)
    assert.equal(row!.note, 'Replan')
  })

  test('get returns null when no override', async ({ assert }) => {
    const store = new OverrideStore()
    const result = await store.get('UNKNOWN')
    assert.isNull(result)
  })

  test('get returns override when exists', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const store = new OverrideStore()
    await store.save('OF003', { dateDebut: null, dateFin: '2026-07-01', status: 1, note: null })

    const result = await store.get('OF003')
    assert.isNotNull(result)
    assert.equal(result!.dateFin, '2026-07-01')
  })

  test('getAll returns all overrides', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const store = new OverrideStore()
    await store.save('OF010', { dateFin: '2026-06-20', status: null, note: null })
    await store.save('OF011', { dateFin: '2026-06-22', status: 1, note: 'Rush' })

    const all = await store.getAll()
    assert.lengthOf(all, 2)
  })

  test('delete removes override', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const store = new OverrideStore()
    await store.save('OF020', { dateFin: '2026-06-20', status: null, note: null })
    await store.delete('OF020')

    const result = await store.get('OF020')
    assert.isNull(result)
  })

  test('deleteAll removes all overrides', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const store = new OverrideStore()
    await store.save('OF030', { dateFin: '2026-06-20', status: null, note: null })
    await store.save('OF031', { dateFin: '2026-06-22', status: null, note: null })

    const count = await store.deleteAll()
    assert.equal(count, 2)

    const all = await store.getAll()
    assert.lengthOf(all, 0)
  })
})
