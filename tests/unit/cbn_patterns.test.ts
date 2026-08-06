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

const explication = (
  article: string,
  sources: string[],
  over: Partial<CbnExplanation> = {}
): CbnExplanation => ({
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
    amplitude: 100,
    part: 0.5,
    confiance: 0.9,
  })),
  contradictions: [],
  niveau: 'directe',
  couverture: 1,
  residuInexplique: 0,
  synthese: 'Synthèse.',
  ...over,
})

test.group('detectPatterns — articles volatils', () => {
  test('un message qui dure 7 jours compte pour UN, pas pour sept', ({ assert }) => {
    // Même clé stable (VCRNUM:VCRLIN:VCRSEQ) sur 7 photos consécutives : c'est
    // un message qui persiste, pas sept messages. Le compter par ligne
    // classait les messages les plus vieux en tête des « volatils ».
    const lignes: ApproMessageSnapshotRow[] = []
    for (let j = 0; j < 7; j += 1) {
      lignes.push(ligne({ snapshot_date: `2026-08-0${1 + j}` }))
    }
    const patterns = detectPatterns(lignes, [], 7)

    assert.equal(patterns.joursCouverts, 7)
    assert.lengthOf(patterns.articles, 1)
    assert.equal(patterns.articles[0].nbMessages, 1)
    assert.equal(patterns.articles[0].joursSousMessage, 7)
    assert.equal(patterns.articles[0].messagesSemaine, 1)
    assert.equal(patterns.articles[0].volatilite, 'moyenne')
  })

  test('sept messages DISTINCTS sur sept jours : article volatil', ({ assert }) => {
    const lignes: ApproMessageSnapshotRow[] = []
    for (let j = 0; j < 7; j += 1) {
      lignes.push(ligne({ snapshot_date: `2026-08-0${1 + j}`, vcrlin: 6000 + j }))
    }
    const patterns = detectPatterns(lignes, [], 7)

    assert.equal(patterns.articles[0].nbMessages, 7)
    assert.equal(patterns.articles[0].messagesSemaine, 7)
    assert.equal(patterns.articles[0].volatilite, 'haute')
  })

  test('la source dominante s’agrège sur TOUS les diffs de la fenêtre', ({ assert }) => {
    // Trois diffs : stock deux fois, demande_ferme une fois → stock domine à
    // 2/3. Un diff unique étalé sur la fenêtre ne pourrait pas voir ça.
    const lignes = [ligne({ snapshot_date: '2026-08-01' }), ligne({ snapshot_date: '2026-08-08' })]
    const diffs = [
      [explication('A7399', ['stock'])],
      [explication('A7399', ['stock'])],
      [explication('A7399', ['demande_ferme'])],
    ]
    const patterns = detectPatterns(lignes, diffs, 21)

    assert.equal(patterns.diffsAnalyses, 3)
    assert.equal(patterns.articles[0].sourceDominante, 'stock')
    assert.equal(patterns.articles[0].partSourceDominante, 0.67)
    assert.equal(patterns.articles[0].diffsExpliques, 3)
  })

  test('deux articles : tri par fréquence décroissante', ({ assert }) => {
    const lignes = [
      ligne({ snapshot_date: '2026-08-01', itmref: 'VOLATILE', vcrlin: 1 }),
      ligne({ snapshot_date: '2026-08-02', itmref: 'VOLATILE', vcrlin: 2 }),
      ligne({ snapshot_date: '2026-08-03', itmref: 'VOLATILE', vcrlin: 3 }),
      ligne({ snapshot_date: '2026-08-08', itmref: 'VOLATILE', vcrlin: 4 }),
      ligne({ snapshot_date: '2026-08-15', itmref: 'VOLATILE', vcrlin: 5 }),
      ligne({ snapshot_date: '2026-08-01', itmref: 'STABLE', vcrlin: 6 }),
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
  test('part des réceptions glissées, sur messages distincts', ({ assert }) => {
    const lignes = [
      // Deux messages du fournisseur 16012 sur deux articles, l'un présent
      // deux jours : il ne doit peser qu'une fois.
      ligne({ itmref: 'A1', fournisseur: '16012', vcrlin: 1, snapshot_date: '2026-08-05' }),
      ligne({ itmref: 'A1', fournisseur: '16012', vcrlin: 1, snapshot_date: '2026-08-06' }),
      ligne({ itmref: 'A2', fournisseur: '16012', vcrlin: 2 }),
      ligne({ itmref: 'A3', fournisseur: '99999', vcrlin: 3 }),
    ]
    const diffs = [
      [explication('A1', ['appro']), explication('A2', ['stock']), explication('A3', ['stock'])],
    ]
    const patterns = detectPatterns(lignes, diffs, 21)
    const fournisseur = patterns.fournisseurs.find((f) => f.fournisseur === '16012')

    assert.ok(fournisseur)
    assert.equal(fournisseur?.nbMessages, 2)
    assert.equal(fournisseur?.partReceptionsGlissees, 0.5)
  })

  test('fournisseur sans source connue : part null, pas de fausse division', ({ assert }) => {
    const lignes = [ligne({ itmref: 'A1', fournisseur: '16012' })]
    const patterns = detectPatterns(lignes, [], 21)

    assert.equal(patterns.fournisseurs[0].partReceptionsGlissees, null)
  })

  test('les fournisseurs à réceptions glissées passent devant les gros volumes', ({ assert }) => {
    const lignes = [
      ligne({ itmref: 'A1', fournisseur: 'GLISSE', vcrlin: 1 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 2 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 3 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 4 }),
    ]
    const diffs = [[explication('A1', ['appro']), explication('A2', ['stock'])]]
    const patterns = detectPatterns(lignes, diffs, 21)

    assert.equal(patterns.fournisseurs[0].fournisseur, 'GLISSE')
    assert.equal(patterns.fournisseurs[0].partReceptionsGlissees, 1)
  })
})

test.group('detectPatterns — qualité mesurée', () => {
  test('taux de non expliqué et résidu moyen sur le diff le plus récent', ({ assert }) => {
    const lignes = [ligne({ itmref: 'A1', vcrlin: 1 }), ligne({ itmref: 'A2', vcrlin: 2 })]
    const recent = [
      explication('A1', ['stock'], { couverture: 0.8, residuInexplique: 0.2 }),
      explication('A2', [], { niveau: 'non_explique', couverture: 0, residuInexplique: 1 }),
    ]
    // Le diff plus ancien ne doit PAS entrer dans la mesure de qualité.
    const ancien = [explication('A1', ['stock'])]
    const patterns = detectPatterns(lignes, [recent, ancien], 21)

    assert.equal(patterns.qualite.messages, 2)
    assert.equal(patterns.qualite.nonExpliques, 1)
    assert.equal(patterns.qualite.tauxNonExplique, 0.5)
    assert.equal(patterns.qualite.couvertureMoyenne, 0.8)
    assert.equal(patterns.qualite.residuMoyen, 0.6)
  })

  test('aucune explication : métriques nulles, jamais de division par zéro', ({ assert }) => {
    const patterns = detectPatterns([ligne({})], [], 21)

    assert.equal(patterns.qualite.messages, 0)
    assert.equal(patterns.qualite.tauxNonExplique, null)
    assert.equal(patterns.qualite.couvertureMoyenne, null)
    assert.equal(patterns.qualite.residuMoyen, null)
  })
})
