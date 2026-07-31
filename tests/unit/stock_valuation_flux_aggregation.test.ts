import { test } from '@japa/runner'
import { aggregateFluxByArticlePeriod } from '#repositories/stock_valuation_repository'

/**
 * Fonctions pures extraites de `StockValuationRepository.getFluxByArticlePeriod()`
 * (#98, lot 3) — testables sans X3 ni SQLite. Couvre spécifiquement la classe de
 * bug déjà trouvée une fois en construisant ce lot : bucketing UTC vs heure
 * locale à la frontière d'une période.
 */
test.group('aggregateFluxByArticlePeriod', () => {
  test('cumule plusieurs documents du même article dans la même période (mois)', ({ assert }) => {
    const map = aggregateFluxByArticlePeriod(
      [
        { article: 'ART-1', jour: new Date('2026-07-05T00:00:00Z'), netDoc: 100 },
        { article: 'ART-1', jour: new Date('2026-07-20T00:00:00Z'), netDoc: -30 },
      ],
      'mois'
    )

    assert.equal(map.get('ART-1')?.get('2026-07'), 70)
  })

  test('sépare deux mois différents pour le même article', ({ assert }) => {
    const map = aggregateFluxByArticlePeriod(
      [
        { article: 'ART-1', jour: new Date('2026-06-30T00:00:00Z'), netDoc: 5 },
        { article: 'ART-1', jour: new Date('2026-07-01T00:00:00Z'), netDoc: 7 },
      ],
      'mois'
    )

    assert.equal(map.get('ART-1')?.get('2026-06'), 5)
    assert.equal(map.get('ART-1')?.get('2026-07'), 7)
  })

  test('ignore les lignes sans article', ({ assert }) => {
    const map = aggregateFluxByArticlePeriod(
      [{ article: '', jour: new Date('2026-07-05T00:00:00Z'), netDoc: 100 }],
      'mois'
    )

    assert.equal(map.size, 0)
  })

  test('grain semaine : bucket sur le lundi ISO', ({ assert }) => {
    // 2026-07-13 est un lundi ; 2026-07-19 (dimanche) tombe dans la même
    // semaine ISO, 2026-07-20 (lundi suivant) dans la suivante.
    const map = aggregateFluxByArticlePeriod(
      [
        { article: 'ART-1', jour: new Date('2026-07-13T00:00:00Z'), netDoc: 3 },
        { article: 'ART-1', jour: new Date('2026-07-19T00:00:00Z'), netDoc: 4 },
        { article: 'ART-1', jour: new Date('2026-07-20T00:00:00Z'), netDoc: 9 },
      ],
      'semaine'
    )

    const perPeriod = map.get('ART-1')
    assert.isDefined(perPeriod)
    assert.equal(
      [...perPeriod!.values()].reduce((a, b) => a + b, 0),
      16
    )
    assert.equal(perPeriod!.size, 2)
  })
})
