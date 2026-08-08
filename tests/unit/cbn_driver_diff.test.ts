import { test } from '@japa/runner'
import { diffCbnDrivers, driverDiffAmplitude, pourcentVariation } from '#app/domain/cbn_driver_diff'
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
    // Groupé par (article,source) → apparié → une ligne par pièce remplacée,
    // jamais 2 (disparue + apparue) et jamais 0 (suppression silencieuse).
    assert.lengthOf(diff, 2)
    assert.isTrue(diff.every((d) => d.nature === 'renumerotation'))
    assert.deepEqual(
      diff.map((d) => `${d.vcrnum}->${d.vcrnumApres}`).sort(),
      ['F1->F9', 'F2->F10'].sort()
    )
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

  /**
   * Cas réel A7370 (photos du 06 et 07/08/2026). Le CBN est régénératif : les
   * 4 suggestions SGAE10656957463..466 sont supprimées et remplacées par
   * SGAE10657196362..365. Un numéro de suggestion NE PEUT PAS survivre à deux
   * runs — donc une ligne « échéance 14/06 → 31/05 » qui n'affiche que le
   * numéro d'avant fait croire que CETTE pièce a bougé. Elle a été remplacée.
   */
  test('échéance décalée sur une pièce renumérotée → une ligne qui nomme les deux', ({
    assert,
  }) => {
    const sugg = (vcrnum: string, ech: string) =>
      row({
        source: 'appro_suggestion',
        itmref: 'A7370',
        vcrnum,
        quantity: 19200,
        date_echeance: ech,
      })
    const diff = diffCbnDrivers(
      [sugg('SGAE10656957466', '2027-06-14')],
      [sugg('SGAE10657196365', '2027-05-31')]
    )

    // Une seule ligne : la renumérotation ne double pas le changement de date.
    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].vcrnum, 'SGAE10656957466')
    assert.equal(diff[0].vcrnumApres, 'SGAE10657196365')
  })

  test('échéance décalée sans renumérotation → pas de pièce d’après', ({ assert }) => {
    const diff = diffCbnDrivers(
      [row({ source: 'appro', itmref: 'R1', vcrnum: 'REC1', date_echeance: '2027-06-14' })],
      [row({ source: 'appro', itmref: 'R1', vcrnum: 'REC1', date_echeance: '2027-05-31' })]
    )

    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].vcrnum, 'REC1')
    assert.equal(diff[0].vcrnumApres, null)
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
    // VCRNUM stable → la paire arrive en 2 clés distinctes (1 disparue +
    // 1 apparue) → recollée en UNE ligne qui nomme les deux références.
    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'renumerotation')
    assert.equal(diff[0].vcrnum, 'OF1')
    assert.equal(diff[0].vcrnumApres, 'OF2')
    assert.include(diff[0].detail, 'OF1 → OF2')
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
    // La renumérotation est émise, mais à amplitude 0 : elle passe DERRIÈRE
    // l'effondrement de stock, sinon les ~17 500 renumérotations nocturnes du
    // CBN passeraient devant tous les vrais mouvements.
    assert.lengthOf(diff, 2)
    assert.equal(diff[0].source, 'stock')
    assert.equal(diff[0].nature, 'quantite')
    assert.equal(diff[1].nature, 'renumerotation')
  })

  test('échéance renseignée → une entrée date, pas disparue + apparue', ({ assert }) => {
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
    // Même réception, même quantité : l'échéance est simplement renseignée.
    // Deux lignes ici = le bruit que la passe 2 de `apparie()` supprime.
    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].echeanceAvant, null)
    assert.equal(diff[0].echeanceApres, '2026-09-01')
    assert.notInclude(diff[0].detail, 'null')
  })

  test('échéance retirée → une entrée date aussi', ({ assert }) => {
    const diff = diffCbnDrivers(
      [
        row({
          source: 'appro',
          itmref: 'A1',
          vcrnum: 'R1',
          quantity: 10,
          date_echeance: '2026-09-01',
        }),
      ],
      [row({ source: 'appro', itmref: 'A1', vcrnum: 'R1', quantity: 10, date_echeance: null })]
    )
    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].echeanceApres, null)
  })
})

/**
 * Plafond d'appariement (#144) — `TOLERANCE_APPARIEMENT_JOURS`.
 *
 * Aucun test n'exerçait la règle : la CI serait restée verte avec un seuil de
 * 3 j comme de 300 j. Ces cas verrouillent la borne, sa symétrie, et surtout le
 * fait qu'elle ne s'applique QU'AUX sources dont l'identité de ligne est
 * devinée par `apparie()`.
 */
