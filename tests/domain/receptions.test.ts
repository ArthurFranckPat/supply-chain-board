import { test } from '@japa/runner'
import {
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
    ucParPal: 5,
    ...over,
  }
}

test.group('calcPalettes', () => {
  test('arrondit au supérieur (palette partielle = 1 palette au sol)', ({ assert }) => {
    // 100 US / 10 (US par UC) = 10 UC ; 10 UC / 5 (UC par palette) = 2 palettes.
    assert.equal(calcPalettes(100, 10, 5), 2)
    // 101 US → 10,1 UC → 2,02 palettes → ceil = 3.
    assert.equal(calcPalettes(101, 10, 5), 3)
    // 1 US → 0,1 UC → 0,02 palette → ceil = 1 (palette partielle).
    assert.equal(calcPalettes(1, 10, 5), 1)
  })

  test('retourne 0 si un coef est absent ou non positif', ({ assert }) => {
    assert.equal(calcPalettes(100, null, 5), 0)
    assert.equal(calcPalettes(100, 10, null), 0)
    assert.equal(calcPalettes(100, 0, 5), 0)
    assert.equal(calcPalettes(100, 10, -3), 0)
  })

  test('retourne 0 si la quantité est nulle ou négative', ({ assert }) => {
    assert.equal(calcPalettes(0, 10, 5), 0)
    assert.equal(calcPalettes(-50, 10, 5), 0)
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
    const row = buildReceptionRow(input({ qteUs: 100, pcuStuCoe: 10, ucParPal: 5 }))
    assert.isNotNull(row.date)
    assert.equal(row.nbPalettes, 2)
  })

  test('coef manquant → palettes à 0 mais ligne conservée', ({ assert }) => {
    const row = buildReceptionRow(input({ pcuStuCoe: null }))
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
