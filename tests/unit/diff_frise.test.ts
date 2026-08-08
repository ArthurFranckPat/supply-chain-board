import { test } from '@japa/runner'
import {
  construireFrise,
  detecterTrous,
  type PasFrise,
  type TrouFrise,
} from '#app/domain/diff_frise'
import type { DriverDiffEntry } from '#app/domain/cbn_driver_diff'

/**
 * Frise d'une plage (#143) : chaînage des diffs jour à jour. Domaine pur, sans
 * I/O — ces tests n'ont besoin d'aucune base.
 */

/** Entrée de diff de secours — la frise ne lit que article/source/nature/jour. */
const entree = (over: Partial<DriverDiffEntry> = {}): DriverDiffEntry => ({
  article: 'A1',
  source: 'stock',
  nature: 'quantite',
  quantiteAvant: 100,
  quantiteApres: 50,
  echeanceAvant: null,
  echeanceApres: null,
  detail: '100 → 50',
  designation: null,
  famille: null,
  vcrnum: null,
  vcrlin: null,
  vcrnumApres: null,
  vcrlinApres: null,
  ...over,
})

const pas = (avant: string, apres: string, entrees: DriverDiffEntry[] = []): PasFrise => ({
  avant,
  apres,
  entrees,
  message: null,
  sourcesEcartees: [],
  sourcesComparees: ['stock'],
})

test.group('detecterTrous', () => {
  test('série continue → aucun trou', ({ assert }) => {
    const trous = detecterTrous(['2026-08-01', '2026-08-02', '2026-08-03'])
    assert.deepEqual(trous, [])
  })

  test('écart de 2 jours → un trou d’un jour manquant', ({ assert }) => {
    const trous = detecterTrous(['2026-08-01', '2026-08-03'])
    assert.lengthOf(trous, 1)
    assert.deepEqual(trous[0], {
      entre: '2026-08-01',
      et: '2026-08-03',
      manquants: ['2026-08-02'],
    } satisfies TrouFrise)
  })

  test('écart de 4 jours → trois manquants', ({ assert }) => {
    const trous = detecterTrous(['2026-08-01', '2026-08-05'])
    assert.lengthOf(trous, 1)
    assert.deepEqual(trous[0].manquants, ['2026-08-02', '2026-08-03', '2026-08-04'])
  })

  test('dates non triées en entrée → triées d’abord', ({ assert }) => {
    const trous = detecterTrous(['2026-08-05', '2026-08-02', '2026-08-01'])
    assert.lengthOf(trous, 1)
    assert.equal(trous[0].entre, '2026-08-02')
    assert.equal(trous[0].et, '2026-08-05')
    assert.deepEqual(trous[0].manquants, ['2026-08-03', '2026-08-04'])
  })

  test('changement de mois : le jour suivant passe la borne du mois', ({ assert }) => {
    const trous = detecterTrous(['2026-07-31', '2026-08-02'])
    assert.deepEqual(trous[0].manquants, ['2026-08-01'])
  })

  test('une seule photo → aucun trou (rien à enjamber)', ({ assert }) => {
    assert.deepEqual(detecterTrous(['2026-08-01']), [])
  })
})

test.group('construireFrise', () => {
  test('un mouvement porte le jour de la borne « après » de son pas', ({ assert }) => {
    const frise = construireFrise([pas('2026-08-01', '2026-08-02', [entree({ article: 'A1' })])])
    assert.equal(frise.total, 1)
    assert.equal(frise.articles[0].mouvements[0].jour, '2026-08-02')
  })

  test('les mouvements d’un article sont chronologiques, même pas fournis en désordre', ({
    assert,
  }) => {
    const frise = construireFrise([
      pas('2026-08-03', '2026-08-04', [entree({ article: 'A1', nature: 'apparue' })]),
      pas('2026-08-01', '2026-08-02', [entree({ article: 'A1', nature: 'apparue' })]),
      pas('2026-08-02', '2026-08-03', [entree({ article: 'A1', nature: 'apparue' })]),
    ])
    assert.deepEqual(
      frise.articles[0].mouvements.map((m) => m.jour),
      ['2026-08-02', '2026-08-03', '2026-08-04']
    )
  })

  test('les articles sont triés par nombre de mouvements décroissant', ({ assert }) => {
    const frise = construireFrise([
      pas('2026-08-01', '2026-08-02', [
        entree({ article: 'A2' }),
        entree({ article: 'A1' }),
        entree({ article: 'A1' }),
      ]),
      pas('2026-08-02', '2026-08-03', [entree({ article: 'A1' })]),
    ])
    assert.deepEqual(
      frise.articles.map((a) => a.article),
      ['A1', 'A2']
    )
    assert.equal(frise.articles[0].total, 3)
    assert.equal(frise.articles[1].total, 1)
  })

  test('compteurs globaux : total, parNature, parSource', ({ assert }) => {
    const frise = construireFrise([
      pas('2026-08-01', '2026-08-02', [
        entree({ article: 'A1', source: 'stock', nature: 'quantite' }),
        entree({ article: 'A2', source: 'appro', nature: 'apparue' }),
      ]),
      pas('2026-08-02', '2026-08-03', [
        entree({ article: 'A1', source: 'stock', nature: 'quantite' }),
        entree({ article: 'A3', source: 'appro', nature: 'disparue' }),
      ]),
    ])
    assert.equal(frise.total, 4)
    assert.deepEqual(frise.totalParNature, { quantite: 2, apparue: 1, disparue: 1 })
    assert.deepEqual(frise.totalParSource, { stock: 2, appro: 2 })
  })

  test('un pas sans entrée (fût-ce pour une raison annoncée) ne contribue rien', ({ assert }) => {
    const pasVide = pas('2026-08-01', '2026-08-02', [])
    pasVide.message = 'aucune source commune aux deux photos'
    const frise = construireFrise([
      pasVide,
      pas('2026-08-02', '2026-08-03', [entree({ article: 'A1' })]),
    ])
    assert.equal(frise.total, 1)
    assert.lengthOf(frise.articles, 1)
    assert.deepEqual(frise.totalParNature, { quantite: 1 })
  })

  test('désignation et famille portées depuis l’entrée', ({ assert }) => {
    const frise = construireFrise([
      pas('2026-08-01', '2026-08-02', [
        entree({ article: 'A1', designation: 'Vanne X', famille: 'F1' }),
      ]),
    ])
    const article = frise.articles[0]
    assert.equal(article.designation, 'Vanne X')
    assert.equal(article.famille, 'F1')
    assert.equal(article.mouvements[0].designation, 'Vanne X')
    assert.equal(article.mouvements[0].famille, 'F1')
  })
})
