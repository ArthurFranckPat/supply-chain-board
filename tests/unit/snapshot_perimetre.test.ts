import { test } from '@japa/runner'
import { perimetreAvecJournal, perimetreComparable } from '#app/domain/snapshot_perimetre'

/**
 * La règle « ce qu'on a le droit de comparer » (#145), pure et hors base.
 *
 * Elle vivait dans une closure de factory de cache, au milieu de l'I/O — le
 * seul endroit du chemin qu'aucun test unitaire n'atteint sans base. Elle est
 * du domaine : c'est elle qui décide qu'une population de 5 469 lignes est un
 * fait métier ou un trou d'instrumentation.
 */

const ATTENDUES = [
  'of_ferme',
  'of_planifie',
  'of_suggestion',
  'demande_ferme',
  'demande_prevision',
  'stock',
  'appro',
  'appro_suggestion',
]

test.group('perimetreComparable', () => {
  test('périmètre identique : tout est comparé, rien n’est écarté', ({ assert }) => {
    const r = perimetreComparable(['stock', 'appro'], ['appro', 'stock'], ATTENDUES)
    assert.deepEqual(r.comparees, ['appro', 'stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('une source attendue absente de la photo AVANT est écartée, côté « avant »', ({
    assert,
  }) => {
    // Le cas de l'issue : `appro_suggestion` naît le 06/08, la photo du 04/08 ne
    // la connaît pas. Sans écartement, ses lignes remontent en bloc comme des
    // apparitions.
    const r = perimetreComparable(['stock'], ['stock', 'appro_suggestion'], ATTENDUES)
    assert.deepEqual(r.comparees, ['stock'])
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'appro_suggestion', manqueDans: 'avant', raison: 'inconnu' },
    ])
  })

  test('une source attendue absente de la photo APRÈS est écartée, côté « après »', ({
    assert,
  }) => {
    // Lecture opposée : capture perdue cette nuit-là, pas une source neuve.
    const r = perimetreComparable(['stock', 'appro'], ['stock'], ATTENDUES)
    assert.deepEqual(r.comparees, ['stock'])
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'appro', manqueDans: 'apres', raison: 'inconnu' },
    ])
  })

  test('une source NON attendue absente d’un côté reste comparée', ({ assert }) => {
    // Le garde-fou de l'approximation : on ne protège que ce qu'une photo
    // complète est censée contenir. Un nom retiré du modèle n'a aucune raison
    // d'échapper au diff — sa disparition est justement le fait à montrer.
    const r = perimetreComparable(['stock', 'legacy_source'], ['stock'], ATTENDUES)
    assert.deepEqual(r.comparees, ['legacy_source', 'stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('aucune source commune : périmètre vide, les deux côtés écartés', ({ assert }) => {
    const r = perimetreComparable(['stock'], ['of_ferme'], ATTENDUES)
    assert.isEmpty(r.comparees)
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'of_ferme', manqueDans: 'avant', raison: 'inconnu' },
      { source: 'stock', manqueDans: 'apres', raison: 'inconnu' },
    ])
  })

  test('les doublons de lignes n’altèrent pas le résultat', ({ assert }) => {
    // L'appelant passe la colonne `source` de CHAQUE ligne de la photo, pas une
    // liste distincte : 67 787 lignes pour 8 valeurs.
    const r = perimetreComparable(
      ['stock', 'stock', 'stock', 'appro'],
      ['appro', 'appro', 'stock'],
      ATTENDUES
    )
    assert.deepEqual(r.comparees, ['appro', 'stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('deux photos vides : rien à comparer, rien à écarter', ({ assert }) => {
    const r = perimetreComparable([], [], ATTENDUES)
    assert.isEmpty(r.comparees)
    assert.isEmpty(r.sourcesEcartees)
  })
})

test.group('perimetreAvecJournal (#149)', () => {
  const J = (entries: Array<[string, 'capturee' | 'vide' | 'echec']>) => new Map(entries)

  test('journal des deux côtés : echec écarte, vide reste comparé', ({ assert }) => {
    // Avant: of_suggestion capturee, Après: vide (0 ligne mais succès) -> disparition réelle, COMPARÉE
    const r = perimetreAvecJournal(
      ['stock', 'of_suggestion'],
      ['stock'],
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'capturee'],
      ]),
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'vide'],
      ]),
      ATTENDUES
    )
    assert.deepEqual(r.comparees.sort(), ['of_suggestion', 'stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('journal des deux côtés : echec d’un côté écarte avec raison echec', ({ assert }) => {
    const r = perimetreAvecJournal(
      ['stock'],
      ['stock'],
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'echec'],
      ]),
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'capturee'],
      ]),
      ATTENDUES
    )
    assert.deepEqual(r.comparees, ['stock'])
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'of_suggestion', manqueDans: 'avant', raison: 'echec' },
    ])
  })

  test('journal mixte : vide (succès, 0 ligne) vs présent côté sans journal -> comparé', ({
    assert,
  }) => {
    // Historique sans journal côté avant, journal récent côté après avec vide -> doit rester comparé
    const r = perimetreAvecJournal(
      ['stock', 'of_suggestion'],
      ['stock'],
      null,
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'vide'],
      ]),
      ATTENDUES
    )
    assert.include(r.comparees, 'of_suggestion')
    assert.deepEqual(r.sourcesEcartees, [])
  })

  test('journal mixte : echec côté journalisé écarte même sans journal en face', ({ assert }) => {
    const r = perimetreAvecJournal(
      ['stock'],
      ['stock'],
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'echec'],
      ]),
      null,
      ATTENDUES
    )
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'of_suggestion', manqueDans: 'avant', raison: 'echec' },
    ])
  })

  test('appro_message du journal ne pollue jamais le périmètre drivers', ({ assert }) => {
    const r = perimetreAvecJournal(
      ['stock'],
      ['stock'],
      J([
        ['stock', 'capturee'],
        ['appro_message', 'capturee'],
      ]),
      J([
        ['stock', 'capturee'],
        ['appro_message', 'echec'],
      ]),
      ATTENDUES
    )
    assert.deepEqual(r.comparees, ['stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('vide des deux côtés : comparé, pas écarté', ({ assert }) => {
    const r = perimetreAvecJournal(
      [],
      [],
      J([['stock', 'vide']]),
      J([['stock', 'vide']]),
      ATTENDUES
    )
    assert.deepEqual(r.comparees, ['stock'])
    assert.isEmpty(r.sourcesEcartees)
  })

  test('echec des deux côtés : écartée avec manqueDans « apres » (convention)', ({ assert }) => {
    // Convention documentée dans perimetreAvecJournal : quand les deux photos
    // sont en échec pour la même source, une seule entrée est écartée, côté
    // « apres » — l'essentiel est qu'elle sorte du diff, pas de quel côté.
    const r = perimetreAvecJournal(
      ['stock'],
      ['stock'],
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'echec'],
      ]),
      J([
        ['stock', 'capturee'],
        ['of_suggestion', 'echec'],
      ]),
      ATTENDUES
    )
    assert.deepEqual(r.comparees, ['stock'])
    assert.deepEqual(r.sourcesEcartees, [
      { source: 'of_suggestion', manqueDans: 'apres', raison: 'echec' },
    ])
  })
})
