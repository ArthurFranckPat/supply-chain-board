import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  computePromiseDate,
  type PromiseDataset,
  type PromiseMode,
  type DatedSupply,
} from '#app/domain/promise-engine'

const FROM = new Date('2026-07-15') // mercredi

// ── Factories (parité rupture-engine.test.ts) ──

function mkArticle(
  code: string,
  category: string,
  supplyType: 'ACHAT' | 'FABRICATION',
  reorderDelay = 0
): Article {
  return {
    code,
    description: code,
    category,
    supplyType,
    reorderDelay,
    productFamily: null,
    pmp: null,
    economicLot: null,
    unitStock: null,
    unitPurchase: null,
    purchaseToStockRatio: 1,
    packagings: [],
  }
}

function mkEntry(
  parent: string,
  comp: string,
  qty: number,
  type: 'ACHETE' | 'FABRIQUE'
): NomenclatureEntry {
  return {
    parentArticle: parent,
    parentDescription: parent,
    level: 1,
    componentArticle: comp,
    componentDescription: comp,
    linkQuantity: qty,
    componentType: type,
    consumptionNature: 'PROPORTIONNEL',
  }
}

function mkBom(article: string, entries: NomenclatureEntry[]): [string, Nomenclature] {
  return [article, { article, description: article, components: entries }]
}

function mkSupply(
  id: string,
  date: Date,
  qty: number,
  source: 'reception' | 'of' = 'reception'
): DatedSupply {
  return { id, date, quantity: qty, source }
}

function mkDataset(
  articles: Map<string, Article>,
  boms: Map<string, Nomenclature>,
  stockNet: Map<string, number> = new Map(),
  receptions: Map<string, DatedSupply[]> = new Map(),
  extra: Partial<Pick<PromiseDataset, 'ofSupply' | 'supplierLatency'>> = {}
): PromiseDataset {
  return { articles, nomenclatures: boms, stockNet, receptions, ...extra }
}

// ── Helpers de date ──

function day(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function addWorkingDays(iso: string, n: number): string {
  const d = new Date(iso)
  let r = n
  while (r > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) r--
  }
  return d.toISOString().slice(0, 10)
}

function promise(
  article: string,
  quantity: number,
  data: PromiseDataset,
  mode: PromiseMode = 'optimiste'
) {
  return computePromiseDate({ article, quantity, from: FROM, mode }, data)
}

// ══════════════════ Tests PRD §11 ══════════════════

test.group('promise-engine — couverture immédiate', () => {
  test('stock suffisant → date = aujourd’hui, raison = stock', ({ assert }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT')]])
    const stock = new Map([['A', 200]])
    const data = mkDataset(articles, new Map(), stock)

    const r = promise('A', 200, data)

    assert.equal(day(r.promiseDate), '2026-07-15')
    assert.equal(r.tree.reason.kind, 'stock')
    assert.equal(r.criticalPath.length, 1)
    assert.equal(r.infeasible, false)
  })

  test('réception attendue couvre → date = date de la PO, pas today + délai', ({ assert }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT', 14)]])
    const stock = new Map()
    const receptions = new Map([['A', [mkSupply('PO1', new Date(addDays('2026-07-15', 7)), 200)]]])
    const data = mkDataset(articles, new Map(), stock, receptions)

    const r = promise('A', 200, data)

    assert.equal(day(r.promiseDate), addDays('2026-07-15', 7))
    assert.equal(r.tree.reason.kind, 'reception')
    if (r.tree.reason.kind === 'reception') assert.equal(r.tree.reason.poId, 'PO1')
  })
})

test.group('promise-engine — achat pur', () => {
  test('achat manquant → date = today + délai appro, facteur limitant = l’article', ({
    assert,
  }) => {
    const articles = new Map([['C', mkArticle('C', '', 'ACHAT', 14)]])
    const data = mkDataset(articles, new Map())

    const r = promise('C', 200, data)

    assert.equal(day(r.promiseDate), addDays('2026-07-15', 14))
    assert.equal(r.limitingFactor.reason.kind, 'appro')
    if (r.limitingFactor.reason.kind === 'appro') assert.equal(r.limitingFactor.reason.leadTime, 14)
    assert.equal(r.limitingFactor.article, 'C')
  })
})

