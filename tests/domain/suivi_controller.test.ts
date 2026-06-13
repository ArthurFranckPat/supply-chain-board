import { test } from '@japa/runner'
import SuiviController from '#controllers/suivi_controller'

function mockContext(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    request: {
      only(keys: string[]) {
        const result: Record<string, any> = {}
        for (const k of keys) result[k] = overrides.body?.[k] ?? null
        return result
      },
      input(key: string) {
        return overrides.query?.[key] ?? null
      },
    },
    response: {
      notFound(data: any) { return { status: 404, ...data } },
      ok(data: any) { return data },
    },
    ...overrides,
  }
}

const sampleLines = [
  {
    numCommande: 'C001',
    article: 'ART1',
    designation: 'Article 1',
    nomClient: 'Client A',
    typeCommande: 'NOR',
    dateExpedition: new Date('2026-06-20'),
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
    designation: 'Article 2',
    nomClient: 'Client B',
    typeCommande: 'MTS',
    dateExpedition: new Date('2026-06-10'),
    dateLivPrevu: null,
    qteCommandee: 5,
    qteAllouee: 5,
    qteRestante: 0,
    isFabrique: true,
    isHardPegged: true,
  },
]

const sampleStock = {
  ART1: { strict: 15, qc: 0, total: 15 },
  ART2: { strict: 0, qc: 0, total: 0 },
}

test.group('SuiviController.assign', () => {
  test('assigns ALLOCATION_A_FAIRE when stock covers need', async ({ assert }) => {
    const ctrl = new SuiviController()
    const ctx = mockContext({
      body: {
        lines: [sampleLines[0]],
        stock: sampleStock,
        referenceDate: '2026-06-18',
      },
    })
    ctx.request.only = () => ({
      lines: [sampleLines[0]],
      stock: sampleStock,
      referenceDate: '2026-06-18',
    })

    const result = await ctrl.assign(ctx)
    assert.equal(result.total_rows, 1)
    assert.equal(result.status_counts.ALLOCATION_A_FAIRE, 1)
    assert.equal(result.assignments[0].status, 'ALLOCATION_A_FAIRE')
  })

  test('assigns A_EXPEDIER when besoin_net <= 0', async ({ assert }) => {
    const ctrl = new SuiviController()
    const ctx = mockContext({
      body: {
        lines: [sampleLines[1]],
        stock: sampleStock,
        referenceDate: '2026-06-18',
      },
    })
    ctx.request.only = () => ({
      lines: [sampleLines[1]],
      stock: sampleStock,
      referenceDate: '2026-06-18',
    })

    const result = await ctrl.assign(ctx)
    assert.equal(result.total_rows, 1)
    assert.equal(result.status_counts.A_EXPEDIER, 1)
  })

  test('assigns multiple statuses across lines', async ({ assert }) => {
    const ctrl = new SuiviController()
    const ctx = mockContext({
      body: {
        lines: sampleLines,
        stock: sampleStock,
        referenceDate: '2026-06-18',
      },
    })
    ctx.request.only = () => ({
      lines: sampleLines,
      stock: sampleStock,
      referenceDate: '2026-06-18',
    })

    const result = await ctrl.assign(ctx)
    assert.equal(result.total_rows, 2)
    assert.equal(result.status_counts.ALLOCATION_A_FAIRE, 1)
    assert.equal(result.status_counts.A_EXPEDIER, 1)
  })

  test('uses current date when referenceDate not provided', async ({ assert }) => {
    const ctrl = new SuiviController()
    const ctx = mockContext({
      body: {
        lines: [sampleLines[0]],
        stock: sampleStock,
      },
    })
    ctx.request.only = () => ({
      lines: [sampleLines[0]],
      stock: sampleStock,
      referenceDate: null,
    })

    const result = await ctrl.assign(ctx)
    assert.equal(result.total_rows, 1)
  })

  test('returns assignment details with besoinNet and qteAlloueeVirtuelle', async ({ assert }) => {
    const ctrl = new SuiviController()
    const ctx = mockContext({
      body: {
        lines: [sampleLines[0]],
        stock: sampleStock,
        referenceDate: '2026-06-18',
      },
    })
    ctx.request.only = () => ({
      lines: [sampleLines[0]],
      stock: sampleStock,
      referenceDate: '2026-06-18',
    })

    const result = await ctrl.assign(ctx)
    assert.equal(result.assignments[0].numCommande, 'C001')
    assert.equal(result.assignments[0].article, 'ART1')
    assert.equal(result.assignments[0].besoinNet, 10)
    assert.equal(result.assignments[0].qteAlloueeVirtuelle, 10)
  })
})
