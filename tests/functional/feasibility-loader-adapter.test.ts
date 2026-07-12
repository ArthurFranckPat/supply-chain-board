import { test } from '@japa/runner'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  stockRecordFromFlows,
  buildNomenclatureMap,
  buildStocksMap,
  buildReceptionsMap,
  buildOfRecords,
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
