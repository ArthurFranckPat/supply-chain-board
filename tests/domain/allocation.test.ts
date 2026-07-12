import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import { StockState } from '#app/domain/stock-state'
import {
  reserveCandidateComponents,
  computeDirectComponentShortages,
  availabilityStatus,
  type CandidateOF,
  type AllocationLoader,
  type ErpAllocation,
} from '#app/domain/allocation'
import type { StockRecord } from '#app/domain/recursive-checker'
import { evaluateRuptures, type RuptureDataset } from '#app/domain/rupture-engine'

function makeArticle(code: string, category: string = 'AP', supplyType: 'ACHAT' | 'FABRICATION' = 'ACHAT'): Article {
  return {
    code, description: code, category, supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

function makeEntry(parent: string, component: string, type: 'ACHETE' | 'FABRIQUE', qte: number = 1): NomenclatureEntry {
  return {
    parentArticle: parent, parentDescription: parent, level: 10,
    componentArticle: component, componentDescription: component,
    linkQuantity: qte, componentType: type, consumptionNature: 'PROPORTIONNEL',
  }
}

function makeNomenclature(parent: string, components: NomenclatureEntry[]): Nomenclature {
  return { article: parent, description: parent, components }
}

function makeLoader(
  nomenclatures: Record<string, Nomenclature>,
  allocationsByOf: Record<string, ErpAllocation[]> = {},
): AllocationLoader {
  return {
    getNomenclature: (article: string) => nomenclatures[article],
    getAllocationsOf: (numDoc: string) => allocationsByOf[numDoc] ?? [],
  }
}

function makeDataset(
  articles: Record<string, Article>,
  nomenclatures: Record<string, Nomenclature>,
  stocks: Record<string, StockRecord>,
  allocations: Record<string, ErpAllocation[]> = {},
): RuptureDataset {
  const stockNet = new Map<string, number>()
  for (const [a, s] of Object.entries(stocks)) stockNet.set(a, s.stockPhysique - s.stockAlloue)
  const allocationsByOf = new Map<string, Map<string, number>>()
  for (const [numOf, allocs] of Object.entries(allocations)) {
    const m = new Map<string, number>()
    for (const al of allocs) m.set(al.article, (m.get(al.article) ?? 0) + al.qteAllouee)
    allocationsByOf.set(numOf, m)
  }
  return {
    articles: new Map(Object.entries(articles)),
    nomenclatures: new Map(Object.entries(nomenclatures)),
    stockNet,
    allocationsByOf,
  }
}

function makeCandidate(numOf: string, article: string, quantity: number): CandidateOF {
  return { numOf, article, quantity }
}

// ===========================================================================
// REGLE 1 : Checker — composant deja alloue => pas marque en rupture
// ===========================================================================

test.group('Moteur de rupture : crédit des allocations ERP (règle 3 #73)', () => {
  test('composant entièrement alloué → jamais en manque, les autres restent vérifiés', ({ assert }) => {
    const articles = {
      PF: makeArticle('PF', 'PF', 'FABRICATION'),
      COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
      COMP_B: makeArticle('COMP_B', 'AP', 'ACHAT'),
    }
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1), makeEntry('PF', 'COMP_B', 'ACHETE', 2)]),
    }
    const stocks = {
      COMP_A: { stockPhysique: 0, stockAlloue: 0 },
      COMP_B: { stockPhysique: 1, stockAlloue: 1 },
    }
    const dataset = makeDataset(articles, nomenclatures, stocks, {
      OF_A: [{ article: 'COMP_B', qteAllouee: 10 }],
    })
    const verdict = evaluateRuptures(
      [{ numOf: 'OF_A', article: 'PF', qteRestante: 5, statutNum: 1, dateBesoin: null }],
      dataset,
      'photo',
    ).get('OF_A')!

    assert.isTrue(verdict.feasible, 'OF ferme : affermi malgré le manque')
    assert.notProperty(verdict.missing, 'COMP_B')
    assert.equal(verdict.missing['COMP_A'], 5)
  })

  test('allocation partielle : déduction partielle, le reste vérifié', ({ assert }) => {
    const articles = {
      PF: makeArticle('PF', 'PF', 'FABRICATION'),
      COMP_A: makeArticle('COMP_A', 'AP', 'ACHAT'),
      COMP_B: makeArticle('COMP_B', 'AP', 'ACHAT'),
    }
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1), makeEntry('PF', 'COMP_B', 'ACHETE', 3)]),
    }
    const stocks = {
      COMP_A: { stockPhysique: 10, stockAlloue: 10 },
      COMP_B: { stockPhysique: 5, stockAlloue: 0 },
    }
    const dataset = makeDataset(articles, nomenclatures, stocks, {
      OF_X: [{ article: 'COMP_A', qteAllouee: 10 }],
    })
    const verdict = evaluateRuptures(
      [{ numOf: 'OF_X', article: 'PF', qteRestante: 10, statutNum: 1, dateBesoin: null }],
      dataset,
      'photo',
    ).get('OF_X')!

    assert.notProperty(verdict.missing, 'COMP_A')
    assert.equal(verdict.missing['COMP_B'], 25)
  })
})

