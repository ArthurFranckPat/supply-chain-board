import { test } from '@japa/runner'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  stockRecordFromFlows,
  buildNomenclatureMap,
  buildStocksMap,
  buildReceptionsMap,
  buildOfRecords,
  FeasibilityLoaderAdapter,
  type FeasibilityLoaderInput,
} from '#services/feasibility-loader-adapter'

test.group('stockRecordFromFlows', () => {
  test('returns undefined for empty flows', ({ assert }) => {
    assert.isUndefined(stockRecordFromFlows([]))
  })

  test('sums strict and qc flows', ({ assert }) => {
    const flows = [
      { origin: { subType: 'strict' }, quantity: 100 },
      { origin: { subType: 'qc' }, quantity: 20 },
    ]
    const rec = stockRecordFromFlows(flows)
    assert.isDefined(rec)
    assert.equal(rec!.stockPhysique, 120)
    assert.equal(rec!.stockAlloue, 0)
  })

  test('excludes rejected flows', ({ assert }) => {
    const flows = [
      { origin: { subType: 'strict' }, quantity: 100 },
      { origin: { subType: 'rejected' }, quantity: 5 },
    ]
    const rec = stockRecordFromFlows(flows)
    assert.isDefined(rec)
    assert.equal(rec!.stockPhysique, 100)
  })
})

test.group('buildNomenclatureMap', () => {
  test('groups entries by parent article', ({ assert }) => {
    const entries: NomenclatureEntry[] = [
      {
        parentArticle: 'PF1', parentDescription: 'Produit 1', level: 10,
        componentArticle: 'C1', componentDescription: 'Comp 1', linkQuantity: 2,
        componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL',
      },
      {
        parentArticle: 'PF1', parentDescription: 'Produit 1', level: 10,
        componentArticle: 'C2', componentDescription: 'Comp 2', linkQuantity: 1,
        componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL',
      },
    ]
    const map = buildNomenclatureMap(entries)
    const pf1 = map.get('PF1')
    assert.isDefined(pf1)
    assert.equal(pf1!.components.length, 2)
  })
})

test.group('buildStocksMap', () => {
  test('groups stock by article and sums strict+qc', ({ assert }) => {
    const flows = [
      { article: 'C1', origin: { subType: 'strict' }, quantity: 100 },
      { article: 'C1', origin: { subType: 'qc' }, quantity: 10 },
      { article: 'C2', origin: { subType: 'strict' }, quantity: 50 },
    ]
    const map = buildStocksMap(flows)
    assert.equal(map.get('C1')!.stockPhysique, 110)
    assert.equal(map.get('C2')!.stockPhysique, 50)
  })
})

test.group('buildReceptionsMap', () => {
  test('groups receptions by article', ({ assert }) => {
    const flows = [
      { article: 'C1', id: 'PO1', supplier: 'S1', quantity: 10, date: new Date('2026-04-15') },
      { article: 'C1', id: 'PO2', supplier: 'S1', quantity: 5, date: new Date('2026-04-20') },
    ]
    const map = buildReceptionsMap(flows)
    assert.lengthOf(map.get('C1')!, 2)
    assert.equal(map.get('C1')![0].id, 'PO1')
  })

  test('skips receptions without date', ({ assert }) => {
    const flows = [
      { article: 'C1', id: 'PO1', supplier: 'S1', quantity: 10, date: null },
    ]
    const map = buildReceptionsMap(flows)
    assert.isUndefined(map.get('C1'))
  })
})

test.group('buildOfRecords', () => {
  test('converts ManufacturingOrder-like objects', ({ assert }) => {
    const mos = [
      { numOf: 'OF001', article: 'PF1', status: 1, quantity: 100, startDate: new Date('2026-04-10'), endDate: new Date('2026-04-15') },
    ]
    const ofs = buildOfRecords(mos)
    assert.lengthOf(ofs, 1)
    assert.equal(ofs[0].numOf, 'OF001')
    assert.equal(ofs[0].statutNum, 1)
    assert.equal(ofs[0].qteRestante, 100)
  })
})

test.group('FeasibilityLoaderAdapter', () => {
  const baseInput: FeasibilityLoaderInput = {
    articles: new Map(),
    nomenclatures: new Map(),
    stocks: new Map(),
    receptions: new Map(),
    ofs: [],
  }

  test('getArticle returns undefined for unknown article', ({ assert }) => {
    const adapter = new FeasibilityLoaderAdapter(baseInput)
    assert.isUndefined(adapter.getArticle('UNKNOWN'))
  })

  test('getArticle returns known article', ({ assert }) => {
    const article = { code: 'C1', description: 'Comp 1', category: 'ACHAT', supplyType: 'ACHAT' as const, reorderDelay: 0, productFamily: null, pmp: null, economicLot: null, unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [] }
    const input = { ...baseInput, articles: new Map([['C1', article]]) }
    const adapter = new FeasibilityLoaderAdapter(input)
    assert.equal(adapter.getArticle('C1')?.code, 'C1')
  })

  test('getStock returns stock or undefined', ({ assert }) => {
    const stock = { stockPhysique: 100, stockAlloue: 10 }
    const input = { ...baseInput, stocks: new Map([['C1', stock]]) }
    const adapter = new FeasibilityLoaderAdapter(input)
    assert.equal(adapter.getStock('C1')?.stockPhysique, 100)
    assert.isUndefined(adapter.getStock('UNKNOWN'))
  })

  test('getReceptions returns empty array for unknown article', ({ assert }) => {
    const adapter = new FeasibilityLoaderAdapter(baseInput)
    assert.deepEqual(adapter.getReceptions('UNKNOWN'), [])
  })

  test('getOfsByArticle filters by article', ({ assert }) => {
    const ofs = [
      { numOf: 'OF1', article: 'PF1', statutNum: 1, qteRestante: 100, dateDebut: new Date('2026-04-10') },
      { numOf: 'OF2', article: 'PF2', statutNum: 2, qteRestante: 50, dateDebut: new Date('2026-04-12') },
    ]
    const input = { ...baseInput, ofs }
    const adapter = new FeasibilityLoaderAdapter(input)
    assert.lengthOf(adapter.getOfsByArticle('PF1'), 1)
    assert.lengthOf(adapter.getOfsByArticle('PF3'), 0)
  })

  test('getOfsByArticle filters by statut', ({ assert }) => {
    const ofs = [
      { numOf: 'OF1', article: 'PF1', statutNum: 1, qteRestante: 100, dateDebut: new Date('2026-04-10') },
      { numOf: 'OF2', article: 'PF1', statutNum: 3, qteRestante: 50, dateDebut: new Date('2026-04-12') },
    ]
    const input = { ...baseInput, ofs }
    const adapter = new FeasibilityLoaderAdapter(input)
    assert.lengthOf(adapter.getOfsByArticle('PF1', 3), 1)
  })
})
