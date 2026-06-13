import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { OfOverride } from '#app/domain/planning_board'
import { evaluateOrderImpacts } from '#app/domain/order-impacts'

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)

function daysFromNow(n: number): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d
}

function isoDaysFromNow(n: number): string {
  return daysFromNow(n).toISOString().slice(0, 10)
}

function makeOfFlow(id: string, article: string, status: number, quantity: number, date: Date): Flow {
  return {
    article, quantity, direction: 'supply', date,
    origin: { type: 'of', id, status, designation: '', typeOfLabel: '', statutLabel: '' } as any,
  }
}

function makeStockFlow(article: string, quantity: number): Flow {
  return { article, quantity, direction: 'supply', date: null, origin: { type: 'stock', pmp: null } }
}

function makeDemand(id: string, article: string, quantity: number, date: Date, orderType: string = 'NOR', client: string = 'ACME'): Flow {
  return {
    article, quantity, direction: 'demand', date,
    origin: { type: 'order', id, orderType, client, description: '' } as any,
  }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code, description: `Desc ${code}`, category: 'PF3', supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

test.group('evaluateOrderImpacts', () => {
  test('on_time when OF covers demand before due date', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.stats.nbCommandes, 1)
    assert.equal(result.orders[0].statut, 'on_time')
    assert.equal(result.orders[0].ofs[0].numOf, 'OF-A')
    assert.equal(result.orders[0].joursRetard, 0)
  })

  test('retard when OF date is after demand date', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(20)),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'retard')
    assert.equal(result.orders[0].joursRetard, 10)
  })

  test('bloquee when OF component has no stock', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
      makeStockFlow('C1', 10), // not enough for BOM requirement
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'bloquee')
    assert.equal(result.orders[0].ofs[0].feasible, false)
  })

  test('stock when demand covered entirely by stock', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
      makeStockFlow('PF1', 100),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'stock')
  })

  test('sans_couverture when no OF and no stock', ({ assert }) => {
    const supplyFlows: Flow[] = []
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'sans_couverture')
    assert.equal(result.orders[0].reliquat, 60)
  })

  test('override changes OF date and creates retard', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 3, 60, daysFromNow(8)),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['PF1', makeArticle('PF1')]])
    const overrides = new Map<string, OfOverride>([
      ['OF-A', {
        numOf: 'OF-A', dateDebut: null, dateFin: isoDaysFromNow(20),
        status: null, workstation: null, note: null, updatedAt: '',
      }],
    ])

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.orders[0].statut, 'retard')
    assert.equal(result.orders[0].joursRetard, 10)
    assert.isTrue(result.orders[0].ofs[0].modified)
  })

  test('stats counts are correct', ({ assert }) => {
    const supplyFlows: Flow[] = [
      makeOfFlow('OF-A', 'PF1', 1, 60, daysFromNow(5)),
      makeStockFlow('PF2', 100),
    ]
    const demands: Flow[] = [
      makeDemand('CMD-1', 'PF1', 60, daysFromNow(10)),
      makeDemand('CMD-2', 'PF2', 30, daysFromNow(10)),
      makeDemand('CMD-3', 'PF3', 50, daysFromNow(10)),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([
      ['PF1', makeArticle('PF1')],
      ['PF2', makeArticle('PF2')],
      ['PF3', makeArticle('PF3')],
    ])
    const overrides = new Map<string, OfOverride>()

    const result = evaluateOrderImpacts(demands, supplyFlows, nomenclatures, articles, overrides, {
      from: daysFromNow(-7), to: daysFromNow(42),
    })

    assert.equal(result.stats.nbCommandes, 3)
    assert.equal(result.stats.nbOnTime, 2) // PF1 (OF) + PF2 (stock)
    assert.equal(result.stats.nbSansCouverture, 1) // PF3
  })
})
