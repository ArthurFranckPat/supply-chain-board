import { test } from '@japa/runner'
import { buildMaterialShortageSummary } from '#app/domain/material_shortage_summary'
import type { OrderImpactResult } from '#app/domain/order_impacts'
import type { ReceptionRecord } from '#app/domain/recursive_checker'
import type { Article } from '#app/domain/models/article'

/**
 * Pivot COMPOSANT du séquenceur : ce que le panneau « Matières manquantes » promet.
 * Ce qui est verrouillé ici — le reste est de la présentation :
 *  - le périmètre vient du client (OF visibles), pas de la fenêtre serveur ;
 *  - v1 = composants ACHETÉS seulement, et les OF ainsi écartés sont COMPTÉS ;
 *  - la couverture se juge sur le CUMUL des réceptions vs la date de besoin la plus proche.
 */

const article = (code: string, supplyType: 'ACHAT' | 'FABRICATION', desc = ''): Article => ({
  code,
  description: desc,
  category: 'ACH',
  supplyType,
  reorderDelay: null,
  productFamily: null,
  pmp: null,
  economicLot: null,
  unitStock: null,
  unitPurchase: null,
  purchaseToStockRatio: 1,
  packagings: [],
})

const catalogue = new Map<string, Article>([
  ['PF1', article('PF1', 'FABRICATION', 'Caisson')],
  ['PF2', article('PF2', 'FABRICATION', 'Caisson 2')],
  ['ACH1', article('ACH1', 'ACHAT', 'Moteur')],
  ['SE1', article('SE1', 'FABRICATION', 'Platine')],
])

const reception = (id: string, article_: string, qty: number, iso: string): ReceptionRecord => ({
  id,
  article: article_,
  supplier: `FOU-${id}`,
  quantity: qty,
  date: new Date(`${iso}T00:00:00`),
})

const result = (
  ofs: OrderImpactResult['ofs']
): Parameters<typeof buildMaterialShortageSummary>[0] =>
  ({ orders: [], ofs, window: { from: '', to: '' } }) as unknown as OrderImpactResult

