import { test } from '@japa/runner'
import { autoEvaluation, estOverride } from '#app/domain/appro_decision'
import type { ApproDecisionStatut } from '#app/domain/appro_decision'

const decision = (over: {
  causePredit?: string | null
  verdictPredit?: string | null
  niveauPredit?: string | null
  statut?: ApproDecisionStatut
}) => ({
  causePredit: over.causePredit ?? null,
  verdictPredit: over.verdictPredit ?? null,
  niveauPredit: over.niveauPredit ?? null,
  statut: over.statut ?? ('vu' as ApproDecisionStatut),
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

  test('concordance : part des « à passer » quand le moteur corrélait avec la source', ({
    assert,
  }) => {
    // « à passer » sur un verdict « replanifier » n'est pas un override : c'est
    // l'acheteur qui suit. Le taux d'override seul ne sait pas le dire.
    const result = autoEvaluation([
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'a_passer' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'a_passer' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'vu' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'ignorer' }),
    ])

    const stock = result.parSource[0]
    assert.equal(stock.concordance, 0.5)
    assert.equal(stock.taux, 0.25)
  })

  test('un « à passer » qui contredit « surveiller » n’est PAS une concordance', ({ assert }) => {
    // estOverride définit a_passer vs surveiller comme un override : compter ce
    // geste dans la concordance ET les overrides affichait 100 % des deux pour
    // la même source — le moteur « suivi » et « contredit » à la fois.
    const result = autoEvaluation([
      decision({ causePredit: 'stock', verdictPredit: 'surveiller', statut: 'a_passer' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'a_passer' }),
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'a_passer' }),
    ])

    const stock = result.parSource[0]
    assert.equal(stock.total, 3)
    assert.equal(stock.overrides, 1)
    assert.equal(stock.taux, 0.33)
    assert.equal(stock.concordance, 0.67)
  })
})

test.group('autoEvaluation — par niveau affiché', () => {
  test('agrège les overrides sous le badge que l’acheteur avait à l’écran', ({ assert }) => {
    const result = autoEvaluation([
      decision({
        causePredit: 'stock',
        niveauPredit: 'directe',
        verdictPredit: 'replanifier',
        statut: 'a_passer',
      }),
      decision({
        causePredit: 'stock',
        niveauPredit: 'correlation',
        verdictPredit: 'replanifier',
        statut: 'ignorer',
      }),
      decision({
        causePredit: 'appro',
        niveauPredit: 'correlation',
        verdictPredit: 'replanifier',
        statut: 'ignorer',
      }),
    ])

    const directe = result.parNiveau.find((n) => n.niveau === 'directe')
    const correlation = result.parNiveau.find((n) => n.niveau === 'correlation')
    assert.equal(directe?.taux, 0)
    assert.equal(correlation?.total, 2)
    assert.equal(correlation?.taux, 1)
  })

  test('les décisions figées avant le suivi du niveau restent hors de l’agrégat', ({ assert }) => {
    const result = autoEvaluation([
      decision({ causePredit: 'stock', verdictPredit: 'replanifier', statut: 'ignorer' }),
    ])

    assert.equal(result.total, 1)
    assert.lengthOf(result.parNiveau, 0)
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
