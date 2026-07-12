import { test } from '@japa/runner'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature, NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  evaluateRuptures,
  buildOfSupply,
  directMissing,
  type RuptureDataset,
  type RuptureOfInput,
} from '#app/domain/rupture-engine'

const CHECK = new Date('2026-07-07T00:00:00')

function mkArticle(code: string, category: string, supplyType: 'ACHAT' | 'FABRICATION'): Article {
  return {
    code, description: code, category, supplyType,
    reorderDelay: 0, productFamily: null, pmp: null, economicLot: null,
    unitStock: null, unitPurchase: null, purchaseToStockRatio: 1, packagings: [],
  }
}

function mkEntry(
  parent: string, comp: string, qty: number, type: 'ACHETE' | 'FABRIQUE',
): NomenclatureEntry {
  return {
    parentArticle: parent, parentDescription: parent, level: 1,
    componentArticle: comp, componentDescription: comp,
    linkQuantity: qty, componentType: type, consumptionNature: 'PROPORTIONNEL',
  }
}

function mkBom(article: string, entries: NomenclatureEntry[]): [string, Nomenclature] {
  return [article, { article, description: article, components: entries }]
}

function mkOf(
  numOf: string, article: string, qte: number, statutNum: number, dateBesoin: Date | null = CHECK,
): RuptureOfInput {
  return { numOf, article, qteRestante: qte, statutNum, dateBesoin }
}

test.group('rupture-engine — besoins (règles 1-3)', () => {
  test('MFGMAT prioritaire : la nomenclature est ignorée, ALLQTY créditée (règles 1+3)', ({ assert }) => {
    // La BOM théorique de PF réclame SE (introuvable) — si elle était lue, verdict rupture.
    const dataset: RuptureDataset = {
      articles: new Map([
        ['PF', mkArticle('PF', 'PF', 'FABRICATION')],
        ['C1', mkArticle('C1', 'MP', 'ACHAT')],
      ]),
      nomenclatures: new Map([mkBom('PF', [mkEntry('PF', 'SE', 1, 'FABRIQUE')])]),
      stockNet: new Map([['C1', 6]]),
    }
    const of: RuptureOfInput = {
      ...mkOf('OF1', 'PF', 10, 2),
      materials: [{ article: 'C1', remaining: 10, allocated: 4 }],
    }

    const verdict = evaluateRuptures([of], dataset, 'photo').get('OF1')!
    assert.equal(verdict.source, 'MFGMAT')
    assert.isTrue(verdict.feasible, JSON.stringify(verdict.missing))
    assert.deepEqual(verdict.missing, {})
  })

  test('sans MFGMAT ni nomenclature → aucun besoin, faisable (source AUCUNE)', ({ assert }) => {
    const dataset: RuptureDataset = {
      articles: new Map([['X', mkArticle('X', 'MP', 'ACHAT')]]),
      nomenclatures: new Map(),
      stockNet: new Map(),
    }
    const verdict = evaluateRuptures([mkOf('OF1', 'X', 5, 2)], dataset, 'photo').get('OF1')!
    assert.equal(verdict.source, 'AUCUNE')
    assert.isTrue(verdict.feasible)
  })

  test('allocation ERP créditée en déduction partielle sur la descente BOM (règle 3)', ({ assert }) => {
    const dataset: RuptureDataset = {
      articles: new Map([
        ['PF', mkArticle('PF', 'PF', 'FABRICATION')],
        ['C1', mkArticle('C1', 'MP', 'ACHAT')],
      ]),
      nomenclatures: new Map([mkBom('PF', [mkEntry('PF', 'C1', 1, 'ACHETE')])]),
      stockNet: new Map([['C1', 0]]),
      allocationsByOf: new Map([['OF1', new Map([['C1', 41]])]]),
    }
    const verdict = evaluateRuptures([mkOf('OF1', 'PF', 200, 2)], dataset, 'photo').get('OF1')!
    assert.isFalse(verdict.feasible)
    assert.deepEqual(verdict.missing, { C1: 159 })
  })
})