test.group('cbn_driver_diff — plafond d’appariement', () => {
  const sugg = (vcrnum: string, ech: string | null, quantity = 100) =>
    row({ source: 'of_suggestion', itmref: 'S1', vcrnum, quantity, date_echeance: ech })

  test('identité inférée : 30 j pile → apparié (borne incluse)', ({ assert }) => {
    // 01/09 → 01/10 = 30 j exactement. Le code teste `> plafond`, donc 30 passe.
    const diff = diffCbnDrivers([sugg('SG1', '2026-09-01')], [sugg('SG2', '2026-10-01')])

    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].vcrnum, 'SG1')
    assert.equal(diff[0].vcrnumApres, 'SG2')
  })

  test('identité inférée : 31 j → non apparié (disparue + apparue)', ({ assert }) => {
    // 01/09 → 02/10 = 31 j : un jour de plus et ce ne sont plus deux états du
    // même besoin.
    const diff = diffCbnDrivers([sugg('SG1', '2026-09-01')], [sugg('SG2', '2026-10-02')])

    assert.lengthOf(diff, 2)
    assert.deepEqual(diff.map((d) => d.nature).sort(), ['apparue', 'disparue'])
  })

  /**
   * `distEcheance` prend la valeur absolue de l'écart : le plafond est donc
   * SYMÉTRIQUE. Une avance de 60 j n'est pas plus le même besoin qu'un retard
   * de 60 j. Choix assumé, non écrit ailleurs que dans ce test.
   */
  test('le plafond est symétrique : −30 j apparié, −60 j non', ({ assert }) => {
    const avance30 = diffCbnDrivers([sugg('SG1', '2026-10-01')], [sugg('SG2', '2026-09-01')])
    assert.lengthOf(avance30, 1)
    assert.equal(avance30[0].nature, 'date')

    // 01/09 → 03/07 = −60 j.
    const avance60 = diffCbnDrivers([sugg('SG1', '2026-09-01')], [sugg('SG2', '2026-07-03')])
    assert.lengthOf(avance60, 2)
    assert.deepEqual(avance60.map((d) => d.nature).sort(), ['apparue', 'disparue'])
  })

  /**
   * Non-régression du défaut principal : le plafond ne doit PAS s'appliquer aux
   * sources clefées par pièce (`of_ferme`, `demande_*`, `appro`). Là, la pièce
   * EST la clé : l'identité est certaine, il n'y a rien à départager. Sur les
   * photos réelles 30/07 → 07/08, l'armer partout basculait 1250 replanifs d'OF
   * fermes en 1250 disparues + 1250 apparues, à VCRNUM et quantité identiques —
   * et `driverDiffAmplitude` (1000+ pour apparue/disparue contre |j|/7 pour
   * date) les faisait remonter en tête du `limit` de l'appelant.
   */
  test('appro à VCRNUM stable retardée de 106 j → date, pas disparue + apparue', ({ assert }) => {
    // 01/09 → 16/12 = 106 j. Une réception très en retard reste un retard (#43).
    const diff = diffCbnDrivers(
      [
        row({
          source: 'appro',
          itmref: 'R1',
          vcrnum: 'REC1',
          quantity: 500,
          date_echeance: '2026-09-01',
        }),
      ],
      [
        row({
          source: 'appro',
          itmref: 'R1',
          vcrnum: 'REC1',
          quantity: 500,
          date_echeance: '2026-12-16',
        }),
      ]
    )

    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].echeanceAvant, '2026-09-01')
    assert.equal(diff[0].echeanceApres, '2026-12-16')
  })

  test('of_ferme à VCRNUM stable replanifié de 106 j → date', ({ assert }) => {
    const diff = diffCbnDrivers(
      [
        row({
          source: 'of_ferme',
          itmref: 'F1',
          vcrnum: 'OF1',
          quantity: 50,
          date_echeance: '2026-09-01',
        }),
      ],
      [
        row({
          source: 'of_ferme',
          itmref: 'F1',
          vcrnum: 'OF1',
          quantity: 50,
          date_echeance: '2026-12-16',
        }),
      ]
    )

    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
  })

  /**
   * Passe 2 (rattrapage à la quantité) : l'exemption `Infinity` reposait sur
   * l'invariant « la passe 1 a déjà apparié tout ce qui a deux échéances » —
   * que le plafond invalide. Les orphelines lointaines retombent en passe 2 et
   * se marieraient à n'importe quelle ligne sans échéance. Le garde-fou de
   * quantité (mêmes ±20 % que le bruit) le refuse.
   */
  test('passe 2 : une orpheline lointaine ne se marie pas à une ligne sans échéance', ({
    assert,
  }) => {
    const diff = diffCbnDrivers([sugg('SG1', '2026-09-09', 100)], [sugg('SG2', null, 5000)])

    // Mariage inventé si le garde-fou manque : quantite(100 → 5000) +
    // date(09/09/2026 → —).
    assert.lengthOf(diff, 2)
    assert.deepEqual(diff.map((d) => d.nature).sort(), ['apparue', 'disparue'])
    assert.equal(diff.find((d) => d.nature === 'apparue')?.quantiteApres, 5000)
    assert.equal(diff.find((d) => d.nature === 'disparue')?.quantiteAvant, 100)
  })

  test('passe 2 : la réception qui reçoit sa date reste rattrapée', ({ assert }) => {
    // Quantité déplacée de 10 % seulement : c'est bien la même ligne, elle
    // gagne son échéance. Le garde-fou ne doit pas la refuser.
    const diff = diffCbnDrivers([sugg('SG1', null, 100)], [sugg('SG2', '2026-09-01', 110)])

    assert.lengthOf(diff, 1)
    assert.equal(diff[0].nature, 'date')
    assert.equal(diff[0].echeanceAvant, null)
    assert.equal(diff[0].echeanceApres, '2026-09-01')
  })
})

