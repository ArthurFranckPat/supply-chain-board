import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import { RecursiveChecker, type RecursiveCheckerLoader, type OfRecord, type StockRecord, type ReceptionRecord } from '#app/domain/recursive-checker'
import { StockState } from '#app/domain/stock-state'

function makeNomenclature(parent: string, components: Array<[string, number, 'ACHETE' | 'FABRIQUE']>): Nomenclature {
  return {
    article: parent,
    description: parent,
    components: components.map(([componentArticle, linkQuantity, componentType]) => ({
      parentArticle: parent,
      parentDescription: parent,
      level: 10,
      componentArticle,
      componentDescription: componentArticle,
      linkQuantity,
      componentType,
      consumptionNature: 'PROPORTIONNEL',
    } as NomenclatureEntry)),
  }
}

function makeArticle(code: string, category: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code, description: code, category, supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

function makeOf(numOf: string, article: string, statutNum: number, dateFin: Date, qteRestante: number = 100, dateDebut?: Date): OfRecord {
  return { numOf, article, statutNum, qteRestante, dateFin, dateDebut }
}

function makeLoader(opts: {
  articles?: Record<string, Article>
  nomenclatures?: Record<string, Nomenclature>
  stocks?: Record<string, StockRecord>
  allocations?: Record<string, Array<{ article: string; qteAllouee: number }>>
  ofs?: OfRecord[]
  receptions?: Record<string, ReceptionRecord[]>
}): RecursiveCheckerLoader {
  return {
    getArticle: (article: string) => opts.articles?.[article],
    getNomenclature: (article: string) => opts.nomenclatures?.[article],
    getStock: (article: string) => opts.stocks?.[article],
    getAllocationsOf: (numDoc: string) => opts.allocations?.[numDoc] ?? [],
    getOfsByArticle: (article: string) => (opts.ofs ?? []).filter((of) => of.article === article),
    getReceptions: (article: string) => opts.receptions?.[article] ?? [],
  }
}

test.group('RecursiveChecker init', () => {
  test('init without stock state', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}))
    assert.equal(checker.useReceptions, false)
    assert.isUndefined(checker.stockState)
  })

  test('init with stock state', ({ assert }) => {
    const state = new StockState(new Map([['A1953', 100]]))
    const checker = new RecursiveChecker(makeLoader({}), { stockState: state })
    assert.equal(checker.stockState, state)
  })

  test('init with receptions', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}), { useReceptions: true })
    assert.equal(checker.useReceptions, true)
  })
})

test.group('RecursiveChecker checkOf', () => {
  test('firm OF with ERP allocations skips allocated component', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF: makeArticle('PF', 'PF'),
        COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
        COMP_B: makeArticle('COMP_B', 'AP', 'ACHAT'),
      },
      nomenclatures: { PF: makeNomenclature('PF', [['COMP_A', 1, 'ACHETE'], ['COMP_B', 2, 'ACHETE']]) },
      stocks: {
        COMP_A: { stockPhysique: 10, stockAlloue: 10 },
        COMP_B: { stockPhysique: 5, stockAlloue: 0 },
      },
      allocations: { OF_FERME_1: [{ article: 'COMP_A', qteAllouee: 10 }] },
    }))

    const result = checker.checkOf(makeOf('OF_FERME_1', 'PF', 1, new Date('2026-04-20'), 10))

    assert.isTrue(result.feasible)
    assert.notProperty(result.missingComponents, 'COMP_A')
  })

  test('suggested OF without stock state checks real stock', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF: makeArticle('PF', 'PF'),
        COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
      },
      nomenclatures: { PF: makeNomenclature('PF', [['COMP_A', 1, 'ACHETE']]) },
      stocks: { COMP_A: { stockPhysique: 100, stockAlloue: 0 } },
    }))

    const result = checker.checkOf(makeOf('OF_SUGG_1', 'PF', 3, new Date('2026-04-20'), 10))

    assert.isTrue(result.feasible)
    assert.isNumber(result.componentsChecked)
  })
})

