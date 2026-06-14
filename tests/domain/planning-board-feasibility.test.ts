import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  buildEffectiveOfs,
  evaluateWindow,
  whatifOrder,
  type PlanningBoardFeasibilityLoader,
} from '#app/domain/planning-board-feasibility'
import type { OfRecord, StockRecord } from '#app/domain/recursive-checker'

const TODAY = new Date('2026-06-14')
const FROM_D = new Date(TODAY)
FROM_D.setDate(TODAY.getDate() - 7)
const TO_D = new Date(TODAY)
TO_D.setDate(TODAY.getDate() + 42)

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

function makeOf(numOf: string, article: string, statut: number = 3, debutOffset: number = 5, qte: number = 60): OfRecord {
  const debut = new Date(TODAY)
  debut.setDate(TODAY.getDate() + debutOffset)
  const fin = new Date(debut)
  fin.setDate(debut.getDate() + 3)
  return { numOf, article, statutNum: statut, qteRestante: qte, dateDebut: debut, dateFin: fin }
}

function makeLoader(options: {
  ofs?: OfRecord[]
  stocks?: Record<string, StockRecord>
  nomenclatures?: Record<string, Nomenclature>
  articles?: Record<string, Article>
  commandesClients?: PlanningBoardFeasibilityLoader['commandesClients']
}): PlanningBoardFeasibilityLoader {
  return {
    getArticle: (a) => options.articles?.[a],
    getNomenclature: (a) => options.nomenclatures?.[a],
    getStock: (a) => options.stocks?.[a],
    getReceptions: () => [],
    getOfsByArticle: (article, _statut, _dateBesoin) => (options.ofs ?? []).filter((o) => article === '' || o.article === article),
    commandesClients: options.commandesClients,
  }
}

function twoOfSharedComponent(qteStock: number = 100): PlanningBoardFeasibilityLoader {
  return makeLoader({
    ofs: [
      makeOf('OF-A', 'PF1', 3, 5, 60),
      makeOf('OF-B', 'PF2', 3, 10, 60),
    ],
    stocks: { C1: { stockPhysique: qteStock, stockAlloue: 0 } },
    nomenclatures: {
      PF1: makeNomenclature('PF1', [makeEntry('PF1', 'C1', 1)]),
      PF2: makeNomenclature('PF2', [makeEntry('PF2', 'C1', 1)]),
    },
    articles: {
      PF1: makeArticle('PF1', 'FABRICATION'),
      PF2: makeArticle('PF2', 'FABRICATION'),
      C1: makeArticle('C1', 'ACHAT', 'AP'),
    },
  })
}

test.group('Planning board feasibility', () => {
  test('first OF by date wins when stock is scarce', ({ assert }) => {
    const loader = twoOfSharedComponent(100)
    const ofs = buildEffectiveOfs(loader, {}, FROM_D, TO_D)
    const entries = evaluateWindow(loader, ofs, TO_D)

    assert.isTrue(entries['OF-A'].faisable)
    assert.equal(entries['OF-A'].allocated['C1'], 60)
    assert.isFalse(entries['OF-B'].faisable)
    assert.equal(entries['OF-B'].missingComponents['C1'], 20)
  })

  test('firm override gets priority', ({ assert }) => {
    const loader = twoOfSharedComponent(100)
    const ofs = buildEffectiveOfs(loader, { 'OF-B': { statutNum: 1 } }, FROM_D, TO_D)
    const entries = evaluateWindow(loader, ofs, TO_D)

    assert.isTrue(entries['OF-B'].faisable)
    assert.isFalse(entries['OF-A'].faisable)
    assert.equal(entries['OF-A'].missingComponents['C1'], 20)
  })

  test('sufficient stock makes all feasible', ({ assert }) => {
    const loader = twoOfSharedComponent(200)
    const ofs = buildEffectiveOfs(loader, {}, FROM_D, TO_D)
    const entries = evaluateWindow(loader, ofs, TO_D)

    assert.isTrue(entries['OF-A'].faisable)
    assert.isTrue(entries['OF-B'].faisable)
  })

  test('override date moves OF out of window', ({ assert }) => {
    const loader = twoOfSharedComponent()
    const far = new Date(TODAY)
    far.setDate(TODAY.getDate() + 90)
    const ofs = buildEffectiveOfs(loader, { 'OF-B': { dateDebut: far, dateFin: far } }, FROM_D, TO_D)

    assert.deepEqual(new Set(ofs.map((o) => o.numOf)), new Set(['OF-A']))
  })

  test('OF without BOM is flagged sans_nomenclature', ({ assert }) => {
    const loader = makeLoader({
      ofs: [makeOf('OF-X', 'PF9', 3, 5, 10)],
      articles: { PF9: makeArticle('PF9', 'FABRICATION') },
    })
    const ofs = buildEffectiveOfs(loader, {}, FROM_D, TO_D)
    const entries = evaluateWindow(loader, ofs, TO_D)

    assert.equal(entries['OF-X'].statut, 'sans_nomenclature')
  })

  test('whatif order dries up existing OF', ({ assert }) => {
    const loader = twoOfSharedComponent(100)
    loader.commandesClients = [{
      numCommande: 'CMD-1',
      nomClient: 'ACME',
      article: 'PF1',
      qteRestante: 60,
      dateExpeditionDemandee: new Date(TODAY.getTime() + 8 * 24 * 60 * 60 * 1000),
      typeCommande: 'MTS',
      ofContremarque: 'OF-A',
    }]

    const dateBesoin = new Date(TODAY)
    dateBesoin.setDate(TODAY.getDate() + 2)
    const result = whatifOrder(loader, {}, 'PF1', 50, dateBesoin, FROM_D, TO_D)

    assert.isTrue(result.nouvelle.faisable)
    const degradedNums = new Set(result.degraded.map((d) => d.numOf))
    assert.isTrue(degradedNums.has('OF-A'))
    const ofA = result.degraded.find((d) => d.numOf === 'OF-A')
    assert.equal(ofA!.composantsPerdus['C1'], 10)
    assert.equal(ofA!.commandes[0].numCommande, 'CMD-1')
    assert.equal(result.stats.nbDegrades, result.degraded.length)
    assert.isAtLeast(result.stats.nbCommandesTouches, 1)
  })

  test('whatif order with no impact', ({ assert }) => {
    const loader = twoOfSharedComponent(200)
    const dateBesoin = new Date(TODAY)
    dateBesoin.setDate(TODAY.getDate() + 2)
    const result = whatifOrder(loader, {}, 'PF1', 10, dateBesoin, FROM_D, TO_D)

    assert.isTrue(result.nouvelle.faisable)
    assert.deepEqual(result.degraded, [])
    assert.deepEqual(result.improved, [])
  })
})