/**
 * L'ordre de sortie fait partie du contrat : l'appelant borne la liste
 * (`limit`), donc une sortie mal triée perd les mouvements les plus forts.
 * Le tri doit être insensible à la présence d'une renumérotation dans les
 * données — c'est exactement ce qui avait régressé.
 */
test.group('cbn_driver_diff — contrat de tri', () => {
  const stockEffondre = {
    a: row({ source: 'stock', itmref: 'S1', quantity: 1000 }),
    p: row({ source: 'stock', itmref: 'S1', quantity: 10 }),
  }
  const demandeApparue = row({
    source: 'demande_ferme',
    itmref: 'D1',
    vcrnum: 'C1',
    quantity: 5,
    date_echeance: '2026-09-01',
  })

  test('sans renumérotation, une apparue passe devant un stock effondré', ({ assert }) => {
    const diff = diffCbnDrivers([stockEffondre.a], [stockEffondre.p, demandeApparue])

    assert.lengthOf(diff, 2)
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[1].source, 'stock')
  })

  test('avec renumérotation, le même ordre tient', ({ assert }) => {
    const renum = (vcrnum: string) =>
      row({ source: 'of_ferme', itmref: 'F1', vcrnum, quantity: 50, date_echeance: '2026-09-01' })
    const diff = diffCbnDrivers(
      [stockEffondre.a, renum('OF1')],
      [stockEffondre.p, demandeApparue, renum('OF2')]
    )

    // La renumérotation est émise mais reléguée en queue : l'ordre des deux
    // vrais mouvements est inchangé par sa présence.
    assert.lengthOf(diff, 3)
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[1].source, 'stock')
    assert.equal(diff[2].nature, 'renumerotation')
  })

  test('la liste est triée par amplitude décroissante', ({ assert }) => {
    const diff = diffCbnDrivers([stockEffondre.a], [stockEffondre.p, demandeApparue])
    const amplitudes = diff.map(driverDiffAmplitude)

    assert.deepEqual(
      amplitudes,
      [...amplitudes].sort((x, y) => y - x)
    )
  })
})

/**
 * Reproduction réduite du défaut mesuré sur A5495 (photos 07/08 → 08/08 2026).
 *
 * Le CBN détruit et recrée les suggestions chaque nuit : `apparie()` doit
 * DEVINER quelle ligne d'avant est quelle ligne d'après. La passe par
 * proximité d'échéance est gloutonne dans l'ordre croissant — une ligne qui
 * disparaît fait voler à sa voisine le jumeau exact de la suivante, et le
 * décalage se propage jusqu'au bout de la liste.
 *
 * En vrai : 12 mouvements pour 15 lignes de diff, dont un couple
 * `48 384 → 8 064 (+17 j)` alors que la ligne de 48 384 au 12/04/2027 existait
 * à l'identique des deux côtés.
 */
