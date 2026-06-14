import { test } from '@japa/runner'
import type { Flow, FlowOrigin } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import { CommandeOFMatcher } from '#app/domain/of-conso'

function makeOfFlow(
  id: string,
  article: string,
  status: 1 | 2 | 3,
  quantity: number,
  date?: Date
): Flow {
  return {
    article,
    quantity,
    direction: 'supply',
    date: date ?? null,
    origin: {
      type: 'of',
      id,
      status,
      statutLabel: null,
      typeOf: null,
      typeOfLabel: null,
      designation: null,
    },
  }
}

function makeOrderDemand(
  id: string,
  article: string,
  quantity: number,
  date: Date,
  orderType: 'MTS' | 'MTO' | 'NOR' = 'NOR'
): Flow {
  return {
    article,
    quantity,
    direction: 'demand',
    date,
    origin: {
      type: 'order',
      id,
      customer: 'ACME',
      pays: null,
      orderType,
      nature: 'COMMANDE',
      contremarque: null,
      qteCommandee: quantity,
      qteAllouee: 0,
    },
  }
}

function makeForecastDemand(
  id: string,
  article: string,
  quantity: number,
  date: Date
): Flow {
  return {
    article,
    quantity,
    direction: 'demand',
    date,
    origin: {
      type: 'forecast',
      id,
      customer: null,
      pays: null,
      orderType: null,
      contremarque: null,
      qteCommandee: quantity,
      qteAllouee: 0,
    },
  }
}

function makeArticle(code: string): Article {
  return {
    code,
    description: '',
    category: 'PROD',
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

test.group('CommandeOFMatcher - edge cases vs Python', () => {
  test('forecasts do not consume firm or planned OFs', ({ assert }) => {
    // Python _iter_of_candidates: if not is_firm_order and of.statut_num in (1, 2): continue
    // So a forecast should NOT consume a status-1 (firm) or status-2 (planned) OF.
    const ofFirm = makeOfFlow('OF-FERME', 'ART1', 1, 100, new Date('2026-04-10'))
    const ofPlanned = makeOfFlow('OF-PLAN', 'ART1', 2, 100, new Date('2026-04-10'))
    const ofSuggested = makeOfFlow('OF-SUGG', 'ART1', 3, 100, new Date('2026-04-10'))
    const forecast = makeForecastDemand('PREV1', 'ART1', 80, new Date('2026-04-10'))

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([ofFirm, ofPlanned, ofSuggested], articles, new Map(), 30)
    const result = matcher.matchCommande(forecast)

    assert.equal(result.matchingMethod, 'nor_mto_cumulative')
    assert.equal(result.ofAllocations.length, 1)
    assert.equal(result.ofAllocations[0].qteAllouee, 80)
    assert.equal((result.ofAllocations[0].ofFlow.origin as Extract<FlowOrigin, { type: 'of' }>).id, 'OF-SUGG')
  })

  test('MTS with multiple linked OFs emits ambiguity alert', ({ assert }) => {
    const of1 = makeOfFlow('OF-001', 'ART1', 1, 50, new Date('2026-04-10'))
    const of2 = makeOfFlow('OF-002', 'ART1', 1, 50, new Date('2026-04-11'))
    const demand = makeOrderDemand('CMD1', 'ART1', 40, new Date('2026-04-10'), 'MTS')

    const articles = new Map([['ART1', makeArticle('ART1')]])
    const matcher = new CommandeOFMatcher([of1, of2], articles, new Map(), 30)
    const result = matcher.matchCommande(demand)

    assert.equal(result.matchingMethod, 'mts_hard_pegging')
    assert.equal(result.ofAllocations[0].qteAllouee, 40)
    assert.isTrue(result.alerts.some((a) => a.includes('2 OF')))
  })
})
