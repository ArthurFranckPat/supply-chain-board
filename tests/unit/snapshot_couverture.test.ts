import { test } from '@japa/runner'
import {
  couverture,
  fenetreValide,
  jourIso,
  joursManquants,
  libelleMessage,
  photoLaPlusProche,
} from '#app/domain/snapshot_couverture'

/**
 * Couverture de l'historique des photos (#138 lot 0), matière de
 * `node ace snapshot:diagnose`. Pure : aucun accès base ici, le service se
 * charge de l'agrégation SQL.
 */

test.group('joursManquants', () => {
  test('aucune photo, ou une seule : aucun trou à signaler', ({ assert }) => {
    assert.deepEqual(joursManquants([]), [])
    assert.deepEqual(joursManquants(['2026-08-06']), [])
  })

  test('jours consécutifs : aucun trou', ({ assert }) => {
    assert.deepEqual(joursManquants(['2026-08-06', '2026-08-07', '2026-08-08']), [])
  })

  test('rend les jours absents entre le premier et le dernier', ({ assert }) => {
    assert.deepEqual(joursManquants(['2026-08-06', '2026-08-09']), ['2026-08-07', '2026-08-08'])
  })

  test('les week-ends comptent comme des trous — le run nocturne tourne tous les jours', ({
    assert,
  }) => {
    // 08 et 09/08/2026 = samedi et dimanche.
    assert.deepEqual(joursManquants(['2026-08-07', '2026-08-10']), ['2026-08-08', '2026-08-09'])
  })

  test('insensible à l’ordre et aux doublons', ({ assert }) => {
    assert.deepEqual(joursManquants(['2026-08-09', '2026-08-06', '2026-08-06']), [
      '2026-08-07',
      '2026-08-08',
    ])
  })

  test('traverse un changement de mois et une année bissextile', ({ assert }) => {
    assert.deepEqual(joursManquants(['2028-02-27', '2028-03-01']), ['2028-02-28', '2028-02-29'])
  })
})

test.group('jourIso', () => {
  test('normalise texte, timestamp et Date sur le même jour ISO', ({ assert }) => {
    assert.equal(jourIso('2026-08-06'), '2026-08-06')
    assert.equal(jourIso('2026-08-06 00:00:00'), '2026-08-06')
    assert.equal(jourIso(new Date(2026, 7, 6, 12, 0, 0)), '2026-08-06')
  })
})

test.group('libelleMessage', () => {
  test('nomme les trois codes émis sur AE1', ({ assert }) => {
    assert.equal(libelleMessage(2), 'avancer')
    assert.equal(libelleMessage(3), 'retarder')
    assert.equal(libelleMessage(6), 'inutile')
  })

  test('un code inattendu reste lisible plutôt que muet', ({ assert }) => {
    assert.equal(libelleMessage(7), 'code 7')
  })
})

test.group('couverture', () => {
  const parSource = (r: Record<string, unknown>) => String(r.source)

  test('table vide : couverture nulle, pas de dernier jour', ({ assert }) => {
    assert.deepEqual(couverture([], parSource), {
      jours: 0,
      premier: null,
      dernier: null,
      manquants: [],
      antidates: [],
      derniere: {},
      derniereTotal: 0,
    })
  })

  test('compte les jours et ne détaille que le dernier', ({ assert }) => {
    const c = couverture(
      [
        { snapshot_date: '2026-08-04', source: 'stock', n: 3 },
        { snapshot_date: '2026-08-06', source: 'stock', n: 5 },
        { snapshot_date: '2026-08-06', source: 'appro_suggestion', n: 7 },
      ],
      parSource
    )

    assert.equal(c.jours, 2)
    assert.equal(c.premier, '2026-08-04')
    assert.equal(c.dernier, '2026-08-06')
    assert.deepEqual(c.manquants, ['2026-08-05'])
    assert.deepEqual(c.derniere, { stock: 5, appro_suggestion: 7 })
    assert.equal(c.derniereTotal, 12)
  })

  test('agrège les décomptes qui retombent sur la même clé', ({ assert }) => {
    const c = couverture(
      [
        { snapshot_date: '2026-08-06', mrpmes: 2, n: 4 },
        { snapshot_date: '2026-08-06', mrpmes: 9, n: 1 },
        { snapshot_date: '2026-08-06', mrpmes: 11, n: 2 },
      ],
      (r) => (Number(r.mrpmes) === 2 ? 'avancer' : 'autre')
    )

    assert.deepEqual(c.derniere, { avancer: 4, autre: 3 })
  })
})

