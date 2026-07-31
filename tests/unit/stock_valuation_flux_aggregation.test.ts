import { test } from '@japa/runner'
import {
  aggregateFluxByArticlePeriod,
  replicaCoversFluxRange,
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

/**
 * Couverture d'historique — question de DONNÉES, propre à cette table (seule
 * réplique interrogée sur une plage arbitraire). La question de TEMPS (« le
 * dernier run est-il assez récent ») vit dans `ReplicaGate` et se teste là-bas.
 */
test.group('replicaCoversFluxRange', () => {
  const from = new Date('2026-06-01T00:00:00Z')

  test('couvert quand coverageMin est antérieur à from', ({ assert }) => {
    assert.isTrue(replicaCoversFluxRange(new Date('2026-01-01T00:00:00Z'), from))
  })

  test('couvert quand coverageMin tombe exactement sur from (borne incluse)', ({ assert }) => {
    assert.isTrue(replicaCoversFluxRange(new Date('2026-06-01T00:00:00Z'), from))
  })

  test('non couvert si from déborde coverageMin (plage pinned plus ancienne)', ({ assert }) => {
    assert.isFalse(replicaCoversFluxRange(new Date('2026-06-15T00:00:00Z'), from))
  })

  test('non couvert pour une table vide (coverageMin null)', ({ assert }) => {
    assert.isFalse(replicaCoversFluxRange(null, from))
  })

  test('une réplique sans mouvement récent reste couvrante — la régression visée', ({ assert }) => {
    // La couverture se juge sur la borne BASSE. Une table dont la donnée la plus
    // récente date de plusieurs jours (aucun mouvement STOJOU depuis) répond
    // parfaitement pour un `from` récent : c'est le cas où l'ancien
    // `MAX(jour) >= today` rejetait à tort une réplique fraîchement synchronisée.
    assert.isTrue(replicaCoversFluxRange(new Date('2025-08-01T00:00:00Z'), from))
  })
})
