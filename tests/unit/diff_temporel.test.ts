import { test } from '@japa/runner'
import {
  entreesPourArticle,
  estSourceDiffTemporel,
  parseCle,
  plusProcheDe,
  SOURCES_DIFF_TEMP,
  trouverDepuis,
} from '#app/domain/diff_temporel'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'

function driver(
  over: Omit<Partial<DriverDiffEntry>, 'source' | 'article'> & { article: string; source: string }
): DriverDiffEntry {
  return {
    article: over.article,
    source: over.source as unknown as DriverDiffEntry['source'],
    nature: (over.nature ?? 'quantite') as DriverDiffEntry['nature'],
    quantiteAvant: over.quantiteAvant ?? null,
    quantiteApres: over.quantiteApres ?? null,
    echeanceAvant: over.echeanceAvant ?? null,
    echeanceApres: over.echeanceApres ?? null,
    detail: over.detail ?? `${over.source} ${over.article}`,
    designation: null,
    famille: null,
    approvisionnement: null,
    fournisseur: null,
    vcrnum: null,
    vcrlin: null,
    vcrnumApres: null,
    vcrlinApres: null,
  } as DriverDiffEntry
}

test.group('diff_temporel — parseCle', () => {
  test('parse une clé stable VCRNUM:VCRLIN:VCRSEQ', ({ assert }) => {
    assert.deepEqual(parseCle('CG2600209:1000:1'), {
      vcrnum: 'CG2600209',
      vcrlin: 1000,
      vcrseq: '1',
    })
    assert.deepEqual(parseCle('COA2400006:1:344000'), {
      vcrnum: 'COA2400006',
      vcrlin: 1,
      vcrseq: '344000',
    })
  })

  test('refuse une clé mal formée', ({ assert }) => {
    assert.isNull(parseCle('CG2600209:1000'))
    assert.isNull(parseCle('CG2600209:abc:1'))
    assert.isNull(parseCle(''))
    assert.isNull(parseCle('a:b:c:d'))
  })
})

test.group('diff_temporel — trouverDepuis', () => {
  test('retourne la première photo où mrpmes != 1', ({ assert }) => {
    const rows = [
      { snapshot_date: '2026-08-04', mrpmes: 1 },
      { snapshot_date: '2026-08-05', mrpmes: 1 },
      { snapshot_date: '2026-08-06', mrpmes: 2 },
      { snapshot_date: '2026-08-07', mrpmes: 2 },
    ]
    assert.equal(trouverDepuis(rows), '2026-08-06')
  })

  test('null si jamais apparu (toujours 1)', ({ assert }) => {
    assert.isNull(trouverDepuis([{ snapshot_date: '2026-08-06', mrpmes: 1 }]))
    assert.isNull(trouverDepuis([]))
  })

  test('clé stable : VCRSEQ rend unique, 1 ne masque pas 2', ({ assert }) => {
    // 79% VCRNUMORI résolu uniquement contre photo du jour — clé stable VCRNUM:VCRLIN:VCRSEQ
    const rows = [
      { snapshot_date: '2026-08-06', mrpmes: 1 },
      { snapshot_date: '2026-08-07', mrpmes: 3 },
    ]
    assert.equal(trouverDepuis(rows), '2026-08-07')
  })
})

test.group('diff_temporel — SOURCES_DIFF_TEMP', () => {
  test('6 sources terrain uniquement', ({ assert }) => {
    assert.deepEqual([...SOURCES_DIFF_TEMP].sort(), [
      'appro',
      'besoin_matiere',
      'demande_ferme',
      'demande_prevision',
      'of_ferme',
      'stock',
    ])
  })

  test('exclut of_planifie/of_suggestion/appro_suggestion', ({ assert }) => {
    assert.isFalse(estSourceDiffTemporel('of_planifie'))
    assert.isFalse(estSourceDiffTemporel('of_suggestion'))
    assert.isFalse(estSourceDiffTemporel('appro_suggestion'))
  })

  test('besoin_matiere = WIPSTA=1 seul, WIPSTA 2/3 exclus implicitement', ({ assert }) => {
    // WIPSTA 2/3 jamais photographiés (ticket 01) → jamais dans le diff même si présentés
    assert.isTrue(estSourceDiffTemporel('besoin_matiere'))
  })
})

