import { test } from '@japa/runner'
import { diffApproMessageSnapshots } from '#app/domain/cbn_message_diff'
import type { ApproMessageSnapshotRow } from '#services/demand_snapshot_service'

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

test.group('cbn_message_diff — apparitions et disparitions', () => {
  test('clé absente avant → apparue', ({ assert }) => {
    const diff = diffApproMessageSnapshots([], [msg({})])
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[0].cle, 'CG2601534:6000:1000')
  })

  test('clé disparue après → disparue', ({ assert }) => {
    const diff = diffApproMessageSnapshots([msg({})], [])
    assert.equal(diff[0].nature, 'disparue')
  })

  test('même clé, même code et même décalage → rien', ({ assert }) => {
    const diff = diffApproMessageSnapshots([msg({})], [msg({})])
    assert.deepEqual(diff, [])
  })

  test('cle 3-colonnes : même vcrnum:vcrlin mais vcrseq différent → deux entrées distinctes', ({
    assert,
  }) => {
    const avant = [msg({ vcrseq: '1000' }), msg({ vcrseq: '1001' })]
    const apres = [msg({ vcrseq: '1000' })]
    const diff = diffApproMessageSnapshots(avant, apres)
    assert.equal(diff.length, 1)
    assert.equal(diff[0].vcrseq, '1001')
    assert.equal(diff[0].nature, 'disparue')
  })

  test('COA2400006 ligne 1 : cinq messages ne s’effacent pas ensemble', ({ assert }) => {
    const avant = [1, 2, 3, 4, 5].map((i) =>
      msg({
        vcrnum: 'COA2400006',
        vcrlin: 1,
        vcrseq: String(i * 1000),
        itmref: 'ARTX',
        mrpmes: 6,
        mrpdat: null,
      })
    )
    const apres = [1, 2, 3, 4].map((i) =>
      msg({
        vcrnum: 'COA2400006',
        vcrlin: 1,
        vcrseq: String(i * 1000),
        itmref: 'ARTX',
        mrpmes: 6,
        mrpdat: null,
      })
    )
    const diff = diffApproMessageSnapshots(avant, apres)
    assert.equal(diff.length, 1)
    assert.equal(diff[0].vcrseq, '5000')
    assert.equal(diff[0].nature, 'disparue')
  })
})

test.group('cbn_message_diff — intensité et modification', () => {
  test('décalage 7→15j au-delà de 7j → intensifiee', ({ assert }) => {
    const avant = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-15' })] // -7
    const apres = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-07' })] // -15
    const diff = diffApproMessageSnapshots(avant, apres)
    assert.equal(diff[0].nature, 'intensifiee')
    assert.isTrue(diff[0].detail.includes('intensifié'))
  })

  test('décalage 15→7j → attenuee', ({ assert }) => {
    const avant = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-07' })]
    const apres = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-15' })]
    const diff = diffApproMessageSnapshots(avant, apres)
    assert.equal(diff[0].nature, 'attenuee')
  })

  test('décalage 7→10j dans ±7j → rien', ({ assert }) => {
    const avant = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-15' })]
    const apres = [msg({ enddat: '2026-09-22', mrpdat: '2026-09-12' })]
    assert.deepEqual(diffApproMessageSnapshots(avant, apres), [])
  })

  test('changement de code 2→3 → modifiee', ({ assert }) => {
    const diff = diffApproMessageSnapshots([msg({ mrpmes: 2 })], [msg({ mrpmes: 3 })])
    assert.equal(diff[0].nature, 'modifiee')
    assert.isTrue(diff[0].detail.includes('avancer → retarder'))
  })

  test('inutile (sans date) stable → rien', ({ assert }) => {
    const avant = [msg({ mrpmes: 6, mrpdat: null })]
    const apres = [msg({ mrpmes: 6, mrpdat: null })]
    assert.deepEqual(diffApproMessageSnapshots(avant, apres), [])
  })

  test('inutile → avancer avec date → modifiee (code change)', ({ assert }) => {
    const avant = [msg({ mrpmes: 6, mrpdat: null })]
    const apres = [msg({ mrpmes: 2, mrpdat: '2026-08-17' })]
    assert.equal(diffApproMessageSnapshots(avant, apres)[0].nature, 'modifiee')
  })
})
