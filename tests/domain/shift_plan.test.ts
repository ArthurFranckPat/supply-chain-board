import { test } from '@japa/runner'
import type { Workstation } from '#app/domain/models/workstation'
import {
  SHIFT_CATALOG,
  currentScheduleOf,
  scheduleByCode,
  weeklyCapacityUnder,
  weeklyCrewDaysUnder,
} from '#app/domain/shift_schedules'
import { planShifts, type ShiftPlanInput } from '#app/domain/shift_plan'

/**
 * Le moteur ne cherche pas la capacité la plus ajustée : il cherche la plus
 * RÉGULIÈRE qui tienne. Ces tests verrouillent les trois choses qui font ça —
 * palier de 3 semaines, lissage en cumulé, substitution de WSTNBR.
 */

// PP_830 réel : CFA (7,5 h Lun-Ven), 2 exemplaires, EFF 90 %. Ses deux exemplaires
// SONT ses deux équipes : le catalogue doit le lire `2x8-5j`, pas `1x8-5j`.
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
    dailyCapacity: [7.5, 7.5, 7.5, 7.5, 7.5, 0.01, 0],
    stockLocation: 'S9P',
    workCenter: 'PP',
    facility: 'AE1',
    ...overrides,
  }
}

const OPEN = [1, 1, 1, 1, 1, 0, 0]

/** Entrée du moteur pour un poste, capacité dérivée du poste et du calendrier. */
function inputFor(w: Workstation, load: number[], factors: number[][] = []): ShiftPlanInput {
  return {
    load,
    capacity: load.map((_, i) => {
      const f = factors[i] ?? OPEN
      return new Map(SHIFT_CATALOG.map((s) => [s.code, weeklyCapacityUnder(s, w, f)]))
    }),
    crewDays: load.map((_, i) => {
      const f = factors[i] ?? OPEN
      return new Map(SHIFT_CATALOG.map((s) => [s.code, weeklyCrewDaysUnder(s, f)]))
    }),
    current: currentScheduleOf(w),
  }
}

test.group('shift_schedules', () => {
  test('les exemplaires X3 sont des équipes, pas des lignes parallèles', ({ assert }) => {
    // Le piège : WSTNBR=2 sur un CFA, c'est un 2×8 sur une ligne. Si le catalogue
    // le lisait 1×8, poser 2×8 doublerait une capacité déjà doublée.
    assert.equal(currentScheduleOf(pp830())?.code, '2x8-5j')
    assert.equal(currentScheduleOf(pp830({ parallelUnits: 1 }))?.code, '1x8-5j')
    assert.equal(
      currentScheduleOf(pp830({ scheduleCode: '2/8', parallelUnits: 1 }))?.code,
      '2x8-5j'
    )
  })

  test('un schéma planifié ne remultiplie pas WSTNBR', ({ assert }) => {
    const w = pp830()
    // 2 équipes × 7 h × 5 j × 0,90 = 63 h. Et non 126 h (× les 2 exemplaires).
    assert.closeTo(weeklyCapacityUnder(scheduleByCode('2x8-5j')!, w, OPEN), 63, 0.001)
    assert.closeTo(weeklyCapacityUnder(scheduleByCode('1x8-5j')!, w, OPEN), 31.5, 0.001)
  })

  test('une semaine trouée reste hors catalogue', ({ assert }) => {
    // Lundi-mercredi-vendredi n'est pas un « 3 jours » : l'arrondir mentirait.
    assert.isNull(currentScheduleOf(pp830({ dailyCapacity: [7.5, 0, 7.5, 0, 7.5, 0, 0] })))
    // Schéma X3 non normalisable (feu continu) → non planifiable, reste sur DAYCAP.
    assert.isNull(currentScheduleOf(pp830({ scheduleCode: 'TUN' })))
  })

  test('le calendrier multiplie en dernier', ({ assert }) => {
    const w = pp830()
    const aout = [1, 1, 0, 1, 1, 0, 0] // un férié le mercredi
    assert.closeTo(weeklyCapacityUnder(scheduleByCode('2x8-5j')!, w, aout), 50.4, 0.001)
    assert.equal(weeklyCrewDaysUnder(scheduleByCode('2x8-5j')!, aout), 8)
  })
})

