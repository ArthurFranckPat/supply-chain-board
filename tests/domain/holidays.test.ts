import { test } from '@japa/runner'
import { easterSunday, frenchHolidays } from '#app/domain/holidays'

test.group('holidays / easterSunday', () => {
  test('dimanches de Pâques connus', ({ assert }) => {
    // Références : 2026-04-05, 2025-04-20, 2024-03-31, 2027-03-28.
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
