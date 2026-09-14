import { test } from '@japa/runner'
import type { Workstation } from '#app/domain/models/workstation'
import {
  capDay,
  capacityPeriod,
  chargeHoursWithEfficiency,
  isOpenDay,
  shiftsOf,
  weeklyCapacity,
  SHIFT_HOURS,
} from '#app/domain/capacity'
import { ofDateForMode } from '#services/load_payload_loader'

/**
 * Base de calcul : l'ÉQUIPE (7 h), pas le DAYCAP X3. X3 exprime le nombre d'équipes
 * de deux façons — par le schéma horaire (`2/8`) ou par les exemplaires (`WSTNBR`) —
 * et les deux doivent donner la même capacité. Un schéma hors référentiel garde son
 * DAYCAP : mieux vaut la valeur X3 qu'un arrondi en équipes.
 */

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
  test("capacité nette d'un jour ouvré = 7 h × équipes × WSTNBR × rendement", ({ assert }) => {
    // CFA = 1 équipe, 2 exemplaires : 7 × 1 × 2 × 0,90 = 12,6 h (et NON 7,5 × 2 × 0,9).
    assert.closeTo(capDay(pp830(), lundi), 12.6, 1e-9)
  })

  test('capacité théorique ignore le rendement', ({ assert }) => {
    // 7 × 1 × 2 = 14 h
    assert.closeTo(capDay(pp830(), lundi, true), 14, 1e-9)
  })

  test('schéma 2/8 sur 1 exemplaire = même capacité que CFA sur 2 exemplaires', ({ assert }) => {
    // PP_153 : deux équipes par le SCHÉMA. Les deux encodages X3 du 2×8 convergent.
    const pp153 = pp830({
      code: 'PP_153',
      parallelUnits: 1,
      efficiency: 100,
      scheduleCode: '2/8',
      dailyCapacity: [14.34, 14.34, 14.34, 14.34, 14.34, 0.01, 0],
    })
    assert.closeTo(capDay(pp153, lundi, true), 14, 1e-9)
    assert.closeTo(capDay(pp830({ efficiency: 100 }), lundi, true), 14, 1e-9)
  })

  test('schéma hors référentiel : DAYCAP conservé tel quel', ({ assert }) => {
    // Feu continu (GHE, 24 h/j) : aucun arrondi en équipes, la valeur X3 fait foi.
    const continu = pp830({
      parallelUnits: 1,
      efficiency: 100,
      scheduleCode: 'GHE',
      dailyCapacity: [24, 24, 24, 24, 24, 24, 24],
    })
    assert.isNull(shiftsOf(continu))
    assert.closeTo(capDay(continu, lundi, true), 24, 1e-9)
    assert.closeTo(capDay(continu, dimanche, true), 24, 1e-9)
  })

  test('jour fermé : la sentinelle 0,01 vaut zéro, jamais un reliquat', ({ assert }) => {
    // Ancien calcul : 0,01 × 2 × 0,9 = 0,018 > CLOSED_CAP_H → samedi compté « ouvert ».
    assert.closeTo(capDay(pp830(), dimanche), 0, 1e-9)
    assert.closeTo(capDay(pp830(), samedi), 0, 1e-9)
    assert.isFalse(isOpenDay(pp830(), samedi, 1))
    assert.isTrue(isOpenDay(pp830(), lundi, 1))
  })

  test('facteur calendrier nul ⇒ jour fermé même sur un jour ouvré', ({ assert }) => {
    assert.isFalse(isOpenDay(pp830(), lundi, 0))
  })

  test('pourcentages à 0 (non renseignés X3) ⇒ rendement neutre 100 %', ({ assert }) => {
    const w = pp830({ efficiency: 0, utilization: 0, parallelUnits: 0 })
    // units→1, eff→100, use→100 : 7 × 1 × 1 = 7
    assert.closeTo(capDay(w, lundi), SHIFT_HOURS, 1e-9)
  })

  test('la perte SHR ampute la capacité', ({ assert }) => {
    // 7 × 2 × 0,90 × (1 − 0,10) = 11,34 h
    assert.closeTo(capDay(pp830({ scrap: 10 }), lundi), 11.34, 1e-9)
  })
})

test.group('capacity / weeklyCapacity', () => {
  test('somme les 7 jours du schéma, week-end fermé exclu', ({ assert }) => {
    // 5 jours ouvrés × 12,6 = 63 h
    assert.equal(weeklyCapacity(pp830()), 63)
  })

  test('poste fermé toute la semaine ⇒ null (pas de comparatif de saturation)', ({ assert }) => {
    assert.isNull(weeklyCapacity(pp830({ dailyCapacity: [0, 0, 0, 0, 0, 0, 0] })))
  })
})

test.group('capacity / chargeHoursWithEfficiency', () => {
  test('augmente les heures standard selon l’efficience de la ligne', ({ assert }) => {
    assert.closeTo(chargeHoursWithEfficiency(10, pp830()), 10 / 0.9, 1e-9)
  })

  test('efficience absente ou nulle : conversion neutre', ({ assert }) => {
    assert.equal(chargeHoursWithEfficiency(10, undefined), 10)
    assert.equal(chargeHoursWithEfficiency(10, pp830({ efficiency: 0 })), 10)
  })
})

test.group('charge / date de rattachement OF', () => {
  const debut = new Date('2026-06-22T00:00:00')
  const fin = new Date('2026-06-26T00:00:00')

  test('utilise le début par défaut et la fin sur option', ({ assert }) => {
    assert.deepEqual(ofDateForMode({ startDate: debut, endDate: fin }), debut)
    assert.deepEqual(ofDateForMode({ startDate: debut, endDate: fin }, 'end'), fin)
  })

  test('fin absente : repli sur le début', ({ assert }) => {
    assert.deepEqual(ofDateForMode({ startDate: debut, endDate: null }, 'end'), debut)
  })
})

test.group('capacity / capacityPeriod', () => {
  test('somme sur une semaine pleine (Lun→Dim) = 5 jours ouvrés, week-end nul', ({ assert }) => {
    const to = new Date('2026-06-28T00:00:00') // dimanche
    // 5 × 12,6 = 63 h ; samedi (sentinelle) et dimanche n'ajoutent rien.
    assert.closeTo(capacityPeriod(pp830(), lundi, to), 63, 1e-9)
  })

  test('bornes incluses, ordre jour indifférent au passage horaire', ({ assert }) => {
    // un seul jour ouvré
    assert.closeTo(capacityPeriod(pp830(), lundi, lundi), 12.6, 1e-9)
  })
})
