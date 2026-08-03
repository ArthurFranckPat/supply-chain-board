import { test } from '@japa/runner'
import {
  heuresConvertiesParJour,
  productionRealiseeParJour,
  selectionDerniereOperationQuantifiee,
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

  test('un OF sans aucune opération quantifiée ne porte ni quantité ni heures', ({ assert }) => {
    const mailles = productionRealiseeParJour([
      pointage({ openum: 10, cplqty: 0, opetim: 0, settim: 2 }),
    ])
    assert.deepEqual(mailles, [])
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
