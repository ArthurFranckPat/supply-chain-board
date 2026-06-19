import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import { StockState, evaluateSequentialFeasibility, type OfInput } from '#app/domain/stock-state'

test.group('StockState', () => {
  test('getAvailable returns initial stock when nothing allocated', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    assert.equal(state.getAvailable('ART1'), 100)
  })

  test('getAvailable returns 0 for unknown article', ({ assert }) => {
    const state = new StockState(new Map())
    assert.equal(state.getAvailable('UNKNOWN'), 0)
  })

  test('allocate decrements available stock', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 30 })
    assert.equal(state.getAvailable('ART1'), 70)
  })

  test('allocate multiple times accumulates', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 30 })
    state.allocate('OF2', { ART1: 20 })
    assert.equal(state.getAvailable('ART1'), 50)
  })

  test('allocate different articles independently', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100], ['ART2', 50]]))
    state.allocate('OF1', { ART1: 30, ART2: 10 })
    assert.equal(state.getAvailable('ART1'), 70)
    assert.equal(state.getAvailable('ART2'), 40)
  })

  test('addSupply increases initial stock', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.addSupply('ART1', 50)
    assert.equal(state.getAvailable('ART1'), 150)
  })

  test('addSupply creates entry for unknown article', ({ assert }) => {
    const state = new StockState(new Map())
    state.addSupply('NEW_ART', 75)
    assert.equal(state.getAvailable('NEW_ART'), 75)
  })

  test('constructor accepts Record', ({ assert }) => {
    const state = new StockState({ ART1: 100, ART2: 50 })
    assert.equal(state.getAvailable('ART1'), 100)
    assert.equal(state.getAvailable('ART2'), 50)
  })

  test('getInitialStock and getAllocated track correctly', ({ assert }) => {
    const state = new StockState(new Map([['ART1', 100]]))
    state.allocate('OF1', { ART1: 40 })
    assert.equal(state.getInitialStock('ART1'), 100)
    assert.equal(state.getAllocated('ART1'), 40)
  })
})

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return { quantity: 10, direction: 'supply', date: null, origin: { type: 'stock', pmp: null }, ...overrides }
}

function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
  return {
    code, description: '', category: 'PF3', supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

test.group('evaluateSequentialFeasibility', () => {
  test('feasible OF with enough component stock', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 200 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'sequential' })

    const entry = result.get('OF-A')!
    assert.isTrue(entry.feasible)
    assert.equal(entry.status, 'ok')
    assert.equal(entry.allocated['C1'], 60)
  })

  test('blocked OF when component stock insufficient', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 10 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'))

    const entry = result.get('OF-A')!
    assert.isFalse(entry.feasible)
    assert.equal(entry.status, 'blocked')
  })

  test('sequential allocation: first OF consumes component, second is blocked', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 80 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
      { numOf: 'OF-B', article: 'PF1', qteRestante: 40, dateDebut: null, dateFin: '2026-06-22', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'sequential' })

    assert.isTrue(result.get('OF-A')!.feasible)
    assert.isFalse(result.get('OF-B')!.feasible)
  })

  test('firm OFs are sorted first', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 200 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-SUGG', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-18', statutNum: 3 },
      { numOf: 'OF-FIRM', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 1 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'))

    // Both should be feasible since 200 >= 60 + 60
    assert.isTrue(result.get('OF-FIRM')!.feasible)
    assert.isTrue(result.get('OF-SUGG')!.feasible)
  })

  test('immediate mode: each OF sees full stock (no competition)', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 100 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
      { numOf: 'OF-B', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-22', statutNum: 3 },
    ]

    // Mode immédiat : chaque OF doit être faisable (60+60=120 > 100 de stock, mais
    // chaque OF pris individuellement ne voit que lui-même : 60 <= 100)
    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'immediate' })
    assert.isTrue(result.get('OF-A')!.feasible)
    assert.isTrue(result.get('OF-B')!.feasible)
    assert.deepEqual(result.get('OF-A')!.missingComponents, {})
    assert.deepEqual(result.get('OF-B')!.missingComponents, {})
  })

  test('immediate mode reports shortage when stock insufficient per OF', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'C1', quantity: 50 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
    ]

    // Mode immédiat : vérification individuelle, 50 < 60 → pas faisable
    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'immediate' })
    assert.isFalse(result.get('OF-A')!.feasible)
    assert.isAbove(result.get('OF-A')!.missingComponents['C1'] ?? 0, 0)
  })

  // Régression issue #11 : le badge "dispo instantanée" ne doit PAS compter les
  // réceptions à venir (sinon il contredit le détail OF qui les ignore).
  test('immediate mode ignores future receptions (issue #11)', ({ assert }) => {
    const flows: Flow[] = [
      // 20 en stock présent + 100 en réception future → 120 si réceptions comptées
      makeFlow({ article: 'C1', quantity: 20, origin: { type: 'stock', subType: 'strict', pmp: null } }),
      makeFlow({ article: 'C1', quantity: 100, date: new Date('2026-06-25'), origin: { type: 'reception', id: 'R1', supplier: 'S1', designation: null, categorie: null, dateCommande: null, qteCommandee: 100 } }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['PF1', {
        article: 'PF1', description: '', components: [
          { parentArticle: 'PF1', parentDescription: '', level: 5, componentArticle: 'C1', componentDescription: '', linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL' },
        ],
      }],
    ])
    const articles = new Map([['PF1', makeArticle('PF1')], ['C1', makeArticle('C1', 'ACHAT')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
    ]

    // Horizon englobe la réception (2026-07-01 > 2026-06-25), mais le mode immédiat
    // ne doit voir que les 20 en stock → 20 < 60 → bloqué (rupture honnête).
    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'immediate' })
    assert.isFalse(result.get('OF-A')!.feasible)
    assert.equal(result.get('OF-A')!.missingComponents['C1'], 40)
  })
})