test.group('promise-engine — fabrication', () => {
  test('fab 1 niveau, tous composants en stock → date = today + délai fab', ({ assert }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['C', mkArticle('C', '', 'ACHAT')],
    ])
    const boms = new Map([mkBom('A', [mkEntry('A', 'C', 1, 'ACHETE')])])
    const stock = new Map([['C', 200]])
    const data = mkDataset(articles, boms, stock)

    const r = promise('A', 200, data)

    assert.equal(day(r.promiseDate), addDays('2026-07-15', 10))
    assert.equal(r.tree.reason.kind, 'fabrication')
    if (r.tree.reason.kind === 'fabrication') assert.equal(r.tree.reason.leadTime, 10)
    // Le composant C est en stock → feuille stock sur le chemin critique
    assert.equal(r.criticalPath.length, 2)
    assert.equal(r.criticalPath[1].article, 'C')
    assert.equal(r.criticalPath[1].reason.kind, 'stock')
  })

  test('fab 2 niveaux → délai fab cumulé sur la branche critique (§8.2)', ({ assert }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['B', mkArticle('B', '', 'FABRICATION', 5)],
      ['C', mkArticle('C', '', 'ACHAT', 20)],
    ])
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'B', 1, 'FABRIQUE')]),
      mkBom('B', [mkEntry('B', 'C', 1, 'ACHETE')]),
    ])
    const data = mkDataset(articles, boms)

    const r = promise('A', 1, data)

    // 20 (appro C) + 5 (fab B) + 10 (fab A) = 35 jours calendaires
    assert.equal(day(r.promiseDate), addDays('2026-07-15', 35))
    assert.equal(r.criticalPath.length, 3)
    assert.deepEqual(
      r.criticalPath.map((n) => n.article),
      ['A', 'B', 'C']
    )
    assert.equal(r.limitingFactor.article, 'C')
    assert.equal(r.limitingFactor.reason.kind, 'appro')
    assert.equal(r.limitingFactor.leadTime, 20)
  })

  test('deux branches, une plus lente → chemin critique suit la lente uniquement', ({ assert }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['FAST', mkArticle('FAST', '', 'ACHAT', 5)],
      ['SLOW', mkArticle('SLOW', '', 'ACHAT', 45)],
    ])
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'FAST', 1, 'ACHETE'), mkEntry('A', 'SLOW', 1, 'ACHETE')]),
    ])
    const data = mkDataset(articles, boms)

    const r = promise('A', 1, data)

    // 45 (appro SLOW) + 10 (fab A) = 55
    assert.equal(day(r.promiseDate), addDays('2026-07-15', 55))
    assert.deepEqual(
      r.criticalPath.map((n) => n.article),
      ['A', 'SLOW']
    )
    // FAST n'est pas sur le chemin critique
    const fastChild = r.tree.children.find((c) => c.article === 'FAST')!
    assert.equal(fastChild.onCriticalPath, false)
    const slowChild = r.tree.children.find((c) => c.article === 'SLOW')!
    assert.equal(slowChild.onCriticalPath, true)
  })
})

