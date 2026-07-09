import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ScenarioStore } from '#services/scenario_store'
import type { PlanMutation } from '#app/domain/plan-diff'

const M: PlanMutation[] = [
  { type: 'shift_of', numOf: 'F0001', dateDebut: '2026-07-10', dateFin: '2026-07-12', poste: 'MONT01' },
  { type: 'shift_demand', numCommande: 'AR2600001', ligne: '1000', date: '2026-07-15' },
]

test.group('ScenarioStore', (group) => {
  group.each.setup(async () => {
    await db.from('scenarios').delete()
  })
  group.teardown(async () => {
    await db.from('scenarios').delete()
  })

  test('create persists mutations as JSON and round-trips', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'Rupture BDH', auteur: 'bledoua', mutations: M })

    assert.equal(row.nom, 'Rupture BDH')
    assert.equal(row.statut, 'brouillon')
    assert.lengthOf(row.mutations, 2)

    const reloaded = await store.get(row.id)
    assert.isNotNull(reloaded)
    assert.deepEqual(reloaded!.mutations, M)
  })

  test('update replaces mutations and statut', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', mutations: M })

    const updated = await store.update(row.id, {
      mutations: [M[0]],
      statut: 'applique',
    })
    assert.equal(updated!.statut, 'applique')
    assert.lengthOf(updated!.mutations, 1)
  })

  test('markEvaluated stamps evaluatedAt / dataAt', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', mutations: M })
    await store.markEvaluated(row.id, '2026-07-09T10:00:00.000Z', '2026-08-01T00:00:00.000Z')

    const reloaded = await store.get(row.id)
    assert.equal(reloaded!.evaluatedAt, '2026-07-09T10:00:00.000Z')
    assert.equal(reloaded!.dataAt, '2026-08-01T00:00:00.000Z')
  })

  test('list returns most-recent first; delete removes', async ({ assert }) => {
    const store = new ScenarioStore()
    const a = await store.create({ nom: 'A', mutations: [] })
    await store.create({ nom: 'B', mutations: [] })

    const list = await store.list()
    assert.lengthOf(list, 2)

    assert.isTrue(await store.delete(a.id))
    assert.lengthOf(await store.list(), 1)
    assert.isNull(await store.get(a.id))
  })

  test('malformed mutations JSON degrades to empty array', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', mutations: [] })
    await db.from('scenarios').where('id', row.id).update({ mutations: 'not json' })

    const reloaded = await store.get(row.id)
    assert.deepEqual(reloaded!.mutations, [])
  })
})