test.group('evaluateSequentialFeasibility — vue proactive (sous-ensemble fabriqué partagé)', () => {
  // PF1 = produit fini ; SF1 = sous-ensemble FABRIQUÉ partagé par 2 OFs.
  function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
    return { quantity: 10, direction: 'supply', date: null, origin: { type: 'stock', pmp: null }, ...overrides }
  }
  function makeArticle(code: string, supplyType: 'ACHAT' | 'FABRICATION' = 'FABRICATION'): Article {
    return {
      code, description: '', category: 'PF3', supplyType,
      reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
      unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
    }
  }
  const bom = (parent: string, comp: string, type: 'ACHETE' | 'FABRIQUE'): Nomenclature => ({
    article: parent, description: '', components: [
      { parentArticle: parent, parentDescription: '', level: 5, componentArticle: comp, componentDescription: '', linkQuantity: 1, componentType: type, consumptionNature: 'PROPORTIONNEL' },
    ],
  })

  test('mode immédiat : 2 OFs sur sous-ensemble partagé -> tous 2 « couverts » (faisabilité logique)', ({ assert }) => {
    // Stock SF1 = 80. OF-A (60) + OF-B (40) = 100 > 80, mais en immédiat chaque OF est
    // indépendant ET le fabriqué est couvert dès qu'il y a du stock → les 2 passent.
    const flows: Flow[] = [makeFlow({ article: 'SF1', quantity: 80 })]
    const nomenclatures = new Map([['PF1', bom('PF1', 'SF1', 'FABRIQUE')]])
    const articles = new Map([['PF1', makeArticle('PF1')], ['SF1', makeArticle('SF1')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
      { numOf: 'OF-B', article: 'PF1', qteRestante: 40, dateDebut: null, dateFin: '2026-06-22', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'immediate' })

    assert.isTrue(result.get('OF-A')!.feasible)
    assert.isTrue(result.get('OF-B')!.feasible) // <-- comportement historique (couvert par stock existant)
  })

  test('mode séquentiel : OF-A consomme le sous-ensemble, OF-B bloqué (faisabilité réelle)', ({ assert }) => {
    // Mêmes données. Séquentiel + composants fabriqués traités comme stock : OF-A prend
    // 60 SF1, il en reste 20, OF-B en réclame 40 -> bloqué. « Un composant manquant est un
    // composant manquant ».
    const flows: Flow[] = [makeFlow({ article: 'SF1', quantity: 80 })]
    const nomenclatures = new Map([['PF1', bom('PF1', 'SF1', 'FABRIQUE')]])
    const articles = new Map([['PF1', makeArticle('PF1')], ['SF1', makeArticle('SF1')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
      { numOf: 'OF-B', article: 'PF1', qteRestante: 40, dateDebut: null, dateFin: '2026-06-22', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'sequential' })

    assert.isTrue(result.get('OF-A')!.feasible)
    assert.isFalse(result.get('OF-B')!.feasible)
    assert.isAbove(result.get('OF-B')!.missingComponents['SF1'] ?? 0, 0) // manque 20 SF1
  })

  test('mode séquentiel : sous-ensemble suffisant -> les 2 OFs faisables', ({ assert }) => {
    // Stock SF1 = 120 >= 60 + 40 : pas de contention, les 2 passent.
    const flows: Flow[] = [makeFlow({ article: 'SF1', quantity: 120 })]
    const nomenclatures = new Map([['PF1', bom('PF1', 'SF1', 'FABRIQUE')]])
    const articles = new Map([['PF1', makeArticle('PF1')], ['SF1', makeArticle('SF1')]])
    const ofs: OfInput[] = [
      { numOf: 'OF-A', article: 'PF1', qteRestante: 60, dateDebut: null, dateFin: '2026-06-20', statutNum: 3 },
      { numOf: 'OF-B', article: 'PF1', qteRestante: 40, dateDebut: null, dateFin: '2026-06-22', statutNum: 3 },
    ]

    const result = evaluateSequentialFeasibility(ofs, flows, nomenclatures, articles, new Date('2026-07-01'), { mode: 'sequential' })

    assert.isTrue(result.get('OF-A')!.feasible)
    assert.isTrue(result.get('OF-B')!.feasible)
  })
})
