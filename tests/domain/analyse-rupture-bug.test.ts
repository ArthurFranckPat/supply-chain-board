import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import { analyseRupture } from '#app/domain/analyse-rupture'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
    ...overrides,
  }
}

function makeDemand(overrides: Partial<Flow> & { article: string; id: string }): Flow {
  return {
    quantity: 10,
    direction: 'demand',
    date: new Date('2026-04-10'),
    origin: { type: 'order', id: overrides.id, orderType: 'NOR', client: 'ACME' },
    ...overrides,
  } as Flow
}

function makeArticle(code: string, category: string = 'PF3'): Article {
  return {
    code,
    description: `Desc ${code}`,
    category,
    supplyType: 'FABRICATION',
    reorderDelay: 0,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
  }
}

function makeNomenclature(): Map<string, Nomenclature> {
  return new Map<string, Nomenclature>([
    [
      'PF1',
      {
        article: 'PF1',
        description: 'PF1 desc',
        components: [
          {
            parentArticle: 'PF1',
            parentDescription: 'PF1 desc',
            componentArticle: 'COMP1',
            componentDescription: 'Comp 1',
            linkQuantity: 1,
            componentType: 'ACHETE',
            consumptionNature: 'PROPORTIONNEL',
            level: 1,
          },
        ],
      },
    ],
  ])
}

test.group('analyseRupture - waterfall stock consumption bug', () => {
  test('stock physique of the ordered article should be consumed before the pool', ({ assert }) => {
    // BOM: PF1 needs 1 COMP1
    // COMP1 is the component in shortage (0 stock)
    // PF1 has 50 units in stock
    // Order of 100 PF1 should consume 50 from PF1 stock, then impact pool with 50
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 0 }),
      makeFlow({ article: 'PF1', quantity: 50 }),
      makeDemand({ article: 'PF1', id: 'CMD1', quantity: 100 }),
    ]

    const articles = new Map<string, Article>([
      ['COMP1', makeArticle('COMP1', 'AP')],
      ['PF1', makeArticle('PF1', 'PF3')],
    ])

    const result = analyseRupture('COMP1', flows, makeNomenclature(), articles)

    const blockedOrder = result.blockedOrders.find((o) => o.numCommande === 'CMD1')
    if (!blockedOrder) {
      throw new Error('CMD1 not found in blockedOrders')
    }

    // With correct Python behavior: 50 from PF1 stock + 50 from pool -> projPool = 0 (OK)
    // With current TS bug: 100 from pool -> projPool < 0 (RUPTURE)
    assert.equal(
      blockedOrder.etat,
      'OK',
      'stock physique of PF1 should be consumed before impacting the pool; current implementation skips it'
    )
    assert.equal(blockedOrder.qteImpactComposant, 50)
  })

  test('multiple demands consume article stock sequentially before pool', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 0 }),
      makeFlow({ article: 'PF1', quantity: 80 }),
      makeDemand({ article: 'PF1', id: 'CMD1', quantity: 50 }),
      makeDemand({ article: 'PF1', id: 'CMD2', quantity: 50 }),
    ]

    const articles = new Map<string, Article>([
      ['COMP1', makeArticle('COMP1', 'AP')],
      ['PF1', makeArticle('PF1', 'PF3')],
    ])

    const result = analyseRupture('COMP1', flows, makeNomenclature(), articles)

    const cmd1 = result.blockedOrders.find((o) => o.numCommande === 'CMD1')
    const cmd2 = result.blockedOrders.find((o) => o.numCommande === 'CMD2')
    if (!cmd1 || !cmd2) {
      throw new Error('CMD1 or CMD2 not found in blockedOrders')
    }

    // CMD1 consumes 50 from PF1 stock, 0 impact
    // CMD2 consumes 30 from PF1 stock, 20 impact
    assert.equal(cmd1.qteImpactComposant, 0)
    assert.equal(cmd2.qteImpactComposant, 20)
  })
})
