import { test } from '@japa/runner'

test.group('X3 Data Controller', () => {
  test('POST /api/v1/data/load rejects missing sql', async ({ client }) => {
    const response = await client.post('/api/v1/data/load').json({})
    response.assertStatus(400)
  })

  test('POST /api/v1/data/load rejects empty sql', async ({ client }) => {
    const response = await client.post('/api/v1/data/load').json({ sql: '' })
    response.assertStatus(400)
  })
})

test.group('Health', () => {
  test('GET /health returns ok', async ({ client, assert }) => {
    const response = await client.get('/health')
    response.assertStatus(200)
    assert.equal(response.body().status, 'ok')
  })
})
