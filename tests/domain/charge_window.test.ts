import { test } from '@japa/runner'
import { retardBucketKey, weekWindow } from '#app/domain/charge_window'

/**
 * Le graphe part de la semaine courante. Les semaines écoulées sont coupées si
 * elles sont vides, fondues en une barre « Retard » si elles portent encore de
 * la charge — une semaine passée chargée est du travail à faire.
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
  test('semaines écoulées et vides : coupées, pas de retard', ({ assert }) => {
    assert.deepEqual(weekWindow(KEYS, EMPTY, TODAY), { pastCount: 2, retard: false })
  })

  test('la semaine courante n’est jamais passée, même vide', ({ assert }) => {
    const out = weekWindow(KEYS, EMPTY, new Date('2026-09-14T08:00:00'))
    assert.deepEqual(out, { pastCount: 2, retard: false })
  })

  test('une semaine passée encore chargée : barre Retard, le graphe part quand même du courant', ({
    assert,
  }) => {
    assert.deepEqual(
      weekWindow(KEYS, (i) => i === 1, TODAY),
      { pastCount: 2, retard: true }
    )
  })

  test('charge sur la semaine courante seulement : pas de retard', ({ assert }) => {
    assert.deepEqual(
      weekWindow(KEYS, (i) => i === 2, TODAY),
      { pastCount: 2, retard: false }
    )
  })

  test('horizon entièrement passé : rien n’est fondu', ({ assert }) => {
    // L'utilisateur a visé un mois révolu — on lui montre ce qu'il a demandé.
    assert.deepEqual(
      weekWindow(KEYS, () => true, new Date('2027-03-01T09:00:00')),
      {
        pastCount: 0,
        retard: false,
      }
    )
  })

  test('horizon entièrement à venir : rien à couper', ({ assert }) => {
    assert.deepEqual(weekWindow(KEYS, EMPTY, new Date('2026-08-03T09:00:00')), {
      pastCount: 0,
      retard: false,
    })
  })

  test('clé Retard : intervalle jusqu’à la veille du lundi, triée avant lui', ({ assert }) => {
    const key = retardBucketKey('2026-08-31', '2026-09-14')
    assert.equal(key, '2026-08-31~2026-09-13')
    assert.isTrue(key < '2026-09-14')
  })
})