test.group('couverture — jours antidatés', () => {
  const parSource = (r: Record<string, unknown>) => String(r.source)

  test('sans colonne ecrit_le, aucun jour n’est déclaré antidaté', ({ assert }) => {
    const c = couverture([{ snapshot_date: '2026-08-06', source: 'stock', n: 5 }], parSource)
    assert.deepEqual(c.antidates, [])
  })

  test('un jour écrit à une autre date est signalé', ({ assert }) => {
    // `snapshot:run --date=2026-08-01` lancé le 06 : la photo du 01 raconte
    // l'état du 06. Le lot 1 la diffèrerait comme du réel.
    const c = couverture(
      [
        { snapshot_date: '2026-08-01', source: 'stock', ecrit_le: '2026-08-06', n: 5 },
        { snapshot_date: '2026-08-06', source: 'stock', ecrit_le: '2026-08-06', n: 5 },
      ],
      parSource
    )
    assert.deepEqual(c.antidates, ['2026-08-01'])
  })

  test('une seule source antidatée suffit à signaler le jour', ({ assert }) => {
    const c = couverture(
      [
        { snapshot_date: '2026-08-06', source: 'stock', ecrit_le: '2026-08-06', n: 5 },
        { snapshot_date: '2026-08-06', source: 'appro', ecrit_le: '2026-08-07', n: 2 },
      ],
      parSource
    )
    assert.deepEqual(c.antidates, ['2026-08-06'])
  })
})

/**
 * Sélecteur de fenêtre J-1/J-7/J-30 (#138 lot 2) : la photo la plus proche de
 * la cible, jamais une date déduite — les trous (week-ends, pannes) sont
 * tolérés en prenant la photo existante la plus proche.
 */
test.group('photoLaPlusProche', () => {
  const dates = ['2026-08-20', '2026-08-15', '2026-08-08', '2026-08-01'] // desc

  test('fenêtre J-7 : photo la plus proche de la cible, pas la précédente', ({ assert }) => {
    // Cible = 20 - 7 = 13 ; la plus proche est le 15 (dist 2), pas le 08 (dist 5).
    assert.deepEqual(photoLaPlusProche(dates, 7), ['2026-08-20', '2026-08-15'])
  })

  test('fenêtre J-1 : photo de la veille au plus proche', ({ assert }) => {
    // Cible = 20 - 1 = 19 ; la plus proche est le 15 (dist 4).
    assert.deepEqual(photoLaPlusProche(dates, 1), ['2026-08-20', '2026-08-15'])
  })

  test('fenêtre J-30 : cible hors table → la plus ancienne disponible', ({ assert }) => {
    // Cible = 20 - 30 = 21/07, avant la première photo : le 01 est le plus proche.
    assert.deepEqual(photoLaPlusProche(dates, 30), ['2026-08-20', '2026-08-01'])
  })

  test('moins de deux photos : null', ({ assert }) => {
    assert.isNull(photoLaPlusProche(['2026-08-20'], 7))
    assert.isNull(photoLaPlusProche([], 7))
  })
})

test.group('fenetreValide', () => {
  test('accepte les entiers strictement positifs', ({ assert }) => {
    assert.equal(fenetreValide(1), 1)
    assert.equal(fenetreValide(7), 7)
    assert.equal(fenetreValide('30'), 30)
  })

  test('rejette zéro, négatif, chaîne vide et non-numérique', ({ assert }) => {
    assert.isNull(fenetreValide(0))
    assert.isNull(fenetreValide(-7))
    assert.isNull(fenetreValide(''))
    assert.isNull(fenetreValide(null))
    assert.isNull(fenetreValide(undefined))
    assert.isNull(fenetreValide('abc'))
    assert.isNull(fenetreValide(1.5))
  })
})
