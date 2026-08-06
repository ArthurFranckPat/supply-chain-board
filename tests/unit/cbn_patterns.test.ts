import { test } from '@japa/runner'
import { detectPatterns } from '#app/domain/cbn_patterns'
import type { ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'
import type { CbnExplanation } from '#app/domain/cbn_explanation'

const ligne = (over: Partial<ApproMessageSnapshotRow>): ApproMessageSnapshotRow => ({
  snapshot_date: '2026-08-06',
  vcrnum: 'CG2601534',
  vcrlin: 6000,
  vcrseq: '1000',
  itmref: 'A7399',
  fournisseur: '16012',
  mrpmes: 2,
  mrpdat: '2026-08-17',
  enddat: '2026-08-19',
  quantity: 100,
  ...over,
})

const explication = (article: string, sources: string[]): CbnExplanation => ({
  cle: `${article}:1:1`,
  article,
  fournisseur: null,
  mrpmes: 2,
  natureMessage: 'apparue',
  correlations: sources.map((source, i) => ({
    source,
    nature: 'quantite',
    detail: `${source} a bougé.`,
    poids: 3 - i,
    part: 0.5,
    confiance: 0.9,
  })),
  contradictions: [],
  niveau: 'directe',
  couverture: 1,
  synthese: 'Synthèse.',
})

test.group('detectPatterns — articles volatils', () => {
  test('un article avec un message par jour sur 7 jours est volatil', ({ assert }) => {
    const lignes: ApproMessageSnapshotRow[] = []
    for (let j = 0; j < 7; j += 1) {
      const date = `2026-08-${String(1 + j).padStart(2, '0')}`
      lignes.push(ligne({ snapshot_date: date }))
    }
    const patterns = detectPatterns(lignes, [], 7)

    assert.equal(patterns.joursCouverts, 7)
    assert.lengthOf(patterns.articles, 1)
    assert.equal(patterns.articles[0].messagesSemaine, 7)
    assert.equal(patterns.articles[0].volatilite, 'haute')
  })

  test('deux messages sur 8 jours calendaires : fréquence hebdo et source dominante', ({
    assert,
  }) => {
    const lignes = [ligne({ snapshot_date: '2026-08-01' }), ligne({ snapshot_date: '2026-08-08' })]
    const explications = [
      explication('A7399', ['stock']),
      explication('A7399', ['stock']),
      explication('A7399', ['demande_ferme']),
    ]
    const patterns = detectPatterns(lignes, explications, 21)

    // Étendue calendaire 01→08 = 8 jours : 2 messages / 8 j × 7 = 1,75
    assert.equal(patterns.articles[0].messagesSemaine, 1.8)
    assert.equal(patterns.articles[0].volatilite, 'moyenne')
    assert.equal(patterns.articles[0].sourceDominante, 'stock')
    assert.equal(patterns.articles[0].partSourceDominante, 0.67)
  })

  test('deux articles : tri par fréquence décroissante', ({ assert }) => {
    const lignes = [
      ligne({ snapshot_date: '2026-08-01', itmref: 'VOLATILE' }),
      ligne({ snapshot_date: '2026-08-02', itmref: 'VOLATILE' }),
      ligne({ snapshot_date: '2026-08-03', itmref: 'VOLATILE' }),
      ligne({ snapshot_date: '2026-08-08', itmref: 'VOLATILE' }),
      ligne({ snapshot_date: '2026-08-15', itmref: 'VOLATILE' }),
      ligne({ snapshot_date: '2026-08-01', itmref: 'STABLE' }),
    ]
    const patterns = detectPatterns(lignes, [], 21)

    assert.equal(patterns.articles[0].article, 'VOLATILE')
    assert.equal(patterns.articles[1].article, 'STABLE')
    // Étendue calendaire 01→15 = 15 jours.
    // VOLATILE : 5 messages / 15 j × 7 = 2,3 /semaine → haute
    // STABLE : 1 message / 15 j × 7 = 0,5 /semaine → basse (seuil ≥ 0,5)
    assert.equal(patterns.articles[0].volatilite, 'haute')
    assert.equal(patterns.articles[1].volatilite, 'basse')
  })
})

test.group('detectPatterns — fournisseurs problématiques', () => {
  test('part des réceptions glissées par fournisseur', ({ assert }) => {
    const lignes = [
      // Deux messages du fournisseur 16012 sur deux articles
      ligne({ itmref: 'A1', fournisseur: '16012' }),
      ligne({ itmref: 'A2', fournisseur: '16012' }),
      // Un message d'un autre fournisseur
      ligne({ itmref: 'A3', fournisseur: '99999' }),
    ]
    const explications = [
      explication('A1', ['appro']),
      explication('A2', ['stock']),
      explication('A3', ['stock']),
    ]
    const patterns = detectPatterns(lignes, explications, 21)
    const fournisseur = patterns.fournisseurs.find((f) => f.fournisseur === '16012')

    assert.ok(fournisseur)
    assert.equal(fournisseur?.nbMessages, 2)
    assert.equal(fournisseur?.partReceptionsGlissees, 0.5)
  })

  test('fournisseur sans cause connue : part null, pas de fausse division', ({ assert }) => {
    const lignes = [ligne({ itmref: 'A1', fournisseur: '16012' })]
    const patterns = detectPatterns(lignes, [], 21)

    assert.equal(patterns.fournisseurs[0].partReceptionsGlissees, null)
  })
})