test.group('buildMaterialShortageSummary', () => {
  test('somme les manques par composant sur les seuls OF du périmètre', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 5 },
      },
      {
        numOf: 'OF2',
        article: 'PF2',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 3 },
      },
      // Hors écran : ne doit ni compter ni gonfler la quantité manquante.
      {
        numOf: 'OF9',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 99 },
      },
    ])
    const { rows, stats } = buildMaterialShortageSummary(
      r,
      [
        { numOf: 'OF1', besoinIso: '2026-09-20' },
        { numOf: 'OF2', besoinIso: '2026-09-18' },
      ],
      new Map(),
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].component, 'ACH1')
    assert.equal(rows[0].qteManquante, 8)
    assert.equal(rows[0].ofs.length, 2)
    // Date de besoin = la plus proche des OF bloqués, et les OF sont triés par urgence.
    assert.equal(rows[0].besoinIso, '2026-09-18')
    assert.equal(rows[0].ofs[0].numOf, 'OF2')
    assert.equal(stats.nbOfBloques, 2)
  })

  test('écarte les composants fabriqués et compte les OF ainsi sortis du listing', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { SE1: 4 },
      },
      {
        numOf: 'OF2',
        article: 'PF2',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 2 },
      },
    ])
    const { rows, stats } = buildMaterialShortageSummary(
      r,
      [
        { numOf: 'OF1', besoinIso: '2026-09-20' },
        { numOf: 'OF2', besoinIso: '2026-09-20' },
      ],
      new Map(),
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.deepEqual(
      rows.map((x) => x.component),
      ['ACH1']
    )
    assert.equal(stats.nbOfBloques, 2)
    assert.equal(stats.nbOfHorsPerimetre, 1)
  })

  test('un OF faisable n’entre jamais dans le pivot', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: true,
        statutNum: 1,
        missingComponents: { ACH1: 5 },
      },
    ])
    const { rows, stats } = buildMaterialShortageSummary(
      r,
      [{ numOf: 'OF1', besoinIso: '2026-09-20' }],
      new Map(),
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.lengthOf(rows, 0)
    assert.equal(stats.nbOfBloques, 0)
  })

  test('couverture = cumul des réceptions, comparé à la date de besoin', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 10 },
      },
    ])
    const receptions = new Map<string, ReceptionRecord[]>([
      [
        'ACH1',
        [
          reception('PO2', 'ACH1', 6, '2026-09-19'),
          // Volontairement hors ordre : le pivot doit trier avant de cumuler.
          reception('PO1', 'ACH1', 4, '2026-09-16'),
        ],
      ],
    ])
    const { rows } = buildMaterialShortageSummary(
      r,
      [{ numOf: 'OF1', besoinIso: '2026-09-25' }],
      receptions,
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.equal(rows[0].qteAttendue, 10)
    assert.equal(rows[0].fournisseur, 'FOU-PO1')
    // Ni PO1 (4) ni PO2 (6) ne suffisent seules : c'est leur cumul qui solde le manque.
    assert.equal(rows[0].dateCouvertureIso, '2026-09-19')
    assert.equal(rows[0].verdict, 'couvert')
    assert.equal(rows[0].joursRetard, 0)
  })

  test('couverture postérieure au besoin = retard daté', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 10 },
      },
    ])
    const receptions = new Map<string, ReceptionRecord[]>([
      ['ACH1', [reception('PO1', 'ACH1', 10, '2026-09-25')]],
    ])
    const { rows, stats } = buildMaterialShortageSummary(
      r,
      [{ numOf: 'OF1', besoinIso: '2026-09-20' }],
      receptions,
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.equal(rows[0].verdict, 'retard')
    assert.equal(rows[0].joursRetard, 5)
    assert.equal(stats.nbRetard, 1)
  })

  test('réception attendue dans le passé : couverte sur le papier, en retard dans l’atelier', ({
    assert,
  }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 10 },
      },
    ])
    const receptions = new Map<string, ReceptionRecord[]>([
      ['ACH1', [reception('PO1', 'ACH1', 10, '2026-09-04')]],
    ])
    const { rows } = buildMaterialShortageSummary(
      r,
      [{ numOf: 'OF1', besoinIso: '2026-09-20' }],
      receptions,
      catalogue,
      { todayIso: '2026-09-14' }
    )
    assert.isTrue(rows[0].receptions[0].enRetard)
    assert.equal(rows[0].verdict, 'retard')
    assert.equal(rows[0].joursRetard, 10)
  })

  test('sans réception ouverte : sans couverture, et trié en tête', ({ assert }) => {
    const r = result([
      {
        numOf: 'OF1',
        article: 'PF1',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH1: 10 },
      },
      {
        numOf: 'OF2',
        article: 'PF2',
        feasible: false,
        statutNum: 1,
        missingComponents: { ACH2: 2 },
      },
    ])
    const cat = new Map(catalogue)
    cat.set('ACH2', article('ACH2', 'ACHAT', 'Vis'))
    const receptions = new Map<string, ReceptionRecord[]>([
      ['ACH2', [reception('PO1', 'ACH2', 5, '2026-09-15')]],
    ])
    const { rows, stats } = buildMaterialShortageSummary(
      r,
      [
        { numOf: 'OF1', besoinIso: '2026-09-30' },
        { numOf: 'OF2', besoinIso: '2026-09-16' },
      ],
      receptions,
      cat,
      { todayIso: '2026-09-14' }
    )
    // ACH1 est sans couverture : il passe devant ACH2 malgré un besoin plus lointain.
    assert.deepEqual(
      rows.map((x) => x.component),
      ['ACH1', 'ACH2']
    )
    assert.equal(rows[0].verdict, 'sans_couverture')
    assert.equal(rows[0].dateCouvertureIso, null)
    assert.equal(rows[1].verdict, 'couvert')
    assert.equal(stats.nbSansCouverture, 1)
  })
})
