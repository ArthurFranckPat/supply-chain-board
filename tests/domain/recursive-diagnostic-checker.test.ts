import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry, ComponentType, ConsumptionNature } from '#app/domain/models/nomenclature'
import type { ErpAllocation } from '#app/domain/allocation'
import type { MfgMaterialInput } from '#app/domain/of-feasibility'
import type { OfRecord, StockRecord, ReceptionRecord } from '#app/domain/recursive-checker'
import {
  RecursiveDiagnosticChecker,
  type DiagnosticLoader,
  type RecursiveDiagnosticResult,
} from '#app/domain/recursive-diagnostic-checker'

const DATE = new Date('2026-06-20')

function mkBom(
  parent: string,
  comps: Array<{ article: string; qty: number; type?: ComponentType; nature?: ConsumptionNature }>,
): Nomenclature {
  const components: NomenclatureEntry[] = comps.map((c) => ({
    parentArticle: parent,
    parentDescription: parent,
    level: 1,
    componentArticle: c.article,
    componentDescription: c.article,
    linkQuantity: c.qty,
    componentType: c.type ?? 'ACHETE',
    consumptionNature: c.nature ?? 'PROPORTIONNEL',
  }))
  return { article: parent, description: parent, components }
}

class MemLoader implements DiagnosticLoader {
  articles = new Map<string, Article>()
  nomenclatures = new Map<string, Nomenclature>()
  stocks = new Map<string, StockRecord>()
  receptions = new Map<string, ReceptionRecord[]>()
  allocations = new Map<string, ErpAllocation[]>()
  ofs: OfRecord[] = []
  mfgmat = new Map<string, MfgMaterialInput[]>()

  getArticle(a: string) {
    return this.articles.get(a)
  }
  getNomenclature(a: string) {
    return this.nomenclatures.get(a)
  }
  getStock(a: string) {
    return this.stocks.get(a)
  }
  getReceptions(a: string) {
    return this.receptions.get(a) ?? []
  }
  getAllocationsOf(n: string) {
    return this.allocations.get(n) ?? []
  }
  getOfsByArticle(article: string, statut?: number, dateBesoin?: Date): OfRecord[] {
    let f = this.ofs.filter((o) => o.article === article)
    if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
    if (dateBesoin) f = f.filter((o) => !o.dateFin || o.dateFin <= dateBesoin)
    return f
  }
  getMfgmat(numOf: string) {
    return this.mfgmat.get(numOf) ?? []
  }
}

const mat = (article: string, remaining: number, allocated = 0): MfgMaterialInput => ({
  article,
  description: article,
  unit: 'U',
  remaining,
  allocated,
})

/** OF planifié (statut 2) avec MFGMAT donnée. */
const ofRecord = (numOf: string, article: string, qteRestante: number, statut = 2): OfRecord => ({
  numOf,
  article,
  statutNum: statut,
  qteRestante,
  dateDebut: DATE,
})

function diagnose(loader: MemLoader, head: OfRecord, maxDepth?: number): RecursiveDiagnosticResult {
  return new RecursiveDiagnosticChecker(loader, { checkDate: DATE, maxDepth }).diagnoseOf(head)
}

test.group('RecursiveDiagnosticChecker', () => {
  test('composant acheté en rupture → rupture_matiere (feuille)', ({ assert }) => {
    const loader = new MemLoader()
    loader.stocks.set('C1', { stockPhysique: 20, stockAlloue: 0 })
    loader.mfgmat.set('OF1', [mat('C1', 60)])

    const r = diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.blockers.length, 1)
    assert.equal(r.blockers[0].kind, 'rupture_matiere')
    assert.equal(r.blockers[0].article, 'C1')
    assert.equal(r.blockers[0].quantityMissing, 40)
    assert.equal(r.blockers[0].chain.length, 2) // PF → C1
  })

  test('sous-ensemble couvert par un OF ferme faisable → aucun blocker', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }])) // SE = fabriqué
    loader.mfgmat.set('OF1', [mat('SE', 5)]) // OF1 consomme SE, stock 0 → short
    // OF2 fabrique SE, ferme (statut 1) → toujours faisable, qte 10 >= 5
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 1))
    loader.mfgmat.set('OF2', [mat('C1', 2)])
    loader.stocks.set('C1', { stockPhysique: 100, stockAlloue: 0 })

    const r = diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isTrue(r.feasible)
    assert.equal(r.blockers.length, 0)
  })

  test('sous-ensemble dont l\'OF couvrant est bloqué par un acheté → bulle la feuille', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    // OF2 fabrique SE, MFGMAT C1, stock insuffisant
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 2))
    loader.mfgmat.set('OF2', [mat('C1', 60)])
    loader.stocks.set('C1', { stockPhysique: 20, stockAlloue: 0 })

    const r = diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.blockers.length, 1)
    assert.equal(r.blockers[0].kind, 'rupture_matiere')
    assert.equal(r.blockers[0].article, 'C1')
    assert.equal(r.blockers[0].quantityMissing, 40)
    const chainArticles = r.blockers[0].chain.map((s) => s.article)
    assert.deepEqual(chainArticles, ['PF', 'SE', 'SE', 'C1'])
  })

  test('sous-ensemble couvert par une suggestion (théorique) → descend et bulle la feuille', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    // OF3 = suggestion (statut 3), pas de MFGMAT → repli théorique sur la BOM de SE
    loader.ofs.push(ofRecord('OF3', 'SE', 10, 3))
    loader.stocks.set('C1', { stockPhysique: 0, stockAlloue: 0 })

    const r = diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.blockers[0].kind, 'rupture_matiere')
    assert.equal(r.blockers[0].article, 'C1')
    assert.isTrue(r.blockers[0].chain.some((s) => s.source === 'NOMENCLATURE'))
  })

  test('sous-ensemble sans OF couvrant → of_sous_ensemble_a_lancer', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])

    const r = diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.blockers.length, 1)
    assert.equal(r.blockers[0].kind, 'of_sous_ensemble_a_lancer')
    assert.equal(r.blockers[0].article, 'SE')
    assert.equal(r.blockers[0].quantityMissing, 5)
  })

  test('cycle A→B→A → bloqué + alerte cycle (pas de boucle infinie)', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('A', mkBom('A', [{ article: 'B', qty: 1, type: 'FABRIQUE' }]))
    loader.nomenclatures.set('B', mkBom('B', [{ article: 'A', qty: 1, type: 'FABRIQUE' }]))
    loader.mfgmat.set('OF1', [mat('B', 1)]) // A consomme B
    loader.ofs.push(ofRecord('OF1', 'A', 1, 2), ofRecord('OF2', 'B', 1, 2))
    loader.mfgmat.set('OF2', [mat('A', 1)]) // B consomme A → remonte vers A (OF1)

    const r = diagnose(loader, ofRecord('OF1', 'A', 1))

    assert.isFalse(r.feasible)
    assert.isTrue(r.alerts.some((a) => a.includes('Cycle detecte')))
  })

  test('profondeur max dépassée → bloqué + alerte profondeur', ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 2))
    loader.mfgmat.set('OF2', [mat('C1', 2)])
    loader.stocks.set('C1', { stockPhysique: 100, stockAlloue: 0 })

    // maxDepth = 0 : OF2 (profondeur 1) → garde profondeur déclenchée.
    const r = diagnose(loader, ofRecord('OF1', 'PF', 10), 0)

    assert.isFalse(r.feasible)
    assert.isTrue(r.alerts.some((a) => a.includes('Profondeur max')))
  })
})
