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
  getArticle(a: string) { return this.articles.get(a) }
  getNomenclature(a: string) { return this.nomenclatures.get(a) }
  async getStock(a: string) { return this.stocks.get(a) }
  async getStocks(arts: string[]) {
    const out = new Map<string, StockRecord | undefined>()
    for (const a of arts) out.set(a, this.stocks.get(a))
    return out
  }
  async getReceptions(a: string) { return this.receptions.get(a) ?? [] }
  getAllocationsOf() { return [] }
  getOfsByArticle(article: string, statut?: number) {
    let f = this.ofs.filter((o) => o.article === article)
    if (statut !== undefined) f = f.filter((o) => o.statutNum === statut)
    return f
  }
  async getMfgmat(n: string) { return this.mfgmat.get(n) ?? [] }
}

function buildScenario() {
  const loader = new MemLoader()
  // BOM : SE2261 → CE2204 (×1).
  const bom: Nomenclature = {
    article: 'SE2261', description: 'SE2261',
    components: [{
      parentArticle: 'SE2261', parentDescription: 'SE2261', level: 1,
      componentArticle: 'CE2204', componentDescription: 'CE2204',
      linkQuantity: 1, componentType: 'ACHETE', consumptionNature: 'PROPORTIONNEL',
    } as NomenclatureEntry],
  }
  loader.nomenclatures.set('SE2261', bom)
  // Stock CE2204 : 1 physique, 1 alloué → strict 0.
  loader.stocks.set('CE2204', { stockPhysique: 1, stockAlloue: 1, stockQc: 0 })
  // Réception en retard (02-MAR-26, ~100 j) → hors grace 7 j.
  loader.receptions.set('CE2204', [{
    id: 'CG2501715', article: 'CE2204', supplier: '19001',
    quantity: 61, date: new Date('2026-03-02'),
  }])
  // OF suggestion SE2261 qté 2.
  const of: OfRecord = {
    numOf: 'SGAE10646179195', article: 'SE2261', statutNum: 3,
    qteRestante: 2, dateDebut: undefined, dateFin: new Date('2026-06-22'),
  }
  return { loader, of }
}

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
      'Le checker doit dire RUPTURE (stock strict 0, réception en retard exclue)',
    )
    assert.isFalse(
      verdict.feasible,
      `evaluateMfgFeasibility doit aussi dire RUPTURE (et non indéterminé). ` +
      `Verdict composants : ${JSON.stringify(verdict.materials.find((m) => m.article === 'CE2204'))}`,
    )
  })
})
