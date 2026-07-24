import { test } from '@japa/runner'
import {
  buildCriticiteIndex,
  buildReceptionRow,
  calcPalettes,
  groupReceptionsByDay,
  pickReceptionDate,
  type ReceptionInput,
} from '#app/domain/receptions'

/** Date à midi local → composantes locales stables quel que soit le fuseau. */
function localDate(dayOffset: number): Date {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  return d
}

function input(over: Partial<ReceptionInput> = {}): ReceptionInput {
  return {
    noCommande: 'PO1',
    article: 'ART1',
    designation: 'Article 1',
    fournisseur: 'F1',
    fournisseurNom: 'Fournisseur 1',
    qteUs: 100,
    datePrevue: localDate(0),
    dateConfirmee: null,
    pcuStuCoe: 10,
    // PCUSTUCOE_1 = US par palette → 100 US = 2 palettes.
    ucParPal: 50,
    ...over,
  }
}

test.group('calcPalettes', () => {
  test('arrondit au supérieur (palette partielle = 1 palette au sol)', ({ assert }) => {
    // 100 US / 50 (US par palette) = 2 palettes pleines.
    assert.equal(calcPalettes(100, 50), 2)
    // 101 US → 2,02 palettes → ceil = 3.
    assert.equal(calcPalettes(101, 50), 3)
    // 1 US → 0,02 palette → ceil = 1 (palette partielle).
    assert.equal(calcPalettes(1, 50), 1)
  })

  test('PCUSTUCOE_1 est en US/pal, pas en UC/pal (régression : double division)', ({ assert }) => {
    // Cas réel A7398E01 : 6480 US, PCUSTUCOE_0=36, PCUSTUCOE_1=720 → 9 palettes.
    // L'ancien calcul enchaînait les deux coefs (6480/36/720 = 0,25 → 1 palette).
    assert.equal(calcPalettes(6480, 720), 9)
  })

  test('retourne 0 si le coef est absent ou non positif', ({ assert }) => {
    assert.equal(calcPalettes(100, null), 0)
    assert.equal(calcPalettes(100, 0), 0)
    assert.equal(calcPalettes(100, -3), 0)
  })

  test('retourne 0 si la quantité est nulle ou négative', ({ assert }) => {
    assert.equal(calcPalettes(0, 50), 0)
    assert.equal(calcPalettes(-50, 50), 0)
  })
})

test.group('pickReceptionDate', () => {
  test('privilégie la date confirmée fournisseur si renseignée', ({ assert }) => {
    const confirmee = localDate(3)
    const prevue = localDate(1)
    assert.equal(pickReceptionDate(confirmee, prevue), pickReceptionDate(confirmee, null))
  })

  test('retombe sur la date prévue si pas de date confirmée', ({ assert }) => {
    const prevue = localDate(2)
    assert.equal(pickReceptionDate(null, prevue), pickReceptionDate(null, prevue))
    assert.isNotNull(pickReceptionDate(null, prevue))
  })

  test('retourne null si aucune date', ({ assert }) => {
    assert.isNull(pickReceptionDate(null, null))
  })
})

test.group('buildReceptionRow', () => {
  test('enrichit avec date retenue et palettes calculées', ({ assert }) => {
    const row = buildReceptionRow(input({ qteUs: 100, pcuStuCoe: 10, ucParPal: 50 }))
    assert.isNotNull(row.date)
    assert.equal(row.nbPalettes, 2)
  })

  test('pcuStuCoe absent n’empêche pas le calcul (seul PCUSTUCOE_1 compte)', ({ assert }) => {
    const row = buildReceptionRow(input({ qteUs: 100, pcuStuCoe: null, ucParPal: 50 }))
    assert.equal(row.nbPalettes, 2)
  })

  test('coef US/pal manquant → palettes à 0 mais ligne conservée', ({ assert }) => {
    const row = buildReceptionRow(input({ ucParPal: null }))
    assert.equal(row.nbPalettes, 0)
    assert.isNotNull(row.date)
  })
})

