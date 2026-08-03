import { test } from '@japa/runner'
import {
  heuresConvertiesParJour,
  palettesRealisees,
  productionParMois,
  productionParSemaine,
  productionRealiseeParJour,
  selectionDerniereOperationQuantifiee,
  syntheseParOf,
  type PointageTrk,
} from '#app/domain/production_realisee'

/**
 * Production réalisée d'un poste (#119, lot 2) — domaine pur.
 *
 * Le cœur testé : la règle de sélection de la DERNIÈRE opération quantifiée par
 * (OF, poste) contre le double comptage des pièces, l'addition des déclarations
 * partielles, l'exclusion du rebut, et le maillage jour.
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

test.group('selectionDerniereOperationQuantifiee', () => {
  test('une seule opération quantifiée est sélectionnée', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([pointage()])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 10]])
  })

  test('deux opérations quantifiées : la plus récente en date gagne', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, iptdat: '2026-07-01' }),
      pointage({ openum: 20, iptdat: '2026-07-05' }),
    ])
    assert.deepEqual([...selection.entries()], [['OF-1#PP_093', 20]])
  })

  test('à égalité de jour, OPENUM le plus élevé — le plus avancé dans la gamme', ({ assert }) => {
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

  test('un pointage de rebut ne qualifie pas son opération', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([pointage({ openum: 10, rebut: true })])
    assert.equal(selection.size, 0)
  })

  test('un pointage à quantité nulle ne qualifie pas son opération', ({ assert }) => {
    const selection = selectionDerniereOperationQuantifiee([
      pointage({ openum: 10, cplqty: 0, settim: 1.5 }),
    ])
    assert.equal(selection.size, 0)
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

  test('deux opérations quantifiées du même OF : pas de double comptage des pièces', ({
    assert,
  }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 10, iptdat: '2026-07-01', cplqty: 100 }),
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 100 }),
    ])

    // Seule l'opération 20 (la dernière) porte la production.
    assert.deepEqual(mailles, [{ date: '2026-07-05', qty: 100, heures: 2, dontHeuresReglage: 0 }])
  })

  test('le pointage de réglage pur de l’opération sélectionnée compte ses heures', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      // Réglage pur sur l'opération 20 : quantité nulle, heures réelles.
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 0, opetim: 0, settim: 1.5 }),
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 100, opetim: 4, settim: 0 }),
    ])

    assert.deepEqual(mailles, [
      { date: '2026-07-05', qty: 100, heures: 5.5, dontHeuresReglage: 1.5 },
    ])
  })

  test('réglage pur sans production : heures comptées, quantité nulle (#119)', ({ assert }) => {
    // Le repli réglage pur : la courbe d'heures ne doit pas perdre un OF venu
    // régler la ligne sans rien produire.
    const mailles = productionRealiseeParJour([
      pointage({ openum: 10, cplqty: 0, opetim: 0, settim: 2 }),
    ])
    assert.deepEqual(mailles, [{ date: '2026-07-01', qty: 0, heures: 2, dontHeuresReglage: 2 }])
  })

  test('les pointages avec rebut sont exclus — quantité, heures, sélection', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 20, iptdat: '2026-07-05', cplqty: 30, rebut: true, opetim: 1 }),
      pointage({ openum: 10, iptdat: '2026-07-01', cplqty: 100, opetim: 3 }),
    ])

    // L'opération 20 rebutée ne peut pas être sélectionnée : la production reste
    // portée par l'opération 10.
    assert.deepEqual(mailles, [{ date: '2026-07-01', qty: 100, heures: 3, dontHeuresReglage: 0 }])
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

  test('le rebut est exclu de la conversion aussi', ({ assert }) => {
    const parJour = heuresConvertiesParJour([pointage({ rebut: true })], () => 100)
    assert.equal(parJour.size, 0)
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
    // 2026-03-02 est un lundi ; 2026-03-05 (jeudi) tombe la même semaine.
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
  test('un OF = une ligne, opération sélectionnée seulement', ({ assert }) => {
    const synthese = syntheseParOf([
      // OF-1, deux opérations : la 20 (plus récente, quantifiée) est retenue.
      pointage({ numOf: 'OF-1', openum: 10, iptdat: '2026-07-01', cplqty: 100, opetim: 5 }),
      pointage({ numOf: 'OF-1', openum: 20, iptdat: '2026-07-05', cplqty: 40, opetim: 2 }),
      pointage({ numOf: 'OF-1', openum: 20, iptdat: '2026-07-06', cplqty: 60, opetim: 3 }),
    ])

    assert.lengthOf(synthese, 1)
    const of = synthese[0]
    assert.equal(of.numOf, 'OF-1')
    assert.equal(of.qty, 100) // 40 + 60 sur l'opération 20 seulement
    assert.equal(of.heures, 5) // 2 + 3
    assert.deepEqual(of.joursPointes, ['2026-07-05', '2026-07-06'])
    assert.equal(of.premierJour, '2026-07-05')
    assert.equal(of.dernierJour, '2026-07-06')
  })

  test('réglage pur : l’OF apparaît avec quantité nulle mais ses heures', ({ assert }) => {
    const synthese = syntheseParOf([pointage({ numOf: 'OF-2', cplqty: 0, opetim: 0, settim: 2 })])
    assert.lengthOf(synthese, 1)
    assert.equal(synthese[0].qty, 0)
    assert.equal(synthese[0].heures, 2)
  })

  test('le rebut est exclu de la synthèse', ({ assert }) => {
    const synthese = syntheseParOf([pointage({ numOf: 'OF-3', rebut: true })])
    assert.lengthOf(synthese, 0)
  })
})

test.group('palettesRealisees', () => {
  // Article ART-P : 500 US par palette. ART-S : pas de coefficient.
  const coef = (article: string) => (article === 'ART-P' ? 500 : null)

  test('convertit via calcPalettes, maille jour/semaine/mois', ({ assert }) => {
    const r = palettesRealisees(
      [
        pointage({ numOf: 'OF-1', iptdat: '2026-03-02', cplqty: 1200, itmrefOf: 'ART-P' }),
        pointage({ numOf: 'OF-2', iptdat: '2026-03-02', cplqty: 100, itmrefOf: 'ART-P' }),
      ],
      coef
    )
    // 1200/500 → 3 pal ; 100/500 → 1 pal (arrondi supérieur, calcPalettes).
    assert.deepEqual(r.parJour, [{ date: '2026-03-02', palettes: 4 }])
    assert.deepEqual(r.parMois, [{ date: '2026-03', palettes: 4 }])
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

  test('la sélection dernière opération s’applique aussi aux palettes', ({ assert }) => {
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
    // Seule l'opération 20 compte : 1000/500 = 2 pal, pas 3.
    assert.deepEqual(r.parJour, [{ date: '2026-03-05', palettes: 2 }])
  })
})
