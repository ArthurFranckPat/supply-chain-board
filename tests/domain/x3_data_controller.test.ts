import { test } from '@japa/runner'
import X3DataController from '#controllers/x3_data_controller'

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
      badRequest(data: any) {
        return data
      },
      ok(data: any) {
        return data
      },
    },
    ...overrides,
  }
}

test.group('X3DataController.load', () => {
  test('rejects missing sql', async ({ assert }) => {
    const ctrl = new X3DataController()
    const ctx = mockContext({ body: {} })
    ctx.request.only = () => ({ sql: null, params: null })

    const result = (await ctrl.load(ctx)) as any
    assert.equal(result.message, 'sql query is required')
  })

  test('rejects empty sql', async ({ assert }) => {
    const ctrl = new X3DataController()
    const ctx = mockContext({ body: { sql: '' } })
    ctx.request.only = () => ({ sql: '', params: null })

    const result = (await ctrl.load(ctx)) as any
    assert.equal(result.message, 'sql query is required')
  })

  test('rejects non-string sql', async ({ assert }) => {
    const ctrl = new X3DataController()
    const ctx = mockContext({ body: { sql: 123 } })
    ctx.request.only = () => ({ sql: 123, params: null })

    const result = (await ctrl.load(ctx)) as any
    assert.equal(result.message, 'sql query is required')
  })
})
