import { test } from '@japa/runner'

function extractData(response: any) {
  const body = response.body()
  return body.data ?? body
}
test.group('Suivi Status Assign', () => {
  test('POST /api/v1/status/assign assigns statuses', async ({ client, assert }) => {
    const response = await client.post('/api/v1/status/assign').json({
      lines: [
        {
          numCommande: 'C001',
          article: 'ART1',
          designation: 'Article 1',
          nomClient: 'Client A',
          typeCommande: 'NOR',
          dateExpedition: '2026-06-20',
          dateLivPrevu: null,
          qteCommandee: 10,
          qteAllouee: 0,
          qteRestante: 10,
          isFabrique: false,
          isHardPegged: false,
        },
      ],
      stock: {
        ART1: { strict: 15, qc: 0, total: 15 },
      },
      referenceDate: '2026-06-18',
    })

    response.assertStatus(200)
    const body = extractData(response)
    assert.equal(body.total_rows, 1)
    assert.equal(body.status_counts.ALLOCATION_A_FAIRE, 1)
  })

  test('POST /api/v1/status/assign handles A_EXPEDIER', async ({ client, assert }) => {
    const response = await client.post('/api/v1/status/assign').json({
      lines: [
        {
          numCommande: 'C002',
          article: 'ART2',
          designation: '',
          nomClient: 'B',
          typeCommande: 'MTS',
          dateExpedition: '2026-06-10',
          dateLivPrevu: null,
          qteCommandee: 5,
          qteAllouee: 5,
          qteRestante: 0,
          isFabrique: true,
          isHardPegged: true,
        },
      ],
      stock: {
        ART2: { strict: 0, qc: 0, total: 0 },
      },
      referenceDate: '2026-06-18',
    })

    response.assertStatus(200)
    const body = extractData(response)
    assert.equal(body.total_rows, 1)
    assert.equal(body.status_counts.A_EXPEDIER, 1)
  })

  test('POST /api/v1/status/assign handles multiple statuses', async ({ client, assert }) => {
    const response = await client.post('/api/v1/status/assign').json({
      lines: [
        {
          numCommande: 'C001',
          article: 'ART1',
          designation: '',
          nomClient: 'A',
          typeCommande: 'NOR',
          dateExpedition: '2026-06-20',
          dateLivPrevu: null,
          qteCommandee: 10,
          qteAllouee: 0,
          qteRestante: 10,
          isFabrique: false,
          isHardPegged: false,
        },
        {
          numCommande: 'C002',
          article: 'ART2',
          designation: '',
          nomClient: 'B',
          typeCommande: 'MTS',
          dateExpedition: '2026-06-10',
          dateLivPrevu: null,
          qteCommandee: 5,
          qteAllouee: 5,
          qteRestante: 0,
          isFabrique: true,
          isHardPegged: true,
        },
      ],
      stock: {
        ART1: { strict: 15, qc: 0, total: 15 },
        ART2: { strict: 0, qc: 0, total: 0 },
      },
      referenceDate: '2026-06-18',
    })

    response.assertStatus(200)
    const body = extractData(response)
    assert.equal(body.total_rows, 2)
    assert.equal(body.status_counts.ALLOCATION_A_FAIRE, 1)
    assert.equal(body.status_counts.A_EXPEDIER, 1)
  })
})
