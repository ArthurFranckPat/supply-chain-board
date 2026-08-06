import { test } from '@japa/runner'
import { autoEvaluation, estOverride } from '#app/domain/appro_decision'
import type { ApproDecisionStatut } from '#app/domain/appro_decision'

const decision = (over: {
  causePredit?: string | null
  verdictPredit?: string | null
  statut?: ApproDecisionStatut
}) => ({
  causePredit: over.causePredit ?? null,
  verdictPredit: over.verdictPredit ?? null,
  statut: over.statut ?? 'vu',
})

test.group('autoEvaluation — taux d’override par source', () => {
  test('une décision sans source prédite n’est pas comptée', ({ assert }) => {
    const result = autoEvaluation([decision({})])

    assert.equal(result.total, 0)
    assert.equal(result.tauxGlobal, null)
    assert.lengthOf(result.parSource, 0)
  })

  test('agrège par source et compte les overrides', ({ assert }) => {
    // source stock : 2 décisions, 1 override (ignorer sur replanifier)
    // source appro : 1 décision, 0 override (vu)
    const result = autoEvaluation([
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'ignorer' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'vu' }),
      decision({ causePredit: 'appro', verdictPredit: 'replanifier', statut: 'vu' }),
    ])

    assert.equal(result.total, 3)
    assert.equal(result.overrides, 1)
    assert.equal(result.tauxGlobal, 0.33)
    const stock = result.parSource.find((c) => c.source === 'stock')
    assert.equal(stock?.total, 2)
    assert.equal(stock?.overrides, 1)
    assert.equal(stock?.taux, 0.5)
  })

  test('tri par volume décroissant', ({ assert }) => {
    const result = autoEvaluation([
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'vu' }),
      decision({ causePredit: 'appro', verdictPredit: 'replanifier', statut: 'vu' }),
      decision({ causePredit: 'appro', verdictPredit: 'replanifier', statut: 'vu' }),
    ])

    assert.equal(result.parSource[0].source, 'appro')
  })
})

test.group('estOverride — rappel des règles existantes', () => {
  test('ignorer contredit passer/replanifier/regrouper', ({ assert }) => {
    assert.isTrue(estOverride('replanifier', 'ignorer'))
    assert.isTrue(estOverride('passer', 'ignorer'))
    assert.isFalse(estOverride('surveiller', 'ignorer'))
  })

  test('à passer contredit surveiller', ({ assert }) => {
    assert.isTrue(estOverride('surveiller', 'a_passer'))
    assert.isFalse(estOverride('replanifier', 'a_passer'))
  })
})
