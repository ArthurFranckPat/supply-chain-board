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

  test('resetOverride deletes an override', async ({ assert }) => {
    const ctrl = new PlanningBoardController()

    // Create one first
    const createCtx = mockContext({ params: { of: 'OF002' } })
    createCtx.request.only = () => ({ dateFin: '2026-06-20', status: null, note: null, dateDebut: null })
    await ctrl.update(createCtx)

    const deleteCtx = mockContext({ params: { of: 'OF002' }, response: { ok: (d: any) => d } })
    const result = await ctrl.resetOverride(deleteCtx)
    assert.isTrue((result as any).reset)
  })

  test('listOverrides returns all overrides', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const ctrl = new PlanningBoardController()

    const ctx1 = mockContext({ params: { of: 'OF010' } })
    ctx1.request.only = () => ({ dateFin: '2026-06-20', status: null, note: null, dateDebut: null })
    await ctrl.update(ctx1)

    const ctx2 = mockContext({ params: { of: 'OF011' } })
    ctx2.request.only = () => ({ dateFin: '2026-06-22', status: 1, note: 'Rush', dateDebut: null })
    await ctrl.update(ctx2)

    const result = await ctrl.listOverrides(mockContext())
    assert.isAtLeast(result.total, 2)
  })

  test('resetAll clears all overrides', async ({ assert }) => {
    await db.from('of_overrides').delete()
    const ctrl = new PlanningBoardController()

    const ctx1 = mockContext({ params: { of: 'OF020' } })
    ctx1.request.only = () => ({ dateFin: '2026-06-20', status: null, note: null, dateDebut: null })
    await ctrl.update(ctx1)

    const result = await ctrl.resetAll(mockContext())
    assert.isAtLeast(result.deleted, 1)
  })
})
