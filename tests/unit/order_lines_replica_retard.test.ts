import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { OrderLinesReplicaRepository } from '#repositories/order_lines_replica_repository'

/**
 * `order_lines_replica` sert désormais DEUX appelants aux populations
 * différentes (#98) — c'est le défaut que cette table avait par construction :
 * elle mirait un consommateur (`getOpenOrderLines`, filtre `resteAFabriquer > 0`)
 * et non sa source (`ORDERS`, `RMNEXTQTY_0 > 0`).
 *
 * La ligne qui distingue les deux : **entièrement allouée**
 * (`qte_restante = qte_allouee`, donc `quantite = 0`). Absente de la vue
 * planification, présente dans le périmètre du retard — qui déduit lui-même le
 * stock alloué et a besoin de la voir pour l'écarter en connaissance de cause.
 *
 * Ces tests écrivent dans la vraie table de réplique puis nettoient. Les numéros
 * de commande sont préfixés pour ne jamais heurter une ingestion réelle.
 */

const PREFIX = 'ZZTEST-'

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    num_commande: `${PREFIX}1`,
    ligne: '1000',
    client: 'CLIENT A',
    article: 'ART1',
    designation: 'Article 1',
    quantite: 10,
    date_livraison: '2026-07-15',
    contremarque: null,
    unite: 'UN',
    order_type: 'MTS',
    nature: 'COMMANDE',
    qte_restante: 10,
    qte_commandee: 12,
    qte_allouee: 0,
    ...over,
  }
}

test.group('order_lines_replica — deux populations', (group) => {
  const conn = db.connection('replica')
  const repo = new OrderLinesReplicaRepository()

  const cleanup = async () => {
    await conn.from('order_lines_replica').where('num_commande', 'like', `${PREFIX}%`).delete()
  }
  group.each.setup(cleanup)
  group.teardown(cleanup)

  test('une ligne entièrement allouée est INVISIBLE pour la vue planification', async ({
    assert,
  }) => {
    await conn
      .table('order_lines_replica')
      .insert(
        row({ num_commande: `${PREFIX}ALLOC`, quantite: 0, qte_restante: 10, qte_allouee: 10 })
      )

    const lines = await repo.getOpenOrderLines()

    assert.isEmpty(lines.filter((l) => l.numCommande.startsWith(PREFIX)))
  })

  test('cette même ligne est VISIBLE pour le retard', async ({ assert }) => {
    // Le cœur du correctif : avant, l'ingestion la rejetait, donc aucune lecture
    // ne pouvait la retrouver.
    await conn
      .table('order_lines_replica')
      .insert(
        row({ num_commande: `${PREFIX}ALLOC`, quantite: 0, qte_restante: 10, qte_allouee: 10 })
      )

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    const found = lignes.find((l) => l.numCommande === `${PREFIX}ALLOC`)
    assert.isDefined(found)
    assert.equal(found!.qteRestante, 10)
    assert.equal(found!.qteAllouee, 10)
  })

  test('le retard ignore les prévisions (nature ≠ COMMANDE)', async ({ assert }) => {
    // Équivaut au `WIPSTA_0 = 1` de `buildSql`.
    await conn
      .table('order_lines_replica')
      .insert(row({ num_commande: `${PREFIX}PREV`, nature: 'PREVISION' }))

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    assert.isUndefined(lignes.find((l) => l.numCommande === `${PREFIX}PREV`))
  })

  test('le retard ignore un reliquat nul', async ({ assert }) => {
    await conn
      .table('order_lines_replica')
      .insert(row({ num_commande: `${PREFIX}ZERO`, quantite: 0, qte_restante: 0 }))

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    assert.isUndefined(lignes.find((l) => l.numCommande === `${PREFIX}ZERO`))
  })

  test('borne haute EXCLUSIVE, comme le SQL X3 (`< toStr`)', async ({ assert }) => {
    await conn
      .table('order_lines_replica')
      .insert([
        row({ num_commande: `${PREFIX}IN`, date_livraison: '2026-07-31' }),
        row({ num_commande: `${PREFIX}OUT`, date_livraison: '2026-08-01' }),
      ])

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')
    const nums = lignes.map((l) => l.numCommande)

    assert.include(nums, `${PREFIX}IN`)
    assert.notInclude(nums, `${PREFIX}OUT`)
  })

  test('quantités nulles (ligne ingérée avant la migration) → 0, jamais NaN', async ({
    assert,
  }) => {
    // Les colonnes sont nullable à dessein : `DEFAULT 0` ferait passer « inconnu »
    // pour « rien à livrer ». La lecture doit rendre un nombre exploitable.
    await conn.table('order_lines_replica').insert(
      row({
        num_commande: `${PREFIX}NULLQ`,
        qte_restante: null,
        qte_commandee: null,
        qte_allouee: null,
      })
    )

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    // Reliquat nul ⇒ hors périmètre du retard, exactement comme une vraie ligne
    // soldée. L'important est qu'aucun NaN ne se propage.
    assert.isUndefined(lignes.find((l) => l.numCommande === `${PREFIX}NULLQ`))
  })
})
