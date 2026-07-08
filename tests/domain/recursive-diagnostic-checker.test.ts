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
  async getStock(a: string) {
    return this.stocks.get(a)
  }
  async getStocks(articles: string[]) {
    const out = new Map<string, StockRecord | undefined>()
    for (const a of articles) out.set(a, this.stocks.get(a))
    return out
  }
  async getReceptions(a: string) {
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
  async getMfgmat(numOf: string) {
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

function diagnose(loader: MemLoader, head: OfRecord, maxDepth?: number): Promise<RecursiveDiagnosticResult> {
  return new RecursiveDiagnosticChecker(loader, { checkDate: DATE, maxDepth }).diagnoseOf(head)
}

test.group('RecursiveDiagnosticChecker', () => {
  test('composant acheté en rupture → rupture_matiere (feuille)', async ({ assert }) => {
    const loader = new MemLoader()
    loader.stocks.set('C1', { stockPhysique: 20, stockAlloue: 0 })
    loader.mfgmat.set('OF1', [mat('C1', 60)])

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'rupture_matiere')
    assert.equal(r.tree.shorts.length, 1)
    const c1 = r.tree.shorts[0]
    assert.equal(c1.article, 'C1')
    assert.equal(c1.status, 'rupture_matiere')
    assert.equal(c1.quantityMissing, 40)
    assert.isFalse(c1.fabricated)
    assert.equal(c1.covering.length, 0)
  })

  test('sous-ensemble couvert par un OF ferme faisable → faisable', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }])) // SE = fabriqué
    loader.mfgmat.set('OF1', [mat('SE', 5)]) // OF1 consomme SE, stock 0 → short
    // OF2 fabrique SE, ferme/lancé (statut 1), faisable, qte 10 >= 5
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 1))
    loader.mfgmat.set('OF2', [mat('C1', 2)])
    loader.stocks.set('C1', { stockPhysique: 100, stockAlloue: 0 })

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isTrue(r.feasible)
    assert.equal(r.rootCause, 'ok')
    // Le composant SE est en manque mais couvert par OF2 ferme → status ok, OF couvrant exposé.
    const se = r.tree.shorts[0]
    assert.equal(se.article, 'SE')
    assert.equal(se.status, 'ok')
    assert.equal(se.covering.length, 1)
    assert.equal(se.covering[0].numOf, 'OF2')
    assert.equal(se.covering[0].statut, 1)
    assert.isTrue(se.covering[0].node.feasible)
  })

  test('sous-ensemble dont l\'OF couvrant (planifié) est bloqué par un acheté → rupture_matiere', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    // OF2 fabrique SE, planifié (2), MFGMAT C1, stock insuffisant
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 2))
    loader.mfgmat.set('OF2', [mat('C1', 60)])
    loader.stocks.set('C1', { stockPhysique: 20, stockAlloue: 0 })

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'rupture_matiere')
    const se = r.tree.shorts[0]
    assert.equal(se.article, 'SE')
    assert.equal(se.status, 'rupture_matiere')
    assert.equal(se.covering[0].numOf, 'OF2')
    // La rupture réelle est sur C1, exposée sous l'OF couvrant.
    const c1 = se.covering[0].node.shorts[0]
    assert.equal(c1.article, 'C1')
    assert.equal(c1.status, 'rupture_matiere')
    assert.equal(c1.quantityMissing, 40)
  })

  test('sous-ensemble couvert par une suggestion (théorique) → descend et expose la feuille', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    // OF3 = suggestion (statut 3), pas de MFGMAT → repli théorique sur la BOM de SE
    loader.ofs.push(ofRecord('OF3', 'SE', 10, 3))
    loader.stocks.set('C1', { stockPhysique: 0, stockAlloue: 0 })

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'rupture_matiere')
    const se = r.tree.shorts[0]
    assert.equal(se.covering[0].numOf, 'OF3')
    assert.equal(se.covering[0].statut, 3)
    const seNode = se.covering[0].node
    assert.equal(seNode.source, 'NOMENCLATURE') // suggestion → repli théorique
    assert.equal(seNode.shorts[0].article, 'C1')
    assert.equal(seNode.shorts[0].status, 'rupture_matiere')
  })

  test('sous-ensemble sans OF couvrant → sous_ensemble_a_lancer', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'sous_ensemble_a_lancer')
    const se = r.tree.shorts[0]
    assert.equal(se.article, 'SE')
    assert.equal(se.status, 'sous_ensemble_a_lancer')
    assert.equal(se.quantityMissing, 5)
    assert.equal(se.covering.length, 0)
  })

  test('sous-ensemble couvert seulement par une suggestion faisable → à lancer (pas ok)', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    // OF3 = suggestion (statut 3), composants en stock → faisable MAIS pas encore lancée
    loader.ofs.push(ofRecord('OF3', 'SE', 10, 3))
    loader.stocks.set('C1', { stockPhysique: 100, stockAlloue: 0 })

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    // Bug corrigé : une suggestion faisable ne « couvre » pas — c'est l'action à faire.
    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'sous_ensemble_a_lancer')
    const se = r.tree.shorts[0]
    assert.equal(se.status, 'sous_ensemble_a_lancer')
    assert.equal(se.covering[0].numOf, 'OF3')
    assert.isTrue(se.covering[0].node.feasible) // la suggestion elle-même est faisable
  })

  test('composant en stock CQ uniquement → qc_a_controler (pas rupture_matiere)', async ({ assert }) => {
    const loader = new MemLoader()
    // stockPhysique = strict + qc (convention adapter), stockQc tracé séparément
    loader.stocks.set('C1', { stockPhysique: 50, stockAlloue: 0, stockQc: 50 }) // 50 en CQ, 0 strict
    loader.mfgmat.set('OF1', [mat('C1', 30)])

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10))

    assert.isFalse(r.feasible)
    assert.equal(r.rootCause, 'qc_a_controler')
    const c1 = r.tree.shorts[0]
    assert.equal(c1.article, 'C1')
    assert.equal(c1.status, 'qc_a_controler')
    assert.equal(c1.stockQc, 50)
    // Stock strict = physique - qc = 0, donc quantityMissing = 30
    assert.equal(c1.quantityMissing, 30)
  })

  test('cycle A→B→A → bloqué + alerte cycle (pas de boucle infinie)', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('A', mkBom('A', [{ article: 'B', qty: 1, type: 'FABRIQUE' }]))
    loader.nomenclatures.set('B', mkBom('B', [{ article: 'A', qty: 1, type: 'FABRIQUE' }]))
    loader.mfgmat.set('OF1', [mat('B', 1)]) // A consomme B
    loader.ofs.push(ofRecord('OF1', 'A', 1, 2), ofRecord('OF2', 'B', 1, 2))
    loader.mfgmat.set('OF2', [mat('A', 1)]) // B consomme A → remonte vers A (OF1)

    const r = await diagnose(loader, ofRecord('OF1', 'A', 1))

    assert.isFalse(r.feasible)
    assert.isTrue(r.alerts.some((a) => a.includes('Cycle detecte')))
  })

  test('DAG diamant : un OF partagé par 2 branches n’est diagnostiqué qu’une fois (#55)', async ({ assert }) => {
    // PF consomme SE1 et SE2, qui consomment tous deux le même sous-ensemble SUB.
    // Sans mémo par OF, OF_SUB serait re-descendu par CHAQUE branche → explosion
    // (branching^depth) → « tourne dans le vide ». Le mémo doit le diagnostiquer 1×.
    const loader = new MemLoader()
    loader.nomenclatures.set('SE1', mkBom('SE1', [{ article: 'SUB', qty: 1, type: 'FABRIQUE' }]))
    loader.nomenclatures.set('SE2', mkBom('SE2', [{ article: 'SUB', qty: 1, type: 'FABRIQUE' }]))
    loader.nomenclatures.set('SUB', mkBom('SUB', [{ article: 'LEAF', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE1', 1), mat('SE2', 1)])
    loader.mfgmat.set('OF_SE1', [mat('SUB', 1)])
    loader.mfgmat.set('OF_SE2', [mat('SUB', 1)])
    loader.mfgmat.set('OF_SUB', [mat('LEAF', 1)])
    loader.ofs.push(
      ofRecord('OF_SE1', 'SE1', 1),
      ofRecord('OF_SE2', 'SE2', 1),
      ofRecord('OF_SUB', 'SUB', 1),
    )
    // Tous à 0 de stock → tout manque, LEAF acheté = rupture matière au fond.

    const calls = new Map<string, number>()
    const orig = loader.getMfgmat.bind(loader)
    loader.getMfgmat = async (n: string) => {
      calls.set(n, (calls.get(n) ?? 0) + 1)
      return orig(n)
    }

    const r = await diagnose(loader, ofRecord('OF1', 'PF', 1))

    // OF_SUB atteint par les 2 branches (SE1 et SE2) mais diagnostiqué une seule fois.
    assert.equal(calls.get('OF_SUB'), 1)
    assert.equal(r.rootCause, 'rupture_matiere')
  })

  test('profondeur max dépassée → bloqué + alerte profondeur', async ({ assert }) => {
    const loader = new MemLoader()
    loader.nomenclatures.set('SE', mkBom('SE', [{ article: 'C1', qty: 1 }]))
    loader.mfgmat.set('OF1', [mat('SE', 5)])
    loader.ofs.push(ofRecord('OF2', 'SE', 10, 2))
    loader.mfgmat.set('OF2', [mat('C1', 2)])
    loader.stocks.set('C1', { stockPhysique: 100, stockAlloue: 0 })

    // maxDepth = 0 : OF2 (profondeur 1) → garde profondeur déclenchée.
    const r = await diagnose(loader, ofRecord('OF1', 'PF', 10), 0)

    assert.isFalse(r.feasible)
    assert.isTrue(r.alerts.some((a) => a.includes('Profondeur max')))
  })
})
