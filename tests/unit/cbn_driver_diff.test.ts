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

/**
 * Stock STRICT (physique − alloué) : il passe sous zéro dès que les allocations
 * dépassent le physique. Le ratio de variation doit rester lisible dans ce cas —
 * c'est précisément l'effondrement de stock qui explique un « avancer ».
 */
test.group('diffCbnDrivers — stock négatif', () => {
  const stock = (q: number, jour: string): DemandSnapshotRow => ({
    snapshot_date: jour,
    source: 'stock',
    itmref: 'A7399',
    vcrnum: null,
    vcrlin: null,
    quantity: q,
    date_echeance: null,
    fournisseur: null,
  })

  test('une chute qui traverse zéro est signalée', ({ assert }) => {
    const out = diffCbnDrivers([stock(100, '2026-08-05')], [stock(-100, '2026-08-06')])

    assert.lengthOf(out, 1)
    assert.equal(out[0].source, 'stock')
    assert.equal(out[0].nature, 'quantite')
    assert.equal(out[0].quantiteApres, -100)
  })

  test('une remontée depuis un stock négatif est signalée aussi', ({ assert }) => {
    const out = diffCbnDrivers([stock(-100, '2026-08-05')], [stock(500, '2026-08-06')])

    assert.lengthOf(out, 1)
    assert.equal(out[0].quantiteAvant, -100)
    assert.equal(out[0].quantiteApres, 500)
  })

  test('deux stocks négatifs proches restent sous le seuil de bruit', ({ assert }) => {
    // −100 → −105 : 5 % de variation, sous les ±20 %. Ne doit pas ressortir.
    const out = diffCbnDrivers([stock(-100, '2026-08-05')], [stock(-105, '2026-08-06')])

    assert.lengthOf(out, 0)
  })
})

test.group('cbn_driver_diff — of_planifie et renumérotation', () => {
  test('of_planifie VCRNUM change → apparié par article, pas 2 lignes bruit', ({ assert }) => {
    const a = [
      row({
        source: 'of_planifie',
        itmref: 'P1',
        vcrnum: 'F1',
        vcrlin: '10',
        quantity: 100,
        date_echeance: '2026-09-01',
      }),
      row({
        source: 'of_planifie',
        itmref: 'P1',
        vcrnum: 'F2',
        vcrlin: '10',
        quantity: 100,
        date_echeance: '2026-09-08',
      }),
    ]
    const p = [
      row({
        source: 'of_planifie',
        itmref: 'P1',
        vcrnum: 'F9',
        vcrlin: '10',
        quantity: 100,
        date_echeance: '2026-09-01',
      }),
      row({
        source: 'of_planifie',
        itmref: 'P1',
        vcrnum: 'F10',
        vcrlin: '10',
        quantity: 100,
        date_echeance: '2026-09-08',
      }),
    ]
    const diff = diffCbnDrivers(a, p)
    // Groupé par (article,source) → apparie → 0 diff si même qte/date
    assert.lengthOf(diff, 0)
  })

  test('of_planifie quantité modifiée → une entrée quantite', ({ assert }) => {
    const diff = diffCbnDrivers(
      [
        row({
          source: 'of_planifie',
          itmref: 'P1',
          vcrnum: 'F1',
          quantity: 100,
          date_echeance: '2026-09-01',
        }),
      ],
      [
        row({
          source: 'of_planifie',
          itmref: 'P1',
          vcrnum: 'F9',
          quantity: 150,
          date_echeance: '2026-09-01',
        }),
      ]
    )
    assert.isTrue(diff.some((d) => d.source === 'of_planifie' && d.nature === 'quantite'))
  })

  test('of_ferme renumérotation même qte/date → filtrée', ({ assert }) => {
    const a = [
      row({
        source: 'of_ferme',
        itmref: 'F1',
        vcrnum: 'OF1',
        quantity: 50,
        date_echeance: '2026-09-01',
      }),
    ]
    const p = [
      row({
        source: 'of_ferme',
        itmref: 'F1',
        vcrnum: 'OF2',
        quantity: 50,
        date_echeance: '2026-09-01',
      }),
    ]
    const diff = diffCbnDrivers(a, p)
    // VCRNUM stable → 1 disparue + 1 apparue mêmes qte/date → filtre → 0
    assert.lengthOf(diff, 0)
  })

  test('of_ferme renumérotation ne casse pas le tri amplitude', ({ assert }) => {
    const a = [
      row({
        source: 'of_ferme',
        itmref: 'F1',
        vcrnum: 'OF1',
        quantity: 50,
        date_echeance: '2026-09-01',
      }),
      row({ source: 'stock', itmref: 'S1', quantity: 1000 }),
    ]
    const p = [
      row({
        source: 'of_ferme',
        itmref: 'F1',
        vcrnum: 'OF2',
        quantity: 50,
        date_echeance: '2026-09-01',
      }),
      row({ source: 'stock', itmref: 'S1', quantity: 100 }),
    ]
    const diff = diffCbnDrivers(a, p)
    // Renumérotation filtrée, reste stock quantite trié en tête
    assert.lengthOf(diff, 1)
    assert.equal(diff[0].source, 'stock')
  })

  test('apparie avec date null → surplus pas de crash', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'appro', itmref: 'A1', vcrnum: 'R1', quantity: 10, date_echeance: null })],
      [
        row({
          source: 'appro',
          itmref: 'A1',
          vcrnum: 'R1',
          quantity: 10,
          date_echeance: '2026-09-01',
        }),
      ]
    )
    assert.isTrue(diff.length >= 1)
  })
})
