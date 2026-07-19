import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import PlanningBoardController from '#controllers/planning_board_controller'

function mockContext(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    request: {
      // H4 — le contrôleur utilise désormais `validateUsing` (vine) au lieu de
      // `only(...)`. Le mock renvoie le body validé tel quel (le schéma vine
      // est couvert par `app/validators/planning_board.ts` et testé ailleurs).
      validateUsing(_schema: unknown) {
        return overrides.body ?? {}
      },
    },
    response: {
      ok(data: any) {
        return data
      },
      badRequest(data: any) {
        return { __status: 400, ...data }
      },
    },
    ...overrides,
  }
}

test.group('PlanningBoardController', (group) => {
  group.setup(async () => {
    await db.from('of_overrides').delete()
  })
  group.teardown(async () => {
    await db.from('of_overrides').delete()
  })

  test('update creates an override', async ({ assert }) => {
    const ctrl = new PlanningBoardController()
    const ctx = mockContext({
      params: { of: 'OF001' },
      body: { dateFin: '2026-06-25', status: 1, note: 'Affermi' },
    })

    const result: any = await ctrl.update(ctx)
    assert.equal(result.numOf, 'OF001')
    assert.equal(result.dateFin, '2026-06-25')
    assert.isTrue(result.modified)
  })

  test('update rejette un numOf d\'OF invalide (H4)', async ({ assert }) => {
    const ctrl = new PlanningBoardController()
    const ctx = mockContext({
      params: { of: 'OF 001; DROP--' },
      body: { dateFin: '2026-06-25' },
    })

    const result: any = await ctrl.update(ctx)
    assert.equal(result.__status, 400)
  })
})
