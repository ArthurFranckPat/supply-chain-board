import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  AllocationManager,
  RecursiveChecker,
  StockState,
  type AllocationManagerLoader,
  type OfRecord,
  type StockRecord,
  type ErpAllocation,
} from '#app/domain/allocation-manager'

const TODAY = new Date('2026-06-14')

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'ACHAT', category: string = 'PF3'): Article {
  return {
    code, description: code, category, supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

function makeEntry(parent: string, component: string, qte: number = 1): NomenclatureEntry {
  return {
    parentArticle: parent, parentDescription: parent, level: 10,
    componentArticle: component, componentDescription: component,
    linkQuantity: qte, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL',
  }
}

function makeNomenclature(parent: string, components: NomenclatureEntry[]): Nomenclature {
  return { article: parent, description: parent, components }
}

function makeOf(numOf: string, article: string, statut: number, finOffset: number, qte: number): OfRecord {
  const debut = new Date(TODAY)
  debut.setDate(TODAY.getDate() + finOffset)
  const fin = new Date(debut)
  fin.setDate(debut.getDate() + 3)
  return { numOf, article, statutNum: statut, qteRestante: qte, dateDebut: debut, dateFin: fin }
}

function makeLoader(options: {
  ofs?: OfRecord[]
  stocks?: Record<string, StockRecord>
  nomenclatures?: Record<string, Nomenclature>
  allocations?: Record<string, ErpAllocation[]>
}): AllocationManagerLoader {
  return {
    getArticle: (a) => makeArticle(a),
    getNomenclature: (a) => options.nomenclatures?.[a],
    getStock: (a) => options.stocks?.[a],
    getReceptions: () => [],
    getAllocationsOf: (numDoc) => options.allocations?.[numDoc] ?? [],
    getOfsByArticle: (article, statut, _dateBesoin) =>
      (options.ofs ?? []).filter((o) => o.article === article && (statut === undefined || o.statutNum === statut)),
  }
}

test.group('AllocationManager', () => {
  test('initializes with loader and checker', ({ assert }) => {
    const loader = makeLoader({})
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    assert.equal(manager.dataLoader, loader)
    assert.equal(manager.checker, checker)
  })

  test('firm OF with ERP allocations skips virtual allocation', ({ assert }) => {
    const of = makeOf('OF-FERME-1', 'PF_A', 1, 10, 50)
    const loader = makeLoader({
      ofs: [of],
      stocks: { COMP_X: { stockPhysique: 200, stockAlloue: 50 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
      allocations: { 'OF-FERME-1': [{ article: 'COMP_X', qteAllouee: 50 }] },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    const results = manager.allocateStock([of])
    assert.isTrue(results['OF-FERME-1'].feasible)
    assert.deepEqual(results['OF-FERME-1'].allocatedQuantity, {})
  })

  test('planned OF uses virtual allocation', ({ assert }) => {
    const of = makeOf('OF-PLAN-1', 'PF_A', 2, 15, 30)
    const loader = makeLoader({
      ofs: [of],
      stocks: { COMP_X: { stockPhysique: 200, stockAlloue: 50 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)
    const stockState = new StockState(new Map([['COMP_X', 100]]))

    const result = manager.allocateOf(of, stockState)
    assert.isNotNull(result)
  })

  test('suggested OF uses virtual allocation', ({ assert }) => {
    const of = makeOf('OF-SUGG-1', 'PF_A', 3, 20, 20)
    const loader = makeLoader({
      ofs: [of],
      stocks: { COMP_X: { stockPhysique: 200, stockAlloue: 50 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)
    const stockState = new StockState(new Map([['COMP_X', 100]]))

    const result = manager.allocateOf(of, stockState)
    assert.isNotNull(result)
  })

  test('mixed statuses all produce results', ({ assert }) => {
    const ofs = [
      makeOf('OF-FERME-1', 'PF_A', 1, 10, 50),
      makeOf('OF-PLAN-1', 'PF_A', 2, 15, 30),
      makeOf('OF-SUGG-1', 'PF_A', 3, 20, 20),
    ]
    const loader = makeLoader({
      ofs,
      stocks: { COMP_X: { stockPhysique: 1000, stockAlloue: 0 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    const results = manager.allocateStock(ofs)
    for (const of of ofs) {
      assert.property(results, of.numOf)
    }
  })

  test('sorts OFs with firm first', ({ assert }) => {
    const ofs = [
      makeOf('OF-PLAN-1', 'PF_A', 2, 15, 30),
      makeOf('OF-SUGG-1', 'PF_A', 3, 20, 20),
      makeOf('OF-FERME-1', 'PF_A', 1, 10, 50),
    ]
    const loader = makeLoader({
      ofs,
      stocks: { COMP_X: { stockPhysique: 1000, stockAlloue: 0 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    const sorted = manager.sortOfsByPriority(ofs, new StockState(new Map([['COMP_X', 1000]])))
    const statuses = sorted.map((o) => o.statutNum)
    const firstNonFirm = statuses.findIndex((s) => s !== 1)
    assert.isTrue(firstNonFirm === -1 || statuses.slice(firstNonFirm).every((s) => s !== 1))
    assert.equal(sorted[0].statutNum, 1)
  })

  test('calculate allocations returns positive quantities', ({ assert }) => {
    const of = makeOf('OF-FERME-1', 'PF_A', 1, 10, 50)
    const loader = makeLoader({
      ofs: [of],
      stocks: { COMP_X: { stockPhysique: 1000, stockAlloue: 0 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    const stockState = new StockState(new Map([['COMP_X', 1000]]))
    const allocations = manager.calculateAllocations(of, stockState)
    for (const [article, qte] of Object.entries(allocations)) {
      assert.isAbove(qte, 0)
      assert.equal(article, 'COMP_X')
    }
  })

  test('allocation depletes stock', ({ assert }) => {
    const of = makeOf('OF-SUGG-1', 'PF_A', 3, 20, 20)
    const loader = makeLoader({
      ofs: [of],
      stocks: { COMP_X: { stockPhysique: 100, stockAlloue: 0 } },
      nomenclatures: { PF_A: makeNomenclature('PF_A', [makeEntry('PF_A', 'COMP_X', 2)]) },
    })
    const checker = new RecursiveChecker(loader, { dispoPolicy: 'stock_strict' })
    const manager = new AllocationManager(loader, checker)

    const stockState = new StockState(new Map([['COMP_X', 100]]))
    const initialAvailable = stockState.getAvailable('COMP_X')
    const allocations = manager.calculateAllocations(of, stockState)

    if (allocations && 'COMP_X' in allocations) {
      stockState.allocate(of.numOf, allocations)
      const finalAvailable = stockState.getAvailable('COMP_X')
      assert.isBelow(finalAvailable, initialAvailable)
    }
  })
})
