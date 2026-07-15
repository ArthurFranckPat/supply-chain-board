import { test } from '@japa/runner'
import type { Workstation } from '#app/domain/models/workstation'
import { capDay, capacityPeriod } from '#app/domain/capacity'

// PP_830 réel : CFA (7,5 h Lun-Ven, ~0 week-end), 2 exemplaires, EFF 90 %, USE 100 %, SHR 0.
function pp830(overrides: Partial<Workstation> = {}): Workstation {
  return {
    code: 'PP_830',
    description: '',
    type: 1,
    parallelUnits: 2,
    efficiency: 90,
    utilization: 100,
    scrap: 0,
    scheduleCode: 'CFA',
    dailyCapacity: [7.5, 7.5, 7.5, 7.5, 7.5, 0.01, 0], // Lun→Dim
    stockLocation: 'S9P',
    workCenter: 'PP',
    facility: 'AE1',
    ...overrides,
  }
}

// 2026-06-22 = lundi (jour 0 du schéma) ; 2026-06-27 = samedi ; 2026-06-28 = dimanche.
const lundi = new Date('2026-06-22T00:00:00')
const samedi = new Date('2026-06-27T00:00:00')
const dimanche = new Date('2026-06-28T00:00:00')

test.group('capacity / capDay', () => {
  test("capacité nette d'un jour ouvré = DAYCAP × WSTNBR × rendement", ({ assert }) => {
    // 7,5 × 2 × 0,90 = 13,5 h
    assert.closeTo(capDay(pp830(), lundi), 13.5, 1e-9)
  })

  test('capacité théorique ignore le rendement', ({ assert }) => {
    // 7,5 × 2 = 15 h
    assert.closeTo(capDay(pp830(), lundi, true), 15, 1e-9)
  })

  test('jour non travaillé ⇒ quasi nul', ({ assert }) => {
    assert.closeTo(capDay(pp830(), dimanche), 0, 1e-9)
    assert.closeTo(capDay(pp830(), samedi), 0.01 * 2 * 0.9, 1e-9)
  })

  test('pourcentages à 0 (non renseignés X3) ⇒ rendement neutre 100 %', ({ assert }) => {
    const w = pp830({ efficiency: 0, utilization: 0, parallelUnits: 0 })
    // units→1, eff→100, use→100 : 7,5 × 1 = 7,5
    assert.closeTo(capDay(w, lundi), 7.5, 1e-9)
  })
})

test.group('capacity / capacityPeriod', () => {
  test('somme sur une semaine pleine (Lun→Dim) = 5 jours ouvrés + samedi', ({ assert }) => {
    const to = new Date('2026-06-28T00:00:00') // dimanche
    // 5 × 13,5 + (0,01 × 2 × 0,9) + 0 = 67,5 + 0,018
    assert.closeTo(capacityPeriod(pp830(), lundi, to), 67.5 + 0.01 * 2 * 0.9, 1e-9)
  })

  test('bornes incluses, ordre jour indifférent au passage horaire', ({ assert }) => {
    // un seul jour ouvré
    assert.closeTo(capacityPeriod(pp830(), lundi, lundi), 13.5, 1e-9)
  })
})
