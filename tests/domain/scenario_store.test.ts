import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ScenarioStore } from '#services/scenario_store'
import type { PlanMutation } from '#app/domain/plan_diff'

const M: PlanMutation[] = [
  {
    type: 'shift_of',
    numOf: 'F0001',
    dateDebut: '2026-07-10',
    dateFin: '2026-07-12',
    poste: 'MONT01',
  },
  { type: 'shift_demand', numCommande: 'AR2600001', ligne: '1000', date: '2026-07-15' },
]

/** Deux utilisateurs distincts : le cloisonnement est la moitié du contrat du store. */
const USER = 1
const AUTRE = 2

test.group('ScenarioStore', (group) => {
  group.each.setup(async () => {
    await db.from('scenarios').delete()
  })
  group.teardown(async () => {
    await db.from('scenarios').delete()
  })

  test('create persists mutations as JSON and round-trips', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({
      nom: 'Rupture BDH',
      auteur: 'bledoua',
      userId: USER,
      mutations: M,
    })

    assert.equal(row.nom, 'Rupture BDH')
    assert.equal(row.statut, 'brouillon')
    assert.lengthOf(row.mutations, 2)

    const reloaded = await store.get(row.id, USER)
    assert.isNotNull(reloaded)
    assert.deepEqual(reloaded!.mutations, M)
  })

  test('update replaces mutations and statut', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', userId: USER, mutations: M })

    const updated = await store.update(row.id, USER, {
      mutations: [M[0]],
      statut: 'applique',
    })
    assert.equal(updated!.statut, 'applique')
    assert.lengthOf(updated!.mutations, 1)
  })

  test('markEvaluated stamps evaluatedAt / dataAt', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', userId: USER, mutations: M })
    await store.markEvaluated(row.id, USER, '2026-07-09T10:00:00.000Z', '2026-08-01T00:00:00.000Z')

    const reloaded = await store.get(row.id, USER)
    assert.equal(reloaded!.evaluatedAt, '2026-07-09T10:00:00.000Z')
    assert.equal(reloaded!.dataAt, '2026-08-01T00:00:00.000Z')
  })

  test('list returns most-recent first; delete removes', async ({ assert }) => {
    const store = new ScenarioStore()
    const a = await store.create({ nom: 'A', userId: USER, mutations: [] })
    await store.create({ nom: 'B', userId: USER, mutations: [] })

    const list = await store.list(USER)
    assert.lengthOf(list, 2)

    assert.isTrue(await store.delete(a.id, USER))
    assert.lengthOf(await store.list(USER), 1)
    assert.isNull(await store.get(a.id, USER))
  })

  test('malformed mutations JSON degrades to empty array', async ({ assert }) => {
    const store = new ScenarioStore()
    const row = await store.create({ nom: 'S', userId: USER, mutations: [] })
    await db.from('scenarios').where('id', row.id).update({ mutations: 'not json' })

    const reloaded = await store.get(row.id, USER)
    assert.deepEqual(reloaded!.mutations, [])
  })

  // Le scénario d'un autre se comporte comme un scénario inexistant — sinon la liste
  // exposait les brouillons de tout le monde, et show/update/destroy acceptaient
  // n'importe quel id.
  test("le scénario d'un autre utilisateur est invisible et intouchable", async ({ assert }) => {
    const store = new ScenarioStore()
    const mien = await store.create({ nom: 'Le mien', userId: USER, mutations: M })
    await store.create({ nom: "L'autre", userId: AUTRE, mutations: M })

    const list = await store.list(USER)
    assert.lengthOf(list, 1)
    assert.equal(list[0].nom, 'Le mien')

    assert.isNull(await store.get(mien.id, AUTRE))
    assert.isNull(await store.update(mien.id, AUTRE, { nom: 'volé' }))
    assert.isFalse(await store.delete(mien.id, AUTRE))
    await store.markEvaluated(
      mien.id,
      AUTRE,
      '2026-07-09T10:00:00.000Z',
      '2026-07-09T10:00:00.000Z'
    )

    const intact = await store.get(mien.id, USER)
    assert.equal(intact!.nom, 'Le mien')
    assert.isNull(intact!.evaluatedAt)
  })

  test('getMany ne rend que les scénarios possédés, dans l’ordre demandé', async ({ assert }) => {
    const store = new ScenarioStore()
    const a = await store.create({ nom: 'A', userId: USER, mutations: [] })
    const b = await store.create({ nom: 'B', userId: USER, mutations: [] })
    const autre = await store.create({ nom: 'C', userId: AUTRE, mutations: [] })

    const rows = await store.getMany([b.id, autre.id, a.id], USER)
    assert.deepEqual(
      rows.map((r) => r.nom),
      ['B', 'A']
    )
  })
})
