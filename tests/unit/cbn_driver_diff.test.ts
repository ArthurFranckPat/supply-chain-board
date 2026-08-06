import { test } from '@japa/runner'
import { diffCbnDrivers } from '#app/domain/cbn_driver_diff'
import type { DemandSnapshotRow } from '#services/demand_snapshot_service'

const row = (over: Partial<DemandSnapshotRow>): DemandSnapshotRow => ({
  snapshot_date: '2026-08-06',
  source: 'stock',
  itmref: 'A7399',
  vcrnum: null,
  vcrlin: null,
  quantity: 1200,
  date_echeance: null,
  fournisseur: null,
  ...over,
})

test.group('cbn_driver_diff — stock', () => {
  test('stock 1200→740 au-delà de 20% → quantite', ({ assert }) => {
    const diff = diffCbnDrivers([row({ quantity: 1200 })], [row({ quantity: 740 })])
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'quantite')
    assert.equal(diff[0].source, 'stock')
  })

  test('stock 1000→1100 dans 20% → rien', ({ assert }) => {
    assert.deepEqual(diffCbnDrivers([row({ quantity: 1000 })], [row({ quantity: 1100 })]), [])
  })

  test('stock inchangé → rien', ({ assert }) => {
    assert.deepEqual(diffCbnDrivers([row({ quantity: 500 })], [row({ quantity: 500 })]), [])
  })
})

test.group('cbn_driver_diff — demande et appro', () => {
  test('demande_ferme apparue → apparue', ({ assert }) => {
    const diff = diffCbnDrivers(
      [],
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })]
    )
    assert.equal(diff[0].nature, 'apparue')
  })

  test('demande_ferme disparue → disparue', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })],
      []
    )
    assert.equal(diff[0].nature, 'disparue')
  })

  test('demande quantité +30% → quantite', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 1000, date_echeance: '2026-09-01' })],
      [row({ source: 'demande_ferme', quantity: 1300, date_echeance: '2026-09-01' })]
    )
    assert.isTrue(diff.some((d) => d.nature === 'quantite'))
  })

  test('réception retardée 15j → date', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-05' })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-20' })]
    )
    assert.isTrue(diff.some((d) => d.nature === 'date'))
  })

  test('réception retardée 5j dans tolérance → rien', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-05' })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-10' })]
    )
    assert.deepEqual(diff, [])
  })

  test('deux articles indépendants → deux entrées', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ itmref: 'A1', source: 'stock', quantity: 100 })],
      [
        row({ itmref: 'A1', source: 'stock', quantity: 50 }),
        row({ itmref: 'A2', source: 'demande_ferme', quantity: 100, date_echeance: '2026-09-01' }),
      ]
    )
    assert.equal(diff.filter((d) => d.article === 'A1').length, 1)
    assert.equal(diff.filter((d) => d.article === 'A2').length, 1)
  })
})
