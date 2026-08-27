import { test } from '@japa/runner'
import type { Flow, FlowOrigin } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import { CommandeOFMatcher } from '#app/domain/of_conso'

function of(id: string, article: string, status: 1 | 2 | 3, quantity: number, date: Date): Flow {
  const origin: Extract<FlowOrigin, { type: 'of' }> = {
    type: 'of',
    id,
    status,
    designation: '',
    typeOfLabel: '',
    statutLabel: '',
    typeOf: null,
  }
  return { article, quantity, direction: 'supply', date, origin }
}

function prevision(id: string, article: string, quantity: number, date: Date): Flow {
  const origin: Extract<FlowOrigin, { type: 'forecast' }> = {
    type: 'forecast',
    id,
    orderType: null,
    customer: '',
    pays: null,
    contremarque: null,
    qteCommandee: quantity,
    qteAllouee: 0,
  }
  return { article, quantity, direction: 'demand', date, origin }
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

/**
 * Une prévision (WIPTYP 1 / WIPSTA 3) ne consomme QUE des OF suggérés
 * (`iterOfCandidates` : pas de ferme/planifié). Le cas réel ci-dessous prouve que le
 * matcher, lui, les alloue — l'absence de rattachement constatée sur /programme venait
 * du front, qui jetait les lignes sans `ligne` (cf. orders-store).
 */
test.group('prévision ↔ OF suggéré', () => {
  test('cas réel 26080000144753 ↔ SGAE10661773186 (11033426)', ({ assert }) => {
    const art = '11033426'
    const supply = [of('SGAE10661773186', art, 3, 128, new Date('2026-09-16'))]
    const matcher = new CommandeOFMatcher(supply, new Map([[art, makeArticle(art)]]), new Map())
    const res = matcher.matchCommandes([
      prevision('26080000144753', art, 128, new Date('2026-09-11')),
    ])
    assert.isNotNull(res[0].of)
    assert.equal((res[0].of!.origin as { id: string }).id, 'SGAE10661773186')
    assert.equal(res[0].matchingMethod, 'nor_mto_cumulative')
    assert.equal(res[0].remainingUncoveredQty, 0)
  })
})
