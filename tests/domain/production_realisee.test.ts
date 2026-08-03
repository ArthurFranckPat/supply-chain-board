import { test } from '@japa/runner'
import {
  estPosteProduction,
  heuresConvertiesParJour,
  palettesRealisees,
  productionParMois,
  productionParSemaine,
  productionRealiseeParJour,
  selectionDerniereOperationQuantifiee,
  syntheseParOf,
  tronquerPoste,
  type PointageTrk,
} from '#app/domain/production_realisee'

/**
 * Production réalisée d'un poste (#119, lot 2) — domaine pur.
 *
 * Cœur testé : OPENUM max quantifié, heures tous passages, pas d'exclusion
 * rebut, troncature / exclusion alphabétique, palettes après sommation.
 */

function pointage(over: Partial<PointageTrk> = {}): PointageTrk {
  return {
    numOf: 'OF-1',
    openum: 10,
    iptdat: '2026-07-01',
    cplwst: 'PP_093',
    cplqty: 100,
    opetim: 2,
    settim: 0,
    rebut: false,
    itmrefOf: 'ART-1',
    ...over,
  }
}

test.group('identité poste', () => {
  test('tronque à 6 caractères — PP_093S → PP_093', ({ assert }) => {
    assert.equal(tronquerPoste('PP_093S'), 'PP_093')
    assert.equal(tronquerPoste('PP_093'), 'PP_093')
  })

  test('exclut les codes alphabétiques, accepte PP_/PE_ numériques', ({ assert }) => {
    assert.isTrue(estPosteProduction('PP_093'))
    assert.isTrue(estPosteProduction('PP_093S')) // après troncature
    assert.isTrue(estPosteProduction('PE_123'))
    assert.isFalse(estPosteProduction('PP_MECA'))
    assert.isFalse(estPosteProduction('PE_PROD'))
    assert.isFalse(estPosteProduction('PP_ELEC'))
  })
})

test.group('selectionDerniereOperationQuantifiee', () => {
  test('une seule opération quantifiée est sélectionnée', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([pointage()])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 10]])
  })

  test('deux opérations quantifiées : le plus grand OPENUM gagne, pas la date', ({ assert }) => {
    // Régularisation tardive sur l'op amont (10) : l'OPENUM 20 reste retenu.
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 20, iptdat: '2026-07-01' }),
      pointage({ openum: 10, iptdat: '2026-07-05' }),
    ])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 20]])
  })

  test('à égalité, OPENUM le plus élevé', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 30, iptdat: '2026-07-05' }),
      pointage({ openum: 10, iptdat: '2026-07-05' }),
    ])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 30]])
  })

  test('le même OF sur deux postes reste deux histoires distinctes', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, cplwst: 'PP_093' }),
      pointage({ openum: 20, cplwst: 'PP_114', iptdat: '2026-07-02' }),
    ])
    assert.sameDeepMembers(
      [...selection.entries()],
      [
        ['OF-1#PP_093', 10],
        ['OF-1#PP_114', 20],
      ]
    )
  })

  test('un pointage avec rebut QUANTIFIE quand même son opération', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, rebut: true, cplqty: 30 }),
    ])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 10]])
  })

  test('un pointage à quantité nulle ne qualifie pas son opération', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, cplqty: 0, settim: 1.5 }),
    ])
    assert.equal(selection.size, 0)
  })

  test('PP_093S et PP_093 partagent la même identité tronquée', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, cplwst: 'PP_093', cplqty: 50 }),
      pointage({ openum: 20, cplwst: 'PP_093S', cplqty: 80, iptdat: '2026-07-02' }),
    ])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 20]])
  })
})

