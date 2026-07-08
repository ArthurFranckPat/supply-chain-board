import { test } from '@japa/runner'
import {
  appliquerEstimation,
  estimerUsParPalette,
  median,
  mode,
  SEUIL_CONFIANCE_OK,
  SEUIL_DOMINANCE_STOCK,
  type PaletteObservation,
} from '#app/domain/conditionnement_estimator'

function obs(us: number, source: 'STOCK' | 'STOJOU' = 'STOCK'): PaletteObservation {
  return { us, source }
}

/** Observation STOCK sur emplacement de stockage SM* (palette type, fiable). */
function sm(us: number): PaletteObservation {
  return { us, source: 'STOCK', typeEmplacement: 'stockage' }
}

/** Observation STOCK sur emplacement de consommation S*P/CLP (palette entamée). */
function conso(us: number): PaletteObservation {
  return { us, source: 'STOCK', typeEmplacement: 'conso' }
}

test.group('median', () => {
  test("médiane d'un tableau impair = valeur centrale", ({ assert }) => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([10, 42, 42, 42, 50]), 42)
  })

  test("médiane d'un tableau pair = moyenne des 2 centrales", ({ assert }) => {
    assert.equal(median([1, 2, 3, 4]), 2.5)
    assert.equal(median([42, 42]), 42)
  })

  test("médiane ne mute pas l'entrée", ({ assert }) => {
    const arr = [3, 1, 2]
    median(arr)
    assert.deepEqual(arr, [3, 1, 2])
  })

  test('médiane vide = null', ({ assert }) => {
    assert.isNull(median([]))
  })
})

test.group('mode', () => {
  test('retourne la valeur la plus récurrente', ({ assert }) => {
    assert.equal(mode([960, 960, 960, 17, 960]), 960)
    assert.equal(mode([42, 42, 42, 100, 100]), 42)
  })

  test("en cas d'égalité, retourne la plus grande valeur", ({ assert }) => {
    assert.equal(mode([42, 42, 100, 100]), 100)
  })

  test('valeur unique = cette valeur', ({ assert }) => {
    assert.equal(mode([960]), 960)
  })

  test('vide = null', ({ assert }) => {
    assert.isNull(mode([]))
  })

  test('robuste face aux palettes partielles', ({ assert }) => {
    // 10 palettes à 960 + 1 palette partielle à 17 → mode = 960 (pas dévié).
    const valeurs = [...Array(10).fill(960), 17]
    assert.equal(mode(valeurs), 960)
  })
})

test.group('estimerUsParPalette — priorité STOCK', () => {
  test('STOCK prioritaire quand dominance SM* validée', ({ assert }) => {
    const stock = [sm(42), sm(42), sm(42)]
    const stojou = [obs(100, 'STOJOU'), obs(100, 'STOJOU')]
    const r = estimerUsParPalette(stock, stojou)
    assert.isNotNull(r)
    assert.equal(r!.source, 'STOCK')
    assert.equal(r!.usParPalette, 42)
  })

  test('fallback STOJOU quand STOCK vide', ({ assert }) => {
    const stojou = [obs(100, 'STOJOU'), obs(100, 'STOJOU'), obs(100, 'STOJOU')]
    const r = estimerUsParPalette([], stojou)
    assert.isNotNull(r)
    assert.equal(r!.source, 'STOJOU')
    assert.equal(r!.usParPalette, 100)
  })

  test('null si aucune observation', ({ assert }) => {
    assert.isNull(estimerUsParPalette([], []))
  })
})

