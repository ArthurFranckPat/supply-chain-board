import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import { promiseDate } from '#app/domain/promise-date'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10, direction: 'supply', date: null, origin: { type: 'stock', pmp: null }, ...overrides,
  }
}

function makeArticle(code: string): Article {
  return {
    code, description: '', category: 'PROD', supplyType: 'FABRICATION',
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

test.group('promiseDate', () => {
  test('returns today when already feasible', ({ assert }) => {
    const flows: Flow[] = [makeFlow({ article: 'ART1', quantity: 100 })]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['ART1', makeArticle('ART1')]])

    const result = promiseDate('ART1', 50, flows, nomenclatures, articles)

    assert.isTrue(result.feasible)
    assert.isNotNull(result.feasibleDate)
    assert.equal(result.blockingComponents.length, 0)
  })

  test('returns null when never feasible within horizon', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', quantity: 10 }),
      makeFlow({ article: 'COMP1', quantity: 0 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          { parentArticle: 'ART1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['ART1', makeArticle('ART1')], ['COMP1', makeArticle('COMP1')]])

    const result = promiseDate('ART1', 50, flows, nomenclatures, articles, { maxHorizonDays: 5 })

    assert.isFalse(result.feasible)
    assert.isNull(result.feasibleDate)
    assert.isAbove(result.blockingComponents.length, 0)
  })

  test('returns future date when reception will cover', ({ assert }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 0 }),
      {
        article: 'COMP1', quantity: 100, direction: 'supply', date: tomorrow,
        origin: { type: 'reception', id: 'PO1', supplier: 'Fournisseur' },
      } as Flow,
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          { parentArticle: 'ART1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([
      ['ART1', makeArticle('ART1')],
      ['COMP1', makeArticle('COMP1')],
    ])

    const result = promiseDate('ART1', 50, flows, nomenclatures, articles, { maxHorizonDays: 10 })

    assert.isTrue(result.feasible)
    assert.isNotNull(result.feasibleDate)
    assert.isAtLeast(result.daysChecked, 2)
  })

  test('respects maxHorizonDays', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', quantity: 0 }),
      makeFlow({ article: 'COMP1', quantity: 0 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          { parentArticle: 'ART1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['ART1', makeArticle('ART1')], ['COMP1', makeArticle('COMP1')]])

    const result = promiseDate('ART1', 50, flows, nomenclatures, articles, { maxHorizonDays: 3 })

    assert.isFalse(result.feasible)
    assert.equal(result.daysChecked, 4)
  })
})
