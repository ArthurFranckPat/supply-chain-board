import { test } from '@japa/runner'
import { withX3Slot, x3ConcurrencyStats, X3QueueSaturatedError } from '#app/x3/x3_concurrency'

/**
 * Garde-fou de la borne globale de concurrence X3 (#183).
 *
 * Ce que ces tests protègent, et pourquoi ça ne se voit pas au typecheck :
 *
 * 1. le plafond tient réellement — c'est toute la raison d'être du module, et
 *    l'app y arrivait avec 36 pools knex indépendants qui s'ignoraient ;
 * 2. la file est FIFO — sans quoi, sous charge continue, le plus ancien
 *    appelant peut ne jamais passer ;
 * 3. un slot est rendu même quand la tâche jette — une fuite ici resserrerait
 *    la borne d'un cran à chaque erreur, jusqu'au blocage total du process ;
 * 4. le message de saturation ne contient AUCUN mot-clé de `TRANSIENT_ERRORS`
 *    (`app/x3/connection.ts`). C'est le point le moins évident et le plus
 *    coûteux à casser : un message qui dirait « timeout » ou « connection »
 *    rendrait l'erreur transitoire aux yeux de `X3Connection.query`, qui
 *    réessaierait — remettant l'appelant au bout de la file, précisément parce
 *    que la file est trop longue. Reformuler ce message sans rejouer ce test,
 *    c'est rouvrir la tempête de réessais que la file existe pour éteindre.
 */

/** Copie de la liste de `app/x3/connection.ts` — si elle bouge, ce test doit bouger. */
const TRANSIENT_ERRORS = [
  'curl',
  'timeout',
  'connection',
  'refused',
  'econnrefused',
  'resultxml is nil',
]

test.group('x3_concurrency — borne globale des lectures X3', (group) => {
  const saved = {
    max: process.env.X3_MAX_CONCURRENCY,
    wait: process.env.X3_QUEUE_WAIT_MS,
  }

  group.each.teardown(() => {
    if (saved.max === undefined) delete process.env.X3_MAX_CONCURRENCY
    else process.env.X3_MAX_CONCURRENCY = saved.max
    if (saved.wait === undefined) delete process.env.X3_QUEUE_WAIT_MS
    else process.env.X3_QUEUE_WAIT_MS = saved.wait
  })

  test('le plafond tient : jamais plus de X3_MAX_CONCURRENCY tâches à la fois', async ({
    assert,
  }) => {
    process.env.X3_MAX_CONCURRENCY = '3'

    let current = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 12 }, () =>
        withX3Slot(async () => {
          current += 1
          peak = Math.max(peak, current)
          await new Promise((r) => setTimeout(r, 5))
          current -= 1
        })
      )
    )

    assert.equal(peak, 3, 'douze tâches concurrentes ne doivent jamais dépasser trois slots')
    assert.equal(x3ConcurrencyStats().inFlight, 0, 'tous les slots doivent être rendus')
    assert.equal(x3ConcurrencyStats().queued, 0)
  })

  test('la file est FIFO : le slot libéré va au plus ancien en attente', async ({ assert }) => {
    process.env.X3_MAX_CONCURRENCY = '1'

    const order: number[] = []
    const tasks = Array.from({ length: 5 }, (_, i) =>
      withX3Slot(async () => {
        order.push(i)
        await new Promise((r) => setTimeout(r, 1))
      })
    )

    await Promise.all(tasks)
    assert.deepEqual(order, [0, 1, 2, 3, 4])
  })

  test('un slot est rendu même quand la tâche jette', async ({ assert }) => {
    process.env.X3_MAX_CONCURRENCY = '1'

    for (let i = 0; i < 3; i++) {
      await assert.rejects(() =>
        withX3Slot(async () => {
          throw new Error('échec de la tâche')
        })
      )
    }

    assert.equal(x3ConcurrencyStats().inFlight, 0, 'trois échecs ne doivent pas fuiter de slot')

    // Le plafond doit encore fonctionner après les échecs : si un slot avait
    // fuité, `inFlight` serait resté à 1 et cette tâche attendrait pour rien.
    let ran = false
    await withX3Slot(async () => {
      ran = true
    })
    assert.isTrue(ran)
  })

  test("l'attente est plafonnée, et l'abandon n'est pas une erreur transitoire", async ({
    assert,
  }) => {
    process.env.X3_MAX_CONCURRENCY = '1'
    process.env.X3_QUEUE_WAIT_MS = '30'

    let releaseHolder!: () => void
    const holder = withX3Slot(
      () =>
        new Promise<void>((resolve) => {
          releaseHolder = resolve
        })
    )
    // Laisse le détenteur prendre le slot avant de faire la queue derrière lui.
    await new Promise((r) => setImmediate(r))

    let caught: unknown
    try {
      await withX3Slot(async () => 'jamais atteint')
    } catch (e) {
      caught = e
    }

    assert.instanceOf(caught, X3QueueSaturatedError)

    const message = (caught as Error).message.toLowerCase()
    for (const keyword of TRANSIENT_ERRORS) {
      assert.notInclude(
        message,
        keyword,
        `le message d'abandon de file ne doit pas contenir « ${keyword} » : ` +
          `X3Connection le classerait transitoire et réessaierait`
      )
    }

    releaseHolder()
    await holder
    assert.equal(x3ConcurrencyStats().inFlight, 0)
  })

  test('une valeur non numérique ne supprime pas la borne', async ({ assert }) => {
    process.env.X3_MAX_CONCURRENCY = 'beaucoup'

    let current = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 10 }, () =>
        withX3Slot(async () => {
          current += 1
          peak = Math.max(peak, current)
          await new Promise((r) => setTimeout(r, 2))
          current -= 1
        })
      )
    )

    assert.equal(peak, 4, 'une faute de frappe doit retomber sur le défaut, pas lever la borne')
  })
})