test.group('estimerUsParPalette — dominance SM* vs S*P', () => {
  test(`consensus validé si ≥ ${SEUIL_DOMINANCE_STOCK} SM* à la même valeur`, ({ assert }) => {
    const r = estimerUsParPalette([sm(42), sm(42)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.source, 'STOCK')
  })

  test("SM* unique SANS conso → pas d'estimation STOCK", ({ assert }) => {
    // 1 SM* seul : ni consensus (≥ 2 identiques), ni SM*+conso → null.
    const r = estimerUsParPalette([sm(42)], [])
    assert.isNull(r)
  })

  test('SM* unique + S*P présent → on garde la valeur SM*', ({ assert }) => {
    // 1 SM* à 42 + 1 S*P à 720 (valeurs différentes) → 42 (le SM*).
    const r = estimerUsParPalette([sm(42), conso(720)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.source, 'STOCK')
  })

  test('SM* + CLP présent → on garde la valeur SM* (CLP = conso)', ({ assert }) => {
    // 1 SM* à 2250 + 1 CLP à 720 → 2250 (le SM*, cas A1248L02).
    const r = estimerUsParPalette([sm(2250), conso(720)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 2250)
  })

  test('SM* consensus + S*P à valeur différente → consensus SM* gagne', ({ assert }) => {
    // 2 SM* à 42 (consensus) + 1 S*P à 17 (consommation, ignoré) → 42.
    const r = estimerUsParPalette([sm(42), sm(42), conso(17)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.source, 'STOCK')
    assert.equal(r!.observations, 3)
  })

  test("S*P seuls (pas de SM*) → pas d'estimation STOCK", ({ assert }) => {
    const r = estimerUsParPalette([conso(42), conso(42), conso(42)], [])
    assert.isNull(r)
  })

  test('stock entamé : SM* à valeurs différentes SANS conso → null', ({ assert }) => {
    // 3 SM* à qtés différentes, pas de conso → pas de consensus ni de branche B.
    const r = estimerUsParPalette([sm(42), sm(17), sm(9)], [])
    assert.isNull(r)
  })

  test('stock entamé : SM* à valeurs différentes + conso → mode des SM*', ({ assert }) => {
    // 3 SM* différents + 1 conso → on prend le mode des SM* (le plus récurrent,
    // sinon le plus grand en cas d'égalité). Ici tous différents → le plus grand.
    const r = estimerUsParPalette([sm(42), sm(17), sm(9), conso(5)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 42) // mode = plus grand en cas d'égalité d'occurrences
  })
})

test.group('estimerUsParPalette — confiance', () => {
  test(`confiance 'ok' au-dessus du seuil (${SEUIL_CONFIANCE_OK})`, ({ assert }) => {
    const stock = Array.from({ length: SEUIL_CONFIANCE_OK }, () => sm(42))
    const r = estimerUsParPalette(stock, [])
    assert.equal(r!.confiance, 'ok')
    assert.equal(r!.observations, SEUIL_CONFIANCE_OK)
  })

  test(`confiance 'faible' sous le seuil`, ({ assert }) => {
    const stock = [sm(42), sm(42)] // consensus OK (≥ 2) mais < seuil confiance 3
    const r = estimerUsParPalette(stock, [])
    assert.equal(r!.confiance, 'faible')
    assert.equal(r!.observations, 2)
  })
})

test.group('estimerUsParPalette — filtrage', () => {
  test('exclut les qtés ≤ 1 (articles paramétrage)', ({ assert }) => {
    const stock = [sm(1), sm(1), sm(42), sm(42)] // les 1 écartés, consensus sur 42
    const r = estimerUsParPalette(stock, [])
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.observations, 2)
  })

  test('exclut les valeurs négatives et non finies', ({ assert }) => {
    const stock = [sm(-5), sm(Number.NaN), sm(42), sm(42), sm(42)]
    const r = estimerUsParPalette(stock, [])
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.observations, 3)
  })
})

test.group('appliquerEstimation', () => {
  test('retourne le coef si estimation valide', ({ assert }) => {
    const r = estimerUsParPalette([sm(42), sm(42), sm(42)], [])
    assert.equal(appliquerEstimation(r), 42)
  })

  test('retourne null si estimation null', ({ assert }) => {
    assert.isNull(appliquerEstimation(null))
  })

  test('retourne null si usParPalette ≤ 0', ({ assert }) => {
    const r = {
      usParPalette: 0,
      source: 'STOCK' as const,
      confiance: 'faible' as const,
      observations: 0,
    }
    assert.isNull(appliquerEstimation(r))
  })
})
