import { test } from '@japa/runner'
import {
  computeJoursRetard,
  computeProfondeur,
  emptyProfondeur,
} from '#app/domain/retard_profondeur'

test.group('computeJoursRetard', () => {
  test('date absente → 0', ({ assert }) => {
    assert.equal(computeJoursRetard(null, '2026-07-29'), 0)
  })

  test('date future → 0', ({ assert }) => {
    assert.equal(computeJoursRetard('2026-08-01', '2026-07-29'), 0)
  })

  test('écart calendaire exact', ({ assert }) => {
    assert.equal(computeJoursRetard('2026-07-20', '2026-07-29'), 9)
    assert.equal(computeJoursRetard('2026-07-29', '2026-07-29'), 0)
  })
})

test.group('computeProfondeur', () => {
  test('liste vide → agrégat nul avec buckets vides', ({ assert }) => {
    const p = computeProfondeur([])
    assert.deepEqual(p, emptyProfondeur())
    assert.equal(p.buckets.length, 4)
  })

  test('max + moyenne pondérée heures + répartition buckets', ({ assert }) => {
    const p = computeProfondeur([
      { joursRetard: 3, heures: 10 }, // 1-7
      { joursRetard: 10, heures: 20 }, // 8-14
      { joursRetard: 45, heures: 10 }, // >30
    ])
    assert.equal(p.maxJours, 45)
    // (3*10 + 10*20 + 45*10) / 40 = (30+200+450)/40 = 17
    assert.equal(p.moyennePondereeHeures, 17)
    assert.equal(p.buckets[0].nbLignes, 1)
    assert.equal(p.buckets[0].heures, 10)
    assert.equal(p.buckets[1].nbLignes, 1)
    assert.equal(p.buckets[1].heures, 20)
    assert.equal(p.buckets[2].nbLignes, 0)
    assert.equal(p.buckets[3].nbLignes, 1)
    assert.equal(p.buckets[3].heures, 10)
  })

  test('heures nulles → moyenne simple des jours', ({ assert }) => {
    const p = computeProfondeur([
      { joursRetard: 2, heures: 0 },
      { joursRetard: 8, heures: 0 },
    ])
    assert.equal(p.maxJours, 8)
    assert.equal(p.moyennePondereeHeures, 5)
  })

  test('limites de buckets inclusives', ({ assert }) => {
    const p = computeProfondeur([
      { joursRetard: 1, heures: 1 },
      { joursRetard: 7, heures: 1 },
      { joursRetard: 8, heures: 1 },
      { joursRetard: 14, heures: 1 },
      { joursRetard: 15, heures: 1 },
      { joursRetard: 30, heures: 1 },
      { joursRetard: 31, heures: 1 },
    ])
    assert.equal(p.buckets[0].nbLignes, 2) // 1, 7
    assert.equal(p.buckets[1].nbLignes, 2) // 8, 14
    assert.equal(p.buckets[2].nbLignes, 2) // 15, 30
    assert.equal(p.buckets[3].nbLignes, 1) // 31
  })
})
