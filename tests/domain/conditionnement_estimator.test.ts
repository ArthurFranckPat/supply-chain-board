import { test } from '@japa/runner'
import {
  appliquerEstimation,
  estimerDepuisStojou,
  estimerUsParPalette,
  NB_MOUVEMENTS_STOJOU,
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

/** Rangement STOJOU. Les tableaux sont ordonnés du PLUS RÉCENT au plus ancien. */
function rgt(us: number): PaletteObservation {
  return { us, source: 'STOJOU' }
}

test.group('estimerDepuisStojou', () => {
  test('3 rangements identiques → cette valeur, confiance ok', ({ assert }) => {
    const r = estimerDepuisStojou([rgt(960), rgt(960), rgt(960)])
    assert.equal(r!.usParPalette, 960)
    assert.equal(r!.confiance, 'ok')
    assert.equal(r!.observations, 3)
  })

  test('2 rangements concordants sur 3 → la valeur concordante', ({ assert }) => {
    // Le plus récent (17) est isolé, deux autres à 960 → 960 l'emporte.
    const r = estimerDepuisStojou([rgt(17), rgt(960), rgt(960)])
    assert.equal(r!.usParPalette, 960)
    assert.equal(r!.confiance, 'ok')
  })

  test('3 rangements tous différents → le plus récent, confiance faible', ({ assert }) => {
    // Conditionnement changé ou mouvements groupés : on prend la valeur en
    // vigueur (la plus récente), et on le signale.
    const r = estimerDepuisStojou([rgt(500), rgt(960), rgt(17)])
    assert.equal(r!.usParPalette, 500)
    assert.equal(r!.confiance, 'faible')
    assert.equal(r!.observations, 3)
  })

  test('un seul rangement → cette valeur, confiance faible', ({ assert }) => {
    const r = estimerDepuisStojou([rgt(960)])
    assert.equal(r!.usParPalette, 960)
    assert.equal(r!.confiance, 'faible')
    assert.equal(r!.observations, 1)
  })

  test(`ne regarde que les ${NB_MOUVEMENTS_STOJOU} premiers (les plus récents)`, ({ assert }) => {
    // Garde-fou si la requête remonte plus de lignes que prévu : les anciennes
    // (960 × 3) ne doivent pas écraser les récentes (500 × 3).
    const r = estimerDepuisStojou([
      rgt(500),
      rgt(500),
      rgt(500),
      rgt(960),
      rgt(960),
      rgt(960),
      rgt(960),
    ])
    assert.equal(r!.usParPalette, 500)
    assert.equal(r!.observations, NB_MOUVEMENTS_STOJOU)
  })

  test('aucun rangement → null', ({ assert }) => {
    assert.isNull(estimerDepuisStojou([]))
  })

  test('ignore les observations STOCK mélangées', ({ assert }) => {
    assert.isNull(estimerDepuisStojou([sm(42), sm(42)]))
  })

  test('exclut les qtés ≤ 1 avant de prendre le plus récent', ({ assert }) => {
    // Le plus récent est un mouvement à 1 (paramétrage) → écarté, le repli
    // devient le 960 suivant.
    const r = estimerDepuisStojou([rgt(1), rgt(960), rgt(500)])
    assert.equal(r!.usParPalette, 960)
    assert.equal(r!.observations, 2)
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
    // 1 SM* seul : pas de consensus (≥ 2 identiques requis) → null.
    const r = estimerUsParPalette([sm(42)], [])
    assert.isNull(r)
  })

  test("SM* unique + S*P présent → toujours pas d'estimation STOCK", ({ assert }) => {
    // Un S*P ne prouve RIEN sur la valeur du SM* : le SM* peut être le reliquat
    // d'une palette ayant servi à réalimenter le S*P.
    const r = estimerUsParPalette([sm(42), conso(720)], [])
    assert.isNull(r)
  })

  test('cas réel SMAC11 100 + S9P 457 → null (le 100 peut être un reliquat)', ({ assert }) => {
    const r = estimerUsParPalette([sm(100), conso(457)], [])
    assert.isNull(r)
  })

  test("SM* unique + CLP présent → pas d'estimation STOCK", ({ assert }) => {
    const r = estimerUsParPalette([sm(2250), conso(720)], [])
    assert.isNull(r)
  })

  test('SM* consensus + S*P à valeur différente → consensus SM* gagne', ({ assert }) => {
    // 2 SM* à 42 (consensus) + 1 S*P à 17 (consommation, ignoré) → 42.
    // observations = 2 (les SM* du consensus), le S*P ne compte pas.
    const r = estimerUsParPalette([sm(42), sm(42), conso(17)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 42)
    assert.equal(r!.source, 'STOCK')
    assert.equal(r!.observations, 2)
  })

  test("S*P seuls (pas de SM*) → pas d'estimation STOCK", ({ assert }) => {
    const r = estimerUsParPalette([conso(42), conso(42), conso(42)], [])
    assert.isNull(r)
  })

  test('stock entamé : SM* à valeurs différentes SANS conso → null', ({ assert }) => {
    // 3 SM* à qtés différentes → aucun consensus.
    const r = estimerUsParPalette([sm(42), sm(17), sm(9)], [])
    assert.isNull(r)
  })

  test('stock entamé : SM* à valeurs différentes + conso → null aussi', ({ assert }) => {
    // La présence d'un S*P ne rattrape pas l'absence de consensus.
    const r = estimerUsParPalette([sm(42), sm(17), sm(9), conso(5)], [])
    assert.isNull(r)
  })

  test('consensus le plus fréquent gagne (pas le premier rencontré)', ({ assert }) => {
    // 2 SM* à 17 énumérés d'abord, 3 SM* à 960 → 960 (3 occurrences).
    const r = estimerUsParPalette([sm(17), sm(17), sm(960), sm(960), sm(960)], [])
    assert.isNotNull(r)
    assert.equal(r!.usParPalette, 960)
    assert.equal(r!.observations, 3)
  })

  test('deux consensus à égalité stricte → null (indécidable)', ({ assert }) => {
    // 2 SM* à 42 et 2 SM* à 960 : aucune valeur n'est plus légitime que l'autre.
    const r = estimerUsParPalette([sm(42), sm(42), sm(960), sm(960)], [])
    assert.isNull(r)
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
