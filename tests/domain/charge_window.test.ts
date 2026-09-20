import { test } from '@japa/runner'
import { firstVisibleWeek } from '#app/domain/charge_window'

/**
 * La règle tient en une phrase : couper les semaines écoulées tant qu'elles sont
 * vides. Ce qui se teste ici, c'est surtout ce qu'elle NE coupe pas — une
 * semaine passée encore chargée est du travail à faire.
 */

const KEYS = [
  '2026-08-31',
  '2026-09-07',
  '2026-09-14', // semaine courante au 20/09/2026 (dimanche)
  '2026-09-21',
  '2026-09-28',
]
const TODAY = new Date('2026-09-20T09:00:00')
const EMPTY = () => false

test.group('charge_window — semaines affichées', () => {
  test('coupe les semaines écoulées et vides', ({ assert }) => {
    assert.equal(firstVisibleWeek(KEYS, EMPTY, TODAY), 2)
  })

  test('garde la semaine courante même vide', ({ assert }) => {
    // La coupe s'arrête au lundi courant : une semaine en cours n'est pas passée.
    const out = firstVisibleWeek(KEYS, EMPTY, new Date('2026-09-14T08:00:00'))
    assert.equal(out, 2)
  })

  test('une semaine passée encore chargée reste, et celles d’après avec elle', ({ assert }) => {
    // Charge résiduelle sur 07/09 : OF en retard. On repart de là, pas du 14/09.
    assert.equal(
      firstVisibleWeek(KEYS, (i) => i === 1, TODAY),
      1
    )
  })

  test('charge sur la toute première semaine : rien n’est coupé', ({ assert }) => {
    assert.equal(
      firstVisibleWeek(KEYS, (i) => i === 0, TODAY),
      0
    )
  })

  test('horizon entièrement passé et vide : le graphe n’est pas vidé', ({ assert }) => {
    // L'utilisateur a visé un mois révolu — on lui montre ce qu'il a demandé
    // plutôt qu'une page blanche.
    assert.equal(firstVisibleWeek(KEYS, EMPTY, new Date('2027-03-01T09:00:00')), 0)
  })

  test('horizon entièrement à venir : rien à couper', ({ assert }) => {
    assert.equal(firstVisibleWeek(KEYS, EMPTY, new Date('2026-08-03T09:00:00')), 0)
  })
})