test.group('diff_temporel — entreesPourArticle', () => {
  test('filtre par article et par sources Q12', ({ assert }) => {
    const entrees = [
      driver({ article: 'V4254', source: 'stock', detail: 'stock 120 → 32 (−88)' }),
      driver({ article: 'V4254', source: 'of_planifie', detail: 'of_planifie bruit' }),
      driver({
        article: 'V4254',
        source: 'appro_suggestion',
        detail: 'appro_suggestion sortie CBN',
      }),
      driver({ article: 'AUTRE', source: 'stock', detail: 'autre article' }),
      driver({ article: 'V4254', source: 'besoin_matiere', detail: 'besoin 1200 → 600' }),
      driver({ article: 'V4254', source: 'demande_ferme', detail: 'demande ferme' }),
    ]
    const out = entreesPourArticle(entrees, 'V4254', '2026-08-10')
    assert.deepEqual(out.map((e) => e.source).sort(), ['besoin_matiere', 'demande_ferme', 'stock'])
    assert.isTrue(out.every((e) => e.jour === '2026-08-10'))
  })

  test('tri par driverDiffAmplitude décroissante', ({ assert }) => {
    const entrees = [
      driver({
        article: 'V4254',
        source: 'stock',
        nature: 'quantite',
        quantiteAvant: 120,
        quantiteApres: 32,
        detail: 'stock 120 → 32 (−88)',
      }),
      driver({
        article: 'V4254',
        source: 'appro',
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: 8100,
        detail: 'appro apparue 8100',
      }),
    ]
    const out = entreesPourArticle(entrees, 'V4254', '2026-08-10')
    // apparue (1000+log) > quantite ratio → apparue d'abord
    assert.equal(out[0].source, 'appro')
    assert.equal(out[1].source, 'stock')
  })

  test('of_ferme gardé, of_planifie exclu — jamais de diff de sorties CBN', ({ assert }) => {
    const entrees = [
      driver({ article: 'V4254', source: 'of_ferme', detail: 'of_ferme stable' }),
      driver({ article: 'V4254', source: 'of_suggestion', detail: 'of_suggestion recréé' }),
      driver({ article: 'V4254', source: 'of_planifie', detail: 'of_planifie recréé' }),
    ]
    const out = entreesPourArticle(entrees, 'V4254', '2026-08-10')
    assert.lengthOf(out, 1)
    assert.equal(out[0].source, 'of_ferme')
  })
})

test.group('diff_temporel — plusProcheDe (trous)', () => {
  test('saute week-ends/pannes — prend la plus proche', ({ assert }) => {
    // Photos dispo : ven 06, lun 09 (week-end troué), mar 10
    const dates = ['2026-08-10', '2026-08-09', '2026-08-06']
    // cible = samedi 07 (trou) → plus proche = ven 06 (1j) vs lun 09 (2j)
    assert.equal(plusProcheDe(dates, '2026-08-07'), '2026-08-06')
    // cible = dim 08 → lun 09 plus proche (1j) que ven 06 (2j)
    assert.equal(plusProcheDe(dates, '2026-08-08'), '2026-08-09')
  })

  test('cible exacte rendue telle quelle', ({ assert }) => {
    assert.equal(
      plusProcheDe(['2026-08-10', '2026-08-07', '2026-08-06'], '2026-08-07'),
      '2026-08-07'
    )
  })

  test('null si aucune date', ({ assert }) => {
    assert.isNull(plusProcheDe([], '2026-08-07'))
  })
})
