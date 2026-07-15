import { test } from '@japa/runner'
import { nextWorkday, isHoliday, generateWorkdays, chargeByWorkstation } from '#app/domain/planning'

test.group('Calendar', () => {
  test('nextWorkday skips weekends', ({ assert }) => {
    // Friday June 12 2026
    const fri = new Date('2026-06-12')
    const result = nextWorkday(fri, [])
    assert.deepEqual(result, new Date('2026-06-15')) // Monday
  })

  test('nextWorkday skips holidays', ({ assert }) => {
    const mon = new Date('2026-06-15')
    const holidays = ['2026-06-16']
    const result = nextWorkday(mon, holidays)
    assert.deepEqual(result, new Date('2026-06-17'))
  })

  test('isHoliday matches YYYY-MM-DD strings', ({ assert }) => {
    const holidays = ['2026-07-14', '2026-12-25']
    assert.isTrue(isHoliday(new Date('2026-07-14'), holidays))
    assert.isFalse(isHoliday(new Date('2026-07-15'), holidays))
  })

  test('generateWorkdays produces only weekdays within range', ({ assert }) => {
    // Thu Jun 11 to Wed Jun 17 2026
    const days = generateWorkdays(new Date('2026-06-11'), new Date('2026-06-17'))
    assert.equal(days.length, 5) // Thu, Fri, Mon, Tue, Wed
    assert.equal(days[0].getDay(), 4) // Thursday
    assert.equal(days[4].getDay(), 3) // Wednesday
  })

  test('generateWorkdays excludes holidays', ({ assert }) => {
    const holidays = ['2026-06-12'] // Friday
    const days = generateWorkdays(new Date('2026-06-11'), new Date('2026-06-16'), holidays)
    assert.equal(days.length, 3) // Thu, Mon, Tue (Fri is holiday, Sat/Sun weekends)
  })
})

test.group('ChargeCalculator', () => {
  test('computes hours from quantity and rate', ({ assert }) => {
    const result = chargeByWorkstation([{ workstation: 'PP_830', rate: 10 }], 50)
    assert.equal(result.get('PP_830'), 5)
  })

  test('sums hours across multiple operations', ({ assert }) => {
    const result = chargeByWorkstation(
      [
        { workstation: 'PP_830', rate: 10 },
        { workstation: 'PP_830', rate: 20 },
        { workstation: 'PP_128', rate: 5 },
      ],
      100
    )
    assert.equal(result.get('PP_830'), 15) // 100/10 + 100/20
    assert.equal(result.get('PP_128'), 20) // 100/5
  })

  test('returns 0 for zero rate', ({ assert }) => {
    const result = chargeByWorkstation([{ workstation: 'PP_830', rate: 0 }], 100)
    assert.equal(result.get('PP_830'), 0)
  })
})
