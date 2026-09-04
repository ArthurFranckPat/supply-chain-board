import { test } from '@japa/runner'
import { materialBuckets } from '#services/material_plan_loader'

/**
 * Règle maille × fenêtre : le critère est le NOMBRE DE PÉRIODES produites,
 * plafond 14 (×2 avec le double bucket ferme/prévision). Appliquée avant tout
 * calcul lourd — l'option hors-plafond est désactivée côté client, refusée
 * côté serveur.
 */

const d = (iso: string): Date => new Date(`${iso}T00:00:00`)

test.group('materialBuckets', () => {
  test('jour : un bucket par jour calendaire', ({ assert }) => {
    const r = materialBuckets(d('2026-09-01'), d('2026-09-03'), 'jour')
    assert.deepEqual('buckets' in r ? r.buckets.map((b) => b.key) : [], [
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
  })

  test('semaine : lundis couvrants, libellé S + date', ({ assert }) => {
    // 01/09/2026 = mardi → premier bucket = lundi 31/08.
    const r = materialBuckets(d('2026-09-01'), d('2026-09-10'), 'semaine')
    assert.deepEqual('buckets' in r ? r.buckets.map((b) => b.key) : [], [
      '2026-08-31',
      '2026-09-07',
    ])
  })

  test('mois : mois couvrants, clé YYYY-M', ({ assert }) => {
    const r = materialBuckets(d('2026-09-15'), d('2026-11-02'), 'mois')
    assert.deepEqual('buckets' in r ? r.buckets.map((b) => b.key) : [], [
      '2026-9',
      '2026-10',
      '2026-11',
    ])
  })

  test('plafond 14 : 6 mois au jour refusés avec message', ({ assert }) => {
    const r = materialBuckets(d('2026-09-01'), d('2027-02-28'), 'jour')
    assert.isTrue('error' in r)
    assert.match((r as { error: string }).error, /plafond 14/)
  })

  test('plafond 14 : 3 mois à la semaine passent (13), 6 mois non', ({ assert }) => {
    const ok = materialBuckets(d('2026-09-01'), d('2026-11-30'), 'semaine')
    assert.isTrue('buckets' in ok)
    assert.isTrue(('buckets' in ok ? ok.buckets.length : 99) <= 14)
    const ko = materialBuckets(d('2026-09-01'), d('2027-02-28'), 'semaine')
    assert.isTrue('error' in ko)
  })

  test('from après to refusé', ({ assert }) => {
    const r = materialBuckets(d('2026-09-10'), d('2026-09-01'), 'jour')
    assert.isTrue('error' in r)
  })
})
