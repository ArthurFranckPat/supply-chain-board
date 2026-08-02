import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ordersFluxReplicaRepository from '#repositories/orders_flux_replica_repository'

/**
 * La tranche WIPTYP=1 d'`orders_flux_replica` sert DEUX appelants aux
 * populations différentes (#98, #105) — le défaut que `order_lines_replica`
 * avait par construction, qu'elle a remplacée : elle mirait un consommateur
 * (`getOpenOrderLines`, filtre `resteAFabriquer > 0`) et non sa source
 * (`ORDERS`, `RMNEXTQTY_0 > 0`).
 *
 * La ligne qui distingue les deux : **entièrement allouée**
 * (`qte_restante = qte_allouee`, donc `resteAFabriquer = 0`). Absente de la vue
 * planification, présente dans le périmètre du retard — qui déduit lui-même le
 * stock alloué et a besoin de la voir pour l'écarter en connaissance de cause.
 *
 * Ces tests écrivent dans la vraie table de réplique puis nettoient. Les numéros
 * de commande sont préfixés pour ne jamais heurter une ingestion réelle.
 */

const PREFIX = 'ZZTEST-'

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    wiptyp: 1,
    wipsta: 1,
    vcrnum: `${PREFIX}1`,
    vcrlin: '1000',
    vcrseq: '',
    article: 'ART1',
    designation: 'Article 1',
    date_echeance: '2026-07-15',
    qte_restante: 10,
    qte_commandee: 12,
    qte_allouee: 0,
    contremarque: null,
    sohtyp: 'MTS',
    partner_nom: 'CLIENT A',
    ...over,
  }
}

test.group('orders_flux_replica — deux populations (WIPTYP=1)', (group) => {
  const conn = db.connection('replica')
  const repo = ordersFluxReplicaRepository

  const cleanup = async () => {
    await conn.from('orders_flux_replica').where('vcrnum', 'like', `${PREFIX}%`).delete()
  }
  group.each.setup(cleanup)
  group.teardown(cleanup)

  test('une ligne entièrement allouée est INVISIBLE pour la vue planification', async ({
    assert,
  }) => {
    await conn
      .table('orders_flux_replica')
      .insert(row({ vcrnum: `${PREFIX}ALLOC`, qte_restante: 10, qte_allouee: 10 }))

    const lines = await repo.getOpenOrderLines()

    assert.isEmpty(lines.filter((l) => l.numCommande.startsWith(PREFIX)))
  })

  test('cette même ligne est VISIBLE pour le retard', async ({ assert }) => {
    // Le cœur du correctif : avant, l'ingestion la rejetait, donc aucune lecture
    // ne pouvait la retrouver.
    await conn
      .table('orders_flux_replica')
      .insert(row({ vcrnum: `${PREFIX}ALLOC`, qte_restante: 10, qte_allouee: 10 }))

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    const found = lignes.find((l) => l.numCommande === `${PREFIX}ALLOC`)
    assert.isDefined(found)
    assert.equal(found!.qteRestante, 10)
    assert.equal(found!.qteAllouee, 10)
  })

  test('le retard ignore les prévisions (WIPSTA=3)', async ({ assert }) => {
    // Équivaut au `WIPSTA_0 = 1` de `buildSql` (retard_repository).
    await conn.table('orders_flux_replica').insert(row({ vcrnum: `${PREFIX}PREV`, wipsta: 3 }))

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    assert.isUndefined(lignes.find((l) => l.numCommande === `${PREFIX}PREV`))
  })

  test('le retard ignore un reliquat nul', async ({ assert }) => {
    await conn
      .table('orders_flux_replica')
      .insert(row({ vcrnum: `${PREFIX}ZERO`, qte_restante: 0 }))

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')

    assert.isUndefined(lignes.find((l) => l.numCommande === `${PREFIX}ZERO`))
  })

  test('borne haute EXCLUSIVE, comme le SQL X3 (`< toStr`)', async ({ assert }) => {
    await conn
      .table('orders_flux_replica')
      .insert([
        row({ vcrnum: `${PREFIX}IN`, date_echeance: '2026-07-31' }),
        row({ vcrnum: `${PREFIX}OUT`, date_echeance: '2026-08-01' }),
      ])

    const lignes = await repo.getRetardLines('2026-07-01', '2026-08-01')
    const nums = lignes.map((l) => l.numCommande)

    assert.include(nums, `${PREFIX}IN`)
    assert.notInclude(nums, `${PREFIX}OUT`)
  })
})