test.group('productionRealiseeParJour', () => {
  test('les déclarations partielles de la même opération s’additionnent sur leurs jours', ({
    assert,
  }) => {
    const mailles = productionRealiseeParJour([
      pointage({ iptdat: '2026-07-01', cplqty: 50, opetim: 1 }),
      pointage({ iptdat: '2026-07-02', cplqty: 50, opetim: 1 }),
    ])

    assert.deepEqual(mailles, [
      { date: '2026-07-01', qty: 50, heures: 1, dontHeuresReglage: 0 },
      { date: '2026-07-02', qty: 50, heures: 1, dontHeuresReglage: 0 },
    ])
  })

  test('deux opérations : pièces une fois, heures de TOUS les passages', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 10, iptdat: '2026-07-01', cplqty: 100, opetim: 5 }),
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 100, opetim: 2 }),
    ])

    // Quantité : op 20 seule. Heures : 5 + 2.
    assert.deepEqual(mailles, [
      { date: '2026-07-01', qty: 0, heures: 5, dontHeuresReglage: 0 },
      { date: '2026-07-05', qty: 100, heures: 2, dontHeuresReglage: 0 },
    ])
  })

  test('le pointage de réglage pur de l’opération sélectionnée compte ses heures', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 0, opetim: 0, settim: 1.5 }),
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 100, opetim: 4, settim: 0 }),
    ])

    assert.deepEqual(mailles, [
      { date: '2026-07-05', qty: 100, heures: 5.5, dontHeuresReglage: 1.5 },
    ])
  })

  test('réglage pur sans production : heures comptées, quantité nulle (#119)', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 10, cplqty: 0, opetim: 0, settim: 2 }),
    ])
    assert.deepEqual(mailles, [{ date: '2026-07-01', qty: 0, heures: 2, dontHeuresReglage: 2 }])
  })

  test('un pointage avec rebut garde sa quantité et ses heures', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 30, rebut: true, opetim: 1 }),
      pointage({ openum: 10, iptdat: '2026-07-01', cplqty: 100, opetim: 3 }),
    ])

    // Op 20 (OPENUM max) porte la qty ; heures des deux passages.
    assert.deepEqual(mailles, [
      { date: '2026-07-01', qty: 0, heures: 3, dontHeuresReglage: 0 },
      { date: '2026-07-05', qty: 30, heures: 1, dontHeuresReglage: 0 },
    ])
  })

  test('les codes alphabétiques sont exclus des agrégats', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ cplwst: 'PP_MECA', cplqty: 999, opetim: 9 }),
      pointage({ cplwst: 'PP_093', cplqty: 100, opetim: 2 }),
    ])
    assert.deepEqual(mailles, [{ date: '2026-07-01', qty: 100, heures: 2, dontHeuresReglage: 0 }])
  })

  test('les mailles s’agrègent entre OF et trient par date', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ numOf: 'OF-2', iptdat: '2026-07-03', cplqty: 40, opetim: 1 }),
      pointage({ numOf: 'OF-1', iptdat: '2026-07-01', cplqty: 60, opetim: 2 }),
      pointage({ numOf: 'OF-1', iptdat: '2026-07-03', cplqty: 10, opetim: 0.5 }),
    ])

    assert.deepEqual(mailles, [
      { date: '2026-07-01', qty: 60, heures: 2, dontHeuresReglage: 0 },
      { date: '2026-07-03', qty: 50, heures: 1.5, dontHeuresReglage: 0 },
    ])
  })
})

test.group('heuresConvertiesParJour', () => {
  test('la quantité passe en heures via la cadence de gamme', ({ assert }) => {
    const parJour = heuresConvertiesParJour(
      [pointage({ iptdat: '2026-07-01', cplqty: 150 })],
      () => 100 // 100 unités/heure → 150 pièces = 1,5 h
    )
    assert.deepEqual([...parJour.entries()], [['2026-07-01', 1.5]])
  })

  test('article inconnu ou cadence absente : zéro heure, jamais une estimation', ({ assert }) => {
    const sansArticle = heuresConvertiesParJour([pointage({ itmrefOf: null })], () => 100)
    const sansCadence = heuresConvertiesParJour([pointage()], () => null)

    assert.equal(sansArticle.size, 0)
    assert.equal(sansCadence.size, 0)
  })

  test('la même règle de sélection s’applique — pas de conversion double', ({ assert }) => {
    const parJour = heuresConvertiesParJour(
      [
        pointage({ openum: 10, iptdat: '2026-07-01', cplqty: 100 }),
        pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 100 }),
      ],
      () => 50
    )
    assert.deepEqual([...parJour.entries()], [['2026-07-05', 2]])
  })

  test('le rebut reste converti (quantité bonne du pointage)', ({ assert }) => {
    const parJour = heuresConvertiesParJour([pointage({ rebut: true, cplqty: 100 })], () => 100)
    assert.deepEqual([...parJour.entries()], [['2026-07-01', 1]])
  })
})

test.group('productionParMois', () => {
  test('agrège les mailles jour par mois et trie croissant', ({ assert }) => {
    const mois = productionParMois([
      { date: '2026-03-05', qty: 10, heures: 1, dontHeuresReglage: 0 },
      { date: '2026-02-28', qty: 20, heures: 2, dontHeuresReglage: 1 },
      { date: '2026-03-01', qty: 5, heures: 0.5, dontHeuresReglage: 0.5 },
    ])

    assert.deepEqual(mois, [
      { date: '2026-02', qty: 20, heures: 2, dontHeuresReglage: 1 },
      { date: '2026-03', qty: 15, heures: 1.5, dontHeuresReglage: 0.5 },
    ])
  })

  test('vide en entrée → vide en sortie', ({ assert }) => {
    assert.deepEqual(productionParMois([]), [])
  })
})

