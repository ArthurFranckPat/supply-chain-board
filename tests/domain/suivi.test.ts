import { test } from '@japa/runner'
import { assignStatuses } from '#app/domain/suivi'
import type { OrderLine } from '#app/domain/suivi'

function makeLine(
  overrides: Partial<OrderLine> & { numCommande: string; article: string }
): OrderLine {
  return {
    ligne: '1000',
    designation: '',
    nomClient: '',
    typeCommande: 'MTO',
    dateExpedition: null,
    dateLivPrevu: null,
    qteCommandee: 100,
    qteAllouee: 0,
    qteRestante: 100,
    isFabrique: false,
    isHardPegged: false,
    ...overrides,
  }
}

test.group('assignStatuses', () => {
  const refDate = new Date('2026-06-10')

  test('besoin_net <= 0 → A_EXPEDIER', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({ numCommande: 'C1', article: 'A', qteRestante: 50, qteAllouee: 50 }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 0, qc: 0, total: 0 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'A_EXPEDIER')
  })

  test('MTS fabrique with passed date and not in zone → RETARD_PROD', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        typeCommande: 'MTS',
        isFabrique: true,
        dateExpedition: new Date('2026-06-05'),
        qteRestante: 50,
      }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 10, qc: 0, total: 10 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'RETARD_PROD')
  })

  test('MTS fabrique not in retard → RAS', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        typeCommande: 'MTS',
        isFabrique: true,
        dateExpedition: new Date('2026-06-15'),
        qteRestante: 50,
      }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 10, qc: 0, total: 10 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'RAS')
  })

  test('demand covered by stock → ALLOCATION_A_FAIRE', ({ assert }) => {
    const lines: OrderLine[] = [makeLine({ numCommande: 'C1', article: 'A', qteRestante: 50 })]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 100, qc: 0, total: 100 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'ALLOCATION_A_FAIRE')
    assert.equal(results[0].qteAlloueeVirtuelle, 50)
  })

  test('stock covers partially, date passed, not in zone → RETARD_PROD', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        qteRestante: 100,
        dateExpedition: new Date('2026-06-05'),
      }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 30, qc: 0, total: 30 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'RETARD_PROD')
  })

  test('stock covers partially, date not passed → RAS', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({
        numCommande: 'C1',
        article: 'A',
        qteRestante: 100,
        dateExpedition: new Date('2026-06-20'),
      }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 30, qc: 0, total: 30 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'RAS')
  })

  test('uses QC stock when strict is insufficient', ({ assert }) => {
    const lines: OrderLine[] = [makeLine({ numCommande: 'C1', article: 'A', qteRestante: 50 })]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 20, qc: 30, total: 50 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'ALLOCATION_A_FAIRE')
    assert.equal(results[0].qteAlloueeVirtuelle, 50)
    assert.isTrue(results[0].utiliseStockSousCq)
  })

  test('virtual consumption: second line sees reduced stock', ({ assert }) => {
    const lines: OrderLine[] = [
      makeLine({ numCommande: 'C1', article: 'A', qteRestante: 60 }),
      makeLine({ numCommande: 'C2', article: 'A', qteRestante: 60 }),
    ]
    const stock = new Map<string, { strict: number; qc: number; total: number }>([
      ['A', { strict: 100, qc: 0, total: 100 }],
    ])
    const results = assignStatuses(lines, stock, refDate)
    assert.equal(results[0].status, 'ALLOCATION_A_FAIRE')
    assert.equal(results[1].status, 'RAS')
    assert.equal(results[0].qteAlloueeVirtuelle, 60)
    assert.equal(results[1].qteAlloueeVirtuelle, 40)
  })
})
