import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import { netQuantity, isSupply, isDemand, sortByDate } from '#app/domain/models/flow'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
    ...overrides,
  }
}

test.group('Flow helpers', () => {
  test('isSupply/isDemand classify flows', ({ assert }) => {
    const supply = makeFlow({ article: 'A', direction: 'supply' })
    const demand = makeFlow({ article: 'A', direction: 'demand' })
    assert.isTrue(isSupply(supply))
    assert.isFalse(isSupply(demand))
    assert.isTrue(isDemand(demand))
    assert.isFalse(isDemand(supply))
  })

  test('netQuantity sums supply positively and demand negatively', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 100 }),
      makeFlow({ article: 'A', direction: 'demand', quantity: 30, origin: { type: 'order', id: 'C1', customer: 'X', pays: null, orderType: 'MTO', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 } }),
      makeFlow({ article: 'B', direction: 'supply', quantity: 50 }),
    ]
    assert.equal(netQuantity(flows, 'A'), 70)
    assert.equal(netQuantity(flows, 'B'), 50)
    assert.equal(netQuantity(flows, 'C'), 0)
  })

  test('netQuantity filters by date', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const d2 = new Date('2026-01-20')
    const flows: Flow[] = [
      makeFlow({ article: 'A', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 30, date: d1, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
      makeFlow({ article: 'A', direction: 'supply', quantity: 20, date: d2, origin: { type: 'reception', id: 'R2', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    assert.equal(netQuantity(flows, 'A', d1), 80)
    assert.equal(netQuantity(flows, 'A', d2), 100)
  })

  test('sortByDate puts null dates first then ascending', ({ assert }) => {
    const d1 = new Date('2026-01-10')
    const d2 = new Date('2026-01-20')
    const flows: Flow[] = [
      makeFlow({ article: 'A', date: d2 }),
      makeFlow({ article: 'A', date: null }),
      makeFlow({ article: 'A', date: d1 }),
    ]
    const sorted = sortByDate(flows)
    assert.isNull(sorted[0].date)
    assert.deepEqual(sorted[1].date, d1)
    assert.deepEqual(sorted[2].date, d2)
  })
})
