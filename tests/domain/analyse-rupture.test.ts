import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import { analyseRupture } from '#app/domain/analyse-rupture'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10, direction: 'supply', date: null, origin: { type: 'stock', pmp: null }, ...overrides,
  }
}

function makeArticle(code: string, category: string = 'PF3'): Article {
  return {
    code, description: `Desc ${code}`, category, supplyType: 'FABRICATION',
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

test.group('analyseRupture', () => {
  test('returns empty results when no parents in BOM', ({ assert }) => {
    const flows: Flow[] = [makeFlow({ article: 'COMP1', quantity: 100 })]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map([['COMP1', makeArticle('COMP1')]])

    const result = analyseRupture('COMP1', flows, nomenclatures, articles)

    assert.equal(result.component.code, 'COMP1')
    assert.equal(result.component.stockPhysique, 100)
    assert.equal(result.blockedOrders.length, 0)
    assert.equal(result.blockedOfsWithoutOrder.length, 0)
    assert.equal(result.summary.totalBlockedOfs, 0)
  })

  test('BFS finds parent articles through BOM', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 10 }),
      makeFlow({ article: 'SF1', quantity: 5 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['SF1', {
        article: 'SF1', description: 'SF', components: [
          { parentArticle: 'SF1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 2, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([
      ['COMP1', makeArticle('COMP1', 'AP')],
      ['SF1', makeArticle('SF1', 'SF1')],
    ])

    const result = analyseRupture('COMP1', flows, nomenclatures, articles)

    assert.equal(result.summary.nodesVisited, 2)
    assert.isAbove(result.component.poolTotal, 0)
  })

  test('waterfall identifies rupture when pool exhausted', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 5, direction: 'supply' }),
      {
        article: 'SF1', quantity: 100, direction: 'demand', date: new Date('2026-04-10'),
        origin: { type: 'order', id: 'CMD1', orderType: 'NOR', client: 'Client A' } as any,
      } as Flow,
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['SF1', {
        article: 'SF1', description: 'SF', components: [
          { parentArticle: 'SF1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([
      ['COMP1', makeArticle('COMP1', 'AP')],
      ['SF1', makeArticle('SF1', 'SF1')],
    ])

    const result = analyseRupture('COMP1', flows, nomenclatures, articles)

    assert.isAbove(result.blockedOrders.length, 0)
    assert.equal(result.blockedOrders[0].etat, 'RUPTURE')
  })

  test('pool computation includes SF category', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 100 }),
      makeFlow({ article: 'SF1', quantity: 50 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['SF1', {
        article: 'SF1', description: 'SF', components: [
          { parentArticle: 'SF1', parentDescription: '', level: 5, componentArticle: 'COMP1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([
      ['COMP1', makeArticle('COMP1', 'AP')],
      ['SF1', makeArticle('SF1', 'SF1')],
    ])

    const result = analyseRupture('COMP1', flows, nomenclatures, articles)

    assert.isAbove(result.component.poolTotal, 100)
    assert.equal(result.summary.maxBomDepth, 2)
  })
})
