import { test } from '@japa/runner'
import {
  adherenceProgramme,
  fiabiliteTempsGamme,
  lundiIso,
  mixArticles,
} from '#app/domain/cockpit_analyses'
import type { SyntheseOf } from '#app/domain/production_realisee'

/**
 * Analyses du cockpit poste (#119, lot 6) — domaine pur.
 */

function of(over: Partial<SyntheseOf> = {}): SyntheseOf {
  return {
    numOf: 'OF-1',
    article: 'ART-1',
    qty: 100,
    heures: 10,
    dontHeuresReglage: 0,
    joursPointes: ['2026-07-01'],
    premierJour: '2026-07-01',
    dernierJour: '2026-07-01',
    ...over,
  }
}

test.group('lundiIso', () => {
  test('ramène un jeudi à son lundi', ({ assert }) => {
    assert.equal(lundiIso('2026-03-05'), '2026-03-02') // jeudi → lundi
  })

  test('un lundi reste lui-même', ({ assert }) => {
    assert.equal(lundiIso('2026-03-02'), '2026-03-02')
  })

  test('un dimanche recule à la semaine précédente', ({ assert }) => {
    assert.equal(lundiIso('2026-03-08'), '2026-03-02')
  })
})

test.group('fiabiliteTempsGamme', () => {
  test('ratio = pointé / théorique, par article puis global', ({ assert }) => {
    // Cadence 100 u/h → 100 pièces = 1 h théorique ; 2 h pointées → ratio 2
    // (la ligne prend deux fois le temps prévu, la charge est sous-estimée).
    const r = fiabiliteTempsGamme({
      synthese: [of({ qty: 100, heures: 2 })],
      cadencePour: () => 100,
    })
    assert.lengthOf(r.articles, 1)
    assert.equal(r.articles[0].heuresTheoriques, 1)
    assert.equal(r.articles[0].heuresPointees, 2)
    assert.equal(r.articles[0].ratio, 2)
    assert.equal(r.ratioGlobal, 2)
  })

  test('agrège plusieurs OF du même article', ({ assert }) => {
    const r = fiabiliteTempsGamme({
      synthese: [
        of({ numOf: 'OF-1', qty: 100, heures: 1 }),
        of({ numOf: 'OF-2', qty: 100, heures: 1 }),
      ],
      cadencePour: () => 100,
    })
    assert.lengthOf(r.articles, 1)
    assert.equal(r.articles[0].qty, 200)
    assert.equal(r.articles[0].heuresPointees, 2)
    assert.equal(r.articles[0].heuresTheoriques, 2)
    assert.equal(r.articles[0].ratio, 1)
  })

  test('garde-fou : sans cadence exploitable, l’article SORT du calcul', ({ assert }) => {
    const r = fiabiliteTempsGamme({
      synthese: [of({ article: 'SANS-CADENCE', qty: 100, heures: 2 })],
      cadencePour: () => null,
    })
    assert.lengthOf(r.articles, 0)
    assert.equal(r.exclusFauteCadence, 1)
    assert.isNull(r.ratioGlobal)
  })

  test('cadence nulle = pas exploitable, pareil', ({ assert }) => {
    const r = fiabiliteTempsGamme({
      synthese: [of({ qty: 100, heures: 2 })],
      cadencePour: () => 0,
    })
    assert.lengthOf(r.articles, 0)
    assert.equal(r.exclusFauteCadence, 1)
  })

  test('sans heure pointée le ratio est null, pas une division par zéro', ({ assert }) => {
    const r = fiabiliteTempsGamme({
      synthese: [of({ qty: 100, heures: 0 })],
      cadencePour: () => 100,
    })
    assert.lengthOf(r.articles, 1)
    assert.isNull(r.articles[0].ratio)
  })

  test('le réglage est exclu du ratio, comparé en opératoire', ({ assert }) => {
    // 3 h pointées dont 1 h de réglage → 2 h opératoires ; cadence 100 u/h →
    // 100 pièces = 1 h théorique → ratio 2, pas 3 (revue #119, 04/08).
    const r = fiabiliteTempsGamme({
      synthese: [of({ qty: 100, heures: 3, dontHeuresReglage: 1 })],
      cadencePour: () => 100,
    })
    assert.equal(r.articles[0].heuresPointees, 2)
    assert.equal(r.articles[0].heuresReglage, 1)
    assert.equal(r.articles[0].ratio, 2)
    assert.equal(r.ratioGlobal, 2)
    assert.equal(r.heuresReglage, 1)
  })

  test('réglage seul sans opératoire : ratio null, le réglage reste affiché', ({ assert }) => {
    const r = fiabiliteTempsGamme({
      synthese: [of({ qty: 100, heures: 2, dontHeuresReglage: 2 })],
      cadencePour: () => 100,
    })
    assert.equal(r.articles[0].heuresPointees, 0)
    assert.equal(r.articles[0].heuresReglage, 2)
    assert.isNull(r.articles[0].ratio)
    assert.isNull(r.ratioGlobal)
  })
  test('plusieurs OF du même article sans cadence : exclusFauteCadence compte 1 article', ({
    assert,
  }) => {
    const r = fiabiliteTempsGamme({
      synthese: [
        of({ numOf: 'OF-1', article: 'SANS', qty: 10, heures: 1 }),
        of({ numOf: 'OF-2', article: 'SANS', qty: 20, heures: 2 }),
      ],
      cadencePour: () => null,
    })
    assert.equal(r.exclusFauteCadence, 1)
  })
})

