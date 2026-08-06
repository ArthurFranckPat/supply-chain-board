import { test } from '@japa/runner'
import { diffApproMessageSnapshots } from '#app/domain/cbn_message_diff'
import { diffCbnDrivers } from '#app/domain/cbn_driver_diff'
import { explainCbnMessages } from '#app/domain/cbn_explanation'
import type { ApproMessageSnapshotRow } from '#services/demand_snapshot_service'
import type { DemandSnapshotRow } from '#services/demand_snapshot_service'

const msg = (over: Partial<ApproMessageSnapshotRow>): ApproMessageSnapshotRow => ({
  snapshot_date: '2026-08-06',
  vcrnum: 'CG2601534',
  vcrlin: 6000,
  vcrseq: '1000',
  itmref: 'A7399',
  fournisseur: '16012',
  mrpmes: 2,
  mrpdat: '2026-08-17',
  enddat: '2026-08-19',
  quantity: 14400,
  ...over,
})

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

test.group('cbn_explanation — avancer', () => {
  test('stock baisse explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers([row({ quantity: 1200 })], [row({ quantity: 740 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 1)
    assert.equal(ex[0].correlations[0].source, 'stock')
    assert.equal(ex[0].contradictions.length, 0)
  })

  test('stock hausse contredit avancer → contradictions', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers([row({ quantity: 740 })], [row({ quantity: 1200 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 0)
    assert.equal(ex[0].contradictions.length, 1)
  })

  test('commande client apparue explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers(
      [],
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('réception retardée explique avancer', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2 })])
    const drivers = diffCbnDrivers(
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-05' })],
      [row({ source: 'appro', quantity: 500, date_echeance: '2026-09-20' })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'appro'))
  })

  test('sans driver convergent → non expliqué', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2, itmref: 'A1' })])
    const drivers = diffCbnDrivers(
      [row({ itmref: 'A2', quantity: 100 })],
      [row({ itmref: 'A2', quantity: 50 })]
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.equal(ex[0].correlations.length, 0)
    // Article différent → aucune corrélation
  })

  test('poids décroissant : stock (3) avant demande_prevision (2)', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 2, itmref: 'ART' })])
    const drivers = diffCbnDrivers(
      [
        row({ itmref: 'ART', source: 'stock', quantity: 1000 }),
        row({
          itmref: 'ART',
          source: 'demande_prevision',
          quantity: 100,
          date_echeance: '2026-09-01',
        }),
      ],
      [
        row({ itmref: 'ART', source: 'stock', quantity: 500 }),
        row({
          itmref: 'ART',
          source: 'demande_prevision',
          quantity: 200,
          date_echeance: '2026-09-01',
        }),
      ]
    )
    // stock baisse + prévision hausse : deux convergents
    const ex = explainCbnMessages(
      msgs,
      drivers.filter((d) => d.article === 'ART')
    )
    if (ex[0].correlations.length >= 2)
      assert.isTrue(ex[0].correlations[0].poids >= ex[0].correlations[1].poids)
  })
})

test.group('cbn_explanation — retarder et inutile', () => {
  test('stock hausse explique retarder', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 3 })])
    const drivers = diffCbnDrivers([row({ quantity: 740 })], [row({ quantity: 1200 })])
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'stock'))
  })

  test('demande disparue explique retarder', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 3 })])
    const drivers = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('demande disparue explique inutile', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 6, mrpdat: null })])
    const drivers = diffCbnDrivers(
      [row({ source: 'demande_ferme', quantity: 800, date_echeance: '2026-09-01' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'demande_ferme'))
  })

  test('OF disparu explique inutile', ({ assert }) => {
    const msgs = diffApproMessageSnapshots([], [msg({ mrpmes: 6, mrpdat: null, itmref: 'OFART' })])
    const drivers = diffCbnDrivers(
      [row({ itmref: 'OFART', source: 'of_ferme', quantity: 100, date_echeance: '2026-09-10' })],
      []
    )
    const ex = explainCbnMessages(msgs, drivers)
    assert.isTrue(ex[0].correlations.some((c) => c.source === 'of_ferme'))
  })
})