test.group('rupture-engine — sous-ensembles fabriqués', () => {
  test('couverture OF plafonnée à la quantité + descente feuilles du reliquat', ({ assert }) => {
    // PF → SE ×1 ; SE → C ×1. Stock SE 5, C 2 ; production OF de SE = 20.
    // Besoin 30 → SE dispo 25 → manque 5 ; descente : C dispo 2 → manque 3.
    const dataset: RuptureDataset = {
      articles: new Map([
        ['PF', mkArticle('PF', 'PF', 'FABRICATION')],
        ['SE', mkArticle('SE', 'SF', 'FABRICATION')],
        ['C', mkArticle('C', 'MP', 'ACHAT')],
      ]),
      nomenclatures: new Map([
        mkBom('PF', [mkEntry('PF', 'SE', 1, 'FABRIQUE')]),
        mkBom('SE', [mkEntry('SE', 'C', 1, 'ACHETE')]),
      ]),
      stockNet: new Map([['SE', 5], ['C', 2]]),
      ofSupply: new Map([['SE', 20]]),
    }
    const verdict = evaluateRuptures([mkOf('OF1', 'PF', 30, 2)], dataset, 'photo').get('OF1')!

    assert.isFalse(verdict.feasible)
    assert.deepEqual(verdict.missing, { SE: 5, C: 3 })
    const se = verdict.missingDetail.find((m) => m.article === 'SE')!
    const c = verdict.missingDetail.find((m) => m.article === 'C')!
    assert.isTrue(se.fabricated)
    assert.equal(se.available, 25)
    assert.equal(se.depth, 0)
    assert.isFalse(c.fabricated)
    assert.equal(c.depth, 1)
    // Forme consommée par les vues : besoins directs seulement (parité programme/proactif).
    assert.deepEqual(directMissing(verdict), { SE: 5 })
  })

  test('buildOfSupply agrège les qteRestante par article produit', ({ assert }) => {
    const supply = buildOfSupply([
      { article: 'SE', qteRestante: 12 },
      { article: 'SE', qteRestante: 8 },
      { article: 'PF', qteRestante: 3 },
      { article: 'X', qteRestante: 0 },
    ])
    assert.deepEqual([...supply.entries()], [['SE', 20], ['PF', 3]])
  })
})

test.group('rupture-engine — contention (règle 5)', () => {
  const contentionDataset = (): RuptureDataset => ({
    articles: new Map([
      ['P1', mkArticle('P1', 'PF', 'FABRICATION')],
      ['P2', mkArticle('P2', 'PF', 'FABRICATION')],
      ['C', mkArticle('C', 'MP', 'ACHAT')],
    ]),
    nomenclatures: new Map([
      mkBom('P1', [mkEntry('P1', 'C', 1, 'ACHETE')]),
      mkBom('P2', [mkEntry('P2', 'C', 1, 'ACHETE')]),
    ]),
    stockNet: new Map([['C', 50]]),
  })

  test('consommation séquentielle par date besoin : le second voit le stock réduit', ({ assert }) => {
    const ofs = [
      mkOf('OF2', 'P2', 40, 2, new Date('2026-07-05')),
      mkOf('OF1', 'P1', 40, 2, new Date('2026-07-01')),
    ]
    const verdicts = evaluateRuptures(ofs, contentionDataset(), 'contention')

    const first = verdicts.get('OF1')!
    assert.isTrue(first.feasible)
    assert.deepEqual(first.consumed, { C: 40 })

    const second = verdicts.get('OF2')!
    assert.isFalse(second.feasible)
    assert.deepEqual(second.missing, { C: 30 })
    assert.deepEqual(second.consumed, {})

    // Mode photo : chaque OF évalué seul → les deux passent.
    const photo = evaluateRuptures(ofs, contentionDataset(), 'photo')
    assert.isTrue(photo.get('OF1')!.feasible)
    assert.isTrue(photo.get('OF2')!.feasible)
    assert.deepEqual(photo.get('OF1')!.consumed, {})
  })

  test('OF ferme : manque visible, faisable quand même, et il CONSOMME (il va tourner)', ({ assert }) => {
    const dataset = contentionDataset()
    dataset.stockNet.set('C', 30)
    const ofs = [
      mkOf('FERME', 'P1', 40, 1, new Date('2026-07-01')),
      mkOf('OF2', 'P2', 10, 2, new Date('2026-07-05')),
    ]
    const verdicts = evaluateRuptures(ofs, dataset, 'contention')

    const firm = verdicts.get('FERME')!
    assert.isTrue(firm.feasible, 'ferme = affermi malgré rupture (règle 3)')
    assert.deepEqual(firm.missing, { C: 10 }, 'le manque résiduel reste visible')
    assert.deepEqual(firm.consumed, { C: 30 }, 'consomme ce qui est disponible')

    const second = verdicts.get('OF2')!
    assert.isFalse(second.feasible)
    assert.deepEqual(second.missing, { C: 10 })
  })

  test('OF non ferme en rupture ne consomme rien', ({ assert }) => {
    const dataset = contentionDataset()
    dataset.stockNet.set('C', 10)
    const ofs = [
      mkOf('OF1', 'P1', 40, 2, new Date('2026-07-01')),
      mkOf('OF2', 'P2', 10, 2, new Date('2026-07-05')),
    ]
    const verdicts = evaluateRuptures(ofs, dataset, 'contention')

    assert.isFalse(verdicts.get('OF1')!.feasible)
    assert.deepEqual(verdicts.get('OF1')!.consumed, {})
    // Le stock n'a pas été consommé par l'OF bloqué → OF2 passe.
    assert.isTrue(verdicts.get('OF2')!.feasible)
    assert.deepEqual(verdicts.get('OF2')!.consumed, { C: 10 })
  })
})
