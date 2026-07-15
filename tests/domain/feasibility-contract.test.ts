import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import type { MfgMaterialInput } from '#app/domain/of-feasibility'
import { evaluateMfgFeasibility, buildStrictQcStock } from '#app/domain/of-feasibility'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive-checker'
import {
  RecursiveDiagnosticChecker,
  type DiagnosticLoader,
} from '#app/domain/recursive-diagnostic-checker'
import type { Flow } from '#app/domain/models/flow'
import type { ErpAllocation } from '#app/domain/allocation'
import {
  evaluateRuptures,
  type RuptureDataset,
  type RuptureOfInput,
} from '#app/domain/rupture-engine'

/**
 * Contrat d'unicité de la source de vérité faisabilité (#32 suivi) :
 * le moteur du badge/diagnostic (RecursiveDiagnosticChecker) et celui de l'onglet
 * Composants/show (evaluateMfgFeasibility) DOIVENT rendre le même verdict sur un
 * même OF. Sinon → le bug « faisabilité dit rupture, composants dit dispo » revient.
 *
 * Scénario CE2204 : composant acheté, stock strict 0 (1 physique, 1 alloué global),
 * besoin 2, réception en retard (61, il y a 3 mois) → exclue par la grace (7 j).
 * Verdict attendu : RUPTURE (les deux moteurs).
 */

const CHECK_DATE = new Date('2026-06-22T00:00:00')

class MemLoader implements DiagnosticLoader {
  articles = new Map<string, Article>()
  nomenclatures = new Map<string, Nomenclature>()
  stocks = new Map<string, StockRecord>()
  receptions = new Map<string, ReceptionRecord[]>()
  ofs: OfRecord[] = []
  mfgmat = new Map<string, MfgMaterialInput[]>()
  getArticle(a: string) {
    return this.articles.get(a)
  }
  getNomenclature(a: string) {
    return this.nomenclatures.get(a)
  }
  async getStock(a: string) {
    return this.stocks.get(a)
  }
  async getStocks(arts: string[]) {
    const out = new Map<string, StockRecord | undefined>()
    for (const a of arts) out.set(a, this.stocks.get(a))
    return out
  }
  async getReceptions(a: string) {
    return this.receptions.get(a) ?? []
  }
  getAllocationsOf() {
    return []
  }
  getOfsByArticle(article: string, statut?: number) {
    let f = this.ofs.filter((o) => o.article === article)
    if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
    return f
  }
  async getMfgmat(n: string) {
    return this.mfgmat.get(n) ?? []
  }
}

