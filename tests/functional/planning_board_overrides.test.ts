import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('Planning Board Overrides', (group) => {
  group.each.setup(async () => {
    await db.from('of_overrides').delete()
  })

  test('PATCH /ofs/:numOf creates an override', async ({ client, assert }) => {
    const response = await client
      .patch('/api/v1/planning-board/ofs/OF001')
      .json({ dateFin: '2026-06-25', status: 1, note: 'Affermi' })

    response.assertStatus(200)
    assert.equal(response.body().numOf, 'OF001')
    assert.equal(response.body().dateFin, '2026-06-25')
    assert.isTrue(response.body().modified)
  })

  test('GET /overrides lists all overrides', async ({ client, assert }) => {
    await client.patch('/api/v1/planning-board/ofs/OF010').json({ dateFin: '2026-06-20' })
    await client
      .patch('/api/v1/planning-board/ofs/OF011')
      .json({ dateFin: '2026-06-22', status: 1 })

    const response = await client.get('/api/v1/planning-board/overrides')
    response.assertStatus(200)
    assert.isAtLeast(response.body().total, 2)
  })

  test('DELETE /ofs/:numOf/override resets an override', async ({ client, assert }) => {
    await client.patch('/api/v1/planning-board/ofs/OF020').json({ dateFin: '2026-06-20' })

    const response = await client.delete('/api/v1/planning-board/ofs/OF020/override')
    response.assertStatus(200)
    assert.isTrue(response.body().reset)
  })

  test('DELETE /overrides resets all overrides', async ({ client, assert }) => {
    await client.patch('/api/v1/planning-board/ofs/OF030').json({ dateFin: '2026-06-20' })
    await client.patch('/api/v1/planning-board/ofs/OF031').json({ dateFin: '2026-06-22' })

    const response = await client.delete('/api/v1/planning-board/overrides')
    response.assertStatus(200)
    assert.isAtLeast(response.body().deleted, 2)
  })
})