test.group('groupReceptionsByDay', () => {
  test('agrège palettes + lignes + fournisseurs distincts par jour', ({ assert }) => {
    const day1 = pickReceptionDate(localDate(1), null)!
    const rows = [
      buildReceptionRow(input({ qteUs: 100, datePrevue: localDate(1) })), // 2 pal, F1
      buildReceptionRow(input({ qteUs: 100, datePrevue: localDate(1), fournisseur: 'F2' })), // 2 pal, F2
      buildReceptionRow(input({ qteUs: 100, datePrevue: localDate(5) })), // 2 pal, F1, autre jour
    ]
    const charge = groupReceptionsByDay(rows)
    assert.lengthOf(charge, 2)
    const pic = charge.find((c) => c.day === day1)!
    assert.equal(pic.palettes, 4)
    assert.equal(pic.lignes, 2)
    assert.equal(pic.fournisseurs, 2)
  })

  test('ignore les lignes sans date retenue', ({ assert }) => {
    const rows = [
      buildReceptionRow(input({ datePrevue: null, dateConfirmee: null })),
      buildReceptionRow(input({ datePrevue: localDate(1) })),
    ]
    const charge = groupReceptionsByDay(rows)
    assert.lengthOf(charge, 1)
  })

  test('renvoie les jours triés par ordre chronologique', ({ assert }) => {
    const rows = [
      buildReceptionRow(input({ datePrevue: localDate(10) })),
      buildReceptionRow(input({ datePrevue: localDate(1) })),
      buildReceptionRow(input({ datePrevue: localDate(5) })),
    ]
    const charge = groupReceptionsByDay(rows)
    assert.deepEqual(
      charge.map((c) => c.day),
      [...charge].sort((a, b) => a.day.localeCompare(b.day)).map((c) => c.day)
    )
  })
})

/** Ligne de rupture minimale (forme consommée par buildCriticiteIndex). */
function shortage(over: Partial<Parameters<typeof buildCriticiteIndex>[0][number]> = {}) {
  return {
    component: 'COMP1',
    numOf: 'OF1',
    articleParent: 'PF1',
    numCommande: 'CMD1',
    client: 'ACME',
    dateExpedition: '2026-08-01',
    joursMarge: -2,
    overdue: false,
    reception: { id: 'PO1' },
    verdict: 'retard',
    ...over,
  }
}

test.group('buildCriticiteIndex', () => {
  test('ne retient que les verdicts retard et a_risque', ({ assert }) => {
    const items = buildCriticiteIndex([
      shortage({ verdict: 'retard' }),
      shortage({ verdict: 'a_risque', component: 'COMP2' }),
      shortage({ verdict: 'couvert', component: 'COMP3' }),
      shortage({ verdict: 'sous_ensemble', component: 'COMP4' }),
      shortage({ verdict: 'sans_couverture', component: 'COMP5' }),
    ])
    assert.deepEqual(
      items.map((i) => i.article).sort(),
      ['COMP1', 'COMP2']
    )
  })

  test('ignore les lignes sans réception rattachée', ({ assert }) => {
    assert.lengthOf(buildCriticiteIndex([shortage({ reception: null })]), 0)
  })

  test('regroupe par commande d’achat ET article', ({ assert }) => {
    const items = buildCriticiteIndex([
      shortage({ numOf: 'OF1' }),
      shortage({ numOf: 'OF2' }),
      shortage({ numOf: 'OF3', component: 'COMP2' }),
    ])
    assert.lengthOf(items, 2)
    const comp1 = items.find((i) => i.article === 'COMP1')!
    assert.deepEqual(
      comp1.ofs.map((o) => o.numOf),
      ['OF1', 'OF2']
    )
  })

  test('dédoublonne les OF attendant deux fois la même réception', ({ assert }) => {
    const items = buildCriticiteIndex([shortage({ numOf: 'OF1' }), shortage({ numOf: 'OF1' })])
    assert.lengthOf(items[0].ofs, 1)
  })

  test('retard domine a_risque et la marge la plus faible gouverne', ({ assert }) => {
    const items = buildCriticiteIndex([
      shortage({ numOf: 'OF1', verdict: 'a_risque', joursMarge: 3 }),
      shortage({ numOf: 'OF2', verdict: 'retard', joursMarge: -5 }),
    ])
    assert.equal(items[0].niveau, 'retard')
    assert.equal(items[0].joursMarge, -5)
  })

  test('classe les OF du plus contraint au moins contraint', ({ assert }) => {
    const items = buildCriticiteIndex([
      shortage({ numOf: 'OF1', joursMarge: 4 }),
      shortage({ numOf: 'OF2', joursMarge: -3 }),
      shortage({ numOf: 'OF3', joursMarge: 1 }),
    ])
    assert.deepEqual(
      items[0].ofs.map((o) => o.numOf),
      ['OF2', 'OF3', 'OF1']
    )
  })

  test('propage overdue dès qu’une ligne le porte', ({ assert }) => {
    const items = buildCriticiteIndex([
      shortage({ numOf: 'OF1', overdue: false }),
      shortage({ numOf: 'OF2', overdue: true }),
    ])
    assert.isTrue(items[0].overdue)
  })
})
