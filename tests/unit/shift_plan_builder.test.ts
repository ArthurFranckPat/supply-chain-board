import { test } from '@japa/runner'
import type { Workstation } from '#app/domain/models/workstation'
import { isoDay, mondayOf, addDays } from '#app/utils/dates'
import { buildShiftPlans, SHIFT_PLAN_WEEKS } from '#services/shift_plan_builder'

/**
 * Le builder n'a qu'une décision propre : QUELLES semaines le plan couvre. Le
 * graphe /charge commence au lundi du 1er du mois, donc jusqu'à quatre semaines
 * déjà écoulées — les laisser entrer vide le préavis de sa substance et met des
 * colonnes à 0 % en tête de frise.
 */

function pp830(): Workstation {
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
  }
}

/** Lundis consécutifs, comme les produit le graphe (minuit LOCAL, pas UTC). */
function mondays(n: number, from: string): string[] {
  let d = mondayOf(new Date(`${from}T12:00:00`))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(isoDay(d))
    d = addDays(d, 7)
  }
  return out
}

const TODAY = new Date('2026-09-20T09:00:00') // dimanche → semaine du lundi 14/09

function build(weekKeys: string[], load: number[], today = TODAY) {
  return buildShiftPlans({
    workstations: [pp830()],
    calendar: null,
    weekKeys,
    loadByView: {
      of: new Map([['PP_830', load]]),
      commande: new Map([['PP_830', load]]),
    },
    today,
  })
}

test.group('shift_plan_builder — fenêtre du plan', () => {
  test('le plan démarre à la semaine courante, pas au début du graphe', ({ assert }) => {
    const keys = mondays(26, '2026-08-31')
    const out = build(
      keys,
      keys.map(() => 40)
    )

    assert.equal(out.weekKeys[0], '2026-09-14')
    assert.lengthOf(out.weekKeys, SHIFT_PLAN_WEEKS)
    assert.equal(out.weekKeys.at(-1), '2026-11-30')
  })

  test('la charge est recadrée avec les semaines, pas laissée décalée', ({ assert }) => {
    const keys = mondays(26, '2026-08-31')
    // Zéro sur les deux premières semaines du graphe (passé), 60 h ensuite : un
    // recadrage qui oublierait la charge ferait remonter ces zéros dans la frise.
    const out = build(
      keys,
      keys.map((_, i) => (i < 2 ? 0 : 60))
    )
    const weeks = out.of[0].plan.weeks

    assert.lengthOf(weeks, SHIFT_PLAN_WEEKS)
    assert.isTrue(weeks.every((w) => w.load === 60))
  })

  test('un poste chargé seulement dans le passé est écarté, pas planifié', ({ assert }) => {
    const keys = mondays(26, '2026-08-31')
    const out = build(
      keys,
      keys.map((_, i) => (i < 2 ? 80 : 0))
    )

    assert.lengthOf(out.of, 0)
    assert.deepEqual(out.skipped, [{ code: 'PP_830', reason: 'sans_charge' }])
  })

  test('horizon entièrement passé : la fenêtre ne part pas dans le vide', ({ assert }) => {
    const keys = mondays(6, '2026-01-05')
    const out = build(
      keys,
      keys.map(() => 40)
    )

    // Aucune semaine ne satisfait le critère : on retombe sur le début du graphe
    // plutôt que de rendre une fenêtre vide.
    assert.equal(out.weekKeys[0], '2026-01-05')
    assert.lengthOf(out.weekKeys, 6)
  })
})