test.group('RecursiveChecker checkStock', () => {
  test('real stock covers need', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      stocks: { A1953: { stockPhysique: 150, stockAlloue: 0 } },
    }))
    const result = checker['checkStock']('A1953', 10, new Date())
    assert.isTrue(result.feasible)
  })

  test('virtual stock sufficient', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}), { stockState: new StockState(new Map([['A1953', 100]])) })
    const result = checker['checkStock']('A1953', 50, new Date())
    assert.isTrue(result.feasible)
    assert.deepEqual(result.missingComponents, {})
  })

  test('virtual stock insufficient reports shortage', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}), { stockState: new StockState(new Map([['A1953', 100]])) })
    const result = checker['checkStock']('A1953', 150, new Date())
    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['A1953'], 50)
  })

  test('virtual stock zero reports full shortage', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}), { stockState: new StockState(new Map([['A1953', 0]])) })
    const result = checker['checkStock']('A1953', 50, new Date())
    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['A1953'], 50)
  })

  test('article not in stock state reports full shortage', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}), { stockState: new StockState(new Map()) })
    const result = checker['checkStock']('A1953', 50, new Date())
    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['A1953'], 50)
  })

  test('same-day reception counted when useReceptions enabled', ({ assert }) => {
    const needDay = new Date('2026-04-15')
    const checker = new RecursiveChecker(makeLoader({
      stocks: { A1953: { stockPhysique: 0, stockAlloue: 0 } },
      receptions: {
        A1953: [{ id: 'PO-1', article: 'A1953', supplier: 'F1', quantity: 10, date: needDay }],
      },
    }), { useReceptions: true })

    const result = checker['checkStock']('A1953', 5, needDay)
    assert.isTrue(result.feasible)
  })
})

test.group('RecursiveChecker getDateBesoinCommande', () => {
  test('uses DATE_DEBUT in priority', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}))
    const d = checker.getDateBesoinCommande(makeOf('OF1', 'ART1', 3, new Date('2026-04-18'), 10, new Date('2026-04-15')))
    assert.deepEqual(d, new Date('2026-04-15'))
  })

  test('falls back to DATE_FIN minus two days', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({}))
    const d = checker.getDateBesoinCommande(makeOf('OF1', 'ART1', 3, new Date('2026-04-18'), 10))
    assert.deepEqual(d, new Date('2026-04-16'))
  })
})

test.group('RecursiveChecker fabricated components', () => {
  test('fabricated component declared missing and traversed to buy part', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        SE_FAB: makeArticle('SE_FAB', 'SF'),
        ACH_MISS: makeArticle('ACH_MISS', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['SE_FAB', 1, 'FABRIQUE']]),
        SE_FAB: makeNomenclature('SE_FAB', [['ACH_MISS', 1, 'ACHETE']]),
      },
      stocks: {
        SE_FAB: { stockPhysique: 0, stockAlloue: 0 },
        ACH_MISS: { stockPhysique: 0, stockAlloue: 0 },
      },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 1, new Date('2026-04-01'))

    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['SE_FAB'], 1)
    assert.equal(result.missingComponents['ACH_MISS'], 1)
    assert.isTrue(result.alerts.some((a) => a.includes('SE_FAB')))
  })

  test('subcontracted fabricated component treated like purchase', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        ST_COMP: makeArticle('ST_COMP', 'ST01'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['ST_COMP', 1, 'FABRIQUE']]),
      },
      stocks: { ST_COMP: { stockPhysique: 0, stockAlloue: 0 } },
      ofs: [],
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 1, new Date('2026-04-01'))
    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['ST_COMP'], 1)
  })

  test('subcontracted fabricated component uses stock when available', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        ST_COMP: makeArticle('ST_COMP', 'ST99'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['ST_COMP', 2, 'FABRIQUE']]),
      },
      stocks: { ST_COMP: { stockPhysique: 10, stockAlloue: 0 } },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 3, new Date('2026-04-01'))
    assert.isTrue(result.feasible)
    assert.deepEqual(result.missingComponents, {})
  })
})