test.group('cbn_driver_diff — cascade de décalage (passe 0)', () => {
  const sug = (vcrnum: string, quantity: number, date_echeance: string): DemandSnapshotRow =>
    row({ source: 'appro_suggestion', itmref: 'A5495', vcrnum, quantity, date_echeance })

  const avant = [
    sug('SGAE1000', 8064, '2027-01-23'),
    sug('SGAE1001', 16128, '2027-01-25'),
    sug('SGAE1002', 16128, '2027-04-07'),
    sug('SGAE1003', 48384, '2027-04-12'),
  ]
  const apres = [
    sug('SGAE2001', 16128, '2027-01-25'),
    sug('SGAE2002', 16128, '2027-04-07'),
    sug('SGAE2003', 48384, '2027-04-12'),
    sug('SGAE2004', 8064, '2027-04-29'),
  ]

  test('les jumeaux exacts sont appariés avant toute devinette', ({ assert }) => {
    const diff = diffCbnDrivers(avant, apres)

    // Aucun mouvement de quantité ni d'échéance : les trois lignes conservées
    // sont identiques des deux côtés, seul leur numéro a changé.
    assert.deepEqual(
      diff.filter((e) => e.nature === 'quantite' || e.nature === 'date'),
      []
    )
    assert.lengthOf(
      diff.filter((e) => e.nature === 'renumerotation'),
      3
    )
  })

  test('la ligne retirée et la ligne neuve se disent telles quelles', ({ assert }) => {
    const diff = diffCbnDrivers(avant, apres)

    const disparues = diff.filter((e) => e.nature === 'disparue')
    const apparues = diff.filter((e) => e.nature === 'apparue')
    assert.lengthOf(disparues, 1)
    assert.equal(disparues[0].echeanceAvant, '2027-01-23')
    assert.lengthOf(apparues, 1)
    assert.equal(apparues[0].echeanceApres, '2027-04-29')
  })

  test('la ligne de 48 384 au 12/04/2027 est appariée à elle-même', ({ assert }) => {
    const diff = diffCbnDrivers(avant, apres)

    const paire = diff.find((e) => e.vcrnum === 'SGAE1003')
    assert.equal(paire?.nature, 'renumerotation')
    assert.equal(paire?.vcrnumApres, 'SGAE2003')
    assert.equal(paire?.quantiteApres, 48384)
    assert.equal(paire?.echeanceApres, '2027-04-12')
  })
})

test.group('cbn_driver_diff — pourcentage affiché', () => {
  test('une baisse ne dépasse pas −100 %', ({ assert }) => {
    assert.equal(pourcentVariation(48384, 8064), -83)
  })

  test('une hausse se rapporte à avant, pas au minimum', ({ assert }) => {
    assert.equal(pourcentVariation(8064, 48384), 500)
  })

  test('base nulle → pas de pourcentage', ({ assert }) => {
    assert.isNull(pourcentVariation(0, 500))
  })

  test('le détail du stock porte le pourcentage lisible', ({ assert }) => {
    const diff = diffCbnDrivers([row({ quantity: 48384 })], [row({ quantity: 8064 })])
    // `toLocaleString('fr-FR')` sépare les milliers par une espace fine
    // insécable (U+202F), pas par une espace ordinaire.
    assert.include(diff[0].detail, '48 384 → 8 064 (−83 %)')
  })

  /**
   * Le seuil de détection garde `baseRatio` (min de magnitude) : c'est lui qui
   * rend les ±20 % symétriques sur un stock strict passé sous zéro. Seul
   * l'AFFICHAGE change — les deux notions sont désormais distinctes, et une
   * ligne peut donc s'annoncer sous les 20 % tout en ayant franchi le seuil.
   */
  test('le seuil de détection reste min-relatif', ({ assert }) => {
    const diff = diffCbnDrivers([row({ quantity: 100 })], [row({ quantity: 83 })])
    assert.lengthOf(diff, 1)
    assert.equal(pourcentVariation(100, 83), -17)
  })
})

test.group('cbn_driver_diff — fournisseur porté par le mouvement', () => {
  const sug = (over: Partial<DemandSnapshotRow>): DemandSnapshotRow =>
    row({ source: 'appro_suggestion', itmref: 'A5495', fournisseur: '16012', ...over })

  test('une quantité modifiée garde le code tiers de la photo', ({ assert }) => {
    const diff = diffCbnDrivers(
      [sug({ vcrnum: 'SGAE1', quantity: 16128, date_echeance: '2026-09-24' })],
      [sug({ vcrnum: 'SGAE2', quantity: 8064, date_echeance: '2026-09-24' })]
    )
    const q = diff.find((e) => e.nature === 'quantite')
    assert.equal(q?.fournisseur, '16012')
  })

  test('une ligne apparue porte le fournisseur du côté « après »', ({ assert }) => {
    const diff = diffCbnDrivers(
      [],
      [sug({ vcrnum: 'SGAE9', quantity: 8064, date_echeance: '2027-04-29' })]
    )
    assert.equal(diff[0].nature, 'apparue')
    assert.equal(diff[0].fournisseur, '16012')
  })

  /**
   * `approvisionnement` est enrichi HORS du diff (jointure `static_articles`
   * dans `demand_snapshot_service`), au même titre que désignation et famille.
   * Le domaine doit donc le rendre `null`, pas le deviner depuis la source.
   */
  test('le mode d’appro n’est jamais deviné par le domaine', ({ assert }) => {
    const diff = diffCbnDrivers(
      [],
      [sug({ vcrnum: 'SGAE9', quantity: 8064, date_echeance: '2027-04-29' })]
    )
    assert.isNull(diff[0].approvisionnement)
  })
})
