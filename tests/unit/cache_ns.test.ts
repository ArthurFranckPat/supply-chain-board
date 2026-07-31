import { test } from '@japa/runner'
import cache from '@adonisjs/cache/services/main'
import { cacheNs, envScopedNamespace } from '#services/cache_ns'
import { getActiveX3EnvName } from '#config/x3'

/**
 * Vérifie les deux propriétés dont dépend `serialize: false` sur le L1 :
 *
 * 1. l'option est bien honorée À TRAVERS UN NAMESPACE — c'est le bug corrigé par
 *    `patches/bentocache+1.6.1.patch`, et tout le projet est namespacé ;
 * 2. la contrepartie (une valeur cachée est rendue par référence) est gardée par
 *    le gel profond de `cacheNs`, hors production.
 *
 * Si le patch saute lors d'une montée de version de bentocache, le test 1 tombe.
 */
test.group('cacheNs — garde-fou du L1 non sérialisé', () => {
  test('deux lectures rendent la même référence (serialize: false honoré en namespace)', async ({
    assert,
  }) => {
    const ns = cacheNs('test-refs')
    const payload = { rows: [{ article: 'A1', qty: 3 }] }

    await ns.set({ key: 'k', value: payload })
    const first = await ns.get({ key: 'k' })
    const second = await ns.get({ key: 'k' })

    assert.strictEqual(first, second)
  })

  test('la valeur rendue est gelée — une mutation en place lève', async ({ assert }) => {
    const ns = cacheNs('test-freeze')
    await ns.set({ key: 'k', value: { rows: [{ article: 'A1', qty: 3 }] } })

    const value = await ns.get<{ rows: { article: string; qty: number }[] }>({ key: 'k' })

    assert.throws(() => {
      value.rows[0].qty = 99
    }, TypeError)
    assert.throws(() => {
      value.rows.push({ article: 'A2', qty: 1 })
    }, TypeError)
  })

  test('le gel descend dans les structures imbriquées', async ({ assert }) => {
    const ns = cacheNs('test-deep')
    await ns.set({ key: 'k', value: { a: { b: { c: [1, 2, 3] } } } })

    const value = await ns.get<{ a: { b: { c: number[] } } }>({ key: 'k' })

    assert.isTrue(Object.isFrozen(value.a))
    assert.isTrue(Object.isFrozen(value.a.b))
    assert.isTrue(Object.isFrozen(value.a.b.c))
  })

  test('un namespace enfant reste gardé', async ({ assert }) => {
    const ns = cacheNs('test-parent').namespace('enfant')
    await ns.set({ key: 'k', value: { rows: [1] } })

    const value = await ns.get<{ rows: number[] }>({ key: 'k' })

    assert.isTrue(Object.isFrozen(value))
  })

  test('getOrSet gèle aussi la valeur produite par la factory', async ({ assert }) => {
    const ns = cacheNs('test-getorset')

    const value = await ns.getOrSet({
      key: 'k',
      factory: () => ({ rows: [{ article: 'A1' }] }),
    })

    assert.isTrue(Object.isFrozen(value))
    assert.isTrue(Object.isFrozen(value.rows))
  })

  test('un graphe cyclique ne fait pas boucler le gel', async ({ assert }) => {
    const ns = cacheNs('test-cycle')
    const node: Record<string, unknown> = { name: 'a' }
    node.self = node

    await ns.set({ key: 'k', value: node })
    const value = await ns.get<Record<string, unknown>>({ key: 'k' })

    assert.isTrue(Object.isFrozen(value))
  })
})

/**
 * Cloisonnement par environnement X3 (31/07/2026).
 *
 * Le bug corrigé : les clés de ce cache sont GLOBALES (issue #39, C2) au motif
 * que « les creds X3 ne changent que la session, pas la donnée ». Faux — ils
 * changent le pool (`CLTEST` vs `CLAERECO2`). Le préchauffage, qui tourne hors
 * requête donc sur `X3_ENV`, remplissait `board:orders` depuis un environnement
 * pendant qu'une session de l'autre lisait la même entrée.
 *
 * Ce que ces tests NE peuvent pas faire : faire varier `X3_ENV` à chaud.
 * AdonisJS le fige au boot (`env.get()` ne relit pas `process.env`) — c'est
 * pourquoi la vérification en réel est passée par `X3_ENV=prod node ace …`,
 * variable posée AVANT le démarrage. D'où le découpage : la composition du
 * namespace est pure et testée ici, sa résolution est vérifiée par
 * `ReplicaGate` et en ligne de commande.
 */
test.group('cacheNs — cloisonnement par environnement X3', () => {
  test('le namespace effectif porte l’environnement', ({ assert }) => {
    assert.equal(envScopedNamespace('board', 'test'), 'board:test')
    assert.equal(envScopedNamespace('board', 'prod'), 'board:prod')
    assert.notEqual(envScopedNamespace('board', 'test'), envScopedNamespace('board', 'prod'))
  })

  test('cacheNs écrit RÉELLEMENT dans le namespace suffixé', async ({ assert }) => {
    // Le test qui compte : sans ça, `envScopedNamespace` pourrait être correcte
    // et inutilisée. On écrit via `cacheNs`, on relit via le namespace brut
    // attendu — s'ils divergent, la lecture rend `undefined`.
    const envName = getActiveX3EnvName()
    await cacheNs('test-scope').set({ key: 'k', value: 'valeur' })

    const brut = cache.namespace(envScopedNamespace('test-scope', envName))
    assert.equal(await brut.get({ key: 'k' }), 'valeur')
  })

  test('le namespace NON suffixé ne voit rien de ce qu’écrit cacheNs', async ({ assert }) => {
    // C'est exactement le chemin qui mélangeait les environnements : quiconque
    // lisait `board` sans suffixe tombait sur l'entrée de l'autre côté.
    await cacheNs('test-nu').set({ key: 'k', value: 'valeur' })

    assert.isUndefined(await cache.namespace('test-nu').get({ key: 'k' }))
  })
})