test.group('productionParSemaine', () => {
  test('agrège par lundi ISO et garde les heures', ({ assert }) => {
    const semaines = productionParSemaine([
      { date: '2026-03-02', qty: 10, heures: 1, dontHeuresReglage: 0 },
      { date: '2026-03-05', qty: 5, heures: 2, dontHeuresReglage: 1 },
      { date: '2026-02-25', qty: 7, heures: 3, dontHeuresReglage: 0 },
    ])

    assert.deepEqual(semaines, [
      { date: '2026-02-23', qty: 7, heures: 3, dontHeuresReglage: 0 },
      { date: '2026-03-02', qty: 15, heures: 3, dontHeuresReglage: 1 },
    ])
  })
})

test.group('syntheseParOf', () => {
  test('qty = op sélectionnée, heures = tous passages', ({ assert }) => {
    const synthese = syntheseParOf([
      pointage({ numOf: 'OF-1', openum: 10, iptdat: '2026-07-01', cplqty: 100, opetim: 5 }),
      pointage({ numOf: 'OF-1', openum: 20, iptdat: '2026-07-05', cplqty: 40, opetim: 2 }),
      pointage({ numOf: 'OF-1', openum: 20, iptdat: '2026-07-06', cplqty: 60, opetim: 3 }),
    ])

    assert.lengthOf(synthese, 1)
    const of = synthese[0]
    assert.equal(of.numOf, 'OF-1')
    assert.equal(of.qty, 100) // 40 + 60 sur l'opération 20
    assert.equal(of.heures, 10) // 5 + 2 + 3
    assert.deepEqual(of.joursPointes, ['2026-07-01', '2026-07-05', '2026-07-06'])
    assert.equal(of.premierJour, '2026-07-01')
    assert.equal(of.dernierJour, '2026-07-06')
  })

  test('réglage pur : l’OF apparaît avec quantité nulle mais ses heures', ({ assert }) => {
    const synthese = syntheseParOf([pointage({ numOf: 'OF-2', cplqty: 0, opetim: 0, settim: 2 })])
    assert.lengthOf(synthese, 1)
    assert.equal(synthese[0].qty, 0)
    assert.equal(synthese[0].heures, 2)
  })

  test('le rebut reste dans la synthèse', ({ assert }) => {
    const synthese = syntheseParOf([
      pointage({ numOf: 'OF-3', rebut: true, cplqty: 50, opetim: 1 }),
    ])
    assert.lengthOf(synthese, 1)
    assert.equal(synthese[0].qty, 50)
    assert.equal(synthese[0].heures, 1)
  })
})

test.group('palettesRealisees', () => {
  const coef = (article: string) => (article === 'ART-P' ? 500 : null)

  test('somme puis convertit une fois — pas de ceil par pointage', ({ assert }) => {
    // 4× 100 = 400 US → ceil(400/500) = 1 palette, pas 4× ceil(100/500) = 4.
    const r = palettesRealisees(
      [
        pointage({ numOf: 'OF-1', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-2', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-3', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-4', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
      ],
      coef
    )
    assert.deepEqual(r.parJour, [{ date: '2026-03-02', palettes: 1 }])
  })

  test('convertit via calcPalettes, maille jour/semaine/mois', ({ assert }) => {
    const r = palettesRealisees(
      [
        pointage({ numOf: 'OF-1', iptdat: '2026-03-02', cplqty: 1200, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-2', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
      ],
      coef
    )
    // 1300/500 → ceil = 3 palettes (somme puis une conversion).
    assert.deepEqual(r.parJour, [{ date: '2026-03-02', palettes: 3 }])
    assert.deepEqual(r.parMois, [{ date: '2026-03', palettes: 3 }])
  })

  test('article sans coefficient → la maille vaut null, pas zéro', ({ assert }) => {
    const r = palettesRealisees(
      [pointage({ numOf: 'OF-1', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-S' })],
      coef
    )
    assert.deepEqual(r.parJour, [{ date: '2026-03-02', palettes: null }])
  })

  test('maille mixte : le convertible est compté', ({ assert }) => {
    const r = palettesRealisees(
      [
        pointage({ numOf: 'OF-1', iptdat: '2026-03-02', cplqty: 500, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-2', iptdat: '2026-03-02', cplqty: 999, itmrefOf: 'ART-S' }),
      ],
      coef
    )
    assert.deepEqual(r.parJour, [{ date: '2026-03-02', palettes: 1 }])
  })

  test('la sélection OPENUM max s’applique aussi aux palettes', ({ assert }) => {
    const r = palettesRealisees(
      [
        pointage({
          numOf: 'OF-1',
          openum: 10,
          iptdat: '2026-03-02',
          cplqty: 500,
          itmrefOf: 'ART-P',
        }),
        pointage({
          numOf: 'OF-1',
          openum: 20,
          iptdat: '2026-03-05',
          cplqty: 1000,
          itmrefOf: 'ART-P',
        }),
      ],
      coef
    )
    assert.deepEqual(r.parJour, [{ date: '2026-03-05', palettes: 2 }])
  })
})
