import { test } from '@japa/runner'
import {
  easterSunday,
  frenchHolidays,
  workingDaysBetween,
  subWorkingDaysIso,
  subWorkingDays,
} from '#app/domain/holidays'

test.group('holidays / easterSunday', () => {
  test('dimanches de Pâques connus', ({ assert }) => {
    // Références : 2026-04-05, 2025-04-20, 2024-03-31, 2027-03-28.
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    assert.equal(fmt(easterSunday(2026)), '2026-04-05')
    assert.equal(fmt(easterSunday(2025)), '2025-04-20')
    assert.equal(fmt(easterSunday(2024)), '2024-03-31')
    assert.equal(fmt(easterSunday(2027)), '2027-03-28')
  })
})

test.group('holidays / frenchHolidays', () => {
  test('11 fériés, fixes + mobiles corrects (2026)', ({ assert }) => {
    const h = frenchHolidays(2026)
    assert.lengthOf(h, 11)
    const byDate = new Map(h.map((x) => [x.date, x.name]))
    // Fixes
    assert.equal(byDate.get('2026-01-01'), "Jour de l'An")
    assert.equal(byDate.get('2026-05-01'), 'Fête du Travail')
    assert.equal(byDate.get('2026-07-14'), 'Fête nationale')
    assert.equal(byDate.get('2026-12-25'), 'Noël')
    // Mobiles (Pâques 2026 = 05/04) : Lundi de Pâques 06/04, Ascension 14/05, Pentecôte 25/05
    assert.equal(byDate.get('2026-04-06'), 'Lundi de Pâques')
    assert.equal(byDate.get('2026-05-14'), 'Ascension')
    assert.equal(byDate.get('2026-05-25'), 'Lundi de Pentecôte')
  })

  test('trié par date croissante', ({ assert }) => {
    const h = frenchHolidays(2025)
    const dates = h.map((x) => x.date)
    assert.deepEqual(dates, [...dates].sort())
  })
})

test.group('holidays / workingDaysBetween', () => {
  test('0 quand from === to', ({ assert }) => {
    assert.equal(workingDaysBetween('2026-07-06', '2026-07-06'), 0)
  })

  test('0 quand to < from (date future)', ({ assert }) => {
    assert.equal(workingDaysBetween('2026-07-10', '2026-07-06'), 0)
  })

  test('compte un jour ouvré simple (lundi → mardi)', ({ assert }) => {
    assert.equal(workingDaysBetween('2026-07-06', '2026-07-07'), 1)
  })

  test('saute le week-end (vendredi → lundi = 1 j ouvré)', ({ assert }) => {
    // vendredi 03/07 → lundi 06/07 : 1 jour ouvré (samedi/dimanche exclus)
    assert.equal(workingDaysBetween('2026-07-03', '2026-07-06'), 1)
  })

  test('vendredi → mardi suivant = 2 jours ouvrés', ({ assert }) => {
    assert.equal(workingDaysBetween('2026-07-03', '2026-07-07'), 2)
  })

  test('exclut le 14 juillet (férié FR)', ({ assert }) => {
    // 13/07 (lundi, from inclusif) → 16/07 (jeudi, to exclusif)
    // ouvrés : 13, 14(férié exclu), 15 = 2 jours ouvrés
    assert.equal(workingDaysBetween('2026-07-13', '2026-07-16'), 2)
  })

  test('exclut un lundi de Pâques férié (2026-04-06)', ({ assert }) => {
    // vendredi 03/04 → mercredi 08/04 : 03(sam/dim exclus), 06(férié), 07, 08
    // = 03/04 → 08/04 : jours ouvrés = 07, 08 = 2
    assert.equal(workingDaysBetween('2026-04-03', '2026-04-08'), 2)
  })

  test('AR2601357 : 26/06 → 05/07 = 6 jours ouvrés (critique, > tolérance)', ({ assert }) => {
    // 26/06 (ven, from inclusif) → 05/07 (dim, to exclusif) 2026, sans férié entre les deux
    // ouvrés : 26, 29, 30, 01, 02, 03 = 6 j → critical (au-delà de la tolérance 1 j)
    assert.equal(workingDaysBetween('2026-06-26', '2026-07-05'), 6)
  })
})

test.group('subWorkingDaysIso — recul de N jours ouvrés (buffer logistique J-2)', () => {
  test('mardi → recule en sautant le week-end (le cas de la MAD max)', ({ assert }) => {
    // Mardi 23/06/2026 − 2 j ouvrés : lundi 22, puis vendredi 19 (samedi/dimanche sautés).
    assert.equal(subWorkingDaysIso('2026-06-23', 2), '2026-06-19')
  })

  test('lundi → recule en sautant le week-end', ({ assert }) => {
    // Lundi 14/09/2026 − 2 j ouvrés : vendredi 11, jeudi 10.
    assert.equal(subWorkingDaysIso('2026-09-14', 2), '2026-09-10')
  })

  test('saute un jour férié (14 juillet)', ({ assert }) => {
    // Jeudi 16/07/2026 − 2 j ouvrés : mercredi 15, puis lundi 13 (mardi 14 férié).
    assert.equal(subWorkingDaysIso('2026-07-16', 2), '2026-07-13')
  })

  test('days = 0 → date inchangée, même non ouvrée', ({ assert }) => {
    assert.equal(subWorkingDaysIso('2026-06-21', 0), '2026-06-21') // un dimanche
  })

  test('variante Date : mêmes jours, heure locale conservée', ({ assert }) => {
    const d = subWorkingDays(new Date(2026, 5, 23), 2)
    assert.equal([d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-'), '2026-6-19')
  })
})
