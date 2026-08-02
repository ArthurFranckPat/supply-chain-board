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

/**
 * Vue /charge — `getOrderLinesForLoad` (#105, point 4). Même tranche WIPTYP=1
 * que les deux populations ci-dessus, mais 8 champs au lieu de la vue complète,
 * et `quantite` = reste à FABRIQUER (qte_restante − qte_allouee), le filtre de
 * la voie directe.
 */
test.group('orders_flux_replica — vue /charge (WIPTYP=1)', (group) => {
  const conn = db.connection('replica')
  const repo = ordersFluxReplicaRepository
  const LOAD_PREFIX = 'ZZLOAD-'

  const cleanup = async () => {
    await conn.from('orders_flux_replica').where('vcrnum', 'like', `${LOAD_PREFIX}%`).delete()
  }
  group.each.setup(cleanup)
  group.teardown(cleanup)

  function loadRow(over: Partial<Record<string, unknown>> = {}) {
    return row({ vcrnum: `${LOAD_PREFIX}1`, ...over })
  }

  test('mappe une ligne ferme vers OrderLineForLoad (nature COMMANDE, clientCode brut)', async ({
    assert,
  }) => {
    await conn.table('orders_flux_replica').insert(
      loadRow({
        vcrnum: `${LOAD_PREFIX}A`,
        wipsta: 1,
        qte_restante: 10,
        qte_allouee: 4,
        bprnum: '80001',
        date_echeance: '2026-07-20',
      })
    )

    const lines = await repo.getOrderLinesForLoad('2026-07-01', '2026-08-01')
    const line = lines.find((l) => l.numCommande === `${LOAD_PREFIX}A`)

    assert.isDefined(line)
    assert.equal(line!.quantite, 6) // reste à fabriquer = restant − alloué
    assert.equal(line!.nature, 'COMMANDE')
    assert.equal(line!.clientCode, '80001')
    assert.equal(line!.ligne, '1000')
    // Date en heure locale (convention des vues flux) — getters locaux, TZ-safe.
    assert.equal(line!.dateLivraison.getFullYear(), 2026)
    assert.equal(line!.dateLivraison.getMonth(), 6)
    assert.equal(line!.dateLivraison.getDate(), 20)
  })

  test('une prévision (WIPSTA=3) est nature PREVISION, clientCode null, ligne null sur VCRLIN=0', async ({
    assert,
  }) => {
    await conn
      .table('orders_flux_replica')
      .insert(loadRow({ vcrnum: `${LOAD_PREFIX}B`, wipsta: 3, vcrlin: '0', bprnum: null }))

    const lines = await repo.getOrderLinesForLoad('2026-07-01', '2026-08-01')
    const line = lines.find((l) => l.numCommande === `${LOAD_PREFIX}B`)

    assert.isDefined(line)
    assert.equal(line!.nature, 'PREVISION')
    assert.isNull(line!.clientCode)
    assert.isNull(line!.ligne)
  })

  test('une ligne entièrement allouée est exclue (reste à fabriquer ≤ 0)', async ({ assert }) => {
    await conn
      .table('orders_flux_replica')
      .insert(loadRow({ vcrnum: `${LOAD_PREFIX}C`, wipsta: 1, qte_restante: 10, qte_allouee: 10 }))

    const lines = await repo.getOrderLinesForLoad('2026-07-01', '2026-08-01')

    assert.isUndefined(lines.find((l) => l.numCommande === `${LOAD_PREFIX}C`))
  })

  test('bornes INCLUSIVES, comme la voie directe (`>= from AND <= to`)', async ({ assert }) => {
    await conn
      .table('orders_flux_replica')
      .insert([
        loadRow({ vcrnum: `${LOAD_PREFIX}IN`, date_echeance: '2026-07-01' }),
        loadRow({ vcrnum: `${LOAD_PREFIX}OUT`, date_echeance: '2026-08-02' }),
      ])

    const lines = await repo.getOrderLinesForLoad('2026-07-01', '2026-08-01')
    const nums = lines.map((l) => l.numCommande)

    assert.include(nums, `${LOAD_PREFIX}IN`)
    assert.notInclude(nums, `${LOAD_PREFIX}OUT`)
  })
})
