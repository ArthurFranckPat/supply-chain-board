import { test } from '@japa/runner'
import {
  aggregateFluxByArticlePeriod,
  replicaEligibleForFlux,
} from '#repositories/stock_valuation_repository'

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

test.group('replicaEligibleForFlux', () => {
  const from = new Date('2026-06-01T00:00:00Z')
  const ONE_HOUR = 60 * 60 * 1000
  const maxAgeMs = 6 * ONE_HOUR

  test('éligible quand from ≥ coverageMin et le run est assez récent', ({ assert }) => {
    const ok = replicaEligibleForFlux(
      { coverageMin: new Date('2026-01-01T00:00:00Z'), ageMs: ONE_HOUR },
      from,
      maxAgeMs
    )
    assert.isTrue(ok)
  })

  test('inéligible si le dernier run est trop vieux, même avec assez d’historique', ({
    assert,
  }) => {
    const ok = replicaEligibleForFlux(
      { coverageMin: new Date('2026-01-01T00:00:00Z'), ageMs: 7 * ONE_HOUR },
      from,
      maxAgeMs
    )
    assert.isFalse(ok)
  })

  test('inéligible si from déborde coverageMin (plage pinned plus ancienne)', ({ assert }) => {
    const ok = replicaEligibleForFlux(
      { coverageMin: new Date('2026-06-15T00:00:00Z'), ageMs: ONE_HOUR },
      from,
      maxAgeMs
    )
    assert.isFalse(ok)
  })

  test('inéligible pour une table jamais ingérée (coverageMin/ageMs null)', ({ assert }) => {
    const ok = replicaEligibleForFlux({ coverageMin: null, ageMs: null }, from, maxAgeMs)
    assert.isFalse(ok)
  })

  test('un jour sans mouvement récent (MAX(jour) en retard) ne bloque PAS l’éligibilité — la régression visée', ({
    assert,
  }) => {
    // Un run vieux de 10 min mais où la donnée la plus récente ingérée date de
    // plusieurs jours (aucun mouvement STOJOU depuis) doit rester éligible :
    // c'est exactement le cas où l'ancien `MAX(jour) >= today` rejetait à tort
    // une réplique fraîchement synchronisée.
    const ok = replicaEligibleForFlux(
      { coverageMin: new Date('2025-08-01T00:00:00Z'), ageMs: 10 * 60 * 1000 },
      from,
      maxAgeMs
    )
    assert.isTrue(ok)
  })
})
