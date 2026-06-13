import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import { OFConso, CommandeOFMatcher } from '#app/domain/of-conso'

function makeOfFlow(id: string, article: string, status: number, quantity: number, date?: Date): Flow {
  return {
    article, quantity, direction: 'supply', date: date ?? null,
    origin: { type: 'of', id, status, designation: '', typeOfLabel: '', statutLabel: '' } as any,
  }
}

function makeDemandFlow(id: string, article: string, quantity: number, date: Date, orderType?: string): Flow {
  return {
    article, quantity, direction: 'demand', date,
    origin: { type: 'order', id, orderType: orderType ?? 'NOR', client: 'Test' } as any,
  }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code, description: '', category: 'PROD', supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

test.group('OFConso', () => {
  test('init with full quantity available', ({ assert }) => {
    const flow = makeOfFlow('OF1', 'ART1', 1, 100)
    const conso = new OFConso(flow)
    assert.equal(conso.qteDisponible, 100)
    assert.equal(conso.qteAllouee, 0)
    assert.equal(conso.numOf, 'OF1')
  })

  test('estDisponible returns true when enough', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    assert.isTrue(conso.estDisponible(50))
    assert.isTrue(conso.estDisponible(100))
  })

  test('estDisponible returns false when not enough', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    assert.isFalse(conso.estDisponible(101))
  })

  test('allouer decrements available', ({ assert }) => {
    const conso = new OFConso(makeOfFlow('OF1', 'ART1', 1, 100))
    conso.allouer(30, 'CMD1')
    assert.equal(conso.qteAllouee, 30)
    assert.equal(conso.qteDisponible, 70)
    assert.include(conso.commandesServees, 'CMD1')
  })
})

test.group('CommandeOFMatcher', () => {
  test('MTS hard pegging links OF via origin', ({ assert }) => {
    const ofFlow = makeOfFlow('OF-MTS', 'ART1', 1, 50)
    const demand = makeDemandFlow('CMD1', 'ART1', 40, new Date('2026-04-10'), 'MTS')

    const matcher = new CommandeOFMatcher([ofFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.isNotNull(result.of)
    assert.equal(result.ofAllocations.length, 1)
    assert.equal(result.ofAllocations[0].qteAllouee, 40)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('MTS partial cover reports remaining', ({ assert }) => {
    const ofFlow = makeOfFlow('OF-MTS', 'ART1', 1, 30)
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-10'), 'MTS')

    const matcher = new CommandeOFMatcher([ofFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.ofAllocations[0].qteAllouee, 30)
    assert.equal(result.remainingUncoveredQty, 20)
    assert.isAbove(result.alerts.length, 0)
  })

  test('NOR stock complete when stock covers fully', ({ assert }) => {
    const stockFlow: Flow = {
      article: 'ART1', quantity: 100, direction: 'supply', date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-10'))

    const matcher = new CommandeOFMatcher([stockFlow], new Map(), new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'stock_complete')
    assert.equal(result.stockAllocation!.qteAllouee, 50)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('NOR cumulative OF coverage with priority', ({ assert }) => {
    const ofFerme = makeOfFlow('OF-FERME', 'ART1', 1, 50, new Date('2026-04-10'))
    const ofSuggere = makeOfFlow('OF-SUGG', 'ART1', 3, 30, new Date('2026-04-12'))
    const demand = makeDemandFlow('CMD1', 'ART1', 70, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFerme, ofSuggere], articles, new Map(), 30)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'nor_mto_cumulative')
    assert.equal(result.ofAllocations.length, 2)
    assert.equal(result.ofAllocations[0].qteAllouee, 50)
    assert.equal(result.ofAllocations[1].qteAllouee, 20)
    assert.equal(result.remainingUncoveredQty, 0)
  })

  test('matchCommandes shares OFConso across orders', ({ assert }) => {
    const ofFlow = makeOfFlow('OF1', 'ART1', 1, 100, new Date('2026-04-10'))
    const cmd1 = makeDemandFlow('CMD1', 'ART1', 60, new Date('2026-04-10'))
    const cmd2 = makeDemandFlow('CMD2', 'ART1', 60, new Date('2026-04-11'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFlow], articles, new Map(), 30)
    const results = matcher.matchCommandes([cmd1, cmd2])

    assert.equal(results.length, 2)
    assert.equal(results[0].ofAllocations[0].qteAllouee, 60)
    assert.equal(results[1].ofAllocations[0].qteAllouee, 40)
    assert.equal(results[1].remainingUncoveredQty, 20)
  })

  test('purchase article returns purchase_supply method', ({ assert }) => {
    const stockFlow: Flow = {
      article: 'COMP1', quantity: 20, direction: 'supply', date: null,
      origin: { type: 'stock', pmp: null },
    }
    const demand = makeDemandFlow('CMD1', 'COMP1', 50, new Date('2026-04-10'))

    const articles = new Map([['COMP1', makeArticle('COMP1', 'ACHAT')]])
    const matcher = new CommandeOFMatcher([stockFlow], articles, new Map())
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'purchase_supply')
    assert.equal(result.remainingUncoveredQty, 30)
  })

  test('dateToleranceDays filters distant OFs', ({ assert }) => {
    const ofFlow = makeOfFlow('OF1', 'ART1', 1, 100, new Date('2026-06-01'))
    const demand = makeDemandFlow('CMD1', 'ART1', 50, new Date('2026-04-01'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFlow], articles, new Map(), 10)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'none')
    assert.equal(result.remainingUncoveredQty, 50)
  })
})
