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
  approvisionnement: null,
  fournisseur: null,
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
    // Défaut 3 : toutes les natures/sources sont présentes, même à 0 — un
    // consommateur qui lit `totalParNature.renumerotation` ne doit jamais
    // recevoir `undefined` sous un type qui promet `number`.
    assert.deepEqual(frise.totalParNature, {
      apparue: 1,
      disparue: 1,
      quantite: 2,
      date: 0,
      renumerotation: 0,
    })
    assert.deepEqual(frise.totalParSource, {
      of_ferme: 0,
      of_planifie: 0,
      of_suggestion: 0,
      demande_ferme: 0,
      demande_prevision: 0,
      stock: 2,
      appro: 2,
      appro_suggestion: 0,
    })
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
    assert.equal(frise.totalParNature.quantite, 1)
    assert.equal(frise.totalParNature.apparue, 0)
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

  test('désignation/famille nulles sur la première entrée, renseignées sur une suivante → complétées (défaut 4)', ({
    assert,
  }) => {
    const frise = construireFrise([
      pas('2026-08-01', '2026-08-02', [
        entree({ article: 'A1', designation: null, famille: null }),
      ]),
      pas('2026-08-02', '2026-08-03', [
        entree({ article: 'A1', designation: 'Vanne X', famille: 'F1' }),
      ]),
    ])
    const article = frise.articles[0]
    assert.equal(article.designation, 'Vanne X')
    assert.equal(article.famille, 'F1')
  })

  test('désignation déjà connue → jamais écrasée par une entrée ultérieure nulle', ({ assert }) => {
    const frise = construireFrise([
      pas('2026-08-01', '2026-08-02', [
        entree({ article: 'A1', designation: 'Vanne X', famille: 'F1' }),
      ]),
      pas('2026-08-02', '2026-08-03', [
        entree({ article: 'A1', designation: null, famille: null }),
      ]),
    ])
    const article = frise.articles[0]
    assert.equal(article.designation, 'Vanne X')
    assert.equal(article.famille, 'F1')
  })
})

test.group('construireFrise — budget (#143 défaut 1)', () => {
  /** A1 : 3 mouvements, A2 : 1 mouvement — même fixture que le tri par volume. */
  const deuxArticles = [
    pas('2026-08-01', '2026-08-02', [
      entree({ article: 'A2' }),
      entree({ article: 'A1' }),
      entree({ article: 'A1' }),
    ]),
    pas('2026-08-02', '2026-08-03', [entree({ article: 'A1' })]),
  ]

  test('sans budget : comportement historique inchangé', ({ assert }) => {
    const sans = construireFrise(deuxArticles)
    const avecOptionsVides = construireFrise(deuxArticles, {})
    assert.deepEqual(avecOptionsVides, sans)
    assert.deepEqual(
      sans.articles.map((a) => ({ article: a.article, total: a.total, n: a.mouvements.length })),
      [
        { article: 'A1', total: 3, n: 3 },
        { article: 'A2', total: 1, n: 1 },
      ]
    )
  })

  test('budget consommé dans l’ordre de la frise : le premier article tronqué garde son total exact', ({
    assert,
  }) => {
    const frise = construireFrise(deuxArticles, { budget: 2 })
    // A1 arrive en tête (3 > 1) : il consomme tout le budget, tronqué à 2
    // mouvements bien que son total réel reste 3.
    assert.lengthOf(frise.articles, 1)
    assert.equal(frise.articles[0].article, 'A1')
    assert.equal(frise.articles[0].total, 3)
    assert.lengthOf(frise.articles[0].mouvements, 2)
    // A2 n'a plus aucun budget : écarté de la réponse, pas rendu à vide.
    assert.isUndefined(frise.articles.find((a) => a.article === 'A2'))
  })

  test('budget large : tous les articles sont servis, rien n’est tronqué', ({ assert }) => {
    const frise = construireFrise(deuxArticles, { budget: 1000 })
    assert.lengthOf(frise.articles, 2)
    assert.lengthOf(frise.articles[0].mouvements, 3)
    assert.lengthOf(frise.articles[1].mouvements, 1)
  })

  test('budget partagé entre deux articles : le second reçoit le reliquat', ({ assert }) => {
    const frise = construireFrise(deuxArticles, { budget: 4 })
    assert.lengthOf(frise.articles, 2)
    assert.equal(frise.articles[0].article, 'A1')
    assert.lengthOf(frise.articles[0].mouvements, 3)
    assert.equal(frise.articles[1].article, 'A2')
    assert.lengthOf(frise.articles[1].mouvements, 1)
  })

  test('les compteurs globaux et par article restent exacts, jamais bornés par le budget', ({
    assert,
  }) => {
    const sans = construireFrise(deuxArticles)
    const borne = construireFrise(deuxArticles, { budget: 1 })
    assert.equal(borne.total, sans.total)
    assert.deepEqual(borne.totalParNature, sans.totalParNature)
    assert.deepEqual(borne.totalParSource, sans.totalParSource)
    // Seul A1 est servi (budget = 1), mais son `total` reste 3, pas 1.
    assert.equal(borne.articles[0].total, 3)
    assert.lengthOf(borne.articles[0].mouvements, 1)
  })
})

test.group('construireFrise — mode d’appro remonté au groupe', () => {
  test('l’article porte l’appro de ses mouvements', ({ assert }) => {
    const f = construireFrise(
      [
        pas('2026-08-07', '2026-08-08', [
          entree({ article: 'A5495', approvisionnement: 'ACHAT' }),
          entree({ article: 'A5495', nature: 'apparue' }),
        ]),
      ],
      { budget: 10 }
    )
    assert.equal(f.articles[0].approvisionnement, 'ACHAT')
  })

  test('aucun mouvement enrichi → l’article ne prétend rien', ({ assert }) => {
    const f = construireFrise([pas('2026-08-07', '2026-08-08', [entree({ article: 'A1' })])], {
      budget: 10,
    })
    assert.isNull(f.articles[0].approvisionnement)
  })
})
