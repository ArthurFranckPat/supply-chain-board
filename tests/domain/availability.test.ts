import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import {
  currentStock,
  availableAt,
  shortageAt,
  firstCoverageDate,
  allocateFromSupply,
  snapshot,
} from '#app/domain/availability'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
    ...overrides,
  }
}

test.group('currentStock', () => {
  test('returns 0 when no flows', ({ assert }) => {
    assert.equal(currentStock([], 'A'), 0)
  })

  test('sums supply flows with null date', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: new Date('2026-01-01') }),
    ]
    assert.equal(currentStock(flows, 'A'), 100)
  })

  test('subtracts demand flows with null date', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
      makeFlow({ article: 'A', direction: 'demand', quantity: 30, date: null, origin: { type: 'allocation', docId: 'D1' } }),
    ]
    assert.equal(currentStock(flows, 'A'), 70)
  })
})

test.group('availableAt', () => {
  const day1 = new Date('2026-01-10')
  const day2 = new Date('2026-01-20')

  test('includes receptions up to date', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: day1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 20, date: day2, origin: { type: 'reception', id: 'R2', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    assert.equal(availableAt(flows, 'A', day1, 'stock_plus_receptions'), 80)
    assert.equal(availableAt(flows, 'A', day2, 'stock_plus_receptions'), 100)
  })

  test('accounts for demand', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
      makeFlow({ article: 'A', direction: 'demand', quantity: 40, date: day1, origin: { type: 'order', id: 'C1', customer: 'X', pays: null, orderType: 'MTO', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 } }),
    ]
    assert.equal(availableAt(flows, 'A', day1, 'stock_plus_receptions'), 60)
  })
})

test.group('shortageAt', () => {
  test('returns 0 when stock covers need', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
    ]
    assert.equal(shortageAt(flows, 'A', 50, new Date('2026-01-10')), 0)
  })

  test('returns deficit when stock insufficient', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: null }),
    ]
    assert.equal(shortageAt(flows, 'A', 100, new Date('2026-01-10')), 70)
  })

  test('considers reserved quantity', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 20, date: null }),
    ]
    assert.equal(shortageAt(flows, 'A', 30, new Date('2026-01-10'), 4), 6)
  })
})

test.group('availableAt with virtual stock state', () => {
  test('uses stock state when receptions are ignored', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    const stockState = { getAvailable: () => 12.5 }

    assert.equal(availableAt(flows, 'A', d1, 'stock_strict', stockState), 12.5)
  })
})

test.group('firstCoverageDate', () => {
  test('returns null when already covered', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
    ]
    assert.isNull(firstCoverageDate(flows, 'A', 50))
  })

  test('returns reception date that fills the gap', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const d2 = new Date('2026-01-20')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: d2, origin: { type: 'reception', id: 'R2', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    // Need 70: stock(30) + reception d1(50) = 80 >= 70 -> d1
    assert.deepEqual(firstCoverageDate(flows, 'A', 70), d1)
  })

  test('returns null when never covered', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: null }),
    ]
    assert.isNull(firstCoverageDate(flows, 'A', 100))
  })
})

test.group('allocateFromSupply', () => {
  test('fully allocates from stock', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100, date: null }),
    ]
    const result = allocateFromSupply(flows, 'A', 60)
    assert.equal(result.allocated, 60)
    assert.equal(result.remaining, 0)
    assert.lengthOf(result.details, 1)
    assert.equal(result.details[0].taken, 60)
  })

  test('partially allocates when insufficient', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: null }),
    ]
    const result = allocateFromSupply(flows, 'A', 100)
    assert.equal(result.allocated, 30)
    assert.equal(result.remaining, 70)
  })

  test('allocates from multiple flows in date order', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 40, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 80, date: null }),
    ]
    const result = allocateFromSupply(flows, 'A', 100)
    assert.equal(result.allocated, 100)
    assert.equal(result.remaining, 0)
    // Stock (null date) first, then reception
    assert.equal(result.details[0].taken, 80)
    assert.equal(result.details[1].taken, 20)
  })
})

test.group('snapshot', () => {
  test('provides complete availability view', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    const snap = snapshot(flows, 'A', d1, 100, 'stock_plus_receptions')
    assert.equal(snap.currentStock, 50)
    assert.equal(snap.receptionsUntilDate, 30)
    assert.equal(snap.availableAtDate, 80)
    assert.equal(snap.shortage, 20)
    assert.deepEqual(snap.earliestReception, d1)
  })

  test('can ignore receptions', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    const snap = snapshot(flows, 'A', d1, undefined, 'stock_strict')
    assert.equal(snap.currentStock, 50)
    assert.equal(snap.receptionsUntilDate, 0)
    assert.equal(snap.availableAtDate, 50)
  })
})
