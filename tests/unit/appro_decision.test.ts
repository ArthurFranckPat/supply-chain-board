import { test } from '@japa/runner'
import {
  cleLogiqueSuggestion,
  cleLogiqueMessage,
  decisionEncoreValable,
  estOverride,
} from '#app/domain/appro_decision'

/**
 * Clés logiques du ledger (#134, décision #112) : la clé d'une suggestion doit
 * SURVIVRE à la recréation nocturne du CBN — donc ne dépendre ni du `VCRNUM`,
 * ni de l'échéance, ni de la quantité. Ce qui bouge est jugé à la lecture, avec
 * une vraie tolérance (±7 j, ±20 %) et non des bins : un déplacement d'un jour
 * ne doit jamais faire perdre une décision.
 */

test.group('cleLogiqueSuggestion — le couple fournisseur × article', () => {
  test('mêmes fournisseur et article → même clé, quelles que soient échéance et quantité', ({
    assert,
  }) => {
    assert.equal(
      cleLogiqueSuggestion('40025', '11028891'),
      cleLogiqueSuggestion('40025', '11028891')
    )
  })

  test('le fournisseur fait partie de la clé', ({ assert }) => {
    assert.notEqual(cleLogiqueSuggestion('F1', 'A'), cleLogiqueSuggestion('F2', 'A'))
  })

  test('l’article fait partie de la clé', ({ assert }) => {
    assert.notEqual(cleLogiqueSuggestion('F', 'A1'), cleLogiqueSuggestion('F', 'A2'))
  })

  test('le séparateur empêche la collision entre deux découpages', ({ assert }) => {
    assert.notEqual(cleLogiqueSuggestion('AB', 'C'), cleLogiqueSuggestion('A', 'BC'))
  })

  test('ne collisionne pas avec une clé de message', ({ assert }) => {
    assert.notEqual(cleLogiqueSuggestion('F', 'A'), cleLogiqueMessage('F', 1))
  })
})

test.group('decisionEncoreValable — tolérance #112 à la lecture', () => {
  const snap = { echeance: '2026-09-01', quantite: 100 }

  test('ligne identique → la décision vaut', ({ assert }) => {
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-09-01', quantite: 100 }))
  })

  test('un jour d’écart ne fait JAMAIS perdre la décision (régression du bucket)', ({ assert }) => {
    // Le fingerprint v1 mettait ces deux dates dans deux bins voisins : la
    // décision disparaissait pour un jour d'écart. C'est ce que ce test verrouille.
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-09-02', quantite: 100 }))
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-08-31', quantite: 100 }))
  })

  test('la tolérance d’échéance est symétrique et vaut ±7 j', ({ assert }) => {
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-09-08', quantite: 100 }))
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-08-25', quantite: 100 }))
    assert.isFalse(decisionEncoreValable(snap, { echeance: '2026-09-09', quantite: 100 }))
    assert.isFalse(decisionEncoreValable(snap, { echeance: '2026-08-24', quantite: 100 }))
  })

  test('la quantité tolère ±20 %, pas au-delà', ({ assert }) => {
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-09-01', quantite: 120 }))
    assert.isTrue(decisionEncoreValable(snap, { echeance: '2026-09-01', quantite: 84 }))
    assert.isFalse(decisionEncoreValable(snap, { echeance: '2026-09-01', quantite: 150 }))
    assert.isFalse(decisionEncoreValable(snap, { echeance: '2026-09-01', quantite: 50 }))
  })

  test('un même écart pèse pareil dans les deux sens', ({ assert }) => {
    const monte = decisionEncoreValable(
      { echeance: null, quantite: 100 },
      {
        echeance: null,
        quantite: 130,
      }
    )
    const descend = decisionEncoreValable(
      { echeance: null, quantite: 130 },
      {
        echeance: null,
        quantite: 100,
      }
    )
    assert.equal(monte, descend)
    assert.isFalse(monte)
  })

  test('deux échéances absentes s’apparient', ({ assert }) => {
    assert.isTrue(
      decisionEncoreValable(
        { echeance: null, quantite: 10 },
        {
          echeance: null,
          quantite: 10,
        }
      )
    )
  })

  test('une échéance apparue ou disparue invalide la décision', ({ assert }) => {
    assert.isFalse(decisionEncoreValable(snap, { echeance: null, quantite: 100 }))
    assert.isFalse(decisionEncoreValable({ echeance: null, quantite: 100 }, snap))
  })
})

test.group('estOverride — la décision contredit le verdict (#134)', () => {
  test('« ignorer » sur un verdict d’action → override', ({ assert }) => {
    assert.isTrue(estOverride('passer', 'ignorer'))
    assert.isTrue(estOverride('replanifier', 'ignorer'))
    assert.isTrue(estOverride('regrouper', 'ignorer'))
  })

  test('« à passer » sur « surveiller » → override', ({ assert }) => {
    assert.isTrue(estOverride('surveiller', 'a_passer'))
  })

  test('pas d’override quand la décision suit le verdict', ({ assert }) => {
    assert.isFalse(estOverride('passer', 'a_passer'))
    assert.isFalse(estOverride('surveiller', 'vu'))
    assert.isFalse(estOverride('investiguer', 'ignorer'))
    assert.isFalse(estOverride(undefined, 'vu'))
  })
})

test.group('cleLogiqueMessage', () => {
  test('clé stable VCRNUM:VCRLIN (#107)', ({ assert }) => {
    assert.equal(cleLogiqueMessage('CG2601534', 6000), 'M:CG2601534:6000')
    assert.equal(cleLogiqueMessage('CG2601534', 6000), cleLogiqueMessage('CG2601534', 6000))
  })
})
