import { test } from '@japa/runner'
import { materialBuckets } from '#services/material_plan_loader'
import { isoDay, mondayOf } from '#app/utils/dates'

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

/**
 * Changement d'heure — régression.
 *
 * Les buckets avançaient de `7 × DAY_MS` alors que les besoins sont classés par
 * `isoDay(mondayOf(date))`. Au passage à l'heure d'hiver, `lundi 00:00 CEST +
 * 168 h` vaut `dimanche 23:00 CET` : la clé produite était un dimanche, plus
 * aucun besoin ne retombait dessus, et TOUTE la fenêtre postérieure à la
 * bascule disparaissait de la grille — sans erreur, sans compteur, sans rien.
 * En maille jour, la bascule fabriquait deux fois la même clé.
 *
 * Le fuseau est forcé pour la durée du groupe : sous un fuseau sans heure d'été
 * (l'UTC de bien des runners CI), le défaut est invisible et le test passerait
 * à vide.
 */
test.group("materialBuckets · changement d'heure", (group) => {
  const initialTz = process.env.TZ
  group.each.setup(() => {
    process.env.TZ = 'Europe/Paris'
    return () => {
      process.env.TZ = initialTz
    }
  })

  test("semaine : les clés restent des lundis de part et d'autre du 25/10", ({ assert }) => {
    const r = materialBuckets(d('2026-10-12'), d('2026-11-23'), 'semaine')
    const keys = 'buckets' in r ? r.buckets.map((b) => b.key) : []
    assert.deepEqual(keys, [
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ])
    // Le contrat qui a cassé : la clé d'un besoin daté DOIT viser un bucket.
    for (const iso of ['2026-10-20', '2026-10-28', '2026-11-04', '2026-11-18']) {
      assert.include(keys, isoDay(mondayOf(d(iso))), `besoin ${iso} sans bucket`)
    }
  })

  test('jour : aucun bucket en double le jour de la bascule', ({ assert }) => {
    const r = materialBuckets(d('2026-10-23'), d('2026-10-29'), 'jour')
    const keys = 'buckets' in r ? r.buckets.map((b) => b.key) : []
    assert.deepEqual(keys, [
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ])
    assert.lengthOf([...new Set(keys)], keys.length)
  })
})
