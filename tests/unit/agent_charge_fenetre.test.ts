/**
 * Fenêtre d'horizon de `getCharge` — le bug qu'elle corrige : « la charge sur les
 * 2 prochaines semaines » rendait 6 mois, parce que le tool n'avait aucun moyen
 * d'exprimer une borne. Deux règles à ne pas perdre :
 *  - sans borne, la fenêtre reste l'horizon entier (comportement d'avant) ;
 *  - avec borne, l'ancre est la SEMAINE COURANTE, pas le début de l'horizon —
 *    les buckets du loader démarrent au 1er du mois, donc dans le passé.
 */

import { test } from '@japa/runner'
import { fenetreSemaines } from '#services/agent/primitives_extra'

// 6 lundis consécutifs, comme les weekKeys du loader charge.
const WEEKS = ['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03']

test.group('getCharge — fenêtre de semaines', () => {
  test('sans borne : horizon complet', ({ assert }) => {
    assert.deepEqual(fenetreSemaines(WEEKS, {}), { from: 0, to: 6, borne: false })
  })

  test('borne ancrée sur la semaine de start, pas sur le début des buckets', ({ assert }) => {
    // Mercredi de la semaine du 13/07 → la fenêtre démarre à ce lundi-là.
    const f = fenetreSemaines(WEEKS, { start: '2026-07-15', semaines: 2 })
    assert.deepEqual(f, { from: 2, to: 4, borne: true })
  })

  test('borne plus large que les buckets restants : on s’arrête au dernier', ({ assert }) => {
    const f = fenetreSemaines(WEEKS, { start: '2026-07-27', semaines: 12 })
    assert.deepEqual(f, { from: 4, to: 6, borne: true })
  })

  test('start hors horizon (après le dernier bucket) : au moins une semaine rendue', ({
    assert,
  }) => {
    const f = fenetreSemaines(WEEKS, { start: '2026-12-01', semaines: 2 })
    assert.equal(f.borne, true)
    assert.isAbove(f.to, f.from)
  })

  test('semaines <= 0 ou non fini : traité comme absent', ({ assert }) => {
    assert.deepEqual(fenetreSemaines(WEEKS, { semaines: 0 }), { from: 0, to: 6, borne: false })
    assert.deepEqual(fenetreSemaines(WEEKS, { semaines: Number.NaN }), {
      from: 0,
      to: 6,
      borne: false,
    })
  })
})