test.group('RecursiveChecker phantom articles', () => {
  test('phantom resolved to single real variant', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        PHANTOM: makeArticle('PHANTOM', 'AFANT', 'ACHAT'),
        REAL_A: makeArticle('REAL_A', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['PHANTOM', 1, 'FABRIQUE']]),
        PHANTOM: makeNomenclature('PHANTOM', [['REAL_A', 1, 'ACHETE']]),
      },
      stocks: { REAL_A: { stockPhysique: 10, stockAlloue: 0 } },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 2, new Date('2026-04-01'))

    assert.isTrue(result.feasible)
    assert.deepEqual(result.missingComponents, {})
    assert.isTrue(result.alerts.some((a) => a.includes('PHANTOM') && a.includes('REAL_A')))
  })

  test('phantom can use legacy reference alone', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        PHANTOM: makeArticle('PHANTOM', 'AFANT', 'ACHAT'),
        NEW_REF: makeArticle('NEW_REF', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['PHANTOM', 1, 'FABRIQUE']]),
        PHANTOM: makeNomenclature('PHANTOM', [['NEW_REF', 1, 'ACHETE']]),
      },
      stocks: {
        PHANTOM: { stockPhysique: 10, stockAlloue: 0 },
        NEW_REF: { stockPhysique: 0, stockAlloue: 0 },
      },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 5, new Date('2026-04-01'))

    assert.isTrue(result.feasible)
    assert.deepEqual(result.missingComponents, {})
    assert.isTrue(result.alerts.some((a) => a.includes('PHANTOM')))
  })

  test('phantom does not mix partial variants', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        PHANTOM: makeArticle('PHANTOM', 'AFANT', 'ACHAT'),
        OLD_REF: makeArticle('OLD_REF', 'AP', 'ACHAT'),
        NEW_REF: makeArticle('NEW_REF', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['PHANTOM', 1, 'FABRIQUE']]),
        PHANTOM: makeNomenclature('PHANTOM', [['OLD_REF', 1, 'ACHETE'], ['NEW_REF', 1, 'ACHETE']]),
      },
      stocks: {
        OLD_REF: { stockPhysique: 3, stockAlloue: 0 },
        NEW_REF: { stockPhysique: 3, stockAlloue: 0 },
      },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 5, new Date('2026-04-01'))

    assert.isFalse(result.feasible)
    assert.equal(result.missingComponents['PHANTOM'], 5)
    assert.isTrue(result.alerts.some((a) => a.includes('aucune variante complete disponible')))
  })

  test('phantom sibling real variant ignored when phantom present', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF_PARENT: makeArticle('PF_PARENT', 'PF'),
        PHANTOM: makeArticle('PHANTOM', 'AFANT', 'ACHAT'),
        REAL_A: makeArticle('REAL_A', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF_PARENT: makeNomenclature('PF_PARENT', [['PHANTOM', 1, 'FABRIQUE'], ['REAL_A', 1, 'ACHETE']]),
        PHANTOM: makeNomenclature('PHANTOM', [['REAL_A', 1, 'ACHETE']]),
      },
      stocks: {
        PHANTOM: { stockPhysique: 10, stockAlloue: 0 },
        REAL_A: { stockPhysique: 0, stockAlloue: 0 },
      },
    }))

    const result = checker.checkArticleRecursive('PF_PARENT', 5, new Date('2026-04-01'))

    assert.isTrue(result.feasible)
    assert.deepEqual(result.missingComponents, {})
  })
})

test.group('RecursiveChecker ERP allocation awareness', () => {
  test('skips already allocated component for parent OF', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF: makeArticle('PF', 'PF'),
        COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
        COMP_B: makeArticle('COMP_B', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF: makeNomenclature('PF', [['COMP_A', 1, 'ACHETE'], ['COMP_B', 2, 'ACHETE']]),
      },
      stocks: {
        COMP_A: { stockPhysique: 0, stockAlloue: 0 },
        COMP_B: { stockPhysique: 1, stockAlloue: 1 },
      },
      allocations: {
        OF_A: [{ article: 'COMP_B', qteAllouee: 10 }],
      },
    }))

    const result = checker.checkArticleRecursive('PF', 5, new Date('2026-04-20'), 0, true, 'OF_A')

    assert.notProperty(result.missingComponents, 'COMP_B')
    assert.property(result.missingComponents, 'COMP_A')
  })

  test('partial allocation still checks unallocated components', ({ assert }) => {
    const checker = new RecursiveChecker(makeLoader({
      articles: {
        PF: makeArticle('PF', 'PF'),
        COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
        COMP_B: makeArticle('COMP_B', 'AP', 'ACHAT'),
      },
      nomenclatures: {
        PF: makeNomenclature('PF', [['COMP_A', 1, 'ACHETE'], ['COMP_B', 3, 'ACHETE']]),
      },
      stocks: {
        COMP_A: { stockPhysique: 10, stockAlloue: 10 },
        COMP_B: { stockPhysique: 5, stockAlloue: 0 },
      },
      allocations: {
        OF_X: [{ article: 'COMP_A', qteAllouee: 10 }],
      },
    }))

    const result = checker.checkArticleRecursive('PF', 10, new Date('2026-04-20'), 0, true, 'OF_X')

    assert.notProperty(result.missingComponents, 'COMP_A')
    assert.property(result.missingComponents, 'COMP_B')
    assert.equal(result.missingComponents['COMP_B'], 25)
  })
})
