import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import { FeasibilityService, type FeasibilityServiceLoader } from '#app/domain/feasibility-service'

function makeArticle(code: string, category: 'ACHAT' | 'FABRICATION' = 'ACHAT'): Article {
  return {
    code,
    description: code,
    category,
    supplyType: category === 'ACHAT' ? 'ACHAT' : 'FABRICATION',
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

function makeNomenclature(parent: string, components: Array<{ code: string; qte: number; type: 'ACHETE' | 'FABRIQUE' }>): Nomenclature {
  return {
    article: parent,
    description: `BOM for ${parent}`,
    components: components.map((c) => ({
      parentArticle: parent,
      parentDescription: `DESC_${parent}`,
      level: 10,
      componentArticle: c.code,
      componentDescription: `DESC_${c.code}`,
      linkQuantity: c.qte,
      componentType: c.type,
      consumptionNature: 'PROPORTIONNEL' as const,
    })),
  }
}

test.group('FeasibilityService', () => {
  test('check purchase article respects useReceptions flag', ({ assert }) => {
    const loader: FeasibilityServiceLoader = {
      getArticle: () => makeArticle('C1', 'ACHAT'),
      getNomenclature: () => undefined,
      getStock: () => ({ stockPhysique: 0, stockAlloue: 0 }),
      getReceptions: () => [{ id: 'REC-1', article: 'C1', supplier: 'SUP1', quantity: 10, date: new Date('2026-04-15') }],
      getAllocationsOf: () => [],
      getOfsByArticle: () => [],
    }
    const service = new FeasibilityService(loader)

    const withoutReceptions = service.check('C1', 5, new Date('2026-04-15'), { useReceptions: false })
    assert.isFalse(withoutReceptions.feasible)
    assert.lengthOf(withoutReceptions.componentGaps, 1)
    assert.equal(withoutReceptions.componentGaps[0].quantityAvailable, 0)

    const withReceptions = service.check('C1', 5, new Date('2026-04-15'), { useReceptions: true })
    assert.isTrue(withReceptions.feasible)
    assert.lengthOf(withReceptions.componentGaps, 0)
  })

  test('check fabricated article respects useReceptions flag', ({ assert }) => {
    const stockC1 = { stockPhysique: 0, stockAlloue: 0 }
    const recC1 = [{ id: 'PO1', article: 'C1', supplier: 'SUP1', quantity: 10, date: new Date('2026-04-10') }]

    const loader: FeasibilityServiceLoader = {
      getArticle: (a: string) => a === 'PF1' ? makeArticle('PF1', 'FABRICATION') : makeArticle(a, 'ACHAT'),
      getNomenclature: (a: string) => a === 'PF1'
        ? makeNomenclature('PF1', [{ code: 'C1', qte: 1, type: 'ACHETE' }])
        : undefined,
      getStock: (a: string) => a === 'C1' ? stockC1 : undefined,
      getReceptions: (a: string) => a === 'C1' ? recC1 : [],
      getAllocationsOf: () => [],
      getOfsByArticle: () => [],
    }
    const service = new FeasibilityService(loader)

    const withoutReceptions = service.check('PF1', 5, new Date('2026-04-15'), { useReceptions: false })
    assert.isFalse(withoutReceptions.feasible)
    assert.isAbove(withoutReceptions.componentGaps.length, 0)
    assert.equal(withoutReceptions.componentGaps[0].quantityAvailable, 0)

    const withReceptions = service.check('PF1', 5, new Date('2026-04-15'), { useReceptions: true })
    assert.isTrue(withReceptions.feasible)
    assert.lengthOf(withReceptions.componentGaps, 0)
  })

  test('promiseDate purchase uses first covering reception', ({ assert }) => {
    const loader: FeasibilityServiceLoader = {
      getArticle: () => makeArticle('C1', 'ACHAT'),
      getNomenclature: () => undefined,
      getStock: () => ({ stockPhysique: 0, stockAlloue: 0 }),
      getReceptions: () => [
        { id: 'REC-1', article: 'C1', supplier: 'SUP1', quantity: 5, date: new Date('2026-04-10') },
        { id: 'REC-2', article: 'C1', supplier: 'SUP1', quantity: 5, date: new Date('2026-04-12') },
      ],
      getAllocationsOf: () => [],
      getOfsByArticle: () => [],
    }
    const service = new FeasibilityService(loader)

    // Need 10, first reception gives 5 on 2026-04-10 -> still not enough
    // Second gives 5 on 2026-04-12 -> total 10 -> feasible on 2026-04-12
    const result = service.promiseDate('C1', 10, { horizonDays: 365 })
    assert.isTrue(result.feasible)
    assert.isNotNull(result.feasibleDate)
    // feasibleDate should be >= 2026-04-12 (the second reception)
    const feasibleDate = new Date(result.feasibleDate!)
    const expectedDate = new Date('2026-04-12')
    assert.isAtLeast(feasibleDate.getTime(), expectedDate.getTime())
  })
})
