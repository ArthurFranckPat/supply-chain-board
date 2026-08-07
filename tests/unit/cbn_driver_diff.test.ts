import { test } from '@japa/runner'
import { diffCbnDrivers, driverDiffAmplitude } from '#app/domain/cbn_driver_diff'
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
