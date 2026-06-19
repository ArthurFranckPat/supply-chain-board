import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'

/**
 * Cache distribué (issue #20). En test, CACHE_STORE=memory (cf. .env) : on valide la
 * sémantique du service (hit/miss/invalidation) + le serializer superjson (Date/Map),
 * indépendamment de la disponibilité d'un Redis. Le chemin L2 Redis réutilise le même
 * service et le même serializer.
 */
test.group('cache service (#20)', () => {
  test('getOrSet : factory exécutée au miss, servie au hit', async ({ assert }) => {
    const cache = await app.container.make('cache.manager')
    const ns = cache.namespace('test:getorset')
    await ns.clear()

    let calls = 0
    const factory = async () => {
      calls++
      return { n: 42 }
    }

    const a = await ns.getOrSet({ key: 'k', ttl: '1m', factory })
    const b = await ns.getOrSet({ key: 'k', ttl: '1m', factory })

    assert.deepEqual(a, { n: 42 })
    assert.deepEqual(b, { n: 42 })
    assert.equal(calls, 1) // hit : la factory n'a pas été rejouée
  })

  test('delete invalide une clé → factory rejouée', async ({ assert }) => {
    const cache = await app.container.make('cache.manager')
    const ns = cache.namespace('test:delete')
    await ns.clear()

    let calls = 0
    const factory = async () => ({ n: ++calls })

    await ns.getOrSet({ key: 'k', ttl: '1m', factory })
    await ns.delete({ key: 'k' })
    const after = await ns.getOrSet({ key: 'k', ttl: '1m', factory })

    assert.equal(after.n, 2)
    assert.equal(calls, 2)
  })

  test('namespace().clear() invalide tout le namespace', async ({ assert }) => {
    const cache = await app.container.make('cache.manager')
    const ns = cache.namespace('test:clear')

    await ns.set({ key: 'a', value: 1 })
    await ns.set({ key: 'b', value: 2 })
    assert.isTrue(await ns.has({ key: 'a' }))

    await ns.clear()

    assert.isFalse(await ns.has({ key: 'a' }))
    assert.isFalse(await ns.has({ key: 'b' }))
  })

  test('serializer superjson : Date et Map préservées', async ({ assert }) => {
    const cache = await app.container.make('cache.manager')
    const ns = cache.namespace('test:superjson')
    await ns.clear()

    const value = {
      date: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]),
    }
    await ns.set({ key: 'k', value })
    const out = await ns.get<typeof value>({ key: 'k' })

    assert.instanceOf(out!.date, Date)
    assert.equal(out!.date.toISOString(), '2026-01-02T03:04:05.000Z')
    assert.instanceOf(out!.map, Map)
    assert.equal(out!.map.get('b'), 2)
  })
})