test.group('adherenceProgramme', () => {
  test('comptages bruts par semaine, sans taux (revue #119)', ({ assert }) => {
    const prevus = new Map([['2026-03-02', new Set(['OF-1', 'OF-2'])]])
    const r = adherenceProgramme({
      prevusParSemaine: prevus,
      synthese: [
        of({ numOf: 'OF-1', joursPointes: ['2026-03-03'] }),
        of({ numOf: 'OF-3', joursPointes: ['2026-03-04'] }),
      ],
      semaines: ['2026-03-02'],
    })
    assert.lengthOf(r, 1)
    assert.equal(r[0].prevus, 2)
    assert.equal(r[0].pointes, 2) // OF-1 et OF-3 ont pointé cette semaine
  })

  test('rien de prévu : zéro, et le champ taux n’existe plus', ({ assert }) => {
    const r = adherenceProgramme({
      prevusParSemaine: new Map(),
      synthese: [of({ joursPointes: ['2026-03-03'] })],
      semaines: ['2026-03-02'],
    })
    assert.equal(r[0].prevus, 0)
    assert.equal(r[0].pointes, 1)
    assert.notProperty(r[0], 'taux')
  })

  test('les semaines sont servies triées', ({ assert }) => {
    const r = adherenceProgramme({
      prevusParSemaine: new Map(),
      synthese: [],
      semaines: ['2026-03-09', '2026-03-02'],
    })
    assert.deepEqual(
      r.map((s) => s.semaine),
      ['2026-03-02', '2026-03-09']
    )
  })

  test('borne aux N semaines les plus récentes', ({ assert }) => {
    const r = adherenceProgramme({
      prevusParSemaine: new Map(),
      synthese: [],
      semaines: [
        '2026-02-02',
        '2026-02-09',
        '2026-02-16',
        '2026-02-23',
        '2026-03-02',
        '2026-03-09',
      ],
      maxSemaines: 4,
    })
    assert.deepEqual(
      r.map((s) => s.semaine),
      ['2026-02-16', '2026-02-23', '2026-03-02', '2026-03-09']
    )
  })
})

test.group('mixArticles', () => {
  test('tri par quantité, cadence constatée vs gamme', ({ assert }) => {
    const r = mixArticles({
      synthese: [
        of({ article: 'PETIT', qty: 10, heures: 1 }),
        of({ article: 'GROS', qty: 500, heures: 10 }),
      ],
      cadencePour: (a) => (a === 'GROS' ? 60 : null),
      usParPalette: () => null,
    })
    assert.deepEqual(
      r.map((m) => m.article),
      ['GROS', 'PETIT']
    )
    const gros = r[0]
    assert.equal(gros.piecesParHeure, 50) // 500 / 10 h
    assert.equal(gros.cadenceGamme, 60)
    const petit = r[1]
    assert.equal(petit.piecesParHeure, 10)
    assert.isNull(petit.cadenceGamme) // pas de cadence → null, pas 0
  })

  test('palettes : null sans coefficient, valeur avec', ({ assert }) => {
    const r = mixArticles({
      synthese: [of({ article: 'AVEC', qty: 1000 }), of({ article: 'SANS', qty: 1000 })],
      cadencePour: () => null,
      usParPalette: (a) => (a === 'AVEC' ? 500 : null),
    })
    const avec = r.find((m) => m.article === 'AVEC')!
    const sans = r.find((m) => m.article === 'SANS')!
    assert.equal(avec.palettes, 2) // 1000 / 500
    assert.isNull(sans.palettes) // absence de donnée, pas zéro
  })

  test('le top borne la liste', ({ assert }) => {
    const synthese = Array.from({ length: 15 }, (_, i) =>
      of({ numOf: `OF-${i}`, article: `ART-${i}`, qty: i + 1 })
    )
    const r = mixArticles({
      synthese,
      cadencePour: () => null,
      usParPalette: () => null,
      top: 5,
    })
    assert.lengthOf(r, 5)
    assert.equal(r[0].qty, 15)
  })

  test('quantité nulle écartée', ({ assert }) => {
    const r = mixArticles({
      synthese: [of({ qty: 0, heures: 2 })],
      cadencePour: () => 100,
      usParPalette: () => null,
    })
    assert.lengthOf(r, 0)
  })
})
