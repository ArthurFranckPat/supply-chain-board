import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import PlanningBoardController from '#controllers/planning_board_controller'

function mockContext(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    request: {
      only(keys: string[]) {
        const result: Record<string, any> = {}
        for (const k of keys) result[k] = overrides.body?.[k] ?? null
        return result
      },
    },
    response: {
      ok(data: any) { return data },
    },
    ...overrides,
  }
}

test.group('PlanningBoardController', (group) => {
  group.setup(async () => { await db.from('of_overrides').delete() })
  group.teardown(async () => { await db.from('of_overrides').delete() })

  test('update creates an override', async ({ assert }) => {
    const ctrl = new PlanningBoardController()
    const ctx = mockContext({
      params: { of: 'OF001' },
      body: { dateFin: '2026-06-25', status: 1, note: 'Affermi' },
    })
    ctx.request.only = (_keys: string[]) => ({ dateFin: '2026-06-25', status: 1, note: 'Affermi', dateDebut: null })

    const result = await ctrl.update(ctx)
    assert.equal(result.numOf, 'OF001')
    assert.equal(result.dateFin, '2026-06-25')
    assert.isTrue(result.modified)
  })
})
