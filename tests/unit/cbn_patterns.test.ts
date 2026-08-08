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

/** Jours de photo de la fenêtre (du plus récent au plus ancien). */
const photos = (...dates: string[]): string[] => [...dates].sort().reverse()

test.group('detectPatterns — articles volatils', () => {
  test('un message qui dure 7 jours compte pour UN, pas pour sept', ({ assert }) => {
    // Même clé stable (VCRNUM:VCRLIN:VCRSEQ) sur 7 photos consécutives : c'est
    // un message qui persiste, pas sept messages. Le compter par ligne
    // classait les messages les plus vieux en tête des « volatils ».
    const lignes: ApproMessageSnapshotRow[] = []
    for (let j = 0; j < 7; j += 1) {
      lignes.push(ligne({ snapshot_date: `2026-08-0${1 + j}` }))
    }
    const patterns = detectPatterns(
      lignes,
      [],
      7,
      photos(
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07'
      )
    )

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
    const patterns = detectPatterns(
      lignes,
      [],
      7,
      photos(
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
        '2026-08-04',
        '2026-08-05',
        '2026-08-06',
        '2026-08-07'
      )
    )

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
    const patterns = detectPatterns(lignes, diffs, 21, photos('2026-08-08', '2026-08-01'))

    assert.equal(patterns.diffsAnalyses, 3)
    assert.equal(patterns.articles[0].sourceDominante, 'stock')
    assert.equal(patterns.articles[0].partSourceDominante, 0.67)
    assert.equal(patterns.articles[0].diffsExpliques, 3)
  })

  test('un message unique au milieu d’une fenêtre de 21 jours : fréquence réelle', ({ assert }) => {
    // Avant la revue, l'étendue venait des dates PORTÉES PAR LES LIGNES : une
    // seule photo avec message → 1 jour → 7 messages/semaine → « haute
    // volatilité » pour un événement unique dans une fenêtre de 21 jours.
    // L'étendue doit être celle des jours de PHOTO de la fenêtre, y compris
    // ceux sans message.
    const photos21 = Array.from({ length: 21 }, (_, i) => {
      const j = i + 1
      return `2026-08-${String(j).padStart(2, '0')}`
    }).reverse()
    const lignes = [ligne({ snapshot_date: '2026-08-10' })]
    const patterns = detectPatterns(lignes, [], 21, photos21)

    assert.equal(patterns.joursCouverts, 21)
    assert.equal(patterns.avant, '2026-08-01')
    assert.equal(patterns.apres, '2026-08-21')
    assert.equal(patterns.articles[0].nbMessages, 1)
    assert.equal(patterns.articles[0].messagesSemaine, 0.3)
    assert.equal(patterns.articles[0].volatilite, 'basse')
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
    const patterns = detectPatterns(
      lignes,
      [],
      21,
      photos('2026-08-15', '2026-08-08', '2026-08-03', '2026-08-02', '2026-08-01')
    )

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
      [
        explication('A1', ['appro'], { cle: 'CG2601534:1:1000' }),
        explication('A2', ['stock'], { cle: 'CG2601534:2:1000' }),
        explication('A3', ['stock'], { cle: 'CG2601534:3:1000' }),
      ],
    ]
    const patterns = detectPatterns(lignes, diffs, 21, photos('2026-08-06', '2026-08-05'))
    const fournisseur = patterns.fournisseurs.find((f) => f.fournisseur === '16012')

    assert.ok(fournisseur)
    assert.equal(fournisseur?.nbMessages, 2)
    assert.equal(fournisseur?.partReceptionsGlissees, 0.5)
  })

  test('la part fournisseur suit l’explication de CHAQUE message, pas celle de l’article', ({
    assert,
  }) => {
    // Trois messages du MÊME article, expliqués différemment (appro, stock,
    // inconnu). La dominance par ARTICLE dirait « appro » (ex-aequo, premier
    // gagnant) et classerait les trois en réceptions glissées → 100 % ; la
    // dominance par message doit donner 1/3 ≈ 0,33, et le message sans
    // explication compter dans le dénominateur (revue lot 2).
    const lignes = [
      ligne({ itmref: 'A1', fournisseur: '16012', vcrlin: 6000 }),
      ligne({ itmref: 'A1', fournisseur: '16012', vcrlin: 6001 }),
      ligne({ itmref: 'A1', fournisseur: '16012', vcrlin: 6002 }),
    ]
    const diffs = [
      [
        explication('A1', ['appro'], { cle: 'CG2601534:6000:1000' }),
        explication('A1', ['stock'], { cle: 'CG2601534:6001:1000' }),
      ],
    ]
    const patterns = detectPatterns(lignes, diffs, 21, photos('2026-08-06'))
    const fournisseur = patterns.fournisseurs.find((f) => f.fournisseur === '16012')

    assert.ok(fournisseur)
    assert.equal(fournisseur?.nbMessages, 3)
    assert.equal(fournisseur?.partReceptionsGlissees, 0.33)
    assert.equal(patterns.articles[0].sourceDominante, 'appro')
  })

  test('fournisseur sans source connue : part null, pas de fausse division', ({ assert }) => {
    const lignes = [ligne({ itmref: 'A1', fournisseur: '16012' })]
    const patterns = detectPatterns(lignes, [], 21, photos('2026-08-06'))

    assert.equal(patterns.fournisseurs[0].partReceptionsGlissees, null)
  })

  test('les fournisseurs à réceptions glissées passent devant les gros volumes', ({ assert }) => {
    const lignes = [
      ligne({ itmref: 'A1', fournisseur: 'GLISSE', vcrlin: 1 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 2 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 3 }),
      ligne({ itmref: 'A2', fournisseur: 'VOLUME', vcrlin: 4 }),
    ]
    const diffs = [
      [
        explication('A1', ['appro'], { cle: 'CG2601534:1:1000' }),
        explication('A2', ['stock'], { cle: 'CG2601534:2:1000' }),
      ],
    ]
    const patterns = detectPatterns(lignes, diffs, 21, photos('2026-08-06'))

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
    const patterns = detectPatterns(
      lignes,
      [recent, ancien],
      21,
      photos('2026-08-06', '2026-08-01')
    )

    assert.equal(patterns.qualite.messages, 2)
    assert.equal(patterns.qualite.nonExpliques, 1)
    assert.equal(patterns.qualite.tauxNonExplique, 0.5)
    assert.equal(patterns.qualite.couvertureMoyenne, 0.8)
    assert.equal(patterns.qualite.residuMoyen, 0.6)
  })

  test('aucune explication : métriques nulles, jamais de division par zéro', ({ assert }) => {
    const patterns = detectPatterns([ligne({})], [], 21, photos('2026-08-06'))

    assert.equal(patterns.qualite.messages, 0)
    assert.equal(patterns.qualite.tauxNonExplique, null)
    assert.equal(patterns.qualite.couvertureMoyenne, null)
    assert.equal(patterns.qualite.residuMoyen, null)
  })
})
