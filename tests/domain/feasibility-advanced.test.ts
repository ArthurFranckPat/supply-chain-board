import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import { checkFeasibility } from '#app/domain/feasibility'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', pmp: null },
    ...overrides,
  }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code,
    description: `Desc ${code}`,
    category: 'PROD',
    supplyType,
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

function makeNomenclature(
  parent: string,
  components: { code: string; qty: number; type: 'ACHETE' | 'FABRIQUE' }[]
): Nomenclature {
  const entries: NomenclatureEntry[] = components.map((c) => ({
    parentArticle: parent,
    parentDescription: `Desc ${parent}`,
    componentArticle: c.code,
    componentDescription: `Desc ${c.code}`,
    linkQuantity: c.qty,
    componentType: c.type,
    consumptionNature: 'PROPORTIONNEL',
    level: 1,
  }))

  return {
    article: parent,
    description: `Desc ${parent}`,
    components: entries,
  }
}

test.group('checkFeasibility - advanced cases', () => {
  test('use_receptions=false ignores future receptions', ({ assert }) => {
    const recvDate = new Date('2026-05-01')
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 50 }),
      makeFlow({ article: 'COMP1', quantity: 150, date: recvDate }),
      makeFlow({ article: 'ART1', quantity: 0 }),
    ]

    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', makeNomenclature('ART1', [{ code: 'COMP1', qty: 2, type: 'ACHETE' }])],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle('ART1')],
      ['COMP1', makeArticle('COMP1', 'ACHAT')],
    ])

    // Need 200 COMP1 (link qty 2 x 100). Stock=50 + recv=150 = 200 -> feasible with receptions
    const withReceptions = checkFeasibility('ART1', 100, flows, nomenclatures, articles, recvDate, 'stock_plus_receptions')
    assert.isTrue(withReceptions.feasible)

    // Same scenario, but ignoring receptions: only 50 stock -> shortage 150
    const withoutReceptions = checkFeasibility('ART1', 100, flows, nomenclatures, articles, recvDate, 'stock_strict')
    assert.isFalse(withoutReceptions.feasible)
    assert.equal(withoutReceptions.blockingComponents[0].shortage, 150)
  })

  test('manufactured sub-assembly without OF is reported differently than Python', ({ assert }) => {
    // Python RecursiveChecker would look for an OF for SUB1 first.
    // If no OF exists, Python reports SUB1 as missing.
    // TypeScript descends directly into SUB1 BOM and reports COMP1 as missing.
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', quantity: 0 }),
      makeFlow({ article: 'ART1', quantity: 0 }),
    ]

    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', makeNomenclature('ART1', [{ code: 'SUB1', qty: 1, type: 'FABRIQUE' }])],
      ['SUB1', makeNomenclature('SUB1', [{ code: 'COMP1', qty: 1, type: 'ACHETE' }])],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle('ART1')],
      ['SUB1', makeArticle('SUB1')],
      ['COMP1', makeArticle('COMP1', 'ACHAT')],
    ])

    const result = checkFeasibility('ART1', 10, flows, nomenclatures, articles, undefined, 'stock_strict')

    // This assertion documents the current TS behavior.
    // In Python, the missing article would be SUB1 (no OF found).
    assert.isFalse(result.feasible)
    assert.equal(result.blockingComponents[0].article, 'COMP1')
    assert.equal(result.blockingComponents[0].shortage, 10)
  })
})
