import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Flow } from '#app/domain/models/flow'
import {
  isFirm,
  isPlannable,
  isPurchaseArticle,
  isSubcontracted,
  isComponentTreatedAsPurchase,
  shouldIncludeForScheduler,
  demandPriorityKey,
} from '#app/domain/rules'

function makeArticle(
  code: string,
  supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION',
  category: string = 'SF',
): Article {
  return {
    code,
    description: code,
    category,
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

function makeDemand(
  type: 'order' | 'forecast',
  date: Date | null = null,
): Flow {
  return {
    article: 'ART1',
    quantity: 10,
    direction: 'demand',
    date,
    origin: type === 'order'
      ? { type: 'order', id: 'CMD1', customer: 'ACME', pays: null, orderType: 'NOR', nature: 'COMMANDE', contremarque: null, qteCommandee: 10, qteAllouee: 0 }
      : { type: 'forecast', id: 'PREV1', customer: null, pays: null, orderType: null, contremarque: null, qteCommandee: 10, qteAllouee: 0 },
  }
}

test.group('OF status rules', () => {
  test('isFirm returns true only for status 1', ({ assert }) => {
    assert.isTrue(isFirm(1))
    assert.isFalse(isFirm(2))
    assert.isFalse(isFirm(3))
    assert.isFalse(isFirm(undefined))
  })

  test('isPlannable accepts firm, planned and suggested', ({ assert }) => {
    assert.isTrue(isPlannable(1))
    assert.isTrue(isPlannable(2))
    assert.isTrue(isPlannable(3))
    assert.isFalse(isPlannable(4))
    assert.isFalse(isPlannable(undefined))
  })
})

test.group('Article supply rules', () => {
  test('isPurchaseArticle identifies ACHAT articles', ({ assert }) => {
    const achat = makeArticle('A1', 'ACHAT', 'AP')
    const fab = makeArticle('F1', 'FABRICATION', 'SF')

    assert.isTrue(isPurchaseArticle(achat))
    assert.isFalse(isPurchaseArticle(fab))
    assert.isFalse(isPurchaseArticle(null))
  })

  test('isSubcontracted detects ST categories', ({ assert }) => {
    const fab = makeArticle('F1', 'FABRICATION', 'SF')
    const st = makeArticle('ST1', 'FABRICATION', 'STX')

    assert.isTrue(isSubcontracted(st))
    assert.isFalse(isSubcontracted(fab))
  })

  test('isComponentTreatedAsPurchase respects article type, component flags and subcontracting', ({ assert }) => {
    const achat = makeArticle('A1', 'ACHAT', 'AP')
    const fab = makeArticle('F1', 'FABRICATION', 'SF')
    const st = makeArticle('ST1', 'FABRICATION', 'STX')

    assert.isTrue(isComponentTreatedAsPurchase(achat, false, true))
    assert.isFalse(isComponentTreatedAsPurchase(fab, false, true))
    assert.isTrue(isComponentTreatedAsPurchase(st, false, true))
    assert.isTrue(isComponentTreatedAsPurchase(null, true, false))
  })
})

test.group('Scheduler scope rules', () => {
  test('shouldIncludeForScheduler includes orders and forecasts', ({ assert }) => {
    assert.isTrue(shouldIncludeForScheduler(makeDemand('order')))
    assert.isTrue(shouldIncludeForScheduler(makeDemand('forecast')))
    assert.isFalse(shouldIncludeForScheduler({ ...makeDemand('order'), direction: 'supply' }))
  })

  test('demandPriorityKey sorts orders before forecasts, then by date', ({ assert }) => {
    const orderEarly = makeDemand('order', new Date('2026-04-01'))
    const orderLate = makeDemand('order', new Date('2026-04-10'))
    const forecastEarly = makeDemand('forecast', new Date('2026-04-01'))

    assert.deepEqual(demandPriorityKey(orderEarly), [0, new Date('2026-04-01').getTime()])
    assert.isBelow(demandPriorityKey(orderEarly)[0], demandPriorityKey(forecastEarly)[0])
    assert.isBelow(demandPriorityKey(orderEarly)[1], demandPriorityKey(orderLate)[1])
  })
})
