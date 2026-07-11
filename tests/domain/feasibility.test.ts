import { test } from '@japa/runner'
import type { Flow } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import { checkFeasibility } from '#app/domain/feasibility'

function makeFlow(overrides: Partial<Flow> & { article: string }): Flow {
  return {
    quantity: 10, direction: 'supply', date: null, origin: { type: 'stock', pmp: null }, ...overrides,
  }
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    code: 'ART1', description: '', category: 'PROD', supplyType: 'FABRICATION',
    reorderDelay: 5, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
    ...overrides,
  }
}

function makeEntry(overrides: Partial<NomenclatureEntry> & { parentArticle: string; componentArticle: string }): NomenclatureEntry {
  return {
    parentDescription: '', level: 1, componentDescription: '', linkQuantity: 1,
    componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL',
    ...overrides,
  }
}

test.group('checkFeasibility', () => {
  test('returns feasible when no nomenclature (article sans composants)', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>()
    const articles = new Map<string, Article>([['ART1', makeArticle()]])
    const result = checkFeasibility('ART1', 50, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
    assert.equal(result.blockingComponents.length, 0)
  })

  test('returns feasible when all purchased components have stock', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100 }),
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 200 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'COMP1', linkQuantity: 2, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    const result = checkFeasibility('ART1', 50, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
  })

  test('returns blocked when purchased component has insufficient stock', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100 }),
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 30 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'COMP1', linkQuantity: 2, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    // Need 100 units of ART1 → 100 * 2 = 200 units of COMP1, but only 30 available
    const result = checkFeasibility('ART1', 100, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isFalse(result.feasible)
    assert.isTrue(result.blockingComponents.some((c) => c.article === 'COMP1'))
    assert.equal(result.blockingComponents.find((c) => c.article === 'COMP1')!.shortage, 170)
  })

  test('returns blocked when component has no stock at all', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'ART1', direction: 'supply', quantity: 100 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'COMP1', linkQuantity: 1, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    const result = checkFeasibility('ART1', 10, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isFalse(result.feasible)
    assert.equal(result.blockingComponents[0].article, 'COMP1')
  })

  test('accounts for receptions in component availability', ({ assert }) => {
    const recvDate = new Date('2026-01-10')
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 50, date: null }),
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 150, date: recvDate, origin: { type: 'reception', id: 'R1', supplier: 'S', designation: null, categorie: null, dateCommande: null, qteCommandee: 0 } }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'COMP1', linkQuantity: 2, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    // Need 100 units ART1 → 200 COMP1. Stock=50 + recv=150 = 200 → feasible
      const result = checkFeasibility('ART1', 100, flows, nomenclatures, articles, recvDate, 'stock_plus_receptions')
    assert.isTrue(result.feasible)
  })

  test('descends recursively into manufactured sub-assemblies', ({ assert }) => {
    // ART1 needs SUB1 (fabriqué) which needs COMP1 (acheté)
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 500 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'SUB1', linkQuantity: 2, componentType: 'FABRIQUE' }),
        ],
      }],
      ['SUB1', {
        article: 'SUB1', description: '', components: [
          makeEntry({ parentArticle: 'SUB1', componentArticle: 'COMP1', linkQuantity: 3, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['SUB1', makeArticle({ code: 'SUB1', supplyType: 'FABRICATION' })],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    // ART1: 10 units → SUB1: 10*2=20 → COMP1: 20*3=60. Stock COMP1=500 → feasible
    const result = checkFeasibility('ART1', 10, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
  })

  test('detects shortage in deep sub-assembly', ({ assert }) => {
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 10 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'SUB1', linkQuantity: 2, componentType: 'FABRIQUE' }),
        ],
      }],
      ['SUB1', {
        article: 'SUB1', description: '', components: [
          makeEntry({ parentArticle: 'SUB1', componentArticle: 'COMP1', linkQuantity: 5, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['SUB1', makeArticle({ code: 'SUB1', supplyType: 'FABRICATION' })],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    // ART1: 10 → SUB1: 20 → COMP1: 100 needed, 10 available → shortage 90
    const result = checkFeasibility('ART1', 10, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isFalse(result.feasible)
    assert.equal(result.blockingComponents[0].article, 'COMP1')
    assert.equal(result.blockingComponents[0].shortage, 90)
  })

  test('stops recursion on circular nomenclature', ({ assert }) => {
    // ART1 needs ART1 (circular) — should not infinite loop
    const flows: Flow[] = [
      makeFlow({ article: 'COMP1', direction: 'supply', quantity: 1000 }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['ART1', {
        article: 'ART1', description: '', components: [
          makeEntry({ parentArticle: 'ART1', componentArticle: 'ART1', linkQuantity: 1, componentType: 'FABRIQUE' }),
          makeEntry({ parentArticle: 'ART1', componentArticle: 'COMP1', linkQuantity: 1, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['ART1', makeArticle()],
      ['COMP1', makeArticle({ code: 'COMP1', supplyType: 'ACHAT' })],
    ])
    // Should not hang — circular ref detected, COMP1 is feasible
    const result = checkFeasibility('ART1', 10, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
  })
})

// ---------------------------------------------------------------------------
// Fantômes (catégorie AFANT) : stock du fantôme d'abord, descente BOM pour le
// reliquat seulement (sémantique MRP). Cas réel : 11085385 (INTERCALAIRE,
// stock prédécoupé) → E2623 (carton brut).
// ---------------------------------------------------------------------------

test.group('checkFeasibility — fantômes AFANT', () => {
  const phantomFixtures = (phantomStock: number, leafStock: number) => {
    const flows: Flow[] = [
      makeFlow({ article: 'PHAN', direction: 'supply', quantity: phantomStock }),
      makeFlow({ article: 'E1', direction: 'supply', quantity: leafStock }),
    ]
    const nomenclatures = new Map<string, Nomenclature>([
      ['KIT', {
        article: 'KIT', description: '', components: [
          makeEntry({ parentArticle: 'KIT', componentArticle: 'PHAN', linkQuantity: 0.5, componentType: 'FABRIQUE' }),
        ],
      }],
      ['PHAN', {
        article: 'PHAN', description: '', components: [
          makeEntry({ parentArticle: 'PHAN', componentArticle: 'E1', linkQuantity: 1, componentType: 'ACHETE' }),
        ],
      }],
    ])
    const articles = new Map<string, Article>([
      ['KIT', makeArticle({ code: 'KIT' })],
      ['PHAN', makeArticle({ code: 'PHAN', category: 'AFANT' })],
      ['E1', makeArticle({ code: 'E1', supplyType: 'ACHAT' })],
    ])
    return { flows, nomenclatures, articles }
  }

  test('stock du fantôme suffisant → faisable sans descente', ({ assert }) => {
    const { flows, nomenclatures, articles } = phantomFixtures(6, 0)
    // 10 KIT × 0.5 = besoin 5 ≤ stock fantôme 6 → couvert, E1 jamais consulté
    const result = checkFeasibility('KIT', 10, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
  })

  test('stock du fantôme insuffisant → descente pour le reliquat seulement', ({ assert }) => {
    const { flows, nomenclatures, articles } = phantomFixtures(6, 10)
    // 40 KIT × 0.5 = besoin 20 ; fantôme couvre 6 → reliquat 14 sur E1 (stock 10) → manque 4
    const result = checkFeasibility('KIT', 40, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isFalse(result.feasible)
    assert.equal(result.blockingComponents.length, 1)
    assert.equal(result.blockingComponents[0].article, 'E1')
    assert.equal(result.blockingComponents[0].shortage, 4)
  })

  test('mode séquentiel (treatFabricatedAsStock) : le fantôme est éclaté, pas affiché lui-même', ({ assert }) => {
    const { flows, nomenclatures, articles } = phantomFixtures(0, 10)
    // Sans la branche AFANT, le mode séquentiel afficherait PHAN en rupture sans descendre.
    const result = checkFeasibility('KIT', 40, flows, nomenclatures, articles, undefined, 'stock_strict', undefined, undefined, true)
    assert.isFalse(result.feasible)
    assert.equal(result.blockingComponents[0].article, 'E1')
    assert.equal(result.blockingComponents[0].shortage, 10)
  })

  test('reliquat entièrement couvert par le composant réel → faisable', ({ assert }) => {
    const { flows, nomenclatures, articles } = phantomFixtures(6, 5000)
    const result = checkFeasibility('KIT', 40, flows, nomenclatures, articles, undefined, 'stock_strict')
    assert.isTrue(result.feasible)
  })
})