function buildScenario() {
  const loader = new MemLoader()
  // BOM : SE2261 → CE2204 (×1).
  const bom: Nomenclature = {
    article: 'SE2261',
    description: 'SE2261',
    components: [
      {
        parentArticle: 'SE2261',
        parentDescription: 'SE2261',
        level: 1,
        componentArticle: 'CE2204',
        componentDescription: 'CE2204',
        linkQuantity: 1,
        componentType: 'ACHETE',
        consumptionNature: 'PROPORTIONNEL',
      } as NomenclatureEntry,
    ],
  }
  loader.nomenclatures.set('SE2261', bom)
  // Stock CE2204 : 1 physique, 1 alloué → strict 0.
  loader.stocks.set('CE2204', { stockPhysique: 1, stockAlloue: 1, stockQc: 0 })
  // Réception en retard (02-MAR-26, ~100 j) → hors grace 7 j.
  loader.receptions.set('CE2204', [
    {
      id: 'CG2501715',
      article: 'CE2204',
      supplier: '19001',
      quantity: 61,
      date: new Date('2026-03-02'),
    },
  ])
  // OF suggestion SE2261 qté 2.
  const of: OfRecord = {
    numOf: 'SGAE10646179195',
    article: 'SE2261',
    statutNum: 3,
    qteRestante: 2,
    dateDebut: undefined,
    dateFin: new Date('2026-06-22'),
  }
  return { loader, of }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrats issue #73 — règles métier actées, gelées sur cas réels
// (constats de la semaine du 2026-07-07). Ces fixtures sont LA référence : le
// moteur unique (rupture-engine) devra rendre exactement ces verdicts, et
// chaque migration de vue (étape 2) se compare avant/après sur elles.
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_73 = new Date('2026-07-07T00:00:00')

function mkArticle(code: string, category: string, supplyType: 'ACHAT' | 'FABRICATION'): Article {
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

function stockFlow(article: string, qty: number): Flow {
  return {
    article,
    quantity: qty,
    direction: 'supply',
    date: null,
    origin: { type: 'stock', subType: 'strict', pmp: null },
  }
}

/** Dataset moteur partageant les mêmes maps que MemLoader. */
function datasetOf(loader: MemLoader, allocations?: Map<string, ErpAllocation[]>): RuptureDataset {
  const stockNet = new Map<string, number>()
  for (const [article, s] of loader.stocks) {
    stockNet.set(article, s.stockPhysique - s.stockAlloue - (s.stockQc ?? 0))
  }
  const allocationsByOf = new Map<string, Map<string, number>>()
  for (const [numOf, allocs] of allocations ?? []) {
    const m = new Map<string, number>()
    for (const al of allocs) m.set(al.article, (m.get(al.article) ?? 0) + al.qteAllouee)
    allocationsByOf.set(numOf, m)
  }
  return {
    articles: loader.articles,
    nomenclatures: loader.nomenclatures,
    stockNet,
    allocationsByOf,
  }
}

/**
 * Cas réel « fantôme AFANT + stock partiel » (OF F426-402081 / article 11035401).
 * BOM : 11035401 → 11085385 (AFANT ×1) → E2623 (ACHETE ×1).
 * Constat d'origine : le proactif affichait le fantôme 11085385 en rupture alors que
 * le vrai composant E2623 avait 5196 en stock. Règle actée (b500124, sémantique MRP) :
 * stock strict net du fantôme crédité D'ABORD, descente dans SA nomenclature pour le
 * RELIQUAT seulement — et un manque se rapporte sur la feuille réelle, pas le fantôme.
 */
function buildPhantomFixture(stockPhantom: number, stockLeaf: number) {
  const loader = new MemLoader()
  loader.articles.set('11035401', mkArticle('11035401', 'PF', 'FABRICATION'))
  loader.articles.set('11085385', mkArticle('11085385', 'AFANT', 'FABRICATION'))
  loader.articles.set('E2623', mkArticle('E2623', 'MP', 'ACHAT'))
  loader.nomenclatures.set('11035401', {
    article: '11035401',
    description: '11035401',
    components: [mkEntry('11035401', '11085385', 1, 'FABRIQUE')],
  })
  loader.nomenclatures.set('11085385', {
    article: '11085385',
    description: '11085385',
    components: [mkEntry('11085385', 'E2623', 1, 'ACHETE')],
  })
  if (stockPhantom > 0)
    loader.stocks.set('11085385', { stockPhysique: stockPhantom, stockAlloue: 0 })
  if (stockLeaf > 0) loader.stocks.set('E2623', { stockPhysique: stockLeaf, stockAlloue: 0 })

  const flows: Flow[] = []
  if (stockPhantom > 0) flows.push(stockFlow('11085385', stockPhantom))
  if (stockLeaf > 0) flows.push(stockFlow('E2623', stockLeaf))

  const articles = loader.articles
  const nomenclatures = loader.nomenclatures
  const of: OfRecord = {
    numOf: 'F426-402081',
    article: '11035401',
    statutNum: 2,
    qteRestante: 50,
    dateDebut: CHECK_73,
    dateFin: new Date('2026-07-10'),
  }
  const engineOf: RuptureOfInput = {
    numOf: of.numOf,
    article: of.article,
    qteRestante: of.qteRestante,
    statutNum: 2,
    dateBesoin: CHECK_73,
  }
  return { loader, flows, articles, nomenclatures, of, engineOf }
}

test.group('Contrat #73 — fantôme AFANT stock partiel (11035401 / F426-402081)', () => {
  test('stock fantôme crédité d’abord, reliquat couvert par la feuille → faisable (2 moteurs)', async ({
    assert,
  }) => {
    // Fantôme 10 en stock, besoin 50 → reliquat 40 ; E2623 en a 45 (≥ 40 mais < 50 :
    // discrimine la sémantique MRP actée de l'ancienne logique « variantes » qui
    // exigeait le besoin COMPLET sur la feuille sans créditer le stock du fantôme).
    const { loader, of, engineOf } = buildPhantomFixture(10, 45)

    const contention = evaluateRuptures([engineOf], datasetOf(loader), 'contention').get(of.numOf)
    assert.isTrue(
      contention?.feasible,
      `contention (moteur) : ${JSON.stringify(contention?.missing)}`
    )

    const diag = await new RecursiveDiagnosticChecker(loader, { checkDate: CHECK_73 }).diagnoseOf(
      of
    )
    assert.isTrue(diag.feasible, `diagnostic : ${JSON.stringify(diag.tree.shorts)}`)
  })

  test('reliquat non couvert → rupture désigne la feuille réelle, jamais le fantôme', async ({
    assert,
  }) => {
    // Fantôme 10 en stock, besoin 50, E2623 à 0 → manque 40 sur E2623.
    const { loader, of, engineOf } = buildPhantomFixture(10, 0)

    const contention = evaluateRuptures([engineOf], datasetOf(loader), 'contention').get(of.numOf)
    assert.isFalse(contention?.feasible)
    assert.deepEqual(contention?.missing, { E2623: 40 })

    const diag = await new RecursiveDiagnosticChecker(loader, { checkDate: CHECK_73 }).diagnoseOf(
      of
    )
    assert.isFalse(diag.feasible)
    assert.equal(diag.rootCause, 'rupture_matiere')
    assert.deepEqual(
      diag.tree.shorts.map((s) => ({ article: s.article, missing: s.quantityMissing })),
      [{ article: 'E2623', missing: 40 }],
      'le fantôme 11085385 ne doit JAMAIS apparaître comme composant en rupture'
    )
  })
})

/**
 * Cas réel « allocation ERP partielle sur OF ferme » (AR2602882 / 11016312).
 * L'OF ferme F426-39386 (11016312) porte une allocation STOALL partielle de 41 sur son
 * composant 11016785 (besoin 200, stock net 0). Constat d'origine : le suivi réactif
 * accusait l'OF de la rupture −159 que sa propre allocation créait, sans jamais créditer
 * l'allocation. Règle actée (8e4d65a) : déduction PARTIELLE (besoin − alloué), jamais de
 * skip tout-ou-rien ; OF ferme ≠ exemption — le manque résiduel doit rester visible.
 */
function buildAllocationFixture(statutNum: number) {
  const loader = new MemLoader()
  loader.articles.set('11016312', mkArticle('11016312', 'PF', 'FABRICATION'))
  loader.articles.set('11016785', mkArticle('11016785', 'MP', 'ACHAT'))
  loader.nomenclatures.set('11016312', {
    article: '11016312',
    description: '11016312',
    components: [mkEntry('11016312', '11016785', 1, 'ACHETE')],
  })
  // Stock net 0 : tout est déjà alloué (la part GLOALL de l'OF incluse).
  loader.stocks.set('11016785', { stockPhysique: 41, stockAlloue: 41 })

  const allocations = new Map<string, ErpAllocation[]>([
    ['F426-39386', [{ article: '11016785', qteAllouee: 41 }]],
  ])
  const of: OfRecord = {
    numOf: 'F426-39386',
    article: '11016312',
    statutNum,
    qteRestante: 200,
    dateDebut: CHECK_73,
    dateFin: new Date('2026-07-15'),
  }
  return { loader, allocations, of }
}

test.group('Contrat #73 — allocation ERP partielle, OF ferme (AR2602882 / 11016312)', () => {
  test('OF ferme : déduction partielle, manque résiduel visible (jamais de skip)', ({ assert }) => {
    const { loader, allocations, of } = buildAllocationFixture(1)

    const verdict = evaluateRuptures(
      [
        {
          numOf: of.numOf,
          article: of.article,
          qteRestante: 200,
          statutNum: 1,
          dateBesoin: CHECK_73,
        },
      ],
      datasetOf(loader, allocations),
      'photo'
    ).get(of.numOf)!

    // Affermi malgré la rupture : verdict « faisable » (l'OF est lancé), MAIS le
    // manque résiduel 200 − 41 = 159 reste visible — ni {} (skip), ni 200 (alloc ignorée).
    assert.isTrue(verdict.feasible)
    assert.deepEqual(verdict.missing, { '11016785': 159 })
  })

  test('OF non ferme : même déduction, verdict rupture', ({ assert }) => {
    const { loader, allocations, of } = buildAllocationFixture(2)

    const verdict = evaluateRuptures(
      [
        {
          numOf: of.numOf,
          article: of.article,
          qteRestante: 200,
          statutNum: 2,
          dateBesoin: CHECK_73,
        },
      ],
      datasetOf(loader, allocations),
      'photo'
    ).get(of.numOf)!

    assert.isFalse(verdict.feasible)
    assert.deepEqual(verdict.missing, { '11016785': 159 })
  })
})

test.group('Contrat #73 — parité photo/contention (F426-402081)', () => {
  test('même OF seul : photo et contention rendent le même verdict et les mêmes manquants', ({
    assert,
  }) => {
    // Cas bloqué (E2623 à 0) : les deux modes doivent désigner E2623 −40, pas le fantôme.
    const blocked = buildPhantomFixture(10, 0)
    const photoKo = evaluateRuptures([blocked.engineOf], datasetOf(blocked.loader), 'photo').get(
      blocked.of.numOf
    )!
    const contentionKo = evaluateRuptures(
      [blocked.engineOf],
      datasetOf(blocked.loader),
      'contention'
    ).get(blocked.of.numOf)!
    assert.deepEqual(contentionKo.missing, photoKo.missing)
    assert.equal(contentionKo.feasible, photoKo.feasible)

    // Cas couvert (E2623 à 45) : parité aussi sur le verdict positif.
    const covered = buildPhantomFixture(10, 45)
    const photoOk = evaluateRuptures([covered.engineOf], datasetOf(covered.loader), 'photo').get(
      covered.of.numOf
    )!
    const contentionOk = evaluateRuptures(
      [covered.engineOf],
      datasetOf(covered.loader),
      'contention'
    ).get(covered.of.numOf)!
    assert.isTrue(photoOk.feasible)
    assert.isTrue(contentionOk.feasible)
  })
})

test.group('Contrat #73 — moteur unique (rupture-engine) sur les fixtures gelées', () => {
  const datasetFromLoader = (loader: MemLoader): RuptureDataset => {
    const stockNet = new Map<string, number>()
    for (const [article, s] of loader.stocks) {
      stockNet.set(article, s.stockPhysique - s.stockAlloue - (s.stockQc ?? 0))
    }
    return { articles: loader.articles, nomenclatures: loader.nomenclatures, stockNet }
  }

  test('fantôme AFANT stock partiel : verdicts identiques aux moteurs historiques, 2 modes', ({
    assert,
  }) => {
    for (const mode of ['photo', 'contention'] as const) {
      const covered = buildPhantomFixture(10, 45)
      const engineOf: RuptureOfInput = {
        numOf: covered.of.numOf,
        article: covered.of.article,
        qteRestante: 50,
        statutNum: 2,
        dateBesoin: CHECK_73,
      }
      const ok = evaluateRuptures([engineOf], datasetFromLoader(covered.loader), mode).get(
        engineOf.numOf
      )!
      assert.isTrue(ok.feasible, `${mode} : ${JSON.stringify(ok.missing)}`)

      const blocked = buildPhantomFixture(10, 0)
      const ko = evaluateRuptures([engineOf], datasetFromLoader(blocked.loader), mode).get(
        engineOf.numOf
      )!
      assert.isFalse(ko.feasible)
      assert.deepEqual(
        ko.missing,
        { E2623: 40 },
        `${mode} : le fantôme ne doit jamais être le manquant`
      )
    }
  })

  test('allocation ERP partielle OF ferme : faisable, manque résiduel 159 visible', ({
    assert,
  }) => {
    const { loader } = buildAllocationFixture(1)
    const dataset = datasetFromLoader(loader)
    dataset.allocationsByOf = new Map([['F426-39386', new Map([['11016785', 41]])]])
    const engineOf: RuptureOfInput = {
      numOf: 'F426-39386',
      article: '11016312',
      qteRestante: 200,
      statutNum: 1,
      dateBesoin: CHECK_73,
    }

    const firm = evaluateRuptures([engineOf], dataset, 'photo').get(engineOf.numOf)!
    assert.isTrue(firm.feasible)
    assert.deepEqual(firm.missing, { '11016785': 159 })

    const planned = evaluateRuptures([{ ...engineOf, statutNum: 2 }], dataset, 'photo').get(
      engineOf.numOf
    )!
    assert.isFalse(planned.feasible)
    assert.deepEqual(planned.missing, { '11016785': 159 })
  })
})

test.group('Contrat faisabilité — source unique', () => {
  test('CE2204 strict 0 + besoin 2 → rupture pour les deux moteurs', async ({ assert }) => {
    const { loader, of } = buildScenario()

    // 1) Moteur badge/diagnostic (RecursiveDiagnosticChecker).
    const checker = new RecursiveDiagnosticChecker(loader, {
      checkDate: CHECK_DATE,
    })
    const result = await checker.diagnoseOf(of)

    // 2) Moteur composants/show (evaluateMfgFeasibility) — même stock.
    // Le flow 'strict' n'est émis que si strict > 0 : CE2204 (strict 0) est ABSENT.
    const stockFlows: Flow[] = [] // CE2204 strict 0 → pas de flow strict
    const stockByArticle = buildStrictQcStock(stockFlows)
    const materials: MfgMaterialInput[] = [
      { article: 'CE2204', description: 'CE2204', remaining: 2, allocated: 0 },
    ]
    const verdict = evaluateMfgFeasibility(materials, stockByArticle, false)

    // Contrat : les deux moteurs rendent le même verdict (rupture, pas indéterminé).
    assert.isFalse(
      result.feasible,
      'Le checker doit dire RUPTURE (stock strict 0, réception en retard exclue)'
    )
    assert.isFalse(
      verdict.feasible,
      `evaluateMfgFeasibility doit aussi dire RUPTURE (et non indéterminé). ` +
        `Verdict composants : ${JSON.stringify(verdict.materials.find((m) => m.article === 'CE2204'))}`
    )
  })
})