test.group('promise-engine — réceptions overdue (§5.4)', () => {
  test('overdue en optimiste → disponible maintenant (date théorique passée)', ({ assert }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT', 14)]])
    const receptions = new Map([
      ['A', [mkSupply('PO1', new Date(addDays('2026-07-15', -10)), 200)]], // 10 j en retard
    ])
    const data = mkDataset(articles, new Map(), new Map(), receptions)

    const r = promise('A', 200, data, 'optimiste')

    assert.equal(day(r.promiseDate), '2026-07-15')
    assert.equal(r.tree.reason.kind, 'reception')
  })

  test('overdue en engageante → re-datée à today + latence résiduelle', ({ assert }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT', 14)]])
    const receptions = new Map([
      ['A', [mkSupply('PO1', new Date(addDays('2026-07-15', -10)), 200)]],
    ])
    const latency = new Map([['A', 7]])
    const data = mkDataset(articles, new Map(), new Map(), receptions, { supplierLatency: latency })

    const r = promise('A', 200, data, 'engageante')

    assert.equal(day(r.promiseDate), addDays('2026-07-15', 7))
    assert.equal(r.tree.reason.kind, 'reception')
  })
})

test.group('promise-engine — fantômes AFANT (§8.5)', () => {
  test('fantôme couvert par stock → pas de descente dans ses composants', ({ assert }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['P', mkArticle('P', 'AFANT', 'FABRICATION')],
      ['Q', mkArticle('Q', '', 'ACHAT', 30)],
    ])
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'P', 1, 'FABRIQUE')]),
      mkBom('P', [mkEntry('P', 'Q', 1, 'ACHETE')]),
    ])
    const stock = new Map([['P', 1]]) // le fantôme est couvert par stock
    const data = mkDataset(articles, boms, stock)

    const r = promise('A', 1, data)

    // P en stock → dispo immédiat, A fab 10 j
    assert.equal(day(r.promiseDate), addDays('2026-07-15', 10))
    assert.deepEqual(
      r.criticalPath.map((n) => n.article),
      ['A', 'P']
    )
    assert.equal(r.criticalPath[1].reason.kind, 'stock')
    // Q n'apparaît jamais dans l'arbre
    assert.isUndefined(r.tree.children[0].children.find((c) => c.article === 'Q'))
  })

  test('fantôme partiellement couvert → descente du reliquat dans sa BOM', ({ assert }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['P', mkArticle('P', 'AFANT', 'FABRICATION')],
      ['Q', mkArticle('Q', '', 'ACHAT', 30)],
    ])
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'P', 2, 'FABRIQUE')]),
      mkBom('P', [mkEntry('P', 'Q', 1, 'ACHETE')]),
    ])
    const stock = new Map([['P', 1]]) // besoin 2, stock 1 → reliquat 1
    const data = mkDataset(articles, boms, stock)

    const r = promise('A', 1, data)

    // reliquat 1 de P → Q appro 30 j, P fantôme délai 0, A fab 10 j = 40 j
    assert.equal(day(r.promiseDate), addDays('2026-07-15', 40))
    assert.deepEqual(
      r.criticalPath.map((n) => n.article),
      ['A', 'P', 'Q']
    )
  })
})

test.group('promise-engine — robustesse BOM', () => {
  test('cycle de nomenclature → coupe propre, truncated=true, pas de crash (§8.4)', ({
    assert,
  }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['B', mkArticle('B', '', 'FABRICATION', 5)],
    ])
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'B', 1, 'FABRIQUE')]),
      mkBom('B', [mkEntry('B', 'A', 1, 'FABRIQUE')]), // cycle A → B → A
    ])
    const data = mkDataset(articles, boms)

    const r = promise('A', 1, data)

    assert.equal(r.truncated, true)
    assert.equal(r.infeasible, false)
    // B est calculé (A est skippé dans la BOM de B), pas de crash
    assert.isTrue(r.promiseDate.getTime() >= FROM.getTime())
  })

  test('article FABRICATION sans nomenclature ni stock → infaisable explicite (§8.1)', ({
    assert,
  }) => {
    const articles = new Map([['X', mkArticle('X', '', 'FABRICATION', 10)]])
    const data = mkDataset(articles, new Map())

    const r = promise('X', 1, data)

    assert.equal(r.infeasible, true)
    assert.equal(r.tree.reason.kind, 'infeasible')
  })

  test('article inconnu du référentiel → infaisable', ({ assert }) => {
    const data = mkDataset(new Map(), new Map())

    const r = promise('GHOST', 1, data)

    assert.equal(r.infeasible, true)
    assert.equal(r.tree.reason.kind, 'infeasible')
  })
})