// ===========================================================================
// REGLE 2 : Reservation virtuelle — pas de double allocation
// ===========================================================================

test.group('Virtual reservation skips ERP-allocated components', () => {
  test('does not virtual-reserve a component already allocated in ERP', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1), makeEntry('PF', 'COMP_B', 'ACHETE', 2)]),
    }
    const loader = makeLoader(nomenclatures, {
      OF_A: [{ article: 'COMP_A', qteAllouee: 50 }],
    })
    const materialState = new StockState(new Map([['COMP_A', 50], ['COMP_B', 100]]))

    reserveCandidateComponents(loader, makeCandidate('OF_A', 'PF', 50), materialState)

    assert.equal(materialState.getAvailable('COMP_A'), 50)
    assert.equal(materialState.getAvailable('COMP_B'), 100)
  })

  test('still reserves unallocated components when others are ERP-allocated', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1), makeEntry('PF', 'COMP_B', 'ACHETE', 2)]),
    }
    const loader = makeLoader(nomenclatures, {
      OF_A: [{ article: 'COMP_A', qteAllouee: 50 }],
    })
    const materialState = new StockState(new Map([['COMP_A', 50], ['COMP_B', 80]]))

    reserveCandidateComponents(loader, makeCandidate('OF_A', 'PF', 50), materialState)

    assert.equal(materialState.getAvailable('COMP_A'), 50)
    assert.equal(materialState.getAvailable('COMP_B'), -20)
  })

  test('two competing OFs do not over-allocate a scarce component', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_X', 'ACHETE', 1)]),
    }
    const loader = makeLoader(nomenclatures)
    const materialState = new StockState(new Map([['COMP_X', 50]]))

    reserveCandidateComponents(loader, makeCandidate('OF_A', 'PF', 60), materialState)
    assert.equal(materialState.getAvailable('COMP_X'), -10)

    reserveCandidateComponents(loader, makeCandidate('OF_B', 'PF', 40), materialState)
    assert.equal(materialState.getAvailable('COMP_X'), -50)
  })

  test('allocated OF does not inflate virtual pool', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_X', 'ACHETE', 1)]),
    }
    const loader = makeLoader(nomenclatures, {
      OF_A: [{ article: 'COMP_X', qteAllouee: 50 }],
    })

    const materialStateA = new StockState(new Map([['COMP_X', 50]]))
    reserveCandidateComponents(loader, makeCandidate('OF_A', 'PF', 50), materialStateA)
    assert.equal(materialStateA.getAvailable('COMP_X'), 50)

    const materialStateB = new StockState(new Map([['COMP_X', 30]]))
    reserveCandidateComponents(loader, makeCandidate('OF_B', 'PF', 50), materialStateB)
    assert.equal(materialStateB.getAvailable('COMP_X'), -20)
  })
})

// ===========================================================================
// REGLE 3 : computeDirectComponentShortages respecte les allocations
// ===========================================================================

test.group('Direct component shortages respect ERP allocations', () => {
  test('no shortage when component is fully allocated', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1)]),
    }
    const loader = makeLoader(nomenclatures, {
      OF_A: [{ article: 'COMP_A', qteAllouee: 10 }],
    })
    const materialState = new StockState(new Map([['COMP_A', 0]]))

    const result = computeDirectComponentShortages(loader, makeCandidate('OF_A', 'PF', 10), materialState)

    assert.equal(result, '')
  })

  test('shortage only for unallocated portion', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 2)]),
    }
    const loader = makeLoader(nomenclatures, {
      OF_A: [{ article: 'COMP_A', qteAllouee: 10 }],
    })
    const materialState = new StockState(new Map([['COMP_A', 90]]))

    const result = computeDirectComponentShortages(loader, makeCandidate('OF_A', 'PF', 20), materialState)

    assert.equal(result, '')
  })
})

// ===========================================================================
// REGLE 4 : OF FERME (statut 1) — jamais bloque pour rupture composants
// ===========================================================================

test.group('Firm OF is never blocked by component shortage', () => {
  test('firm OF is comfortable even with purchased component shortage', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1)]),
    }
    const loader = makeLoader(nomenclatures)
    const materialState = new StockState(new Map([['COMP_A', 0]]))

    const { status, reason } = availabilityStatus(
      makeCandidate('OF_FERME', 'PF', 50),
      1,
      loader,
      materialState,
    )

    assert.equal(status, 'comfortable')
    assert.equal(reason, '')
  })

  test('suggested OF is blocked by purchased component shortage', ({ assert }) => {
    const nomenclatures = {
      PF: makeNomenclature('PF', [makeEntry('PF', 'COMP_A', 'ACHETE', 1)]),
    }
    const loader = makeLoader(nomenclatures)
    const materialState = new StockState(new Map([['COMP_A', 0]]))

    const { status } = availabilityStatus(
      makeCandidate('OF_SUGG', 'PF', 50),
      3,
      loader,
      materialState,
    )

    assert.equal(status, 'blocked')
  })
})