test.group('shift_plan', () => {
  test('aucun palier ne dure moins de trois semaines', ({ assert }) => {
    // Charge en dents de scie : le choix naïf donnerait 1×8, 2×8, 1×8, 2×8…
    const load = [20, 60, 20, 60, 20, 60, 20, 60, 20, 60, 20, 60]
    const plan = planShifts(inputFor(pp830({ parallelUnits: 1 }), load))
    for (const p of plan.plateaus) {
      assert.isAtLeast(p.to - p.from + 1, 3, `palier ${p.from}-${p.to} trop court`)
    }
    assert.isBelow(plan.switches, 4)
  })

  test('un pic est absorbé en avance dans le palier au lieu de faire basculer une semaine', ({
    assert,
  }) => {
    // 31,5 h/sem en 1×8, 63 h en 2×8. Trois semaines creuses puis un pic :
    // le cumul du palier passe en 2×8, la semaine creuse ne bascule pas seule.
    const load = [10, 10, 100, 10, 10, 10]
    const plan = planShifts(inputFor(pp830(), load), { frozenWeeks: 0 })
    assert.lengthOf(plan.plateaus, 2)
    assert.equal(plan.plateaus[0].schedule.crews, 2)
    assert.equal(plan.plateaus[0].debtHours, 0)
    // La semaine du pic dépasse sa propre capacité sans être signalée en retard :
    // c'est le cumul du palier qui la tient, et c'est tout l'objet du lissage.
    assert.isAbove(plan.weeks[2].load, plan.weeks[2].capacity)
    assert.notEqual(plan.weeks[2].state, 'retard')
  })

  test('une sous-charge légère garde la semaine pleine', ({ assert }) => {
    // 24 h/sem contre 31,5 h en 1×8 plein : le 4 jours (25,2 h) gaspillerait moins,
    // mais fermer le vendredi pour sept heures n'est pas une décision d'atelier.
    const load = new Array(12).fill(24)
    const plan = planShifts(inputFor(pp830({ parallelUnits: 1 }), load), { frozenWeeks: 0 })
    assert.lengthOf(plan.plateaus, 1)
    assert.equal(plan.plateaus[0].schedule.code, '1x8-5j')
  })

  test('une charge plate et faible ne fait pas tourner cinq jours à vide', ({ assert }) => {
    const load = new Array(12).fill(12)
    const plan = planShifts(inputFor(pp830({ parallelUnits: 1 }), load), { frozenWeeks: 0 })
    assert.lengthOf(plan.plateaus, 1)
    assert.equal(plan.plateaus[0].schedule.crews, 1)
    assert.isAtMost(plan.plateaus[0].schedule.openDays, 3)
  })

  test('une charge plate et forte tient un seul palier sur tout l’horizon', ({ assert }) => {
    const load = new Array(12).fill(60)
    const plan = planShifts(inputFor(pp830(), load), { frozenWeeks: 0 })
    assert.lengthOf(plan.plateaus, 1)
    assert.equal(plan.plateaus[0].schedule.code, '2x8-5j')
    assert.equal(plan.switches, 0)
  })

  test('le préavis impose le schéma courant sur les premières semaines', ({ assert }) => {
    // Charge énorme dès S0 : sans préavis le moteur passerait en 2×8 tout de suite.
    const w = pp830({ parallelUnits: 1 }) // courant = 1x8-5j
    const load = new Array(12).fill(120)
    const plan = planShifts(inputFor(w, load), { frozenWeeks: 2 })
    assert.equal(plan.plateaus[0].schedule.code, '1x8-5j')
    assert.isTrue(plan.plateaus[0].frozen)
    // Le palier gelé ne tient pas la charge, et le dit au lieu de la masquer.
    assert.isAbove(plan.plateaus[0].debtHours, 0)
    assert.equal(plan.weeks[0].state, 'retard')
    // Dès la sortie du gel, le moteur monte au schéma le plus capacitaire.
    assert.equal(plan.plateaus[1].schedule.code, '2x8-5j')
  })

  test('deux paliers voisins ne portent jamais le même schéma', ({ assert }) => {
    const load = [10, 10, 10, 90, 90, 90, 10, 10, 10, 90, 90, 90]
    const plan = planShifts(inputFor(pp830(), load), { frozenWeeks: 0 })
    for (let i = 1; i < plan.plateaus.length; i++) {
      assert.notEqual(plan.plateaus[i].schedule.code, plan.plateaus[i - 1].schedule.code)
    }
  })

  test('les semaines couvrent l’horizon sans trou', ({ assert }) => {
    const load = [30, 45, 12, 80, 22, 61, 15, 40, 33, 70, 18, 25, 44]
    const plan = planShifts(inputFor(pp830(), load))
    assert.lengthOf(plan.weeks, load.length)
    plan.weeks.forEach((wk, i) => assert.equal(wk.index, i))
    assert.equal(plan.plateaus[plan.plateaus.length - 1].to, load.length - 1)
  })

  test('un poste sans schéma courant reste planifiable sans préavis', ({ assert }) => {
    const input = inputFor(pp830({ scheduleCode: 'TUN' }), new Array(6).fill(40))
    assert.isNull(input.current)
    const plan = planShifts(input)
    assert.isFalse(plan.plateaus[0].frozen)
  })

  test('un horizon plus court que le palier minimum donne un palier unique', ({ assert }) => {
    const plan = planShifts(inputFor(pp830(), [40, 40]), { frozenWeeks: 0 })
    assert.lengthOf(plan.plateaus, 1)
    assert.deepEqual([plan.plateaus[0].from, plan.plateaus[0].to], [0, 1])
  })
})