test.group('promise-engine — ledger anti-double-promesse (§5.2)', () => {
  test('deux lignes BOM sur le même stock → la deuxième consomme le reliquat puis commande', ({
    assert,
  }) => {
    const articles = new Map([
      ['A', mkArticle('A', '', 'FABRICATION', 10)],
      ['X', mkArticle('X', '', 'ACHAT', 14)],
    ])
    // X apparaît deux fois dans la BOM de A
    const boms = new Map([
      mkBom('A', [mkEntry('A', 'X', 60, 'ACHETE'), mkEntry('A', 'X', 60, 'ACHETE')]),
    ])
    const stock = new Map([['X', 100]]) // 100 < 120 besoin total
    const data = mkDataset(articles, boms, stock)

    const r = promise('A', 1, data)

    // 1er X : 60 depuis stock (dispo now). 2e X : 40 stock + 20 appro (14 j).
    // Branche critique = 2e X (FROM+14) + fab A (10 j) = FROM+24
    assert.equal(day(r.promiseDate), addDays('2026-07-15', 24))

    const xNodes = r.tree.children.filter((c) => c.article === 'X')
    assert.equal(xNodes.length, 2)
    const approNode = xNodes.find((c) => c.reason.kind === 'appro')
    assert.isDefined(approNode, 'au moins un X doit passer en appro')
    assert.equal(approNode!.onCriticalPath, true)
  })
})

test.group('promise-engine — optimiste vs engageante', () => {
  test('engageante ≥ optimiste ; l’écart intègre latence + jours ouvrés', ({ assert }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT', 14)]])
    const latency = new Map([['A', 5]])
    const data = mkDataset(articles, new Map(), new Map(), new Map(), { supplierLatency: latency })

    const opt = promise('A', 1, data, 'optimiste')
    const eng = promise('A', 1, data, 'engageante')

    // optimiste : 14 jours calendaires
    assert.equal(day(opt.promiseDate), addDays('2026-07-15', 14))
    // engageante : (14+5) = 19 jours ouvrés
    assert.equal(day(eng.promiseDate), addWorkingDays('2026-07-15', 19))
    // engageante ≥ optimiste
    assert.isAtLeast(eng.promiseDate.getTime(), opt.promiseDate.getTime())
    // l'appro engageante porte le retard observé
    if (eng.tree.reason.kind === 'appro') assert.equal(eng.tree.reason.observed, 5)
    if (opt.tree.reason.kind === 'appro') assert.isUndefined(opt.tree.reason.observed)
  })

  test('latence négative (fournisseur en avance) clampée à 0 — engageante ≥ optimiste', ({
    assert,
  }) => {
    const articles = new Map([['A', mkArticle('A', '', 'ACHAT', 14)]])
    const latency = new Map([['A', -10]])
    const receptions = new Map([
      ['A', [mkSupply('PO1', new Date(addDays('2026-07-15', -3)), 50)]], // overdue
    ])
    const data = mkDataset(articles, new Map(), new Map(), receptions, {
      supplierLatency: latency,
    })

    const opt = promise('A', 100, data, 'optimiste')
    const eng = promise('A', 100, data, 'engageante')

    // Engageante : appro = 14 j ouvrés (latence −10 ignorée), pas 4.
    assert.equal(day(eng.promiseDate), addWorkingDays('2026-07-15', 14))
    assert.isAtLeast(eng.promiseDate.getTime(), opt.promiseDate.getTime())
    // Overdue re-daté à today + 0 — jamais dans le passé.
    assert.isAtLeast(eng.tree.availableDate.getTime(), FROM.getTime())
    if (eng.tree.reason.kind === 'appro') assert.isUndefined(eng.tree.reason.observed)
  })
})
