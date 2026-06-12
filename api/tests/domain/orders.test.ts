import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import { matchOrder, matchOrders } from '#app/domain/orders'
import type { Article } from '#app/domain/models/article'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
    ...overrides,
  }
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    code: 'ART1',
    description: 'Test article',
    category: 'PROD',
    supplyType: 'FABRICATION',
    reorderDelay: 5,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
    ...overrides,
  }
}

test.group('matchOrder', () => {
  test('MTS: hard-pegging with linked OF', ({ assert }) => {
    const demand = makeFlow({
      article: 'ART1',
      direction: 'demand',
      quantity: 50,
      date: new Date('2026-01-15'),
      origin: { type: 'order', id: 'C1', customer: 'Client', pays: null, orderType: 'MTS', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
    })
    const supplies: Flow[] = [
      makeFlow({
        article: 'ART1',
        direction: 'supply',
        quantity: 50,
        date: new Date('2026-01-14'),
        origin: { type: 'of', id: 'OF1', status: 1, statutLabel: null, typeOf: null, typeOfLabel: null, designation: null },
      }),
    ]
    const articles = new Map<string, Article>()
    const result = matchOrder(demand, supplies, articles)
    assert.equal(result.method, 'mts_hard_pegging')
    assert.equal(result.coveredByOf[0].ofId, 'OF1')
    assert.equal(result.uncovered, 0)
  })

  test('MTS: partial coverage triggers alert', ({ assert }) => {
    const demand = makeFlow({
      article: 'ART1',
      direction: 'demand',
      quantity: 100,
      date: new Date('2026-01-15'),
      origin: { type: 'order', id: 'C1', customer: 'Client', pays: null, orderType: 'MTS', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
    })
    const supplies: Flow[] = [
      makeFlow({
        article: 'ART1',
        direction: 'supply',
        quantity: 60,
        date: new Date('2026-01-14'),
        origin: { type: 'of', id: 'OF1', status: 1, statutLabel: null, typeOf: null, typeOfLabel: null, designation: null },
      }),
    ]
    const articles = new Map<string, Article>()
    const result = matchOrder(demand, supplies, articles)
    assert.equal(result.uncovered, 40)
    assert.isTrue(result.alerts.length > 0)
  })

  test('NOR/MTO: covered entirely by stock', ({ assert }) => {
    const demand = makeFlow({
      article: 'ART1',
      direction: 'demand',
      quantity: 30,
      date: new Date('2026-01-15'),
      origin: { type: 'order', id: 'C2', customer: 'Client', pays: null, orderType: 'MTO', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
    })
    const supplies: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100, date: null }),
    ]
    const articles = new Map<string, Article>([['ART1', makeArticle()]])
    const result = matchOrder(demand, supplies, articles)
    assert.equal(result.method, 'stock_complete')
    assert.equal(result.coveredByStock, 30)
    assert.equal(result.uncovered, 0)
  })

  test('purchase article: stock only, no OF', ({ assert }) => {
    const demand = makeFlow({
      article: 'ART1',
      direction: 'demand',
      quantity: 80,
      date: new Date('2026-01-15'),
      origin: { type: 'order', id: 'C3', customer: 'Client', pays: null, orderType: 'NOR', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
    })
    const supplies: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 30, date: null }),
    ]
    const articles = new Map<string, Article>([['ART1', makeArticle({ supplyType: 'ACHAT' })]])
    const result = matchOrder(demand, supplies, articles)
    assert.equal(result.method, 'purchase_supply')
    assert.equal(result.coveredByStock, 30)
    assert.equal(result.uncovered, 50)
  })

  test('NOR/MTO: cumulative OF coverage', ({ assert }) => {
    const demand = makeFlow({
      article: 'ART1',
      direction: 'demand',
      quantity: 100,
      date: new Date('2026-01-15'),
      origin: { type: 'order', id: 'C4', customer: 'Client', pays: null, orderType: 'NOR', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
    })
    const supplies: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 20, date: null }),
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 40, date: new Date('2026-01-10'), origin: { type: 'of', id: 'OF1', status: 1, statutLabel: null, typeOf: null, typeOfLabel: null, designation: null } }),
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 50, date: new Date('2026-01-12'), origin: { type: 'of', id: 'OF2', status: 3, statutLabel: null, typeOf: null, typeOfLabel: null, designation: null } }),
    ]
    const articles = new Map<string, Article>([['ART1', makeArticle()]])
    const result = matchOrder(demand, supplies, articles)
    assert.equal(result.method, 'nor_mto_cumulative')
    assert.equal(result.coveredByStock, 20)
    assert.lengthOf(result.coveredByOf, 2)
    assert.equal(result.uncovered, 0)
  })
})

test.group('matchOrders', () => {
  test('virtual consumption: second order sees reduced stock', ({ assert }) => {
    const demands: Flow[] = [
      makeFlow({
        article: 'ART1',
        direction: 'demand',
        quantity: 60,
        date: new Date('2026-01-10'),
        origin: { type: 'order', id: 'C1', customer: 'A', pays: null, orderType: 'MTO', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
      }),
      makeFlow({
        article: 'ART1',
        direction: 'demand',
        quantity: 60,
        date: new Date('2026-01-11'),
        origin: { type: 'order', id: 'C2', customer: 'B', pays: null, orderType: 'MTO', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
      }),
    ]
    const supplies: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100, date: null }),
    ]
    const articles = new Map<string, Article>([['ART1', makeArticle()]])
    const results = matchOrders(demands, supplies, articles)

    assert.equal(results[0].coveredByStock, 60)
    assert.equal(results[0].uncovered, 0)
    assert.equal(results[1].coveredByStock, 40)
    assert.equal(results[1].uncovered, 20)
  })

  test('orders processed before forecasts', ({ assert }) => {
    const demands: Flow[] = [
      makeFlow({
        article: 'ART1',
        direction: 'demand',
        quantity: 50,
        date: new Date('2026-01-15'),
        origin: { type: 'forecast', id: 'F1', customer: null, pays: null, orderType: 'NOR', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
      }),
      makeFlow({
        article: 'ART1',
        direction: 'demand',
        quantity: 50,
        date: new Date('2026-01-10'),
        origin: { type: 'order', id: 'C1', customer: 'A', pays: null, orderType: 'NOR', nature: 'COMMANDE', contremarque: null, qteCommandee: 0, qteAllouee: 0 },
      }),
    ]
    const supplies: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 70, date: null }),
    ]
    const articles = new Map<string, Article>([['ART1', makeArticle()]])
    const results = matchOrders(demands, supplies, articles)

    // Order first
    const orderResult = results.find((r) => r.demandFlow.origin.type === 'order')!
    const forecastResult = results.find((r) => r.demandFlow.origin.type === 'forecast')!
    assert.equal(orderResult.coveredByStock, 50)
    assert.equal(forecastResult.coveredByStock, 20)
  })
})
