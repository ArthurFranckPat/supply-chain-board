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
    assert.isTrue(diff[0].detail.includes('01/09/2026 → 16/09/2026'))
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
      [ligne({ quantite: 1500, echeance: '2026-09-20' })]
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

test.group('appro_snapshot_diff — plafond d’appariement (#148, miroir #144)', () => {
  test('30 j pile → apparié (borne incluse)', ({ assert }) => {
    // 01/09 → 01/10 = 30 j exactement : `> plafond`, donc 30 passe. 30 j
    // dépasse la tolérance date de 7 j → un `date` est émis, pas un couple
    // disparue/apparue : c'est bien apparié, même au plafond.
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-01', quantite: 100 })],
      [ligne({ echeance: '2026-10-01', quantite: 100 })]
    )
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'date')
  })

  test('31 j → non apparié (disparue + apparue)', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-01', quantite: 100 })],
      [ligne({ echeance: '2026-10-02', quantite: 100 })]
    )
    assert.deepEqual(diff.map((e) => e.nature).sort(), ['apparue', 'disparue'])
  })

  test('le plafond est symétrique : −30 j apparié, −60 j non', ({ assert }) => {
    const avance30 = diffApproSnapshots(
      [ligne({ echeance: '2026-10-01', quantite: 100 })],
      [ligne({ echeance: '2026-09-01', quantite: 100 })]
    )
    assert.equal(avance30.length, 1)
    assert.equal(avance30[0].nature, 'date')

    const avance60 = diffApproSnapshots(
      [ligne({ echeance: '2026-09-01', quantite: 100 })],
      [ligne({ echeance: '2026-07-03', quantite: 100 })]
    )
    assert.deepEqual(avance60.map((e) => e.nature).sort(), ['apparue', 'disparue'])
  })

  test('168 j (cas 11035406) → non apparié, pas un couple date à +168 j', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-09', quantite: 100 })],
      [ligne({ echeance: '2027-02-24', quantite: 100 })]
    )
    assert.deepEqual(diff.map((e) => e.nature).sort(), ['apparue', 'disparue'])
  })

  test('à distance égale, la quantité la plus proche l’emporte', ({ assert }) => {
    // Deux candidates à 10 j chacune : seule la quantité départage. L'ordre en
    // `apres` est volontairement inversé pour que le glouton sans départage
    // marie 100→1005 et 1000→105 (deux `quantite` inventés).
    const avant = [
      ligne({ echeance: '2026-09-01', quantite: 100 }),
      ligne({ echeance: '2026-09-01', quantite: 1000 }),
    ]
    const apres = [
      ligne({ echeance: '2026-09-11', quantite: 1005 }),
      ligne({ echeance: '2026-09-11', quantite: 105 }),
    ]
    const diff = diffApproSnapshots(avant, apres)
    // Avec départage : 100→105 et 1000→1005 (écarts 5, dans ±20 %), donc pas de
    // `quantite` — seuls les deux `date` (+10 j > 7 j) ressortent.
    assert.equal(diff.filter((e) => e.nature === 'quantite').length, 0)
    assert.equal(diff.filter((e) => e.nature === 'date').length, 2)
  })

  test('passe 2 : une orpheline lointaine ne se marie pas à une ligne sans échéance', ({
    assert,
  }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: '2026-09-09', quantite: 100 })],
      [ligne({ echeance: null, quantite: 5000 })]
    )
    assert.deepEqual(diff.map((e) => e.nature).sort(), ['apparue', 'disparue'])
  })

  test('passe 2 : la ligne qui reçoit son échéance reste rattrapée', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: null, quantite: 100 })],
      [ligne({ echeance: '2026-09-01', quantite: 110 })]
    )
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].echeance, '2026-09-01')
  })

  test('deux échéances nulles s’apparient (distance 0), même sous plafond', ({ assert }) => {
    const diff = diffApproSnapshots(
      [ligne({ echeance: null, quantite: 100 })],
      [ligne({ echeance: null, quantite: 105 })]
    )
    assert.deepEqual(diff, [])
  })

  test('passe 1 sans garde-fou quantité : sans échéance, 100 vs 5000 se marient', ({ assert }) => {
    // Deux lignes sans échéance (distance 0) s'apparient en passe 1 quelle que
    // soit leur quantité : le ratio ±20 % ne s'arme qu'en passe 2, jamais
    // atteinte ici. Pas de disparue/apparue — une ligne sans date n'est pas une
    // ligne différente — juste le `quantite` honnête sur le mariage assumé.
    const diff = diffApproSnapshots(
      [ligne({ echeance: null, quantite: 100 })],
      [ligne({ echeance: null, quantite: 5000 })]
    )
    assert.equal(diff.length, 1)
    assert.equal(diff[0].nature, 'quantite')
  })
})
