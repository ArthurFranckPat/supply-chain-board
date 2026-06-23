import { test } from '@japa/runner'
import type { Workstation } from '#app/domain/models/workstation'
import { buildWorkingCalendar, type Closure } from '#app/domain/working_calendar'

const wst = (code: string, stoloc: string): Workstation => ({
  code,
  description: '',
  type: 1,
  parallelUnits: 1,
  efficiency: 100,
  utilization: 100,
  scrap: 0,
  scheduleCode: 'CFA',
  dailyCapacity: [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0],
  stockLocation: stoloc,
  workCenter: 'PP',
  facility: 'AE1',
})

const PP830 = wst('PP_830', 'S9P')
const PP091 = wst('PP_091', 'S3P')

test.group('working_calendar / factor', () => {
  test('férié actif ⇒ facteur 0 pour tous', ({ assert }) => {
    const cal = buildWorkingCalendar(new Set(['2026-05-01']), [])
    assert.equal(cal.factor(PP830, '2026-05-01'), 0)
    assert.equal(cal.factor(PP091, '2026-05-01'), 0)
    assert.equal(cal.factor(PP830, '2026-05-04'), 1)
  })

  test('fermeture poste : ne touche que le poste visé, dans la plage', ({ assert }) => {
    const closures: Closure[] = [{ scope: 'wst', code: 'PP_830', from: '2026-08-10', to: '2026-08-21', factor: 0 }]
    const cal = buildWorkingCalendar(new Set(), closures)
    assert.equal(cal.factor(PP830, '2026-08-15'), 0)
    assert.equal(cal.factor(PP830, '2026-08-22'), 1) // hors plage
    assert.equal(cal.factor(PP091, '2026-08-15'), 1) // autre poste
  })

  test('fermeture atelier : matche le STOLOC', ({ assert }) => {
    const cal = buildWorkingCalendar(new Set(), [{ scope: 'stoloc', code: 'S9P', from: '2026-12-24', to: '2026-12-31', factor: 0 }])
    assert.equal(cal.factor(PP830, '2026-12-28'), 0) // S9P
    assert.equal(cal.factor(PP091, '2026-12-28'), 1) // S3P
  })

  test('fermeture globale demi-journée : 0.5 partout', ({ assert }) => {
    const cal = buildWorkingCalendar(new Set(), [{ scope: 'global', code: '', from: '2026-07-13', to: '2026-07-13', factor: 0.5 }])
    assert.equal(cal.factor(PP830, '2026-07-13'), 0.5)
    assert.equal(cal.factor(PP091, '2026-07-13'), 0.5)
  })

  test('le plus restrictif l\'emporte (férié > demi)', ({ assert }) => {
    const cal = buildWorkingCalendar(new Set(['2026-07-14']), [{ scope: 'global', code: '', from: '2026-07-14', to: '2026-07-14', factor: 0.5 }])
    assert.equal(cal.factor(PP830, '2026-07-14'), 0)
  })
})
