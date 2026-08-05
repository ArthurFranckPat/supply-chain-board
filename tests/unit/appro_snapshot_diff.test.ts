import { test } from '@japa/runner'
import { diffApproSnapshots, type ApproSnapshotRow } from '#app/domain/appro_snapshot_diff'

/**
 * Diff inter-CBN des suggestions (#133). Tolérances #112 : quantité ±20 %,
 * échéance ±7 j. Fixtures calquées sur les suggestions réelles AE1.
 */

const ligne = (over: Partial<ApproSnapshotRow>): ApproSnapshotRow => ({
  article: '11028891',
  fournisseur: '40025',
  quantite: 3024,
  echeance: '2026-09-01',
  ...over,
})

test.group('appro_snapshot_diff — apparitions et disparitions', () => {
  test('un couple absent de la photo avant → apparue', ({ assert }) => {
    const diff = diffApproSnapshots([], [ligne({ article: 'A1' })])
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[0].article, 'A1')
    assert.isTrue(diff[0].detail.includes('apparue'))
  })

  test('un couple disparu de la photo après → disparue', ({ assert }) => {
    const diff = diffApproSnapshots([ligne({ article: 'A1' })], [])
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'disparue')
  })

  test('une ligne inchangée n’est pas rapportée', ({ assert }) => {
    const avant = [ligne({})]
    const apres = [ligne({})]
    assert.deepEqual(diffApproSnapshots(avant, apres), [])
  })

  test('une ligne sans échéance inchangée n’est pas rapportée non plus', ({ assert }) => {
    // Deux échéances absentes s'apparient : une ligne sans date stable ne doit
    // pas ressortir « disparue » + « apparue » chaque nuit.
    const avant = [ligne({ echeance: null })]
    const apres = [ligne({ echeance: null })]
    assert.deepEqual(diffApproSnapshots(avant, apres), [])
  })

  test('une ligne sans échéance qui change de quantité → quantite', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: null, quantite: 100 })],
      [ligne({ echeance: null, quantite: 300 })]
    )
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'quantite')
  })

  test('deux couples : une apparue et une disparue indépendantes', ({ assert }) => {
    const diff = diffApproSnapshots([ligne({ article: 'A' })], [ligne({ article: 'B' })])
    assert.deepEqual(
      diff.map((e) => [e.nature, e.article]),
      [
        ['disparue', 'A'],
        ['apparue', 'B'],
      ]
    )
  })
})

test.group('appro_snapshot_diff — variations dans les tolérances #112', () => {
  test('quantité +30 % (> ±20 %) → quantite', ({ assert }) => {
    const diff = diffApproSnapshots([ligne({ quantite: 1000 })], [ligne({ quantite: 1300 })])
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'quantite')
    assert.isTrue(diff[0].detail.includes('+30 %'))
  })

  test('quantité +10 % (dans ±20 %) → rien', ({ assert }) => {
    const diff = diffApproSnapshots([ligne({ quantite: 1000 })], [ligne({ quantite: 1100 })])
    assert.deepEqual(diff, [])
  })

  test('échéance décalée de 15 j (> ±7 j) → date', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-01' })],
      [ligne({ echeance: '2026-09-16' })]
    )
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'date')
    assert.isTrue(diff[0].detail.includes('2026-09-01 → 2026-09-16'))
  })

  test('échéance décalée de 5 j (dans ±7 j) → rien', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-01' })],
      [ligne({ echeance: '2026-09-06' })]
    )
    assert.deepEqual(diff, [])
  })

  test('quantité ET échéance hors tolérances → deux entrées', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ quantite: 1000, echeance: '2026-09-01' })],
      [ligne({ quantite: 1500, echeance: '2026-10-10' })]
    )
    assert.deepEqual(diff.map((e) => e.nature).sort(), ['date', 'quantite'])
  })
})

test.group('appro_snapshot_diff — couples multi-lignes', () => {
  test('une ligne apparue à côté d’une ligne stable → une seule entrée', ({ assert }) => {
    const avant = [ligne({ echeance: '2026-09-01' })]
    const apres = [
      ligne({ echeance: '2026-09-01' }),
      ligne({ echeance: '2026-12-15' }), // nouvelle ligne du même couple
    ]
    const diff = diffApproSnapshots(avant, apres)
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[0].echeance, '2026-12-15')
  })

  test('deux lignes dont une modifiée → une seule entrée', ({ assert }) => {
    const avant = [
      ligne({ echeance: '2026-09-01', quantite: 1000 }),
      ligne({ echeance: '2026-12-15', quantite: 500 }),
    ]
    const apres = [
      ligne({ echeance: '2026-09-01', quantite: 1000 }),
      ligne({ echeance: '2026-12-15', quantite: 800 }), // +60 %
    ]
    const diff = diffApproSnapshots(avant, apres)
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'quantite')
  })
})
